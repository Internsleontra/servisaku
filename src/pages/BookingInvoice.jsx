import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Send, CheckCircle2, Receipt } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { formatRM } from '@/lib/paymentEngine';
// Single source for the reference format — a local copy had already drifted
// (it was missing the '#' the design system specifies).
import { formatBookingRef } from '@/lib/bookingEngine';
import { toast } from 'sonner';
import { Button } from '@/components/ds';
import { useTranslation } from '@/lib/useTranslation';

export default function BookingInvoice() {
  const { t, locale } = useTranslation();
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    servisaku.entities.Booking.get(bookingId).then(setBooking);
    // The issued Invoice is the authoritative document — it carries the rate the
    // booking was actually charged, the supplier's SST registration number, and
    // party details frozen at issue time.
    servisaku.invoices.forBooking(bookingId)
      .then((list) => setInvoice(list.find((i) => i.type === 'tax_invoice') || null))
      .catch(() => setInvoice(null));
  }, [bookingId]);

  if (!booking) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-muted border-t-primary rounded-full animate-spin" /></div>
  );

  // Prefer the issued invoice; fall back to the booking for one not yet paid.
  const subtotal = invoice ? invoice.taxable_amount : (booking.price || 0) - (booking.discount_amount || 0);
  const taxAmount = invoice ? invoice.sst_amount : 0;
  const taxPercent = invoice ? invoice.sst_rate_percent : null;
  const total = invoice ? invoice.total : (booking.price || 0);
  const credited = invoice?.refunded_amount || 0;

  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header — replaces the sticky mobile bar. */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-14">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" />{t('Back')}</button>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-display-2 text-white">{t('Tax invoice')}</h1>
              <p className="sa-num mt-2 text-lead text-white/[0.78]">{formatBookingRef(booking.id)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="inverse" onClick={() => toast.success(t('Email sent!'))}>
                <Send className="size-4" />{t('Email')}</Button>
              <Button variant="primary" onClick={() => toast.success(t('PDF download coming soon'))}>
                <Download className="size-4" />{t('Download')}</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-8 grid w-full max-w-[1240px] items-start gap-6 px-5 md:px-8 lg:grid-cols-[1.5fr_0.9fr]">
        {/* Invoice document */}
        <div className="overflow-hidden rounded-card bg-surface shadow-e2">

          {/* Invoice Header */}
          <div className="bg-brand p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-white font-semibold text-lg">INVOICE</p>
                <p className="text-white/60 text-xs">{t('Tax Invoice / Receipt')}</p>
              </div>
              <div className="text-right">
                <p className="text-white font-mono text-sm font-semibold">{formatBookingRef(booking.id)}</p>
                <p className="text-white/60 text-xs">{new Date(booking.created_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-white/40 mb-0.5">{t('Bill to')}</p>
                <p className="text-white font-semibold">{booking.consumer_name}</p>
                <p className="text-white/60">{booking.consumer_email}</p>
                <p className="text-white/60">{booking.city}, Malaysia</p>
              </div>
              <div className="text-right">
                <p className="text-white/40 mb-0.5">{t('From')}</p>
                <p className="text-white font-semibold">ServisAku Sdn Bhd</p>
                <p className="text-white/60">GST: 001234567890</p>
                <p className="text-white/60">Kuala Lumpur, MY</p>
              </div>
            </div>
          </div>

          {/* Service Details */}
          <div className="p-5 border-b border-hairline">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-raised text-ink-secondary">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">{booking.service_type}</p>
                <p className="text-xs text-ink-secondary">{booking.package_name} Package</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-ink-secondary">
              <div className="flex justify-between">
                <span>{t('Date of Service')}</span>
                <span className="font-medium text-ink">{new Date(booking.date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('Time slot')}</span>
                <span className="font-medium text-ink">{booking.time_slot}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('Service address')}</span>
                <span className="font-medium text-ink text-right max-w-[55%]">{booking.address}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('Partner')}</span>
                <span className="font-medium text-ink">{booking.partner_name || t('ServisAku Partner')}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('Payment method')}</span>
                <span className="font-medium text-ink capitalize">{booking.payment_method || 'FPX'}</span>
              </div>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="p-5">
            <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-3">{t('Price breakdown')}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-secondary">{booking.service_type} ({booking.package_name})</span>
                <span>{formatRM(booking.price || 0)}</span>
              </div>
              {(booking.discount_amount || 0) > 0 && (
                <div className="flex justify-between text-success">
                  <span>Promo Discount ({booking.coupon_code})</span>
                  <span>-{formatRM(booking.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-ink-secondary text-xs">
                <span>{t('Subtotal (before tax)')}</span>
                <span>{formatRM(subtotal)}</span>
              </div>
              {/* Rate comes from the issued invoice, so a booking priced under an
                  earlier SST regime still shows the rate it was charged. */}
              {taxPercent !== null && (
                <div className="flex justify-between text-ink-secondary text-xs">
                  <span>SST ({taxPercent}%)</span>
                  <span>{formatRM(taxAmount)}</span>
                </div>
              )}
              <div className="border-t border-hairline pt-3 flex justify-between font-semibold text-base">
                <span>{invoice ? t('Total Paid') : t('Total Payable')}</span>
                <span className="text-brand">{formatRM(total)}</span>
              </div>
              {credited > 0 && (
                <div className="flex justify-between text-xs text-warning">
                  <span>{t('Credited (refunded)')}</span>
                  <span>-{formatRM(credited)}</span>
                </div>
              )}
            </div>

            {/* Payment Status */}
            <div className="mt-4 flex items-center gap-2 bg-success-tint rounded-field p-3 shadow-[inset_0_0_0_1px_rgb(var(--success)/0.3)]">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              <div>
                <p className="text-xs font-semibold text-success">{t('Payment received')}</p>
                <p className="text-[10px] text-success">{t('Escrowed — will be released 48h after service completion')}</p>
              </div>
            </div>
          </div>

          {/* Footer. Supplier details come from the issued invoice — never
              hardcoded, since this is the legal face of a tax document. Without
              an invoice this is only a booking summary and must not claim
              otherwise. */}
          <div className="bg-raised/30 px-5 py-4 border-t border-hairline">
            <p className="text-[10px] text-ink-secondary text-center leading-relaxed">
              {invoice ? (
                <>
                  {t('Tax invoice {no} issued by {supplier}.', { no: invoice.invoice_no, supplier: invoice.supplier_name })}
                  {invoice.sst_registration_no
                    ? <> SST Registration No: {invoice.sst_registration_no}.</>
                    : null}
                  <br />
                  {t('Issued {date}. For enquiries:', { date: new Date(invoice.issued_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) })} support@servisaku.my
                </>
              ) : (
                <>{t('Booking summary — a tax invoice is issued once payment is received.')}<br />
                  {t('For enquiries:')} support@servisaku.my
                </>
              )}
            </p>
          </div>
        </div>

        {/* Request Refund Section */}
        {booking.status === 'completed' && (
          <aside className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-e2 lg:sticky lg:top-[100px]">
            <h2 className="font-display text-h4 font-semibold text-ink">{t('Need a refund?')}</h2>
            <p className="text-caption font-normal text-ink-secondary">{t('If you are unsatisfied with the service, you may request a refund within 48 hours.')}</p>
            <Button variant="outline" block onClick={() => navigate(`/refunds?booking=${booking.id}`)}>{t('Request refund')}</Button>
          </aside>
        )}
      </div>
    </div>
  );
}