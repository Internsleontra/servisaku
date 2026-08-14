/**
 * Consumer-facing status vocabulary — DISPLAY LAYER ONLY.
 *
 * Approved 2026-08-07. Translates the product's stored status values into the
 * design system's customer vocabulary. Nothing here changes the database, the
 * API, `STATUS_TRANSITIONS`, or the partner app.
 *
 * Why this lives apart from `STATUS_META` in bookingEngine.js: that map is
 * shared with the partner surfaces (`ExecutionTimeline`, `PartnerJobScreen`),
 * where "Assigned" and "Accepted" are meaningfully different to a pro. Editing
 * it would have silently rewritten partner copy. This map is consumer-only.
 *
 * `Arrived` is deliberately preserved as its own state rather than folded into
 * "On the way" — the product tracks it and customers see it. The design system
 * was extended to add `arrived` rather than the product flattened to match.
 */
export const CONSUMER_STATUS_LABEL = {
  pending: 'Requested',
  requested: 'Requested',
  assigned: 'Confirmed',
  accepted: 'Confirmed',
  confirmed: 'Confirmed',
  en_route: 'On the way',
  arrived: 'Arrived',
  started: 'In progress',
  in_progress: 'In progress',
  completed: 'Completed',
  paid: 'Paid',
  escrowed: 'In escrow',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  disputed: 'Disputed',
};

export const labelFor = (status) => CONSUMER_STATUS_LABEL[status] || 'Requested';

/**
 * Timeline nodes for the consumer booking progress stepper.
 *
 * `assigned` and `accepted` both render as "Confirmed", so they are shown as a
 * SINGLE node — two adjacent steps carrying the same word reads as a bug. The
 * underlying statuses are untouched; `match` lists which stored values light
 * the node up.
 *
 * ⚠️ This merge is a rendering decision, not an approved one. Flagged in the
 * final report for confirmation.
 */
export const CONSUMER_TIMELINE = [
  { id: 'requested', label: 'Requested', match: ['pending'] },
  { id: 'confirmed', label: 'Confirmed', match: ['assigned', 'accepted', 'confirmed'] },
  { id: 'en_route', label: 'On the way', match: ['en_route'] },
  { id: 'arrived', label: 'Arrived', match: ['arrived'] },
  { id: 'in_progress', label: 'In progress', match: ['started', 'in_progress'] },
  { id: 'completed', label: 'Completed', match: ['completed'] },
];
