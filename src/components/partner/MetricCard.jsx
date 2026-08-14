import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

// Tone → icon chip classes. Full literal strings so Tailwind JIT keeps them.
const TONES = {
  brand: 'bg-brand-tint text-brand',
  amber: 'bg-warning-tint text-star',
  emerald: 'bg-success-tint text-success',
  sky: 'bg-info-tint text-info',
  violet: 'bg-chat-tint text-chat',
  rose: 'bg-danger-tint text-danger',
  slate: 'bg-raised text-ink-secondary',
};

// A single KPI tile used across the partner dashboard, wallet and analytics.
// Pass `to` (route) or `onClick` to make it tappable.
export function MetricCard({ icon: Icon, label, value, sub, tone = 'brand', className, to, onClick }) {
  const interactive = Boolean(to || onClick);
  const Comp = to ? Link : onClick ? 'button' : 'div';
  const props = to ? { to } : onClick ? { onClick } : {};
  return (
    <Comp
      {...props}
      className={cn(
        'block bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 text-left w-full',
        interactive && 'hover:shadow-e2 active:scale-[0.99] transition-all',
        className,
      )}
    >
      {Icon && (
        <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl', TONES[tone] || TONES.brand)}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-ink-secondary">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-ink-tertiary">{sub}</p>}
    </Comp>
  );
}
