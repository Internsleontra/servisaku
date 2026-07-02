/**
 * Real API client — talks to Express backend at /api/*
 * Maintains the EXACT same interface as mockClient.js so all UI code
 * continues to work without any changes.
 */

// Relative '/api' in the browser (Vite/Netlify proxy); set VITE_API_BASE to an
// absolute URL when building for the Capacitor app (the native webview can't use
// a relative path). e.g. VITE_API_BASE="https://api.servisaku.com"
const BASE = import.meta.env.VITE_API_BASE || '/api';

// --- Token helpers ---
const getToken = () => localStorage.getItem('auth_token');
const setToken = (t) => localStorage.setItem('auth_token', t);
const clearToken = () => localStorage.removeItem('auth_token');

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
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
    async logout() {
      clearToken();
      window.location.href = '/';
    },
    async loginWithFirebase(firebaseIdToken) {
      const data = await post('/auth/firebase', { token: firebaseIdToken });
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

  // Partner wallet (computed balance + withdrawals).
  wallet: {
    get: () => get('/payouts/wallet'),
    withdraw: (amount) => post('/payouts/withdraw', { amount }),
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
  },
};

export default apiClient;
