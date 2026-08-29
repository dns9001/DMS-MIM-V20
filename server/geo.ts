/**
 * Server-side Geolocation & Geofencing helper calculations
 */

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    lat1 === undefined ||
    lon1 === undefined ||
    lat2 === undefined ||
    lon2 === undefined ||
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2)
  ) {
    return 0;
  }

  const R = 6371000; // Earth radius in meters
  const phi1 = (Number(lat1) * Math.PI) / 180;
  const phi2 = (Number(lat2) * Math.PI) / 180;
  const deltaPhi = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const deltaLambda = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export function isWithinRadius(
  userLat: number,
  userLng: number,
  targetLat: number,
  targetLng: number,
  radiusMeters: number = 100
): { isWithin: boolean; distance: number; maxRadius: number } {
  const distance = haversineMeters(userLat, userLng, targetLat, targetLng);
  return {
    isWithin: distance <= radiusMeters,
    distance,
    maxRadius: radiusMeters,
  };
}

export function isValidCoordinate(lat: any, lng: any): boolean {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    !isNaN(nLat) &&
    !isNaN(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180 &&
    !(nLat === 0 && nLng === 0)
  );
}
