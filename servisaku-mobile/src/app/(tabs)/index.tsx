import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth';
import { api, type Wallet, type Booking } from '@/api/client';
import { colors, radius, font, shadow } from '@/theme/tokens';

const payoutOf = (b: Booking) => b.partner_payout ?? Math.round((b.price ?? 0) * 0.8);

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [w, b] = await Promise.all([
      api.wallet().catch(() => null),
      api.bookings(user.email).catch(() => [] as Booking[]),
    ]);
    setWallet(w);
    setJobs(b);
  }, [user]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const todayJobs = jobs.filter((j) => j.date?.slice(0, 10) === today && j.status !== 'pending');
  const activeJobs = jobs.filter((j) => !['completed', 'cancelled', 'pending'].includes(j.status));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}>
      {/* Header */}
      <View style={{ backgroundColor: colors.brand, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 28 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: font.size.xs }}>Partner Dashboard</Text>
            <Text style={{ color: '#fff', fontSize: font.size.xl, fontWeight: '700' }}>
              {user?.full_name?.split(' ')[0] ?? 'Partner'}
            </Text>
          </View>
          <Pressable onPress={() => setOnline((o) => !o)}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.md, backgroundColor: online ? '#fff' : 'rgba(255,255,255,0.15)' }}>
            <Text style={{ fontWeight: '700', fontSize: font.size.sm, color: online ? colors.brand : 'rgba(255,255,255,0.6)' }}>
              {online ? 'Online' : 'Offline'}
            </Text>
          </Pressable>
        </View>

        <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.lg, padding: 20 }}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: font.size.xs, marginBottom: 4 }}>Available to withdraw</Text>
          <Text style={{ color: '#fff', fontSize: font.size['3xl'], fontWeight: '800' }}>RM {wallet?.withdrawable ?? 0}</Text>
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 16 }}>
            <Stat label="Pending" value={`RM ${wallet?.pending ?? 0}`} />
            <Stat label="Lifetime" value={`RM ${wallet?.lifetime ?? 0}`} />
            <Stat label="Today" value={String(todayJobs.length)} />
          </View>
        </View>
      </View>

      {/* Jobs */}
      <View style={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: font.size.base, fontWeight: '700', color: colors.ink }}>Active jobs</Text>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : activeJobs.length === 0 ? (
          <View style={[card, { alignItems: 'center', paddingVertical: 36 }]}>
            <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>No active jobs right now</Text>
          </View>
        ) : (
          activeJobs.map((j) => (
            <Pressable key={j.id} onPress={() => router.push(`/job/${j.id}`)} style={({ pressed }) => [card, pressed && { opacity: 0.7 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.size.sm, fontWeight: '700', color: colors.ink }}>{j.service_type}</Text>
                  <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary, marginTop: 2 }}>{j.consumer_name ?? 'Customer'}</Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brandTint, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.brandInk }}>{j.status.replace('_', ' ')}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary }}>{j.date?.slice(0, 10)} · {j.time_slot ?? ''}</Text>
                <Text style={{ fontSize: font.size.base, fontWeight: '700', color: colors.brand }}>RM {payoutOf(j)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: font.size.base }}>{value}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const card = {
  backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
  borderWidth: 1, borderColor: colors.hairline, ...shadow.e1,
};
