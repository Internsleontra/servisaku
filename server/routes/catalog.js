// Catalog API — DB-driven service abstraction (Phase 1).
// Public read endpoints (consumers browse before authenticating) plus a
// side-effect-free pricing quote endpoint.
//
//   GET  /services                      list active services
//   GET  /services/:id                  detail (workflowConfig + add-ons + SLA + packages)
//   GET  /services/:id/availability     bookable slots derived from the schedule config
//   POST /pricing/calculate             authoritative price quote (no DB writes)
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../lib/access.js';
import {
  listServices, resolveServiceOr404, resolveServiceDetailOr404, mapServiceSummary, mapServiceDetail, buildSla,
  listCategories, getCategoryServicesOr404, mapCategory, toEngineService,
} from '../lib/catalog.js';
import { priceBooking } from '../lib/pricing.js';
import { computePrice, validateAnswers } from '../lib/dynamicPricing.js';
import { localeOf } from '../lib/locale.js';
import { GLOBAL_CONFIG, CONFIG_VERSION } from '../lib/bookingEngineConfig.js';
import { withLiveSstRate, taxSummary } from '../lib/tax/index.js';
import { findEligiblePartners } from '../lib/matching.js';
import { SLOT_GROUPS } from '../../src/lib/bookingEngine.js';

const router = Router();

// ── Categories (dynamic booking engine) ──────────────────────────────────────
// GET /categories — Home grid (12 categories).
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await listCategories();
  res.json(categories.map(mapCategory));
}));

// GET /categories/:slug/services — services within a category.
router.get('/categories/:slug/services', asyncHandler(async (req, res) => {
  const { category, services } = await getCategoryServicesOr404(req.params.slug, localeOf(req));
  res.json({ category: mapCategory(category), services: services.map(mapServiceSummary) });
}));

// GET /services — summaries for Home/Explore grids.
router.get('/services', asyncHandler(async (req, res) => {
  const services = await listServices();
  res.json(services.map(mapServiceSummary));
}));

// GET /services/:id — full detail for ServiceDetail + booking wizard.
// Returns the dynamic Step-A `questions` alongside legacy packages/addons, so the
// spec's GET /services/:slug → { service, questions, pricingType, visitFee } holds.
router.get('/services/:id', asyncHandler(async (req, res) => {
  const service = await resolveServiceDetailOr404(req.params.id, localeOf(req));
  res.json(mapServiceDetail(service));
}));

// GET /services/:id/availability — next `days` of bookable slots.
// Phase 1 derives slots from the schedule step (leadTimeHours, granularity);
// Phase 2 will intersect with real partner availability.
router.get('/services/:id/availability', asyncHandler(async (req, res) => {
  const service = await resolveServiceOr404(req.params.id);
  const sla = buildSla(service.category);
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
  const leadMs = (sla.lead_time_hours ?? 0) * 3600 * 1000;
  const earliest = Date.now() + leadMs;

  const allSlots = Object.entries(SLOT_GROUPS).flatMap(([group, g]) =>
    g.slots.map((time) => ({ time, group })),
  );

  const result = [];
  for (let i = 0; i < days; i++) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + i);
    const dateStr = localDateStr(day); // local Y-M-D, not UTC (avoids off-by-one)
    const slots = allSlots.map((s) => {
      const slotTime = parseSlot(day, s.time);
      return { time: s.time, group: s.group, available: slotTime.getTime() >= earliest };
    });
    result.push({ date: dateStr, slots });
  }

  res.json({
    service_id: service.id,
    service_slug: service.slug,
    slot_granularity_min: sla.slot_granularity_min,
    lead_time_hours: sla.lead_time_hours,
    emergency_available: sla.emergency_available,
    days: result,
  });
}));

// GET /services/:id/partners — matching engine: admin-verified partners specialized
// in this service (optionally filtered by city). Requires auth (exposes partner info).
router.get('/services/:id/partners', authenticate, asyncHandler(async (req, res) => {
  const { service, partners } = await findEligiblePartners(req.params.id, {
    city: req.query.city ? String(req.query.city) : undefined,
  });
  res.json({
    service_id: service.id,
    service_slug: service.slug,
    partners: partners.map((p) => ({
      id: p.id,
      full_name: p.fullName,
      city: p.city,
      bio: p.bio,
      avatar_url: p.avatarUrl,
      partner_rating: p.partnerRating,
      years_experience: p.yearsExperience ?? null,
    })),
  });
}));

const calcSchema = z.object({
  service_id: z.string().min(1).max(50),
  package_id: z.string().min(1).max(50),
  addon_ids: z.array(z.string().max(50)).max(20).default([]),
  bedrooms: z.string().max(20).optional(),
  service_specific_data: z.record(z.any()).optional(),
  coupon_code: z.string().max(50).nullish(),
});

// POST /pricing/calculate — authoritative quote, no side effects (coupon usage is
// only incremented when a booking is actually created).
router.post('/pricing/calculate', validate(calcSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const pricing = await priceBooking(prisma, {
    serviceId: b.service_id,
    packageId: b.package_id,
    addonIds: b.addon_ids,
    bedrooms: b.bedrooms,
    serviceSpecificData: b.service_specific_data,
    couponCode: b.coupon_code || undefined,
  });
  res.json(mapPricing(pricing));
}));

// ── Dynamic booking-engine quote ─────────────────────────────────────────────
// POST /bookings/calculate — side-effect-free price for a question-driven service.
// Public (quote before login), like /pricing/calculate. Registered on the catalog
// router which mounts before the auth-gated /bookings router, so it stays public.
const dynamicCalcSchema = z.object({
  service_slug: z.string().min(1).max(80),
  answers: z.record(z.any()).default({}),
  after_hours: z.boolean().optional(),
  urgent: z.boolean().optional(),
});

router.post('/bookings/calculate', validate(dynamicCalcSchema), asyncHandler(async (req, res) => {
  const service = await resolveServiceDetailOr404(req.body.service_slug, localeOf(req));
  if (!service.pricingType) {
    throw new ApiError(400, `Service "${service.slug}" is not a dynamic-engine service`);
  }
  const engineService = toEngineService(service);
  const { ok, errors, details } = validateAnswers(engineService, req.body.answers, { locale: localeOf(req) });
  if (!ok) throw new ApiError(400, errors.join('; '), details);

  const pricing = computePrice(engineService, req.body.answers, {
    globalConfig: await withLiveSstRate(GLOBAL_CONFIG),
    afterHours: req.body.after_hours,
    urgent: req.body.urgent,
      // Labels only — every figure below is identical in both languages.
      locale: localeOf(req),
  });
  res.json({ ...mapDynamicPricing(service, pricing), tax: await taxSummary() });
}));

export function mapDynamicPricing(service, p) {
  return {
    service_id: service.id,
    service_slug: service.slug,
    pricing_type: p.pricingType,
    currency: p.currency,
    service_total: p.serviceTotal,
    visit_fee: p.visitFee,
    surcharges: p.surcharges,
    subtotal: p.subtotal,
    platform_fee: p.platformFee,
    sst_enabled: p.sstEnabled,
    tax: p.tax,
    promo_discount: p.promoDiscount,
    total: p.total,
    breakdown: p.breakdown,
    config_version: CONFIG_VERSION,
  };
}

export function mapPricing(p) {
  return {
    service_id: p.serviceId,
    service_slug: p.serviceSlug,
    package_id: p.packageId,
    package_tier: p.packageTier,
    package_name: p.packageName,
    package_name_my: p.packageNameMy,
    pricing_model: p.pricingModel,
    size_id: p.sizeId,
    size_multiplier: p.sizeMultiplier,
    subtotal: p.subtotal,
    discount_amount: p.discount,
    total: p.total,
    platform_fee: p.platformFee,
    partner_payout: p.partnerPayout,
    coupon_code: p.couponCode,
    addons: p.addons.map((a) => ({ id: a.id, slug: a.slug, name: a.name, price: a.price })),
    line_items: p.lineItems.map((li) => ({
      kind: li.kind, ref_id: li.refId, label: li.label, label_my: li.labelMy,
      qty: li.qty, unit_price: li.unitPrice, total: li.total,
    })),
  };
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseSlot(day, label) {
  // label like "8:00 AM" / "12:00 PM"
  const m = label.match(/(\d+):(\d+)\s*(AM|PM)/i);
  const d = new Date(day);
  if (!m) return d;
  let hour = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) hour += 12;
  d.setHours(hour, Number(m[2]), 0, 0);
  return d;
}

export default router;
