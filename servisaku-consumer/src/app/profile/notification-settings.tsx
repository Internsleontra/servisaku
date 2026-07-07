import { useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth';
import { api } from '@/api/client';
import { NOTIF_CATEGORIES, NOTIF_CHANNELS, defaultNotifPrefs, type NotifPrefs } from '@/features/profile/mockApi';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { SectionCard } from '@/components/kit';
import { ScreenHeader, Button, Chip } from '@/components/ui';
import { font, radius, spacing } from '@/theme/tokens';

const CH_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { push: 'notifications', sms: 'chatbubble', email: 'mail', whatsapp: 'logo-whatsapp' };
const MUTE = [{ k: 'off', l: 'Not muted' }, { k: '1h', l: '1 hour' }, { k: '8h', l: '8 hours' }, { k: '24h', l: '24 hours' }, { k: 'until', l: 'Until I turn on' }];

export default function NotificationSettings() {
  const { colors } = useTheme();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [prefs, setPrefs] = useState<NotifPrefs>(() => ({ ...defaultNotifPrefs(), ...(user?.consumerProfile?.notifPrefs ?? {}) }));
  const [mute, setMute] = useState<string>(user?.consumerProfile?.muteUntil ?? 'off');
  const [saving, setSaving] = useState(false);

  function toggle(cat: string, ch: string) {
    setPrefs((p) => ({ ...p, [cat]: { ...p[cat], [ch]: !p[cat]?.[ch] } }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateConsumerProfile({ notifPrefs: prefs, muteUntil: mute });
      await refresh();
      toast.show('Notification settings saved', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Notification settings" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: font.size.xs, fontWeight: '800', color: colors.inkTertiary, letterSpacing: 0.6 }}>MUTE ALL FOR</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MUTE.map((m) => <Chip key={m.k} label={m.l} active={mute === m.k} onPress={() => setMute(m.k)} />)}
          </View>
        </View>

        <SectionCard title="Per category · per channel">
          <View>
            {NOTIF_CATEGORIES.map((cat, i) => (
              <View key={cat} style={{ paddingHorizontal: spacing.lg, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.hairline, gap: 8 }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{cat}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {NOTIF_CHANNELS.map((ch) => {
                    const on = !!prefs[cat]?.[ch];
                    return (
                      <Pressable key={ch} onPress={() => toggle(cat, ch)}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.md, paddingVertical: 8, borderWidth: 1, borderColor: on ? colors.brand : colors.hairline, backgroundColor: on ? colors.brandTint : colors.surface }}>
                        <Ionicons name={CH_ICON[ch]} size={13} color={on ? colors.brand : colors.inkTertiary} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: on ? colors.brand : colors.inkTertiary, textTransform: 'capitalize' }}>{ch === 'whatsapp' ? 'WA' : ch}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </SectionCard>

        <Button label="Save settings" onPress={save} loading={saving} size="lg" />
      </ScrollView>
    </View>
  );
}
