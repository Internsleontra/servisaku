import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  MapPin, Bell, Calendar, Receipt, LifeBuoy, ShieldCheck, Wrench,
  ChevronRight, LoaderCircle, Sparkles,
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import AccountShell from '@/components/account/AccountShell';
import { RING } from '@/components/ds';
import ThemeToggle from '@/components/ThemeToggle';

/**
 * Account overview.
 *
 * Rebuilt on AccountShell. Two defects fixed along the way:
 *
 *  1. The old menu linked to /admin and /admin/users — routes that no longer
 *     exist (admin is a separate product/repo). Those were dead links.
 *  2. Two entries pointed at "#", and "My Reviews" pointed at /bookings.
 *     Placeholder destinations are worse than no entry, so they are gone.
 *
 * Mock-data surfaces (/wallet, /payments, /membership, /loyalty, /offers,
 * /wishlist, /reviews) are deliberately NOT surfaced here — see the account
 * audit in docs/migration-status-report.md.
 */
const SHORTCUTS = [
  { to: '/profile/edit', icon: MapPin, label: 'Profile & addresses', sub: 'Name, city, saved addresses' },
  { to: '/notification-settings', icon: Bell, label: 'Notifications', sub: 'Push, email and SMS preferences' },
  { to: '/bookings', icon: Calendar, label: 'My bookings', sub: 'Upcoming and past jobs' },
  { to: '/refunds', icon: Receipt, label: 'Refunds & disputes', sub: 'Track a request' },
  { to: '/support', icon: LifeBuoy, label: 'Support', sub: 'Tickets and help centre' },
  { to: '/legal', icon: ShieldCheck, label: 'Legal & policies', sub: 'Terms, privacy, refund policy' },
];

export default function Profile() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { servisaku.auth.me().then(setUser).catch(() => setUser(null)); }, []);

  const { data: bookings } = useQuery({
    queryKey: ['account-bookings'],
    queryFn: () => servisaku.entities.Booking.list?.() ?? [],
    enabled: !!user,
    staleTime: 60_000,
  });

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-ink-secondary" role="status">
        <LoaderCircle className="size-4 animate-spin" />
        <span className="text-caption">Loading your account…</span>
      </div>
    );
  }

  const list = Array.isArray(bookings) ? bookings : [];
  const active = list.filter((b) => !['completed', 'cancelled'].includes(b.status)).length;

  return (
    <AccountShell
      user={user}
      aside={(
        <div className={`flex flex-col gap-4 rounded-card bg-surface p-5 ${RING}`}>
          <h2 className="font-display text-h4 font-semibold text-ink">Appearance</h2>
          <ThemeToggle />
          <p className="text-xs text-ink-tertiary">
            ServisAku · Klang Valley, Malaysia
          </p>
        </div>
      )}
    >
      {/* At-a-glance */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`rounded-card bg-surface p-5 ${RING}`}>
          <span className="sa-caps text-ink-tertiary">Active bookings</span>
          <p className="sa-num mt-1 text-h1 font-semibold text-ink">{active}</p>
        </div>
        <button
          onClick={() => navigate('/catalog')}
          className="flex items-center gap-3 rounded-card bg-grad-brand p-5 text-left text-white shadow-brand transition hover:brightness-[0.94] active:scale-[0.99]"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-white/20">
            <Sparkles className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-h4 font-semibold">Book a service</span>
            <span className="block text-caption font-normal text-white/85">71 services, upfront pricing</span>
          </span>
          <ChevronRight className="size-5 shrink-0" />
        </button>
      </div>

      {/* Shortcuts */}
      <div className={`overflow-hidden rounded-card bg-surface ${RING}`}>
        {SHORTCUTS.map(({ to, icon: Icon, label, sub }) => (
          <Link
            key={to}
            to={to}
            className="flex min-h-11 items-center gap-4 px-5 py-4 shadow-[inset_0_-1px_0_rgb(var(--hairline))] transition-colors last:shadow-none hover:bg-raised"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-grad-brand-soft text-brand-ink">
              <Icon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-caption font-semibold text-ink">{label}</span>
              <span className="block text-xs text-ink-secondary">{sub}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-ink-tertiary" />
          </Link>
        ))}
      </div>

      {/* Partner entry point — only for partner accounts. */}
      {user.role === 'partner' && (
        <Link
          to="/partner"
          className={`flex min-h-11 items-center gap-4 rounded-card bg-surface px-5 py-4 transition-colors hover:bg-raised ${RING}`}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-grad-brand-soft text-brand-ink">
            <Wrench className="size-[18px]" />
          </span>
          <span className="flex-1">
            <span className="block text-caption font-semibold text-ink">Partner dashboard</span>
            <span className="block text-xs text-ink-secondary">Jobs, earnings, availability</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-tertiary" />
        </Link>
      )}
    </AccountShell>
  );
}
