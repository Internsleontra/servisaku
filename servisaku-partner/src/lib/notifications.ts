import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '@/api/client';

/**
 * Partner push notifications.
 *
 * The API client already had `registerPushToken()`, but the app had no
 * `expo-notifications` dependency — so it could never obtain a token to send.
 * The call was unreachable. This closes that: permission → token → register.
 *
 * Partners are the side that actually needs push. A missed job offer is lost
 * income, and the in-app Socket.IO feed only delivers while the app is open.
 *
 * Everything here is best-effort. Push failing must never block sign-in or
 * stop a partner working a job.
 */

/** Ask for notification permission. Returns false if denied or unavailable. */
export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === 'granted';
  } catch {
    return false;
  }
}

/**
 * The Expo push token, or null.
 *
 * Needs `extra.eas.projectId` in app.json to resolve in a real build — that is
 * not set yet, so this returns null until the EAS project exists. Returning
 * null rather than throwing keeps the caller simple and means wiring this up
 * now does not break anything before EAS is configured.
 */
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Permission → token → send it to the server.
 *
 * Call after sign-in: the endpoint is authenticated, and a token registered
 * without a session cannot be attributed to a partner.
 *
 * @returns the token that was registered, or null if any step declined/failed.
 */
export async function registerForPush(): Promise<string | null> {
  if (!(await requestPushPermission())) return null;

  const token = await getPushToken();
  if (!token) return null;

  try {
    await api.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android', 'expo');
    return token;
  } catch {
    // A failed registration is not fatal — the partner keeps working and the
    // next sign-in retries.
    return null;
  }
}
