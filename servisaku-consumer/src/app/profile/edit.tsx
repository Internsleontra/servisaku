import { useState } from 'react';
import { ScrollView, Switch, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/auth';
import { api, type CommsPrefs } from '@/api/client';
import { useToast } from '@/components/toast';
import { useTheme } from '@/theme/theme';
import { SectionCard } from '@/components/kit';
import { ScreenHeader, Button, Field, Input, Chip, Muted } from '@/components/ui';
import { initials } from '@/lib/format';
import { font, radius, spacing } from '@/theme/tokens';

const schema = z.object({
  fullName: z.string().min(2, 'Enter your name (min 2 letters)').max(60).regex(/^[^0-9]+$/u, 'Letters only — no numbers'),
  birthday: z.string().max(30).optional(),
  gender: z.enum(['male', 'female', 'prefer_not_to_say']).optional(),
  language: z.enum(['en', 'ms', 'zh']),
});
type Form = z.infer<typeof schema>;

const GENDERS = [{ id: 'male', label: 'Male' }, { id: 'female', label: 'Female' }, { id: 'prefer_not_to_say', label: 'Prefer not to say' }] as const;
const LANGS = [{ id: 'en', label: 'English' }, { id: 'ms', label: 'Bahasa Malaysia' }, { id: 'zh', label: '中文' }] as const;
const CHANNELS = [['push', 'Push'], ['sms', 'SMS'], ['email', 'Email'], ['whatsapp', 'WhatsApp']] as const;

export default function PersonalInformation() {
  const { colors } = useTheme();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const cp = user?.consumerProfile ?? {};
  const [marketing, setMarketing] = useState<Record<string, boolean>>({
    push: cp.comms?.marketing?.push ?? true, sms: cp.comms?.marketing?.sms ?? false,
    email: cp.comms?.marketing?.email ?? true, whatsapp: cp.comms?.marketing?.whatsapp ?? false,
  });

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: user?.fullName ?? '',
      birthday: cp.birthday ?? '',
      gender: (cp.gender as Form['gender']) ?? undefined,
      language: (cp.language as Form['language']) ?? 'en',
    },
  });

  async function onSubmit(data: Form) {
    try {
      await api.updateMe({ fullName: data.fullName.trim() });
      const comms: CommsPrefs = { marketing: marketing as CommsPrefs['marketing'], transactional: { push: true, sms: true, email: true } };
      await api.updateConsumerProfile({
        gender: data.gender ?? null,
        birthday: data.birthday || null,
        language: data.language,
        comms,
      });
      await refresh();
      toast.show('Profile updated', 'success');
      router.back();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save', 'error');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Personal information" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Photo */}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 30, fontWeight: '800', color: colors.brand }}>{initials(user?.fullName || user?.email || user?.phone)}</Text>
          </View>
          <Pressable onPress={() => toast.show('Photo upload needs storage — coming soon', 'info')}>
            <Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>Change photo</Text>
          </Pressable>
        </View>

        <SectionCard title="Basic details">
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <Controller control={control} name="fullName" render={({ field }) => (
              <Field label="Full name" error={errors.fullName?.message}>
                <Input value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="Your name" autoCapitalize="words" />
              </Field>
            )} />
            <Controller control={control} name="birthday" render={({ field }) => (
              <Field label="Birthday">
                <Input value={field.value ?? ''} onChangeText={field.onChange} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
              </Field>
            )} />
            <Controller control={control} name="gender" render={({ field }) => (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: font.size.sm, fontWeight: '600', color: colors.inkSecondary }}>Gender</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {GENDERS.map((g) => <Chip key={g.id} label={g.label} active={field.value === g.id} onPress={() => field.onChange(field.value === g.id ? undefined : g.id)} />)}
                </View>
              </View>
            )} />
          </View>
        </SectionCard>

        {/* Phone (change requires OTP) */}
        <SectionCard title="Contact">
          <View style={{ padding: spacing.lg, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: font.size.xs, fontWeight: '700', color: colors.inkTertiary }}>PHONE</Text>
                <Text style={{ fontWeight: '700', color: colors.ink, marginTop: 2 }}>{user?.phone ?? 'Not added'}</Text>
              </View>
              <Pressable onPress={() => toast.show('Phone change needs OTP re-verification — coming soon', 'info')} style={{ borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>Change</Text>
              </Pressable>
            </View>
            <View style={{ height: 1, backgroundColor: colors.hairline }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: font.size.xs, fontWeight: '700', color: colors.inkTertiary }}>EMAIL</Text>
                <Text style={{ fontWeight: '700', color: colors.ink, marginTop: 2 }} numberOfLines={1}>{user?.email ?? 'Not added'}</Text>
              </View>
              <Pressable onPress={() => toast.show('Email change needs verification — coming soon', 'info')} style={{ borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>Change</Text>
              </Pressable>
            </View>
          </View>
        </SectionCard>

        {/* Language */}
        <SectionCard title="Preferred language">
          <View style={{ padding: spacing.lg }}>
            <Controller control={control} name="language" render={({ field }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {LANGS.map((l) => <Chip key={l.id} label={l.label} active={field.value === l.id} onPress={() => field.onChange(l.id)} />)}
              </View>
            )} />
          </View>
        </SectionCard>

        {/* Communication preferences */}
        <SectionCard title="Marketing communications">
          <View style={{ padding: spacing.lg, gap: 4 }}>
            {CHANNELS.map(([key, label], i) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={key === 'email' ? 'mail-outline' : key === 'sms' ? 'chatbubble-outline' : key === 'whatsapp' ? 'logo-whatsapp' : 'notifications-outline'} size={18} color={colors.inkSecondary} />
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{label}</Text>
                </View>
                <Switch value={marketing[key]} onValueChange={(v) => setMarketing((m) => ({ ...m, [key]: v }))} trackColor={{ true: colors.brand }} />
              </View>
            ))}
            <Muted style={{ marginTop: 8 }}>Transactional messages (booking updates, receipts) are always sent.</Muted>
          </View>
        </SectionCard>

        <Button label="Save changes" onPress={handleSubmit(onSubmit)} loading={isSubmitting} size="lg" />
      </ScrollView>
    </View>
  );
}
