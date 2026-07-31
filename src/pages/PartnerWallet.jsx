import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wallet, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Receipt, ShieldAlert, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { servisaku } from '@/api/servisakuClient';
import { formatRM } from '@/lib/paymentEngine';
import { MetricCard } from '@/components/partner/MetricCard';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button } from '@/components/ui/button';
import moment from 'moment';

const EMPTY = {
  available_balance: 0, pending_balance: 0, outstanding_commission: 0,
  lifetime_earnings: 0, lifetime_commission: 0, credit_limit: 50,
  settlement_cycle: 'weekly', is_frozen: false, payouts_suspended: false, currency: 'MYR',
};

// Ledger entry type → how it reads to a partner. The raw type names are precise
// but internal; a partner should see plain language.
const ENTRY_LABEL = {
  earning_credit: 'Earnings available',
  escrow_hold: 'Held in escrow',
  escrow_release: 'Released from escrow',
  commission_debit: 'Commission owed',
  settlement_credit: 'Commission settled',
  payout_debit: 'Payout',
  refund_debit: 'Refund deducted',
  damage_deduction: 'Damage claim deduction',
  penalty: 'Penalty',
  bonus: 'Bonus',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
  opening_balance: 'Opening balance',
};

const SETTLEMENT_TONE = {
  paid: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  partially_paid: 'bg-amber-50 text-amber-700',
  overdue: 'bg-red-50 text-red-600',
  waived: 'bg-slate-100 text-slate-600',
  written_off: 'bg-slate-100 text-slate-600',
};

export default function PartnerWallet() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState(EMPTY);
  const [entries, setEntries] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ledger');
  const [payingId, setPayingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [w, l, s] = await Promise.all([
        servisaku.wallet.detail(),
        servisaku.wallet.ledger({ limit: 50 }),
        servisaku.wallet.settlements(),
      ]);
      setWallet(w);
      setEntries(l.items || []);
      setSettlements(s || []);
    } catch (err) {
      // Mirrors PartnerEarnings: a rejection must still clear the spinner, or
      // the page hangs with no explanation.
      console.error('[PartnerWallet] failed to load:', err);
      toast.error(err?.message || 'Could not load your wallet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unpaid = settlements.filter((s) => ['pending', 'partially_paid', 'overdue'].includes(s.status));
  const overGrace = wallet.outstanding_commission > wallet.credit_limit;

  const handlePay = async (settlement) => {
    setPayingId(settlement.id);
    try {
      const payment = await servisaku.wallet.paySettlement(settlement.id, 'fpx');
      if (!payment?.checkout_url) throw new Error('Could not start the settlement payment');
      window.location.href = payment.checkout_url;
    } catch (err) {
      toast.error(err?.message || 'Could not start the settlement payment');
      setPayingId(null);
    }
  };

  const handlePayFromBalance = async (settlement) => {
    setPayingId(settlement.id);
    try {
      await servisaku.wallet.paySettlementFromBalance(settlement.id);
      toast.success('Settled from your available balance');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not settle from your balance');
    } finally {
      setPayingId(null);
    }
  };

  if (loading) return (
    <div className="flex justify-center pt-32">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-bg font-inter pb-24">
      <div className="sticky top-0 z-20 border-b border-hairline/20 bg-surface px-5 pb-4 pt-12 lg:pt-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-raised lg:hidden">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <p className="text-xs text-ink-secondary">Your money</p>
            <p className="text-sm font-bold text-ink">Wallet</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-5 pt-5">

        {/* Frozen banner — the partner must understand why jobs stopped arriving,
            rather than discovering it as an empty job feed. */}
        {wallet.is_frozen && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-700">New jobs are paused</p>
              <p className="mt-0.5 text-xs text-red-600">
                {wallet.freeze_reason || 'Settle your outstanding commission to start receiving jobs again.'}
                {wallet.payouts_suspended && ' Payouts are also on hold.'}
              </p>
            </div>
          </div>
        )}

        {/* Outstanding commission — only shown once it matters (past the grace
            limit), so a partner owing small change isn't nagged. */}
        {overGrace && !wallet.is_frozen && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">
                {formatRM(wallet.outstanding_commission)} commission outstanding
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                From cash jobs where you collected the full fare. Settle before the due
                date to keep receiving new jobs.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={Wallet} tone="emerald" label="Available" value={formatRM(wallet.available_balance)} sub="Withdrawable now" />
          <MetricCard icon={Clock} tone="amber" label="Pending" value={formatRM(wallet.pending_balance)} sub="Held in escrow" />
          <MetricCard
            icon={Receipt}
            tone={wallet.outstanding_commission > 0 ? 'rose' : 'slate'}
            label="Commission owed"
            value={formatRM(wallet.outstanding_commission)}
            sub={`Grace up to ${formatRM(wallet.credit_limit)}`}
          />
          <MetricCard icon={ArrowUpRight} tone="brand" label="Lifetime earned" value={formatRM(wallet.lifetime_earnings)} sub={`${wallet.settlement_cycle} settlement`} />
        </div>

        {/* Settlements needing action come first — this is the actionable part. */}
        {unpaid.length > 0 && (
          <div className="space-y-3">
            <SectionHeader title="Settle your commission" sub="Cash jobs you've collected on" />
            {unpaid.map((s) => {
              const due = moment(s.due_date);
              const isOverdue = due.isBefore(moment(), 'day');
              return (
                <div key={s.id} className="rounded-2xl border border-hairline/10 bg-surface p-4 shadow-e1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] text-ink-tertiary">{s.reference}</p>
                      <p className="mt-1 text-lg font-bold text-ink">{formatRM(s.balance_due)}</p>
                      <p className="mt-0.5 text-[11px] text-ink-secondary">
                        {moment(s.period_start).format('D MMM')} – {moment(s.period_end).format('D MMM')}
                        {' · '}
                        <span className={isOverdue ? 'font-semibold text-red-600' : ''}>
                          {isOverdue ? `overdue ${due.fromNow(true)}` : `due ${due.format('D MMM')}`}
                        </span>
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold capitalize ${SETTLEMENT_TONE[s.status] || SETTLEMENT_TONE.pending}`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      onClick={() => handlePay(s)}
                      disabled={payingId === s.id}
                      className="flex-1 rounded-xl"
                    >
                      {payingId === s.id ? 'Starting…' : 'Pay online'}
                    </Button>
                    {/* Netting against earnings is opt-in, never automatic. */}
                    <Button
                      onClick={() => handlePayFromBalance(s)}
                      disabled={payingId === s.id || wallet.available_balance < s.balance_due}
                      variant="outline"
                      className="flex-1 rounded-xl"
                      title={wallet.available_balance < s.balance_due ? 'Not enough available balance' : undefined}
                    >
                      Use balance
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 border-b border-hairline/20">
          {[['ledger', 'Activity'], ['settlements', 'Settlements']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 pb-2 text-sm font-semibold transition-colors ${
                tab === id ? 'border-b-2 border-brand text-ink' : 'text-ink-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'ledger' && (
          entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-secondary">No wallet activity yet.</p>
          ) : (
            <div className="divide-y divide-hairline/10 overflow-hidden rounded-2xl border border-hairline/10 bg-surface">
              {entries.map((e) => {
                const isCredit = e.direction === 'credit';
                // A commission debit *raises* what you owe, so the visual sense of
                // credit/debit inverts on the outstanding bucket.
                const isGood = e.bucket === 'outstanding' ? !isCredit : isCredit;
                return (
                  <div key={e.id} className="flex items-center gap-3 p-3.5">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isGood ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {isGood ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{ENTRY_LABEL[e.type] || e.type}</p>
                      <p className="truncate text-[11px] text-ink-secondary">{e.description}</p>
                      <p className="text-[10px] text-ink-tertiary">{moment(e.created_date).format('D MMM YYYY, h:mm a')}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isGood ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isCredit ? '+' : '−'}{formatRM(e.amount)}
                      </p>
                      <p className="text-[10px] capitalize text-ink-tertiary">{e.bucket}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === 'settlements' && (
          settlements.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-secondary">No settlements yet.</p>
          ) : (
            <div className="divide-y divide-hairline/10 overflow-hidden rounded-2xl border border-hairline/10 bg-surface">
              {settlements.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3.5">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {s.status === 'paid' ? <CheckCircle2 className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-ink-tertiary">{s.reference}</p>
                    <p className="text-[11px] text-ink-secondary">
                      {moment(s.period_start).format('D MMM')} – {moment(s.period_end).format('D MMM YYYY')}
                    </p>
                    <p className="text-[10px] text-ink-tertiary">
                      {formatRM(s.gross_cash_collected)} cash collected
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-ink">{formatRM(s.total_due)}</p>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${SETTLEMENT_TONE[s.status] || SETTLEMENT_TONE.pending}`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
