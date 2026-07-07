import * as Location from 'expo-location';

export interface GeoResult {
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  area?: string;
  postal?: string;
  street?: string;
}

// Ask for foreground location, get GPS, and reverse-geocode to fill address bits.
// Returns null if permission is denied or lookup fails (→ manual entry).
export async function requestLocation(): Promise<GeoResult | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = pos.coords;
    const out: GeoResult = { lat: latitude, lng: longitude };

    try {
      const [g] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (g) {
        out.city = g.city ?? g.subregion ?? undefined;
        out.state = g.region ?? undefined;
        out.area = g.district ?? undefined;
        out.postal = g.postalCode ?? undefined;
        out.street = g.street ?? undefined;
      }
    } catch { /* geocode is best-effort */ }

    return out;
  } catch {
    return null;
  }
}
