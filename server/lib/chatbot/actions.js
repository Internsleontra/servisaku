// ─────────────────────────────────────────────────────────────────────────────
// Class W actions — the assistant PROPOSES, the user CONFIRMS, the existing
// REST endpoint EXECUTES.
//
// THE POINT (docs/11-ai-chatbots.md §B2). The original engine deliberately had
// no state-mutating tools: "the worst outcome of a successful injection is a
// wrong answer, never a wrong action" (guardrails.js). Booking and job actions
// from chat would break that — unless the model is never the thing that acts.
//
//   model → proposes a type + params
//   server → validates against the CALLER'S OWN rows, mints a card, stores the
//            payload server-side
//   user  → taps a button
//   route → calls the existing endpoint with the user's own auth
//
// So an injected "cancel all my bookings" can, at absolute worst, produce a card
// a human then declines. The payload never leaves the server, so a tampered
// client cannot alter what it confirms — it sends back an id and nothing else.
//
// The card id is also the idempotency key: single-use, short TTL. A double tap,
// a retry after a dropped connection, and a replayed request all execute once.
//
// The registry and the state machine below are pure — no DB, no clock of their
// own — so every transition is unit testable.
// ─────────────────────────────────────────────────────────────────────────────

/** How long a proposed action stays confirmable. */
export const TTL_MINUTES = 10;

export const STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  FAILED: 'failed',
};

/**
 * Action types.
 *
 * `endpoint` names the EXISTING route a confirmation calls. Nothing here writes
 * to the database directly — that would reimplement authorisation, validation
 * and audit in the chat layer, which is exactly how policies drift apart.
 *
 * `paused` marks a type that must not be minted. It is not a feature flag: it
 * records that shipping this action would surface an unresolved T&C conflict to
 * a customer as a number they can act on.
 */
export const ACTION_TYPES = {
  book: {
    role: 'consumer',
    destructive: false,
    endpoint: { method: 'POST', path: '/api/bookings' },
    required: ['serviceId', 'scheduledStart', 'addressId'],
    summary: (p) => `Book ${p.serviceName || 'this service'} on ${p.scheduledLabel || 'the selected date'}`
      + (p.priceLabel ? ` — ${p.priceLabel}` : ''),
  },
  reschedule: {
    role: 'consumer',
    destructive: false,
    endpoint: { method: 'PATCH', path: '/api/bookings/:id' },
    required: ['bookingId', 'scheduledStart'],
    summary: (p) => `Move ${p.serviceName || 'your booking'} to ${p.scheduledLabel || 'the new time'}`
      + (p.feeLabel ? ` — ${p.feeLabel}` : ''),
  },
  cancel: {
    role: 'consumer',
    destructive: true,
    endpoint: { method: 'POST', path: '/api/refunds' },
    required: ['bookingId'],
    summary: (p) => `Cancel ${p.serviceName || 'your booking'}`
      + (p.refundLabel ? `, refund ${p.refundLabel}` : ''),
    // ── PAUSED ───────────────────────────────────────────────────────────────
    // docs/12-tc-conflict-report.md C-01/C-02: the refund the card would quote
    // comes from refunds/policy.js, which disagrees with T&C clauses 8.1 and 8.2.
    // Shipping this would put a disputed figure in front of a customer with a
    // confirm button under it. Unpause when the approval sheet in docs/12 is
    // signed off.
    paused: 'Cancellation refund amounts are under review — see docs/12-tc-conflict-report.md (C-01, C-02).',
  },
  job_accept: {
    role: 'partner',
    destructive: false,
    endpoint: { method: 'POST', path: '/api/bookings/:id/accept' },
    required: ['bookingId'],
    summary: (p) => `Accept ${p.serviceName || 'this job'}${p.whenLabel ? `, ${p.whenLabel}` : ''}`
      + (p.earningsLabel ? ` — you earn ${p.earningsLabel}` : ''),
  },
  job_reject: {
    role: 'partner',
    destructive: true,
    endpoint: { method: 'POST', path: '/api/bookings/:id/reject' },
    required: ['bookingId', 'reason'],
    summary: (p) => `Decline ${p.serviceName || 'this job'}${p.whenLabel ? `, ${p.whenLabel}` : ''}`,
  },
  job_start: {
    role: 'partner',
    destructive: false,
    endpoint: { method: 'PATCH', path: '/api/bookings/:id/status' },
    required: ['bookingId'],
    summary: (p) => `Start ${p.serviceName || 'this job'}${p.addressLabel ? ` at ${p.addressLabel}` : ''}`,
  },
  job_complete: {
    role: 'partner',
    destructive: false,
    endpoint: { method: 'PATCH', path: '/api/bookings/:id/status' },
    required: ['bookingId'],
    summary: (p) => `Mark ${p.serviceName || 'this job'} complete`
      + (p.earningsLabel ? ` — ${p.earningsLabel}` : ''),
  },
  settle_commission: {
    role: 'partner',
    destructive: false,
    endpoint: { method: 'POST', path: '/api/wallet/settlements/:id/pay-from-balance' },
    required: ['settlementId'],
    summary: (p) => `Settle ${p.amountLabel || 'your outstanding commission'} from your available balance`,
  },
};

export const isKnownType = (type) => Object.prototype.hasOwnProperty.call(ACTION_TYPES, type);

/** Why a type cannot be minted right now, or null if it can. */
export function pausedReason(type) {
  return ACTION_TYPES[type]?.paused || null;
}

/**
 * Validate a proposed action before it becomes a card.
 *
 * This runs on the SERVER against the caller's identity — it is not a schema
 * check on model output alone. The `ownedIds` argument carries the ids the
 * caller actually owns, resolved by a read tool; an id the model produced that
 * is not in that set is rejected here rather than reaching an endpoint.
 *
 * @param {object} params
 * @param {string} params.type
 * @param {object} params.payload
 * @param {string} params.role       consumer | partner
 * @param {string[]} [params.ownedIds]  ids the caller owns (bookings, settlements)
 * @returns {{ ok: boolean, error: { code, message }|null }}
 */
export function validateProposal({ type, payload = {}, role, ownedIds = null }) {
  const fail = (code, message) => ({ ok: false, error: { code, message } });

  if (!isKnownType(type)) return fail('unknown_action_type', `"${type}" is not an action the assistant can propose`);
  const def = ACTION_TYPES[type];

  const paused = pausedReason(type);
  if (paused) return fail('action_paused', paused);

  if (def.role !== role) return fail('wrong_audience', `A ${role} cannot perform "${type}"`);

  for (const field of def.required) {
    const v = payload[field];
    if (v === undefined || v === null || v === '') {
      return fail('missing_field', `"${type}" needs ${field}`);
    }
  }

  // The identity check that makes the whole model safe. A booking id the caller
  // does not own never reaches the endpoint, so a hallucinated or injected id is
  // inert rather than merely unauthorised-at-the-last-moment.
  if (Array.isArray(ownedIds)) {
    const subject = payload.bookingId || payload.settlementId;
    if (subject && !ownedIds.includes(subject)) {
      return fail('not_yours', 'I can only act on items on your own account');
    }
  }

  return { ok: true, error: null };
}

/** The one-line consequence shown above the confirm button. */
export function buildSummary(type, payload = {}) {
  const def = ACTION_TYPES[type];
  if (!def) return '';
  try {
    return def.summary(payload);
  } catch {
    // A malformed payload must not break the turn — a generic summary is worse
    // than a specific one, but far better than a 500 in a support conversation.
    return `Confirm this ${type.replace(/_/g, ' ')}`;
  }
}

export const expiryFrom = (now = new Date(), minutes = TTL_MINUTES) => new Date(now.getTime() + minutes * 60_000);

export const isExpired = (action, now = new Date()) => new Date(action.expiresAt).getTime() <= now.getTime();

/**
 * May this card still be confirmed?
 *
 * A confirmed card returns `replay` rather than an error: the user tapped twice,
 * or the network retried, and the honest answer is "already done" with the
 * original result — not a second execution and not a failure message.
 */
export function canConfirm(action, now = new Date()) {
  if (!action) return { ok: false, code: 'not_found', message: 'That action has expired or was never created' };
  if (action.status === STATUS.CONFIRMED) {
    return { ok: false, code: 'replay', message: 'Already done', resultRef: action.resultRef };
  }
  if (action.status === STATUS.DECLINED) return { ok: false, code: 'declined', message: 'That action was declined' };
  if (action.status === STATUS.EXPIRED) return { ok: false, code: 'expired', message: 'That action expired — ask me again and I will set it up fresh' };
  if (action.status === STATUS.FAILED) return { ok: true, code: null, message: null }; // a failure may be retried once the cause clears
  if (isExpired(action, now)) return { ok: false, code: 'expired', message: 'That action expired — ask me again and I will set it up fresh' };
  return { ok: true, code: null, message: null };
}

/** The card shape the client renders. Never includes the payload. */
export function toCard(action) {
  return {
    id: action.id,
    type: action.type,
    summary: action.summary,
    destructive: Boolean(action.destructive),
    expires_at: action.expiresAt,
    status: action.status,
  };
}

// ─── Database-facing ─────────────────────────────────────────────────────────
// Kept below the pure section and dependency-injected so the state machine above
// stays testable without a database.

/**
 * Mint a card. Returns `{ action }` or `{ error }` — never throws for a
 * validation problem, because "I can't do that, but here's why" is a normal
 * conversational turn rather than an exception.
 */
export async function mintAction(db, {
  conversationId, userId, type, payload, role, ownedIds, now = new Date(),
}) {
  const check = validateProposal({ type, payload, role, ownedIds });
  if (!check.ok) return { action: null, error: check.error };

  const def = ACTION_TYPES[type];
  const action = await db.chatbotAction.create({
    data: {
      conversationId,
      userId,
      type,
      payload,
      summary: buildSummary(type, payload),
      destructive: Boolean(def.destructive),
      expiresAt: expiryFrom(now),
    },
  });
  return { action, error: null };
}

/**
 * Load a card for confirmation, scoped to its owner.
 * Ownership is checked here rather than trusted from the route, so every caller
 * gets the same rule.
 */
export async function loadOwnedAction(db, { id, userId }) {
  const action = await db.chatbotAction.findUnique({ where: { id } });
  if (!action || action.userId !== userId) return null;
  return action;
}

/** Record the outcome of a confirmation attempt. */
export async function settleAction(db, { id, status, resultRef = null, error = null, now = new Date() }) {
  return db.chatbotAction.update({
    where: { id },
    data: {
      status,
      resultRef,
      error,
      ...(status === STATUS.CONFIRMED ? { confirmedAt: now } : {}),
    },
  });
}

/**
 * Sweep expired cards. Idempotent and safe to run on more than one instance —
 * the status filter means a row already swept is not touched again.
 */
export async function expireStaleActions(db, now = new Date()) {
  const { count } = await db.chatbotAction.updateMany({
    where: { status: STATUS.PENDING, expiresAt: { lte: now } },
    data: { status: STATUS.EXPIRED },
  });
  return count;
}
