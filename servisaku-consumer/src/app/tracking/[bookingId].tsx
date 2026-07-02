import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ScreenHeader, Loading, Card, Button, Muted, EmptyState, Badge } from '@/components/ui';
import { statusMeta, LIFECYCLE_ORDER } from '@/lib/booking-meta';
import { initials } from '@/lib/format';
import { colors, font, spacing } from '@/theme/tokens';

const HINT: Record<string, string> = {
  pending: 'Finding the best pro for your job…',
  assigned: 'A pro has been assigned to your booking.',
  accepted: 'Your pro accepted and is preparing.',
  en_route: 'Your pro is on the way to you 🚗',
  arrived: 'Your pro has arrived at your location.',
  started: 'Work is in progress 🔧',
  completed: 'Job complete — thank you!',
};

export default function Tracking() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { data: b, isLoading } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api.booking(String(bookingId)),
    enabled: !!bookingId,
    refetchInterval: 15_000, // poll while tracking (no websockets yet)
  });

  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Live tracking" /><Loading /></View>;
  if (!b) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Live tracking" /><EmptyState emoji="📍" title="Booking not found" /></View>;

  const meta = statusMeta(b.status);
  const doneStep = meta.step;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Live tracking" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
        {/* Map placeholder (native maps not wired yet) */}
        <View style={{ height: 180, borderRadius: 16, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.brandTintStrong }}>
          <Text style={{ fontSize: 44 }}>{meta.icon}</Text>
          <Text style={{ marginTop: 8, fontWeight: '700', color: colors.brandInk }}>{meta.label}</Text>
        </View>

        <Card style={{ gap: 6 }}>
          <Badge label={`${meta.icon} ${meta.label}`} tint={meta.tint} fg={meta.fg} />
          <Text style={{ fontSize: font.size.base, color: colors.ink, marginTop: 4 }}>{HINT[b.status] ?? 'Tracking your booking…'}</Text>
        </Card>

        {b.partner_name ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontWeight: '700', color: colors.brand }}>{initials(b.partner_name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{b.partner_name}</Text>
              {b.partner_rating ? <Muted>⭐ {b.partner_rating.toFixed(1)}</Muted> : null}
            </View>
            <Button label="💬 Chat" variant="outline" size="sm" onPress={() => router.push(`/chat/${b.id}`)} />
          </Card>
        ) : null}

        <Card style={{ gap: 12 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Journey</Text>
          {LIFECYCLE_ORDER.map((st) => {
            const m = statusMeta(st);
            const reached = b.status === 'cancelled' ? false : m.step <= doneStep;
            const current = m.step === doneStep;
            return (
              <View key={st} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: reached ? colors.brand : colors.raised }}>
                  <Text style={{ fontSize: 13 }}>{reached ? m.icon : '○'}</Text>
                </View>
                <Text style={{ color: reached ? colors.ink : colors.inkTertiary, fontWeight: current ? '800' : reached ? '600' : '400' }}>{m.label}</Text>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </View>
  );
}
