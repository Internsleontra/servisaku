import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ChatMessage } from '@/api/client';
import { useAuth } from '@/context/auth';
import { ScreenHeader, Loading } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function Chat() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ['chat', bookingId],
    queryFn: () => api.chat(String(bookingId)),
    enabled: !!bookingId,
    refetchInterval: 5_000, // poll (no websockets yet)
  });

  useEffect(() => {
    if (messages?.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages?.length]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText('');
    setSending(true);
    try {
      await api.sendChat(String(bookingId), body);
      await qc.invalidateQueries({ queryKey: ['chat', bookingId] });
    } catch {
      setText(body); // restore on failure
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }} keyboardVerticalOffset={0}>
      <ScreenHeader title="Chat with your pro" />
      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          ref={listRef}
          data={messages ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, gap: 8 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.inkTertiary, marginTop: 40 }}>Say hello 👋 Messages appear here.</Text>}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <View style={{
                  maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.lg,
                  backgroundColor: mine ? colors.brand : colors.surface,
                  borderWidth: mine ? 0 : 1, borderColor: colors.hairline,
                  borderBottomRightRadius: mine ? 4 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 4,
                }}>
                  {!mine && item.sender_name ? <Text style={{ fontSize: font.size.xs, fontWeight: '700', color: colors.brand, marginBottom: 2 }}>{item.sender_name}</Text> : null}
                  <Text style={{ color: mine ? colors.inkInverse : colors.ink, fontSize: font.size.base }}>{item.message}</Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.inkTertiary, marginTop: 2 }}>{relativeTime(item.created_date)}</Text>
              </View>
            );
          }}
        />
      )}

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type a message…"
          placeholderTextColor={colors.inkTertiary}
          multiline
          style={{ flex: 1, maxHeight: 100, backgroundColor: colors.raised, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, color: colors.ink, fontSize: font.size.base }}
        />
        <Pressable onPress={send} disabled={sending || !text.trim()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.brand : colors.hairline, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: colors.inkInverse }}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
