import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

// Face ID / Touch ID / fingerprint unlock (native only).
export async function biometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function authenticateBiometric(prompt = 'Unlock ServisAku'): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt });
    return res.success;
  } catch {
    return false;
  }
}
