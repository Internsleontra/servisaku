import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, bookingScope, isBookingParticipant } from '../lib/access.js';
import { creditEarning } from '../lib/wallet/index.js';

const router = Router();
router.use(authenticate);

function mapOut(e) {
  return {
    id: e.id,
    booking_id: e.bookingId,
    gross_amount: e.grossAmount,
    commission_amount: e.commissionAmount,
    commission_rate: e.commissionRate,
    // DEPRECATED alias — existing clients still read platform_fee. Same value as
    // commission_amount; it is the partner commission, never the customer's
    // booking fee. Remove once no client reads it.
    platform_fee: e.commissionAmount,
    partner_payout: e.partnerPayout,
    status: e.status,
    freeze_reason: e.freezeReason,
    released_at: e.releasedAt,
    created_date: e.createdAt,
  };
}

// GET /api/escrow — admin: all; partner/consumer: entries on their own bookings
router.get('/', asyncHandler(async (req, res) => {
  const where = bookingScope(req.user);
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.booking_id) where.bookingId = String(req.query.booking_id);
  const items = await prisma.escrowLedger.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(items.map(mapOut));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const item = await prisma.escrowLedger.findUnique({
    where: { id: req.params.id },
    include: { booking: true },
  });
  if (!item) throw new ApiError(404, 'Not found');
  if (!isBookingParticipant(req.user, item.booking)) throw new ApiError(403, 'Forbidden');
  res.json(mapOut(item));
}));

const patchSchema = z.object({
  status: z.enum(['held', 'released', 'frozen', 'refunded']),
  freeze_reason: z.string().max(500).nullish(),
});

// Money-state transitions are admin-only. Escrow rows are created by the server
// itself during booking creation — there is no client create endpoint.
router.patch('/:id', requireRole('admin', 'super_admin'), validate(patchSchema), asyncHandler(async (req, res) => {
  const existing = await prisma.escrowLedger.findUnique({
    where: { id: req.params.id },
    include: { booking: { include: { partner: true } } },
  });
  if (!existing) throw new ApiError(404, 'Not found');

  const data = { status: req.body.status };
  if (req.body.freeze_reason !== undefined) data.freezeReason = req.body.freeze_reason;
  if (req.body.status === 'released') data.releasedAt = new Date();
  const item = await prisma.escrowLedger.update({ where: { id: req.params.id }, data });

  // Releasing escrow is the moment the partner's earnings become withdrawable:
  // the money moves from `pending` to `available` in their wallet. Fire once, on
  // the transition, and let the ledger's idempotency key absorb any repeat.
  if (existing.status !== 'released' && item.status === 'released' && existing.booking?.partnerId) {
    creditEarning(existing.booking, { partner: existing.booking.partner }).catch((err) =>
      console.error('[escrow] wallet credit failed:', err?.message || err));
  }
  res.json(mapOut(item));
}));

export default router;
