import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// Secure key/value: SecureStore on native, localStorage on web (SecureStore is
// unavailable there).
async function get(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}
async function set(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
async function del(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

const ACCESS = 'auth_token';
const REFRESH = 'refresh_token';
const DEVICE = 'device_id';
const LANG = 'language';
const ONBOARDED = 'onboarded';
const BIOMETRIC = 'biometric_enabled';

/* --- access + refresh tokens --- */
export const getToken = () => get(ACCESS);
export const setToken = (t: string) => set(ACCESS, t);
export const getRefreshToken = () => get(REFRESH);
export const setRefreshToken = (t: string) => set(REFRESH, t);
export async function setTokens(access: string, refresh?: string) {
  await set(ACCESS, access);
  if (refresh) await set(REFRESH, refresh);
}
export async function clearToken() {
  await del(ACCESS);
  await del(REFRESH);
}

/* --- stable device id (for session/device tracking) --- */
export async function getDeviceId(): Promise<string> {
  let id = await get(DEVICE);
  if (!id) {
    id = Crypto.randomUUID();
    await set(DEVICE, id);
  }
  return id;
}

/* --- preferences / onboarding flags --- */
export const getLanguage = () => get(LANG);
export const setLanguage = (l: string) => set(LANG, l);
export const getOnboarded = async () => (await get(ONBOARDED)) === '1';
export const setOnboarded = () => set(ONBOARDED, '1');
export const getBiometricEnabled = async () => (await get(BIOMETRIC)) === '1';
export const setBiometricEnabled = (on: boolean) => set(BIOMETRIC, on ? '1' : '0');
