// Unit tests for damage-claim SLA clocks and liability splitting — `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dueDates, compensationDueAt, isWithinWindow, splitLiability, breaches,
  SLA_HOURS, REPORTING_WINDOW_HOURS, INSURANCE_THRESHOLD,
} from '../sla.js';

const NOW = new Date('2026-07-31T12:00:00Z');
const hoursFrom = (base, h) => new Date(base.getTime() + h * 3600_000);

test('due dates follow the published timeline', () => {
  const d = dueDates(NOW);
  assert.equal(d.acknowledgeDueAt.getTime(), hoursFrom(NOW, SLA_HOURS.acknowledge).getTime());
  assert.equal(d.responseDueAt.getTime(), hoursFrom(NOW, SLA_HOURS.partnerResponse).getTime());
  assert.equal(d.investigationDueAt.getTime(), hoursFrom(NOW, SLA_HOURS.investigation).getTime());
});

test('compensation runs from approval, not from submission', () => {
  const approvedAt = hoursFrom(NOW, 100);
  assert.equal(compensationDueAt(approvedAt).getTime(), hoursFrom(approvedAt, SLA_HOURS.compensation).getTime());
});

test('the reporting window is 48 hours from completion', () => {
  const completed = hoursFrom(NOW, -REPORTING_WINDOW_HOURS + 1);
  assert.equal(isWithinWindow(completed, NOW), true);
  const late = hoursFrom(NOW, -REPORTING_WINDOW_HOURS - 1);
  assert.equal(isWithinWindow(late, NOW), false);
});

test('a claim with no completion timestamp is treated as in-window', () => {
  assert.equal(isWithinWindow(null, NOW), true);
});

// ─── Liability split ─────────────────────────────────────────────────────────

test('the two halves always sum to the approved amount', () => {
  for (const [amount, percent] of [[1000, 50], [333.33, 33], [149.9, 100], [0.05, 50], [4000, 0], [777.77, 67]]) {
    const s = splitLiability(amount, percent);
    assert.equal(
      Math.round((s.partnerLiabilityAmount + s.platformAbsorbed) * 100),
      Math.round(s.approvedAmount * 100),
      `${amount} @ ${percent}% does not reconcile`,
    );
  }
});

test('full partner fault charges the partner everything', () => {
  const s = splitLiability(1200, 100);
  assert.equal(s.partnerLiabilityAmount, 1200);
  assert.equal(s.platformAbsorbed, 0);
});

test('pre-existing damage charges the partner nothing', () => {
  const s = splitLiability(1200, 0);
  assert.equal(s.partnerLiabilityAmount, 0);
  assert.equal(s.platformAbsorbed, 1200);
});

test('a shared split rounds to 2dp on the partner side', () => {
  const s = splitLiability(333.33, 33);
  assert.equal(s.partnerLiabilityAmount, 110);
  assert.equal(s.platformAbsorbed, 223.33);
});

test('percent is clamped to 0..100 rather than trusted', () => {
  assert.equal(splitLiability(500, 150).partnerLiabilityPercent, 100);
  assert.equal(splitLiability(500, -20).partnerLiabilityPercent, 0);
  assert.equal(splitLiability(500, NaN).partnerLiabilityPercent, 0);
});

test('large partner liability routes to insurance', () => {
  assert.equal(splitLiability(INSURANCE_THRESHOLD, 100).viaInsurance, true);
  assert.equal(splitLiability(INSURANCE_THRESHOLD - 1, 100).viaInsurance, false);
  // A large claim with a small partner share does not go to insurance — it is
  // the partner's exposure that matters, not the headline amount.
  assert.equal(splitLiability(5000, 10).viaInsurance, false);
});

// ─── Breach detection ────────────────────────────────────────────────────────

const claim = (o) => ({ status: 'submitted', partnerRespondedAt: null, ...o });

test('an unacknowledged claim past 24h breaches', () => {
  const c = claim({ acknowledgeDueAt: hoursFrom(NOW, -1) });
  assert.deepEqual(breaches(c, NOW), ['acknowledge']);
});

test('a claim inside its window breaches nothing', () => {
  const c = claim({ acknowledgeDueAt: hoursFrom(NOW, 5), investigationDueAt: hoursFrom(NOW, 100) });
  assert.deepEqual(breaches(c, NOW), []);
});

test('a partner who responded does not breach the response clock', () => {
  const responded = claim({
    status: 'awaiting_partner_response',
    partnerRespondedAt: NOW,
    responseDueAt: hoursFrom(NOW, -5),
    investigationDueAt: hoursFrom(NOW, 100),
  });
  assert.equal(breaches(responded, NOW).includes('partner_response'), false);

  const silent = claim({
    status: 'awaiting_partner_response',
    responseDueAt: hoursFrom(NOW, -5),
    investigationDueAt: hoursFrom(NOW, 100),
  });
  assert.equal(silent.partnerRespondedAt, null);
  assert.equal(breaches(silent, NOW).includes('partner_response'), true);
});

test('only clocks relevant to the current stage are evaluated', () => {
  // A compensated claim is not "overdue for a partner response".
  const done = claim({
    status: 'compensated',
    acknowledgeDueAt: hoursFrom(NOW, -100),
    responseDueAt: hoursFrom(NOW, -100),
    investigationDueAt: hoursFrom(NOW, -100),
    compensationDueAt: hoursFrom(NOW, -100),
  });
  assert.deepEqual(breaches(done, NOW), []);
});

test('an approved but uncompensated claim breaches the compensation clock', () => {
  const c = claim({ status: 'approved', compensationDueAt: hoursFrom(NOW, -1) });
  assert.deepEqual(breaches(c, NOW), ['compensation']);
});
