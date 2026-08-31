import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  Building2,
  Store,
  User,
  Phone,
  Navigation,
  Clock,
  TrendingUp,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  MessageCircle,
  Maximize2,
  Minimize2,
  RotateCcw,
  ShieldCheck,
  Calendar,
  Layers,
  Sparkles,
  Compass,
  Crosshair,
  Search,
  X,
  Radio,
  ArrowUpRight,
} from "lucide-react";
import { useLiveLocation } from "../context/LiveLocationContext";
import { haversineMeters, formatDistance } from "../lib/geo";

// Custom Marker Icons for Leaflet
function getCustomMarkerIcon(marker) {
  const color = marker.color || "#0A2540";
  const badge = marker.badge || "";
  const type = marker.type || "DEFAULT";
  const isPulsing =
    marker.isPulsing ||
    marker.status === "VISITING" ||
    marker.status === "ON_FIELD";

  let iconSvg = "";
  if (type === "OFFICE") {
    iconSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`;
  } else if (type === "SALESMAN") {
    iconSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`;
  } else if (type === "OUTLET" || type === "VISIT") {
    iconSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>`;
  } else if (type === "PICKER") {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
  }

  const pulseHtml = isPulsing
    ? `<span style="position:absolute;top:-5px;left:-5px;right:-5px;bottom:-5px;border-radius:9999px;background:${color};opacity:0.45;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>`
    : "";

  if (badge) {
    return L.divIcon({
      className: "custom-map-marker-container",
      html: `
        <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;">
          ${pulseHtml}
          <div style="position:relative;display:flex;align-items:center;gap:3px;min-width:26px;height:26px;padding:0 6px;border-radius:13px;background:${color};color:#ffffff;font-size:10px;font-weight:800;border:2px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,.35);font-family:inherit;letter-spacing:-0.02em;">
            ${iconSvg ? `<span style="display:inline-flex;align-items:center;">${iconSvg}</span>` : ""}
            <span>${badge}</span>
          </div>
        </div>
      `,
      iconSize: [32, 28],
      iconAnchor: [16, 14],
      popupAnchor: [0, -16],
    });
  }

  return L.divIcon({
    className: "custom-map-marker-container",
    html: `
      <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;">
        ${pulseHtml}
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${color};color:#ffffff;border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,.35);">
          ${iconSvg || '<span style="width:7px;height:7px;border-radius:50%;background:#ffffff;"></span>'}
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

// User Live Real-time GPS Location Icon
function getUserLocationIcon() {
  return L.divIcon({
    className: "user-live-gps-marker",
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;cursor:pointer;">
        <span style="position:absolute;width:28px;height:28px;border-radius:50%;background:#3B82F6;opacity:0.35;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></span>
        <span style="position:absolute;width:18px;height:18px;border-radius:50%;background:#2563EB;opacity:0.25;"></span>
        <div style="position:relative;width:12px;height:12px;border-radius:50%;background:#2563EB;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

// Draggable Picker Marker Icon
function getPickerMarkerIcon() {
  return L.divIcon({
    className: "picker-marker-container",
    html: `
      <div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;cursor:grab;">
        <div style="width:34px;height:34px;border-radius:50%;background:#EF4444;color:#ffffff;display:flex;align-items:center;justify-content:center;border:3px solid #ffffff;box-shadow:0 4px 14px rgba(239,68,68,0.5);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div style="width:2px;height:6px;background:#EF4444;"></div>
        <div style="width:6px;height:3px;border-radius:50%;background:rgba(0,0,0,0.3);"></div>
      </div>
    `,
    iconSize: [34, 43],
    iconAnchor: [17, 43],
    popupAnchor: [0, -43],
  });
}

function ChangeView({ center, zoom, followUser, userCoords, onUserDrag }) {
  const map = useMap();
  const lastCenterRef = useRef(null);

  useMapEvents({
    dragstart() {
      if (onUserDrag) onUserDrag();
    },
    zoomstart() {
      if (onUserDrag) onUserDrag();
    },
  });

  useEffect(() => {
    if (followUser && userCoords && !isNaN(userCoords.lat) && !isNaN(userCoords.lng)) {
      map.setView([userCoords.lat, userCoords.lng], zoom || map.getZoom(), {
        animate: true,
        duration: 0.8,
      });
      lastCenterRef.current = [userCoords.lat, userCoords.lng];
      return;
    }

    if (
      center &&
      Array.isArray(center) &&
      center.length === 2 &&
      !isNaN(center[0]) &&
      !isNaN(center[1])
    ) {
      const [newLat, newLng] = center;
      const last = lastCenterRef.current;
      const isFirst = !last;
      const hasChanged =
        !last ||
        Math.abs(last[0] - newLat) > 0.0001 ||
        Math.abs(last[1] - newLng) > 0.0001;

      if (hasChanged) {
        lastCenterRef.current = [newLat, newLng];
        map.setView(center, isFirst ? (zoom || map.getZoom()) : map.getZoom(), {
          animate: true,
          duration: 0.8,
        });
      }
    }
  }, [center, zoom, followUser, userCoords, map]);
  return null;
}

function FitBoundsHandler({ markers, shouldFit, onFitComplete }) {
  const map = useMap();
  useEffect(() => {
    if (shouldFit && markers && markers.length > 0) {
      const validPoints = markers
        .filter((m) => m && !isNaN(m.lat) && !isNaN(m.lng))
        .map((m) => [m.lat, m.lng]);

      if (validPoints.length > 0) {
        if (validPoints.length === 1) {
          map.setView(validPoints[0], 15, { animate: true });
        } else {
          const bounds = L.latLngBounds(validPoints);
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true });
        }
      }
      if (onFitComplete) onFitComplete();
    }
  }, [shouldFit, markers, map, onFitComplete]);
  return null;
}

function ClickHandler({ onClick, isPicker, onPickerMove }) {
  useMapEvents({
    click(e) {
      if (isPicker && onPickerMove) {
        onPickerMove({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
      if (onClick) {
        onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
}

function formatRupiah(num) {
  if (!num && num !== 0) return "Rp 0";
  return `Rp ${Number(num).toLocaleString("id-ID")}`;
}

// Marker Popup Card with Action Buttons & Google Maps Integration
function MarkerPopupCard({ marker, userCoords }) {
  const [copied, setCopied] = useState(false);

  const handleCopyCoord = (e) => {
    e.stopPropagation();
    const text = `${marker.lat.toFixed(6)}, ${marker.lng.toFixed(6)}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const googleMapsUrl =
    marker.googleMapsUrl ||
    `https://www.google.com/maps/dir/?api=1&destination=${marker.lat},${marker.lng}${
      userCoords ? `&origin=${userCoords.lat},${userCoords.lng}` : ""
    }`;

  const cleanPhone = marker.phone ? marker.phone.replace(/[^0-9]/g, "") : "";
  const waPhone = cleanPhone.startsWith("0")
    ? `62${cleanPhone.slice(1)}`
    : cleanPhone;

  // Real-time distance from current user GPS
  const liveDistMeters = useMemo(() => {
    if (!userCoords || isNaN(userCoords.lat) || isNaN(userCoords.lng)) return null;
    return haversineMeters(userCoords.lat, userCoords.lng, marker.lat, marker.lng);
  }, [userCoords, marker.lat, marker.lng]);

  const renderCategoryIcon = () => {
    if (marker.type === "OFFICE")
      return <Building2 size={16} className="text-white" />;
    if (marker.type === "SALESMAN")
      return <User size={16} className="text-white" />;
    if (marker.type === "VISIT" || marker.type === "OUTLET")
      return <Store size={16} className="text-white" />;
    return <MapPin size={16} className="text-white" />;
  };

  return (
    <div className="bg-white text-slate-800 divide-y divide-slate-100 font-sans">
      {/* Header */}
      <div className="p-3.5 bg-slate-50/90 flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center shadow-xs"
          style={{ backgroundColor: marker.color || "#0A2540" }}
        >
          {renderCategoryIcon()}
        </div>

        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-bold text-xs text-slate-900 leading-snug truncate">
              {marker.title || marker.name || marker.label || "Lokasi Titik"}
            </h4>
            {marker.statusLabel && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none whitespace-nowrap uppercase tracking-wider"
                style={{
                  backgroundColor: `${marker.color || "#0A2540"}15`,
                  color: marker.color || "#0A2540",
                  border: `1px solid ${marker.color || "#0A2540"}35`,
                }}
              >
                {marker.statusLabel}
              </span>
            )}
          </div>

          {(marker.subtitle || marker.outletCode || marker.officeCode) && (
            <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
              {marker.subtitle || marker.outletCode || marker.officeCode}
            </p>
          )}

          {liveDistMeters !== null && (
            <div className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-navy bg-navy/10 px-2 py-0.5 rounded-md">
              <Compass size={10} className="text-navy" />
              <span>Jarak dari Anda: {formatDistance(liveDistMeters)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Details Body */}
      <div className="p-3.5 space-y-2.5 text-xs">
        {marker.address && (
          <div className="flex items-start gap-2 text-slate-600 leading-relaxed">
            <MapPin size={13} className="shrink-0 mt-0.5 text-slate-400" />
            <span className="text-[11px] break-words">{marker.address}</span>
          </div>
        )}

        {/* GPS Coordinates with Copy */}
        <div className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/80 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-500 font-mono">
            <Navigation size={11} className="text-slate-400" />
            <span>
              {marker.lat?.toFixed(6)}, {marker.lng?.toFixed(6)}
            </span>
          </div>
          <button
            onClick={() => handleCopyCoord()}
            title="Salin Koordinat"
            className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-navy px-1.5 py-0.5 rounded bg-white border border-slate-200 shadow-2xs transition-colors"
          >
            {copied ? (
              <>
                <Check size={10} className="text-emerald-600" />
                <span className="text-emerald-600">Tersalin</span>
              </>
            ) : (
              <>
                <Copy size={10} />
                <span>Salin</span>
              </>
            )}
          </button>
        </div>

        {/* PIC Info */}
        {(marker.ownerName || marker.contactName || marker.phone) && (
          <div className="flex items-center justify-between bg-slate-50/70 p-2 rounded-lg border border-slate-100 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-700 min-w-0">
              <User size={12} className="shrink-0 text-slate-400" />
              <span className="font-medium truncate">
                {marker.ownerName || marker.contactName || "Pemilik / PIC"}
              </span>
            </div>
            {marker.phone && (
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <a
                  href={`tel:${marker.phone}`}
                  className="p-1 rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                  title="Telepon"
                >
                  <Phone size={11} />
                </a>
                {waPhone && (
                  <a
                    href={`https://wa.me/${waPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                    title="WhatsApp"
                  >
                    <MessageCircle size={11} />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Salesman Performance Metrics */}
        {marker.metrics && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="p-2 bg-emerald-50/70 border border-emerald-100 rounded-lg">
              <div className="text-[10px] text-emerald-800 font-semibold">
                Effective Call (EC)
              </div>
              <div className="text-xs font-bold text-emerald-950 mt-0.5">
                {marker.metrics.effectiveCalls} / {marker.metrics.totalCalls} Call
                {marker.metrics.ecRate !== undefined && (
                  <span className="text-[10px] ml-1 font-normal text-emerald-700">
                    ({marker.metrics.ecRate}%)
                  </span>
                )}
              </div>
            </div>

            <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-lg">
              <div className="text-[10px] text-slate-500 font-semibold">
                Total Omset
              </div>
              <div className="text-xs font-bold text-slate-900 mt-0.5 font-mono">
                {formatRupiah(marker.metrics.revenue || marker.metrics.totalRevenue || 0)}
              </div>
            </div>
          </div>
        )}

        {/* Visit-Specific Information */}
        {marker.type === "VISIT" && (
          <div className="space-y-1.5 pt-1 text-[11px]">
            {marker.salesmanName && (
              <div className="flex justify-between text-slate-600">
                <span className="text-slate-500">Salesman:</span>
                <span className="font-semibold text-slate-900">
                  {marker.salesmanName}
                </span>
              </div>
            )}
            {marker.checkInTime && (
              <div className="flex justify-between text-slate-600">
                <span className="text-slate-500">Waktu Check-In:</span>
                <span className="font-semibold text-slate-800">
                  {marker.checkInTime}
                </span>
              </div>
            )}
            {marker.revenue !== undefined && marker.revenue > 0 && (
              <div className="flex justify-between text-slate-600">
                <span className="text-slate-500">Nilai Order:</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {formatRupiah(marker.revenue)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Office Specific Info */}
        {marker.type === "OFFICE" && (
          <div className="space-y-1.5 pt-1 text-[11px]">
            {marker.radius && (
              <div className="flex justify-between text-slate-600">
                <span className="text-slate-500">Radius Geofence:</span>
                <span className="font-semibold text-navy">
                  {marker.radius} Meter
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons Footer */}
      <div className="p-2.5 bg-slate-50 flex items-center gap-2">
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-lg bg-navy hover:bg-navy-light text-white text-[11px] font-semibold transition-colors shadow-2xs"
        >
          <Navigation size={11} />
          <span>Buka Rute Google Maps</span>
          <ExternalLink size={10} className="opacity-70 ml-0.5" />
        </a>

        {marker.onSelect && (
          <button
            onClick={() => marker.onSelect(marker)}
            className="h-7 px-2.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition-colors"
          >
            {marker.actionLabel || "Pilih"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function MapView({
  center = [-6.2146, 106.8451],
  zoom = 14,
  markers = [],
  circles = [],
  polylines = [],
  height = "400px",
  onClick,
  onMarkerClick,
  showLayerToggle = false,
  showUserLocation = true,
  showSearch = false,
  showFitBounds = true,
  isPicker = false,
  pickerPosition = null,
  onPickerChange = null,
  className = "",
}) {
  const { coords: liveUserCoords, accuracy: userAccuracy, isTracking } = useLiveLocation();
  const [followUser, setFollowUser] = useState(false);
  const [shouldFitBounds, setShouldFitBounds] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef(null);

  // Dedicated OpenStreetMap tile configuration
  const osmTileConfig = {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  };

  // Filtered markers when search query is typed
  const displayedMarkers = useMemo(() => {
    if (!searchQuery.trim()) return markers;
    const q = searchQuery.toLowerCase();
    return markers.filter(
      (m) =>
        (m.title || m.name || m.label || "").toLowerCase().includes(q) ||
        (m.subtitle || m.outletCode || m.address || "").toLowerCase().includes(q)
    );
  }, [markers, searchQuery]);

  // Center resolution
  const resolvedCenter = useMemo(() => {
    if (isPicker && pickerPosition && !isNaN(pickerPosition.lat) && !isNaN(pickerPosition.lng)) {
      return [pickerPosition.lat, pickerPosition.lng];
    }
    if (center && Array.isArray(center) && center.length === 2 && !isNaN(center[0]) && !isNaN(center[1])) {
      return center;
    }
    if (liveUserCoords && !isNaN(liveUserCoords.lat) && !isNaN(liveUserCoords.lng)) {
      return [liveUserCoords.lat, liveUserCoords.lng];
    }
    return [-6.2146, 106.8451];
  }, [center, isPicker, pickerPosition, liveUserCoords]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleCenterUser = () => {
    setFollowUser(true);
    setTimeout(() => setFollowUser(false), 1500);
  };

  const handlePickerDrag = (e) => {
    const latlng = e.target.getLatLng();
    if (onPickerChange) {
      onPickerChange({
        lat: Number(latlng.lat.toFixed(6)),
        lng: Number(latlng.lng.toFixed(6)),
      });
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ height: isFullscreen ? "100vh" : height }}
      className={`rounded-2xl overflow-hidden border border-slate-200/90 relative z-10 shadow-xs group bg-slate-100 flex flex-col ${className}`}
      data-testid="map-view"
    >
      {/* Floating Map Utility Toolbar */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-400 flex items-center justify-between gap-2 pointer-events-none">
        {/* Search inside map */}
        {showSearch && markers.length > 0 ? (
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-md flex items-center gap-1.5 w-64 max-w-[60%]">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder={`Cari di antara ${markers.length} titik...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs w-full outline-none text-slate-800 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ) : (
          <div />
        )}

        {/* Control buttons group */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-slate-200 shadow-md">
          {/* Real-time GPS Tracker Center Button */}
          {showUserLocation && (
            <button
              onClick={() => handleCenterUser()}
              title={liveUserCoords ? "Arahkan ke Lokasi Saya (Real-time GPS)" : "GPS sedang mendeteksi..."}
              className={`p-1.5 rounded-lg transition-colors text-[11px] font-semibold flex items-center gap-1 ${
                followUser
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-700 hover:bg-slate-100 hover:text-navy"
              }`}
            >
              <Crosshair size={14} className={isTracking ? "text-blue-600" : "text-slate-400"} />
              <span className="hidden sm:inline">Lokasi Saya</span>
            </button>
          )}

          {/* Fit all bounds */}
          {showFitBounds && markers.length > 0 && (
            <button
              onClick={() => setShouldFitBounds(true)}
              title="Tampilkan Semua Titik di Layar"
              className="p-1.5 text-slate-700 hover:bg-slate-100 hover:text-navy rounded-lg transition-colors text-[11px] font-semibold flex items-center gap-1"
            >
              <RotateCcw size={14} />
              <span className="hidden md:inline">Semua Titik</span>
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={() => toggleFullscreen()}
            title={isFullscreen ? "Keluar Layar Penuh" : "Buka Layar Penuh"}
            className="p-1.5 text-slate-700 hover:bg-slate-100 hover:text-navy rounded-lg transition-colors"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Real-time Status Badge Bar */}
      <div className="absolute bottom-2 left-2.5 z-400 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-200/90 shadow-xs flex items-center gap-2 text-[10px] text-slate-700">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-bold text-slate-900">Real-time GPS Aktif</span>
          {userAccuracy && (
            <span className="text-slate-500 font-mono border-l border-slate-200 pl-1.5">
              ±{userAccuracy}m
            </span>
          )}
        </div>
      </div>

      {/* Picker info footer */}
      {isPicker && pickerPosition && (
        <div className="absolute bottom-2 right-2.5 z-400 pointer-events-none">
          <div className="bg-navy/95 text-white backdrop-blur-md px-3 py-1.5 rounded-xl border border-navy-light shadow-md flex items-center gap-2 text-xs">
            <MapPin size={13} className="text-gold" />
            <span className="font-mono font-bold">
              {pickerPosition.lat.toFixed(6)}, {pickerPosition.lng.toFixed(6)}
            </span>
            <span className="text-[10px] text-slate-300 hidden sm:inline">
              (Klik atau seret pin merah)
            </span>
          </div>
        </div>
      )}

      {/* Leaflet Map Canvas */}
      <MapContainer
        center={resolvedCenter}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <ChangeView
          center={resolvedCenter}
          zoom={zoom}
          followUser={followUser}
          userCoords={liveUserCoords}
          onUserDrag={() => setFollowUser(false)}
        />

        <FitBoundsHandler
          markers={displayedMarkers}
          shouldFit={shouldFitBounds}
          onFitComplete={() => setShouldFitBounds(false)}
        />

        <TileLayer
          url={osmTileConfig.url}
          attribution={osmTileConfig.attribution}
          maxZoom={osmTileConfig.maxZoom}
        />

        {/* Real-time User GPS Location Marker */}
        {showUserLocation && liveUserCoords && !isNaN(liveUserCoords.lat) && !isNaN(liveUserCoords.lng) && (
          <>
            <Circle
              center={[liveUserCoords.lat, liveUserCoords.lng]}
              radius={userAccuracy || 15}
              pathOptions={{
                color: "#3B82F6",
                fillColor: "#3B82F6",
                fillOpacity: 0.12,
                weight: 1.5,
              }}
            />
            <Marker
              position={[liveUserCoords.lat, liveUserCoords.lng]}
              icon={getUserLocationIcon()}
              zIndexOffset={1000}
            >
              <Popup className="modern-leaflet-popup">
                <div className="p-3 bg-white text-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-navy">
                    <Radio size={14} className="text-blue-600 animate-pulse" />
                    <span>Lokasi Anda Saat Ini</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Koordinat GPS real-time terhubung aktif.
                  </p>
                  <div className="bg-slate-50 p-2 rounded-lg font-mono text-[11px] text-slate-600 border border-slate-100 flex items-center justify-between">
                    <span>
                      {liveUserCoords.lat.toFixed(6)}, {liveUserCoords.lng.toFixed(6)}
                    </span>
                    <span className="text-[10px] text-blue-600 font-sans font-bold">
                      ±{userAccuracy || 10}m
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {/* Draggable Picker Marker for Coordinates Selection */}
        {isPicker && pickerPosition && (
          <Marker
            position={[pickerPosition.lat, pickerPosition.lng]}
            icon={getPickerMarkerIcon()}
            draggable={true}
            eventHandlers={{
              dragend: handlePickerDrag,
            }}
            zIndexOffset={1500}
          >
            <Popup className="modern-leaflet-popup">
              <div className="p-3 bg-white text-slate-800 space-y-1 text-xs text-center">
                <div className="font-bold text-navy">Titik Lokasi Terpilih</div>
                <div className="font-mono text-[11px] text-slate-600">
                  {pickerPosition.lat.toFixed(6)}, {pickerPosition.lng.toFixed(6)}
                </div>
                <p className="text-[10px] text-slate-400">
                  Seret pin ini untuk memindahkan koordinat secara presisi.
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Geofence Circles (e.g. Office / Outlet Radius) */}
        {circles.map((c, i) => (
          <Circle
            key={c.id || c.key || `circle-${c.lat}-${c.lng}-${c.radius}-${i}`}
            center={[c.lat, c.lng]}
            radius={c.radius}
            pathOptions={{
              color: c.color || "#0A2540",
              fillColor: c.color || "#0A2540",
              weight: 1.8,
              fillOpacity: 0.08,
              dashArray: c.dashArray || null,
            }}
          />
        ))}

        {/* Polylines (e.g. Route / Sales Trail) */}
        {polylines.map((p, i) => (
          <Polyline
            key={p.id || `poly-${i}`}
            positions={p.positions}
            pathOptions={{
              color: p.color || "#C5A059",
              weight: p.weight || 3.5,
              dashArray: p.dashArray,
              opacity: p.opacity || 0.85,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ))}

        {/* Rich Interactive Markers */}
        {displayedMarkers.map((m, i) => {
          if (!m || isNaN(m.lat) || isNaN(m.lng)) return null;
          const markerIcon = getCustomMarkerIcon(m);

          return (
            <Marker
              key={m.id || m.key || `marker-${m.lat}-${m.lng}-${i}`}
              position={[m.lat, m.lng]}
              icon={markerIcon}
              eventHandlers={{
                click: () => {
                  if (onMarkerClick) onMarkerClick(m);
                },
              }}
            >
              <Popup
                className="modern-leaflet-popup"
                minWidth={280}
                maxWidth={340}
                autoPanPadding={[20, 20]}
              >
                <MarkerPopupCard marker={m} userCoords={liveUserCoords} />
              </Popup>
            </Marker>
          );
        })}

        {/* Click Handler */}
        <ClickHandler
          onClick={() => onClick()}
          isPicker={isPicker}
          onPickerMove={onPickerChange}
        />
      </MapContainer>
    </div>
  );
}
