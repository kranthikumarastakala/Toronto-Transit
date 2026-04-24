const EARTH_RADIUS_M = 6_371_000;
const WALK_SPEED_MPS = 1.25; // ~4.5 km/h

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function walkMinutes(distanceMeters: number): number {
  return Math.max(1, Math.round(distanceMeters / WALK_SPEED_MPS / 60));
}

export function formatWalkLabel(distanceMeters: number): string {
  const mins = walkMinutes(distanceMeters);
  const dist =
    distanceMeters < 1_000
      ? `${Math.round(distanceMeters)} m`
      : `${(distanceMeters / 1_000).toFixed(1)} km`;
  return `${dist} · ${mins} min walk`;
}
