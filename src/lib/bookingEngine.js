// ServisAku booking status state machine + post-booking shared constants.
//
// SERVER-SAFE. This module is imported by the Express server
// (server/routes/bookings.js -> canTransition, server/routes/catalog.js ->
// SLOT_GROUPS), so it must contain DOMAIN DATA ONLY — no React, no icon
// components, no browser APIs. Status glyphs live in src/lib/statusIcons.js,
// keyed by the same status ids.
// (Pricing/quoting now lives entirely in the dynamic engine: server-side
// `dynamicPricing.js` via POST /api/bookings/calculate.)

export const STATUS_TRANSITIONS = {
  // `accepted` is reachable directly from `pending` because of the open job
  // pool: POST /api/bookings/:id/claim lets the first partner to accept take an
  // unassigned booking, skipping `assigned` (which is dispatch assigning someone
  // TO a partner). The table omitted it, so routing that endpoint through the
  // shared status helper would have rejected every claim.
  pending:    ['assigned', 'accepted', 'cancelled'],
  assigned:   ['accepted', 'cancelled'],
  accepted:   ['en_route', 'cancelled'],
  en_route:   ['arrived', 'cancelled'],
  arrived:    ['started', 'disputed'],
  started:    ['completed', 'disputed'],
  completed:  ['disputed'],
  cancelled:  [],
  disputed:   ['completed', 'cancelled'],
};

export const STATUS_META = {
  pending:   { label: 'Pending',     color: 'amber',   step: 0 },
  assigned:  { label: 'Assigned',    color: 'blue',    step: 1 },
  accepted:  { label: 'Accepted',    color: 'indigo',  step: 2 },
  en_route:  { label: 'En Route',    color: 'violet',  step: 3 },
  arrived:   { label: 'Arrived',     color: 'primary', step: 4 },
  started:   { label: 'In Progress', color: 'primary', step: 5 },
  completed: { label: 'Completed',   color: 'emerald', step: 6 },
  cancelled: { label: 'Cancelled',   color: 'red',     step: -1 },
  disputed:  { label: 'Disputed',    color: 'orange',  step: -1 },
};

export const SLOT_GROUPS = {
  Morning:   { label: 'Morning',   sub: '8 AM – 12 PM', slots: ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM'] },
  Afternoon: { label: 'Afternoon', sub: '12 PM – 4 PM', slots: ['12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM'] },
  Evening:   { label: 'Evening',   sub: '4 PM – 7 PM', slots: ['4:00 PM', '5:00 PM', '6:00 PM'] },
};

export function canTransition(from, to) {
  return STATUS_TRANSITIONS[from]?.includes(to) || false;
}

export function isTerminal(status) {
  return ['completed', 'cancelled'].includes(status);
}

export function isRefundEligible(booking) {
  if (booking.status === 'cancelled' && booking.payment_status === 'paid') return true;
  const hoursUntilService = (new Date(booking.date) - new Date()) / 3600000;
  if (['pending', 'assigned'].includes(booking.status) && hoursUntilService > 4) return true;
  return false;
}

export function getNextStatuses(status) {
  return STATUS_TRANSITIONS[status] || [];
}

/**
 * Booking reference — design system format `#SA-2026-04471`.
 *
 * Was `FM-…`: FixMate, the product's previous name. Customers were being shown
 * a dead brand on every booking, invoice and support ticket.
 */
export function formatBookingRef(id) {
  return `#SA-${new Date().getFullYear()}-${id?.slice(-6).toUpperCase() || 'XXXXXX'}`;
}

export const PAYMENT_METHODS = [
  { id: 'fpx', label: 'FPX Online Banking', sub: 'Maybank, CIMB, Public Bank' },
  { id: 'tng', label: 'Touch n Go eWallet', sub: 'Instant payment' },
  { id: 'grabpay', label: 'GrabPay', sub: 'Pay with Grab credits' },
  { id: 'boost', label: 'Boost', sub: 'Cashback rewards' },
  { id: 'card', label: 'Credit / Debit Card', sub: 'Visa, Mastercard' },
  { id: 'cash', label: 'Cash on Service', sub: 'Pay at completion' },
];