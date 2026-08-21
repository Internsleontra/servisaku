#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Localization data validator.
//
// A populated `*My` column is not evidence of a translation. This repository
// previously seeded `nameMy: cat.name`, which left every Malay field full and
// every Malay value English — the exact failure a key-count check cannot see.
//
// So this checks the CONTENT, not the presence:
//   · missing / empty Malay
//   · Malay byte-identical to English
//   · Malay differing from English only by case or punctuation
//   · Malay that contains no Malay-looking token at all
//
// Read-only. Exits non-zero when something fails, so CI can gate on it.
//
//   node scripts/check-localization.js
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { localizedMessage, refundPolicyReason, ERROR_CODES, ERROR_MESSAGES, REFUND_POLICY_CODES } from '../server/lib/errors.js';
import { POLICIES } from '../server/lib/refunds/policy.js';

const prisma = new PrismaClient();

/* Strings that are deliberately the same in both languages. Declared in a
   version-controlled file rather than inferred by a regex, so every
   untranslated string is a conscious, reviewable entry. */
const here = dirname(fileURLToPath(import.meta.url));
const NEUTRAL = new Set(
  JSON.parse(readFileSync(join(here, '../prisma/data/localization-neutral.json'), 'utf8')).neutral,
);

/* Words that mark a string as plausibly Malay. Deliberately small and boring:
   the point is to catch English left in a Malay column, not to grade prose. */
const MALAY_MARKERS = [
  'perkhidmatan', 'pembersihan', 'pembaikan', 'pemasangan', 'penggantian',
  'rawatan', 'kawalan', 'urutan', 'rambut', 'muka', 'kuku', 'badan',
  'rumah', 'bilik', 'air', 'paip', 'kunci', 'pintu', 'dinding', 'lampu',
  'kipas', 'cermin', 'rak', 'perabot', 'tukang', 'kayu', 'mengecat',
  'penyaman', 'udara', 'peti', 'sejuk', 'mesin', 'basuh', 'ketuhar',
  'kecantikan', 'kesihatan', 'wanita', 'lelaki', 'dandanan', 'segera',
  'bantuan', 'juruelektrik', 'serangga', 'perosak', 'anai', 'lipas',
  'semut', 'nyamuk', 'tikus', 'pepijat', 'tilam', 'sofa', 'hud', 'dapur',
  'saluran', 'tersumbat', 'kebocoran', 'pendawaian', 'suis', 'soket',
  'papan', 'agihan', 'pintar', 'besen', 'cuci', 'tangan', 'langsir',
  'kertas', 'panel', 'teres', 'kalis', 'dalaman', 'luaran', 'seluruh',
  'mendalam', 'pindah', 'masuk', 'keluar', 'sanitasi', 'penyejukan',
  'diagnosis', 'diagnostik', 'panggilan', 'gaya', 'potong', 'pewarnaan',
  'pelurusan', 'solekan', 'pengantin', 'relaksasi', 'minit', 'janggut',
  'kemas', 'tisu', 'dalam', 'isi', 'semula', 'tambah', 'gas', 'baharu',
  'penapis', 'pemanas', 'jam', 'ikut', 'pengubahsuaian', 'serba', 'boleh',
  // legal / help vocabulary
  'dasar', 'polisi', 'privasi', 'terma', 'syarat', 'bayaran', 'balik',
  'pembatalan', 'kerosakan', 'rakan', 'kongsi', 'notis', 'mengapa',
  'bilakah', 'bagaimana', 'adakah', 'bolehkah', 'saya', 'anda', 'invois',
  'lanjutan', 'komisen', 'tunai', 'dibayar', 'disahkan', 'profesional',
]; 

const normalise = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

function classify(en, my) {
  if (my === null || my === undefined || !String(my).trim()) return 'empty';
  if (my === en) return 'identical';
  if (normalise(my) === normalise(en)) return 'punctuation-only';
  const tokens = normalise(my).split(' ');
  if (!tokens.some((w) => MALAY_MARKERS.includes(w))) return 'no-malay-token';
  return 'ok';
}

const FAIL = new Set(['empty', 'identical', 'punctuation-only']);

function report(label, rows, keyField = 'slug', neutral = null) {
  const buckets = { ok: [], empty: [], identical: [], 'punctuation-only': [], 'no-malay-token': [] };
  for (const r of rows) {
    let kind = classify(r.en, r.my);
    if (neutral) {
      // Declared-neutral strings are allowed to match English exactly. For the
      // rest, "differs from English" is the real signal — the Malay-marker
      // heuristic is too coarse across 566 short domain labels and only
      // produces noise here.
      if (neutral.has(r.en)) kind = kind === 'empty' ? 'empty' : 'ok';
      else if (kind === 'no-malay-token') kind = 'ok';
    }
    buckets[kind].push(r[keyField]);
  }

  const failed = [...FAIL].reduce((n, k) => n + buckets[k].length, 0);
  console.log(`\n  ${label}: ${rows.length} records`);
  console.log(`    genuine Malay        : ${buckets.ok.length}`);
  console.log(`    empty                : ${buckets.empty.length}`);
  console.log(`    identical to English : ${buckets.identical.length}`);
  console.log(`    punctuation-only diff: ${buckets['punctuation-only'].length}`);
  console.log(`    no Malay token (review): ${buckets['no-malay-token'].length}`);
  for (const k of ['empty', 'identical', 'punctuation-only']) {
    if (buckets[k].length) console.log(`      ${k}: ${buckets[k].slice(0, 12).join(', ')}`);
  }
  if (buckets['no-malay-token'].length) {
    console.log(`      review: ${buckets['no-malay-token'].slice(0, 12).join(', ')}`);
  }
  return failed;
}

/* ───────────────────────────────────────────────────────────────────────────
   Code-side checks: the localized error catalog and the wiring around it.

   The DB checks above catch fake translations in DATA. These catch the two
   ways the ERROR path breaks instead — a message that was never translated,
   and a route that holds a translated message but never passes the locale in.
   ─────────────────────────────────────────────────────────────────────────── */

const ROOT = join(here, '..');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function checkErrorCatalog() {
  const problems = [];
  const probe = ['«a»', '«b»'];

  for (const code of ERROR_CODES) {
    const set = ERROR_MESSAGES[code];
    if (!set.en || !set.ms) { problems.push(`${code}: missing ${set.en ? 'ms' : 'en'}`); continue; }

    const en = String(localizedMessage(code, 'en', ...probe));
    const ms = String(localizedMessage(code, 'ms', ...probe));

    if (!ms.trim()) problems.push(`${code}: Malay is empty`);
    else if (ms === en) problems.push(`${code}: Malay identical to English — "${en}"`);
    else if (normalise(ms) === normalise(en)) problems.push(`${code}: differs only by punctuation`);

    // A placeholder that vanished in translation silently drops the id,
    // amount or status the sentence exists to communicate.
    for (const [lang, text] of [['en', en], ['ms', ms]]) {
      if (/undefined|\[object |\bNaN\b|\$\{/.test(text)) problems.push(`${code}[${lang}]: broken placeholder → ${text}`);
      for (const token of probe) {
        const inEn = en.includes(token);
        if (inEn && !text.includes(token)) problems.push(`${code}[${lang}]: dropped the ${token} argument`);
      }
    }
  }

  console.log(`\n  Error catalog: ${ERROR_CODES.length} codes`);
  console.log(`    problems             : ${problems.length}`);
  for (const p of problems.slice(0, 20)) console.log(`      ${p}`);
  return problems.length;
}

function checkRefundPolicies() {
  const problems = [];
  for (const policy of Object.values(POLICIES)) {
    if (!REFUND_POLICY_CODES.includes(policy)) { problems.push(`${policy}: engine returns it, no Malay explanation`); continue; }
    if (refundPolicyReason(policy, 'ms') === refundPolicyReason(policy, 'en')) problems.push(`${policy}: Malay identical to English`);
  }
  console.log(`\n  Refund policy explanations: ${Object.values(POLICIES).length} engine policies`);
  console.log(`    problems             : ${problems.length}`);
  for (const p of problems) console.log(`      ${p}`);
  return problems.length;
}

/* `localizedError(..., localeOf(req))` pasted into a helper that has no `req`
   throws "req is not defined" — a 500 in place of the business rule. This is
   not hypothetical: three such sites shipped into this branch before it ran. */
function checkLocaleInScope() {
  const declRe = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/;
  const scopeRe = /async\s*\(([^)]*)\)|\(([^)]*)\)\s*=>/;
  const problems = [];

  for (const file of walk(join(ROOT, 'server'))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('localeOf(req)')) return;
      for (let j = i; j >= 0; j--) {
        const scope = scopeRe.exec(lines[j]);
        if (scope) {
          const params = scope[1] ?? scope[2] ?? '';
          // `.map((x) => …)` closes over the handler's `req`; only a scope that
          // itself introduces parameters and omits `req` is suspect, and an
          // enclosing handler further up may still supply it.
          if (!/\breq\b/.test(params) && !lines.slice(0, j).some((l) => /async\s*\(\s*req\b/.test(l))) {
            problems.push(`${relative(ROOT, file)}:${i + 1} — no \`req\` in scope`);
          }
          return;
        }
        const decl = declRe.exec(lines[j]);
        if (decl) {
          if (!/\breq\b/.test(decl[2])) problems.push(`${relative(ROOT, file)}:${i + 1} — \`req\` is not a parameter of ${decl[1]}()`);
          return;
        }
      }
    });
  }

  console.log('\n  localeOf(req) scope');
  console.log(`    out-of-scope uses    : ${problems.length}`);
  for (const p of problems.slice(0, 12)) console.log(`      ${p}`);
  return problems.length;
}

/* A helper that takes a locale it never receives is worse than one that does
   not take it at all: the message looks localized in the catalog and arrives
   in English. Every caller must pass the argument. */
const LOCALE_PARAM_INDEX = {
  getBookingOr404: 1, assertBookingParticipant: 2, resolveServiceOr404: 1,
  resolveServiceDetailOr404: 1, resolveCoupon: 4, sizeMultiplierFor: 2,
};

function checkLocaleThreaded() {
  const problems = [];
  const splitArgs = (s) => {
    const out = []; let depth = 0; let cur = '';
    for (const ch of s) {
      if ('([{'.includes(ch)) depth++;
      if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };

  for (const file of walk(join(ROOT, 'server'))) {
    const src = readFileSync(file, 'utf8');
    for (const [name, idx] of Object.entries(LOCALE_PARAM_INDEX)) {
      const re = new RegExp(`(?<![\\w.])${name}\\(`, 'g');
      let m;
      while ((m = re.exec(src))) {
        if (/function\s+$/.test(src.slice(Math.max(0, m.index - 30), m.index))) continue;
        let depth = 1; let j = m.index + m[0].length;
        const start = j;
        while (j < src.length && depth) {
          if ('([{'.includes(src[j])) depth++;
          else if (')]}'.includes(src[j])) depth--;
          j++;
        }
        if (splitArgs(src.slice(start, j - 1)).length <= idx) {
          problems.push(`${relative(ROOT, file)}:${src.slice(0, m.index).split('\n').length} — ${name}() called without a locale`);
        }
      }
    }
  }

  console.log('\n  locale threading');
  console.log(`    callers omitting it  : ${problems.length}`);
  for (const p of problems.slice(0, 12)) console.log(`      ${p}`);
  return problems.length;
}

async function main() {
  let failures = 0;

  const cats = await prisma.serviceCategory.findMany({ select: { slug: true, name: true, nameMy: true } });
  failures += report('ServiceCategory.nameMy', cats.map((c) => ({ slug: c.slug, en: c.name, my: c.nameMy })));

  const svcs = await prisma.service.findMany({ select: { slug: true, name: true, nameMy: true } });
  failures += report('Service.nameMy', svcs.map((s) => ({ slug: s.slug, en: s.name, my: s.nameMy })));

  // Legal + help already carry professionally written Malay; verify it stays that way.
  const legal = await prisma.legalDocument.findMany({ select: { slug: true, title: true, titleMy: true } });
  if (legal.length) {
    failures += report('LegalDocument.titleMy', legal.map((d) => ({ slug: d.slug, en: d.title, my: d.titleMy })));
  }
  const help = await prisma.helpArticle.findMany({ select: { slug: true, title: true, titleMy: true } });
  if (help.length) {
    failures += report('HelpArticle.titleMy', help.map((a) => ({ slug: a.slug, en: a.title, my: a.titleMy })));
  }

  // Question and option labels feed the quote breakdown, so English here leaks
  // straight into a customer-visible price. Strings that are legitimately the
  // same in both languages (units, refrigerant grades, room codes, brand or
  // product identifiers) are allowed through explicitly rather than silently.

  const qs = await prisma.bookingQuestion.findMany({ select: { id: true, key: true, label: true, labelMy: true } });
  failures += report('BookingQuestion.labelMy',
    qs.map((q) => ({ slug: q.key, en: q.label, my: q.labelMy })), 'slug', NEUTRAL);

  const opts = await prisma.questionOption.findMany({ select: { id: true, key: true, label: true, labelMy: true } });
  failures += report('QuestionOption.labelMy',
    opts.map((o) => ({ slug: o.key, en: o.label, my: o.labelMy })), 'slug', NEUTRAL);

  // Notifications: Malay is written at creation from the same catalog template.
  // Historical rows are NULL by design (see the migration) and are not failures.
  const notes = await prisma.notification.findMany({ select: { id: true, title: true, titleMy: true, createdAt: true } });
  const withMy = notes.filter((n) => n.titleMy);
  const noMy = notes.filter((n) => !n.titleMy);
  const badMy = withMy.filter((n) => n.titleMy === n.title || /undefined|null|\[object/.test(n.titleMy));
  console.log(`
  Notification.titleMy: ${notes.length} rows`);
  console.log(`    localized            : ${withMy.length}`);
  console.log(`    historical (NULL, ok): ${noMy.length}`);
  console.log(`    broken placeholders  : ${badMy.length}`);
  if (badMy.length) {
    console.log(`      ${badMy.slice(0, 8).map((n) => n.id).join(', ')}`);
    failures += badMy.length;
  }


  failures += checkErrorCatalog();
  failures += checkRefundPolicies();
  failures += checkLocaleInScope();
  failures += checkLocaleThreaded();

  console.log(`\n  RESULT: ${failures === 0 ? 'PASS — no fake or missing translations' : `FAIL — ${failures} record(s)`}`);
  await prisma.$disconnect();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
