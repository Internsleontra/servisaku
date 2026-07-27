import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import { colors, radius, font } from '@/theme/tokens';

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('ali@servisaku.my');
  const [password, setPassword] = useState('partner123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setBusy(true); setError(null);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: font.size['3xl'], fontWeight: '800', color: colors.brand }}>ServisAku</Text>
        <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary, marginTop: 4, marginBottom: 28 }}>
          Partner sign in
        </Text>

        <Text style={labelStyle}>Email</Text>
        <TextInput
          value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address"
          placeholder="you@example.com" placeholderTextColor={colors.inkTertiary}
          style={inputStyle}
        />

        <Text style={[labelStyle, { marginTop: 16 }]}>Password</Text>
        <TextInput
          value={password} onChangeText={setPassword}
          secureTextEntry placeholder="••••••••" placeholderTextColor={colors.inkTertiary}
          style={inputStyle}
        />

        {error && <Text style={{ color: colors.danger, fontSize: font.size.xs, marginTop: 12 }}>{error}</Text>}

        <Pressable onPress={onSubmit} disabled={busy}
          style={({ pressed }) => [{
            marginTop: 24, height: 52, borderRadius: radius.lg, backgroundColor: colors.brand,
            alignItems: 'center', justifyContent: 'center', opacity: busy || pressed ? 0.85 : 1,
          }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: font.size.base }}>Sign in</Text>}
        </Pressable>

        <View style={{ marginTop: 28, padding: 14, borderRadius: radius.md, backgroundColor: colors.brandTint }}>
          <Text style={{ fontSize: font.size.xs, color: colors.brandInk, fontWeight: '700' }}>Demo partner</Text>
          <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary, marginTop: 2 }}>ali@servisaku.my · partner123</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const labelStyle = { fontSize: font.size.xs, fontWeight: '500' as const, color: colors.inkSecondary, marginBottom: 6 };
const inputStyle = {
  backgroundColor: colors.raised, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14,
  fontSize: font.size.base, color: colors.ink,
};
