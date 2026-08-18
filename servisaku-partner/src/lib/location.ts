import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Partner location.
 *
 * The partner job lifecycle needs GPS at specific moments — proving arrival on
 * site, stamping before/after photos, showing distance to the customer. The web
 * partner app already does this with `navigator.geolocation`; this is the same
 * capability for the native app, which previously had no location dependency at
 * all.
 *
 * FOREGROUND ONLY, DELIBERATELY.
 * `isIosBackgroundLocationEnabled` / `isAndroidBackgroundLocationEnabled` are
 * both false in app.json. Background location requires a written justification
 * in App Store review and the Google Play prominent-disclosure flow, and it is
 * not needed: every moment the app cares about — en route, arrived, photo
 * capture — happens while the partner has the app open. Turning it on later is
 * a product decision with a store-review cost, not a default.
 *
 * Every function degrades to null rather than throwing. A partner who declines
 * the permission must still be able to work the job manually.
 */

export interface Coords {
  lat: number;
  lng: number;
  /** Metres of horizontal uncertainty, when the platform reports it. */
  accuracy?: number;
}

/** Ask for foreground location. Returns false if denied or unavailable. */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status === 'granted') return true;
    const asked = await Location.requestForegroundPermissionsAsync();
    return asked.status === 'granted';
  } catch {
    return false;
  }
}

/** Has the partner already granted location, without prompting them? */
export async function hasLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * One position fix, or null.
 *
 * `Balanced` accuracy rather than `Highest`: arrival confirmation needs tens of
 * metres, not centimetres, and the high-accuracy mode costs battery on a device
 * the partner relies on all day.
 */
export async function getCurrentCoords(): Promise<Coords | null> {
  if (!(await requestLocationPermission())) return null;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Straight-line distance in kilometres — haversine.
 *
 * Enough to tell a partner "you are 300 m away" or to sanity-check an arrival
 * claim. It is not routing distance and must not be presented as travel time.
 */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
}
