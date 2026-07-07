import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

type IoniconName = keyof typeof Ionicons.glyphMap;
const ICONS: Record<string, [IoniconName, IoniconName]> = {
  index: ['home', 'home-outline'],
  explore: ['search', 'search-outline'],
  bookings: ['receipt', 'receipt-outline'],
  profile: ['person', 'person-outline'],
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
          borderTopWidth: 1,
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarIcon: ({ color, focused, size }) => {
          const [active, inactive] = ICONS[route.name] ?? ICONS.index;
          return <Ionicons name={focused ? active : inactive} size={size ?? 24} color={color} />;
        },
      })}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
