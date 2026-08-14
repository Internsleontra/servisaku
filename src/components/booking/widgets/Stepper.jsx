import { cn } from '@/lib/utils';
import { Minus, Plus } from 'lucide-react';

// Shared −/value/+ stepper used by QUANTITY, TIER_QUANTITY and HOURS_INPUT.
export default function Stepper({ value, onChange, min = 0, max = 99, step = 1, suffix }) {
  const v = Number(value) || 0;
  const clamp = (n) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  const dec = () => onChange(clamp(v - step));
  const inc = () => onChange(clamp(v + step));
  const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1));

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-surface p-1">
      <button
        type="button"
        onClick={dec}
        disabled={v <= min}
        aria-label="Decrease"
        className={cn('flex h-9 w-9 items-center justify-center rounded-lg transition',
          v <= min ? 'text-ink-tertiary' : 'text-ink hover:bg-raised')}
      >
        <Minus size={16} />
      </button>
      <span className="min-w-[3rem] text-center font-semibold tabular-nums text-ink">
        {fmt(v)}{suffix ? <span className="ml-0.5 text-xs font-medium text-ink-secondary">{suffix}</span> : null}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={v >= max}
        aria-label="Increase"
        className={cn('flex h-9 w-9 items-center justify-center rounded-lg transition',
          v >= max ? 'text-ink-tertiary' : 'text-ink hover:bg-raised')}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
