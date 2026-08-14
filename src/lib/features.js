/**
 * Feature flags.
 *
 * These gate consumer surfaces that exist as UI but have no backend yet. Every
 * one currently renders convincing hardcoded data — `Wallet` shows an
 * RM 128.50 balance from a `const MOCK` — so leaving them reachable risks a
 * customer believing a number the server has never seen.
 *
 * Default is OFF. Enable per-flag in `.env.local` for development or testing:
 *
 *     VITE_FEATURE_WALLET=true
 *     VITE_FEATURE_REWARDS=true
 *
 * When a backend lands, delete the flag and its route guard — do not flip the
 * default, so the gate can never be left on by accident.
 *
 * See the Account audit in docs/migration-status-report.md.
 */
const on = (v) => String(v).toLowerCase() === 'true';

export const FEATURES = {
  /** Wallet balance, ledger and top-up. Needs a wallet endpoint. */
  wallet: on(import.meta.env.VITE_FEATURE_WALLET),

  /** Saved cards / FPX / e-wallets. Needs a PCI-compliant tokenizer. */
  paymentMethods: on(import.meta.env.VITE_FEATURE_PAYMENT_METHODS),

  /** Membership tiers, loyalty points and offers — one product decision. */
  rewards: on(import.meta.env.VITE_FEATURE_REWARDS),

  /** Saved services and partners. */
  wishlist: on(import.meta.env.VITE_FEATURE_WISHLIST),

  /** Reviews the customer has written. */
  myReviews: on(import.meta.env.VITE_FEATURE_MY_REVIEWS),
};

export const isEnabled = (flag) => FEATURES[flag] === true;
