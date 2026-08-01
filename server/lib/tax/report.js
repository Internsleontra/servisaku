// SST reporting — what was collected, what was credited back, what is payable.
//
// Credit notes are stored with negative amounts, so a period total is a plain
// sum over both types and cannot double-count a refund.
import { prisma } from '../../db.js';
import { findSequenceGaps } from './numbering.js';
import { round2 } from './index.js';

/**
 * SST summary for a period.
 *
 * @param {Date} from
 * @param {Date} to
 * @returns {Promise<object>} totals, a per-rate split, and a sequence integrity check
 */
export async function sstReport(from, to) {
  const invoices = await prisma.invoice.findMany({
    where: { issuedAt: { gte: from, lte: to } },
    orderBy: { issuedAt: 'asc' },
  });

  const taxInvoices = invoices.filter((i) => i.type === 'tax_invoice');
  const creditNotes = invoices.filter((i) => i.type === 'credit_note');

  const sum = (rows, field) => round2(rows.reduce((s, r) => s + (r[field] || 0), 0));

  // Group by rate so a period spanning a rate change is still filable.
  const byRate = {};
  for (const inv of invoices) {
    const key = String(inv.sstRate);
    byRate[key] ??= { rate: inv.sstRate, taxable: 0, sst: 0, count: 0 };
    byRate[key].taxable = round2(byRate[key].taxable + (inv.taxableAmount || 0));
    byRate[key].sst = round2(byRate[key].sst + (inv.sstAmount || 0));
    byRate[key].count += 1;
  }

  const collected = sum(taxInvoices, 'sstAmount');
  const credited = Math.abs(sum(creditNotes, 'sstAmount'));

  return {
    period: { from, to },
    invoice_count: taxInvoices.length,
    credit_note_count: creditNotes.length,
    gross_sales: sum(taxInvoices, 'total'),
    taxable_amount: sum(taxInvoices, 'taxableAmount'),
    sst_collected: collected,
    sst_credited: credited,
    sst_payable: round2(collected - credited),
    refunds_total: Math.abs(sum(creditNotes, 'total')),
    by_rate: Object.values(byRate),
    // An auditor will ask. Surface a break in the numbering here rather than
    // letting it be discovered during the audit itself.
    sequence: await findSequenceGaps(),
  };
}

/** Flat rows for CSV/XLSX export to an accountant. */
export async function sstReportRows(from, to) {
  const invoices = await prisma.invoice.findMany({
    where: { issuedAt: { gte: from, lte: to } },
    orderBy: { issuedAt: 'asc' },
  });
  return invoices.map((i) => ({
    invoice_no: i.invoiceNo,
    type: i.type,
    issued_at: i.issuedAt.toISOString().slice(0, 10),
    customer: i.customerName,
    taxable_amount: i.taxableAmount,
    sst_rate: i.sstRate,
    sst_amount: i.sstAmount,
    total: i.total,
    booking_id: i.bookingId ?? '',
    credit_note_for: i.creditNoteFor ?? '',
  }));
}

/** Minimal RFC-4180 CSV — quotes every field so commas in names are safe. */
export function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    headers.map(escape).join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\r\n');
}
