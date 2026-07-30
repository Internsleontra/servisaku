import { Sparkles, Wind, Droplets, Zap, Paintbrush, Bug, Star, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { servisaku } from '@/api/servisakuClient';
import { useTranslation } from '@/lib/useTranslation';
import CategoryTiles from '@/components/CategoryTiles';

// Offline fallback — the original curated six image cards.
const FALLBACK = [
  { slug: 'home-cleaning', title: 'Home Cleaning', price: 35, img: '/img/cleaning-new.jpg', Icon: Sparkles, tone: 'bg-orange-50 text-brand', sub: 'Daily, deep, move-in' },
  { slug: 'ac-servicing', title: 'AC Service & Repair', price: 60, img: '/img/ac-new.jpg', Icon: Wind, tone: 'bg-blue-50 text-blue-600', sub: 'Service, repair, gas top-up' },
  { slug: 'plumbing', title: 'Plumbing', price: 50, img: '/img/plumbing-new.jpg', Icon: Droplets, tone: 'bg-emerald-50 text-success', sub: 'Leaks, taps, bathroom' },
  { slug: 'electrical', title: 'Electrical Services', price: 79, img: '/img/electrical-new.jpg', Icon: Zap, tone: 'bg-amber-50 text-warning', sub: 'Sockets, fans, wiring' },
  { slug: 'painting', title: 'Painting', price: 199, img: '/img/painting-new.jpg', Icon: Paintbrush, tone: 'bg-violet-50 text-violet-600', sub: 'Room, condo, exterior' },
  { slug: 'pest-control', title: 'Pest Control', price: 99, img: '/img/pest-new.jpg', Icon: Bug, tone: 'bg-red-50 text-danger', sub: 'Termites, roaches, ants' },
];

export default function CategoryGrid() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: live } = useQuery({
    queryKey: ['home-categories'],
    queryFn: () => servisaku.catalog.getCategories(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{t('Book by category')}</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">{t('Services for Malaysian homes')}</h2>
        </div>
        <button
          type="button"
          onClick={() => navigate('/catalog')}
          className="hidden text-sm font-bold text-brand transition-colors hover:text-brand-ink sm:block"
        >
          {t('View All Services')}
        </button>
      </div>

      {live?.length ? (
        <CategoryTiles categories={live} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {FALLBACK.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => navigate(`/catalog/${cat.slug}`)}
              className="group overflow-hidden rounded-lg border border-hairline/70 bg-surface text-left shadow-e1 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-e3"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-raised">
                <img src={cat.img} alt={cat.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-extrabold text-ink shadow-e1">RM{cat.price}+</div>
              </div>
              <div className="p-3">
                <div className={`mb-3 flex size-9 items-center justify-center rounded-lg ${cat.tone}`}>
                  <cat.Icon className="h-4 w-4" />
                </div>
                <h3 className="min-h-10 text-sm font-extrabold leading-tight text-ink">{cat.title}</h3>
                <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-ink-tertiary">{cat.sub}</p>
                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-bold text-ink-secondary">
                  <span className="inline-flex items-center gap-1"><Star className="size-3 fill-amber-400 text-amber-400" />4.8</span>
                  <span className="inline-flex items-center gap-1 text-success"><ShieldCheck className="size-3" /> Verified</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
