import { cn, formatMYR } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/bookingEngine';
import { Field } from '../fields';
import { paymentIconFor } from '@/lib/paymentIcons';
import { useTranslation } from '@/lib/useTranslation';

// Step F — Review & Pay. Itemised breakdown from the authoritative quote + payment.
export default function StepF({ service, quote, quoteError, payment, setPayment }) {
  const { t, tField } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-hairline bg-surface p-4">
        <div className="mb-3 font-semibold text-ink">{tField(service, 'name')}</div>

        {quoteError && <p className="text-sm text-danger">{quoteError}</p>}

        {quote && (
          <div className="flex flex-col gap-2">
            {quote.breakdown.map((li, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className={cn('text-ink-secondary', li.type === 'DISCOUNT' && 'text-brand')}>
                  {/* dual-field-exempt: quote breakdown is localized server-side (SWAP) */}
                  {li.label}{li.qty > 1 ? ` ×${li.qty}` : ''}
                </span>
                <span className={cn('tabular-nums', li.amount < 0 ? 'text-brand' : 'text-ink')}>
                  {li.amount < 0 ? '−' : ''}{formatMYR(Math.abs(li.amount), { decimals: !Number.isInteger(li.amount) })}
                </span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-hairline pt-3">
              <span className="font-semibold text-ink">{t('Total')}</span>
              <span className="text-lg font-semibold tabular-nums text-brand">
                {formatMYR(quote.total, { decimals: !Number.isInteger(quote.total) })}
              </span>
            </div>
            {service.pricing_type === 'DIAGNOSTIC' && (
              <p className="mt-1 text-xs text-ink-secondary">
                  {t('This is the call-out fee. The technician will quote repairs on site for your approval before any work.')}
                </p>
            )}
          </div>
        )}
      </div>

      <Field label={t('Payment method')} required>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PAYMENT_METHODS.map((m) => {
            const on = payment.method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setPayment({ method: m.id })}
                aria-pressed={on}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition',
                  on ? 'bg-brand-tint shadow-[inset_0_0_0_1.5px_rgb(var(--brand))]' : 'bg-surface hover:bg-raised shadow-[inset_0_0_0_1px_rgb(var(--hairline))]',
                )}
              >
                {(() => { const I = paymentIconFor(m.id); return <I className="size-5 shrink-0 text-ink-secondary" />; })()}
                <span>
                  <span className="block text-sm font-medium text-ink">{t(m.label)}</span>
                  <span className="block text-xs text-ink-secondary">{t(m.sub)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}
