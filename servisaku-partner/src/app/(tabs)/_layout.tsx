import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth';
import { colors } from '@/theme/tokens';

type IoniconName = keyof typeof Ionicons.glyphMap;
const ICONS: Record<string, [IoniconName, IoniconName]> = {
  index: ['grid', 'grid-outline'],
  jobs: ['briefcase', 'briefcase-outline'],
  earnings: ['wallet', 'wallet-outline'],
  more: ['menu', 'menu-outline'],
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkTertiary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.hairline, height: 58 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarIcon: ({ color, focused, size }) => {
          const [active, inactive] = ICONS[route.name] ?? ICONS.index;
          return <Ionicons name={focused ? active : inactive} size={size ?? 24} color={color} />;
        },
      })}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs' }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
