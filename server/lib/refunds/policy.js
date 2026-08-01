// ─────────────────────────────────────────────────────────────────────────────
// Refund eligibility policy.
//
// This logic previously existed only in src/lib/paymentEngine.js
// (calcRefundAmount) — i.e. in the browser — while the API accepted whatever
// refund_amount the client sent. A customer could request any amount they liked.
// The rules now live here and the server decides; the front end may still call
// the preview endpoint so the customer sees the figure before requesting.
//
// Pure — no DB, no clock of its own — so every boundary is unit testable.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const HOUR_MS = 60 * 60 * 1000;

// Notice thresholds, in hours before the scheduled service.
export const FULL_REFUND_HOURS = 48;
export const PARTIAL_REFUND_HOURS = 4;

export const POLICIES = {
  CANCEL_GT_48H: 'cancel_gt_48h',
  CANCEL_4_TO_48H: 'cancel_4_to_48h',
  CANCEL_LT_4H: 'cancel_lt_4h',
  PARTNER_ACCEPTED: 'partner_accepted',
  PARTNER_NO_SHOW: 'partner_no_show',
  DISPUTE_PENDING: 'dispute_pending',
  NOT_ELIGIBLE: 'not_eligible',
  ALREADY_REFUNDED: 'already_refunded',
};

/**
 * Parse a booking's scheduled start into a Date.
 * Prefers scheduledStart; falls back to date + a "9:00 AM"-style time slot.
 */
export function scheduledStartOf(booking) {
  if (booking.scheduledStart) return new Date(booking.scheduledStart);
  const date = new Date(booking.date);
  if (!booking.timeSlot) return date;

  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(String(booking.timeSlot).trim());
  if (!match) return date;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  date.setHours(hour, minute, 0, 0);
  return date;
}

/**
 * How much of a booking is refundable, and under which rule.
 *
 * @param {object} booking          { price, status, date, timeSlot, scheduledStart }
 * @param {object} [opts]
 * @param {number} [opts.alreadyRefunded]  MYR already refunded on this booking
 * @param {string} [opts.reason]           free-text; `partner_no_show` overrides the tiers
 * @param {Date}   [opts.now]
 * @returns {{ amount, type, percent, policy, reason, hoursNotice }}
 */
export function eligibleRefund(booking, { alreadyRefunded = 0, reason, now = new Date() } = {}) {
  const price = round2(booking.price);
  const remaining = round2(price - alreadyRefunded);

  const none = (policy, why) => ({
    amount: 0, type: 'none', percent: 0, policy, reason: why, hoursNotice: null,
  });

  if (remaining <= 0) return none(POLICIES.ALREADY_REFUNDED, 'This booking has already been fully refunded');

  const hoursNotice = (scheduledStartOf(booking).getTime() - now.getTime()) / HOUR_MS;
  const build = (percent, policy, why) => {
    const amount = round2(Math.min(round2(price * (percent / 100)), remaining));
    return {
      amount,
      type: percent >= 100 ? 'full' : 'partial',
      percent,
      policy,
      reason: why,
      hoursNotice: round2(hoursNotice),
    };
  };

  // A partner no-show is always fully refundable regardless of notice — the
  // customer did nothing wrong and the tiers would penalise them for it.
  if (reason === 'partner_no_show') {
    return build(100, POLICIES.PARTNER_NO_SHOW, 'Full refund — the professional did not attend');
  }

  // Under dispute: hold the full amount pending review rather than pre-judging.
  if (booking.status === 'disputed') {
    return build(100, POLICIES.DISPUTE_PENDING, 'Full refund pending dispute review');
  }

  // Before anyone is assigned or has travelled, the notice tiers apply.
  if (['pending', 'assigned'].includes(booking.status)) {
    if (hoursNotice > FULL_REFUND_HOURS) return build(100, POLICIES.CANCEL_GT_48H, 'Full refund — more than 48 hours\' notice');
    if (hoursNotice > PARTIAL_REFUND_HOURS) return build(75, POLICIES.CANCEL_4_TO_48H, '75% refund — 4 to 48 hours\' notice');
    return build(50, POLICIES.CANCEL_LT_4H, '50% refund — less than 4 hours\' notice');
  }

  // A partner has accepted and may already have committed time or travel.
  if (booking.status === 'accepted') {
    return build(50, POLICIES.PARTNER_ACCEPTED, '50% refund — a professional had already accepted');
  }

  // Work has started or finished: no automatic refund. The route is a dispute,
  // where a human can weigh what actually happened.
  return none(POLICIES.NOT_ELIGIBLE, 'Not eligible for an automatic refund at this stage — please raise a dispute');
}

/**
 * Should this refund skip human approval?
 *
 * Only clean, in-policy cancellations auto-approve. Anything touching a started
 * job, a dispute, or a partner no-show gets a human, because those carry a
 * liability decision.
 */
export function isAutoApprovable(policy) {
  return [POLICIES.CANCEL_GT_48H, POLICIES.CANCEL_4_TO_48H, POLICIES.CANCEL_LT_4H].includes(policy);
}

export { round2 };
