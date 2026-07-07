import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useAuth } from '@/context/auth';
import { getLanguage, getOnboarded, getBiometricEnabled } from '@/lib/storage';
import { authenticateBiometric } from '@/lib/biometric';
import { LOGO_IMAGE } from '@/lib/images';
import { colors, font } from '@/theme/tokens';

// Splash + gate. Runs the boot checks, then routes to language → welcome → tabs.
export default function Splash() {
  const { user, loading } = useAuth();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const language = await getLanguage();
      if (!language) { router.replace('/onboarding/language' as never); return; }

      const onboarded = await getOnboarded();
      if (!user && !onboarded) { router.replace('/onboarding/welcome' as never); return; }

      // Biometric unlock for returning signed-in users (native only).
      if (user && Platform.OS !== 'web' && (await getBiometricEnabled())) {
        setLocked(true);
        const ok = await authenticateBiometric('Unlock ServisAku');
        if (ok) router.replace('/(tabs)');
        return;
      }
      router.replace('/(tabs)');
    })();
  }, [loading, user]);

  async function retryUnlock() {
    if (await authenticateBiometric('Unlock ServisAku')) router.replace('/(tabs)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Image source={LOGO_IMAGE} style={{ width: 200, height: 50 }} contentFit="contain" />
      {locked ? (
        <Pressable onPress={retryUnlock} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>🔓 Unlock</Text>
        </Pressable>
      ) : (
        <ActivityIndicator color={colors.brand} />
      )}
      <Text style={{ position: 'absolute', bottom: 40, color: colors.inkTertiary, fontSize: font.size.xs }}>Home services, on demand</Text>
    </View>
  );
}
