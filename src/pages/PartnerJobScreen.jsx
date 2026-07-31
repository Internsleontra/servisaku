import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Navigation, Phone, MessageSquare, CheckCircle2,
  AlertTriangle, Clock, MapPin, ArrowLeft, ClipboardList, Receipt, History, Banknote,
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { useRealtimeBooking } from '@/hooks/useRealtimeBooking';
import { startGPSTracking, stopGPSTracking, sendSystemMessage, changeBookingStatus } from '@/lib/realtimeService';
import { STATUS_META } from '@/lib/bookingEngine';
import { summarizeAnswers, answersFromBreakdown } from '@/lib/bookingAnswers';
import { AnswerList } from '@/components/partner/AnswerList';
import { InvoiceBreakdown } from '@/components/partner/InvoiceBreakdown';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { PhotoCapture } from '@/components/partner/PhotoCapture';
import { ExecutionTimeline } from '@/components/partner/ExecutionTimeline';
import { ExtraServices } from '@/components/ExtraServices';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import moment from 'moment';

const ACTION_CONFIG = {
  accepted:  { label: 'Start Travelling', next: 'en_route',  color: 'bg-blue-600 hover:bg-blue-700', icon: Navigation },
  en_route:  { label: 'Mark Arrived',     next: 'arrived',   color: 'bg-violet-600 hover:bg-violet-700', icon: MapPin },
  arrived:   { label: 'Start Service',    next: 'started',   color: 'bg-brand hover:bg-brand/90', icon: CheckCircle2 },
  started:   { label: 'Complete Job',     next: 'completed', color: 'bg-emerald-600 hover:bg-emerald-700', icon: CheckCircle2 },
};

// A card shell in the partner design system.
function Card({ children, className = '' }) {
  return <div className={`bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 ${className}`}>{children}</div>;
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
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
  );

  const action = ACTION_CONFIG[booking.status];
  const statusMeta = STATUS_META[booking.status];
  const payout = booking.partner_payout ?? Math.round((booking.price || 0) * 0.8);
  // Partner before/after photos (details.photos). Customer-uploaded images, when
  // that feature lands, live under a distinct key so the two never collide.
  const beforePhotos = booking.photos?.before || [];
  const afterPhotos = booking.photos?.after || [];
  const customerPhotos = booking.service_specific_data?.customer_uploads || [];
  const completed = booking.status === 'completed';
  const isCashJob = booking.payment_method === 'cash';
  const cashCollected = ['paid', 'escrowed'].includes(booking.payment_status);

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

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className={`px-5 pt-14 pb-6 text-white ${completed ? 'bg-emerald-600' : 'bg-gradient-to-br from-brand-ink via-brand to-brand/80'}`}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/partner')} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-white" />
          </button>
          <div className="flex-1">
            <p className="text-white/60 text-xs">Active Job</p>
            <h1 className="text-lg font-bold">{booking.service_type}</h1>
          </div>
          <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
            <div className={`w-2 h-2 rounded-full ${gpsActive ? 'bg-green-300 animate-pulse' : 'bg-white/40'}`} />
            <span className="text-xs font-medium">{gpsActive ? 'GPS Live' : 'GPS Off'}</span>
          </div>
        </div>
        <div className="bg-white/10 rounded-2xl p-3 flex items-center gap-3">
          <span className="text-2xl">{statusMeta?.icon}</span>
          <div className="flex-1">
            <p className="font-bold text-sm">{statusMeta?.label}</p>
            <p className="text-white/60 text-xs">{moment(booking.date).format('ddd, D MMM')} • {booking.time_slot}</p>
          </div>
          <div className="text-right">
            <p className="text-white/60 text-[10px]">Your payout</p>
            <p className="font-bold text-base">RM {payout}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-5 space-y-4">
        {/* Customer */}
        <Card>
          <p className="text-xs text-ink-secondary font-medium mb-3">Customer</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-tint flex items-center justify-center">
              <span className="font-bold text-brand">{booking.consumer_name?.charAt(0) || '?'}</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-ink">{booking.consumer_name}</p>
              <p className="text-xs text-ink-secondary">{booking.service_type}</p>
            </div>
            <div className="flex gap-2">
              <a href={`tel:${booking.consumer_phone}`}
                className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center hover:bg-brand/10 transition-colors">
                <Phone className="h-4 w-4 text-ink-secondary" />
              </a>
              <button onClick={() => navigate(`/chat/${booking.id}`)}
                className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs text-ink-secondary bg-raised/60 rounded-xl p-3">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-brand" />
            <span>{booking.address}{booking.city ? `, ${booking.city}` : ''}</span>
          </div>
          {booking.notes && (
            <div className="mt-2 text-xs text-ink-secondary bg-amber-50 border border-amber-100 rounded-xl p-3">
              <strong className="text-amber-700">Customer notes:</strong> {booking.notes}
            </div>
          )}
        </Card>

        {/* Navigate */}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${booking.address} ${booking.city || ''}`)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4 hover:bg-blue-100 transition-colors"
        >
          <Navigation className="h-5 w-5 text-blue-600" />
          <div className="flex-1">
            <p className="font-semibold text-sm text-blue-700">Navigate to Location</p>
            <p className="text-xs text-blue-500">Open in Google Maps</p>
          </div>
        </a>

        {/* Service details — the dynamic workflow answers */}
        <Card>
          <SectionHeader title="Service details" sub="What the customer requested — no need to ask again" className="mb-3" />
          <div className="flex items-center gap-2 mb-3 rounded-xl bg-brand-tint/40 px-3 py-2">
            <ClipboardList className="h-4 w-4 text-brand shrink-0" />
            <span className="text-xs font-semibold text-brand-ink">{service?.name || booking.service_type}</span>
          </div>
          <AnswerList rows={answerRows} />
        </Card>

        {/* Customer-uploaded photos */}
        {customerPhotos.length > 0 && (
          <Card>
            <SectionHeader title="Customer photos" sub={`${customerPhotos.length} uploaded`} className="mb-3" />
            <div className="flex gap-2 flex-wrap">
              {customerPhotos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="w-20 h-20 rounded-xl overflow-hidden border border-hairline/20">
                  <img src={url} className="w-full h-full object-cover" alt={`Customer upload ${i + 1}`} />
                </a>
              ))}
            </div>
          </Card>
        )}

        {/* Invoice */}
        <Card>
          <SectionHeader title="Invoice" action={<Receipt className="h-4 w-4 text-ink-tertiary" />} className="mb-3" />
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
            <SectionHeader title="Activity timeline" action={<History className="h-4 w-4 text-ink-tertiary" />} className="mb-3" />
            <ExecutionTimeline lifecycle={booking.lifecycle} />
          </Card>
        )}

        {/* Delay + Cannot Access */}
        {['en_route', 'arrived'].includes(booking.status) && (
          <div className="flex gap-2">
            <button onClick={() => setShowDelay(true)}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
              <Clock className="h-4 w-4" /> Report Delay
            </button>
            <button onClick={() => setShowCannotAccess(true)}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors">
              <AlertTriangle className="h-4 w-4" /> Cannot Access
            </button>
          </div>
        )}

        {showDelay && (
          <Card className="border-amber-200 space-y-3">
            <p className="text-sm font-bold text-amber-700">Report Delay</p>
            <select value={delayMinutes} onChange={e => setDelayMinutes(e.target.value)}
              className="w-full bg-raised rounded-xl px-4 py-3 text-sm outline-none">
              {['10', '15', '20', '30', '45', '60'].map(m => <option key={m} value={m}>{m} minutes</option>)}
            </select>
            <div className="flex gap-2">
              <Button onClick={handleDelay} className="flex-1 rounded-xl h-10 bg-amber-500 hover:bg-amber-600">Notify Customer</Button>
              <Button onClick={() => setShowDelay(false)} variant="outline" className="flex-1 rounded-xl h-10">Cancel</Button>
            </div>
          </Card>
        )}

        {showCannotAccess && (
          <Card className="border-red-200 space-y-3">
            <p className="text-sm font-bold text-red-700">Cannot Access Property</p>
            <p className="text-xs text-ink-secondary">This will immediately alert the customer and ServisAku support.</p>
            <div className="flex gap-2">
              <Button onClick={handleCannotAccess} variant="destructive" className="flex-1 rounded-xl h-10">Send Alert</Button>
              <Button onClick={() => setShowCannotAccess(false)} variant="outline" className="flex-1 rounded-xl h-10">Cancel</Button>
            </div>
          </Card>
        )}

        {completed && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <span className="text-4xl mb-2 block">🎉</span>
            <p className="font-bold text-emerald-700 text-lg">Job Completed!</p>
            <p className="text-xs text-emerald-600 mt-1">
              {isCashJob
                ? `Collect RM ${booking.price?.toFixed(2)} from the customer`
                : `RM ${payout} will be credited within 48 hours`}
            </p>
          </div>
        )}

        {/* Cash collection — the entry point of the cash flow. Only shown on a
            completed cash job that hasn't been recorded yet. */}
        {completed && isCashJob && !cashCollected && (
          <div className="bg-surface border-2 border-amber-300 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <Banknote className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-sm text-ink">Record cash payment</p>
                <p className="text-xs text-ink-secondary mt-1">
                  Confirm you received <strong>RM {booking.price?.toFixed(2)}</strong> from the
                  customer. ServisAku's commission will be added to your outstanding
                  balance and settled {'later'} — see your wallet.
                </p>
              </div>
            </div>
            <Button
              onClick={handleCollectCash}
              disabled={collectingCash}
              className="w-full h-11 rounded-xl mt-4 bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              {collectingCash ? 'Recording…' : `Confirm RM ${booking.price?.toFixed(2)} received`}
            </Button>
          </div>
        )}

        {completed && isCashJob && cashCollected && (
          <div className="bg-surface border border-hairline/20 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Cash payment recorded</p>
              <p className="text-xs text-ink-secondary">
                Commission added to your outstanding balance.{' '}
                <Link to="/partner/wallet" className="font-semibold text-brand underline">View wallet</Link>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky action */}
      {action && !completed && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-lg mx-auto bg-surface/95 backdrop-blur-xl border-t border-hairline/10 px-5 py-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <Button onClick={handleAction}
              className={`w-full h-12 rounded-2xl text-base font-bold shadow-e2 text-white ${action.color}`}>
              <action.icon className="h-5 w-5 mr-2" />
              {action.label}
              {action.next === 'completed' && afterPhotos.length === 0 && ' · add after photos first'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
