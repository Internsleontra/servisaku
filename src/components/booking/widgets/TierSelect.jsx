import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/useTranslation';
import { tierPriceLabel } from '../optionPrice';

// TIER_SELECT — priced cards, pick one. The chosen option sets the base price.
export default function TierSelect({ question, value, onChange }) {
  const { tField } = useTranslation();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {question.options.map((o) => {
        const selected = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={selected}
            className={cn(
              'rounded-2xl border p-4 text-left transition active:scale-[0.98]',
              selected
                ? 'border-brand bg-brand-tint ring-2 ring-brand'
                : 'bg-surface hover:bg-raised shadow-[inset_0_0_0_1px_rgb(var(--hairline))]',
            )}
          >
            <div className="font-semibold text-ink leading-tight">{tField(o, 'label')}</div>
            <div className="mt-2 font-semibold text-brand tabular-nums">{tierPriceLabel(o)}</div>
          </button>
        );
      })}
    </div>
  );
}
