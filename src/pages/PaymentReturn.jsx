import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CircleCheck, CircleX, Clock, Loader2, Lock, MessageSquare, Navigation, ArrowRight,
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ui/button';
import { formatRM } from '@/lib/paymentEngine';
import { PriceSummary, RING } from '@/components/ds';

/**
 * Booking confirmation.
 *
 * Billplz redirects the payer here after checkout; the payment is confirmed
 * server-side (sync re-fetches the bill) before anything is shown, so this page
 * never claims success on the strength of a redirect alone.
 *
 * Rebuilt on the system's page pattern: gradient header carrying the outcome,
 * then a receipt card and the natural next actions. The previous version was a
 * centred mobile column with a `max-w-xs` receipt on a 1440px canvas.
 */
const OUTCOME = {
  checking: {
    icon: Loader2, spin: true, tone: 'text-white',
    title: 'Confirming your payment…', sub: 'This only takes a moment.',
  },
  paid: {
    icon: CircleCheck, tone: 'text-live',
    title: 'Booking confirmed', sub: 'Funds are held in escrow until your service is completed.',
  },
  pending: {
    icon: Clock, tone: 'text-warning',
    title: 'Payment pending',
    sub: "We haven't received confirmation yet. If you completed payment, refresh in a moment.",
  },
  failed: {
    icon: CircleX, tone: 'text-danger',
    title: 'Payment not completed', sub: 'You were not charged. You can try again from your booking.',
  },
};

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = params.get('payment_id');
  const [state, setState] = useState('checking');
  const [payment, setPayment] = useState(null);

  useEffect(() => {
    let active = true;
    if (!paymentId) { setState('failed'); return undefined; }
    servisaku.payments.sync(paymentId)
      .then((p) => {
        if (!active) return;
        setPayment(p);
        setState(p?.status === 'paid' ? 'paid' : p?.status === 'failed' ? 'failed' : 'pending');
      })
      .catch(() => active && setState('failed'));
    return () => { active = false; };
  }, [paymentId]);

  const o = OUTCOME[state];
  const Icon = o.icon;
  const bookingId = payment?.booking_id;
  const amount = payment ? formatRM((payment.amount || 0) / 100) : '—';

  return (
    <div className="bg-bg pb-16">
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-12 md:px-8 md:pb-16">
          <span className={`grid size-16 place-items-center rounded-full bg-white/10 ring-1 ring-inset ring-white/20 ${o.tone}`}>
            <Icon className={`size-8 ${o.spin ? 'animate-spin' : ''}`} />
          </span>
          <h1 className="text-display-2 mt-5 text-white">{o.title}</h1>
          <p className="mt-3 max-w-[520px] text-lead text-white/[0.78]">{o.sub}</p>
        </div>
      </div>

      <div className="mx-auto -mt-8 grid w-full max-w-[1240px] items-start gap-6 px-5 md:px-8 lg:grid-cols-[1.5fr_0.9fr]">
        {/* What happens next */}
        <div className="rounded-card bg-surface p-5 shadow-e2 md:p-6">
          <h2 className="mb-4 font-display text-h3 font-semibold text-ink">What happens next</h2>
          <ol className="flex flex-col gap-4">
            {[
              [Navigation, 'We match you with a verified pro', 'Usually within 15 minutes. You’ll be notified as soon as they accept.'],
              [MessageSquare, 'Chat and track live', 'Message your pro directly and follow them on the map from doorstep to done.'],
              [Lock, 'Escrow releases on your confirmation', 'Money reaches the partner only after you confirm the work is complete.'],
            ].map(([StepIcon, title, body], i) => (
              <li key={title} className="flex gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-grad-brand-soft text-brand-ink">
                  <StepIcon className="size-5" />
                </span>
                <span>
                  <span className="sa-num block text-xs text-ink-tertiary">0{i + 1}</span>
                  <span className="block font-display text-h4 font-semibold text-ink">{title}</span>
                  <span className="mt-0.5 block text-caption font-normal text-ink-secondary">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Receipt + actions */}
        <div className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-e2 md:p-6 lg:sticky lg:top-[100px]">
          {state === 'paid' && payment ? (
            <PriceSummary
              lines={[
                { label: 'Method', value: (payment.method || '').toUpperCase() },
                { label: 'Reference', value: payment.gateway_ref || payment.id },
              ]}
              total={amount}
              totalLabel="Amount paid"
              note="Held in escrow until you confirm the job is done"
            />
          ) : (
            <p className={`rounded-field p-4 text-caption font-normal text-ink-secondary ${RING}`}>
              {state === 'checking' ? 'Waiting for the payment provider…' : o.sub}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {bookingId && (
              <Button
                variant="primary"
                onClick={() => navigate(`/tracking/${bookingId}`)}
                className="h-12 w-full rounded-field font-semibold"
              >
                Track my booking <ArrowRight className="ml-1 size-4" />
              </Button>
            )}
            {state === 'pending' && (
              <Button variant="outline" onClick={() => window.location.reload()} className="h-12 w-full rounded-field">
                Refresh
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/bookings')} className="h-12 w-full rounded-field">
              View my bookings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
