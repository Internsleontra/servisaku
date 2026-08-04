/**
 * Chat widget state — a pure reducer.
 *
 * Deliberately free of React, `import.meta` and any `@/` alias so it can run
 * under plain node and be unit tested. Everything that decides *what the widget
 * shows* lives here; the hook and the components only render it and call the
 * API.
 *
 * The rules encoded below come from docs/11 §L3, and each is one that gets got
 * wrong when this logic is scattered through components:
 *
 *   • Quick replies disappear the moment the user types. Leaving them up implies
 *     the typed answer will be ignored.
 *   • A pending action card blocks a second one. Two live confirm buttons in a
 *     money conversation is how the wrong thing gets tapped.
 *   • The typing indicator waits 400 ms. Showing it instantly on a cached answer
 *     reads as theatre.
 *   • An escalated conversation is read-only. The ticket is the thread now.
 */

export const STATUS = {
  IDLE: 'idle',
  SENDING: 'sending',
  ESCALATED: 'escalated',
  ERROR: 'error',
};

/** Show the typing indicator only after this long — see docs/11 §L3. */
export const TYPING_DELAY_MS = 400;
/** Past this, tell the user we are still working rather than leaving a spinner. */
export const SLOW_REPLY_MS = 3000;

export const initialState = {
  conversationId: null,
  status: STATUS.IDLE,
  messages: [],
  quickReplies: [],
  actionCard: null,
  cards: [],
  tree: null, // { id, node, step, of }
  ticket: null, // { reference, id } once escalated
  canEscalate: false,
  locale: 'en',
  error: null,
  draft: '',
  attachment: null, // { name, previewUrl, uploading }
};

let seq = 0;
const localId = () => `local-${(seq += 1)}`;

/**
 * Normalise a server message into what the list renders.
 * History and live turns go through the same shape, so replaying a conversation
 * looks exactly like living through it.
 */
export function toMessage(raw, overrides = {}) {
  return {
    id: raw.id || localId(),
    sender: raw.sender || 'bot',
    content: raw.content ?? '',
    createdAt: raw.created_date || raw.createdAt || new Date().toISOString(),
    sources: raw.sources ?? null,
    attachments: raw.attachments ?? null,
    pending: false,
    failed: false,
    ...overrides,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return { ...initialState, locale: state.locale };

    case 'SESSION_STARTED':
      return {
        ...state,
        conversationId: action.conversationId,
        // Not IDLE: the session is created lazily on the first send, so this
        // lands mid-flight. Overwriting the status here would clear SENDING and
        // hide the typing indicator while the reply is still in the air.
        error: null,
        // PREPEND, never replace. The session starts *after* the optimistic user
        // message is already in the list, so replacing it deleted the first
        // thing the customer ever said.
        messages: action.greeting
          ? [toMessage({ sender: 'bot', content: action.greeting }), ...state.messages]
          : state.messages,
      };

    case 'HISTORY_LOADED':
      return {
        ...state,
        messages: (action.messages || []).map((m) => toMessage(m)),
        status: action.escalated ? STATUS.ESCALATED : STATUS.IDLE,
      };

    case 'DRAFT_CHANGED':
      return {
        ...state,
        draft: action.value,
        // Typing is an answer in itself: the chips are no longer what is being
        // responded to, so they go.
        quickReplies: action.value ? [] : state.quickReplies,
      };

    case 'SEND_STARTED': {
      const optimistic = toMessage(
        { sender: 'user', content: action.content, attachments: action.attachments },
        { id: action.localId, pending: true },
      );
      return {
        ...state,
        status: STATUS.SENDING,
        messages: [...state.messages, optimistic],
        draft: '',
        quickReplies: [],
        attachment: null,
        error: null,
      };
    }

    case 'SEND_SUCCEEDED': {
      const { reply } = action;
      const messages = state.messages.map((m) => (m.id === action.localId ? { ...m, pending: false } : m));
      return {
        ...state,
        status: reply.escalate_suggested && state.status === STATUS.ESCALATED
          ? STATUS.ESCALATED
          : STATUS.IDLE,
        messages: [
          ...messages,
          toMessage({ sender: 'bot', content: reply.reply, sources: reply.sources }),
        ],
        quickReplies: reply.quick_replies || [],
        // One live confirm button at a time. A second card while the first is
        // unanswered is how the wrong thing gets tapped.
        actionCard: state.actionCard?.status === 'pending' ? state.actionCard : (reply.action_card || null),
        cards: reply.cards || [],
        tree: reply.tree || null,
        locale: reply.locale || state.locale,
        canEscalate: Boolean(reply.can_escalate),
        escalateSuggested: Boolean(reply.escalate_suggested),
        error: null,
      };
    }

    case 'SEND_FAILED':
      return {
        ...state,
        status: STATUS.ERROR,
        messages: state.messages.map((m) => (m.id === action.localId ? { ...m, pending: false, failed: true } : m)),
        error: action.error || 'Message not sent',
      };

    case 'ATTACHMENT_SELECTED':
      return { ...state, attachment: { ...action.attachment, uploading: true } };

    case 'ATTACHMENT_CLEARED':
      return { ...state, attachment: null };

    case 'ATTACHMENT_CLASSIFIED':
      return {
        ...state,
        attachment: null,
        messages: [
          ...state.messages,
          toMessage({ sender: 'user', content: '', attachments: [action.attachment] }),
          toMessage({ sender: 'bot', content: action.prompt }),
        ],
        quickReplies: action.quickReplies || [],
        tree: action.tree || state.tree,
      };

    case 'ACTION_SETTLED':
      return {
        ...state,
        actionCard: state.actionCard ? { ...state.actionCard, status: action.status } : null,
        messages: action.message
          ? [...state.messages, toMessage({ sender: 'bot', content: action.message })]
          : state.messages,
      };

    case 'ESCALATED':
      return {
        ...state,
        status: STATUS.ESCALATED,
        ticket: { reference: action.reference, id: action.ticketId },
        quickReplies: [],
        actionCard: null,
        messages: [...state.messages, toMessage({ sender: 'system', content: action.message })],
      };

    case 'LOCALE_CHANGED':
      return { ...state, locale: action.locale };

    case 'ERROR_CLEARED':
      return { ...state, error: null, status: state.status === STATUS.ERROR ? STATUS.IDLE : state.status };

    default:
      return state;
  }
}

// ─── Selectors ───────────────────────────────────────────────────────────────

/** An escalated conversation is read-only — the ticket is the thread now. */
export const isComposerDisabled = (s) => s.status === STATUS.ESCALATED;

/** Quick replies only while nothing is in flight and nothing is typed. */
export const visibleQuickReplies = (s) => (
  s.status === STATUS.SENDING || s.draft || s.status === STATUS.ESCALATED ? [] : s.quickReplies
);

/** A card is actionable only while pending and the conversation is live. */
export const isActionable = (s) => Boolean(
  s.actionCard && (!s.actionCard.status || s.actionCard.status === 'pending') && s.status !== STATUS.ESCALATED,
);

/**
 * Offer a human when the bot suggested it, or after a failure.
 * Never when already escalated — the offer would be to do it twice.
 */
export const shouldOfferHuman = (s) => Boolean(
  s.canEscalate && s.status !== STATUS.ESCALATED && (s.escalateSuggested || s.status === STATUS.ERROR),
);

/** Group messages by calendar day, for date separators. */
export function groupByDay(messages) {
  const groups = [];
  for (const m of messages) {
    const day = String(m.createdAt).slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(m);
    else groups.push({ day, messages: [m] });
  }
  return groups;
}

/** Virtualise past this many messages rather than rendering a whole history. */
export const VIRTUALISE_AFTER = 50;
export const shouldVirtualise = (s) => s.messages.length > VIRTUALISE_AFTER;
