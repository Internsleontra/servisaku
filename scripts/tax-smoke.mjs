// ─────────────────────────────────────────────────────────────────────────────
// SST / invoicing smoke test.
//
// Proves the property the whole feature rests on: an invoice reads the price
// snapshot taken at booking time and never recomputes, so a later rate change
// cannot rewrite what a customer was charged.
//
//   node scripts/tax-smoke.mjs
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import { prisma } from '../server/db.js';
import { cleanupAndReport } from './smoke-cleanup.mjs';
import { issueInvoice, issueCreditNote } from '../server/lib/tax/invoice.js';
import { activeRate, taxSummary, calcSst, TAX_CODES } from '../server/lib/tax/index.js';
import { sstReport } from '../server/lib/tax/report.js';
import { findSequenceGaps } from '../server/lib/tax/numbering.js';

const tag = `taxsmoke-${Date.now()}`;
let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

let consumer; let partner; let oldBooking; let newBooking;
const createdInvoiceIds = [];

try {
  // Rate history resolves by date.
  const rateNow = await activeRate(TAX_CODES.SERVICE, new Date());
  const rate2023 = await activeRate(TAX_CODES.SERVICE, new Date('2023-06-01'));
  ok('current rate is 8%', rateNow === 0.08, String(rateNow));
  ok('a 2023 date still resolves to 6%', rate2023 === 0.06, String(rate2023));

  const summary = await taxSummary();
  ok('tax summary reports the configured rate', summary.configured && summary.rate_percent === 8,
    `${summary.rate_percent}% configured=${summary.configured}`);

  consumer = await prisma.user.create({ data: { email: `${tag}-c@t.local`, fullName: 'Tax Smoke Consumer', role: 'consumer', phone: '+60123456789' } });
  partner = await prisma.user.create({ data: { email: `${tag}-p@t.local`, fullName: 'Tax Smoke Partner', role: 'partner' } });

  // A booking priced under the OLD 6% regime, with its snapshot.
  const oldSnap = {
    subtotal: 200, platformFee: 5, sstEnabled: true, tax: calcSst(205, 0.06).tax,
    promoDiscount: 0, total: 205 + calcSst(205, 0.06).tax,
    breakdown: [
      { label: 'Aircon service', type: 'SERVICE', amount: 200 },
      { label: 'Platform fee', type: 'PLATFORM_FEE', amount: 5 },
      { label: 'SST (6%)', type: 'TAX', amount: calcSst(205, 0.06).tax },
    ],
  };
  oldBooking = await prisma.booking.create({
    data: {
      serviceType: 'Aircon Service', status: 'completed', price: oldSnap.total,
      date: new Date('2023-06-15'), createdAt: new Date('2023-06-10'),
      consumerId: consumer.id, partnerId: partner.id,
      address: '12 Jalan Test, KL', paymentStatus: 'paid',
      priceBreakdown: oldSnap, configVersion: 'test-2023',
    },
  });

  const oldInvoice = await issueInvoice(oldBooking);
  createdInvoiceIds.push(oldInvoice.id);
  ok('historical booking invoices at 6%, not today\'s 8%', oldInvoice.sstRate === 0.06,
    `${(oldInvoice.sstRate * 100).toFixed(0)}% · SST RM${oldInvoice.sstAmount}`);
  ok('historical invoice reconciles',
    Math.abs((oldInvoice.subtotal + oldInvoice.platformFee + oldInvoice.sstAmount - oldInvoice.discountTotal) - oldInvoice.total) < 0.02,
    `total RM${oldInvoice.total}`);

  // A booking priced under the CURRENT 8% regime.
  const newSnap = {
    subtotal: 200, platformFee: 5, sstEnabled: true, tax: calcSst(205, 0.08).tax,
    promoDiscount: 0, total: 205 + calcSst(205, 0.08).tax,
    breakdown: [
      { label: 'Aircon service', type: 'SERVICE', amount: 200 },
      { label: 'Platform fee', type: 'PLATFORM_FEE', amount: 5 },
      { label: 'SST (8%)', type: 'TAX', amount: calcSst(205, 0.08).tax },
    ],
  };
  newBooking = await prisma.booking.create({
    data: {
      serviceType: 'Aircon Service', status: 'completed', price: newSnap.total,
      date: new Date(), consumerId: consumer.id, partnerId: partner.id,
      address: '12 Jalan Test, KL', paymentStatus: 'paid',
      priceBreakdown: newSnap, configVersion: 'test-2026',
    },
  });

  const newInvoice = await issueInvoice(newBooking);
  createdInvoiceIds.push(newInvoice.id);
  ok('current booking invoices at 8%', newInvoice.sstRate === 0.08,
    `${(newInvoice.sstRate * 100).toFixed(0)}% · SST RM${newInvoice.sstAmount}`);

  // Idempotency + numbering.
  const again = await issueInvoice(newBooking);
  ok('re-issuing returns the same invoice', again.id === newInvoice.id, again.invoiceNo);
  ok('invoice numbers are sequential',
    Number(newInvoice.invoiceNo.split('-').pop()) === Number(oldInvoice.invoiceNo.split('-').pop()) + 1,
    `${oldInvoice.invoiceNo} → ${newInvoice.invoiceNo}`);

  // Required tax-invoice fields.
  const required = ['invoiceNo', 'supplierName', 'customerName', 'taxableAmount', 'sstRate', 'sstAmount', 'total', 'issuedAt'];
  ok('all required tax-invoice fields present', required.every((f) => newInvoice[f] != null),
    required.filter((f) => newInvoice[f] == null).join(',') || 'complete');

  // Partial credit note — tax credited proportionally.
  const half = Number((newInvoice.total / 2).toFixed(2));
  const note = await issueCreditNote(newInvoice.id, half, { reason: 'Partial refund — service incomplete' });
  createdInvoiceIds.push(note.id);
  ok('credit note carries negative amounts', note.total < 0 && note.sstAmount < 0,
    `RM${note.total}, SST RM${note.sstAmount}`);
  ok('credited tax is proportional to the amount', Math.abs(Math.abs(note.sstAmount) - newInvoice.sstAmount / 2) < 0.02,
    `RM${Math.abs(note.sstAmount)} of RM${newInvoice.sstAmount}`);

  const afterCredit = await prisma.invoice.findUnique({ where: { id: newInvoice.id } });
  ok('original invoice is untouched except its refunded total',
    afterCredit.total === newInvoice.total && afterCredit.refundedAmount === half,
    `refunded RM${afterCredit.refundedAmount}`);

  // Over-crediting is refused.
  let refused = false;
  try { await issueCreditNote(newInvoice.id, newInvoice.total, { reason: 'over-credit attempt' }); }
  catch { refused = true; }
  ok('cannot credit more than the invoice total', refused);

  // Reporting.
  const report = await sstReport(new Date(Date.now() - 864e5), new Date(Date.now() + 864e5));
  ok('report nets credit notes against collections',
    report.sst_payable === Number((report.sst_collected - report.sst_credited).toFixed(2)),
    `collected ${report.sst_collected} − credited ${report.sst_credited} = ${report.sst_payable}`);

  const gaps = await findSequenceGaps();
  ok('invoice sequence has no gaps', gaps.gaps.length === 0, `${gaps.total} invoices`);
} catch (err) {
  console.error(`\n${err.stack || err.message}`);
  failures += 1;
} finally {
  if (createdInvoiceIds.length) await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
  await cleanupAndReport([consumer, partner], [oldBooking, newBooking]);
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\n✅ tax smoke passed' : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
