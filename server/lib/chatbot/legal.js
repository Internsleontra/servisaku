// ─────────────────────────────────────────────────────────────────────────────
// Terms & Conditions as a knowledge source.
//
// The T&C is the LEGAL source of truth, so a policy answer drawn from it
// outranks the operational corpus and is cited by clause number. That is the
// point of this module — and also why it ships switched off.
//
// ── WHY THIS IS GATED ────────────────────────────────────────────────────────
// docs/12-tc-conflict-report.md records 45 places where the platform's behaviour
// and the contract disagree. Quoting clause 8.1 at a customer tells them they
// are owed a full refund; the cancellation screen currently pays 75%. Reciting
// the binding document while the product does something else is worse than
// staying quiet, because it is now in writing with a clause reference attached.
//
// So there are TWO independent guards, and both must pass before a clause is
// spoken:
//
//   1. CHATBOT_LEGAL_SOURCE_ENABLED — off by default. Nothing here reaches a
//      customer until the approval sheet in docs/12 is signed off.
//   2. Per-clause blocking — even when enabled, a clause whose governing policy
//      key disagrees with it stays unquotable. Derived from the conflict engine,
//      so clauses unblock one at a time as conflicts are resolved rather than
//      all at once.
//
// The chunker and the citation validator are pure, so both are testable without
// a database or a model.
// ─────────────────────────────────────────────────────────────────────────────
import { POLICY_KEYS } from '../policy/catalog.js';
import { blockedPolicyKeys } from './policyText.js';

/** Master switch. Off unless explicitly enabled — see the header. */
export const isLegalSourceEnabled = () => process.env.CHATBOT_LEGAL_SOURCE_ENABLED === 'true';

// ─── Chunking ────────────────────────────────────────────────────────────────

// "PART B" or "PART B — BOOKINGS, PAYMENTS AND MONEY"
const PART_RE = /^PART\s+([A-Z])\b\s*[—–-]?\s*(.*)$/;
// "8.1 Free cancellation window. A Customer may…" — the space is optional
// because PDF and DOCX extraction routinely swallows it.
const SUBCLAUSE_RE = /^(\d{1,2}\.\d{1,2})\s*(.*)$/;
// "8 Cancellation Policy" — a section heading, not a citable clause on its own.
const SECTION_RE = /^(\d{1,2})\s*([A-Z][^.]{2,80})$/;

/**
 * Split a legal document into citable clauses.
 *
 * A chunk is always a WHOLE clause, so a citation always names something that
 * exists. Section headings and part labels are carried down as context rather
 * than emitted as clauses — nobody cites "clause 8" when they mean 8.1.
 *
 * @param {string} markdown
 * @param {object} [opts]
 * @param {string} [opts.locale]
 * @returns {Array<{ clauseNo, partLabel, heading, text, ordinal, locale }>}
 */
export function chunkDocument(markdown, { locale = 'en' } = {}) {
  const lines = String(markdown || '').split(/\r?\n/);
  const out = [];

  let partLabel = null;
  let heading = null;
  let current = null;
  let ordinal = 0;
  // The major number of the section we are inside, so a heading line can be
  // told apart from a body line that happens to start with a number.
  let section = 0;

  const flush = () => {
    if (!current) return;
    const text = current.text.join('\n').replace(/\s+\n/g, '\n').trim();
    // A clause number with no body is a stray heading or an extraction artefact.
    if (text) {
      ordinal += 1;
      out.push({ ...current, text, ordinal, locale });
    }
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (current) current.text.push(''); continue; }

    const part = PART_RE.exec(line);
    if (part) {
      flush();
      partLabel = `PART ${part[1]}`;
      // The part's own title usually sits on the next line; keep the label only.
      heading = null;
      continue;
    }

    const sub = SUBCLAUSE_RE.exec(line);
    if (sub) {
      flush();
      section = Number(sub[1].split('.')[0]);
      current = { clauseNo: sub[1], partLabel, heading, text: [sub[2] || ''] };
      continue;
    }

    const head = SECTION_RE.exec(line);
    // A section heading ALWAYS terminates the clause above it — otherwise
    // "9 Refund Policy" is appended to clause 8.1's body and clause 9.1 inherits
    // the previous section's heading.
    //
    // The ascending-number test is what distinguishes a heading from a body line
    // that begins with a number ("10 Business Days notice…"): section numbers
    // only ever go up.
    if (head && Number(head[1]) > section) {
      flush();
      section = Number(head[1]);
      heading = head[2].trim();
      continue;
    }

    if (current) current.text.push(line);
  }

  flush();
  return out;
}

// ─── Clause ↔ policy mapping ─────────────────────────────────────────────────

/**
 * Which policy keys does a clause govern?
 * Read straight off the catalogue, so the mapping is declared in one place and
 * cannot drift from what the conflict engine checks.
 */
export function policyKeysForClause(clauseNo) {
  return POLICY_KEYS.filter((k) => k.clause === clauseNo).map((k) => k.key);
}

/**
 * Clauses that must not be quoted, because a value they govern disagrees with
 * them. Derived, never hand-listed.
 */
export function blockedClauses(registry) {
  const blockedKeys = blockedPolicyKeys(registry);
  const clauses = new Set();
  for (const def of POLICY_KEYS) {
    if (def.clause && blockedKeys.has(def.key)) clauses.add(def.clause);
  }
  return clauses;
}

/** May this clause be quoted right now? */
export function isClauseCitable(clauseNo, { registry, blocked } = {}) {
  if (!isLegalSourceEnabled()) return false;
  const set = blocked || blockedClauses(registry);
  return !set.has(clauseNo);
}

// ─── Retrieval ───────────────────────────────────────────────────────────────

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'of', 'to', 'in', 'for', 'and', 'or', 'my', 'i', 'what', 'how', 'can', 'do', 'does', 'any']);

const tokens = (s) => String(s || '')
  .toLowerCase()
  .split(/[^\p{L}\p{N}\p{M}]+/u)
  .filter((w) => w.length > 2 && !STOPWORDS.has(w));

/** Keyword overlap between a query and a clause. */
export function scoreClause(clause, queryTokens) {
  const hay = new Set(tokens(`${clause.heading || ''} ${clause.text}`));
  let hits = 0;
  for (const t of queryTokens) if (hay.has(t)) hits += 1;
  // A heading match is a stronger signal than a body match — headings are what
  // the clause is *about*, bodies mention everything in passing.
  const headingBonus = queryTokens.some((t) => tokens(clause.heading || '').includes(t)) ? 2 : 0;
  return hits + headingBonus;
}

/**
 * Retrieve clauses for a query.
 *
 * Returns [] when the source is disabled, so every caller degrades to the
 * operational corpus with no special-casing at the call site.
 *
 * @param {object} db      prisma client
 * @param {string} query
 * @param {object} [opts]  { locale, limit, registry, audience }
 */
export async function retrieveClauses(db, query, {
  locale = 'en', limit = 3, registry, audience = 'consumer',
} = {}) {
  if (!isLegalSourceEnabled()) return [];

  const qt = tokens(query);
  if (qt.length === 0) return [];

  let rows;
  try {
    rows = await db.legalClause.findMany({
      where: {
        locale,
        document: {
          isActive: true,
          OR: [{ audience }, { audience: 'all' }],
        },
      },
      take: 400,
    });
  } catch (err) {
    // The legal source is an enhancement. Losing it must not take the bot down.
    console.error('[chatbot] clause retrieval failed:', err?.message || err);
    return [];
  }

  const blocked = blockedClauses(registry);

  return rows
    .map((c) => ({
      clauseNo: c.clauseNo,
      partLabel: c.partLabel,
      heading: c.heading,
      // Long clauses are truncated so a single one cannot fill the whole
      // reference block and crowd out everything else.
      text: c.text.length > 1200 ? `${c.text.slice(0, 1200)}…` : c.text,
      blocked: blocked.has(c.clauseNo),
      score: scoreClause(c, qt),
      source: 'terms',
    }))
    .filter((c) => c.score > 0 && !c.blocked)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Rebuild a document's clauses. Called on publish.
 *
 * Replace-then-insert in one transaction: a partial rebuild would leave a
 * document citable at clause numbers that no longer exist.
 */
export async function rebuildClauses(db, document) {
  const chunks = [
    ...chunkDocument(document.contentMd, { locale: 'en' }),
    ...chunkDocument(document.contentMdMy || '', { locale: 'ms' }),
  ];

  await db.$transaction([
    db.legalClause.deleteMany({ where: { documentId: document.id } }),
    db.legalClause.createMany({
      data: chunks.map((c) => ({ ...c, documentId: document.id })),
      skipDuplicates: true,
    }),
  ]);

  return chunks.length;
}

// ─── Citation validation ─────────────────────────────────────────────────────

const CITATION_RE = /clause\s+(\d{1,2}\.\d{1,2})/gi;

/**
 * Check every clause number an answer cites against the clauses that were
 * actually retrieved.
 *
 * A model that invents "clause 12.7" when nothing of the sort was in its
 * reference material has produced a citation that looks authoritative and is
 * fabricated — which is worse than an uncited answer, because the customer can
 * neither verify nor doubt it. An answer failing this check is replaced by the
 * retrieved clause text verbatim.
 *
 * @param {string} text
 * @param {Array<{clauseNo}>} available
 * @returns {{ ok: boolean, cited: string[], invalid: string[] }}
 */
export function validateCitations(text, available = []) {
  const known = new Set(available.map((c) => c.clauseNo));
  const cited = [...new Set([...String(text || '').matchAll(CITATION_RE)].map((m) => m[1]))];
  const invalid = cited.filter((c) => !known.has(c));
  return { ok: invalid.length === 0, cited, invalid };
}

/** Render a citation footer for an answer grounded in clauses. */
export function citationFooter(clauses, locale = 'en') {
  if (!clauses?.length) return '';
  const list = clauses.map((c) => c.clauseNo).join(', ');
  return locale === 'ms'
    ? `— Terma & Syarat, klausa ${list}`
    : `— Terms & Conditions, clause ${list}`;
}
