// ─────────────────────────────────────────────────────────────────────────────
// Invoice + credit note issuance.
//
// THE RULE: an invoice never recalculates tax. Every amount comes from
// Booking.priceBreakdown — the snapshot computePrice() wrote at booking time,
// alongside Booking.configVersion. That design decision (already in the schema)
// is what makes a rate change safe: a booking priced under 6% invoices at 6%
// forever, even after the platform moves to 8%.
//
// Corrections are credit notes referencing the original. There is deliberately
// no update path — an issued invoice is immutable.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';
import { nextInvoiceNo } from './numbering.js';
import { activeConfig, activeRate, calcSst, TAX_CODES, round2 } from './index.js';

const SUPPLIER = {
  name: process.env.SST_SUPPLIER_NAME || 'ServisAku Sdn Bhd',
  address: process.env.SST_SUPPLIER_ADDRESS || null,
};

/**
 * Read the tax figures a booking was actually priced with.
 *
 * computePrice() returns { subtotal, platformFee, tax, total, breakdown[] } and
 * that object is persisted verbatim to Booking.priceBreakdown. Legacy bookings
 * (priced by the older package engine) have no snapshot, so they fall back to
 * deriving from Booking.price with the rate that was in force on their date —
 * still historically correct, just less itemised.
 */
export async function taxFromSnapshot(booking) {
  const snap = booking.priceBreakdown;

  if (snap && typeof snap === 'object' && snap.total != null) {
    const rate = snap.sstEnabled && snap.tax
      // Recover the effective rate from the snapshot itself rather than reading
      // today's config — this is the whole point of snapshotting.
      ? round2(snap.tax / Math.max(snap.subtotal + snap.platformFee, 0.01) * 100) / 100
      : 0;
    return {
      subtotal: round2(snap.subtotal ?? 0),
      platformFee: round2(snap.platformFee ?? 0),
      discountTotal: round2(snap.promoDiscount ?? booking.discountAmount ?? 0),
      taxableAmount: round2((snap.subtotal ?? 0) + (snap.platformFee ?? 0)),
      sstRate: snap.sstEnabled ? (rate || await activeRate(TAX_CODES.SERVICE, booking.createdAt)) : 0,
      sstAmount: round2(snap.tax ?? 0),
      total: round2(snap.total ?? booking.price),
      lineItems: snapshotLineItems(snap, booking),
      fromSnapshot: true,
    };
  }

  // No snapshot — derive from the stored price using the rate in force then.
  const total = round2(booking.price);
  const config = await activeConfig(TAX_CODES.SERVICE, booking.createdAt);
  const rate = config?.rate ?? 0;
  // A legacy total is tax-inclusive by construction: it is what the customer
  // was charged, so back the tax out of it rather than adding on top.
  const { tax } = calcSst(total, rate, { inclusive: true });
  return {
    subtotal: round2(total - tax),
    platformFee: 0,
    discountTotal: round2(booking.discountAmount ?? 0),
    taxableAmount: round2(total - tax),
    sstRate: rate,
    sstAmount: tax,
    total,
    lineItems: [{
      description: booking.serviceType || 'Service',
      qty: 1, unitPrice: round2(total - tax), amount: round2(total - tax), taxable: rate > 0,
    }],
    fromSnapshot: false,
  };
}

function snapshotLineItems(snap, booking) {
  const lines = Array.isArray(snap.breakdown) ? snap.breakdown : [];
  const items = lines
    // Tax and discount are represented as their own invoice fields, not line items.
    .filter((l) => l.type !== 'TAX' && l.type !== 'DISCOUNT')
    .map((l) => ({
      description: l.label,
      qty: 1,
      unitPrice: round2(l.amount),
      amount: round2(l.amount),
      taxable: l.type !== 'PLATFORM_FEE' ? true : true,
    }));
  if (items.length) return items;
  return [{
    description: booking.serviceType || 'Service',
    qty: 1, unitPrice: round2(snap.subtotal ?? booking.price), amount: round2(snap.subtotal ?? booking.price), taxable: Boolean(snap.sstEnabled),
  }];
}

/**
 * Issue the tax invoice for a paid booking. Idempotent — a booking has exactly
 * one tax invoice, so a retried webhook returns the existing one.
 */
export async function issueInvoice(booking, { paymentId } = {}) {
  const existing = await prisma.invoice.findFirst({
    where: { bookingId: booking.id, type: 'tax_invoice' },
  });
  if (existing) return existing;

  const consumer = booking.consumer
    ?? await prisma.user.findUnique({ where: { id: booking.consumerId } });
  const tax = await taxFromSnapshot(booking);
  const config = await activeConfig(TAX_CODES.SERVICE, booking.createdAt);

  // Assert the invoice reconciles before writing it. A tax invoice that does not
  // add up is a compliance problem, not a display bug — fail loudly.
  const reconciled = round2(tax.subtotal + tax.platformFee + tax.sstAmount - tax.discountTotal);
  if (Math.abs(reconciled - tax.total) > 0.02) {
    throw new Error(
      `Invoice for booking ${booking.id} does not reconcile: `
      + `${tax.subtotal} + ${tax.platformFee} + ${tax.sstAmount} - ${tax.discountTotal} = ${reconciled}, expected ${tax.total}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const invoiceNo = await nextInvoiceNo('tax_invoice', tx, new Date());
    return tx.invoice.create({
      data: {
        invoiceNo,
        type: 'tax_invoice',
        bookingId: booking.id,
        consumerId: booking.consumerId,
        partnerId: booking.partnerId ?? null,
        paymentId: paymentId ?? null,
        subtotal: tax.subtotal,
        discountTotal: tax.discountTotal,
        platformFee: tax.platformFee,
        taxableAmount: tax.taxableAmount,
        sstRate: tax.sstRate,
        sstAmount: tax.sstAmount,
        total: tax.total,
        supplierName: SUPPLIER.name,
        supplierAddress: SUPPLIER.address,
        sstRegistrationNo: config?.registrationNo ?? process.env.SST_REGISTRATION_NO ?? null,
        customerName: consumer?.fullName || 'Customer',
        customerAddress: booking.address ?? null,
        customerPhone: consumer?.phone ?? null,
        customerEmail: consumer?.email ?? null,
        lineItems: tax.lineItems,
      },
    });
  });
}

/**
 * Issue a credit note against an invoice. Tax is credited proportionally to the
 * amount refunded — a partial refund of half the invoice credits half the SST.
 */
export async function issueCreditNote(invoiceId, amount, { reason, paymentId } = {}) {
  const original = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!original) throw new Error(`Invoice ${invoiceId} not found`);

  const creditable = round2(original.total - original.refundedAmount);
  const creditAmount = round2(amount);
  if (creditable <= 0) throw new Error(`Invoice ${original.invoiceNo} is already fully credited`);
  // Refuse rather than clamp. Silently crediting less than asked would turn a
  // mistyped amount into a wrong-but-plausible credit note, and a credit note
  // cannot be edited afterwards — only compounded with another one.
  if (creditAmount > creditable) {
    throw new Error(
      `Cannot credit RM${creditAmount.toFixed(2)} against ${original.invoiceNo}: `
      + `only RM${creditable.toFixed(2)} remains creditable`,
    );
  }

  const proportion = creditAmount / original.total;
  const sstCredited = round2(original.sstAmount * proportion);
  const subtotalCredited = round2(creditAmount - sstCredited);

  return prisma.$transaction(async (tx) => {
    const invoiceNo = await nextInvoiceNo('credit_note', tx, new Date());
    const note = await tx.invoice.create({
      data: {
        invoiceNo,
        type: 'credit_note',
        creditNoteFor: original.id,
        bookingId: original.bookingId,
        consumerId: original.consumerId,
        partnerId: original.partnerId,
        paymentId: paymentId ?? null,
        // Credit notes carry negative amounts so a period total is a plain sum.
        subtotal: -subtotalCredited,
        discountTotal: 0,
        platformFee: 0,
        taxableAmount: -subtotalCredited,
        sstRate: original.sstRate,
        sstAmount: -sstCredited,
        total: -creditAmount,
        supplierName: original.supplierName,
        supplierAddress: original.supplierAddress,
        sstRegistrationNo: original.sstRegistrationNo,
        customerName: original.customerName,
        customerAddress: original.customerAddress,
        customerPhone: original.customerPhone,
        customerEmail: original.customerEmail,
        lineItems: [{
          description: `Credit against ${original.invoiceNo}`,
          qty: 1, unitPrice: -subtotalCredited, amount: -subtotalCredited, taxable: original.sstRate > 0,
        }],
        reason: reason ?? null,
      },
    });
    // The original is not edited — only its running refunded total moves, which
    // is what caps future credit notes.
    await tx.invoice.update({
      where: { id: original.id },
      data: { refundedAmount: round2(original.refundedAmount + creditAmount) },
    });
    return note;
  });
}

/**
 * Issue the commission invoice ServisAku raises against a partner for a
 * settlement. A business-registered partner needs this for their own filing.
 */
export async function issueCommissionInvoice(settlement) {
  const existing = await prisma.invoice.findFirst({
    where: { settlementId: settlement.id, type: 'tax_invoice' },
  });
  if (existing) return existing;

  const partner = await prisma.user.findUnique({ where: { id: settlement.partnerId } });
  const config = await activeConfig(TAX_CODES.COMMISSION, settlement.periodEnd);
  const rate = config?.rate ?? 0;
  const { tax } = calcSst(settlement.commissionDue, rate);

  return prisma.$transaction(async (tx) => {
    const invoiceNo = await nextInvoiceNo('tax_invoice', tx, new Date());
    return tx.invoice.create({
      data: {
        invoiceNo,
        type: 'tax_invoice',
        partnerId: settlement.partnerId,
        settlementId: settlement.id,
        subtotal: round2(settlement.commissionDue),
        platformFee: 0,
        taxableAmount: round2(settlement.commissionDue),
        sstRate: rate,
        sstAmount: tax,
        total: round2(settlement.commissionDue + tax),
        supplierName: SUPPLIER.name,
        supplierAddress: SUPPLIER.address,
        sstRegistrationNo: config?.registrationNo ?? process.env.SST_REGISTRATION_NO ?? null,
        customerName: partner?.fullName || 'Partner',
        customerPhone: partner?.phone ?? null,
        customerEmail: partner?.email ?? null,
        lineItems: [{
          description: `Platform commission — settlement ${settlement.reference}`,
          qty: 1,
          unitPrice: round2(settlement.commissionDue),
          amount: round2(settlement.commissionDue),
          taxable: rate > 0,
        }],
      },
    });
  });
}

export function mapInvoiceOut(inv) {
  return {
    id: inv.id,
    invoice_no: inv.invoiceNo,
    type: inv.type,
    booking_id: inv.bookingId,
    consumer_id: inv.consumerId,
    partner_id: inv.partnerId,
    settlement_id: inv.settlementId,
    payment_id: inv.paymentId,
    subtotal: inv.subtotal,
    discount_total: inv.discountTotal,
    platform_fee: inv.platformFee,
    taxable_amount: inv.taxableAmount,
    sst_rate: inv.sstRate,
    sst_rate_percent: Number((inv.sstRate * 100).toFixed(2)),
    sst_amount: inv.sstAmount,
    total: inv.total,
    currency: inv.currency,
    refunded_amount: inv.refundedAmount,
    supplier_name: inv.supplierName,
    supplier_address: inv.supplierAddress,
    sst_registration_no: inv.sstRegistrationNo,
    customer_name: inv.customerName,
    customer_address: inv.customerAddress,
    customer_phone: inv.customerPhone,
    customer_email: inv.customerEmail,
    line_items: inv.lineItems,
    credit_note_for: inv.creditNoteFor,
    reason: inv.reason,
    issued_at: inv.issuedAt,
    pdf_url: inv.pdfUrl,
    created_date: inv.createdAt,
  };
}
