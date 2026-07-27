// Unit tests for the notification catalog renderer — runs with `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEvent, isKnownEvent, CATALOG, CATEGORIES, shortRef } from '../catalog.js';

test('renders a known consumer event with interpolated data', () => {
  const r = renderEvent('booking_confirmed', {
    serviceName: 'AC Service', date: 'Sat, 26 Jul', timeSlot: '2:00 PM', ref: 'BK-12AB34CD',
  });
  assert.equal(r.category, 'bookings');
  assert.equal(r.priority, 'high');
  assert.match(r.title, /confirmed/i);
  assert.match(r.message, /AC Service/);
  assert.match(r.message, /2:00 PM/);
  assert.ok(r.channels.includes('in_app'));
  assert.ok(r.emailSubject, 'email-worthy event exposes a subject');
  assert.match(r.smsBody, /BK-12AB34CD/);
});

test('renders a partner event with the partner role', () => {
  const r = renderEvent('new_job_request', { serviceName: 'Plumbing', area: 'KL', payout: 'RM 80' });
  assert.equal(r.role, 'partner');
  assert.equal(r.category, 'jobs');
  assert.match(r.message, /Plumbing/);
  assert.match(r.message, /RM 80/);
});

test('OTP event is urgent and sms-worthy', () => {
  const r = renderEvent('otp_generated', { otp: '4821', partnerName: 'Ali' });
  assert.equal(r.priority, 'urgent');
  assert.match(r.message, /4821/);
  assert.match(r.smsBody, /4821/);
});

test('actionUrl resolves booking deep links', () => {
  const r = renderEvent('service_completed', { bookingId: 'abc123', serviceName: 'Cleaning' });
  assert.equal(r.actionUrl, '/bookings/abc123');
});

test('unknown events fall back to a generic system notification instead of throwing', () => {
  const r = renderEvent('does_not_exist', { title: 'Hi', message: 'There' });
  assert.equal(r.category, 'system');
  assert.equal(r.title, 'Hi');
  assert.deepEqual(r.channels, ['in_app']);
  assert.equal(isKnownEvent('does_not_exist'), false);
});

test('every catalog entry declares a valid category, priority and channels', () => {
  for (const [event, def] of Object.entries(CATALOG)) {
    assert.ok(CATEGORIES.includes(def.category), `${event} has valid category`);
    assert.ok(['low', 'normal', 'high', 'urgent'].includes(def.priority || 'normal'), `${event} priority`);
    assert.ok(Array.isArray(def.channels) && def.channels.length, `${event} has channels`);
    // Rendering must never throw for any entry given empty data.
    assert.doesNotThrow(() => renderEvent(event, {}), `${event} renders with empty data`);
  }
});

test('shortRef builds an uppercase suffixed reference', () => {
  assert.equal(shortRef('BK', 'clabc12345678'), 'BK-12345678');
  assert.equal(shortRef('PAY', ''), 'PAY-—');
});
