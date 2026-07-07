import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarCheck,
  Clock3,
  CreditCard,
  Heart,
  MapPin,
  ShieldCheck,
  Sparkles,
  TicketPercent,
  WalletCards,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { safeMotion, variants } from '@/lib/design/motion';
import { HeroSearch } from '@/components/home/HeroSearch';
import CategoryGrid from '@/components/home/CategoryGrid';
import VideoReels from '@/components/home/VideoReels';
import { TrustStrip } from '@/components/home/TrustStrip';
import { useTranslation } from '@/lib/useTranslation';
import { servisaku } from '@/api/servisakuClient';
import { serviceImageFor } from '@/lib/serviceImages';
import { formatMYR } from '@/lib/utils';

// Curated picks surfaced first in "Popular around Malaysia" (fall back to others).
const POPULAR_SLUGS = [
  'full-house-cleaning', 'ac-servicing', 'tap-repair-replacement',
  'interior-painting', 'fan-installation', 'cockroach-control',
];
const prettyCategory = (slug = '') => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const serviceBundles = [
  {
    title: 'Move-in Deep Clean',
    description: 'Apartment cleaning, bathroom detailing, kitchen degreasing',
    price: 'RM169',
    image: '/img/cleaning-card.jpg',
    badge: 'Most booked in KL',
  },
  {
    title: 'AC Care Pack',
    description: 'Jet wash, gas check, drainage flush, performance test',
    price: 'RM89',
    image: '/img/ac-card.jpg',
    badge: 'Same-day slots',
  },
  {
    title: 'Condo Quick Fix',
    description: 'Leaks, sockets, small repairs, inspection visit',
    price: 'RM69',
    image: '/img/plumbing-card.jpg',
    badge: 'Best for rentals',
  },
];

const cityChips = ['Kuala Lumpur', 'Petaling Jaya', 'Subang Jaya', 'Shah Alam', 'Cheras'];

const bookingSteps = [
  { icon: Sparkles, label: 'Pick a service', sub: 'Curated packages' },
  { icon: CalendarCheck, label: 'Choose time', sub: 'Today or later' },
  { icon: BadgeCheck, label: 'Meet your pro', sub: 'Verified partner' },
  { icon: WalletCards, label: 'Pay safely', sub: 'Card, FPX, e-wallet' },
];

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Live services for "Popular around Malaysia" — curated picks first, then fill to 12.
  const { data: allServices } = useQuery({
    queryKey: ['home-popular-services'],
    queryFn: () => servisaku.catalog.getServices(),
    staleTime: 5 * 60 * 1000,
  });
  const popular = (() => {
    if (!allServices?.length) return [];
    const bySlug = Object.fromEntries(allServices.map((s) => [s.slug, s]));
    const picked = POPULAR_SLUGS.map((sl) => bySlug[sl]).filter(Boolean);
    const rest = allServices.filter((s) => !POPULAR_SLUGS.includes(s.slug));
    return [...picked, ...rest].slice(0, 3);
  })();

  return (
    <motion.div
      className="min-h-screen bg-[#fbfaf7] font-inter text-ink"
      {...safeMotion(variants.fadeUp)}
    >
      <section className="relative overflow-hidden bg-[#f8f1e9] border-b border-hairline/50">
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#fbfaf7] to-transparent" />

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-5 pb-10 pt-8 md:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:pb-14 lg:pt-12">
          <div className="relative z-10 flex flex-col justify-center">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-1.5 text-xs font-bold text-ink shadow-e1">
                <Heart className="size-3.5 fill-brand text-brand" />
                {t('Malaysia-ready home services')}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-1.5 text-xs font-bold text-ink-secondary shadow-e1">
                <MapPin className="size-3.5 text-success" />
                Klang Valley
              </span>
            </div>

            <h1 className="max-w-3xl font-display text-[40px] font-bold leading-[1.05] text-ink md:text-[56px] lg:text-[64px]">
              {t('Book trusted help for every Malaysian home')}
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-ink-secondary md:text-lg">
              {t('ServisAku brings verified cleaners, AC technicians, plumbers, electricians, painters, and pest experts to your doorstep with upfront RM pricing.')}
            </p>

            <div className="mt-8">
              <HeroSearch />
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {cityChips.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => navigate(`/explore?loc=${encodeURIComponent(city)}`)}
                  className="shrink-0 rounded-full border border-hairline/60 bg-white px-3.5 py-2 text-xs font-bold text-ink-secondary shadow-e1 transition-colors hover:border-brand/40 hover:text-brand"
                >
                  {city}
                </button>
              ))}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {bookingSteps.map((step) => (
                <div key={step.label} className="rounded-lg border border-white/80 bg-white/75 p-3 shadow-e1 backdrop-blur">
                  <step.icon className="mb-3 size-5 text-brand" />
                  <p className="text-sm font-bold leading-tight text-ink">{t(step.label)}</p>
                  <p className="mt-1 text-[11px] font-semibold text-ink-tertiary">{t(step.sub)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 min-h-[430px] lg:min-h-[560px]">
            <div className="absolute right-0 top-0 h-full w-full overflow-hidden rounded-lg border border-white/70 bg-white shadow-e3">
              <img
                src="/img/hero-servisaku-pro.png"
                alt="ServisAku professional ready for home service bookings"
                className="h-full w-full object-contain object-center"
              />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/20 to-transparent" />
            </div>

            <div className="absolute bottom-5 left-5 right-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="rounded-lg bg-white p-4 shadow-float">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-tertiary">{t('Today in Kuala Lumpur')}</span>
                  <span className="rounded-full bg-success-tint px-2.5 py-1 text-xs font-bold text-success">{t('Live')}</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-hairline/70">
                  <div>
                    <p className="text-2xl font-extrabold text-ink">32K+</p>
                    <p className="text-[11px] font-semibold text-ink-tertiary">{t('jobs done')}</p>
                  </div>
                  <div className="pl-4">
                    <p className="text-2xl font-extrabold text-ink">4.8</p>
                    <p className="text-[11px] font-semibold text-ink-tertiary">{t('rating')}</p>
                  </div>
                  <div className="pl-4">
                    <p className="text-2xl font-extrabold text-ink">30m</p>
                    <p className="text-[11px] font-semibold text-ink-tertiary">{t('fast slots')}</p>
                  </div>
                </div>
              </div>

              <div className="hidden w-44 rounded-lg bg-ink p-4 text-white shadow-float sm:block">
                <div className="mb-5 flex items-center justify-between">
                  <ShieldCheck className="size-6 text-brand" />
                  <span className="text-xs font-bold text-white/60">SST ready</span>
                </div>
                <p className="text-sm font-bold leading-snug">{t('Insured work with secure payments')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto flex max-w-7xl flex-col gap-12 px-5 py-10 md:px-8 md:py-14">
        <CategoryGrid />

        <VideoReels />

        <section>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{t('Curated packages')}</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">{t('Popular around Malaysia')}</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/explore')}
              className="hidden items-center gap-2 text-sm font-bold text-brand transition-colors hover:text-brand-ink sm:flex"
            >
              {t('See all')} <ArrowRight className="size-4" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(popular.length ? popular : null)
              ? popular.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => navigate(`/book-service/${s.slug}`)}
                  className="group grid grid-cols-[112px_1fr] overflow-hidden rounded-lg border border-hairline/70 bg-white text-left shadow-e1 transition-all hover:-translate-y-0.5 hover:shadow-e3 sm:grid-cols-[140px_1fr]"
                >
                  <img
                    src={serviceImageFor(s.slug) || '/img/cleaning-card.jpg'}
                    alt={s.name}
                    className="h-full min-h-36 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="flex min-w-0 flex-col p-4">
                    <span className="mb-3 w-max rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-bold text-brand">{prettyCategory(s.category_slug)}</span>
                    <h3 className="text-base font-extrabold leading-tight text-ink">{s.name}</h3>
                    <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-ink-secondary">{s.description || `${prettyCategory(s.category_slug)} · book in a few taps`}</p>
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <span className="text-sm font-bold text-ink-secondary">{t('From')} <strong className="text-brand">{formatMYR(Math.round(s.price_from > 0 ? s.price_from : s.visit_fee))}</strong></span>
                      <ArrowRight className="size-4 text-ink-tertiary transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                    </div>
                  </div>
                </button>
              ))
              : serviceBundles.map((bundle) => (
                <button
                  key={bundle.title}
                  type="button"
                  onClick={() => navigate('/explore')}
                  className="group grid grid-cols-[112px_1fr] overflow-hidden rounded-lg border border-hairline/70 bg-white text-left shadow-e1 transition-all hover:-translate-y-0.5 hover:shadow-e3 sm:grid-cols-[140px_1fr]"
                >
                  <img src={bundle.image} alt={bundle.title} className="h-full min-h-36 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="flex min-w-0 flex-col p-4">
                    <span className="mb-3 w-max rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-bold text-brand">{t(bundle.badge)}</span>
                    <h3 className="text-base font-extrabold leading-tight text-ink">{t(bundle.title)}</h3>
                    <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-ink-secondary">{t(bundle.description)}</p>
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <span className="text-sm font-bold text-ink-secondary">{t('From')} <strong className="text-brand">{bundle.price}</strong></span>
                      <ArrowRight className="size-4 text-ink-tertiary transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-orange-100 bg-orange-50 p-5">
            <TicketPercent className="mb-5 size-7 text-brand" />
            <h3 className="text-lg font-extrabold leading-tight text-ink">{t('WELCOME20 for first bookings')}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-ink-secondary">{t('Get 20% off any service across Klang Valley, capped at RM50.')}</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
            <Clock3 className="mb-5 size-7 text-blue-600" />
            <h3 className="text-lg font-extrabold leading-tight text-ink">{t('Same-day home care')}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-ink-secondary">{t('Book cleaning, AC, plumbing, and electrical slots from morning to evening.')}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-5">
            <CreditCard className="mb-5 size-7 text-success" />
            <h3 className="text-lg font-extrabold leading-tight text-ink">{t('Local payment options')}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-ink-secondary">{t('Pay by card, FPX, Touch n Go, GrabPay, or secure in-app wallet.')}</p>
          </div>
        </section>

        <section className="grid gap-5 rounded-lg bg-ink p-5 text-white md:grid-cols-[1fr_auto] md:p-7">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white/70">
              <Bell className="size-4 text-brand" />
              {t('For condos, landed homes, offices, and rentals')}
            </div>
            <h2 className="max-w-2xl font-display text-2xl font-bold leading-tight md:text-3xl">
              {t('Keep your home running without calling five different contractors.')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/explore')}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-ink transition-colors hover:bg-brand hover:text-white"
          >
            {t('Start booking')} <ArrowRight className="size-4" />
          </button>
        </section>

        <TrustStrip />
      </main>
    </motion.div>
  );
}
