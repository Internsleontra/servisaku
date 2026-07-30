import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ui/button';
import { formatRM } from '@/lib/paymentEngine';

// Billplz redirects the payer here after checkout. We confirm the payment
// server-side (sync re-fetches the bill from Billplz), then show the outcome.
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = params.get('payment_id');
  const [state, setState] = useState('checking'); // checking | paid | pending | failed
  const [payment, setPayment] = useState(null);

  useEffect(() => {
    let active = true;
    if (!paymentId) { setState('failed'); return; }
    servisaku.payments.sync(paymentId)
      .then((p) => {
        if (!active) return;
        setPayment(p);
        setState(p?.status === 'paid' ? 'paid' : p?.status === 'failed' ? 'failed' : 'pending');
      })
      .catch(() => active && setState('failed'));
    return () => { active = false; };
  }, [paymentId]);

  const CARD = {
    checking: { icon: Loader2, tone: 'text-ink-secondary', spin: true, title: 'Confirming your payment…', sub: 'This only takes a moment.' },
    paid: { icon: CheckCircle2, tone: 'text-success', title: 'Payment successful', sub: 'Funds are held in escrow until your service is completed.' },
    pending: { icon: Clock, tone: 'text-warning', title: 'Payment pending', sub: "We haven't received confirmation yet. If you completed payment, refresh in a moment." },
    failed: { icon: XCircle, tone: 'text-danger', title: 'Payment not completed', sub: 'You were not charged. You can try again from your booking.' },
  }[state];
  const Icon = CARD.icon;

  return (
    <div className="min-h-screen bg-bg font-inter flex flex-col items-center justify-center px-6 text-center">
      <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-raised ${CARD.tone}`}>
        <Icon className={`h-10 w-10 ${CARD.spin ? 'animate-spin' : ''}`} />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold text-ink">{CARD.title}</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-secondary">{CARD.sub}</p>

      {payment && state === 'paid' && (
        <div className="mt-6 w-full max-w-xs rounded-2xl border border-hairline bg-surface p-4 text-left text-sm shadow-e1">
          <div className="flex justify-between"><span className="text-ink-secondary">Amount</span><span className="font-semibold text-ink">{formatRM((payment.amount || 0) / 100)}</span></div>
          <div className="mt-1.5 flex justify-between"><span className="text-ink-secondary">Method</span><span className="font-semibold text-ink uppercase">{payment.method}</span></div>
          <div className="mt-1.5 flex justify-between"><span className="text-ink-secondary">Reference</span><span className="font-mono text-xs text-ink">{payment.gateway_ref || payment.id}</span></div>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        {state === 'pending' && (
          <Button variant="outline" onClick={() => window.location.reload()} className="rounded-xl">Refresh</Button>
        )}
        <Button onClick={() => navigate('/bookings')} className="rounded-xl bg-brand text-white hover:bg-brand/90">
          {state === 'paid' ? 'View my bookings' : 'Back to bookings'}
        </Button>
      </div>
    </div>
  );
}
