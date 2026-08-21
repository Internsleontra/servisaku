/**
 * Real API client — talks to Express backend at /api/*
 * Maintains the EXACT same interface as mockClient.js so all UI code
 * continues to work without any changes.
 */
import { STORAGE_KEY as LANG_STORAGE_KEY, SUPPORTED_LANGS, DEFAULT_LANG } from '@/lib/LanguageContext';

// Relative '/api' in the browser (Vite/Netlify proxy); set VITE_API_BASE to an
// absolute URL when building for the Capacitor app (the native webview can't use
// a relative path). e.g. VITE_API_BASE="https://api.servisaku.com"
const BASE = import.meta.env.VITE_API_BASE || '/api';

// --- Token helpers ---
const getToken = () => localStorage.getItem('auth_token');
const setToken = (t) => localStorage.setItem('auth_token', t);
const clearToken = () => localStorage.removeItem('auth_token');

// --- Appwrite session mode ---
// When the user signs in via Appwrite (OTP), the session lives in Appwrite and
// we authenticate the API with short-lived Appwrite JWTs minted on demand
// (cached ~14 min). A localStorage flag marks that we're in this mode.
const APPWRITE_FLAG = 'appwrite_session';
let awJwt = null; // { jwt, exp }

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
      // Appwrite session is gone — drop the flag and fall back to any legacy token.
      localStorage.removeItem(APPWRITE_FLAG);
      awJwt = null;
    }
  }
  return getToken();
}

// The server localizes its business-rule errors and its catalog/notification
// text from Accept-Language. Without this the UI can be in Malay while every
// message the API produces arrives in English.
//
// Consumer build only. The partner app shares this client but is not localized
// — it renders server text as-is (no tField), so asking the API for Malay would
// translate half of its screens and none of its own chrome. VITE_APP is a
// compile-time literal, so the partner bundle keeps only the English branch.
function acceptLanguage() {
  if (import.meta.env.VITE_APP === 'partner') return 'en-US,en;q=0.9';
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    const lang = SUPPORTED_LANGS.includes(stored) ? stored : DEFAULT_LANG;
    return lang === 'ms' ? 'ms-MY,ms;q=0.9,en;q=0.8' : 'en-US,en;q=0.9';
  } catch {
    return 'en-US,en;q=0.9'; // storage blocked (private mode) — server default
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json', 'Accept-Language': acceptLanguage() };
  const token = await bearerToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // A 401 means the token is missing/expired/invalid — drop it so the app
    // falls back to a clean logged-out state instead of retrying with a token
    // the backend keeps rejecting (self-heals stale sessions across restarts /
    // a mock↔real backend switch).
    if (res.status === 401) { clearToken(); awJwt = null; }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    // Carry the status so callers can tell "your session is invalid" (401)
    // apart from "the server is busy/broken" (429/5xx) — treating the latter
    // as a bad session silently signs people out mid-login.
    const error = new Error(err.error || 'Request failed');
    error.status = res.status;
    // The server's stable error code (e.g. 'booking_not_found') travels in the
    // additive details array. Carried through so a caller can branch on the
    // code instead of matching the localized prose, which changes by language.
    error.details = err.details;
    error.code = Array.isArray(err.details) ? err.details[0]?.code : undefined;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const patch = (path, body) => request('PATCH', path, body);
const del = (path) => request('DELETE', path);

// --- Entity class that matches MockEntity interface ---
// Entity name → API route. Lowercasing the class name doesn't match the server
// mounts (ChatMessage → /api/chat, not /api/chatmessages), so map explicitly.
const ENTITY_PATHS = {
  User: '/users',
  Booking: '/bookings',
  Coupon: '/coupons',
  Review: '/reviews',
  EscrowLedger: '/escrow',
  RefundRequest: '/refunds',
  PayoutRecord: '/payouts',
  ChatMessage: '/chat',
  Notification: '/notifications',
  PartnerLocation: '/partner-locations',
};

class ApiEntity {
  constructor(name) {
    this.name = name;
    this.path = ENTITY_PATHS[name] || `/${name.toLowerCase()}s`;
  }

  async get(id) {
    return request('GET', `${this.path}/${id}`);
  }

  async create(payload) {
    return request('POST', this.path, payload);
  }

  async update(id, payload) {
    return request('PATCH', `${this.path}/${id}`, payload);
  }

  async delete(id) {
    return request('DELETE', `${this.path}/${id}`);
  }

  // Booking-specific: a partner claims an unassigned job from the pool.
  async claim(id) {
    return request('POST', `${this.path}/${id}/claim`);
  }

  // Booking-specific: a partner uploads before/after service photos.
  async addPhotos(id, payload) {
    return request('POST', `${this.path}/${id}/photos`, payload);
  }

  // Booking-specific: partner proposes an extra service; customer decides on it.
  async addExtra(id, payload) {
    return request('POST', `${this.path}/${id}/extras`, payload);
  }

  async decideExtra(id, itemId, payload) {
    return request('PATCH', `${this.path}/${id}/extras/${itemId}`, payload);
  }

  async filter(query = {}, orderBy = null, limit = null) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      params.set(k, String(v));
    }
    if (orderBy) params.set('_orderBy', orderBy);
    if (limit) params.set('_limit', String(limit));
    return request('GET', `${this.path}?${params.toString()}`);
  }

  subscribe() { return () => {}; } // no-op, real-time via polling or SSE later
}

export const apiClient = {
  auth: {
    async me() {
      return get('/auth/me');
    },
    async loginViaEmailPassword(email, password) {
      const data = await post('/auth/login', { email, password });
      setToken(data.access_token);
      return data;
    },
    async register(email, password, full_name) {
      const data = await post('/auth/register', { email, password, fullName: full_name });
      setToken(data.access_token);
      return data.user;
    },
    async updateMe(updateData) {
      // Map snake_case keys the UI sends → camelCase the backend expects
      const mapped = {};
      if (updateData.full_name !== undefined) mapped.fullName = updateData.full_name;
      if (updateData.phone_number !== undefined) mapped.phone = updateData.phone_number;
      if (updateData.city !== undefined) mapped.city = updateData.city;
      if (updateData.bio !== undefined) mapped.bio = updateData.bio;
      if (updateData.partner_verified !== undefined) mapped.partnerVerified = updateData.partner_verified;
      if (updateData.partner_rating !== undefined) mapped.partnerRating = updateData.partner_rating;
      return patch('/auth/me', mapped);
    },
    async updateConsumerProfile(data) {
      // { gender, birthday, language, nationality, timezone, comms } merged server-side.
      return patch('/auth/consumer-profile', data);
    },
    async logout() {
      // End the Appwrite session too, if there is one.
      try {
        if (localStorage.getItem(APPWRITE_FLAG)) {
          const { account } = await import('@/lib/appwrite');
          await account.deleteSession('current');
        }
      } catch { /* already gone */ }
      localStorage.removeItem(APPWRITE_FLAG);
      awJwt = null;
      clearToken();
      window.location.href = '/';
    },
    // After an Appwrite login (email OTP, phone OTP), establish/link the local
    // user (with role) and switch the client into Appwrite-session mode — the
    // API is then authenticated with Appwrite JWTs, not our own token.
    async loginWithAppwrite(jwt, { role, fullName } = {}) {
      const data = await post('/auth/appwrite', { jwt, role, fullName });
      clearToken();
      awJwt = null;
      localStorage.setItem(APPWRITE_FLAG, '1');
      return data.user;
    },
    // Backend-native phone OTP (via the server's own Twilio / lib/sms.js) — no
    // Appwrite involvement. In dev without Twilio, the request returns dev_code.
    async requestPhoneOtp(phone) {
      return post('/auth/otp/request', { phone });
    },
    async verifyPhoneOtp(phone, code, { fullName } = {}) {
      const data = await post('/auth/otp/verify', { phone, code, full_name: fullName });
      // This is an Express-JWT session (not Appwrite).
      localStorage.removeItem(APPWRITE_FLAG);
      awJwt = null;
      setToken(data.access_token);
      return data.user;
    },
    async forgotPassword(email) {
      // Always resolves 200; may include dev_reset_link when SMTP isn't configured.
      return post('/auth/forgot-password', { email });
    },
    async resetPassword(token, password) {
      const data = await post('/auth/reset-password', { token, password });
      setToken(data.access_token);
      return data.user;
    },
    async loginWithProvider() {
      // OAuth not yet wired to a real provider; fall through to OTP login
      window.location.href = '/otp-login';
    },
    redirectToLogin() {
      import('sonner').then(({ toast }) => toast.info('Please log in to continue'));
      setTimeout(() => window.location.href = '/otp-login', 800);
    },
  },

  entities: {
    User: new ApiEntity('User'),
    Booking: new ApiEntity('Booking'),
    Coupon: new ApiEntity('Coupon'),
    Review: new ApiEntity('Review'),
    EscrowLedger: new ApiEntity('EscrowLedger'),
    RefundRequest: new ApiEntity('RefundRequest'),
    PayoutRecord: new ApiEntity('PayoutRecord'),
    ChatMessage: new ApiEntity('ChatMessage'),
    Notification: new ApiEntity('Notification'),
    PartnerLocation: new ApiEntity('PartnerLocation'),
  },

  integrations: {
    Core: {
      async UploadFile({ file }) {
        // Placeholder — returns a local object URL until S3 is wired
        return { file_url: URL.createObjectURL(file) };
      },
    },
  },

  // Dynamic booking engine (DB-driven catalogue + question-based pricing).
  catalog: {
    getCategories: () => get('/categories'),
    getCategoryServices: (slug) => get(`/categories/${slug}/services`),
    getServices: () => get('/services'),
    getService: (slug) => get(`/services/${slug}`),
    calculate: (payload) => post('/bookings/calculate', payload),
    createBooking: (payload) => post('/bookings/dynamic', payload),
  },

  // Payments. `methods` is served from the backend provider registry so the
  // available list reflects which gateways are actually configured, rather than
  // a hardcoded front-end constant. create → hosted checkout URL; sync → confirm
  // after the redirect back (needed in local dev where the webhook can't reach us).
  payments: {
    methods: () => get('/payments/methods'),
    create: (bookingId, method) => post('/payments/create', { booking_id: bookingId, method }),
    sync: (paymentId) => post(`/payments/${paymentId}/sync`),
    get: (paymentId) => get(`/payments/${paymentId}`),
    // Partner records cash taken at the door. Amount must match the booking total.
    collectCash: (bookingId, amountCollected) =>
      post('/payments/cash/collect', { booking_id: bookingId, amount_collected: amountCollected }),
  },

  // SST tax invoices + credit notes. Invoices are immutable once issued, so
  // there is deliberately no update method.
  invoices: {
    list: (query = {}) => get(`/invoices?${new URLSearchParams(query)}`),
    get: (id) => get(`/invoices/${id}`),
    forBooking: (bookingId) => get(`/invoices?booking_id=${bookingId}`),
  },

  // The SST rate in force. Read this rather than hardcoding a rate — see the
  // deprecation note on TAX_RATE in src/lib/paymentEngine.js.
  tax: {
    config: () => get('/tax/config'),
  },

  // Saved service addresses (consumer).
  addresses: {
    list: () => get('/addresses'),
    add: (a) => post('/addresses', a),
    update: (id, a) => patch(`/addresses/${id}`, a),
    remove: (id) => del(`/addresses/${id}`),
  },

  // Partner wallet. `get` keeps hitting /payouts/wallet — same response shape as
  // before, now ledger-backed. The richer surface (ledger entries, commission
  // settlements) lives under /wallet.
  wallet: {
    get: () => get('/payouts/wallet'),
    withdraw: (amount) => post('/payouts/withdraw', { amount }),
    // Everything the wallet screen needs in one round trip: balances, withdrawn,
    // minimum/next payout, bank account, block reason, recent payouts, series.
    // Sits here rather than in a `payouts` namespace to match `get()` above,
    // which already maps a /payouts/* path onto the wallet surface.
    dashboard: () => get('/payouts/dashboard'),
    detail: () => get('/wallet'),
    ledger: (query = {}) => get(`/wallet/ledger?${new URLSearchParams(query)}`),
    settlements: () => get('/wallet/settlements'),
    settlement: (id) => get(`/wallet/settlements/${id}`),
    paySettlement: (id, method) => post(`/wallet/settlements/${id}/pay`, { method }),
    paySettlementFromBalance: (id, amount) =>
      post(`/wallet/settlements/${id}/pay-from-balance`, amount ? { amount } : {}),
  },

  // Partner availability config.
  availability: {
    get: () => get('/partners/me/availability'),
    update: (payload) => patch('/partners/me/availability', payload),
  },

  // Partner verification documents (Malaysia).
  documents: {
    list: () => get('/partners/me/documents'),
    submit: (payload) => post('/partners/me/documents', payload),
  },

  // Partner training center.
  training: {
    list: () => get('/partners/me/training'),
    complete: (courseId, answers) => post(`/partners/me/training/${courseId}/complete`, { answers }),
  },

  // Partner reviews (view / reply / report).
  reviews: {
    mine: () => get('/reviews/mine'),
    reply: (id, text) => post(`/reviews/${id}/reply`, { reply: text }),
    report: (id, reason) => post(`/reviews/${id}/report`, { reason }),
  },

  // Support tickets.
  support: {
    list: () => get('/support'),
    create: (payload) => post('/support', payload),
    get: (id) => get(`/support/${id}`),
    reply: (id, message) => post(`/support/${id}/messages`, { message }),
    resolve: (id) => post(`/support/${id}/resolve`, {}),
    reopen: (id, reason) => post(`/support/${id}/reopen`, { reason }),
    csat: (id, rating, comment) => post(`/support/${id}/csat`, { rating, comment }),
    requestCallback: (payload) => post('/support/callbacks', payload),
  },

  // Refunds. The SERVER decides the amount — `preview` is what the customer is
  // shown before they commit, and the create call recomputes it independently.
  // A client-supplied figure is ignored by design (see server/routes/refunds.js).
  refunds: {
    list: () => get('/refunds'),
    get: (id) => get(`/refunds/${id}`),
    preview: (bookingId, reason) => get(`/refunds/policy?booking_id=${encodeURIComponent(bookingId)}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`),
    request: (payload) => post('/refunds', payload),
    cancel: (id) => post(`/refunds/${id}/cancel`, {}),
  },

  // Disputes raised against a booking ("Flag Job").
  disputes: {
    list: () => get('/disputes'),
    get: (id) => get(`/disputes/${id}`),
    create: (payload) => post('/disputes', payload),
    addEvidence: (id, evidence) => post(`/disputes/${id}/evidence`, evidence),
  },

  // Property damage claims.
  damageClaims: {
    list: () => get('/damage-claims'),
    get: (id) => get(`/damage-claims/${id}`),
    create: (payload) => post('/damage-claims', payload),
    addEvidence: (id, evidence) => post(`/damage-claims/${id}/evidence`, evidence),
    appeal: (id, reason) => post(`/damage-claims/${id}/appeal`, { reason }),
  },

  // Versioned legal documents and the evidentiary acceptance log.
  legal: {
    documents: () => get('/legal/documents'),
    document: (slug) => get(`/legal/documents/${slug}`),
    pending: () => get('/legal/pending'),
    accept: (payload) => post('/legal/accept', payload),
    acceptMany: (payload) => post('/legal/accept-many', payload),
  },

  // Partner inventory.
  inventory: {
    list: () => get('/partners/me/inventory'),
    create: (payload) => post('/partners/me/inventory', payload),
    update: (id, payload) => patch(`/partners/me/inventory/${id}`, payload),
    remove: (id) => del(`/partners/me/inventory/${id}`),
  },

  // Partner onboarding (registration profile + autosaved draft).
  onboarding: {
    get: () => get('/partners/me/onboarding'),
    saveDraft: (draft) => patch('/partners/me/onboarding/draft', draft),
    submit: (payload) => post('/partners/me/onboarding/submit', payload),
    // Phone verification for the onboarding wizard. Unlike /auth/otp/verify
    // these do not create a session — they attach the number to the signed-in
    // account. Returns dev_code when no SMS provider is configured.
    requestPhoneOtp: (phone) => post('/partners/me/phone/request', { phone }),
    verifyPhoneOtp: (phone, code) => post('/partners/me/phone/verify', { phone, code }),
  },
};

export default apiClient;
