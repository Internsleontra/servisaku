import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/context/auth';
import { colors } from '@/theme/tokens';

// Consumers can browse without logging in, so the app always lands on the tabs.
// Auth is enforced per-action (booking, bookings list, profile) via requireAuth.
export default function Index() {
  const { loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  return <Redirect href="/(tabs)" />;
}
