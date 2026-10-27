import * as Location from 'expo-location';

// FR04: the location-confirmed badge is only shown when the phone's own
// accuracy estimate is within this many metres.
export const GPS_THRESHOLD_METRES = 10;

export interface DeviceLocation {
  lat: number;
  lng: number;
  // metres; null when the platform gives no estimate
  accuracy: number | null;
}

// Great-circle distance in metres, same formula as the backend's
// haversineMeters, run on the device so the check also works for cached
// records while offline.
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns { lat, lng, accuracy } or null if permission is denied or no fix is
// available. Never throws: verification must still work without GPS.
export async function getDeviceLocation(): Promise<DeviceLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  } catch (err) {
    return null;
  }
}
