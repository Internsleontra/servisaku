import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, Clock, MapPin, MessageSquare,
  Star, Phone, Download, RotateCcw, AlertTriangle, User, Flag, ShieldAlert, LifeBuoy
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import StatusBadge from '../components/StatusBadge';
import BookingTimeline from '../components/BookingTimeline';
import { formatBookingRef } from '@/lib/bookingEngine';
import { ExtraServices } from '@/components/ExtraServices';
import { toast } from 'sonner';
import { formatMYR } from '@/lib/utils';
import { statusIconFor } from '@/lib/statusIcons';
import { useTranslation } from '@/lib/useTranslation';

export default function BookingDetail() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const [booking, setBooking] = useState(null);
  const [rating, _setRating] = useState(0);
  const [reviewText, _setReviewText] = useState('');
  const [decidingExtra, setDecidingExtra] = useState(false);

  useEffect(() => {
    servisaku.entities.Booking.get(bookingId).then(setBooking);
    // Subscribe to real-time updates
    const unsub = servisaku.entities.Booking.subscribe(event => {
      if (event.id === bookingId) setBooking(event.data);
    });
    return unsub;
  }, [bookingId]);

  if (!booking) return (
    <div className="flex justify-center pt-32">
      <div className="w-6 h-6 shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-raised border-t-brand rounded-full animate-spin" />
    </div>
  );

  const Icon = CalendarDays;
  const canCancel = ['pending', 'assigned', 'accepted'].includes(booking.status);
  const canReview = booking.status === 'completed' && !booking.rating;

  const handleDecideExtra = async (itemId, status) => {
    setDecidingExtra(true);
    try {
      const res = await servisaku.entities.Booking.decideExtra(booking.id, itemId, { status });
      setBooking(b => ({ ...b, extras: res.extras, price: res.price }));
      toast.success(status === 'approved' ? t('Extra approved — added to your bill') : t('Extra declined'));
    } catch (e) {
      toast.error(e.message || t('Could not update'));
    } finally {
      setDecidingExtra(false);
    }
  };

  const pendingExtras = (booking?.extras || []).filter(e => e.status === 'pending');

  const _handleReview = async () => {
    if (!rating) return toast.error(t('Please select a rating'));
    await servisaku.entities.Booking.update(booking.id, { rating, review: reviewText });
    if (booking.partner_email) {
      await servisaku.entities.Review.create({
        booking_id: booking.id,
        partner_email: booking.partner_email,
        consumer_email: booking.consumer_email,
        rating, comment: reviewText,
        service_type: booking.service_type,
      });
    }
    setBooking(b => ({ ...b, rating, review: reviewText }));
    toast.success(t('Review submitted!'));
  };

  const handleRebook = () => navigate('/explore');

  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header — replaces the sticky mobile bar. */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-14">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" /> {t('Back')}
          </button>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-display-2 text-white">{booking.service_type}</h1>
              <p className="sa-num mt-2 text-lead text-white/[0.78]">{formatBookingRef(booking.id)}</p>
            </div>
            <StatusBadge status={booking.status} />
          </div>
        </div>
      </div>

      {/* Detail column + actions rail */}
      <div className="mx-auto -mt-8 grid w-full max-w-[1240px] items-start gap-6 px-5 md:px-8 lg:grid-cols-[1.5fr_0.9fr]">
        <div className="flex flex-col gap-4">

        {/* Service + Price Card */}
        <div className="bg-surface rounded-card shadow-e1 p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 bg-raised">
              <Icon className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-ink">{booking.service_type}</p>
              {booking.package_name && <p className="text-xs text-ink-secondary">{t('{name} Package', { name: booking.package_name })}</p>}
            </div>
            <div className="text-right">
              <p className="sa-num font-semibold text-brand text-lg">{formatMYR(booking.price, { decimals: true })}</p>
              {booking.discount_amount > 0 && (
                <p className="sa-num text-xs text-success">{t('− {amount} saved', { amount: formatMYR(booking.discount_amount, { decimals: true }) })}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { icon: CalendarDays, label: new Date(booking.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) },
              { icon: Clock, label: booking.time_slot },
              { icon: MapPin, label: booking.city },
              { icon: User, label: booking.partner_name || t('Pending assignment') },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-ink-secondary">
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                {/* dual-field-exempt: built locally from dates, slots and city, not catalogue text */}
                <span className="truncate">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <BookingTimeline booking={booking} />

        {/* ETA / Live Status Banner */}
        {['en_route', 'arrived'].includes(booking.status) && (
          <div className="bg-brand rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-ink-inverse font-semibold text-sm">
                {booking.status === 'en_route' ? t('Partner is on the way') : t('Partner has arrived!')}
              </p>
              <p className="text-ink-inverse/60 text-xs mt-0.5">
                {booking.status === 'en_route' ? t('Estimated arrival: ~15 minutes') : t('Starting service shortly')}
              </p>
            </div>
            <div className="w-10 h-10 bg-surface/20 rounded-xl flex items-center justify-center">
              {(() => { const I = statusIconFor(booking.status); return I ? <I className="size-5 text-ink-inverse" /> : null; })()}
            </div>
          </div>
        )}

        {/* Extra services — partner-proposed, customer approves */}
        {booking.extras?.length > 0 && (
          <div className="bg-surface rounded-card shadow-e1 p-4">
            <p className="text-xs text-ink-secondary font-medium mb-1">{t('Extra services')}</p>
            {pendingExtras.length > 0 && (
              <p className="text-[11px] text-warning mb-3">{t('Your partner proposed extra work — approve to add it to your bill.')}</p>
            )}
            <ExtraServices
              extras={booking.extras}
              mode="consumer"
              onDecide={handleDecideExtra}
              busy={decidingExtra}
            />
          </div>
        )}

        {/* Partner Card */}
        {booking.partner_name && (
          <div className="bg-surface rounded-card shadow-e1 p-4">
            <p className="text-xs text-ink-secondary font-medium mb-3">{t('Your pro')}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-brand-tint flex items-center justify-center">
                  <span className="font-semibold text-brand">{booking.partner_name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-semibold text-sm text-ink">{booking.partner_name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="h-3 w-3 text-star fill-star" />
                    <span className="text-xs font-medium text-ink">4.9</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/chat/${booking.id}`)}
                  aria-label={t('Call partner')}
                  className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center hover:bg-brand-tint transition-colors">
                  <Phone className="h-4 w-4 text-ink-secondary" />
                </button>
                <button
                  onClick={() => navigate(`/chat/${booking.id}`)}
                  aria-label={t('Message partner')}
                  className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center hover:bg-brand-tint transition-colors">
                  <MessageSquare className="h-4 w-4 text-ink-secondary" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Review — full-width action PANEL, not a Button primitive: two lines of
            copy plus a star row, so it takes the gradient-panel treatment used for
            the brand card on Home (rounded-card + bg-grad-brand) rather than the
            36/44/52 Button geometry. Hover and focus match the Buttons. */}
        {canReview && (
          <button onClick={() => navigate(`/review/${booking.id}`)}
            className="w-full bg-grad-brand text-ink-inverse rounded-card p-4 flex items-center justify-between shadow-brand transition hover:brightness-[0.94] focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]">
            <div className="text-left">
              <p className="font-semibold text-sm">{t('Rate your experience')}</p>
              <p className="text-ink-inverse/70 text-xs mt-0.5">{t('Takes only 30 seconds')}</p>
            </div>
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(i => <Star key={i} className="h-5 w-5 text-star" />)}
            </div>
          </button>
        )}

        {booking.rating && (
          <div className="bg-surface rounded-card p-4 shadow-[inset_0_0_0_1px_rgb(var(--hairline))]">
            <p className="text-xs text-ink-secondary mb-2">{t('Your review')}</p>
            <div className="flex gap-0.5 mb-1">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`h-4 w-4 ${i <= booking.rating ? 'text-star fill-star' : 'text-raised'}`} />
              ))}
            </div>
            {booking.review && <p className="text-xs text-ink-secondary">{booking.review}</p>}
          </div>
        )}

        </div>

        {/* Actions rail */}
        <div className={`flex flex-col gap-3 rounded-card bg-surface p-5 shadow-e2 lg:sticky lg:top-[100px]`}>
        {/* Invoice + Actions */}
        <div className="flex gap-2">
          <button onClick={() => toast.info(t('Invoice PDF coming soon'))}
            className="flex flex-1 min-h-11 items-center justify-center gap-2 rounded-field bg-surface text-caption font-semibold text-ink transition hover:bg-raised shadow-[inset_0_0_0_1px_rgb(var(--hairline))]">
            <Download className="h-4 w-4" /> {t('Invoice')}
          </button>
          {booking.status === 'completed' && (
            <button onClick={handleRebook}
              className="flex flex-1 min-h-11 items-center justify-center gap-2 rounded-field bg-surface text-caption font-semibold text-ink transition hover:bg-raised shadow-[inset_0_0_0_1px_rgb(var(--hairline))]">
              <RotateCcw className="h-4 w-4" /> {t('Rebook')}
            </button>
          )}
        </div>

        {/* Cancel — goes through the refund flow so the customer sees what they
            are owed BEFORE committing, and a refund record is actually created.
            The old path flipped Booking.status directly and refunded nothing. */}
        {canCancel && (
          <button onClick={() => navigate(`/refunds?booking=${booking.id}`)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-field text-caption font-semibold text-danger transition hover:bg-danger-tint shadow-[inset_0_0_0_1px_rgb(var(--danger)/0.3)]">
            <AlertTriangle className="h-4 w-4" /> {t('Cancel Booking')}
          </button>
        )}

        {/* Something went wrong — available once the job is under way or done. */}
        {['completed', 'started', 'arrived'].includes(booking.status) && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => navigate(`/disputes?booking=${booking.id}`)}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-field text-caption font-semibold text-ink transition hover:bg-raised shadow-[inset_0_0_0_1px_rgb(var(--hairline))]">
              <Flag className="h-4 w-4" /> {t('Flag job')}
            </button>
            <button onClick={() => navigate(`/damage-claims?booking=${booking.id}`)}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-field text-caption font-semibold text-ink transition hover:bg-raised shadow-[inset_0_0_0_1px_rgb(var(--hairline))]">
              <ShieldAlert className="h-4 w-4" /> {t('Report damage')}
            </button>
          </div>
        )}

        <button onClick={() => navigate(`/support?new=1&booking=${booking.id}`)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-field text-caption font-semibold text-ink-secondary transition hover:bg-raised">
          <LifeBuoy className="size-4" /> {t('Get help with this booking')}
        </button>
        </div>
      </div>
    </div>
  );
}