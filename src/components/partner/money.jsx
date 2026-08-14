/* ── Partner money primitives ───────────────────────────────────────────────
   Shared by Earnings, Wallet, Dashboard, Analytics and the job screen.

   The partner kit (ui_kits/partner/PartnerEarningsView.jsx) fixes the pattern:
   a net-earnings hero on a dark surface, a KPI grid beneath it, and gross → fee
   → net always shown as a triplet with mono, right-aligned numerals. These
   primitives carry that so no page hand-rolls money markup again.

   Conventions kept:
     · `formatMYR` from @/lib/utils — never a raw template string
     · `sa-num` for tabular numerals so columns of figures line up
     · inset RING, never border + shadow
     · rounded-card (20px) / rounded-field (14px)
     · orange is NOT used here; it is reserved for Instant Help and warnings
--------------------------------------------------------------------------- */
import { cn, formatMYR } from '@/lib/utils';
import { RING } from '@/components/ds';

/* ── MoneyValue ─────────────────────────────────────────────────────────────
   One monetary figure. `decimals` follows the existing rule: payable totals
   show sen, browsing figures do not. `signed` renders a leading − for
   deductions (fees, commission) without the caller building the string.
--------------------------------------------------------------------------- */
const MONEY_SIZES = {
  sm: 'text-caption',
  md: 'text-md',
  lg: 'text-h4',
  xl: 'text-h3',
  hero: 'text-display-2',
};

const MONEY_TONES = {
  default: 'text-ink',
  muted: 'text-ink-secondary',
  positive: 'text-success',
  negative: 'text-danger',
  inverse: 'text-white',
};

export function MoneyValue({
  amount,
  decimals = true,
  signed = false,
  size = 'md',
  tone = 'default',
  className,
  ...rest
}) {
  const missing = amount == null || Number.isNaN(Number(amount));
  const magnitude = missing ? null : Math.abs(Number(amount));
  const negative = !missing && Number(amount) < 0;
  // Zero takes no sign. `-0 < 0` is false in JS, so a zero deduction (e.g. a
  // commission of 0 passed as `-0`) would otherwise render as "+ RM 0.00".
  const zero = !missing && magnitude === 0;
  const prefix = signed && !missing && !zero ? (negative ? '− ' : '+ ') : '';

  return (
    <span
      className={cn('sa-num font-semibold tabular-nums', MONEY_SIZES[size] || MONEY_SIZES.md, MONEY_TONES[tone] || MONEY_TONES.default, className)}
      {...rest}
    >
      {missing ? '—' : `${prefix}${formatMYR(magnitude, { decimals })}`}
    </span>
  );
}

/* ── PayoutBreakdown ────────────────────────────────────────────────────────
   Gross → deductions → net. The kit always shows all three together so the
   partner can see what was taken and why; the net row is separated by a hairline
   and never rendered alone.

   `lines` is [{ label, amount, hint }]. Negative amounts render as deductions.
--------------------------------------------------------------------------- */
export function PayoutBreakdown({ gross, lines = [], net, caption, className }) {
  return (
    <div className={cn('rounded-card bg-surface p-4', RING, className)}>
      <dl className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-caption text-ink-secondary">Job total</dt>
          <dd><MoneyValue amount={gross} tone="muted" /></dd>
        </div>

        {lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-caption text-ink-secondary">
              {l.label}
              {l.hint && <span className="ml-1.5 text-xs text-ink-tertiary">{l.hint}</span>}
            </dt>
            <dd><MoneyValue amount={l.amount} signed tone={Number(l.amount) < 0 ? 'negative' : 'default'} /></dd>
          </div>
        ))}

        <div className="flex items-baseline justify-between gap-4 pt-2.5 shadow-[inset_0_1px_0_rgb(var(--hairline))]">
          <dt className="text-md font-semibold text-ink">You receive</dt>
          <dd><MoneyValue amount={net} size="lg" /></dd>
        </div>
      </dl>
      {caption && <p className="mt-3 text-xs text-ink-tertiary">{caption}</p>}
    </div>
  );
}

/* ── MetricStat ─────────────────────────────────────────────────────────────
   The kit's earnings hero + KPI tile. `variant="dark"` is the hero on
   --grad-deep; the default sits on a surface card.

   Distinct from the existing MetricCard (a compact icon KPI tile): MetricStat
   carries a value, an optional delta and a caption, and can go full-bleed dark.
--------------------------------------------------------------------------- */
export function MetricStat({
  label,
  value,
  amount,
  decimals = true,
  delta,
  caption,
  icon: Icon,
  variant = 'default',
  className,
}) {
  const dark = variant === 'dark';
  const deltaUp = typeof delta === 'number' ? delta >= 0 : null;

  return (
    <div
      className={cn(
        'rounded-card p-5',
        dark ? 'bg-grad-deep text-white' : cn('bg-surface', RING),
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn('text-caption font-medium', dark ? 'text-white/70' : 'text-ink-secondary')}>
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-field',
              dark ? 'bg-white/10 text-white' : 'bg-brand-tint text-brand',
            )}
          >
            <Icon className="size-[18px]" />
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2.5">
        {amount != null
          ? <MoneyValue amount={amount} decimals={decimals} size="xl" tone={dark ? 'inverse' : 'default'} />
          : <span className={cn('sa-num text-h3 font-semibold tabular-nums', dark ? 'text-white' : 'text-ink')}>{value ?? '—'}</span>}

        {deltaUp !== null && (
          <span
            className={cn(
              'sa-num text-caption font-semibold',
              deltaUp
                ? (dark ? 'text-live' : 'text-success')
                : (dark ? 'text-white/70' : 'text-danger'),
            )}
          >
            {deltaUp ? '+' : '−'}{Math.abs(delta)}%
          </span>
        )}
      </div>

      {caption && (
        <p className={cn('mt-2 text-xs', dark ? 'text-white/60' : 'text-ink-tertiary')}>{caption}</p>
      )}
    </div>
  );
}
