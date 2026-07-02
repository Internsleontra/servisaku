import { RefreshControl, ScrollView, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AppNotification } from '@/api/client';
import { useAuth } from '@/context/auth';
import { ScreenHeader, Loading, EmptyState, Button } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function Notifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: api.notifications,
    enabled: !!user,
  });

  async function open(n: AppNotification) {
    if (!n.is_read) {
      try { await api.markNotificationRead(n.id); await qc.invalidateQueries({ queryKey: ['notifications'] }); } catch { /* ignore */ }
    }
    if (n.link) router.push(n.link as never);
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Notifications" />
        <EmptyState emoji="🔔" title="Sign in to see notifications" action={<Button label="Sign in" onPress={() => router.push('/login')} />} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Notifications" />
      {q.isLoading ? (
        <Loading />
      ) : (q.data ?? []).length ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: 10 }}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brand} />}
          showsVerticalScrollIndicator={false}>
          {(q.data ?? []).map((n) => (
            <Pressable key={n.id} onPress={() => open(n)}
              style={{
                flexDirection: 'row', gap: 12, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline,
                backgroundColor: n.is_read ? colors.surface : colors.brandTint,
              }}>
              <Text style={{ fontSize: 20 }}>{n.is_read ? '🔔' : '🟠'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{n.title}</Text>
                {n.body ? <Text style={{ color: colors.inkSecondary, fontSize: font.size.sm, marginTop: 2 }}>{n.body}</Text> : null}
                <Text style={{ color: colors.inkTertiary, fontSize: 11, marginTop: 4 }}>{relativeTime(n.created_date)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <EmptyState emoji="🔔" title="No notifications yet" subtitle="Booking updates and offers will show up here." />
      )}
    </View>
  );
}
