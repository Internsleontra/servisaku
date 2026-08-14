import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Navigation, Phone, MessageSquare, CheckCircle2,
  AlertTriangle, Clock, MapPin, ArrowLeft, ClipboardList, Receipt, History, Banknote,
  LoaderCircle,
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { useRealtimeBooking } from '@/hooks/useRealtimeBooking';
import { startGPSTracking, stopGPSTracking, sendSystemMessage, changeBookingStatus } from '@/lib/realtimeService';
import { formatBookingRef } from '@/lib/bookingEngine';
import { summarizeAnswers, answersFromBreakdown } from '@/lib/bookingAnswers';
import { AnswerList } from '@/components/partner/AnswerList';
import { InvoiceBreakdown } from '@/components/partner/InvoiceBreakdown';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { PhotoCapture } from '@/components/partner/PhotoCapture';
import { ExecutionTimeline } from '@/components/partner/ExecutionTimeline';
import { ExtraServices } from '@/components/ExtraServices';
import { Button, RING } from '@/components/ds';
import { JobStatusBadge } from '@/components/partner/job';
import { MoneyValue, PayoutBreakdown } from '@/components/partner/money';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import moment from 'moment';

/* Status → the one action available from that state. The `next` values mirror
   STATUS_TRANSITIONS in @/lib/bookingEngine exactly and are NOT redefined here;
   this map only decides what the button says and which glyph it carries.

   There is deliberately no entry for `pending` or `assigned`: claiming and
   accepting happen on the dashboard, so those states render no action here. */
const ACTION_CONFIG = {
  accepted:  { label: 'Start Travelling', next: 'en_route',  icon: Navigation },
  en_route:  { label: 'Mark Arrived',     next: 'arrived',   icon: MapPin },
  arrived:   { label: 'Start Service',    next: 'started',   icon: CheckCircle2 },
  started:   { label: 'Complete Job',     next: 'completed', icon: CheckCircle2 },
};

/* Card shell — inset ring, canonical 20px radius, never border + shadow. */
function Card({ children, className = '' }) {
  return <div className={cn('rounded-card bg-surface p-4', RING, className)}>{children}</div>;
}

/* Secondary action tinted to its own semantic. Warning/danger tints are the
   sanctioned uses of those tokens; they are not primary CTAs, so they do not
   take the brand gradient. */
function ToneButton({ tone, icon: Icon, children, onClick }) {
  const tones = {
    warning: 'bg-warning-tint text-warning',
    danger: 'bg-danger-tint text-danger',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-field px-4 text-caption font-semibold transition',
        'hover:brightness-[0.97] active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
        tones[tone], RING,
      )}
    >
      <Icon className="size-4" aria-hidden="true" /> {children}
    </button>
  );
}

export default function PartnerJobScreen() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { booking, loading, setBooking } = useRealtimeBooking(bookingId);
  const [user, setUser] = useState(null);
  const [service, setService] = useState(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [showDelay, setShowDelay] = useState(false);
  const [showCannotAccess, setShowCannotAccess] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState('15');
  const [uploadingPhase, setUploadingPhase] = useState(null);
  const [collectingCash, setCollectingCash] = useState(false);

  useEffect(() => {
    servisaku.auth.me().then(setUser);
    return () => stopGPSTracking();
  }, []);

  // Load the service's question config so we can label every customer answer.
  useEffect(() => {
    if (!booking?.catalog_service_id) return;
    servisaku.catalog.getService(booking.catalog_service_id).then(setService).catch(() => {});
  }, [booking?.catalog_service_id]);

  useEffect(() => {
    if (booking?.status === 'en_route' && user && !gpsActive) {
      startGPSTracking(user.email, bookingId, () => {});
      setGpsActive(true);
      toast.success('Live GPS tracking started');
    }
    if (!['en_route', 'arrived'].includes(booking?.status) && gpsActive) {
      stopGPSTracking();
      setGpsActive(false);
    }
  }, [booking?.status, user]);

  // Every customer answer, human-readable. Prefer the live question config;
  // fall back to deriving from the priced line items for legacy bookings.
  const answerRows = useMemo(() => {
    const fromQuestions = summarizeAnswers(service?.questions, booking?.answers);
    return fromQuestions.length ? fromQuestions : answersFromBreakdown(booking?.price_breakdown);
  }, [service, booking?.answers, booking?.price_breakdown]);

  if (loading || !booking) return (
    <div className="flex justify-center pt-32">
      <LoaderCircle className="size-6 animate-spin text-brand" role="status" aria-label="Loading job" />
    </div>
  );

  const action = ACTION_CONFIG[booking.status];
  // Server values only — the canonical split from the escrow row. The old
  // `?? Math.round(price * 0.8)` fallback rounded to whole ringgit, so this
  // screen disagreed with the wallet by up to a ringgit on every job.
  const payout = booking.partner_payout ?? null;
  const platformFee = booking.commission_amount ?? null;
  // Partner before/after photos (details.photos). Customer-uploaded images, when
  // that feature lands, live under a distinct key so the two never collide.
  const beforePhotos = booking.photos?.before || [];
  const afterPhotos = booking.photos?.after || [];
  const customerPhotos = booking.service_specific_data?.customer_uploads || [];
  const completed = booking.status === 'completed';
  const isCashJob = booking.payment_method === 'cash';
  const cashCollected = ['paid', 'escrowed'].includes(booking.payment_status);
  const blockedOnAfterPhotos = action?.next === 'completed' && afterPhotos.length === 0;

  // Record cash taken at the door. The server re-derives the amount from the
  // booking and rejects a mismatch, so this only ever confirms — it never sets
  // the figure.
  const handleCollectCash = async () => {
    setCollectingCash(true);
    try {
      await servisaku.payments.collectCash(booking.id, booking.price);
      setBooking((b) => ({ ...b, payment_status: 'paid' }));
      toast.success('Cash payment recorded');
    } catch (err) {
      toast.error(err?.message || 'Could not record the cash payment');
    } finally {
      setCollectingCash(false);
    }
  };

  const handleAction = async () => {
    if (!action) return;
    if (action.next === 'completed' && afterPhotos.length === 0) {
      toast.error('Upload at least one "after" photo before completing');
      return;
    }
    await changeBookingStatus(booking.id, action.next);
    await sendSystemMessage(booking.id, `Partner ${action.next.replace('_', ' ')}`);
    setBooking(b => ({ ...b, status: action.next }));
    toast.success(`Status updated: ${action.next.replace('_', ' ')}`);
  };

  // Best-effort one-shot geotag for photo metadata.
  const getCoordsOnce = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 },
    );
  });

  // Upload before/after photos with timestamp + geo metadata, then persist them
  // onto the booking so they survive reload and are visible to ops/the customer.
  const captureAndUpload = async (files, phase) => {
    if (!files?.length) return;
    setUploadingPhase(phase);
    try {
      const coords = await getCoordsOnce();
      const photos = [];
      for (const file of Array.from(files)) {
        const { file_url } = await servisaku.integrations.Core.UploadFile({ file });
        photos.push({ url: file_url, at: new Date().toISOString(), ...(coords || {}) });
      }
      const res = await servisaku.entities.Booking.addPhotos(booking.id, { phase, photos });
      setBooking(b => ({ ...b, photos: res.photos }));
      toast.success(`${phase === 'before' ? 'Before' : 'After'} photo${photos.length > 1 ? 's' : ''} added`);
    } catch (e) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploadingPhase(null);
    }
  };

  const handleAddExtra = async ({ label, unit_price, qty }) => {
    try {
      const res = await servisaku.entities.Booking.addExtra(booking.id, { label, unit_price, qty });
      setBooking(b => ({ ...b, extras: res.extras }));
      await servisaku.entities.Notification.create({
        user_email: booking.consumer_email,
        title: 'Extra service proposed',
        body: `${label} (+RM${Math.round(unit_price * qty)}) needs your approval`,
        type: 'booking_update',
        reference_id: booking.id,
        channel: 'in_app',
      }).catch(() => {});
      toast.success('Sent to customer for approval');
    } catch (e) {
      toast.error(e.message || 'Could not add extra');
    }
  };

  const handleDelay = async () => {
    await sendSystemMessage(booking.id, `Partner reported a ${delayMinutes}-minute delay`);
    await servisaku.entities.Notification.create({
      user_email: booking.consumer_email,
      title: 'Partner Running Late',
      body: `Your partner will be approximately ${delayMinutes} minutes late. We apologise for the inconvenience.`,
      type: 'booking_update',
      reference_id: booking.id,
      channel: 'in_app',
    });
    setShowDelay(false);
    toast.success('Delay notification sent to consumer');
  };

  const handleCannotAccess = async () => {
    await sendSystemMessage(booking.id, 'Partner cannot access the property. Please contact partner.');
    await servisaku.entities.Notification.create({
      user_email: booking.consumer_email,
      title: 'Access Issue',
      body: 'Your partner is at the property but cannot gain access. Please respond immediately.',
      type: 'booking_update',
      reference_id: booking.id,
      channel: 'in_app',
    });
    setShowCannotAccess(false);
    toast.success('Alert sent to consumer');
  };

  /* The one primary CTA. Canonical gradient in every state — the status colour
     is carried by the badge and the timeline, not by the button. */
  const primaryAction = action && !completed ? (
    <Button block size="lg" onClick={handleAction}>
      <action.icon className="size-5" aria-hidden="true" />
      {action.label}
    </Button>
  ) : null;

  return (
    <div
      className="min-h-screen bg-bg"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────
          Canonical --grad-deep, not an ad-hoc from/via/to gradient. State is
          communicated by the status badge rather than by recolouring the band. */}
      <div className="bg-grad-deep px-5 pb-6 pt-8 text-white lg:px-8">
        <div className="mx-auto w-full max-w-[1240px]">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/partner')}
              aria-label="Back to dashboard"
              className="grid size-11 shrink-0 place-items-center rounded-field bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="sa-num text-xs text-white/60">{formatBookingRef(booking.id)}</p>
              <h1 className="truncate text-h3 text-white">{booking.service_type}</h1>
            </div>
            <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-caption font-medium">
              <span className={cn('size-2 rounded-full', gpsActive ? 'animate-pulse bg-live' : 'bg-white/40')} aria-hidden="true" />
              {gpsActive ? 'GPS Live' : 'GPS Off'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-card bg-white/10 p-3">
            {/* Status comes from the shared badge so the partner vocabulary and
                the client-side icon map stay in one place. */}
            <JobStatusBadge status={booking.status} />
            <div className="min-w-0 flex-1">
              <p className="sa-num text-xs text-white/70">
                {moment(booking.date).format('ddd, D MMM')} · {booking.time_slot}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/60">Your payout</p>
              <MoneyValue amount={payout} decimals={false} size="lg" tone="inverse" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────
          Desktop splits the execution surfaces from a sticky payout/action rail;
          mobile stacks and keeps the bottom action bar. */}
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-5 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:items-start">

          {/* Main column */}
          <div className="space-y-4">
            {/* Customer */}
            <Card>
              <p className="mb-3 text-xs font-medium text-ink-secondary">Customer</p>
              <div className="mb-3 flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-field bg-brand-tint">
                  <span className="font-semibold text-brand">{booking.consumer_name?.charAt(0) || '?'}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-caption font-semibold text-ink">{booking.consumer_name}</p>
                  <p className="truncate text-xs text-ink-secondary">{booking.service_type}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <a
                    href={`tel:${booking.consumer_phone}`}
                    aria-label={`Call ${booking.consumer_name || 'customer'}`}
                    className={cn('grid size-11 place-items-center rounded-field bg-raised text-ink-secondary transition hover:bg-brand-tint',
                      'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]')}
                  >
                    <Phone className="size-4" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={() => navigate(`/chat/${booking.id}`)}
                    aria-label="Message customer"
                    className={cn('grid size-11 place-items-center rounded-field bg-brand text-white transition hover:brightness-[0.94] active:scale-[0.97]',
                      'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]')}
                  >
                    <MessageSquare className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-field bg-raised/60 p-3 text-xs text-ink-secondary">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden="true" />
                <span>{booking.address}{booking.city ? `, ${booking.city}` : ''}</span>
              </div>
              {booking.notes && (
                <div className={cn('mt-2 rounded-field bg-warning-tint p-3 text-xs text-ink-secondary', RING)}>
                  <strong className="text-warning">Customer notes:</strong> {booking.notes}
                </div>
              )}
            </Card>

            {/* Navigate */}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${booking.address} ${booking.city || ''}`)}`}
              target="_blank" rel="noopener noreferrer"
              className={cn('flex min-h-11 items-center gap-3 rounded-card bg-info-tint p-4 transition hover:brightness-[0.97]',
                'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]', RING)}
            >
              <Navigation className="size-5 text-info" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-caption font-semibold text-info">Navigate to Location</p>
                <p className="text-xs text-info">Open in Google Maps</p>
              </div>
            </a>

            {/* Service details — the dynamic workflow answers */}
            <Card>
              <SectionHeader title="Service details" sub="What the customer requested — no need to ask again" className="mb-3" />
              <div className="mb-3 flex items-center gap-2 rounded-field bg-brand-tint/40 px-3 py-2">
                <ClipboardList className="size-4 shrink-0 text-brand" aria-hidden="true" />
                <span className="text-xs font-semibold text-brand-ink">{service?.name || booking.service_type}</span>
              </div>
              <AnswerList rows={answerRows} />
            </Card>

            {/* Customer-uploaded photos */}
            {customerPhotos.length > 0 && (
              <Card>
                <SectionHeader title="Customer photos" sub={`${customerPhotos.length} uploaded`} className="mb-3" />
                <div className="flex flex-wrap gap-2">
                  {customerPhotos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className={cn('size-20 overflow-hidden rounded-field', RING,
                        'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]')}>
                      <img src={url} className="size-full object-cover" alt={`Customer upload ${i + 1}`} />
                    </a>
                  ))}
                </div>
              </Card>
            )}

            {/* Extra services — proposed mid-job, customer approves */}
            {(['arrived', 'started', 'completed'].includes(booking.status) || (booking.extras?.length > 0)) && (
              <Card>
                <SectionHeader title="Extra services" sub="Found extra work? Propose it — the customer approves." className="mb-3" />
                <ExtraServices
                  extras={booking.extras || []}
                  mode="partner"
                  editable={['arrived', 'started'].includes(booking.status)}
                  onAdd={handleAddExtra}
                />
              </Card>
            )}

            {/* Service photos — before / after verification */}
            {['arrived', 'started', 'completed'].includes(booking.status) && (
              <Card className="space-y-4">
                <SectionHeader title="Service photos" sub="Before & after verification (timestamped)" />
                <div>
                  <p className="mb-2 text-xs font-semibold text-ink">Before</p>
                  <PhotoCapture
                    photos={beforePhotos}
                    uploading={uploadingPhase === 'before'}
                    editable={['arrived', 'started'].includes(booking.status)}
                    onFiles={(files) => captureAndUpload(files, 'before')}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-ink">
                    After
                    {booking.status === 'started' && afterPhotos.length === 0 && (
                      <span className="ml-1 font-normal text-danger">· required to complete</span>
                    )}
                  </p>
                  <PhotoCapture
                    photos={afterPhotos}
                    uploading={uploadingPhase === 'after'}
                    editable={booking.status === 'started'}
                    onFiles={(files) => captureAndUpload(files, 'after')}
                  />
                </div>
              </Card>
            )}

            {/* Execution timeline */}
            {Array.isArray(booking.lifecycle) && booking.lifecycle.length > 0 && (
              <Card>
                <SectionHeader title="Activity timeline" action={<History className="size-4 text-ink-tertiary" aria-hidden="true" />} className="mb-3" />
                <ExecutionTimeline lifecycle={booking.lifecycle} />
              </Card>
            )}

            {/* Delay + Cannot Access */}
            {['en_route', 'arrived'].includes(booking.status) && (
              <div className="flex gap-2">
                <ToneButton tone="warning" icon={Clock} onClick={() => setShowDelay(true)}>Report Delay</ToneButton>
                <ToneButton tone="danger" icon={AlertTriangle} onClick={() => setShowCannotAccess(true)}>Cannot Access</ToneButton>
              </div>
            )}

            {showDelay && (
              <Card className="space-y-3">
                <p className="text-caption font-semibold text-warning">Report Delay</p>
                <label className="sr-only" htmlFor="delay-minutes">Delay in minutes</label>
                <select
                  id="delay-minutes"
                  value={delayMinutes}
                  onChange={e => setDelayMinutes(e.target.value)}
                  className={cn('min-h-11 w-full rounded-field bg-raised px-4 text-caption outline-none',
                    'focus-visible:shadow-[shadow:var(--focus-ring)]')}
                >
                  {['10', '15', '20', '30', '45', '60'].map(m => <option key={m} value={m}>{m} minutes</option>)}
                </select>
                <div className="flex gap-2">
                  <Button onClick={handleDelay} className="flex-1">Notify Customer</Button>
                  <Button onClick={() => setShowDelay(false)} variant="outline" className="flex-1">Cancel</Button>
                </div>
              </Card>
            )}

            {showCannotAccess && (
              <Card className="space-y-3">
                <p className="text-caption font-semibold text-danger">Cannot Access Property</p>
                <p className="text-xs text-ink-secondary">This will immediately alert the customer and ServisAku support.</p>
                <div className="flex gap-2">
                  <Button onClick={handleCannotAccess} variant="danger" className="flex-1">Send Alert</Button>
                  <Button onClick={() => setShowCannotAccess(false)} variant="outline" className="flex-1">Cancel</Button>
                </div>
              </Card>
            )}

            {completed && (
              <div className={cn('rounded-card bg-success-tint p-6 text-center', RING)}>
                <CheckCircle2 className="mx-auto mb-2 size-9 text-success" aria-hidden="true" />
                <p className="text-lead font-semibold text-success">Job Completed</p>
                <p className="mt-1 text-xs text-success">
                  {isCashJob
                    ? <>Collect <MoneyValue amount={booking.price} tone="positive" size="sm" /> from the customer</>
                    : <><MoneyValue amount={payout} decimals={false} tone="positive" size="sm" /> will be credited within 48 hours</>}
                </p>
              </div>
            )}

            {/* Cash collection — the entry point of the cash flow. Only shown on a
                completed cash job that hasn't been recorded yet. */}
            {completed && isCashJob && !cashCollected && (
              <Card className="p-5">
                <div className="flex items-start gap-3">
                  <Banknote className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-caption font-semibold text-ink">Record cash payment</p>
                    <p className="mt-1 text-xs text-ink-secondary">
                      Confirm you received <MoneyValue amount={booking.price} size="sm" /> from the
                      customer. ServisAku&apos;s commission will be added to your outstanding
                      balance and settled later — see your wallet.
                    </p>
                  </div>
                </div>
                <Button block loading={collectingCash} disabled={collectingCash} onClick={handleCollectCash} className="mt-4">
                  {collectingCash ? 'Recording…' : <>Confirm <MoneyValue amount={booking.price} tone="inverse" size="sm" /> received</>}
                </Button>
              </Card>
            )}

            {completed && isCashJob && cashCollected && (
              <Card className="flex items-center gap-3">
                <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-caption font-semibold text-ink">Cash payment recorded</p>
                  <p className="text-xs text-ink-secondary">
                    Commission added to your outstanding balance.{' '}
                    <Link to="/partner/wallet" className="font-semibold text-brand underline">View wallet</Link>
                  </p>
                </div>
              </Card>
            )}
          </div>

          {/* ── Sticky payout / action rail (desktop) ───────────────────── */}
          <aside className="hidden lg:block lg:sticky lg:top-5 lg:space-y-4">
            <PayoutBreakdown
              gross={booking.price || 0}
              lines={[{ label: 'Platform commission', amount: platformFee == null ? null : -platformFee }]}
              net={payout}
              caption={isCashJob
                ? 'Cash job — you collect from the customer and the commission is settled from your wallet.'
                : 'Credited within 48 hours of completion.'}
            />

            {primaryAction && (
              <div className={cn('rounded-card bg-surface p-4', RING)}>
                {primaryAction}
                {blockedOnAfterPhotos && (
                  <p className="mt-2 text-center text-xs text-danger">Add an “after” photo to complete</p>
                )}
              </div>
            )}

            <Card>
              <SectionHeader title="Invoice" action={<Receipt className="size-4 text-ink-tertiary" aria-hidden="true" />} className="mb-3" />
              <InvoiceBreakdown
                breakdown={booking.price_breakdown || []}
                total={booking.price || 0}
                discount={booking.discount_amount || 0}
                payout={payout}
              />
              <p className="mt-3 text-[10px] text-ink-tertiary">
                Payment: {booking.payment_method?.toUpperCase() || '—'} · {booking.payment_status || 'pending'}
              </p>
            </Card>
          </aside>

          {/* Invoice + payout on mobile, where there is no rail. */}
          <div className="space-y-4 lg:hidden">
            <PayoutBreakdown
              gross={booking.price || 0}
              lines={[{ label: 'Platform commission', amount: platformFee == null ? null : -platformFee }]}
              net={payout}
              caption={isCashJob
                ? 'Cash job — you collect from the customer.'
                : 'Credited within 48 hours of completion.'}
            />
            <Card>
              <SectionHeader title="Invoice" action={<Receipt className="size-4 text-ink-tertiary" aria-hidden="true" />} className="mb-3" />
              <InvoiceBreakdown
                breakdown={booking.price_breakdown || []}
                total={booking.price || 0}
                discount={booking.discount_amount || 0}
                payout={payout}
              />
              <p className="mt-3 text-[10px] text-ink-tertiary">
                Payment: {booking.payment_method?.toUpperCase() || '—'} · {booking.payment_status || 'pending'}
              </p>
            </Card>
          </div>
        </div>
      </div>

      {/* Sticky action — mobile only; desktop keeps it in the rail. */}
      {primaryAction && (
        <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
          <div
            className="bg-surface/95 px-5 py-4 backdrop-blur-xl shadow-[inset_0_1px_0_rgb(var(--hairline))]"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            {primaryAction}
            {blockedOnAfterPhotos && (
              <p className="mt-2 text-center text-xs text-danger">Add an “after” photo to complete</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
