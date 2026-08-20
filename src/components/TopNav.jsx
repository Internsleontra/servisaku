import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MapPin, User, ArrowRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { useTranslation } from '@/lib/useTranslation';

/**
 * Consumer site header — ports WebNav from the design system's consumer website
 * kit (ui_kits/consumer_web/WebShell.jsx).
 *
 * System spec: glass sticky header, 76px tall, 1240px container, 32px gutters,
 * links at 13px/medium, city indicator, then ghost "Log in" + primary CTA.
 *
 * The previous nav carried a cart icon linking to /cart — a route that has never
 * existed and 404s. There is no cart in the product (booking is single-service),
 * so the control is removed rather than pointed somewhere arbitrary.
 */
const LINKS = [
  { label: 'Services', to: '/catalog' },
  { label: 'Instant Help', to: '/catalog/instant-help', accent: true },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Pricing', to: '/promos' },
  { label: 'Help', to: '/help' },
];

export default function TopNav() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-surface/[0.86] shadow-[inset_0_-1px_0_rgb(var(--hairline))] backdrop-blur-[18px] backdrop-saturate-150">
      <div className="mx-auto flex h-[76px] w-full max-w-[1240px] items-center gap-6 px-5 md:px-8">

        <Link to="/" className="flex shrink-0 items-center" aria-label={t('ServisAku home')}>
          <img
            src="/img/brand/logo-wordmark.png"
            alt="ServisAku"
            className="h-5 w-auto object-contain"
          />
        </Link>

        <nav className="hidden items-center gap-[26px] lg:flex">
          {LINKS.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.label}
                to={l.to}
                className={cn(
                  'inline-flex items-center gap-1.5 text-caption transition-colors hover:text-brand',
                  active ? 'text-brand' : 'text-ink',
                )}
              >
                {l.accent && <Zap className="size-3.5 text-warning" />}
                {t(l.label)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1.5 text-caption font-normal text-ink-secondary md:inline-flex">
            <MapPin className="size-[15px]" /> Kuala Lumpur
          </span>

          {user ? (
            <Link
              to="/profile"
              aria-label={t('Account')}
              className="grid size-11 place-items-center rounded-full bg-raised text-ink transition-colors hover:bg-brand-tint"
            >
              {user.full_name
                ? <span className="text-caption font-semibold text-brand">{user.full_name.charAt(0).toUpperCase()}</span>
                : <User className="size-5" />}
            </Link>
          ) : (
            <Link
              to="/otp-login"
              className="hidden h-11 items-center rounded-field px-4 text-caption text-ink transition-colors hover:bg-raised sm:inline-flex"
            >
              {t('Log in')}
            </Link>
          )}

          <button
            onClick={() => navigate('/catalog')}
            className="inline-flex h-11 items-center gap-2 rounded-field bg-grad-brand px-5 text-caption font-semibold text-white shadow-brand transition hover:brightness-[0.94] active:scale-[0.97]"
          >
            {t('Book a service')} <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
