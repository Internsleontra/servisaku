// Billplz REST client (v3) + X-Signature verification.
//   BILLPLZ_BASE_URL (e.g. https://www.billplz-sandbox.com/api), BILLPLZ_API_KEY,
//   BILLPLZ_COLLECTION_ID, BILLPLZ_X_SIGNATURE_KEY
import crypto from 'node:crypto';

const BASE = (process.env.BILLPLZ_BASE_URL || 'https://www.billplz-sandbox.com/api').replace(/\/$/, '');
const API_KEY = process.env.BILLPLZ_API_KEY || '';
const COLLECTION_ID = process.env.BILLPLZ_COLLECTION_ID || '';
const X_SIG_KEY = process.env.BILLPLZ_X_SIGNATURE_KEY || '';

export const isBillplzReady = () => Boolean(API_KEY && COLLECTION_ID);

// Billplz uses HTTP Basic auth: API key as the username, empty password.
const authHeader = () => 'Basic ' + Buffer.from(`${API_KEY}:`).toString('base64');

/** Create a bill. `amount` is in sen (integer). Returns { id, url, paid, state, ... }. */
export async function createBill({ amount, name, email, mobile, description, callbackUrl, redirectUrl, reference1Label, reference1 }) {
  const params = new URLSearchParams();
  params.set('collection_id', COLLECTION_ID);
  params.set('description', String(description || 'ServisAku booking').slice(0, 200));
  params.set('amount', String(Math.round(amount)));
  params.set('callback_url', callbackUrl);
  if (redirectUrl) params.set('redirect_url', redirectUrl);
  if (email) params.set('email', email);
  if (mobile) params.set('mobile', mobile);
  params.set('name', String(name || 'Customer').slice(0, 200));
  if (reference1Label) params.set('reference_1_label', String(reference1Label).slice(0, 20));
  if (reference1) params.set('reference_1', String(reference1).slice(0, 120));

  const res = await fetch(`${BASE}/v3/bills`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message?.[0] || data?.error?.[0] || data?.error || `Billplz create bill failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

/** Fetch a bill's current state — used to confirm payment from localhost, where
 *  Billplz's server-to-server webhook can't reach us. */
export async function getBill(billId) {
  const res = await fetch(`${BASE}/v3/bills/${billId}`, { headers: { Authorization: authHeader() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Billplz get bill failed (${res.status})`);
  return data;
}

// X-Signature: build `${key}${value}` for each param, sort ascending, join with
// '|', HMAC-SHA256 with the signature key.
function computeSignature(pairs) {
  const src = pairs.map(([k, v]) => `${k}${v}`).sort().join('|');
  return crypto.createHmac('sha256', X_SIG_KEY).update(src).digest('hex');
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Verify a webhook (callback) POST body's x_signature. */
export function verifyWebhookSignature(body) {
  if (!X_SIG_KEY || !body?.x_signature) return false;
  const pairs = Object.entries(body)
    .filter(([k, v]) => k !== 'x_signature' && v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)]);
  return safeEqual(computeSignature(pairs), body.x_signature);
}

/** Verify a redirect (GET) query's x_signature. Redirect params arrive as
 *  billplz[id], billplz[paid], billplz[paid_at] — normalise to billplzid, etc. */
export function verifyRedirectSignature(query) {
  if (!X_SIG_KEY || !query?.x_signature) return false;
  const pairs = Object.entries(query)
    .filter(([k]) => k.startsWith('billplz['))
    .map(([k, v]) => [k.replace('billplz[', 'billplz').replace(']', ''), String(v)]);
  return safeEqual(computeSignature(pairs), query.x_signature);
}

// ─── Provider adapter ────────────────────────────────────────────────────────
// Wraps the functions above in the interface described in ./index.js. The named
// exports are all kept as-is so existing importers are unaffected.
export const provider = {
  name: 'billplz',

  isReady: isBillplzReady,

  // Billplz presents FPX, DuitNow, cards and MY e-wallets on one hosted page,
  // so the method mainly determines which gateway we route to, not what we send.
  supportsMethod: (method) => ['fpx', 'duitnow', 'card', 'tng', 'grabpay', 'boost'].includes(method),

  async createCheckout({ amountSen, description, customer, callbackUrl, redirectUrl, reference }) {
    const bill = await createBill({
      amount: amountSen,
      name: customer?.name || 'Customer',
      email: customer?.email || undefined,
      mobile: customer?.phone || undefined,
      description,
      callbackUrl,
      redirectUrl,
      reference1Label: 'Payment',
      reference1: reference,
    });
    return { ref: bill.id, url: bill.url, clientSecret: null, raw: bill };
  },

  async fetchStatus(gatewayRef) {
    const bill = await getBill(gatewayRef);
    return { paid: bill.paid === true || bill.state === 'paid', status: bill.state, raw: bill };
  },

  verifyWebhook({ body }) {
    if (!verifyWebhookSignature(body)) return { valid: false };
    const billId = body?.id;
    if (!billId) return { valid: false };
    return {
      valid: true,
      // Billplz sends no event id, so compose a stable one from the bill and its
      // paid timestamp — the same key the route has always used for idempotency.
      eventId: `bill:${billId}:${body.paid_at || body.paid}`,
      gatewayRef: billId,
      paid: String(body.paid) === 'true',
      type: 'bill.paid',
      raw: body,
    };
  },

  // Billplz has no refund API — refunds are initiated from their dashboard and
  // reconciled manually. Fail loudly rather than silently marking a refund done.
  createRefund() {
    throw new Error('Billplz does not support API refunds — refund from the Billplz dashboard and record it manually');
  },
};
