import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { serviceImage } from '@/lib/images';
import { api, type Quote, type ServiceDetail } from '@/api/client';
import { useAuth } from '@/context/auth';
import { isAfterHours, isUrgent } from '@/lib/booking-meta';
import { formatMYR } from '@/lib/format';
import { ScreenHeader, Loading, Button, EmptyState } from '@/components/ui';
import {
  StepA, StepB, StepC, StepD, StepE, StepF,
  type PropertyState, type ScheduleState, type AddressState, type ExtrasState, type PaymentState,
} from '@/components/booking/steps';
import { colors, font, spacing } from '@/theme/tokens';

const STEPS = ['Options', 'Property', 'Schedule', 'Address', 'Details', 'Review'];

function defaultAnswers(service: ServiceDetail): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  for (const q of service.questions ?? []) {
    if (q.type === 'TIER_SELECT' || q.type === 'SINGLE_SELECT') {
      a[q.id] = ((q.options ?? []).find((o) => o.is_default) || (q.options ?? [])[0])?.id;
    } else if (q.type === 'MULTI_SELECT') a[q.id] = [];
    else if (q.type === 'TIER_QUANTITY') a[q.id] = {};
    else if (q.type === 'QUANTITY') a[q.id] = q.required ? (Number(q.config?.min) || 1) : (Number(q.config?.min) || 0);
    else if (q.type === 'HOURS_INPUT') a[q.id] = Number(q.config?.min) || 1;
  }
  return a;
}

function stepAComplete(service: ServiceDetail, answers: Record<string, unknown>): boolean {
  return (service.questions ?? []).every((q) => {
    if (!q.required) return true;
    const v = answers[q.id];
    if (q.type === 'TIER_QUANTITY') return !!v && Object.values(v as Record<string, number>).some((n) => Number(n) > 0);
    if (q.type === 'MULTI_SELECT') return Array.isArray(v) && v.length > 0;
    return v !== undefined && v !== null && v !== '';
  });
}

export default function ServiceBooking() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: service, isLoading, error } = useQuery({
    queryKey: ['booking-service', slug],
    queryFn: () => api.service(String(slug)),
    enabled: !!slug,
  });

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [property, setProperty] = useState<PropertyState>({ propertyType: 'residential', buildingType: 'apartment', lift: 'yes', parking: 'yes' });
  const [schedule, setSchedule] = useState<ScheduleState>({ date: '', timeSlot: '' });
  const [address, setAddress] = useState<AddressState>({});
  const [extras, setExtras] = useState<ExtrasState>({ notes: '' });
  const [payment, setPayment] = useState<PaymentState>({ method: 'fpx' });
  const [savedCity, setSavedCity] = useState<string | null>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!service) return;
    setAnswers(defaultAnswers(service));
    api.me().then((me) => { if (me?.city) setSavedCity(me.city); }).catch(() => {});
  }, [service]);

  const afterHours = isAfterHours(schedule.timeSlot);
  const urgent = isUrgent(schedule.date);

  useEffect(() => {
    if (!service || !service.pricing_type) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const q = await api.calculate({ service_slug: service.slug, answers, after_hours: afterHours, urgent });
        setQuote(q); setQuoteError(null);
      } catch (e) {
        setQuote(null); setQuoteError(e instanceof Error ? e.message : 'Complete the required options to see a price');
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [service, answers, afterHours, urgent]);

  const setAnswer = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }));

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
    if (!service) return;
    if (!user) {
      router.push({ pathname: '/login', params: { redirect: `/book-service/${service.slug}` } });
      return;
    }
    setSubmitting(true);
    try {
      const composedAddress = [address.addressLine, address.unitNumber && `Unit ${address.unitNumber}`].filter(Boolean).join(', ');
      const booking = await api.createBooking({
        service_slug: service.slug,
        answers,
        property,
        contact: { person: address.contactPerson, phone: address.contactPhone },
        photos: [],
        after_hours: afterHours,
        urgent,
        date: schedule.date,
        time_slot: schedule.timeSlot,
        address: composedAddress,
        city: address.city || savedCity || null,
        notes: extras.notes || null,
        payment_method: payment.method,
      });
      router.replace(`/booking/${booking.id}?created=1`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create booking';
      if (/log in|unauth|401/i.test(msg)) {
        router.push({ pathname: '/login', params: { redirect: `/book-service/${service.slug}` } });
      } else {
        Alert.alert('Booking failed', msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Book service" /><Loading /></View>;
  if (error || !service) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Book service" />
        <EmptyState emoji="🚫" title="Service not found" subtitle="This service may no longer be available." />
      </View>
    );
  }
  if (!service.pricing_type) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={service.name} />
        <EmptyState emoji="⏳" title="Not bookable yet" subtitle="This service isn't available in the dynamic booking flow yet." />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={service.name} onBack={() => (step === 0 ? router.back() : setStep((s) => s - 1))} />

      {/* Progress */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {STEPS.map((label, i) => (
            <View key={label} style={{ height: 6, flex: 1, borderRadius: 3, backgroundColor: i <= step ? colors.brand : colors.hairline }} />
          ))}
        </View>
        <Text style={{ marginTop: 8, fontSize: font.size.sm, fontWeight: '600', color: colors.inkSecondary }}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {step === 0 && serviceImage(service.slug) ? (
          <Image source={serviceImage(service.slug)} style={{ width: '100%', height: 160, borderRadius: 16, marginBottom: spacing.lg }} contentFit="cover" transition={150} />
        ) : null}
        {step === 0 && <StepA service={service} answers={answers} setAnswer={setAnswer} />}
        {step === 1 && <StepB property={property} setProperty={setProperty} />}
        {step === 2 && <StepC schedule={schedule} setSchedule={setSchedule} />}
        {step === 3 && <StepD address={address} setAddress={setAddress} savedCity={savedCity} />}
        {step === 4 && <StepE extras={extras} setExtras={setExtras} />}
        {step === 5 && <StepF service={service} quote={quote} quoteError={quoteError} payment={payment} setPayment={setPayment} schedule={schedule} address={address} />}
      </ScrollView>

      {/* Sticky footer */}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: insets.bottom + 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <View>
          <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary }}>Estimated total</Text>
          <Text style={{ fontSize: font.size.lg, fontWeight: '800', color: colors.ink }}>
            {quote ? formatMYR(quote.total) : '—'}
          </Text>
        </View>
        {step < STEPS.length - 1 ? (
          <Button label="Continue →" onPress={() => setStep((s) => s + 1)} disabled={!canAdvance} size="lg" style={{ flex: 1, maxWidth: 200 }} />
        ) : (
          <Button label={user ? 'Confirm booking' : 'Sign in & confirm'} variant="accent" onPress={submit} loading={submitting} disabled={submitting || !quote} size="lg" style={{ flex: 1, maxWidth: 220 }} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
