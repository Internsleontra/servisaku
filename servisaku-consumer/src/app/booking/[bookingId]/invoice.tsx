import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ScreenHeader, Loading, Card, Divider, Muted, EmptyState } from '@/components/ui';
import { PAYMENT_METHODS } from '@/lib/booking-meta';
import { formatMYR, formatDay } from '@/lib/format';
import { colors, font, spacing } from '@/theme/tokens';

export default function Invoice() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { data: b, isLoading } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api.booking(String(bookingId)),
    enabled: !!bookingId,
  });

  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Invoice" /><Loading /></View>;
  if (!b) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Invoice" /><EmptyState emoji="🧾" title="Invoice not found" /></View>;

  const payMethod = PAYMENT_METHODS.find((m) => m.id === b.payment_method);
  const lines = b.price_breakdown ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Invoice" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: font.size.lg, fontWeight: '800', color: colors.ink }}>ServisAku</Text>
            <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>#{String(b.id).slice(0, 8).toUpperCase()}</Text>
          </View>
          <Muted>{b.service_type}</Muted>
          <Muted>{formatDay(b.date)}{b.time_slot ? ` · ${b.time_slot}` : ''}</Muted>
          {b.address ? <Muted>{b.address}{b.city ? `, ${b.city}` : ''}</Muted> : null}
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Charges</Text>
          {lines.length ? lines.map((line, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: line.amount < 0 ? colors.success : colors.inkSecondary, flex: 1 }} numberOfLines={2}>
                {line.label}{line.qty && line.qty > 1 ? ` × ${line.qty}` : ''}
              </Text>
              <Text style={{ color: line.amount < 0 ? colors.success : colors.ink, fontWeight: '600' }}>{formatMYR(line.amount)}</Text>
            </View>
          )) : <Muted>No itemised breakdown available for this booking.</Muted>}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: font.size.lg }}>Total</Text>
            <Text style={{ fontWeight: '800', color: colors.brand, fontSize: font.size.lg }}>{formatMYR(b.price)}</Text>
          </View>
        </Card>

        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Muted>Payment method</Muted>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{payMethod ? `${payMethod.icon} ${payMethod.label}` : '—'}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Muted>Payment status</Muted>
            <Text style={{ color: b.payment_status === 'paid' ? colors.success : colors.warning, fontWeight: '700', textTransform: 'capitalize' }}>
              {b.payment_status ?? 'pending'}
            </Text>
          </View>
        </Card>

        <Muted style={{ textAlign: 'center' }}>Thank you for choosing ServisAku 🧡</Muted>
      </ScrollView>
    </View>
  );
}
