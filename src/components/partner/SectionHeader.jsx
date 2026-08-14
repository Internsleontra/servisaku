import { cn } from '@/lib/utils';

// Consistent section title + optional trailing action (link/button).
export function SectionHeader({ title, sub, action, className }) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[11px] text-ink-secondary">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
