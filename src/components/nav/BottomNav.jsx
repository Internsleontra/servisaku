import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Compass, Calendar, CalendarDays, User, Search, LayoutDashboard, Wallet, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { useTranslation } from '@/lib/useTranslation';

export function BottomNav() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Each role gets its own tab set — partners/admins never see the consumer
  // browse/book flow.
  const NAV_BY_ROLE = {
    consumer: [
      { icon: Home, label: t('Home'), to: '/' },
      { icon: Compass, label: t('Explore'), to: '/explore' },
      { icon: Search, label: t('Book'), to: '/explore', isFab: true },
      { icon: Calendar, label: t('Bookings'), to: '/bookings', auth: true },
      { icon: User, label: t('Profile'), to: '/profile/edit', auth: true },
    ],
    partner: [
      { icon: LayoutDashboard, label: t('Dashboard'), to: '/partner' },
      { icon: CalendarDays, label: t('Schedule'), to: '/partner/calendar' },
      { icon: Wallet, label: t('Earnings'), to: '/partner/earnings' },
      { icon: User, label: t('Profile'), to: '/profile/edit' },
    ],
    admin: [
      { icon: LayoutDashboard, label: t('Dashboard'), to: '/admin' },
      { icon: Calendar, label: t('Bookings'), to: '/admin/bookings' },
      { icon: Users, label: t('Users'), to: '/admin/users' },
      { icon: User, label: t('Profile'), to: '/profile/edit' },
    ],
  };
  const role = user?.role === 'super_admin' ? 'admin' : (user?.role || 'consumer');
  const NAV_ITEMS = NAV_BY_ROLE[role] || NAV_BY_ROLE.consumer;

  // Inset top hairline rather than border + shadow — the design system forbids
  // combining the two on one element. The shadow points upward (--shadow-sheet).
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-xl pb-safe pt-2 px-4 shadow-[inset_0_1px_0_rgb(var(--hairline)),0_-8px_40px_rgba(4,4,74,0.16)]">
      <div className="max-w-md mx-auto flex justify-between items-center relative">
        {NAV_ITEMS.map((item) => {
          if (item.isFab) {
            return (
              <button
                key="fab"
                onClick={() => navigate(item.to)}
                aria-label={item.label}
                className="relative -top-5 size-14 rounded-full bg-brand text-ink-inverse shadow-e3 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
              >
                <item.icon className="size-6" />
              </button>
            );
          }

          return (
            <NavLink
              key={item.label}
              to={item.auth && !user ? '/otp-login' : item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 min-w-[64px] transition-colors',
                  isActive ? 'text-brand' : 'text-ink-secondary hover:text-ink'
                )
              }
            >
              <item.icon className="size-5" />
              <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
