import { Router, urlencoded } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isBookingParticipant } from '../lib/access.js';
import { createBill, getBill, verifyWebhookSignature, isBillplzReady } from '../lib/billplz.js';
import { notify } from '../lib/notifications/index.js';

const router = Router();

const PLATFORM_FEE_RATE = 0.20;
// Where Billplz sends its server-to-server callback (must be publicly reachable
// in production) and where the user's browser is redirected back after paying.
const PUBLIC_URL = (process.env.APP_PUBLIC_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const APP_URL = (process.env.APP_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

function mapOut(p) {
  return {
    id: p.id, booking_id: p.bookingId, amount: p.amount, currency: p.currency,
    method: p.method, provider: p.provider, status: p.status,
    gateway_ref: p.gatewayRef, checkout_url: p.checkoutUrl, paid_at: p.paidAt, created_date: p.createdAt,
  };
}

// Flip a payment to paid (idempotent) and move funds into escrow.
async function markPaidAndEscrow(payment, rawPayload) {
  if (payment.status === 'paid') return payment;
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'paid', paidAt: new Date(), raw: rawPayload ?? payment.raw ?? undefined },
  });
  const booking = await prisma.booking.update({
    where: { id: payment.bookingId }, data: { paymentStatus: 'escrowed' },
  });
  const gross = payment.amount / 100; // sen → MYR
  const fee = +(gross * PLATFORM_FEE_RATE).toFixed(2);
  await prisma.escrowLedger.upsert({
    where: { bookingId: payment.bookingId },
    create: { bookingId: payment.bookingId, grossAmount: gross, platformFee: fee, partnerPayout: +(gross - fee).toFixed(2), status: 'held' },
    update: {},
  });

  // Notify the consumer their payment went through (best-effort, off the response path).
  if (booking?.consumerId) {
    notify({
      userId: booking.consumerId, event: 'payment_successful',
      bookingId: booking.id, paymentId: payment.id,
      data: { serviceName: booking.serviceType, amount: `RM ${gross.toFixed(2)}` },
    }).catch(() => {});
  }
  return updated;
}

// POST /api/payments/create — create a Billplz bill for a booking, return the
// hosted checkout URL for the client to redirect to.
const createSchema = z.object({ booking_id: z.string(), method: z.string().max(20).optional() });
router.post('/create', authenticate, validate(createSchema), asyncHandler(async (req, res) => {
  if (!isBillplzReady()) throw new ApiError(503, 'Payment gateway not configured. Set BILLPLZ_API_KEY and BILLPLZ_COLLECTION_ID.');
  const booking = await prisma.booking.findUnique({ where: { id: req.body.booking_id }, include: { consumer: true } });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!isBookingParticipant(req.user, booking)) throw new ApiError(403, 'Forbidden');
  if (['escrowed', 'paid'].includes(booking.paymentStatus)) throw new ApiError(409, 'This booking is already paid');

  const amountSen = Math.round(booking.price * 100);
  const payment = await prisma.payment.create({
    data: { bookingId: booking.id, amount: amountSen, currency: 'MYR', method: req.body.method || 'fpx', provider: 'billplz', status: 'pending' },
  });

  let bill;
  try {
    bill = await createBill({
      amount: amountSen,
      name: booking.consumer?.fullName || 'Customer',
      email: booking.consumer?.email || undefined,
      mobile: booking.consumer?.phone || undefined,
      description: `ServisAku — ${booking.serviceType}`,
      callbackUrl: `${PUBLIC_URL}/api/payments/webhook/billplz`,
      redirectUrl: `${APP_URL}/payment/return?payment_id=${payment.id}`,
      reference1Label: 'Payment',
      reference1: payment.id,
    });
  } catch (err) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed', raw: { error: String(err.message) } } });
    throw new ApiError(502, `Gateway error: ${err.message}`);
  }

  const saved = await prisma.payment.update({
    where: { id: payment.id },
    data: { gatewayRef: bill.id, checkoutUrl: bill.url, raw: bill },
  });
  res.json(mapOut(saved));
}));

// POST /api/payments/webhook/billplz — Billplz server-to-server callback
// (form-encoded). Public: verified by X-Signature, not auth.
router.post('/webhook/billplz', urlencoded({ extended: false }), asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!verifyWebhookSignature(body)) return res.status(400).send('invalid signature');
  const billId = body.id;
  if (!billId) return res.status(400).send('missing id');

  // Idempotency — a given paid event is processed once.
  const eventId = `bill:${billId}:${body.paid_at || body.paid}`;
  const seen = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: 'billplz', eventId } },
  }).catch(() => null);
  if (seen) return res.status(200).send('ok');

  const payment = await prisma.payment.findFirst({ where: { gatewayRef: billId } });
  if (payment && String(body.paid) === 'true') {
    await markPaidAndEscrow(payment, body);
  }
  await prisma.webhookEvent.create({ data: { provider: 'billplz', eventId, type: 'bill.paid', payload: body } }).catch(() => {});
  res.status(200).send('ok');
}));

// POST /api/payments/:id/sync — confirm a payment by re-fetching the bill from
// Billplz. Needed in local dev where the webhook can't reach us.
router.post('/:id/sync', authenticate, asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { booking: true } });
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (!isBookingParticipant(req.user, payment.booking)) throw new ApiError(403, 'Forbidden');
  if (payment.status !== 'paid' && payment.gatewayRef && isBillplzReady()) {
    const bill = await getBill(payment.gatewayRef).catch(() => null);
    if (bill && (bill.paid === true || bill.state === 'paid')) {
      await markPaidAndEscrow(payment, bill);
    }
  }
  const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
  res.json(mapOut(fresh));
}));

// GET /api/payments/:id — payment status.
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { booking: true } });
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (!isBookingParticipant(req.user, payment.booking)) throw new ApiError(403, 'Forbidden');
  res.json(mapOut(payment));
}));

export default router;
