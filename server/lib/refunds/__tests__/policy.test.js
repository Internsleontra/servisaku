// Unit tests for refund eligibility — `node --test`. Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eligibleRefund, isAutoApprovable, scheduledStartOf, POLICIES,
  FULL_REFUND_HOURS, PARTIAL_REFUND_HOURS,
} from '../policy.js';

const NOW = new Date('2026-07-31T12:00:00+08:00');
const inHours = (h) => new Date(NOW.getTime() + h * 3600_000);
const booking = (overrides = {}) => ({
  price: 200, status: 'pending', date: inHours(72), timeSlot: null, scheduledStart: null, ...overrides,
});

test('more than 48 hours notice is a full refund', () => {
  const r = eligibleRefund(booking({ scheduledStart: inHours(72) }), { now: NOW });
  assert.equal(r.percent, 100);
  assert.equal(r.amount, 200);
  assert.equal(r.policy, POLICIES.CANCEL_GT_48H);
});

test('between 4 and 48 hours is 75%', () => {
  const r = eligibleRefund(booking({ scheduledStart: inHours(24) }), { now: NOW });
  assert.equal(r.percent, 75);
  assert.equal(r.amount, 150);
  assert.equal(r.policy, POLICIES.CANCEL_4_TO_48H);
});

test('less than 4 hours is 50%', () => {
  const r = eligibleRefund(booking({ scheduledStart: inHours(2) }), { now: NOW });
  assert.equal(r.percent, 50);
  assert.equal(r.amount, 100);
  assert.equal(r.policy, POLICIES.CANCEL_LT_4H);
});

test('the 48-hour boundary is exclusive', () => {
  // Exactly 48h is NOT "more than 48h" — it falls into the 75% band.
  const at = eligibleRefund(booking({ scheduledStart: inHours(FULL_REFUND_HOURS) }), { now: NOW });
  assert.equal(at.percent, 75);
  const just = eligibleRefund(booking({ scheduledStart: inHours(FULL_REFUND_HOURS + 0.01) }), { now: NOW });
  assert.equal(just.percent, 100);
});

test('the 4-hour boundary is exclusive', () => {
  const at = eligibleRefund(booking({ scheduledStart: inHours(PARTIAL_REFUND_HOURS) }), { now: NOW });
  assert.equal(at.percent, 50);
  const just = eligibleRefund(booking({ scheduledStart: inHours(PARTIAL_REFUND_HOURS + 0.01) }), { now: NOW });
  assert.equal(just.percent, 75);
});

test('a past-due booking still resolves (negative notice)', () => {
  const r = eligibleRefund(booking({ scheduledStart: inHours(-5) }), { now: NOW });
  assert.equal(r.percent, 50);
  assert.ok(r.hoursNotice < 0);
});

test('an accepted booking is capped at 50% regardless of notice', () => {
  const r = eligibleRefund(booking({ status: 'accepted', scheduledStart: inHours(200) }), { now: NOW });
  assert.equal(r.percent, 50);
  assert.equal(r.policy, POLICIES.PARTNER_ACCEPTED);
});

test('a partner no-show is always fully refundable', () => {
  // Even with zero notice — the customer did nothing wrong.
  const r = eligibleRefund(booking({ status: 'completed', scheduledStart: inHours(-1) }), {
    reason: 'partner_no_show', now: NOW,
  });
  assert.equal(r.percent, 100);
  assert.equal(r.policy, POLICIES.PARTNER_NO_SHOW);
});

test('a disputed booking holds the full amount pending review', () => {
  const r = eligibleRefund(booking({ status: 'disputed' }), { now: NOW });
  assert.equal(r.percent, 100);
  assert.equal(r.policy, POLICIES.DISPUTE_PENDING);
});

test('a started or completed job gets no automatic refund', () => {
  for (const status of ['started', 'completed', 'en_route', 'arrived']) {
    const r = eligibleRefund(booking({ status }), { now: NOW });
    assert.equal(r.amount, 0, status);
    assert.equal(r.policy, POLICIES.NOT_ELIGIBLE);
    assert.match(r.reason, /dispute/);
  }
});

test('prior refunds cap what remains', () => {
  const r = eligibleRefund(booking({ scheduledStart: inHours(72) }), { alreadyRefunded: 150, now: NOW });
  assert.equal(r.amount, 50); // 100% of 200 clamped to the remaining 50
});

test('a fully refunded booking yields nothing', () => {
  const r = eligibleRefund(booking(), { alreadyRefunded: 200, now: NOW });
  assert.equal(r.amount, 0);
  assert.equal(r.policy, POLICIES.ALREADY_REFUNDED);
});

test('amounts round to 2dp', () => {
  const r = eligibleRefund(booking({ price: 149.9, scheduledStart: inHours(24) }), { now: NOW });
  assert.equal(r.amount, 112.43); // 149.90 × 75%
});

// ─── Auto-approval ───────────────────────────────────────────────────────────

test('only clean in-policy cancellations auto-approve', () => {
  assert.equal(isAutoApprovable(POLICIES.CANCEL_GT_48H), true);
  assert.equal(isAutoApprovable(POLICIES.CANCEL_4_TO_48H), true);
  assert.equal(isAutoApprovable(POLICIES.CANCEL_LT_4H), true);
});

test('anything carrying a liability decision needs a human', () => {
  assert.equal(isAutoApprovable(POLICIES.PARTNER_NO_SHOW), false);
  assert.equal(isAutoApprovable(POLICIES.DISPUTE_PENDING), false);
  assert.equal(isAutoApprovable(POLICIES.PARTNER_ACCEPTED), false);
  assert.equal(isAutoApprovable(POLICIES.NOT_ELIGIBLE), false);
});

// ─── Schedule parsing ────────────────────────────────────────────────────────

test('scheduledStart wins over date + timeSlot', () => {
  const explicit = new Date('2026-08-01T09:00:00+08:00');
  assert.equal(scheduledStartOf({ scheduledStart: explicit, date: NOW, timeSlot: '5:00 PM' }).getTime(), explicit.getTime());
});

test('a 12-hour time slot parses, including the noon/midnight edges', () => {
  const day = new Date('2026-08-01T00:00:00');
  assert.equal(scheduledStartOf({ date: day, timeSlot: '9:00 AM' }).getHours(), 9);
  assert.equal(scheduledStartOf({ date: day, timeSlot: '5:00 PM' }).getHours(), 17);
  assert.equal(scheduledStartOf({ date: day, timeSlot: '12:00 PM' }).getHours(), 12);
  assert.equal(scheduledStartOf({ date: day, timeSlot: '12:00 AM' }).getHours(), 0);
});

test('a missing or malformed slot falls back to the date itself', () => {
  const day = new Date('2026-08-01T00:00:00');
  assert.equal(scheduledStartOf({ date: day, timeSlot: null }).getTime(), day.getTime());
  assert.equal(scheduledStartOf({ date: day, timeSlot: 'whenever' }).getTime(), day.getTime());
});
