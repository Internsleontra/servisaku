import { Alert, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getMembership } from '@/features/profile/mockApi';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton, SectionCard } from '@/components/kit';
import { ScreenHeader, Button } from '@/components/ui';
import { formatMYR, formatDate } from '@/lib/format';
import { font, radius, shadow, spacing } from '@/theme/tokens';

export default function Membership() {
  const { colors } = useTheme();
  const toast = useToast();
  const q = useQuery({ queryKey: ['membership'], queryFn: getMembership });
  const m = q.data;

  function cancel() {
    Alert.alert('Cancel membership?', 'You keep benefits until the end of the current period. This cannot be undone.', [
      { text: 'Keep membership', style: 'cancel' },
      { text: 'Cancel', style: 'destructive', onPress: () => toast.show('Membership will end at period close', 'info') },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Membership" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {!m ? <Skeleton height={150} radius={20} /> : (
          <View style={{ backgroundColor: colors.brand, borderRadius: radius.xl, padding: spacing.xl, ...shadow.e2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="ribbon" size={22} color="#fff" />
              <Text style={{ color: '#fff', fontSize: font.size.xl, fontWeight: '800' }}>{m.plan}</Text>
            </View>
            <Text style={{ color: '#ffedd5', marginTop: 4 }}>{formatMYR(m.price)}/month · renews {formatDate(m.renewsOn)}</Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.lg, padding: 14, marginTop: 16 }}>
              <Text style={{ color: '#ffedd5', fontSize: font.size.xs, fontWeight: '700' }}>LIFETIME SAVINGS</Text>
              <Text style={{ color: '#fff', fontSize: font.size['2xl'], fontWeight: '800' }}>{formatMYR(m.lifetimeSavings)}</Text>
            </View>
          </View>
        )}

        {m ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[['Free cancels', m.stats.freeCancellationsLeft], ['Priority used', m.stats.priorityUsed], ['Discounts', m.stats.exclusiveDiscounts]].map(([l, v]) => (
                <View key={String(l)} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: 14, alignItems: 'center' }}>
                  <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.ink }}>{v}</Text>
                  <Text style={{ fontSize: 10, color: colors.inkTertiary, textAlign: 'center', marginTop: 2 }}>{l}</Text>
                </View>
              ))}
            </View>

            <SectionCard title="Your benefits">
              <View style={{ padding: spacing.lg, gap: 12 }}>
                {m.benefits.map((b) => (
                  <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={{ color: colors.ink, flex: 1 }}>{b}</Text>
                  </View>
                ))}
              </View>
            </SectionCard>

            <SectionCard title="Billing history">
              <View>
                {m.history.map((h, i) => (
                  <View key={h.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}>
                    <View><Text style={{ fontWeight: '600', color: colors.ink }}>{h.plan}</Text><Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{h.date}</Text></View>
                    <Text style={{ fontWeight: '700', color: colors.ink }}>{formatMYR(h.amount)}</Text>
                  </View>
                ))}
              </View>
            </SectionCard>

            <Button label="Renew now" onPress={() => toast.show('Renewal — coming soon', 'info')} size="lg" />
            <Button label="Cancel membership" variant="outline" onPress={cancel} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
