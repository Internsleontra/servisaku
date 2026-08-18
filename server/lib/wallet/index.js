// ─────────────────────────────────────────────────────────────────────────────
// Public surface of the partner wallet. Import from here:
//   import { creditEscrowHold, debitCommission, getWallet } from '../lib/wallet/index.js';
//
// Every function is a thin, named wrapper over ledger.post() — the point is that
// call sites read as business events ("this booking's commission is now owed")
// rather than as bucket arithmetic, and that each one carries a deterministic
// idempotency key so a retried webhook cannot double-move money.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';
import { post, reverse, recompute, getOrCreateWallet, BUCKETS } from './ledger.js';
import { split, round2 } from '../payments/commission.js';
import { evaluate } from './freeze.js';

export { post, reverse, recompute, getOrCreateWallet, BUCKETS };
export * from './freeze.js';

/** Wallet summary for a partner, creating the row on first access. */
export async function getWallet(partnerId) {
  return getOrCreateWallet(partnerId);
}

/**
 * Ensure the escrow hold for a booking exists, loading the booking itself.
 *
 * Safe to call repeatedly: `post()` keys the entry `escrow_hold:<bookingId>`
 * and that column is `@unique`, so a duplicate is returned rather than written.
 * That is what makes it callable from the "already paid" branch of settlement —
 * a hold lost on the first pass is recovered on any later redelivery instead of
 * being skipped forever.
 *
 * Returns the entry, or null when there is nothing to write:
 *   · no booking, or the customer has not actually paid
 *   · no partner assigned yet — there is nobody to hold the liability for. That
 *     case is a known lifecycle gap (docs/14-escrow-attribution-gap.md); it is
 *     deliberately NOT invented here.
 */
export async function ensureEscrowHold(bookingId, { db = prisma } = {}) {
  if (!bookingId) return null;
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { partner: true },
  });
  if (!booking) return null;
  if (!['paid', 'escrowed'].includes(booking.paymentStatus)) return null;
  if (!booking.partnerId) return null;
  return creditEscrowHold(booking, { partner: booking.partner });
}

/**
 * Funded bookings that have a partner but no escrow_hold entry.
 *
 * The reconciliation sweep behind the reliability fix: settlement now awaits the
 * hold and recovers it on redelivery, but anything already lost — or written by
 * a path that bypassed settlement entirely, as seed data does — is only visible
 * here. Read-only; the caller decides whether to repair.
 */
export async function findMissingEscrowHolds({ db = prisma } = {}) {
  const funded = await db.booking.findMany({
    where: { paymentStatus: { in: ['paid', 'escrowed'] }, partnerId: { not: null } },
    include: { partner: true, escrow: true },
  });
  const out = [];
  for (const booking of funded) {
    const existing = await db.walletLedgerEntry.findUnique({
      where: { idempotencyKey: `escrow_hold:${booking.id}` },
    });
    if (existing) continue;
    out.push({
      bookingId: booking.id,
      partnerId: booking.partnerId,
      expected: split(booking.price, { partner: booking.partner }).netPayout,
      escrowPayout: booking.escrow?.partnerPayout ?? null,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
    });
  }
  return out;
}

/**
 * A consumer paid online — the partner's share is earned but still in escrow.
 * Called from markPaidAndEscrow in server/routes/payments.js.
 */
export function creditEscrowHold(booking, { partner, rate } = {}) {
  const { netPayout } = split(booking.price, { partner, rate });
  if (netPayout <= 0 || !booking.partnerId) return Promise.resolve(null);
  return post({
    partnerId: booking.partnerId,
    type: 'escrow_hold',
    amount: netPayout,
    description: `Earnings held in escrow — ${booking.serviceType || 'service'}`,
    bookingId: booking.id,
    idempotencyKey: `escrow_hold:${booking.id}`,
  });
}

/**
 * Escrow released — move the partner's share from pending to available.
 * Two entries, not one: the money leaves `pending` and arrives in `available`,
 * and a single-entry shortcut would make the ledger unable to explain either.
 */
export async function creditEarning(booking, { partner, rate, netPayout: netPayoutOverride } = {}) {
  // `netPayout` override: pay exactly what the escrow row recorded.
  //
  // Without it this recomputes the split from the partner's CURRENT tier, so a
  // tier change between booking and release would pay a different figure than
  // the one held in escrow — the drift C-05 describes.
  //
  // BOTH release paths pass `escrow.partnerPayout`: the automatic worker and the
  // admin endpoint, which delegates to the same `releaseEscrow`. The override is
  // therefore the norm for escrow release; the computed fallback remains for
  // callers that have no escrow row to quote.
  const netPayout = netPayoutOverride != null
    ? round2(netPayoutOverride)
    : split(booking.price, { partner, rate }).netPayout;
  if (netPayout <= 0 || !booking.partnerId) return null;

  await post({
    partnerId: booking.partnerId,
    type: 'escrow_release',
    amount: netPayout,
    description: `Escrow released — ${booking.serviceType || 'service'}`,
    bookingId: booking.id,
    idempotencyKey: `escrow_release:${booking.id}`,
  });
  return post({
    partnerId: booking.partnerId,
    type: 'earning_credit',
    amount: netPayout,
    description: `Earnings available — ${booking.serviceType || 'service'}`,
    bookingId: booking.id,
    idempotencyKey: `earning:${booking.id}`,
  });
}

/**
 * A cash job completed. The partner holds the whole fare, so ServisAku's
 * commission becomes a debt they owe — this is the entry that makes cash work.
 */
export function debitCommission(booking, { partner, rate, paymentId } = {}) {
  const { commission } = split(booking.price, { partner, rate });
  if (commission <= 0 || !booking.partnerId) return Promise.resolve(null);
  return post({
    partnerId: booking.partnerId,
    type: 'commission_debit',
    amount: commission,
    description: `Commission owed on cash job — ${booking.serviceType || 'service'}`,
    bookingId: booking.id,
    paymentId,
    idempotencyKey: `commission:${booking.id}`,
  });
}

/** A settlement was paid — reduce the outstanding debt. */
export function creditSettlement(settlement, amount, { paymentId } = {}) {
  return post({
    partnerId: settlement.partnerId,
    type: 'settlement_credit',
    amount,
    description: `Commission settlement ${settlement.reference}`,
    settlementId: settlement.id,
    paymentId,
    // Keyed on the payment, not the settlement — a settlement can legitimately
    // be paid in several instalments.
    idempotencyKey: paymentId ? `settlement:${settlement.id}:${paymentId}` : undefined,
  });
}

/** A payout left the wallet. */
export function debitPayout(payout) {
  return post({
    partnerId: payout.partnerId,
    type: 'payout_debit',
    amount: payout.amountPaid,
    description: `Payout ${payout.reference || payout.id}`,
    payoutId: payout.id,
    idempotencyKey: `payout:${payout.id}`,
  });
}

/** Manual admin credit/debit. `reason` is mandatory upstream and lands here. */
export function adjust({ partnerId, amount, direction, bucket = 'available', reason, createdById, type = 'adjustment' }) {
  return post({
    partnerId,
    type,
    bucket,
    direction,
    amount,
    description: reason,
    createdById,
  });
}

// ─── Freeze state ────────────────────────────────────────────────────────────

/**
 * Apply (or lift) enforcement for a partner based on their unpaid settlements.
 * Returns { changed, wallet } so callers can fire a notification only on a real
 * transition rather than on every evaluation.
 */
export async function applyEnforcement(partnerId, now = new Date()) {
  const wallet = await getOrCreateWallet(partnerId);
  const settlements = await prisma.commissionSettlement.findMany({
    where: { partnerId, status: { in: ['pending', 'partially_paid', 'overdue'] } },
  });

  const verdict = evaluate(wallet, settlements, now);

  // An admin override is a deliberate human decision — never re-freeze over it.
  // Only the admin unfreeze path clears it.
  const overridden = settlements.some((s) => s.adminOverrideAt);
  const shouldFreeze = overridden ? false : verdict.shouldFreeze;
  const shouldSuspend = overridden ? false : verdict.shouldSuspendPayouts;

  if (wallet.isFrozen === shouldFreeze && wallet.payoutsSuspended === shouldSuspend) {
    return { changed: false, wallet, verdict };
  }

  const updated = await prisma.partnerWallet.update({
    where: { id: wallet.id },
    data: {
      isFrozen: shouldFreeze,
      payoutsSuspended: shouldSuspend,
      freezeReason: shouldFreeze ? verdict.reason : null,
      frozenAt: shouldFreeze ? (wallet.frozenAt || now) : null,
    },
  });
  return { changed: true, wallet: updated, verdict, wasFrozen: wallet.isFrozen };
}

/** Is this partner blocked from receiving new jobs? Used by dispatch. */
export async function isPartnerFrozen(partnerId) {
  const wallet = await prisma.partnerWallet.findUnique({
    where: { partnerId },
    select: { isFrozen: true },
  });
  return Boolean(wallet?.isFrozen);
}

/** Bulk variant for dispatch, which filters a list of candidates at once. */
export async function frozenPartnerIds(partnerIds) {
  if (!partnerIds?.length) return new Set();
  const rows = await prisma.partnerWallet.findMany({
    where: { partnerId: { in: partnerIds }, isFrozen: true },
    select: { partnerId: true },
  });
  return new Set(rows.map((r) => r.partnerId));
}

// ─── Output mapping ──────────────────────────────────────────────────────────
// snake_case, matching every other route in server/routes/.
export function mapWalletOut(w) {
  return {
    id: w.id,
    partner_id: w.partnerId,
    available_balance: round2(w.availableBalance),
    pending_balance: round2(w.pendingBalance),
    outstanding_commission: round2(w.outstandingCommission),
    lifetime_earnings: round2(w.lifetimeEarnings),
    lifetime_commission: round2(w.lifetimeCommission),
    credit_limit: w.creditLimit,
    settlement_cycle: w.settlementCycle,
    next_settlement_date: w.nextSettlementDate,
    is_frozen: w.isFrozen,
    payouts_suspended: w.payoutsSuspended,
    freeze_reason: w.freezeReason,
    frozen_at: w.frozenAt,
    currency: w.currency,
    created_date: w.createdAt,
  };
}

export function mapEntryOut(e) {
  return {
    id: e.id,
    type: e.type,
    direction: e.direction,
    bucket: e.bucket,
    amount: e.amount,
    balance_after: e.balanceAfter,
    description: e.description,
    booking_id: e.bookingId,
    payment_id: e.paymentId,
    payout_id: e.payoutId,
    settlement_id: e.settlementId,
    claim_id: e.claimId,
    reversal_of: e.reversalOf,
    created_date: e.createdAt,
  };
}

export function mapSettlementOut(s) {
  return {
    id: s.id,
    reference: s.reference,
    partner_id: s.partnerId,
    cycle: s.cycle,
    period_start: s.periodStart,
    period_end: s.periodEnd,
    gross_cash_collected: s.grossCashCollected,
    commission_due: s.commissionDue,
    sst_on_commission: s.sstOnCommission,
    total_due: s.totalDue,
    amount_paid: s.amountPaid,
    balance_due: round2(s.totalDue - s.amountPaid),
    status: s.status,
    due_date: s.dueDate,
    paid_at: s.paidAt,
    payment_id: s.paymentId,
    booking_ids: s.bookingIds ?? null,
    reminders_sent: s.remindersSent,
    admin_override_reason: s.adminOverrideReason,
    admin_override_at: s.adminOverrideAt,
    created_date: s.createdAt,
  };
}
