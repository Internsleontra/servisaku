// Unit tests for the knowledge corpus and retriever — `node --test`.
// Retrieval touches prisma for help articles; those calls are expected to fail
// in a unit run and are swallowed by design, so the code corpus stands alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORPUS, CORPUS_BY_KEY, tokenize, retrieve, publicFaqs, corpusPolicyKeys,
} from '../knowledge.js';
import { CONSUMER_CORPUS } from '../corpus/consumer.js';
import { PARTNER_CORPUS } from '../corpus/partner.js';
import { LOCALES } from '../locale.js';
import { getKeyDef, fallbacks } from '../../policy/catalog.js';
import { blockedPolicyKeys } from '../policyText.js';

// ── Corpus integrity ─────────────────────────────────────────────────────────

test('the corpus is substantially larger than the 12 entries it replaces', () => {
  assert.ok(CORPUS.length >= 75, `only ${CORPUS.length} entries`);
  assert.ok(CONSUMER_CORPUS.length >= 45);
  assert.ok(PARTNER_CORPUS.length >= 25);
});

test('keys are unique', () => {
  const keys = CORPUS.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('every entry is authored in both supported languages', () => {
  for (const e of CORPUS) {
    for (const locale of LOCALES) {
      assert.ok(e.a?.[locale], `${e.key} has no ${locale} answer`);
    }
  }
});

test('every entry has trigger phrases and a topic', () => {
  for (const e of CORPUS) {
    assert.ok(Array.isArray(e.q) && e.q.length >= 3, `${e.key} has too few triggers`);
    assert.ok(e.topic, `${e.key} has no topic`);
    assert.ok(['consumer', 'partner', 'all'].includes(e.audience), `${e.key} audience`);
  }
});

test('NO entry hardcodes a business number — they are policy placeholders', () => {
  // The rule the whole phase exists to enforce: a policy change must reach the
  // next message with no deploy, and a disputed value must be unspeakable.
  for (const e of CORPUS) {
    for (const [locale, text] of Object.entries(e.a)) {
      const stripped = String(text)
        .replace(/\{\{[^}]+\}\}/g, '')
        .replace(/MyKad|CTOS|CIDB|SOCSO|EPF|FPX|SST|999|1999|2010|PDPA|ServisAku/g, '')
        .replace(/18|SST/g, ''); // statutory age is law, not policy
      assert.ok(!/\d/.test(stripped), `${e.key}.${locale} hardcodes a number: "${text}"`);
    }
  }
});

test('every placeholder names a real policy key', () => {
  for (const key of corpusPolicyKeys()) {
    assert.ok(getKeyDef(key), `corpus references unknown policy key "${key}"`);
  }
});

test('cited clauses look like real clause numbers', () => {
  for (const e of CORPUS) {
    for (const c of e.clauses || []) {
      assert.match(c, /^\d+(\.\d+)?$/, `${e.key} cites a malformed clause "${c}"`);
    }
  }
});

// ── Tokenisation ─────────────────────────────────────────────────────────────

test('Latin text tokenises with stopwords removed', () => {
  const t = tokenize('How do I book a service?');
  assert.ok(t.includes('book'));
  assert.ok(t.includes('service'));
  assert.ok(!t.includes('the'));
  assert.ok(!t.includes('how'));
});

test('a stopword-heavy question still matches its own trigger phrase', () => {
  // "how can i pay" tokenises to just ["pay"], so the phrase bonus has to be
  // measured against the raw query or the entry ties with anything that happens
  // to mention payment.
  const t = tokenize('how can i pay');
  assert.deepEqual(t, ['pay']);
});

test('Malay filler words do not score', () => {
  const t = tokenize('bagaimana saya boleh tempah');
  assert.ok(t.includes('tempah'));
  assert.ok(!t.includes('saya'));
});

// ── Retrieval ────────────────────────────────────────────────────────────────

test('an English question retrieves the right entry', async () => {
  const r = await retrieve('how do I book a service', { audience: 'consumer' });
  assert.equal(r[0].key, 'booking_how_to');
  assert.ok(r[0].a.length > 0);
});

test('the same question in either language retrieves the same entry', async () => {
  const r = await retrieve('bagaimana tempah', { audience: 'consumer', locale: 'ms' });
  assert.equal(r[0]?.key, 'booking_how_to');
});

test('a question in an unsupported language retrieves nothing', async () => {
  assert.deepEqual(await retrieve('如何预订', { audience: 'consumer' }), []);
});

test('the answer comes back in the requested language', async () => {
  const ms = await retrieve('cara bayar', { audience: 'consumer', locale: 'ms' });
  assert.match(ms[0].a, /kredit|bayar|dompet/i);
  const en = await retrieve('how can i pay', { audience: 'consumer', locale: 'en' });
  assert.match(en[0].a, /online banking|cards|credit/i);
});

test('audience gating keeps a consumer out of partner content', async () => {
  const r = await retrieve('commission', { audience: 'consumer' });
  assert.ok(r.every((e) => !e.key.startsWith('partner_')));
  const p = await retrieve('commission', { audience: 'partner' });
  assert.ok(p.some((e) => e.key === 'partner_commission'));
});

test('placeholders are resolved in the returned answer', async () => {
  const r = await retrieve('when do I get paid', { audience: 'partner' });
  const entry = r.find((e) => e.key === 'partner_payouts');
  assert.ok(entry);
  assert.ok(!entry.a.includes('{{'), 'placeholder was not resolved');
  assert.match(entry.a, /weekly/);
});

test('an entry whose policy value is disputed comes back BLOCKED, not wrong', async () => {
  // refund_policy quotes cancellation.free_window_hours, which disagrees with
  // clause 8.1. The bot must not state either number.
  const r = await retrieve('what is your refund policy', { audience: 'consumer' });
  const entry = r.find((e) => e.key === 'refund_policy');
  assert.ok(entry, 'refund_policy should still rank');
  assert.equal(entry.blocked, true);
  assert.equal(entry.a, null);
  assert.ok(entry.blockedKeys.includes('cancellation.free_window_hours'));
});

test('a blocked entry keeps its rank rather than being dropped', async () => {
  // Dropping it would silently serve a lower-ranked answer to a question the
  // customer did not ask.
  const r = await retrieve('refund policy cancellation', { audience: 'consumer' });
  assert.equal(r[0].key, 'refund_policy');
  assert.equal(r[0].blocked, true);
});

test('resolving the conflict unblocks the entry with no code change', async () => {
  const compliant = {
    ...fallbacks(),
    'cancellation.free_window_hours': 4,
    'cancellation.fee_min_myr': 15,
    'cancellation.fee_max_myr': 30,
  };
  const r = await retrieve('what is your refund policy', { audience: 'consumer', registry: compliant });
  const entry = r.find((e) => e.key === 'refund_policy');
  assert.equal(entry.blocked, false);
  assert.match(entry.a, /4 hours/);
  assert.match(entry.a, /RM 15\.00/);
});

test('an unanswerable query returns nothing rather than a bad match', async () => {
  assert.deepEqual(await retrieve('', { audience: 'consumer' }), []);
  assert.deepEqual(await retrieve('   ', { audience: 'consumer' }), []);
});

test('retrieval is capped', async () => {
  const r = await retrieve('booking payment refund service', { audience: 'consumer', limit: 3 });
  assert.ok(r.length <= 3);
});

// ── Public FAQ list ──────────────────────────────────────────────────────────

test('publicFaqs omits entries it cannot answer', () => {
  // A public list has no human to fall back to, so a blank is worse than an
  // absence.
  const faqs = publicFaqs('consumer', 'en');
  assert.ok(faqs.length > 20);
  assert.ok(faqs.every((f) => f.answer && !f.answer.includes('{{')));
  assert.ok(!faqs.some((f) => f.key === 'refund_policy'), 'a blocked entry must not be listed');
});

test('publicFaqs is localised and keeps its shape', () => {
  const [first] = publicFaqs('consumer', 'ms');
  assert.deepEqual(Object.keys(first).sort(), ['answer', 'clauses', 'key', 'question', 'topic']);
  assert.ok(publicFaqs('partner', 'zh').length > 10);
});

// ── Coverage ─────────────────────────────────────────────────────────────────

test('the corpus covers every FAQ area the brief names', () => {
  const topics = new Set(CORPUS.map((e) => e.topic));
  for (const area of ['booking', 'payment', 'pricing', 'refund', 'quality', 'damage',
    'trust', 'account', 'legal', 'earnings', 'commission', 'jobs', 'verification',
    'ratings', 'standing']) {
    assert.ok(topics.has(area), `no corpus entry covers "${area}"`);
  }
});

test('the entries the original 12-entry corpus covered all still exist', () => {
  // A regression guard: this replaced a working corpus, and losing an answer
  // people already rely on is the way that goes wrong quietly.
  for (const key of ['booking_how_to', 'payment_methods', 'refund_policy', 'refund_timing',
    'payment_sst', 'damage_claim', 'trust_verification', 'booking_reschedule',
    'partner_payouts', 'partner_commission', 'partner_frozen', 'partner_bank']) {
    assert.ok(CORPUS_BY_KEY.has(key), `lost entry "${key}"`);
  }
});

test('blocked keys are derived, not hand-listed', () => {
  const blocked = blockedPolicyKeys();
  assert.ok(blocked.size > 0);
  assert.ok(blocked.has('cancellation.free_window_hours'));
});
