import { Link, useNavigate } from 'react-router-dom';
import { MapPin, ShoppingCart, ChevronDown, Search, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useTranslation } from '@/lib/useTranslation';

export default function TopNav() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(`/explore${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  };

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b bg-surface transition-all duration-200',
        scrolled ? 'border-hairline/60 shadow-sm py-2.5' : 'border-hairline/40 py-3.5',
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 lg:gap-6 lg:px-6">

        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center">
          <img src="/img/servisaku-logo.png" alt="ServisAku" className="h-8 w-auto object-contain lg:h-9" />
        </Link>

        {/* Primary nav — Explore, Bookings */}
        <nav className="hidden items-center gap-6 lg:flex">
          <Link to="/explore" className="text-[15px] font-semibold text-ink hover:text-brand transition-colors">
            {t('Explore')}
          </Link>
          <Link to="/bookings" className="text-[15px] font-semibold text-ink hover:text-brand transition-colors">
            {t('Bookings')}
          </Link>
        </nav>

        {/* Location + Search (UC-style), grows to fill */}
        <div className="hidden flex-1 items-center gap-3 md:flex">
          <button
            type="button"
            onClick={() => navigate('/explore?loc=Kuala%20Lumpur')}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-ink hover:bg-raised transition-colors"
          >
            <MapPin className="h-4 w-4 text-success" />
            <span className="max-w-[120px] truncate text-sm font-medium">Kuala Lumpur</span>
            <ChevronDown className="h-4 w-4 text-ink-tertiary" />
          </button>

          <form onSubmit={submitSearch} className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search for 'AC service'")}
              className="w-full rounded-xl border border-hairline bg-surface py-2.5 pl-11 pr-4 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-brand/30"
            />
          </form>
        </div>

        {/* Right: cart + account */}
        <div className="flex shrink-0 items-center gap-2 lg:gap-4">
          <Link
            to="/cart"
            aria-label="Cart"
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface text-ink hover:bg-raised transition-colors"
          >
            <ShoppingCart className="h-5 w-5" />
          </Link>

          {user ? (
            <Link
              to="/profile"
              aria-label="Account"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface text-ink hover:bg-raised transition-colors"
            >
              {user.full_name
                ? <span className="text-sm font-bold text-brand">{user.full_name.charAt(0).toUpperCase()}</span>
                : <User className="h-5 w-5" />}
            </Link>
          ) : (
            <Link
              to="/otp-login"
              aria-label="Log in"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface text-ink hover:bg-raised transition-colors"
            >
              <User className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
