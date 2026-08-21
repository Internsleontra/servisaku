import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/useTranslation';
import { Check } from 'lucide-react';
import { optionModifierLabel } from '../optionPrice';

// MULTI_SELECT — checkboxes. Adds each checked option's modifier.
export default function MultiSelect({ question, value, onChange }) {
  const { tField } = useTranslation();
  const selected = Array.isArray(value) ? value : [];
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="flex flex-col gap-2">
      {question.options.map((o) => {
        const on = selected.includes(o.id);
        const mod = optionModifierLabel(question, o);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            aria-pressed={on}
            className={cn(
              'flex items-center justify-between rounded-xl px-4 py-3 text-left transition',
              on ? 'bg-brand-tint shadow-[inset_0_0_0_1.5px_rgb(var(--brand))]' : 'bg-surface hover:bg-raised shadow-[inset_0_0_0_1px_rgb(var(--hairline))]',
            )}
          >
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md shadow-[inset_0_0_0_1px_rgb(var(--hairline))]',
                  on ? 'border-brand bg-brand text-brand-ink' : 'border-hairline',
                )}
              >
                {on && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="text-ink">{tField(o, 'label')}</span>
            </span>
            {mod && <span className="text-sm font-semibold text-ink-secondary tabular-nums">{mod}</span>}
          </button>
        );
      })}
    </div>
  );
}
