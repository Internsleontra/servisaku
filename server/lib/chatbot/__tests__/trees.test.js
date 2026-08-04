// Unit tests for the decision-tree engine and every authored tree.
// `node --test`. Pure — no DB, no model, no clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enter, advance, present, validateTree, estimateDepth, MAX_DEPTH, UNKNOWN,
  ALL_TREES, getTree, isForAudience, treeForEntry,
  DIAGNOSTIC_TREES, SUPPORT_TREES, GUIDANCE_TREES,
} from '../trees/index.js';

// ── The authored trees ───────────────────────────────────────────────────────

test('every authored tree is structurally valid', () => {
  for (const tree of ALL_TREES) {
    const problems = validateTree(tree);
    assert.deepEqual(problems, [], `${tree.id}: ${problems.join('; ')}`);
  }
});

test('tree ids are unique', () => {
  const ids = ALL_TREES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the expected tree families are present', () => {
  assert.equal(DIAGNOSTIC_TREES.length, 14);
  assert.equal(SUPPORT_TREES.length, 22);
  assert.equal(GUIDANCE_TREES.length, 5);
});

test('no tree can ask more than MAX_DEPTH questions', () => {
  for (const tree of ALL_TREES) {
    assert.ok(estimateDepth(tree) <= MAX_DEPTH, `${tree.id} is too deep`);
  }
});

test('every node accepts an unknown answer without dead-ending', () => {
  // A customer who does not know must be carried forward, never blocked.
  for (const tree of ALL_TREES) {
    for (const [id, node] of Object.entries(tree.nodes)) {
      const r = advance(tree, { treeId: tree.id, node: id, answers: {}, step: 1 }, UNKNOWN);
      assert.notEqual(r.reason, 'no_branch', `${tree.id}.${id} dead-ends on unknown`);
    }
  }
});

test('an unrecognised answer is treated as unknown, not an error', () => {
  const tree = getTree('ac_not_cooling');
  const r = advance(tree, enter(tree), 'the fan makes a weird warbling noise sometimes');
  assert.notEqual(r.reason, 'no_branch');
});

test('every diagnostic leaf names a slug or explicitly names none', () => {
  for (const tree of DIAGNOSTIC_TREES) {
    for (const [id, leaf] of Object.entries(tree.leaves)) {
      assert.ok('serviceSlug' in leaf, `${tree.id}.${id} has no serviceSlug key`);
      // null is legitimate — "this is not a service we sell" is a valid outcome
      // (condensation is normal; a structural crack needs an engineer).
      if (leaf.serviceSlug !== null) {
        assert.match(leaf.serviceSlug, /^[a-z0-9-]+$/, `${tree.id}.${id} slug is not a slug`);
      }
      assert.ok(['high', 'medium', 'low'].includes(leaf.confidence), `${tree.id}.${id} confidence`);
    }
  }
});

test('a support leaf either resolves or escalates, never neither', () => {
  for (const tree of SUPPORT_TREES) {
    for (const [id, leaf] of Object.entries(tree.leaves)) {
      const ok = Boolean(leaf.resolve) || leaf.escalate === true;
      assert.ok(ok, `${tree.id}.${id} neither resolves nor escalates`);
      // An escalating leaf must route the ticket somewhere.
      if (leaf.escalate) {
        assert.ok(leaf.category, `${tree.id}.${id} escalates with no category`);
        assert.ok(['low', 'normal', 'high', 'urgent'].includes(leaf.priority), `${tree.id}.${id} priority`);
      }
    }
  }
});

test('escalation is only reachable from a leaf', () => {
  // This is what makes "only escalate if it cannot be resolved" structural:
  // there is no mid-tree escape hatch, so a checklist cannot be abandoned
  // halfway through.
  for (const tree of SUPPORT_TREES) {
    for (const node of Object.values(tree.nodes)) {
      for (const edge of Object.values(node.answers)) {
        assert.equal(edge.escalate, undefined, `${tree.id} escalates from an edge`);
      }
    }
  }
});

test('most support trees resolve without a human', () => {
  // If most branches escalate, the tree is a routing form rather than support.
  const leaves = SUPPORT_TREES.flatMap((t) => Object.values(t.leaves));
  const resolved = leaves.filter((l) => !l.escalate).length;
  assert.ok(resolved / leaves.length > 0.6, `only ${resolved}/${leaves.length} leaves resolve`);
});

test('every guidance leaf carries a checklist ending in an evidence step', () => {
  for (const tree of GUIDANCE_TREES) {
    for (const [id, leaf] of Object.entries(tree.leaves)) {
      assert.ok(Array.isArray(leaf.checklist) && leaf.checklist.length >= 3, `${tree.id}.${id}`);
    }
    const finish = tree.leaves.finish.checklist.join(' ').toLowerCase();
    assert.match(finish, /photo/, `${tree.id} finishing checklist has no evidence step`);
  }
});

// ── The engine ───────────────────────────────────────────────────────────────

test('enter() starts at the root at step 1', () => {
  const tree = getTree('ac_not_cooling');
  const state = enter(tree);
  assert.equal(state.treeId, 'ac_not_cooling');
  assert.equal(state.node, tree.root);
  assert.equal(state.step, 1);
  assert.deepEqual(state.answers, {});
});

test('enter() throws on a tree with no usable root', () => {
  assert.throws(() => enter({ id: 'broken', root: 'nope', nodes: {} }), /no usable root/);
});

test('a full path reaches the expected leaf', () => {
  // "No noise, but water dripping" is the worked example in the spec (§E3).
  const tree = getTree('ac_not_cooling');
  const first = advance(tree, enter(tree), 'no');
  assert.equal(first.done, false);
  assert.equal(first.state.node, 'water');
  assert.equal(first.state.step, 2);

  const second = advance(tree, first.state, 'yes');
  assert.equal(second.done, true);
  assert.equal(second.leafId, 'ac_drainage');
  assert.equal(second.leaf.serviceSlug, 'aircon-servicing');
  assert.equal(second.leaf.note, 'blocked_drain');
});

test('answers accumulate across the walk', () => {
  const tree = getTree('ac_not_cooling');
  const a = advance(tree, enter(tree), 'no');   // noise=no  → water
  const b = advance(tree, a.state, 'no');       // water=no  → fan
  const c = advance(tree, b.state, 'yes');      // fan=yes   → onset (still walking)
  assert.equal(c.done, false);
  assert.deepEqual(c.state.answers, { noise: 'no', water: 'no', fan: 'yes' });

  // On a terminal step the accumulated answers come back on the result itself,
  // since there is no next state to carry them.
  const d = advance(tree, c.state, 'sudden');
  assert.equal(d.done, true);
  assert.deepEqual(d.answers, { noise: 'no', water: 'no', fan: 'yes', onset: 'sudden' });
});

test('a one-question tree terminates immediately', () => {
  const tree = getTree('grooming_scope');
  const r = advance(tree, enter(tree), 'massage');
  assert.equal(r.done, true);
  assert.equal(r.leaf.serviceSlug, 'massage');
});

test('every leaf in every tree is reachable by some sequence of answers', () => {
  for (const tree of ALL_TREES) {
    const reached = new Set();
    const walk = (state, depth) => {
      if (depth > MAX_DEPTH + 1) return;
      const node = tree.nodes[state.node];
      for (const key of Object.keys(node.answers)) {
        const r = advance(tree, state, key);
        if (r.done) { if (r.leafId) reached.add(r.leafId); continue; }
        walk(r.state, depth + 1);
      }
    };
    walk(enter(tree), 1);
    for (const id of Object.keys(tree.leaves)) {
      assert.ok(reached.has(id), `${tree.id}: leaf "${id}" is unreachable`);
    }
  }
});

test('a broken state degrades rather than throwing', () => {
  // A stale treeState pointing at a node that has since been renamed must not
  // 500 a support conversation.
  const tree = getTree('ac_not_cooling');
  const r = advance(tree, { treeId: tree.id, node: 'gone', answers: {}, step: 1 }, 'yes');
  assert.equal(r.done, true);
  assert.equal(r.reason, 'broken_state');
  assert.equal(r.leaf, null);
});

test('the depth ceiling stops the walk rather than looping', () => {
  const deep = {
    id: 'deep', root: 'n1',
    nodes: {
      n1: { ask: 'a', answers: { go: { next: 'n2' } } },
      n2: { ask: 'b', answers: { go: { next: 'n3' } } },
      n3: { ask: 'c', answers: { go: { next: 'n4' } } },
      n4: { ask: 'd', answers: { go: { next: 'n5' } } },
      n5: { ask: 'e', answers: { go: { leaf: 'end' } } },
    },
    leaves: { end: {} },
  };
  let state = enter(deep);
  let last;
  for (let i = 0; i < 6; i += 1) {
    last = advance(deep, state, 'go');
    if (last.done) break;
    state = last.state;
  }
  assert.equal(last.done, true);
  assert.equal(last.reason, 'max_depth');
});

test('present() localises the question and its quick replies', () => {
  const tree = getTree('ac_not_cooling');
  const state = enter(tree);
  const shown = present(tree.nodes[state.node], 'ms', tree, state);
  assert.match(shown.question, /bunyi/i);
  const labels = shown.quickReplies.map((q) => q.label);
  assert.ok(labels.includes('Ya'));
  assert.ok(labels.includes('Tidak'));
  assert.equal(shown.progress.step, 1);
  assert.ok(shown.progress.of >= 1);
});

test('present() falls back to English for a locale with no translation', () => {
  const tree = { id: 'x', root: 'a', nodes: { a: { ask: { en: 'Only English' }, answers: { yes: { leaf: 'l' } } } }, leaves: { l: {} } };
  assert.equal(present(tree.nodes.a, 'ta', tree, enter(tree)).question, 'Only English');
});

test('present() hides the unknown fallback unless it is given a label', () => {
  const tree = getTree('ac_not_cooling');
  const state = enter(tree);
  const shown = present(tree.nodes.noise, 'en', tree, state);
  // ac_not_cooling labels its unknown branch "Not sure", so it IS offered.
  assert.ok(shown.quickReplies.some((q) => q.value === UNKNOWN));

  const bare = { id: 'y', root: 'a', nodes: { a: { ask: 'q', answers: { yes: { leaf: 'l' }, unknown: { leaf: 'l' } } } }, leaves: { l: {} } };
  const shownBare = present(bare.nodes.a, 'en', bare, enter(bare));
  assert.equal(shownBare.quickReplies.some((q) => q.value === UNKNOWN), false);
});

// ── Registry ─────────────────────────────────────────────────────────────────

test('getTree returns null for an unknown id rather than throwing', () => {
  assert.equal(getTree('does_not_exist'), null);
});

test('audience gating keeps partners out of consumer trees', () => {
  assert.equal(isForAudience(getTree('ac_not_cooling'), 'partner'), false);
  assert.equal(isForAudience(getTree('ac_not_cooling'), 'consumer'), true);
  assert.equal(isForAudience(getTree('guide_aircon'), 'consumer'), false);
  assert.equal(isForAudience(getTree('guide_aircon'), 'partner'), true);
  // `all` trees serve both.
  assert.equal(isForAudience(getTree('payment_failed'), 'consumer'), true);
  assert.equal(isForAudience(getTree('payment_failed'), 'partner'), true);
});

test('treeForEntry resolves and audience-checks a corpus handoff', () => {
  assert.equal(treeForEntry({ tree: 'ac_not_cooling' }, 'consumer').id, 'ac_not_cooling');
  assert.equal(treeForEntry({ tree: 'ac_not_cooling' }, 'partner'), null);
  assert.equal(treeForEntry({ tree: 'nope' }, 'consumer'), null);
  assert.equal(treeForEntry({}, 'consumer'), null);
});

test('validateTree catches the mistakes that would dead-end a customer', () => {
  assert.ok(validateTree({ id: 'a', root: 'x', nodes: {}, leaves: {} }).some((p) => /root/.test(p)));
  assert.ok(validateTree({
    id: 'b', root: 'a',
    nodes: { a: { ask: 'q', answers: { yes: { next: 'ghost' } } } },
    leaves: {},
  }).some((p) => /unknown node/.test(p)));
  assert.ok(validateTree({
    id: 'c', root: 'a',
    nodes: { a: { ask: 'q', answers: { yes: { leaf: 'ghost' } } } },
    leaves: {},
  }).some((p) => /unknown leaf/.test(p)));
  assert.ok(validateTree({
    id: 'd', root: 'a',
    nodes: { a: { ask: 'q', answers: { yes: { leaf: 'l' } } }, orphan: { ask: 'q', answers: { yes: { leaf: 'l' } } } },
    leaves: { l: {} },
  }).some((p) => /unreachable/.test(p)));
});
