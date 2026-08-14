import { rm } from '../optionPrice';

// AREA_INPUT — numeric sqft; line = config.ratePerSqft × area.
export default function AreaInput({ question, value, onChange }) {
  const cfg = question.config || {};
  const rate = Number(cfg.ratePerSqft) || 0;
  const area = Number(value) || 0;
  const unit = cfg.unit || 'sqft';

  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <input
          type="number"
          inputMode="numeric"
          min={cfg.min ?? 0}
          max={cfg.max ?? undefined}
          step={cfg.step ?? 1}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={`Enter area in ${unit}`}
          className="w-full bg-transparent text-lg font-semibold text-ink outline-none placeholder:text-ink-tertiary"
        />
        <span className="shrink-0 text-sm text-ink-secondary">{unit}</span>
      </div>
      {rate > 0 && (
        <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-sm">
          <span className="text-ink-secondary">{rm(rate)}/{unit}</span>
          {area > 0 && <span className="font-semibold tabular-nums text-brand">{rm(rate * area)}</span>}
        </div>
      )}
    </div>
  );
}
