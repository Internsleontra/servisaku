// ─────────────────────────────────────────────────────────────────────────────
// Invoice numbering.
//
// A tax invoice number must be sequential and gapless for audit. That rules out
// cuid() (not sequential) and `count() + 1` (races under concurrency and skips
// numbers whenever a transaction rolls back). A Postgres sequence is the only
// approach that survives concurrent issuance, and it is created by hand in
// prisma/migrations/20260731090000_tax_invoices/migration.sql — Prisma does not
// model sequences.
//
// Note that a sequence is *monotonic*, not strictly gapless: nextval() is
// non-transactional, so a rolled-back insert burns its number. That is the
// standard, accepted behaviour for invoice numbering — allocate the number as
// late as possible so the window for a rollback after allocation is minimal.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';

const PREFIX = { tax_invoice: 'INV', credit_note: 'CN' };

/**
 * Allocate the next invoice number.
 *
 * @param {string} type    tax_invoice | credit_note
 * @param {object} [client] a transaction client, so the number is drawn inside
 *                          the same transaction that writes the row
 * @param {Date}   [at]     issue date, for the year segment
 * @returns {Promise<string>} e.g. "INV-2026-000001"
 */
export async function nextInvoiceNo(type = 'tax_invoice', client = prisma, at = new Date()) {
  const rows = await client.$queryRawUnsafe("SELECT nextval('invoice_no_seq') AS n");
  // node-postgres returns bigint for nextval; Number() is safe well past any
  // realistic invoice count.
  const n = Number(rows?.[0]?.n ?? 0);
  const prefix = PREFIX[type] || PREFIX.tax_invoice;
  return `${prefix}-${at.getFullYear()}-${String(n).padStart(6, '0')}`;
}

/**
 * Audit helper: report any break in the issued sequence. Used by the tax report
 * so a gap is surfaced rather than discovered during an audit.
 */
export async function findSequenceGaps() {
  const invoices = await prisma.invoice.findMany({
    select: { invoiceNo: true, issuedAt: true },
    orderBy: { invoiceNo: 'asc' },
  });
  const numbers = invoices
    .map((i) => ({ raw: i.invoiceNo, n: Number(i.invoiceNo.split('-').pop()) }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => a.n - b.n);

  const gaps = [];
  for (let i = 1; i < numbers.length; i += 1) {
    const expected = numbers[i - 1].n + 1;
    if (numbers[i].n !== expected) {
      gaps.push({ after: numbers[i - 1].raw, before: numbers[i].raw, missing: numbers[i].n - expected });
    }
  }
  return { total: numbers.length, gaps };
}
