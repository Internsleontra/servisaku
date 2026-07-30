import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { PAYMENT_METHODS, calcPriceBreakdown, formatRM } from '@/lib/paymentEngine';
import { generateIdempotencyKey, markPaymentSubmitted, clearPaymentRecord, auditLog } from '@/lib/security';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const BANKS = ['Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank', 'Bank Islam', 'OCBC Bank'];

export default function PaymentCheckout() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get('booking');

  const [booking, setBooking] = useState(null);
  const [method, setMethod] = useState('fpx');
  const [selectedBank, setSelectedBank] = useState('');
  const [cardNo, setCardNo] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [payState, setPayState] = useState('idle'); // idle | processing | success | failed

  useEffect(() => {
    if (bookingId) servisaku.entities.Booking.get(bookingId).then(setBooking);
  }, [bookingId]);

  if (!booking && bookingId) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>
  );

  const raw = booking?.price || 120;
  const breakdown = calcPriceBreakdown(raw, booking?.discount_amount || 0);

  const handlePay = async () => {
    // Payment replay prevention
    const idemKey = generateIdempotencyKey(booking?.id || 'demo', breakdown.total, method);
    if (!markPaymentSubmitted(idemKey)) {
      toast.error('This payment was already submitted. Check your booking status.');
      auditLog('PAYMENT_REPLAY_BLOCKED', { bookingId: booking?.id, amount: breakdown.total });
      return;
    }

    auditLog('PAYMENT_INITIATED', { method, amount: breakdown.total, bookingId: booking?.id });
    setPayState('processing');
    setProcessing(true);

    try {
      if (!booking?.id) throw new Error('No booking selected to pay for');
      // Create a Billplz bill on the backend and hand off to its hosted checkout.
      // Payment/escrow are confirmed server-side when Billplz redirects back to
      // /payment/return (and via webhook in production).
      const payment = await servisaku.payments.create(booking.id, method);
      if (!payment?.checkout_url) throw new Error('Could not start payment');
      window.location.href = payment.checkout_url;
    } catch (e) {
      clearPaymentRecord(booking?.id || 'demo', breakdown.total);
      auditLog('PAYMENT_FAILED', { method, amount: breakdown.total, error: e.message });
      toast.error(e.message || 'Payment could not be started');
      setPayState('failed');
      setProcessing(false);
    }
  };

  if (payState === 'success') return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center font-inter">
      <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-5">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-bold mb-1">Payment Successful</h2>
      <p className="text-sm text-muted-foreground mb-1">{formatRM(breakdown.total)} paid via {PAYMENT_METHODS.find(m => m.id === method)?.label}</p>
      <p className="text-xs text-muted-foreground mb-6">Funds held in escrow until service completion</p>
      <div className="bg-surface rounded-2xl border border-border p-4 w-full max-w-xs mb-6 text-left space-y-2 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Amount paid</span><span className="font-bold">{formatRM(breakdown.total)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Transaction ID</span><span className="font-mono text-[10px]">TXN{Date.now().toString().slice(-8)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Escrow release</span><span className="font-medium">48h after completion</span></div>
      </div>
      <Button onClick={() => booking ? navigate(`/booking/${booking.id}`) : navigate('/')} className="w-full max-w-xs rounded-2xl">
        Track Booking
      </Button>
    </div>
  );

  if (payState === 'failed') return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center font-inter">
      <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-5">
        <XCircle className="h-12 w-12 text-red-500" />
      </div>
      <h2 className="text-2xl font-bold mb-1">Payment Failed</h2>
      <p className="text-sm text-muted-foreground mb-6">Your card was not charged. Please try again.</p>
      <div className="flex gap-3 w-full max-w-xs">
        <Button onClick={() => setPayState('idle')} className="flex-1 rounded-2xl">
          <RefreshCw className="h-4 w-4 mr-1" /> Retry
        </Button>
        <Button onClick={() => navigate(-1)} variant="outline" className="flex-1 rounded-2xl">Cancel</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-inter pb-36">
      <div className="sticky top-0 z-20 bg-surface border-b border-border px-5 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Secure Checkout</p>
            <p className="text-sm font-bold">Payment</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <Lock className="h-3 w-3" /> SSL Secured
          </div>
        </div>
      </div>

      <div className="px-5 pt-5 space-y-5">

        {/* Order Summary */}
        <div className="bg-surface rounded-3xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Order Summary</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{booking?.service_type || 'Service'} ({booking?.package_name || 'Basic'})</span><span>{formatRM(raw)}</span></div>
            {(booking?.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-emerald-600"><span>Promo ({booking?.coupon_code})</span><span>-{formatRM(booking.discount_amount)}</span></div>
            )}
            <div className="flex justify-between text-muted-foreground text-xs"><span>SST (6%)</span><span>{formatRM(breakdown.tax)}</span></div>
            <div className="border-t border-border pt-2 flex justify-between font-bold">
              <span>Total Payable</span><span className="text-primary text-lg">{formatRM(breakdown.total)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 bg-blue-50 rounded-xl p-2.5 text-xs text-blue-700">
            <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Funds are held in escrow and released to the partner only after service completion
          </div>
        </div>

        {/* Payment Methods */}
        <div>
          <p className="text-sm font-bold mb-2">Payment Method</p>
          <div className="space-y-2">
            {PAYMENT_METHODS.map(pm => (
              <button key={pm.id} onClick={() => setMethod(pm.id)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all ${method === pm.id ? 'border-primary bg-accent' : 'border-border bg-surface'}`}>
                <span className="text-xl w-7 text-center">{pm.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{pm.label}</p>
                  <p className="text-xs text-muted-foreground">{pm.sub}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${method === pm.id ? 'border-primary bg-primary' : 'border-border'}`}>
                  {method === pm.id && <div className="w-2 h-2 bg-surface rounded-full" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* FPX Bank Select */}
        {method === 'fpx' && (
          <div>
            <p className="text-sm font-bold mb-2">Select Bank</p>
            <div className="grid grid-cols-2 gap-2">
              {BANKS.map(b => (
                <button key={b} onClick={() => setSelectedBank(b)}
                  className={`text-xs py-3 px-3 rounded-xl border-2 font-medium transition-all text-left ${selectedBank === b ? 'border-primary bg-accent text-primary' : 'border-border bg-surface text-muted-foreground'}`}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Card Fields */}
        {method === 'visa' && (
          <div className="space-y-3">
            <p className="text-sm font-bold">Card Details</p>
            <input value={cardNo} onChange={e => setCardNo(e.target.value.replace(/\D/g,'').slice(0,16))}
              placeholder="Card Number" className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 ring-primary/20" />
            <input value={cardName} onChange={e => setCardName(e.target.value)}
              placeholder="Cardholder Name" className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-primary/20" />
            <div className="grid grid-cols-2 gap-3">
              <input value={expiry} onChange={e => setExpiry(e.target.value)} placeholder="MM/YY"
                className="bg-surface border border-border rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 ring-primary/20" />
              <input value={cvv} onChange={e => setCvv(e.target.value.slice(0,3))} placeholder="CVV"
                type="password" className="bg-surface border border-border rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 ring-primary/20" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> PCI DSS compliant — card data never stored
            </div>
          </div>
        )}

        {/* DuitNow QR */}
        {method === 'duitnow' && (
          <div className="flex flex-col items-center bg-surface rounded-3xl border border-border p-6">
            <div className="w-40 h-40 bg-muted rounded-2xl flex flex-col items-center justify-center mb-3">
              <span className="text-5xl mb-1">🇲🇾</span>
              <p className="text-xs font-bold text-muted-foreground">DuitNow QR</p>
              <p className="text-[10px] text-muted-foreground">Scan to pay {formatRM(breakdown.total)}</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">Open your banking app and scan the QR code above</p>
          </div>
        )}
      </div>

      {/* Pay Button */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-lg mx-auto bg-white/95 backdrop-blur-xl border-t border-border px-5 py-4">
          <Button
            onClick={handlePay}
            disabled={processing || (method === 'fpx' && !selectedBank) || (method === 'visa' && (!cardNo || !cvv || !expiry || !cardName))}
            className="w-full h-12 rounded-2xl shadow-[0_8px_40px_rgba(20,83,45,0.18)] text-base font-bold"
          >
            {processing ? (
              <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Processing...</span>
            ) : (
              <span className="flex items-center gap-2"><Lock className="h-4 w-4" /> Pay {formatRM(breakdown.total)}</span>
            )}
          </Button>
          <p className="text-center text-[10px] text-muted-foreground mt-2">
            By paying you agree to ServisAku Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
}