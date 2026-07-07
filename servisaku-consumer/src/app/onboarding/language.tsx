import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { setLanguage } from '@/lib/storage';
import { LOGO_IMAGE } from '@/lib/images';
import { Screen, Muted, Button } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme/tokens';

const LANGS = [
  { code: 'en', label: 'English', sub: 'English' },
  { code: 'ms', label: 'Bahasa Malaysia', sub: 'Malay' },
  { code: 'zh', label: '中文', sub: 'Simplified Chinese' },
];

export default function LanguageSelect() {
  const [sel, setSel] = useState('en');

  async function cont() {
    await setLanguage(sel);
    router.replace('/onboarding/welcome' as never);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen contentStyle={{ gap: spacing.xl, paddingTop: 72 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Image source={LOGO_IMAGE} style={{ width: 190, height: 46 }} contentFit="contain" />
          <Muted>Choose your language · 选择语言</Muted>
        </View>

        <View style={{ gap: 12 }}>
          {LANGS.map((l) => {
            const active = sel === l.code;
            return (
              <Pressable key={l.code} onPress={() => setSel(l.code)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderWidth: active ? 2 : 1, borderColor: active ? colors.brand : colors.hairline,
                  backgroundColor: active ? colors.brandTint : colors.surface, borderRadius: radius.lg,
                  paddingHorizontal: 18, paddingVertical: 16,
                }}>
                <View>
                  <Text style={{ fontSize: font.size.lg, fontWeight: '700', color: colors.ink }}>{l.label}</Text>
                  <Text style={{ fontSize: font.size.sm, color: colors.inkTertiary }}>{l.sub}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? colors.brand : colors.hairline, backgroundColor: active ? colors.brand : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>

        <Button label="Continue" onPress={cont} size="lg" />
      </Screen>
    </>
  );
}
