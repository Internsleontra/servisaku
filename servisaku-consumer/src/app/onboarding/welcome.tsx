import { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useAuth } from '@/context/auth';
import { auth, isFirebaseConfigured } from '@/config/firebase';
import { setOnboarded } from '@/lib/storage';
import { HERO_IMAGE, LOGO_IMAGE } from '@/lib/images';
import { Screen, Button, Muted } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function Welcome() {
  const { loginWithFirebase } = useAuth();
  const [busy, setBusy] = useState(false);

  async function finishAndEnter() {
    await setOnboarded();
    router.replace('/(tabs)');
  }

  async function google() {
    if (Platform.OS !== 'web' || !isFirebaseConfigured) {
      Alert.alert('Not available here', 'Google sign-in runs in the web app for now. Use your phone number.');
      return;
    }
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const token = await cred.user.getIdToken();
      await loginWithFirebase(token);
      await finishAndEnter();
    } catch (e) {
      Alert.alert('Google sign-in failed', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen contentStyle={{ flexGrow: 1, gap: spacing.lg, paddingTop: 48, paddingBottom: 32 }}>
        <View style={{ alignItems: 'center' }}>
          <Image source={LOGO_IMAGE} style={{ width: 170, height: 42 }} contentFit="contain" />
        </View>

        <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline }}>
          <Image source={HERO_IMAGE} style={{ width: '100%', height: 280 }} contentFit="contain" contentPosition="bottom" />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: font.size['2xl'], fontWeight: '800', color: colors.ink }}>Home services at your doorstep</Text>
          <Muted style={{ fontSize: font.size.base }}>Book trusted professionals for all your home needs.</Muted>
        </View>

        <View style={{ gap: 12, marginTop: 'auto' }}>
          <Button label="📱 Continue with Phone" onPress={() => router.push('/onboarding/phone' as never)} size="lg" disabled={busy} />
          <Button label="Continue with Google" variant="outline" onPress={google} size="lg" loading={busy} />
          <Pressable onPress={finishAndEnter}>
            <Text style={{ textAlign: 'center', color: colors.inkSecondary, fontWeight: '600', paddingVertical: 4 }}>Continue browsing without an account</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 4 }}>
            <Pressable onPress={() => router.push('/help')}><Text style={{ color: colors.inkTertiary, fontSize: font.size.xs, fontWeight: '600' }}>Privacy Policy</Text></Pressable>
            <Pressable onPress={() => router.push('/help')}><Text style={{ color: colors.inkTertiary, fontSize: font.size.xs, fontWeight: '600' }}>Terms & Conditions</Text></Pressable>
          </View>
          <Muted style={{ textAlign: 'center', fontSize: font.size.xs }}>By continuing you agree to our Terms of Service.</Muted>
        </View>
      </Screen>
    </>
  );
}
