// Unit tests for support SLA + queue ordering — `node --test`. Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLA, dueDates, priorityFor, breaches, canReopen, queueComparator,
  REOPEN_WINDOW_DAYS, MAX_REOPENS,
} from '../sla.js';

const NOW = new Date('2026-07-31T12:00:00Z');
const hrs = (h) => new Date(NOW.getTime() + h * 3600_000);
const days = (d) => new Date(NOW.getTime() + d * 86400_000);

test('due dates follow the priority targets', () => {
  const d = dueDates('urgent', NOW);
  assert.equal(d.slaFirstResponseAt.getTime(), hrs(SLA.urgent.firstResponse).getTime());
  assert.equal(d.slaResolutionAt.getTime(), hrs(SLA.urgent.resolution).getTime());
});

test('an unknown priority falls back to normal', () => {
  assert.deepEqual(dueDates('nonsense', NOW), dueDates('normal', NOW));
});

test('money and safety categories start above normal', () => {
  for (const c of ['damage', 'refund', 'payment', 'complaint', 'report_customer']) {
    assert.equal(priorityFor(c), 'high', c);
  }
  assert.equal(priorityFor('technical'), 'normal');
  assert.equal(priorityFor('other'), 'normal');
});

// ─── Breaches ────────────────────────────────────────────────────────────────
const ticket = (o) => ({ status: 'open', firstResponseAt: null, ...o });

test('an unanswered ticket past its first-response target breaches', () => {
  const t = ticket({ slaFirstResponseAt: hrs(-1), slaResolutionAt: hrs(10) });
  assert.deepEqual(breaches(t, NOW), ['first_response']);
});

test('an answered ticket cannot breach first response', () => {
  const t = ticket({ firstResponseAt: hrs(-2), slaFirstResponseAt: hrs(-1), slaResolutionAt: hrs(10) });
  assert.deepEqual(breaches(t, NOW), []);
});

test('a resolved ticket breaches nothing, however old', () => {
  const t = ticket({ status: 'resolved', slaFirstResponseAt: hrs(-100), slaResolutionAt: hrs(-100) });
  assert.deepEqual(breaches(t, NOW), []);
});

test('both clocks can breach at once', () => {
  const t = ticket({ slaFirstResponseAt: hrs(-5), slaResolutionAt: hrs(-1) });
  assert.deepEqual(breaches(t, NOW), ['first_response', 'resolution']);
});

// ─── Reopening ───────────────────────────────────────────────────────────────

test('a resolved ticket can be reopened inside the window', () => {
  assert.equal(canReopen({ status: 'resolved', resolvedAt: days(-1), reopenCount: 0 }, NOW), true);
});

test('the reopen window closes after 7 days', () => {
  assert.equal(canReopen({ status: 'resolved', resolvedAt: days(-(REOPEN_WINDOW_DAYS - 1)), reopenCount: 0 }, NOW), true);
  assert.equal(canReopen({ status: 'resolved', resolvedAt: days(-(REOPEN_WINDOW_DAYS + 1)), reopenCount: 0 }, NOW), false);
});

test('reopening is capped', () => {
  assert.equal(canReopen({ status: 'resolved', resolvedAt: days(-1), reopenCount: MAX_REOPENS }, NOW), false);
});

test('an open ticket is not reopenable — it is already open', () => {
  assert.equal(canReopen({ status: 'in_progress', resolvedAt: days(-1), reopenCount: 0 }, NOW), false);
});

// ─── Queue ordering ──────────────────────────────────────────────────────────

test('breaching tickets sort ahead of everything else', () => {
  const breaching = ticket({ id: 'breach', priority: 'low', createdAt: NOW, slaFirstResponseAt: hrs(-1), slaResolutionAt: hrs(-1) });
  const urgent = ticket({ id: 'urgent', priority: 'urgent', createdAt: NOW, slaFirstResponseAt: hrs(5), slaResolutionAt: hrs(5) });
  const sorted = [urgent, breaching].sort(queueComparator(NOW));
  assert.equal(sorted[0].id, 'breach');
});

test('within the same breach state, priority decides', () => {
  const mk = (id, priority) => ticket({ id, priority, createdAt: NOW, slaFirstResponseAt: hrs(5), slaResolutionAt: hrs(5) });
  const sorted = [mk('low', 'low'), mk('urgent', 'urgent'), mk('normal', 'normal'), mk('high', 'high')]
    .sort(queueComparator(NOW));
  assert.deepEqual(sorted.map((t) => t.id), ['urgent', 'high', 'normal', 'low']);
});

test('at equal priority, the oldest ticket comes first', () => {
  const mk = (id, createdAt) => ticket({ id, priority: 'normal', createdAt, slaFirstResponseAt: hrs(5), slaResolutionAt: hrs(5) });
  const sorted = [mk('new', hrs(-1)), mk('old', hrs(-10))].sort(queueComparator(NOW));
  assert.deepEqual(sorted.map((t) => t.id), ['old', 'new']);
});
