import { cn } from '@/lib/utils';

/**
 * Booking status pill.
 *
 * DISPLAY-LAYER MAPPING ONLY (approved 2026-08-07). This translates the
 * product's stored status values into the design system's customer-facing
 * vocabulary. It does **not** change the database, the API, `STATUS_TRANSITIONS`
 * or the partner app — those keep the existing values.
 *
 *   stored              shown
 *   ------------------  --------------
 *   pending             Requested        (never "Pending" — the design system
 *                                        uses `pending` for partner KYC)
 *   assigned            Confirmed
 *   accepted            Confirmed
 *   en_route            On the way
 *   arrived             Arrived
 *   started             In progress
 *   in_progress         In progress
 *   completed           Completed
 *   cancelled           Cancelled
 *   refunded            Refunded
 *   disputed            Disputed
 *   paid                Paid
 *
 * `Arrived` is kept as a distinct customer-facing state rather than folded into
 * "On the way". The product genuinely tracks it — the pro is at the door but
 * has not started — and the booking timeline shows it. The design system was
 * EXTENDED to add `arrived` (see StatusPill.jsx in the kit) rather than the
 * product flattened to fit.
 *
 * Tones follow the system: neutral · info · success · warning · danger · live.
 * LIVE (navy pill + pulsing neon dot) is reserved for genuinely in-flight
 * states — on the way, arrived, in progress. Neon is a signal, not decoration.
 */
const LIVE = 'bg-navy text-live border-transparent';
const INFO = 'bg-info-tint text-info border-info/30';

const STATUS_MAP = {
  pending:     { label: 'Requested',   class: 'bg-raised text-ink-secondary border-hairline' },
  requested:   { label: 'Requested',   class: 'bg-raised text-ink-secondary border-hairline' },
  assigned:    { label: 'Confirmed',   class: INFO },
  accepted:    { label: 'Confirmed',   class: INFO },
  confirmed:   { label: 'Confirmed',   class: INFO },
  en_route:    { label: 'On the way',  class: LIVE, live: true },
  arrived:     { label: 'Arrived',     class: LIVE, live: true },
  started:     { label: 'In progress', class: LIVE, live: true },
  in_progress: { label: 'In progress', class: LIVE, live: true },
  completed:   { label: 'Completed',   class: 'bg-success-tint text-success border-success/30' },
  paid:        { label: 'Paid',        class: 'bg-success-tint text-success border-success/30' },
  escrowed:    { label: 'In escrow',   class: INFO },
  cancelled:   { label: 'Cancelled',   class: 'bg-danger-tint text-danger border-danger/30' },
  refunded:    { label: 'Refunded',    class: 'bg-warning-tint text-warning border-warning/30' },
  disputed:    { label: 'Disputed',    class: 'bg-danger-tint text-danger border-danger/30' },
};

export default function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold',
      s.class,
    )}>
      {s.live && (
        <span className="size-[7px] rounded-full bg-live shadow-[0_0_0_3px_rgb(var(--live)/0.25)]" />
      )}
      {s.label}
    </span>
  );
}
