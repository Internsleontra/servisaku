import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getReviews, type ReviewsState } from '@/features/profile/mockApi';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton, StatusChip } from '@/components/kit';
import { ScreenHeader, Chip, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { font, radius, shadow, spacing } from '@/theme/tokens';

function Stars({ n, size = 15 }: { n: number; size?: number }) {
  return <View style={{ flexDirection: 'row', gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Ionicons key={i} name={i <= n ? 'star' : 'star-outline'} size={size} color="#f59e0b" />)}</View>;
}

export default function Reviews() {
  const { colors } = useTheme();
  const toast = useToast();
  const [data, setData] = useState<ReviewsState | null>(null);
  const [tab, setTab] = useState<'given' | 'pending'>('given');

  useEffect(() => { getReviews().then(setData); }, []);

  function del(id: string) {
    Alert.alert('Delete review?', 'This removes your review permanently.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { setData((d) => (d ? { ...d, given: d.given.filter((g) => g.id !== id) } : d)); toast.show('Review deleted', 'success'); } },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Reviews" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {!data ? (
          [0, 1, 2].map((i) => <Skeleton key={i} height={90} radius={16} />)
        ) : (
          <>
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, alignItems: 'center', gap: 4, ...shadow.e1 }}>
              <Text style={{ fontSize: 32, fontWeight: '800', color: colors.ink }}>{data.averageGiven.toFixed(1)}</Text>
              <Stars n={Math.round(data.averageGiven)} />
              <Text style={{ color: colors.inkTertiary, fontSize: font.size.xs }}>Your average rating given</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label={`Given (${data.given.length})`} active={tab === 'given'} onPress={() => setTab('given')} />
              <Chip label={`Pending (${data.pending.length})`} active={tab === 'pending'} onPress={() => setTab('pending')} />
            </View>

            {tab === 'given' ? (
              data.given.length ? data.given.map((g) => (
                <View key={g.id} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, gap: 8, ...shadow.e1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: colors.ink }}>{g.service}</Text><Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{g.partner} · {formatDate(g.date)}</Text></View>
                    {g.anonymous ? <StatusChip label="Anonymous" tone="neutral" /> : null}
                  </View>
                  <Stars n={g.rating} />
                  <Text style={{ color: colors.inkSecondary }}>{g.comment}</Text>
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 2 }}>
                    <Pressable onPress={() => toast.show('Edit review — coming soon', 'info')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="create-outline" size={15} color={colors.inkSecondary} /><Text style={{ color: colors.inkSecondary, fontWeight: '700', fontSize: font.size.sm }}>Edit</Text></Pressable>
                    <Pressable onPress={() => del(g.id)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="trash-outline" size={15} color={colors.danger} /><Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.size.sm }}>Delete</Text></Pressable>
                  </View>
                </View>
              )) : <EmptyState emoji="✍️" title="No reviews yet" subtitle="Reviews you write will appear here." />
            ) : (
              data.pending.length ? data.pending.map((p) => (
                <View key={p.bookingId} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, gap: 10, ...shadow.e1 }}>
                  <View><Text style={{ fontWeight: '700', color: colors.ink }}>{p.service}</Text><Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{p.partner} · {formatDate(p.date)} · {p.bookingId}</Text></View>
                  <Pressable onPress={() => router.push(`/review/${p.bookingId}`)} style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Write a review</Text>
                  </Pressable>
                </View>
              )) : <EmptyState emoji="🎉" title="All caught up" subtitle="No pending reviews." />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
