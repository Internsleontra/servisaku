import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPaymentMethods, type PaymentMethod } from '@/features/profile/mockApi';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton, StatusChip } from '@/components/kit';
import { ScreenHeader } from '@/components/ui';
import { font, radius, shadow, spacing, HIT } from '@/theme/tokens';

function label(m: PaymentMethod) {
  if (m.kind === 'card') return `${m.brand} •••• ${m.last4}`;
  if (m.kind === 'fpx') return `FPX · ${m.bank}`;
  return m.wallet ?? 'E-wallet';
}
const kindIcon: Record<PaymentMethod['kind'], keyof typeof Ionicons.glyphMap> = { card: 'card', fpx: 'business', ewallet: 'wallet' };

export default function PaymentMethods() {
  const { colors } = useTheme();
  const toast = useToast();
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);

  useEffect(() => { getPaymentMethods().then(setMethods); }, []);

  function setDefault(id: string) {
    setMethods((ms) => (ms ?? []).map((m) => ({ ...m, isDefault: m.id === id })));
    toast.show('Default payment updated', 'success');
  }
  function remove(m: PaymentMethod) {
    Alert.alert('Remove payment method?', label(m), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { setMethods((ms) => (ms ?? []).filter((x) => x.id !== m.id)); toast.show('Removed', 'success'); } },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Payment methods" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {!methods ? (
          [0, 1, 2].map((i) => <Skeleton key={i} height={62} radius={16} style={{ marginBottom: 4 }} />)
        ) : (
          methods.map((m) => (
            <View key={m.id} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, ...shadow.e1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={kindIcon[m.kind]} size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.ink }}>{label(m)}</Text>
                  <Text style={{ fontSize: font.size.xs, color: colors.inkTertiary, textTransform: 'capitalize' }}>{m.kind === 'ewallet' ? 'E-wallet' : m.kind}</Text>
                </View>
                {m.isDefault ? <StatusChip label="Default" tone="success" /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                {!m.isDefault ? (
                  <Pressable onPress={() => setDefault(m.id)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="star-outline" size={15} color={colors.brand} /><Text style={{ color: colors.brand, fontWeight: '700', fontSize: font.size.sm }}>Set default</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => remove(m)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} /><Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.size.sm }}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Pressable onPress={() => toast.show('Add via secure tokenized checkout — coming soon', 'info')}
          style={{ minHeight: HIT, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.hairline, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingVertical: 14, marginTop: 4 }}>
          <Ionicons name="add" size={18} color={colors.brand} />
          <Text style={{ color: colors.brand, fontWeight: '700' }}>Add payment method</Text>
        </Pressable>
        <Text style={{ textAlign: 'center', color: colors.inkTertiary, fontSize: font.size.xs, marginTop: 4 }}>🔒 We never store full card numbers. Cards are tokenized by our PCI-compliant provider.</Text>
      </ScrollView>
    </View>
  );
}
