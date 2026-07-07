import { Alert, RefreshControl, ScrollView, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Address } from '@/api/client';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/components/toast';
import { Skeleton, StatusChip } from '@/components/kit';
import { ScreenHeader, Button, EmptyState } from '@/components/ui';
import { font, radius, shadow, spacing, HIT } from '@/theme/tokens';

export function formatAddress(a: Address): string {
  return [a.house_number, a.building, a.street, a.area, a.city, a.state, a.postal].filter(Boolean).join(', ');
}

const LABEL_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { Home: 'home', Work: 'briefcase', Other: 'location' };

export default function AddressesList() {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['addresses'], queryFn: api.addresses });

  async function setDefault(a: Address) {
    if (a.is_default) return;
    try { await api.updateAddress(a.id, { is_default: true }); await qc.invalidateQueries({ queryKey: ['addresses'] }); toast.show('Default address updated', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : 'Could not update', 'error'); }
  }
  function confirmDelete(a: Address) {
    Alert.alert('Delete address?', formatAddress(a), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.deleteAddress(a.id); await qc.invalidateQueries({ queryKey: ['addresses'] }); toast.show('Address removed', 'success'); }
        catch (e) { toast.show(e instanceof Error ? e.message : 'Could not delete', 'error'); }
      } },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Saved addresses" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={q.refetch} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}>
        {q.isLoading ? (
          [0, 1].map((i) => (
            <View key={i} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, gap: 10 }}>
              <Skeleton width={100} height={14} />
              <Skeleton width="90%" height={12} />
              <Skeleton width="60%" height={12} />
            </View>
          ))
        ) : (q.data ?? []).length ? (
          (q.data ?? []).map((a) => (
            <View key={a.id} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: spacing.lg, gap: 10, ...shadow.e1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={LABEL_ICON[a.label] ?? 'location'} size={18} color={colors.brand} />
                <Text style={{ fontWeight: '800', color: colors.ink, fontSize: font.size.base }}>{a.label}</Text>
                {a.is_default ? <StatusChip label="Default" tone="success" /> : null}
              </View>
              <Text style={{ color: colors.inkSecondary, fontSize: font.size.sm }}>{formatAddress(a)}</Text>
              {a.landmark ? <Text style={{ color: colors.inkTertiary, fontSize: font.size.xs }}>Landmark: {a.landmark}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 2 }}>
                {!a.is_default ? <Action icon="star-outline" label="Set default" onPress={() => setDefault(a)} color={colors.brand} /> : null}
                <Action icon="create-outline" label="Edit" onPress={() => router.push(`/profile/addresses/edit?id=${a.id}` as never)} color={colors.inkSecondary} />
                <Action icon="trash-outline" label="Delete" onPress={() => confirmDelete(a)} color={colors.danger} />
              </View>
            </View>
          ))
        ) : (
          <EmptyState emoji="📍" title="No saved addresses" subtitle="Add an address to book faster next time." action={<Button label="Add address" onPress={() => router.push('/profile/addresses/edit' as never)} />} />
        )}

        {(q.data ?? []).length ? (
          <Pressable onPress={() => router.push('/profile/addresses/edit' as never)}
            style={{ minHeight: HIT, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.hairline, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingVertical: 14, marginTop: 4 }}>
            <Ionicons name="add" size={18} color={colors.brand} />
            <Text style={{ color: colors.brand, fontWeight: '700' }}>Add new address</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Action({ icon, label, onPress, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ color, fontWeight: '700', fontSize: font.size.sm }}>{label}</Text>
    </Pressable>
  );
}
