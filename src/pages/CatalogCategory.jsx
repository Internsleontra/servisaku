import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, ShieldCheck, Clock, MapPin } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { formatMYR } from '@/lib/utils';
import { serviceImageFor } from '@/lib/serviceImages';
import { iconFor } from '@/lib/categoryIcons';
import { ServiceCard } from '@/components/ds';
import { useTranslation } from '@/lib/useTranslation';

/* Pricing model → the label shown next to the figure. */
const PRICING_LABEL = {
  FIXED: 'Fixed price', TIERED: 'From', PER_UNIT: 'Per unit', TIER_QUANTITY: 'Per item',
  PER_SQFT: 'Per sqft', PER_HOUR: 'Per hour', DIAGNOSTIC: 'Call-out', BASE_PLUS_ADDONS: 'From',
};

export default function CatalogCategory() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['catalog-category', slug],
    queryFn: () => servisaku.catalog.getCategoryServices(slug),
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-brand" />
      </div>
    );
  }
  if (!data?.category) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-16 text-center text-ink-secondary md:px-8">
        {t('Category not found.')}
      </div>
    );
  }

  const { category, services } = data;
  const isInstant = category.slug === 'instant-help';
  const Icon = iconFor(category.slug);

  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header — the system's page-header pattern. Instant Help
          is the one surface that swaps the brand ramp for the orange one. */}
      <div className={isInstant ? 'bg-grad-instant text-white' : 'bg-grad-hero text-white'}>
        <div className="mx-auto w-full max-w-[1240px] px-5 py-10 md:px-8 md:pb-14">
          <button
            onClick={() => navigate('/catalog')}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" /> {t('All categories')}
          </button>

          <div className="flex items-start gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-md bg-white/15 text-white">
              <Icon className="size-7" />
            </span>
            <div>
              <h1 className="text-display-2 text-white">{category.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-5 text-md text-white/80">
                <span className="sa-num inline-flex items-center gap-1.5">
                  {services.length} {t('services')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4" /> {t('30-day warranty')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" /> {t('Same-day slots')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" /> Kuala Lumpur
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Service list — pulled up over the header edge, as in the kit. */}
      <div className="mx-auto -mt-8 w-full max-w-[1240px] px-5 md:px-8">
        <div className="grid gap-3.5 md:grid-cols-2">
          {services.map((s) => (
            <ServiceCard
              key={s.id}
              name={s.name}
              category={category.name}
              icon={Icon}
              image={serviceImageFor(s.slug)}
              price={s.price_from > 0 ? formatMYR(s.price_from) : '—'}
              unit={PRICING_LABEL[s.pricing_type] ? t(PRICING_LABEL[s.pricing_type]) : undefined}
              rating={4.9}
              ratingCount={s.rating_count ?? undefined}
              duration={s.duration_min ? `${Math.round(s.duration_min / 60 * 10) / 10} ${t('hrs')}` : undefined}
              onOpen={() => navigate(`/book-service/${s.slug}`)}
            />
          ))}
        </div>

        {services.length === 0 && (
          <p className="py-16 text-center text-ink-secondary">
            {t('No services in this category yet.')}
          </p>
        )}
      </div>
    </div>
  );
}
