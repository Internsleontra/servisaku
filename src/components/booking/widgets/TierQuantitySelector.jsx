import Stepper from './Stepper';
import { useTranslation } from '@/lib/useTranslation';
import { rm, unitPriceLabel } from '../optionPrice';

// TIER_QUANTITY — each option carries its own quantity; line = unit_price × qty.
// value is an object: { [optionId]: qty }.
export default function TierQuantitySelector({ question, value, onChange }) {
  const { tField } = useTranslation();
  const obj = (value && typeof value === 'object') ? value : {};
  const setQty = (id, qty) => {
    const next = { ...obj };
    if (qty > 0) next[id] = qty; else delete next[id];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {question.options.map((o) => {
        const qty = Number(obj[o.id]) || 0;
        return (
          <div
            key={o.id}
            className="flex items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3"
          >
            <div>
              <div className="text-ink">{tField(o, 'label')}</div>
              <div className="text-sm text-ink-secondary">{unitPriceLabel(o)}</div>
            </div>
            <div className="flex items-center gap-3">
              {qty > 0 && (
                <span className="font-semibold tabular-nums text-brand">{rm((o.unit_price || 0) * qty)}</span>
              )}
              <Stepper value={qty} onChange={(q) => setQty(o.id, q)} min={0} max={20} step={1} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
