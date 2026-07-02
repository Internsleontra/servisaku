import { useState } from 'react';
import { Alert, ScrollView, Text, View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BookingExtra } from '@/api/client';
import { ScreenHeader, Loading, Card, Badge, Button, Divider, Muted, EmptyState } from '@/components/ui';
import { statusMeta, LIFECYCLE_ORDER, PAYMENT_METHODS } from '@/lib/booking-meta';
import { formatMYR, formatDay, initials } from '@/lib/format';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function BookingDetail() {
  const { bookingId, created } = useLocalSearchParams<{ bookingId: string; created?: string }>();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: b, isLoading, error } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api.booking(String(bookingId)),
    enabled: !!bookingId,
  });

  async function decide(itemId: string, decision: 'approved' | 'rejected') {
    setBusy(true);
    try {
      await api.decideExtra(String(bookingId), itemId, decision);
      await qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    Alert.alert('Cancel booking?', 'This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel booking', style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.cancelBooking(String(bookingId));
            await qc.invalidateQueries({ queryKey: ['booking', bookingId] });
            await qc.invalidateQueries({ queryKey: ['my-bookings'] });
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Could not cancel');
          } finally { setBusy(false); }
        },
      },
    ]);
  }

  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Booking" /><Loading /></View>;
  if (error || !b) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Booking" /><EmptyState emoji="🚫" title="Booking not found" /></View>;

  const meta = statusMeta(b.status);
  const isActive = meta.step >= 0 && b.status !== 'completed';
  const pendingExtras = (b.extras ?? []).filter((e) => e.status === 'pending');
  const payMethod = PAYMENT_METHODS.find((m) => m.id === b.payment_method);
  const paid = b.payment_status === 'paid';
  const doneStep = statusMeta(b.status).step;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Booking details"
        onBack={() => (created ? router.replace('/(tabs)/bookings') : router.back())}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {created ? (
          <Card style={{ backgroundColor: colors.successTint, borderColor: '#a7f3d0', flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 24 }}>🎉</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.success }}>Booking confirmed!</Text>
              <Muted>We're matching you with a verified pro.</Muted>
            </View>
          </Card>
        ) : null}

        {/* Status + service */}
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ flex: 1, fontSize: font.size.lg, fontWeight: '800', color: colors.ink, paddingRight: 8 }}>{b.service_type}</Text>
            <Badge label={`${meta.icon} ${meta.label}`} tint={meta.tint} fg={meta.fg} />
          </View>
          <Muted>{formatDay(b.date)}{b.time_slot ? ` · ${b.time_slot}` : ''}</Muted>
          {b.address ? <Muted>📍 {b.address}{b.city ? `, ${b.city}` : ''}</Muted> : null}
          {b.notes ? <Muted>📝 {b.notes}</Muted> : null}
        </Card>

        {/* Partner card */}
        {b.partner_name ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontWeight: '700', color: colors.brand }}>{initials(b.partner_name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{b.partner_name}</Text>
              {b.partner_rating ? <Muted>⭐ {b.partner_rating.toFixed(1)}</Muted> : <Muted>Your assigned pro</Muted>}
            </View>
          </Card>
        ) : null}

        {/* Live actions */}
        {isActive ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="💬 Chat" variant="outline" style={{ flex: 1 }} onPress={() => router.push(`/chat/${b.id}`)} />
            <Button label="📍 Track" variant="outline" style={{ flex: 1 }} onPress={() => router.push(`/tracking/${b.id}`)} />
          </View>
        ) : null}

        {/* Extras approval */}
        {(b.extras ?? []).length ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>Extra services</Text>
            {pendingExtras.length ? <Muted>Your pro proposed extra work. Approve to add it to your invoice.</Muted> : null}
            {(b.extras ?? []).map((e) => <ExtraRow key={e.id} extra={e} onDecide={decide} busy={busy} />)}
          </Card>
        ) : null}

        {/* Invoice */}
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>Invoice</Text>
            <Pressable onPress={() => router.push(`/booking/${b.id}/invoice`)}>
              <Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>View full →</Text>
            </Pressable>
          </View>
          {(b.price_breakdown ?? []).slice(0, 4).map((line, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.inkSecondary, flex: 1 }} numberOfLines={1}>{line.label}</Text>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{formatMYR(line.amount)}</Text>
            </View>
          ))}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>Total</Text>
            <Text style={{ fontWeight: '800', color: colors.brand }}>{formatMYR(b.price)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Muted>{payMethod ? `${payMethod.icon} ${payMethod.label}` : 'Payment'}</Muted>
            <Badge label={paid ? 'Paid' : 'Unpaid'} tint={paid ? colors.successTint : colors.warningTint} fg={paid ? colors.success : colors.warning} />
          </View>
        </Card>

        {/* Timeline */}
        <Card style={{ gap: 12 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Progress</Text>
          {LIFECYCLE_ORDER.map((st) => {
            const m = statusMeta(st);
            const reached = b.status === 'cancelled' ? false : m.step <= doneStep;
            return (
              <View key={st} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: reached ? colors.brand : colors.raised }}>
                  <Text style={{ fontSize: 13 }}>{reached ? m.icon : '○'}</Text>
                </View>
                <Text style={{ color: reached ? colors.ink : colors.inkTertiary, fontWeight: reached ? '600' : '400' }}>{m.label}</Text>
              </View>
            );
          })}
        </Card>

        {/* Footer actions */}
        {b.status === 'completed' && !b.rating ? (
          <Button label="⭐ Rate your experience" onPress={() => router.push(`/review/${b.id}`)} />
        ) : null}
        {!paid && b.status !== 'cancelled' && b.payment_method !== 'cash' ? (
          <Button label={`Pay ${formatMYR(b.price)}`} variant="accent" onPress={() => router.push(`/payment/${b.id}`)} />
        ) : null}
        {isActive && (b.status === 'pending' || b.status === 'assigned') ? (
          <Button label="Cancel booking" variant="outline" onPress={cancel} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function ExtraRow({ extra, onDecide, busy }: { extra: BookingExtra; onDecide: (id: string, d: 'approved' | 'rejected') => void; busy: boolean }) {
  const tint = extra.status === 'approved' ? colors.successTint : extra.status === 'rejected' ? colors.dangerTint : colors.warningTint;
  const fg = extra.status === 'approved' ? colors.success : extra.status === 'rejected' ? colors.danger : colors.warning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.raised, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', color: colors.ink }} numberOfLines={1}>{extra.label}{extra.qty && extra.qty > 1 ? ` × ${extra.qty}` : ''}</Text>
        <Text style={{ fontWeight: '700', color: colors.brand, fontSize: font.size.sm }}>{formatMYR(extra.total)}</Text>
      </View>
      {extra.status === 'pending' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="✕" variant="outline" size="sm" onPress={() => onDecide(extra.id, 'rejected')} disabled={busy} />
          <Button label="✓ Approve" size="sm" onPress={() => onDecide(extra.id, 'approved')} disabled={busy} />
        </View>
      ) : (
        <Badge label={extra.status} tint={tint} fg={fg} />
      )}
    </View>
  );
}
