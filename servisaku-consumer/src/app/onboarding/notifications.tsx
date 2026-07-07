import { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { requestPushPermission, getPushToken } from '@/lib/notifications';
import { setOnboarded, setBiometricEnabled } from '@/lib/storage';
import { biometricAvailable } from '@/lib/biometric';
import { Screen, Button, Muted } from '@/components/ui';
import { colors, font, spacing } from '@/theme/tokens';

const PERKS = [
  ['📦', 'Booking updates', 'Confirmations and status changes'],
  ['🚗', 'Partner arrival', 'Know when your pro is on the way'],
  ['🎁', 'Offers & promos', 'Deals and coupons for you'],
];

export default function NotificationPermission() {
  const [busy, setBusy] = useState(false);

  async function finish() {
    await setOnboarded();
    if (Platform.OS !== 'web' && (await biometricAvailable())) {
      Alert.alert('Faster next time?', 'Use Face ID / fingerprint to unlock the app.', [
        { text: 'Not now', style: 'cancel', onPress: () => router.replace('/(tabs)') },
        { text: 'Enable', onPress: async () => { await setBiometricEnabled(true); router.replace('/(tabs)'); } },
      ]);
    } else {
      router.replace('/(tabs)');
    }
  }

  async function allow() {
    setBusy(true);
    try {
      const granted = await requestPushPermission();
      if (granted) await getPushToken(); // best-effort registration
    } finally {
      setBusy(false);
      await finish();
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen contentStyle={{ flexGrow: 1, gap: spacing.xl, paddingTop: 56, paddingHorizontal: 24 }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 48 }}>🔔</Text>
          </View>
          <Text style={{ fontSize: font.size['2xl'], fontWeight: '800', color: colors.ink, textAlign: 'center' }}>Enable notifications?</Text>
          <Muted style={{ textAlign: 'center', fontSize: font.size.base }}>Stay in the loop on your bookings.</Muted>
        </View>

        <View style={{ gap: 14 }}>
          {PERKS.map(([icon, title, sub]) => (
            <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Text style={{ fontSize: 26 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{title}</Text>
                <Text style={{ fontSize: font.size.sm, color: colors.inkTertiary }}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ gap: 12, marginTop: 'auto', paddingBottom: 12 }}>
          <Button label="Allow notifications" onPress={allow} loading={busy} size="lg" />
          <Button label="Maybe later" variant="ghost" onPress={finish} />
        </View>
      </Screen>
    </>
  );
}
