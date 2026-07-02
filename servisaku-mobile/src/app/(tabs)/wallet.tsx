import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Wallet } from '@/api/client';
import { colors, radius, font, shadow } from '@/theme/tokens';

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.wallet().then(setWallet).catch(() => {}).finally(() => setLoading(false)); }, []);

  const tiles: { label: string; value: string }[] = [
    { label: 'Withdrawable', value: `RM ${wallet?.withdrawable ?? 0}` },
    { label: 'Pending', value: `RM ${wallet?.pending ?? 0}` },
    { label: 'Lifetime earned', value: `RM ${wallet?.lifetime ?? 0}` },
    { label: 'Withdrawn', value: `RM ${wallet?.withdrawn ?? 0}` },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.brand, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 28 }}>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: font.size.xs }}>Wallet</Text>
        <Text style={{ color: '#fff', fontSize: font.size['3xl'], fontWeight: '800', marginTop: 2 }}>RM {wallet?.withdrawable ?? 0}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: font.size.xs, marginTop: 2 }}>Available to withdraw</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 20 }}>
          {tiles.map((t) => (
            <View key={t.label} style={{ width: '47%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: 16, ...shadow.e1 }}>
              <Text style={{ fontSize: font.size.xl, fontWeight: '700', color: colors.ink }}>{t.value}</Text>
              <Text style={{ fontSize: font.size.xs, color: colors.inkSecondary, marginTop: 2 }}>{t.label}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
