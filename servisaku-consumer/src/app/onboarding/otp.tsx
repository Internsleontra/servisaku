import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { api } from '@/api/client';
import { useAuth } from '@/context/auth';
import { ScreenHeader, Button, Muted } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme/tokens';

const ERRORS: Record<string, string> = {
  invalid: 'Incorrect code. Please try again.',
  expired: 'That code expired. Request a new one.',
  locked: 'Too many attempts. Try again in ~15 minutes.',
  no_code: 'Request a new code to continue.',
};

export default function OtpVerify() {
  const { phone, existing, resend, dev } = useLocalSearchParams<{ phone: string; existing?: string; resend?: string; dev?: string }>();
  const { verifyOtp } = useAuth();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(dev ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(Number(resend) || 30);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  async function verify(value: string) {
    setError(null);
    setLoading(true);
    try {
      const isNew = await verifyOtp(String(phone), value);
      if (isNew) {
        router.replace('/onboarding/complete-profile' as never);
        return;
      }
      await afterLogin();
    } catch (e) {
      const key = e instanceof Error ? e.message : '';
      setError(ERRORS[key] ?? 'Verification failed. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  async function afterLogin() {
    // Continue onboarding: location → address → notifications → Home.
    router.replace('/onboarding/location' as never);
  }

  function onChange(v: string) {
    const digits = v.replace(/[^0-9]/g, '').slice(0, 6);
    setCode(digits);
    setError(null);
    if (digits.length === 6) verify(digits);
  }

  async function resendCode() {
    setError(null);
    try {
      const res = await api.otpRequest(String(phone));
      setSeconds(res.resend_in ?? 30);
      setDevCode(res.dev_code ?? '');
      setCode('');
    } catch (e) {
      const key = e instanceof Error ? e.message : '';
      Alert.alert('Please wait', ERRORS[key] ?? 'Could not resend the code yet.');
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="" />
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <View>
            <Text style={{ fontSize: font.size['2xl'], fontWeight: '800', color: colors.ink }}>Verify your number</Text>
            <Muted style={{ marginTop: 4 }}>We sent a 6-digit code to {String(phone)}</Muted>
          </View>

          <Pressable onPress={() => inputRef.current?.focus()}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={{
                  flex: 1, height: 56, borderRadius: radius.md, borderWidth: code.length === i ? 2 : 1,
                  borderColor: error ? colors.danger : code.length === i ? colors.brand : colors.hairline,
                  backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.ink }}>{code[i] ?? ''}</Text>
                </View>
              ))}
            </View>
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={onChange}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              autoFocus
              style={{ position: 'absolute', opacity: 0, width: '100%', height: 56 }}
            />
          </Pressable>

          {error ? <Text style={{ color: colors.danger, fontSize: font.size.sm }}>{error}</Text> : null}
          {devCode ? <Muted>Dev mode (no SMS): your code is {devCode}</Muted> : null}

          <Button label="Verify & continue" onPress={() => verify(code)} loading={loading} disabled={code.length !== 6} size="lg" />

          <View style={{ alignItems: 'center', gap: 8 }}>
            {seconds > 0 ? (
              <Muted>Resend code in {seconds}s</Muted>
            ) : (
              <Pressable onPress={resendCode}><Text style={{ color: colors.brand, fontWeight: '700' }}>Resend OTP</Text></Pressable>
            )}
            <Pressable onPress={() => router.back()}><Text style={{ color: colors.inkSecondary, fontWeight: '600', fontSize: font.size.sm }}>Change number</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
