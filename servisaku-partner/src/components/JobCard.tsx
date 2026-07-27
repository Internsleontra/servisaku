import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { Booking } from '@/api/client';
import { statusMeta } from '@/lib/booking-meta';
import { nextAction } from '@/lib/jobActions';
import { formatMYR, formatDay } from '@/lib/format';
import { Badge, Button } from '@/components/ui';
import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

export function JobCard({ b, onPrimary, busy }: { b: Booking; onPrimary?: (b: Booking) => void; busy?: boolean }) {
  const meta = statusMeta(b.status);
  const act = nextAction(b.status);
  return (
    <Pressable
      onPress={() => router.push(`/job/${b.id}`)}
      style={({ pressed }) => [{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, marginBottom: spacing.md, gap: 8, opacity: pressed ? 0.9 : 1, ...shadow.e1 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: font.size.base, fontWeight: '800', color: colors.ink, paddingRight: 8 }}>{b.service_type}</Text>
        <Badge label={`${meta.icon} ${meta.label}`} tint={meta.tint} fg={meta.fg} />
      </View>
      <View style={{ gap: 3 }}>
        {b.consumer_name ? <Row icon="person-outline" text={b.consumer_name} /> : null}
        <Row icon="calendar-outline" text={`${formatDay(b.date)}${b.time_slot ? ` · ${b.time_slot}` : ''}`} />
        {b.city || b.address ? <Row icon="location-outline" text={b.address ?? b.city ?? ''} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>Your payout</Text>
        <Text style={{ fontSize: font.size.lg, fontWeight: '800', color: colors.success }}>{formatMYR(b.partner_payout ?? b.price)}</Text>
      </View>
      {act && onPrimary ? (
        <Button label={act.label} onPress={() => onPrimary(b)} loading={busy} size="md" style={{ marginTop: 4 }} />
      ) : null}
    </Pressable>
  );
}

function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name={icon} size={13} color={colors.inkTertiary} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: font.size.sm, color: colors.inkSecondary }}>{text}</Text>
    </View>
  );
}
