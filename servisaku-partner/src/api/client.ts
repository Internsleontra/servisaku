import { getToken, setToken, clearToken } from '@/lib/storage';

// Base URL of the existing ServisAku Express API. On a device, localhost won't
// reach your dev machine — set EXPO_PUBLIC_API_BASE to your LAN IP, e.g.
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
const del = <T>(p: string) => request<T>('DELETE', p);

/* ------------------------------------------------------------------ types --- */
export interface User {
  id: string;
  email: string;
  fullName?: string;
  full_name?: string;
  phone?: string;
  city?: string;
  role: string;
  avatarUrl?: string;
  partnerVerified?: boolean;
  partnerRating?: number;
  partnerCategory?: string;
}
export interface Wallet { lifetime: number; pending: number; withdrawn: number; withdrawable: number; balance: number }

export interface Booking {
  id: string; service_type: string; service_slug?: string; consumer_name?: string; consumer_phone?: string;
  status: string; date: string; time_slot?: string; city?: string; address?: string; price?: number; partner_payout?: number;
  partner_email?: string; created_date?: string;
}
export interface PriceLine { questionId: string | null; label: string; type?: string; optionLabel?: string; qty?: number; amount: number }
export interface QuestionOption { id: string; label: string }
export interface Question { id: string; label: string; type: string; options?: QuestionOption[]; config?: { unit?: string } }
export interface ServiceDetail { slug: string; name: string; questions?: Question[] }
export interface LifecycleEntry { status: string; at: string }
export interface BookingExtra { id: string; label: string; qty?: number; total: number; status: string }
export interface BookingDetail extends Booking {
  address?: string; notes?: string; catalog_service_id?: string;
  answers?: Record<string, unknown>;
  price_breakdown?: PriceLine[] | { breakdown?: PriceLine[] } | null;
  discount_amount?: number; payment_method?: string; payment_status?: string;
  lifecycle?: LifecycleEntry[] | null;
  extras?: BookingExtra[];
  photos?: { before?: { url: string }[]; after?: { url: string }[] } | null;
}

export interface AvailabilityConfig {
  online?: boolean;
  working_days?: string[];
  start_time?: string;
  end_time?: string;
  radius_km?: number;
  vacation?: { from: string; to: string }[];
  [key: string]: unknown;
}
export interface PartnerDocument {
  type: string; label: string; group?: string; required?: boolean; status?: string;
  file_url?: string | null; number?: string | null; expiry_date?: string | null; rejection_reason?: string | null;
  numberLabel?: string; hasNumber?: boolean; hasExpiry?: boolean; help?: string;
}
export interface DocumentSummary {
  documents: PartnerDocument[];
  required_total: number; required_verified: number; progress: number; activated: boolean;
}
export interface TrainingCourse { id: string; title: string; description?: string; duration_min?: number; status?: string; mandatory?: boolean; passed?: boolean; questions?: unknown[] }
export interface PartnerReview { id: string; rating: number; comment?: string; reviewer_name?: string; service_type?: string; created_date?: string; reply?: string | null; replied_at?: string | null; reported?: boolean }
export interface SupportTicket { id: string; category: string; subject?: string; message?: string; status: string; created_date?: string }
export interface InventoryItem { id: string; name: string; quantity: number; unit?: string; low_stock_threshold?: number }

export interface AppNotification {
  id: string;
  title: string;
  body?: string;
  type?: string;         // legacy coarse type: booking_update | payment | chat | promo | system | reminder
  category?: string;     // canonical bucket: jobs | payments | reviews | support | security | system | …
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

// Normalise price_breakdown (whole pricing object OR bare array) → line array.
export function breakdownLines(pb: BookingDetail['price_breakdown']): PriceLine[] {
  if (!pb) return [];
  if (Array.isArray(pb)) return pb;
  return Array.isArray(pb.breakdown) ? pb.breakdown : [];
}

export const api = {
  async login(email: string, password: string): Promise<User> {
    const res = await post<{ access_token: string; user: User }>('/auth/login', { email, password });
    await setToken(res.access_token);
    return res.user;
  },
  me: () => get<User>('/auth/me'),
  updateMe: (body: Partial<{ fullName: string; phone: string; city: string; bio: string; avatarUrl: string }>) => patch<User>('/auth/me', body),
  async logout() { await clearToken(); },

  // --- wallet / earnings ---
  wallet: () => get<Wallet>('/payouts/wallet'),
  withdraw: (amount: number) => post('/payouts/withdraw', { amount }),

  // --- jobs ---
  bookings: (partnerEmail: string) => get<Booking[]>(`/bookings?partner_email=${encodeURIComponent(partnerEmail)}&_limit=50`),
  availableJobs: () => get<Booking[]>('/bookings?available=true&_limit=50'),
  booking: (id: string) => get<BookingDetail>(`/bookings/${id}`),
  service: (idOrSlug: string) => get<ServiceDetail>(`/services/${idOrSlug}`),
  setBookingStatus: (id: string, status: string) => patch<BookingDetail>(`/bookings/${id}`, { status }),
  claim: (id: string) => post<BookingDetail>(`/bookings/${id}/claim`),
  addPhotos: (id: string, payload: { phase: 'before' | 'after'; photos: { url: string }[] }) => post<BookingDetail>(`/bookings/${id}/photos`, payload),
  addExtra: (id: string, payload: { label: string; qty?: number; unit_price: number }) => post<BookingDetail>(`/bookings/${id}/extras`, payload),

  // --- availability ---
  availability: () => get<AvailabilityConfig>('/partners/me/availability'),
  updateAvailability: (payload: Partial<AvailabilityConfig>) => patch<AvailabilityConfig>('/partners/me/availability', payload),

  // --- verification documents ---
  documents: () => get<DocumentSummary>('/partners/me/documents'),
  submitDocument: (payload: { type: string; file_url?: string | null; number?: string | null; expiry?: string | null }) => post('/partners/me/documents', payload),

  // --- training ---
  training: () => get<TrainingCourse[]>('/partners/me/training'),
  completeTraining: (courseId: string, answers: Record<string, unknown>) => post(`/partners/me/training/${courseId}/complete`, { answers }),

  // --- reviews ---
  reviews: () => get<PartnerReview[]>('/reviews/mine'),
  replyReview: (id: string, reply: string) => post(`/reviews/${id}/reply`, { reply }),
  reportReview: (id: string, reason: string) => post(`/reviews/${id}/report`, { reason }),

  // --- support ---
  support: () => get<SupportTicket[]>('/support'),
  createTicket: (payload: { category: string; subject?: string; message: string }) => post<SupportTicket>('/support', payload),

  // --- inventory ---
  inventory: () => get<InventoryItem[]>('/partners/me/inventory'),
  addInventory: (payload: Partial<InventoryItem>) => post<InventoryItem>('/partners/me/inventory', payload),
  updateInventory: (id: string, payload: Partial<InventoryItem>) => patch<InventoryItem>(`/partners/me/inventory/${id}`, payload),
  removeInventory: (id: string) => del(`/partners/me/inventory/${id}`),

  // --- onboarding ---
  onboarding: () => get<{ draft: unknown; profile: unknown; submitted: boolean; account: unknown }>('/partners/me/onboarding'),
  saveOnboardingDraft: (draft: unknown) => patch('/partners/me/onboarding/draft', draft),
  submitOnboarding: (payload: unknown) => post('/partners/me/onboarding/submit', payload),

  // --- notifications ---
  notifications: (params = '') => get<AppNotification[]>(`/notifications${params}`),
  notificationCount: () => get<NotificationCount>('/notifications/count'),
  markNotificationRead: (id: string) => patch(`/notifications/${id}/read`, { is_read: true }),
  markAllNotificationsRead: () => patch<{ ok: boolean; unread: number }>('/notifications/read-all', {}),
  deleteNotification: (id: string) => del<{ ok: boolean }>(`/notifications/${id}`),
  registerPushToken: (token: string, platform = 'ios', provider = 'expo') =>
    post<{ ok: boolean }>('/notifications/push-token', { token, platform, provider }),
};
