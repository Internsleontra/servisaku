import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getWallet, type TxnType } from '@/features/profile/mockApi';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton, StatusChip } from '@/components/kit';
import { ScreenHeader, Chip, EmptyState } from '@/components/ui';
import { formatMYR, formatDay } from '@/lib/format';
import { font, radius, shadow, spacing } from '@/theme/tokens';

const FILTERS: { key: 'all' | TxnType; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'credit', label: 'Credit' }, { key: 'debit', label: 'Debit' },
  { key: 'refund', label: 'Refund' }, { key: 'reward', label: 'Reward' }, { key: 'cashback', label: 'Cashback' },
];
const TXN_ICON: Record<TxnType, keyof typeof Ionicons.glyphMap> = {
  credit: 'arrow-down-circle', debit: 'arrow-up-circle', refund: 'refresh-circle', reward: 'medal', cashback: 'cash',
};

export default function Wallet() {
  const { colors } = useTheme();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | TxnType>('all');
  const q = useQuery({ queryKey: ['wallet'], queryFn: getWallet });

  const txns = useMemo(() => {
    const list = q.data?.transactions ?? [];
    return filter === 'all' ? list : list.filter((t) => t.type === filter);
  }, [q.data, filter]);

  const s = q.data?.summary;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Wallet" right={<Ionicons name="download-outline" size={20} color={colors.brand} onPress={() => toast.show('Statement export — coming soon', 'info')} />} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Balance card */}
        <View style={{ backgroundColor: colors.ink, borderRadius: radius.xl, padding: spacing.xl, ...shadow.e2 }}>
          <Text style={{ color: '#9ca3af', fontSize: font.size.sm, fontWeight: '700' }}>WALLET BALANCE</Text>
          {s ? <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 4 }}>{formatMYR(s.balance)}</Text> : <Skeleton width={140} height={34} style={{ marginTop: 6, backgroundColor: '#374151' }} />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            {s ? [
              ['⭐', `${s.points.toLocaleString()} pts`], ['💵', `${formatMYR(s.cashback)} cashback`],
              ['🎁', `${formatMYR(s.referralEarnings)} referral`], ['🎫', `${formatMYR(s.giftCard)} gift`],
            ].map(([i, l]) => (
              <View key={l} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: '#fff', fontSize: font.size.xs, fontWeight: '700' }}>{i} {l}</Text>
              </View>
            )) : <Skeleton width="80%" height={26} style={{ backgroundColor: '#374151' }} />}
          </View>
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />)}
        </ScrollView>

        {/* Transactions */}
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: font.size.xs, fontWeight: '800', color: colors.inkTertiary, letterSpacing: 0.6, marginBottom: 6 }}>TRANSACTIONS</Text>
          {q.isLoading ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={54} radius={12} style={{ marginBottom: 8 }} />)
          ) : txns.length ? (
            txns.map((t) => {
              const positive = t.amount >= 0;
              return (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, padding: 12, marginBottom: 8 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: positive ? colors.successTint : colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={TXN_ICON[t.type]} size={19} color={positive ? colors.success : colors.inkSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.ink }} numberOfLines={1}>{t.description}</Text>
                    <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{formatDay(t.date)}{t.bookingRef ? ` · ${t.bookingRef}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={{ fontWeight: '800', color: positive ? colors.success : colors.ink }}>{positive ? '+' : '−'}{formatMYR(Math.abs(t.amount))}</Text>
                    {t.status !== 'completed' ? <StatusChip label={t.status} tone={t.status === 'pending' ? 'warning' : 'danger'} /> : null}
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState emoji="🧾" title="No transactions" subtitle="Your wallet activity will appear here." />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
