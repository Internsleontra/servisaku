import { useState, useEffect } from 'react';
import { servisaku } from '@/api/servisakuClient';
import {
  TrendingUp, CheckCircle2, Wallet, Clock, Landmark, ArrowDownToLine,
  ReceiptText, LoaderCircle, TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/partner/PageHeader';
import { MoneyValue, MetricStat } from '@/components/partner/money';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button, RING } from '@/components/ds';
import { chartColors, chartTooltipStyle } from '@/lib/partner/chartTokens';
import { formatMYR, cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import moment from 'moment';

/* ── Money provenance ───────────────────────────────────────────────────────
   EVERY figure on this page is server-computed. Nothing is estimated here.

     wallet.*          GET /api/payouts/wallet — PartnerWallet ledger, rounded
                       2dp server-side. Displayed verbatim.
     PayoutRecord.*    amountRequested / amountPaid — real persisted columns on
                       a WITHDRAWAL record. Displayed verbatim.
     booking.*         partner_payout / commission_amount now come from the
                       booking's escrow row, computed by the canonical
                       split() in server/lib/payments/commission.js.

   This page previously derived the per-job share itself, with two different
   formulas in one file — `Math.round(price * 0.8)` in the chart and un-rounded
   `price * 0.8` in the rows — so the trend and the list disagreed. Both are
   gone; a job with no escrow row renders "—" rather than a guess.
--------------------------------------------------------------------------- */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* Payout-record statuses are their own vocabulary (pending/paid/failed) — NOT
   booking statuses, so JobStatusBadge deliberately is not used here. */
const PAYOUT_STATUS_TONE = {
  completed: 'bg-success-tint text-success',
  paid: 'bg-success-tint text-success',
  scheduled: 'bg-info-tint text-info',
  pending: 'bg-warning-tint text-star',
  failed: 'bg-danger-tint text-danger',
};

const EMPTY_WALLET = { lifetime: 0, pending: 0, withdrawn: 0, withdrawable: 0, balance: 0 };

const TABS = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'withdrawals', label: 'Withdrawals' },
];

function Panel({ children, className }) {
  return <div className={cn('rounded-card bg-surface p-5', RING, className)}>{children}</div>;
}

export default function PartnerEarnings() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(EMPTY_WALLET);
  const [payouts, setPayouts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
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
        setLoadError(err?.message || 'Could not load your earnings');
        toast.error(err?.message || 'Could not load your earnings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Earnings trend — last 6 months from completed bookings.
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const m = moment().subtract(5 - i, 'months');
    const key = m.format('YYYY-MM');
    const earned = round2(
      bookings
        .filter(b => b.date?.startsWith(key))
        .reduce((s, b) => s + (b.partner_payout ?? 0), 0),
    );
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

  const colors = chartColors();
  const firstName = (user?.full_name || user?.fullName || '').split(' ')[0];

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-8" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      <PageHeader
        eyebrow="Wallet"
        title="Earnings"
        subtitle={firstName ? `Your payouts and balance, ${firstName}.` : 'Your payouts and balance.'}
        backTo="/partner"
        actions={
          <Button
            onClick={openWithdraw}
            disabled={loading || !(wallet.withdrawable > 0)}
          >
            <ArrowDownToLine className="size-4" aria-hidden="true" /> Withdraw to bank
          </Button>
        }
      />

      {loadError && (
        <div className={cn('mb-5 flex items-start gap-3 rounded-card bg-danger-tint p-4', RING)} role="alert">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="text-caption font-semibold text-danger">Could not load your earnings</p>
            <p className="mt-0.5 text-xs text-ink-secondary">{loadError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px] lg:items-start">

        {/* ── Main column ───────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Available to withdraw — the one figure a partner opens this page for. */}
          <MetricStat
            variant="dark"
            label="Available to withdraw"
            amount={wallet.withdrawable}
            icon={Wallet}
            caption="Cleared payouts from completed jobs, ready to transfer."
          />

          {/* Balance breakdown — all four are server-computed, shown verbatim. */}
          <div className="grid grid-cols-2 gap-3">
            <MetricStat label="Pending" amount={wallet.pending} icon={Clock} caption="From active jobs" />
            <MetricStat label="Withdrawn" amount={wallet.withdrawn} icon={Landmark} caption="Requested or paid" />
            <MetricStat label="Lifetime earned" amount={wallet.lifetime} icon={TrendingUp} caption="All completed jobs" />
            <MetricStat
              label="Outstanding commission"
              amount={wallet.outstanding_commission ?? 0}
              icon={ReceiptText}
              caption="Owed on cash jobs"
            />
          </div>

          {/* Earnings trend */}
          <Panel>
            <SectionHeader
              title="Earnings trend"
              sub="Last 6 months"
              action={<TrendingUp className="size-4 text-brand" aria-hidden="true" />}
              className="mb-4"
            />
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} barCategoryGap="30%">
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: colors.axis }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={v => [formatMYR(v, { decimals: true }), 'Earned']}
                  contentStyle={chartTooltipStyle()}
                  cursor={{ fill: colors.track, opacity: 0.35 }}
                />
                <Bar dataKey="earned" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === chartData.length - 1 ? colors.brand : colors.track} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {/* Tabs — the ds underline pattern, rebuilt locally so the control
              clears 44px (ds/SegmentedTabs sits at ~30px and is shared). */}
          <div className="flex gap-6 shadow-[inset_0_-1px_0_rgb(var(--hairline))]" role="tablist">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center text-caption font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
                  tab === t.id
                    ? 'shadow-[inset_0_-2px_0_rgb(var(--brand))] text-brand'
                    : 'text-ink-secondary hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <LoaderCircle className="size-6 animate-spin text-brand" role="status" aria-label="Loading earnings" />
            </div>
          ) : tab === 'transactions' ? (
            <div className="space-y-3">
              {bookings.length === 0 ? (
                <Panel className="py-12 text-center">
                  <p className="text-caption text-ink-secondary">No completed jobs yet</p>
                </Panel>
              ) : bookings.slice(0, 30).map(b => {
                return (
                  <div key={b.id} className={cn('flex items-center gap-3 rounded-card bg-surface p-3.5', RING)}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-field bg-success-tint">
                      <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-caption font-semibold text-ink">{b.service_type}</p>
                      <p className="sa-num text-xs text-ink-secondary">{moment(b.date).format('D MMM YYYY')}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <MoneyValue amount={b.partner_payout} size="sm" tone="positive" />
                      <p className="sa-num text-[10px] text-ink-tertiary">
                        of {formatMYR(b.price, { decimals: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
              {bookings.length > 0 && (
                <p className="px-1 text-[10px] text-ink-tertiary">
                  Job shares are the server-recorded payout for each booking, net of
                  the platform commission.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {payouts.length === 0 ? (
                <Panel className="py-12 text-center">
                  <p className="text-caption text-ink-secondary">No withdrawals yet</p>
                </Panel>
              ) : payouts.map(p => (
                <div key={p.id} className={cn('rounded-card bg-surface p-4', RING)}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <MoneyValue amount={p.amount_paid} />
                    <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize',
                      PAYOUT_STATUS_TONE[p.status] || 'bg-raised text-ink-secondary')}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-xs text-ink-secondary">
                    <span>via {p.payout_method || 'Bank Transfer'}</span>
                    <span className="sa-num">{moment(p.created_date).format('D MMM YYYY')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Rail ──────────────────────────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-5">
          {/* Latest withdrawal, straight from PayoutRecord. A withdrawal carries
              no commission — commission is taken once, per booking, at booking
              time — so this is a transfer summary, not a PayoutBreakdown. */}
          {payouts[0] && (
            <Panel>
              <SectionHeader title="Latest withdrawal" sub={moment(payouts[0].created_date).format('D MMM YYYY')} className="mb-3" />
              <dl className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-caption text-ink-secondary">Requested</dt>
                  <dd><MoneyValue amount={payouts[0].amount_requested} tone="muted" /></dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 pt-2.5 shadow-[inset_0_1px_0_rgb(var(--hairline))]">
                  <dt className="text-md font-semibold text-ink">Paid out</dt>
                  <dd><MoneyValue amount={payouts[0].amount_paid} size="lg" /></dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-ink-tertiary">
                via {payouts[0].payout_method || 'Bank Transfer'} · {payouts[0].status}
              </p>
            </Panel>
          )}

          <Panel>
            <SectionHeader title="How payouts work" className="mb-3" />
            <ul className="space-y-2 text-xs text-ink-secondary">
              <li>Earnings clear once a job is completed and confirmed.</li>
              <li>Cleared funds move to your withdrawable balance.</li>
              <li>Withdrawals arrive in 1–3 business days.</li>
            </ul>
            <Button
              block
              className="mt-4"
              onClick={openWithdraw}
              disabled={loading || !(wallet.withdrawable > 0)}
            >
              <ArrowDownToLine className="size-4" aria-hidden="true" /> Withdraw to bank
            </Button>
          </Panel>
        </aside>
      </div>

      {/* Withdraw sheet */}
      {showWithdraw && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
          onClick={() => setShowWithdraw(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-sheet bg-surface p-5 pb-8 sm:rounded-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Withdraw to bank"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline" />
            <h2 className="text-h4 text-ink">Withdraw to bank</h2>
            <p className="mt-0.5 text-xs text-ink-secondary">
              Available: <MoneyValue amount={wallet.withdrawable} size="sm" className="text-brand" />
            </p>
            <div className="mt-4">
              <label htmlFor="withdraw-amount" className="text-xs font-medium text-ink-secondary">Amount (RM)</label>
              <input
                id="withdraw-amount"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                autoFocus
                className={cn('sa-num mt-1 min-h-11 w-full rounded-field bg-raised px-4 text-lead font-semibold text-ink outline-none',
                  'focus-visible:shadow-[shadow:var(--focus-ring)]')}
              />
              <div className="mt-2 flex gap-2">
                {[0.25, 0.5, 1].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setWithdrawAmount(String(round2(wallet.withdrawable * f)))}
                    className={cn('min-h-11 flex-1 rounded-field text-xs font-semibold text-ink-secondary transition hover:bg-raised',
                      'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]', RING)}
                  >
                    {f === 1 ? 'Max' : `${f * 100}%`}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button onClick={() => setShowWithdraw(false)} variant="outline" className="flex-1">Cancel</Button>
              <Button onClick={doWithdraw} loading={withdrawing} disabled={withdrawing} className="flex-1">
                {withdrawing ? 'Requesting…' : 'Confirm withdrawal'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
