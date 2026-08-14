/* ── Partner job primitives ─────────────────────────────────────────────────
   Shared by the dashboard, calendar and job screen.

   STATUS VOCABULARY IS PARTNER-SIDE AND STAYS THAT WAY. Labels come from
   STATUS_META in @/lib/bookingEngine — Pending / Assigned / Accepted / En Route
   / Arrived / In Progress / Completed / Cancelled / Disputed. The consumer
   display mapping in @/lib/statusLabels collapses `assigned` and `accepted`
   into one "Confirmed" node and renames states for customers; a partner needs
   to tell those apart to know whether to act, so it is deliberately NOT used
   here.

   Icons come from @/lib/statusIcons (client-only) because bookingEngine is
   imported by the Express server and must stay free of React.
--------------------------------------------------------------------------- */
import { Link } from 'react-router-dom';
import { MapPin, Navigation } from 'lucide-react';
import { STATUS_META, formatBookingRef } from '@/lib/bookingEngine';
import { statusIconFor } from '@/lib/statusIcons';
import { cn } from '@/lib/utils';
import { RING } from '@/components/ds';
import { MoneyValue } from './money';

/* STATUS_META carries a colour KEY, not classes. Full literal strings so the
   Tailwind JIT keeps them. Pairings reuse the ones already established by
   MetricCard rather than introducing new colour semantics. */
const STATUS_TONE = {
  amber: 'bg-warning-tint text-star',
  blue: 'bg-info-tint text-info',
  indigo: 'bg-brand-tint text-brand',
  violet: 'bg-chat-tint text-chat',
  primary: 'bg-brand-tint text-brand',
  emerald: 'bg-success-tint text-success',
  red: 'bg-danger-tint text-danger',
  orange: 'bg-warning-tint text-warning',
};

/** Statuses where the partner is mid-job — the sanctioned use of the neon token. */
const LIVE_STATUSES = new Set(['en_route', 'arrived', 'started', 'in_progress']);

/* ── JobStatusBadge ─────────────────────────────────────────────────────── */
export function JobStatusBadge({ status, showIcon = true, className }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  const Icon = statusIconFor(status);
  const live = LIVE_STATUSES.has(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold',
        STATUS_TONE[meta.color] || STATUS_TONE.primary,
        className,
      )}
    >
      {live && <span className="size-1.5 shrink-0 rounded-full bg-live animate-pulse" aria-hidden="true" />}
      {showIcon && Icon && !live && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
      {meta.label}
    </span>
  );
}

/* ── JobCard ────────────────────────────────────────────────────────────────
   The kit's job-feed row: service + reference, status, when, address, distance,
   and the customer price alongside the partner payout. Payout is the figure the
   partner actually cares about, so it is the emphasised one.
--------------------------------------------------------------------------- */
export function JobCard({
  job,
  to,
  onClick,
  actions,
  className,
}) {
  const {
    id, status, service_name, scheduled_at, address, distance_km,
    total_amount, payout_amount,
  } = job || {};

  const Comp = to ? Link : onClick ? 'button' : 'div';
  const props = to ? { to } : onClick ? { onClick, type: 'button' } : {};
  const interactive = Boolean(to || onClick);

  return (
    <Comp
      {...props}
      className={cn(
        'block w-full rounded-card bg-surface p-4 text-left',
        RING,
        interactive && 'transition hover:-translate-y-0.5 hover:shadow-e2 active:scale-[0.99]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-md font-semibold text-ink">{service_name || 'Service'}</p>
          <p className="sa-num mt-0.5 text-xs text-ink-tertiary">{formatBookingRef(id)}</p>
        </div>
        <JobStatusBadge status={status} className="shrink-0" />
      </div>

      <dl className="mt-3 space-y-1.5">
        {scheduled_at && (
          <div className="flex items-center gap-2 text-caption text-ink-secondary">
            <dt className="sr-only">Scheduled</dt>
            <dd className="sa-num">{scheduled_at}</dd>
          </div>
        )}
        {address && (
          <div className="flex items-start gap-2 text-caption text-ink-secondary">
            <dt className="sr-only">Address</dt>
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-tertiary" aria-hidden="true" />
            <dd className="min-w-0 flex-1 truncate">{address}</dd>
          </div>
        )}
        {distance_km != null && (
          <div className="flex items-center gap-2 text-caption text-ink-secondary">
            <dt className="sr-only">Distance</dt>
            <Navigation className="size-3.5 shrink-0 text-ink-tertiary" aria-hidden="true" />
            <dd className="sa-num">{distance_km} km</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex items-end justify-between gap-3 pt-3 shadow-[inset_0_1px_0_rgb(var(--hairline))]">
        <div>
          <p className="text-xs text-ink-tertiary">You earn</p>
          <MoneyValue amount={payout_amount} size="lg" />
        </div>
        {total_amount != null && (
          <div className="text-right">
            <p className="text-xs text-ink-tertiary">Job total</p>
            <MoneyValue amount={total_amount} size="sm" tone="muted" />
          </div>
        )}
      </div>

      {actions && <div className="mt-3 flex gap-2">{actions}</div>}
    </Comp>
  );
}
