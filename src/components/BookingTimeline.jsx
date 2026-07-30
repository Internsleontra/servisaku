import { STATUS_META } from '@/lib/bookingEngine';
import { CheckCircle2, Circle } from 'lucide-react';

const ORDERED_STATUSES = ['pending', 'assigned', 'accepted', 'en_route', 'arrived', 'started', 'completed'];

export default function BookingTimeline({ booking }) {
  const currentStep = STATUS_META[booking.status]?.step ?? 0;
  const isCancelled = booking.status === 'cancelled';
  const isDisputed = booking.status === 'disputed';

  if (isCancelled || isDisputed) {
    return (
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${isCancelled ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}>
        <span className="text-2xl">{STATUS_META[booking.status]?.icon}</span>
        <div>
          <p className={`font-semibold text-sm ${isCancelled ? 'text-red-700' : 'text-orange-700'}`}>
            Booking {STATUS_META[booking.status]?.label}
          </p>
          {booking.cancellation_reason && (
            <p className="text-xs text-muted-foreground mt-0.5">{booking.cancellation_reason}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-3xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-4">Booking Progress</p>
      <div className="space-y-0">
        {ORDERED_STATUSES.map((status, i) => {
          const meta = STATUS_META[status];
          const done = meta.step < currentStep;
          const active = meta.step === currentStep;
          const future = meta.step > currentStep;
          const isLast = i === ORDERED_STATUSES.length - 1;

          return (
            <div key={status} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  done ? 'bg-primary' : active ? 'bg-primary/10 ring-2 ring-primary' : 'bg-muted'
                }`}>
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  ) : active ? (
                    <span className="text-sm">{meta.icon}</span>
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                {!isLast && (
                  <div className={`w-0.5 h-6 transition-all ${done ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
              <div className={`pb-3 pt-1 flex-1 ${future ? 'opacity-40' : ''}`}>
                <p className={`text-sm font-semibold leading-tight ${active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {meta.label}
                  {active && <span className="ml-2 inline-block w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />}
                </p>
                {active && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {status === 'pending' && 'Waiting for partner assignment...'}
                    {status === 'assigned' && 'Partner has been assigned, awaiting acceptance'}
                    {status === 'accepted' && 'Partner confirmed — preparing to travel'}
                    {status === 'en_route' && 'Partner is on the way to your location'}
                    {status === 'arrived' && 'Partner has arrived'}
                    {status === 'started' && 'Service in progress'}
                    {status === 'completed' && 'Service completed successfully!'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}