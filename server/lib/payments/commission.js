// ─────────────────────────────────────────────────────────────────────────────
// Commission — THE single source of truth for how a booking's money is split
// between ServisAku and the partner.
//
// Before this module the rate lived in three places with two different answers:
//   server/routes/payments.js  PLATFORM_FEE_RATE = 0.20
//   server/routes/payouts.js   PARTNER_RATE      = 0.8   (and rounded to whole
//                                                        ringgit, losing sen on
//                                                        every completed job)
//   src/lib/paymentEngine.js   COMMISSION_RATES  = tiered 0.15–0.25, never used
//                                                        by the server at all
// Everything that splits money now imports from here.
//
// All amounts are MYR. Rounding is 2dp, applied to the commission first and the
// payout taken as the remainder, so `commission + netPayout === gross` exactly —
// a split that doesn't reconcile to the cent is a reconciliation bug waiting to
// surface in a settlement.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Tier → platform commission rate. Promoted from src/lib/paymentEngine.js so the
// server, not the browser, decides what ServisAku charges.
export const COMMISSION_RATES = {
  default: 0.20,
  premium: 0.18,
  elite: 0.15,
  new_partner: 0.25,
};

export const DEFAULT_RATE = COMMISSION_RATES.default;

/**
 * Resolve the commission rate for a partner.
 *
 * Tier lives on User.partnerProfile.tier (Json) — no dedicated column exists yet,
 * and adding one for a value that is still being defined commercially would be
 * premature. Unknown/absent tier falls back to the default rate.
 *
 * @param {object|null} partner  a User row, or null
 * @returns {number} rate in [0,1]
 */
export function rateFor(partner) {
  const tier = partner?.partnerProfile?.tier;
  if (tier && Object.prototype.hasOwnProperty.call(COMMISSION_RATES, tier)) {
    return COMMISSION_RATES[tier];
  }
  return DEFAULT_RATE;
}

/**
 * Split a gross booking amount into ServisAku's commission and the partner's net.
 *
 * @param {number} gross    booking amount in MYR
 * @param {object} [opts]
 * @param {object} [opts.partner]  User row, for tier resolution
 * @param {number} [opts.rate]     explicit override (takes precedence over tier)
 * @returns {{ gross: number, rate: number, commission: number, netPayout: number }}
 */
export function split(gross, { partner, rate } = {}) {
  const g = round2(gross);
  const r = typeof rate === 'number' ? rate : rateFor(partner);
  const commission = round2(g * r);
  // Remainder, not a second multiplication — guarantees the two halves sum to gross.
  const netPayout = round2(g - commission);
  return { gross: g, rate: r, commission, netPayout };
}

export { round2 };
