import { Link } from 'react-router-dom';
import { Bell, User } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

// Partner-side top bar — no consumer cart/search; just brand, notifications,
// and account.
export default function PartnerTopNav() {
  const { user } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-hairline/40 bg-surface py-3.5">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 lg:gap-6 lg:px-6">
        <Link to="/partner" className="flex shrink-0 items-center">
          <img src="/img/servisaku-logo.png" alt="ServisAku Partner" className="h-8 w-auto object-contain lg:h-9" />
          <span className="ml-2 rounded-md bg-brand/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-brand">
            Partner
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-4">
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface text-ink hover:bg-raised transition-colors"
          >
            <Bell className="h-5 w-5" />
          </Link>

          <Link
            to={user ? '/profile' : '/otp-login'}
            aria-label="Account"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface text-ink hover:bg-raised transition-colors"
          >
            {user?.full_name
              ? <span className="text-sm font-bold text-brand">{user.full_name.charAt(0).toUpperCase()}</span>
              : <User className="h-5 w-5" />}
          </Link>
        </div>
      </div>
    </header>
  );
}
