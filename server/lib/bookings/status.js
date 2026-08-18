// ─────────────────────────────────────────────────────────────────────────────
// Booking status changes — the one place a booking's status may be decided.
//
// WHY THIS EXISTS. Status was written from four separate call sites, each doing
// its own thing: PATCH validated transitions and stamped lifecycle, `claim` and
// the dispute route wrote status with no lifecycle at all, and the admin branch
// of PATCH skipped transition validation entirely. The forensic audit found 7
// of 14 bookings carrying a non-pending status with an empty lifecycle as a
// direct result.
//
// More seriously, NOTHING checked payment before completion. A partner could
// drive a booking to `completed` while the customer had paid nothing, and with
// automatic escrow release now in place that becomes a payout of money the
// platform never collected.
//
// This module owns transition validation, the completion payment guard,
// lifecycle stamping and admin overrides. It builds the update payload and
// throws on refusal; callers keep their own `prisma.booking.update` so their
// `include` shapes and notifications are untouched.
//
// ─── The payment model, as it actually is ────────────────────────────────────
// ONLINE (fpx/duitnow/card/tng/grabpay/boost/applepay/googlepay)
//   markPaidAndEscrow() sets Payment.status='paid', Booking.paymentStatus=
//   'escrowed', creates the EscrowLedger row and credits the partner's PENDING
//   bucket. `escrowed` is therefore the settled state for online money — it is
//   the existing state the payment lifecycle already uses, not a new one.
//
// CASH
//   collectCash() creates a cash Payment, sets Booking.paymentStatus='paid' and
//   calls debitCommission() — the partner physically holds the fare, so
//   ServisAku's cut becomes a DEBT they owe. No escrow is funded, ever.
//   Completion is legitimately allowed before collection is recorded, because
//   the money changes hands on site.
//
// THE TRAP. An EscrowLedger row is created for EVERY booking at creation time,
// including cash ones, and sits at `held`. So a cash booking looks fundable to
// anything that only checks the escrow row. It must never be released: the
// partner already has the cash, and releasing would pay them twice.
// ─────────────────────────────────────────────────────────────────────────────
import { canTransition } from '../../../src/lib/bookingEngine.js';
import { ApiError } from '../access.js';

/** Booking.paymentStatus once an ONLINE payment has settled. */
export const ONLINE_SETTLED = 'escrowed';
/** Booking.paymentStatus once CASH has been collected and recorded. */
export const CASH_SETTLED = 'paid';
/** The one method whose money never passes through escrow. */
export const CASH_METHOD = 'cash';

/**
 * Is this booking's money collected the on-site way?
 *
 * Reads `paymentMethod`, falling back to the provider on any recorded payment —
 * a booking created before the method was chosen can still have been paid in
 * cash, and the guard should follow the money rather than the intention.
 */
export function isCashBooking(booking) {
  if (booking?.paymentMethod === CASH_METHOD) return true;
  return (booking?.payments || []).some((p) => p.method === CASH_METHOD || p.provider === CASH_METHOD);
}

/**
 * Why this booking may not be marked `completed`, or null when it may.
 *
 * Cash is allowed through unsettled because the partner collects at the door;
 * blocking it would make the cash flow impossible to complete. Online must be
 * `escrowed`, because that is the only state in which the customer's money is
 * actually held by the platform.
 */
export function completionPaymentReason(booking) {
  if (!booking) return 'no booking';

  if (isCashBooking(booking)) return null;

  const status = booking.paymentStatus;
  if (status === ONLINE_SETTLED) return null;

  if (!booking.paymentMethod) {
    return 'This booking has no payment method recorded, so completion cannot be verified. '
      + 'Set the payment method, or record the payment, before completing.';
  }
  return `Payment for this booking is "${status}". An online booking can only be completed once `
    + `payment has settled (paymentStatus "${ONLINE_SETTLED}").`;
}

/** True when this booking's escrow row represents real money the platform holds. */
export function escrowIsFunded(booking) {
  return !isCashBooking(booking) && booking?.paymentStatus === ONLINE_SETTLED;
}

/**
 * Validate a status change and build the update payload.
 *
 * @param {object}  booking     the current row (payments included where possible)
 * @param {string}  nextStatus  the status being requested
 * @param {object}  actor       { id, role } — who is doing this
 * @param {object} [options]
 * @param {boolean} [options.force]  admin override of transition rules
 * @param {string}  [options.reason] required when forcing
 * @param {Date}    [options.now]
 * @returns {object} a `data` patch for prisma.booking.update
 * @throws {ApiError} 400/403 with a reason the caller can surface verbatim
 */
export function buildStatusChange(booking, nextStatus, actor, options = {}) {
  const { force = false, reason = null, now = new Date() } = options;
  const isAdmin = ['admin', 'super_admin'].includes(actor?.role);

  if (force) {
    // Deliberate override. Allowed to break transition rules — an admin
    // untangling a stuck booking is a real need — but never silent, and never
    // available to anyone else.
    if (!isAdmin) throw new ApiError(403, 'Only an admin may force a status change');
    if (!reason || !String(reason).trim()) {
      throw new ApiError(400, 'A forced status change requires a reason');
    }
  } else if (!canTransition(booking.status, nextStatus)) {
    // Admins go through the same validation as everyone else unless they
    // explicitly ask to override. Previously they bypassed it invisibly.
    throw new ApiError(400, `Cannot change status from "${booking.status}" to "${nextStatus}"`);
  }

  // The payment guard is NOT waived by `force`. An override exists to correct a
  // stuck lifecycle, not to fabricate a payment — and completion is what makes
  // a booking eligible for automatic payout.
  if (nextStatus === 'completed') {
    const blocked = completionPaymentReason(booking);
    if (blocked) throw new ApiError(400, blocked);
  }

  const lifecycle = Array.isArray(booking.lifecycle) ? booking.lifecycle : [];
  const entry = {
    status: nextStatus,
    at: now.toISOString(),
    by: actor?.id ?? 'system',
  };
  if (force) {
    entry.forced = true;
    entry.from = booking.status;
    entry.reason = String(reason).trim();
    entry.byRole = actor?.role ?? null;
  }

  const data = {
    status: nextStatus,
    lifecycle: [...lifecycle, entry],
  };

  // Starts the 48h escrow release timer (T&C 7.9(b)). Only on the first
  // completion: completed → disputed → completed must not restart the clock.
  if (nextStatus === 'completed' && !booking.completedAt) {
    data.completedAt = now;
  }

  return data;
}
