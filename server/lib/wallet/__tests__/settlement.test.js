// Unit tests for settlement period arithmetic — `node --test`.
//
// Periods are computed in Asia/Kuala_Lumpur (fixed UTC+8). A UTC-based boundary
// would file Sunday-evening MYT jobs into the wrong week, which is why these
// tests assert the exact UTC instants rather than just the labels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previousPeriod, settlementReference, PAYMENT_TERMS_DAYS } from '../settlement.js';

const iso = (d) => d.toISOString();

test('weekly period is the previous Mon 00:00 → Sun 23:59:59.999 MYT', () => {
  // Thursday 2026-07-30 MYT → previous week is Mon 20th to Sun 26th.
  const p = previousPeriod('weekly', new Date('2026-07-30T10:00:00Z'));
  assert.equal(iso(p.periodStart), '2026-07-19T16:00:00.000Z'); // Mon 20 Jul 00:00 MYT
  assert.equal(iso(p.periodEnd), '2026-07-26T15:59:59.999Z');   // Sun 26 Jul 23:59:59.999 MYT
  assert.equal(p.label, '2026W30');
});

test('the MYT/UTC offset moves the boundary — late Sunday UTC is already Monday MYT', () => {
  // This is the case a UTC-based implementation gets wrong. Both instants fall
  // on Sunday 26 July in UTC, but they land in different MYT weeks.

  // 17:00Z = Mon 27 Jul 01:00 MYT — a new week has begun, so the previous week
  // is the one that just closed on Sunday the 26th.
  const p = previousPeriod('weekly', new Date('2026-07-26T17:00:00Z'));
  assert.equal(iso(p.periodEnd), '2026-07-26T15:59:59.999Z');

  // 15:00Z = Sun 26 Jul 23:00 MYT — still inside the current week, so the
  // previous week is the earlier one ending Sunday the 19th.
  const q = previousPeriod('weekly', new Date('2026-07-26T15:00:00Z'));
  assert.equal(iso(q.periodEnd), '2026-07-19T15:59:59.999Z');
});

test('weekly periods are contiguous and exactly seven days', () => {
  const p = previousPeriod('weekly', new Date('2026-07-30T10:00:00Z'));
  const span = p.periodEnd.getTime() - p.periodStart.getTime();
  assert.equal(span, 7 * 86400000 - 1);
});

test('ISO week labels are correct across a year boundary', () => {
  assert.equal(previousPeriod('weekly', new Date('2026-01-05T10:00:00Z')).label, '2026W01');
  assert.equal(previousPeriod('weekly', new Date('2027-01-02T10:00:00Z')).label, '2026W52');
});

test('monthly period is the whole previous calendar month, MYT', () => {
  const p = previousPeriod('monthly', new Date('2026-07-30T10:00:00Z'));
  assert.equal(iso(p.periodStart), '2026-05-31T16:00:00.000Z'); // 1 Jun 00:00 MYT
  assert.equal(iso(p.periodEnd), '2026-06-30T15:59:59.999Z');   // 30 Jun 23:59:59.999 MYT
  assert.equal(p.label, '2026M06');
});

test('monthly period rolls the year back in January', () => {
  const p = previousPeriod('monthly', new Date('2026-01-15T10:00:00Z'));
  assert.equal(p.label, '2025M12');
});

test('settlement reference is deterministic and period-scoped', () => {
  const a = settlementReference('clx123abcdef', '2026W30');
  const b = settlementReference('clx123abcdef', '2026W30');
  const c = settlementReference('clx123abcdef', '2026W31');
  assert.equal(a, b, 'same partner + period must produce the same reference');
  assert.notEqual(a, c, 'different periods must not collide');
  assert.match(a, /^STL-2026W30-/);
});

test('payment terms give the partner a week after the period closes', () => {
  assert.equal(PAYMENT_TERMS_DAYS, 7);
});
