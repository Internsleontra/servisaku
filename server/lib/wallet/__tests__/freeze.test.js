// Unit tests for the overdue-commission enforcement ladder — `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate, daysOverdue, nextReminderDue,
  FREEZE_AFTER_DAYS, SUSPEND_PAYOUTS_AFTER_DAYS,
} from '../freeze.js';

const NOW = new Date('2026-07-30T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);
const wallet = (outstanding, creditLimit = 50) => ({ outstandingCommission: outstanding, creditLimit });
const unpaid = (dueDate, status = 'overdue') => ({ dueDate, status });

test('daysOverdue counts whole days, negative while still future', () => {
  assert.equal(daysOverdue(daysAgo(3), NOW), 3);
  assert.equal(daysOverdue(daysAgo(0), NOW), 0);
  assert.equal(daysOverdue(new Date(NOW.getTime() + 2 * 86400000), NOW), -2);
});

test('no settlements means no enforcement', () => {
  const out = evaluate(wallet(500), [], NOW);
  assert.equal(out.shouldFreeze, false);
  assert.equal(out.shouldSuspendPayouts, false);
});

test('a debt within the credit limit is never enforced, however overdue', () => {
  // The grace exists so nobody is frozen over small change.
  const out = evaluate(wallet(30, 50), [unpaid(daysAgo(90))], NOW);
  assert.equal(out.withinGrace, true);
  assert.equal(out.shouldFreeze, false);
  assert.equal(out.shouldSuspendPayouts, false);
});

test('a debt exactly at the credit limit is still within grace', () => {
  const out = evaluate(wallet(50, 50), [unpaid(daysAgo(30))], NOW);
  assert.equal(out.withinGrace, true);
  assert.equal(out.shouldFreeze, false);
});

test('one sen over the limit leaves grace', () => {
  const out = evaluate(wallet(50.01, 50), [unpaid(daysAgo(30))], NOW);
  assert.equal(out.withinGrace, false);
  assert.equal(out.shouldFreeze, true);
});

test('freeze threshold is exactly 7 days', () => {
  const before = evaluate(wallet(200), [unpaid(daysAgo(FREEZE_AFTER_DAYS - 1))], NOW);
  const at = evaluate(wallet(200), [unpaid(daysAgo(FREEZE_AFTER_DAYS))], NOW);
  assert.equal(before.shouldFreeze, false);
  assert.equal(at.shouldFreeze, true);
});

test('payout suspension threshold is exactly 14 days and implies a freeze', () => {
  const before = evaluate(wallet(200), [unpaid(daysAgo(SUSPEND_PAYOUTS_AFTER_DAYS - 1))], NOW);
  const at = evaluate(wallet(200), [unpaid(daysAgo(SUSPEND_PAYOUTS_AFTER_DAYS))], NOW);
  assert.equal(before.shouldSuspendPayouts, false);
  assert.equal(at.shouldSuspendPayouts, true);
  assert.equal(at.shouldFreeze, true);
});

test('the oldest unpaid settlement drives the ladder', () => {
  const out = evaluate(wallet(200), [unpaid(daysAgo(1)), unpaid(daysAgo(20)), unpaid(daysAgo(3))], NOW);
  assert.equal(out.maxDaysOverdue, 20);
  assert.equal(out.shouldSuspendPayouts, true);
});

test('paid and waived settlements are ignored', () => {
  const out = evaluate(wallet(200), [
    { dueDate: daysAgo(60), status: 'paid' },
    { dueDate: daysAgo(60), status: 'waived' },
    { dueDate: daysAgo(60), status: 'written_off' },
  ], NOW);
  assert.equal(out.shouldFreeze, false);
});

test('a not-yet-due settlement triggers nothing', () => {
  const out = evaluate(wallet(200), [unpaid(new Date(NOW.getTime() + 3 * 86400000), 'pending')], NOW);
  assert.equal(out.maxDaysOverdue, 0);
  assert.equal(out.shouldFreeze, false);
});

test('freeze reason names the amount and the delay', () => {
  const out = evaluate(wallet(129.5), [unpaid(daysAgo(9))], NOW);
  assert.match(out.reason, /129\.50/);
  assert.match(out.reason, /9 day/);
});

// ─── Reminders ───────────────────────────────────────────────────────────────

test('the first reminder fires on the due date', () => {
  const r = nextReminderDue({ dueDate: daysAgo(0), remindersSent: 0 }, NOW);
  assert.equal(r.rung, 0);
  assert.equal(r.isOverdue, false);
});

test('reminders advance one rung at a time, never repeating a rung', () => {
  const settlement = { dueDate: daysAgo(3), remindersSent: 0 };
  const first = nextReminderDue(settlement, NOW);
  assert.equal(first.rung, 0);

  const second = nextReminderDue({ ...settlement, remindersSent: 1 }, NOW);
  assert.equal(second.rung, 1);

  const third = nextReminderDue({ ...settlement, remindersSent: 2 }, NOW);
  assert.equal(third.rung, 2); // day 3 rung is due

  // Day 7's rung is not reachable yet at 3 days overdue.
  assert.equal(nextReminderDue({ ...settlement, remindersSent: 3 }, NOW), null);
});

test('no reminder before the due date', () => {
  const r = nextReminderDue({ dueDate: new Date(NOW.getTime() + 86400000), remindersSent: 0 }, NOW);
  assert.equal(r, null);
});

test('all rungs exhausted returns null', () => {
  const r = nextReminderDue({ dueDate: daysAgo(30), remindersSent: 4 }, NOW);
  assert.equal(r, null);
});
