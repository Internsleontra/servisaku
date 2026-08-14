import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Search, ArrowRight, Sparkles, CalendarCheck, ShieldCheck, Lock, Star, Zap,
  SprayCan, AirVent, Wrench, Bug, Scissors, UserRound, WashingMachine, Hammer,
  PaintRoller, Drill, House, ChevronRight, Apple, Play, BadgeCheck,
} from 'lucide-react';
import { safeMotion, variants } from '@/lib/design/motion';
import { WebSection } from '@/components/site/WebSection';
import { servisaku } from '@/api/servisakuClient';
import { formatMYR } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { avatarFor } from '@/lib/categoryAvatars';

/* Category glyphs are fixed by the design system — do not improvise per slug. */
const CATEGORY_ICON = {
  'beauty-wellness-women': Scissors,
  'mens-grooming-massage': UserRound,
  cleaning: SprayCan,
  'pest-control': Bug,
  'ac-services': AirVent,
  'appliance-repair': WashingMachine,
  electrician: Zap,
  plumbing: Wrench,
  carpenter: Hammer,
  'painting-renovation': PaintRoller,
  'handyman-installation': Drill,
  'instant-help': Zap,
};

const STEPS = [
  [Search, 'Pick a service', 'Browse 71 services across 11 categories, with upfront pricing.'],
  [CalendarCheck, 'Choose a slot', 'Same-day windows from 9:30 AM, seven days a week.'],
  [ShieldCheck, 'Pro arrives verified', 'KYC-checked, rated, tracked live from doorstep to done.'],
  [Lock, 'Pay from escrow', 'Money is released only after you confirm the job.'],
];

/* The Instant Help lane offers TWO services. The design system's landing band
   shows six, which is aspirational — the seeded catalogue
   (prisma/data/servisaku-services-config.json) is authoritative and the kit is
   being corrected to match. Do not re-add the other four. */
const INSTANT_SERVICES = ['Instant Hourly Handyman', 'Emergency Diagnostic / Call-Out'];

const TRUST = [
  [Lock, 'Escrow on every job', 'Your payment is held until you confirm the work is done. Refunds and disputes are handled in-app.'],
  [ShieldCheck, 'KYC-verified pros', 'IC, SSM and skill documents checked before a partner takes a single booking.'],
  [Star, '4.87 average rating', 'Every job is rated. Partners below 4.5 stop receiving work until retrained.'],
];

const REVIEWS = [
  ['Tan Wei Ming', 'Home Deep Cleaning', 'Team arrived on time and the kitchen looks brand new. Booking and payment were painless.'],
  ['Farah Idris', 'AC Service', 'Technician showed the gas pressure reading before and after. No upselling at all.'],
  ['Ravi Kumar', 'Emergency Plumber', 'Booked at 10:40pm, pro was at my door by 11:05pm. Worth every ringgit.'],
];

const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/* Inset hairline ring — the system's border primitive. Never `border` + shadow
   on the same element, and selection thickens the ring rather than swapping to
   a 2px border, so nothing shifts by a pixel. */
const RING = 'shadow-[inset_0_0_0_1px_rgb(var(--hairline))]';

export default function Home() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['home-categories'],
    queryFn: () => servisaku.catalog.getCategories(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: allServices } = useQuery({
    queryKey: ['home-popular-services'],
    queryFn: () => servisaku.catalog.getServices(),
    staleTime: 5 * 60 * 1000,
  });

  const featured = (allServices || []).slice(0, 2);
  const bookable = (categories || []).filter((c) => c.slug !== 'instant-help');

  const search = () => navigate(q.trim() ? `/explore?q=${encodeURIComponent(q.trim())}` : '/catalog');

  return (
    <motion.div className="min-h-screen bg-bg" {...safeMotion(variants.fadeUp)}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-grad-hero text-white">
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-14 px-5 py-16 md:px-8 md:py-[84px] lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="sa-caps inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-white ring-1 ring-inset ring-white/20">
              <Sparkles className="size-3.5" /> Now serving 5 cities
            </span>

            <h1 className="text-display-1 mt-5 mb-4 text-white">
              Home help you<br />don&apos;t have to chase.
            </h1>

            <p className="max-w-[520px] text-xl text-white/[0.78]">
              Book verified professionals for cleaning, AC, beauty, repairs and
              emergencies — fixed prices, live tracking, escrow-protected payment.
            </p>

            <div className="mt-7 flex max-w-[560px] flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-white/50" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && search()}
                  placeholder="Try 'deep cleaning' or 'AC service'"
                  aria-label="Search services"
                  className="h-13 w-full rounded-field bg-white/10 pl-11 pr-4 text-md text-white outline-none ring-1 ring-inset ring-white/20 backdrop-blur placeholder:text-white/50 focus:ring-2 focus:ring-live"
                />
              </div>
              <button
                onClick={search}
                className="inline-flex h-13 shrink-0 items-center justify-center gap-2 rounded-field bg-grad-brand px-6 font-semibold text-white shadow-brand transition hover:brightness-[0.94] active:scale-[0.97]"
              >
                Find a pro <ArrowRight className="size-[18px]" />
              </button>
            </div>

            <div className="mt-8 flex gap-7">
              {[['4.87', 'Average rating'], ['71', 'Services'], ['38k', 'Jobs completed']].map(([v, l]) => (
                <div key={l}>
                  <div className="sa-num text-[30px] font-medium leading-none">{v}</div>
                  <div className="mt-1.5 text-xs text-white/60">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right rail — live-tracking card + two service cards */}
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-3.5 rounded-card bg-white/10 p-[18px] ring-1 ring-inset ring-white/[0.16] backdrop-blur">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold text-white ring-1 ring-inset ring-white/20">
                NA
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold">Nurul is on the way</div>
                <div className="text-caption font-normal text-white/70">Sofa Cleaning · 2.4 km away</div>
              </div>
              <span className="sa-num shrink-0 font-semibold text-live">9:40 AM</span>
            </div>

            {featured.map((s) => {
              const Icon = CATEGORY_ICON[s.category_slug] || Sparkles;
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/book-service/${s.slug}`)}
                  className="group flex items-center gap-4 rounded-card bg-surface p-4 text-left text-ink transition hover:-translate-y-0.5 hover:shadow-e2"
                >
                  <span className="grid size-14 shrink-0 place-items-center rounded-sm bg-grad-brand-soft text-brand-ink">
                    <Icon className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sa-caps block text-ink-tertiary">
                      {s.category_name || 'Service'}
                    </span>
                    <span className="mt-0.5 block truncate font-display font-semibold text-ink">
                      {s.name}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-caption text-ink-secondary">
                      <span className="sa-num inline-flex items-center gap-1 text-ink">
                        <Star className="size-3.5 fill-star text-star" /> 4.9
                      </span>
                      <span className="sa-num">{formatMYR(s.price_from)}</span>
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-ink-tertiary transition group-hover:text-brand" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Catalogue ────────────────────────────────────────────────────── */}
      <WebSection
        eyebrow="The catalogue"
        title="Eleven categories, seventy-one services."
        body="Every service has a fixed price, a duration and a warranty before you book."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {bookable.map((c) => {
            const Icon = CATEGORY_ICON[c.slug] || House;
            const avatar = avatarFor(c.slug);
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/catalog/${c.slug}`)}
                className={cn(
                  'group flex flex-col gap-3 rounded-card bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:shadow-e2',
                  RING,
                )}
              >
                {/* Category artwork when it exists, glyph otherwise. Shown bare
                    because the artwork has an opaque white background and would
                    read as a white square inside the tinted box. */}
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="size-14 shrink-0 rounded-sm object-contain"
                  />
                ) : (
                  <span className="grid size-11 place-items-center rounded-sm bg-grad-brand-soft text-brand-ink">
                    <Icon className="size-[22px]" />
                  </span>
                )}
                <span className="text-caption font-semibold leading-snug text-ink">{c.name}</span>
                <span className="sa-num text-xs text-ink-tertiary">
                  {c.service_count ?? 0} services
                </span>
              </button>
            );
          })}

          {/* Instant Help is category 12 and the one sanctioned orange surface. */}
          <button
            onClick={() => navigate('/catalog/instant-help')}
            className="group flex flex-col gap-3 rounded-card bg-grad-deep p-4 text-left text-white transition hover:-translate-y-0.5 hover:shadow-e2"
          >
            <span className="grid size-11 place-items-center rounded-sm bg-white/10 text-live">
              <Zap className="size-[22px]" />
            </span>
            <span className="text-caption font-semibold leading-snug text-white">Instant Help</span>
            <span className="text-xs text-white/60">Emergency</span>
          </button>
        </div>
      </WebSection>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <WebSection tone="card" eyebrow="How it works" title="Four steps, no phone calls.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([Icon, title, body], i) => (
            <div key={title} className={cn('flex flex-col gap-2.5 rounded-card p-5', RING)}>
              <span className="grid size-11 place-items-center rounded-sm bg-grad-brand-soft text-brand-ink">
                <Icon className="size-[22px]" />
              </span>
              <span className="sa-num text-xs text-ink-tertiary">0{i + 1}</span>
              <div className="font-display text-h4 font-semibold text-ink">{title}</div>
              <p className="text-caption font-normal text-ink-secondary">{body}</p>
            </div>
          ))}
        </div>
      </WebSection>

      {/* ── Instant Help band ────────────────────────────────────────────── */}
      <WebSection tone="paper">
        <div className="grid items-center gap-6 lg:grid-cols-2">
          <div>
            <div className="sa-caps mb-2.5 text-warning">Instant Help</div>
            <h2 className="text-display-3 text-ink">
              Burst pipe at 11pm?<br />Dispatched in minutes.
            </h2>
            <p className="mt-3.5 max-w-[460px] text-lead text-ink-secondary">
              Two emergency services run on a separate on-demand queue with live ETAs —
              no slot picking, no waiting for a callback.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {INSTANT_SERVICES.map((t) => (
                <span
                  key={t}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-caption text-ink-secondary',
                    RING,
                  )}
                >
                  <Zap className="size-3.5 text-warning" /> {t}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={() => navigate('/catalog/instant-help')}
            className="flex items-center gap-4 rounded-card bg-grad-instant p-6 text-left text-white shadow-instant transition hover:brightness-[0.96] active:scale-[0.99]"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-white/20">
              <Zap className="size-6" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-h4 font-semibold">Instant Help</span>
              <span className="block text-caption font-normal text-white/85">
                Emergency pros, dispatched in minutes
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="sa-caps block text-white/70">ETA</span>
              <span className="sa-num block font-semibold">~18 min</span>
            </span>
          </button>
        </div>
      </WebSection>

      {/* ── Trust ────────────────────────────────────────────────────────── */}
      <WebSection
        tone="dark"
        eyebrow="Why people stay"
        title="Trust is the product."
        body="Escrow, KYC and ratings are not features we advertise — they are how every booking works by default."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {TRUST.map(([Icon, title, body]) => (
            <div
              key={title}
              className="flex flex-col gap-2.5 rounded-card bg-white/10 p-5 ring-1 ring-inset ring-white/[0.16] backdrop-blur"
            >
              <Icon className="size-6 text-live" />
              <div className="font-display text-h4 font-semibold text-white">{title}</div>
              <p className="text-caption font-normal text-white/[0.72]">{body}</p>
            </div>
          ))}
        </div>
      </WebSection>

      {/* ── Reviews ──────────────────────────────────────────────────────── */}
      <WebSection tone="card" eyebrow="Reviews" title="What customers say.">
        <div className="grid gap-4 lg:grid-cols-3">
          {REVIEWS.map(([name, service, text]) => (
            <div key={name} className={cn('flex flex-col gap-3 rounded-card p-5', RING)}>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="size-4 fill-star text-star" />
                ))}
              </div>
              <p className="text-md text-ink">{text}</p>
              <div className="mt-auto flex items-center gap-2.5 pt-1">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy text-xs font-semibold text-white">
                  {initials(name)}
                </span>
                <div>
                  <div className="text-caption font-semibold text-ink">{name}</div>
                  <div className="flex items-center gap-1 text-xs text-ink-tertiary">
                    {service} · <BadgeCheck className="size-3" /> Verified booking
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </WebSection>

      {/* ── App CTA ──────────────────────────────────────────────────────── */}
      <WebSection tone="paper">
        <div className="overflow-hidden rounded-card bg-grad-brand">
          <div className="grid items-center gap-6 p-8 md:grid-cols-[1.2fr_1fr] md:p-10">
            <div>
              <h2 className="text-display-3 text-white">Track your pro from the app.</h2>
              <p className="mt-3 max-w-[460px] text-lead text-white/85">
                Live location, in-app chat, invoices and one-tap rebooking.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {[[Apple, 'App Store'], [Play, 'Google Play']].map(([Icon, label]) => (
                  <span
                    key={label}
                    className="inline-flex h-13 items-center gap-2 rounded-field bg-white/15 px-6 font-semibold text-white ring-1 ring-inset ring-white/25"
                  >
                    <Icon className="size-5" /> {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <img
                src="/img/brand/logo-mark-white.png"
                alt=""
                className="h-[150px] w-auto opacity-90"
              />
            </div>
          </div>
        </div>
      </WebSection>
    </motion.div>
  );
}
