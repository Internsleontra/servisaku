/**
 * Chat API client.
 *
 * Mirrors the auth handling in src/api/apiClient.js — an Appwrite JWT when the
 * session lives there, otherwise the stored token. Kept separate from that file
 * rather than bolted onto it because the chat endpoints are multipart in two
 * places, and `apiClient` is a JSON-only surface every screen depends on.
 *
 * Authentication is OPTIONAL throughout: an anonymous visitor can ask FAQ
 * questions before signing up, so a missing token is a normal state and not an
 * error. What they lose is account context and the ability to open a ticket.
 */

const BASE = import.meta.env.VITE_API_BASE || '/api';
const APPWRITE_FLAG = 'appwrite_session';
const SESSION_KEY = 'servisaku_chat_session';

let awJwt = null;

async function bearerToken() {
  if (localStorage.getItem(APPWRITE_FLAG)) {
    try {
      if (!awJwt || awJwt.exp < Date.now() + 60_000) {
        const { account } = await import('@/lib/appwrite');
        const res = await account.createJWT();
        awJwt = { jwt: res.jwt, exp: Date.now() + 14 * 60_000 };
      }
      return awJwt.jwt;
    } catch {
      localStorage.removeItem(APPWRITE_FLAG);
      awJwt = null;
    }
  }
  return localStorage.getItem('auth_token');
}

/**
 * A stable per-device session id.
 *
 * This is what lets an anonymous visitor keep their conversation across a page
 * reload — the server holds an anonymous conversation by session id rather than
 * by user.
 */
export function sessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

async function headers(extra = {}) {
  const token = await bearerToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Session-Id': sessionId(),
    ...extra,
  };
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || body.message || 'Request failed');
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

async function json(method, path, body) {
  return handle(await fetch(`${BASE}/chatbot${path}`, {
    method,
    headers: await headers({ 'Content-Type': 'application/json' }),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
}

/** Device details, captured at session start rather than at escalation. */
function deviceInfo() {
  if (typeof navigator === 'undefined') return undefined;
  return {
    platform: navigator.platform || undefined,
    app_version: import.meta.env.VITE_APP_VERSION || undefined,
    model: navigator.userAgent?.slice(0, 60) || undefined,
  };
}

export const chatApi = {
  /** Public FAQ list — also feeds the Help page. */
  faqs: (audience = 'consumer', locale = 'en') => json('GET', `/faqs?audience=${audience}&locale=${locale}`),

  start: ({ locale = 'en', mode = 'assistant' } = {}) => json('POST', '/conversations', {
    session_id: sessionId(),
    locale,
    mode,
    device: deviceInfo(),
  }),

  history: (id) => json('GET', `/conversations/${id}?session_id=${encodeURIComponent(sessionId())}`),

  list: () => json('GET', '/conversations'),

  send: (id, message) => json('POST', `/conversations/${id}/messages`, { message }),

  escalate: (id, reason) => json('POST', `/conversations/${id}/escalate`, { reason }),

  feedback: (id, helpful) => json('POST', `/conversations/${id}/feedback`, { helpful }),

  close: (id) => json('POST', `/conversations/${id}/close`),

  actions: (id) => json('GET', `/conversations/${id}/actions`),

  confirmAction: (id, actionId) => json('POST', `/conversations/${id}/actions/${actionId}/confirm`),

  declineAction: (id, actionId) => json('POST', `/conversations/${id}/actions/${actionId}/decline`),

  /** A photo of the problem. Classified server-side against a closed symptom set. */
  async attach(id, file) {
    const form = new FormData();
    form.append('file', file);
    return handle(await fetch(`${BASE}/chatbot/conversations/${id}/attachments`, {
      method: 'POST',
      headers: await headers(),
      body: form,
    }));
  },

  /**
   * A voice note. The transcript comes back for the COMPOSER — it is never sent
   * as a message on the user's behalf.
   */
  async transcribe(id, blob) {
    const form = new FormData();
    form.append('audio', blob, 'voice.webm');
    const res = await fetch(`${BASE}/chatbot/conversations/${id}/transcribe`, {
      method: 'POST',
      headers: await headers(),
      body: form,
    });
    // 503 means the capability is absent, which the UI handles by asking the
    // person to type. That is a normal state, not a failure to surface.
    if (res.status === 503) return { available: false, ...(await res.json().catch(() => ({}))) };
    return handle(res);
  },
};

export default chatApi;
