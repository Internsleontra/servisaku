// Typed mock layer for profile domains that have no backend endpoint yet
// (wallet, membership, loyalty, referrals, wishlist, sessions…). Simulates
// latency and optional failures. Swap any function body for a real API call
// (via '@/api/client') with ZERO component changes — the return types are the
// contract screens depend on.
export const MOCK_LATENCY = 450;

export function mockRequest<T>(data: T, opts: { failRate?: number; latency?: number } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (opts.failRate && Math.random() < opts.failRate) reject(new Error('Network hiccup — please retry.'));
      else resolve(data);
    }, opts.latency ?? MOCK_LATENCY);
  });
}

export type TierName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
export const TIER_ORDER: TierName[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

export interface ProfileSummary {
  customerId: string;
  memberSince: string; // ISO date
  verified: boolean;
  tier: TierName;
  points: number;
  nextTier?: TierName;
  pointsToNextTier: number;
  walletBalance: number;
  membershipActive: boolean;
  pendingReviews: number;
  savedCount: number;
  activeCoupons: number;
}

/* ------------------------------------------------------------------ wallet --- */
export interface WalletSummary { balance: number; points: number; cashback: number; referralEarnings: number; giftCard: number }
export type TxnType = 'credit' | 'debit' | 'refund' | 'reward' | 'cashback';
export interface WalletTxn { id: string; date: string; amount: number; type: TxnType; description: string; bookingRef?: string; status: 'completed' | 'pending' | 'failed' }

const WALLET_TXNS: WalletTxn[] = [
  { id: 't1', date: '2026-06-28T10:12:00Z', amount: -120, type: 'debit', description: 'Full House Cleaning', bookingRef: 'SA-9F2A1C', status: 'completed' },
  { id: 't2', date: '2026-06-25T09:00:00Z', amount: 12, type: 'cashback', description: 'Cashback — AC Servicing', bookingRef: 'SA-77B0D2', status: 'completed' },
  { id: 't3', date: '2026-06-22T14:30:00Z', amount: 50, type: 'credit', description: 'Wallet top-up (FPX)', status: 'completed' },
  { id: 't4', date: '2026-06-20T18:05:00Z', amount: 35, type: 'refund', description: 'Refund — cancelled plumbing', bookingRef: 'SA-31AA90', status: 'completed' },
  { id: 't5', date: '2026-06-18T12:00:00Z', amount: 250, type: 'reward', description: 'Loyalty points earned', status: 'completed' },
  { id: 't6', date: '2026-06-15T11:20:00Z', amount: -89, type: 'debit', description: 'AC Chemical Cleaning', bookingRef: 'SA-5521EE', status: 'completed' },
  { id: 't7', date: '2026-06-12T16:45:00Z', amount: 20, type: 'credit', description: 'Referral bonus — Aisha', status: 'completed' },
  { id: 't8', date: '2026-06-10T08:30:00Z', amount: -15, type: 'debit', description: 'Fan Installation', bookingRef: 'SA-A0C3F1', status: 'pending' },
];

export function getWallet(): Promise<{ summary: WalletSummary; transactions: WalletTxn[] }> {
  return mockRequest({
    summary: { balance: 128.5, points: 2450, cashback: 42.0, referralEarnings: 60.0, giftCard: 25.0 },
    transactions: WALLET_TXNS,
  });
}

/* --------------------------------------------------------------- wishlist --- */
export interface WishlistState {
  services: { slug: string; name: string; category: string; price: number }[];
  categories: { slug: string; name: string }[];
  partners: { id: string; name: string; rating: number; jobs: number }[];
  recentlyViewed: { slug: string; name: string }[];
}
export function getWishlist(): Promise<WishlistState> {
  return mockRequest({
    services: [
      { slug: 'full-house-cleaning', name: 'Full House Cleaning', category: 'Cleaning', price: 120 },
      { slug: 'ac-servicing', name: 'AC Servicing', category: 'AC Services', price: 20 },
      { slug: 'interior-painting', name: 'Interior Painting', category: 'Painting', price: 3 },
      { slug: 'cockroach-control', name: 'Cockroach Control', category: 'Pest Control', price: 120 },
    ],
    categories: [{ slug: 'cleaning', name: 'Cleaning' }, { slug: 'ac-services', name: 'AC Services' }],
    partners: [{ id: 'pr1', name: 'Ahmad R.', rating: 4.9, jobs: 240 }, { id: 'pr2', name: 'Siti N.', rating: 4.8, jobs: 180 }],
    recentlyViewed: [{ slug: 'sofa-cleaning', name: 'Sofa Cleaning' }, { slug: 'tap-repair-replacement', name: 'Tap Repair' }],
  });
}

/* ---------------------------------------------------------------- reviews --- */
export interface GivenReview { id: string; service: string; partner: string; rating: number; comment: string; date: string; anonymous: boolean }
export interface PendingReview { bookingId: string; service: string; partner: string; date: string }
export interface ReviewsState { given: GivenReview[]; pending: PendingReview[]; averageGiven: number }
export function getReviews(): Promise<ReviewsState> {
  return mockRequest({
    averageGiven: 4.6,
    given: [
      { id: 'g1', service: 'Full House Cleaning', partner: 'Ahmad R.', rating: 5, comment: 'Spotless and on time!', date: '2026-06-20', anonymous: false },
      { id: 'g2', service: 'AC Servicing', partner: 'Siti N.', rating: 4, comment: 'Good, cooling improved.', date: '2026-06-10', anonymous: true },
    ],
    pending: [
      { bookingId: 'SA-5521EE', service: 'AC Chemical Cleaning', partner: 'Ravi K.', date: '2026-06-28' },
      { bookingId: 'SA-A0C3F1', service: 'Fan Installation', partner: 'Ahmad R.', date: '2026-06-25' },
    ],
  });
}

/* -------------------------------------------------------- notification prefs --- */
export const NOTIF_CATEGORIES = ['Bookings', 'Payments', 'Offers', 'Membership', 'Support', 'Promotions', 'App Updates', 'Security'] as const;
export const NOTIF_CHANNELS = ['push', 'sms', 'email', 'whatsapp'] as const;
export type NotifPrefs = Record<string, Record<string, boolean>>;
export function defaultNotifPrefs(): NotifPrefs {
  const out: NotifPrefs = {};
  for (const c of NOTIF_CATEGORIES) {
    // Security & Bookings default all-on; Promotions default push+email; others push-on.
    out[c] = { push: true, sms: c === 'Security' || c === 'Bookings', email: c !== 'Promotions' ? true : true, whatsapp: false };
  }
  return out;
}

/* --------------------------------------------------------------- membership --- */
export interface MembershipState {
  active: boolean;
  plan: string;
  price: number;
  renewsOn: string;
  lifetimeSavings: number;
  benefits: string[];
  stats: { freeCancellationsLeft: number; priorityUsed: number; exclusiveDiscounts: number };
  history: { id: string; plan: string; date: string; amount: number }[];
}
export function getMembership(): Promise<MembershipState> {
  return mockRequest({
    active: true,
    plan: 'ServisAku Plus',
    price: 19.9,
    renewsOn: '2026-08-14T00:00:00Z',
    lifetimeSavings: 342.5,
    benefits: ['Free cancellations', 'Priority booking slots', 'Up to 15% member-only discounts', 'Dedicated support line', 'Extended service warranty'],
    stats: { freeCancellationsLeft: 3, priorityUsed: 7, exclusiveDiscounts: 12 },
    history: [
      { id: 'm1', plan: 'ServisAku Plus', date: '2026-07-14', amount: 19.9 },
      { id: 'm2', plan: 'ServisAku Plus', date: '2026-06-14', amount: 19.9 },
      { id: 'm3', plan: 'ServisAku Plus', date: '2026-05-14', amount: 19.9 },
    ],
  });
}

/* ------------------------------------------------------------------ loyalty --- */
export interface LoyaltyReward { id: string; title: string; points: number; desc: string }
export interface Achievement { id: string; title: string; icon: string; unlocked: boolean }
export interface LoyaltyState {
  tier: TierName;
  points: number;
  nextTier?: TierName;
  pointsToNext: number;
  rewards: LoyaltyReward[];
  redemptions: { id: string; title: string; points: number; date: string }[];
  achievements: Achievement[];
}
export function getLoyalty(): Promise<LoyaltyState> {
  return mockRequest({
    tier: 'Gold' as TierName,
    points: 2450,
    nextTier: 'Platinum' as TierName,
    pointsToNext: 550,
    rewards: [
      { id: 'r1', title: 'RM10 off any service', points: 1000, desc: 'Redeem for a flat RM10 discount' },
      { id: 'r2', title: 'Free deep-clean add-on', points: 1800, desc: 'One complimentary add-on' },
      { id: 'r3', title: 'RM30 wallet credit', points: 3000, desc: 'Straight to your wallet' },
      { id: 'r4', title: 'Priority weekend slot', points: 1200, desc: 'Skip the queue on weekends' },
    ],
    redemptions: [
      { id: 'x1', title: 'RM10 off any service', points: 1000, date: '2026-06-02' },
      { id: 'x2', title: 'Birthday reward', points: 500, date: '2026-03-14' },
    ],
    achievements: [
      { id: 'a1', title: 'First booking', icon: '🎉', unlocked: true },
      { id: 'a2', title: '10 bookings', icon: '🔟', unlocked: true },
      { id: 'a3', title: 'Refer a friend', icon: '🤝', unlocked: true },
      { id: 'a4', title: '5-star streak', icon: '⭐', unlocked: false },
      { id: 'a5', title: 'Diamond tier', icon: '💎', unlocked: false },
    ],
  });
}

/* --------------------------------------------------------------- coupons --- */
export type CouponTab = 'active' | 'expired' | 'personalized' | 'cashback' | 'seasonal' | 'referral';
export interface Coupon { id: string; code: string; title: string; discount: string; expiry: string; minOrder: number; categories: string[]; tab: CouponTab }
export function getCoupons(): Promise<Coupon[]> {
  return mockRequest([
    { id: 'c1', code: 'WELCOME20', title: '20% off your first booking', discount: '20% up to RM50', expiry: '2026-08-01', minOrder: 50, categories: ['All'], tab: 'active' },
    { id: 'c2', code: 'CLEANRM15', title: 'RM15 off cleaning', discount: 'RM15 flat', expiry: '2026-07-20', minOrder: 80, categories: ['Cleaning'], tab: 'active' },
    { id: 'c3', code: 'FORYOU10', title: 'Personal 10% reward', discount: '10%', expiry: '2026-07-15', minOrder: 0, categories: ['All'], tab: 'personalized' },
    { id: 'c4', code: 'CASHBACK5', title: '5% cashback to wallet', discount: '5% cashback', expiry: '2026-09-01', minOrder: 60, categories: ['AC', 'Plumbing'], tab: 'cashback' },
    { id: 'c5', code: 'RAYA2026', title: 'Raya festive 25% off', discount: '25% up to RM40', expiry: '2026-04-30', minOrder: 100, categories: ['All'], tab: 'seasonal' },
    { id: 'c6', code: 'REFER30', title: 'RM30 referral reward', discount: 'RM30', expiry: '2026-12-31', minOrder: 50, categories: ['All'], tab: 'referral' },
    { id: 'c7', code: 'MAY10', title: 'Expired — May promo', discount: '10%', expiry: '2026-05-31', minOrder: 40, categories: ['All'], tab: 'expired' },
  ]);
}

/* --------------------------------------------------------- payment methods --- */
export type PaymentKind = 'card' | 'fpx' | 'ewallet';
export interface PaymentMethod { id: string; kind: PaymentKind; brand?: string; last4?: string; bank?: string; wallet?: string; isDefault?: boolean }

const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'p1', kind: 'card', brand: 'Visa', last4: '4242', isDefault: true },
  { id: 'p2', kind: 'card', brand: 'Mastercard', last4: '5309' },
  { id: 'p3', kind: 'fpx', bank: 'Maybank' },
  { id: 'p4', kind: 'ewallet', wallet: 'Touch ’n Go' },
  { id: 'p5', kind: 'ewallet', wallet: 'GrabPay' },
];

export function getPaymentMethods(): Promise<PaymentMethod[]> {
  return mockRequest(PAYMENT_METHODS);
}

/* ------------------------------------------------------------- profile summary --- */
// Deterministic-ish demo summary derived from the user id.
export function getProfileSummary(userId: string): Promise<ProfileSummary> {
  return mockRequest({
    customerId: `SA-${userId.slice(-6).toUpperCase()}`,
    memberSince: '2025-03-14T00:00:00.000Z',
    verified: true,
    tier: 'Gold',
    points: 2450,
    nextTier: 'Platinum',
    pointsToNextTier: 550,
    walletBalance: 128.5,
    membershipActive: true,
    pendingReviews: 2,
    savedCount: 6,
    activeCoupons: 3,
  });
}
