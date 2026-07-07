import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getLoyalty, TIER_ORDER } from '@/features/profile/mockApi';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton, SectionCard, ProgressBar } from '@/components/kit';
import { ScreenHeader, Button } from '@/components/ui';
import { tierColors, font, radius, shadow, spacing } from '@/theme/tokens';

export default function Loyalty() {
  const { colors } = useTheme();
  const toast = useToast();
  const q = useQuery({ queryKey: ['loyalty'], queryFn: getLoyalty });
  const l = q.data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Loyalty & rewards" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {!l ? <Skeleton height={130} radius={20} /> : (
          <View style={{ backgroundColor: tierColors[l.tier].bg, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.hairline }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="medal" size={22} color={tierColors[l.tier].fg} />
                <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: tierColors[l.tier].fg }}>{l.tier}</Text>
              </View>
              <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.ink }}>{l.points.toLocaleString()} pts</Text>
            </View>
            {l.nextTier ? (
              <View style={{ marginTop: 14, gap: 6 }}>
                <ProgressBar value={l.points / (l.points + l.pointsToNext)} tint={tierColors[l.tier].fg} />
                <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary }}>{l.pointsToNext} pts to {l.nextTier}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Tier ladder */}
        <SectionCard title="Tier ladder">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg }}>
            {TIER_ORDER.map((t) => {
              const reached = l ? TIER_ORDER.indexOf(t) <= TIER_ORDER.indexOf(l.tier) : false;
              return (
                <View key={t} style={{ alignItems: 'center', gap: 4, opacity: reached ? 1 : 0.4 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tierColors[t].bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="medal" size={17} color={tierColors[t].fg} />
                  </View>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: colors.inkSecondary }}>{t}</Text>
                </View>
              );
            })}
          </View>
        </SectionCard>

        {/* Rewards catalog */}
        <SectionCard title="Redeem points">
          <View>
            {(l?.rewards ?? []).map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.ink }}>{r.title}</Text>
                  <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{r.desc}</Text>
                </View>
                <Button
                  label={`${r.points} pts`}
                  size="sm"
                  variant={l && l.points >= r.points ? 'primary' : 'outline'}
                  disabled={!l || l.points < r.points}
                  onPress={() => toast.show(`Redeemed: ${r.title}`, 'success')}
                />
              </View>
            ))}
            {!l ? <View style={{ padding: spacing.lg }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={40} style={{ marginBottom: 8 }} />)}</View> : null}
          </View>
        </SectionCard>

        {/* Achievements */}
        <SectionCard title="Achievements">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: spacing.lg }}>
            {(l?.achievements ?? []).map((a) => (
              <View key={a.id} style={{ width: '30%', alignItems: 'center', gap: 4, opacity: a.unlocked ? 1 : 0.35 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>{a.icon}</Text>
                </View>
                <Text style={{ fontSize: 10, textAlign: 'center', color: colors.inkSecondary, fontWeight: '600' }}>{a.title}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        {/* Redemption history */}
        {l?.redemptions?.length ? (
          <SectionCard title="Redemption history">
            <View>
              {l.redemptions.map((x, i) => (
                <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}>
                  <View><Text style={{ fontWeight: '600', color: colors.ink }}>{x.title}</Text><Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{x.date}</Text></View>
                  <Text style={{ fontWeight: '700', color: colors.danger }}>−{x.points} pts</Text>
                </View>
              ))}
            </View>
          </SectionCard>
        ) : null}
      </ScrollView>
    </View>
  );
}
