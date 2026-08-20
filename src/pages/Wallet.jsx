import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, ArrowDownCircle, ArrowUpCircle, RefreshCw, Medal, Banknote } from 'lucide-react';
import { formatMYR } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/useTranslation';

// Mock wallet data — swap for `servisaku.wallet.get()` when the endpoint exists.
const MOCK = {
  summary: { balance: 128.5, points: 2450, cashback: 42.0, referralEarnings: 60.0, giftCard: 25.0 },
  transactions: [
    { id: 't1', date: '2026-06-28', amount: -120, type: 'debit', description: 'Full House Cleaning', bookingRef: 'SA-9F2A1C', status: 'completed' },
    { id: 't2', date: '2026-06-25', amount: 12, type: 'cashback', description: 'Cashback — AC Servicing', bookingRef: 'SA-77B0D2', status: 'completed' },
    { id: 't3', date: '2026-06-22', amount: 50, type: 'credit', description: 'Wallet top-up (FPX)', status: 'completed' },
    { id: 't4', date: '2026-06-20', amount: 35, type: 'refund', description: 'Refund — cancelled plumbing', bookingRef: 'SA-31AA90', status: 'completed' },
    { id: 't5', date: '2026-06-18', amount: 250, type: 'reward', description: 'Loyalty points earned', status: 'completed' },
    { id: 't6', date: '2026-06-15', amount: -89, type: 'debit', description: 'AC Chemical Cleaning', bookingRef: 'SA-5521EE', status: 'completed' },
    { id: 't7', date: '2026-06-12', amount: 20, type: 'credit', description: 'Referral bonus — Aisha', status: 'completed' },
    { id: 't8', date: '2026-06-10', amount: -15, type: 'debit', description: 'Fan Installation', bookingRef: 'SA-A0C3F1', status: 'pending' },
  ],
};
const FILTERS = ['all', 'credit', 'debit', 'refund', 'reward', 'cashback'];
/* Display copy for the filter chips and the pending pill — the stored values
   stay lowercase ids; only what the customer reads is translated. */
const FILTER_LABEL = {
  all: 'All', credit: 'Credit', debit: 'Debit',
  refund: 'Refund', reward: 'Reward', cashback: 'Cashback',
};
const WALLET_STATUS_LABEL = { pending: 'Pending', completed: 'Completed', failed: 'Failed' };
const ICON = { credit: ArrowDownCircle, debit: ArrowUpCircle, refund: RefreshCw, reward: Medal, cashback: Banknote };

export default function Wallet() {
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => { const t = setTimeout(() => setData(MOCK), 450); return () => clearTimeout(t); }, []);

  const txns = useMemo(() => {
    if (!data) return [];
    return filter === 'all' ? data.transactions : data.transactions.filter(tx => tx.type === filter);
  }, [data, filter]);

  return (
    <div className="font-inter min-h-screen bg-bg max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-semibold flex-1">{t('Wallet')}</h1>
        <button onClick={() => toast.info(t('Statement export — coming soon'))} className="text-brand"><Download className="h-5 w-5" /></button>
      </div>

      <div className="px-5 space-y-5 pb-10">
        {/* Balance card */}
        <div className="bg-ink dark:bg-raised text-white rounded-3xl p-6 shadow-e2">
          <p className="text-xs font-semibold text-white/50">{t('WALLET BALANCE')}</p>
          {data ? <p className="text-4xl font-semibold mt-1">{formatMYR(data.summary.balance)}</p> : <div className="h-9 w-36 bg-white/10 rounded-lg mt-2 animate-pulse" />}
          <div className="flex flex-wrap gap-2 mt-4">
            {data && [
              ['⭐', `${data.summary.points.toLocaleString()} pts`], ['💵', `${formatMYR(data.summary.cashback)} cashback`],
              ['🎁', `${formatMYR(data.summary.referralEarnings)} referral`], ['🎫', `${formatMYR(data.summary.giftCard)} gift`],
            ].map(([i, l]) => <span key={l} className="text-xs font-semibold bg-white/10 rounded-full px-3 py-1.5">{i} {l}</span>)}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 text-xs font-semibold rounded-full px-3.5 py-2 border ${filter === f ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-secondary border-hairline/20'}`}>
              {t(FILTER_LABEL[f] || f)}
            </button>
          ))}
        </div>

        {/* Transactions */}
        <div>
          <p className="text-[11px] font-semibold text-ink-tertiary tracking-wide mb-2">TRANSACTIONS</p>
          {!data ? (
            <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-14 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-xl animate-pulse" />)}</div>
          ) : txns.length ? (
            <div className="space-y-2">
              {txns.map(tx => {
                const Icon = ICON[tx.type] || Banknote;
                const positive = tx.amount >= 0;
                return (
                  <div key={tx.id} className="flex items-center gap-3 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-xl p-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${positive ? 'bg-success-tint text-success' : 'bg-raised text-ink-secondary'}`}><Icon className="h-4 w-4" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{t(tx.description)}</p>
                      <p className="text-[11px] text-ink-tertiary">{new Date(tx.date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}{tx.bookingRef ? ` · ${tx.bookingRef}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${positive ? 'text-success' : 'text-ink'}`}>{positive ? '+' : '−'}{formatMYR(Math.abs(tx.amount))}</p>
                      {tx.status !== 'completed' && <span className="text-[9px] font-semibold text-warning">{t(WALLET_STATUS_LABEL[tx.status] || tx.status)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-ink-secondary text-sm">{t('No transactions')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
