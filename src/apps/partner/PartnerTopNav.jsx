import { Link } from 'react-router-dom';
import { Bell, User } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { usePartnerUnread } from './PartnerNotifications';
import { RING } from '@/components/ds';
import { cn } from '@/lib/utils';

// Canonical keyboard focus treatment. `ds/Button` carries this already, but a
// plain <Link> does not — nothing in the app CSS applies --focus-ring globally,
// so these links were falling back to the browser's default orange outline:auto.
// The `shadow:` type hint is required; a bare var() compiles to --tw-shadow-color.
const FOCUS = 'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]';

// Partner-side top bar (mobile; the sidebar takes over at lg+) — no consumer
// cart/search; just brand, notifications, and account.
export default function PartnerTopNav() {
  const { user } = useAuth();
  const unread = usePartnerUnread();

  // Inset ring, never border + shadow.
  const iconButton = cn(
    'relative grid size-11 place-items-center rounded-full bg-surface text-ink transition hover:bg-raised',
    RING,
    FOCUS,
  );

  return (
    <header className="fixed left-0 right-0 top-0 z-50 bg-surface py-3.5 shadow-[inset_0_-1px_0_rgb(var(--hairline))]">
      <div className="mx-auto flex w-full max-w-[1240px] items-center gap-4 px-4 lg:gap-6 lg:px-6">
        <Link
          to="/partner"
          className={cn('flex min-h-11 shrink-0 items-center rounded-field', FOCUS)}
          aria-label="ServisAku Partner home"
        >
          {/* Official wordmark. Was /img/servisaku-logo.png — the pre-rebrand
              ORANGE logo, which contradicted the blue identity everywhere else. */}
          <img
            src="/img/brand/logo-wordmark.png"
            alt="ServisAku"
            className="h-[18px] w-auto object-contain lg:h-5"
          />
          <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand">
            Partner
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-4">
          <Link to="/notifications" aria-label="Notifications" className={iconButton}>
            <Bell className="size-5" aria-hidden="true" />
            {unread > 0 && (
              <span className="sa-num absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                {unread > 99 ? '99+' : unread}
                <span className="sr-only"> unread notifications</span>
              </span>
            )}
          </Link>

          <Link to={user ? '/profile' : '/otp-login'} aria-label="Account" className={iconButton}>
            {user?.full_name
              ? <span className="text-caption font-semibold text-brand">{user.full_name.charAt(0).toUpperCase()}</span>
              : <User className="size-5" aria-hidden="true" />}
          </Link>
        </div>
      </div>
    </header>
  );
}
