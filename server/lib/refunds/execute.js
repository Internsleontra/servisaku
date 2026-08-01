// ─────────────────────────────────────────────────────────────────────────────
// Refund execution — the part that actually moves money.
//
// Approving a refund used to change a status and nothing else. This is the
// decision table that makes it real:
//
//   escrow held    + online  → reduce escrow, refund via gateway, escrow→refunded
//   escrow released+ online  → gateway refund from platform funds, claw back
//                              from the partner's wallet if they are liable
//   cash                     → no gateway to refund through; the partner hands
//                              money back, so their commission debt is reduced
//                              by the platform's share of the refund
//   any            + partial → proportional, and Payment.refundedAmount caps
//                              repeated partials at the amount actually paid
//
// Idempotent: re-running a completed refund is a no-op, and the wallet ledger's
// idempotency key absorbs a duplicated clawback.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';
import { getProvider, toSen, fromSen } from '../payments/index.js';
import { split, round2 } from '../payments/commission.js';
import { post } from '../wallet/ledger.js';
import { issueCreditNote } from '../tax/invoice.js';
import { notify } from '../notifications/index.js';

/** The payment this refund should be taken from — the paid one, if any. */
async function payableFor(bookingId) {
  return prisma.payment.findFirst({
    where: { bookingId, status: 'paid', type: 'booking' },
    orderBy: { paidAt: 'desc' },
  });
}

/**
 * Execute an approved refund.
 *
 * @param {object} refund  a RefundRequest row
 * @returns {Promise<object>} the updated RefundRequest
 */
export async function executeRefund(refund) {
  if (['completed', 'cancelled'].includes(refund.status)) return refund;

  const booking = await prisma.booking.findUnique({
    where: { id: refund.bookingId },
    include: { consumer: true, partner: true },
  });
  if (!booking) throw new Error(`Booking ${refund.bookingId} not found`);

  const amount = round2(refund.refundAmount);
  const payment = await payableFor(booking.id);
  const escrow = await prisma.escrowLedger.findUnique({ where: { bookingId: booking.id } });

  await prisma.refundRequest.update({
    where: { id: refund.id },
    data: { status: 'processing', paymentId: payment?.id ?? refund.paymentId ?? null },
  });

  let gatewayRefundRef = null;
  let refundMethod = refund.refundMethod || 'original';

  try {
    if (payment?.method === 'cash') {
      // Nothing to reverse at a gateway — the partner physically holds the cash.
      // What the platform can settle is its own share: reduce the commission the
      // partner owes by the platform's portion of the refunded amount, so the
      // partner is not left paying commission on money they gave back.
      refundMethod = 'manual';
      const { commission } = split(amount, { partner: booking.partner });
      if (commission > 0 && booking.partnerId) {
        await post({
          partnerId: booking.partnerId,
          type: 'settlement_credit',
          amount: commission,
          description: `Commission reversed on refund — ${booking.serviceType || 'service'}`,
          bookingId: booking.id,
          idempotencyKey: `refund_commission:${refund.id}`,
        });
      }
    } else if (payment) {
      // Online: reverse through whichever gateway took the money.
      const provider = getProvider(payment.provider);
      if (provider?.isReady() && payment.gatewayRef) {
        const result = await provider.createRefund({
          gatewayRef: payment.gatewayRef,
          amountSen: toSen(amount),
          reason: refund.reason,
          raw: payment.raw,
        });
        gatewayRefundRef = result.ref;
      } else {
        // Billplz has no refund API — it is done from their dashboard. Record
        // that a manual step is required rather than pretending it happened.
        refundMethod = 'manual';
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: round2((payment.refundedAmount || 0) + amount),
          status: round2((payment.refundedAmount || 0) + amount) >= fromSen(payment.amount) ? 'refunded' : payment.status,
        },
      });
    }

    // Escrow: if the money is still held, it is released back rather than out.
    if (escrow) {
      const fullyRefunded = amount >= round2(escrow.grossAmount);
      if (escrow.status === 'held') {
        await prisma.escrowLedger.update({
          where: { bookingId: booking.id },
          data: { status: fullyRefunded ? 'refunded' : 'held' },
        });
        // The partner's share was only ever pending — take it back out.
        if (booking.partnerId) {
          const { netPayout } = split(amount, { partner: booking.partner });
          await post({
            partnerId: booking.partnerId,
            type: 'escrow_release',
            amount: netPayout,
            description: `Escrow reversed on refund — ${booking.serviceType || 'service'}`,
            bookingId: booking.id,
            idempotencyKey: `refund_escrow:${refund.id}`,
          });
        }
      } else if (escrow.status === 'released' && refund.partnerLiabilityAmount > 0) {
        // Already paid out. Claw back only what the partner is held liable for —
        // never the whole refund, because that is a decision an admin made
        // explicitly when setting liableParty.
        await post({
          partnerId: booking.partnerId,
          type: 'refund_debit',
          amount: round2(refund.partnerLiabilityAmount),
          description: `Refund liability — ${booking.serviceType || 'service'}`,
          bookingId: booking.id,
          idempotencyKey: `refund_liability:${refund.id}`,
        });
      }
    }

    // A refund against an issued tax invoice needs a credit note (Feature 10).
    let creditNoteId = null;
    const invoice = await prisma.invoice.findFirst({
      where: { bookingId: booking.id, type: 'tax_invoice' },
    });
    if (invoice) {
      const creditable = round2(invoice.total - invoice.refundedAmount);
      if (creditable > 0) {
        const note = await issueCreditNote(invoice.id, Math.min(amount, creditable), {
          reason: `Refund: ${refund.reason}`.slice(0, 500),
        }).catch((err) => {
          console.error('[refunds] credit note failed:', err?.message || err);
          return null;
        });
        creditNoteId = note?.id ?? null;
      }
    }

    const completed = await prisma.refundRequest.update({
      where: { id: refund.id },
      data: {
        status: 'completed',
        processedAt: new Date(),
        gatewayRefundRef,
        refundMethod,
        creditNoteId,
      },
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: amount >= round2(booking.price) ? 'refunded' : booking.paymentStatus },
    });

    notify({
      userId: booking.consumerId,
      event: 'refund_completed',
      bookingId: booking.id,
      data: { serviceName: booking.serviceType, amount: `RM ${amount.toFixed(2)}` },
    }).catch(() => {});
    if (booking.partnerId && refund.partnerLiabilityAmount > 0) {
      notify({
        userId: booking.partnerId,
        event: 'partner_liability_applied',
        bookingId: booking.id,
        data: { amount: `RM ${round2(refund.partnerLiabilityAmount).toFixed(2)}`, serviceName: booking.serviceType },
      }).catch(() => {});
    }

    return completed;
  } catch (err) {
    // Leave the request in `failed` with the reason so it can be retried, rather
    // than silently stuck in `processing`.
    const failed = await prisma.refundRequest.update({
      where: { id: refund.id },
      data: { status: 'failed', failureReason: String(err.message).slice(0, 500) },
    });
    notify({
      userId: booking.consumerId,
      event: 'refund_failed',
      bookingId: booking.id,
      data: { amount: `RM ${amount.toFixed(2)}` },
    }).catch(() => {});
    return failed;
  }
}
