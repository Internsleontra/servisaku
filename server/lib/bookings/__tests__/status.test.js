// Booking status changes — completion payment guard, transition validation,
// admin override and lifecycle stamping.
//
// `buildStatusChange` is pure: it takes a booking row and returns the update
// payload or throws. No database is involved.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStatusChange, completionPaymentReason, isCashBooking, escrowIsFunded,
  ONLINE_SETTLED, CASH_SETTLED,
} from '../status.js';

const NOW = new Date('2026-08-17T10:00:00.000Z');

const partner = { id: 'p1', role: 'partner' };
const consumer = { id: 'c1', role: 'consumer' };
const admin = { id: 'a1', role: 'admin' };

/** An online booking mid-job, ready to be completed. */
const online = (over = {}) => ({
  id: 'bk1', status: 'started', partnerId: 'p1', consumerId: 'c1',
  paymentMethod: 'fpx', paymentStatus: ONLINE_SETTLED,
  lifecycle: [], completedAt: null, payments: [], ...over,
});

/** A cash booking mid-job. Money is collected on site, so it is still pending. */
const cash = (over = {}) => online({ paymentMethod: 'cash', paymentStatus: 'pending', ...over });

describe('1–5 · completion payment guard', () => {
  test('1 · online + payment pending → CANNOT complete', () => {
    const b = online({ paymentStatus: 'pending' });
    assert.match(completionPaymentReason(b), /can only be completed once payment has settled/);
    assert.throws(() => buildStatusChange(b, 'completed', partner, { now: NOW }), /payment has settled/);
  });

  test('1b · online + failed payment → CANNOT complete', () => {
    assert.throws(() => buildStatusChange(online({ paymentStatus: 'failed' }), 'completed', partner), /"failed"/);
  });

  test('1c · online + paid (a cash-only state) → CANNOT complete', () => {
    // `paid` is set exclusively by the cash collection path. An online booking
    // sitting in it means something wrote the field by hand.
    assert.throws(() => buildStatusChange(online({ paymentStatus: CASH_SETTLED }), 'completed', partner), /"paid"/);
  });

  test('2 · online + escrowed → CAN complete', () => {
    const b = online();
    assert.equal(completionPaymentReason(b), null);
    const data = buildStatusChange(b, 'completed', partner, { now: NOW });
    assert.equal(data.status, 'completed');
    assert.equal(data.completedAt.getTime(), NOW.getTime());
  });

  test('3 · cash + unpaid at completion → CAN complete', () => {
    // The partner collects at the door; blocking this makes cash unusable.
    const b = cash();
    assert.equal(completionPaymentReason(b), null);
    assert.equal(buildStatusChange(b, 'completed', partner, { now: NOW }).status, 'completed');
  });

  test('3b · cash detected from the payment row even when the method says otherwise', () => {
    const b = online({ paymentStatus: 'pending', payments: [{ method: 'cash', provider: 'cash' }] });
    assert.equal(isCashBooking(b), true);
    assert.equal(completionPaymentReason(b), null);
  });

  test('4 · cash never counts as funded escrow', () => {
    // Every booking gets a held escrow row at creation, cash included. This is
    // what stops the release worker paying a partner who already holds the fare.
    assert.equal(escrowIsFunded(cash()), false);
    assert.equal(escrowIsFunded(cash({ paymentStatus: CASH_SETTLED })), false,
      'even a collected cash booking has no online money to release');
    assert.equal(escrowIsFunded(online()), true);
  });

  test('5 · no payment method recorded → CANNOT complete', () => {
    const b = online({ paymentMethod: null, paymentStatus: 'pending' });
    assert.match(completionPaymentReason(b), /no payment method recorded/);
    assert.throws(() => buildStatusChange(b, 'completed', partner), /no payment method recorded/);
  });

  test('5b · an unknown payment state is refused, not assumed safe', () => {
    assert.throws(() => buildStatusChange(online({ paymentStatus: 'weird_state' }), 'completed', partner), /"weird_state"/);
  });

  test('the guard applies to every actor, including admins', () => {
    const b = online({ paymentStatus: 'pending' });
    assert.throws(() => buildStatusChange(b, 'completed', admin), /payment has settled/);
  });

  test('and is NOT waived by force — an override cannot fabricate a payment', () => {
    const b = online({ paymentStatus: 'pending' });
    assert.throws(
      () => buildStatusChange(b, 'completed', admin, { force: true, reason: 'customer says paid' }),
      /payment has settled/,
    );
  });

  test('the guard only applies to completion — other transitions are unaffected', () => {
    const b = online({ status: 'accepted', paymentStatus: 'pending' });
    assert.equal(buildStatusChange(b, 'en_route', partner).status, 'en_route');
  });
});

describe('6–8 · transitions, admin override and audit', () => {
  test('6 · an admin normal transition obeys validation', () => {
    // completed → accepted is not a legal transition for anyone.
    assert.throws(() => buildStatusChange(online({ status: 'completed' }), 'accepted', admin),
      /Cannot change status from "completed" to "accepted"/);
  });

  test('6b · a partner illegal transition is refused', () => {
    assert.throws(() => buildStatusChange(online({ status: 'pending' }), 'completed', partner),
      /Cannot change status from "pending" to "completed"/);
  });

  test('7 · a forced transition requires an explicit reason', () => {
    const b = online({ status: 'completed' });
    assert.throws(() => buildStatusChange(b, 'accepted', admin, { force: true }), /requires a reason/);
    assert.throws(() => buildStatusChange(b, 'accepted', admin, { force: true, reason: '   ' }), /requires a reason/);
  });

  test('7b · only an admin may force', () => {
    const b = online({ status: 'completed' });
    assert.throws(() => buildStatusChange(b, 'accepted', partner, { force: true, reason: 'x' }),
      /Only an admin may force/);
    assert.throws(() => buildStatusChange(b, 'accepted', consumer, { force: true, reason: 'x' }),
      /Only an admin may force/);
  });

  test('7c · a valid forced transition succeeds where the normal one is refused', () => {
    const b = online({ status: 'completed' });
    assert.throws(() => buildStatusChange(b, 'accepted', admin));
    const data = buildStatusChange(b, 'accepted', admin, { force: true, reason: 'Partner reassigned after dispute' });
    assert.equal(data.status, 'accepted');
  });

  test('8 · a forced transition writes a full audit entry', () => {
    const b = online({ status: 'completed', lifecycle: [{ status: 'started', at: 'x', by: 'p1' }] });
    const data = buildStatusChange(b, 'accepted', admin, {
      force: true, reason: 'Partner reassigned after dispute', now: NOW,
    });
    const entry = data.lifecycle.at(-1);
    assert.equal(entry.status, 'accepted');
    assert.equal(entry.from, 'completed', 'records the PREVIOUS status');
    assert.equal(entry.by, 'a1', 'records the actor');
    assert.equal(entry.byRole, 'admin');
    assert.equal(entry.forced, true);
    assert.equal(entry.reason, 'Partner reassigned after dispute');
    assert.equal(entry.at, NOW.toISOString());
    assert.equal(data.lifecycle.length, 2, 'appends, never replaces');
  });
});

describe('12 · lifecycle is written consistently by every writer', () => {
  test('a normal transition appends an entry with actor and timestamp', () => {
    const data = buildStatusChange(online({ status: 'accepted' }), 'en_route', partner, { now: NOW });
    assert.deepEqual(data.lifecycle, [{ status: 'en_route', at: NOW.toISOString(), by: 'p1' }]);
  });

  test('the claim path (pending → accepted) writes lifecycle', () => {
    // This is the exact call routes/bookings.js#claim now makes. It previously
    // wrote status directly, leaving 5 live rows with an empty lifecycle.
    const data = buildStatusChange(online({ status: 'pending' }), 'accepted', partner, { now: NOW });
    assert.equal(data.status, 'accepted');
    assert.equal(data.lifecycle.length, 1);
    assert.equal(data.lifecycle[0].by, 'p1');
  });

  test('the dispute path writes a forced, audited entry', () => {
    // routes/disputes.js forces because a dispute is valid from states
    // STATUS_TRANSITIONS does not list.
    const data = buildStatusChange(online({ status: 'completed' }), 'disputed',
      { id: 'c1', role: 'admin' }, { force: true, reason: 'Dispute DSP-1 raised by consumer', now: NOW });
    assert.equal(data.status, 'disputed');
    assert.equal(data.lifecycle.at(-1).reason, 'Dispute DSP-1 raised by consumer');
    assert.equal(data.lifecycle.at(-1).from, 'completed');
  });

  test('a non-array lifecycle is replaced, not spread into garbage', () => {
    const data = buildStatusChange(online({ lifecycle: null }), 'completed', partner, { now: NOW });
    assert.equal(Array.isArray(data.lifecycle), true);
    assert.equal(data.lifecycle.length, 1);
  });

  test('completedAt is stamped once and never restarted', () => {
    const first = new Date('2026-08-01T00:00:00.000Z');
    const b = online({ status: 'disputed', completedAt: first });
    const data = buildStatusChange(b, 'completed', partner, { now: NOW });
    assert.equal(data.completedAt, undefined, 'the original completion time is preserved');
  });
});
