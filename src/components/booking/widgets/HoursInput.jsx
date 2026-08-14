import Stepper from './Stepper';
import { rm } from '../optionPrice';

// HOURS_INPUT — hours stepper; line = config.ratePerHour × max(hours, min).
export default function HoursInput({ question, value, onChange }) {
  const cfg = question.config || {};
  const rate = Number(cfg.ratePerHour) || 0;
  const min = cfg.min ?? 1;
  const hours = Math.max(Number(value) || 0, 0);

  return (
    <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3">
      <div className="text-sm text-ink-secondary">{rate > 0 ? `${rm(rate)}/hr · min ${min} hr` : 'Hours'}</div>
      <div className="flex items-center gap-3">
        {rate > 0 && hours > 0 && (
          <span className="font-semibold tabular-nums text-brand">{rm(rate * Math.max(hours, min))}</span>
        )}
        <Stepper
          value={value ?? min}
          onChange={onChange}
          min={min}
          max={cfg.max ?? 12}
          step={cfg.step ?? 0.5}
          suffix="hr"
        />
      </div>
    </div>
  );
}
