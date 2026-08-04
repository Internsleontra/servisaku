// Unit tests for Class W action cards — `node --test`.
// The state machine and validation are pure; the DB-facing functions are tested
// against a fake client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_TYPES, STATUS, TTL_MINUTES,
  validateProposal, buildSummary, expiryFrom, isExpired, canConfirm, toCard,
  pausedReason, isKnownType,
  mintAction, loadOwnedAction, settleAction, expireStaleActions,
} from '../actions.js';

const NOW = new Date('2026-08-02T10:00:00+08:00');
const at = (mins) => new Date(NOW.getTime() + mins * 60_000);

const card = (o = {}) => ({
  id: 'act_1', userId: 'u1', type: 'job_accept', payload: { bookingId: 'b1' },
  summary: 'Accept', destructive: false, status: STATUS.PENDING,
  expiresAt: at(TTL_MINUTES), resultRef: null, ...o,
});

// ── The safety model ─────────────────────────────────────────────────────────

test('every action type routes to an EXISTING endpoint, never a direct write', () => {
  // The chat layer must not reimplement authorisation, validation or audit.
  for (const [type, def] of Object.entries(ACTION_TYPES)) {
    assert.ok(def.endpoint?.path?.startsWith('/api/'), `${type} has no API endpoint`);
    assert.ok(['POST', 'PATCH', 'PUT', 'DELETE'].includes(def.endpoint.method), `${type} method`);
    assert.ok(Array.isArray(def.required) && def.required.length > 0, `${type} declares no required fields`);
    assert.ok(['consumer', 'partner'].includes(def.role), `${type} role`);
  }
});

test('an id the caller does not own is rejected before it reaches an endpoint', () => {
  // The check that makes a hallucinated or injected booking id inert.
  const r = validateProposal({
    type: 'job_accept', payload: { bookingId: 'someone-elses' }, role: 'partner', ownedIds: ['b1', 'b2'],
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'not_yours');

  const good = validateProposal({
    type: 'job_accept', payload: { bookingId: 'b2' }, role: 'partner', ownedIds: ['b1', 'b2'],
  });
  assert.equal(good.ok, true);
});

test('a consumer cannot propose a partner action, and vice versa', () => {
  assert.equal(validateProposal({ type: 'job_accept', payload: { bookingId: 'b1' }, role: 'consumer' }).error.code, 'wrong_audience');
  assert.equal(validateProposal({ type: 'book', payload: { serviceId: 's', scheduledStart: 'x', addressId: 'a' }, role: 'partner' }).error.code, 'wrong_audience');
});

test('an unknown action type is refused', () => {
  const r = validateProposal({ type: 'delete_everything', payload: {}, role: 'consumer' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'unknown_action_type');
  assert.equal(isKnownType('delete_everything'), false);
});

test('missing required fields are refused with the field named', () => {
  const r = validateProposal({ type: 'job_reject', payload: { bookingId: 'b1' }, role: 'partner' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'missing_field');
  assert.match(r.error.message, /reason/);
});

// ── The paused cancellation card ─────────────────────────────────────────────

test('the cancellation card is PAUSED and cannot be minted', () => {
  // docs/12-tc-conflict-report.md C-01/C-02: the refund figure it would show
  // comes from policy.js, which disagrees with T&C 8.1 and 8.2. Shipping it puts
  // a disputed number in front of a customer with a confirm button under it.
  assert.ok(pausedReason('cancel'));
  assert.match(pausedReason('cancel'), /docs\/12/);

  const r = validateProposal({ type: 'cancel', payload: { bookingId: 'b1' }, role: 'consumer', ownedIds: ['b1'] });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'action_paused');
});

test('no other action type is paused', () => {
  const paused = Object.keys(ACTION_TYPES).filter((t) => ACTION_TYPES[t].paused);
  assert.deepEqual(paused, ['cancel']);
});

// ── Summaries ────────────────────────────────────────────────────────────────

test('the summary states the consequence, including money where there is money', () => {
  const s = buildSummary('job_accept', { serviceName: 'Aircon Servicing', whenLabel: 'tomorrow 10:00 AM', earningsLabel: 'RM 64.00' });
  assert.match(s, /Aircon Servicing/);
  assert.match(s, /RM 64\.00/);
});

test('a malformed payload degrades to a generic summary rather than throwing', () => {
  // A broken summary must not break the turn.
  const original = ACTION_TYPES.book.summary;
  ACTION_TYPES.book.summary = () => { throw new Error('boom'); };
  try {
    assert.equal(buildSummary('book', {}), 'Confirm this book');
  } finally {
    ACTION_TYPES.book.summary = original;
  }
});

test('destructive actions are flagged so the UI can style them apart', () => {
  assert.equal(ACTION_TYPES.job_reject.destructive, true);
  assert.equal(ACTION_TYPES.cancel.destructive, true);
  assert.equal(ACTION_TYPES.job_accept.destructive, false);
});

// ── Expiry and confirmation ──────────────────────────────────────────────────

test('cards expire after the TTL', () => {
  assert.equal(expiryFrom(NOW).getTime(), at(TTL_MINUTES).getTime());
  assert.equal(isExpired(card(), at(TTL_MINUTES - 1)), false);
  assert.equal(isExpired(card(), at(TTL_MINUTES)), true);
  assert.equal(isExpired(card(), at(TTL_MINUTES + 5)), true);
});

test('a pending card inside its window can be confirmed', () => {
  assert.equal(canConfirm(card(), at(1)).ok, true);
});

test('a second confirm replays rather than executing twice', () => {
  // The card id is the idempotency key: a double tap, a retry after a dropped
  // connection and a replayed request must all execute exactly once.
  const v = canConfirm(card({ status: STATUS.CONFIRMED, resultRef: 'bk_9' }), at(1));
  assert.equal(v.ok, false);
  assert.equal(v.code, 'replay');
  assert.equal(v.resultRef, 'bk_9');
});

test('expired, declined and missing cards each refuse with their own reason', () => {
  assert.equal(canConfirm(card(), at(TTL_MINUTES + 1)).code, 'expired');
  assert.equal(canConfirm(card({ status: STATUS.EXPIRED }), at(1)).code, 'expired');
  assert.equal(canConfirm(card({ status: STATUS.DECLINED }), at(1)).code, 'declined');
  assert.equal(canConfirm(null).code, 'not_found');
});

test('a failed action may be retried once the cause clears', () => {
  assert.equal(canConfirm(card({ status: STATUS.FAILED }), at(1)).ok, true);
});

test('the card sent to the client never carries the payload', () => {
  // The payload stays server-side, so a tampered client cannot alter what it
  // confirms — it sends back an id and nothing else.
  const c = toCard(card({ payload: { bookingId: 'b1', secret: 'x' } }));
  assert.equal(c.payload, undefined);
  assert.equal(c.userId, undefined);
  assert.deepEqual(Object.keys(c).sort(), ['destructive', 'expires_at', 'id', 'status', 'summary', 'type']);
});

// ── DB-facing, against a fake client ─────────────────────────────────────────

function fakeDb(rows = []) {
  const store = [...rows];
  return {
    rows: store,
    chatbotAction: {
      create: async ({ data }) => { const r = { id: `act_${store.length + 1}`, ...data }; store.push(r); return r; },
      findUnique: async ({ where }) => store.find((r) => r.id === where.id) || null,
      update: async ({ where, data }) => {
        const r = store.find((x) => x.id === where.id);
        Object.assign(r, data);
        return r;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const r of store) {
          if (r.status === where.status && new Date(r.expiresAt) <= where.expiresAt.lte) {
            Object.assign(r, data); count += 1;
          }
        }
        return { count };
      },
    },
  };
}

test('mintAction stores the payload server-side and returns a card', async () => {
  const db = fakeDb();
  const { action, error } = await mintAction(db, {
    conversationId: 'c1', userId: 'u1', type: 'job_accept',
    payload: { bookingId: 'b1', serviceName: 'Aircon Servicing' },
    role: 'partner', ownedIds: ['b1'], now: NOW,
  });
  assert.equal(error, null);
  assert.equal(action.status, undefined); // default applied by the DB, not here
  assert.equal(action.payload.bookingId, 'b1');
  assert.equal(action.expiresAt.getTime(), at(TTL_MINUTES).getTime());
  assert.match(action.summary, /Aircon Servicing/);
});

test('mintAction returns an error rather than throwing on a bad proposal', async () => {
  // "I can't do that, and here's why" is a normal conversational turn.
  const db = fakeDb();
  const { action, error } = await mintAction(db, {
    conversationId: 'c1', userId: 'u1', type: 'cancel',
    payload: { bookingId: 'b1' }, role: 'consumer', ownedIds: ['b1'], now: NOW,
  });
  assert.equal(action, null);
  assert.equal(error.code, 'action_paused');
  assert.equal(db.rows.length, 0);
});

test('loadOwnedAction refuses another user’s card', async () => {
  const db = fakeDb([card({ id: 'act_1', userId: 'u1' })]);
  assert.ok(await loadOwnedAction(db, { id: 'act_1', userId: 'u1' }));
  assert.equal(await loadOwnedAction(db, { id: 'act_1', userId: 'u2' }), null);
  assert.equal(await loadOwnedAction(db, { id: 'nope', userId: 'u1' }), null);
});

test('settleAction stamps confirmedAt only on confirmation', async () => {
  const db = fakeDb([card({ id: 'act_1' }), card({ id: 'act_2' })]);
  const confirmed = await settleAction(db, { id: 'act_1', status: STATUS.CONFIRMED, resultRef: 'bk_7', now: NOW });
  assert.equal(confirmed.status, STATUS.CONFIRMED);
  assert.equal(confirmed.resultRef, 'bk_7');
  assert.equal(confirmed.confirmedAt.getTime(), NOW.getTime());

  const declined = await settleAction(db, { id: 'act_2', status: STATUS.DECLINED, now: NOW });
  assert.equal(declined.confirmedAt, undefined);
});

test('the expiry sweep is idempotent and leaves settled cards alone', async () => {
  const db = fakeDb([
    card({ id: 'a', status: STATUS.PENDING, expiresAt: at(-1) }),
    card({ id: 'b', status: STATUS.PENDING, expiresAt: at(30) }),
    card({ id: 'c', status: STATUS.CONFIRMED, expiresAt: at(-1) }),
  ]);
  assert.equal(await expireStaleActions(db, NOW), 1);
  // Safe to re-run after a restart, and safe on more than one instance.
  assert.equal(await expireStaleActions(db, NOW), 0);
  assert.equal(db.rows.find((r) => r.id === 'a').status, STATUS.EXPIRED);
  assert.equal(db.rows.find((r) => r.id === 'b').status, STATUS.PENDING);
  assert.equal(db.rows.find((r) => r.id === 'c').status, STATUS.CONFIRMED);
});
