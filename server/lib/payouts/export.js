// Payout exports: a bank transfer file for the batch, and partner-facing
// statements. Amounts come from the payout records, never recomputed.
import { prisma } from '../../db.js';

const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Minimal RFC-4180 CSV — every field quoted so commas in names are safe. */
export function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.map(escape).join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\r\n');
}

/**
 * Bulk transfer file for a batch.
 *
 * Column names follow the common Malaysian bulk-payment layout (bank code,
 * account number, account holder name, amount, reference). Exact formats vary
 * per bank — confirm against your bank's spec before the first live run; this
 * is a reasonable default, not a certified format.
 */
export async function toBankFile(batchId) {
  const payouts = await prisma.payoutRecord.findMany({
    where: { batchId, status: { in: ['scheduled', 'processing', 'completed'] } },
    orderBy: { partnerName: 'asc' },
  });
  return payouts.map((p) => {
    const bank = p.bankSnapshot || {};
    return {
      bank_code: bank.bankCode ?? '',
      bank_name: bank.bankName ?? '',
      account_number: bank.accountNumber ?? '',
      account_name: bank.accountName ?? p.partnerName,
      amount: p.amountPaid.toFixed(2),
      currency: 'MYR',
      reference: p.reference ?? p.id,
      email: '',
    };
  });
}

/** A partner's own earnings statement for a date range. */
export async function partnerStatement(partnerId, from, to) {
  const [payouts, entries] = await Promise.all([
    prisma.payoutRecord.findMany({
      where: { partnerId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.walletLedgerEntry.findMany({
      where: { partnerId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return entries.map((e) => ({
    date: e.createdAt.toISOString().slice(0, 10),
    type: e.type,
    description: e.description,
    bucket: e.bucket,
    credit: e.direction === 'credit' ? e.amount.toFixed(2) : '',
    debit: e.direction === 'debit' ? e.amount.toFixed(2) : '',
    balance_after: e.balanceAfter.toFixed(2),
  })).concat(payouts.length ? [] : []);
}
