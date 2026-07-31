// ─────────────────────────────────────────────────────────────────────────────
// Stripe adapter — cards, Apple Pay, Google Pay.
//
// Billplz covers FPX/DuitNow/e-wallets but has no Apple/Google Pay. Stripe
// Checkout does, and both wallets ride on the `card` payment method type
// automatically once the domain is verified in the Stripe dashboard — so this
// adapter deliberately uses hosted Checkout Sessions rather than Payment
// Elements. That keeps the flow identical to the existing Billplz one
// (create → redirect → webhook, with a /sync fallback) and means no Stripe.js
// integration in the front end.
//
// Written with fetch + node:crypto rather than the `stripe` npm package, to
// match how billplz.js, sms.js (Twilio) and notifications/push.js (FCM) all
// talk to their providers. No new dependency.
//
// Env:
//   STRIPE_SECRET_KEY        sk_test_… / sk_live_…
//   STRIPE_WEBHOOK_SECRET    whsec_…  (required for webhook verification)
//   STRIPE_API_BASE          override, defaults to https://api.stripe.com
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

const BASE = (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');
const SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Stripe's tolerance for webhook timestamp skew (their documented default).
const SIGNATURE_TOLERANCE_SEC = 300;

export const isStripeReady = () => Boolean(SECRET_KEY);

// Stripe uses HTTP Basic with the secret key as the username and no password.
const authHeader = () => 'Basic ' + Buffer.from(`${SECRET_KEY}:`).toString('base64');

async function stripeRequest(method, path, params) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe ${method} ${path} failed (${res.status})`);
  }
  return data;
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Verify a `Stripe-Signature` header against the raw request body.
 * Header format: `t=<unix>,v1=<hex>[,v1=<hex>…]`; the signed payload is
 * `${t}.${rawBody}` HMAC-SHA256'd with the webhook secret.
 *
 * Requires the *raw* body — a parsed-and-restringified body will not match,
 * which is why server/index.js mounts express.raw() for the webhook path.
 */
export function verifyStripeSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET || !signatureHeader || !rawBody) return false;

  const parts = String(signatureHeader).split(',').map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  // Reject stale signatures — without this, a captured webhook could be replayed
  // indefinitely by anyone who observed it in transit.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SEC) return false;

  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
  return signatures.some((sig) => safeEqual(expected, sig));
}

// ─── Provider adapter ────────────────────────────────────────────────────────
export const provider = {
  name: 'stripe',

  isReady: isStripeReady,

  supportsMethod: (method) => ['card', 'applepay', 'googlepay'].includes(method),

  /**
   * Create a hosted Checkout Session. Apple Pay and Google Pay are surfaced
   * automatically by Stripe on eligible devices — they are not separate
   * payment_method_types, which is why all three methods map to `card` here.
   */
  async createCheckout({ amountSen, description, customer, callbackUrl, redirectUrl, reference }) {
    const params = {
      mode: 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'myr',
      'line_items[0][price_data][unit_amount]': String(Math.round(amountSen)),
      'line_items[0][price_data][product_data][name]': String(description || 'ServisAku booking').slice(0, 250),
      success_url: redirectUrl,
      cancel_url: redirectUrl,
      client_reference_id: String(reference || ''),
      'metadata[payment_id]': String(reference || ''),
    };
    if (customer?.email) params.customer_email = customer.email;

    const session = await stripeRequest('POST', '/v1/checkout/sessions', params);
    return { ref: session.id, url: session.url, clientSecret: session.client_secret || null, raw: session };
  },

  async fetchStatus(gatewayRef) {
    const session = await stripeRequest('GET', `/v1/checkout/sessions/${gatewayRef}`);
    return { paid: session.payment_status === 'paid', status: session.payment_status, raw: session };
  },

  /**
   * Verify + normalise a Stripe webhook into the shape the route expects.
   * `rawBody` must be the untouched Buffer.
   */
  verifyWebhook({ rawBody, headers }) {
    const sig = headers?.['stripe-signature'];
    if (!verifyStripeSignature(rawBody, sig)) return { valid: false };

    let event;
    try { event = JSON.parse(rawBody.toString('utf8')); } catch { return { valid: false }; }

    const object = event?.data?.object || {};
    const paidTypes = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
    return {
      valid: true,
      eventId: event.id, // Stripe event ids are unique — ideal for the WebhookEvent guard
      gatewayRef: object.id,
      paid: paidTypes.includes(event.type) && object.payment_status === 'paid',
      type: event.type,
      raw: event,
    };
  },

  /**
   * Refunds attach to the PaymentIntent, not the Checkout Session, so the
   * session snapshot stored in Payment.raw is where we recover it from.
   */
  async createRefund({ gatewayRef, amountSen, reason, raw }) {
    let paymentIntent = raw?.payment_intent;
    if (!paymentIntent) {
      const session = await stripeRequest('GET', `/v1/checkout/sessions/${gatewayRef}`);
      paymentIntent = session.payment_intent;
    }
    if (!paymentIntent) throw new Error('No Stripe payment_intent found for this payment');

    const params = { payment_intent: paymentIntent };
    if (amountSen != null) params.amount = String(Math.round(amountSen));
    if (reason) params['metadata[reason]'] = String(reason).slice(0, 500);

    const refund = await stripeRequest('POST', '/v1/refunds', params);
    return { ref: refund.id, status: refund.status, raw: refund };
  },
};
