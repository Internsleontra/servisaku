// ─────────────────────────────────────────────────────────────────────────────
// Chatbot knowledge base.
//
// Entries live in corpus/consumer.js and corpus/partner.js; this module is the
// retriever. Admin-editable HelpArticle rows are layered in as a second source,
// so authored content reaches the bot without a deploy.
//
// Every answer the bot gives must be grounded in an entry here or in a help
// article. That is what keeps it from inventing a refund policy.
//
// Supported languages are English and Bahasa Malaysia. A message in any other
// language simply scores nothing, which lands on the "I can't answer that,
// shall I get a person?" path — the right outcome for a language we do not
// support, and better than a confident answer in the wrong one.
//
// WHAT THIS RETRIEVER DOES THAT A KEYWORD MATCHER USUALLY DOES NOT: it knows an
// entry can be UNANSWERABLE. An answer whose policy value disagrees with its
// governing T&C clause is returned with `blocked: true` and no text, so the
// caller declines and offers a human rather than stating a figure that is under
// dispute (see policyText.js).
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';
import { CONSUMER_CORPUS } from './corpus/consumer.js';
import { PARTNER_CORPUS } from './corpus/partner.js';
import { renderPolicyText, blockedPolicyKeys, placeholdersIn } from './policyText.js';
import { DEFAULT_LOCALE } from './locale.js';

/** The full corpus, with `audience` stamped from the file it came from. */
export const CORPUS = [
  ...CONSUMER_CORPUS.map((e) => ({ audience: 'consumer', ...e })),
  ...PARTNER_CORPUS.map((e) => ({ audience: 'partner', ...e })),
];

export const CORPUS_BY_KEY = new Map(CORPUS.map((e) => [e.key, e]));

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'my', 'i', 'to', 'do', 'how', 'can', 'what', 'when', 'and',
  'for', 'of', 'in', 'it', 'me', 'you', 'be', 'on', 'at', 'that', 'this', 'are',
  // Malay equivalents, or a query like "bagaimana saya boleh" scores on filler.
  'saya', 'yang', 'untuk', 'dan', 'ini', 'itu', 'ada', 'dengan', 'pada', 'ke',
]);

/**
 * Tokenise for keyword scoring.
 *
 * English and Malay are both space-separated Latin script, so a single path
 * serves both. `\p{M}` is kept in the split class so a combining mark — an
 * accent in a borrowed word, or a name — does not split a token in half.
 */
export function tokenize(s) {
  const text = String(s || '').toLowerCase();
  const tokens = [];

  for (const chunk of text.split(/[^\p{L}\p{N}\p{M}]+/u)) {
    if (!chunk) continue;
    if (chunk.length > 1 && !STOPWORDS.has(chunk)) tokens.push(chunk);
  }
  return tokens;
}

/**
 * Score an entry against a query. Deliberately simple keyword overlap — with a
 * corpus this size an embedding index would be more machinery than signal, and
 * a wrong retrieval here is more damaging than a slightly worse ranking. Worth
 * revisiting past ~400 entries.
 */
function score(entry, queryTokens, locale, rawQuery = '') {
  const answerText = typeof entry.a === 'string' ? entry.a : (entry.a?.[locale] || entry.a?.[DEFAULT_LOCALE] || '');
  const haystack = new Set(tokenize([...(entry.q || []), answerText, entry.topic || ''].join(' ')));

  let hits = 0;
  for (const t of queryTokens) if (haystack.has(t)) hits += 1;

  // A phrase match in the trigger list is worth more than incidental overlap
  // with the answer body.
  //
  // Matched against the RAW query, not the token list: tokenising strips
  // stopwords, so "how can i pay" collapses to "pay" and would never match its
  // own trigger phrase. That left the entry tied with anything else mentioning
  // payment, and ties resolve by corpus order — which is to say, arbitrarily.
  const phraseBonus = (entry.q || [])
    .some((p) => String(p).length > 4 && rawQuery.includes(String(p).toLowerCase())) ? 3 : 0;

  return hits + phraseBonus;
}

/** Normalise a query for phrase comparison: lowercase, punctuation to spaces. */
const normaliseQuery = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Retrieve the most relevant entries for a query.
 *
 * @param {string} query
 * @param {object} [opts]
 * @param {string} [opts.audience] consumer | partner
 * @param {string} [opts.locale]
 * @param {number} [opts.limit]
 * @param {object} [opts.registry] policy values, for placeholder resolution
 * @returns {Promise<Array<{ key, topic, a, blocked, blockedKeys, clauses, source, score }>>}
 */
export async function retrieve(query, {
  audience = 'consumer', locale = DEFAULT_LOCALE, limit = 4, registry,
} = {}) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const raw = normaliseQuery(query);
  const blocked = blockedPolicyKeys(registry);
  const scored = [];

  for (const entry of CORPUS) {
    if (entry.audience !== audience && entry.audience !== 'all') continue;
    const s = score(entry, tokens, locale, raw);
    if (s <= 0) continue;

    const rendered = renderPolicyText(entry.a, locale, { registry, blocked });
    scored.push({
      key: entry.key,
      topic: entry.topic,
      // A blocked entry keeps its rank — it is still the right answer to the
      // question, we simply cannot give it. Dropping it would silently serve a
      // lower-ranked answer to a different question instead.
      a: rendered.available ? rendered.text : null,
      blocked: !rendered.available,
      blockedKeys: rendered.blockedKeys || [],
      clauses: entry.clauses || null,
      tree: entry.tree || null,
      source: 'corpus',
      score: s,
    });
  }

  // Published help articles are a second source, so admin-authored content
  // reaches the bot without a deploy.
  try {
    const articles = await prisma.helpArticle.findMany({
      where: { isPublished: true, OR: [{ audience }, { audience: 'all' }] },
      take: 50,
    });
    for (const a of articles) {
      const s = score({ q: [a.title], a: a.bodyMd, topic: a.slug }, tokens, locale, raw);
      if (s > 0) {
        scored.push({
          key: a.slug, topic: a.slug, a: a.bodyMd.slice(0, 1500),
          blocked: false, blockedKeys: [], clauses: null, tree: null,
          source: 'help_article', score: s,
        });
      }
    }
  } catch {
    // A help-centre outage must not take the bot down — the code corpus stands alone.
  }

  return scored.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** The FAQ list served publicly and used to seed the Help page. */
export function publicFaqs(audience = 'consumer', locale = DEFAULT_LOCALE, { registry } = {}) {
  const blocked = blockedPolicyKeys(registry);
  return CORPUS
    .filter((e) => e.audience === audience || e.audience === 'all')
    .map((e) => {
      const rendered = renderPolicyText(e.a, locale, { registry, blocked });
      return {
        key: e.key,
        topic: e.topic,
        question: (e.q || [])[0],
        answer: rendered.available ? rendered.text : null,
        clauses: e.clauses || null,
      };
    })
    // A public FAQ list has no human to fall back to, so an unanswerable entry
    // is simply omitted rather than shown as a blank.
    .filter((f) => f.answer);
}

/** Every policy key the corpus depends on — used by the coverage test. */
export function corpusPolicyKeys() {
  return [...new Set(CORPUS.flatMap((e) => placeholdersIn(e.a)))];
}
