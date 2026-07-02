import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenHeader, Card, Button, Muted } from '@/components/ui';
import { colors, font, spacing } from '@/theme/tokens';

const PROMOS = [
  { code: 'FIRST20', title: '20% off your first booking', body: 'New to ServisAku? Save on any service, up to RM30.', color: colors.brand },
  { code: 'CLEAN15', title: 'RM15 off home cleaning', body: 'Book any cleaning service this month and save.', color: '#2563eb' },
  { code: 'REFER50', title: 'Refer a friend, get RM50', body: 'You both earn RM50 credit on their first completed job.', color: '#059669' },
];

export default function Promotions() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Promotions" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        {PROMOS.map((p) => (
          <Card key={p.code} style={{ backgroundColor: p.color, gap: 6 }}>
            <Text style={{ color: '#fff', fontSize: font.size.lg, fontWeight: '800' }}>{p.title}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)' }}>{p.body}</Text>
            <View style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '800', letterSpacing: 1 }}>{p.code}</Text>
            </View>
          </Card>
        ))}
        <Muted style={{ textAlign: 'center' }}>Apply your code at checkout. Terms apply.</Muted>
        <Button label="Browse services" onPress={() => router.push('/(tabs)/explore')} />
      </ScrollView>
    </View>
  );
}
