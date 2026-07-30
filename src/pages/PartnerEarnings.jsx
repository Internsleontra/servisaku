import { useState, useEffect } from 'react';
import { servisaku } from '@/api/servisakuClient';
import { ArrowLeft, TrendingUp, CheckCircle2, Wallet, Clock, Landmark, ArrowDownToLine, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { formatRM } from '@/lib/paymentEngine';
import { MetricCard } from '@/components/partner/MetricCard';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import moment from 'moment';

const STATUS_COLOR = {
  completed: 'bg-emerald-50 text-emerald-700',
  paid: 'bg-emerald-50 text-emerald-700',
  scheduled: 'bg-blue-50 text-blue-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-600',
};

const EMPTY_WALLET = { lifetime: 0, pending: 0, withdrawn: 0, withdrawable: 0, balance: 0 };

export default function PartnerEarnings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(EMPTY_WALLET);
  const [payouts, setPayouts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('transactions');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const refreshWallet = async (email) => {
    const [w, p] = await Promise.all([
      servisaku.wallet.get(),
      servisaku.entities.PayoutRecord.filter({ partner_email: email }, '-created_date', 100),
    ]);
    setWallet(w); setPayouts(p);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const me = await servisaku.auth.me();
        setUser(me);
        const [w, p, b] = await Promise.all([
          servisaku.wallet.get(),
          servisaku.entities.PayoutRecord.filter({ partner_email: me.email }, '-created_date', 100),
          servisaku.entities.Booking.filter({ partner_email: me.email, status: 'completed' }, '-created_date', 100),
        ]);
        setWallet(w); setPayouts(p); setBookings(b);
      } catch (err) {
        // Any rejection here (403 "Partners only", network) previously skipped
        // setLoading(false) entirely and the page span forever with no message.
        console.error('[PartnerEarnings] failed to load wallet:', err);
        toast.error(err?.message || 'Could not load your earnings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Earnings trend — last 6 months from completed bookings (partner keeps 80%).
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const m = moment().subtract(5 - i, 'months');
    const key = m.format('YYYY-MM');
    const earned = bookings.filter(b => b.date?.startsWith(key)).reduce((s, b) => s + Math.round((b.price || 0) * 0.8), 0);
    return { month: m.format('MMM'), earned };
  });

  const openWithdraw = () => { setWithdrawAmount(String(wallet.withdrawable || '')); setShowWithdraw(true); };

  const doWithdraw = async () => {
    const amt = Number(withdrawAmount);
    if (!(amt > 0)) return toast.error('Enter an amount');
    if (amt > wallet.withdrawable) return toast.error('Amount exceeds your withdrawable balance');
    setWithdrawing(true);
    try {
      await servisaku.wallet.withdraw(amt);
      await refreshWallet(user.email);
      setShowWithdraw(false);
      setWithdrawAmount('');
      toast.success('Withdrawal requested — funds arrive in 1–3 business days');
    } catch (e) {
      toast.error(e.message || 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-10">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-white" />
          </button>
          <div>
            <p className="text-white/60 text-xs">Wallet</p>
            <h1 className="text-xl font-bold text-white">{user?.full_name?.split(' ')[0] || 'Partner'}</h1>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5">
          <p className="text-white/50 text-xs font-medium mb-1.5">Available to withdraw</p>
          <p className="text-3xl font-bold text-white tracking-tight">{formatRM(wallet.withdrawable)}</p>
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/10">
            <div>
              <p className="text-white font-bold text-base">{formatRM(wallet.pending)}</p>
              <p className="text-white/45 text-[10px] font-medium mt-0.5">Pending (in progress)</p>
            </div>
            <div>
              <p className="text-white font-bold text-base">{formatRM(wallet.lifetime)}</p>
              <p className="text-white/45 text-[10px] font-medium mt-0.5">Lifetime earned</p>
            </div>
          </div>
          <Button
            onClick={openWithdraw}
            disabled={loading || wallet.withdrawable <= 0}
            className="mt-4 w-full h-11 rounded-xl bg-surface text-brand font-bold hover:bg-white/90 disabled:opacity-60"
          >
            <ArrowDownToLine className="h-4 w-4 mr-2" /> Withdraw to bank
          </Button>
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-2xl mx-auto -mt-5 space-y-5">

        {/* Wallet stat tiles */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard icon={Wallet} tone="brand" label="Withdrawable" value={formatRM(wallet.withdrawable)} />
          <MetricCard icon={Clock} tone="amber" label="Pending" value={formatRM(wallet.pending)} sub="From active jobs" />
          <MetricCard icon={Landmark} tone="emerald" label="Withdrawn" value={formatRM(wallet.withdrawn)} sub="Requested / paid" />
          <MetricCard icon={Gift} tone="violet" label="Bonuses" value="—" sub="Coming soon" />
        </div>

        {/* Earnings trend */}
        <div className="bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-5">
          <SectionHeader title="Earnings trend" sub="Last 6 months" action={<TrendingUp className="h-4 w-4 text-brand" />} className="mb-4" />
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} barCategoryGap="30%">
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={v => [formatRM(v), 'Earned']}
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12, color: '#171a1c' }}
              />
              <Bar dataKey="earned" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i === chartData.length - 1 ? 'hsl(24 95% 53%)' : '#e5e7eb'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[{ id: 'transactions', label: 'Transactions' }, { id: 'withdrawals', label: 'Withdrawals' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.id ? 'bg-brand text-white shadow-e1' : 'bg-surface border border-hairline/10 text-ink-secondary'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
        ) : tab === 'transactions' ? (
          <div className="space-y-3">
            {bookings.length === 0 ? (
              <div className="text-center py-12 bg-surface rounded-2xl border border-hairline/10">
                <p className="text-sm text-ink-secondary">No completed jobs yet</p>
              </div>
            ) : bookings.slice(0, 30).map(b => (
              <div key={b.id} className="flex items-center gap-3 bg-surface rounded-2xl border border-hairline/10 p-3.5 shadow-e1">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{b.service_type}</p>
                  <p className="text-xs text-ink-secondary">{moment(b.date).format('D MMM YYYY')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-brand text-sm">+{formatRM((b.price || 0) * 0.8)}</p>
                  <p className="text-[10px] text-ink-tertiary">of {formatRM(b.price)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {payouts.length === 0 ? (
              <div className="text-center py-12 bg-surface rounded-2xl border border-hairline/10">
                <p className="text-sm text-ink-secondary">No withdrawals yet</p>
              </div>
            ) : payouts.map(p => (
              <div key={p.id} className="bg-surface rounded-2xl border border-hairline/10 p-4 shadow-e1">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="font-bold text-sm text-ink">{formatRM(p.net_payout)}</p>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_COLOR[p.status] || 'bg-raised text-ink-secondary'}`}>
                    {p.status}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-ink-secondary">
                  <span>via {p.payout_method || 'Bank Transfer'}</span>
                  <span>{moment(p.created_date).format('D MMM YYYY')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Withdraw sheet */}
      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowWithdraw(false)}>
          <div className="w-full max-w-lg rounded-t-3xl bg-surface p-5 pb-8" onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline/30" />
            <h2 className="text-lg font-bold text-ink">Withdraw to bank</h2>
            <p className="text-xs text-ink-secondary mt-0.5">Available: <span className="font-semibold text-brand">{formatRM(wallet.withdrawable)}</span></p>
            <div className="mt-4">
              <label className="text-xs font-medium text-ink-secondary">Amount (RM)</label>
              <input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                autoFocus
                className="mt-1 w-full rounded-xl bg-raised px-4 py-3 text-lg font-bold text-ink outline-none focus:ring-2 focus:ring-brand/30"
              />
              <div className="mt-2 flex gap-2">
                {[0.25, 0.5, 1].map((f) => (
                  <button key={f} onClick={() => setWithdrawAmount(String(Math.floor(wallet.withdrawable * f)))}
                    className="flex-1 rounded-lg border border-hairline/20 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-raised">
                    {f === 1 ? 'Max' : `${f * 100}%`}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button onClick={() => setShowWithdraw(false)} variant="outline" className="flex-1 h-11 rounded-xl">Cancel</Button>
              <Button onClick={doWithdraw} disabled={withdrawing} className="flex-1 h-11 rounded-xl bg-brand text-white hover:bg-brand/90">
                {withdrawing ? 'Requesting…' : 'Confirm withdrawal'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
