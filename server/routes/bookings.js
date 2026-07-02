import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler, findUserByEmail, getBookingOr404, isAdmin, assertBookingParticipant } from '../lib/access.js';
import { priceBooking } from '../lib/pricing.js';
import { resolveService, resolveServiceDetailOr404, validateServiceParams, toEngineService } from '../lib/catalog.js';
import { computePrice, validateAnswers } from '../lib/dynamicPricing.js';
import { GLOBAL_CONFIG, CONFIG_VERSION } from '../lib/bookingEngineConfig.js';
import { isPartnerEligible } from '../lib/matching.js';
import { canTransition } from '../../src/lib/bookingEngine.js';

const router = Router();
router.use(authenticate);

const PAYMENT_METHODS = ['fpx', 'tng', 'grabpay', 'boost', 'card', 'cash'];

function mapBookingOut(b) {
  return {
    id: b.id,
    service_type: b.serviceType,
    package_name: b.serviceId,
    category_id: b.categoryId,
    catalog_service_id: b.catalogServiceId,
    package_id: b.packageId,
    service_specific_data: b.details ?? null,
    // Dynamic bookings nest the pricing answers under details.answers; legacy
    // bookings store the flat param object directly.
    answers: b.details?.answers ?? b.details ?? null,
    price_breakdown: b.priceBreakdown ?? null,
    photos: b.details?.photos ?? null,          // { before: [...], after: [...] }
    lifecycle: b.lifecycle ?? null,             // [{ status, at, by }]
    extras: (b.items || []).filter((i) => i.kind === 'addon').map((i) => ({
      id: i.id, label: i.label, qty: i.qty, unit_price: i.unitPrice, total: i.total, status: i.status,
    })),
    config_version: b.configVersion ?? null,
    price: b.price,
    date: b.date,
    time_slot: b.timeSlot,
    address: b.address,
    city: b.city,
    notes: b.notes,
    coupon_code: b.couponCode,
    discount_amount: b.discountAmount,
    consumer_id: b.consumerId,
    partner_id: b.partnerId,
    payment_method: b.paymentMethod,
    payment_status: b.paymentStatus,
    status: b.status,
    created_date: b.createdAt,
    consumer_email: b.consumer?.email,
    consumer_name: b.consumer?.fullName,
    consumer_phone: b.consumer?.phone,
    partner_email: b.partner?.email,
    partner_name: b.partner?.fullName,
  };
}

// GET /api/bookings — scoped to the caller's role
router.get('/', asyncHandler(async (req, res) => {
  const where = {};
  if (isAdmin(req.user)) {
    if (req.query.partner_email) {
      const p = await findUserByEmail(req.query.partner_email);
      where.partnerId = p ? p.id : '__none__';
    }
    if (req.query.consumer_email) {
      const c = await findUserByEmail(req.query.consumer_email);
      where.consumerId = c ? c.id : '__none__';
    }
  } else if (req.user.role === 'partner') {
    // A partner may also be a consumer; an explicit consumer_email=self query
    // returns their own consumer-side bookings, otherwise assigned jobs.
    // `available=true` returns the open job pool (unassigned + pending) to claim.
    if (req.query.available === 'true') {
      where.partnerId = null;
      where.status = 'pending';
    } else if (req.query.consumer_email && req.query.consumer_email === req.user.email) {
      where.consumerId = req.user.id;
    } else {
      where.partnerId = req.user.id;
    }
  } else {
    where.consumerId = req.user.id;
  }
  if (req.query.status) where.status = String(req.query.status);

  const take = req.query._limit ? Math.min(Number(req.query._limit) || 50, 200) : undefined;
  const items = await prisma.booking.findMany({
    where, take,
    orderBy: { createdAt: 'desc' },
    include: { consumer: true, partner: true },
  });
  res.json(items.map(mapBookingOut));
}));

// GET /api/bookings/:id — participants and admins only
router.get('/:id', asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { consumer: true, partner: true, items: true },
  });
  if (!booking) throw new ApiError(404, 'Booking not found');
  assertBookingParticipant(req.user, booking);
  res.json(mapBookingOut(booking));
}));

const createSchema = z.object({
  service_id: z.string().min(1).max(50),
  package_id: z.string().min(1).max(50),
  addon_ids: z.array(z.string().max(50)).max(20).default([]),
  bedrooms: z.string().max(20).optional(),
  service_specific_data: z.record(z.any()).optional(), // workflow param answers (JSONB)
  date: z.coerce.date().refine(
    (d) => d.getTime() > Date.now() - 24 * 3600 * 1000,
    'Booking date must not be in the past',
  ),
  time_slot: z.string().max(20).nullish(),
  address: z.string().max(500).nullish(),
  city: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
  coupon_code: z.string().max(50).nullish(),
  partner_email: z.string().email().nullish(),
  payment_method: z.enum(PAYMENT_METHODS).default('fpx'),
  service_type: z.string().max(100).optional(), // display label only — never priced
});

// POST /api/bookings — price, discount, and escrow split are computed server-side;
// any client-sent amounts are discarded by the schema.
router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const body = req.body;

  let partner = null;
  if (body.partner_email) {
    partner = await findUserByEmail(body.partner_email);
    if (!partner || partner.role !== 'partner' || !partner.partnerVerified) {
      throw new ApiError(400, 'Selected partner is not available');
    }
  }

  // Resolve the catalog service so we can validate service-specific answers against
  // its workflowConfig. Legacy callers send `bedrooms`; map it to `propertySize`.
  const service = await resolveService(body.service_id);
  if (!service) throw new ApiError(400, `Unknown service: ${body.service_id}`);

  const serviceData = { ...(body.service_specific_data || {}) };
  if (body.bedrooms && serviceData.propertySize === undefined) {
    serviceData.propertySize = body.bedrooms;
  }
  validateServiceParams(service.category?.workflowConfig, serviceData);

  // A requested partner must be admin-verified for this specific service.
  if (partner && !(await isPartnerEligible(partner.id, service.id))) {
    throw new ApiError(400, 'Selected partner is not qualified for this service');
  }

  const pricing = await priceBooking(prisma, {
    serviceId: body.service_id,
    packageId: body.package_id,
    addonIds: body.addon_ids,
    bedrooms: body.bedrooms,
    serviceSpecificData: serviceData,
    couponCode: body.coupon_code || undefined,
  });

  const booking = await prisma.$transaction(async (tx) => {
    if (pricing.couponId) {
      await tx.coupon.update({
        where: { id: pricing.couponId },
        data: { usageCount: { increment: 1 } },
      });
    }
    const created = await tx.booking.create({
      data: {
        serviceType: body.service_type || service.name,
        serviceId: pricing.packageName, // legacy: this column carries the package display name
        categoryId: pricing.categoryId,
        catalogServiceId: pricing.serviceId,
        packageId: pricing.packageId,
        details: Object.keys(serviceData).length ? serviceData : undefined,
        status: 'pending',
        price: pricing.total,
        discountAmount: pricing.discount,
        couponCode: pricing.couponCode,
        date: body.date,
        timeSlot: body.time_slot ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        notes: body.notes ?? null,
        paymentMethod: body.payment_method,
        paymentStatus: 'pending', // becomes "paid"/"escrowed" only via gateway webhook (Phase 2)
        consumerId: req.user.id,
        partnerId: partner?.id ?? null,
      },
      include: { consumer: true, partner: true },
    });
    if (pricing.lineItems?.length) {
      await tx.bookingItem.createMany({
        data: pricing.lineItems.map((li) => ({
          bookingId: created.id,
          kind: li.kind,
          refId: li.refId ?? null,
          label: li.label,
          labelMy: li.labelMy ?? null,
          qty: li.qty,
          unitPrice: li.unitPrice,
          total: li.total,
        })),
      });
    }
    await tx.escrowLedger.create({
      data: {
        bookingId: created.id,
        grossAmount: pricing.total,
        platformFee: pricing.platformFee,
        partnerPayout: pricing.partnerPayout,
        status: 'held',
      },
    });
    return created;
  });

  res.status(201).json(mapBookingOut(booking));
}));

// ── Dynamic booking-engine create ────────────────────────────────────────────
// POST /api/bookings/dynamic — the question-driven counterpart of POST /bookings.
// Price is recomputed server-side from the catalogue (client-sent amounts ignored)
// and the answers + breakdown are snapshotted so invoices never drift with config.
const dynamicCreateSchema = z.object({
  service_slug: z.string().min(1).max(80),
  answers: z.record(z.any()).default({}),
  property: z.record(z.any()).optional(),   // Step B — property & access
  contact: z.record(z.any()).optional(),    // Step D — contact person/phone
  photos: z.array(z.string().max(2048)).max(5).optional(), // Step E
  after_hours: z.boolean().optional(),
  urgent: z.boolean().optional(),
  date: z.coerce.date().refine(
    (d) => d.getTime() > Date.now() - 24 * 3600 * 1000,
    'Booking date must not be in the past',
  ),
  time_slot: z.string().max(20).nullish(),
  address: z.string().max(500).nullish(),
  city: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
  partner_email: z.string().email().nullish(),
  payment_method: z.enum(PAYMENT_METHODS).default('fpx'),
});

router.post('/dynamic', validate(dynamicCreateSchema), asyncHandler(async (req, res) => {
  const body = req.body;

  const service = await resolveServiceDetailOr404(body.service_slug);
  if (!service.pricingType) throw new ApiError(400, `Service "${service.slug}" is not a dynamic-engine service`);

  const engineService = toEngineService(service);
  const { ok, errors } = validateAnswers(engineService, body.answers);
  if (!ok) throw new ApiError(400, errors.join('; '));

  let partner = null;
  if (body.partner_email) {
    partner = await findUserByEmail(body.partner_email);
    if (!partner || partner.role !== 'partner' || !partner.partnerVerified) {
      throw new ApiError(400, 'Selected partner is not available');
    }
    if (!(await isPartnerEligible(partner.id, service.id))) {
      throw new ApiError(400, 'Selected partner is not qualified for this service');
    }
  }

  const pricing = computePrice(engineService, body.answers, {
    globalConfig: GLOBAL_CONFIG,
    afterHours: body.after_hours,
    urgent: body.urgent,
  });

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        serviceType: service.name,
        serviceId: service.name, // legacy display column
        categoryId: service.categoryId,
        catalogServiceId: service.id,
        // Full snapshot: pricing answers + universal-step context (B/D/E).
        details: { answers: body.answers, property: body.property ?? null, contact: body.contact ?? null, photos: body.photos ?? [] },
        priceBreakdown: pricing,          // full computed breakdown snapshot
        configVersion: CONFIG_VERSION,
        status: 'pending',
        price: pricing.total,
        discountAmount: pricing.promoDiscount,
        date: body.date,
        timeSlot: body.time_slot ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        notes: body.notes ?? null,
        paymentMethod: body.payment_method,
        paymentStatus: 'pending',
        consumerId: req.user.id,
        partnerId: partner?.id ?? null,
      },
      include: { consumer: true, partner: true },
    });

    // Line-item rows mirror the price breakdown for reporting parity with the
    // legacy engine; the authoritative snapshot lives in booking.priceBreakdown.
    if (pricing.breakdown?.length) {
      await tx.bookingItem.createMany({
        data: pricing.breakdown.map((li) => ({
          bookingId: created.id,
          kind: (li.type || 'line').toLowerCase(),
          refId: li.optionId ?? null,
          label: li.label,
          qty: li.qty ?? 1,
          unitPrice: li.unitPrice ?? li.amount,
          total: li.amount,
        })),
      });
    }

    await tx.escrowLedger.create({
      data: {
        bookingId: created.id,
        grossAmount: pricing.total,
        platformFee: pricing.platformFee,
        partnerPayout: Math.max(0, pricing.total - pricing.platformFee),
        status: 'held',
      },
    });
    return created;
  });

  res.status(201).json(mapBookingOut(booking));
}));

const patchSchema = z.object({
  status: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  time_slot: z.string().max(20).optional(),
  date: z.coerce.date().optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  payment_method: z.enum(PAYMENT_METHODS).optional(),
  payment_status: z.enum(['pending', 'paid', 'escrowed', 'refunded', 'failed']).optional(),
  partner_email: z.string().email().nullable().optional(),
});

const PARTNER_STATUSES = ['accepted', 'en_route', 'arrived', 'started', 'completed'];
const CONSUMER_STATUSES = ['cancelled', 'disputed'];

// PATCH /api/bookings/:id — field whitelist depends on the caller's role.
router.patch('/:id', validate(patchSchema), asyncHandler(async (req, res) => {
  const booking = await getBookingOr404(req.params.id);
  assertBookingParticipant(req.user, booking);
  const body = req.body;
  const data = {};

  if (isAdmin(req.user)) {
    if (body.status !== undefined) data.status = body.status;
    if (body.payment_status !== undefined) data.paymentStatus = body.payment_status;
    if (body.payment_method !== undefined) data.paymentMethod = body.payment_method;
    if (body.partner_email !== undefined) {
      if (body.partner_email === null) {
        data.partnerId = null;
      } else {
        const p = await findUserByEmail(body.partner_email);
        if (!p || p.role !== 'partner') throw new ApiError(400, 'Partner not found');
        data.partnerId = p.id;
      }
    }
    for (const [from, to] of [['notes', 'notes'], ['address', 'address'], ['city', 'city'], ['time_slot', 'timeSlot'], ['date', 'date']]) {
      if (body[from] !== undefined) data[to] = body[from];
    }
  } else {
    const isAssignedPartner = booking.partnerId === req.user.id;
    const isOwner = booking.consumerId === req.user.id;

    if (body.status !== undefined) {
      const allowed = isAssignedPartner ? PARTNER_STATUSES : CONSUMER_STATUSES;
      if (!allowed.includes(body.status)) {
        throw new ApiError(403, `You are not allowed to set status "${body.status}"`);
      }
      if (!canTransition(booking.status, body.status)) {
        throw new ApiError(400, `Cannot change status from "${booking.status}" to "${body.status}"`);
      }
      data.status = body.status;
    }

    if (isOwner) {
      // Consumers may adjust logistics only before work starts.
      if (['pending', 'assigned', 'accepted'].includes(booking.status)) {
        for (const [from, to] of [['notes', 'notes'], ['address', 'address'], ['city', 'city'], ['time_slot', 'timeSlot'], ['date', 'date']]) {
          if (body[from] !== undefined) data[to] = body[from];
        }
      }
    }
    // payment_status / payment_method / partner_email changes are admin-only.
  }

  if (Object.keys(data).length === 0) throw new ApiError(400, 'No permitted fields to update');

  // Stamp every status transition onto the lifecycle timeline (server-authoritative).
  if (data.status) {
    const lifecycle = Array.isArray(booking.lifecycle) ? booking.lifecycle : [];
    data.lifecycle = [...lifecycle, { status: data.status, at: new Date().toISOString(), by: req.user.id }];
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data,
    include: { consumer: true, partner: true },
  });
  res.json(mapBookingOut(updated));
}));

// POST /api/bookings/:id/claim — a partner claims an unassigned pending booking
// from the open job pool (lightweight dispatch: first to accept gets it).
router.post('/:id/claim', asyncHandler(async (req, res) => {
  if (req.user.role !== 'partner') throw new ApiError(403, 'Only partners can accept jobs');
  const booking = await getBookingOr404(req.params.id);
  if (booking.partnerId) throw new ApiError(409, 'This job has already been taken');
  if (booking.status !== 'pending') throw new ApiError(400, 'This job is no longer open');
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { partnerId: req.user.id, status: 'accepted' },
    include: { consumer: true, partner: true },
  });
  res.json(mapBookingOut(updated));
}));

// POST /api/bookings/:id/photos — partner uploads before/after service photos.
// Stored under details.photos.{before|after} with capture metadata, merged so
// the dynamic-engine answers under details.answers are preserved.
const photosSchema = z.object({
  phase: z.enum(['before', 'after']),
  photos: z.array(z.object({
    url: z.string().min(1).max(2000),
    at: z.string().datetime().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })).min(1).max(12),
});
router.post('/:id/photos', validate(photosSchema), asyncHandler(async (req, res) => {
  const booking = await getBookingOr404(req.params.id);
  assertBookingParticipant(req.user, booking);
  if (!isAdmin(req.user) && booking.partnerId !== req.user.id) {
    throw new ApiError(403, 'Only the assigned partner can upload service photos');
  }
  const { phase, photos } = req.body;
  const details = (booking.details && typeof booking.details === 'object') ? booking.details : {};
  const existing = details.photos || {};
  const stamped = photos.map((p) => ({ ...p, at: p.at || new Date().toISOString() }));
  const nextDetails = {
    ...details,
    photos: { ...existing, [phase]: [...(existing[phase] || []), ...stamped] },
  };
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { details: nextDetails },
    include: { consumer: true, partner: true },
  });
  res.json(mapBookingOut(updated));
}));

// POST /api/bookings/:id/extras — partner proposes an extra service mid-job.
// Created as a pending BookingItem (kind=addon); does NOT change the price until
// the customer approves. No manual price negotiation.
const extraSchema = z.object({
  label: z.string().min(2).max(120),
  unit_price: z.number().positive().max(100000),
  qty: z.number().int().min(1).max(99).optional(),
});
router.post('/:id/extras', validate(extraSchema), asyncHandler(async (req, res) => {
  const booking = await getBookingOr404(req.params.id);
  assertBookingParticipant(req.user, booking);
  if (!isAdmin(req.user) && booking.partnerId !== req.user.id) {
    throw new ApiError(403, 'Only the assigned partner can add extras');
  }
  if (!['arrived', 'started'].includes(booking.status)) {
    throw new ApiError(400, 'Extras can only be added during the job');
  }
  const qty = req.body.qty ?? 1;
  const total = Math.round(req.body.unit_price * qty * 100) / 100;
  await prisma.bookingItem.create({
    data: { bookingId: booking.id, kind: 'addon', label: req.body.label, qty, unitPrice: req.body.unit_price, total, status: 'pending', addedBy: req.user.id },
  });
  const updated = await prisma.booking.findUnique({ where: { id: booking.id }, include: { consumer: true, partner: true, items: true } });
  res.json(mapBookingOut(updated));
}));

// PATCH /api/bookings/:id/extras/:itemId — customer approves/rejects an extra.
// On approval the addon is folded into the booking price + breakdown.
const extraDecisionSchema = z.object({ status: z.enum(['approved', 'rejected']) });
router.patch('/:id/extras/:itemId', validate(extraDecisionSchema), asyncHandler(async (req, res) => {
  const booking = await getBookingOr404(req.params.id);
  assertBookingParticipant(req.user, booking);
  if (!isAdmin(req.user) && booking.consumerId !== req.user.id) {
    throw new ApiError(403, 'Only the customer can approve or reject extras');
  }
  const item = await prisma.bookingItem.findUnique({ where: { id: req.params.itemId } });
  if (!item || item.bookingId !== booking.id || item.kind !== 'addon') throw new ApiError(404, 'Extra not found');
  if (item.status !== 'pending') throw new ApiError(400, 'This extra has already been decided');

  const bookingData = {};
  if (req.body.status === 'approved') {
    const breakdown = Array.isArray(booking.priceBreakdown) ? booking.priceBreakdown : [];
    bookingData.price = (booking.price || 0) + item.total;
    bookingData.priceBreakdown = [...breakdown, { questionId: null, label: item.label, type: 'ADDON', qty: item.qty, amount: item.total }];
  }
  await prisma.$transaction([
    prisma.bookingItem.update({ where: { id: item.id }, data: { status: req.body.status } }),
    prisma.booking.update({ where: { id: booking.id }, data: bookingData }),
  ]);
  const updated = await prisma.booking.findUnique({ where: { id: booking.id }, include: { consumer: true, partner: true, items: true } });
  res.json(mapBookingOut(updated));
}));

// DELETE /api/bookings/:id — admin only (consumers cancel via status)
router.delete('/:id', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  await prisma.booking.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

export default router;
