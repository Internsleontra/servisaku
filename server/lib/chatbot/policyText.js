// ─────────────────────────────────────────────────────────────────────────────
// Policy-aware text rendering — shared by the troubleshooting resolutions and
// the knowledge corpus.
//
// Anything the assistant says that contains a business number states it as a
// `{{policy.key}}` placeholder, never a literal. Two things follow:
//
//   1. A policy change reaches the NEXT MESSAGE with no deploy (docs/13 §J1).
//   2. The conflict rule applies to speech. A key whose value disagrees with its
//      governing T&C clause is BLOCKED; the sentence is withheld whole and the
//      caller offers a human, rather than the bot stating a figure that is under
//      dispute. That is docs/12's standing rule, enforced at the point of
//      utterance instead of by remembering to check.
//
// The blocked set is DERIVED from the conflict engine, not maintained by hand,
// so a resolved conflict unblocks its sentences automatically and a newly
// introduced one silences them immediately.
// ─────────────────────────────────────────────────────────────────────────────
import { t } from './locale.js';
import { fallbacks, getKeyDef } from '../policy/catalog.js';
import { detectConflicts, KIND } from '../policy/conflicts.js';

const PLACEHOLDER = /\{\{([a-z0-9_.]+)\}\}/gi;

/** Conflict kinds that mean "the contract and the platform disagree". */
const CLAUSE_KINDS = new Set([KIND.CLAUSE_VS_REGISTRY, KIND.CLAUSE_VS_CODE, KIND.MISSING_POLICY]);

/**
 * Policy keys the assistant must not state.
 *
 * Any clause-level disagreement blocks, at any severity: if the contract and the
 * product disagree about a number, the bot has no business quoting either one.
 *
 * Memoised per registry snapshot — this is called on every policy-bearing turn
 * and the underlying scan walks the whole catalogue.
 */
let cache = { key: null, value: null };
export function blockedPolicyKeys(registry = fallbacks()) {
  const key = JSON.stringify(registry);
  if (cache.key === key) return cache.value;
  const value = new Set(
    detectConflicts({ registry })
      .filter((c) => CLAUSE_KINDS.has(c.kind))
      .map((c) => c.policyKey),
  );
  cache = { key, value };
  return value;
}

/** Drop the memo — call after a policy change activates. */
export function clearPolicyTextCache() { cache = { key: null, value: null }; }

/** Every `{{policy.key}}` in a localised string map or a bare string. */
export function placeholdersIn(value) {
  const found = new Set();
  const texts = typeof value === 'string' ? [value] : Object.values(value || {});
  for (const text of texts) {
    for (const m of String(text).matchAll(PLACEHOLDER)) found.add(m[1]);
  }
  return [...found];
}

/**
 * Render a localised template, resolving policy placeholders.
 *
 * @param {string|object} template  bare string (English) or { en, ms }
 * @param {string} locale
 * @param {object} [opts]
 * @param {object} [opts.registry]  key → value; defaults to the catalogue fallbacks
 * @param {Set}    [opts.blocked]   precomputed blocked set, to avoid rescanning
 * @returns {{ available: true, text }} | {{ available: false, blockedKeys, reason }}
 */
export function renderPolicyText(template, locale, { registry = fallbacks(), blocked } = {}) {
  if (template == null) return { available: false, blockedKeys: [], reason: 'no_content' };

  const blockSet = blocked || blockedPolicyKeys(registry);
  const raw = t(template, locale);
  if (!raw) return { available: false, blockedKeys: [], reason: 'no_content' };

  const blockedKeys = [];
  const text = raw.replace(PLACEHOLDER, (_, key) => {
    if (blockSet.has(key)) { blockedKeys.push(key); return ''; }
    const value = Object.prototype.hasOwnProperty.call(registry, key) ? registry[key] : getKeyDef(key)?.fallback;
    if (value === null || value === undefined) { blockedKeys.push(key); return ''; }
    return formatValue(value, getKeyDef(key));
  });

  // A partial sentence with a hole in it is worse than no answer, so one
  // unavailable value withholds the whole thing.
  if (blockedKeys.length > 0) return { available: false, blockedKeys, reason: 'policy_unavailable' };

  return { available: true, text };
}

/** Format a policy value the way a person would write it. */
function formatValue(value, def) {
  if (Array.isArray(value)) return value.join(', ');
  if (def?.unit === 'myr') return `RM ${Number(value).toFixed(2)}`;
  if (def?.unit === 'rate') {
    const pct = Number(value) * 100;
    return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
  }
  if (def?.unit === 'percent') return `${value}%`;
  return String(value);
}

/**
 * Does this template mention a policy value the assistant cannot currently
 * state? Used to filter an entry out of retrieval before it is ever ranked, so
 * a blocked answer does not crowd out one the bot can actually give.
 */
export function isRenderable(template, locale, opts) {
  return renderPolicyText(template, locale, opts).available;
}
