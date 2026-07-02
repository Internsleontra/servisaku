// Steps B–F of the booking wizard (RN port). Step A is QuestionRenderer.
import { ScrollView, Text, View, Pressable } from 'react-native';
import type { Quote, ServiceDetail } from '@/api/client';
import QuestionRenderer from './QuestionRenderer';
import { Chip, Field, Input, Card } from '@/components/ui';
import { CITIES, SLOT_GROUPS, PAYMENT_METHODS } from '@/lib/booking-meta';
import { formatMYR, formatDay } from '@/lib/format';
import { rm } from '@/lib/option-price';
import { colors, font, radius, spacing } from '@/theme/tokens';

export interface PropertyState { propertyType: string; buildingType: string; lift: string; parking: string }
export interface ScheduleState { date: string; timeSlot: string }
export interface AddressState { addressLine?: string; unitNumber?: string; contactPerson?: string; contactPhone?: string; city?: string }
export interface ExtrasState { notes: string }
export interface PaymentState { method: string }

function Segment({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: '700', color: colors.ink }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => <Chip key={o.id} label={o.label} active={value === o.id} onPress={() => onChange(o.id)} />)}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ Step A --- */
export function StepA({ service, answers, setAnswer }: { service: ServiceDetail; answers: Record<string, unknown>; setAnswer: (id: string, v: unknown) => void }) {
  return (
    <View style={{ gap: spacing.xl }}>
      {(service.questions ?? []).map((q) => (
        <QuestionRenderer key={q.id} question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ Step B --- */
export function StepB({ property, setProperty }: { property: PropertyState; setProperty: (p: PropertyState) => void }) {
  const set = (k: keyof PropertyState, v: string) => setProperty({ ...property, [k]: v });
  return (
    <View style={{ gap: spacing.xl }}>
      <Segment label="Property type" value={property.propertyType} onChange={(v) => set('propertyType', v)}
        options={[{ id: 'residential', label: '🏠 Residential' }, { id: 'commercial', label: '🏢 Commercial' }]} />
      <Segment label="Building" value={property.buildingType} onChange={(v) => set('buildingType', v)}
        options={[{ id: 'apartment', label: 'Apartment' }, { id: 'condo', label: 'Condo' }, { id: 'landed', label: 'Landed' }, { id: 'office', label: 'Office' }]} />
      <Segment label="Lift access" value={property.lift} onChange={(v) => set('lift', v)}
        options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]} />
      <Segment label="Parking available" value={property.parking} onChange={(v) => set('parking', v)}
        options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]} />
    </View>
  );
}

/* ------------------------------------------------------------------ Step C --- */
function nextDays(n: number): { iso: string; date: Date }[] {
  const out: { iso: string; date: Date }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({ iso: d.toISOString().slice(0, 10), date: d });
  }
  return out;
}
export function StepC({ schedule, setSchedule }: { schedule: ScheduleState; setSchedule: (s: ScheduleState) => void }) {
  const days = nextDays(14);
  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ gap: 10 }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Select a date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map(({ iso, date }, i) => {
            const active = schedule.date === iso;
            return (
              <Pressable key={iso} onPress={() => setSchedule({ ...schedule, date: iso })}
                style={{
                  width: 60, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', borderWidth: 1,
                  borderColor: active ? colors.brand : colors.hairline, backgroundColor: active ? colors.brand : colors.surface,
                }}>
                <Text style={{ fontSize: font.size.xs, color: active ? '#ffedd5' : colors.inkTertiary }}>
                  {i === 0 ? 'Today' : date.toLocaleDateString('en-MY', { weekday: 'short' })}
                </Text>
                <Text style={{ fontSize: font.size.lg, fontWeight: '800', color: active ? colors.inkInverse : colors.ink }}>{date.getDate()}</Text>
                <Text style={{ fontSize: font.size.xs, color: active ? '#ffedd5' : colors.inkTertiary }}>{date.toLocaleDateString('en-MY', { month: 'short' })}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {SLOT_GROUPS.map((g) => (
        <View key={g.label} style={{ gap: 10 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>{g.emoji} {g.label} <Text style={{ color: colors.inkTertiary, fontWeight: '400' }}>· {g.sub}</Text></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {g.slots.map((s) => <Chip key={s} label={s} active={schedule.timeSlot === s} onPress={() => setSchedule({ ...schedule, timeSlot: s })} />)}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ Step D --- */
export function StepD({ address, setAddress, savedCity }: { address: AddressState; setAddress: (a: AddressState) => void; savedCity: string | null }) {
  const set = (k: keyof AddressState, v: string) => setAddress({ ...address, [k]: v });
  return (
    <View style={{ gap: spacing.lg }}>
      <Field label="Address line *">
        <Input value={address.addressLine ?? ''} onChangeText={(v) => set('addressLine', v)} placeholder="Street, building, area" />
      </Field>
      <Field label="Unit / floor (optional)">
        <Input value={address.unitNumber ?? ''} onChangeText={(v) => set('unitNumber', v)} placeholder="e.g. A-12-3" />
      </Field>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: font.size.sm, fontWeight: '600', color: colors.inkSecondary }}>City</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CITIES.map((c) => <Chip key={c} label={c} active={(address.city ?? savedCity) === c} onPress={() => set('city', c)} />)}
        </View>
      </View>
      <Field label="Contact person *">
        <Input value={address.contactPerson ?? ''} onChangeText={(v) => set('contactPerson', v)} placeholder="Name at location" />
      </Field>
      <Field label="Contact phone *">
        <Input value={address.contactPhone ?? ''} onChangeText={(v) => set('contactPhone', v)} placeholder="+60…" keyboardType="phone-pad" />
      </Field>
    </View>
  );
}

/* ------------------------------------------------------------------ Step E --- */
export function StepE({ extras, setExtras }: { extras: ExtrasState; setExtras: (e: ExtrasState) => void }) {
  return (
    <View style={{ gap: spacing.lg }}>
      <Field label="Notes for the pro (optional)">
        <Input
          value={extras.notes}
          onChangeText={(v) => setExtras({ ...extras, notes: v })}
          placeholder="Gate code, pets, specific requests…"
          multiline
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />
      </Field>
      <Card style={{ backgroundColor: colors.brandTint, borderColor: colors.brandTintStrong }}>
        <Text style={{ fontSize: font.size.sm, color: colors.brandInk }}>
          📷 You'll be able to share photos with your pro in chat once the booking is confirmed.
        </Text>
      </Card>
    </View>
  );
}

/* ------------------------------------------------------------------ Step F --- */
export function StepF({
  service, quote, quoteError, payment, setPayment, schedule, address,
}: {
  service: ServiceDetail; quote: Quote | null; quoteError: string | null;
  payment: PaymentState; setPayment: (p: PaymentState) => void;
  schedule: ScheduleState; address: AddressState;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: 8 }}>
        <Text style={{ fontWeight: '700', color: colors.ink, fontSize: font.size.lg }}>{service.name}</Text>
        <Text style={{ color: colors.inkSecondary }}>{formatDay(schedule.date)}{schedule.timeSlot ? ` · ${schedule.timeSlot}` : ''}</Text>
        {address.addressLine ? <Text style={{ color: colors.inkSecondary }}>{address.addressLine}{address.city ? `, ${address.city}` : ''}</Text> : null}
      </Card>

      {/* Price breakdown */}
      <Card style={{ gap: 8 }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Price breakdown</Text>
        {quoteError && !quote ? (
          <Text style={{ color: colors.danger, fontSize: font.size.sm }}>{quoteError}</Text>
        ) : quote ? (
          <>
            {(quote.breakdown ?? []).map((line, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: line.amount < 0 ? colors.success : colors.inkSecondary, flex: 1 }} numberOfLines={1}>
                  {line.label}{line.qty && line.qty > 1 ? ` ×${line.qty}` : ''}
                </Text>
                <Text style={{ color: line.amount < 0 ? colors.success : colors.ink, fontWeight: '600' }}>{rm(line.amount)}</Text>
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: colors.hairline, marginVertical: 4 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: colors.ink, fontSize: font.size.lg }}>Total</Text>
              <Text style={{ fontWeight: '800', color: colors.brand, fontSize: font.size.lg }}>{formatMYR(quote.total)}</Text>
            </View>
          </>
        ) : (
          <Text style={{ color: colors.inkTertiary, fontSize: font.size.sm }}>Calculating…</Text>
        )}
      </Card>

      {/* Payment method */}
      <View style={{ gap: 10 }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Payment method</Text>
        {PAYMENT_METHODS.map((m) => {
          const active = payment.method === m.id;
          return (
            <Pressable key={m.id} onPress={() => setPayment({ method: m.id })}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: active ? 2 : 1, borderRadius: radius.md,
                borderColor: active ? colors.brand : colors.hairline, backgroundColor: active ? colors.brandTint : colors.surface,
                paddingHorizontal: 14, paddingVertical: 12,
              }}>
              <Text style={{ fontSize: 20 }}>{m.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{m.label}</Text>
                <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{m.sub}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
