// Unit tests for SST arithmetic — `node --test`. Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcSst, isServiceTaxable, FALLBACK_RATE } from '../index.js';

test('exclusive tax is added on top of the base', () => {
  const r = calcSst(100, 0.08);
  assert.equal(r.tax, 8);
  assert.equal(r.total, 108);
});

test('inclusive tax is backed out of the base', () => {
  // RM108 already containing 8% → RM8 tax, not RM8.64.
  const r = calcSst(108, 0.08, { inclusive: true });
  assert.equal(r.tax, 8);
  assert.equal(r.total, 108);
});

test('inclusive and exclusive are inverses', () => {
  const exclusive = calcSst(250, 0.08);
  const inclusive = calcSst(exclusive.total, 0.08, { inclusive: true });
  assert.equal(inclusive.tax, exclusive.tax);
  assert.equal(inclusive.total, exclusive.total);
});

test('the historical 6% rate still computes', () => {
  // A booking priced before 2024-03-01 must invoice at 6% forever.
  assert.equal(calcSst(100, 0.06).tax, 6);
  assert.equal(calcSst(100, 0.06).total, 106);
});

test('zero rate produces no tax but still returns the base', () => {
  const r = calcSst(150, 0);
  assert.equal(r.tax, 0);
  assert.equal(r.total, 150);
});

test('zero and negative bases are safe', () => {
  assert.equal(calcSst(0, 0.08).tax, 0);
  assert.equal(calcSst(-10, 0.08).tax, 0);
});

test('tax rounds to 2dp, never to whole ringgit', () => {
  // 149.90 × 8% = 11.992 → 11.99
  assert.equal(calcSst(149.9, 0.08).tax, 11.99);
  assert.equal(calcSst(149.9, 0.08).total, 161.89);
});

test('rounding never loses more than a sen against the exact figure', () => {
  for (const base of [33.33, 99.99, 0.05, 1234.56, 7.77]) {
    const { tax } = calcSst(base, 0.08);
    assert.ok(Math.abs(tax - base * 0.08) <= 0.005, `${base} → ${tax}`);
  }
});

test('fallback rate is the current 8%', () => {
  assert.equal(FALLBACK_RATE, 0.08);
});

// ─── Taxability ──────────────────────────────────────────────────────────────

test('a service is taxable only when sstEnabled is set', () => {
  assert.equal(isServiceTaxable({ sstEnabled: false, slug: 'x' }, null), false);
  assert.equal(isServiceTaxable({ sstEnabled: true, slug: 'x' }, null), true);
  assert.equal(isServiceTaxable(null, null), false);
});

test('an empty appliesTo means every taxable supply', () => {
  const service = { sstEnabled: true, slug: 'aircon-service' };
  assert.equal(isServiceTaxable(service, { appliesTo: [] }), true);
  assert.equal(isServiceTaxable(service, { appliesTo: null }), true);
});

test('appliesTo narrows by service slug or category', () => {
  const service = { sstEnabled: true, slug: 'aircon-service', categoryId: 'cat-1' };
  assert.equal(isServiceTaxable(service, { appliesTo: ['aircon-service'] }), true);
  assert.equal(isServiceTaxable(service, { appliesTo: ['cat-1'] }), true);
  assert.equal(isServiceTaxable(service, { appliesTo: ['plumbing'] }), false);
});
