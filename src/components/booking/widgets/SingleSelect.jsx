import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/useTranslation';
import { optionModifierLabel } from '../optionPrice';

// SINGLE_SELECT — radio list. Adds the chosen option's modifier (flat, per-unit,
// or per-sqft depending on the question config).
export default function SingleSelect({ question, value, onChange }) {
  const { tField } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {question.options.map((o) => {
        const selected = value === o.id;
        const mod = optionModifierLabel(question, o);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={selected}
            className={cn(
              'flex items-center justify-between rounded-xl px-4 py-3 text-left transition',
              selected
                ? 'bg-brand-tint shadow-[inset_0_0_0_1.5px_rgb(var(--brand))]'
                : 'bg-surface hover:bg-raised shadow-[inset_0_0_0_1px_rgb(var(--hairline))]',
            )}
          >
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  'h-4 w-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(var(--hairline))]',
                  selected ? 'border-brand bg-brand' : 'border-hairline',
                )}
              />
              <span className="text-ink">{tField(o, 'label')}</span>
            </span>
            {mod && <span className="text-sm font-semibold text-ink-secondary tabular-nums">{mod}</span>}
          </button>
        );
      })}
    </div>
  );
}
