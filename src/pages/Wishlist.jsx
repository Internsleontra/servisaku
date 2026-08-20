import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, LayoutGrid, List } from 'lucide-react';
import { serviceImageFor } from '@/lib/serviceImages';
import { formatMYR } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/useTranslation';

const MOCK = {
  services: [
    { slug: 'full-house-cleaning', name: 'Full House Cleaning', category: 'Cleaning', price: 120 },
    { slug: 'ac-servicing', name: 'AC Servicing', category: 'AC Services', price: 20 },
    { slug: 'interior-painting', name: 'Interior Painting', category: 'Painting', price: 3 },
    { slug: 'cockroach-control', name: 'Cockroach Control', category: 'Pest Control', price: 120 },
  ],
  categories: [{ slug: 'cleaning', name: 'Cleaning' }, { slug: 'ac-services', name: 'AC Services' }],
  partners: [{ id: 'pr1', name: 'Ahmad R.', rating: 4.9, jobs: 240 }, { id: 'pr2', name: 'Siti N.', rating: 4.8, jobs: 180 }],
  recentlyViewed: [{ slug: 'sofa-cleaning', name: 'Sofa Cleaning' }, { slug: 'tap-repair-replacement', name: 'Tap Repair' }],
};

export default function Wishlist() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [view, setView] = useState('grid');
  useEffect(() => { const timer = setTimeout(() => setData(MOCK), 400); return () => clearTimeout(timer); }, []);

  const remove = (slug) => { setData(d => ({ ...d, services: d.services.filter(s => s.slug !== slug) })); toast.success(t('Removed from wishlist')); };

  return (
    <div className="font-inter min-h-screen bg-bg max-w-2xl mx-auto">
      <div className="flex items-center gap-3 px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-semibold flex-1">{t('Wishlist')}</h1>
        <button onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')} className="text-ink">{view === 'grid' ? <List className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}</button>
      </div>
      {!data ? <div className="px-5 grid grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="h-40 bg-surface rounded-2xl animate-pulse" />)}</div> : (
        <div className="px-5 space-y-6 pb-10">
          {data.services.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-ink-tertiary mb-2">{t('SAVED SERVICES')}</p>
              <div className={view === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
                {data.services.map(s => (
                  <div key={s.slug} className={`bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl overflow-hidden ${view === 'list' ? 'flex' : ''}`}>
                    <div className={`relative bg-brand-tint ${view === 'list' ? 'w-28 shrink-0' : 'h-28'}`}>
                      {serviceImageFor(s.slug) && <img src={serviceImageFor(s.slug)} alt={s.name} className="w-full h-full object-cover" />}
                      <button onClick={() => remove(s.slug)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center"><Heart className="h-4 w-4 text-white fill-white" /></button>
                    </div>
                    <div className="p-3 flex-1">
                      <p className="text-sm font-semibold truncate">{s.name}</p>
                      <p className="text-[10px] text-ink-tertiary">{s.category}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-sm font-semibold text-brand">from {formatMYR(s.price)}</span>
                        <button onClick={() => navigate(`/book-service/${s.slug}`)} className="text-[11px] font-semibold bg-brand text-white rounded-lg px-2.5 py-1">{t('Book')}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.partners.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-ink-tertiary mb-2">{t('FAVOURITE PROS')}</p>
              <div className="bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl divide-y divide-hairline/10">
                {data.partners.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-full bg-brand-tint flex items-center justify-center font-semibold text-brand">{p.name[0]}</div>
                    <div className="flex-1"><p className="text-sm font-semibold">{p.name}</p><p className="text-[11px] text-ink-tertiary">⭐ {p.rating} · {p.jobs} jobs</p></div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.categories.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-ink-tertiary mb-2">{t('SAVED CATEGORIES')}</p>
              <div className="flex flex-wrap gap-2">
                {data.categories.map(c => <button key={c.slug} onClick={() => navigate(`/catalog/${c.slug}`)} className="text-xs font-semibold bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-full px-3.5 py-2">{c.name}</button>)}
              </div>
            </div>
          )}
          {data.recentlyViewed.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-ink-tertiary mb-2">{t('RECENTLY VIEWED')}</p>
              <div className="flex flex-wrap gap-2">
                {data.recentlyViewed.map(r => <button key={r.slug} onClick={() => navigate(`/book-service/${r.slug}`)} className="text-xs font-semibold bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-full px-3.5 py-2">{r.name}</button>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
