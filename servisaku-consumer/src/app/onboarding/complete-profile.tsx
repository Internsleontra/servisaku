import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useAuth } from '@/context/auth';
import { ScreenHeader, Button, Field, Input, Chip, Muted } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme/tokens';

const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

export default function CompleteProfile() {
  const { completeProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [referral, setReferral] = useState('');
  const [gender, setGender] = useState<string>('');
  const [birthday, setBirthday] = useState('');
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = fullName.trim().length >= 2 && !/[0-9]/.test(fullName);

  async function submit() {
    setError(null);
    if (!nameOk) { setError('Enter your name (letters only, min 2).'); return; }
    if (!agree) { setError('Please accept the Terms and Privacy Policy.'); return; }
    setSaving(true);
    try {
      await completeProfile({
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        gender: (gender || undefined) as never,
        birthday: birthday.trim() || undefined,
        referral_code: referral.trim() || undefined,
      });
      router.replace('/onboarding/location' as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Complete your profile" onBack={() => {}} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Field label="Full name *" error={error && !nameOk ? error : undefined}>
            <Input value={fullName} onChangeText={setFullName} placeholder="John Tan" autoCapitalize="words" />
          </Field>
          <Field label="Email (optional)">
            <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
          </Field>
          <Field label="Referral code (optional)">
            <Input value={referral} onChangeText={setReferral} placeholder="ABC123" autoCapitalize="characters" />
          </Field>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: font.size.sm, fontWeight: '600', color: colors.inkSecondary }}>Gender (optional)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {GENDERS.map((g) => <Chip key={g.id} label={g.label} active={gender === g.id} onPress={() => setGender(gender === g.id ? '' : g.id)} />)}
            </View>
          </View>

          <Field label="Birthday (optional)">
            <Input value={birthday} onChangeText={setBirthday} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
          </Field>

          <Pressable onPress={() => setAgree((a) => !a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: agree ? colors.brand : colors.hairline, backgroundColor: agree ? colors.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {agree ? <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>✓</Text> : null}
            </View>
            <Text style={{ flex: 1, color: colors.ink, fontSize: font.size.sm }}>I agree to the Terms and Privacy Policy</Text>
          </Pressable>

          {error && (nameOk || agree) ? <Text style={{ color: colors.danger, fontSize: font.size.sm }}>{error}</Text> : null}

          <Button label="Create account" onPress={submit} loading={saving} size="lg" />
          <Muted style={{ textAlign: 'center' }}>You can add more details later in your profile.</Muted>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
