// ─────────────────────────────────────────────────────────────────────────────
// Automatic escrow release — T&C clause 7.9(b).
//
//   > Escrowed funds … are released to the Partner, net of Platform Commission
//   > and any authorised deduction, twenty-four (24) hours after the Customer
//   > confirms completion, or forty-eight (48) hours after completion where the
//   > Customer neither confirms nor raises a dispute.
//
// Before this module release was manual only (a PATCH in routes/escrow.js), so
// partners were not paid on the timetable the contract commits to. Conflict
// C-04 in docs/12-tc-conflict-report.md tracks it.
//
// TWO MUTUALLY EXCLUSIVE BRANCHES. The clause is conditional, not a race:
//   · confirmed   → 24h after Booking.completionConfirmedAt, and the 48h
//                   no-response timer does NOT apply
//   · unconfirmed → 48h after Booking.completedAt
//
// Confirmation REPLACES the no-response timer rather than capping it. A
// customer who confirms 47 hours after completion is released at 71 hours, not
// 48 — the 48h branch exists for the case where the customer "neither confirms
// nor raises a dispute", so once they have confirmed it is no longer the
// governing rule. Reading it as "whichever fires first" would release funds
// before the 24-hour window the clause grants after a confirmation.
//
// TIMEZONE. Both are elapsed durations, not calendar boundaries, so they are
// timezone-invariant: 24 hours after an instant is the same instant everywhere.
// Asia/Kuala_Lumpur matters for how these moments are *displayed* and for
// day-boundary reporting, not for the arithmetic here. Doing this in local time
// would introduce a DST-style bug for no benefit. Timestamps are stored and
// compared in UTC.
//
// SUPPRESSION (clause 7.9(c)). Release is skipped when the booking is disputed,
// the escrow row is frozen, an open dispute exists, or no partner is assigned.
//
// IDEMPOTENCY. Two layers:
//   1. the state move is a conditional updateMany guarded on status='held', so
//      only one caller can win the transition even with two workers running
//   2. the ledger entries carry `escrow_release:<bookingId>` /
//      `earning:<bookingId>` unique keys, so a replay writes nothing
// ─────────────────────────────────────────────────────────────────────────────
import { prisma as defaultDb } from '../../db.js';
import { creditEarning } from '../wallet/index.js';
import { isCashBooking, ONLINE_SETTLED } from '../bookings/status.js';

export const HOURS = 60 * 60 * 1000;
/** 24h after the customer confirms — T&C 7.9(b) first branch. */
export const RELEASE_AFTER_CONFIRMATION_MS = 24 * HOURS;
/** 48h after completion with no confirmation and no dispute — second branch. */
export const RELEASE_AFTER_COMPLETION_MS = 48 * HOURS;

/** Dispute states that still suppress release. `resolved`/`closed` do not. */
const OPEN_DISPUTE_STATES = ['open', 'investigating', 'awaiting_response', 'escalated'];

/**
 * When does this booking's escrow become releasable?
 *
 * Conditional, per 7.9(b): a confirmation selects the 24h branch outright and
 * the 48h no-response branch is not consulted at all. The two are never
 * compared — see the header note on why "whichever is earlier" is the wrong
 * reading.
 *
 * @returns {Date|null} the governing due time, or null when neither anchor is
 *                      present (a completed booking predating `completedAt`).
 */
export function dueAt(booking) {
  if (booking?.completionConfirmedAt) {
    return new Date(new Date(booking.completionConfirmedAt).getTime() + RELEASE_AFTER_CONFIRMATION_MS);
  }
  if (booking?.completedAt) {
    return new Date(new Date(booking.completedAt).getTime() + RELEASE_AFTER_COMPLETION_MS);
  }
  return null;
}

/**
 * Why this escrow may not be paid out, IGNORING the clock.
 *
 * Split out from `suppressionReason` so the manual admin release can reuse the
 * exact same financial rules without inheriting the 24/48h timer: an admin
 * releasing early is a legitimate override, but "the customer never paid" is
 * not something an override may waive. One implementation, two callers — the
 * worker adds timing on top.
 */
export function payoutEligibilityReason(escrow, booking) {
  if (!escrow) return 'no escrow row';
  if (escrow.status !== 'held') return `escrow is "${escrow.status}", not held`;
  if (escrow.freezeReason) return `escrow frozen: ${escrow.freezeReason}`;
  if (!booking) return 'no booking';
  if (booking.status === 'disputed') return 'booking is disputed (7.9(c))';
  if (booking.status !== 'completed') return `booking is "${booking.status}", not completed`;
  if (!booking.partnerId) return 'no partner assigned';

  // SECOND DEFENCE — independent of the completion guard in bookings/status.js.
  //
  // The upstream guard should mean a completed booking is always funded, but
  // this worker moves money automatically and must not depend on that holding.
  // A future bug, a direct DB write, or historical rows completed before the
  // guard existed would otherwise be paid out.
  //
  // CASH is the sharper case. Every booking gets an EscrowLedger row at
  // creation, cash included, and it sits at `held` — so a cash booking looks
  // fundable to anything that only reads the escrow row. But cash never funds
  // escrow: the partner already holds the fare and owes commission back
  // (debitCommission). Releasing would pay them a second time.
  if (isCashBooking(booking)) {
    return 'cash booking — the partner already holds the fare; escrow was never funded';
  }
  if (booking.paymentStatus !== ONLINE_SETTLED) {
    return `payment is "${booking.paymentStatus}", not "${ONLINE_SETTLED}" — escrow was never funded`;
  }
  return null;
}

/**
 * Why this row is not releasable RIGHT NOW — eligibility plus the 7.9(b) timer.
 * This is what the automatic worker uses.
 */
export function suppressionReason(escrow, booking, now = new Date()) {
  const ineligible = payoutEligibilityReason(escrow, booking);
  if (ineligible) return ineligible;

  const due = dueAt(booking);
  if (!due) return 'no completion timestamp to measure from';
  if (due.getTime() > now.getTime()) return `not due until ${due.toISOString()}`;
  return null;
}

/**
 * Held escrow rows whose release timer has elapsed.
 *
 * The date filter is pushed into SQL (both indexed columns) so a tick does not
 * load every held row; the remaining conditions are cheap in memory.
 */
export async function findDueReleases({ now = new Date(), db = defaultDb } = {}) {
  const confirmedCutoff = new Date(now.getTime() - RELEASE_AFTER_CONFIRMATION_MS);
  const completedCutoff = new Date(now.getTime() - RELEASE_AFTER_COMPLETION_MS);

  const rows = await db.escrowLedger.findMany({
    where: {
      status: 'held',
      booking: {
        status: 'completed',
        partnerId: { not: null },
        // Only online-settled money can be released. Cash and unpaid rows are
        // excluded in SQL as well as in suppressionReason — belt and braces on
        // the query that decides who gets paid.
        paymentStatus: ONLINE_SETTLED,
        NOT: { paymentMethod: 'cash' },
        // The conditional rule, expressed in SQL. The second arm is guarded on
        // `completionConfirmedAt: null` — without it a booking confirmed at 47h
        // would be pre-selected by the 48h arm and only rejected later in
        // memory, which is both wasteful and easy to misread as intent.
        OR: [
          { completionConfirmedAt: { lte: confirmedCutoff } },
          { completionConfirmedAt: null, completedAt: { lte: completedCutoff } },
        ],
      },
    },
    include: { booking: { include: { partner: true } } },
  });

  // An open dispute suppresses release even when the booking status has not
  // moved — a customer can raise one against a completed job.
  const disputed = new Set(
    (await db.dispute.findMany({
      where: {
        bookingId: { in: rows.map((r) => r.bookingId) },
        status: { in: OPEN_DISPUTE_STATES },
      },
      select: { bookingId: true },
    })).map((d) => d.bookingId),
  );

  return rows.filter((r) => !disputed.has(r.bookingId) && !suppressionReason(r, r.booking, now));
}

/**
 * Release one booking's escrow and credit the partner.
 *
 * Safe to call repeatedly and from more than one worker: the state move is
 * conditional, and the wallet entries are keyed.
 *
 * @returns {{ released: boolean, reason?: string, amount?: number }}
 */
export async function releaseEscrow(bookingId, {
  now = new Date(), db = defaultDb, credit = creditEarning, ignoreTiming = false,
} = {}) {
  const escrow = await db.escrowLedger.findUnique({
    where: { bookingId },
    include: { booking: { include: { partner: true } } },
  });

  // `ignoreTiming` is the manual admin release: it waives the 24/48h clock only.
  // Every financial rule — funded, not cash, not disputed, not frozen, still
  // held, partner assigned — still applies, and cannot be overridden.
  const reason = ignoreTiming
    ? payoutEligibilityReason(escrow, escrow?.booking)
    : suppressionReason(escrow, escrow?.booking, now);
  if (reason) return { released: false, reason };

  const open = await db.dispute.count({
    where: { bookingId, status: { in: OPEN_DISPUTE_STATES } },
  });
  if (open > 0) return { released: false, reason: 'open dispute (7.9(c))' };

  // Conditional transition — whoever flips `held` first owns the release.
  const moved = await db.escrowLedger.updateMany({
    where: { bookingId, status: 'held' },
    data: { status: 'released', releasedAt: now },
  });
  if (moved.count === 0) return { released: false, reason: 'already released by another worker' };

  // Pay exactly what escrow recorded, not a fresh split of the current price at
  // the partner's current tier. See the note on creditEarning's `netPayout`.
  //
  // `credit` is injectable because the wallet ledger writes through its own
  // prisma import rather than the `db` passed here, so a test cannot otherwise
  // keep the whole path off a real database.
  try {
    await credit(escrow.booking, {
      partner: escrow.booking.partner,
      netPayout: escrow.partnerPayout,
    });
  } catch (err) {
    // The status move already succeeded, so a failed credit would otherwise
    // leave escrow `released` with no money in the partner's wallet — and the
    // `held` guard would stop any retry ever fixing it. Put the row back so the
    // next attempt can win the transition again, then let the error surface.
    await db.escrowLedger.updateMany({
      where: { bookingId, status: 'released' },
      data: { status: 'held', releasedAt: null },
    });
    throw err;
  }

  return { released: true, amount: escrow.partnerPayout, bookingId };
}

/**
 * One sweep. Returns a summary rather than throwing on a single failure — one
 * bad row must not stop the rest of the batch from being paid.
 */
export async function runReleaseSweep({ now = new Date(), db = defaultDb, credit = creditEarning } = {}) {
  const due = await findDueReleases({ now, db });
  const released = [];
  const failed = [];

  for (const row of due) {
    try {
      const result = await releaseEscrow(row.bookingId, { now, db, credit });
      if (result.released) released.push(result);
    } catch (err) {
      failed.push({ bookingId: row.bookingId, error: err?.message || String(err) });
      console.error(`[escrow] release failed for ${row.bookingId}:`, err?.message || err);
    }
  }

  return {
    checked: due.length,
    released: released.length,
    totalAmount: released.reduce((s, r) => s + r.amount, 0),
    failed,
  };
}
