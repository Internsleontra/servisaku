import {
  Landmark, QrCode, CreditCard, Apple, Wallet, Rocket, Banknote, Smartphone,
} from 'lucide-react';

/**
 * Payment method → Lucide glyph, keyed by the method id the API returns.
 *
 * The server's `/api/payments/methods` still sends `icon` as an EMOJI string
 * (🏦, 🇲🇾, 💳 …). Phase 4 converted the client-side lists to Lucide components
 * but not this one, because it crosses a process boundary — the result was
 * `<pm.icon />` rendering as `<🇲🇾 />`, an unknown HTML tag: no icon, plus a
 * React warning per method.
 *
 * Icon choice belongs in the design layer, so the client maps by id and ignores
 * whatever `icon` the API sends. That also means the server can keep its
 * payload stable without dictating presentation.
 */
export const PAYMENT_METHOD_ICON = {
  fpx: Landmark,
  duitnow: QrCode,
  card: CreditCard,
  applepay: Apple,
  googlepay: Smartphone,
  tng: Wallet,
  grabpay: Wallet,
  boost: Rocket,
  cash: Banknote,
};

export const paymentIconFor = (id) => PAYMENT_METHOD_ICON[id] || CreditCard;
