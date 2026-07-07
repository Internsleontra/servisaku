import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/context/auth';
import { BookingCard } from '@/components/cards';
import { Skeleton } from '@/components/kit';
import { Chip, EmptyState, Title, Button } from '@/components/ui';
import { router } from 'expo-router';
import { colors, radius, spacing } from '@/theme/tokens';

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'upcoming', label: 'Upcoming', statuses: ['pending', 'assigned', 'accepted'] },
  { key: 'ongoing', label: 'Ongoing', statuses: ['en_route', 'arrived', 'started'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'disputed'] },
];

function BookingSkeleton() {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.md, marginBottom: spacing.md, flexDirection: 'row', gap: 12 }}>
      <Skeleton width={56} height={56} radius={12} />
      <View style={{ flex: 1, gap: 8, paddingVertical: 2 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} />
        <Skeleton width="55%" height={11} />
      </View>
    </View>
  );
}

export default function Bookings() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState('upcoming');

  const q = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api.bookings('?_orderBy=-date&_limit=100'),
    enabled: !!user,
  });

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <EmptyState
          emoji="📋"
          title="Sign in to see your bookings"
          subtitle="Track your appointments, chat with your pro, and manage payments."
          action={<Button label="Sign in" onPress={() => router.push('/login')} />}
        />
      </View>
    );
  }

  const current = TABS.find((t) => t.key === tab)!;
  const list = (q.data ?? []).filter((b) => current.statuses.includes(b.status));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm }}>
        <Title>My bookings</Title>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map((t) => <Chip key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />)}
        </ScrollView>
      </View>

      {q.isLoading ? (
        <View style={{ padding: spacing.lg }}>{[0, 1, 2].map((i) => <BookingSkeleton key={i} />)}</View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brand} />}
          showsVerticalScrollIndicator={false}>
          {list.length ? (
            list.map((b) => <BookingCard key={b.id} booking={b} />)
          ) : (
            <EmptyState
              emoji="🗓️"
              title={`No ${current.label.toLowerCase()} bookings`}
              subtitle="Book a service to get started."
              action={<Button label="Browse services" onPress={() => router.push('/(tabs)/explore')} />}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}
