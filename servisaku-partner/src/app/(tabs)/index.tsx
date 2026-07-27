import { RefreshControl, ScrollView, Switch, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/context/auth';
import { useAdvanceJob } from '@/lib/useJobs';
import { useToast } from '@/components/toast';
import { JobCard } from '@/components/JobCard';
import { Skeleton } from '@/components/kit';
import { Muted } from '@/components/ui';
import { formatMYR, initials } from '@/lib/format';
import { colors, font, radius, shadow, spacing } from '@/theme/tokens';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { advance, busyId } = useAdvanceJob();

  const wallet = useQuery({ queryKey: ['wallet'], queryFn: api.wallet });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api.bookings(user!.email), enabled: !!user });
  const pool = useQuery({ queryKey: ['available-jobs'], queryFn: api.availableJobs });
  const avail = useQuery({ queryKey: ['availability'], queryFn: api.availability });
  const docs = useQuery({ queryKey: ['documents'], queryFn: api.documents });
  const notif = useQuery({ queryKey: ['notification-count'], queryFn: api.notificationCount, enabled: !!user });
  const unread = notif.data?.unread ?? 0;

  const online = avail.data?.online !== false;
  const today = todayISO();
  const assigned = (jobs.data ?? []).filter((j) => j.status !== 'pending');
  const todays = assigned.filter((j) => j.date === today && !['completed', 'cancelled'].includes(j.status));
  const requests = pool.data ?? [];
  const notVerified = docs.data ? !docs.data.activated : false;

  async function toggleOnline(v: boolean) {
    qc.setQueryData(['availability'], (old: typeof avail.data) => ({ ...(old ?? {}), online: v }));
    try { await api.updateAvailability({ online: v }); } catch { /* keep optimistic */ }
  }

  const refreshing = jobs.isFetching || pool.isFetching || wallet.isFetching;
  const onRefresh = () => { jobs.refetch(); pool.refetch(); wallet.refetch(); avail.refetch(); };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={{ backgroundColor: colors.brand, paddingTop: insets.top + 16, paddingHorizontal: spacing.lg, paddingBottom: 22, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: colors.brand }}>{initials(user?.fullName || user?.full_name || user?.email)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#ffedd5', fontSize: font.size.xs, fontWeight: '600' }}>Welcome back</Text>
            <Text style={{ color: colors.inkInverse, fontSize: font.size.lg, fontWeight: '800' }} numberOfLines={1}>{user?.fullName || user?.full_name || 'Partner'}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/notifications' as never)}
            hitSlop={8}
            accessibilityLabel="Notifications"
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="notifications-outline" size={20} color={colors.inkInverse} />
            {unread > 0 ? (
              <View style={{ position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.brand }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#fff', fontSize: font.size.xs, fontWeight: '700' }}>{online ? 'Online' : 'Offline'}</Text>
            <Switch value={online} onValueChange={toggleOnline} trackColor={{ true: '#fff', false: 'rgba(255,255,255,0.4)' }} thumbColor={online ? colors.brand : '#f4f4f5'} />
          </View>
        </View>

        {/* Earnings summary */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: 18, ...shadow.e2 }}>
          {[['Withdrawable', wallet.data?.withdrawable], ['Pending', wallet.data?.pending], ['Lifetime', wallet.data?.lifetime]].map(([l, v], i) => (
            <View key={String(l)} style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.hairline }}>
              {wallet.data ? <Text style={{ fontSize: font.size.base, fontWeight: '800', color: colors.ink }}>{formatMYR(Number(v) || 0)}</Text> : <Skeleton width={50} height={16} />}
              <Text style={{ fontSize: 10, color: colors.inkTertiary, marginTop: 2 }}>{l}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        {/* Verification banner */}
        {notVerified ? (
          <Pressable onPress={() => toast.show('Verification — coming soon', 'info')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.warningTint, borderWidth: 1, borderColor: '#fde68a', borderRadius: radius.lg, padding: spacing.md }}>
            <Ionicons name="shield-half-outline" size={22} color={colors.warning} />
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: colors.ink }}>Complete your verification</Text><Muted>Submit your documents to receive more jobs.</Muted></View>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </Pressable>
        ) : null}

        {/* New requests */}
        <View>
          <Text style={{ fontSize: font.size.lg, fontWeight: '800', color: colors.ink, marginBottom: 12 }}>New job requests {requests.length ? `(${requests.length})` : ''}</Text>
          {pool.isLoading ? <Skeleton height={120} radius={16} /> : requests.length ? (
            requests.slice(0, 5).map((b) => <JobCard key={b.id} b={b} onPrimary={advance} busy={busyId === b.id} />)
          ) : <Muted>No open jobs right now. Stay online to get matched.</Muted>}
        </View>

        {/* Today */}
        <View>
          <Text style={{ fontSize: font.size.lg, fontWeight: '800', color: colors.ink, marginBottom: 12 }}>Today&apos;s jobs</Text>
          {jobs.isLoading ? <Skeleton height={120} radius={16} /> : todays.length ? (
            todays.map((b) => <JobCard key={b.id} b={b} onPrimary={advance} busy={busyId === b.id} />)
          ) : <Muted>Nothing scheduled today.</Muted>}
        </View>

        {/* Quick links */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {([['calendar', 'Availability', '/partner/availability'], ['shield-checkmark', 'Verification', '/partner/verification'], ['star', 'Reviews', '/partner/reviews'], ['help-buoy', 'Support', '/partner/support']] as const).map(([ic, label, to]) => (
            <Pressable key={label} onPress={() => router.push(to as never)} style={{ width: '47.5%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: 14 }}>
              <Ionicons name={ic} size={20} color={colors.brand} />
              <Text style={{ fontWeight: '700', color: colors.ink }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
