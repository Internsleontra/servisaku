import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ribbon, CheckCircle2 } from 'lucide-react';
import { formatMYR } from '@/lib/utils';
import { toast } from 'sonner';

const MOCK = {
  active: true, plan: 'ServisAku Plus', price: 19.9, renewsOn: '14 Aug 2026', lifetimeSavings: 342.5,
  benefits: ['Free cancellations', 'Priority booking slots', 'Up to 15% member-only discounts', 'Dedicated support line', 'Extended service warranty'],
  stats: { freeCancellationsLeft: 3, priorityUsed: 7, exclusiveDiscounts: 12 },
  history: [
    { id: 'm1', plan: 'ServisAku Plus', date: '14 Jul 2026', amount: 19.9 },
    { id: 'm2', plan: 'ServisAku Plus', date: '14 Jun 2026', amount: 19.9 },
    { id: 'm3', plan: 'ServisAku Plus', date: '14 May 2026', amount: 19.9 },
  ],
};

export default function Membership() {
  const navigate = useNavigate();
  const [m, setM] = useState(null);
  useEffect(() => { const t = setTimeout(() => setM(MOCK), 400); return () => clearTimeout(t); }, []);

  return (
    <div className="font-inter min-h-screen bg-bg max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-bold">Membership</h1>
      </div>
      {!m ? <div className="px-5"><div className="h-40 bg-surface rounded-3xl animate-pulse" /></div> : (
        <div className="px-5 space-y-4 pb-10">
          <div className="bg-brand text-white rounded-3xl p-6 shadow-e2">
            <div className="flex items-center gap-2"><Ribbon className="h-5 w-5" /><span className="text-lg font-extrabold">{m.plan}</span></div>
            <p className="text-white/80 mt-1 text-sm">{formatMYR(m.price)}/month · renews {m.renewsOn}</p>
            <div className="bg-white/15 rounded-2xl p-4 mt-4">
              <p className="text-[11px] font-bold text-white/70">LIFETIME SAVINGS</p>
              <p className="text-2xl font-extrabold">{formatMYR(m.lifetimeSavings)}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[['Free cancels', m.stats.freeCancellationsLeft], ['Priority used', m.stats.priorityUsed], ['Discounts', m.stats.exclusiveDiscounts]].map(([l, v]) => (
              <div key={l} className="bg-surface border border-hairline/10 rounded-2xl p-4 text-center">
                <p className="text-xl font-extrabold">{v}</p><p className="text-[10px] text-ink-tertiary mt-1">{l}</p>
              </div>
            ))}
          </div>
          <div className="bg-surface border border-hairline/10 rounded-2xl p-4">
            <p className="text-[11px] font-bold text-ink-tertiary mb-3">YOUR BENEFITS</p>
            <div className="space-y-2.5">
              {m.benefits.map(b => <div key={b} className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /><span className="text-sm">{b}</span></div>)}
            </div>
          </div>
          <div className="bg-surface border border-hairline/10 rounded-2xl divide-y divide-hairline/10">
            {m.history.map(h => (
              <div key={h.id} className="flex justify-between px-4 py-3">
                <div><p className="text-sm font-semibold">{h.plan}</p><p className="text-[11px] text-ink-tertiary">{h.date}</p></div>
                <p className="text-sm font-bold">{formatMYR(h.amount)}</p>
              </div>
            ))}
          </div>
          <button onClick={() => toast.info('Renewal — coming soon')} className="w-full h-12 rounded-xl bg-brand text-white font-semibold">Renew now</button>
          <button onClick={() => toast.info('Membership will end at period close')} className="w-full h-11 rounded-xl border border-hairline/20 text-ink-secondary font-semibold">Cancel membership</button>
        </div>
      )}
    </div>
  );
}
