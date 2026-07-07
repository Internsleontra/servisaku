import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { formatMYR } from '@/lib/utils';
import { serviceImageFor } from '@/lib/serviceImages';
import { variants } from '@/lib/design/motion';

// Friendly label for the pricing model badge.
const PRICING_LABEL = {
  FIXED: 'Fixed price', TIERED: 'From', PER_UNIT: 'Per unit', TIER_QUANTITY: 'Per item',
  PER_SQFT: 'Per sqft', PER_HOUR: 'Per hour', DIAGNOSTIC: 'Call-out', BASE_PLUS_ADDONS: 'From',
};

const reduceMotion = typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CatalogCategory() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['catalog-category', slug],
    queryFn: () => servisaku.catalog.getCategoryServices(slug),
  });

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-brand" /></div>;
  }
  if (!data?.category) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-center text-ink-secondary">Category not found.</div>;
  }

  const { category, services } = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <button onClick={() => navigate('/catalog')} className="mb-3 flex items-center gap-1 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={16} /> All categories
      </button>
      <h1 className="font-display text-2xl font-bold text-ink">{category.name}</h1>
      <p className="mt-1 text-ink-secondary">{services.length} services</p>

      <motion.div
        className="mt-6 flex flex-col gap-3"
        initial={reduceMotion ? false : 'initial'}
        animate={reduceMotion ? false : 'animate'}
        variants={reduceMotion ? undefined : variants.stagger}
      >
        {services.map((s) => (
          <motion.button
            key={s.id}
            type="button"
            variants={reduceMotion ? undefined : variants.staggerItem}
            whileHover={reduceMotion ? undefined : { y: -2 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => navigate(`/book-service/${s.slug}`)}
            className="group flex items-center justify-between gap-4 rounded-2xl border border-hairline bg-surface p-3 text-left transition hover:border-brand/40 hover:shadow-e2"
          >
            {serviceImageFor(s.slug) && (
              <img
                src={serviceImageFor(s.slug)}
                alt={s.name}
                loading="lazy"
                className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{s.name}</span>
              <span className="mt-0.5 block text-sm text-ink-secondary">
                {PRICING_LABEL[s.pricing_type] || 'From'} {s.price_from > 0 ? formatMYR(s.price_from) : ''}
                {s.visit_fee > 0 && ` · ${formatMYR(s.visit_fee)} visit`}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-ink-tertiary transition group-hover:text-brand" />
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
