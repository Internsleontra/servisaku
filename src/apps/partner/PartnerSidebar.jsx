import { Link, NavLink } from 'react-router-dom';
import {
  Home, CalendarDays, Wrench, Clock, Banknote, Star, Wallet, Bell,
  HelpCircle, Settings, TrendingUp,
} from 'lucide-react';
import { usePartnerUnread } from './PartnerNotifications';
import { Button } from '@/components/ds';

// Canonical keyboard focus treatment. `ds/Button` carries this already, but a
// plain <Link> does not — nothing in the app CSS applies --focus-ring globally,
// so these links were falling back to the browser's default orange outline:auto.
// The `shadow:` type hint is required; a bare var() compiles to --tw-shadow-color.
const FOCUS = 'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]';

const NAV = [
  { label: 'Home', icon: Home, to: '/partner', end: true },
  { label: 'Bookings', icon: CalendarDays, to: '/partner/calendar' },
  { label: 'My Services', icon: Wrench, to: '/partner/inventory' },
  { label: 'Availability', icon: Clock, to: '/partner/availability' },
  { label: 'Earnings', icon: Banknote, to: '/partner/earnings' },
  { label: 'Reviews', icon: Star, to: '/partner/reviews' },
  { label: 'Wallet', icon: Wallet, to: '/partner/wallet' },
  { label: 'Notifications', icon: Bell, to: '/notifications', badge: 'unread' },
  { label: 'Help & Support', icon: HelpCircle, to: '/partner/support' },
  { label: 'Settings', icon: Settings, to: '/partner/settings' },
];

// Desktop-only persistent navigation rail for the partner app (lg+).
// Mobile uses PartnerTopNav + BottomNav instead.
export default function PartnerSidebar() {
  // Real count, live, fetched once by the shell. Was a hardcoded `3`.
  const unread = usePartnerUnread();

  return (
    <aside
      aria-label="Partner navigation"
      className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-surface shadow-[inset_-1px_0_0_rgb(var(--hairline))] lg:flex"
    >
      {/* Brand — official mark + wordmark. Replaces the hand-built "S" tile and
          the typed "SERVISAKU" text. The wordmark is artwork, so it is an image,
          not a font; "Partner" below identifies the audience. */}
      <Link
        to="/partner"
        className={`flex items-center gap-2.5 rounded-field px-6 py-5 ${FOCUS}`}
        aria-label="ServisAku Partner home"
      >
        <img
          src="/img/brand/logo-mark.png"
          alt=""
          aria-hidden="true"
          className="size-9 shrink-0 object-contain"
        />
        <span className="leading-none">
          <img
            src="/img/brand/logo-wordmark.png"
            alt="ServisAku"
            className="h-[15px] w-auto object-contain"
          />
          <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-tertiary">
            Partner
          </span>
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-none">
        {NAV.map((item) => {
          const count = item.badge === 'unread' ? unread : 0;
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex min-h-11 items-center gap-3 rounded-field px-3.5 py-2.5 text-caption font-semibold transition ${FOCUS} ${
                  isActive
                    ? 'bg-grad-brand text-white shadow-brand'
                    : 'text-ink-secondary hover:bg-raised hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span
                      className={`sa-num flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-brand text-white'
                      }`}
                    >
                      {count > 99 ? '99+' : count}
                      <span className="sr-only"> unread notifications</span>
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Go Online promo */}
      <div className="p-3">
        <div className="relative overflow-hidden rounded-card bg-brand-tint p-4">
          <p className="text-caption font-semibold text-ink">High demand in your area!</p>
          <p className="mt-1 text-xs leading-snug text-ink-secondary">
            Go online to get more bookings and earn more.
          </p>
          <Button className="mt-3">Go Online</Button>
          <TrendingUp className="pointer-events-none absolute -bottom-2 -right-2 size-16 text-brand/15" aria-hidden="true" />
        </div>
      </div>
    </aside>
  );
}
