import { useState } from 'react';
import { ScrollView, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ScreenHeader, Loading, Card, Button, Muted, EmptyState } from '@/components/ui';
import { PAYMENT_METHODS } from '@/lib/booking-meta';
import { formatMYR } from '@/lib/format';
import { colors, font, radius, spacing } from '@/theme/tokens';

type PayState = 'idle' | 'processing' | 'success';

// NOTE: Payment is simulated here — the platform has no live gateway wired yet
// (true on the web app too). This mirrors the web PaymentCheckout mock UX.
export default function Payment() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { data: b, isLoading } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api.booking(String(bookingId)),
    enabled: !!bookingId,
  });

  const [method, setMethod] = useState<string>('fpx');
  const [state, setState] = useState<PayState>('idle');

  function pay() {
    setState('processing');
    setTimeout(() => setState('success'), 1800);
  }

  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Payment" /><Loading /></View>;
  if (!b) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Payment" /><EmptyState emoji="💳" title="Booking not found" /></View>;

  if (state === 'success') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Payment" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
          <Text style={{ fontSize: 64 }}>✅</Text>
          <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.ink }}>Payment successful</Text>
          <Muted style={{ textAlign: 'center' }}>{formatMYR(b.price)} paid for {b.service_type}.</Muted>
          <Button label="Back to booking" onPress={() => router.replace(`/booking/${b.id}`)} style={{ marginTop: 12 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Payment" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: 4 }}>
          <Muted>Amount due</Muted>
          <Text style={{ fontSize: font.size['3xl'], fontWeight: '800', color: colors.ink }}>{formatMYR(b.price)}</Text>
          <Muted>{b.service_type}</Muted>
        </Card>

        <View style={{ gap: 10 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Choose payment method</Text>
          {PAYMENT_METHODS.filter((m) => m.id !== 'cash').map((m) => {
            const active = method === m.id;
            return (
              <Pressable key={m.id} onPress={() => setMethod(m.id)}
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
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? colors.brand : colors.hairline, backgroundColor: active ? colors.brand : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <Text>🔒</Text>
          <Muted>Secured by ServisAku · escrow-protected</Muted>
        </View>

        {state === 'processing' ? (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <ActivityIndicator color={colors.brand} />
            <Muted>Processing payment…</Muted>
          </View>
        ) : (
          <Button label={`Pay ${formatMYR(b.price)}`} variant="accent" size="lg" onPress={pay} />
        )}
      </ScrollView>
    </View>
  );
}
