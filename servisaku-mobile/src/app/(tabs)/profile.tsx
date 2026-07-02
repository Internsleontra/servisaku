import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth';
import { colors, radius, font } from '@/theme/tokens';

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.brand, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 28, alignItems: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: font.size.xl, fontWeight: '800' }}>
            {(user?.full_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={{ color: '#fff', fontSize: font.size.lg, fontWeight: '700', marginTop: 12 }}>{user?.full_name ?? 'Partner'}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: font.size.sm }}>{user?.email}</Text>
      </View>

      <View style={{ padding: 20, gap: 12 }}>
        <Row label="Role" value={user?.role ?? '—'} />
        <Row label="Rating" value={user?.partner_rating ? user.partner_rating.toFixed(1) : '—'} />

        <Pressable onPress={onLogout}
          style={({ pressed }) => [{
            marginTop: 12, height: 50, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.danger,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
          }]}>
          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.size.base }}>Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: 16, paddingVertical: 14 }}>
      <Text style={{ fontSize: font.size.sm, color: colors.inkSecondary }}>{label}</Text>
      <Text style={{ fontSize: font.size.sm, fontWeight: '600', color: colors.ink, textTransform: 'capitalize' }}>{value}</Text>
    </View>
  );
}
