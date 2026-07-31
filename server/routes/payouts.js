import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isAdmin, findUserByEmail, emailsByIds } from '../lib/access.js';
import { getWallet, debitPayout } from '../lib/wallet/index.js';
import { round2 } from '../lib/payments/commission.js';
import { notify } from '../lib/notifications/index.js';

const router = Router();
router.use(authenticate);

// A payout reaching "completed" is the moment a partner's earnings are actually
// released — notify them (best-effort, off the response path).
function notifyPayoutReleased(payout) {
  if (!payout?.partnerId) return;
  notify({
    userId: payout.partnerId, event: 'payment_released',
    data: { amount: `RM ${Number(payout.netPayout || 0).toFixed(2)}` },
  }).catch(() => {});
}

async function mapManyOut(items) {
  const emails = await emailsByIds(items.map((p) => p.partnerId));
  return items.map((p) => ({
    id: p.id,
    partner_id: p.partnerId,
    partner_email: emails[p.partnerId],
    partner_name: p.partnerName,
    gross_earning: p.grossEarning,
    commission_amount: p.commissionAmount,
    net_payout: p.netPayout,
    payout_method: p.payoutMethod,
    status: p.status,
    failure_reason: p.failureReason,
    scheduled_date: p.scheduledDate,
    created_date: p.createdAt,
  }));
}

// GET /api/payouts — admin: all (filterable); partner: own records only
router.get('/', asyncHandler(async (req, res) => {
  const where = {};
  if (isAdmin(req.user)) {
    if (req.query.partner_email) {
      const p = await findUserByEmail(req.query.partner_email);
      where.partnerId = p ? p.id : '__none__';
    }
  } else {
    where.partnerId = req.user.id;
  }
  if (req.query.status) where.status = String(req.query.status);
  const items = await prisma.payoutRecord.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(await mapManyOut(items));
}));

const createSchema = z.object({
  partner_email: z.string().email(),
  gross_earning: z.coerce.number().nonnegative(),
  commission_amount: z.coerce.number().nonnegative(),
  net_payout: z.coerce.number().nonnegative(),
  payout_method: z.string().max(50).default('Bank Transfer'),
  status: z.enum(['pending', 'scheduled', 'completed', 'failed']).default('pending'),
  scheduled_date: z.coerce.date().optional(),
});

// Payout creation/transitions are an admin/finance operation.
router.post('/', requireRole('admin', 'super_admin'), validate(createSchema), asyncHandler(async (req, res) => {
  const partner = await findUserByEmail(req.body.partner_email);
  if (!partner || partner.role !== 'partner') throw new ApiError(400, 'Partner not found');
  const item = await prisma.payoutRecord.create({
    data: {
      partnerId: partner.id,
      partnerName: partner.fullName,
      grossEarning: req.body.gross_earning,
      commissionAmount: req.body.commission_amount,
      netPayout: req.body.net_payout,
      payoutMethod: req.body.payout_method,
      status: req.body.status,
      scheduledDate: req.body.scheduled_date ?? null,
    },
  });
  // Keep the ledger truthful: an admin-created payout moves real money out of
  // the partner's wallet just as a self-service withdrawal does.
  await debitPayout(item);
  if (item.status === 'completed') notifyPayoutReleased(item);
  res.status(201).json((await mapManyOut([item]))[0]);
}));

const patchSchema = z.object({
  status: z.enum(['pending', 'scheduled', 'completed', 'failed']),
  failure_reason: z.string().max(500).nullish(),
  scheduled_date: z.coerce.date().nullish(),
});

router.patch('/:id', requireRole('admin', 'super_admin'), validate(patchSchema), asyncHandler(async (req, res) => {
  const existing = await prisma.payoutRecord.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, 'Payout not found');
  const data = { status: req.body.status };
  if (req.body.failure_reason !== undefined) data.failureReason = req.body.failure_reason;
  if (req.body.scheduled_date !== undefined) data.scheduledDate = req.body.scheduled_date;
  const item = await prisma.payoutRecord.update({ where: { id: req.params.id }, data });
  // Fire once, only on the transition into "completed".
  if (existing.status !== 'completed' && item.status === 'completed') notifyPayoutReleased(item);
  res.json((await mapManyOut([item]))[0]);
}));

// ─── Partner wallet ──────────────────────────────────────────────────────────
// Balances now come from the PartnerWallet ledger (server/lib/wallet/) rather
// than being re-summed from bookings on every request. The old computation could
// not represent an adjustment, a reversal, a damage deduction or cash commission
// at all — and it rounded each job's payout to whole ringgit
// (`Math.round(price * 0.8)`), silently losing sen on every completed booking.
//
// The response keys are deliberately unchanged: src/pages/PartnerEarnings.jsx and
// both Expo apps read them, and this is a data-source swap, not an API change.
async function computeWallet(partnerId) {
  const [wallet, payouts] = await Promise.all([
    getWallet(partnerId),
    prisma.payoutRecord.findMany({ where: { partnerId }, select: { netPayout: true, status: true } }),
  ]);
  const withdrawn = round2(payouts
    .filter((p) => ['pending', 'scheduled', 'processing', 'completed'].includes(p.status))
    .reduce((s, p) => s + (p.netPayout || 0), 0));
  const withdrawable = round2(Math.max(0, wallet.availableBalance));

  return {
    lifetime: round2(wallet.lifetimeEarnings),
    pending: round2(wallet.pendingBalance),
    withdrawn,
    withdrawable,
    balance: withdrawable,
    currency: wallet.currency || 'MYR',
    // Additive — the cash-commission side of the wallet, which the old shape
    // had no way to express.
    outstanding_commission: round2(wallet.outstandingCommission),
    payouts_suspended: wallet.payoutsSuspended,
    is_frozen: wallet.isFrozen,
  };
}

// GET /api/payouts/wallet — the caller-partner's computed wallet summary.
router.get('/wallet', asyncHandler(async (req, res) => {
  if (req.user.role !== 'partner' && !isAdmin(req.user)) throw new ApiError(403, 'Partners only');
  let partnerId = req.user.id;
  if (isAdmin(req.user) && req.query.partner_email) {
    const p = await findUserByEmail(req.query.partner_email);
    partnerId = p ? p.id : '__none__';
  }
  res.json(await computeWallet(partnerId));
}));

// POST /api/payouts/withdraw — partner requests a payout of available balance.
const withdrawSchema = z.object({ amount: z.coerce.number().positive() });
router.post('/withdraw', validate(withdrawSchema), asyncHandler(async (req, res) => {
  if (req.user.role !== 'partner') throw new ApiError(403, 'Only partners can withdraw');

  // Payouts are suspended while commission is badly overdue — see the
  // enforcement ladder in server/lib/wallet/freeze.js.
  const walletRow = await getWallet(req.user.id);
  if (walletRow.payoutsSuspended) {
    throw new ApiError(403, 'Payouts are on hold until your overdue commission is settled');
  }

  const wallet = await computeWallet(req.user.id);
  if (req.body.amount > wallet.withdrawable) {
    throw new ApiError(400, `Amount exceeds your withdrawable balance (RM${wallet.withdrawable})`);
  }
  const partner = await prisma.user.findUnique({ where: { id: req.user.id }, select: { fullName: true } });
  const item = await prisma.payoutRecord.create({
    data: {
      partnerId: req.user.id,
      partnerName: partner?.fullName || req.user.email,
      grossEarning: req.body.amount,
      commissionAmount: 0,
      netPayout: req.body.amount,
      payoutMethod: 'Bank Transfer',
      status: 'pending',
    },
  });
  // Move the money out of the wallet now the payout is committed, so a second
  // withdraw request can't spend the same balance twice.
  await debitPayout(item);
  res.status(201).json((await mapManyOut([item]))[0]);
}));

export default router;
