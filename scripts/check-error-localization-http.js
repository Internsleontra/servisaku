#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// End-to-end error-localization journey: every consumer business-rule group,
// driven the way the shipped app drives it — Accept-Language only, no ?locale
// override, because that is the header src/api/apiClient.js actually sends.
//
// Complements scripts/check-localization.js. That one reads the catalog and the
// source statically; this one exercises the wiring. Three real defects on this
// branch — a helper raising "req is not defined", a route holding a translated
// message it never passed a locale to, and an English zod headline — were
// invisible to every static check and only surfaced here.
//
// The Malay pass fails on ANY unexpected English, detected by looking for
// English function words in the returned sentence rather than by comparing to
// a fixed list, so a message nobody thought to translate still trips it.
//
// Needs a running API on :3001 and the dev seed, so it is a local/staging check
// rather than a unit test:
//
//   node server/index.js &
//   node scripts/check-error-localization-http.js
// ─────────────────────────────────────────────────────────────────────────────
const API = 'http://localhost:3001/api';
const MS = 'ms-MY,ms;q=0.9,en;q=0.8';
const EN = 'en-US,en;q=0.9';

const ENGLISH_MARKERS = /\b(the|you|your|this|cannot|can only|already|not found|must|please|is not|has been|are|were|and|for|with|from|after|before|once|instead|no |only)\b/i;
const MALAY_MARKERS = /\b(tidak|anda|ini|hanya|telah|sila|boleh|mesti|tempahan|bayaran|pertikaian|tuntutan|tiket|perkhidmatan|kupon|waktu|invois|akses|medan|status|pakej|saiz|panggilan|nilai|pemilik|ralat|maklumat|dihantar)\b/i;

async function login(email, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return j.token || j.access_token;
}

async function call(token, { method = 'POST', path, body }, acceptLanguage) {
  const r = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'accept-language': acceptLanguage,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, msg: j.error, code: j.details?.[0]?.code, body: j };
}

const CONSUMER = process.env.SEED_CONSUMER || 'user@servisaku.my';
const CONSUMER_PW = process.env.SEED_CONSUMER_PW || 'user123';
const OTHER = process.env.SEED_OTHER || 'chong@servisaku.my';
const OTHER_PW = process.env.SEED_OTHER_PW || 'partner123';

const alice = await login(CONSUMER, CONSUMER_PW);
const chong = await login(OTHER, OTHER_PW);

// Discovered, not hardcoded — booking ids differ in every seeded database, and
// a stale literal turns a real failure into a 404 that quietly looks like a pass.
const mine = await (await fetch(`${API}/bookings`, { headers: { authorization: `Bearer ${alice}` } })).json();
const theirs = await (await fetch(`${API}/bookings`, { headers: { authorization: `Bearer ${chong}` } })).json();
const list = Array.isArray(mine) ? mine : (mine.items ?? []);
const otherList = Array.isArray(theirs) ? theirs : (theirs.items ?? []);

const PENDING = (list.find((b) => ['pending', 'confirmed'].includes(b.status)) ?? list[0])?.id;
const COMPLETED = (list.find((b) => b.status === 'completed') ?? list[0])?.id;
const otherIds = new Set(otherList.map((b) => b.id));
const FOREIGN = list.find((b) => !otherIds.has(b.id))?.id;

if (!PENDING || !COMPLETED || !FOREIGN) {
  console.error('  Cannot run: the seeded data needs a pending and a completed booking for');
  console.error(`  ${CONSUMER}, and at least one ${OTHER} cannot see. Run \`npm run seed\` first.`);
  process.exit(2);
}

const GROUPS = {
  'Booking': [
    ['booking does not exist', alice, { method: 'GET', path: '/bookings/no-such-booking' }],
    ["someone else's booking", chong, { method: 'GET', path: `/bookings/${FOREIGN}` }],
    ['status the customer may not set', alice, { method: 'PATCH', path: `/bookings/${PENDING}`, body: { status: 'completed' } }],
    ['nothing updatable in the payload', alice, { method: 'PATCH', path: `/bookings/${PENDING}`, body: { nope: 1 } }],
  ],
  'Catalogue & pricing': [
    ['unknown service in a quote', alice, { path: '/pricing/calculate', body: { service_id: 'nope', package_id: 'basic' } }],
    ['service that does not exist', alice, { method: 'GET', path: '/services/nope-xyz' }],
  ],
  'Payments': [
    ['payment that does not exist', alice, { method: 'GET', path: '/payments/nope-xyz' }],
  ],
  'Refunds': [
    ['refund policy on an ineligible booking', alice, { method: 'GET', path: `/refunds/policy?booking_id=${COMPLETED}` }],
    ['refund request that does not exist', alice, { method: 'GET', path: '/refunds/nope-xyz' }],
  ],
  'Disputes': [
    ['dispute before the service started', alice, { path: '/disputes', body: { booking_id: PENDING, category: 'service_quality', description: 'The work was not done to the agreed standard at all.' } }],
    ['dispute that does not exist', alice, { method: 'GET', path: '/disputes/nope-xyz' }],
  ],
  'Damage claims': [
    ['claim before completion', alice, { path: '/damage-claims', body: { booking_id: PENDING, category: 'property', item_description: 'Living room floor', incident_description: 'The floor was deeply scratched during the visit.', claimed_amount: 100, evidence: [{ kind: 'photo', file_url: 'https://example.test/x.jpg' }] } }],
    ['claim that does not exist', alice, { method: 'GET', path: '/damage-claims/nope-xyz' }],
  ],
  'Reviews': [
    ['review a booking that is not complete', alice, { path: '/reviews', body: { booking_id: PENDING, rating: 5, comment: 'great' } }],
  ],
  'Support': [
    ['ticket that does not exist', alice, { path: '/support/nope-xyz/reopen' }],
    ['callback window ends before it starts', alice, { path: '/support/callbacks', body: { phone: '0123456789', preferred_from: '2027-01-02T10:00:00Z', preferred_to: '2027-01-02T09:00:00Z' } }],
    ['callback window in the past', alice, { path: '/support/callbacks', body: { phone: '0123456789', preferred_from: '2020-01-02T09:00:00Z', preferred_to: '2020-01-02T10:00:00Z' } }],
    ['malformed request (zod)', alice, { path: '/support/callbacks', body: { phone: 'x' } }],
  ],
  'Invoices': [
    ['invoice that does not exist', alice, { method: 'GET', path: '/invoices/nope-xyz' }],
  ],
  'Notifications': [
    ['notification that does not exist', alice, { method: 'PATCH', path: '/notifications/nope-xyz/read', body: { is_read: true } }],
  ],
  // Served without auth to the public site, so `null` token on purpose.
  'Help & legal (unauthenticated)': [
    ['help article that does not exist', null, { method: 'GET', path: '/help/articles/nope-xyz' }],
    ['legal document with an unknown slug', null, { method: 'GET', path: '/legal/documents/nope-xyz' }],
  ],
};

let leaks = 0; let checked = 0; let skipped = 0;

for (const [group, cases] of Object.entries(GROUPS)) {
  console.log(`\n${group}`);
  console.log('─'.repeat(72));
  for (const [label, token, req] of cases) {
    const ms = await call(token, req, MS);
    const en = await call(token, req, EN);

    // Some customer-visible prose arrives on a 200 — the refund policy preview
    // explains its verdict in a sentence. Judge it exactly like an error
    // message; `policy` plays the role of the stable code.
    if (ms.status < 400) {
      if (!ms.body?.explanation) {
        console.log(`  ·  ${label}\n       (no error raised — status ${ms.status}, not an error case here)`);
        skipped++; continue;
      }
      ms.msg = ms.body.explanation; en.msg = en.body.explanation;
      ms.code = ms.body.policy; en.code = en.body.policy;
    }
    checked++;

    const englishLeak = ENGLISH_MARKERS.test(ms.msg || '') && !MALAY_MARKERS.test(ms.msg || '');
    const statusMatch = ms.status === en.status;
    const codeMatch = ms.code === en.code;
    const ok = !englishLeak && statusMatch && codeMatch;
    if (!ok) leaks++;

    console.log(`  ${ok ? '✓' : '✗'}  ${label}   [${ms.status}${ms.code ? ' · ' + ms.code : ''}]`);
    console.log(`       ms  ${ms.msg}`);
    console.log(`       en  ${en.msg}`);
    if (englishLeak) console.log('       ✗ ENGLISH LEAK in the Malay response');
    if (!statusMatch) console.log(`       ✗ status differs by language: ${ms.status} vs ${en.status}`);
    if (!codeMatch) console.log(`       ✗ code differs by language: ${ms.code} vs ${en.code}`);
  }
}

console.log(`\n${'═'.repeat(72)}`);
console.log(`  ${checked} error responses checked · ${leaks} with unexpected English or a changed contract`);
if (skipped) console.log(`  ${skipped} case(s) returned success rather than an error and were not counted`);
process.exit(leaks === 0 ? 0 : 1);
