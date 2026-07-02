import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ScreenHeader, Loading, Card, Button, Input, Field, Chip, Muted } from '@/components/ui';
import { colors, font, spacing } from '@/theme/tokens';

const TAGS = ['Punctual', 'Professional', 'Friendly', 'Great value', 'Thorough', 'Clean work', 'Would rebook'];

export default function ReviewFlow() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { data: b, isLoading } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api.booking(String(bookingId)),
    enabled: !!bookingId,
  });

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  async function submit() {
    if (rating < 1) { Alert.alert('Add a rating', 'Please tap the stars to rate.'); return; }
    setSubmitting(true);
    try {
      await api.createReview({ booking_id: String(bookingId), rating, comment: comment.trim() || undefined, tags });
      Alert.alert('Thank you!', 'Your review has been submitted.', [{ text: 'Done', onPress: () => router.replace('/(tabs)/bookings') }]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not submit review');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScreenHeader title="Rate service" /><Loading /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Rate your service" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
        <Card style={{ alignItems: 'center', gap: 12 }}>
          <Text style={{ fontWeight: '700', color: colors.ink, fontSize: font.size.lg }}>{b?.service_type ?? 'Your service'}</Text>
          {b?.partner_name ? <Muted>with {b.partner_name}</Muted> : null}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                <Text style={{ fontSize: 40, opacity: n <= rating ? 1 : 0.25 }}>⭐</Text>
              </Pressable>
            ))}
          </View>
          <Muted>{['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][rating]}</Muted>
        </Card>

        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>What went well?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TAGS.map((t) => <Chip key={t} label={t} active={tags.includes(t)} onPress={() => toggleTag(t)} />)}
          </View>
        </View>

        <Field label="Add a comment (optional)">
          <Input value={comment} onChangeText={setComment} placeholder="Tell others about your experience…" multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
        </Field>

        <Button label="Submit review" onPress={submit} loading={submitting} size="lg" />
      </ScrollView>
    </View>
  );
}
