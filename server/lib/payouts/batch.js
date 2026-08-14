// ─────────────────────────────────────────────────────────────────────────────
// Payout batch generation.
//
// Payouts move money OUT to partners; commission settlements move money IN from
// them (server/lib/wallet/settlement.js). They share PartnerWallet and must
// never be confused — this file only ever debits `available`.
//
// A run is: select eligible partners → draft batch → human approval → process.
// Approval is deliberately a separate step. Nothing disburses automatically.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';
import { round2 } from '../payments/commission.js';
import { debitPayout } from '../wallet/index.js';
import { previousPeriod } from '../wallet/settlement.js';

/** Below this, a payout costs more in transfer fees than it is worth. */
export const MINIMUM_PAYOUT = Number(process.env.MINIMUM_PAYOUT_MYR || 50);

/** Why a partner was left out of a run — surfaced so it can be explained. */
export const EXCLUSION = {
  BELOW_MINIMUM: 'below_minimum',
  NO_BANK_ACCOUNT: 'no_bank_account',
  BANK_UNVERIFIED: 'bank_unverified',
  PAYOUTS_SUSPENDED: 'payouts_suspended',
};

const shortId = (id) => String(id).slice(-6).toUpperCase();

export const batchReference = (cycle, label) => `PB-${label}${cycle === 'manual' ? '-M' : ''}`;
export const payoutReference = (partnerId, label) => `PO-${label}-${shortId(partnerId)}`;

/**
 * Decide who gets paid in a run, and why the rest do not.
 *
 * Returns eligible partners with their amounts plus an itemised exclusion list —
 * a partner who expected money and got none deserves a reason, and support
 * needs one too.
 */
export async function selectEligible() {
  const wallets = await prisma.partnerWallet.findMany({
    where: { availableBalance: { gt: 0 } },
    orderBy: { availableBalance: 'desc' },
  });
  if (wallets.length === 0) return { eligible: [], excluded: [] };

  const partnerIds = wallets.map((w) => w.partnerId);
  const [partners, banks] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: partnerIds } }, select: { id: true, fullName: true, email: true } }),
    prisma.partnerBankAccount.findMany({ where: { partnerId: { in: partnerIds } } }),
  ]);
  const partnerById = Object.fromEntries(partners.map((p) => [p.id, p]));
  const bankByPartner = Object.fromEntries(banks.map((b) => [b.partnerId, b]));

  const eligible = [];
  const excluded = [];

  for (const wallet of wallets) {
    const partner = partnerById[wallet.partnerId];
    const bank = bankByPartner[wallet.partnerId];
    const amount = round2(wallet.availableBalance);
    const base = { partnerId: wallet.partnerId, partnerName: partner?.fullName ?? null, partnerEmail: partner?.email ?? null, amount };

    // Suspension for overdue commission outranks everything else.
    if (wallet.payoutsSuspended) { excluded.push({ ...base, reason: EXCLUSION.PAYOUTS_SUSPENDED }); continue; }
    if (amount < MINIMUM_PAYOUT) { excluded.push({ ...base, reason: EXCLUSION.BELOW_MINIMUM }); continue; }
    // Excluded rather than attempted: a transfer to unverified details fails at
    // the bank, mid-run, after the ledger has already been debited.
    if (!bank) { excluded.push({ ...base, reason: EXCLUSION.NO_BANK_ACCOUNT }); continue; }
    if (!bank.isVerified) { excluded.push({ ...base, reason: EXCLUSION.BANK_UNVERIFIED }); continue; }

    eligible.push({ ...base, bank });
  }

  return { eligible, excluded };
}

/**
 * Create a draft batch for a period. Idempotent per reference, so re-running the
 * worker after a restart cannot produce two batches for the same period.
 */
export async function generateBatch(cycle = 'weekly', now = new Date()) {
  const period = cycle === 'manual'
    ? { periodStart: now, periodEnd: now, label: `${now.toISOString().slice(0, 10)}` }
    : previousPeriod(cycle, now);
  const reference = batchReference(cycle, period.label);

  const existing = await prisma.payoutBatch.findUnique({ where: { reference } });
  if (existing) return { batch: existing, created: false, excluded: [] };

  const { eligible, excluded } = await selectEligible();
  if (eligible.length === 0) return { batch: null, created: false, excluded };

  const totalNet = round2(eligible.reduce((s, e) => s + e.amount, 0));

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.payoutBatch.create({
      data: {
        reference,
        cycle,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        status: 'draft',
        partnerCount: eligible.length,
        totalGross: totalNet,
        totalCommission: 0, // commission was already netted off at earning time
        totalNet,
      },
    });

    for (const e of eligible) {
      await tx.payoutRecord.create({
        data: {
          partnerId: e.partnerId,
          partnerName: e.partnerName || e.partnerEmail || e.partnerId,
          amountRequested: e.amount,
          amountPaid: e.amount,
          payoutMethod: 'Bank Transfer',
          status: 'scheduled',
          batchId: created.id,
          cycle,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          reference: payoutReference(e.partnerId, period.label),
          // Freeze the bank details now. If the partner edits them tomorrow, the
          // record still shows where the money actually went.
          bankSnapshot: {
            bankName: e.bank.bankName,
            bankCode: e.bank.bankCode,
            accountNumber: e.bank.accountNumber,
            accountName: e.bank.accountName,
            verifiedAt: e.bank.verifiedAt,
          },
          scheduledDate: period.periodEnd,
        },
      });
    }
    return created;
  });

  return { batch, created: true, excluded };
}

/** Draft → approved. Nothing moves yet; this only authorises the run. */
export async function approveBatch(batchId, approvedById) {
  const batch = await prisma.payoutBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'draft') throw new Error(`Batch is ${batch.status}, only a draft can be approved`);
  return prisma.payoutBatch.update({
    where: { id: batchId },
    data: { status: 'approved', approvedById, approvedAt: new Date() },
  });
}

/**
 * Execute an approved batch.
 *
 * Deliberately transactional PER PARTNER, not per batch: one failed transfer
 * must not roll back the other two hundred. Failures are recorded and retryable.
 */
export async function processBatch(batchId) {
  const batch = await prisma.payoutBatch.findUnique({
    where: { id: batchId },
    include: { payouts: true },
  });
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'approved') throw new Error(`Batch is ${batch.status}, only an approved batch can be processed`);

  await prisma.payoutBatch.update({ where: { id: batchId }, data: { status: 'processing' } });

  const results = { paid: 0, failed: 0, skipped: 0, errors: [] };

  for (const payout of batch.payouts) {
    if (payout.status === 'completed') { results.skipped += 1; continue; }
    try {
      // Re-check the balance inside the run: it may have moved since the draft
      // was generated (a refund clawback, a damage deduction).
      const wallet = await prisma.partnerWallet.findUnique({ where: { partnerId: payout.partnerId } });
      if (!wallet || wallet.availableBalance < payout.amountPaid) {
        await prisma.payoutRecord.update({
          where: { id: payout.id },
          data: { status: 'failed', failureReason: `Insufficient balance at processing time (RM${round2(wallet?.availableBalance ?? 0)})` },
        });
        results.failed += 1;
        continue;
      }

      // debitPayout is idempotent on payout id, so a retried run cannot
      // double-debit a partner who was already paid.
      await debitPayout(payout);
      await prisma.payoutRecord.update({
        where: { id: payout.id },
        data: { status: 'completed', paidAt: new Date() },
      });
      results.paid += 1;
    } catch (err) {
      await prisma.payoutRecord.update({
        where: { id: payout.id },
        data: { status: 'failed', failureReason: String(err.message).slice(0, 500) },
      }).catch(() => {});
      results.failed += 1;
      results.errors.push({ payoutId: payout.id, error: err.message });
    }
  }

  const finalStatus = results.failed === 0 ? 'completed' : (results.paid === 0 ? 'failed' : 'completed');
  const updated = await prisma.payoutBatch.update({
    where: { id: batchId },
    data: { status: finalStatus, processedAt: new Date() },
  });

  return { batch: updated, ...results };
}

/** Retry a single failed payout without re-running the whole batch. */
export async function retryPayout(payoutId) {
  const payout = await prisma.payoutRecord.findUnique({ where: { id: payoutId } });
  if (!payout) throw new Error('Payout not found');
  if (payout.status !== 'failed') throw new Error(`Payout is ${payout.status}, only a failed payout can be retried`);

  const wallet = await prisma.partnerWallet.findUnique({ where: { partnerId: payout.partnerId } });
  if (!wallet || wallet.availableBalance < payout.amountPaid) {
    throw new Error(`Insufficient balance (RM${round2(wallet?.availableBalance ?? 0)}) for RM${payout.amountPaid}`);
  }
  await debitPayout(payout);
  return prisma.payoutRecord.update({
    where: { id: payoutId },
    data: { status: 'completed', paidAt: new Date(), failureReason: null },
  });
}
