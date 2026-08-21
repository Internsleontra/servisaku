// Notification localization — both languages come from one template and one
// data payload, and historical rows degrade to English rather than to garbage.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG, renderEvent } from '../catalog.js';
import { CATALOG_MS } from '../catalog.ms.js';
import { mapOut } from '../dispatcher.js';

const EVENTS = Object.keys(CATALOG);

/* A payload wide enough to satisfy every template's interpolation, so a missing
   Malay branch shows up as `undefined` rather than hiding behind a fallback. */
const DATA = {
  serviceName: 'Deep Cleaning', partnerName: 'Ali', customerName: 'Siti',
  date: '20 Ogos 2026', timeSlot: '10:00', when: 'esok', eta: '15 min',
  ref: 'BK-1', reference: 'RF-2', ticketRef: 'SR-3', amount: 'RM120',
  commission: 'RM24', payout: 'RM96', rating: 5, jobs: 7, days: 3,
  otp: '1234', code: 'RAYA20', reason: 'alasan ujian', outcome: 'diselesaikan',
  item: 'meja', method: 'FPX', device: 'iPhone', location: 'Kuala Lumpur',
  area: 'Cheras', docName: 'SSM', by: 'pelanggan', title: 'Tajuk', body: 'Kandungan',
};

describe('every event has a Malay translation', () => {
  test('all 88 catalog events are covered', () => {
    assert.equal(EVENTS.length, 88);
    const missing = EVENTS.filter((e) => !CATALOG_MS[e]);
    assert.deepEqual(missing, [], 'events with no Malay entry');
  });

  test('the overlay defines nothing the English catalog does not', () => {
    const extra = Object.keys(CATALOG_MS).filter((e) => !CATALOG[e]);
    assert.deepEqual(extra, [], 'orphaned Malay entries');
  });

  test('a dynamic English slot has a dynamic Malay slot', () => {
    const mismatched = [];
    for (const e of EVENTS) {
      for (const slot of ['title', 'message']) {
        if (typeof CATALOG[e][slot] === 'function' && typeof CATALOG_MS[e][slot] !== 'function') {
          mismatched.push(`${e}.${slot}`);
        }
      }
    }
    assert.deepEqual(mismatched, [], 'these would drop their interpolated values');
  });

  test('the overlay carries strings only — no business logic is duplicated', () => {
    // category, priority, channels, role, actionUrl and the email/sms GATING
    // must live in catalog.js alone, or the two files can disagree about who
    // gets notified and how. `email` and `sms` are the gates — their presence
    // is what makes an event email- or sms-worthy — so the overlay carries
    // `emailSubject` and `smsBody` instead, which are only ever text.
    const LOGIC = ['category', 'priority', 'channels', 'role', 'actionUrl', 'ctaLabel', 'email', 'sms', 'icon'];
    const leaked = [];
    for (const [e, def] of Object.entries(CATALOG_MS)) {
      for (const k of Object.keys(def)) {
        if (LOGIC.includes(k)) leaked.push(`${e}.${k}`);
      }
    }
    assert.deepEqual(leaked, []);
  });
});

describe('renderEvent resolves fully in both languages', () => {
  test('no rendered string contains undefined, null or [object', () => {
    const broken = [];
    for (const locale of ['en', 'ms']) {
      for (const e of EVENTS) {
        const r = renderEvent(e, { ...DATA, role: CATALOG[e].role }, locale);
        for (const slot of ['title', 'message']) {
          const v = String(r[slot] ?? '');
          if (!v.trim()) broken.push(`${locale}:${e}.${slot} empty`);
          if (/undefined|\[object |\bNaN\b/.test(v)) broken.push(`${locale}:${e}.${slot} → ${v}`);
        }
      }
    }
    assert.deepEqual(broken, []);
  });

  /* promo_offer is a pass-through: its title and body are supplied by whoever
     creates the promotion (`d.title || 'Special offer'`), so when data provides
     them both languages legitimately echo the same admin-authored text. Its own
     fallback copy IS translated, which the second test below checks. */
  const PASS_THROUGH = new Set(['promo_offer']);

  test('Malay differs from English for every templated event', () => {
    const same = EVENTS.filter((e) => {
      if (PASS_THROUGH.has(e)) return false;
      const en = renderEvent(e, { ...DATA, role: CATALOG[e].role }, 'en');
      const ms = renderEvent(e, { ...DATA, role: CATALOG[e].role }, 'ms');
      return en.title === ms.title && en.message === ms.message;
    });
    assert.deepEqual(same, [], 'these render identically — untranslated');
  });

  test('pass-through events still translate their own fallback copy', () => {
    for (const e of PASS_THROUGH) {
      const en = renderEvent(e, { role: CATALOG[e].role }, 'en');
      const ms = renderEvent(e, { role: CATALOG[e].role }, 'ms');
      assert.notEqual(ms.title, en.title, `${e} fallback title is not translated`);
      assert.notEqual(ms.message, en.message, `${e} fallback message is not translated`);
    }
  });

  test('email subjects follow the locale wherever an event is email-worthy', () => {
    const englishLeft = [];
    for (const e of EVENTS) {
      if (!CATALOG[e].email) continue;
      const en = renderEvent(e, DATA, 'en');
      const ms = renderEvent(e, DATA, 'ms');
      assert.ok(ms.emailSubject, `${e} lost its email subject under ms`);
      if (ms.emailSubject === en.emailSubject) englishLeft.push(e);
    }
    assert.deepEqual(englishLeft, [], 'these email subjects are still English under ms');
  });

  test('SMS bodies follow the locale wherever an event is sms-worthy', () => {
    const englishLeft = [];
    for (const e of EVENTS) {
      if (!CATALOG[e].sms) continue;
      const en = renderEvent(e, DATA, 'en');
      const ms = renderEvent(e, DATA, 'ms');
      assert.ok(ms.smsBody, `${e} lost its SMS body under ms`);
      if (ms.smsBody === en.smsBody) englishLeft.push(e);
    }
    assert.deepEqual(englishLeft, [], 'these SMS bodies are still English under ms');
  });

  test('a non-email event stays non-email in both locales', () => {
    for (const e of EVENTS) {
      const en = renderEvent(e, DATA, 'en');
      const ms = renderEvent(e, DATA, 'ms');
      assert.equal(Boolean(ms.emailSubject), Boolean(en.emailSubject), `${e} email-worthiness changed`);
      assert.equal(Boolean(ms.smsBody), Boolean(en.smsBody), `${e} sms-worthiness changed`);
    }
  });

  test('behaviour is identical across locales', () => {
    for (const e of EVENTS) {
      const en = renderEvent(e, DATA, 'en');
      const ms = renderEvent(e, DATA, 'ms');
      assert.equal(ms.category, en.category, `${e} category`);
      assert.equal(ms.priority, en.priority, `${e} priority`);
      assert.equal(ms.role, en.role, `${e} role`);
      assert.deepEqual(ms.channels, en.channels, `${e} channels`);
      assert.equal(ms.actionUrl, en.actionUrl, `${e} actionUrl`);
    }
  });

  test('an unknown locale falls back to English', () => {
    for (const bad of ['zz', '', null, undefined, 'MS']) {
      const r = renderEvent('booking_confirmed', DATA, bad);
      assert.equal(r.title, 'Booking confirmed', `locale ${JSON.stringify(bad)}`);
    }
  });

  test('an unknown event still renders rather than throwing', () => {
    for (const locale of ['en', 'ms']) {
      const r = renderEvent('no_such_event', { title: 'X', message: 'Y' }, locale);
      assert.equal(r.title, 'X');
      assert.equal(r.category, 'system');
    }
  });
});

describe('mapOut serves the stored rendering for the requested locale', () => {
  const row = {
    id: 'n1', userId: 'u1', role: 'consumer',
    title: 'Booking confirmed', body: 'Your booking is confirmed.',
    titleMy: 'Tempahan disahkan', bodyMy: 'Tempahan anda telah disahkan.',
    type: 'info', category: 'bookings', priority: 'normal', isRead: false,
  };
  const historical = { ...row, id: 'n0', titleMy: null, bodyMy: null };

  test('English by default — unchanged for clients that send no locale', () => {
    const out = mapOut(row);
    assert.equal(out.title, 'Booking confirmed');
    assert.equal(out.body, 'Your booking is confirmed.');
    assert.equal(out.message, 'Your booking is confirmed.', 'legacy alias follows title/body');
  });

  test('ms returns the stored Malay rendering', () => {
    const out = mapOut(row, { locale: 'ms' });
    assert.equal(out.title, 'Tempahan disahkan');
    assert.equal(out.body, 'Tempahan anda telah disahkan.');
    assert.equal(out.message, 'Tempahan anda telah disahkan.');
  });

  test('both languages are exposed side by side', () => {
    const out = mapOut(row, { locale: 'ms' });
    assert.equal(out.title_en, 'Booking confirmed');
    assert.equal(out.title_my, 'Tempahan disahkan');
  });

  test('a historical row without Malay falls back to English, not to blank', () => {
    const out = mapOut(historical, { locale: 'ms' });
    assert.equal(out.title, 'Booking confirmed');
    assert.equal(out.body, 'Your booking is confirmed.');
    assert.equal(out.title_my, null, 'null is reported honestly rather than faked');
    assert.ok(!/undefined/.test(out.title + out.body));
  });

  test('an unknown locale behaves like English', () => {
    assert.equal(mapOut(row, { locale: 'zz' }).title, 'Booking confirmed');
    assert.equal(mapOut(row, {}).title, 'Booking confirmed');
  });
});
