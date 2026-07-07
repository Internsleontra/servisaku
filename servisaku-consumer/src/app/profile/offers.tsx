import { useMemo, useState } from 'react';
import { ScrollView, Share, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getCoupons, type CouponTab } from '@/features/profile/mockApi';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton } from '@/components/kit';
import { ScreenHeader, Chip, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { font, radius, shadow, spacing } from '@/theme/tokens';

const TABS: { key: CouponTab; label: string }[] = [
  { key: 'active', label: 'Active' }, { key: 'personalized', label: 'For you' }, { key: 'cashback', label: 'Cashback' },
  { key: 'seasonal', label: 'Seasonal' }, { key: 'referral', label: 'Referral' }, { key: 'expired', label: 'Expired' },
];

function daysLeft(iso: string) {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return d;
}

export default function Offers() {
  const { colors } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<CouponTab>('active');
  const q = useQuery({ queryKey: ['coupons'], queryFn: getCoupons });

  const list = useMemo(() => (q.data ?? []).filter((c) => c.tab === tab), [q.data, tab]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Offers & coupons" />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
          {TABS.map((t) => <Chip key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {q.isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} height={120} radius={16} style={{ marginBottom: 4 }} />)
        ) : list.length ? (
          list.map((c) => {
            const dl = daysLeft(c.expiry);
            const expired = dl < 0;
            return (
              <View key={c.id} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden', ...shadow.e1 }}>
                <View style={{ backgroundColor: expired ? colors.raised : colors.brandTint, paddingHorizontal: spacing.lg, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '800', color: expired ? colors.inkSecondary : colors.brand, letterSpacing: 1 }}>{c.code}</Text>
                  <Text style={{ fontSize: font.size.xs, color: expired ? colors.inkTertiary : colors.brandInk }}>{expired ? 'Expired' : dl <= 7 ? `${dl}d left` : `Until ${formatDate(c.expiry)}`}</Text>
                </View>
                <View style={{ padding: spacing.lg, gap: 6 }}>
                  <Text style={{ fontWeight: '700', color: colors.ink, fontSize: font.size.base }}>{c.title}</Text>
                  <Text style={{ color: colors.brand, fontWeight: '700' }}>{c.discount}</Text>
                  <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>
                    {c.minOrder > 0 ? `Min. spend RM${c.minOrder} · ` : ''}Valid on {c.categories.join(', ')}
                  </Text>
                  {!expired ? (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                      <Pressable onPress={() => toast.show(`${c.code} copied & applied`, 'success')} style={{ flex: 1, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Apply</Text>
                      </Pressable>
                      <Pressable onPress={() => Share.share({ message: `Use my ServisAku code ${c.code} — ${c.title}` }).catch(() => {})} style={{ width: 48, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="share-social-outline" size={18} color={colors.ink} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState emoji="🎟️" title="No offers here" subtitle="Check the other tabs for available coupons." />
        )}
      </ScrollView>
    </View>
  );
}
