import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/context/auth';
import { BookingCard } from '@/components/cards';
import { Chip, Loading, EmptyState, Title, Button } from '@/components/ui';
import { router } from 'expo-router';
import { colors, spacing } from '@/theme/tokens';

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'active', label: 'Active', statuses: ['pending', 'assigned', 'accepted', 'en_route', 'arrived', 'started'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'disputed'] },
];

export default function Bookings() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState('active');

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
        <Loading />
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
