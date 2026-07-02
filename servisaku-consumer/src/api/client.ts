import { getToken, setToken, clearToken } from '@/lib/storage';

// Base URL of the existing ServisAku Express API. On a physical device, localhost
// won't reach your dev machine — set EXPO_PUBLIC_API_BASE to your LAN IP, e.g.
// EXPO_PUBLIC_API_BASE="http://192.168.0.10:3001/api"
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:3001/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Request failed');
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b);
const patch = <T>(p: string, b?: unknown) => request<T>('PATCH', p, b);

/* ------------------------------------------------------------------ types --- */

export interface User {
  id: string;
  email: string;
  full_name?: string;
  phone_number?: string;
  city?: string;
  role: string;
  avatar_url?: string;
}

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
  price_breakdown?: PriceLine[] | null;
  photos?: { before?: { url: string }[]; after?: { url: string }[] } | null;
  lifecycle?: LifecycleEntry[] | null;
  extras?: BookingExtra[];
  rating?: number;
  created_date?: string;
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
  type?: string;
  is_read: boolean;
  link?: string;
  created_date: string;
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

export const api = {
  // --- auth ---
  async login(email: string, password: string): Promise<User> {
    const res = await post<{ access_token: string; user: User }>('/auth/login', { email, password });
    await setToken(res.access_token);
    return res.user;
  },
  async loginWithFirebase(token: string): Promise<User> {
    const res = await post<{ access_token: string; user: User }>('/auth/firebase', { token });
    await setToken(res.access_token);
    return res.user;
  },
  async register(email: string, password: string, fullName: string): Promise<User> {
    const res = await post<{ access_token: string; user: User }>('/auth/register', { email, password, fullName });
    await setToken(res.access_token);
    return res.user;
  },
  me: () => get<User>('/auth/me'),
  updateMe: (patchBody: Partial<{ fullName: string; phone: string; city: string; bio: string }>) =>
    patch<User>('/auth/me', patchBody),
  async logout() { await clearToken(); },

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
  notifications: () => get<AppNotification[]>('/notifications'),
  markNotificationRead: (id: string) => patch(`/notifications/${id}`, { is_read: true }),
};

export type Api = typeof api;
