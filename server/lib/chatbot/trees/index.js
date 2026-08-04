// ─────────────────────────────────────────────────────────────────────────────
// Tree registry.
//
// One lookup surface over the three tree families, plus the selection rule the
// orchestrator uses to decide whether a turn should enter a tree at all.
// ─────────────────────────────────────────────────────────────────────────────
import { DIAGNOSTIC_TREES } from './diagnostics.js';
import { SUPPORT_TREES } from './support.js';
import { GUIDANCE_TREES } from './guidance.js';

export * from './engine.js';
export { DIAGNOSTIC_TREES } from './diagnostics.js';
export { SUPPORT_TREES } from './support.js';
export { GUIDANCE_TREES } from './guidance.js';

export const ALL_TREES = [...DIAGNOSTIC_TREES, ...SUPPORT_TREES, ...GUIDANCE_TREES];

const BY_ID = new Map(ALL_TREES.map((t) => [t.id, t]));

/** Look up a tree by id. Returns null rather than throwing — a stale treeState
 *  referring to a tree that has since been renamed must degrade, not 500. */
export const getTree = (id) => BY_ID.get(id) || null;

/**
 * Is this tree usable by this audience?
 * `all` trees serve both; a partner must never be walked through a consumer
 * diagnostic, and vice versa.
 */
export function isForAudience(tree, role) {
  if (!tree) return false;
  return tree.audience === 'all' || tree.audience === role;
}

/**
 * Trees a corpus entry can hand off to.
 *
 * The corpus entry declares `tree: '<id>'`; this resolves and audience-checks
 * it. Retrieval decides WHAT the question is about; the tree decides how to
 * work through it.
 */
export function treeForEntry(entry, role) {
  if (!entry?.tree) return null;
  const tree = getTree(entry.tree);
  return isForAudience(tree, role) ? tree : null;
}

/** Every tree id, for the validation test. */
export const ALL_TREE_IDS = ALL_TREES.map((t) => t.id);
