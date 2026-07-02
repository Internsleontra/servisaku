import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/auth';
import { api } from '@/api/client';
import { ScreenHeader, Card, Button, Field, Input, Chip } from '@/components/ui';
import { CITIES } from '@/lib/booking-meta';
import { colors, font, spacing } from '@/theme/tokens';

export default function EditProfile() {
  const { user, refresh } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone_number ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateMe({ fullName: fullName.trim(), phone: phone.trim(), city });
      await refresh();
      Alert.alert('Saved', 'Your profile has been updated.', [{ text: 'Done', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Edit profile" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: spacing.md }}>
          <Field label="Full name">
            <Input value={fullName} onChangeText={setFullName} placeholder="Your name" autoCapitalize="words" />
          </Field>
          <Field label="Phone number">
            <Input value={phone} onChangeText={setPhone} placeholder="+60…" keyboardType="phone-pad" />
          </Field>
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: font.size.sm, fontWeight: '600', color: colors.inkSecondary }}>City</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CITIES.map((c) => <Chip key={c} label={c} active={city === c} onPress={() => setCity(c)} />)}
            </View>
          </View>
        </Card>
        <Button label="Save changes" onPress={save} loading={saving} size="lg" />
      </ScrollView>
    </View>
  );
}
