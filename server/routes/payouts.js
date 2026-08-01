import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isAdmin, findUserByEmail, emailsByIds } from '../lib/access.js';
import { getWallet, debitPayout } from '../lib/wallet/index.js';
import { round2 } from '../lib/payments/commission.js';
import {
  generateBatch, approveBatch, processBatch, retryPayout, MINIMUM_PAYOUT,
} from '../lib/payouts/batch.js';
import { toCsv, toBankFile, partnerStatement } from '../lib/payouts/export.js';
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

// ─── Payout dashboard ────────────────────────────────────────────────────────

// GET /api/payouts/dashboard — everything the partner earnings screen needs in
// one round trip: balances, next payout date, recent payouts, a weekly series.
router.get('/dashboard', asyncHandler(async (req, res) => {
  if (req.user.role !== 'partner' && !isAdmin(req.user)) throw new ApiError(403, 'Partners only');
  let partnerId = req.user.id;
  if (isAdmin(req.user) && req.query.partner_id) partnerId = String(req.query.partner_id);

  const [wallet, walletRow, payouts, bank, nextBatch] = await Promise.all([
    computeWallet(partnerId),
    getWallet(partnerId),
    prisma.payoutRecord.findMany({ where: { partnerId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.partnerBankAccount.findUnique({ where: { partnerId } }),
    prisma.payoutBatch.findFirst({ where: { status: { in: ['draft', 'approved'] } }, orderBy: { periodEnd: 'asc' } }),
  ]);

  // Last 8 weeks of completed payouts, for the trend chart.
  const eightWeeksAgo = new Date(Date.now() - 56 * 86400000);
  const recent = await prisma.payoutRecord.findMany({
    where: { partnerId, status: 'completed', paidAt: { gte: eightWeeksAgo } },
    select: { netPayout: true, paidAt: true },
  });
  const series = {};
  for (const p of recent) {
    const key = p.paidAt.toISOString().slice(0, 10);
    series[key] = round2((series[key] || 0) + p.netPayout);
  }

  res.json({
    ...wallet,
    minimum_payout: MINIMUM_PAYOUT,
    next_payout_date: nextBatch?.periodEnd ?? walletRow.nextSettlementDate ?? null,
    bank_account: bank ? mapBankOut(bank) : null,
    // The single most common support question is "why haven't I been paid" —
    // answer it in the payload rather than making them ask.
    payout_blocked_reason: payoutBlockedReason(wallet, walletRow, bank),
    recent_payouts: await mapManyOut(payouts),
    series: Object.entries(series).map(([date, amount]) => ({ date, amount })),
  });
}));

function payoutBlockedReason(wallet, walletRow, bank) {
  if (walletRow.payoutsSuspended) return 'Payouts are on hold until your overdue commission is settled';
  if (!bank) return 'Add your bank details to receive payouts';
  if (!bank.isVerified) return 'Your bank details are awaiting verification';
  if (wallet.withdrawable < MINIMUM_PAYOUT) {
    return `Minimum payout is RM${MINIMUM_PAYOUT.toFixed(2)} — you have RM${wallet.withdrawable.toFixed(2)}`;
  }
  return null;
}

// GET /api/payouts/export?from=&to= — the partner's own statement as CSV.
router.get('/export', asyncHandler(async (req, res) => {
  let partnerId = req.user.id;
  if (isAdmin(req.user) && req.query.partner_id) partnerId = String(req.query.partner_id);
  else if (req.user.role !== 'partner' && !isAdmin(req.user)) throw new ApiError(403, 'Partners only');

  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 90 * 86400000);
  const csv = toCsv(await partnerStatement(partnerId, from, to));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="earnings-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

// ─── Bank details ────────────────────────────────────────────────────────────

function mapBankOut(b, { masked = true } = {}) {
  const acc = b.accountNumber || '';
  return {
    id: b.id,
    bank_name: b.bankName,
    bank_code: b.bankCode,
    // Masked by default — the full number is PII and is only needed by the
    // transfer file, never by a list view.
    account_number: masked ? `••••${acc.slice(-4)}` : acc,
    account_name: b.accountName,
    account_type: b.accountType,
    is_verified: b.isVerified,
    verified_at: b.verifiedAt,
    rejection_reason: b.rejectionReason,
    updated_at: b.updatedAt,
  };
}

router.get('/bank-account', asyncHandler(async (req, res) => {
  const bank = await prisma.partnerBankAccount.findUnique({ where: { partnerId: req.user.id } });
  res.json(bank ? mapBankOut(bank) : null);
}));

const bankSchema = z.object({
  bank_name: z.string().min(2).max(100),
  bank_code: z.string().max(20).nullish(),
  account_number: z.string().min(5).max(30).regex(/^\d+$/, 'Account number must be digits only'),
  account_name: z.string().min(2).max(100),
  account_type: z.enum(['savings', 'current']).default('savings'),
});
router.put('/bank-account', validate(bankSchema), asyncHandler(async (req, res) => {
  if (req.user.role !== 'partner') throw new ApiError(403, 'Partners only');
  const data = {
    bankName: req.body.bank_name,
    bankCode: req.body.bank_code ?? null,
    accountNumber: req.body.account_number,
    accountName: req.body.account_name,
    accountType: req.body.account_type,
    // Any edit resets verification. Otherwise changing the account number after
    // approval would route money to an unverified destination.
    isVerified: false,
    verifiedAt: null,
    verifiedById: null,
    rejectionReason: null,
  };
  const bank = await prisma.partnerBankAccount.upsert({
    where: { partnerId: req.user.id },
    create: { partnerId: req.user.id, ...data },
    update: data,
  });
  res.json(mapBankOut(bank));
}));

// Admin verification of a partner's bank details.
const verifySchema = z.object({
  approve: z.boolean(),
  rejection_reason: z.string().max(500).nullish(),
});
router.post('/bank-account/:partnerId/verify', requireRole('admin', 'super_admin'), validate(verifySchema), asyncHandler(async (req, res) => {
  const bank = await prisma.partnerBankAccount.findUnique({ where: { partnerId: req.params.partnerId } });
  if (!bank) throw new ApiError(404, 'No bank details on file for this partner');
  if (!req.body.approve && !req.body.rejection_reason) {
    throw new ApiError(400, 'A rejection reason is required so the partner knows what to fix');
  }
  const updated = await prisma.partnerBankAccount.update({
    where: { partnerId: req.params.partnerId },
    data: req.body.approve
      ? { isVerified: true, verifiedAt: new Date(), verifiedById: req.user.id, rejectionReason: null }
      : { isVerified: false, verifiedAt: null, rejectionReason: req.body.rejection_reason },
  });
  notify({
    userId: req.params.partnerId,
    event: req.body.approve ? 'bank_details_verified' : 'bank_details_rejected',
    data: { reason: req.body.rejection_reason },
  }).catch(() => {});
  res.json(mapBankOut(updated));
}));

// ─── Batches (admin) ─────────────────────────────────────────────────────────

function mapBatchOut(b) {
  return {
    id: b.id,
    reference: b.reference,
    cycle: b.cycle,
    period_start: b.periodStart,
    period_end: b.periodEnd,
    status: b.status,
    partner_count: b.partnerCount,
    total_gross: b.totalGross,
    total_commission: b.totalCommission,
    total_net: b.totalNet,
    approved_by_id: b.approvedById,
    approved_at: b.approvedAt,
    processed_at: b.processedAt,
    notes: b.notes,
    created_date: b.createdAt,
  };
}

router.get('/batches', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = String(req.query.status);
  const items = await prisma.payoutBatch.findMany({ where, orderBy: { periodEnd: 'desc' }, take: 100 });
  res.json(items.map(mapBatchOut));
}));

const genSchema = z.object({ cycle: z.enum(['weekly', 'monthly', 'manual']).default('weekly') });
router.post('/batches', requireRole('admin', 'super_admin'), validate(genSchema), asyncHandler(async (req, res) => {
  const { batch, created, excluded } = await generateBatch(req.body.cycle);
  if (!batch) return res.status(200).json({ batch: null, created: false, excluded, message: 'No eligible partners for this period' });
  res.status(created ? 201 : 200).json({ batch: mapBatchOut(batch), created, excluded });
}));

router.get('/batches/:id', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const batch = await prisma.payoutBatch.findUnique({ where: { id: req.params.id }, include: { payouts: true } });
  if (!batch) throw new ApiError(404, 'Batch not found');
  res.json({ ...mapBatchOut(batch), payouts: await mapManyOut(batch.payouts) });
}));

router.post('/batches/:id/approve', requireRole('super_admin'), asyncHandler(async (req, res) => {
  try {
    res.json(mapBatchOut(await approveBatch(req.params.id, req.user.id)));
  } catch (err) { throw new ApiError(400, err.message); }
}));

router.post('/batches/:id/process', requireRole('super_admin'), asyncHandler(async (req, res) => {
  try {
    const result = await processBatch(req.params.id);
    // Notify each partner whose money actually moved.
    const paid = await prisma.payoutRecord.findMany({ where: { batchId: req.params.id, status: 'completed' } });
    for (const p of paid) notifyPayoutReleased(p);
    res.json({ ...result, batch: mapBatchOut(result.batch) });
  } catch (err) { throw new ApiError(400, err.message); }
}));

router.get('/batches/:id/export', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const rows = await toBankFile(req.params.id);
  const batch = await prisma.payoutBatch.findUnique({ where: { id: req.params.id } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${batch?.reference || 'payout-batch'}.csv"`);
  res.send(toCsv(rows));
}));

router.post('/:id/retry', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  try {
    const item = await retryPayout(req.params.id);
    notifyPayoutReleased(item);
    res.json((await mapManyOut([item]))[0]);
  } catch (err) { throw new ApiError(400, err.message); }
}));

export default router;
