// ─────────────────────────────────────────────────────────────────────────────
// Paid-but-unassigned expiry — the RM116 lifecycle gap.
//
// A customer can pay for a booking that never gets a partner. The money sits in
// escrow with a `partnerPayout` figure and nobody to pay it to: the repair
// script skips these rows on purpose, because creating a hold would mean
// inventing a partner and fabricating a balance (docs/14-escrow-attribution-gap.md).
// Two live bookings had been in this state since 2026-07-25 — RM145 gross,
// RM116 partner share, RM29 commission.
//
// APPROVED RULE. 72 hours after PAYMENT, a still-unassigned booking expires:
// the customer is refunded, the escrow row is voided, and the whole thing is
// written to the audit trail. No retroactive partner assignment, no indefinite
// hold.
//
// WHAT "AUTO-REFUND" HONESTLY MEANS HERE. Billplz — the only v1 online gateway —
// has no refund API; `createRefund()` throws and refunds are performed from
// their dashboard. So this module auto-INITIATES: it creates the RefundRequest,
// voids escrow, writes the ledger and audit entries, and hands off to the
// existing `executeRefund`, which records `refundMethod: 'manual'` rather than
// pretending money moved. The customer's money returns when an operator
// completes the dashboard step. `listPendingManualRefunds()` below is the queue
// they work from.
//
// IDEMPOTENCY. `policyApplied` carries a deterministic marker and is checked
// before anything is created, so a booking can only ever expire once — across
// retries, restarts and concurrent workers.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma as defaultDb } from '../../db.js';
import { executeRefund } from '../refunds/execute.js';
import { round2 } from '../payments/commission.js';

export const HOURS = 60 * 60 * 1000;

/**
 * How long a paid booking may wait for a partner before it is refunded.
 *
 * BUSINESS VALUE — confirm before production, like MINIMUM_PAYOUT_MYR.
 * 72h bounds the liability tightly while leaving dispatch three days to fill
 * the job. Shortening it refunds bookings dispatch might still have filled;
 * lengthening it ages the liability.
 */
export const EXPIRY_AFTER_PAYMENT_MS = 72 * HOURS;

/** Marker on RefundRequest.policyApplied — also the idempotency guard. */
export const EXPIRY_POLICY = 'unassigned_expiry_72h';

/** The one variable that arms this worker. Nothing else may enable it. */
export const EXPIRY_FLAG = 'UNASSIGNED_EXPIRY_ENABLED';

/**
 * Is the expiry worker allowed to mutate anything?
 *
 * FAILS CLOSED, DELIBERATELY. This worker refunds customers and voids escrow,
 * so the dangerous direction is "on by accident". Therefore:
 *
 *   · absent            → disabled (a missing variable in production is the
 *                         single most likely mistake, so it must be safe)
 *   · "false"           → disabled
 *   · anything else     → disabled, with a warning naming the bad value
 *   · "true"            → ENABLED — the only value that arms it
 *
 * NODE_ENV is deliberately NOT consulted. Enablement must be an explicit,
 * separate decision: a staging box that happens to run with NODE_ENV=development
 * must not start refunding customers because of it.
 *
 * Case and surrounding whitespace are normalised so `True` and ` true ` work —
 * an operator who clearly meant yes should not be silently ignored — but
 * `1`, `yes` and `on` are rejected, because guessing at intent is how a money
 * worker gets switched on by accident.
 */
export function isExpiryEnabled(env = process.env) {
  const raw = env[EXPIRY_FLAG];
  if (raw === undefined || raw === null) return false;
  const value = String(raw).trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false' || value === '') return false;
  console.warn(
    `[expiry] ${EXPIRY_FLAG}="${raw}" is not a recognised boolean — treating as DISABLED. `
    + 'Use exactly "true" to enable.',
  );
  return false;
}

/** Payment states that mean the customer's money is actually with us. */
const FUNDED = ['paid', 'escrowed'];

/** Booking states still awaiting a partner. Anything else has moved on. */
const AWAITING_PARTNER = ['pending', 'assigned'];

/**
 * When the customer paid. Prefers the Payment row's own timestamp and falls
 * back to booking creation, because the rule is "72 hours after payment" and
 * a booking created long before it was paid must not expire early.
 */
export function paidAt(booking) {
  const paid = (booking.payments || [])
    .filter((p) => p.status === 'paid' && p.paidAt)
    .map((p) => new Date(p.paidAt).getTime());
  if (paid.length) return new Date(Math.min(...paid));
  return booking.createdAt ? new Date(booking.createdAt) : null;
}

/** When this booking expires, or null if it has no payment anchor. */
export function expiresAt(booking) {
  const from = paidAt(booking);
  return from ? new Date(from.getTime() + EXPIRY_AFTER_PAYMENT_MS) : null;
}

/** Why this booking is not expirable, or null when it is. */
export function ineligibleReason(booking, now = new Date()) {
  if (!booking) return 'no booking';
  if (booking.partnerId) return 'partner assigned';
  if (!FUNDED.includes(booking.paymentStatus)) return `payment status "${booking.paymentStatus}" is not funded`;
  if (!AWAITING_PARTNER.includes(booking.status)) return `booking is "${booking.status}"`;
  const due = expiresAt(booking);
  if (!due) return 'no payment timestamp to measure from';
  if (due.getTime() > now.getTime()) return `not due until ${due.toISOString()}`;
  return null;
}

/** Funded, unassigned bookings past their expiry window. */
export async function findExpiredUnassigned({ now = new Date(), db = defaultDb } = {}) {
  const cutoff = new Date(now.getTime() - EXPIRY_AFTER_PAYMENT_MS);

  const rows = await db.booking.findMany({
    where: {
      partnerId: null,
      paymentStatus: { in: FUNDED },
      status: { in: AWAITING_PARTNER },
      createdAt: { lte: cutoff },
    },
    include: { payments: true, escrow: true, consumer: true },
  });

  // `createdAt` narrows the set in SQL; `paidAt` decides, since a booking paid
  // later than it was created has a later deadline than the coarse filter implies.
  return rows.filter((b) => !ineligibleReason(b, now));
}

/** Has this booking already been expired? The idempotency guard. */
export async function alreadyExpired(bookingId, { db = defaultDb } = {}) {
  const existing = await db.refundRequest.findFirst({
    where: { bookingId, policyApplied: EXPIRY_POLICY },
  });
  return existing || null;
}

/**
 * Expire one booking: refund the customer, void escrow, record the trail.
 *
 * @returns {{ expired: boolean, reason?: string, refundId?: string, amount?: number, manual?: boolean }}
 */
export async function expireBooking(bookingId, { now = new Date(), db = defaultDb, execute = executeRefund, env = process.env } = {}) {
  // Gate at the mutation entry point, not only in the worker: anything that
  // reaches this function is about to refund a customer, whether it arrived
  // from the scheduler, a script or a console. One check, closest to the write.
  if (!isExpiryEnabled(env)) {
    return { expired: false, reason: `disabled — set ${EXPIRY_FLAG}=true to arm`, disabled: true };
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { payments: true, escrow: true, consumer: true },
  });

  // The idempotency guard runs FIRST, before the eligibility checks.
  //
  // Expiring flips paymentStatus to `refunded`, which would itself make a second
  // call ineligible — but only as a side effect. Checking the marker first means
  // the guard is the thing actually preventing a duplicate refund, and the
  // reason returned says so, rather than reporting a downstream symptom.
  const prior = await alreadyExpired(bookingId, { db });
  if (prior) return { expired: false, reason: 'already expired', refundId: prior.id };

  const reason = ineligibleReason(booking, now);
  if (reason) return { expired: false, reason };

  const amount = round2(booking.escrow?.grossAmount ?? booking.price);
  if (!(amount > 0)) return { expired: false, reason: 'nothing to refund' };

  const refund = await db.refundRequest.create({
    data: {
      bookingId: booking.id,
      consumerId: booking.consumerId,
      originalAmount: amount,
      refundAmount: amount,
      // Full refund: the customer received no service at all, so there is no
      // cancellation tier to apply and no partner liability to apportion.
      refundType: 'full',
      reason: 'No partner was assigned within 72 hours of payment. Automatically refunded.',
      status: 'approved',
      isAutoApproved: true,
      policyApplied: EXPIRY_POLICY,
      liableParty: 'platform',
      partnerLiabilityAmount: 0,
    },
  });

  // executeRefund owns the money: it reverses the gateway charge where the
  // provider supports it, marks `manual` where it does not (Billplz), voids the
  // escrow row, and issues a credit note against any tax invoice.
  // `execute` is injectable for the same reason `credit` is in escrow/release.js:
  // the refund path writes through its own prisma import, so a test cannot
  // otherwise keep it off a real database.
  const executed = await execute({ ...refund, status: 'approved' });

  // Belt and braces: the booking itself must not stay "pending" forever.
  await db.booking.update({
    where: { id: booking.id },
    data: {
      status: 'cancelled',
      paymentStatus: 'refunded',
      lifecycle: [
        ...(Array.isArray(booking.lifecycle) ? booking.lifecycle : []),
        { status: 'cancelled', at: now.toISOString(), by: 'system:unassigned-expiry' },
      ],
    },
  });

  return {
    expired: true,
    bookingId: booking.id,
    refundId: refund.id,
    amount,
    manual: executed?.refundMethod === 'manual',
  };
}

/**
 * Refunds that are recorded but whose money has not actually moved — the
 * operator queue created by Billplz having no refund API.
 */
export async function listPendingManualRefunds({ db = defaultDb } = {}) {
  return db.refundRequest.findMany({
    where: { refundMethod: 'manual', status: { notIn: ['completed', 'cancelled'] } },
    include: { booking: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * One sweep. A single failure never stops the batch.
 *
 * When the flag is off this still runs the QUERY and reports what it found, but
 * writes nothing — the report is the useful half while the worker is parked,
 * and it is how the reconciliation dry runs are produced.
 */
export async function runExpirySweep({ now = new Date(), db = defaultDb, execute = executeRefund, env = process.env } = {}) {
  const enabled = isExpiryEnabled(env);
  const due = await findExpiredUnassigned({ now, db });

  // Report-only. Nothing below this branch touches the database.
  if (!enabled) {
    return {
      enabled: false,
      dryRun: true,
      checked: due.length,
      expired: 0,
      totalAmount: 0,
      needingManualAction: 0,
      failed: [],
      wouldExpire: due.map((b) => ({
        bookingId: b.id,
        amount: round2(b.escrow?.grossAmount ?? b.price),
        paidAt: paidAt(b),
        expiresAt: expiresAt(b),
      })),
    };
  }

  const expired = [];
  const failed = [];

  for (const booking of due) {
    try {
      const result = await expireBooking(booking.id, { now, db, execute, env });
      if (result.expired) expired.push(result);
    } catch (err) {
      failed.push({ bookingId: booking.id, error: err?.message || String(err) });
      console.error(`[expiry] failed for ${booking.id}:`, err?.message || err);
    }
  }

  return {
    enabled: true,
    dryRun: false,
    checked: due.length,
    expired: expired.length,
    totalAmount: round2(expired.reduce((s, r) => s + r.amount, 0)),
    needingManualAction: expired.filter((r) => r.manual).length,
    failed,
  };
}
