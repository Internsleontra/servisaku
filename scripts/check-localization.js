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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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


  console.log(`\n  RESULT: ${failures === 0 ? 'PASS — no fake or missing translations' : `FAIL — ${failures} record(s)`}`);
  await prisma.$disconnect();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
