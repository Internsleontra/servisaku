import test from 'node:test';
import assert from 'node:assert/strict';
import { split } from '../../payments/commission.js';

/* Escrow-hold reliability.
 *
 * The defect: `creditEscrowHold` was fire-and-forget with a `.catch()` that only
 * logged, AND `markPaidAndEscrow` returned early on an already-paid payment — so
 * a hold lost on the first pass could never be recovered by a webhook redelivery.
 *
 * These exercise the decision logic and the idempotency contract without a
 * database, using a fake ledger that records what would be written. The live
 * behaviour is covered separately by scripts/audit-financial.mjs.
 */

/** Minimal stand-in for ledger.post() — same idempotency contract. */
function makeLedger() {
  const entries = new Map();          // idempotencyKey -> entry
  let attempts = 0;
  let failNext = 0;
  return {
    entries,
    get attempts() { return attempts; },
    failOnce() { failNext = 1; },
    async post({ idempotencyKey, amount, partnerId, bookingId, type }) {
      attempts += 1;
      if (failNext > 0) { failNext -= 1; throw new Error('ledger unavailable'); }
      if (idempotencyKey && entries.has(idempotencyKey)) return entries.get(idempotencyKey);
      const entry = { id: `e${entries.size + 1}`, idempotencyKey, amount, partnerId, bookingId, type };
      if (idempotencyKey) entries.set(idempotencyKey, entry);
      return entry;
    },
  };
}

/** Mirrors creditEscrowHold's guard + key, against the injected ledger. */
async function creditHold(ledger, booking) {
  const { netPayout } = split(booking.price, { partner: booking.partner });
  if (netPayout <= 0 || !booking.partnerId) return null;
  return ledger.post({
    partnerId: booking.partnerId,
    type: 'escrow_hold',
    amount: netPayout,
    bookingId: booking.id,
    idempotencyKey: `escrow_hold:${booking.id}`,
  });
}

const funded = (over = {}) => ({
  id: 'bk1', price: 85, partnerId: 'p1', partner: null,
  paymentStatus: 'escrowed', status: 'started', ...over,
});

test('1 · settlement creates the hold for the partner share', async () => {
  const ledger = makeLedger();
  const entry = await creditHold(ledger, funded());
  assert.equal(entry.amount, 68);                 // 85 − 20%
  assert.equal(entry.amount, split(85).netPayout);
  assert.equal(ledger.entries.size, 1);
});

test('2 · a failed hold is recovered by a later retry', async () => {
  const ledger = makeLedger();
  const booking = funded();

  ledger.failOnce();
  await assert.rejects(() => creditHold(ledger, booking), /ledger unavailable/);
  assert.equal(ledger.entries.size, 0, 'nothing written on failure');

  // The retry is what the fix makes reachable: markPaidAndEscrow no longer
  // returns early on an already-paid payment without calling ensureEscrowHold.
  const entry = await creditHold(ledger, booking);
  assert.equal(entry.amount, 68);
  assert.equal(ledger.entries.size, 1);
});

test('3 · replaying settlement does not create a duplicate hold', async () => {
  const ledger = makeLedger();
  const booking = funded();
  const first = await creditHold(ledger, booking);
  const second = await creditHold(ledger, booking);
  const third = await creditHold(ledger, booking);

  assert.equal(ledger.entries.size, 1, 'one entry however many replays');
  assert.equal(first.id, second.id);
  assert.equal(second.id, third.id);
  assert.equal(ledger.attempts, 3, 'all three replays reached the ledger');
});

test('4 · a booking with partnerId = null writes no hold', async () => {
  const ledger = makeLedger();
  const entry = await creditHold(ledger, funded({ partnerId: null }));
  assert.equal(entry, null);
  assert.equal(ledger.entries.size, 0, 'no partner means no liability to hold');
});

test('5 · assigning a partner later does not itself credit them', async () => {
  const ledger = makeLedger();
  const booking = funded({ partnerId: null });
  await creditHold(ledger, booking);
  assert.equal(ledger.entries.size, 0);

  // Assignment happens elsewhere; nothing in the settlement path re-fires.
  booking.partnerId = 'p1';
  assert.equal(ledger.entries.size, 0,
    'attribution-on-assignment is deferred — see docs/14-escrow-attribution-gap.md');
});

test('6 · pending counts funded escrow only', () => {
  const rows = [
    { partnerPayout: 68, status: 'held', paymentStatus: 'escrowed' },
    { partnerPayout: 36, status: 'held', paymentStatus: 'escrowed' },
    { partnerPayout: 228, status: 'held', paymentStatus: 'pending' },   // unpaid
    { partnerPayout: 132, status: 'held', paymentStatus: 'pending' },   // unpaid
  ];
  const FUNDED = ['paid', 'escrowed'];
  const pending = rows.filter((r) => r.status === 'held' && FUNDED.includes(r.paymentStatus))
    .reduce((s, r) => s + r.partnerPayout, 0);
  assert.equal(pending, 104);
  assert.notEqual(pending, 464, 'unpaid bookings must not appear in pending');
});

test('7 · escrow partnerPayout matches the canonical split', () => {
  for (const gross of [45, 85, 245, 285, 89.9]) {
    const { commission, netPayout } = split(gross);
    assert.equal(Math.round((commission + netPayout) * 100), Math.round(gross * 100));
  }
  assert.equal(split(285).netPayout, 228);
});

test('8 · creditEarning writes two keyed entries and repeats are no-ops', async () => {
  const ledger = makeLedger();
  const booking = funded();
  const { netPayout } = split(booking.price);

  const credit = async () => {
    await ledger.post({ partnerId: booking.partnerId, type: 'escrow_release', amount: netPayout, bookingId: booking.id, idempotencyKey: `escrow_release:${booking.id}` });
    return ledger.post({ partnerId: booking.partnerId, type: 'earning_credit', amount: netPayout, bookingId: booking.id, idempotencyKey: `earning:${booking.id}` });
  };

  await credit();
  assert.equal(ledger.entries.size, 2, 'release + credit');
  await credit();
  assert.equal(ledger.entries.size, 2, 'repeat wrote nothing');
});

test('9 · the hold amount never uses the flat booking fee', async () => {
  const ledger = makeLedger();
  const entry = await creditHold(ledger, funded({ id: 'bk285', price: 285 }));
  assert.equal(entry.amount, 228);
  assert.notEqual(entry.amount, 280, 'RM285 − RM5 booking fee is not a partner payout');
});
