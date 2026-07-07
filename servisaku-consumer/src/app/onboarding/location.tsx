import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { requestLocation } from '@/lib/location';
import { Screen, Button, Muted } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function LocationPermission() {
  const [busy, setBusy] = useState(false);

  async function allow() {
    setBusy(true);
    const geo = await requestLocation();
    setBusy(false);
    const params = geo
      ? { lat: String(geo.lat), lng: String(geo.lng), city: geo.city ?? '', state: geo.state ?? '', area: geo.area ?? '', postal: geo.postal ?? '', street: geo.street ?? '' }
      : {};
    router.replace({ pathname: '/onboarding/address', params } as never);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen contentStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: 28 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 48 }}>📍</Text>
        </View>
        <Text style={{ fontSize: font.size['2xl'], fontWeight: '800', color: colors.ink, textAlign: 'center' }}>Allow location access?</Text>
        <Muted style={{ textAlign: 'center', fontSize: font.size.base }}>
          We use your location to find nearby services, professionals, and to set up your service address faster.
        </Muted>
        <View style={{ width: '100%', gap: 12, marginTop: spacing.md }}>
          <Button label="Allow location" onPress={allow} loading={busy} size="lg" />
          <Button label="Not now" variant="ghost" onPress={() => router.replace('/onboarding/address' as never)} />
        </View>
      </Screen>
    </>
  );
}
