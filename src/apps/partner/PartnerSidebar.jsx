import { NavLink } from 'react-router-dom';
import {
  Home, CalendarDays, Wrench, Clock, Banknote, Star, Wallet, Bell,
  HelpCircle, Settings, TrendingUp,
} from 'lucide-react';

// Placeholder until the notifications count API is wired — matches the mockup.
const NOTIF_COUNT = 3;

const NAV = [
  { label: 'Home', icon: Home, to: '/partner', end: true },
  { label: 'Bookings', icon: CalendarDays, to: '/partner/calendar' },
  { label: 'My Services', icon: Wrench, to: '/partner/inventory' },
  { label: 'Availability', icon: Clock, to: '/partner/availability' },
  { label: 'Earnings', icon: Banknote, to: '/partner/earnings' },
  { label: 'Reviews', icon: Star, to: '/partner/reviews' },
  { label: 'Wallet', icon: Wallet, to: '/partner/wallet' },
  { label: 'Notifications', icon: Bell, to: '/notifications', badge: NOTIF_COUNT },
  { label: 'Help & Support', icon: HelpCircle, to: '/partner/support' },
  { label: 'Settings', icon: Settings, to: '/partner/settings' },
];

// Desktop-only persistent navigation rail for the partner app (lg+).
// Mobile uses PartnerTopNav + BottomNav instead.
export default function PartnerSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-hairline bg-surface lg:flex">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-6 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-lg font-black text-white shadow-e1">
          S
        </div>
        <div className="leading-none">
          <p className="font-display text-lg font-extrabold tracking-tight text-ink">SERVISAKU</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-ink-tertiary">Partner</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-none">
        {NAV.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-brand text-white shadow-e1'
                  : 'text-ink-secondary hover:bg-raised hover:text-ink'
              }`
            }
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
                {item.badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      {/* Go Online promo */}
      <div className="p-3">
        <div className="relative overflow-hidden rounded-2xl bg-brand-tint p-4">
          <p className="text-sm font-bold text-ink">High demand in your area!</p>
          <p className="mt-1 text-xs leading-snug text-ink-secondary">
            Go online to get more bookings and earn more.
          </p>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-e1 transition-colors hover:bg-brand-ink"
          >
            Go Online
          </button>
          <TrendingUp className="pointer-events-none absolute -bottom-2 -right-2 h-16 w-16 text-brand/15" />
        </div>
      </div>
    </aside>
  );
}
