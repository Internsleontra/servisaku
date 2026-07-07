import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Ask for notification permission (booking updates, partner arrival, offers).
export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

// Best-effort Expo push token (needs a projectId in a real build; may be null in dev).
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}
