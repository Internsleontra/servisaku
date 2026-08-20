import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Medal } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/useTranslation';

const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
const TIER = {
  Bronze: { bg: '#f5e9df', fg: '#8a5a2b' }, Silver: { bg: '#eceef0', fg: '#5b6673' }, Gold: { bg: '#fdf3d6', fg: '#a8791b' },
  Platinum: { bg: '#e8eef2', fg: '#3f5568' }, Diamond: { bg: '#e6f1fb', fg: '#1f6fb2' },
};
const MOCK = {
  tier: 'Gold', points: 2450, nextTier: 'Platinum', pointsToNext: 550,
  rewards: [
    { id: 'r1', title: 'RM10 off any service', points: 1000, desc: 'Flat RM10 discount' },
    { id: 'r2', title: 'Free deep-clean add-on', points: 1800, desc: 'One complimentary add-on' },
    { id: 'r3', title: 'RM30 wallet credit', points: 3000, desc: 'Straight to your wallet' },
    { id: 'r4', title: 'Priority weekend slot', points: 1200, desc: 'Skip the queue on weekends' },
  ],
  redemptions: [{ id: 'x1', title: 'RM10 off any service', points: 1000, date: '02 Jun 2026' }, { id: 'x2', title: 'Birthday reward', points: 500, date: '14 Mar 2026' }],
  achievements: [
    { id: 'a1', title: 'First booking', icon: '🎉', unlocked: true }, { id: 'a2', title: '10 bookings', icon: '🔟', unlocked: true },
    { id: 'a3', title: 'Refer a friend', icon: '🤝', unlocked: true }, { id: 'a4', title: '5-star streak', icon: '⭐', unlocked: false },
    { id: 'a5', title: 'Diamond tier', icon: '💎', unlocked: false },
  ],
};

export default function Loyalty() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [l, setL] = useState(null);
  useEffect(() => { const timer = setTimeout(() => setL(MOCK), 400); return () => clearTimeout(timer); }, []);

  return (
    <div className="font-inter min-h-screen bg-bg max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-semibold">{t('Loyalty & rewards')}</h1>
      </div>
      {!l ? <div className="px-5"><div className="h-32 bg-surface rounded-3xl animate-pulse" /></div> : (
        <div className="px-5 space-y-4 pb-10">
          <div className="rounded-3xl p-6 shadow-[inset_0_0_0_1px_rgb(var(--hairline))]" style={{ background: TIER[l.tier].bg }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2" style={{ color: TIER[l.tier].fg }}><Medal className="h-5 w-5" /><span className="text-lg font-semibold">{l.tier}</span></div>
              <span className="text-lg font-semibold text-ink">{t('{points} pts', { points: l.points.toLocaleString(locale) })}</span>
            </div>
            {l.nextTier && (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-white/60 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(l.points / (l.points + l.pointsToNext)) * 100}%`, background: TIER[l.tier].fg }} /></div>
                <p className="text-xs text-ink-secondary mt-1.5">{t('{points} pts to {tier}', { points: l.pointsToNext, tier: l.nextTier })}</p>
              </div>
            )}
          </div>

          <div className="bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl p-4">
            <p className="text-[11px] font-semibold text-ink-tertiary mb-3">{t('TIER LADDER')}</p>
            <div className="flex justify-between">
              {TIER_ORDER.map(tier => {
                const reached = TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(l.tier);
                return (
                  <div key={tier} className="flex flex-col items-center gap-1" style={{ opacity: reached ? 1 : 0.4 }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: TIER[tier].bg }}><Medal className="h-4 w-4" style={{ color: TIER[tier].fg }} /></div>
                    <span className="text-[9px] font-semibold text-ink-secondary">{tier}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl divide-y divide-hairline/10">
            <p className="text-[11px] font-semibold text-ink-tertiary px-4 pt-3">{t('REDEEM POINTS')}</p>
            {l.rewards.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1"><p className="text-sm font-semibold">{t(r.title)}</p><p className="text-[11px] text-ink-tertiary">{t(r.desc)}</p></div>
                <button disabled={l.points < r.points} onClick={() => toast.success(`Redeemed: ${t(r.title)}`)}
                  className={`text-xs font-semibold rounded-lg px-3 py-2 ${l.points >= r.points ? 'bg-brand text-white' : 'bg-raised text-ink-tertiary'}`}>{r.points} pts</button>
              </div>
            ))}
          </div>

          <div className="bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl p-4">
            <p className="text-[11px] font-semibold text-ink-tertiary mb-3">ACHIEVEMENTS</p>
            <div className="grid grid-cols-3 gap-3">
              {l.achievements.map(a => (
                <div key={a.id} className="flex flex-col items-center gap-1" style={{ opacity: a.unlocked ? 1 : 0.35 }}>
                  <div className="w-12 h-12 rounded-full bg-raised flex items-center justify-center text-2xl">{a.icon}</div>
                  <span className="text-[10px] text-center font-semibold text-ink-secondary">{t(a.title)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
