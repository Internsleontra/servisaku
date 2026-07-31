import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isAdmin, emailsByIds } from '../lib/access.js';
import {
  getWallet, adjust, applyEnforcement, recompute,
  mapWalletOut, mapEntryOut, mapSettlementOut,
} from '../lib/wallet/index.js';
import { applyPayment } from '../lib/wallet/settlement.js';
import { providerForMethod, toSen } from '../lib/payments/index.js';
import { round2 } from '../lib/payments/commission.js';
import { notify } from '../lib/notifications/index.js';

const router = Router();
router.use(authenticate);

const APP_URL = (process.env.APP_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const PUBLIC_URL = (process.env.APP_PUBLIC_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

// Wallets belong to partners. Admins may inspect one by passing ?partner_id=.
function targetPartnerId(req) {
  if (isAdmin(req.user) && req.query.partner_id) return String(req.query.partner_id);
  if (req.user.role !== 'partner' && !isAdmin(req.user)) throw new ApiError(403, 'Partners only');
  return req.user.id;
}

// GET /api/wallet — balances + freeze state for the caller (or ?partner_id= for admin)
router.get('/', asyncHandler(async (req, res) => {
  const wallet = await getWallet(targetPartnerId(req));
  res.json(mapWalletOut(wallet));
}));

// GET /api/wallet/ledger — paginated entries. ?type=&from=&to=&limit=&offset=
router.get('/ledger', asyncHandler(async (req, res) => {
  const partnerId = targetPartnerId(req);
  const where = { partnerId };
  if (req.query.type) where.type = String(req.query.type);
  if (req.query.bucket) where.bucket = String(req.query.bucket);
  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
    if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const [items, total] = await Promise.all([
    prisma.walletLedgerEntry.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    prisma.walletLedgerEntry.count({ where }),
  ]);
  res.json({ items: items.map(mapEntryOut), total, limit, offset });
}));

// GET /api/wallet/settlements
router.get('/settlements', asyncHandler(async (req, res) => {
  const partnerId = targetPartnerId(req);
  const where = { partnerId };
  if (req.query.status) where.status = String(req.query.status);
  const items = await prisma.commissionSettlement.findMany({ where, orderBy: { periodEnd: 'desc' } });
  res.json(items.map(mapSettlementOut));
}));

// A settlement is readable by its owner and by admins — nobody else.
async function getSettlementFor(req, id) {
  const settlement = await prisma.commissionSettlement.findUnique({ where: { id } });
  if (!settlement) throw new ApiError(404, 'Settlement not found');
  if (!isAdmin(req.user) && settlement.partnerId !== req.user.id) throw new ApiError(403, 'Forbidden');
  return settlement;
}

router.get('/settlements/:id', asyncHandler(async (req, res) => {
  const settlement = await getSettlementFor(req, req.params.id);
  res.json(mapSettlementOut(settlement));
}));

// POST /api/wallet/settlements/:id/pay — start a gateway checkout for the balance.
// The partner is the payer here, not a consumer, so the Payment row carries
// type='commission_settlement' and partnerId.
const paySchema = z.object({ method: z.enum(['fpx', 'duitnow', 'card', 'applepay', 'googlepay']).default('fpx') });
router.post('/settlements/:id/pay', validate(paySchema), asyncHandler(async (req, res) => {
  const settlement = await getSettlementFor(req, req.params.id);
  if (settlement.partnerId !== req.user.id) throw new ApiError(403, 'You can only settle your own commission');
  if (settlement.status === 'paid') throw new ApiError(409, 'This settlement is already paid');
  if (['waived', 'written_off'].includes(settlement.status)) throw new ApiError(409, 'This settlement is closed');

  const balanceDue = round2(settlement.totalDue - settlement.amountPaid);
  if (balanceDue <= 0) throw new ApiError(409, 'Nothing left to pay on this settlement');

  const provider = providerForMethod(req.body.method);
  if (!provider) throw new ApiError(503, `No payment provider is configured for "${req.body.method}"`);

  const partner = await prisma.user.findUnique({ where: { id: settlement.partnerId } });
  const amountSen = toSen(balanceDue);

  // A settlement payment is not tied to a booking, but Payment.bookingId is
  // required. Anchor it to the first booking in the settlement so the row still
  // joins to something real; `type` is what distinguishes it.
  const anchorBookingId = Array.isArray(settlement.bookingIds) ? settlement.bookingIds[0] : null;
  if (!anchorBookingId) throw new ApiError(500, 'Settlement has no associated bookings');

  const payment = await prisma.payment.create({
    data: {
      bookingId: anchorBookingId,
      amount: amountSen,
      amountMyr: balanceDue,
      currency: 'MYR',
      method: req.body.method,
      provider: provider.name,
      status: 'pending',
      type: 'commission_settlement',
      partnerId: settlement.partnerId,
      settlementId: settlement.id,
    },
  });

  let checkout;
  try {
    checkout = await provider.createCheckout({
      amountSen,
      method: req.body.method,
      description: `ServisAku commission settlement ${settlement.reference}`,
      customer: { name: partner?.fullName, email: partner?.email, phone: partner?.phone },
      callbackUrl: `${PUBLIC_URL}/api/payments/webhook/${provider.name}`,
      redirectUrl: `${APP_URL}/payment/return?payment_id=${payment.id}`,
      reference: payment.id,
    });
  } catch (err) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed', raw: { error: String(err.message) } } });
    throw new ApiError(502, `Gateway error: ${err.message}`);
  }

  const saved = await prisma.payment.update({
    where: { id: payment.id },
    data: { gatewayRef: checkout.ref, checkoutUrl: checkout.url, raw: checkout.raw },
  });

  res.status(201).json({
    id: saved.id,
    settlement_id: settlement.id,
    amount: balanceDue,
    method: saved.method,
    provider: saved.provider,
    status: saved.status,
    checkout_url: saved.checkoutUrl,
    client_secret: checkout.clientSecret ?? null,
  });
}));

// POST /api/wallet/settlements/:id/pay-from-balance
// Explicit opt-in netting. ServisAku does NOT seize a partner's online earnings
// to clear cash commission automatically — that is the partner's money and
// auto-netting it is a decision with legal weight. This endpoint exists so the
// partner can choose it.
const netSchema = z.object({ amount: z.coerce.number().positive().optional() });
router.post('/settlements/:id/pay-from-balance', validate(netSchema), asyncHandler(async (req, res) => {
  const settlement = await getSettlementFor(req, req.params.id);
  if (settlement.partnerId !== req.user.id) throw new ApiError(403, 'You can only settle your own commission');
  if (settlement.status === 'paid') throw new ApiError(409, 'This settlement is already paid');

  const wallet = await getWallet(settlement.partnerId);
  const balanceDue = round2(settlement.totalDue - settlement.amountPaid);
  const requested = round2(req.body.amount ?? balanceDue);
  if (requested > balanceDue) throw new ApiError(400, `Amount exceeds the balance due (RM ${balanceDue.toFixed(2)})`);
  if (requested > wallet.availableBalance) {
    throw new ApiError(400, `Amount exceeds your available balance (RM ${round2(wallet.availableBalance).toFixed(2)})`);
  }

  // Two movements: money leaves `available`, debt leaves `outstanding`.
  await adjust({
    partnerId: settlement.partnerId,
    amount: requested,
    direction: 'debit',
    bucket: 'available',
    reason: `Settled commission ${settlement.reference} from wallet balance`,
    createdById: req.user.id,
  });
  const updated = await applyPayment(settlement.id, requested, { createdById: req.user.id });

  res.json(mapSettlementOut(updated));
}));

// ─── Admin ───────────────────────────────────────────────────────────────────

// GET /api/wallet/admin/outstanding — the commission report.
router.get('/admin/outstanding', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const wallets = await prisma.partnerWallet.findMany({
    where: { outstandingCommission: { gt: 0 } },
    orderBy: { outstandingCommission: 'desc' },
    take: Math.min(Number(req.query.limit) || 200, 500),
  });
  const partnerIds = wallets.map((w) => w.partnerId);
  const [emails, partners, settlements] = await Promise.all([
    emailsByIds(partnerIds),
    prisma.user.findMany({ where: { id: { in: partnerIds } }, select: { id: true, fullName: true } }),
    prisma.commissionSettlement.findMany({
      where: { partnerId: { in: partnerIds }, status: { in: ['pending', 'partially_paid', 'overdue'] } },
      orderBy: { dueDate: 'asc' },
    }),
  ]);
  const nameById = Object.fromEntries(partners.map((p) => [p.id, p.fullName]));
  const oldestDue = {};
  for (const s of settlements) {
    if (!oldestDue[s.partnerId]) oldestDue[s.partnerId] = s.dueDate;
  }

  res.json(wallets.map((w) => ({
    ...mapWalletOut(w),
    partner_email: emails[w.partnerId] ?? null,
    partner_name: nameById[w.partnerId] ?? null,
    oldest_due_date: oldestDue[w.partnerId] ?? null,
    days_overdue: oldestDue[w.partnerId]
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestDue[w.partnerId]).getTime()) / 86400000))
      : 0,
  })));
}));

// POST /api/wallet/admin/:partnerId/override — unfreeze / waive / extend.
// A reason is mandatory: every override is a human decision overriding an
// automated financial control, and the ledger has to say who and why.
const overrideSchema = z.object({
  action: z.enum(['unfreeze', 'waive_settlement', 'extend_due_date', 'write_off']),
  settlement_id: z.string().optional(),
  due_date: z.coerce.date().optional(),
  reason: z.string().min(10).max(500),
});
router.post('/admin/:partnerId/override', requireRole('admin', 'super_admin'), validate(overrideSchema), asyncHandler(async (req, res) => {
  const { action, settlement_id: settlementId, due_date: dueDate, reason } = req.body;
  const partnerId = req.params.partnerId;
  const wallet = await getWallet(partnerId);

  const stamp = { adminOverrideById: req.user.id, adminOverrideReason: reason, adminOverrideAt: new Date() };

  if (action === 'unfreeze') {
    // Stamp the open settlements so applyEnforcement won't immediately re-freeze.
    await prisma.commissionSettlement.updateMany({
      where: { partnerId, status: { in: ['pending', 'partially_paid', 'overdue'] } },
      data: stamp,
    });
    const updated = await prisma.partnerWallet.update({
      where: { id: wallet.id },
      data: { isFrozen: false, payoutsSuspended: false, freezeReason: null, frozenAt: null },
    });
    notify({ userId: partnerId, event: 'account_unfrozen' }).catch(() => {});
    return res.json(mapWalletOut(updated));
  }

  if (!settlementId) throw new ApiError(400, 'settlement_id is required for this action');
  const settlement = await prisma.commissionSettlement.findUnique({ where: { id: settlementId } });
  if (!settlement || settlement.partnerId !== partnerId) throw new ApiError(404, 'Settlement not found for this partner');

  if (action === 'extend_due_date') {
    if (!dueDate) throw new ApiError(400, 'due_date is required to extend');
    const updated = await prisma.commissionSettlement.update({
      where: { id: settlementId },
      data: { dueDate, status: 'pending', remindersSent: 0, ...stamp },
    });
    await applyEnforcement(partnerId);
    return res.json(mapSettlementOut(updated));
  }

  // waive_settlement / write_off — the debt is cleared, so the outstanding
  // balance must move too, or the wallet would keep showing money that is no
  // longer owed.
  const remaining = round2(settlement.totalDue - settlement.amountPaid);
  if (remaining > 0) {
    await adjust({
      partnerId,
      amount: remaining,
      direction: 'debit',
      bucket: 'outstanding',
      reason: `${action === 'waive_settlement' ? 'Waived' : 'Written off'}: ${reason}`,
      createdById: req.user.id,
    });
  }
  const updated = await prisma.commissionSettlement.update({
    where: { id: settlementId },
    data: { status: action === 'waive_settlement' ? 'waived' : 'written_off', ...stamp },
  });
  await applyEnforcement(partnerId);
  res.json(mapSettlementOut(updated));
}));

// POST /api/wallet/admin/:partnerId/adjust — manual credit/debit.
const adjustSchema = z.object({
  amount: z.coerce.number().positive(),
  direction: z.enum(['credit', 'debit']),
  bucket: z.enum(['available', 'pending', 'outstanding']).default('available'),
  type: z.enum(['adjustment', 'penalty', 'bonus']).default('adjustment'),
  reason: z.string().min(10).max(500),
});
router.post('/admin/:partnerId/adjust', requireRole('admin', 'super_admin'), validate(adjustSchema), asyncHandler(async (req, res) => {
  const entry = await adjust({
    partnerId: req.params.partnerId,
    amount: req.body.amount,
    direction: req.body.direction,
    bucket: req.body.bucket,
    type: req.body.type,
    reason: req.body.reason,
    createdById: req.user.id,
  });
  res.status(201).json(mapEntryOut(entry));
}));

// GET /api/wallet/admin/:partnerId/reconcile — does the materialised balance
// still match the sum of the entries? A mismatch means something wrote around
// the ledger and is worth alerting on.
router.get('/admin/:partnerId/reconcile', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const wallet = await getWallet(req.params.partnerId);
  const computed = await recompute(req.params.partnerId);
  const matches = round2(wallet.availableBalance) === computed.availableBalance
    && round2(wallet.pendingBalance) === computed.pendingBalance
    && round2(wallet.outstandingCommission) === computed.outstandingCommission;
  res.json({ partner_id: req.params.partnerId, matches, stored: mapWalletOut(wallet), computed });
}));

export default router;
