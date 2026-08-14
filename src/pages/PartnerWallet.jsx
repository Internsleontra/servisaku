import { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight, Landmark,
  Receipt, ShieldAlert, CheckCircle2, TrendingUp, LoaderCircle, TriangleAlert, Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { servisaku } from '@/api/servisakuClient';
import { PageHeader } from '@/components/partner/PageHeader';
import { MoneyValue, MetricStat } from '@/components/partner/money';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button, RING } from '@/components/ds';
import { cn } from '@/lib/utils';
import moment from 'moment';

/* ── Money provenance ───────────────────────────────────────────────────────
   EVERY figure on this page is returned by the server and rendered verbatim.
   Nothing is summed, rounded, multiplied or derived here.

     GET /api/payouts/dashboard   the single source for all balances —
                                  lifetime · pending · withdrawn · withdrawable ·
                                  outstanding_commission · minimum_payout ·
                                  next_payout_date · bank_account ·
                                  payout_blocked_reason · recent_payouts · series
     GET /api/wallet/ledger       transaction history (WalletLedgerEntry)
     GET /api/wallet/settlements  cash-commission settlement history

   GET /api/wallet is still called, but ONLY for three wallet-config fields the
   dashboard does not carry: credit_limit, settlement_cycle and freeze_reason.
   No money value is read from it, so the two wallet vocabularies never mix on
   screen — every amount below uses the dashboard's naming.
--------------------------------------------------------------------------- */
const EMPTY_SUMMARY = {
  lifetime: 0, pending: 0, withdrawn: 0, withdrawable: 0, balance: 0,
  outstanding_commission: 0, minimum_payout: 0, next_payout_date: null,
  bank_account: null, payout_blocked_reason: null, recent_payouts: [], series: [],
  payouts_suspended: false, is_frozen: false, currency: 'MYR',
};
const EMPTY_CONFIG = { credit_limit: 50, settlement_cycle: 'weekly', freeze_reason: null };

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
  paid: 'bg-success-tint text-success',
  pending: 'bg-warning-tint text-star',
  partially_paid: 'bg-warning-tint text-star',
  overdue: 'bg-danger-tint text-danger',
  waived: 'bg-raised text-ink-secondary',
  written_off: 'bg-raised text-ink-secondary',
};

/* A payout is a withdrawal, not a booking split. `void` is a real outcome and is
   shown as such — a voided record must never read as money received. */
const PAYOUT_TONE = {
  completed: 'bg-success-tint text-success',
  paid: 'bg-success-tint text-success',
  processing: 'bg-info-tint text-info',
  scheduled: 'bg-info-tint text-info',
  pending: 'bg-warning-tint text-star',
  failed: 'bg-danger-tint text-danger',
  cancelled: 'bg-raised text-ink-secondary',
  void: 'bg-raised text-ink-secondary',
};
const VOIDED = ['void', 'cancelled', 'failed'];

const TABS = [
  { id: 'ledger', label: 'Activity' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'settlements', label: 'Settlements' },
];

function Panel({ children, className }) {
  return <div className={cn('rounded-card bg-surface p-5', RING, className)}>{children}</div>;
}

/* Banner — tone carries meaning, never decoration. Orange stays reserved for
   warnings; a hard stop uses danger. */
function Banner({ tone = 'warning', icon: Icon, title, children }) {
  const tones = {
    warning: 'bg-warning-tint text-warning',
    danger: 'bg-danger-tint text-danger',
    info: 'bg-info-tint text-info',
  };
  return (
    <div className={cn('flex items-start gap-3 rounded-card p-4', tones[tone], RING)} role="status">
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-caption font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-xs text-ink-secondary">{children}</div>}
      </div>
    </div>
  );
}

export default function PartnerWallet() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [entries, setEntries] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('ledger');
  const [payingId, setPayingId] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [d, w, l, s] = await Promise.all([
        servisaku.wallet.dashboard(),
        servisaku.wallet.detail(),
        servisaku.wallet.ledger({ limit: 50 }),
        servisaku.wallet.settlements(),
      ]);
      setSummary({ ...EMPTY_SUMMARY, ...d });
      setConfig({
        credit_limit: w?.credit_limit ?? EMPTY_CONFIG.credit_limit,
        settlement_cycle: w?.settlement_cycle ?? EMPTY_CONFIG.settlement_cycle,
        freeze_reason: w?.freeze_reason ?? null,
      });
      setEntries(l?.items || []);
      setSettlements(s || []);
    } catch (err) {
      // A rejection must still clear the spinner, or the page hangs with no
      // explanation — the failure mode PartnerEarnings had.
      console.error('[PartnerWallet] failed to load:', err);
      setLoadError(err?.message || 'Could not load your wallet');
      toast.error(err?.message || 'Could not load your wallet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unpaid = settlements.filter((s) => ['pending', 'partially_paid', 'overdue'].includes(s.status));
  const overGrace = summary.outstanding_commission > config.credit_limit;

  // Every gate below is a server-provided fact, not a client judgement.
  const blockedReason = summary.payout_blocked_reason;
  const belowMinimum = summary.withdrawable > 0 && summary.withdrawable < summary.minimum_payout;
  const canWithdraw = summary.withdrawable > 0 && !blockedReason
    && !summary.payouts_suspended && !belowMinimum;

  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      await servisaku.wallet.withdraw(summary.withdrawable);
      toast.success('Withdrawal requested — funds arrive in 1–3 business days');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

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
      <LoaderCircle className="size-6 animate-spin text-brand" role="status" aria-label="Loading wallet" />
    </div>
  );

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Your money"
        title="Wallet"
        subtitle="Balances, payouts and commission settlements."
        backTo="/partner"
      />

      {loadError && (
        <div className={cn('mb-5 flex items-start gap-3 rounded-card bg-danger-tint p-4', RING)} role="alert">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="text-caption font-semibold text-danger">Could not load your wallet</p>
            <p className="mt-0.5 text-xs text-ink-secondary">{loadError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px] lg:items-start">

        {/* ── Main column ───────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Frozen — the partner must understand why jobs stopped arriving,
              rather than discovering it as an empty job feed. */}
          {summary.is_frozen && (
            <Banner tone="danger" icon={ShieldAlert} title="New jobs are paused">
              {config.freeze_reason || 'Settle your outstanding commission to start receiving jobs again.'}
              {summary.payouts_suspended && ' Payouts are also on hold.'}
            </Banner>
          )}

          {/* Outstanding commission — only once it matters (past the grace
              limit), so a partner owing small change isn't nagged. */}
          {overGrace && !summary.is_frozen && (
            <Banner tone="warning" icon={AlertTriangle} title="Commission outstanding">
              <MoneyValue amount={summary.outstanding_commission} size="sm" tone="muted" /> from cash
              jobs where you collected the full fare. Settle before the due date to keep
              receiving new jobs.
            </Banner>
          )}

          {/* Available — the figure a partner opens this page for. */}
          <MetricStat
            variant="dark"
            label="Available to withdraw"
            amount={summary.withdrawable}
            icon={Wallet}
            caption={
              summary.withdrawable > 0
                ? 'Released earnings, ready to transfer.'
                : 'Nothing released yet — earnings appear here once escrow is released.'
            }
          />

          {/* Pending escrow. Held money is NOT lost money, and there is no
              release date to promise: automatic release is not enabled, so the
              copy deliberately says "until released" and nothing more. */}
          {summary.pending > 0 && (
            <Panel>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-field bg-warning-tint text-star">
                  <Clock className="size-5" aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <p className="text-md font-semibold text-ink">
                    <MoneyValue amount={summary.pending} /> held in escrow until release
                  </p>
                  <p className="mt-1 text-caption text-ink-secondary">
                    This is your share of jobs customers have already paid for. It moves to
                    your available balance when the escrow is released, and is not lost.
                  </p>
                </div>
              </div>
            </Panel>
          )}

          {/* Payout blocked — a real server-provided state, surfaced not hidden. */}
          {blockedReason && (
            <Banner tone="warning" icon={Landmark} title="Payouts are blocked">
              {blockedReason}
            </Banner>
          )}
          {summary.payouts_suspended && !blockedReason && (
            <Banner tone="danger" icon={Ban} title="Payouts are on hold">
              Settle your overdue commission to re-enable withdrawals.
            </Banner>
          )}

          {/* Settlements needing action come first — this is the actionable part. */}
          {unpaid.length > 0 && (
            <div className="space-y-3">
              <SectionHeader title="Settle your commission" sub="Cash jobs you've collected on" />
              {unpaid.map((s) => {
                const due = moment(s.due_date);
                const isOverdue = due.isBefore(moment(), 'day');
                return (
                  <Panel key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="sa-num text-[11px] text-ink-tertiary">{s.reference}</p>
                        <p className="mt-1"><MoneyValue amount={s.balance_due} size="lg" /></p>
                        <p className="sa-num mt-0.5 text-[11px] text-ink-secondary">
                          {moment(s.period_start).format('D MMM')} – {moment(s.period_end).format('D MMM')}
                          {' · '}
                          <span className={isOverdue ? 'font-semibold text-danger' : ''}>
                            {isOverdue ? `overdue ${due.fromNow(true)}` : `due ${due.format('D MMM')}`}
                          </span>
                        </p>
                      </div>
                      <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold capitalize',
                        SETTLEMENT_TONE[s.status] || SETTLEMENT_TONE.pending)}>
                        {s.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button onClick={() => handlePay(s)} disabled={payingId === s.id} className="flex-1">
                        {payingId === s.id ? 'Starting…' : 'Pay online'}
                      </Button>
                      {/* Netting against earnings is opt-in, never automatic. */}
                      <Button
                        onClick={() => handlePayFromBalance(s)}
                        disabled={payingId === s.id || summary.withdrawable < s.balance_due}
                        variant="outline"
                        className="flex-1"
                        title={summary.withdrawable < s.balance_due ? 'Not enough available balance' : undefined}
                      >
                        Use balance
                      </Button>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}

          {/* History */}
          <div className="flex gap-6 shadow-[inset_0_-1px_0_rgb(var(--hairline))]" role="tablist">
            {TABS.map((t) => (
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

          {tab === 'ledger' && (
            entries.length === 0 ? (
              <Panel className="py-10 text-center">
                <p className="text-caption text-ink-secondary">No wallet activity yet.</p>
              </Panel>
            ) : (
              <div className={cn('overflow-hidden rounded-card bg-surface', RING)}>
                {entries.map((e) => {
                  const isCredit = e.direction === 'credit';
                  // A commission debit *raises* what you owe, so the visual sense
                  // of credit/debit inverts on the outstanding bucket.
                  const isGood = e.bucket === 'outstanding' ? !isCredit : isCredit;
                  return (
                    <div key={e.id} className="flex items-center gap-3 p-3.5 shadow-[inset_0_-1px_0_rgb(var(--hairline))] last:shadow-none">
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-field',
                        isGood ? 'bg-success-tint text-success' : 'bg-danger-tint text-danger')}>
                        {isGood ? <ArrowUpRight className="size-4" aria-hidden="true" /> : <ArrowDownRight className="size-4" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-caption font-semibold text-ink">{ENTRY_LABEL[e.type] || e.type}</p>
                        <p className="truncate text-[11px] text-ink-secondary">{e.description}</p>
                        <p className="sa-num text-[10px] text-ink-tertiary">{moment(e.created_date).format('D MMM YYYY, h:mm a')}</p>
                      </div>
                      <div className="text-right">
                        <MoneyValue
                          amount={isCredit ? e.amount : -e.amount}
                          signed
                          size="sm"
                          tone={isGood ? 'positive' : 'negative'}
                        />
                        <p className="text-[10px] capitalize text-ink-tertiary">{e.bucket}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'payouts' && (
            summary.recent_payouts.length === 0 ? (
              <Panel className="py-10 text-center">
                <p className="text-caption text-ink-secondary">No withdrawals yet.</p>
              </Panel>
            ) : (
              <div className="space-y-3">
                {summary.recent_payouts.map((p) => {
                  const voided = VOIDED.includes(p.status);
                  return (
                    <Panel key={p.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {/* A voided withdrawal never reads as money received. */}
                          <MoneyValue
                            amount={p.amount_paid}
                            size="lg"
                            tone={voided ? 'muted' : 'default'}
                            className={voided ? 'line-through' : undefined}
                          />
                          <p className="sa-num mt-0.5 text-[11px] text-ink-secondary">
                            via {p.payout_method || 'Bank Transfer'} · {moment(p.created_date).format('D MMM YYYY')}
                          </p>
                        </div>
                        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize',
                          PAYOUT_TONE[p.status] || PAYOUT_TONE.pending)}>
                          {p.status}
                        </span>
                      </div>
                      {voided && p.failure_reason && (
                        <p className="mt-2 text-[11px] leading-snug text-ink-tertiary">{p.failure_reason}</p>
                      )}
                    </Panel>
                  );
                })}
              </div>
            )
          )}

          {tab === 'settlements' && (
            settlements.length === 0 ? (
              <Panel className="py-10 text-center">
                <p className="text-caption text-ink-secondary">No settlements yet.</p>
              </Panel>
            ) : (
              <div className={cn('overflow-hidden rounded-card bg-surface', RING)}>
                {settlements.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3.5 shadow-[inset_0_-1px_0_rgb(var(--hairline))] last:shadow-none">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-field',
                      s.status === 'paid' ? 'bg-success-tint text-success' : 'bg-warning-tint text-star')}>
                      {s.status === 'paid' ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <Receipt className="size-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="sa-num text-[11px] text-ink-tertiary">{s.reference}</p>
                      <p className="sa-num text-[11px] text-ink-secondary">
                        {moment(s.period_start).format('D MMM')} – {moment(s.period_end).format('D MMM YYYY')}
                      </p>
                      <p className="text-[10px] text-ink-tertiary">
                        <MoneyValue amount={s.gross_cash_collected} size="sm" tone="muted" /> cash collected
                      </p>
                    </div>
                    <div className="text-right">
                      <MoneyValue amount={s.total_due} size="sm" />
                      <span className={cn('mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                        SETTLEMENT_TONE[s.status] || SETTLEMENT_TONE.pending)}>
                        {s.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* ── Rail ──────────────────────────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-5">
          <Panel>
            <SectionHeader title="Withdraw" className="mb-3" />
            <p className="text-caption text-ink-secondary">
              Available now: <MoneyValue amount={summary.withdrawable} size="sm" />
            </p>
            {summary.minimum_payout > 0 && (
              <p className="mt-1 text-xs text-ink-tertiary">
                Minimum withdrawal <MoneyValue amount={summary.minimum_payout} size="sm" tone="muted" />
              </p>
            )}
            <Button block className="mt-4" onClick={handleWithdraw} loading={withdrawing} disabled={!canWithdraw || withdrawing}>
              {withdrawing ? 'Requesting…' : 'Withdraw to bank'}
            </Button>
            {/* Say exactly why the button is off — never let it look broken. */}
            {!canWithdraw && (
              <p className="mt-2 text-xs text-ink-tertiary">
                {blockedReason
                  || (summary.payouts_suspended && 'Payouts are on hold until your overdue commission is settled.')
                  || (belowMinimum && 'Your balance is below the minimum withdrawal amount.')
                  || 'Nothing available to withdraw yet.'}
              </p>
            )}
            {summary.next_payout_date && (
              <p className="sa-num mt-2 text-xs text-ink-tertiary">
                Next payout run {moment(summary.next_payout_date).format('D MMM YYYY')}
              </p>
            )}
          </Panel>

          <div className="grid grid-cols-2 gap-3">
            <MetricStat label="Lifetime earned" amount={summary.lifetime} icon={TrendingUp} caption={`${config.settlement_cycle} settlement`} />
            <MetricStat label="Withdrawn" amount={summary.withdrawn} icon={Landmark} caption="Paid out to you" />
            <MetricStat label="Held in escrow" amount={summary.pending} icon={Clock} caption="Not yet released" />
            <MetricStat
              label="Commission owed"
              amount={summary.outstanding_commission}
              icon={Receipt}
              caption={`Grace up to RM ${config.credit_limit}`}
            />
          </div>

          {summary.bank_account && (
            <Panel>
              <SectionHeader title="Payout account" className="mb-3" />
              <p className="text-caption font-semibold text-ink">{summary.bank_account.bank_name}</p>
              <p className="sa-num text-xs text-ink-secondary">
                •••• {summary.bank_account.account_last4 || summary.bank_account.account_number}
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
