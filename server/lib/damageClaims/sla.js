// ─────────────────────────────────────────────────────────────────────────────
// Damage claim SLA clocks and liability arithmetic.
//
// Pure — no DB, no clock of its own — so every boundary is unit testable.
// ─────────────────────────────────────────────────────────────────────────────

const HOUR_MS = 3600_000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Hours from submission for each stage of the resolution timeline. */
export const SLA_HOURS = {
  acknowledge: 24,
  partnerResponse: 72,
  investigation: 7 * 24,
  compensation: 14 * 24, // from approval, not from submission
};

/** A claim must be filed within this window of the job completing. */
export const REPORTING_WINDOW_HOURS = 48;

/** Above this, route to the partner's insurance rather than the wallet. */
export const INSURANCE_THRESHOLD = Number(process.env.DAMAGE_INSURANCE_THRESHOLD_MYR || 1000);

/** Sanity ceiling — above this, intake is manual rather than self-service. */
export const MAX_CLAIM_AMOUNT = Number(process.env.DAMAGE_MAX_CLAIM_MYR || 50000);

/** SLA due dates for a claim submitted at `submittedAt`. */
export function dueDates(submittedAt = new Date()) {
  const at = (hours) => new Date(submittedAt.getTime() + hours * HOUR_MS);
  return {
    acknowledgeDueAt: at(SLA_HOURS.acknowledge),
    responseDueAt: at(SLA_HOURS.partnerResponse),
    investigationDueAt: at(SLA_HOURS.investigation),
  };
}

/** Compensation deadline runs from approval, not from submission. */
export function compensationDueAt(approvedAt = new Date()) {
  return new Date(approvedAt.getTime() + SLA_HOURS.compensation * HOUR_MS);
}

/**
 * Is a claim filed within the reporting window?
 * A late claim is still accepted — flagged, not refused — because a customer
 * may genuinely discover damage after the fact. Admin decides what to do with it.
 */
export function isWithinWindow(completedAt, submittedAt = new Date()) {
  if (!completedAt) return true;
  const hours = (submittedAt.getTime() - new Date(completedAt).getTime()) / HOUR_MS;
  return hours <= REPORTING_WINDOW_HOURS;
}

/**
 * Which SLA clocks a claim has breached.
 * Only clocks relevant to the current stage are evaluated — a compensated claim
 * is not "overdue for a partner response".
 */
export function breaches(claim, now = new Date()) {
  const out = [];
  const past = (d) => d && new Date(d) < now;

  if (claim.status === 'submitted' && past(claim.acknowledgeDueAt)) out.push('acknowledge');
  if (['acknowledged', 'awaiting_partner_response'].includes(claim.status)
      && !claim.partnerRespondedAt && past(claim.responseDueAt)) out.push('partner_response');
  if (['acknowledged', 'awaiting_partner_response', 'investigating', 'awaiting_evidence'].includes(claim.status)
      && past(claim.investigationDueAt)) out.push('investigation');
  if (['approved', 'partially_approved', 'compensating'].includes(claim.status)
      && past(claim.compensationDueAt)) out.push('compensation');

  return out;
}

/**
 * Split an approved amount between the partner and the platform.
 *
 * The two halves must sum to the approved amount exactly — the platform takes
 * the remainder rather than a second multiplication, so rounding can never
 * leave or invent a sen.
 *
 * @returns {{ approvedAmount, partnerLiabilityPercent, partnerLiabilityAmount,
 *             platformAbsorbed, viaInsurance }}
 */
export function splitLiability(approvedAmount, partnerLiabilityPercent) {
  const approved = round2(approvedAmount);
  const percent = Math.min(100, Math.max(0, Number(partnerLiabilityPercent) || 0));
  const partnerLiabilityAmount = round2(approved * (percent / 100));
  const platformAbsorbed = round2(approved - partnerLiabilityAmount);
  return {
    approvedAmount: approved,
    partnerLiabilityPercent: percent,
    partnerLiabilityAmount,
    platformAbsorbed,
    // A large partner liability should go through their insurance rather than
    // being taken out of their earnings — PartnerDocument already holds the policy.
    viaInsurance: partnerLiabilityAmount >= INSURANCE_THRESHOLD,
  };
}

export { round2 };
