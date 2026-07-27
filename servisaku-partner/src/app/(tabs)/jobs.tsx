import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api, type Booking } from '@/api/client';
import { useAuth } from '@/context/auth';
import { useAdvanceJob } from '@/lib/useJobs';
import { JobCard } from '@/components/JobCard';
import { Skeleton } from '@/components/kit';
import { Chip, EmptyState, Title } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';

const today = () => new Date().toISOString().slice(0, 10);
const TABS = ['New', 'Today', 'Upcoming', 'Completed', 'Cancelled'];

export default function Jobs() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { advance, busyId } = useAdvanceJob();
  const [tab, setTab] = useState('New');

  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api.bookings(user!.email), enabled: !!user });
  const pool = useQuery({ queryKey: ['available-jobs'], queryFn: api.availableJobs });

  const list = useMemo<Booking[]>(() => {
    const assigned = (jobs.data ?? []).filter((j) => j.status !== 'pending');
    const t = today();
    switch (tab) {
      case 'New': return pool.data ?? [];
      case 'Today': return assigned.filter((j) => j.date === t && !['completed', 'cancelled'].includes(j.status));
      case 'Upcoming': return assigned.filter((j) => j.date > t && !['completed', 'cancelled'].includes(j.status));
      case 'Completed': return assigned.filter((j) => j.status === 'completed');
      case 'Cancelled': return assigned.filter((j) => ['cancelled', 'disputed'].includes(j.status));
      default: return [];
    }
  }, [jobs.data, pool.data, tab]);

  const loading = tab === 'New' ? pool.isLoading : jobs.isLoading;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm }}>
        <Title>Jobs</Title>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map((t) => <Chip key={t} label={t} active={tab === t} onPress={() => setTab(t)} />)}
        </ScrollView>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={jobs.isFetching || pool.isFetching} onRefresh={() => { jobs.refetch(); pool.refetch(); }} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}>
        {loading ? [0, 1, 2].map((i) => <Skeleton key={i} height={140} radius={16} style={{ marginBottom: spacing.md }} />)
          : list.length ? list.map((b) => <JobCard key={b.id} b={b} onPrimary={advance} busy={busyId === b.id} />)
            : <EmptyState emoji="📭" title={`No ${tab.toLowerCase()} jobs`} subtitle={tab === 'New' ? 'Stay online to get matched with jobs.' : 'Jobs will appear here.'} />}
      </ScrollView>
    </View>
  );
}
