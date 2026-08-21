import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  asyncHandler, ApiError, isAdmin, getBookingOr404, emailsByIds, bookingScope,
} from '../lib/access.js';
import { localizedError, refundPolicyReason } from '../lib/errors.js';
import { localeOf } from '../lib/locale.js';
import { eligibleRefund, isAutoApprovable, round2 } from '../lib/refunds/policy.js';
import { executeRefund } from '../lib/refunds/execute.js';
import { notify } from '../lib/notifications/index.js';

const router = Router();
router.use(authenticate);

// How long admin has to decide before the request is flagged as breaching SLA.
const REVIEW_SLA_HOURS = 72;

async function mapManyOut(items) {
  const emails = await emailsByIds(items.map((r) => r.consumerId));
  return items.map((r) => ({
    id: r.id,
    booking_id: r.bookingId,
    consumer_email: emails[r.consumerId],
    original_amount: r.originalAmount,
    refund_amount: r.refundAmount,
    refund_type: r.refundType,
    reason: r.reason,
    status: r.status,
    admin_note: r.adminNote,
    created_date: r.createdAt,
    // Additive — existing clients ignore what they don't read.
    payment_id: r.paymentId,
    refund_method: r.refundMethod,
    gateway_refund_ref: r.gatewayRefundRef,
    credit_note_id: r.creditNoteId,
    processed_at: r.processedAt,
    approved_at: r.approvedAt,
    rejection_reason: r.rejectionReason,
    partner_liability_amount: r.partnerLiabilityAmount,
    liable_party: r.liableParty,
    policy_applied: r.policyApplied,
    is_auto_approved: r.isAutoApproved,
    sla_due_at: r.slaDueAt,
    dispute_id: r.disputeId,
    failure_reason: r.failureReason,
    evidence: r.evidence ?? null,
    updated_at: r.updatedAt,
  }));
}

// How much has already been refunded on a booking (completed requests only).
async function alreadyRefundedOn(bookingId) {
  const done = await prisma.refundRequest.findMany({
    where: { bookingId, status: 'completed' },
    select: { refundAmount: true },
  });
  return round2(done.reduce((s, r) => s + r.refundAmount, 0));
}

// GET /api/refunds — admin: all; consumer: own; partner: refunds on their jobs.
// Partners can now see these: a liability deduction should never be the first
// they hear of a refund.
router.get('/', asyncHandler(async (req, res) => {
  let where;
  if (isAdmin(req.user)) where = {};
  else if (req.user.role === 'partner') where = bookingScope(req.user);
  else where = { consumerId: req.user.id };

  if (req.query.status) where.status = String(req.query.status);
  if (req.query.booking_id) where.bookingId = String(req.query.booking_id);

  const items = await prisma.refundRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json(await mapManyOut(items));
}));

// GET /api/refunds/policy?booking_id= — preview before requesting, so the
// customer sees the figure rather than being surprised by it.
router.get('/policy', asyncHandler(async (req, res) => {
  const bookingId = String(req.query.booking_id || '');
  if (!bookingId) throw new ApiError(400, 'booking_id is required');
  const booking = await getBookingOr404(bookingId, localeOf(req));
  if (booking.consumerId !== req.user.id && !isAdmin(req.user)) throw localizedError(403, 'forbidden', localeOf(req));

  const alreadyRefunded = await alreadyRefundedOn(booking.id);
  const verdict = eligibleRefund(booking, { alreadyRefunded, reason: req.query.reason });
  res.json({
    booking_id: booking.id,
    booking_total: booking.price,
    already_refunded: alreadyRefunded,
    eligible_amount: verdict.amount,
    refund_type: verdict.type,
    percent: verdict.percent,
    policy: verdict.policy,
    explanation: refundPolicyReason(verdict.policy, localeOf(req), verdict.reason),
    hours_notice: verdict.hoursNotice,
    auto_approved: isAutoApprovable(verdict.policy),
  });
}));

const createSchema = z.object({
  booking_id: z.string().min(1),
  reason: z.string().min(5).max(2000),
  // Accepted for backward compatibility but NOT trusted — the amount is derived
  // from policy. A client-supplied figure was the original defect here.
  refund_type: z.enum(['full', 'partial']).optional(),
  refund_amount: z.coerce.number().positive().optional(),
  evidence: z.array(z.object({
    kind: z.string().max(20), url: z.string().max(500), caption: z.string().max(200).optional(),
  })).max(10).optional(),
});

// POST /api/refunds — the consumer requests; the server decides the amount.
router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const booking = await getBookingOr404(req.body.booking_id, localeOf(req));
  if (booking.consumerId !== req.user.id && !isAdmin(req.user)) {
    throw localizedError(403, 'refund_own_bookings_only', localeOf(req));
  }
  const existing = await prisma.refundRequest.findFirst({
    where: { bookingId: booking.id, status: { in: ['pending', 'under_review', 'approved', 'processing'] } },
  });
  if (existing) throw localizedError(409, 'refund_already_exists', localeOf(req));

  const alreadyRefunded = await alreadyRefundedOn(booking.id);
  const verdict = eligibleRefund(booking, { alreadyRefunded, reason: req.body.reason });
  if (verdict.amount <= 0) {
    throw new ApiError(400, refundPolicyReason(verdict.policy, localeOf(req), verdict.reason), [{ code: verdict.policy }]);
  }

  const autoApprove = isAutoApprovable(verdict.policy);
  const created = await prisma.refundRequest.create({
    data: {
      bookingId: booking.id,
      consumerId: booking.consumerId,
      originalAmount: booking.price,
      refundAmount: verdict.amount,
      refundType: verdict.type,
      reason: req.body.reason,
      status: autoApprove ? 'approved' : 'pending',
      policyApplied: verdict.policy,
      isAutoApproved: autoApprove,
      approvedAt: autoApprove ? new Date() : null,
      slaDueAt: new Date(Date.now() + REVIEW_SLA_HOURS * 3600_000),
      evidence: req.body.evidence ?? undefined,
    },
  });

  notify({
    userId: booking.consumerId, event: 'refund_requested', bookingId: booking.id,
    data: { serviceName: booking.serviceType, amount: `RM ${verdict.amount.toFixed(2)}` },
  }).catch(() => {});

  // An in-policy cancellation settles immediately — no reason to make someone
  // wait on a human for a rule a machine just applied.
  if (autoApprove) {
    const executed = await executeRefund(created);
    return res.status(201).json((await mapManyOut([executed]))[0]);
  }
  res.status(201).json((await mapManyOut([created]))[0]);
}));

// GET /api/refunds/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const item = await prisma.refundRequest.findUnique({
    where: { id: req.params.id },
    include: { booking: true },
  });
  if (!item) throw localizedError(404, 'refund_not_found', localeOf(req));
  const allowed = isAdmin(req.user)
    || item.consumerId === req.user.id
    || item.booking?.partnerId === req.user.id;
  if (!allowed) throw localizedError(403, 'forbidden', localeOf(req));
  res.json((await mapManyOut([item]))[0]);
}));

// POST /api/refunds/:id/cancel — the consumer withdraws while still pending.
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const item = await prisma.refundRequest.findUnique({ where: { id: req.params.id } });
  if (!item) throw localizedError(404, 'refund_not_found', localeOf(req));
  if (item.consumerId !== req.user.id && !isAdmin(req.user)) throw localizedError(403, 'forbidden', localeOf(req));
  if (!['pending', 'under_review'].includes(item.status)) {
    throw localizedError(409, 'refund_cannot_cancel', localeOf(req), item.status);
  }
  const updated = await prisma.refundRequest.update({
    where: { id: item.id }, data: { status: 'cancelled' },
  });
  res.json((await mapManyOut([updated]))[0]);
}));

const patchSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'under_review']),
  admin_note: z.string().max(2000).nullish(),
  rejection_reason: z.string().max(500).nullish(),
  // Who bears the cost. Required when charging the partner — an inferred
  // liability is not a decision anyone can defend later.
  liable_party: z.enum(['partner', 'platform', 'customer', 'shared']).nullish(),
  partner_liability_amount: z.coerce.number().min(0).nullish(),
});

// PATCH /api/refunds/:id — admin decision. Approving now EXECUTES the refund.
router.patch('/:id', requireRole('admin', 'super_admin'), validate(patchSchema), asyncHandler(async (req, res) => {
  const existing = await prisma.refundRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) throw localizedError(404, 'refund_not_found', localeOf(req));
  if (['completed', 'processing'].includes(existing.status)) {
    throw new ApiError(409, `This refund is already ${existing.status}`);
  }

  const liability = round2(req.body.partner_liability_amount ?? 0);
  if (liability > 0 && !req.body.liable_party) {
    throw new ApiError(400, 'liable_party is required when charging a partner for a refund');
  }
  if (liability > existing.refundAmount) {
    throw new ApiError(400, 'Partner liability cannot exceed the refund amount');
  }
  if (req.body.status === 'rejected' && !req.body.rejection_reason) {
    throw new ApiError(400, 'A rejection reason is required so the customer knows why');
  }

  const data = { status: req.body.status };
  if (req.body.admin_note !== undefined) data.adminNote = req.body.admin_note;
  if (req.body.rejection_reason !== undefined) data.rejectionReason = req.body.rejection_reason;
  if (req.body.liable_party !== undefined) data.liableParty = req.body.liable_party;
  if (req.body.partner_liability_amount !== undefined) data.partnerLiabilityAmount = liability;
  if (req.body.status === 'approved') {
    data.approvedById = req.user.id;
    data.approvedAt = new Date();
  }

  const updated = await prisma.refundRequest.update({ where: { id: req.params.id }, data });

  if (req.body.status === 'rejected') {
    const booking = await prisma.booking.findUnique({ where: { id: updated.bookingId } });
    notify({
      userId: updated.consumerId, event: 'refund_rejected', bookingId: updated.bookingId,
      data: { serviceName: booking?.serviceType, reason: req.body.rejection_reason },
    }).catch(() => {});
  }

  if (req.body.status === 'approved') {
    const executed = await executeRefund(updated);
    return res.json((await mapManyOut([executed]))[0]);
  }
  res.json((await mapManyOut([updated]))[0]);
}));

// POST /api/refunds/:id/retry — a failed gateway refund, retried.
router.post('/:id/retry', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const item = await prisma.refundRequest.findUnique({ where: { id: req.params.id } });
  if (!item) throw localizedError(404, 'refund_not_found', localeOf(req));
  if (item.status !== 'failed') throw new ApiError(409, `Only a failed refund can be retried (this one is ${item.status})`);
  const executed = await executeRefund({ ...item, status: 'approved' });
  res.json((await mapManyOut([executed]))[0]);
}));

export default router;
