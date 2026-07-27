import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/context/auth';
import { useToast } from '@/components/toast';
import { Skeleton, SectionCard } from '@/components/kit';
import { Title, Button, Muted } from '@/components/ui';
import { formatMYR, formatDay } from '@/lib/format';
import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

export default function Earnings() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const wallet = useQuery({ queryKey: ['wallet'], queryFn: api.wallet });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api.bookings(user!.email), enabled: !!user });
  const completed = (jobs.data ?? []).filter((j) => j.status === 'completed').slice(0, 12);
  const w = wallet.data;

  function withdraw() {
    if (!w || w.withdrawable <= 0) { toast.show('Nothing available to withdraw yet', 'info'); return; }
    Alert.alert('Withdraw earnings', `Transfer ${formatMYR(w.withdrawable)} to your bank account?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', onPress: async () => {
        try { await api.withdraw(w.withdrawable); await qc.invalidateQueries({ queryKey: ['wallet'] }); toast.show('Withdrawal requested', 'success'); }
        catch (e) { toast.show(e instanceof Error ? e.message : 'Could not withdraw', 'error'); }
      } },
    ]);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, gap: spacing.lg }}
      refreshControl={<RefreshControl refreshing={wallet.isFetching || jobs.isFetching} onRefresh={() => { wallet.refetch(); jobs.refetch(); }} tintColor={colors.brand} />}
      showsVerticalScrollIndicator={false}>
      <Title>Earnings</Title>

      {/* Balance card */}
      <View style={{ backgroundColor: colors.ink, borderRadius: radius.xl, padding: spacing.xl, ...shadow.e2 }}>
        <Text style={{ color: '#9ca3af', fontSize: font.size.sm, fontWeight: '700' }}>AVAILABLE TO WITHDRAW</Text>
        {w ? <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 4 }}>{formatMYR(w.withdrawable)}</Text> : <Skeleton width={140} height={34} style={{ marginTop: 6, backgroundColor: '#374151' }} />}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {[['Pending', w?.pending], ['Withdrawn', w?.withdrawn], ['Lifetime', w?.lifetime]].map(([l, v]) => (
            <View key={String(l)} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.md, padding: 10 }}>
              <Text style={{ color: '#9ca3af', fontSize: 10, fontWeight: '700' }}>{String(l).toUpperCase()}</Text>
              <Text style={{ color: '#fff', fontWeight: '800', marginTop: 2 }}>{w ? formatMYR(Number(v) || 0) : '—'}</Text>
            </View>
          ))}
        </View>
      </View>

      <Button label="Withdraw to bank" onPress={withdraw} size="lg" disabled={!w || w.withdrawable <= 0} />

      {/* Recent payouts */}
      <SectionCard title="Recent completed jobs">
        {jobs.isLoading ? (
          <View style={{ padding: spacing.lg }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={40} style={{ marginBottom: 8 }} />)}</View>
        ) : completed.length ? (
          <View>
            {completed.map((j, i) => (
              <View key={j.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}>
                <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontWeight: '700', color: colors.ink }}>{j.service_type}</Text><Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{formatDay(j.date)}</Text></View>
                <Text style={{ fontWeight: '800', color: colors.success }}>+{formatMYR(j.partner_payout ?? j.price)}</Text>
              </View>
            ))}
          </View>
        ) : <View style={{ padding: spacing.lg }}><Muted>No completed jobs yet.</Muted></View>}
      </SectionCard>
    </ScrollView>
  );
}
