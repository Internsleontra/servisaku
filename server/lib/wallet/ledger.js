// ─────────────────────────────────────────────────────────────────────────────
// Wallet ledger — the ONLY place a PartnerWallet balance is allowed to change.
//
// Invariants this module enforces so callers don't have to:
//   1. Every entry is written inside a transaction together with the wallet
//      balance update, so a balance can never drift from its entries.
//   2. `balanceAfter` is read inside that transaction, never from a stale value
//      fetched earlier by the caller.
//   3. `idempotencyKey` collisions resolve to success, returning the existing
//      entry. A redelivered gateway webhook must never credit twice.
//   4. Nothing is ever updated or deleted. Corrections are `reversal` entries
//      that point at what they undo.
//
// Buckets map to the three balances on PartnerWallet:
//   pending      earned but still held in escrow
//   available    released, withdrawable
//   outstanding  commission the partner owes ServisAku (cash jobs)
// ─────────────────────────────────────────────────────────────────────────────
import { prisma as defaultPrisma } from '../../db.js';
import { round2 } from '../payments/commission.js';

export const BUCKETS = ['available', 'pending', 'outstanding'];

const BUCKET_FIELD = {
  available: 'availableBalance',
  pending: 'pendingBalance',
  outstanding: 'outstandingCommission',
};

// Entry type → which bucket it moves and in which direction. Keeping this as
// data rather than branching at each call site means a new entry type is one
// line here, and an unknown type fails loudly instead of silently no-op'ing.
export const ENTRY_TYPES = {
  earning_credit: { bucket: 'available', direction: 'credit' },
  escrow_hold: { bucket: 'pending', direction: 'credit' },
  escrow_release: { bucket: 'pending', direction: 'debit' },
  commission_debit: { bucket: 'outstanding', direction: 'credit' }, // debt goes UP
  settlement_credit: { bucket: 'outstanding', direction: 'debit' }, // debt goes DOWN
  payout_debit: { bucket: 'available', direction: 'debit' },
  refund_debit: { bucket: 'available', direction: 'debit' },
  damage_deduction: { bucket: 'available', direction: 'debit' },
  penalty: { bucket: 'available', direction: 'debit' },
  bonus: { bucket: 'available', direction: 'credit' },
  opening_balance: { bucket: 'available', direction: 'credit' },
  // `adjustment` and `reversal` carry an explicit bucket/direction from the caller.
  adjustment: null,
  reversal: null,
};

/** Get (or lazily create) a partner's wallet. */
export async function getOrCreateWallet(partnerId, client = defaultPrisma) {
  const existing = await client.partnerWallet.findUnique({ where: { partnerId } });
  if (existing) return existing;
  try {
    return await client.partnerWallet.create({ data: { partnerId } });
  } catch {
    // Lost a create race — read the row the other writer made. Same pattern as
    // getOrCreatePreference in notifications/dispatcher.js.
    return client.partnerWallet.findUnique({ where: { partnerId } });
  }
}

/**
 * Post a ledger entry and move the corresponding balance, atomically.
 *
 * @param {object}  params
 * @param {string}  params.partnerId
 * @param {string}  params.type            key of ENTRY_TYPES
 * @param {number}  params.amount          MYR, positive
 * @param {string}  params.description
 * @param {string}  [params.bucket]        required for adjustment/reversal
 * @param {string}  [params.direction]     required for adjustment/reversal
 * @param {string}  [params.idempotencyKey]
 * @param {string}  [params.bookingId] [params.paymentId] [params.payoutId]
 * @param {string}  [params.settlementId] [params.claimId] [params.reversalOf]
 * @param {string}  [params.createdById]
 * @param {object}  [params.metadata]
 * @returns {Promise<object>} the created (or pre-existing) WalletLedgerEntry
 */
export async function post(params) {
  const {
    partnerId, type, description, idempotencyKey,
    bookingId, paymentId, payoutId, settlementId, claimId, reversalOf,
    createdById, metadata,
  } = params;

  if (!partnerId) throw new Error('ledger.post: partnerId is required');
  if (!(type in ENTRY_TYPES)) throw new Error(`ledger.post: unknown entry type "${type}"`);

  const amount = round2(params.amount);
  if (!(amount > 0)) throw new Error('ledger.post: amount must be positive');

  const spec = ENTRY_TYPES[type];
  const bucket = spec?.bucket ?? params.bucket;
  const direction = spec?.direction ?? params.direction;
  if (!BUCKETS.includes(bucket)) throw new Error(`ledger.post: invalid bucket "${bucket}"`);
  if (!['credit', 'debit'].includes(direction)) throw new Error(`ledger.post: invalid direction "${direction}"`);

  // Fast path: a duplicate key means this exact movement already happened.
  // Checked before the transaction to avoid the write, and again via the unique
  // constraint inside it to close the race.
  if (idempotencyKey) {
    const existing = await defaultPrisma.walletLedgerEntry.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }

  const wallet = await getOrCreateWallet(partnerId);
  const field = BUCKET_FIELD[bucket];
  const delta = direction === 'credit' ? amount : -amount;

  try {
    return await defaultPrisma.$transaction(async (tx) => {
      // Re-read inside the transaction: the balance may have moved since
      // getOrCreateWallet above, and `balanceAfter` has to be truthful.
      const current = await tx.partnerWallet.findUnique({ where: { id: wallet.id } });
      const balanceAfter = round2((current[field] || 0) + delta);

      const updates = { [field]: balanceAfter };
      // Lifetime totals are running counters, not balances — they only ever grow.
      if (type === 'earning_credit' || type === 'opening_balance') {
        updates.lifetimeEarnings = round2((current.lifetimeEarnings || 0) + amount);
      }
      if (type === 'commission_debit') {
        updates.lifetimeCommission = round2((current.lifetimeCommission || 0) + amount);
      }

      await tx.partnerWallet.update({ where: { id: wallet.id }, data: updates });

      return tx.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          partnerId,
          type,
          direction,
          bucket,
          amount,
          balanceAfter,
          description,
          bookingId: bookingId ?? null,
          paymentId: paymentId ?? null,
          payoutId: payoutId ?? null,
          settlementId: settlementId ?? null,
          claimId: claimId ?? null,
          reversalOf: reversalOf ?? null,
          createdById: createdById ?? null,
          idempotencyKey: idempotencyKey ?? null,
          metadata: metadata ?? undefined,
        },
      });
    });
  } catch (err) {
    // P2002 on idempotencyKey — another request won the race. Its entry is the
    // canonical one; returning it makes post() safely retryable.
    if (err?.code === 'P2002' && idempotencyKey) {
      const existing = await defaultPrisma.walletLedgerEntry.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Reverse an existing entry — the only sanctioned way to undo one. Writes a new
 * entry in the opposite direction on the same bucket; the original is untouched.
 */
export async function reverse(entryId, { reason, createdById } = {}) {
  const original = await defaultPrisma.walletLedgerEntry.findUnique({ where: { id: entryId } });
  if (!original) throw new Error(`ledger.reverse: entry ${entryId} not found`);

  const already = await defaultPrisma.walletLedgerEntry.findFirst({ where: { reversalOf: entryId } });
  if (already) return already; // idempotent

  return post({
    partnerId: original.partnerId,
    type: 'reversal',
    bucket: original.bucket,
    direction: original.direction === 'credit' ? 'debit' : 'credit',
    amount: original.amount,
    description: reason || `Reversal of ${original.type}`,
    bookingId: original.bookingId,
    paymentId: original.paymentId,
    payoutId: original.payoutId,
    settlementId: original.settlementId,
    claimId: original.claimId,
    reversalOf: entryId,
    createdById,
    idempotencyKey: `reversal:${entryId}`,
  });
}

/**
 * Recompute a wallet's balances from its entries. Used by the reconciliation
 * check — if this disagrees with the materialised balances, something wrote
 * around this module and that is a bug worth failing on.
 */
export async function recompute(partnerId) {
  const entries = await defaultPrisma.walletLedgerEntry.findMany({
    where: { partnerId },
    orderBy: { createdAt: 'asc' },
  });
  const totals = { available: 0, pending: 0, outstanding: 0 };
  for (const e of entries) {
    totals[e.bucket] += e.direction === 'credit' ? e.amount : -e.amount;
  }
  return {
    availableBalance: round2(totals.available),
    pendingBalance: round2(totals.pending),
    outstandingCommission: round2(totals.outstanding),
    entryCount: entries.length,
  };
}
