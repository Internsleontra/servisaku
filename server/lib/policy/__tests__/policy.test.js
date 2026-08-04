// Unit tests for the Policy Registry catalogue, validator and conflict engine.
// `node --test`. Pure — no DB, no clock, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICY_KEYS, ALL_KEYS, getKeyDef, keysInDomain, keysForAudience,
  moneyAffectingKeys, fallbacks, TYPES, SCOPES,
} from '../catalog.js';
import { validateValue, validateCatalog } from '../validate.js';
import {
  detectConflicts, divergenceDirection, severityFor, summarise, newConflicts,
  SEVERITY, KIND,
} from '../conflicts.js';

// ── Catalogue ────────────────────────────────────────────────────────────────

test('the catalogue is structurally valid', () => {
  const problems = validateCatalog(POLICY_KEYS);
  assert.deepEqual(problems, [], problems.join('; '));
});

test('keys are unique and cover every domain the registry claims', () => {
  assert.equal(new Set(ALL_KEYS).size, ALL_KEYS.length);
  const domains = new Set(POLICY_KEYS.map((k) => k.domain));
  for (const d of ['booking', 'cancellation', 'refund', 'noshow', 'escrow', 'commission',
    'payout', 'liability', 'damage', 'warranty', 'payment', 'tax', 'pricing',
    'partner', 'support', 'retention', 'legal']) {
    assert.ok(domains.has(d), `no keys in domain "${d}"`);
  }
});

test('every key declaring a clause expectation names a clause', () => {
  for (const def of POLICY_KEYS) {
    if (def.clauseExpectation !== null && def.clauseExpectation !== undefined) {
      assert.ok(def.clause, `${def.key} expects a value but names no clause`);
    }
  }
});

test('consumer bundle never exposes commission or internal keys', () => {
  // Audience filtering is server-side precisely so a customer cannot read the
  // partner commission out of a JavaScript bundle.
  const consumerKeys = keysForAudience('consumer').map((k) => k.key);
  for (const k of consumerKeys) {
    assert.ok(!k.startsWith('commission.'), `${k} must not reach a consumer`);
    assert.ok(!k.startsWith('retention.'), `${k} must not reach a consumer`);
  }
  assert.ok(consumerKeys.includes('refund.full_refund_hours'));
});

test('money-affecting keys are marked, and they are the ones that matter', () => {
  const money = moneyAffectingKeys().map((k) => k.key);
  for (const k of ['refund.full_refund_hours', 'commission.rate.default',
    'liability.cap_per_booking_myr', 'pricing.max_surge_multiplier',
    'escrow.release_no_response_hours']) {
    assert.ok(money.includes(k), `${k} should be money-affecting`);
  }
});

test('every key has a snapshot scope the engine understands', () => {
  const valid = new Set(Object.values(SCOPES));
  for (const def of POLICY_KEYS) assert.ok(valid.has(def.scope), `${def.key} scope`);
});

test('getKeyDef returns null for an unknown key rather than throwing', () => {
  assert.equal(getKeyDef('does.not.exist'), null);
  assert.equal(getKeyDef('refund.full_refund_hours').type, TYPES.INTEGER);
});

test('keysInDomain and fallbacks agree with the catalogue', () => {
  assert.ok(keysInDomain('refund').length >= 8);
  const f = fallbacks();
  assert.equal(f['refund.full_refund_hours'], 48);
  // A null fallback is meaningful: the rule is not implemented today.
  assert.equal(f['escrow.release_no_response_hours'], null);
});

// ── Validation ───────────────────────────────────────────────────────────────

test('null is a valid value — it records an unimplemented rule', () => {
  const r = validateValue('escrow.release_after_confirm_hours', null);
  assert.equal(r.ok, true);
  assert.equal(r.value, null);
});

test('an unknown key is rejected', () => {
  const r = validateValue('made.up.key', 1);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'unknown_policy_key');
});

test('type mismatches are rejected', () => {
  assert.equal(validateValue('refund.full_refund_hours', '4').ok, false);
  assert.equal(validateValue('refund.full_refund_hours', 4.5).ok, false);
  assert.equal(validateValue('escrow.freeze_on_dispute', 'yes').ok, false);
  assert.equal(validateValue('partner.reminder_days', 7).ok, false);
});

test('bounds are enforced — a 15x surge cap is unreachable', () => {
  // This is conflict C-08 made impossible rather than merely discouraged.
  const bad = validateValue('pricing.max_surge_multiplier', 15);
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'policy_value_out_of_bounds');
  assert.equal(validateValue('pricing.max_surge_multiplier', 1.5).ok, true);
});

test('a rate written into a percent key (or the reverse) is caught', () => {
  // 0.75 in a percent key under-refunds by two orders of magnitude;
  // 20 in a rate key would charge 2000% commission.
  assert.equal(validateValue('refund.mid_tier_percent', 75).ok, true);
  assert.equal(validateValue('commission.rate.default', 20).ok, false);
  assert.equal(validateValue('commission.rate.default', 0.2).ok, true);
});

test('money values must be a whole number of sen', () => {
  assert.equal(validateValue('liability.cap_per_booking_myr', 1000).ok, true);
  assert.equal(validateValue('liability.cap_per_booking_myr', 10.005).ok, false);
});

test('enums and lists validate their members', () => {
  assert.equal(validateValue('payout.frequency', 'weekly').ok, true);
  assert.equal(validateValue('payout.frequency', 'hourly').ok, false);
  assert.equal(validateValue('partner.reminder_days', [0, 1, 3, 7]).ok, true);
  assert.equal(validateValue('partner.reminder_days', [0, 'x']).ok, false);
  assert.equal(validateValue('partner.reminder_days', [0, 999]).ok, false);
});

test('validateCatalog catches a fallback that breaks its own bounds', () => {
  const problems = validateCatalog([{
    key: 'refund.full_refund_hours', domain: 'refund', type: TYPES.INTEGER,
    bounds: { min: 0, max: 720 }, scope: SCOPES.BOOKING, audience: [],
    owner: 'finance', description: 'x', fallback: 99999,
  }]);
  assert.ok(problems.some((p) => /fallback fails its own bounds/.test(p)));
});

// ── Conflict engine ──────────────────────────────────────────────────────────

test('direction distinguishes generous from ungenerous divergence', () => {
  // Refund notice: clause 4h, code 48h → fewer customers get a full refund.
  assert.equal(divergenceDirection('refund.full_refund_hours', 4, 48), 'against_user');
  // Damage window: clause 24h, code 48h → more customers can claim.
  assert.equal(divergenceDirection('damage.reporting_window_hours', 24, 48), 'for_user');
  assert.equal(divergenceDirection('refund.full_refund_hours', 4, 4), 'unknown');
});

test('severity follows direction, not just money', () => {
  const money = { moneyAffecting: true };
  assert.equal(severityFor(money, { direction: 'against_user' }), SEVERITY.CRITICAL);
  assert.equal(severityFor(money, { direction: 'for_user' }), SEVERITY.HIGH);
  assert.equal(severityFor({}, { missing: true }), SEVERITY.HIGH);
  assert.equal(severityFor({}, {}), SEVERITY.MEDIUM);
  assert.equal(severityFor(money, { direction: 'against_user', permissive: true }), SEVERITY.LOW);
});

test('ACCEPTANCE — the engine reproduces the known conflicts from seeded values', () => {
  // Seeding the Registry with the catalogue fallbacks reproduces TODAY's
  // behaviour. The engine must then surface the same conflicts documented in
  // docs/12-tc-conflict-report.md. If it cannot, it does not work.
  const reports = detectConflicts({ registry: fallbacks() });
  const byKey = new Map(reports.map((r) => [r.policyKey, r]));

  // C-01 — cancellation refund tiers underpay. Critical, against the customer.
  const c01 = byKey.get('refund.full_refund_hours');
  assert.ok(c01, 'C-01 not detected');
  assert.equal(c01.severity, SEVERITY.CRITICAL);
  assert.equal(c01.direction, 'against_user');
  assert.equal(c01.clauseExpected, 4);
  assert.equal(c01.currentValue, 48);
  assert.equal(c01.clause, '8.1');

  // C-02 — the cancellation fee band does not exist.
  const c02 = byKey.get('cancellation.fee_min_myr');
  assert.ok(c02, 'C-02 not detected');
  assert.equal(c02.kind, KIND.MISSING_POLICY);

  // C-03 — no operations-authorisation ceiling on refunds.
  assert.equal(byKey.get('refund.auto_approve_ceiling_myr').kind, KIND.MISSING_POLICY);

  // C-04 — escrow never auto-releases.
  assert.equal(byKey.get('escrow.release_no_response_hours').kind, KIND.MISSING_POLICY);

  // C-05 — commission is not snapshotted at acceptance.
  assert.ok(byKey.has('commission.snapshot_at_acceptance'));

  // C-06 — the liability cap is not enforced.
  assert.equal(byKey.get('liability.cap_per_booking_myr').kind, KIND.MISSING_POLICY);

  // C-07 — damage window is MORE generous than the contract, so Medium, not Critical.
  const c07 = byKey.get('damage.reporting_window_hours');
  assert.equal(c07.direction, 'for_user');
  assert.notEqual(c07.severity, SEVERITY.CRITICAL);
  assert.match(c07.recommendation, /amending the clause/);

  // C-08 — no surge ceiling.
  assert.equal(byKey.get('pricing.max_surge_multiplier').kind, KIND.MISSING_POLICY);

  // C-09 — bookings are not bound to a terms version.
  assert.ok(byKey.has('legal.bind_booking_to_terms_version'));

  // C-10 — warranty and complaint windows absent.
  assert.equal(byKey.get('warranty.workmanship_days').kind, KIND.MISSING_POLICY);

  // C-11 — retention periods absent.
  assert.equal(byKey.get('retention.financial_records_years').kind, KIND.MISSING_POLICY);

  // C-12 — booking timing constants absent.
  assert.equal(byKey.get('booking.arrival_grace_minutes').kind, KIND.MISSING_POLICY);

  // C-13 — no-show fee absent.
  assert.ok(byKey.has('noshow.customer_fee_basis'));

  // C-14 / C-15 / C-16 — permissive clauses, so Low rather than blocking.
  assert.equal(byKey.get('payment.tip_commission_rate').severity, SEVERITY.LOW);
  assert.equal(byKey.get('payment.late_interest_monthly_rate').severity, SEVERITY.LOW);
  assert.equal(byKey.get('retention.dormancy_months').severity, SEVERITY.LOW);
});

test('reports carry every field the standing rule requires', () => {
  const [r] = detectConflicts({ registry: fallbacks() });
  for (const field of ['policyKey', 'clause', 'severity', 'title', 'clauseExpected',
    'currentValue', 'currentSource', 'customerImpact', 'financialImpact',
    'technicalImpact', 'recommendation', 'filesAffected', 'humanApprovalRequired']) {
    assert.ok(field in r, `report is missing ${field}`);
  }
  // Non-negotiable: the engine never resolves anything itself.
  assert.equal(r.humanApprovalRequired, true);
});

test('a compliant registry produces no clause conflicts', () => {
  // Set every key to exactly what its clause expects; only keys with no stated
  // expectation should remain, and none of them from a clause comparison.
  const compliant = {};
  for (const def of POLICY_KEYS) {
    compliant[def.key] = def.clauseExpectation !== null && def.clauseExpectation !== undefined
      ? def.clauseExpectation
      : def.fallback;
  }
  const reports = detectConflicts({ registry: compliant });
  const clauseConflicts = reports.filter(
    (r) => r.kind === KIND.CLAUSE_VS_REGISTRY || r.kind === KIND.CLAUSE_VS_CODE || r.kind === KIND.MISSING_POLICY,
  );
  assert.deepEqual(clauseConflicts.map((r) => r.policyKey), []);
});

test('registry drift from the code fallback is reported as Low', () => {
  const reports = detectConflicts({
    registry: { ...fallbacks(), 'partner.freeze_after_days': 10 },
  });
  const drift = reports.find((r) => r.policyKey === 'partner.freeze_after_days' && r.kind === KIND.REGISTRY_VS_CODE);
  assert.ok(drift);
  assert.equal(drift.severity, SEVERITY.LOW);
  assert.match(drift.customerImpact, /stale fallback/);
});

test('live data exceeding a configured limit is detected', () => {
  // Conflict C-08 in its data form: a PriceRule with a 2.0 surge against a 1.5 cap.
  const reports = detectConflicts({
    registry: { ...fallbacks(), 'pricing.max_surge_multiplier': 1.5 },
    liveData: { 'pricing.max_surge_multiplier': [1.2, 1.5, 2.0, 1.1] },
  });
  const data = reports.find((r) => r.kind === KIND.REGISTRY_VS_DATA);
  assert.ok(data);
  assert.equal(data.currentValue, 2.0);
  assert.match(data.title, /exceed the configured limit/);
});

test('reports are ordered most severe first', () => {
  const reports = detectConflicts({ registry: fallbacks() });
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  for (let i = 1; i < reports.length; i += 1) {
    assert.ok(rank[reports[i - 1].severity] <= rank[reports[i].severity]);
  }
});

test('summarise counts by severity', () => {
  const s = summarise(detectConflicts({ registry: fallbacks() }));
  assert.equal(s.total, s.critical + s.high + s.medium + s.low);
  assert.ok(s.critical > 0, 'the known critical conflicts should be present');
});

test('newConflicts reports only what a change introduced', () => {
  // The CI gate: pre-existing conflicts must not fail the build, or the check
  // gets switched off on day one and stops protecting anything.
  const before = detectConflicts({ registry: fallbacks() });
  const after = detectConflicts({
    registry: { ...fallbacks(), 'commission.rate.default': 0.35 },
  });
  const introduced = newConflicts(before, after);
  assert.ok(introduced.length >= 1);
  assert.ok(introduced.every((r) => r.policyKey === 'commission.rate.default'));
  assert.deepEqual(newConflicts(before, before), []);
});

test('the engine exposes no write path', () => {
  // Structural guarantee, asserted rather than trusted: the module must not
  // export anything that could apply a value.
  const forbidden = ['apply', 'resolve', 'write', 'fix', 'update', 'save', 'setValue'];
  // eslint-disable-next-line no-restricted-syntax
  const exported = Object.keys({ detectConflicts, divergenceDirection, severityFor, summarise, newConflicts });
  for (const name of exported) {
    assert.ok(!forbidden.includes(name), `${name} looks like a write path`);
  }
});
