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

const prisma = new PrismaClient();

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

function report(label, rows, keyField = 'slug') {
  const buckets = { ok: [], empty: [], identical: [], 'punctuation-only': [], 'no-malay-token': [] };
  for (const r of rows) buckets[classify(r.en, r.my)].push(r[keyField]);

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

  // Surfaces that have no Malay column at all — reported, not failed, because
  // fixing them is a schema change rather than a data fix.
  console.log('\n  Surfaces with no Malay column (schema-level gaps):');
  const q = await prisma.bookingQuestion.count();
  const o = await prisma.questionOption.count();
  const n = await prisma.notification.count();
  console.log(`    BookingQuestion.label : ${q} rows, no labelMy`);
  console.log(`    QuestionOption.label  : ${o} rows, no labelMy`);
  console.log(`    Notification title/body: ${n} rows, no titleMy/bodyMy`);

  console.log(`\n  RESULT: ${failures === 0 ? 'PASS — no fake or missing translations' : `FAIL — ${failures} record(s)`}`);
  await prisma.$disconnect();
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
