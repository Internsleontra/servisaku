// FixMate Payment Engine
import { servisaku } from '@/api/servisakuClient';

export const COMMISSION_RATES = {
  default:       0.20,
  premium:       0.18,
  elite:         0.15,
  new_partner:   0.25,
};

/**
 * @deprecated The SST rate is server-authoritative — read it from
 * `GET /api/tax/config` (via `servisaku.tax.config()`), which resolves the rate
 * in force from TaxConfig and keeps historical bookings on their original rate.
 *
 * This constant was 0.06 while the pricing engine used 0.08, and because the
 * front end recomputed the total for display, customers were shown a figure the
 * gateway never charged. Kept only so any remaining importer still resolves;
 * it now matches the server default instead of contradicting it.
 */
export const TAX_RATE = 0.08;

export const PAYMENT_METHODS = [
  { id: 'fpx',      label: 'FPX Online Banking',     icon: '🏦', sub: 'Maybank, CIMB, Public Bank, RHB' },
  { id: 'duitnow',  label: 'DuitNow QR',             icon: '🇲🇾', sub: 'Scan with any banking app' },
  { id: 'tng',      label: "Touch 'n Go eWallet",    icon: '💚', sub: 'Instant, cashback enabled' },
  { id: 'visa',     label: 'Visa / Mastercard',       icon: '💳', sub: 'Credit or Debit card' },
  { id: 'grabpay',  label: 'GrabPay',                icon: '🟢', sub: 'Pay with Grab credits' },
  { id: 'cash',     label: 'Cash on Service',         icon: '💵', sub: 'Pay partner at completion' },
];

/**
 * @deprecated Display the server's figures instead of recomputing them.
 * A booking's authoritative amounts live in `Booking.price` and
 * `Booking.price_breakdown` (the snapshot taken at booking time), and an issued
 * invoice carries them verbatim. Recomputing here is what produced a checkout
 * total the gateway never charged.
 *
 * `rate` defaults to TAX_RATE only as a last resort — pass the rate from
 * `servisaku.tax.config()` when a live figure is genuinely needed.
 */
export function calcPriceBreakdown(subtotal, couponDiscount = 0, rate = TAX_RATE) {
  const discounted = subtotal - couponDiscount;
  const tax = parseFloat((discounted * rate).toFixed(2));
  const total = parseFloat((discounted + tax).toFixed(2));
  return { subtotal, couponDiscount, taxable: discounted, tax, total, rate };
}

export function calcPartnerPayout(grossAmount, partnerTier = 'default') {
  const rate = COMMISSION_RATES[partnerTier] || COMMISSION_RATES.default;
  const commission = parseFloat((grossAmount * rate).toFixed(2));
  const platformFee = commission;
  const net = parseFloat((grossAmount - commission).toFixed(2));
  return { grossAmount, commissionRate: rate * 100, commission, platformFee, net };
}

export function calcRefundAmount(booking, reason) {
  const price = booking.price || 0;
  const hoursUntilService = (new Date(`${booking.date}T${parseTime(booking.time_slot)}`).getTime() - Date.now()) / 3600000;

  if (['pending', 'assigned'].includes(booking.status)) {
    if (hoursUntilService > 48) return { amount: price, type: 'full', pct: 100, reason: 'Full refund — >48h notice' };
    if (hoursUntilService > 4)  return { amount: parseFloat((price * 0.75).toFixed(2)), type: 'partial', pct: 75, reason: '75% refund — 4–48h notice' };
    return { amount: parseFloat((price * 0.5).toFixed(2)), type: 'partial', pct: 50, reason: '50% refund — <4h notice' };
  }
  if (booking.status === 'accepted') return { amount: parseFloat((price * 0.5).toFixed(2)), type: 'partial', pct: 50, reason: '50% — partner already accepted' };
  if (booking.status === 'disputed') return { amount: price, type: 'full', pct: 100, reason: 'Dispute — full refund pending review' };
  return { amount: 0, type: 'none', pct: 0, reason: 'No refund eligible at this stage' };
}

function parseTime(slot) {
  if (!slot) return '08:00:00';
  const [time, period] = slot.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

// Create escrow entry after payment
export async function createEscrowEntry(booking, paymentId) {
  const payout = calcPartnerPayout(booking.price || 0);
  const tax = parseFloat((booking.price * TAX_RATE).toFixed(2));
  const releaseAt = new Date(Date.now() + 48 * 3600000).toISOString();
  return servisaku.entities.EscrowLedger.create({
    booking_id: booking.id,
    payment_id: paymentId,
    consumer_email: booking.consumer_email,
    partner_email: booking.partner_email,
    gross_amount: booking.price,
    platform_fee: payout.commission,
    partner_payout: payout.net,
    tax_amount: tax,
    status: 'held',
    held_at: new Date().toISOString(),
    release_at: releaseAt,
  });
}

// Release escrow to partner
export async function releaseEscrow(escrowId, releasedBy = 'consumer') {
  await servisaku.entities.EscrowLedger.update(escrowId, {
    status: 'released',
    released_at: new Date().toISOString(),
    released_by: releasedBy,
  });
}

// Freeze escrow for dispute
export async function freezeEscrow(escrowId, reason) {
  await servisaku.entities.EscrowLedger.update(escrowId, {
    status: 'frozen',
    frozen_at: new Date().toISOString(),
    freeze_reason: reason,
  });
}

// Schedule payout after escrow release
export async function schedulePartnerPayout(escrow, booking) {
  const payout = calcPartnerPayout(booking.price);
  const period = new Date().toISOString().slice(0, 7);
  const scheduledDate = new Date(Date.now() + 2 * 24 * 3600000).toISOString().split('T')[0];
  return servisaku.entities.PayoutRecord.create({
    partner_email: booking.partner_email,
    partner_name: booking.partner_name,
    booking_id: booking.id,
    escrow_id: escrow.id,
    gross_earning: payout.grossAmount,
    commission_rate: payout.commissionRate,
    commission_amount: payout.commission,
    tax_deduction: 0,
    net_payout: payout.net,
    status: 'scheduled',
    payout_method: 'duitnow',
    scheduled_date: scheduledDate,
    period_month: period,
  });
}

export function formatRM(amount) {
  return `RM${Number(amount || 0).toFixed(2)}`;
}