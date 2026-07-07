import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  GoogleAuthProvider,
  type ConfirmationResult,
} from 'firebase/auth';
import { Image } from 'expo-image';
import { useAuth } from '@/context/auth';
import { api } from '@/api/client';
import { auth, isFirebaseConfigured } from '@/config/firebase';
import { LOGO_IMAGE } from '@/lib/images';
import { Screen, Muted, Button, Field, Input, Card } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme/tokens';

const isWeb = Platform.OS === 'web';
type Mode = 'login' | 'register' | 'phone' | 'forgot';

// Normalise a Malaysian mobile number to E.164 (+60…).
function toMalaysianE164(raw: string): string | null {
  let d = raw.trim().replace(/[^0-9+]/g, '');
  if (d.startsWith('+60')) d = d.slice(3);
  else if (d.startsWith('60')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!/^1\d{8,9}$/.test(d)) return null;
  return `+60${d}`;
}

export default function Login() {
  const { login, register, loginWithFirebase } = useAuth();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const [mode, setMode] = useState<Mode>('login');

  // Email / password
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Phone OTP
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  // Forgot password
  const [resetInfo, setResetInfo] = useState<{ devLink?: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { try { verifierRef.current?.clear(); } catch { /* noop */ } }, []);

  function handleRedirect() {
    if (redirect) router.replace(redirect as never);
    else router.replace('/(tabs)');
  }

  function switchMode(m: Mode) {
    setMode(m); setError(null); setConfirmation(null); setResetInfo(null);
  }

  function firebaseUnavailable(): string | null {
    if (!isWeb) return 'Phone & Google sign-in run in the web app for now. Use email/password here.';
    if (!isFirebaseConfigured) return 'Phone & Google sign-in aren’t configured yet (missing Firebase keys).';
    return null;
  }

  async function submitEmailPassword() {
    setError(null);
    if (!email || !password) { setError('Please enter your email and password'); return; }
    if (mode === 'register' && !fullName) { setError('Please enter your full name'); return; }
    setLoading(true);
    try {
      if (mode === 'register') await register(email.trim(), password, fullName.trim());
      else await login(email.trim(), password);
      handleRedirect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  async function sendResetLink() {
    setError(null);
    if (!email) { setError('Enter your email'); return; }
    setLoading(true);
    try {
      const res = await api.forgotPassword(email.trim());
      setResetInfo({ devLink: res?.dev_reset_link });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send reset link');
    } finally {
      setLoading(false);
    }
  }

  function getVerifier(): RecaptchaVerifier {
    if (!verifierRef.current) {
      verifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }
    return verifierRef.current;
  }

  async function sendOtp() {
    setError(null);
    const blocked = firebaseUnavailable();
    if (blocked) { setError(blocked); return; }
    const e164 = toMalaysianE164(phone);
    if (!e164) { setError('Enter a valid Malaysian mobile number, e.g. 012-345 6789'); return; }
    setLoading(true);
    try {
      const conf = await signInWithPhoneNumber(auth, e164, getVerifier());
      setConfirmation(conf);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code');
      try { verifierRef.current?.clear(); } catch { /* noop */ }
      verifierRef.current = null;
    } finally {
      setLoading(false);
    }
  }

  async function confirmOtp() {
    setError(null);
    if (!confirmation) return;
    if (!otpCode) { setError('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const cred = await confirmation.confirm(otpCode);
      const token = await cred.user.getIdToken();
      await loginWithFirebase(token, fullName.trim() || undefined);
      handleRedirect();
    } catch {
      setError('Invalid or expired code');
    } finally {
      setLoading(false);
    }
  }

  async function googleSignIn() {
    setError(null);
    const blocked = firebaseUnavailable();
    if (blocked) { setError(blocked); return; }
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const token = await cred.user.getIdToken();
      await loginWithFirebase(token);
      handleRedirect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Screen contentStyle={{ gap: spacing.lg, paddingTop: 64 }}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <Image source={LOGO_IMAGE} style={{ width: 190, height: 48 }} contentFit="contain" />
            <Muted style={{ marginTop: 8 }}>Home services, on demand.</Muted>
          </View>

          {mode === 'forgot' ? (
            <Card style={{ gap: spacing.md }}>
              <Text style={{ fontSize: font.size.lg, fontWeight: '800', color: colors.ink }}>Reset your password</Text>
              {resetInfo ? (
                <>
                  <View style={{ backgroundColor: colors.successTint, borderRadius: radius.md, padding: 12 }}>
                    <Text style={{ color: colors.success, fontSize: font.size.sm }}>
                      If an account exists for {email}, a reset link has been sent. It expires in 30 minutes.
                    </Text>
                  </View>
                  {resetInfo.devLink ? (
                    <View style={{ backgroundColor: colors.raised, borderRadius: radius.md, padding: 12 }}>
                      <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary, marginBottom: 4 }}>Dev mode (no SMTP) — open this link:</Text>
                      <Text selectable style={{ fontSize: font.size.xs, color: colors.brand }}>{resetInfo.devLink}</Text>
                    </View>
                  ) : null}
                  <Button label="Back to sign in" onPress={() => switchMode('login')} size="lg" />
                </>
              ) : (
                <>
                  <Muted>Enter your email and we’ll send a link to set a new password.</Muted>
                  <Field label="Email" error={error ?? undefined}>
                    <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
                  </Field>
                  <Button label="Send reset link" onPress={sendResetLink} loading={loading} size="lg" />
                  <Pressable onPress={() => switchMode('login')}>
                    <Text style={{ textAlign: 'center', color: colors.inkSecondary, fontWeight: '600', fontSize: font.size.sm }}>Back to sign in</Text>
                  </Pressable>
                </>
              )}
            </Card>
          ) : (
            <>
              {/* Mode toggle */}
              <View style={{ flexDirection: 'row', backgroundColor: colors.raised, borderRadius: 12, padding: 4 }}>
                {(['login', 'register', 'phone'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => switchMode(m)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', backgroundColor: mode === m ? colors.surface : 'transparent' }}>
                    <Text style={{ fontWeight: '700', color: mode === m ? colors.ink : colors.inkSecondary, fontSize: font.size.sm }}>
                      {m === 'phone' ? 'Phone OTP' : m === 'login' ? 'Sign in' : 'Register'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Card style={{ gap: spacing.md }}>
                {mode === 'phone' ? (
                  !confirmation ? (
                    <>
                      <Field label="Full name (for new accounts)">
                        <Input value={fullName} onChangeText={setFullName} placeholder="Your name" autoCapitalize="words" />
                      </Field>
                      <Field label="Malaysian mobile number" error={error ?? undefined}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, backgroundColor: colors.surface }}>
                          <Text style={{ paddingHorizontal: 12, fontSize: font.size.base, color: colors.inkSecondary, fontWeight: '700' }}>+60</Text>
                          <View style={{ width: 1, height: 24, backgroundColor: colors.hairline }} />
                          <Input value={phone} onChangeText={setPhone} placeholder="12-345 6789" keyboardType="phone-pad" style={{ flex: 1, borderWidth: 0, backgroundColor: 'transparent' }} />
                        </View>
                      </Field>
                      <Button label="Send code" onPress={sendOtp} loading={loading} size="lg" />
                    </>
                  ) : (
                    <>
                      <Field label={`Enter the code sent to ${toMalaysianE164(phone) ?? 'your phone'}`} error={error ?? undefined}>
                        <Input value={otpCode} onChangeText={setOtpCode} placeholder="6-digit code" keyboardType="number-pad" maxLength={6} />
                      </Field>
                      <Button label="Verify & continue" onPress={confirmOtp} loading={loading} size="lg" />
                      <Pressable onPress={() => setConfirmation(null)}>
                        <Text style={{ textAlign: 'center', color: colors.inkSecondary, fontWeight: '600', fontSize: font.size.sm }}>Use a different number</Text>
                      </Pressable>
                    </>
                  )
                ) : (
                  <>
                    {mode === 'register' && (
                      <Field label="Full name">
                        <Input value={fullName} onChangeText={setFullName} placeholder="Your name" autoCapitalize="words" />
                      </Field>
                    )}
                    <Field label="Email">
                      <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
                    </Field>
                    <Field label="Password" error={error ?? undefined}>
                      <Input value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
                    </Field>
                    {mode === 'login' ? (
                      <Pressable onPress={() => switchMode('forgot')} style={{ alignSelf: 'flex-end' }}>
                        <Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>Forgot password?</Text>
                      </Pressable>
                    ) : null}
                    <Button label={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submitEmailPassword} loading={loading} size="lg" />
                  </>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
                  <Muted>or</Muted>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
                </View>

                <Button label="Continue with Google" onPress={googleSignIn} variant="outline" size="lg" loading={loading} />
              </Card>
            </>
          )}

          <Pressable onPress={() => router.replace('/(tabs)')}>
            <Text style={{ textAlign: 'center', color: colors.inkSecondary, fontWeight: '600' }}>Continue browsing without an account</Text>
          </Pressable>

          <Muted style={{ textAlign: 'center' }}>Demo: user@servisaku.my / user123</Muted>

          {isWeb ? <View nativeID="recaptcha-container" /> : null}
        </Screen>
      </KeyboardAvoidingView>
    </>
  );
}
