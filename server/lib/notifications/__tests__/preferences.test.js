// Unit tests for preference-based channel gating — runs with `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChannels, isDndActive, isCategoryEnabled, DEFAULT_PREFERENCES } from '../preferences.js';

const ALL = ['in_app', 'push', 'email', 'sms'];
const at = (h, m = 0) => new Date(2026, 0, 1, h, m);

test('defaults let everything through', () => {
  const out = resolveChannels(DEFAULT_PREFERENCES, ALL, { category: 'bookings', priority: 'high' });
  assert.deepEqual(out, ALL);
});

test('disabling a channel removes only that channel', () => {
  const pref = { ...DEFAULT_PREFERENCES, smsEnabled: false, pushEnabled: false };
  const out = resolveChannels(pref, ALL, { category: 'bookings' });
  assert.deepEqual(out, ['in_app', 'email']);
});

test('disabling a category drops all channels including in_app', () => {
  const pref = { ...DEFAULT_PREFERENCES, promotionEnabled: false };
  const out = resolveChannels(pref, ALL, { category: 'promotions' });
  assert.deepEqual(out, []);
});

test('partner jobs ride the booking master toggle', () => {
  const pref = { ...DEFAULT_PREFERENCES, bookingEnabled: false };
  assert.equal(isCategoryEnabled(pref, 'jobs'), false);
  assert.deepEqual(resolveChannels(pref, ALL, { category: 'jobs' }), []);
});

test('DND flag suppresses noisy channels but keeps in_app', () => {
  const pref = { ...DEFAULT_PREFERENCES, doNotDisturb: true };
  const out = resolveChannels(pref, ALL, { category: 'bookings', priority: 'high' });
  assert.deepEqual(out, ['in_app']);
});

test('urgent priority bypasses DND', () => {
  const pref = { ...DEFAULT_PREFERENCES, doNotDisturb: true };
  const out = resolveChannels(pref, ALL, { category: 'bookings', priority: 'urgent' });
  assert.deepEqual(out, ALL);
});

test('quiet-hours window wraps across midnight', () => {
  const pref = { ...DEFAULT_PREFERENCES, dndStart: '22:00', dndEnd: '07:00' };
  assert.equal(isDndActive(pref, at(23)), true);   // late night → quiet
  assert.equal(isDndActive(pref, at(3)), true);    // early morning → quiet
  assert.equal(isDndActive(pref, at(12)), false);  // midday → not quiet
});

test('security notifications always keep in_app even when the category toggle is off', () => {
  // securityEnabled=false is intentionally ignored — a user must see security alerts.
  const pref = { ...DEFAULT_PREFERENCES, securityEnabled: false, emailEnabled: false };
  const out = resolveChannels(pref, ['in_app', 'email'], { category: 'security', priority: 'high' });
  assert.ok(out.includes('in_app'));
});

test('malformed quiet-hours values are treated as no DND', () => {
  const pref = { ...DEFAULT_PREFERENCES, dndStart: 'nope', dndEnd: '99:99' };
  assert.equal(isDndActive(pref, at(23)), false);
});
