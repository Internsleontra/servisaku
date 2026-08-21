#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// DUAL-field guard.
//
// The API serves customer-visible text under two contracts:
//
//   SWAP — the server returns the already-localized string in the normal field
//          (errors, notifications, legal, chatbot answers). Render verbatim.
//   DUAL — the server returns BOTH columns, `name` and `name_my`, and the
//          client chooses with tField (categories, services, questions,
//          options, help articles).
//
// Translation-key coverage cannot see a DUAL mistake: `{question.label}` is not
// a dictionary key, so a fully translated database still renders English. That
// is exactly how the booking wizard shipped with English question labels while
// the server validated against the Malay ones.
//
// This checks the CLIENT half. For every JSX expression that renders a field
// which has a Malay sibling somewhere in the API contract, it requires the read
// to go through tField.
//
// Deliberately structural, not a list of component names: the rule is derived
// from which `*_my` fields the backend actually emits, so a new DUAL field is
// covered the day it is added.
//
//   node scripts/check-dual-fields.js
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/* ── 1. Derive the DUAL field set from what the backend emits ─────────────── */
// Both serialisation styles the codebase uses: `name_my` in API payloads,
// `nameMy` on Prisma records (tField accepts either).
function discoverDualFields() {
  const fields = new Set();
  for (const file of walk(join(ROOT, 'server'))) {
    if (!file.endsWith('.js') || file.includes('__tests__')) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(\w+)_my\s*:/g)) fields.add(m[1]);
    for (const m of src.matchAll(/(\w+)My\s*:/g)) {
      const base = m[1];
      if (base) fields.add(base);
    }
  }
  // camelCase discovery also catches internal-only props; keep the ones that
  // are genuinely display text. Anything not in this list is treated as an
  // English-only API field and is not required to go through tField.
  const DISPLAY = new Set(['name', 'label', 'title', 'description', 'summary', 'body', 'inclusions']);
  return new Set([...fields].filter((f) => DISPLAY.has(f)));
}

const DUAL_FIELDS = discoverDualFields();

/* ── 2. Things that are never a localized display read ────────────────────── */
// Local variables built from t(), dictionary maps keyed by language, enums,
// identifiers, and free text the customer typed (translating that would be
// wrong, not missing).
const NEVER_LOCALIZE = new Set([
  't', 'props', 'theme', 'styles', 'config', 'icon', 'Icon', 'e', 'err', 'error',
  'this', 'window', 'document', 'process', 'import', 'json', 'res', 'req',
  // customer- or partner-authored free text
  'dispute', 'claim', 'ticket', 'message', 'msg', 'review', 'reply', 'note',
]);

// A file may be exempted with an explicit, reviewable comment on the line:
//   {/* dual-field-exempt: reason */}   or   // dual-field-exempt: reason
const EXEMPT = /dual-field-exempt:/;

// Partner and admin surfaces are intentionally English for this phase.
const OUT_OF_SCOPE = /[/\\](apps[/\\]partner|pages[/\\]Partner|components[/\\]partner|pages[/\\]Admin)/;

/* ── 3. Scan the consumer client ──────────────────────────────────────────── */
const findings = [];
for (const file of walk(join(ROOT, 'src'))) {
  if (!/\.jsx?$/.test(file)) continue;
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (OUT_OF_SCOPE.test(rel)) continue;
  if (rel.endsWith('src/api/mockClient.js')) continue; // storage keys, not UI

  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  // A file that builds its own `label:`/`name:` values — from t(), a string
  // literal, or a template — owns that shape rather than reading it off an API
  // record. BottomNav's `{ label: t('Home') }` is already translated at
  // construction; requiring tField there would be wrong, not stricter.
  const buildsLocally = (field) =>
    new RegExp(`${field}\\s*:\\s*(t\\(|['"\`])`).test(src);

  lines.forEach((line, i) => {
    // On the line itself or shortly above it. A JSX comment cannot always sit
    // directly above the read — inside `xs.map(x => (` only one expression is
    // allowed — so the marker may have to go above the enclosing expression.
    const EXEMPT_LOOKBACK = 3;
    for (let k = 0; k <= EXEMPT_LOOKBACK; k++) {
      if (i - k >= 0 && EXEMPT.test(lines[i - k])) return;
    }
    for (const field of DUAL_FIELDS) {
      if (buildsLocally(field)) continue;
      // A JSX read: {expr.field} — including alt={x.name} and prop={x.label}.
      const re = new RegExp(`\\{\\s*([a-zA-Z_$][\\w$]*(?:\\??\\.[\\w$]+)*)\\.${field}\\s*[}\\s]`, 'g');
      for (const m of line.matchAll(re)) {
        const root = m[1].split(/[.?]/)[0];
        if (NEVER_LOCALIZE.has(root)) continue;
        if (/tField\s*\(/.test(line)) continue;      // already routed
        if (/\bt\(\s*[a-zA-Z_$]/.test(line)) continue; // t(x.label) — dictionary lookup
        findings.push({ rel, line: i + 1, field, expr: m[1], text: line.trim().slice(0, 96) });
      }
    }
  });
}

/* ── Report ──────────────────────────────────────────────────────────────── */
console.log(`\n  DUAL display fields discovered from the API: ${[...DUAL_FIELDS].sort().join(', ')}`);
console.log(`  Consumer files scanned for raw reads of those fields.`);

const byFile = {};
for (const f of findings) (byFile[f.rel] ??= []).push(f);

if (findings.length === 0) {
  console.log('\n  RESULT: PASS — every DUAL field read goes through tField');
  process.exitCode = 0;
} else {
  console.log(`\n  ${findings.length} raw read(s) of a field that has a Malay sibling:\n`);
  for (const [rel, list] of Object.entries(byFile)) {
    console.log(`   ${rel}`);
    for (const f of list) console.log(`     :${String(f.line).padEnd(5)} ${f.expr}.${f.field}   ${f.text}`);
  }
  console.log(`\n  Each of these renders English to a Malay customer even when the`);
  console.log(`  database is fully translated. Use tField(obj, '<field>'), or mark the`);
  console.log(`  line "dual-field-exempt: <reason>" if the value is genuinely not`);
  console.log(`  localizable (an identifier, an enum, or text the customer typed).`);
  console.log(`\n  RESULT: FAIL — ${findings.length} raw DUAL field read(s)`);
  process.exitCode = 1;
}
