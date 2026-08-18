// Escrow release — T&C 7.9(b) timing boundaries, suppression and replay.
//
// The pure decision functions (`dueAt`, `suppressionReason`) are tested against
// real clock arithmetic; `releaseEscrow` and `findDueReleases` run against an
// in-memory stub so the DB is never touched and the tests stay deterministic.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  dueAt, suppressionReason, releaseEscrow, findDueReleases, runReleaseSweep,
  RELEASE_AFTER_CONFIRMATION_MS, RELEASE_AFTER_COMPLETION_MS, HOURS,
} from '../release.js';

const T0 = new Date('2026-08-15T00:00:00.000Z');
const at = (ms) => new Date(T0.getTime() + ms);

// A funded ONLINE booking: markPaidAndEscrow leaves paymentStatus='escrowed'.
const booking = (over = {}) => ({
  id: 'bk1', status: 'completed', partnerId: 'p1', price: 245,
  serviceType: 'Deep Clean', completedAt: T0, completionConfirmedAt: null,
  paymentMethod: 'fpx', paymentStatus: 'escrowed', payments: [],
  partner: { id: 'p1' }, ...over,
});
const escrow = (over = {}) => ({
  bookingId: 'bk1', status: 'held', grossAmount: 245, commissionAmount: 49,
  commissionRate: 0.2, partnerPayout: 196, freezeReason: null, ...over,
});

/** Minimal Prisma stand-in: only the calls release.js actually makes. */
function stubDb({ rows = [], disputes = [] } = {}) {
  const state = new Map(rows.map((r) => [r.bookingId, structuredClone({ ...r, booking: r.booking })]));
  // structuredClone drops the partner object's identity but keeps values, which
  // is all creditEarning reads.
  rows.forEach((r) => { state.get(r.bookingId).booking = r.booking; });
  const credited = [];
  const credit = async (bk, { netPayout }) => { credited.push({ bookingId: bk.id, netPayout }); };
  return {
    credited,
    credit,
    escrowLedger: {
      findUnique: async ({ where }) => state.get(where.bookingId) ?? null,
      findMany: async () => [...state.values()].filter((r) => r.status === 'held'),
      updateMany: async ({ where, data }) => {
        const row = state.get(where.bookingId);
        if (!row || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    dispute: {
      findMany: async () => disputes.map((bookingId) => ({ bookingId })),
      count: async ({ where }) => (disputes.includes(where.bookingId) ? 1 : 0),
    },
  };
}

describe('dueAt — the two branches are MUTUALLY EXCLUSIVE (7.9(b))', () => {
  // The clause is conditional, not a race. A confirmation selects the 24h
  // branch outright; the 48h no-response timer is then not consulted at all.
  // Reading it as "whichever fires first" would release funds before the full
  // 24 hours the clause grants after a confirmation.
  const confirmedAt = (ms) => booking({ completionConfirmedAt: at(ms) });

  test('confirmation at 1h → release at 25h', () => {
    assert.equal(dueAt(confirmedAt(1 * HOURS)).getTime(), at(25 * HOURS).getTime());
  });

  test('confirmation at 23h59m → release at 47h59m', () => {
    const ms = 23 * HOURS + 59 * 60_000;
    assert.equal(dueAt(confirmedAt(ms)).getTime(), at(ms + RELEASE_AFTER_CONFIRMATION_MS).getTime());
  });

  test('confirmation at 47h → release at 71h, NOT 48h', () => {
    const due = dueAt(confirmedAt(47 * HOURS));
    assert.equal(due.getTime(), at(71 * HOURS).getTime());
    assert.notEqual(due.getTime(), at(48 * HOURS).getTime(),
      'the 48h no-response timer must not apply once the customer has confirmed');
  });

  test('confirmation at 100h → release at 124h — a late confirmation still gets its full 24h', () => {
    assert.equal(dueAt(confirmedAt(100 * HOURS)).getTime(), at(124 * HOURS).getTime());
  });

  test('no confirmation → release at 48h after completion', () => {
    assert.equal(dueAt(booking()).getTime(), at(48 * HOURS).getTime());
  });

  test('confirmation at completion time → release at 24h', () => {
    assert.equal(dueAt(booking({ completionConfirmedAt: T0 })).getTime(), at(24 * HOURS).getTime());
  });

  test('no anchor at all yields null rather than releasing immediately', () => {
    assert.equal(dueAt(booking({ completedAt: null })), null);
  });

  test('a confirmation with no completedAt still governs', () => {
    const b = booking({ completedAt: null, completionConfirmedAt: at(2 * HOURS) });
    assert.equal(dueAt(b).getTime(), at(26 * HOURS).getTime());
  });
});

describe('timing boundaries', () => {
  test('one millisecond BEFORE 48h is not due', () => {
    const r = suppressionReason(escrow(), booking(), at(RELEASE_AFTER_COMPLETION_MS - 1));
    assert.match(r, /not due until/);
  });

  test('exactly 48h IS due', () => {
    assert.equal(suppressionReason(escrow(), booking(), at(RELEASE_AFTER_COMPLETION_MS)), null);
  });

  test('one millisecond BEFORE 24h post-confirmation is not due', () => {
    const b = booking({ completionConfirmedAt: T0 });
    const r = suppressionReason(escrow(), b, at(RELEASE_AFTER_CONFIRMATION_MS - 1));
    assert.match(r, /not due until/);
  });

  test('exactly 24h post-confirmation IS due', () => {
    const b = booking({ completionConfirmedAt: T0 });
    assert.equal(suppressionReason(escrow(), b, at(RELEASE_AFTER_CONFIRMATION_MS)), null);
  });

  test('47h unconfirmed is still held — the 24h timer needs a confirmation', () => {
    assert.match(suppressionReason(escrow(), booking(), at(47 * HOURS)), /not due until/);
  });

  test('confirmed at 47h: NOT released at 48h, released at 71h', () => {
    const b = booking({ completionConfirmedAt: at(47 * HOURS) });
    assert.match(suppressionReason(escrow(), b, at(48 * HOURS)), /not due until/);
    assert.match(suppressionReason(escrow(), b, at(70 * HOURS)), /not due until/);
    assert.equal(suppressionReason(escrow(), b, at(71 * HOURS)), null);
  });

  test('confirmation arriving AFTER 48h does not release immediately', () => {
    // The worker had not ticked yet, so the booking was never released on the
    // no-response branch. The confirmation now governs and grants a fresh 24h.
    const b = booking({ completionConfirmedAt: at(50 * HOURS) });
    assert.match(suppressionReason(escrow(), b, at(50 * HOURS)), /not due until/);
    assert.match(suppressionReason(escrow(), b, at(73 * HOURS)), /not due until/);
    assert.equal(suppressionReason(escrow(), b, at(74 * HOURS)), null);
  });
});

describe('suppression — clause 7.9(c) and safety', () => {
  const due = at(72 * HOURS);
  const cases = [
    ['disputed booking', escrow(), booking({ status: 'disputed' }), /disputed/],
    ['frozen escrow', escrow({ freezeReason: 'under review' }), booking(), /frozen/],
    ['already released', escrow({ status: 'released' }), booking(), /not held/],
    ['refunded escrow', escrow({ status: 'refunded' }), booking(), /not held/],
    ['no partner assigned', escrow(), booking({ partnerId: null }), /no partner/],
    ['booking not completed', escrow(), booking({ status: 'started' }), /not completed/],
  ];
  for (const [name, e, b, expected] of cases) {
    test(`${name} suppresses release`, () => {
      assert.match(suppressionReason(e, b, due), expected);
    });
  }

  test('an open dispute blocks release even when the booking still reads completed', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }], disputes: ['bk1'] });
    const r = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    assert.equal(r.released, false);
    assert.match(r.reason, /dispute/);
    assert.equal((await db.escrowLedger.findUnique({ where: { bookingId: 'bk1' } })).status, 'held');
  });
});

describe('releaseEscrow', () => {
  const due = at(72 * HOURS);

  test('releases a due booking and stamps releasedAt', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const r = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    assert.equal(r.released, true);
    assert.equal(r.amount, 196);
    const row = await db.escrowLedger.findUnique({ where: { bookingId: 'bk1' } });
    assert.equal(row.status, 'released');
    assert.equal(row.releasedAt.getTime(), due.getTime());
  });

  test('pays the ESCROW payout, not a fresh split of the current price', async () => {
    // Escrow recorded 196 at 20%. The partner is now on the 15% elite tier, so a
    // recomputed split would pay 208.25 — the drift C-05 describes. The stored
    // figure must win.
    const b = booking({ partner: { id: 'p1', partnerProfile: { tier: 'elite' } } });
    const db = stubDb({ rows: [{ ...escrow(), booking: b }] });
    const r = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    assert.equal(r.amount, 196, 'must pay the snapshotted escrow payout');
    assert.notEqual(r.amount, 245 * 0.85);
  });

  test('replay is a no-op — second call does not release again', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const first = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    const second = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    assert.equal(first.released, true);
    assert.equal(second.released, false);
    assert.match(second.reason, /not held/);
  });

  test('a concurrent worker that loses the race does not double-credit', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const [a, b] = await Promise.all([
      releaseEscrow('bk1', { now: due, db, credit: db.credit }),
      releaseEscrow('bk1', { now: due, db, credit: db.credit }),
    ]);
    assert.equal([a, b].filter((r) => r.released).length, 1, 'exactly one release may win');
  });

  test('a booking that is not yet due is left alone', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const r = await releaseEscrow('bk1', { now: at(1 * HOURS), db, credit: db.credit });
    assert.equal(r.released, false);
    assert.equal((await db.escrowLedger.findUnique({ where: { bookingId: 'bk1' } })).status, 'held');
  });
});

describe('sweep', () => {
  test('releases only the due rows and reports the total', async () => {
    const rows = [
      { ...escrow({ bookingId: 'due1', partnerPayout: 36 }), booking: booking({ id: 'due1' }) },
      { ...escrow({ bookingId: 'due2', partnerPayout: 196 }), booking: booking({ id: 'due2' }) },
      { ...escrow({ bookingId: 'early' }), booking: booking({ id: 'early', completedAt: at(71 * HOURS) }) },
    ];
    const db = stubDb({ rows });
    const result = await runReleaseSweep({ now: at(72 * HOURS), db, credit: db.credit });
    assert.equal(result.released, 2);
    assert.equal(result.totalAmount, 232);
    assert.equal(result.failed.length, 0);
    assert.equal((await db.escrowLedger.findUnique({ where: { bookingId: 'early' } })).status, 'held');
  });

  test('findDueReleases excludes rows with an open dispute', async () => {
    const rows = [
      { ...escrow({ bookingId: 'ok' }), booking: booking({ id: 'ok' }) },
      { ...escrow({ bookingId: 'fought' }), booking: booking({ id: 'fought' }) },
    ];
    const db = stubDb({ rows, disputes: ['fought'] });
    const due = await findDueReleases({ now: at(72 * HOURS), db });
    assert.deepEqual(due.map((d) => d.bookingId), ['ok']);
  });

  test('a sweep over nothing due is a clean no-op', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const result = await runReleaseSweep({ now: at(1 * HOURS), db, credit: db.credit });
    assert.equal(result.checked, 0);
    assert.equal(result.released, 0);
  });

  test('a booking confirmed at 47h is NOT swept at 48h, and IS at 71h', async () => {
    const b = booking({ completionConfirmedAt: at(47 * HOURS) });
    const db = stubDb({ rows: [{ ...escrow(), booking: b }] });

    const early = await runReleaseSweep({ now: at(48 * HOURS), db, credit: db.credit });
    assert.equal(early.released, 0, 'confirmation replaces the 48h timer');
    assert.equal((await db.escrowLedger.findUnique({ where: { bookingId: 'bk1' } })).status, 'held');

    const onTime = await runReleaseSweep({ now: at(71 * HOURS), db, credit: db.credit });
    assert.equal(onTime.released, 1);
  });

  test('repeated sweeps stay idempotent — the second pays nothing', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const first = await runReleaseSweep({ now: at(72 * HOURS), db, credit: db.credit });
    const second = await runReleaseSweep({ now: at(96 * HOURS), db, credit: db.credit });
    const third = await runReleaseSweep({ now: at(120 * HOURS), db, credit: db.credit });

    assert.equal(first.released, 1);
    assert.equal(second.released, 0);
    assert.equal(third.released, 0);
    assert.equal(db.credited.length, 1, 'the partner is credited exactly once');
    assert.equal(db.credited[0].netPayout, 196);
  });

  test('a dispute suppresses the CONFIRMED branch too, not just the 48h one', async () => {
    const b = booking({ completionConfirmedAt: T0 });
    const db = stubDb({ rows: [{ ...escrow(), booking: b }], disputes: ['bk1'] });
    const result = await runReleaseSweep({ now: at(25 * HOURS), db, credit: db.credit });
    assert.equal(result.released, 0);
    assert.equal((await db.escrowLedger.findUnique({ where: { bookingId: 'bk1' } })).status, 'held');
  });
});

describe('9–11 · release refuses money that was never collected', () => {
  const due = at(72 * HOURS);

  // Second defence, independent of the completion guard. Even if a booking
  // reaches `completed` unfunded — a future bug, a direct DB write, or a row
  // completed before the guard existed — the worker must not pay out.

  test('9 · online booking still pending → REFUSED', () => {
    const b = booking({ paymentStatus: 'pending' });
    assert.match(suppressionReason(escrow(), b, due), /never funded/);
  });

  test('9b · online booking that failed → REFUSED', () => {
    assert.match(suppressionReason(escrow(), booking({ paymentStatus: 'failed' }), due), /never funded/);
  });

  test('9c · CASH booking with a held escrow row → REFUSED', () => {
    // The trap: every booking gets a held escrow row at creation, cash
    // included. The partner already holds the fare — releasing pays them twice.
    const b = booking({ paymentMethod: 'cash', paymentStatus: 'paid' });
    assert.match(suppressionReason(escrow(), b, due), /already holds the fare/);
  });

  test('9d · cash detected from the payment row, not just the method', () => {
    const b = booking({ paymentMethod: 'fpx', payments: [{ method: 'cash', provider: 'cash' }] });
    assert.match(suppressionReason(escrow(), b, due), /already holds the fare/);
  });

  test('9e · an unfunded booking is not released by the write path either', async () => {
    const b = booking({ paymentStatus: 'pending' });
    const db = stubDb({ rows: [{ ...escrow(), booking: b }] });
    const r = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    assert.equal(r.released, false);
    assert.match(r.reason, /never funded/);
    assert.equal(db.credited.length, 0, 'no partner may be credited');
    assert.equal((await db.escrowLedger.findUnique({ where: { bookingId: 'bk1' } })).status, 'held',
      'escrow stays held so it can be reported and resolved');
  });

  test('9f · a cash booking is not released by the write path either', async () => {
    const b = booking({ paymentMethod: 'cash', paymentStatus: 'paid' });
    const db = stubDb({ rows: [{ ...escrow(), booking: b }] });
    const r = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    assert.equal(r.released, false);
    assert.equal(db.credited.length, 0);
  });

  test('9g · a sweep reports unfunded rows without paying them', async () => {
    const db = stubDb({
      rows: [
        { ...escrow({ bookingId: 'unpaid' }), booking: booking({ id: 'unpaid', paymentStatus: 'pending' }) },
        { ...escrow({ bookingId: 'cashjob' }), booking: booking({ id: 'cashjob', paymentMethod: 'cash' }) },
      ],
    });
    const result = await runReleaseSweep({ now: due, db, credit: db.credit });
    assert.equal(result.released, 0);
    assert.equal(result.totalAmount, 0);
    assert.equal(db.credited.length, 0);
    for (const id of ['unpaid', 'cashjob']) {
      assert.equal((await db.escrowLedger.findUnique({ where: { bookingId: id } })).status, 'held');
    }
  });

  test('10 · a valid completed+escrowed booking still releases correctly', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const r = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    assert.equal(r.released, true);
    assert.equal(r.amount, 196);
    assert.equal(db.credited.length, 1);
    assert.equal(db.credited[0].netPayout, 196);
  });

  test('11 · repeated release stays idempotent with the guard in place', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const a = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    const b = await releaseEscrow('bk1', { now: due, db, credit: db.credit });
    const c = await releaseEscrow('bk1', { now: at(96 * HOURS), db, credit: db.credit });
    assert.equal(a.released, true);
    assert.equal(b.released, false);
    assert.equal(c.released, false);
    assert.equal(db.credited.length, 1, 'credited exactly once across three attempts');
  });
});

describe('admin manual release — same financial rules as the worker', () => {
  // routes/escrow.js delegates to releaseEscrow({ ignoreTiming: true }). These
  // exercise that exact call, so the endpoint cannot drift from the worker.
  const early = at(1 * HOURS);        // long before any timer would fire
  const adminRelease = (db, id = 'bk1') =>
    releaseEscrow(id, { now: early, db, credit: db.credit, ignoreTiming: true });

  test('1 · online + escrowed → succeeds even before the 24/48h timer', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    // The worker would refuse at this moment...
    assert.equal((await releaseEscrow('bk1', { now: early, db, credit: db.credit })).released, false);
    // ...but an admin may waive the clock.
    const r = await adminRelease(db);
    assert.equal(r.released, true);
    assert.equal(r.amount, 196);
    assert.equal((await db.escrowLedger.findUnique({ where: { bookingId: 'bk1' } })).status, 'released');
  });

  test('2 · online + pending payment → REJECTED', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking({ paymentStatus: 'pending' }) }] });
    const r = await adminRelease(db);
    assert.equal(r.released, false);
    assert.match(r.reason, /never funded/);
    assert.equal(db.credited.length, 0);
    assert.equal((await db.escrowLedger.findUnique({ where: { bookingId: 'bk1' } })).status, 'held');
  });

  test('3 · cash booking → REJECTED (the partner already holds the fare)', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking({ paymentMethod: 'cash', paymentStatus: 'paid' }) }] });
    const r = await adminRelease(db);
    assert.equal(r.released, false);
    assert.match(r.reason, /already holds the fare/);
    assert.equal(db.credited.length, 0);
  });

  test('4a · frozen escrow → REJECTED', async () => {
    const db = stubDb({ rows: [{ ...escrow({ freezeReason: 'under review' }), booking: booking() }] });
    const r = await adminRelease(db);
    assert.equal(r.released, false);
    assert.match(r.reason, /frozen/);
    assert.equal(db.credited.length, 0);
  });

  test('4b · disputed booking → REJECTED', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking({ status: 'disputed' }) }] });
    const r = await adminRelease(db);
    assert.equal(r.released, false);
    assert.match(r.reason, /disputed/);
  });

  test('4c · an OPEN dispute blocks it even when the booking reads completed', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }], disputes: ['bk1'] });
    const r = await adminRelease(db);
    assert.equal(r.released, false);
    assert.match(r.reason, /dispute/);
    assert.equal(db.credited.length, 0);
  });

  test('5 · pays the escrow partnerPayout, NOT the current tier', async () => {
    // Escrow recorded 196 at 20%. The partner is now elite (15%), which would
    // recompute to 208.25. The stored figure must win.
    const b = booking({ partner: { id: 'p1', partnerProfile: { tier: 'elite' } } });
    const db = stubDb({ rows: [{ ...escrow(), booking: b }] });
    const r = await adminRelease(db);
    assert.equal(r.amount, 196);
    assert.equal(db.credited[0].netPayout, 196);
    assert.notEqual(db.credited[0].netPayout, 245 * 0.85);
  });

  test('6 · repeated admin release is idempotent', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const first = await adminRelease(db);
    const second = await adminRelease(db);
    assert.equal(first.released, true);
    assert.equal(second.released, false);
    assert.match(second.reason, /not held/);
    assert.equal(db.credited.length, 1, 'credited exactly once');
  });

  test('7 · a failed credit propagates AND rolls the row back to held', async () => {
    // Without the rollback the row would sit `released` with no money in the
    // wallet, and the `held` guard would stop any retry ever fixing it.
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    db.credit = async () => { throw new Error('ledger unavailable'); };

    await assert.rejects(() => adminRelease(db), /ledger unavailable/);

    const row = await db.escrowLedger.findUnique({ where: { bookingId: 'bk1' } });
    assert.equal(row.status, 'held', 'rolled back so a retry can succeed');
    assert.equal(row.releasedAt, null);
  });

  test('7b · after a failed credit, a retry succeeds and credits once', async () => {
    const db = stubDb({ rows: [{ ...escrow(), booking: booking() }] });
    const good = db.credit;
    db.credit = async () => { throw new Error('ledger unavailable'); };
    await assert.rejects(() => adminRelease(db));

    db.credit = good;
    const r = await adminRelease(db);
    assert.equal(r.released, true);
    assert.equal(db.credited.length, 1);
  });

  test('ignoreTiming waives ONLY the clock — never a financial rule', async () => {
    for (const b of [
      booking({ paymentStatus: 'pending' }),
      booking({ paymentMethod: 'cash' }),
      booking({ status: 'disputed' }),
      booking({ partnerId: null }),
    ]) {
      const db = stubDb({ rows: [{ ...escrow(), booking: b }] });
      const r = await adminRelease(db);
      assert.equal(r.released, false, `must refuse: ${JSON.stringify({ ps: b.paymentStatus, pm: b.paymentMethod, s: b.status, p: b.partnerId })}`);
      assert.equal(db.credited.length, 0);
    }
  });
});
