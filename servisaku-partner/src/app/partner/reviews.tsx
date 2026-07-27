import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PartnerReview } from '@/api/client';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton } from '@/components/kit';
import { ScreenHeader, Button, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { font, radius, shadow, spacing } from '@/theme/tokens';

function Stars({ n, size = 15 }: { n: number; size?: number }) {
  return <View style={{ flexDirection: 'row', gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Ionicons key={i} name={i <= Math.round(n) ? 'star' : 'star-outline'} size={size} color="#f59e0b" />)}</View>;
}

export default function Reviews() {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['partner-reviews'], queryFn: api.reviews });
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const reviews = q.data ?? [];
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ star: s, count: reviews.filter((r) => Math.round(r.rating) === s).length }));

  async function sendReply(r: PartnerReview) {
    if (!text.trim()) return;
    setBusy(true);
    try { await api.replyReview(r.id, text.trim()); await qc.invalidateQueries({ queryKey: ['partner-reviews'] }); setReplyingId(null); setText(''); toast.show('Reply posted', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : 'Could not reply', 'error'); } finally { setBusy(false); }
  }
  function report(r: PartnerReview) {
    Alert.prompt?.('Report review', 'Why are you reporting this review?', async (reason) => {
      if (!reason) return;
      try { await api.reportReview(r.id, reason); await qc.invalidateQueries({ queryKey: ['partner-reviews'] }); toast.show('Reported to our team', 'success'); }
      catch (e) { toast.show(e instanceof Error ? e.message : 'Could not report', 'error'); }
    });
    // Android has no Alert.prompt — fall back to reporting a generic reason.
    if (!Alert.prompt) {
      api.reportReview(r.id, 'Reported from mobile').then(() => { qc.invalidateQueries({ queryKey: ['partner-reviews'] }); toast.show('Reported to our team', 'success'); }).catch(() => {});
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Customer reviews" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, flexDirection: 'row', gap: 18, ...shadow.e1 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 34, fontWeight: '800', color: colors.ink }}>{avg.toFixed(1)}</Text>
            <Stars n={avg} size={13} />
            <Text style={{ fontSize: 10, color: colors.inkTertiary, marginTop: 2 }}>{reviews.length} reviews</Text>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
            {dist.map((d) => (
              <View key={d.star} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 10, color: colors.inkTertiary, width: 8 }}>{d.star}</Text>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.raised, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${reviews.length ? (d.count / reviews.length) * 100 : 0}%`, backgroundColor: '#f59e0b' }} />
                </View>
                <Text style={{ fontSize: 10, color: colors.inkTertiary, width: 14, textAlign: 'right' }}>{d.count}</Text>
              </View>
            ))}
          </View>
        </View>

        {q.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} height={90} radius={16} />)
          : reviews.length ? reviews.map((r) => (
            <View key={r.id} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, gap: 8, ...shadow.e1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: colors.ink }}>{r.reviewer_name || 'Customer'}</Text><Text style={{ fontSize: font.size.xs, color: colors.inkTertiary }}>{r.service_type}{r.created_date ? ` · ${formatDate(r.created_date)}` : ''}</Text></View>
                <Stars n={r.rating} />
              </View>
              {r.comment ? <Text style={{ color: colors.inkSecondary }}>{r.comment}</Text> : null}

              {r.reply ? (
                <View style={{ backgroundColor: colors.raised, borderRadius: radius.md, padding: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.brand, marginBottom: 2 }}>YOUR REPLY</Text>
                  <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>{r.reply}</Text>
                </View>
              ) : replyingId === r.id ? (
                <View style={{ gap: 8 }}>
                  <TextInput value={text} onChangeText={setText} multiline placeholder="Thank the customer or address their feedback…" placeholderTextColor={colors.inkTertiary}
                    style={{ borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, padding: 10, minHeight: 60, color: colors.ink, textAlignVertical: 'top' }} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button label="Post reply" size="sm" loading={busy} onPress={() => sendReply(r)} style={{ flex: 1 }} />
                    <Button label="Cancel" size="sm" variant="outline" onPress={() => { setReplyingId(null); setText(''); }} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Pressable onPress={() => { setReplyingId(r.id); setText(''); }} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.brand} /><Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>Reply</Text></Pressable>
                  {r.reported ? <Text style={{ color: colors.inkTertiary, fontSize: font.size.sm, fontWeight: '600' }}>✓ Reported</Text>
                    : <Pressable onPress={() => report(r)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="flag-outline" size={15} color={colors.inkTertiary} /><Text style={{ color: colors.inkTertiary, fontWeight: '600', fontSize: font.size.sm }}>Report</Text></Pressable>}
                </View>
              )}
            </View>
          )) : <EmptyState emoji="⭐" title="No reviews yet" subtitle="Complete jobs to start receiving customer feedback." />}
      </ScrollView>
    </View>
  );
}
