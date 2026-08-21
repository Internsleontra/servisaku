import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isAdmin, getBookingOr404 } from '../lib/access.js';
import { localizedError } from '../lib/errors.js';
import { localeOf } from '../lib/locale.js';
import {
  dueDates, compensationDueAt, isWithinWindow, splitLiability, breaches,
  MAX_CLAIM_AMOUNT, REPORTING_WINDOW_HOURS, round2,
} from '../lib/damageClaims/sla.js';
import { post } from '../lib/wallet/ledger.js';
import { notify } from '../lib/notifications/index.js';

const router = Router();
router.use(authenticate);

const reference = () => `DMG-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}`;

const evidenceInput = z.object({
  kind: z.enum(['photo', 'video', 'document', 'invoice', 'quote', 'receipt']),
  file_url: z.string().min(1).max(500),
  caption: z.string().max(200).optional(),
  mime_type: z.string().max(100).optional(),
  size_bytes: z.coerce.number().int().nonnegative().optional(),
});

function mapEvidence(e) {
  return {
    id: e.id, kind: e.kind, file_url: e.fileUrl, thumbnail_url: e.thumbnailUrl,
    caption: e.caption, mime_type: e.mimeType, size_bytes: e.sizeBytes,
    uploaded_by_id: e.uploadedById, uploaded_by_role: e.uploadedByRole,
    created_date: e.createdAt,
  };
}

function mapEvent(e) {
  return {
    id: e.id, actor_id: e.actorId, actor_role: e.actorRole, action: e.action,
    from_status: e.fromStatus, to_status: e.toStatus, note: e.note, created_date: e.createdAt,
  };
}

function mapOut(c, { includeChildren = false } = {}) {
  const base = {
    id: c.id,
    reference: c.reference,
    booking_id: c.bookingId,
    consumer_id: c.consumerId,
    partner_id: c.partnerId,
    category: c.category,
    item_description: c.itemDescription,
    incident_description: c.incidentDescription,
    incident_at: c.incidentAt,
    claimed_amount: c.claimedAmount,
    approved_amount: c.approvedAmount,
    currency: c.currency,
    status: c.status,
    is_late: c.isLate,
    partner_response: c.partnerResponse,
    partner_responded_at: c.partnerRespondedAt,
    partner_liability_percent: c.partnerLiabilityPercent,
    partner_liability_amount: c.partnerLiabilityAmount,
    platform_absorbed: c.platformAbsorbed,
    investigator_id: c.investigatorId,
    investigation_notes: c.investigationNotes,
    decision_reason: c.decisionReason,
    decided_at: c.decidedAt,
    compensation_method: c.compensationMethod,
    compensation_ref: c.compensationRef,
    compensated_at: c.compensatedAt,
    insurance_claim_ref: c.insuranceClaimRef,
    acknowledge_due_at: c.acknowledgeDueAt,
    response_due_at: c.responseDueAt,
    investigation_due_at: c.investigationDueAt,
    compensation_due_at: c.compensationDueAt,
    sla_breaches: breaches(c),
    appeal_count: c.appealCount,
    closed_at: c.closedAt,
    created_date: c.createdAt,
    updated_at: c.updatedAt,
  };
  if (includeChildren) {
    base.evidence = (c.evidence || []).map(mapEvidence);
    base.timeline = (c.events || []).map(mapEvent);
  }
  return base;
}

// Every state change writes a timeline row. This is the audit record behind a
// money decision and has to be defensible after the fact.
async function recordEvent(claimId, { actorId, actorRole, action, fromStatus, toStatus, note, metadata }) {
  return prisma.damageClaimEvent.create({
    data: {
      claimId,
      actorId: actorId ?? null,
      actorRole,
      action,
      fromStatus: fromStatus ?? null,
      toStatus: toStatus ?? null,
      note: note ?? null,
      metadata: metadata ?? undefined,
    },
  });
}

function roleOf(user, claim) {
  if (isAdmin(user)) return 'admin';
  if (claim.consumerId === user.id) return 'consumer';
  if (claim.partnerId === user.id) return 'partner';
  return null;
}

async function getClaimFor(req, id, { includeChildren = false } = {}) {
  const claim = await prisma.damageClaim.findUnique({
    where: { id },
    include: includeChildren
      ? { evidence: { orderBy: { createdAt: 'asc' } }, events: { orderBy: { createdAt: 'asc' } } }
      : undefined,
  });
  if (!claim) throw localizedError(404, 'claim_not_found', localeOf(req));
  if (!roleOf(req.user, claim)) throw localizedError(403, 'forbidden', localeOf(req));
  return claim;
}

// GET /api/damage-claims — consumer: own; partner: against them; admin: all.
router.get('/', asyncHandler(async (req, res) => {
  let where;
  if (isAdmin(req.user)) where = {};
  else if (req.user.role === 'partner') where = { partnerId: req.user.id };
  else where = { consumerId: req.user.id };
  if (req.query.status) where.status = String(req.query.status);

  const items = await prisma.damageClaim.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json(items.map((c) => mapOut(c)));
}));

// GET /api/damage-claims/stats — admin dashboard aggregates.
router.get('/stats', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const claims = await prisma.damageClaim.findMany();
  const open = claims.filter((c) => !['compensated', 'closed', 'rejected'].includes(c.status));
  res.json({
    total: claims.length,
    open: open.length,
    breaching: open.filter((c) => breaches(c).length > 0).length,
    total_claimed: round2(claims.reduce((s, c) => s + c.claimedAmount, 0)),
    total_approved: round2(claims.reduce((s, c) => s + c.approvedAmount, 0)),
    total_partner_liability: round2(claims.reduce((s, c) => s + c.partnerLiabilityAmount, 0)),
    total_platform_absorbed: round2(claims.reduce((s, c) => s + c.platformAbsorbed, 0)),
    by_status: claims.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {}),
  });
}));

const createSchema = z.object({
  booking_id: z.string().min(1),
  category: z.enum(['property', 'appliance', 'furniture', 'fixture', 'vehicle', 'personal_item', 'other']),
  item_description: z.string().min(3).max(200),
  incident_description: z.string().min(20).max(4000),
  claimed_amount: z.coerce.number().positive().max(MAX_CLAIM_AMOUNT),
  incident_at: z.coerce.date().optional(),
  evidence: z.array(evidenceInput).min(1).max(20),
});

// POST /api/damage-claims — the customer files a claim.
router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const booking = await getBookingOr404(req.body.booking_id, localeOf(req));
  if (booking.consumerId !== req.user.id) throw localizedError(403, 'claim_own_bookings_only', localeOf(req));
  if (booking.status !== 'completed') throw localizedError(400, 'claim_before_completion', localeOf(req));

  const existing = await prisma.damageClaim.findFirst({
    where: { bookingId: booking.id, status: { notIn: ['rejected', 'closed'] } },
  });
  // A second claim on the same booking is an appeal or more evidence, not a new
  // case — otherwise the same incident gets investigated twice.
  if (existing) throw localizedError(409, 'claim_already_open', localeOf(req));

  // At least one photo. A written description alone cannot be investigated.
  if (!req.body.evidence.some((e) => e.kind === 'photo')) {
    throw localizedError(400, 'claim_photo_required', localeOf(req));
  }

  const now = new Date();
  const completedAt = Array.isArray(booking.lifecycle)
    ? booking.lifecycle.find((l) => l.status === 'completed')?.at
    : null;
  const late = !isWithinWindow(completedAt, now);
  const sla = dueDates(now);

  const claim = await prisma.$transaction(async (tx) => {
    const created = await tx.damageClaim.create({
      data: {
        reference: reference(),
        bookingId: booking.id,
        consumerId: booking.consumerId,
        partnerId: booking.partnerId,
        category: req.body.category,
        itemDescription: req.body.item_description,
        incidentDescription: req.body.incident_description,
        incidentAt: req.body.incident_at ?? null,
        claimedAmount: req.body.claimed_amount,
        // Late claims are accepted and flagged, not refused — damage is
        // genuinely sometimes discovered later. Admin decides.
        isLate: late,
        ...sla,
      },
    });
    for (const e of req.body.evidence) {
      await tx.damageClaimEvidence.create({
        data: {
          claimId: created.id,
          uploadedById: req.user.id,
          uploadedByRole: 'consumer',
          kind: e.kind,
          fileUrl: e.file_url,
          caption: e.caption ?? null,
          mimeType: e.mime_type ?? null,
          sizeBytes: e.size_bytes ?? null,
        },
      });
    }
    return created;
  });

  await recordEvent(claim.id, {
    actorId: req.user.id, actorRole: 'consumer', action: 'submitted', toStatus: 'submitted',
    note: late ? `Filed outside the ${REPORTING_WINDOW_HOURS}h reporting window` : null,
  });

  notify({
    userId: booking.consumerId, event: 'damage_claim_submitted', bookingId: booking.id,
    data: { reference: claim.reference, amount: `RM ${claim.claimedAmount.toFixed(2)}` },
  }).catch(() => {});
  if (booking.partnerId) {
    notify({
      userId: booking.partnerId, event: 'damage_response_required', bookingId: booking.id,
      data: { reference: claim.reference, serviceName: booking.serviceType, item: claim.itemDescription },
    }).catch(() => {});
  }

  res.status(201).json(mapOut(claim));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const claim = await getClaimFor(req, req.params.id, { includeChildren: true });
  res.json(mapOut(claim, { includeChildren: true }));
}));

// POST /api/damage-claims/:id/evidence — either party adds more.
const addEvidenceSchema = z.object({ evidence: z.array(evidenceInput).min(1).max(20) });
router.post('/:id/evidence', validate(addEvidenceSchema), asyncHandler(async (req, res) => {
  const claim = await getClaimFor(req, req.params.id);
  const role = roleOf(req.user, claim);
  // Evidence is frozen once a decision is made — otherwise the record behind
  // that decision changes after the fact.
  if (claim.decidedAt) throw localizedError(409, 'claim_evidence_after_decision', localeOf(req));

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const e of req.body.evidence) {
      rows.push(await tx.damageClaimEvidence.create({
        data: {
          claimId: claim.id, uploadedById: req.user.id, uploadedByRole: role,
          kind: e.kind, fileUrl: e.file_url, caption: e.caption ?? null,
          mimeType: e.mime_type ?? null, sizeBytes: e.size_bytes ?? null,
        },
      }));
    }
    return rows;
  });
  await recordEvent(claim.id, { actorId: req.user.id, actorRole: role, action: 'evidence_added', note: `${created.length} file(s)` });
  res.status(201).json(created.map(mapEvidence));
}));

// POST /api/damage-claims/:id/respond — the partner's account of the incident.
const respondSchema = z.object({ response: z.string().min(10).max(5000) });
router.post('/:id/respond', validate(respondSchema), asyncHandler(async (req, res) => {
  const claim = await getClaimFor(req, req.params.id);
  if (claim.partnerId !== req.user.id) throw new ApiError(403, 'Only the assigned partner can respond to this claim');
  if (claim.decidedAt) throw localizedError(409, 'claim_already_decided', localeOf(req));

  const updated = await prisma.damageClaim.update({
    where: { id: claim.id },
    data: {
      partnerResponse: req.body.response,
      partnerRespondedAt: new Date(),
      status: ['submitted', 'acknowledged', 'awaiting_partner_response'].includes(claim.status) ? 'investigating' : claim.status,
    },
  });
  await recordEvent(claim.id, {
    actorId: req.user.id, actorRole: 'partner', action: 'partner_responded',
    fromStatus: claim.status, toStatus: updated.status,
  });
  res.json(mapOut(updated));
}));

// PATCH /api/damage-claims/:id — admin moves the investigation along.
const patchSchema = z.object({
  status: z.enum(['acknowledged', 'awaiting_partner_response', 'investigating', 'awaiting_evidence']).optional(),
  investigator_id: z.string().nullish(),
  investigation_notes: z.string().max(4000).nullish(),
});
router.patch('/:id', requireRole('admin', 'super_admin'), validate(patchSchema), asyncHandler(async (req, res) => {
  const claim = await prisma.damageClaim.findUnique({ where: { id: req.params.id } });
  if (!claim) throw localizedError(404, 'claim_not_found', localeOf(req));

  const data = {};
  if (req.body.status) data.status = req.body.status;
  if (req.body.investigator_id !== undefined) data.investigatorId = req.body.investigator_id;
  if (req.body.investigation_notes !== undefined) data.investigationNotes = req.body.investigation_notes;

  const updated = await prisma.damageClaim.update({ where: { id: claim.id }, data });
  await recordEvent(claim.id, {
    actorId: req.user.id, actorRole: 'admin',
    action: req.body.status ? 'status_changed' : 'note_added',
    fromStatus: claim.status, toStatus: updated.status,
    note: req.body.investigation_notes ?? null,
  });

  if (req.body.status === 'acknowledged') {
    notify({ userId: claim.consumerId, event: 'damage_claim_acknowledged', data: { reference: claim.reference } }).catch(() => {});
  }
  if (req.body.status === 'awaiting_evidence') {
    notify({ userId: claim.consumerId, event: 'damage_evidence_requested', data: { reference: claim.reference } }).catch(() => {});
  }
  res.json(mapOut(updated));
}));

// POST /api/damage-claims/:id/decide — approve (fully or partly) or reject.
const decideSchema = z.object({
  decision: z.enum(['approve', 'partially_approve', 'reject']),
  approved_amount: z.coerce.number().min(0).optional(),
  partner_liability_percent: z.coerce.number().min(0).max(100).default(0),
  reason: z.string().min(10).max(2000),
});
router.post('/:id/decide', requireRole('admin', 'super_admin'), validate(decideSchema), asyncHandler(async (req, res) => {
  const claim = await prisma.damageClaim.findUnique({ where: { id: req.params.id } });
  if (!claim) throw localizedError(404, 'claim_not_found', localeOf(req));
  if (claim.decidedAt) throw localizedError(409, 'claim_already_decided', localeOf(req));

  if (req.body.decision === 'reject') {
    const rejected = await prisma.damageClaim.update({
      where: { id: claim.id },
      data: { status: 'rejected', approvedAmount: 0, decisionReason: req.body.reason, decidedById: req.user.id, decidedAt: new Date() },
    });
    await recordEvent(claim.id, {
      actorId: req.user.id, actorRole: 'admin', action: 'decided',
      fromStatus: claim.status, toStatus: 'rejected', note: req.body.reason,
    });
    notify({
      userId: claim.consumerId, event: 'damage_claim_rejected',
      data: { reference: claim.reference, reason: req.body.reason },
    }).catch(() => {});
    return res.json(mapOut(rejected));
  }

  const requested = req.body.decision === 'approve'
    ? claim.claimedAmount
    : (req.body.approved_amount ?? 0);
  if (requested <= 0) throw new ApiError(400, 'A partial approval needs a positive approved_amount');
  if (requested > claim.claimedAmount) throw new ApiError(400, 'Approved amount cannot exceed the amount claimed');

  const split = splitLiability(requested, req.body.partner_liability_percent);
  const now = new Date();

  const updated = await prisma.damageClaim.update({
    where: { id: claim.id },
    data: {
      status: req.body.decision === 'approve' ? 'approved' : 'partially_approved',
      approvedAmount: split.approvedAmount,
      partnerLiabilityPercent: split.partnerLiabilityPercent,
      partnerLiabilityAmount: split.partnerLiabilityAmount,
      platformAbsorbed: split.platformAbsorbed,
      decisionReason: req.body.reason,
      decidedById: req.user.id,
      decidedAt: now,
      compensationDueAt: compensationDueAt(now),
    },
  });
  await recordEvent(claim.id, {
    actorId: req.user.id, actorRole: 'admin', action: 'decided',
    fromStatus: claim.status, toStatus: updated.status, note: req.body.reason,
    metadata: split,
  });

  notify({
    userId: claim.consumerId, event: 'damage_claim_approved',
    data: { reference: claim.reference, amount: `RM ${split.approvedAmount.toFixed(2)}` },
  }).catch(() => {});

  res.json({ ...mapOut(updated), via_insurance: split.viaInsurance });
}));

// POST /api/damage-claims/:id/compensate — pay the customer, charge the partner.
const compensateSchema = z.object({
  method: z.enum(['wallet_credit', 'original_payment', 'bank_transfer', 'insurance', 'replacement']),
  reference: z.string().max(200).optional(),
  insurance_claim_ref: z.string().max(200).optional(),
});
router.post('/:id/compensate', requireRole('admin', 'super_admin'), validate(compensateSchema), asyncHandler(async (req, res) => {
  const claim = await prisma.damageClaim.findUnique({ where: { id: req.params.id } });
  if (!claim) throw localizedError(404, 'claim_not_found', localeOf(req));
  if (!['approved', 'partially_approved', 'compensating'].includes(claim.status)) {
    throw new ApiError(409, `A ${claim.status} claim cannot be compensated`);
  }
  if (claim.compensatedAt) throw new ApiError(409, 'This claim has already been compensated');

  // Charge the partner their share. Insurance-routed claims are settled by the
  // insurer, so the partner's wallet is not touched.
  if (claim.partnerLiabilityAmount > 0 && claim.partnerId && req.body.method !== 'insurance') {
    await post({
      partnerId: claim.partnerId,
      type: 'damage_deduction',
      amount: claim.partnerLiabilityAmount,
      description: `Damage claim ${claim.reference} — ${claim.itemDescription}`.slice(0, 300),
      bookingId: claim.bookingId,
      claimId: claim.id,
      createdById: req.user.id,
      idempotencyKey: `damage:${claim.id}`,
    });
    notify({
      userId: claim.partnerId, event: 'damage_liability_applied',
      data: { reference: claim.reference, amount: `RM ${claim.partnerLiabilityAmount.toFixed(2)}` },
    }).catch(() => {});
  }

  const updated = await prisma.damageClaim.update({
    where: { id: claim.id },
    data: {
      status: 'compensated',
      compensationMethod: req.body.method,
      compensationRef: req.body.reference ?? null,
      insuranceClaimRef: req.body.insurance_claim_ref ?? null,
      compensatedAt: new Date(),
      closedAt: new Date(),
    },
  });
  await recordEvent(claim.id, {
    actorId: req.user.id, actorRole: 'admin', action: 'compensated',
    fromStatus: claim.status, toStatus: 'compensated',
    note: `${req.body.method}${req.body.reference ? ` (${req.body.reference})` : ''}`,
  });

  notify({
    userId: claim.consumerId, event: 'damage_compensation_sent',
    data: { reference: claim.reference, amount: `RM ${claim.approvedAmount.toFixed(2)}`, method: req.body.method.replace('_', ' ') },
  }).catch(() => {});

  res.json(mapOut(updated));
}));

// POST /api/damage-claims/:id/appeal — the customer may appeal once.
const appealSchema = z.object({ reason: z.string().min(20).max(2000) });
router.post('/:id/appeal', validate(appealSchema), asyncHandler(async (req, res) => {
  const claim = await getClaimFor(req, req.params.id);
  if (claim.consumerId !== req.user.id) throw localizedError(403, 'claim_appeal_owner_only', localeOf(req));
  if (!claim.decidedAt) throw localizedError(400, 'claim_no_decision_yet', localeOf(req));
  if (claim.appealCount >= 1) throw localizedError(409, 'claim_already_appealed', localeOf(req));

  const updated = await prisma.damageClaim.update({
    where: { id: claim.id },
    data: {
      status: 'appealed',
      appealCount: { increment: 1 },
      // Reopen the decision so the investigation can genuinely be revisited.
      decidedAt: null,
      closedAt: null,
    },
  });
  await recordEvent(claim.id, {
    actorId: req.user.id, actorRole: 'consumer', action: 'appealed',
    fromStatus: claim.status, toStatus: 'appealed', note: req.body.reason,
  });
  res.json(mapOut(updated));
}));

export default router;
