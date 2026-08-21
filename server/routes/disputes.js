import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  asyncHandler, ApiError, isAdmin, getBookingOr404, isBookingParticipant, bookingScope,
} from '../lib/access.js';
import { localizedError } from '../lib/errors.js';
import { localeOf } from '../lib/locale.js';
import { buildStatusChange } from '../lib/bookings/status.js';
import { eligibleRefund } from '../lib/refunds/policy.js';
import { executeRefund } from '../lib/refunds/execute.js';
import { notify } from '../lib/notifications/index.js';

const router = Router();
router.use(authenticate);

// Response windows by priority, in hours.
const SLA_HOURS = { urgent: 4, high: 24, normal: 72, low: 168 };

const reference = () => `DSP-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}`;

function mapOut(d) {
  return {
    id: d.id,
    reference: d.reference,
    booking_id: d.bookingId,
    raised_by_id: d.raisedById,
    raised_by_role: d.raisedByRole,
    against_id: d.againstId,
    category: d.category,
    description: d.description,
    desired_outcome: d.desiredOutcome,
    status: d.status,
    priority: d.priority,
    assigned_to_id: d.assignedToId,
    resolution: d.resolution,
    resolution_type: d.resolutionType,
    refund_request_id: d.refundRequestId,
    sla_due_at: d.slaDueAt,
    resolved_at: d.resolvedAt,
    resolved_by_id: d.resolvedById,
    evidence: d.evidence ?? null,
    response: d.response,
    responded_at: d.respondedAt,
    created_date: d.createdAt,
    updated_at: d.updatedAt,
  };
}

async function getDisputeFor(req, id) {
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { booking: true } });
  if (!dispute) throw localizedError(404, 'dispute_not_found', localeOf(req));
  if (!isAdmin(req.user) && !isBookingParticipant(req.user, dispute.booking)) throw localizedError(403, 'forbidden', localeOf(req));
  return dispute;
}

// GET /api/disputes — scoped to the caller's bookings; admin sees all.
router.get('/', asyncHandler(async (req, res) => {
  const where = isAdmin(req.user) ? {} : bookingScope(req.user);
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.booking_id) where.bookingId = String(req.query.booking_id);
  const items = await prisma.dispute.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json(items.map(mapOut));
}));

const createSchema = z.object({
  booking_id: z.string().min(1),
  category: z.enum(['service_quality', 'no_show', 'overcharge', 'damage', 'behaviour', 'payment', 'other']),
  description: z.string().min(10).max(4000),
  desired_outcome: z.enum(['refund', 'redo', 'compensation', 'apology', 'other']).optional(),
  evidence: z.array(z.object({
    kind: z.string().max(20), url: z.string().max(500), caption: z.string().max(200).optional(),
  })).max(10).optional(),
});

// POST /api/disputes — either side of a booking may raise one.
router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const booking = await getBookingOr404(req.body.booking_id, localeOf(req));
  if (!isBookingParticipant(req.user, booking)) throw localizedError(403, 'dispute_own_bookings_only', localeOf(req));
  if (!['completed', 'cancelled', 'disputed', 'started'].includes(booking.status)) {
    throw localizedError(400, 'dispute_too_early', localeOf(req));
  }

  const open = await prisma.dispute.findFirst({
    where: { bookingId: booking.id, status: { in: ['open', 'investigating', 'awaiting_response', 'escalated'] } },
  });
  if (open) throw localizedError(409, 'dispute_already_open', localeOf(req));

  const raisedByRole = booking.partnerId === req.user.id ? 'partner' : 'consumer';
  const againstId = raisedByRole === 'consumer' ? booking.partnerId : booking.consumerId;
  // Damage and no-show carry the most cost and the least ambiguity about urgency.
  const priority = ['damage', 'no_show'].includes(req.body.category) ? 'high' : 'normal';

  const dispute = await prisma.dispute.create({
    data: {
      reference: reference(),
      bookingId: booking.id,
      raisedById: req.user.id,
      raisedByRole,
      againstId,
      category: req.body.category,
      description: req.body.description,
      desiredOutcome: req.body.desired_outcome ?? null,
      priority,
      slaDueAt: new Date(Date.now() + SLA_HOURS[priority] * 3600_000),
      evidence: req.body.evidence ?? undefined,
    },
  });

  // Mark the booking so the refund policy holds the full amount pending review.
  //
  // Through the shared helper so the transition is recorded on the lifecycle
  // like every other one. `force` is used deliberately: raising a dispute is
  // valid from states STATUS_TRANSITIONS does not list (a customer may dispute a
  // completed job), and the dispute itself is the authority for the change.
  // Still audited — the entry records the actor, the previous status and why.
  await prisma.booking.update({
    where: { id: booking.id },
    data: buildStatusChange(booking, 'disputed', { id: req.user.id, role: 'admin' }, {
      force: true,
      reason: `Dispute ${dispute.reference} raised by ${raisedByRole}`,
    }),
  }).catch(() => {});

  notify({ userId: req.user.id, event: 'dispute_raised', bookingId: booking.id, data: { reference: dispute.reference } }).catch(() => {});
  if (againstId) {
    notify({
      userId: againstId, event: 'dispute_response_needed', bookingId: booking.id,
      data: { reference: dispute.reference, serviceName: booking.serviceType },
    }).catch(() => {});
  }

  res.status(201).json(mapOut(dispute));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(mapOut(await getDisputeFor(req, req.params.id)));
}));

// POST /api/disputes/:id/respond — the other side states their case.
// A partner must be able to answer before any liability is decided.
const respondSchema = z.object({
  response: z.string().min(10).max(4000),
  evidence: z.array(z.object({
    kind: z.string().max(20), url: z.string().max(500), caption: z.string().max(200).optional(),
  })).max(10).optional(),
});
router.post('/:id/respond', validate(respondSchema), asyncHandler(async (req, res) => {
  const dispute = await getDisputeFor(req, req.params.id);
  if (dispute.raisedById === req.user.id) throw localizedError(400, 'dispute_self_response', localeOf(req));
  if (['resolved', 'closed'].includes(dispute.status)) throw localizedError(409, 'dispute_closed', localeOf(req));

  const existing = Array.isArray(dispute.evidence) ? dispute.evidence : [];
  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      response: req.body.response,
      respondedAt: new Date(),
      status: dispute.status === 'open' ? 'investigating' : dispute.status,
      evidence: req.body.evidence ? [...existing, ...req.body.evidence] : undefined,
    },
  });
  res.json(mapOut(updated));
}));

// POST /api/disputes/:id/evidence — either party adds more.
const evidenceSchema = z.object({
  evidence: z.array(z.object({
    kind: z.string().max(20), url: z.string().max(500), caption: z.string().max(200).optional(),
  })).min(1).max(10),
});
router.post('/:id/evidence', validate(evidenceSchema), asyncHandler(async (req, res) => {
  const dispute = await getDisputeFor(req, req.params.id);
  if (['resolved', 'closed'].includes(dispute.status)) throw localizedError(409, 'dispute_closed', localeOf(req));
  const existing = Array.isArray(dispute.evidence) ? dispute.evidence : [];
  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      evidence: [...existing, ...req.body.evidence.map((e) => ({ ...e, uploadedBy: req.user.id }))],
    },
  });
  res.json(mapOut(updated));
}));

const patchSchema = z.object({
  status: z.enum(['open', 'investigating', 'awaiting_response', 'escalated']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assigned_to_id: z.string().nullish(),
});
router.patch('/:id', requireRole('admin', 'super_admin'), validate(patchSchema), asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.status) data.status = req.body.status;
  if (req.body.priority) {
    data.priority = req.body.priority;
    data.slaDueAt = new Date(Date.now() + SLA_HOURS[req.body.priority] * 3600_000);
  }
  if (req.body.assigned_to_id !== undefined) data.assignedToId = req.body.assigned_to_id;
  const updated = await prisma.dispute.update({ where: { id: req.params.id }, data });
  res.json(mapOut(updated));
}));

// POST /api/disputes/:id/resolve — admin decision.
//
// A dispute may resolve with no refund at all (redo, apology, no action), which
// is precisely why it is a separate object from a RefundRequest.
const resolveSchema = z.object({
  resolution_type: z.enum(['full_refund', 'partial_refund', 'redo', 'no_action', 'compensation']),
  resolution: z.string().min(10).max(2000),
  refund_amount: z.coerce.number().min(0).optional(),
  liable_party: z.enum(['partner', 'platform', 'customer', 'shared']).nullish(),
  partner_liability_amount: z.coerce.number().min(0).optional(),
});
router.post('/:id/resolve', requireRole('admin', 'super_admin'), validate(resolveSchema), asyncHandler(async (req, res) => {
  const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id }, include: { booking: true } });
  if (!dispute) throw localizedError(404, 'dispute_not_found', localeOf(req));
  if (['resolved', 'closed'].includes(dispute.status)) throw new ApiError(409, 'This dispute is already resolved');

  const wantsRefund = ['full_refund', 'partial_refund'].includes(req.body.resolution_type);
  let refundRequestId = dispute.refundRequestId;

  if (wantsRefund) {
    const booking = dispute.booking;
    const verdict = eligibleRefund(booking, { reason: 'dispute' });
    const amount = req.body.resolution_type === 'full_refund'
      ? booking.price
      : Math.min(req.body.refund_amount ?? 0, booking.price);
    if (amount <= 0) throw new ApiError(400, 'A partial refund needs a positive refund_amount');

    const liability = req.body.partner_liability_amount ?? 0;
    if (liability > 0 && !req.body.liable_party) {
      throw new ApiError(400, 'liable_party is required when charging a partner');
    }

    const refund = await prisma.refundRequest.create({
      data: {
        bookingId: booking.id,
        consumerId: booking.consumerId,
        originalAmount: booking.price,
        refundAmount: amount,
        refundType: req.body.resolution_type === 'full_refund' ? 'full' : 'partial',
        reason: `Dispute ${dispute.reference}: ${req.body.resolution}`.slice(0, 2000),
        status: 'approved',
        approvedById: req.user.id,
        approvedAt: new Date(),
        policyApplied: verdict.policy,
        liableParty: req.body.liable_party ?? null,
        partnerLiabilityAmount: liability,
        disputeId: dispute.id,
      },
    });
    await executeRefund(refund);
    refundRequestId = refund.id;
  }

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      status: 'resolved',
      resolutionType: req.body.resolution_type,
      resolution: req.body.resolution,
      resolvedAt: new Date(),
      resolvedById: req.user.id,
      refundRequestId,
    },
  });

  for (const userId of [dispute.raisedById, dispute.againstId].filter(Boolean)) {
    notify({
      userId, event: 'dispute_resolved', bookingId: dispute.bookingId,
      data: { reference: dispute.reference, outcome: req.body.resolution_type.replace('_', ' ') },
    }).catch(() => {});
  }

  res.json(mapOut(updated));
}));

export default router;
