import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2 } from 'lucide-react';
import { toast } from 'sonner';

const TABS = [
  { key: 'active', label: 'Active' }, { key: 'personalized', label: 'For you' }, { key: 'cashback', label: 'Cashback' },
  { key: 'seasonal', label: 'Seasonal' }, { key: 'referral', label: 'Referral' }, { key: 'expired', label: 'Expired' },
];
const MOCK = [
  { id: 'c1', code: 'WELCOME20', title: '20% off your first booking', discount: '20% up to RM50', expiry: '2026-08-01', minOrder: 50, categories: ['All'], tab: 'active' },
  { id: 'c2', code: 'CLEANRM15', title: 'RM15 off cleaning', discount: 'RM15 flat', expiry: '2026-07-20', minOrder: 80, categories: ['Cleaning'], tab: 'active' },
  { id: 'c3', code: 'FORYOU10', title: 'Personal 10% reward', discount: '10%', expiry: '2026-07-15', minOrder: 0, categories: ['All'], tab: 'personalized' },
  { id: 'c4', code: 'CASHBACK5', title: '5% cashback to wallet', discount: '5% cashback', expiry: '2026-09-01', minOrder: 60, categories: ['AC', 'Plumbing'], tab: 'cashback' },
  { id: 'c5', code: 'RAYA2026', title: 'Raya festive 25% off', discount: '25% up to RM40', expiry: '2026-04-30', minOrder: 100, categories: ['All'], tab: 'seasonal' },
  { id: 'c6', code: 'REFER30', title: 'RM30 referral reward', discount: 'RM30', expiry: '2026-12-31', minOrder: 50, categories: ['All'], tab: 'referral' },
  { id: 'c7', code: 'MAY10', title: 'Expired — May promo', discount: '10%', expiry: '2026-05-31', minOrder: 40, categories: ['All'], tab: 'expired' },
];
const daysLeft = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

export default function Offers() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('active');
  const [data, setData] = useState(null);
  useEffect(() => { const t = setTimeout(() => setData(MOCK), 400); return () => clearTimeout(t); }, []);
  const list = useMemo(() => (data || []).filter(c => c.tab === tab), [data, tab]);

  return (
    <div className="font-inter min-h-screen bg-bg max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-semibold">Offers & coupons</h1>
      </div>
      <div className="px-5 flex gap-2 overflow-x-auto scrollbar-none pb-2">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`shrink-0 text-xs font-semibold rounded-full px-3.5 py-2 border ${tab === t.key ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-secondary border-hairline/20'}`}>{t.label}</button>
        ))}
      </div>
      <div className="px-5 space-y-3 pb-10 pt-2">
        {!data ? [0, 1, 2].map(i => <div key={i} className="h-28 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl animate-pulse" />) : list.length ? list.map(c => {
          const dl = daysLeft(c.expiry); const expired = dl < 0;
          return (
            <div key={c.id} className="bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl overflow-hidden">
              <div className={`flex items-center justify-between px-4 py-2.5 ${expired ? 'bg-raised' : 'bg-brand-tint'}`}>
                <span className={`font-semibold tracking-wider ${expired ? 'text-ink-secondary' : 'text-brand'}`}>{c.code}</span>
                <span className="text-[11px] text-ink-tertiary">{expired ? 'Expired' : dl <= 7 ? `${dl}d left` : `Until ${c.expiry}`}</span>
              </div>
              <div className="p-4 space-y-1.5">
                <p className="text-sm font-semibold">{c.title}</p>
                <p className="text-sm font-semibold text-brand">{c.discount}</p>
                <p className="text-[11px] text-ink-tertiary">{c.minOrder > 0 ? `Min. spend RM${c.minOrder} · ` : ''}Valid on {c.categories.join(', ')}</p>
                {!expired && (
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => { navigator.clipboard?.writeText(c.code); toast.success(`${c.code} copied & applied`); }} className="flex-1 h-10 rounded-lg bg-brand text-white text-sm font-semibold">Apply</button>
                    <button onClick={() => toast.success('Share link copied')} className="w-11 h-10 rounded-lg shadow-[inset_0_0_0_1px_rgb(var(--hairline))] flex items-center justify-center"><Share2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            </div>
          );
        }) : <div className="text-center py-12 text-ink-secondary text-sm">No offers in this tab</div>}
      </div>
    </div>
  );
}
