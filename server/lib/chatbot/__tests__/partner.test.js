// Unit tests for the partner assistant features — `node --test`.
// Routing, ratings and reply drafting are pure; inventory's counter is tested
// against a fake prisma client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm, travelMinutes, routeDistance, nearestNeighbour, twoOpt,
  optimiseRoute, backtrackWarning, HEURISTIC_THRESHOLD,
} from '../partner/routing.js';
import {
  CONSUMABLES, CATEGORIES, itemsFor, dueForRestock, reminderText,
  dismissUntil, ensureTracked, recordJob, markRestocked, dismiss, checkPartner,
} from '../partner/inventory.js';
import {
  THEMES, THEME_IDS, themesIn, analyseReviews, trendOf, summaryText, LOW_RATING,
} from '../partner/ratings.js';
import {
  SITUATIONS, SITUATION_IDS, scanForLeakage, draftMessage, situationOptions,
} from '../partner/replies.js';

// Real Klang Valley coordinates, so the distances are sane rather than arbitrary.
const KL = { lat: 3.1390, lng: 101.6869 };
const BANGSAR = { lat: 3.1285, lng: 101.6790 };
const MIDVALLEY = { lat: 3.1180, lng: 101.6770 };
const CHERAS = { lat: 3.1050, lng: 101.7400 };
const KEPONG = { lat: 3.2050, lng: 101.6350 };

const job = (id, location, scheduledStart = null) => ({ id, location, scheduledStart, service: 'Aircon Servicing', address: id });

// ── Routing ──────────────────────────────────────────────────────────────────

test('distance is plausible for real Klang Valley coordinates', () => {
  const d = haversineKm(KL, BANGSAR);
  assert.ok(d > 1 && d < 3, `KL→Bangsar came out at ${d} km`);
  assert.equal(haversineKm(KL, KL), 0);
});

test('a missing coordinate yields null rather than NaN', () => {
  assert.equal(haversineKm(KL, null), null);
  assert.equal(haversineKm(KL, { lat: 3.1 }), null);
  assert.equal(travelMinutes(null), null);
});

test('travel time is slower at peak and never unrealistically short', () => {
  assert.ok(travelMinutes(10, { peak: true }) > travelMinutes(10, { peak: false }));
  assert.ok(travelMinutes(0.1) >= 5, 'a five-minute floor covers parking and access');
});

test('nearest-neighbour visits the closest stop first', () => {
  const order = nearestNeighbour([job('cheras', CHERAS), job('bangsar', BANGSAR)], KL);
  assert.deepEqual(order.map((j) => j.id), ['bangsar', 'cheras']);
});

test('2-opt does not make a route longer', () => {
  const jobs = [job('a', KEPONG), job('b', BANGSAR), job('c', CHERAS), job('d', MIDVALLEY)];
  const before = routeDistance(jobs, KL);
  const after = routeDistance(twoOpt(jobs, KL), KL);
  assert.ok(after <= before + 0.01);
});

test('a scheduled job is a FIXED point — its slot is the customer\'s, not ours', () => {
  // The optimiser must never propose moving a booked time. Doing so would need
  // the customer's agreement, which is a Class W action, not a suggestion.
  const jobs = [
    job('late-but-near', BANGSAR, '2026-08-02T15:00:00+08:00'),
    job('early-but-far', KEPONG, '2026-08-02T09:00:00+08:00'),
  ];
  const r = optimiseRoute(jobs, { start: KL });
  assert.deepEqual(r.order.map((j) => j.id), ['early-but-far', 'late-but-near']);
  assert.equal(r.fixedCount, 2);
  assert.equal(r.reason, 'all_fixed');
});

test('flexible jobs are ordered, fixed ones are planned around', () => {
  const jobs = [
    job('fixed-am', KEPONG, '2026-08-02T09:00:00+08:00'),
    job('fixed-pm', CHERAS, '2026-08-02T15:00:00+08:00'),
    job('flex-near-am', KEPONG),
    job('flex-near-pm', CHERAS),
  ];
  const r = optimiseRoute(jobs, { start: KL });
  const ids = r.order.map((j) => j.id);
  // Fixed sequence is preserved exactly...
  assert.ok(ids.indexOf('fixed-am') < ids.indexOf('fixed-pm'));
  // ...and each flexible job sits with the anchor it is nearest to.
  assert.ok(ids.indexOf('flex-near-am') < ids.indexOf('fixed-pm'));
  assert.equal(r.fixedCount, 2);
});

test('the result is ALWAYS advisory', () => {
  const r = optimiseRoute([job('a', BANGSAR), job('b', CHERAS)], { start: KL });
  assert.equal(r.advisory, true);
  // There is no "apply" anywhere in the returned shape.
  assert.equal(r.apply, undefined);
});

test('legs carry distance, time and whether the stop is pinned', () => {
  const r = optimiseRoute([job('a', BANGSAR, '2026-08-02T09:00:00+08:00'), job('b', CHERAS)], { start: KL });
  assert.equal(r.legs.length, 2);
  assert.equal(r.legs[0].fixed, true);
  assert.equal(r.legs[1].fixed, false);
  assert.ok(r.legs[0].km > 0);
  assert.ok(r.legs[0].minutes >= 5);
  assert.ok(r.totalKm > 0);
});

test('jobs without coordinates degrade rather than break the day', () => {
  const r = optimiseRoute([{ id: 'no-geo', service: 'x' }], { start: KL });
  assert.equal(r.reason, 'no_locations');
  assert.deepEqual(r.order, []);
  assert.deepEqual(r.legs, []);
});

test('an empty day is not an error', () => {
  const r = optimiseRoute([], { start: KL });
  assert.equal(r.totalKm, 0);
  assert.equal(r.reason, 'no_locations');
});

test('a large day is flagged as heuristic rather than claimed optimal', () => {
  const jobs = Array.from({ length: HEURISTIC_THRESHOLD + 2 }, (_, i) => job(`j${i}`, { lat: 3.1 + i * 0.01, lng: 101.6 + i * 0.01 }));
  assert.equal(optimiseRoute(jobs, { start: KL }).reason, 'heuristic');
});

test('backtracking is reported, not silently corrected', () => {
  // Kepong → Cheras → Kepong is a real backtrack.
  const jobs = [job('a', KEPONG), job('b', CHERAS), job('c', KEPONG)];
  const w = backtrackWarning(jobs, { start: KL });
  assert.ok(w);
  assert.ok(w.excessKm >= 2);
  assert.ok(w.excessMinutes > 0);
});

test('a trivial difference is not reported as false precision', () => {
  assert.equal(backtrackWarning([job('a', BANGSAR), job('b', MIDVALLEY)], { start: KL }), null);
});

// ── Inventory ────────────────────────────────────────────────────────────────

test('every category declares consumables with a restock interval', () => {
  assert.ok(CATEGORIES.length >= 5);
  for (const c of CATEGORIES) {
    const items = itemsFor(c);
    assert.ok(items.length > 0, `${c} has no consumables`);
    for (const i of items) {
      assert.ok(i.item && i.jobsPerRestock > 0, `${c}/${i.item}`);
    }
  }
  assert.deepEqual(itemsFor('not_a_category'), []);
});

test('only counters at or over threshold are due', () => {
  const rows = [
    { category: 'aircon', item: 'coil cleaner', jobsSinceRestock: 12, threshold: 12 },
    { category: 'aircon', item: 'filter brushes', jobsSinceRestock: 5, threshold: 30 },
    { category: 'cleaning', item: 'detergent', jobsSinceRestock: 18, threshold: 10 },
  ];
  const due = dueForRestock(rows);
  assert.deepEqual(due.map((d) => d.item), ['detergent', 'coil cleaner']);
  assert.equal(due[0].overBy, 8);
});

test('a dismissal is respected until it expires', () => {
  const now = new Date('2026-08-02T10:00:00Z');
  const row = { category: 'aircon', item: 'coil cleaner', jobsSinceRestock: 20, threshold: 12 };
  assert.equal(dueForRestock([{ ...row, dismissedUntil: new Date('2026-08-05') }], { now }).length, 0);
  assert.equal(dueForRestock([{ ...row, dismissedUntil: new Date('2026-08-01') }], { now }).length, 1);
  // "Not now" is not "never".
  assert.ok(dismissUntil(now) > now);
});

test('the reminder states a count and lets the partner conclude', () => {
  const due = dueForRestock([
    { category: 'aircon', item: 'coil cleaner', jobsSinceRestock: 12, threshold: 12 },
    { category: 'aircon', item: 'drain flush solution', jobsSinceRestock: 15, threshold: 15 },
  ]);
  const text = reminderText(due, 'en');
  assert.match(text, /aircon jobs since your last restock/);
  assert.match(text, /coil cleaner and drain flush solution/);
  // It says "may be running low", never "you are out of".
  assert.match(text, /may be running low/);
  assert.match(reminderText(due, 'ms'), /sejak stok terakhir/);
  assert.equal(reminderText([], 'en'), null);
});

function fakeDb(rows = []) {
  const store = [...rows];
  return {
    rows: store,
    partnerConsumable: {
      createMany: async ({ data }) => {
        for (const d of data) {
          if (!store.some((r) => r.partnerId === d.partnerId && r.category === d.category && r.item === d.item)) {
            store.push({ jobsSinceRestock: 0, dismissedUntil: null, ...d });
          }
        }
        return { count: data.length };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const r of store) {
          if (r.partnerId !== where.partnerId) continue;
          if (where.category && r.category !== where.category) continue;
          if (where.item && r.item !== where.item) continue;
          for (const [k, v] of Object.entries(data)) {
            r[k] = (v && typeof v === 'object' && 'increment' in v) ? (r[k] || 0) + v.increment : v;
          }
          count += 1;
        }
        return { count };
      },
      findMany: async ({ where }) => store.filter((r) => r.partnerId === where.partnerId),
    },
  };
}

test('tracking is idempotent — adding a category twice makes no duplicates', async () => {
  const db = fakeDb();
  await ensureTracked(db, 'p1', 'aircon');
  await ensureTracked(db, 'p1', 'aircon');
  assert.equal(db.rows.length, itemsFor('aircon').length);
});

test('a completed job increments only that category', async () => {
  const db = fakeDb();
  await ensureTracked(db, 'p1', 'aircon');
  await ensureTracked(db, 'p1', 'plumbing');
  await recordJob(db, 'p1', 'aircon');
  assert.ok(db.rows.filter((r) => r.category === 'aircon').every((r) => r.jobsSinceRestock === 1));
  assert.ok(db.rows.filter((r) => r.category === 'plumbing').every((r) => r.jobsSinceRestock === 0));
  // An unknown category is a no-op, not a crash.
  assert.equal(await recordJob(db, 'p1', 'astrology'), 0);
});

test('restocking resets the count and clears any dismissal', async () => {
  const db = fakeDb();
  await ensureTracked(db, 'p1', 'aircon');
  for (let i = 0; i < 15; i += 1) await recordJob(db, 'p1', 'aircon');
  await dismiss(db, 'p1', { category: 'aircon' });
  assert.ok(db.rows[0].dismissedUntil);

  await markRestocked(db, 'p1', { category: 'aircon' });
  assert.ok(db.rows.every((r) => r.jobsSinceRestock === 0));
  assert.ok(db.rows.every((r) => r.dismissedUntil === null));
  assert.ok(db.rows.every((r) => r.lastRestockedAt));
});

test('checkPartner returns what is due, ready to render', async () => {
  const db = fakeDb();
  await ensureTracked(db, 'p1', 'cleaning');
  for (let i = 0; i < 11; i += 1) await recordJob(db, 'p1', 'cleaning');
  const { due, text } = await checkPartner(db, 'p1');
  assert.ok(due.some((d) => d.item === 'detergent'));
  assert.match(text, /cleaning jobs/);
});

// ── Ratings ──────────────────────────────────────────────────────────────────

test('every theme has keywords, a label and concrete advice in both languages', () => {
  assert.ok(THEME_IDS.length >= 5);
  for (const id of THEME_IDS) {
    const t = THEMES[id];
    assert.ok(t.keywords.length >= 3, `${id} has too few keywords`);
    for (const l of ['en', 'ms']) {
      assert.ok(t.label[l], `${id} has no ${l} label`);
      assert.ok(t.advice[l], `${id} has no ${l} advice`);
    }
  }
});

test('themes are detected in English and Malay', () => {
  assert.deepEqual(themesIn('He was very late and I waited an hour'), ['punctuality']);
  assert.deepEqual(themesIn('Juruteknik lambat sangat'), ['punctuality']);
  assert.ok(themesIn('Rushed the job and left a mess').includes('thoroughness'));
  assert.ok(themesIn('Rushed the job and left a mess').includes('cleanliness'));
  assert.deepEqual(themesIn('Excellent, very happy'), []);
  assert.deepEqual(themesIn(''), []);
});

test('analysis counts low reviews by theme and gives the top advice', () => {
  const reviews = [
    { rating: 5, comment: 'Great work', createdAt: '2026-07-01' },
    { rating: 2, comment: 'Arrived very late', createdAt: '2026-07-10' },
    { rating: 3, comment: 'Late again, waited 40 minutes', createdAt: '2026-07-15' },
    { rating: 2, comment: 'Did not explain what he did', createdAt: '2026-07-20' },
    { rating: 5, comment: 'Perfect', createdAt: '2026-07-25' },
  ];
  const a = analyseReviews(reviews);
  assert.equal(a.total, 5);
  assert.equal(a.average, 3.4);
  assert.equal(a.lowCount, 3);
  assert.equal(a.themes[0].id, 'punctuality');
  assert.equal(a.themes[0].count, 2);
  assert.ok(a.advice[0].includes('running behind'));
});

test('a low review with no recognisable theme is counted, not forced into one', () => {
  const a = analyseReviews([{ rating: 1, comment: 'Just not for me', createdAt: '2026-07-01' }]);
  assert.equal(a.lowCount, 1);
  assert.deepEqual(a.themes, []);
  assert.equal(a.unthemed, 1);
});

test('no reviews is a normal state', () => {
  const a = analyseReviews([]);
  assert.equal(a.total, 0);
  assert.equal(a.average, null);
  assert.match(summaryText(a, 'en'), /do not have any reviews yet/);
});

test('the trend compares recent against older', () => {
  const older = Array.from({ length: 6 }, (_, i) => ({ rating: 5, createdAt: `2026-05-0${i + 1}` }));
  const recent = Array.from({ length: 6 }, (_, i) => ({ rating: 3, createdAt: `2026-07-0${i + 1}` }));
  const t = trendOf([...older, ...recent]);
  assert.equal(t.direction, 'declining');
  assert.ok(t.recent < t.older);
  // Too few reviews to say anything is null, not a made-up trend.
  assert.equal(trendOf([{ rating: 5, createdAt: '2026-07-01' }]), null);
});

test('the summary reports counts, never a verdict on the person', () => {
  const a = analyseReviews([
    { rating: 2, comment: 'late', createdAt: '2026-07-01' },
    { rating: 5, comment: 'good', createdAt: '2026-07-02' },
  ]);
  const s = summaryText(a, 'en');
  assert.match(s, /You are at 3\.5 across 2 reviews/);
  for (const word of ['unreliable', 'bad', 'poor', 'lazy']) {
    assert.ok(!s.toLowerCase().includes(word), `summary should not say "${word}"`);
  }
});

test('LOW_RATING is the complaint threshold', () => {
  const a = analyseReviews([{ rating: LOW_RATING, comment: 'late' }, { rating: LOW_RATING + 1, comment: 'late' }]);
  assert.equal(a.lowCount, 1);
});

// ── Communication assistant ──────────────────────────────────────────────────

test('every situation drafts in both languages', () => {
  for (const id of SITUATION_IDS) {
    for (const customerLocale of ['en', 'ms']) {
      const r = draftMessage(id, { customerLocale, name: 'Ms Tan', minutes: 15 });
      assert.equal(r.ok, true, `${id}/${customerLocale}`);
      assert.ok(r.draft.length > 20);
      assert.ok(!r.draft.includes('undefined'), `${id}/${customerLocale} leaked undefined`);
    }
  }
  assert.equal(SITUATION_IDS.length, Object.keys(SITUATIONS).length);
});

test('the draft follows the CUSTOMER\'s language, not the partner\'s', () => {
  // The entire point of the feature.
  const r = draftMessage('on_the_way', { customerLocale: 'ms', partnerLocale: 'en', minutes: 10 });
  assert.equal(r.locale, 'ms');
  assert.match(r.draft, /dalam perjalanan/);
});

test('a draft is never sent — it is always editable', () => {
  const r = draftMessage('completed', { customerLocale: 'en' });
  assert.equal(r.editable, true);
  assert.equal(r.sent, false);
});

test('missing slots fall back to a vaguer but still correct sentence', () => {
  const r = draftMessage('additional_work', { customerLocale: 'en' });
  assert.equal(r.ok, true);
  assert.match(r.draft, /outside the booked scope/);
  assert.ok(!r.draft.includes('undefined'));
});

test('LEAKAGE GUARD — a phone number in partner free text is refused', () => {
  // Partner Terms 11.11 and 7.19. A generator that helpfully produced a contact
  // number would be the worst possible place for that breach to originate.
  for (const number of ['012-345 6789', '+60123456789', '0123456789', '03-2145 8899']) {
    const r = draftMessage('completed', { customerLocale: 'en', summary: `Call me on ${number}` });
    assert.equal(r.ok, false, `"${number}" was not caught`);
    assert.equal(r.error.code, 'off_platform_content');
  }
});

test('LEAKAGE GUARD — email, social handles and off-platform payment are refused', () => {
  const cases = [
    'Email me at ali@example.com',
    'Add me on WhatsApp',
    'Next time just call me directly',
    'You can pay me directly next time',
    'My bank account number is on the receipt',
  ];
  for (const summary of cases) {
    const r = draftMessage('completed', { customerLocale: 'en', summary });
    assert.equal(r.ok, false, `"${summary}" was not caught`);
    assert.deepEqual(Object.keys(r.error).sort(), ['code', 'message', 'violations']);
  }
});

test('the refusal explains the rule rather than just failing', () => {
  const r = draftMessage('completed', { customerLocale: 'en', summary: 'whatsapp me' });
  assert.match(r.error.message, /stay on the platform/);
  assert.match(r.error.message, /11\.11/);
  assert.match(draftMessage('completed', { customerLocale: 'en', partnerLocale: 'ms', summary: 'whatsapp me' }).error.message, /platform/);
});

test('ordinary free text passes the guard', () => {
  const r = draftMessage('additional_work', {
    customerLocale: 'en',
    finding: 'a cracked drain pan that needs replacing',
  });
  assert.equal(r.ok, true);
  assert.match(r.draft, /cracked drain pan/);
  assert.match(r.draft, /approved it/);
});

test('scanForLeakage is clean on normal service language', () => {
  for (const text of [
    'The work is complete and tested.',
    'I found a blocked drain line and cleared it.',
    'I will be about 15 minutes late.',
    'Please check the unit and let me know.',
  ]) {
    assert.equal(scanForLeakage(text).ok, true, `false positive on "${text}"`);
  }
});

test('an unknown situation is refused rather than improvised', () => {
  const r = draftMessage('ask_for_a_tip', { customerLocale: 'en' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'unknown_situation');
});

test('situation options are offered in the partner\'s own language', () => {
  const en = situationOptions('en');
  const ms = situationOptions('ms');
  assert.equal(en.length, SITUATION_IDS.length);
  assert.ok(en.some((o) => o.label === "I'm running late"));
  assert.ok(ms.some((o) => o.label === 'Saya lewat'));
});
