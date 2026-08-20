import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, CheckCircle2, XCircle, RefreshCw, Banknote } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { formatRM } from '@/lib/paymentEngine';
import { generateIdempotencyKey, markPaymentSubmitted, clearPaymentRecord, auditLog } from '@/lib/security';
import { Button } from '@/components/ui/button';
import { PriceSummary, RING, RING_BRAND } from '@/components/ds';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/useTranslation';
import { paymentIconFor } from '@/lib/paymentIcons';

const BANKS = ['Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank', 'Bank Islam', 'OCBC Bank'];

export default function PaymentCheckout() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get('booking');

  const [booking, setBooking] = useState(null);
  const [methods, setMethods] = useState([]);
  const [method, setMethod] = useState('fpx');
  const [selectedBank, setSelectedBank] = useState('');
  const [processing, setProcessing] = useState(false);
  const [payState, setPayState] = useState('idle'); // idle | processing | success | failed

  useEffect(() => {
    if (bookingId) servisaku.entities.Booking.get(bookingId).then(setBooking);
  }, [bookingId]);

  // The method list comes from the backend provider registry, so what's offered
  // reflects which gateways are actually configured for this deployment.
  useEffect(() => {
    servisaku.payments.methods()
      .then((list) => {
        setMethods(list);
        const firstAvailable = list.find((m) => m.available);
        if (firstAvailable) setMethod(firstAvailable.id);
      })
      .catch(() => setMethods([]));
  }, []);

  if (!booking && bookingId) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-muted border-t-primary rounded-full animate-spin" /></div>
  );

  // The server charges Booking.price — the amount already includes whatever tax
  // and fees the pricing engine applied at booking time (Booking.priceBreakdown).
  // Recomputing a total here would show the customer a figure the gateway never
  // charges, so display exactly what will be taken.
  const total = booking?.price ?? 0;
  const breakdown = booking?.price_breakdown ?? null;
  const taxLine = breakdown?.breakdown?.find?.((l) => l.type === 'TAX') ?? null;
  const selected = methods.find((m) => m.id === method) ?? null;
  const isCash = method === 'cash';

  const handlePay = async () => {
    // Cash is not charged now — the partner collects at completion and records
    // it from their app. Just mark the booking's intent and send the customer on.
    if (isCash) {
      try {
        setProcessing(true);
        await servisaku.entities.Booking.update(booking.id, { payment_method: 'cash' });
        auditLog('PAYMENT_METHOD_CASH', { bookingId: booking?.id, amount: total });
        toast.success(t('Cash selected — pay your professional when the job is done'));
        navigate(`/booking/${booking.id}`);
      } catch (e) {
        toast.error(e.message || t('Could not select cash payment'));
        setProcessing(false);
      }
      return;
    }

    // Payment replay prevention
    const idemKey = generateIdempotencyKey(booking?.id || 'demo', total, method);
    if (!markPaymentSubmitted(idemKey)) {
      toast.error(t('This payment was already submitted. Check your booking status.'));
      auditLog('PAYMENT_REPLAY_BLOCKED', { bookingId: booking?.id, amount: total });
      return;
    }

    auditLog('PAYMENT_INITIATED', { method, amount: total, bookingId: booking?.id });
    setPayState('processing');
    setProcessing(true);

    try {
      if (!booking?.id) throw new Error(t('No booking selected to pay for'));
      // The backend picks the gateway for this method and returns its hosted
      // checkout URL. Payment/escrow are confirmed server-side on the redirect
      // back to /payment/return (and via webhook in production).
      const payment = await servisaku.payments.create(booking.id, method);
      if (!payment?.checkout_url) throw new Error(t('Could not start payment'));
      window.location.href = payment.checkout_url;
    } catch (e) {
      clearPaymentRecord(booking?.id || 'demo', total);
      auditLog('PAYMENT_FAILED', { method, amount: total, error: e.message });
      toast.error(e.message || t('Payment could not be started'));
      setPayState('failed');
      setProcessing(false);
    }
  };

  if (payState === 'success') return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 text-center font-inter">
      <div className="w-24 h-24 bg-success-tint rounded-full flex items-center justify-center mb-5">
        <CheckCircle2 className="h-12 w-12 text-success" />
      </div>
      <h2 className="text-2xl font-semibold mb-1">{t('Payment Successful')}</h2>
      <p className="text-sm text-ink-secondary mb-1">{t('{amount} paid via {method}', { amount: formatRM(total), method: selected?.label || method })}</p>
      <p className="text-xs text-ink-secondary mb-6">{t('Funds held in escrow until service completion')}</p>
      <div className="bg-surface rounded-2xl border border-hairline p-4 w-full max-w-xs mb-6 text-left space-y-2 text-xs">
        <div className="flex justify-between"><span className="text-ink-secondary">{t('Amount paid')}</span><span className="font-semibold">{formatRM(total)}</span></div>
        <div className="flex justify-between"><span className="text-ink-secondary">{t('Transaction ID')}</span><span className="font-mono text-[10px]">TXN{Date.now().toString().slice(-8)}</span></div>
        <div className="flex justify-between"><span className="text-ink-secondary">{t('Escrow release')}</span><span className="font-medium">{t('48h after completion')}</span></div>
      </div>
      <Button onClick={() => booking ? navigate(`/booking/${booking.id}`) : navigate('/')} className="w-full max-w-xs rounded-2xl">
        {t('Track Booking')}
      </Button>
    </div>
  );

  if (payState === 'failed') return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 text-center font-inter">
      <div className="w-24 h-24 bg-danger-tint rounded-full flex items-center justify-center mb-5">
        <XCircle className="h-12 w-12 text-danger" />
      </div>
      <h2 className="text-2xl font-semibold mb-1">{t('Payment Failed')}</h2>
      <p className="text-sm text-ink-secondary mb-6">{t('Your card was not charged. Please try again.')}</p>
      <div className="flex gap-3 w-full max-w-xs">
        <Button onClick={() => setPayState('idle')} className="flex-1 rounded-2xl">
          <RefreshCw className="h-4 w-4 mr-1" /> {t('Retry')}
        </Button>
        <Button onClick={() => navigate(-1)} variant="outline" className="flex-1 rounded-2xl">{t('Cancel')}</Button>
      </div>
    </div>
  );

  const priceLines = [
    { label: booking?.service_type || t('Service'), value: formatRM(total) },
    ...((booking?.discount_amount || 0) > 0
      ? [{ label: `Promo ${booking.coupon_code || ''}`.trim(), value: '− ' + formatRM(booking.discount_amount), tone: 'discount' }]
      : []),
    ...(taxLine ? [{ label: taxLine.label, value: formatRM(taxLine.amount) }] : []),
  ];

  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-14">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" /> {t('Back')}
          </button>
          <h1 className="text-display-2 text-white">{t('Secure checkout')}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-5 text-md text-white/80">
            <span className="inline-flex items-center gap-1.5"><Lock className="size-4" /> {t('SSL secured')}</span>
            <span className="inline-flex items-center gap-1.5"><Shield className="size-4" /> {t('Escrow protected')}</span>
          </div>
        </div>
      </div>

      {/* Two-column: methods + sticky payment rail */}
      <div className="mx-auto -mt-8 grid w-full max-w-[1240px] items-start gap-6 px-5 md:px-8 lg:grid-cols-[1.5fr_0.9fr]">
        <div className="flex flex-col gap-5">
          <div className="rounded-card bg-surface p-5 shadow-e2 md:p-6">
            <h2 className="mb-4 font-display text-h3 font-semibold text-ink">{t('Payment method')}</h2>
            <div className="flex flex-col gap-2">
              {methods.map((pm) => {
                const on = method === pm.id;
                return (
                  <button
                    key={pm.id}
                    onClick={() => pm.available && setMethod(pm.id)}
                    disabled={!pm.available}
                    className={`flex w-full items-center gap-3 rounded-field p-3.5 text-left transition ${
                      on ? 'bg-brand-tint ' + RING_BRAND : 'bg-surface hover:bg-raised ' + RING
                    } ${pm.available ? '' : 'cursor-not-allowed opacity-45'}`}
                  >
                    {(() => { const I = paymentIconFor(pm.id); return <I className="size-5 w-7 shrink-0 text-ink-secondary" />; })()}
                    <span className="flex-1">
                      <span className="block text-caption font-semibold text-ink">{pm.label}</span>
                      <span className="block text-xs text-ink-secondary">
                        {pm.available ? t(pm.sub) : t('Currently unavailable')}
                      </span>
                    </span>
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full ${on ? 'bg-brand' : RING}`}>
                      {on && <span className="size-2 rounded-full bg-white" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {method === 'fpx' && (
            <div className="rounded-card bg-surface p-5 shadow-e2 md:p-6">
              <h2 className="mb-4 font-display text-h3 font-semibold text-ink">{t('Select bank')}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BANKS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setSelectedBank(b)}
                    className={`rounded-field px-3 py-3 text-left text-caption transition ${
                      selectedBank === b ? 'bg-brand-tint text-brand-ink ' + RING_BRAND : 'bg-surface text-ink-secondary hover:bg-raised ' + RING
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No card fields by design: card and wallets are captured on the
              gateway's hosted page, so this app stays out of PCI scope. */}
          {['card', 'applepay', 'googlepay', 'duitnow'].includes(method) && (
            <div className={`flex items-start gap-2 rounded-card bg-surface p-4 text-caption font-normal text-ink-secondary shadow-e1 ${RING}`}>
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              {method === 'duitnow'
                ? t("You'll be redirected to complete the DuitNow transfer from your banking app.")
                : t("You'll be taken to our payment provider's secure page. ServisAku never sees or stores your card details.")}
            </div>
          )}
        </div>

        {/* Payment rail */}
        <div className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-e2 md:p-6 lg:sticky lg:top-[100px]">
          <PriceSummary
            lines={priceLines}
            total={formatRM(total)}
            note={isCash
              ? t('Pay your professional directly when the job is complete.')
              : t('Held in escrow until you confirm the job is done')}
          />

          <Button
            variant="primary"
            onClick={handlePay}
            disabled={processing || !selected?.available || (method === 'fpx' && !selectedBank)}
            size="lg"
            className="w-full rounded-field text-base font-semibold"
          >
            {processing ? (
              <span className="flex items-center gap-2"><RefreshCw className="size-4 animate-spin" /> {t('Processing…')}</span>
            ) : isCash ? (
              <span className="flex items-center gap-2"><Banknote className="size-4" /> {t('Confirm cash payment')}</span>
            ) : (
              <span className="flex items-center gap-2"><Lock className="size-4" /> {t('Pay {amount}', { amount: formatRM(total) })}</span>
            )}
          </Button>

          <p className="text-center text-xs text-ink-tertiary">
            {t('By paying you agree to the ServisAku Terms of Service.')}
          </p>
        </div>
      </div>
    </div>
  );
}
