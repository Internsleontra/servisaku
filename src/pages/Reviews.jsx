import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const MOCK = {
  averageGiven: 4.6,
  given: [
    { id: 'g1', service: 'Full House Cleaning', partner: 'Ahmad R.', rating: 5, comment: 'Spotless and on time!', date: '20 Jun 2026', anonymous: false },
    { id: 'g2', service: 'AC Servicing', partner: 'Siti N.', rating: 4, comment: 'Good, cooling improved.', date: '10 Jun 2026', anonymous: true },
  ],
  pending: [
    { bookingId: 'SA-5521EE', service: 'AC Chemical Cleaning', partner: 'Ravi K.', date: '28 Jun 2026' },
    { bookingId: 'SA-A0C3F1', service: 'Fan Installation', partner: 'Ahmad R.', date: '25 Jun 2026' },
  ],
};
const Stars = ({ n, size = 14 }) => <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(i => <Star key={i} className={`h-${size === 14 ? '3.5' : '4'} w-${size === 14 ? '3.5' : '4'} ${i <= n ? 'text-star fill-star' : 'text-hairline'}`} />)}</div>;

export default function Reviews() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('given');
  useEffect(() => { const t = setTimeout(() => setData(MOCK), 400); return () => clearTimeout(t); }, []);

  const del = (id) => { setData(d => ({ ...d, given: d.given.filter(g => g.id !== id) })); toast.success('Review deleted'); };

  return (
    <div className="font-inter min-h-screen bg-bg max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-semibold">Reviews</h1>
      </div>
      {!data ? <div className="px-5 space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-24 bg-surface rounded-2xl animate-pulse" />)}</div> : (
        <div className="px-5 space-y-4 pb-10">
          <div className="bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl p-5 flex flex-col items-center gap-1">
            <p className="text-3xl font-semibold">{data.averageGiven.toFixed(1)}</p>
            <Stars n={Math.round(data.averageGiven)} size={16} />
            <p className="text-xs text-ink-tertiary">Your average rating given</p>
          </div>
          <div className="flex gap-2">
            {[['given', `Given (${data.given.length})`], ['pending', `Pending (${data.pending.length})`]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`text-xs font-semibold rounded-full px-3.5 py-2 border ${tab === k ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-secondary border-hairline/20'}`}>{l}</button>
            ))}
          </div>
          {tab === 'given' ? (data.given.length ? data.given.map(g => (
            <div key={g.id} className="bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div><p className="text-sm font-semibold">{g.service}</p><p className="text-[11px] text-ink-tertiary">{g.partner} · {g.date}</p></div>
                {g.anonymous && <span className="text-[9px] bg-raised text-ink-secondary px-2 py-0.5 rounded-full font-semibold">Anonymous</span>}
              </div>
              <Stars n={g.rating} />
              <p className="text-sm text-ink-secondary">{g.comment}</p>
              <div className="flex gap-4 pt-1">
                <button onClick={() => toast.info('Edit review — coming soon')} className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button onClick={() => del(g.id)} className="flex items-center gap-1.5 text-xs font-semibold text-danger"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            </div>
          )) : <div className="text-center py-12 text-ink-secondary text-sm">No reviews yet</div>) : (
            data.pending.length ? data.pending.map(p => (
              <div key={p.bookingId} className="bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl p-4 space-y-2.5">
                <div><p className="text-sm font-semibold">{p.service}</p><p className="text-[11px] text-ink-tertiary">{p.partner} · {p.date} · {p.bookingId}</p></div>
                <button onClick={() => navigate(`/review/${p.bookingId}`)} className="w-full h-10 rounded-lg bg-brand text-white text-sm font-semibold">Write a review</button>
              </div>
            )) : <div className="text-center py-12 text-ink-secondary text-sm">All caught up 🎉</div>
          )}
        </div>
      )}
    </div>
  );
}
