import { Router, urlencoded, raw } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isBookingParticipant } from '../lib/access.js';
import { getProvider, providerForMethod, listMethods, PAYMENT_METHODS, toSen, fromSen } from '../lib/payments/index.js';
import { split } from '../lib/payments/commission.js';
import { creditEscrowHold, debitCommission } from '../lib/wallet/index.js';
import { applyPayment } from '../lib/wallet/settlement.js';
import { issueInvoice } from '../lib/tax/invoice.js';
import { notify } from '../lib/notifications/index.js';

// Issue the tax invoice off the response path. A failure here must never undo a
// successful payment — it is logged and retryable, not fatal.
function issueInvoiceSafely(booking, paymentId) {
  issueInvoice(booking, { paymentId }).catch((err) =>
    console.error('[payments] invoice issue failed:', err?.message || err));
}

const router = Router();

// Where the gateway sends its server-to-server callback (must be publicly
// reachable in production) and where the user's browser lands after paying.
const PUBLIC_URL = (process.env.APP_PUBLIC_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const APP_URL = (process.env.APP_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

function mapOut(p) {
  return {
    id: p.id, booking_id: p.bookingId, amount: p.amount, currency: p.currency,
    method: p.method, provider: p.provider, status: p.status,
    gateway_ref: p.gatewayRef, checkout_url: p.checkoutUrl, paid_at: p.paidAt, created_date: p.createdAt,
    // Additive — existing clients ignore what they don't read.
    amount_myr: p.amountMyr ?? fromSen(p.amount),
    type: p.type, refunded_amount: p.refundedAmount, sst_amount: p.sstAmount,
    platform_fee: p.platformFee, net_to_partner: p.netToPartner,
  };
}

// Flip a payment to paid (idempotent) and move funds into escrow.
async function markPaidAndEscrow(payment, rawPayload) {
  if (payment.status === 'paid') return payment;

  // A settlement payment is a partner paying ServisAku — it has no escrow and no
  // consumer receipt; it clears commission debt instead.
  if (payment.type === 'commission_settlement') {
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'paid', paidAt: new Date(), raw: rawPayload ?? payment.raw ?? undefined },
    });
    if (payment.settlementId) {
      await applyPayment(payment.settlementId, payment.amountMyr ?? fromSen(payment.amount), { paymentId: payment.id });
    }
    return updated;
  }

  const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId }, include: { partner: true } });
  const gross = payment.amountMyr ?? fromSen(payment.amount);
  const { commission, netPayout } = split(gross, { partner: booking?.partner });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'paid', paidAt: new Date(), raw: rawPayload ?? payment.raw ?? undefined,
      amountMyr: gross, platformFee: commission, netToPartner: netPayout,
    },
  });
  await prisma.booking.update({ where: { id: payment.bookingId }, data: { paymentStatus: 'escrowed' } });

  await prisma.escrowLedger.upsert({
    where: { bookingId: payment.bookingId },
    create: { bookingId: payment.bookingId, grossAmount: gross, platformFee: commission, partnerPayout: netPayout, status: 'held' },
    update: {},
  });

  // The partner's share is earned but not yet withdrawable — it sits in escrow.
  if (booking?.partnerId) {
    creditEscrowHold(booking, { partner: booking.partner }).catch((err) =>
      console.error('[payments] escrow hold ledger entry failed:', err?.message || err));
  }

  if (booking) issueInvoiceSafely(booking, payment.id);

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

// GET /api/payments/methods — what the checkout UI should offer. Public: the
// method list is not sensitive and the booking flow reads it before login.
router.get('/methods', asyncHandler(async (req, res) => {
  res.json(listMethods());
}));

// POST /api/payments/create — create a checkout for a booking and return the
// hosted URL for the client to redirect to.
const createSchema = z.object({
  booking_id: z.string(),
  method: z.enum(PAYMENT_METHODS).optional(),
});
router.post('/create', authenticate, validate(createSchema), asyncHandler(async (req, res) => {
  const method = req.body.method || 'fpx';
  if (method === 'cash') throw new ApiError(400, 'Cash payments are recorded at completion, not through checkout');

  const provider = providerForMethod(method);
  if (!provider) throw new ApiError(503, `Payment method "${method}" is not available. Configure a provider that supports it.`);

  const booking = await prisma.booking.findUnique({ where: { id: req.body.booking_id }, include: { consumer: true } });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!isBookingParticipant(req.user, booking)) throw new ApiError(403, 'Forbidden');
  if (['escrowed', 'paid'].includes(booking.paymentStatus)) throw new ApiError(409, 'This booking is already paid');

  const amountSen = toSen(booking.price);
  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id, amount: amountSen, amountMyr: booking.price,
      currency: 'MYR', method, provider: provider.name, status: 'pending', type: 'booking',
    },
  });

  let checkout;
  try {
    checkout = await provider.createCheckout({
      amountSen,
      method,
      description: `ServisAku — ${booking.serviceType}`,
      customer: {
        name: booking.consumer?.fullName || 'Customer',
        email: booking.consumer?.email || undefined,
        phone: booking.consumer?.phone || undefined,
      },
      callbackUrl: `${PUBLIC_URL}/api/payments/webhook/${provider.name}`,
      redirectUrl: `${APP_URL}/payment/return?payment_id=${payment.id}`,
      reference: payment.id,
    });
  } catch (err) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed', raw: { error: String(err.message) } } });
    throw new ApiError(502, `Gateway error: ${err.message}`);
  }

  const saved = await prisma.payment.update({
    where: { id: payment.id },
    data: { gatewayRef: checkout.ref, checkoutUrl: checkout.url, raw: checkout.raw },
  });
  res.json({ ...mapOut(saved), client_secret: checkout.clientSecret ?? null });
}));

// POST /api/payments/cash/collect — the partner records that they took cash.
//
// This is the entry point of the cash flow. Nothing was collected up front, so
// there is no escrow; instead the partner is now holding ServisAku's commission
// and owes it back. Both facts are written here.
const cashSchema = z.object({
  booking_id: z.string().min(1),
  amount_collected: z.coerce.number().positive(),
});
router.post('/cash/collect', authenticate, validate(cashSchema), asyncHandler(async (req, res) => {
  if (req.user.role !== 'partner') throw new ApiError(403, 'Only the assigned partner can record a cash collection');

  const booking = await prisma.booking.findUnique({
    where: { id: req.body.booking_id },
    include: { consumer: true, partner: true },
  });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.partnerId !== req.user.id) throw new ApiError(403, 'You are not assigned to this booking');
  if (booking.status !== 'completed') throw new ApiError(400, 'Record the cash payment after completing the job');

  // Idempotency is checked FIRST, before the already-paid guard below. A partner
  // on a flaky connection will retry a request that actually succeeded, and
  // answering that with 409 "already paid" reads as a failure for a collection
  // that worked. Return the existing payment instead; the unique key is what
  // guarantees the commission is only ever debited once.
  const idempotencyKey = `cash:${booking.id}`;
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
  if (existing) return res.status(200).json(mapOut(existing));

  // Paid by some other route (online checkout, admin) — genuinely a conflict.
  if (['paid', 'escrowed', 'refunded'].includes(booking.paymentStatus)) {
    throw new ApiError(409, 'This booking is already paid');
  }

  // The amount is not the partner's to decide — under-reporting cash would
  // shrink the commission owed. A genuine discrepancy is a dispute, not an edit.
  if (Math.abs(req.body.amount_collected - booking.price) > 0.01) {
    throw new ApiError(400, `Collected amount must equal the booking total of RM ${booking.price.toFixed(2)}`);
  }

  const gross = booking.price;
  const { commission, netPayout } = split(gross, { partner: booking.partner });

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      amount: toSen(gross),
      amountMyr: gross,
      currency: 'MYR',
      method: 'cash',
      provider: 'cash',
      status: 'paid',
      type: 'booking',
      paidAt: new Date(),
      platformFee: commission,
      netToPartner: netPayout,
      collectedById: req.user.id,
      idempotencyKey,
    },
  });

  await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'paid' } });

  // The commission the partner now owes ServisAku.
  await debitCommission(booking, { partner: booking.partner, paymentId: payment.id });

  // Cash bookings are invoiced at collection, not at booking — this is the
  // moment money actually changed hands.
  issueInvoiceSafely(booking, payment.id);

  const amountLabel = `RM ${gross.toFixed(2)}`;
  notify({
    userId: booking.consumerId, event: 'cash_payment_recorded',
    bookingId: booking.id, paymentId: payment.id,
    data: { serviceName: booking.serviceType, amount: amountLabel },
  }).catch(() => {});
  notify({
    userId: booking.partnerId, event: 'cash_collected',
    bookingId: booking.id, paymentId: payment.id,
    data: { serviceName: booking.serviceType, amount: amountLabel, commission: `RM ${commission.toFixed(2)}` },
  }).catch(() => {});

  res.status(201).json(mapOut(payment));
}));

// Shared webhook handling once a provider has verified and normalised the event.
async function handleVerifiedWebhook(providerName, verified) {
  const eventId = verified.eventId;
  if (!eventId) return;

  // Idempotency — a given event is processed once, however many times the
  // gateway redelivers it.
  const seen = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: providerName, eventId } },
  }).catch(() => null);
  if (seen) return;

  if (verified.paid && verified.gatewayRef) {
    const payment = await prisma.payment.findFirst({ where: { gatewayRef: verified.gatewayRef } });
    if (payment) await markPaidAndEscrow(payment, verified.raw);
  }
  await prisma.webhookEvent.create({
    data: { provider: providerName, eventId, type: verified.type ?? null, payload: verified.raw },
  }).catch(() => {});
}

// POST /api/payments/webhook/billplz — form-encoded server-to-server callback.
// Public: verified by X-Signature, not auth.
router.post('/webhook/billplz', urlencoded({ extended: false }), asyncHandler(async (req, res) => {
  const verified = getProvider('billplz').verifyWebhook({ body: req.body || {} });
  if (!verified.valid) return res.status(400).send('invalid signature');
  await handleVerifiedWebhook('billplz', verified);
  res.status(200).send('ok');
}));

// POST /api/payments/webhook/stripe — Stripe signs the *raw* body, so this route
// takes express.raw() rather than the app-wide express.json().
router.post('/webhook/stripe', raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const verified = getProvider('stripe').verifyWebhook({ rawBody: req.body, headers: req.headers });
  if (!verified.valid) return res.status(400).send('invalid signature');
  await handleVerifiedWebhook('stripe', verified);
  res.status(200).send('ok');
}));

// POST /api/payments/:id/sync — confirm a payment by re-fetching it from the
// gateway. Needed in local dev where the webhook can't reach us.
router.post('/:id/sync', authenticate, asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { booking: true } });
  if (!payment) throw new ApiError(404, 'Payment not found');
  // A settlement payment belongs to the paying partner; a booking payment to its
  // participants.
  const allowed = payment.type === 'commission_settlement'
    ? payment.partnerId === req.user.id || req.user.role === 'admin' || req.user.role === 'super_admin'
    : isBookingParticipant(req.user, payment.booking);
  if (!allowed) throw new ApiError(403, 'Forbidden');

  const provider = getProvider(payment.provider);
  if (payment.status !== 'paid' && payment.gatewayRef && provider?.isReady()) {
    const status = await provider.fetchStatus(payment.gatewayRef).catch(() => null);
    if (status?.paid) await markPaidAndEscrow(payment, status.raw);
  }
  const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
  res.json(mapOut(fresh));
}));

// GET /api/payments/:id — payment status.
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { booking: true } });
  if (!payment) throw new ApiError(404, 'Payment not found');
  const allowed = payment.type === 'commission_settlement'
    ? payment.partnerId === req.user.id || req.user.role === 'admin' || req.user.role === 'super_admin'
    : isBookingParticipant(req.user, payment.booking);
  if (!allowed) throw new ApiError(403, 'Forbidden');
  res.json(mapOut(payment));
}));

export default router;
