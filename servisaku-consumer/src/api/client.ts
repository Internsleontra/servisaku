import { getToken, setToken, setTokens, getRefreshToken, getDeviceId, clearToken } from '@/lib/storage';

// Base URL of the existing ServisAku Express API. On a physical device, localhost
// won't reach your dev machine — set EXPO_PUBLIC_API_BASE to your LAN IP, e.g.
// EXPO_PUBLIC_API_BASE="http://192.168.0.10:3001/api"
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:3001/api';

// Single-flight refresh: on a 401, swap the expired access token for a fresh one
// using the stored refresh token, then retry the original request once.
let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  const rt = await getRefreshToken();
  if (!rt) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const deviceId = await getDeviceId();
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt, device_id: deviceId }),
        });
        if (!res.ok) { await clearToken(); return false; }
        const data = (await res.json()) as { access_token: string; refresh_token?: string };
        await setTokens(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, retry = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !retry && path !== '/auth/refresh') {
    if (await tryRefresh()) return request<T>(method, path, body, true);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Request failed');
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b);
const patch = <T>(p: string, b?: unknown) => request<T>('PATCH', p, b);
const del = <T>(p: string) => request<T>('DELETE', p);

/* ------------------------------------------------------------------ types --- */

// Matches the backend's sanitized Prisma user (camelCase).
export interface User {
  id: string;
  email?: string;
  fullName?: string;
  phone?: string;
  city?: string;
  role: string;
  avatarUrl?: string;
  profileComplete?: boolean;
  consumerProfile?: ConsumerProfile | null;
}
export interface CommsPrefs {
  marketing?: { push?: boolean; sms?: boolean; email?: boolean; whatsapp?: boolean };
  transactional?: { push?: boolean; sms?: boolean; email?: boolean; whatsapp?: boolean };
}
export interface ConsumerProfile {
  gender?: string | null;
  birthday?: string | null;
  referralCode?: string | null;
  language?: string | null;
  nationality?: string | null;
  timezone?: string | null;
  comms?: CommsPrefs;
  notifPrefs?: Record<string, Record<string, boolean>>;
  muteUntil?: string | null;
}
export type ConsumerProfilePatch = Partial<Omit<ConsumerProfile, 'referralCode'>>;

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  service_count?: number;
}

export interface QuestionOption {
  id: string; // stable answer key
  label: string;
  price_modifier?: number;
  unit_price?: number;
  price_modifier_per_sqft?: number;
  is_default?: boolean;
}
export interface QuestionConfig {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  perUnit?: boolean;
  perSqft?: boolean;
  [key: string]: unknown;
}
export interface Question {
  id: string; // stable answer key (DB `key`)
  label: string;
  type: string; // SINGLE_SELECT | MULTI_SELECT | TIER_SELECT | TIER_QUANTITY | QUANTITY | HOURS_INPUT | AREA_INPUT | STEPPER
  required?: boolean;
  help_text?: string;
  config?: QuestionConfig | null;
  options?: QuestionOption[];
}

export interface ServiceSummary {
  id: string;
  slug: string;
  name: string;
  category_slug?: string;
  category_name?: string;
  description?: string;
  base_price?: number;
  price_from?: number;
  visit_fee?: number;
  pricing_type?: string;
  duration_min?: number;
  duration_max?: number;
}

export interface ServiceDetail extends ServiceSummary {
  questions?: Question[];
  inclusions?: string[];
}

export interface PriceLine {
  questionId: string | null;
  label: string;
  type?: string;
  optionLabel?: string;
  qty?: number;
  amount: number;
}
export interface Quote {
  currency?: string;
  pricingType?: string;
  serviceTotal: number;
  visitFee?: number;
  surcharges?: { afterHours: number; urgent: number; total: number };
  subtotal: number;
  platformFee: number;
  tax?: number;
  promoDiscount?: number;
  total: number;
  // Full itemised breakdown — ALREADY includes visit fee, surcharges, platform
  // fee, tax and discount lines, so render this list verbatim (don't re-add them).
  breakdown?: PriceLine[];
}

export interface LifecycleEntry { status: string; at: string; by?: string }
export interface BookingExtra {
  id: string;
  label: string;
  qty?: number;
  unit_price?: number;
  total: number;
  status: string; // pending | approved | rejected
  added_by?: string;
}
export interface Booking {
  id: string;
  service_type: string;
  service_slug?: string;
  catalog_service_id?: string;
  consumer_name?: string;
  consumer_phone?: string;
  partner_name?: string;
  partner_phone?: string;
  partner_rating?: number;
  status: string;
  date: string;
  time_slot?: string;
  city?: string;
  address?: string;
  notes?: string;
  price?: number;
  discount_amount?: number;
  partner_payout?: number;
  payment_method?: string;
  payment_status?: string;
  answers?: Record<string, unknown>;
  // Dynamic bookings snapshot the WHOLE pricing object here (with a `.breakdown`
  // array inside); legacy rows may be a bare array. Use breakdownLines() to read.
  price_breakdown?: Quote | PriceLine[] | null;
  photos?: { before?: { url: string }[]; after?: { url: string }[] } | null;
  lifecycle?: LifecycleEntry[] | null;
  extras?: BookingExtra[];
  rating?: number;
  created_date?: string;
}

// Normalise price_breakdown (whole pricing object OR bare array) → line array.
export function breakdownLines(pb: Booking['price_breakdown']): PriceLine[] {
  if (!pb) return [];
  if (Array.isArray(pb)) return pb;
  return Array.isArray(pb.breakdown) ? pb.breakdown : [];
}

export interface ChatMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_name?: string;
  sender_role?: string;
  message: string;
  message_type?: string;
  created_date: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body?: string;
  type?: string;         // legacy coarse type: booking_update | payment | chat | promo | system | reminder
  category?: string;     // canonical bucket: bookings | jobs | payments | wallet | promotions | support | security | reviews | system
  priority?: string;     // low | normal | high | urgent
  icon?: string;         // emoji rendered on the card
  action_url?: string;   // canonical deep link (alias of link)
  is_read: boolean;
  is_archived?: boolean;
  link?: string;
  booking_id?: string;
  cta_label?: string;
  created_date: string;
}

export interface NotificationCount {
  unread: number;
  total: number;
  by_category?: Record<string, number>;
}

/* ---------------------------------------------------------------- payloads --- */

export interface CalculatePayload {
  service_slug: string;
  answers: Record<string, unknown>;
  after_hours?: boolean;
  urgent?: boolean;
}
export interface CreateBookingPayload {
  service_slug: string;
  answers: Record<string, unknown>;
  property?: object;
  contact?: { person?: string; phone?: string };
  photos?: unknown[];
  after_hours?: boolean;
  urgent?: boolean;
  date: string;
  time_slot: string;
  address?: string;
  city?: string | null;
  notes?: string | null;
  payment_method?: string;
}

/* ------------------------------------------------------------------- client --- */

export interface OtpRequestResult {
  existing_user: boolean;
  expires_in: number;
  resend_in: number;
  sends_left?: number;
  dev_code?: string; // dev only (no SMS provider)
}
export interface OtpVerifyResult { user: User; is_new_user: boolean }

export interface Address {
  id: string;
  label: string;
  house_number?: string;
  building?: string;
  street?: string;
  area?: string;
  city?: string;
  state?: string;
  postal?: string;
  country?: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  is_default?: boolean;
}
export type AddressInput = Partial<Omit<Address, 'id'>>;
export interface CompleteProfilePayload {
  full_name: string;
  email?: string;
  gender?: 'male' | 'female' | 'prefer_not_to_say';
  birthday?: string;
  referral_code?: string;
}

export const api = {
  // --- auth ---
  async login(email: string, password: string): Promise<User> {
    const res = await post<{ access_token: string; user: User }>('/auth/login', { email, password });
    await setToken(res.access_token);
    return res.user;
  },
  async loginWithFirebase(token: string, fullName?: string): Promise<User> {
    const res = await post<{ access_token: string; user: User }>('/auth/firebase', { token, fullName });
    await setToken(res.access_token);
    return res.user;
  },
  forgotPassword: (email: string) =>
    post<{ ok: boolean; dev_reset_link?: string }>('/auth/forgot-password', { email }),
  async resetPassword(token: string, password: string): Promise<User> {
    const res = await post<{ access_token: string; user: User }>('/auth/reset-password', { token, password });
    await setToken(res.access_token);
    return res.user;
  },
  async register(email: string, password: string, fullName: string): Promise<User> {
    const res = await post<{ access_token: string; user: User }>('/auth/register', { email, password, fullName });
    await setToken(res.access_token);
    return res.user;
  },
  me: () => get<User>('/auth/me'),
  updateMe: (patchBody: Partial<{ fullName: string; phone: string; city: string; bio: string; avatarUrl: string }>) =>
    patch<User>('/auth/me', patchBody),
  updateConsumerProfile: (body: ConsumerProfilePatch) => patch<User>('/auth/consumer-profile', body),
  async logout() { await clearToken(); },

  // --- phone OTP (custom, passwordless) ---
  otpRequest: (phone: string) => post<OtpRequestResult>('/auth/otp/request', { phone }),
  async otpVerify(phone: string, code: string, fullName?: string): Promise<OtpVerifyResult> {
    const device_id = await getDeviceId();
    const res = await post<{ access_token: string; refresh_token: string; user: User; is_new_user: boolean }>(
      '/auth/otp/verify', { phone, code, device_id, full_name: fullName },
    );
    await setTokens(res.access_token, res.refresh_token);
    return { user: res.user, is_new_user: res.is_new_user };
  },
  completeProfile: (payload: CompleteProfilePayload) => post<User>('/auth/complete-profile', payload),
  logoutAll: () => post<{ ok: boolean }>('/auth/logout-all'),

  // --- saved addresses ---
  addresses: () => get<Address[]>('/addresses'),
  addAddress: (a: AddressInput) => post<Address>('/addresses', a),
  updateAddress: (id: string, a: AddressInput) => patch<Address>(`/addresses/${id}`, a),
  deleteAddress: (id: string) => del<{ ok: boolean }>(`/addresses/${id}`),

  // --- catalog / discovery ---
  categories: () => get<Category[]>('/categories'),
  categoryServices: (slug: string) => get<ServiceSummary[]>(`/categories/${slug}/services`),
  services: () => get<ServiceSummary[]>('/services'),
  service: (slug: string) => get<ServiceDetail>(`/services/${slug}`),

  // --- booking ---
  calculate: (payload: CalculatePayload) => post<Quote>('/bookings/calculate', payload),
  createBooking: (payload: CreateBookingPayload) => post<Booking>('/bookings/dynamic', payload),
  booking: (id: string) => get<Booking>(`/bookings/${id}`),
  bookings: (params = '') => get<Booking[]>(`/bookings${params}`),
  cancelBooking: (id: string) => patch<Booking>(`/bookings/${id}`, { status: 'cancelled' }),
  decideExtra: (bookingId: string, itemId: string, decision: 'approved' | 'rejected') =>
    patch<Booking>(`/bookings/${bookingId}/extras/${itemId}`, { status: decision }),

  // --- reviews ---
  createReview: (payload: { booking_id: string; rating: number; comment?: string; tags?: string[] }) =>
    post('/reviews', payload),

  // --- chat ---
  chat: (bookingId: string) => get<ChatMessage[]>(`/chat?booking_id=${encodeURIComponent(bookingId)}`),
  sendChat: (bookingId: string, message: string) =>
    post<ChatMessage>('/chat', { booking_id: bookingId, message }),

  // --- notifications ---
  notifications: (params = '') => get<AppNotification[]>(`/notifications${params}`),
  notificationCount: () => get<NotificationCount>('/notifications/count'),
  markNotificationRead: (id: string) => patch(`/notifications/${id}/read`, { is_read: true }),
  markAllNotificationsRead: () => patch<{ ok: boolean; unread: number }>('/notifications/read-all', {}),
  deleteNotification: (id: string) => del<{ ok: boolean }>(`/notifications/${id}`),
  registerPushToken: (token: string, platform = 'ios', provider = 'expo') =>
    post<{ ok: boolean }>('/notifications/push-token', { token, platform, provider }),
};

export type Api = typeof api;
