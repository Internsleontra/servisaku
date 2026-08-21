#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Consumer locale matrix — every localized surface × four locale conditions,
// against a live server.
//
// Two response contracts are checked differently:
//
//   SWAP — the server returns the localized string in the normal field
//          (errors, notifications, legal, chatbot answers, quote breakdown).
//          Must follow ?locale → Accept-Language → English.
//   DUAL — the server returns both `name` and `name_my`; the client picks with
//          tField. Locale-independent by design, so what must hold is that the
//          `_my` field is present and genuinely Malay. An absent `_my` is a
//          defect: the client has nothing to pick and silently shows English.
//
// Totals and identifiers are asserted to be identical across languages, so a
// localization change cannot quietly move a price.
//
//   node server/index.js &
//   node scripts/check-locale-matrix.js
// ─────────────────────────────────────────────────────────────────────────────
const API = process.env.API_BASE || 'http://localhost:3001/api';
const MS_HDR = { 'accept-language': 'ms-MY,ms;q=0.9,en;q=0.8' };

const login = async (email, password) => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${email} failed: ${r.status}`);
  return (await r.json()).access_token;
};

const token = await login(process.env.SEED_CONSUMER || 'user@servisaku.my',
  process.env.SEED_CONSUMER_PW || 'user123');

async function hit({ method = 'GET', path, body }, { query, headers } = {}) {
  const url = query ? `${API}${path}${path.includes('?') ? '&' : '?'}locale=${query}` : API + path;
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

const MALAY = /\b(tidak|anda|perkhidmatan|tempahan|bayaran|pertikaian|tuntutan|tiket|invois|dokumen|artikel|kupon|saiz|rumah|bilik|pembersihan|penyaman|udara|dijumpai|dikenali|hanya|telah|sila|mesti|waktu|jam|dalam|untuk|dan|atau|nombor|maklumat|diperlukan|pilihan|harga|asas|yuran|caj|diskaun|kecantikan|kesihatan|wanita|polisi|pembatalan|bagaimana|menempah|lekapan|unit|mengikut|servis|dinding|siling|kaset)\b/i;
const isMs = (s) => MALAY.test(String(s ?? ''));
const first = (j) => (Array.isArray(j) ? j : (j?.items ?? j?.faqs ?? []))?.[0];

const DYN = {
  method: 'POST', path: '/bookings/calculate',
  body: { service_slug: 'ac-servicing', answers: { units: { '1hp': 2 }, mount: 'wall' } },
};

const SURFACES = [
  ['Catalogue (categories)', { path: '/categories' }, 'DUAL', (j) => first(j)?.name_my],
  ['Services', { path: '/services' }, 'DUAL', (j) => first(j)?.name_my],
  ['Booking questions', { path: '/services/ac-servicing' }, 'DUAL', (j) => j?.questions?.[0]?.label_my],
  ['Booking options', { path: '/services/ac-servicing' }, 'DUAL',
    // The first tier option is "1.0 HP" — a neutral value — so assert on a
    // question whose options carry real prose.
    (j) => j?.questions?.find((q) => q.id === 'mount')?.options?.[0]?.label_my],
  ['Quote breakdown', DYN, 'SWAP', (j) => j?.breakdown?.[0]?.label],
  ['Quote fixed labels', DYN, 'SWAP', (j) => j?.breakdown?.find((b) => b.type === 'SINGLE_SELECT')?.label],
  ['Validation errors', { method: 'POST', path: '/bookings/calculate', body: { service_slug: 'ac-servicing', answers: {} } }, 'SWAP', (j) => j?.error],
  ['Business-rule errors', { path: '/bookings/does-not-exist' }, 'SWAP', (j) => j?.error],
  ['Notifications', { path: '/notifications' }, 'SWAP', (j) => first(j)?.title],
  ['Legal', { path: '/legal/documents' }, 'SWAP', (j) => first(j)?.title],
  ['Help', { path: '/help/articles' }, 'DUAL', (j) => first(j)?.title_my],
  ['Chatbot FAQ answers', { path: '/chatbot/faqs' }, 'SWAP', (j) => first(j)?.answer],
  ['Chatbot greeting (?locale)', { method: 'POST', path: '/chatbot/conversations', body: { session_id: `m-${Date.now()}`, mode: 'assistant' } }, 'SWAP', (j) => j?.greeting],
];

const CONDITIONS = [
  ['?locale=en', { query: 'en' }, 'en'],
  ['?locale=ms', { query: 'ms' }, 'ms'],
  ['no locale', {}, 'en'],
  ['Accept-Lang ms', { headers: MS_HDR }, 'ms'],
];

console.log(`\n  ${'SURFACE'.padEnd(28)}${'CONTRACT'.padEnd(10)}${CONDITIONS.map(([n]) => n.padEnd(17)).join('')}`);
console.log('  ' + '─'.repeat(28 + 10 + 17 * 4));

let fails = 0; let cells = 0; const detail = [];
for (const [name, req, contract, extract] of SURFACES) {
  const row = [];
  for (const [cond, opts, want] of CONDITIONS) {
    const { status, json } = await hit(req, opts);
    const value = extract(json);
    cells++;
    if (value === undefined || value === null || value === '') {
      fails++; detail.push({ name, cond, contract, problem: 'field absent or empty', value, status });
      row.push('✗ absent'.padEnd(17)); continue;
    }
    const expectMs = contract === 'DUAL' ? true : want === 'ms';
    const ok = isMs(value) === expectMs;
    if (!ok) { fails++; detail.push({ name, cond, contract, problem: `expected ${expectMs ? 'Malay' : 'English'}`, value, status }); }
    row.push(`${ok ? '✓' : '✗'} ${isMs(value) ? 'ms' : 'en'}`.padEnd(17));
  }
  console.log(`  ${name.padEnd(28)}${contract.padEnd(10)}${row.join('')}`);
}

/* ── Money and identifiers must not move with language ───────────────────── */
console.log(`\n  Invariants across languages`);
console.log('  ' + '─'.repeat(72));
const en = (await hit(DYN, { query: 'en' })).json;
const ms = (await hit(DYN, { query: 'ms' })).json;
const invariants = [
  ['total', en?.total, ms?.total],
  ['subtotal', en?.subtotal, ms?.subtotal],
  ['service_total', en?.service_total, ms?.service_total],
  ['platform_fee', en?.platform_fee, ms?.platform_fee],
  ['tax.rate_percent', en?.tax?.rate_percent, ms?.tax?.rate_percent],
  ['breakdown questionIds', JSON.stringify(en?.breakdown?.map((b) => b.questionId)), JSON.stringify(ms?.breakdown?.map((b) => b.questionId))],
  ['breakdown optionIds', JSON.stringify(en?.breakdown?.map((b) => b.optionId)), JSON.stringify(ms?.breakdown?.map((b) => b.optionId))],
  ['breakdown amounts', JSON.stringify(en?.breakdown?.map((b) => b.amount)), JSON.stringify(ms?.breakdown?.map((b) => b.amount))],
];
for (const [label, a, b] of invariants) {
  const same = a === b;
  if (!same) { fails++; detail.push({ name: `invariant ${label}`, cond: 'en vs ms', contract: '—', problem: `en=${a} ms=${b}`, value: '', status: 200 }); }
  console.log(`   ${same ? '✓' : '✗'} ${label.padEnd(24)} ${a}`);
  cells++;
}

/* ── Question ids and types must not localize ────────────────────────────── */
const svcEn = (await hit({ path: '/services/ac-servicing' }, { query: 'en' })).json;
const svcMs = (await hit({ path: '/services/ac-servicing' }, { query: 'ms' })).json;
for (const [label, pick] of [
  ['question ids', (j) => j?.questions?.map((q) => q.id).join(',')],
  ['question types', (j) => j?.questions?.map((q) => q.type).join(',')],
  ['option ids', (j) => j?.questions?.flatMap((q) => q.options.map((o) => o.id)).join(',')],
  ['option unit prices', (j) => j?.questions?.flatMap((q) => q.options.map((o) => o.unit_price)).join(',')],
]) {
  const a = pick(svcEn); const b = pick(svcMs);
  const same = a === b;
  if (!same) { fails++; detail.push({ name: `invariant ${label}`, cond: 'en vs ms', contract: '—', problem: `en=${a} ms=${b}`, value: '', status: 200 }); }
  console.log(`   ${same ? '✓' : '✗'} ${label.padEnd(24)} ${String(a).slice(0, 60)}`);
  cells++;
}

if (detail.length) {
  console.log(`\n  MISMATCHES\n  ${'─'.repeat(72)}`);
  const seen = new Set();
  for (const d of detail) {
    const k = `${d.name}|${d.problem}`;
    if (seen.has(k)) continue; seen.add(k);
    const n = detail.filter((x) => `${x.name}|${x.problem}` === k).length;
    console.log(`   ${d.name} [${d.contract}] — ${d.problem} (${n}×, HTTP ${d.status})`);
    if (d.value) console.log(`     got: ${String(d.value).slice(0, 130)}`);
  }
}
console.log(`\n  checks: ${cells} · mismatches: ${fails}`);
console.log(`  RESULT: ${fails === 0 ? 'PASS' : 'FAIL'}`);
process.exitCode = fails === 0 ? 0 : 1;
