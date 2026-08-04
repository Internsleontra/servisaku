// ─────────────────────────────────────────────────────────────────────────────
// Support mode — the troubleshooting runner.
//
// Turns the 22 support trees into a conversation. Three jobs:
//
//   1. SELECT   which tree a problem statement belongs to
//   2. INTERPRET a free-text answer as a branch, deterministically where possible
//   3. RENDER   the resolution, resolving policy placeholders
//
// The design rule this enforces (docs/11 §E7): escalation is only reachable from
// a leaf that declares it. There is no mid-tree escape hatch, so the bot cannot
// abandon a checklist halfway through — "only escalate if it cannot be resolved"
// is structural, not a prompt instruction.
//
// RENDERING IS WHERE THE POLICY PAUSE BITES. A resolution states numbers as
// `{{policy.key}}` placeholders. If a key's value disagrees with its governing
// T&C clause, the placeholder is BLOCKED and the whole resolution becomes
// unavailable — the bot offers a human rather than stating a disputed figure.
// That is docs/12's standing rule applied to what the assistant SAYS, and it
// falls out of the design rather than needing a special case per message.
//
// Pure — no DB, no clock, no model. The runner is a function of (tree, state,
// message), which is what makes every path testable.
// ─────────────────────────────────────────────────────────────────────────────
import {
  getTree, isForAudience, enter, advance, present, UNKNOWN,
} from './trees/index.js';
import { SUPPORT_TREES } from './trees/support.js';
import { RESOLUTIONS, ACTION_LABELS } from './trees/resolutions.js';
import { t } from './locale.js';
import { renderPolicyText, blockedPolicyKeys } from './policyText.js';

export { blockedPolicyKeys } from './policyText.js';

/**
 * Phrases that route a problem statement to a tree.
 *
 * Kept here rather than on the trees themselves: matching is a language concern
 * and changes with how people actually phrase things, while a tree is a decision
 * structure that changes when the process changes. They move at different rates.
 */
export const TRIGGERS = {
  payment_failed: ['payment failed', 'payment error', 'cannot pay', "can't pay", 'card declined', 'pembayaran gagal', 'tak boleh bayar'],
  double_charge: ['charged twice', 'double charge', 'two charges', 'charged 2 times', 'dua kali caj', 'terlebih caj'],
  refund_pending: ['refund pending', 'where is my refund', 'refund not received', 'still waiting refund', 'bayaran balik belum'],
  wallet_issue: ['wallet', 'credit balance', 'balance wrong', 'credit missing', 'baki salah', 'kredit hilang'],
  coupon_invalid: ['coupon', 'promo code', 'voucher', 'code not working', 'kod tidak sah', 'kupon'],
  booking_failed: ['booking failed', 'cannot book', "can't book", 'booking error', 'tempahan gagal', 'tak boleh tempah'],
  booking_cancelled: ['booking cancelled', 'why was my booking cancelled', 'tempahan dibatalkan'],
  partner_unavailable: ['technician cancelled', 'professional cancelled', 'partner cancelled', 'no one assigned', 'juruteknik batal'],
  partner_noshow: ['nobody came', 'no one turned up', 'did not show', "didn't come", 'tidak datang', 'tak sampai'],
  wrong_booking: ['wrong service', 'wrong date', 'wrong address', 'booked the wrong', 'salah tempahan', 'salah alamat'],
  login_problem: ['cannot log in', "can't log in", 'cannot sign in', 'login problem', 'tak boleh log masuk'],
  otp_not_received: ['otp', 'verification code', 'code not received', 'no code', 'kod tidak sampai'],
  account_locked: ['account locked', 'locked out', 'account suspended', 'akaun dikunci'],
  verification_pending: ['verification pending', 'still verifying', 'verification taking', 'pengesahan tertunda'],
  no_jobs_visible: ['no jobs', 'not getting jobs', 'no offers', 'no work', 'tiada kerja', 'tak dapat job'],
  payout_delay: ['payout late', 'payout delayed', "haven't been paid", 'not been paid', 'bayaran lewat'],
  rating_dispute: ['unfair review', 'unfair rating', 'bad review', 'remove review', 'ulasan tidak adil'],
  suspension: ['suspended', 'account suspended', 'banned', 'digantung'],
  // "crash" rather than "crashes": trigger matching is substring, so the short
  // stem covers crash / crashes / crashing / crashed without listing each.
  app_crash: ['crash', 'keeps closing', 'app closing', 'aplikasi tutup'],
  white_screen: ['white screen', 'blank screen', 'blank page', 'skrin putih'],
  notifications_off: ['no notifications', 'not getting notifications', 'notification not working', 'tiada pemberitahuan'],
  gps_issue: ['gps', 'location wrong', 'wrong location', 'lokasi salah'],
};

const normalise = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Whole-word containment.
 *
 * Trigger phrases match on substring — deliberately, so the stem "crash" covers
 * crashes and crashing. ANSWER synonyms cannot: they are short tokens, and a
 * substring match means "no" fires on "noise" and sends someone down the wrong
 * branch of a checklist. Latin-script phrases therefore match on word
 * boundaries.
 */
function containsWord(text, phrase) {
  if (!phrase) return false;
  if (!/^[a-z0-9\s]+$/.test(phrase)) return text.includes(phrase);
  return new RegExp(`(^|\\s)${phrase.replace(/\s+/g, '\\s+')}(\\s|$)`).test(text);
}

/**
 * Which tree, if any, does this problem statement belong to?
 *
 * Longest matching trigger wins, so "charged twice" beats a bare "charge".
 * Returns null rather than guessing — an unmatched problem falls through to
 * ordinary retrieval, which is the better failure.
 */
export function selectTree(message, { role = 'consumer' } = {}) {
  const text = normalise(message);
  if (!text) return null;

  let best = null;
  let bestLen = 0;
  for (const [treeId, phrases] of Object.entries(TRIGGERS)) {
    const tree = getTree(treeId);
    if (!isForAudience(tree, role)) continue;
    for (const phrase of phrases) {
      const p = normalise(phrase);
      if (p.length > bestLen && text.includes(p)) {
        best = tree;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/**
 * Branch synonyms for interpreting free text.
 *
 * Deterministic-first is the point: a tapped quick reply sends the branch value
 * exactly, and most typed answers are one of a handful of words. Only genuinely
 * ambiguous text needs a model, which keeps the majority of support turns
 * model-free — cheaper, faster, and identical every time.
 */
const SYNONYMS = {
  yes: ['yes', 'yeah', 'yep', 'ya', 'ada', 'sudah', 'betul', 'correct', 'true'],
  no: ['no', 'nope', 'tidak', 'tak', 'belum', 'tiada', 'false'],
  unknown: ['not sure', 'unsure', 'dont know', "don't know", 'no idea', 'maybe', 'tidak pasti', 'entah'],
  today: ['today', 'this morning', 'just now', 'hari ini', 'tadi'],
  older: ['yesterday', 'last week', 'days ago', 'earlier', 'semalam', 'minggu lepas'],
  card: ['card', 'credit card', 'debit', 'visa', 'mastercard', 'kad'],
  fpx: ['fpx', 'online banking', 'bank transfer', 'maybank2u', 'cimb clicks'],
  ewallet: ['ewallet', 'e-wallet', 'touch n go', 'tng', 'grabpay', 'boost'],
  duitnow: ['duitnow', 'duit now', 'qr'],
  web: ['website', 'browser', 'chrome', 'safari', 'laman web'],
  app: ['app', 'phone', 'mobile', 'aplikasi'],
  precise: ['precise', 'exact', 'tepat'],
  approximate: ['approximate', 'approx', 'rough', 'anggaran'],
  same: ['same', 'same booking', 'one booking', 'sama'],
  different: ['different', 'two bookings', 'separate', 'berbeza'],
  expired: ['expired', 'expiry', 'tamat tempoh'],
  minimum: ['minimum', 'min spend', 'minimum spend', 'belanja minimum'],
  used: ['already used', 'used', 'sudah guna'],
  invalid: ['invalid', 'not valid', 'tidak sah'],
};

/**
 * Map a user's turn onto one of a node's branches.
 *
 * Order: exact branch value (a tapped quick reply) → branch-name substring →
 * synonym table → `unknown`. Never throws and never dead-ends: an answer the
 * tree does not recognise is carried forward as `unknown`, because a customer
 * who phrases something unexpectedly should not be stuck on the same question.
 */
export function interpretAnswer(node, message) {
  const text = normalise(message);
  const branches = Object.keys(node?.answers || {});
  if (branches.length === 0) return UNKNOWN;

  // A tapped quick reply arrives as the exact branch key.
  if (branches.includes(text)) return text;

  // Longest whole-word match, so "not sure" is not beaten by "no".
  let best = null;
  let bestLen = 0;
  for (const b of branches) {
    const name = normalise(b.replace(/_/g, ' '));
    if (name.length > bestLen && containsWord(text, name)) { best = b; bestLen = name.length; }
  }

  for (const b of branches) {
    for (const syn of SYNONYMS[b] || []) {
      const s = normalise(syn);
      if (s.length > bestLen && containsWord(text, s)) { best = b; bestLen = s.length; }
    }
  }

  return best || UNKNOWN;
}

// ─── Policy-aware rendering ──────────────────────────────────────────────────

/**
 * Render a resolution for a locale.
 *
 * @returns {{ available: true, text, action }} or
 *          {{ available: false, blockedKeys }} when a policy value cannot be stated
 */
export function renderResolution(resolveKey, locale, opts = {}) {
  const entry = RESOLUTIONS[resolveKey];
  if (!entry) return { available: false, blockedKeys: [], reason: 'no_content' };

  const rendered = renderPolicyText(entry.text, locale, opts);
  if (!rendered.available) return rendered;

  // The button follows the reply's language, not the account's — a Malay answer
  // with an English button is the kind of seam that makes a product feel
  // half-translated.
  const action = entry.action
    ? { route: entry.action.route, label: t(ACTION_LABELS[entry.action.route], locale) }
    : null;

  return { available: true, text: rendered.text, action };
}

// ─── The runner ──────────────────────────────────────────────────────────────

/** Locale-aware "I can't confirm that — shall I get a person?" */
const UNAVAILABLE = {
  en: "I don't have a confirmed answer on that at the moment. Would you like me to connect you to our support team?",
  ms: 'Saya tiada jawapan yang disahkan buat masa ini. Mahukah anda saya hubungkan anda kepada pasukan sokongan?',
};

/**
 * Begin a tree.
 * @returns {{ treeState, question, quickReplies, progress }}
 */
export function startTree(tree, locale) {
  const state = enter(tree);
  const shown = present(tree.nodes[state.node], locale, tree, state);
  return { treeState: state, ...shown };
}

/**
 * Advance a tree by one turn.
 *
 * @returns one of:
 *   { done: false, treeState, question, quickReplies, progress }
 *   { done: true, resolved: true, text, action }
 *   { done: true, escalate: true, category, priority }
 *   { done: true, unavailable: true, text }   ← policy value cannot be stated
 */
export function continueTree(tree, state, message, locale, opts = {}) {
  const node = tree.nodes?.[state.node];
  if (!node) {
    // A stale treeState pointing at a renamed node must not 500 a support
    // conversation — drop the tree and let ordinary retrieval take the turn.
    return { done: true, aborted: true, reason: 'broken_state' };
  }

  const branch = interpretAnswer(node, message);
  const step = advance(tree, state, branch);

  if (!step.done) {
    const shown = present(tree.nodes[step.state.node], locale, tree, step.state);
    return { done: false, treeState: step.state, ...shown };
  }

  const leaf = step.leaf;
  if (!leaf) {
    // no_branch / max_depth / broken_edge — the checklist ran out without an
    // answer, which is precisely when a human is the right next step.
    return {
      done: true, escalate: true, category: 'other', priority: 'normal', reason: step.reason,
    };
  }

  if (leaf.escalate) {
    return {
      done: true,
      escalate: true,
      category: leaf.category || 'other',
      priority: leaf.priority || 'normal',
      answers: step.answers,
    };
  }

  const rendered = renderResolution(leaf.resolve, locale, opts);
  if (!rendered.available) {
    return {
      done: true,
      unavailable: true,
      escalate: true,
      category: 'other',
      priority: 'normal',
      blockedKeys: rendered.blockedKeys,
      text: t(UNAVAILABLE, locale),
    };
  }

  return {
    done: true,
    resolved: true,
    text: rendered.text,
    action: rendered.action,
    nextTree: leaf.nextTree || null,
    answers: step.answers,
  };
}

/** Every tree id that has triggers, for the coverage test. */
export const TRIGGERED_TREES = Object.keys(TRIGGERS);

/** Support trees, exposed so callers do not import two modules. */
export { SUPPORT_TREES };
