import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Send, CheckCircle2, Receipt } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { calcPriceBreakdown, formatRM } from '@/lib/paymentEngine';
import { toast } from 'sonner';
import moment from 'moment';

function formatBookingRef(id) {
  return `FM-${new Date().getFullYear()}-${(id || '').slice(-6).toUpperCase()}`;
}

export default function BookingInvoice() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    servisaku.entities.Booking.get(bookingId).then(setBooking);
  }, [bookingId]);

  if (!booking) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>
  );

  const breakdown = calcPriceBreakdown(booking.price || 0, booking.discount_amount || 0);

  return (
    <div className="min-h-screen bg-background font-inter pb-24">
      {/* Header */}
      <div className="bg-surface border-b border-border px-5 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Booking Receipt</p>
            <p className="text-sm font-bold">{formatBookingRef(booking.id)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => toast.success('Email sent!')}
              className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-primary/10 transition-colors">
              <Send className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={() => toast.success('PDF download coming soon')}
              className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Download className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 pt-5 max-w-lg mx-auto">
        {/* Invoice Card */}
        <div className="bg-surface rounded-3xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">

          {/* Invoice Header */}
          <div className="bg-primary p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-white font-bold text-lg">INVOICE</p>
                <p className="text-white/60 text-xs">Tax Invoice / Receipt</p>
              </div>
              <div className="text-right">
                <p className="text-white font-mono text-sm font-bold">{formatBookingRef(booking.id)}</p>
                <p className="text-white/60 text-xs">{moment(booking.created_date).format('D MMM YYYY')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-white/40 mb-0.5">Bill To</p>
                <p className="text-white font-semibold">{booking.consumer_name}</p>
                <p className="text-white/60">{booking.consumer_email}</p>
                <p className="text-white/60">{booking.city}, Malaysia</p>
              </div>
              <div className="text-right">
                <p className="text-white/40 mb-0.5">From</p>
                <p className="text-white font-semibold">FixMate Sdn Bhd</p>
                <p className="text-white/60">GST: 001234567890</p>
                <p className="text-white/60">Kuala Lumpur, MY</p>
              </div>
            </div>
          </div>

          {/* Service Details */}
          <div className="p-5 border-b border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">{booking.service_type}</p>
                <p className="text-xs text-muted-foreground">{booking.package_name} Package</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Date of Service</span>
                <span className="font-medium text-foreground">{moment(booking.date).format('dddd, D MMMM YYYY')}</span>
              </div>
              <div className="flex justify-between">
                <span>Time Slot</span>
                <span className="font-medium text-foreground">{booking.time_slot}</span>
              </div>
              <div className="flex justify-between">
                <span>Service Address</span>
                <span className="font-medium text-foreground text-right max-w-[55%]">{booking.address}</span>
              </div>
              <div className="flex justify-between">
                <span>Partner</span>
                <span className="font-medium text-foreground">{booking.partner_name || 'FixMate Partner'}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Method</span>
                <span className="font-medium text-foreground capitalize">{booking.payment_method || 'FPX'}</span>
              </div>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="p-5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Price Breakdown</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{booking.service_type} ({booking.package_name})</span>
                <span>{formatRM(booking.price || 0)}</span>
              </div>
              {(booking.discount_amount || 0) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Promo Discount ({booking.coupon_code})</span>
                  <span>-{formatRM(booking.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Subtotal (before tax)</span>
                <span>{formatRM(breakdown.taxable)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>SST (6%)</span>
                <span>{formatRM(breakdown.tax)}</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between font-bold text-base">
                <span>Total Paid</span>
                <span className="text-primary">{formatRM(breakdown.total)}</span>
              </div>
            </div>

            {/* Payment Status */}
            <div className="mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-700">Payment Received</p>
                <p className="text-[10px] text-emerald-600">Escrowed — will be released 48h after service completion</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-muted/30 px-5 py-4 border-t border-border">
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              This is an official tax invoice issued by FixMate Sdn Bhd (Company No. 123456-X).<br />
              SST Registration No: W10-1234-56789012. For inquiries: support@fixmate.my
            </p>
          </div>
        </div>

        {/* Request Refund Section */}
        {booking.status === 'completed' && (
          <div className="mt-4 bg-surface rounded-2xl border border-border p-4">
            <p className="text-sm font-bold mb-1">Need a Refund?</p>
            <p className="text-xs text-muted-foreground mb-3">If you are unsatisfied with the service, you may request a refund within 48 hours.</p>
            <button onClick={() => toast.info('Refund request form coming soon')}
              className="text-xs px-4 py-2.5 border border-border rounded-xl font-medium hover:bg-muted transition-colors">
              Request Refund
            </button>
          </div>
        )}
      </div>
    </div>
  );
}