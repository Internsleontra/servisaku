// ─────────────────────────────────────────────────────────────────────────────
// Decision-tree runner.
//
// WHY A TREE AND NOT THE MODEL: "never hallucinate services" and "let the model
// diagnose a fault" are in tension. The split that resolves it —
//
//   the model does LANGUAGE   understand the utterance in either language,
//                             map it to a branch, phrase the next question
//   the tree does JUDGEMENT   which question comes next, and what is recommended
//                             at the end
//
// A leaf names a catalog slug, never free text, so the recommendation is
// resolved against a live catalog row by the caller. The model cannot invent a
// service because it never names one.
//
// Pure — no DB, no clock, no model — so every path to every leaf is unit
// testable without any of them.
// ─────────────────────────────────────────────────────────────────────────────
import { t } from '../locale.js';

/** Past this many questions a human is faster than a questionnaire. */
export const MAX_DEPTH = 4;

/** Every node accepts this, so "I don't know" advances rather than blocking. */
export const UNKNOWN = 'unknown';

/**
 * Begin a tree.
 *
 * @param {object} tree
 * @returns {{ treeId, node, answers, step }} the state to persist
 */
export function enter(tree) {
  if (!tree?.root || !tree.nodes?.[tree.root]) {
    throw new Error(`Tree ${tree?.id || '(unnamed)'} has no usable root`);
  }
  return { treeId: tree.id, node: tree.root, answers: {}, step: 1 };
}

/**
 * Advance one edge.
 *
 * Returns either the next question or a terminal result. Never throws on an
 * unrecognised answer — an answer the tree does not know is treated as
 * `unknown`, because a customer who phrases something unexpectedly should be
 * carried forward, not dead-ended.
 *
 * @param {object} tree
 * @param {object} state    from enter() or a previous advance()
 * @param {string} answer   branch key chosen by the model or a quick reply
 * @returns {{ done: boolean, state?, node?, leaf?, reason? }}
 */
export function advance(tree, state, answer) {
  const node = tree.nodes?.[state.node];
  if (!node) return { done: true, leaf: null, reason: 'broken_state' };

  const key = String(answer ?? '').trim().toLowerCase();
  const edge = node.answers?.[key] ?? node.answers?.[UNKNOWN];

  // No edge and no unknown fallback: the node is a dead end. Bail to a human
  // rather than looping the same question at the customer.
  if (!edge) return { done: true, leaf: null, reason: 'no_branch' };

  const answers = { ...state.answers, [state.node]: key };

  if (edge.leaf) {
    return { done: true, leaf: tree.leaves?.[edge.leaf] ?? null, leafId: edge.leaf, answers };
  }

  const nextId = edge.next;
  const next = tree.nodes?.[nextId];
  if (!next) return { done: true, leaf: null, reason: 'broken_edge', answers };

  const step = state.step + 1;
  // Depth ceiling is a product decision, not a safety one: four questions is
  // already a lot to ask someone who just wants their aircon fixed.
  if (step > MAX_DEPTH) return { done: true, leaf: null, reason: 'max_depth', answers };

  return { done: false, state: { treeId: tree.id, node: nextId, answers, step }, node: next };
}

/**
 * The question to show for a node, plus its quick replies.
 *
 * @param {object} node
 * @param {string} locale
 * @param {object} tree     for total-step display
 * @param {object} state
 */
export function present(node, locale, tree, state) {
  return {
    question: t(node.ask, locale),
    quickReplies: Object.entries(node.answers || {})
      // `unknown` is a routing fallback, not something to offer as a button
      // unless the tree gives it a label of its own.
      .filter(([key, edge]) => key !== UNKNOWN || edge.label)
      .map(([key, edge]) => ({ value: key, label: t(edge.label, locale) || titleCase(key) })),
    progress: { step: state.step, of: estimateDepth(tree) },
  };
}

const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Longest path from the root, capped at MAX_DEPTH. Used only for the "step 2 of
 * 4" display — a diagnostic sequence with no visible end feels like an
 * interrogation.
 */
export function estimateDepth(tree, nodeId = tree.root, seen = new Set()) {
  if (!nodeId || seen.has(nodeId)) return 0;
  const node = tree.nodes?.[nodeId];
  if (!node) return 0;

  const next = new Set(seen).add(nodeId);
  let deepest = 0;
  for (const edge of Object.values(node.answers || {})) {
    if (edge.leaf) { deepest = Math.max(deepest, 0); continue; }
    deepest = Math.max(deepest, estimateDepth(tree, edge.next, next));
  }
  return Math.min(deepest + 1, MAX_DEPTH);
}

/**
 * Validate a tree's shape. Run over every tree in the test suite so a typo in a
 * branch target fails CI rather than dead-ending a customer in production.
 *
 * @returns {string[]} problems; empty means valid
 */
export function validateTree(tree) {
  const problems = [];
  const nodeIds = Object.keys(tree.nodes || {});
  const leafIds = new Set(Object.keys(tree.leaves || {}));

  if (!tree.id) problems.push('missing id');
  if (!tree.root) problems.push('missing root');
  else if (!tree.nodes?.[tree.root]) problems.push(`root "${tree.root}" is not a node`);

  for (const [id, node] of Object.entries(tree.nodes || {})) {
    if (!node.ask) problems.push(`node "${id}" has no question`);
    const edges = Object.entries(node.answers || {});
    if (edges.length === 0) problems.push(`node "${id}" has no answers`);

    for (const [key, edge] of edges) {
      if (edge.leaf && edge.next) problems.push(`node "${id}" answer "${key}" sets both leaf and next`);
      if (!edge.leaf && !edge.next) problems.push(`node "${id}" answer "${key}" goes nowhere`);
      if (edge.leaf && !leafIds.has(edge.leaf)) problems.push(`node "${id}" answer "${key}" targets unknown leaf "${edge.leaf}"`);
      if (edge.next && !tree.nodes[edge.next]) problems.push(`node "${id}" answer "${key}" targets unknown node "${edge.next}"`);
    }
  }

  // Unreachable nodes are usually a rename that missed an edge — silent in
  // production, obvious here.
  const reachable = new Set();
  const walk = (id) => {
    if (!id || reachable.has(id) || !tree.nodes?.[id]) return;
    reachable.add(id);
    for (const edge of Object.values(tree.nodes[id].answers || {})) if (edge.next) walk(edge.next);
  };
  walk(tree.root);
  for (const id of nodeIds) if (!reachable.has(id)) problems.push(`node "${id}" is unreachable`);

  const usedLeaves = new Set();
  for (const node of Object.values(tree.nodes || {})) {
    for (const edge of Object.values(node.answers || {})) if (edge.leaf) usedLeaves.add(edge.leaf);
  }
  for (const id of leafIds) if (!usedLeaves.has(id)) problems.push(`leaf "${id}" is never reached`);

  return problems;
}
