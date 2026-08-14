import { Children, cloneElement, useId } from 'react';
import { cn } from '@/lib/utils';

// Small shared form primitives for the universal steps (B–F).

/**
 * Field — label / hint scaffold shared by every booking control.
 *
 * The label is associated PROGRAMMATICALLY, not just visually: a lone form
 * child is cloned with a generated id and the label points at it via htmlFor.
 * Groups of controls (segmented rows, slot pickers) have no single input to
 * target, so they get role="group" + aria-labelledby instead.
 *
 * Previously these were bare <label> elements with no `for`, so assistive tech
 * announced the controls unnamed.
 */
export function Field({ label, required, hint, children }) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const controlId = `${uid}-control`;
  const hintId = hint ? `${uid}-hint` : undefined;

  const only = Children.count(children) === 1 ? Children.only(children) : null;
  const isFormEl = !!only && typeof only.type === 'string'
    && ['input', 'select', 'textarea'].includes(only.type);
  const targetId = isFormEl ? (only.props.id || controlId) : undefined;

  const body = isFormEl
    ? cloneElement(only, {
      id: targetId,
      'aria-describedby': [only.props['aria-describedby'], hintId].filter(Boolean).join(' ') || undefined,
      'aria-required': required || undefined,
    })
    : (
      <div role="group" aria-labelledby={label ? labelId : undefined} aria-describedby={hintId}>
        {children}
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label id={labelId} htmlFor={targetId} className="text-caption font-medium text-ink">
          {label}
          {required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
          {required && <span className="sr-only"> (required)</span>}
        </label>
      )}
      {body}
      {hint && <p id={hintId} className="text-xs text-ink-secondary">{hint}</p>}
    </div>
  );
}

// Segmented choice — a row of pill buttons for small option sets (yes/no, types).
export function Segmented({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={on}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition',
              on ? 'border-brand bg-brand-tint text-brand ring-1 ring-brand' : 'border-hairline bg-surface text-ink hover:bg-raised',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function TextField({ value, onChange, ...props }) {
  return (
    <input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-hairline bg-surface px-4 py-3 text-ink outline-none focus:ring-1 focus:ring-brand"
      {...props}
    />
  );
}
