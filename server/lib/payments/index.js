// ─────────────────────────────────────────────────────────────────────────────
// Payment provider registry.
//
// server/routes/payments.js used to call Billplz directly. Supporting Apple Pay
// and Google Pay means a second gateway, so gateway choice moved behind this
// registry instead of branching inside the route. Every adapter implements the
// same interface, so the route is provider-agnostic:
//
//   name            string
//   isReady()       → boolean   — credentials present
//   supportsMethod(method) → boolean
//   createCheckout({ amountSen, method, description, customer, callbackUrl,
//                    redirectUrl, reference })
//                   → { ref, url, clientSecret?, raw }
//   fetchStatus(ref) → { paid, status, raw }
//   verifyWebhook({ body, rawBody, headers })
//                   → { valid, eventId, gatewayRef, paid, type, raw }
//   createRefund({ gatewayRef, amountSen, reason, raw })
//                   → { ref, status, raw }   (throws if unsupported)
//
// Adding a third gateway is a new file plus one line in PROVIDERS.
// ─────────────────────────────────────────────────────────────────────────────
import * as billplz from './billplz.js';
import * as stripe from './stripe.js';
import * as cash from './cash.js';

const PROVIDERS = {
  billplz: billplz.provider,
  stripe: stripe.provider,
  cash: cash.provider,
};

// Method → providers that can serve it, in preference order. The first *ready*
// provider wins, so a deployment without Stripe credentials still takes cards
// through Billplz rather than failing.
const METHOD_ROUTING = {
  fpx: ['billplz'],
  duitnow: ['billplz'],
  tng: ['billplz'],
  grabpay: ['billplz'],
  boost: ['billplz'],
  card: ['stripe', 'billplz'],
  applepay: ['stripe'],
  googlepay: ['stripe'],
  cash: ['cash'],
};

export const PAYMENT_METHODS = Object.keys(METHOD_ROUTING);

// Presentation metadata for GET /api/payments/methods. Kept here rather than in
// the front end so web and both Expo apps show the same list without drifting.
const METHOD_META = {
  fpx: { label: 'FPX Online Banking', icon: '🏦', sub: 'Maybank, CIMB, Public Bank, RHB', online: true },
  duitnow: { label: 'DuitNow', icon: '🇲🇾', sub: 'Pay from any Malaysian bank', online: true },
  card: { label: 'Credit / Debit Card', icon: '💳', sub: 'Visa, Mastercard', online: true },
  applepay: { label: 'Apple Pay', icon: '', sub: 'Pay with Touch ID or Face ID', online: true },
  googlepay: { label: 'Google Pay', icon: '🇬', sub: 'Pay with your saved cards', online: true },
  tng: { label: "Touch 'n Go eWallet", icon: '💚', sub: 'Instant e-wallet payment', online: true },
  grabpay: { label: 'GrabPay', icon: '🟢', sub: 'Pay with Grab credits', online: true },
  boost: { label: 'Boost', icon: '🚀', sub: 'Boost e-wallet', online: true },
  cash: { label: 'Cash on Service', icon: '💵', sub: 'Pay your professional at completion', online: false },
};

// ─── Unit conversion ─────────────────────────────────────────────────────────
// Payment.amount is in sen because that is what gateways transact in; everything
// else in the system is MYR. These two functions are the only place the two
// units meet — see the note on the Payment model in prisma/schema.prisma.
export const toSen = (myr) => Math.round((Number(myr) || 0) * 100);
export const fromSen = (sen) => Math.round(Number(sen) || 0) / 100;

// ─── Lookup ──────────────────────────────────────────────────────────────────
export function getProvider(name) {
  return PROVIDERS[name] || null;
}

/** The provider that should handle `method`, or null if none is configured. */
export function providerForMethod(method) {
  const candidates = METHOD_ROUTING[method] || [];
  for (const name of candidates) {
    const p = PROVIDERS[name];
    if (p?.isReady()) return p;
  }
  return null;
}

export function isMethodAvailable(method) {
  return Boolean(providerForMethod(method));
}

/**
 * The method list for the checkout UI. Unavailable methods are still returned,
 * flagged `available: false` — the client can then explain *why* a method is
 * missing rather than silently omitting it.
 */
export function listMethods() {
  return PAYMENT_METHODS.map((id) => {
    const provider = providerForMethod(id);
    return {
      id,
      ...METHOD_META[id],
      available: Boolean(provider),
      provider: provider?.name ?? null,
    };
  });
}

/** Providers that are configured — used by the health/readiness surface. */
export function readyProviders() {
  return Object.values(PROVIDERS).filter((p) => p.isReady()).map((p) => p.name);
}
