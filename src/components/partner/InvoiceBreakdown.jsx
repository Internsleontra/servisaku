import { formatMYR } from '@/lib/utils';

// Renders a dynamic booking's price_breakdown line items + authoritative totals.
// `breakdown` is the snapshot array from the engine; `total`/`discount`/`payout`
// come from the booking record (the source of truth for money owed/earned).
export function InvoiceBreakdown({ breakdown = [], total = 0, discount = 0, payout }) {
  const lines = Array.isArray(breakdown) ? breakdown.filter((l) => Number(l.amount) !== 0) : [];

  return (
    <div className="space-y-2.5">
      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-start justify-between gap-4 text-xs">
              <span className="text-ink-secondary">
                {l.optionLabel ? `${l.label} · ${l.optionLabel}` : l.label}
                {l.qty != null && <span className="text-ink-tertiary"> × {l.qty}</span>}
              </span>
              <span className="font-medium text-ink">{formatMYR(l.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5 border-t border-hairline/10 pt-2.5">
        {discount > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-secondary">Discount</span>
            <span className="font-medium text-success">−{formatMYR(discount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">Total</span>
          <span className="text-sm font-semibold text-ink">{formatMYR(total)}</span>
        </div>
        {payout != null && (
          <div className="flex items-center justify-between rounded-xl bg-brand-tint/40 px-3 py-2">
            <span className="text-xs font-semibold text-brand-ink">Your payout</span>
            <span className="text-sm font-semibold text-brand">{formatMYR(payout)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
