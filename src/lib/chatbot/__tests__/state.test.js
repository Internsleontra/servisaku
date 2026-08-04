// Unit tests for the chat widget's state machine — `node --test`.
// Pure: no React, no DOM, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reducer, initialState, STATUS, toMessage, groupByDay,
  isComposerDisabled, visibleQuickReplies, isActionable, shouldOfferHuman,
  shouldVirtualise, VIRTUALISE_AFTER, TYPING_DELAY_MS,
} from '../state.js';

const run = (actions, from = initialState) => actions.reduce(reducer, from);

const replyFixture = (over = {}) => ({
  reply: 'Here is the answer.',
  sources: ['booking_how_to'],
  locale: 'en',
  can_escalate: true,
  escalate_suggested: false,
  quick_replies: null,
  action_card: null,
  cards: null,
  tree: null,
  ...over,
});

// ── Sending ──────────────────────────────────────────────────────────────────

test('a sent message appears immediately, marked pending', () => {
  // Optimistic: waiting for a round trip before showing your own message makes
  // the widget feel broken on a slow connection.
  const s = run([
    { type: 'SESSION_STARTED', conversationId: 'c1', greeting: 'Hi!' },
    { type: 'DRAFT_CHANGED', value: 'how do I book' },
    { type: 'SEND_STARTED', localId: 'l1', content: 'how do I book' },
  ]);
  assert.equal(s.status, STATUS.SENDING);
  assert.equal(s.messages.length, 2);
  assert.equal(s.messages[1].sender, 'user');
  assert.equal(s.messages[1].pending, true);
  assert.equal(s.draft, '', 'the composer clears on send');
});

test('the FIRST message survives the lazy session start', () => {
  // Regression: the session is created on the first send, so SESSION_STARTED
  // arrives AFTER the optimistic user message. Replacing the list there deleted
  // the first thing the customer ever said — the transcript went straight from
  // greeting to answer with the question missing.
  const s = run([
    { type: 'SEND_STARTED', localId: 'l1', content: 'my payment failed' },
    { type: 'SESSION_STARTED', conversationId: 'c1', greeting: 'Hi!' },
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ reply: 'Which payment method?' }) },
  ]);
  assert.deepEqual(s.messages.map((m) => m.content), ['Hi!', 'my payment failed', 'Which payment method?']);
});

test('the lazy session start does not cancel the in-flight send', () => {
  // Setting IDLE here would drop the typing indicator while the reply is still
  // in the air.
  const s = run([
    { type: 'SEND_STARTED', localId: 'l1', content: 'hi' },
    { type: 'SESSION_STARTED', conversationId: 'c1', greeting: 'Hi!' },
  ]);
  assert.equal(s.status, STATUS.SENDING);
});

test('a reply resolves the pending message and appends the answer', () => {
  const s = run([
    { type: 'SEND_STARTED', localId: 'l1', content: 'hi' },
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture() },
  ]);
  assert.equal(s.status, STATUS.IDLE);
  assert.equal(s.messages[0].pending, false);
  assert.equal(s.messages[1].sender, 'bot');
  assert.deepEqual(s.messages[1].sources, ['booking_how_to']);
});

test('a failure marks the message rather than dropping it', () => {
  // The text the user typed must not vanish — they would have to retype it.
  const s = run([
    { type: 'SEND_STARTED', localId: 'l1', content: 'hi' },
    { type: 'SEND_FAILED', localId: 'l1', error: 'Network error' },
  ]);
  assert.equal(s.status, STATUS.ERROR);
  assert.equal(s.messages[0].failed, true);
  assert.equal(s.messages[0].content, 'hi');
  assert.equal(s.error, 'Network error');
});

test('clearing an error returns to idle without touching the transcript', () => {
  const s = run([
    { type: 'SEND_STARTED', localId: 'l1', content: 'hi' },
    { type: 'SEND_FAILED', localId: 'l1', error: 'boom' },
    { type: 'ERROR_CLEARED' },
  ]);
  assert.equal(s.status, STATUS.IDLE);
  assert.equal(s.error, null);
  assert.equal(s.messages.length, 1);
});

// ── Quick replies ────────────────────────────────────────────────────────────

test('typing removes the quick replies', () => {
  // Leaving them up implies the typed answer will be ignored.
  const s = run([
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ quick_replies: [{ value: 'yes', label: 'Yes' }] }) },
    { type: 'DRAFT_CHANGED', value: 'actually, something else' },
  ]);
  assert.deepEqual(s.quickReplies, []);
});

test('clearing the draft does not resurrect them', () => {
  const s = run([
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ quick_replies: [{ value: 'yes', label: 'Yes' }] }) },
    { type: 'DRAFT_CHANGED', value: 'x' },
    { type: 'DRAFT_CHANGED', value: '' },
  ]);
  assert.deepEqual(s.quickReplies, []);
});

test('quick replies are hidden while a send is in flight', () => {
  const s = run([
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ quick_replies: [{ value: 'yes', label: 'Yes' }] }) },
    { type: 'SEND_STARTED', localId: 'l2', content: 'yes' },
  ]);
  assert.deepEqual(visibleQuickReplies(s), []);
});

test('a tree turn carries its progress so the end is visible', () => {
  const s = run([{
    type: 'SEND_SUCCEEDED',
    localId: 'l1',
    reply: replyFixture({ tree: { id: 'payment_failed', node: 'deducted', step: 2, of: 3 } }),
  }]);
  assert.equal(s.tree.step, 2);
  assert.equal(s.tree.of, 3);
});

// ── Action cards ─────────────────────────────────────────────────────────────

const card = (over = {}) => ({ id: 'act_1', type: 'job_accept', summary: 'Accept this job', destructive: false, status: 'pending', ...over });

test('a pending action card blocks a second one', () => {
  // Two live confirm buttons in a money conversation is how the wrong thing gets
  // tapped.
  const s = run([
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ action_card: card() }) },
    { type: 'SEND_SUCCEEDED', localId: 'l2', reply: replyFixture({ action_card: card({ id: 'act_2', summary: 'Different' }) }) },
  ]);
  assert.equal(s.actionCard.id, 'act_1');
  assert.equal(s.actionCard.summary, 'Accept this job');
});

test('once settled, the next card is accepted', () => {
  const s = run([
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ action_card: card() }) },
    { type: 'ACTION_SETTLED', status: 'confirmed', message: 'Done.' },
    { type: 'SEND_SUCCEEDED', localId: 'l2', reply: replyFixture({ action_card: card({ id: 'act_2' }) }) },
  ]);
  assert.equal(s.actionCard.id, 'act_2');
});

test('a settled card is no longer actionable', () => {
  const pending = run([{ type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ action_card: card() }) }]);
  assert.equal(isActionable(pending), true);

  const settled = reducer(pending, { type: 'ACTION_SETTLED', status: 'declined' });
  assert.equal(isActionable(settled), false);
});

test('confirming a card appends the outcome to the transcript', () => {
  const s = run([
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ action_card: card() }) },
    { type: 'ACTION_SETTLED', status: 'confirmed', message: 'Job accepted.' },
  ]);
  assert.equal(s.messages[s.messages.length - 1].content, 'Job accepted.');
});

// ── Escalation ───────────────────────────────────────────────────────────────

test('escalation locks the composer and clears anything actionable', () => {
  // The ticket is the thread now — a message typed here would go nowhere.
  const s = run([
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ action_card: card(), quick_replies: [{ value: 'yes', label: 'Yes' }] }) },
    { type: 'ESCALATED', reference: 'TKT-3F9A2B', ticketId: 't1', message: 'We have created ticket #TKT-3F9A2B.' },
  ]);
  assert.equal(s.status, STATUS.ESCALATED);
  assert.equal(isComposerDisabled(s), true);
  assert.equal(s.actionCard, null);
  assert.deepEqual(s.quickReplies, []);
  assert.equal(s.ticket.reference, 'TKT-3F9A2B');
  assert.equal(s.messages[s.messages.length - 1].sender, 'system');
});

test('a human is offered when the bot suggests it, and never twice', () => {
  const suggested = run([{ type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ escalate_suggested: true }) }]);
  assert.equal(shouldOfferHuman(suggested), true);

  const already = reducer(suggested, { type: 'ESCALATED', reference: 'TKT-1', ticketId: 't', message: 'done' });
  assert.equal(shouldOfferHuman(already), false);
});

test('a human is offered after a send failure too', () => {
  const s = run([
    { type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture() },
    { type: 'SEND_STARTED', localId: 'l2', content: 'x' },
    { type: 'SEND_FAILED', localId: 'l2', error: 'offline' },
  ]);
  assert.equal(shouldOfferHuman(s), true);
});

test('an anonymous visitor is not offered a ticket they cannot have', () => {
  const s = run([{ type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture({ can_escalate: false, escalate_suggested: true }) }]);
  assert.equal(shouldOfferHuman(s), false);
});

// ── Attachments ──────────────────────────────────────────────────────────────

test('an attachment shows as uploading, then becomes a turn', () => {
  const s = run([
    { type: 'ATTACHMENT_SELECTED', attachment: { name: 'leak.jpg', previewUrl: 'blob:x' } },
  ]);
  assert.equal(s.attachment.uploading, true);

  const done = reducer(s, {
    type: 'ATTACHMENT_CLASSIFIED',
    attachment: { url: 'https://cdn/leak.jpg', classifiedAs: 'ac_water_leak' },
    prompt: 'That looks like a blocked drain line.',
    quickReplies: [{ value: 'yes', label: 'Yes' }],
  });
  assert.equal(done.attachment, null);
  assert.equal(done.messages.length, 2);
  assert.equal(done.messages[0].attachments[0].classifiedAs, 'ac_water_leak');
  assert.equal(done.messages[1].sender, 'bot');
});

test('a cancelled attachment leaves no trace', () => {
  const s = run([
    { type: 'ATTACHMENT_SELECTED', attachment: { name: 'x.jpg' } },
    { type: 'ATTACHMENT_CLEARED' },
  ]);
  assert.equal(s.attachment, null);
  assert.equal(s.messages.length, 0);
});

// ── History and presentation ─────────────────────────────────────────────────

test('history replays into the same shape as a live turn', () => {
  const s = run([{
    type: 'HISTORY_LOADED',
    messages: [
      { id: 'm1', sender: 'user', content: 'hi', created_date: '2026-08-01T10:00:00Z' },
      { id: 'm2', sender: 'bot', content: 'hello', created_date: '2026-08-01T10:00:01Z' },
    ],
  }]);
  assert.equal(s.messages.length, 2);
  assert.equal(s.messages[0].pending, false);
  assert.equal(s.messages[1].sender, 'bot');
});

test('loading an escalated conversation opens it read-only', () => {
  const s = run([{ type: 'HISTORY_LOADED', messages: [], escalated: true }]);
  assert.equal(isComposerDisabled(s), true);
});

test('messages group by calendar day for separators', () => {
  const groups = groupByDay([
    toMessage({ content: 'a', createdAt: '2026-08-01T10:00:00Z' }),
    toMessage({ content: 'b', createdAt: '2026-08-01T18:00:00Z' }),
    toMessage({ content: 'c', createdAt: '2026-08-02T09:00:00Z' }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].messages.length, 2);
  assert.equal(groups[1].day, '2026-08-02');
});

test('a long transcript is virtualised', () => {
  const s = { ...initialState, messages: new Array(VIRTUALISE_AFTER + 1).fill(toMessage({ content: 'x' })) };
  assert.equal(shouldVirtualise(s), true);
  assert.equal(shouldVirtualise(initialState), false);
});

test('the typing indicator is delayed, not instant', () => {
  // An instant indicator on a cached answer reads as theatre.
  assert.ok(TYPING_DELAY_MS >= 300);
});

test('a reset keeps the chosen language', () => {
  const s = run([
    { type: 'LOCALE_CHANGED', locale: 'ms' },
    { type: 'SEND_STARTED', localId: 'l1', content: 'hi' },
    { type: 'RESET' },
  ]);
  assert.equal(s.locale, 'ms');
  assert.equal(s.messages.length, 0);
  assert.equal(s.conversationId, null);
});

test('an unknown action leaves state untouched', () => {
  const s = run([{ type: 'SEND_SUCCEEDED', localId: 'l1', reply: replyFixture() }]);
  assert.equal(reducer(s, { type: 'NOT_A_REAL_ACTION' }), s);
});
