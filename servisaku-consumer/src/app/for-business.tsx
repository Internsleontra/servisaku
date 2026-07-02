import { ScrollView, Text, View, Linking } from 'react-native';
import { ScreenHeader, Card, Button, Muted } from '@/components/ui';
import { colors, font, spacing } from '@/theme/tokens';

const PERKS = [
  { icon: '🏢', title: 'Facilities on demand', body: 'Cleaning, maintenance and repairs for offices, retail and more.' },
  { icon: '🧾', title: 'Consolidated billing', body: 'One monthly invoice across all your locations and services.' },
  { icon: '📊', title: 'Dashboard & reports', body: 'Track spend, jobs and SLAs with a dedicated account manager.' },
  { icon: '⚡', title: 'Priority dispatch', body: 'Faster response times and guaranteed availability windows.' },
];

export default function ForBusiness() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="For business" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        <Card style={{ backgroundColor: colors.ink, gap: 8 }}>
          <Text style={{ color: colors.inkInverse, fontSize: font.size.xl, fontWeight: '800' }}>ServisAku for Business</Text>
          <Text style={{ color: '#d1d5db' }}>Reliable home & facility services for teams, landlords and property managers.</Text>
        </Card>
        {PERKS.map((p) => (
          <Card key={p.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 26 }}>{p.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{p.title}</Text>
              <Muted style={{ marginTop: 2 }}>{p.body}</Muted>
            </View>
          </Card>
        ))}
        <Button label="Talk to sales" onPress={() => Linking.openURL('mailto:business@servisaku.my')} size="lg" />
      </ScrollView>
    </View>
  );
}
