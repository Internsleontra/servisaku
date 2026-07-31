// Unit tests for the commission split — runs with `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { split, rateFor, COMMISSION_RATES, DEFAULT_RATE } from '../commission.js';

test('default rate is 20%', () => {
  const out = split(100);
  assert.equal(out.rate, 0.2);
  assert.equal(out.commission, 20);
  assert.equal(out.netPayout, 80);
});

test('commission and payout always sum back to gross', () => {
  // The historical bug: payouts.js used Math.round(price * 0.8), which rounded
  // partner earnings to whole ringgit and lost the remainder on every job.
  for (const gross of [149.9, 99.99, 0.01, 33.33, 1234.56, 7.77, 250.05]) {
    const { commission, netPayout } = split(gross);
    assert.equal(
      Math.round((commission + netPayout) * 100),
      Math.round(gross * 100),
      `split(${gross}) does not reconcile: ${commission} + ${netPayout}`,
    );
  }
});

test('sen are preserved, not rounded away', () => {
  const { netPayout } = split(149.9);
  assert.equal(netPayout, 119.92); // the old code produced 120
});

test('tier resolves from partnerProfile.tier', () => {
  assert.equal(rateFor({ partnerProfile: { tier: 'elite' } }), COMMISSION_RATES.elite);
  assert.equal(rateFor({ partnerProfile: { tier: 'new_partner' } }), COMMISSION_RATES.new_partner);
});

test('unknown or missing tier falls back to the default rate', () => {
  assert.equal(rateFor(null), DEFAULT_RATE);
  assert.equal(rateFor({}), DEFAULT_RATE);
  assert.equal(rateFor({ partnerProfile: {} }), DEFAULT_RATE);
  assert.equal(rateFor({ partnerProfile: { tier: 'platinum' } }), DEFAULT_RATE);
});

test('explicit rate overrides the tier', () => {
  const out = split(200, { partner: { partnerProfile: { tier: 'elite' } }, rate: 0.5 });
  assert.equal(out.commission, 100);
  assert.equal(out.netPayout, 100);
});

test('elite tier keeps more for the partner', () => {
  const std = split(1000);
  const elite = split(1000, { partner: { partnerProfile: { tier: 'elite' } } });
  assert.ok(elite.netPayout > std.netPayout);
  assert.equal(elite.commission, 150);
});

test('zero and non-numeric gross are safe', () => {
  assert.deepEqual(split(0), { gross: 0, rate: 0.2, commission: 0, netPayout: 0 });
  assert.deepEqual(split(null), { gross: 0, rate: 0.2, commission: 0, netPayout: 0 });
  assert.deepEqual(split(undefined), { gross: 0, rate: 0.2, commission: 0, netPayout: 0 });
});
