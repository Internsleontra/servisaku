import { STATUS_META } from '@/lib/bookingEngine';
import { CheckCircle2, Circle } from 'lucide-react';
import { CONSUMER_TIMELINE, labelFor } from '@/lib/statusLabels';
import { statusIconFor, STATUS_ICON } from '@/lib/statusIcons';

/* Consumer-facing progress. Node labels come from the approved consumer
   vocabulary (src/lib/statusLabels.js) — a display mapping only. STATUS_META is
   left alone because the partner surfaces share it.

   `assigned` and `accepted` both read "Confirmed", so they render as ONE node.
   Arrived stays a node of its own. */
const SUBTITLE = {
  requested: 'Waiting for a pro to be assigned…',
  confirmed: 'Your pro is confirmed and preparing to travel',
  en_route: 'Your pro is on the way to your location',
  arrived: 'Your pro has arrived',
  in_progress: 'Service in progress',
  completed: 'Service completed',
};

export default function BookingTimeline({ booking }) {
  const currentStep = STATUS_META[booking.status]?.step ?? 0;
  const isCancelled = booking.status === 'cancelled';
  const isDisputed = booking.status === 'disputed';

  if (isCancelled || isDisputed) {
    return (
      <div className="flex items-center gap-3 rounded-card bg-danger-tint p-4 shadow-[inset_0_0_0_1px_rgb(var(--danger)/0.3)]">
        {(() => { const I = statusIconFor(booking.status); return I ? <I className="size-6 shrink-0" /> : null; })()}
        <div>
          <p className={`font-semibold text-sm ${isCancelled ? 'text-danger' : 'text-danger'}`}>
            Booking {labelFor(booking.status).toLowerCase()}
          </p>
          {booking.cancellation_reason && (
            <p className="text-xs text-ink-secondary mt-0.5">{booking.cancellation_reason}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card bg-surface p-4 shadow-e1">
      <p className="sa-caps mb-4 text-ink-tertiary">Booking progress</p>
      <div className="space-y-0">
        {CONSUMER_TIMELINE.map((node, i) => {
          // A node's position is the furthest step any of its stored statuses maps to.
          const nodeStep = Math.max(...node.match.map((m) => STATUS_META[m]?.step ?? 0));
          // Glyph comes from the client-only icon map, keyed by the stored
          // status this node represents (bookingEngine is server-safe).
          const NodeIcon = statusIconFor(node.match.find((m) => STATUS_ICON[m]) ?? node.match[0]);
          const done = nodeStep < currentStep;
          const active = node.match.includes(booking.status);
          const future = nodeStep > currentStep;
          const isLast = i === CONSUMER_TIMELINE.length - 1;

          return (
            <div key={node.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  done ? 'bg-brand' : active ? 'bg-brand/10 ring-2 ring-brand' : 'bg-raised'
                }`}>
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  ) : active && NodeIcon ? (
                    <NodeIcon className="size-4 text-brand" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-ink-secondary" />
                  )}
                </div>
                {!isLast && (
                  <div className={`w-0.5 h-6 transition-all ${done ? 'bg-brand' : 'bg-border'}`} />
                )}
              </div>
              <div className={`pb-3 pt-1 flex-1 ${future ? 'opacity-40' : ''}`}>
                <p className={`text-sm font-semibold leading-tight ${active ? 'text-brand' : done ? 'text-ink' : 'text-ink-secondary'}`}>
                  {node.label}
                  {active && <span className="ml-2 inline-block w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />}
                </p>
                {active && (
                  <p className="text-xs text-ink-secondary mt-0.5">{SUBTITLE[node.id]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}