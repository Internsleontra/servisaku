import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, ArrowRight, LayoutGrid, List, MapPin, ShieldCheck, Star,
  Sparkles, Wind, Droplet, Droplets, Zap, Paintbrush, PaintRoller, Bug, Scissors,
  Wrench, Hammer, Drill, Clock, Home,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { servisaku } from '@/api/servisakuClient';
import { cn, formatMYR, formatDuration } from '@/lib/utils';
import { Chip } from '@/components/ds';
import CategoryTiles from '@/components/CategoryTiles';
import { serviceImageFor } from '@/lib/serviceImages';
import { variants, safeMotion } from '@/lib/design/motion';
import { useTranslation } from '@/lib/useTranslation';

// icon_key / accent (seeded) → presentation, + curated images where slugs match.
const ICONS = { Sparkles, Wind, Droplet, Droplets, Zap, Paintbrush, PaintRoller, Bug, Scissors, Wrench, Hammer, Drill, Clock, Home };
const TONES = {
  pink: 'bg-chat-tint text-chat', slate: 'bg-raised text-ink-secondary', emerald: 'bg-success-tint text-success',
  lime: 'bg-success-tint text-success', sky: 'bg-info-tint text-info', orange: 'bg-brand-tint text-brand',
  amber: 'bg-warning-tint text-warning', blue: 'bg-info-tint text-info', stone: 'bg-raised text-ink-secondary',
  violet: 'bg-chat-tint text-chat', teal: 'bg-success-tint text-success', red: 'bg-danger-tint text-danger',
};
const IMAGES = {
  cleaning: '/img/cleaning-new.jpg', 'ac-services': '/img/ac-new.jpg', plumbing: '/img/plumbing-new.jpg',
  electrician: '/img/electrical-new.jpg', 'painting-renovation': '/img/painting-new.jpg', 'pest-control': '/img/pest-new.jpg',
};

// Live service summary (GET /services) → the card shape this page renders.
function mapService(s, catName) {
  const from = s.price_from > 0 ? s.price_from : s.visit_fee;
  return {
    id: s.slug,
    name: s.name,
    nameMy: s.name_my,
    description: s.description || catName || '',
    descriptionMy: s.description_my || catName || '',
    price: from > 0 ? `From ${formatMYR(Math.round(from))}` : 'Get quote',
    duration: formatDuration(s.duration_min, s.duration_max),
    icon: ICONS[s.icon_key] || Wrench,
    color: TONES[s.accent] || 'bg-brand-tint text-brand',
    image: serviceImageFor(s.slug) || IMAGES[s.category_slug] || null,
    categorySlug: s.category_slug,
    href: `/book-service/${s.slug}`,
  };
}

export default function Explore() {
  const { t, tField, lang } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialLocation = searchParams.get('loc') || 'Kuala Lumpur';
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) {
      setQuery(q);
    }
    const loc = searchParams.get('loc');
    if (loc !== null) {
      setLocation(loc);
    }
  }, [searchParams]);

  // Update URL when query changes (optional, but good UX)
  const handleQueryChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    const params = {};
    if (newQuery) params.q = newQuery;
    if (location) params.loc = location;
    setSearchParams(params);
  };

  const handleLocationChange = (e) => {
    const nextLocation = e.target.value;
    setLocation(nextLocation);
    const params = {};
    if (query) params.q = query;
    if (nextLocation) params.loc = nextLocation;
    setSearchParams(params);
  };

  // Live catalogue (all 71 services); falls back to the curated static list offline.
  const { data: liveCategories } = useQuery({
    queryKey: ['explore-categories'],
    queryFn: () => servisaku.catalog.getCategories(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: liveServices } = useQuery({
    queryKey: ['explore-services'],
    queryFn: () => servisaku.catalog.getServices(),
    staleTime: 5 * 60 * 1000,
  });

  const catNameBySlug = Object.fromEntries((liveCategories || []).map((c) => [c.slug, c.name]));
  const services = (liveServices || []).map((s) => mapService(s, catNameBySlug[s.category_slug]));

  const categoryChips = [
    { label: 'All', match: 'all' },
    ...(liveCategories || []).map((c) => ({ label: c.name, match: c.slug })),
  ];

  const filtered = services.filter((s) => {
    const searchable = `${s.name} ${s.description || ''} ${s.nameMy || ''} ${s.descriptionMy || ''}`.toLowerCase();
    const matchesQuery = searchable.includes(query.toLowerCase());
    const matchesCategory =
      activeCategory === 'all' ||
      (s.categorySlug ? s.categorySlug === activeCategory : searchable.includes(activeCategory));
    return matchesQuery && matchesCategory;
  });

  // "All" (no search) shows the 12 category cards; a chip or a search shows services.
  const showCategories = activeCategory === 'all' && !query.trim() && (liveCategories?.length || 0) > 0;

  const stagger = safeMotion(variants.stagger);
  const staggerItem = safeMotion(variants.staggerItem);

  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header + search. Replaces the sticky cream-hex bar; the
          two hardcoded cream hex values were the last arbitrary colours here. */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-12">
          <p className="sa-caps text-live">{t('Explore')}</p>
          <h1 className="text-display-2 mt-2 text-white">{t('Book a home service')}</h1>

          <div className="mt-6 grid gap-2 lg:grid-cols-[1fr_280px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-white/50" />
              <input
                type="text"
                aria-label="Search services"
                placeholder={lang === 'ms' ? 'Cari pembersihan, AC, paip...' : 'Search cleaning, AC, plumber...'}
                value={query}
                onChange={handleQueryChange}
                className="h-13 w-full rounded-field bg-white/10 pl-11 pr-4 text-md text-white outline-none ring-1 ring-inset ring-white/20 backdrop-blur placeholder:text-white/50 focus:ring-2 focus:ring-live"
              />
            </div>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-white/50" />
              <input
                type="text"
                aria-label="Location"
                value={location}
                onChange={handleLocationChange}
                placeholder="Kuala Lumpur"
                className="h-13 w-full rounded-field bg-white/10 pl-11 pr-4 text-md text-white outline-none ring-1 ring-inset ring-white/20 backdrop-blur placeholder:text-white/50 focus:ring-2 focus:ring-live"
              />
            </div>
            <button
              type="button"
              onClick={() => setViewMode(v => (v === 'list' ? 'grid' : 'list'))}
              aria-label={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
              className="hidden h-13 items-center justify-center gap-2 rounded-field bg-white/10 px-5 text-md font-semibold text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/20 lg:flex"
            >
              {viewMode === 'list' ? <LayoutGrid className="size-[18px]" /> : <List className="size-[18px]" />}
              {t('View')}
            </button>
          </div>
        </div>
      </div>

      {/* Category chips */}
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-6 md:px-8">
        <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
          {categoryChips.map(cat => (
            <Chip
              key={cat.match}
              selected={activeCategory === cat.match}
              onClick={() => setActiveCategory(cat.match)}
              className="shrink-0"
            >
              {t(cat.label)}
            </Chip>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 md:px-8">
        {showCategories ? (
          /* ─── "All" → Urban-Company-style category tiles ─── */
          <CategoryTiles categories={liveCategories} onPick={setActiveCategory} />
        ) : viewMode === 'list' ? (
          /* ─── List View ─── */
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            {...stagger}
            initial="initial"
            animate="animate"
            key="list"
          >
            {filtered.map(s => {
              const Icon = s.icon;
              return (
                <motion.div key={s.id} variants={staggerItem} whileHover={variants.pressable.whileHover} whileTap={variants.pressable.whileTap}>
                  <Link
                    to={s.href}
                    className="group flex items-center gap-4 rounded-lg border border-hairline/70 bg-surface p-4 shadow-e1 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-e3"
                  >
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-28">
                      {s.image ? (
                        <img
                          src={s.image}
                          alt={s.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className={cn('flex h-full w-full items-center justify-center', s.color)}>
                          <Icon className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', s.color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <h3 className="font-semibold text-base text-ink">{tField(s, 'name')}</h3>
                      </div>
                      <p className="text-sm text-ink-secondary mb-3 line-clamp-2">
                        {tField(s, 'description')}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-brand">{s.price}</span>
                        <div className="flex items-center gap-2">
                          <span className="hidden items-center gap-1 text-xs font-semibold text-success sm:inline-flex">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {t('Verified')}
                          </span>
                          <span className="rounded-full bg-raised px-2.5 py-1 text-xs text-ink-tertiary">{s.duration}</span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-ink-secondary group-hover:text-brand transition-colors shrink-0 ml-2" />
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          /* ─── Grid View ─── */
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
            {...stagger}
            initial="initial"
            animate="animate"
            key="grid"
          >
            {filtered.map(s => {
              const Icon = s.icon;
              return (
                <motion.div key={s.id} variants={staggerItem} whileHover={variants.pressable.whileHover} whileTap={variants.pressable.whileTap} className="h-full">
                  <Link
                    to={s.href}
                    className="group flex h-full flex-col overflow-hidden rounded-lg border border-hairline/70 bg-surface shadow-e1 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-e3"
                  >
                    {s.image ? (
                      <div className="w-full aspect-[4/3] bg-raised overflow-hidden relative">
                        <img src={s.image} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    ) : (
                      <div className={cn('w-full aspect-[4/3] flex items-center justify-center', s.color)}>
                        <Icon className="h-10 w-10 opacity-50" />
                      </div>
                    )}
                    <div className="p-4 flex flex-col items-start gap-1.5 flex-1">
                      <h3 className="font-semibold text-base text-ink group-hover:text-brand transition-colors line-clamp-2">{tField(s, 'name')}</h3>
                      <p className="text-xs text-ink-secondary mb-1 line-clamp-1">{tField(s, 'description')}</p>
                      <div className="mt-auto flex w-full items-center justify-between pt-3">
                        <span className="text-sm font-semibold text-brand">{s.price}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-secondary">
                          <Star className="h-3.5 w-3.5 fill-star text-star" />
                          4.8
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-ink-tertiary">
            <Search className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">{lang === 'ms' ? 'Tiada perkhidmatan dijumpai' : 'No services found'}</p>
            <p className="text-xs mt-1">{lang === 'ms' ? 'Cuba carian atau kategori lain' : 'Try a different search or category'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
