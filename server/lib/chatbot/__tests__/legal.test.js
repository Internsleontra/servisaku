// Unit tests for the T&C knowledge source — `node --test`.
// The chunker and the citation validator are pure; retrieval runs against a fake
// prisma client. The env flag is set and restored per test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkDocument, policyKeysForClause, blockedClauses, isClauseCitable,
  scoreClause, retrieveClauses, validateCitations, citationFooter,
  isLegalSourceEnabled,
} from '../legal.js';
import { fallbacks } from '../../policy/catalog.js';

const FLAG = 'CHATBOT_LEGAL_SOURCE_ENABLED';
const withSource = async (fn) => {
  const before = process.env[FLAG];
  process.env[FLAG] = 'true';
  try { return await fn(); } finally {
    if (before === undefined) delete process.env[FLAG]; else process.env[FLAG] = before;
  }
};

// A fragment in the shape the real document extracts to — note the missing
// space after the clause number, which is what DOCX and PDF extraction produce.
const DOC = `PART B
BOOKINGS, PAYMENTS AND MONEY

8Cancellation Policy

8.1Free cancellation window. A Customer may cancel a confirmed Booking free of
charge at any time more than four (4) hours before the scheduled start time.

8.2Late cancellation by the Customer. Cancellation within four (4) hours of the
scheduled start time attracts a Cancellation Fee.

9Refund Policy

9.1 When a refund is due. A Customer is entitled to a refund where the Booking
is cancelled within the free-cancellation window.
`;

// ── Gating ───────────────────────────────────────────────────────────────────

test('the legal source is OFF unless explicitly enabled', () => {
  // docs/12: quoting a clause the platform does not honour puts the discrepancy
  // in writing, with a clause reference attached.
  const before = process.env[FLAG];
  delete process.env[FLAG];
  assert.equal(isLegalSourceEnabled(), false);
  process.env[FLAG] = 'false';
  assert.equal(isLegalSourceEnabled(), false);
  process.env[FLAG] = '1';
  assert.equal(isLegalSourceEnabled(), false, 'only the exact string "true" enables it');
  if (before === undefined) delete process.env[FLAG]; else process.env[FLAG] = before;
});

test('no clause is citable while the source is disabled', () => {
  assert.equal(isClauseCitable('7.13'), false);
  assert.equal(isClauseCitable('8.1'), false);
});

test('retrieval returns nothing while disabled, so callers need no special case', async () => {
  const db = { legalClause: { findMany: async () => { throw new Error('should not be called'); } } };
  assert.deepEqual(await retrieveClauses(db, 'cancellation refund'), []);
});

// ── Per-clause blocking ──────────────────────────────────────────────────────

test('a clause whose governing value disagrees with it is blocked', async () => {
  await withSource(() => {
    const blocked = blockedClauses();
    // 8.1 governs cancellation.free_window_hours and refund.full_refund_hours,
    // both of which are in conflict (docs/12 C-01).
    assert.ok(blocked.has('8.1'));
    assert.equal(isClauseCitable('8.1'), false, 'a disputed clause stays unquotable even when enabled');
  });
});

test('a clause is citable only when EVERY value it governs agrees with it', async () => {
  await withSource(() => {
    // Clause 7.6 governs six keys. The default commission rate already matches,
    // but the 14-day notice period and the acceptance snapshot are unimplemented
    // — so the clause stays blocked until all six line up. Partial compliance is
    // not compliance: quoting 7.6 would assert the notice rule as well.
    const partial = { ...fallbacks(), 'commission.rate.default': 0.20 };
    assert.equal(blockedClauses(partial).has('7.6'), true);

    const compliant = {
      ...partial,
      'commission.change_notice_days': 14,
      'commission.snapshot_at_acceptance': true,
    };
    const blocked = blockedClauses(compliant);
    assert.equal(blocked.has('7.6'), false);
    assert.equal(isClauseCitable('7.6', { blocked }), true);
  });
});

test('the blocked set is derived from the catalogue, not hand-listed', () => {
  assert.deepEqual(policyKeysForClause('7.6').sort(), [
    'commission.change_notice_days', 'commission.rate.default', 'commission.rate.elite',
    'commission.rate.new_partner', 'commission.rate.premium', 'commission.snapshot_at_acceptance',
  ]);
  assert.deepEqual(policyKeysForClause('99.9'), []);
});

test('resolving a conflict unblocks its clause with no code change', async () => {
  await withSource(() => {
    assert.ok(blockedClauses().has('8.1'));
    const compliant = {
      ...fallbacks(),
      'cancellation.free_window_hours': 4,
      'refund.full_refund_hours': 4,
      'refund.mid_tier_percent': 100,
      'refund.partner_accepted_percent': 100,
    };
    assert.equal(blockedClauses(compliant).has('8.1'), false);
  });
});

// ── Chunking ─────────────────────────────────────────────────────────────────

test('a document chunks into whole, citable clauses', () => {
  const chunks = chunkDocument(DOC);
  assert.deepEqual(chunks.map((c) => c.clauseNo), ['8.1', '8.2', '9.1']);
  assert.ok(chunks[0].text.startsWith('Free cancellation window.'));
  // A clause wrapped across source lines is kept whole — a citation has to point
  // at the entire clause, not the first line of it.
  assert.match(chunks[0].text, /free of\ncharge at any time more than four/);
  // The next section's heading must not bleed into the previous clause's body.
  assert.ok(!chunks[0].text.includes('Refund Policy'));
});

test('section headings and part labels are carried as context, not emitted as clauses', () => {
  const chunks = chunkDocument(DOC);
  // Nobody cites "clause 8" when they mean 8.1.
  assert.ok(!chunks.some((c) => c.clauseNo === '8'));
  assert.equal(chunks[0].partLabel, 'PART B');
  assert.equal(chunks[0].heading, 'Cancellation Policy');
  assert.equal(chunks[2].heading, 'Refund Policy');
});

test('a missing space after the clause number is handled', () => {
  // "8.1Free cancellation" is what DOCX and PDF extraction actually produce.
  const [first] = chunkDocument('8.1No space here at all.');
  assert.equal(first.clauseNo, '8.1');
  assert.equal(first.text, 'No space here at all.');
});

test('clauses are ordinally numbered in document order', () => {
  const chunks = chunkDocument(DOC);
  assert.deepEqual(chunks.map((c) => c.ordinal), [1, 2, 3]);
});

test('an empty or heading-only document produces no clauses', () => {
  assert.deepEqual(chunkDocument(''), []);
  assert.deepEqual(chunkDocument('PART A\nSCOPE\n\n1Introduction\n'), []);
});

test('the locale is stamped on every chunk', () => {
  assert.ok(chunkDocument(DOC, { locale: 'ms' }).every((c) => c.locale === 'ms'));
});

// ── Retrieval ────────────────────────────────────────────────────────────────

const fakeDb = (rows) => ({ legalClause: { findMany: async () => rows } });

test('retrieval ranks by keyword overlap, with a heading bonus', async () => {
  await withSource(async () => {
    const rows = [
      { clauseNo: '7.6', heading: 'Platform Commission', text: 'The commission is a percentage of booking value.', partLabel: 'PART B' },
      { clauseNo: '7.13', heading: 'Partner Payouts', text: 'Payouts are made by DuitNow transfer to a verified account.', partLabel: 'PART B' },
    ];
    const r = await retrieveClauses(fakeDb(rows), 'how are payouts made');
    assert.equal(r[0].clauseNo, '7.13');
    assert.equal(r[0].source, 'terms');
  });
});

test('a blocked clause is never returned by retrieval', async () => {
  await withSource(async () => {
    const rows = [{ clauseNo: '8.1', heading: 'Free cancellation window', text: 'A Customer may cancel free of charge more than four hours before the start.', partLabel: 'PART B' }];
    assert.deepEqual(await retrieveClauses(fakeDb(rows), 'cancel my booking free'), []);
  });
});

test('a long clause is truncated so it cannot fill the reference block', async () => {
  await withSource(async () => {
    // 1.1 governs no policy key, so it is never blocked.
    const rows = [{ clauseNo: '1.1', heading: 'The Platform', text: `commission ${'x'.repeat(2000)}`, partLabel: null }];
    const [r] = await retrieveClauses(fakeDb(rows), 'commission');
    assert.ok(r.text.length <= 1201);
    assert.ok(r.text.endsWith('…'));
  });
});

test('a database failure degrades to no clauses rather than breaking the turn', async () => {
  await withSource(async () => {
    const db = { legalClause: { findMany: async () => { throw new Error('db down'); } } };
    assert.deepEqual(await retrieveClauses(db, 'commission'), []);
  });
});

test('an empty query retrieves nothing', async () => {
  await withSource(async () => {
    assert.deepEqual(await retrieveClauses(fakeDb([]), ''), []);
  });
});

test('scoreClause rewards a heading match over an incidental body mention', () => {
  const heading = { clauseNo: '9.4', heading: 'Refund method and timing', text: 'Unrelated body.' };
  const body = { clauseNo: '1.1', heading: 'The Platform', text: 'Something something refund somewhere.' };
  assert.ok(scoreClause(heading, ['refund']) > scoreClause(body, ['refund']));
});

// ── Citation validation ──────────────────────────────────────────────────────

test('a fabricated clause number fails validation', () => {
  // An invented citation looks authoritative and cannot be doubted by the
  // customer, which makes it worse than no citation at all.
  const available = [{ clauseNo: '8.1' }, { clauseNo: '9.4' }];
  const bad = validateCitations('You are covered under clause 12.7 of the Terms.', available);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.invalid, ['12.7']);

  const good = validateCitations('See clause 8.1 and clause 9.4.', available);
  assert.equal(good.ok, true);
  assert.deepEqual(good.cited, ['8.1', '9.4']);
});

test('an answer citing nothing passes validation', () => {
  const r = validateCitations('Refunds usually take a few working days.', [{ clauseNo: '9.4' }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.cited, []);
});

test('citation matching is case-insensitive and de-duplicated', () => {
  const r = validateCitations('Clause 8.1 says this, and clause 8.1 also says that.', [{ clauseNo: '8.1' }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.cited, ['8.1']);
});

test('the citation footer is localised', () => {
  const clauses = [{ clauseNo: '8.1' }, { clauseNo: '9.4' }];
  assert.equal(citationFooter(clauses, 'en'), '— Terms & Conditions, clause 8.1, 9.4');
  assert.match(citationFooter(clauses, 'ms'), /klausa 8\.1, 9\.4/);
  assert.equal(citationFooter([], 'en'), '');
});
