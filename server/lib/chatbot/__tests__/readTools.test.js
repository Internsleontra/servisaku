// Unit tests for Class R read tools — `node --test`.
// Run against a fake prisma client so the identity-scoping rule is asserted
// directly: every query must carry the caller's own id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSUMER_TOOLS, PARTNER_TOOLS, toolsFor, runTool,
  upcomingBookings, changeableBookings, activeBookingStatus,
  todaySchedule, earnings, walletSummary, outstandingSettlements, verificationStatus,
} from '../tools/read.js';

const NOW = new Date('2026-08-02T10:00:00+08:00');

/** Records every `where` it is given, so tests can assert on scoping. */
function fakeDb(fixtures = {}) {
  const seen = [];
  const model = (name) => ({
    findMany: async ({ where }) => { seen.push({ model: name, where }); return fixtures[name] || []; },
    findFirst: async ({ where }) => { seen.push({ model: name, where }); return (fixtures[name] || [])[0] || null; },
    findUnique: async ({ where }) => { seen.push({ model: name, where }); return (fixtures[name] || [])[0] || null; },
  });
  return {
    seen,
    booking: model('booking'),
    refundRequest: model('refundRequest'),
    coupon: model('coupon'),
    partnerWallet: model('partnerWallet'),
    commissionSettlement: model('commissionSettlement'),
    partnerBankAccount: model('partnerBankAccount'),
    partnerDocument: model('partnerDocument'),
    partnerLocation: model('partnerLocation'),
    partnerConsumable: model('partnerConsumable'),
    review: model('review'),
  };
}

const consumer = { id: 'u1', role: 'consumer' };
const partner = { id: 'p1', role: 'partner' };

// ── The scoping rule ─────────────────────────────────────────────────────────

test('EVERY consumer tool scopes its query by the caller’s own id', async () => {
  // This is the property that stops "what's the status of booking 4821?" being
  // a data-leak primitive: the identifier is never used, only the session's
  // identity.
  for (const [name, fn] of Object.entries(CONSUMER_TOOLS)) {
    const db = fakeDb();
    await fn(db, consumer, {});
    const bookingQueries = db.seen.filter((q) => q.model === 'booking' || q.model === 'refundRequest');
    for (const q of bookingQueries) {
      const scoped = q.where.consumerId === consumer.id;
      assert.ok(scoped, `${name} issued an unscoped ${q.model} query`);
    }
  }
});

test('EVERY partner tool scopes its query by the caller’s own id', async () => {
  for (const [name, fn] of Object.entries(PARTNER_TOOLS)) {
    const db = fakeDb();
    await fn(db, partner, {});
    for (const q of db.seen) {
      // Scoping is either direct (`partnerId`) or through a relation
      // (`booking.partnerId`, how reviews reach their partner). An unscoped
      // query is the thing this test exists to catch, so neither form may be
      // waved through as "absent".
      const direct = q.where?.partnerId === partner.id;
      const nested = q.where?.booking?.partnerId === partner.id;
      assert.ok(direct || nested, `${name} issued an unscoped ${q.model} query: ${JSON.stringify(q.where)}`);
    }
  }
});

test('no tool accepts an identifier as an argument', async () => {
  // Passing a booking id must not change what is returned — the tools take a
  // user, not a target.
  const db = fakeDb({ booking: [{ id: 'b1', serviceType: 'Aircon', status: 'accepted', date: NOW, price: 120 }] });
  const a = await upcomingBookings(db, consumer, { bookingId: 'someone-elses', limit: 5 });
  assert.deepEqual(a.ownedIds, ['b1']);
});

// ── Shape ────────────────────────────────────────────────────────────────────

test('tools return ownedIds, which is what an action card is validated against', async () => {
  const db = fakeDb({
    booking: [
      { id: 'b1', serviceType: 'Aircon Servicing', status: 'accepted', date: NOW, scheduledStart: NOW, price: 120 },
      { id: 'b2', serviceType: 'Home Cleaning', status: 'pending', date: NOW, scheduledStart: null, price: 135 },
    ],
  });
  const r = await changeableBookings(db, consumer);
  assert.deepEqual(r.ownedIds, ['b1', 'b2']);
  // Resolution and authorisation share one code path rather than two that can
  // disagree.
  assert.equal(r.data[0].id, 'b1');
  assert.equal(r.data[0].price, 'RM 120.00');
  assert.equal(r.data[0].priceRaw, 120);
});

test('money is formatted as Malaysian Ringgit throughout', async () => {
  const db = fakeDb({
    partnerWallet: [{ availableBalance: 890, pendingBalance: 454.5, outstandingCommission: 64, isFrozen: false }],
  });
  const r = await walletSummary(db, partner);
  assert.equal(r.data.available, 'RM 890.00');
  assert.equal(r.data.pending, 'RM 454.50');
  assert.equal(r.data.outstandingCommission, 'RM 64.00');
});

test('an absent record returns null data rather than throwing', async () => {
  const db = fakeDb();
  assert.equal((await activeBookingStatus(db, consumer)).data, null);
  assert.equal((await walletSummary(db, partner)).data, null);
  assert.deepEqual((await upcomingBookings(db, consumer)).data, []);
});

test('earnings splits cash from online and does not recompute net', async () => {
  // Net comes from the wallet ledger, which is the only thing that knows about
  // adjustments, reversals and deductions.
  const db = fakeDb({
    booking: [
      { price: 120, paymentMethod: 'cash' },
      { price: 160, paymentMethod: 'fpx' },
      { price: 60, paymentMethod: 'card' },
    ],
  });
  const r = await earnings(db, partner, { period: 'today', now: NOW });
  assert.equal(r.data.jobs, 3);
  assert.equal(r.data.gross, 'RM 340.00');
  assert.equal(r.data.cash, 'RM 120.00');
  assert.equal(r.data.online, 'RM 220.00');
  assert.equal(r.data.net, undefined);
});

test('today’s schedule uses a Malaysian day boundary', async () => {
  const db = fakeDb({ booking: [] });
  await todaySchedule(db, partner, { now: new Date('2026-08-02T17:30:00Z') }); // 01:30 MYT on the 3rd
  const q = db.seen.find((x) => x.model === 'booking');
  // A UTC boundary would file a late-evening MYT job into the wrong day.
  const from = q.where.date.gte;
  assert.equal(new Date(from.getTime() + 8 * 3600_000).getUTCDate(), 3);
});

test('settlements report what is still outstanding, not the original total', async () => {
  const db = fakeDb({
    commissionSettlement: [{ id: 's1', reference: 'SET-2291', totalDue: 100, amountPaid: 36, dueDate: NOW, status: 'overdue' }],
  });
  const r = await outstandingSettlements(db, partner);
  assert.equal(r.data[0].outstanding, 'RM 64.00');
  assert.equal(r.data[0].outstandingRaw, 64);
  assert.deepEqual(r.ownedIds, ['s1']);
});

test('verification flags expired documents — the usual reason jobs stop', async () => {
  const db = fakeDb({
    partnerBankAccount: [{ isVerified: true }],
    partnerDocument: [
      { type: 'insurance', status: 'approved', expiresAt: new Date('2026-07-15') },
      { type: 'mykad', status: 'approved', expiresAt: null },
    ],
  });
  const r = await verificationStatus(db, partner);
  assert.equal(r.data.bankVerified, true);
  assert.equal(r.data.expiredCount, 1);
  assert.equal(r.data.documents[0].expired, true);
  assert.equal(r.data.documents[1].expired, false);
});

// ── Registry ─────────────────────────────────────────────────────────────────

test('a role is offered only its own side’s tools', async () => {
  assert.ok('earnings' in toolsFor('partner'));
  assert.ok(!('earnings' in toolsFor('consumer')));
  assert.ok('upcoming_bookings' in toolsFor('consumer'));
  assert.ok(!('upcoming_bookings' in toolsFor('partner')));
});

test('runTool refuses a wrong-audience tool without throwing', async () => {
  const db = fakeDb();
  // A consumer conversation cannot reach partner earnings even if the transcript
  // asks it to.
  assert.equal(await runTool(db, consumer, 'consumer', 'earnings'), null);
  assert.equal(await runTool(db, consumer, 'consumer', 'made_up_tool'), null);
  assert.ok(await runTool(db, partner, 'partner', 'earnings', { now: NOW }));
});

test('a failing tool degrades the answer rather than failing the conversation', async () => {
  const db = fakeDb();
  db.booking.findMany = async () => { throw new Error('db down'); };
  assert.equal(await runTool(db, consumer, 'consumer', 'upcoming_bookings'), null);
});
