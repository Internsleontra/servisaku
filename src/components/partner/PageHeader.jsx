/* ── PageHeader ─────────────────────────────────────────────────────────────
   Every partner page hand-rolled its own title block. This is the one pattern:
   optional back link, eyebrow, title, subtitle, and a right-hand action slot.

   Canonical type and spacing — text-h2 title, text-md secondary subtitle, and
   the 1240px content rhythm the shell already establishes. No border, no
   shadow: separation comes from spacing, matching the kit.
--------------------------------------------------------------------------- */
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  backTo,
  backLabel = 'Back',
  actions,
  className,
}) {
  return (
    <header className={cn('mb-6', className)}>
      {backTo && (
        <Link
          to={backTo}
          className={cn(
            'mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-field text-caption font-medium text-ink-secondary transition-colors hover:text-ink',
            // Canonical keyboard focus treatment. A plain <Link> gets no ring
            // from the app CSS, so this was falling back to the browser's
            // default orange outline:auto. The `shadow:` type hint is required;
            // a bare var() compiles to --tw-shadow-color.
            'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
          )}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow && <p className="sa-caps mb-1.5 text-ink-tertiary">{eyebrow}</p>}
          <h1 className="text-h2 text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-md text-ink-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
