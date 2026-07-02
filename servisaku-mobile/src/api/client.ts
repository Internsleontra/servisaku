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

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  partner_rating?: number;
}
export interface Wallet { lifetime: number; pending: number; withdrawn: number; withdrawable: number; balance: number }
export interface Booking {
  id: string; service_type: string; consumer_name?: string; status: string;
  date: string; time_slot?: string; city?: string; price?: number; partner_payout?: number;
}

export interface PriceLine {
  questionId: string | null; label: string; type?: string;
  optionLabel?: string; qty?: number; amount: number;
}
export interface QuestionOption { id: string; label: string }
export interface Question {
  id: string; label: string; type: string;
  options?: QuestionOption[]; config?: { unit?: string };
}
export interface ServiceDetail { slug: string; name: string; questions?: Question[] }
export interface LifecycleEntry { status: string; at: string }
export interface BookingDetail extends Booking {
  consumer_phone?: string; address?: string; notes?: string;
  catalog_service_id?: string;
  answers?: Record<string, unknown>;
  price_breakdown?: PriceLine[] | null;
  discount_amount?: number;
  payment_method?: string; payment_status?: string;
  lifecycle?: LifecycleEntry[] | null;
}

export const api = {
  async login(email: string, password: string): Promise<User> {
    const res = await post<{ access_token: string; user: User }>('/auth/login', { email, password });
    await setToken(res.access_token);
    return res.user;
  },
  me: () => get<User>('/auth/me'),
  async logout() { await clearToken(); },

  wallet: () => get<Wallet>('/payouts/wallet'),

  // Assigned jobs + the open pool the partner can claim.
  bookings: (partnerEmail: string) =>
    get<Booking[]>(`/bookings?partner_email=${encodeURIComponent(partnerEmail)}&_limit=50`),

  booking: (id: string) => get<BookingDetail>(`/bookings/${id}`),
  service: (idOrSlug: string) => get<ServiceDetail>(`/services/${idOrSlug}`),
  setBookingStatus: (id: string, status: string) =>
    patch<BookingDetail>(`/bookings/${id}`, { status }),
};
