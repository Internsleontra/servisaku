import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck, Lock, CalendarCheck, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { safeMotion, variants } from '@/lib/design/motion';
import { servisaku } from '@/api/servisakuClient';
import { formatMYR } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import StepA from '@/components/booking/steps/StepA';
import StepB from '@/components/booking/steps/StepB';
import StepC from '@/components/booking/steps/StepC';
import StepD from '@/components/booking/steps/StepD';
import StepE from '@/components/booking/steps/StepE';
import StepF from '@/components/booking/steps/StepF';
import { isAfterHours, isUrgent } from '@/components/booking/scheduleRules';
import { PriceSummary } from '@/components/ds';

const STEPS = ['Options', 'Property', 'Schedule', 'Address', 'Details', 'Review'];

// Seed answers from each question's defaults so a price shows immediately.
function defaultAnswers(service) {
  const a = {};
  for (const q of service.questions || []) {
    if (q.type === 'TIER_SELECT' || q.type === 'SINGLE_SELECT') {
      a[q.id] = (q.options.find((o) => o.is_default) || q.options[0])?.id;
    } else if (q.type === 'MULTI_SELECT') a[q.id] = [];
    else if (q.type === 'TIER_QUANTITY') a[q.id] = {};
    else if (q.type === 'QUANTITY') a[q.id] = q.required ? (q.config?.min ?? 1) : (q.config?.min ?? 0);
    else if (q.type === 'HOURS_INPUT') a[q.id] = q.config?.min ?? 1;
  }
  return a;
}

// Client mirror of the server's required-answer check (Step A gating only).
function stepAComplete(service, answers) {
  return (service.questions || []).every((q) => {
    if (!q.required) return true;
    const v = answers[q.id];
    if (q.type === 'TIER_QUANTITY') return v && Object.values(v).some((n) => Number(n) > 0);
    if (q.type === 'MULTI_SELECT') return Array.isArray(v) && v.length > 0;
    return v !== undefined && v !== null && v !== '';
  });
}

export default function ServiceBooking() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const { data: service, isLoading, error } = useQuery({
    queryKey: ['booking-service', slug],
    queryFn: () => servisaku.catalog.getService(slug),
  });

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [property, setProperty] = useState({ propertyType: 'residential', buildingType: 'apartment', lift: 'yes', parking: 'yes' });
  const [schedule, setSchedule] = useState({ date: '', timeSlot: '' });
  const [address, setAddress] = useState({});
  const [extras, setExtras] = useState({ notes: '', photos: [] });
  const [payment, setPayment] = useState({ method: 'fpx' });
  const [savedCity, setSavedCity] = useState(null);

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef();

  // Seed defaults + prefill city once the service loads.
  useEffect(() => {
    if (!service) return;
    setAnswers(defaultAnswers(service));
    servisaku.auth.me().then((me) => { if (me?.city) { setSavedCity(me.city); } }).catch(() => {});
  }, [service]);

  const afterHours = isAfterHours(schedule.timeSlot);
  const urgent = isUrgent(schedule.date);

  // Live, authoritative quote — debounced on every answer/schedule change.
  useEffect(() => {
    if (!service || !service.pricing_type) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const q = await servisaku.catalog.calculate({
          service_slug: service.slug, answers, after_hours: afterHours, urgent,
        });
        setQuote(q); setQuoteError(null);
      } catch (e) {
        setQuote(null); setQuoteError(e.message || 'Complete the required options to see a price');
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [service, answers, afterHours, urgent]);

  const setAnswer = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));

  const canAdvance = useMemo(() => {
    if (!service) return false;
    switch (step) {
      case 0: return stepAComplete(service, answers);
      case 1: return !!property.propertyType && !!property.buildingType;
      case 2: return !!schedule.date && !!schedule.timeSlot;
      case 3: return !!address.addressLine && !!address.contactPerson && !!address.contactPhone;
      default: return true;
    }
  }, [service, step, answers, property, schedule, address]);

  async function submit() {
    setSubmitting(true);
    try {
      const composedAddress = [address.addressLine, address.unitNumber && `Unit ${address.unitNumber}`]
        .filter(Boolean).join(', ');
      const booking = await servisaku.catalog.createBooking({
        service_slug: service.slug,
        answers,
        property,
        contact: { person: address.contactPerson, phone: address.contactPhone },
        photos: extras.photos,
        after_hours: afterHours,
        urgent,
        date: schedule.date,
        time_slot: schedule.timeSlot,
        address: composedAddress,
        city: address.city || savedCity || null,
        notes: extras.notes || null,
        payment_method: payment.method,
      });

      // Cash on service → no online payment; the partner collects at completion.
      if (payment.method === 'cash') {
        toast.success('Booking confirmed!');
        navigate(`/booking/${booking.id}`);
        return;
      }

      // Online methods → create a Billplz bill and hand off to hosted checkout.
      try {
        const pay = await servisaku.payments.create(booking.id, payment.method);
        if (pay?.checkout_url) { window.location.href = pay.checkout_url; return; }
      } catch (payErr) {
        toast.error(payErr.message || 'Could not start payment — you can pay from your booking.');
      }
      navigate(`/booking/${booking.id}`); // fallback if the gateway didn't return a URL
    } catch (e) {
      if (/log in|unauth|401/i.test(e.message)) {
        toast.info('Please log in to confirm your booking');
        setTimeout(() => navigate('/otp-login'), 800);
      } else {
        toast.error(e.message || 'Could not create booking');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-brand" /></div>;
  }
  if (error || !service) {
    return <div className="p-6 text-center text-ink-secondary">Service not found.</div>;
  }
  if (!service.pricing_type) {
    return (
      <div className="p-6 text-center text-ink-secondary">
        This service isn’t available in the dynamic booking flow yet.
      </div>
    );
  }

  /* Quote lines for the rail. The server owns the arithmetic — this only
     presents what it returned, so the figure shown is always the figure charged. */
  const money = (n) => formatMYR(n, { decimals: true });
  const priceLines = (quote?.breakdown || [])
    .filter((l) => l.type !== 'TOTAL')
    .map((l, i) => ({
      key: i,
      label: l.label,
      value: (l.amount < 0 ? '− ' : '') + money(Math.abs(l.amount)),
      tone: l.amount < 0 ? 'discount' : undefined,
    }));

  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header — the system's page-header pattern. */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-14">
          <button
            onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" /> {step === 0 ? 'Back' : STEPS[step - 1]}
          </button>

          <h1 className="text-display-2 text-white">{service.name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-5 text-md text-white/80">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4" /> 30-day warranty</span>
            <span className="inline-flex items-center gap-1.5"><Lock className="size-4" /> Escrow protected</span>
            <span className="sa-num">Step {step + 1} of {STEPS.length}</span>
          </div>

          <div className="mt-5 flex gap-1.5">
            {STEPS.map((label, i) => (
              <div key={label} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-live' : 'bg-white/20'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Two-column desktop: step body + sticky booking rail. */}
      <div className="mx-auto -mt-8 grid w-full max-w-[1240px] items-start gap-6 px-5 md:px-8 lg:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-card bg-surface p-5 shadow-e2 md:p-6">
          <h2 className="mb-5 font-display text-h3 font-semibold text-ink">{STEPS[step]}</h2>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} {...safeMotion(variants.fadeUp)}>
              {step === 0 && <StepA service={service} answers={answers} setAnswer={setAnswer} />}
              {step === 1 && <StepB property={property} setProperty={setProperty} />}
              {step === 2 && <StepC schedule={schedule} setSchedule={setSchedule} />}
              {step === 3 && <StepD address={address} setAddress={setAddress} savedCity={savedCity} />}
              {step === 4 && <StepE extras={extras} setExtras={setExtras} />}
              {step === 5 && <StepF service={service} quote={quote} quoteError={quoteError} payment={payment} setPayment={setPayment} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Booking rail — sticky on desktop. */}
        <div className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-e2 md:p-6 lg:sticky lg:top-[100px]">
          <span className="sa-num text-[34px] font-medium leading-none text-ink">
            {quote ? money(quote.total) : '—'}
          </span>

          {(schedule.date || address.addressLine) && (
            <div className="flex flex-col gap-2 text-caption font-normal text-ink-secondary">
              {schedule.date && (
                <span className="inline-flex items-center gap-2">
                  <CalendarCheck className="size-[15px] text-brand" />
                  <span className="sa-num">
                    {new Date(schedule.date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  {schedule.timeSlot && <span className="sa-num">· {schedule.timeSlot}</span>}
                </span>
              )}
              {address.addressLine && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-[15px] shrink-0 text-brand" />
                  <span className="truncate">{address.addressLine}</span>
                </span>
              )}
            </div>
          )}

          {quote ? (
            <PriceSummary
              lines={priceLines}
              total={money(quote.total)}
              note="Held in escrow until you confirm the job is done"
            />
          ) : (
            <p className="text-caption font-normal text-ink-tertiary">
              {quoteError || 'Complete the required options to see a price.'}
            </p>
          )}

          {step < STEPS.length - 1 ? (
            <Button variant="primary" size="lg" className="w-full" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
              Continue <ArrowRight size={18} className="ml-1" />
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="w-full" loading={submitting} disabled={submitting || !quote} onClick={submit}>
              Confirm booking
            </Button>
          )}

          <div className="flex items-center justify-center gap-1.5 text-xs text-ink-tertiary">
            <ShieldCheck className="size-3.5" /> Free cancellation up to 4 h before
          </div>
        </div>
      </div>
    </div>
  );
}
