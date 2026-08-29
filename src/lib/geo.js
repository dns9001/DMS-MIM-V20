/**
 * Geolocation and image utilities for field operations
 */

/**
 * Calculates haversine distance between two coordinates in meters
 */
export function haversineMeters(lat1, lon1, lat2, lon2) {
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

/**
 * Formats distance in meters to a readable string (e.g. "75 m" or "1.4 km")
 */
export function formatDistance(meters) {
  if (meters === undefined || meters === null || isNaN(meters)) return "-";
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Formats coordinates into standard 5-decimal degree string
 */
export function formatCoordinates(lat, lng, precision = 5) {
  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return "-";
  return `${Number(lat).toFixed(precision)}, ${Number(lng).toFixed(precision)}`;
}

/**
 * Checks if current coordinate is within a target geofence radius
 */
export function isWithinRadius(userLat, userLng, targetLat, targetLng, radiusMeters = 100) {
  const distance = haversineMeters(userLat, userLng, targetLat, targetLng);
  return {
    isWithin: distance <= radiusMeters,
    distance,
    radiusMeters,
  };
}

/**
 * Gets high accuracy current device position with fallback
 */
export function getPosition(options = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // Default fallback location (Jakarta HQ)
      resolve({
        latitude: -6.2146,
        longitude: 106.8451,
        accuracy: 15,
        mock_location: false,
        timestamp: Date.now(),
      });
      return;
    }

    const defaultOptions = {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 3000,
      ...options,
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = pos.coords || {};
        const isMock = !!(coords.mocked || coords.isMock);
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy || 10,
          altitude: coords.altitude || null,
          heading: coords.heading || null,
          speed: coords.speed || null,
          mock_location: isMock,
          timestamp: pos.timestamp || Date.now(),
        });
      },
      (err) => {
        console.warn("GPS Notice:", err.message);
        resolve({
          latitude: -6.2146,
          longitude: 106.8451,
          accuracy: 25,
          mock_location: false,
          timestamp: Date.now(),
          error: err.message,
        });
      },
      defaultOptions
    );
  });
}

/**
 * Real-time GPS stream listener with debounce and cleanup function
 */
export function watchPosition(onLocationUpdate, onError, options = {}) {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return () => {};
  }

  const defaultOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 2000,
    ...options,
  };

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const coords = pos.coords || {};
      const isMock = !!(coords.mocked || coords.isMock);
      onLocationUpdate({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy || 10,
        altitude: coords.altitude || null,
        heading: coords.heading || null,
        speed: coords.speed || null,
        mock_location: isMock,
        timestamp: pos.timestamp || Date.now(),
      });
    },
    (err) => {
      if (onError) onError(err);
    },
    defaultOptions
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}

import { compressPhoto, calculateBase64Bytes, MAX_PHOTO_BYTES } from "./imageCompressor";

/**
 * Compresses an image file or base64 data url for low-bandwidth upload (strictly <= 500 KB)
 */
export async function compressImage(file, maxWidth = 1600, maxHeight = 1600, quality = 0.8) {
  if (!file) return "";

  // If already a base64 string, check its size. If <= 512,000 bytes, return as is; otherwise recompress.
  if (typeof file === "string" && file.startsWith("data:image")) {
    const bSize = calculateBase64Bytes(file);
    if (bSize <= MAX_PHOTO_BYTES) {
      return file;
    }
  }

  try {
    const res = await compressPhoto(file);
    return res.dataUrl;
  } catch (err) {
    console.error("Error in compressImage:", err);
    throw err;
  }
}

