import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import api from "../lib/api";
import { useAuth } from "./AuthContext";
import { haversineMeters } from "../lib/geo";

const LiveLocationContext = createContext({
  coords: null,
  accuracy: null,
  speed: null,
  heading: null,
  lastUpdated: null,
  isTracking: false,
  trackingError: null,
  forceRefreshGps: () => Promise.resolve(null),
});

export function LiveLocationProvider({ children }) {
  const { user } = useAuth();
  const [coords, setCoords] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [speed, setSpeed] = useState(null);
  const [heading, setHeading] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingError, setTrackingError] = useState(null);

  const lastSentRef = useRef({ lat: 0, lng: 0, time: 0 });
  const watchIdRef = useRef(null);

  // Send location to server
  const broadcastLocation = useCallback(
    async (pos) => {
      if (!user?._id) return;
      const now = Date.now();
      const dist = haversineMeters(
        lastSentRef.current.lat,
        lastSentRef.current.lng,
        pos.coords.latitude,
        pos.coords.longitude
      );

      // Throttle: send at most every 15s OR if moved more than 8 meters
      const elapsed = now - lastSentRef.current.time;
      if (elapsed < 12000 && dist < 8 && lastSentRef.current.time > 0) {
        return;
      }

      lastSentRef.current = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        time: now,
      };

      try {
        await api.post("/sales/location", {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: new Date(pos.timestamp || now).toISOString(),
        });
      } catch (err) {
        // Silent fail for background telemetry
      }
    },
    [user]
  );

  const handlePositionUpdate = useCallback(
    (pos) => {
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      setCoords({ lat, lng });
      setAccuracy(pos.coords.accuracy ? Math.round(pos.coords.accuracy) : 10);
      setSpeed(pos.coords.speed);
      setHeading(pos.coords.heading);
      setLastUpdated(Date.now());
      setTrackingError(null);
      setIsTracking(true);

      // Broadcast to server if user is sales or field staff
      if (user) {
        broadcastLocation(pos);
      }
    },
    [user, broadcastLocation]
  );

  const handlePositionError = useCallback((err) => {
    console.warn("GPS Tracking Warning:", err?.message);
    setTrackingError(err?.message || "GPS tidak tersedia");
  }, []);

  const forceRefreshGps = useCallback(() => {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handlePositionUpdate(pos);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => {
          handlePositionError(err);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, [handlePositionUpdate, handlePositionError]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setTrackingError("Browser tidak mendukung geolokasi");
      return;
    }

    setIsTracking(true);

    // Initial position fetch
    navigator.geolocation.getCurrentPosition(
      handlePositionUpdate,
      handlePositionError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );

    // Continuous real-time GPS stream
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 2000,
      }
    );

    // Fallback heartbeat timer to ensure continuous updates
    const heartbeat = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        handlePositionUpdate,
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
      );
    }, 20000);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      clearInterval(heartbeat);
    };
  }, [handlePositionUpdate, handlePositionError]);

  return (
    <LiveLocationContext.Provider
      value={{
        coords,
        accuracy,
        speed,
        heading,
        lastUpdated,
        isTracking,
        trackingError,
        forceRefreshGps,
      }}
    >
      {children}
    </LiveLocationContext.Provider>
  );
}

export function useLiveLocation() {
  return useContext(LiveLocationContext);
}
