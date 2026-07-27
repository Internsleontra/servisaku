import { Alert, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth';
import { useToast } from '@/components/toast';
import { ListItem, SectionCard } from '@/components/kit';
import { Card, Button, Muted } from '@/components/ui';
import { initials } from '@/lib/format';
import { colors, font, spacing } from '@/theme/tokens';

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function More() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const toast = useToast();
  const icon = (n: IoniconName) => <Ionicons name={n} size={20} color={colors.inkSecondary} />;
  const soon = (l: string) => toast.show(`${l} — coming soon`, 'info');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, gap: spacing.lg }}
      showsVerticalScrollIndicator={false}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.brand }}>{initials(user?.fullName || user?.full_name || user?.email)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.size.lg, fontWeight: '800', color: colors.ink }}>{user?.fullName || user?.full_name || 'Partner'}</Text>
          <Muted>{user?.email}</Muted>
          {user?.partnerRating ? <Muted>⭐ {user.partnerRating.toFixed(1)} rating</Muted> : null}
        </View>
      </Card>

      <SectionCard title="Work">
        <ListItem first icon={icon('calendar-outline')} label="Availability & schedule" onPress={() => router.push('/partner/availability' as never)} />
        <ListItem icon={icon('shield-checkmark-outline')} label="Verification & documents" onPress={() => router.push('/partner/verification' as never)} />
        <ListItem icon={icon('cube-outline')} label="Inventory" onPress={() => soon('Inventory')} />
        <ListItem icon={icon('bar-chart-outline')} label="Analytics" onPress={() => soon('Analytics')} />
      </SectionCard>

      <SectionCard title="Growth">
        <ListItem first icon={icon('school-outline')} label="Training center" onPress={() => soon('Training')} />
        <ListItem icon={icon('star-outline')} label="My reviews" onPress={() => router.push('/partner/reviews' as never)} />
        <ListItem icon={icon('document-text-outline')} label="Onboarding profile" onPress={() => soon('Onboarding')} />
      </SectionCard>

      <SectionCard title="Account">
        <ListItem first icon={icon('person-outline')} label="Edit profile" onPress={() => soon('Edit profile')} />
        <ListItem icon={icon('help-buoy-outline')} label="Support" onPress={() => router.push('/partner/support' as never)} />
      </SectionCard>

      <Button
        label="Log out"
        variant="outline"
        onPress={() => Alert.alert('Log out', 'Sign out of ServisAku Partner?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log out', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
        ])}
      />
      <Muted style={{ textAlign: 'center' }}>ServisAku Partner · v1.0.0</Muted>
    </ScrollView>
  );
}
