import { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type BookingDetail, type ServiceDetail } from '@/api/client';
import { summarizeAnswers, answersFromBreakdown } from '@/lib/bookingAnswers';
import { colors, radius, font, shadow } from '@/theme/tokens';

const ACTION: Record<string, { label: string; next: string }> = {
  accepted: { label: 'Start travelling', next: 'en_route' },
  en_route: { label: 'Mark arrived', next: 'arrived' },
  arrived: { label: 'Start service', next: 'started' },
  started: { label: 'Complete job', next: 'completed' },
};

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const b = await api.booking(id);
    setBooking(b);
    if (b.catalog_service_id) {
      api.service(b.catalog_service_id).then(setService).catch(() => {});
    }
  }, [id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const answerRows = useMemo(() => {
    const fromQ = summarizeAnswers(service?.questions, booking?.answers);
    return fromQ.length ? fromQ : answersFromBreakdown(booking?.price_breakdown);
  }, [service, booking]);

  if (loading || !booking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const payout = booking.partner_payout ?? Math.round((booking.price ?? 0) * 0.8);
  const action = ACTION[booking.status];
  const lines = (booking.price_breakdown ?? []).filter((l) => Number(l.amount) !== 0);

  const advance = async () => {
    if (!action) return;
    setActing(true);
    try {
      const updated = await api.setBookingStatus(booking.id, action.next);
      setBooking(updated);
    } catch { /* surfaced minimally */ } finally { setActing(false); }
  };

  const call = () => { if (booking.consumer_phone) Linking.openURL(`tel:${booking.consumer_phone}`); };
  const navigate = () => {
    const dest = encodeURIComponent(`${booking.address ?? ''} ${booking.city ?? ''}`.trim());
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: action ? 96 : 32 }}>
        {/* Header */}
        <View style={{ backgroundColor: booking.status === 'completed' ? colors.success : colors.brand, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 12 }}>
            <Text style={{ color: '#fff', fontSize: font.size.lg }}>‹ Back</Text>
          </Pressable>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: font.size.xs }}>Active job</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text style={{ color: '#fff', fontSize: font.size.xl, fontWeight: '700', flex: 1 }}>{booking.service_type}</Text>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, textAlign: 'right' }}>Your payout</Text>
              <Text style={{ color: '#fff', fontSize: font.size.lg, fontWeight: '800' }}>RM {payout}</Text>
            </View>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: font.size.xs, marginTop: 4, textTransform: 'capitalize' }}>
            {booking.status.replace('_', ' ')} · {booking.date?.slice(0, 10)} {booking.time_slot ?? ''}
          </Text>
        </View>

        <View style={{ padding: 20, gap: 14 }}>
          {/* Customer */}
          <View style={card}>
            <Text style={cardLabel}>Customer</Text>
            <Text style={{ fontSize: font.size.base, fontWeight: '700', color: colors.ink, marginTop: 4 }}>{booking.consumer_name ?? 'Customer'}</Text>
            {!!booking.address && <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary, marginTop: 4 }}>{booking.address}{booking.city ? `, ${booking.city}` : ''}</Text>}
            {!!booking.notes && <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary, marginTop: 8, backgroundColor: colors.warningTint, padding: 10, borderRadius: radius.md }}>Notes: {booking.notes}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              {!!booking.consumer_phone && <ActionBtn label="Call" onPress={call} />}
              <ActionBtn label="Navigate" onPress={navigate} />
            </View>
          </View>

          {/* Service details — the dynamic workflow answers */}
          <View style={card}>
            <Text style={cardLabel}>Service details</Text>
            <Text style={{ fontSize: 11, color: colors.inkTertiary, marginTop: 2, marginBottom: 8 }}>What the customer requested — no need to ask again</Text>
            {answerRows.length === 0 ? (
              <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>No additional details.</Text>
            ) : answerRows.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary, flex: 1 }}>{r.label}</Text>
                <Text style={{ fontSize: font.size.xs, fontWeight: '600', color: colors.ink, textAlign: 'right', maxWidth: '55%' }}>{r.value}</Text>
              </View>
            ))}
          </View>

          {/* Invoice */}
          <View style={card}>
            <Text style={cardLabel}>Invoice</Text>
            <View style={{ marginTop: 8, gap: 6 }}>
              {lines.map((l, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary, flex: 1 }}>
                    {l.optionLabel ? `${l.label} · ${l.optionLabel}` : l.label}{l.qty != null ? ` × ${l.qty}` : ''}
                  </Text>
                  <Text style={{ fontSize: font.size.xs, color: colors.ink }}>RM {l.amount}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 8, marginTop: 2 }}>
                <Text style={{ fontSize: font.size.sm, fontWeight: '700', color: colors.ink }}>Total</Text>
                <Text style={{ fontSize: font.size.sm, fontWeight: '700', color: colors.ink }}>RM {booking.price ?? 0}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.brandTint, padding: 10, borderRadius: radius.md }}>
                <Text style={{ fontSize: font.size.xs, fontWeight: '700', color: colors.brandInk }}>Your payout</Text>
                <Text style={{ fontSize: font.size.sm, fontWeight: '800', color: colors.brand }}>RM {payout}</Text>
              </View>
              <Text style={{ fontSize: 10, color: colors.inkTertiary, marginTop: 2 }}>
                Payment: {booking.payment_method?.toUpperCase() ?? '—'} · {booking.payment_status ?? 'pending'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky lifecycle action */}
      {action && booking.status !== 'completed' && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: insets.bottom + 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <Pressable onPress={advance} disabled={acting}
            style={({ pressed }) => [{ height: 52, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', opacity: acting || pressed ? 0.85 : 1 }]}>
            {acting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: font.size.base }}>{action.label}</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ActionBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ fontSize: font.size.sm, fontWeight: '600', color: colors.brand }}>{label}</Text>
    </Pressable>
  );
}

const card = { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.hairline, ...shadow.e1 };
const cardLabel = { fontSize: font.size.xs, fontWeight: '500' as const, color: colors.inkSecondary };
