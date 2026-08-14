import Stepper from './Stepper';
import { rm } from '../optionPrice';

// QUANTITY — single stepper; line = config.pricePerUnit × qty.
export default function QuantitySelector({ question, value, onChange }) {
  const cfg = question.config || {};
  const qty = Number(value) || 0;
  const unit = Number(cfg.pricePerUnit) || 0;

  return (
    <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3">
      <div className="text-sm text-ink-secondary">{unit > 0 ? `${rm(unit)} each` : 'Quantity'}</div>
      <div className="flex items-center gap-3">
        {unit > 0 && qty > 0 && (
          <span className="font-semibold tabular-nums text-brand">{rm(unit * qty)}</span>
        )}
        <Stepper
          value={qty}
          onChange={onChange}
          min={cfg.min ?? 0}
          max={cfg.max ?? 99}
          step={cfg.step ?? 1}
        />
      </div>
    </div>
  );
}
