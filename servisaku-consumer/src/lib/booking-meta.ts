// Booking status state machine + reference data — RN port of the web's
// src/lib/bookingEngine.js + src/lib/services.js (consumer-relevant parts).
import { colors } from '@/theme/tokens';

export interface StatusMeta { label: string; icon: string; tint: string; fg: string; step: number }

export const STATUS_META: Record<string, StatusMeta> = {
  pending:   { label: 'Pending',     icon: '⏳', tint: colors.warningTint, fg: colors.warning, step: 0 },
  assigned:  { label: 'Assigned',    icon: '👷', tint: '#eff6ff',          fg: '#2563eb',      step: 1 },
  accepted:  { label: 'Accepted',    icon: '✅', tint: '#eef2ff',          fg: '#4f46e5',      step: 2 },
  en_route:  { label: 'En Route',    icon: '🚗', tint: '#f5f3ff',          fg: '#7c3aed',      step: 3 },
  arrived:   { label: 'Arrived',     icon: '📍', tint: colors.brandTint,   fg: colors.brand,   step: 4 },
  started:   { label: 'In Progress', icon: '🔧', tint: colors.brandTint,   fg: colors.brand,   step: 5 },
  completed: { label: 'Completed',   icon: '🎉', tint: colors.successTint,  fg: colors.success, step: 6 },
  cancelled: { label: 'Cancelled',   icon: '❌', tint: colors.dangerTint,   fg: colors.danger,  step: -1 },
  disputed:  { label: 'Disputed',    icon: '⚠️', tint: colors.warningTint,  fg: colors.warning, step: -1 },
};

export function statusMeta(status?: string): StatusMeta {
  return STATUS_META[status ?? ''] ?? { label: status ?? 'Unknown', icon: '•', tint: colors.raised, fg: colors.inkSecondary, step: 0 };
}

export const LIFECYCLE_ORDER = ['pending', 'assigned', 'accepted', 'en_route', 'arrived', 'started', 'completed'];

export const CITIES = [
  'Kuala Lumpur', 'Petaling Jaya', 'Shah Alam', 'Subang Jaya',
  'Ampang', 'Cheras', 'Bangsar', 'Mont Kiara',
];

export interface SlotGroup { label: string; sub: string; emoji: string; slots: string[] }
export const SLOT_GROUPS: SlotGroup[] = [
  { label: 'Morning',   sub: '8 AM – 12 PM', emoji: '🌅', slots: ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM'] },
  { label: 'Afternoon', sub: '12 PM – 4 PM', emoji: '☀️', slots: ['12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM'] },
  { label: 'Evening',   sub: '4 PM – 7 PM',  emoji: '🌇', slots: ['4:00 PM', '5:00 PM', '6:00 PM'] },
];

export interface PaymentMethod { id: string; label: string; icon: string; sub: string }
export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'fpx',     label: 'FPX Online Banking',  icon: '🏦', sub: 'Maybank, CIMB, Public Bank' },
  { id: 'tng',     label: 'Touch n Go eWallet',  icon: '💚', sub: 'Instant payment' },
  { id: 'grabpay', label: 'GrabPay',             icon: '🟢', sub: 'Pay with Grab credits' },
  { id: 'boost',   label: 'Boost',               icon: '🔵', sub: 'Cashback rewards' },
  { id: 'card',    label: 'Credit / Debit Card', icon: '💳', sub: 'Visa, Mastercard' },
  { id: 'cash',    label: 'Cash on Service',     icon: '💵', sub: 'Pay at completion' },
];

// Surcharge triggers derived from the chosen slot/date (mirrors scheduleRules.js).
export function isAfterHours(slotLabel?: string): boolean {
  if (!slotLabel) return false;
  const m = String(slotLabel).match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return false;
  let hour = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) hour += 12;
  return hour < 9 || hour >= 19;
}

export function isUrgent(dateStr?: string): boolean {
  if (!dateStr) return false;
  return dateStr === new Date().toISOString().slice(0, 10);
}

// Category slug → emoji + accent tint, for tiles without bundled art.
export const CATEGORY_ICONS: Record<string, string> = {
  'beauty-wellness-women': '💅',
  'mens-grooming-massage': '💈',
  'cleaning': '🧹',
  'pest-control': '🐜',
  'ac-services': '❄️',
  'appliance-repair': '🔌',
  'electrician': '💡',
  'plumbing': '🚰',
  'carpenter': '🪚',
  'painting-renovation': '🎨',
  'handyman-installation': '🛠️',
  'instant-help': '⚡',
};

export function categoryIcon(slug?: string): string {
  return CATEGORY_ICONS[slug ?? ''] ?? '🧰';
}
