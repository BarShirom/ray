export type MapLocation = { lat: number; lng: number };

export function isValidMapLocation(value: unknown): value is MapLocation {
  if (!value || typeof value !== "object") return false;
  const location = value as MapLocation;
  return Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && location.lat >= -90 && location.lat <= 90 && location.lng >= -180 && location.lng <= 180;
}
