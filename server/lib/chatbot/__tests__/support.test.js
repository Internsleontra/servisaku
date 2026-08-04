// Unit tests for support mode — tree selection, answer interpretation and
// policy-aware resolution rendering. `node --test`. Pure: no DB, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIGGERS, TRIGGERED_TREES, selectTree, interpretAnswer,
  renderResolution, blockedPolicyKeys, startTree, continueTree,
} from '../support.js';
import { SUPPORT_TREES } from '../trees/support.js';
import {
  RESOLUTIONS, ACTION_LABELS, missingResolutions, placeholdersIn,
} from '../trees/resolutions.js';
import { getTree, UNKNOWN } from '../trees/index.js';
import { LOCALES } from '../locale.js';
import { fallbacks, getKeyDef } from '../../policy/catalog.js';

// ── Content completeness ─────────────────────────────────────────────────────

test('every support-tree resolution key has authored content', () => {
  const keys = [...new Set(SUPPORT_TREES.flatMap(
    (t) => Object.values(t.leaves).map((l) => l.resolve).filter(Boolean),
  ))];
  assert.deepEqual(missingResolutions(keys), []);
});

test('every resolution is authored in both supported languages', () => {
  for (const [key, entry] of Object.entries(RESOLUTIONS)) {
    for (const locale of LOCALES) {
      assert.ok(entry.text[locale], `${key} has no ${locale} text`);
    }
  }
});

test('every tree with an entry point has triggers, and vice versa', () => {
  const treeIds = SUPPORT_TREES.map((t) => t.id);
  for (const id of TRIGGERED_TREES) {
    assert.ok(treeIds.includes(id), `trigger for unknown tree "${id}"`);
  }
  for (const id of treeIds) {
    assert.ok(TRIGGERS[id], `tree "${id}" is unreachable — no triggers`);
  }
});

test('resolutions state numbers as policy placeholders, never as literals', () => {
  // docs/13 §J1: a policy change must reach the next message with no deploy.
  for (const [key, entry] of Object.entries(RESOLUTIONS)) {
    for (const [locale, text] of Object.entries(entry.text)) {
      const withoutPlaceholders = text.replace(/\{\{[^}]+\}\}/g, '');
      // Digits that survive placeholder removal are hardcoded policy values.
      // Keyboard shortcuts (Ctrl+Shift+R) are the only legitimate exception.
      const stripped = withoutPlaceholders.replace(/Ctrl\+Shift\+R|Cmd\+Shift\+R/g, '');
      assert.ok(!/\d/.test(stripped), `${key}.${locale} hardcodes a number: "${text}"`);
    }
  }
});

test('every action route has a label in all four languages', () => {
  for (const [key, entry] of Object.entries(RESOLUTIONS)) {
    if (!entry.action) continue;
    const label = ACTION_LABELS[entry.action.route];
    assert.ok(label, `${key} references unknown action route "${entry.action.route}"`);
    for (const locale of LOCALES) assert.ok(label[locale], `${entry.action.route} has no ${locale} label`);
  }
});

test('the action button follows the reply language', () => {
  // A Malay answer with an English button is the seam that makes a product feel
  // half-translated.
  assert.equal(renderResolution('offer_alternate_method', 'ms').action.label, 'Cuba lagi');
  assert.equal(renderResolution('offer_alternate_method', 'en').action.label, 'Try again');
});

test('every placeholder names a real policy key', () => {
  for (const [key, entry] of Object.entries(RESOLUTIONS)) {
    for (const p of placeholdersIn(entry)) {
      assert.ok(getKeyDef(p), `${key} references unknown policy key "${p}"`);
    }
  }
});

// ── Tree selection ───────────────────────────────────────────────────────────

test('a problem statement selects its tree', () => {
  assert.equal(selectTree('my payment failed').id, 'payment_failed');
  assert.equal(selectTree('I was charged twice').id, 'double_charge');
  assert.equal(selectTree('the app keeps crashing').id, 'app_crash');
  assert.equal(selectTree('nobody came for my booking').id, 'partner_noshow');
});

test('the longest matching trigger wins', () => {
  // "charged twice" must beat any shorter payment-ish phrase.
  assert.equal(selectTree('hi, I think I was charged twice for this').id, 'double_charge');
});

test('triggers work in both languages', () => {
  assert.equal(selectTree('pembayaran gagal').id, 'payment_failed');
  assert.equal(selectTree('tempahan gagal').id, 'booking_failed');
});

test('audience gating keeps consumers out of partner trees', () => {
  assert.equal(selectTree('payout late', { role: 'partner' }).id, 'payout_delay');
  assert.equal(selectTree('payout late', { role: 'consumer' }), null);
});

test('an unmatched message selects nothing rather than guessing', () => {
  // Falling through to ordinary retrieval is the better failure.
  assert.equal(selectTree('what time do you open'), null);
  assert.equal(selectTree(''), null);
  assert.equal(selectTree('   '), null);
});

// ── Answer interpretation ────────────────────────────────────────────────────

const node = (answers) => ({ ask: 'q', answers });

test('a tapped quick reply matches its branch exactly', () => {
  assert.equal(interpretAnswer(node({ yes: {}, no: {} }), 'yes'), 'yes');
  assert.equal(interpretAnswer(node({ fpx: {}, card: {} }), 'fpx'), 'fpx');
});

test('free text is matched through synonyms, in both languages', () => {
  const n = node({ yes: {}, no: {}, unknown: {} });
  assert.equal(interpretAnswer(n, 'yeah it did'), 'yes');
  assert.equal(interpretAnswer(n, 'ya betul'), 'yes');
  assert.equal(interpretAnswer(n, 'tidak'), 'no');
  assert.equal(interpretAnswer(n, 'belum'), 'no');
});

test('"not sure" is not swallowed by "no"', () => {
  // Longest-match ordering: the shorter token must not win.
  assert.equal(interpretAnswer(node({ yes: {}, no: {}, unknown: {} }), "I'm not sure"), UNKNOWN);
});

test('an unrecognised answer becomes unknown rather than dead-ending', () => {
  const n = node({ yes: {}, no: {}, unknown: {} });
  assert.equal(interpretAnswer(n, 'the machine made a warbling noise'), UNKNOWN);
  assert.equal(interpretAnswer(node({}), 'anything'), UNKNOWN);
});

test('payment methods are recognised from how people actually write them', () => {
  const n = node({ fpx: {}, card: {}, ewallet: {}, duitnow: {} });
  assert.equal(interpretAnswer(n, 'I used maybank2u'), 'fpx');
  assert.equal(interpretAnswer(n, 'touch n go'), 'ewallet');
  assert.equal(interpretAnswer(n, 'paid by visa'), 'card');
});

// ── Policy-aware rendering ───────────────────────────────────────────────────

test('a resolution with no placeholders always renders', () => {
  const r = renderResolution('explain_partner_cancel', 'en');
  assert.equal(r.available, true);
  assert.match(r.text, /never charged a cancellation fee/);
});

test('placeholders resolve from the policy registry', () => {
  const r = renderResolution('explain_freeze', 'en');
  assert.equal(r.available, true);
  // partner.freeze_after_days = 7, suspend = 14 — neither is clause-governed,
  // so neither is blocked.
  assert.match(r.text, /7 days overdue/);
  assert.match(r.text, /at 14/);
  assert.ok(!r.text.includes('{{'));
});

test('a resolution is WITHHELD when a policy value disagrees with the T&C', () => {
  // explain_bank_timing quotes refund.processing_days_min/max, and those
  // disagree with clause 9.4. The bot must not state either number.
  const r = renderResolution('explain_bank_timing', 'en');
  assert.equal(r.available, false);
  assert.equal(r.reason, 'policy_unavailable');
  assert.ok(r.blockedKeys.includes('refund.processing_days_max'));
});

test('a withheld resolution never emits a partial sentence', () => {
  const r = renderResolution('explain_bank_timing', 'en');
  assert.equal(r.text, undefined);
});

test('blockedPolicyKeys is derived from the conflict engine, not a hand list', () => {
  const blocked = blockedPolicyKeys();
  assert.ok(blocked.has('refund.full_refund_hours'), 'the known C-01 key must be blocked');
  assert.ok(blocked.has('liability.cap_per_booking_myr'));
  // A key with no governing clause cannot conflict, so it is never blocked.
  assert.equal(blocked.has('partner.freeze_after_days'), false);
});

test('resolving a conflict unblocks its message automatically', () => {
  // Set the registry to the value the clause expects and the block lifts with
  // no code change — which is the point of deriving it from the engine.
  const compliant = { ...fallbacks(), 'refund.processing_days_min': 5, 'refund.processing_days_max': 7 };
  const blocked = blockedPolicyKeys(compliant);
  assert.equal(blocked.has('refund.processing_days_max'), false);
  const r = renderResolution('explain_bank_timing', 'en', { registry: compliant, blocked });
  assert.equal(r.available, true);
  assert.match(r.text, /5 to 7 working days/);
});

test('an unknown resolution key degrades rather than throwing', () => {
  const r = renderResolution('does_not_exist', 'en');
  assert.equal(r.available, false);
  assert.equal(r.reason, 'no_content');
});

test('rendering falls back to English for a locale with no translation', () => {
  const r = renderResolution('explain_partner_cancel', 'ta');
  assert.equal(r.available, true);
  assert.ok(r.text.length > 0);
});

// ── The runner ───────────────────────────────────────────────────────────────

test('startTree asks the root question with quick replies', () => {
  const tree = getTree('payment_failed');
  const s = startTree(tree, 'en');
  assert.match(s.question, /Which payment method/);
  assert.ok(s.quickReplies.some((q) => q.value === 'fpx'));
  assert.equal(s.treeState.step, 1);
  assert.ok(s.progress.of >= 2);
});

test('a full path resolves without a human', () => {
  const tree = getTree('payment_failed');
  const start = startTree(tree, 'en');
  const second = continueTree(tree, start.treeState, 'card', 'en');
  assert.equal(second.done, false);
  assert.match(second.question, /deducted/);

  const third = continueTree(tree, second.treeState, 'no', 'en');
  assert.equal(third.done, true);
  assert.equal(third.resolved, true);
  assert.equal(third.escalate, undefined);
  assert.match(third.text, /FPX fails less often/);
});

test('escalation is reachable ONLY from a leaf that declares it', () => {
  const tree = getTree('payment_failed');
  const start = startTree(tree, 'en');
  const a = continueTree(tree, start.treeState, 'fpx', 'en');
  const b = continueTree(tree, a.treeState, 'yes', 'en');   // deducted
  const c = continueTree(tree, b.treeState, 'older', 'en'); // days ago → escalate leaf
  assert.equal(c.done, true);
  assert.equal(c.escalate, true);
  assert.equal(c.category, 'payment');
  assert.equal(c.priority, 'high');
});

test('a policy-unavailable leaf escalates instead of guessing', () => {
  // refund_pending → approved → recent → explain_bank_timing, which is blocked.
  const tree = getTree('refund_pending');
  const start = startTree(tree, 'en');
  const a = continueTree(tree, start.treeState, 'approved', 'en');
  const b = continueTree(tree, a.treeState, 'recent', 'en');
  assert.equal(b.done, true);
  assert.equal(b.unavailable, true);
  assert.equal(b.escalate, true);
  assert.match(b.text, /connect you to our support team/);
});

test('a broken tree state aborts rather than throwing', () => {
  const tree = getTree('payment_failed');
  const r = continueTree(tree, { treeId: tree.id, node: 'gone', answers: {}, step: 1 }, 'yes', 'en');
  assert.equal(r.done, true);
  assert.equal(r.aborted, true);
});

test('a leaf can hand off to another tree', () => {
  // login_problem → "no code arrives" → hands to otp_not_received.
  const tree = getTree('login_problem');
  const start = startTree(tree, 'en');
  const r = continueTree(tree, start.treeState, 'no_otp', 'en');
  assert.equal(r.done, true);
  assert.equal(r.nextTree, 'otp_not_received');
});

test('most authored paths resolve rather than escalate', () => {
  // If the trees mostly escalate they are a routing form, not support.
  let resolved = 0;
  let escalated = 0;
  for (const tree of SUPPORT_TREES) {
    for (const leaf of Object.values(tree.leaves)) {
      if (leaf.escalate) escalated += 1; else resolved += 1;
    }
  }
  assert.ok(resolved > escalated * 1.5, `${resolved} resolve vs ${escalated} escalate`);
});
