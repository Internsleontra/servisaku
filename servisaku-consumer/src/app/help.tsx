import { useState } from 'react';
import { ScrollView, Text, View, Pressable, Linking } from 'react-native';
import { ScreenHeader, Card, Button, Muted } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme/tokens';

const FAQS = [
  { q: 'How do I reschedule a booking?', a: 'Open the booking from the Bookings tab and cancel, then rebook a new slot. In-app rescheduling is coming soon.' },
  { q: 'When am I charged?', a: 'Payment is held securely in escrow when you book and released to your pro after the job is completed to your satisfaction.' },
  { q: 'Are the professionals verified?', a: 'Yes — every pro is background-checked, and for Malaysia we verify MyKad, skills certifications and insurance.' },
  { q: 'What if I need to cancel?', a: 'You can cancel free of charge before a pro is assigned. Cancellation terms apply once work begins.' },
  { q: 'How do I contact my pro?', a: 'Once assigned, use the Chat button on your booking to message them directly.' },
];

export default function Help() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Help & support" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: 10 }}>
          <Text style={{ fontWeight: '700', color: colors.ink, fontSize: font.size.lg }}>Need a hand?</Text>
          <Muted>Our support team is available 24/7.</Muted>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Button label="💬 WhatsApp" variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL('https://wa.me/60123456789')} />
            <Button label="📞 Call" variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL('tel:+60123456789')} />
          </View>
        </Card>

        <Text style={{ fontWeight: '700', color: colors.ink, marginTop: 4 }}>Frequently asked</Text>
        {FAQS.map((f, i) => (
          <Pressable key={f.q} onPress={() => setOpen(open === i ? null : i)}
            style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontWeight: '600', color: colors.ink }}>{f.q}</Text>
              <Text style={{ color: colors.inkTertiary, fontSize: 18 }}>{open === i ? '−' : '+'}</Text>
            </View>
            {open === i ? <Muted style={{ marginTop: 8 }}>{f.a}</Muted> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
