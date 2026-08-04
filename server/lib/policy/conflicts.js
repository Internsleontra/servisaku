// ─────────────────────────────────────────────────────────────────────────────
// Conflict detection engine.
//
// Compares four sources of the same business rule and reports where they
// disagree:
//
//   1. the Terms & Conditions   (catalogue `clause` + `clauseExpectation`)
//   2. the Registry             (the active PolicyVersion value)
//   3. the code                 (the catalogue `fallback`)
//   4. live data                (rows that can violate a Registry bound)
//
// THE ENGINE NEVER WRITES A VALUE AND NEVER EDITS CODE. It emits reports. Every
// resolution is a human decision recorded on the report — that is the standing
// rule from docs/12, expressed as a module with no write path.
//
// Pure — the caller supplies the Registry values and any live data. That keeps
// every rule in here unit testable, and means the same function runs in CI
// (against seeded values) and against production.
// ─────────────────────────────────────────────────────────────────────────────
import { POLICY_KEYS, getKeyDef } from './catalog.js';

export const SEVERITY = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

export const KIND = {
  CLAUSE_VS_REGISTRY: 'clause_vs_registry',
  CLAUSE_VS_CODE: 'clause_vs_code',
  REGISTRY_VS_CODE: 'registry_vs_code',
  REGISTRY_VS_DATA: 'registry_vs_data',
  MISSING_POLICY: 'missing_policy',
};

/**
 * Direction is the difference between "we are more generous than we promised"
 * (Medium — nobody is harmed) and "we are less generous than we promised"
 * (Critical — someone is out of pocket). Getting it backwards would bury the
 * conflicts that matter under the ones that do not.
 *
 * @see THRESHOLD_DIRECTION below.
 */

/**
 * For a threshold key, does a value further from the clause hurt the user?
 *
 * `refund.full_refund_hours` is the instructive case: the clause says 4, the code
 * says 48. A HIGHER value means fewer customers qualify for a full refund, so the
 * customer is worse off. For `damage.reporting_window_hours` the clause says 24
 * and the code says 48 — a higher value means MORE customers can claim, so the
 * customer is better off.
 *
 * The difference is whether the threshold is a gate the user must beat (refund
 * notice) or a window they must fit inside (claim reporting). Declared per key
 * rather than inferred, because inferring it is how you get it wrong silently.
 */
const THRESHOLD_DIRECTION = {
  'refund.full_refund_hours': 'lower_is_generous',
  'cancellation.free_window_hours': 'lower_is_generous',
  'refund.mid_tier_percent': 'higher_is_generous',
  'refund.low_tier_percent': 'higher_is_generous',
  'refund.partner_accepted_percent': 'higher_is_generous',
  'refund.processing_days_max': 'lower_is_generous',
  'refund.processing_days_min': 'lower_is_generous',
  'refund.initiation_business_days': 'lower_is_generous',
  'damage.reporting_window_hours': 'higher_is_generous',
  'warranty.workmanship_days': 'higher_is_generous',
  'warranty.complaint_window_hours.cleaning': 'higher_is_generous',
  'warranty.complaint_window_hours.workmanship': 'higher_is_generous',
  'liability.cap_per_booking_myr': 'higher_is_generous',
  'liability.cap_per_12_months_myr': 'higher_is_generous',
  'pricing.max_surge_multiplier': 'lower_is_generous',
  'support.sla_first_response_hours.normal': 'lower_is_generous',
  'booking.arrival_grace_minutes': 'higher_is_generous',
  'partner.appeal_window_days': 'higher_is_generous',
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Which way does this divergence cut?
 * @returns {'against_user'|'for_user'|'unknown'}
 */
export function divergenceDirection(key, expected, actual) {
  if (!isNum(expected) || !isNum(actual) || expected === actual) return 'unknown';
  const dir = THRESHOLD_DIRECTION[key];
  if (!dir) return 'unknown';
  const actualIsHigher = actual > expected;
  if (dir === 'higher_is_generous') return actualIsHigher ? 'for_user' : 'against_user';
  return actualIsHigher ? 'against_user' : 'for_user';
}

/**
 * Severity for a clause-vs-value divergence.
 *
 * Money + against the user ⇒ Critical. Money either way ⇒ High. A contractual
 * control that does not exist at all ⇒ High. Everything else ⇒ Medium, unless
 * the clause is permissive, in which case Low.
 */
export function severityFor(def, { direction, missing = false, permissive = false }) {
  if (permissive) return SEVERITY.LOW;
  if (def.moneyAffecting && direction === 'against_user') return SEVERITY.CRITICAL;
  if (def.moneyAffecting) return SEVERITY.HIGH;
  if (missing) return SEVERITY.HIGH;
  return SEVERITY.MEDIUM;
}

/**
 * Clauses drafted permissively ("may"), where absence is not a breach.
 * Kept as data so a drafting change is a one-line edit, not a re-read of the
 * whole contract.
 */
const PERMISSIVE_CLAUSES = new Set(['5.12', '10.12', '7.12', '29.3']);

/**
 * Run the engine.
 *
 * @param {object} input
 * @param {object} [input.registry]   { key: value } active Registry values. Omit a key
 *                                    to mean "not configured", which falls back to code.
 * @param {object} [input.liveData]   { key: [values] } observed values that must respect
 *                                    a Registry bound — e.g. PriceRule surge multipliers.
 * @param {Array}  [input.keys]       key definitions; defaults to the whole catalogue
 * @returns {Array} conflict reports, most severe first
 */
export function detectConflicts({ registry = {}, liveData = {}, keys = POLICY_KEYS } = {}) {
  const found = [];

  for (const def of keys) {
    const configured = Object.prototype.hasOwnProperty.call(registry, def.key);
    // What the platform actually does: the Registry when configured, else the code.
    const effective = configured ? registry[def.key] : def.fallback;
    const source = configured ? 'registry' : 'code';
    const permissive = PERMISSIVE_CLAUSES.has(def.clause);

    // ── 1 & 2. The contract states a value; compare it to what we do ─────────
    if (def.clause && def.clauseExpectation !== null && def.clauseExpectation !== undefined) {
      const expected = def.clauseExpectation;

      if (effective === null || effective === undefined) {
        // The clause states a rule and nothing implements it.
        found.push(report(def, {
          kind: KIND.MISSING_POLICY,
          severity: severityFor(def, { direction: 'against_user', missing: true, permissive }),
          expected,
          actual: null,
          source: null,
          summary: `No implementation for a rule stated in clause ${def.clause}`,
          customerImpact: permissive
            ? 'None currently — the clause is permissive, so its absence is not a breach.'
            : `The platform does not implement ${def.description.toLowerCase()} Clause ${def.clause} states it applies.`,
        }));
      } else if (!same(effective, expected)) {
        const direction = divergenceDirection(def.key, expected, effective);
        found.push(report(def, {
          kind: source === 'registry' ? KIND.CLAUSE_VS_REGISTRY : KIND.CLAUSE_VS_CODE,
          severity: severityFor(def, { direction, permissive }),
          expected,
          actual: effective,
          source,
          direction,
          summary: `Clause ${def.clause} states ${fmt(expected, def)}; the platform applies ${fmt(effective, def)}`,
          customerImpact: impactSentence(def, expected, effective, direction),
        }));
      }
    }

    // ── 3. Registry has drifted from the code fallback ───────────────────────
    // Not a contract breach, but it means an outage would change behaviour —
    // the fallback is meant to be the documented default, not a stale value.
    if (configured && def.fallback !== null && def.fallback !== undefined
        && !same(registry[def.key], def.fallback)) {
      found.push(report(def, {
        kind: KIND.REGISTRY_VS_CODE,
        severity: SEVERITY.LOW,
        expected: registry[def.key],
        actual: def.fallback,
        source: 'code',
        summary: `Code fallback (${fmt(def.fallback, def)}) no longer matches the Registry (${fmt(registry[def.key], def)})`,
        customerImpact: 'None while the Registry is reachable. If it is unavailable, behaviour would silently revert to the stale fallback.',
      }));
    }

    // ── 4. Live data violating a Registry bound ──────────────────────────────
    const observed = liveData[def.key];
    if (Array.isArray(observed) && isNum(effective)) {
      const violations = observed.filter((v) => isNum(v) && v > effective);
      if (violations.length > 0) {
        found.push(report(def, {
          kind: KIND.REGISTRY_VS_DATA,
          severity: def.moneyAffecting ? SEVERITY.HIGH : SEVERITY.MEDIUM,
          expected: effective,
          actual: Math.max(...violations),
          source: 'database',
          summary: `${violations.length} live value(s) exceed the configured limit of ${fmt(effective, def)}`,
          customerImpact: `Configuration in the database exceeds the policy limit — the highest observed is ${fmt(Math.max(...violations), def)}.`,
        }));
      }
    }
  }

  const order = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW];
  return found.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}

function report(def, o) {
  return {
    policyKey: def.key,
    domain: def.domain,
    clause: def.clause || null,
    kind: o.kind,
    severity: o.severity,
    status: 'open',
    title: o.summary,
    clauseExpected: o.expected ?? null,
    currentValue: o.actual ?? null,
    currentSource: o.source,
    direction: o.direction || 'unknown',
    customerImpact: o.customerImpact,
    financialImpact: def.moneyAffecting
      ? { moneyAffecting: true, direction: o.direction || 'unknown', unit: def.unit }
      : { moneyAffecting: false },
    technicalImpact: def.source
      ? `Value lives at ${def.source}. Consumers of "${def.key}" must be updated together.`
      : `No implementation exists. Adding one touches the ${def.domain} module and every surface that states this rule.`,
    recommendation: recommend(def, o),
    filesAffected: def.source ? [def.source] : [],
    owner: def.owner,
    humanApprovalRequired: true, // always. The engine has no write path.
    detectedBy: 'engine',
  };
}

function recommend(def, o) {
  if (o.kind === KIND.MISSING_POLICY) {
    return `Implement ${def.key} and seed it via an approved change request, or amend clause ${def.clause} if the rule is not intended.`;
  }
  if (o.kind === KIND.REGISTRY_VS_CODE) {
    return `Update the catalogue fallback for ${def.key} to match the approved Registry value.`;
  }
  if (o.kind === KIND.REGISTRY_VS_DATA) {
    return `Correct the offending rows, and clamp on write so the limit cannot be exceeded again.`;
  }
  if (o.direction === 'for_user') {
    return `The platform is more generous than clause ${def.clause}. Recommend amending the clause to match, since narrowing it is a material change requiring notice.`;
  }
  return `Change ${def.key} to ${JSON.stringify(o.expected)} via an approved change request, or amend clause ${def.clause}. Requires human approval either way.`;
}

function impactSentence(def, expected, actual, direction) {
  if (direction === 'against_user') {
    return `Users receive less than clause ${def.clause} entitles them to: the contract states ${fmt(expected, def)} and the platform applies ${fmt(actual, def)}.`;
  }
  if (direction === 'for_user') {
    return `The platform is more generous than clause ${def.clause} requires (${fmt(actual, def)} against ${fmt(expected, def)}). No user is disadvantaged, but the published terms and the product disagree.`;
  }
  return `The platform applies ${fmt(actual, def)} where clause ${def.clause} states ${fmt(expected, def)}.`;
}

function fmt(value, def) {
  if (value === null || value === undefined) return 'nothing';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  if (def.unit === 'myr') return `RM ${Number(value).toFixed(2)}`;
  if (def.unit === 'rate') return `${(Number(value) * 100).toFixed(2)}%`;
  if (def.unit === 'percent') return `${value}%`;
  if (def.unit) return `${value} ${def.unit}`;
  return String(value);
}

/** Group reports by severity, for a dashboard or a CI summary. */
export function summarise(reports) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of reports) counts[r.severity] += 1;
  return { total: reports.length, ...counts };
}

/**
 * Conflicts introduced by a proposed change — the CI gate.
 *
 * Blocking on pre-existing conflicts would fail the first run after adoption on
 * all 16 known issues and get the check switched off. Blocking on NEWLY
 * introduced ones is the check that actually holds the line.
 */
export function newConflicts(before, after) {
  const key = (r) => `${r.policyKey}::${r.kind}::${r.clause}`;
  const seen = new Set(before.map(key));
  return after.filter((r) => !seen.has(key(r)));
}

export { getKeyDef };
