import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Zap, ArrowRight } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { WebSection } from '@/components/site/WebSection';
import { CategoryTile, Chip } from '@/components/ds';
import { CATEGORY_ICON } from '@/lib/categoryIcons';
import { avatarFor } from '@/lib/categoryAvatars';
import { useTranslation } from '@/lib/useTranslation';

/* The Instant Help lane offers TWO services. The design system's landing band
   shows six, which is aspirational — the seeded catalogue
   (prisma/data/servisaku-services-config.json) is authoritative and the kit is
   being corrected to match. Do not re-add the other four. */
const INSTANT_SERVICES = ['Instant Hourly Handyman', 'Emergency Diagnostic / Call-Out'];

/**
 * Catalogue index.
 *
 * Instant Help is a LANE, not a category — the API returns it as a row in
 * /api/categories, but the design system counts eleven categories and keeps
 * Instant Help visually and semantically separate. That split is handled here
 * in the presentation layer; the API and the design system both stay as they are.
 */
export default function Catalog() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: categories, isLoading } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => servisaku.catalog.getCategories(),
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-brand" />
      </div>
    );
  }

  const bookable = (categories || []).filter((c) => c.slug !== 'instant-help');
  const instant = (categories || []).find((c) => c.slug === 'instant-help');

  if (!bookable.length) {
    return (
      <WebSection title={t('The catalogue isn’t available yet.')}>
        <p className="text-lead text-ink-secondary">
          {t('Seed the booking engine (')}<code className="sa-num">npm run db:seed:booking-engine</code>{t(') to populate it.')}
        </p>
      </WebSection>
    );
  }

  return (
    <>
      <WebSection
        titleAs="h1"
        eyebrow={t('The catalogue')}
        title={t('Eleven categories, seventy-one services.')}
        body={t('Every service has a fixed price, a duration and a warranty before you book.')}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {bookable.map((c) => (
            <CategoryTile
              key={c.id}
              label={c.name}
              image={avatarFor(c.slug)}
              icon={CATEGORY_ICON[c.slug]}
              count={c.service_count ?? undefined}
              onClick={() => navigate(`/catalog/${c.slug}`)}
            />
          ))}
        </div>
      </WebSection>

      {/* Instant Help — its own lane, the one sanctioned orange surface. */}
      {instant && (
        <WebSection tone="card">
          <div className="grid items-center gap-6 lg:grid-cols-2">
            <div>
              <div className="sa-caps mb-2.5 text-warning">{t('Instant Help')}</div>
              <h2 className="text-display-3 text-ink">
                {t('Burst pipe at 11pm? Dispatched in minutes.').split('|').map((part, i, all) => (
                  <span key={part}>{part}{i < all.length - 1 && <br />}</span>
                ))}
              </h2>
              <p className="mt-3.5 max-w-[460px] text-lead text-ink-secondary">
                {t('Two emergency services run on a separate on-demand queue with live ETAs — no slot picking, no waiting for a callback.')}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {INSTANT_SERVICES.map((svc) => (
                  <Chip key={svc} icon={Zap}>{t(svc)}</Chip>
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
                <span className="block font-display text-h4 font-semibold">{t('Instant Help')}</span>
                <span className="block text-caption font-normal text-white/85">
                  {t('Emergency pros, dispatched in minutes')}
                </span>
              </span>
              <ArrowRight className="size-5 shrink-0" />
            </button>
          </div>
        </WebSection>
      )}
    </>
  );
}
