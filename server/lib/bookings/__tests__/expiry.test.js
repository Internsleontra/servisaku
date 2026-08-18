// Paid-but-unassigned expiry (RM116) — 72h boundary, eligibility and replay.
//
// The decision functions are tested against real clock arithmetic; the write
// path runs against an in-memory stub so no database is touched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  paidAt, expiresAt, ineligibleReason, expireBooking, findExpiredUnassigned,
  runExpirySweep, isExpiryEnabled, EXPIRY_AFTER_PAYMENT_MS, EXPIRY_POLICY,
  EXPIRY_FLAG, HOURS,
} from '../expiry.js';

/** The worker is armed only by an explicit flag; tests opt in. */
const ON = { [EXPIRY_FLAG]: 'true' };

const T0 = new Date('2026-08-15T00:00:00.000Z');
const at = (ms) => new Date(T0.getTime() + ms);

/** Mirrors the two live RM116 rows: paid, escrowed, never assigned. */
const booking = (over = {}) => ({
  id: 'bk1', status: 'pending', partnerId: null, paymentStatus: 'escrowed',
  price: 85, consumerId: 'c1', createdAt: T0, lifecycle: [],
  payments: [{ status: 'paid', paidAt: T0 }],
  escrow: { grossAmount: 85, partnerPayout: 68, commissionAmount: 17 },
  ...over,
});

function stubDb({ rows = [], refunds = [] } = {}) {
  const bookings = new Map(rows.map((b) => [b.id, { ...b }]));
  const refundRows = [...refunds];
  return {
    refundRows,
    booking: {
      findUnique: async ({ where }) => bookings.get(where.id) ?? null,
      findMany: async () => [...bookings.values()].filter(
        (b) => b.partnerId === null
          && ['paid', 'escrowed'].includes(b.paymentStatus)
          && ['pending', 'assigned'].includes(b.status),
      ),
      update: async ({ where, data }) => {
        const b = bookings.get(where.id);
        Object.assign(b, data);
        return b;
      },
    },
    refundRequest: {
      findFirst: async ({ where }) => refundRows.find(
        (r) => r.bookingId === where.bookingId && r.policyApplied === where.policyApplied,
      ) ?? null,
      create: async ({ data }) => {
        const row = { id: `rf${refundRows.length + 1}`, refundMethod: 'original', ...data };
        refundRows.push(row);
        return row;
      },
    },
  };
}

/** Stands in for executeRefund. Billplz cannot refund via API → 'manual'. */
const billplzExecute = async (refund) => ({ ...refund, refundMethod: 'manual' });
const apiExecute = async (refund) => ({ ...refund, refundMethod: 'original' });

describe('paidAt — the 72h anchor', () => {
  test('uses the Payment row, not booking creation', () => {
    const b = booking({ createdAt: T0, payments: [{ status: 'paid', paidAt: at(10 * HOURS) }] });
    assert.equal(paidAt(b).getTime(), at(10 * HOURS).getTime());
  });

  test('falls back to createdAt when no paid payment exists', () => {
    assert.equal(paidAt(booking({ payments: [] })).getTime(), T0.getTime());
  });

  test('ignores unpaid payment attempts', () => {
    const b = booking({ payments: [{ status: 'failed', paidAt: at(1 * HOURS) }] });
    assert.equal(paidAt(b).getTime(), T0.getTime());
  });

  test('takes the earliest paid payment when there are several', () => {
    const b = booking({
      payments: [
        { status: 'paid', paidAt: at(5 * HOURS) },
        { status: 'paid', paidAt: at(2 * HOURS) },
      ],
    });
    assert.equal(paidAt(b).getTime(), at(2 * HOURS).getTime());
  });

  test('a booking paid later than created expires later — not on the coarse filter', () => {
    const b = booking({ createdAt: T0, payments: [{ status: 'paid', paidAt: at(24 * HOURS) }] });
    assert.equal(expiresAt(b).getTime(), at(24 * HOURS + EXPIRY_AFTER_PAYMENT_MS).getTime());
    assert.match(ineligibleReason(b, at(73 * HOURS)), /not due until/);
  });
});

describe('72h boundary', () => {
  test('one millisecond before 72h is not due', () => {
    assert.match(ineligibleReason(booking(), at(EXPIRY_AFTER_PAYMENT_MS - 1)), /not due until/);
  });

  test('exactly 72h IS due', () => {
    assert.equal(ineligibleReason(booking(), at(EXPIRY_AFTER_PAYMENT_MS)), null);
  });

  test('71h is still within the window', () => {
    assert.match(ineligibleReason(booking(), at(71 * HOURS)), /not due until/);
  });
});

describe('eligibility', () => {
  const due = at(96 * HOURS);
  const cases = [
    ['a partner was assigned', booking({ partnerId: 'p1' }), /partner assigned/],
    ['payment never completed', booking({ paymentStatus: 'pending' }), /not funded/],
    ['already refunded', booking({ paymentStatus: 'refunded' }), /not funded/],
    ['booking already cancelled', booking({ status: 'cancelled' }), /is "cancelled"/],
    ['booking already completed', booking({ status: 'completed' }), /is "completed"/],
  ];
  for (const [name, b, expected] of cases) {
    test(`${name} → not expirable`, () => {
      assert.match(ineligibleReason(b, due), expected);
    });
  }

  test('an assigned-but-unaccepted booking is still eligible', () => {
    // `assigned` means dispatch picked someone but no partner is on the row yet.
    assert.equal(ineligibleReason(booking({ status: 'assigned' }), due), null);
  });
});

describe('expireBooking', () => {
  const due = at(96 * HOURS);

  test('creates a full refund, cancels the booking and marks it refunded', async () => {
    const db = stubDb({ rows: [booking()] });
    const r = await expireBooking('bk1', { now: due, db, execute: billplzExecute, env: ON });

    assert.equal(r.expired, true);
    assert.equal(r.amount, 85);
    assert.equal(db.refundRows.length, 1);
    const refund = db.refundRows[0];
    assert.equal(refund.refundAmount, 85);
    assert.equal(refund.refundType, 'full');
    assert.equal(refund.policyApplied, EXPIRY_POLICY);
    assert.equal(refund.liableParty, 'platform');
    assert.equal(refund.partnerLiabilityAmount, 0, 'no partner — no partner liability');

    const updated = await db.booking.findUnique({ where: { id: 'bk1' } });
    assert.equal(updated.status, 'cancelled');
    assert.equal(updated.paymentStatus, 'refunded');
  });

  test('refunds the ESCROW gross, not the raw booking price', async () => {
    // Escrow is authoritative: it is what the customer's money was split from.
    const db = stubDb({ rows: [booking({ price: 999, escrow: { grossAmount: 85 } })] });
    const r = await expireBooking('bk1', { now: due, db, execute: billplzExecute, env: ON });
    assert.equal(r.amount, 85);
  });

  test('writes an audit entry to the lifecycle naming the system actor', async () => {
    const db = stubDb({ rows: [booking()] });
    await expireBooking('bk1', { now: due, db, execute: billplzExecute, env: ON });
    const updated = await db.booking.findUnique({ where: { id: 'bk1' } });
    const last = updated.lifecycle.at(-1);
    assert.equal(last.status, 'cancelled');
    assert.equal(last.by, 'system:unassigned-expiry');
    assert.equal(last.at, due.toISOString());
  });

  test('Billplz refunds are flagged manual — the money has NOT moved yet', async () => {
    const db = stubDb({ rows: [booking()] });
    const r = await expireBooking('bk1', { now: due, db, execute: billplzExecute, env: ON });
    assert.equal(r.manual, true, 'must not claim the refund completed');
  });

  test('an API-capable gateway is not flagged manual', async () => {
    const db = stubDb({ rows: [booking()] });
    const r = await expireBooking('bk1', { now: due, db, execute: apiExecute, env: ON });
    assert.equal(r.manual, false);
  });

  test('replay creates no second refund', async () => {
    const db = stubDb({ rows: [booking()] });
    const first = await expireBooking('bk1', { now: due, db, execute: billplzExecute, env: ON });
    const second = await expireBooking('bk1', { now: due, db, execute: billplzExecute, env: ON });

    assert.equal(first.expired, true);
    assert.equal(second.expired, false);
    assert.equal(second.reason, 'already expired', 'the idempotency guard, not a downstream symptom');
    assert.equal(second.refundId, first.refundId, 'points at the original refund');
    assert.equal(db.refundRows.length, 1, 'exactly one refund may ever exist');
  });

  test('a pre-existing expiry refund blocks a duplicate even if the booking looks eligible', async () => {
    const db = stubDb({
      rows: [booking()],
      refunds: [{ id: 'rf-old', bookingId: 'bk1', policyApplied: EXPIRY_POLICY }],
    });
    const r = await expireBooking('bk1', { now: due, db, execute: billplzExecute, env: ON });
    assert.equal(r.expired, false);
    assert.equal(r.refundId, 'rf-old');
    assert.equal(db.refundRows.length, 1);
  });

  test('a booking not yet due is untouched', async () => {
    const db = stubDb({ rows: [booking()] });
    const r = await expireBooking('bk1', { now: at(1 * HOURS), db, execute: billplzExecute, env: ON });
    assert.equal(r.expired, false);
    assert.equal(db.refundRows.length, 0);
    assert.equal((await db.booking.findUnique({ where: { id: 'bk1' } })).status, 'pending');
  });

  test('never assigns a partner as a side effect', async () => {
    const db = stubDb({ rows: [booking()] });
    await expireBooking('bk1', { now: due, db, execute: billplzExecute, env: ON });
    assert.equal((await db.booking.findUnique({ where: { id: 'bk1' } })).partnerId, null);
  });
});

describe('sweep', () => {
  test('expires only the due rows and totals them', async () => {
    // The two live RM116 bookings: RM60 and RM85 gross.
    const db = stubDb({
      rows: [
        booking({ id: 'c0kbb4', price: 60, escrow: { grossAmount: 60 } }),
        booking({ id: 'q3zjoj', price: 85, escrow: { grossAmount: 85 } }),
        booking({ id: 'fresh', createdAt: at(71 * HOURS), payments: [{ status: 'paid', paidAt: at(71 * HOURS) }] }),
      ],
    });
    const result = await runExpirySweep({ now: at(96 * HOURS), db, execute: billplzExecute, env: ON });

    assert.equal(result.expired, 2);
    assert.equal(result.totalAmount, 145, 'the RM145 gross behind RM116 partner share');
    assert.equal(result.needingManualAction, 2, 'both need a Billplz dashboard action');
    assert.equal(result.failed.length, 0);
    assert.equal((await db.booking.findUnique({ where: { id: 'fresh' } })).status, 'pending');
  });

  test('findExpiredUnassigned skips assigned and unfunded bookings', async () => {
    const db = stubDb({
      rows: [
        booking({ id: 'due' }),
        booking({ id: 'taken', partnerId: 'p1' }),
        booking({ id: 'unpaid', paymentStatus: 'pending' }),
      ],
    });
    const due = await findExpiredUnassigned({ now: at(96 * HOURS), db });
    assert.deepEqual(due.map((b) => b.id), ['due']);
  });

  test('a sweep with nothing due is a clean no-op', async () => {
    const db = stubDb({ rows: [booking()] });
    const result = await runExpirySweep({ now: at(1 * HOURS), db, execute: billplzExecute, env: ON });
    assert.equal(result.checked, 0);
    assert.equal(result.expired, 0);
    assert.equal(db.refundRows.length, 0);
  });
});

describe('feature flag — UNASSIGNED_EXPIRY_ENABLED', () => {
  // This worker refunds customers and voids escrow, so the dangerous direction
  // is "on by accident". Every one of these asserts it fails CLOSED.

  test('flag absent → disabled', () => {
    assert.equal(isExpiryEnabled({}), false);
  });

  test('flag undefined → disabled', () => {
    assert.equal(isExpiryEnabled({ [EXPIRY_FLAG]: undefined }), false);
  });

  test('"false" → disabled', () => {
    assert.equal(isExpiryEnabled({ [EXPIRY_FLAG]: 'false' }), false);
  });

  test('"true" → ENABLED — the only value that arms it', () => {
    assert.equal(isExpiryEnabled({ [EXPIRY_FLAG]: 'true' }), true);
  });

  test('case and whitespace are tolerated for a clear yes', () => {
    assert.equal(isExpiryEnabled({ [EXPIRY_FLAG]: ' True ' }), true);
    assert.equal(isExpiryEnabled({ [EXPIRY_FLAG]: 'TRUE' }), true);
  });

  test('truthy-looking but invalid values → disabled', () => {
    for (const v of ['1', 'yes', 'on', 'enabled', 'y', 'TRUEISH', '"true"', 'null']) {
      assert.equal(isExpiryEnabled({ [EXPIRY_FLAG]: v }), false, `"${v}" must not arm the worker`);
    }
  });

  test('empty string → disabled', () => {
    assert.equal(isExpiryEnabled({ [EXPIRY_FLAG]: '' }), false);
    assert.equal(isExpiryEnabled({ [EXPIRY_FLAG]: '   ' }), false);
  });

  test('NODE_ENV is NOT consulted — development does not arm it', () => {
    assert.equal(isExpiryEnabled({ NODE_ENV: 'development' }), false);
    assert.equal(isExpiryEnabled({ NODE_ENV: 'test' }), false);
    assert.equal(isExpiryEnabled({ NODE_ENV: 'production' }), false);
  });

  test('DISABLED: expireBooking performs ZERO writes on a fully due booking', async () => {
    const db = stubDb({ rows: [booking()] });
    const before = await db.booking.findUnique({ where: { id: 'bk1' } });
    const snapshot = JSON.stringify(before);

    const r = await expireBooking('bk1', {
      now: at(96 * HOURS), db, execute: billplzExecute, env: { [EXPIRY_FLAG]: 'false' },
    });

    assert.equal(r.expired, false);
    assert.equal(r.disabled, true);
    assert.match(r.reason, /disabled/);
    assert.equal(db.refundRows.length, 0, 'no refund record may be created');
    assert.equal(
      JSON.stringify(await db.booking.findUnique({ where: { id: 'bk1' } })), snapshot,
      'the booking row must be byte-identical',
    );
  });

  test('DISABLED: a sweep reports what is due but writes nothing', async () => {
    const db = stubDb({
      rows: [
        booking({ id: 'c0kbb4', price: 60, escrow: { grossAmount: 60 } }),
        booking({ id: 'q3zjoj', price: 85, escrow: { grossAmount: 85 } }),
      ],
    });
    const result = await runExpirySweep({
      now: at(96 * HOURS), db, execute: billplzExecute, env: {},
    });

    assert.equal(result.enabled, false);
    assert.equal(result.dryRun, true);
    assert.equal(result.checked, 2, 'the query still runs — the report is the useful half');
    assert.equal(result.expired, 0);
    assert.equal(result.totalAmount, 0);
    assert.equal(db.refundRows.length, 0, 'zero writes');
    assert.deepEqual(result.wouldExpire.map((w) => w.bookingId), ['c0kbb4', 'q3zjoj']);
    assert.equal(result.wouldExpire.reduce((s, w) => s + w.amount, 0), 145);

    for (const id of ['c0kbb4', 'q3zjoj']) {
      const b = await db.booking.findUnique({ where: { id } });
      assert.equal(b.status, 'pending', `${id} must be untouched`);
      assert.equal(b.paymentStatus, 'escrowed');
    }
  });

  test('an invalid flag value leaves a due booking untouched', async () => {
    const db = stubDb({ rows: [booking()] });
    const result = await runExpirySweep({
      now: at(96 * HOURS), db, execute: billplzExecute, env: { [EXPIRY_FLAG]: 'YES_PLEASE' },
    });
    assert.equal(result.enabled, false);
    assert.equal(db.refundRows.length, 0);
    assert.equal((await db.booking.findUnique({ where: { id: 'bk1' } })).status, 'pending');
  });

  test('ENABLED: the same sweep does act — proving the flag is what gates it', async () => {
    const db = stubDb({ rows: [booking()] });
    const result = await runExpirySweep({
      now: at(96 * HOURS), db, execute: billplzExecute, env: ON,
    });
    assert.equal(result.enabled, true);
    assert.equal(result.dryRun, false);
    assert.equal(result.expired, 1);
    assert.equal(db.refundRows.length, 1);
  });
});
