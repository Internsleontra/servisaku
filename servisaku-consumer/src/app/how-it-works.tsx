import { ScrollView, Text, View } from 'react-native';
import { ScreenHeader, Card, Muted } from '@/components/ui';
import { colors, font, spacing } from '@/theme/tokens';

const STEPS = [
  { icon: '🔍', title: 'Choose a service', body: 'Browse 70+ home services across cleaning, repairs, beauty and more.' },
  { icon: '📝', title: 'Tell us what you need', body: 'Answer a few quick questions and get an instant, transparent price.' },
  { icon: '📅', title: 'Pick a time', body: 'Select a date and slot that suits you. Same-day options available.' },
  { icon: '👷', title: 'Get matched', body: 'We assign a verified, background-checked professional near you.' },
  { icon: '📍', title: 'Track & chat', body: 'Follow your pro live and message them directly in the app.' },
  { icon: '⭐', title: 'Pay & review', body: 'Escrow-protected payment. Rate your pro when the job is done.' },
];

export default function HowItWorks() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="How it works" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: font.size.xl, fontWeight: '800', color: colors.ink }}>Book a trusted pro in minutes</Text>
        <Muted style={{ marginBottom: 8 }}>Home services made simple, transparent and reliable.</Muted>
        {STEPS.map((s, i) => (
          <Card key={s.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>{s.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{i + 1}. {s.title}</Text>
              <Muted style={{ marginTop: 2 }}>{s.body}</Muted>
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
