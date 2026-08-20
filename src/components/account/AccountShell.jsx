import { NavLink, useNavigate } from 'react-router-dom';
import {
  User, MapPin, Bell, Calendar, Receipt, LifeBuoy, ShieldCheck, LogOut, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { servisaku } from '@/api/servisakuClient';
import { RING } from '@/components/ds';
import { useTranslation } from '@/lib/useTranslation';

/**
 * Shared shell for the account area.
 *
 * Same lever as RecordUI: one implementation behind every account surface, so
 * the nav, header and container are defined once. Replaces the per-page
 * centred mobile columns with the standard web pattern — persistent left nav
 * beside a content column, inside the 1240px container.
 *
 * NAV CONTENTS ARE DELIBERATE. Only production surfaces are listed. The
 * mock-data pages (/wallet, /payments, /membership, /loyalty, /offers,
 * /wishlist, /reviews) are intentionally absent — they remain routable so
 * existing links keep working, but they are not advertised until they have
 * real backends. See docs/migration-status-report.md § Account audit.
 */
const NAV = [
  { to: '/profile', label: 'Overview', icon: User, end: true },
  { to: '/profile/edit', label: 'Profile & addresses', icon: MapPin },
  { to: '/notification-settings', label: 'Notifications', icon: Bell },
  { to: '/bookings', label: 'My bookings', icon: Calendar },
  { to: '/refunds', label: 'Refunds & disputes', icon: Receipt },
  { to: '/support', label: 'Support', icon: LifeBuoy },
  { to: '/legal', label: 'Legal & policies', icon: ShieldCheck },
];

export default function AccountShell({ user, title, subtitle, children, aside }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const name = user?.full_name || t('Your account');
  const initials = user?.full_name
    ? user.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div className="bg-bg pb-16">
      {/* Gradient account header */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-14">
          <button
            onClick={() => navigate('/')}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" /> {t('Home')}
          </button>

          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-white/15 font-display text-h3 font-semibold ring-1 ring-inset ring-white/20">
              {initials}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-display-2 text-white">{title || name}</h1>
              <p className="mt-1 truncate text-lead text-white/[0.78]">
                {subtitle || user?.email || user?.phone || ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Left nav + content */}
      <div className="mx-auto -mt-8 grid w-full max-w-[1240px] items-start gap-6 px-5 md:px-8 lg:grid-cols-[248px_1fr]">
        <nav
          aria-label={t('Account')}
          className={cn('flex flex-col gap-1 rounded-card bg-surface p-2 lg:sticky lg:top-[100px]', RING)}
        >
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'flex min-h-11 items-center gap-3 rounded-field px-3 text-caption transition-colors',
                isActive
                  ? 'bg-brand-tint font-semibold text-brand'
                  : 'text-ink-secondary hover:bg-raised hover:text-ink',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {t(label)}
            </NavLink>
          ))}

          <button
            onClick={() => servisaku.auth.logout()}
            className="mt-1 flex min-h-11 items-center gap-3 rounded-field px-3 text-caption text-danger transition-colors hover:bg-danger-tint"
          >
            <LogOut className="size-4 shrink-0" /> {t('Sign out')}
          </button>
        </nav>

        <div className={cn('grid items-start gap-6', aside && 'xl:grid-cols-[1.6fr_0.9fr]')}>
          <div className="flex flex-col gap-4">{children}</div>
          {aside && <div className="xl:sticky xl:top-[100px]">{aside}</div>}
        </div>
      </div>
    </div>
  );
}
