import test from 'node:test';
import assert from 'node:assert/strict';
import { split, rateFor, COMMISSION_RATES } from '../commission.js';
import { computePrice, DEFAULT_GLOBAL_CONFIG } from '../../dynamicPricing.js';

/* Regression tests for the escrow commission defect.
 *
 * EscrowLedger recorded the CUSTOMER's flat booking fee as the partner
 * commission, so a RM285 job took RM5 instead of RM57 and every partner payout
 * was overstated. These lock the two concepts apart. */

test('the booking fee is NOT the commission — RM285 splits to 228, not 280', () => {
  const { commission, netPayout } = split(285);
  assert.equal(commission, 57);
  assert.equal(netPayout, 228);
  assert.notEqual(netPayout, 280, 'RM285 - RM5 booking fee is not a valid partner payout');
});

test('the booking fee stays flat and small while commission scales', () => {
  const fee = DEFAULT_GLOBAL_CONFIG.bookingFee;
  assert.equal(fee, 5);
  for (const gross of [45, 110, 285, 1000]) {
    assert.equal(split(gross).commission, Math.round(gross * 0.2 * 100) / 100);
    assert.notEqual(split(gross).commission, fee, `commission collapsed to the flat fee at gross=${gross}`);
  }
});

test('every escrow split reconciles: commission + payout === gross', () => {
  for (const gross of [0, 0.05, 45, 89.9, 110, 245, 285, 1234567.89]) {
    const { commission, netPayout } = split(gross);
    assert.equal(
      Math.round((commission + netPayout) * 100),
      Math.round(gross * 100),
      `gross=${gross} does not reconcile`,
    );
  }
});

test('sen survive — the old whole-ringgit rounding is gone', () => {
  assert.equal(split(89.9).netPayout, 71.92);   // was 72
  assert.equal(split(0.05).netPayout, 0.04);    // was 0
  assert.equal(split(1234567.89).netPayout, 987654.31);
});

test('tier rates still apply and are not flattened to 20%', () => {
  const elite = split(285, { partner: { partnerProfile: { tier: 'elite' } } });
  const std = split(285);
  assert.equal(elite.rate, COMMISSION_RATES.elite);
  assert.equal(std.rate, 0.20);
  assert.ok(elite.netPayout > std.netPayout, 'elite partners must keep more');
  assert.equal(Math.round((elite.commission + elite.netPayout) * 100), 28500);
});

test('a partner with no tier falls back to 20%', () => {
  assert.equal(rateFor({ partnerProfile: { experience_years: 5 } }), 0.20);
  assert.equal(rateFor(null), 0.20);
});

test('computePrice emits bookingFee, and it never equals the commission', async () => {
  const service = { pricingType: 'FIXED', basePrice: 280, questions: [], sstEnabled: false };
  const priced = computePrice(service, {}, { globalConfig: DEFAULT_GLOBAL_CONFIG });
  assert.equal(priced.bookingFee, 5, 'booking fee should be the flat customer fee');
  // The legacy alias must keep existing for historical price_breakdown snapshots.
  assert.equal(priced.platformFee, priced.bookingFee);
  const { commission } = split(priced.total);
  assert.notEqual(commission, priced.bookingFee);
});

test('the booking fee is ADDED to the customer total, not deducted', () => {
  const service = { pricingType: 'FIXED', basePrice: 100, questions: [], sstEnabled: false };
  const priced = computePrice(service, {}, { globalConfig: DEFAULT_GLOBAL_CONFIG });
  assert.equal(priced.total, priced.subtotal + priced.bookingFee);
  assert.ok(priced.total > priced.subtotal, 'the customer pays more because of the booking fee');
});
