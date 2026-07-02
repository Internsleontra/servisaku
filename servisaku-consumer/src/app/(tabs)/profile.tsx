import { ScrollView, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/context/auth';
import { Card, Button, EmptyState, Muted } from '@/components/ui';
import { initials } from '@/lib/format';
import { colors, font, radius, spacing } from '@/theme/tokens';

const LINKS: { icon: string; label: string; href: string }[] = [
  { icon: '👤', label: 'Edit profile', href: '/profile/edit' },
  { icon: '🔔', label: 'Notifications', href: '/notifications' },
  { icon: '🎁', label: 'Promotions', href: '/promotions' },
  { icon: 'ℹ️', label: 'How it works', href: '/how-it-works' },
  { icon: '💼', label: 'For business', href: '/for-business' },
  { icon: '❓', label: 'Help & support', href: '/help' },
];

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <EmptyState
          emoji="👤"
          title="Welcome to ServisAku"
          subtitle="Sign in to manage your bookings, payments and profile."
          action={<Button label="Sign in / Register" onPress={() => router.push('/login')} />}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, gap: spacing.lg }}
      showsVerticalScrollIndicator={false}>
      {/* Identity */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.brand }}>{initials(user.full_name || user.email)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.size.lg, fontWeight: '700', color: colors.ink }}>{user.full_name ?? 'ServisAku user'}</Text>
          <Muted>{user.email}</Muted>
          {user.city ? <Muted>{user.city}</Muted> : null}
        </View>
      </Card>

      {/* Links */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden' }}>
        {LINKS.map((l, i) => (
          <Pressable
            key={l.href}
            onPress={() => router.push(l.href as never)}
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 15 },
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.hairline },
              pressed && { backgroundColor: colors.raised },
            ]}>
            <Text style={{ fontSize: 18 }}>{l.icon}</Text>
            <Text style={{ flex: 1, fontSize: font.size.base, fontWeight: '600', color: colors.ink }}>{l.label}</Text>
            <Text style={{ color: colors.inkTertiary, fontSize: 18 }}>›</Text>
          </Pressable>
        ))}
      </View>

      <Button label="Log out" variant="outline" onPress={async () => { await logout(); router.replace('/(tabs)'); }} />
      <Muted style={{ textAlign: 'center' }}>ServisAku · v1.0.0</Muted>
    </ScrollView>
  );
}
