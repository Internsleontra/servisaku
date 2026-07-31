// ─────────────────────────────────────────────────────────────────────────────
// Overdue-commission enforcement ladder.
//
// A partner who collects cash owes ServisAku the commission. When a settlement
// passes its due date the response escalates in steps rather than jumping
// straight to a ban:
//
//   due          → reminder
//   +1/+3/+7d    → escalating reminders
//   +7d          → freeze new bookings   (excluded from dispatch)
//   +14d         → suspend payouts       (cannot withdraw earnings)
//   any time     → admin override
//
// Two deliberate softeners:
//   • `creditLimit` grace — nobody is frozen over RM 3.40. Enforcement only
//     applies once the debt exceeds the wallet's credit limit.
//   • Freezing blocks *new* dispatch only. Jobs already accepted continue; a
//     partner mid-job must be able to finish and get paid.
//
// Deliberately pure — no DB, no clock of its own — so every rung is unit
// testable. server/lib/wallet/settlement.js applies the result.
// ─────────────────────────────────────────────────────────────────────────────

export const REMINDER_DAYS = [0, 1, 3, 7];
export const FREEZE_AFTER_DAYS = 7;
export const SUSPEND_PAYOUTS_AFTER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days `date` is in the past relative to `now`. Negative if still future. */
export function daysOverdue(dueDate, now = new Date()) {
  if (!dueDate) return 0;
  return Math.floor((now.getTime() - new Date(dueDate).getTime()) / DAY_MS);
}

/**
 * Decide what enforcement state a partner should be in.
 *
 * @param {object} wallet       PartnerWallet-shaped ({ outstandingCommission, creditLimit })
 * @param {object[]} settlements unpaid settlements ({ dueDate, status })
 * @param {Date} [now]
 * @returns {{ shouldFreeze: boolean, shouldSuspendPayouts: boolean,
 *             maxDaysOverdue: number, withinGrace: boolean, reason: string|null }}
 */
export function evaluate(wallet, settlements = [], now = new Date()) {
  const outstanding = Number(wallet?.outstandingCommission) || 0;
  const creditLimit = Number(wallet?.creditLimit) || 0;

  const unpaid = settlements.filter((s) => ['pending', 'partially_paid', 'overdue'].includes(s.status));
  const maxDaysOverdue = unpaid.reduce((max, s) => Math.max(max, daysOverdue(s.dueDate, now)), 0);

  // Grace: a trivial debt never triggers enforcement, however old it is.
  const withinGrace = outstanding <= creditLimit;
  if (withinGrace || maxDaysOverdue <= 0) {
    return { shouldFreeze: false, shouldSuspendPayouts: false, maxDaysOverdue, withinGrace, reason: null };
  }

  const shouldFreeze = maxDaysOverdue >= FREEZE_AFTER_DAYS;
  const shouldSuspendPayouts = maxDaysOverdue >= SUSPEND_PAYOUTS_AFTER_DAYS;
  const reason = shouldFreeze
    ? `Commission of RM ${outstanding.toFixed(2)} overdue by ${maxDaysOverdue} day(s)`
    : null;

  return { shouldFreeze, shouldSuspendPayouts, maxDaysOverdue, withinGrace, reason };
}

/**
 * Should a reminder go out today, given how many have already been sent?
 * Returns the rung reached, or null when the next rung isn't due yet — so a
 * daily worker sends at most one reminder per escalation step.
 */
export function nextReminderDue(settlement, now = new Date()) {
  const overdue = daysOverdue(settlement.dueDate, now);
  if (overdue < 0) return null;
  const sent = settlement.remindersSent || 0;
  const rung = REMINDER_DAYS.findIndex((d, i) => i >= sent && overdue >= d);
  if (rung === -1 || rung < sent) return null;
  return { rung, daysOverdue: overdue, isOverdue: overdue > 0 };
}
