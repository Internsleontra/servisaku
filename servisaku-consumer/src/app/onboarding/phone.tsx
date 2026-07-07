import { useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { COUNTRIES, DEFAULT_COUNTRY, cleanLocalNumber, type Country } from '@/lib/countries';
import { ScreenHeader, Button, Input, Muted } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function PhoneEntry() {
  const insets = useSafeAreaInsets();
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [local, setLocal] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const national = cleanLocalNumber(local);
  const valid = national.length >= 7 && national.length <= 12;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q)) : COUNTRIES;
  }, [query]);

  async function submit() {
    if (!valid) return;
    const full = `${country.dial}${national}`;
    setLoading(true);
    try {
      const res = await api.otpRequest(full);
      router.push({
        pathname: '/onboarding/otp',
        params: { phone: full, existing: res.existing_user ? '1' : '0', resend: String(res.resend_in ?? 30), dev: res.dev_code ?? '' },
      } as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send code';
      Alert.alert('Try again', /cooldown|too_many|locked/.test(msg) ? 'Too many attempts. Please wait a bit and try again.' : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="" />
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <View>
            <Text style={{ fontSize: font.size['2xl'], fontWeight: '800', color: colors.ink }}>Enter your mobile number</Text>
            <Muted style={{ marginTop: 4 }}>We'll send you a verification code.</Muted>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setPickerOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 12, height: 48 }}>
              <Text style={{ fontSize: 18 }}>{country.flag}</Text>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{country.dial}</Text>
              <Text style={{ color: colors.inkTertiary }}>▾</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Input
                value={local}
                onChangeText={setLocal}
                placeholder="12 345 6789"
                keyboardType="phone-pad"
                autoFocus
                style={{ height: 48 }}
              />
            </View>
          </View>

          <Button label="Continue" onPress={submit} loading={loading} disabled={!valid} size="lg" />
          <Muted style={{ textAlign: 'center' }}>Passwordless — no password to remember.</Muted>
        </View>
      </KeyboardAvoidingView>

      {/* Country picker */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: 10, gap: 10 }}>
            <Text style={{ flex: 1, fontSize: font.size.lg, fontWeight: '800', color: colors.ink }}>Select country</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}><Text style={{ fontSize: 16, fontWeight: '700', color: colors.brand }}>Done</Text></Pressable>
          </View>
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: 8 }}>
            <Input value={query} onChangeText={setQuery} placeholder="🔍 Search country or code" autoCapitalize="none" />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.code}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { setCountry(item); setPickerOpen(false); setQuery(''); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                <Text style={{ fontSize: 22 }}>{item.flag}</Text>
                <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }}>{item.name}</Text>
                <Text style={{ color: colors.inkSecondary, fontWeight: '700' }}>{item.dial}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}
