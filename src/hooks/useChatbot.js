import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { chatApi } from '@/lib/chatbot/client';
import {
  reducer, initialState, STATUS, TYPING_DELAY_MS, SLOW_REPLY_MS,
  isComposerDisabled, visibleQuickReplies, isActionable, shouldOfferHuman,
} from '@/lib/chatbot/state';

/**
 * The chat widget's behaviour, in one hook.
 *
 * All the decisions live in the pure reducer (src/lib/chatbot/state.js); this
 * layer does the I/O and the two things that need a clock: the delayed typing
 * indicator, and the "still working on it" notice on a slow reply.
 *
 * The session is created LAZILY — on the first message, not when the widget
 * mounts. A bubble sitting unopened on every page should not be creating
 * conversation rows.
 */
export function useChatbot({ role = 'consumer', mode = 'assistant', locale = 'en' } = {}) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, locale });
  const [typing, setTyping] = useState(false);
  const [slow, setSlow] = useState(false);
  const timers = useRef({});
  const localSeq = useRef(0);

  const clearTimers = () => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
  };
  useEffect(() => clearTimers, []);

  /** Create the conversation on demand and return its id. */
  const ensureSession = useCallback(async () => {
    if (state.conversationId) return state.conversationId;
    const convo = await chatApi.start({ locale: state.locale, mode });
    dispatch({ type: 'SESSION_STARTED', conversationId: convo.id, greeting: convo.greeting });
    return convo.id;
  }, [state.conversationId, state.locale, mode]);

  const send = useCallback(async (text) => {
    const content = String(text ?? '').trim();
    if (!content || isComposerDisabled(state)) return;

    const localId = `local-${(localSeq.current += 1)}`;
    dispatch({ type: 'SEND_STARTED', localId, content });

    // The indicator waits, so a cached or canned answer arrives without a
    // theatrical pause first.
    timers.current.typing = setTimeout(() => setTyping(true), TYPING_DELAY_MS);
    timers.current.slow = setTimeout(() => setSlow(true), SLOW_REPLY_MS);

    try {
      const id = await ensureSession();
      const reply = await chatApi.send(id, content);
      dispatch({ type: 'SEND_SUCCEEDED', localId, reply });
    } catch (err) {
      dispatch({ type: 'SEND_FAILED', localId, error: err.message });
    } finally {
      clearTimers();
      setTyping(false);
      setSlow(false);
    }
  }, [state, ensureSession]);

  /** A tapped chip sends its VALUE, which is the branch key the tree expects. */
  const sendQuickReply = useCallback((option) => send(option.value), [send]);

  const setDraft = useCallback((value) => dispatch({ type: 'DRAFT_CHANGED', value }), []);

  const attach = useCallback(async (file) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    dispatch({ type: 'ATTACHMENT_SELECTED', attachment: { name: file.name, previewUrl } });
    try {
      const id = await ensureSession();
      const result = await chatApi.attach(id, file);
      dispatch({
        type: 'ATTACHMENT_CLASSIFIED',
        attachment: { url: previewUrl, classifiedAs: result.symptom },
        // An unrecognised image asks a question rather than guessing — that is
        // the closed-set classifier working as intended, not a failure.
        prompt: result.confident
          ? 'Thanks — I can see what that is. Let me ask one thing to narrow it down.'
          : "I can't make that out clearly. Can you describe what's wrong?",
      });
      // A recognised symptom routes into a tree; sending its first answer starts
      // the walk at the branch the photo already resolved.
      if (result.route?.answers?.length) await send(result.route.answers[0]);
    } catch (err) {
      dispatch({ type: 'ATTACHMENT_CLEARED' });
      dispatch({ type: 'SEND_FAILED', localId: 'attachment', error: err.message });
    }
  }, [ensureSession, send]);

  const clearAttachment = useCallback(() => dispatch({ type: 'ATTACHMENT_CLEARED' }), []);

  /** Transcribe into the composer. Never sends. */
  const transcribe = useCallback(async (blob) => {
    try {
      const id = await ensureSession();
      const result = await chatApi.transcribe(id, blob);
      if (!result.available) return { available: false, message: result.error?.message };
      dispatch({ type: 'DRAFT_CHANGED', value: result.text || '' });
      return { available: true };
    } catch (err) {
      return { available: false, message: err.message };
    }
  }, [ensureSession]);

  const confirmAction = useCallback(async () => {
    if (!isActionable(state)) return;
    try {
      await chatApi.confirmAction(state.conversationId, state.actionCard.id);
      dispatch({ type: 'ACTION_SETTLED', status: 'confirmed', message: 'Done — that is confirmed.' });
    } catch (err) {
      dispatch({ type: 'ACTION_SETTLED', status: 'failed', message: err.message });
    }
  }, [state]);

  const declineAction = useCallback(async () => {
    if (!isActionable(state)) return;
    try {
      await chatApi.declineAction(state.conversationId, state.actionCard.id);
    } finally {
      dispatch({ type: 'ACTION_SETTLED', status: 'declined' });
    }
  }, [state]);

  const escalate = useCallback(async (reason) => {
    if (!state.conversationId) return;
    try {
      const ticket = await chatApi.escalate(state.conversationId, reason);
      dispatch({
        type: 'ESCALATED',
        reference: ticket.reference,
        ticketId: ticket.ticket_id,
        message: `Your issue requires assistance from our Customer Support team. We've created support ticket #${ticket.reference} and shared all the information you've provided, so you won't need to repeat yourself. A support representative will contact you as soon as possible.`,
      });
    } catch (err) {
      dispatch({ type: 'SEND_FAILED', localId: 'escalate', error: err.message });
    }
  }, [state.conversationId]);

  const setLocale = useCallback((next) => dispatch({ type: 'LOCALE_CHANGED', locale: next }), []);
  const reset = useCallback(() => { clearTimers(); dispatch({ type: 'RESET' }); }, []);

  const resume = useCallback(async (conversationId) => {
    const convo = await chatApi.history(conversationId);
    dispatch({ type: 'SESSION_STARTED', conversationId: convo.id });
    dispatch({
      type: 'HISTORY_LOADED',
      messages: convo.messages || [],
      escalated: convo.status === 'escalated',
    });
  }, []);

  const derived = useMemo(() => ({
    quickReplies: visibleQuickReplies(state),
    composerDisabled: isComposerDisabled(state),
    actionable: isActionable(state),
    offerHuman: shouldOfferHuman(state),
    busy: state.status === STATUS.SENDING,
  }), [state]);

  return {
    ...state,
    ...derived,
    typing,
    slow,
    send,
    sendQuickReply,
    setDraft,
    attach,
    clearAttachment,
    transcribe,
    confirmAction,
    declineAction,
    escalate,
    setLocale,
    reset,
    resume,
  };
}

export default useChatbot;
