import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  MapPin,
  Phone,
  User,
  Camera,
  Check,
  LogIn,
  Loader2,
  Store,
  Navigation,
  ExternalLink,
  ShieldCheck,
  Compass,
  MessageCircle,
} from "lucide-react";
import api, { errMsg, errDetail } from "../../lib/api";
import { getPosition, haversineMeters, formatDistance } from "../../lib/geo";
import { compressPhoto, formatBytes, MAX_PHOTO_BYTES } from "../../lib/imageCompressor";
import { Button } from "../../components/ui/button";
import LifecycleBadge from "../../components/LifecycleBadge";
import MapView from "../../components/MapView";
import { useLiveLocation } from "../../context/LiveLocationContext";

export default function OutletDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { coords: userCoords, accuracy: userAccuracy } = useLiveLocation();
  const [outlet, setOutlet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photo, setPhoto] = useState(null);
  const [photoInfo, setPhotoInfo] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/outlets/${id}`);
      setOutlet(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      const result = await compressPhoto(file, {
        maxSizeBytes: MAX_PHOTO_BYTES,
        initialQuality: 0.85,
      });
      setPhoto(result.dataUrl);
      setPhotoInfo(result);
      toast.success(`Foto terkompresi: ${formatBytes(result.compressedSize)} (Maks 500 KB)`);
    } catch (err) {
      toast.error(err.message || "Gagal mengompres foto.");
    } finally {
      setCompressing(false);
    }
  };

  const startVisit = async () => {
    setBusy(true);
    try {
      let lat = userCoords?.lat;
      let lng = userCoords?.lng;
      let acc = userAccuracy || 10;

      if (!lat || !lng) {
        const pos = await getPosition();
        lat = pos.latitude;
        lng = pos.longitude;
        acc = pos.accuracy;
      }

      const payload = {
        outlet_id: outlet._id,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        photo_url: photo || undefined,
      };
      const { data } = await api.post("/visits/check-in", payload);
      toast.success(data.message || "Check-in kunjungan berhasil.");
      navigate("/visit");
    } catch (e) {
      const d = errDetail(e);
      if (e.response?.status === 400 && e.response?.data?.active_visit) {
        toast.info("Anda sudah memiliki kunjungan aktif.");
        navigate("/visit");
      } else {
        toast.error(typeof d === "string" ? d : errMsg(e));
      }
    }
    setBusy(false);
  };

  // Real-time Geofence Calculations
  const { liveDistanceMeters, isInGeofence, mapMarkers, mapCircles, mapCenter } = useMemo(() => {
    const lat = Number(outlet?.latitude);
    const lng = Number(outlet?.longitude);
    const hasOutletCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;

    let dist = null;
    let inGeofence = false;

    if (hasOutletCoords && userCoords && !isNaN(userCoords.lat) && !isNaN(userCoords.lng)) {
      dist = haversineMeters(userCoords.lat, userCoords.lng, lat, lng);
      inGeofence = dist <= 100; // 100m geofence
    }

    const markers = [];
    const circles = [];

    if (hasOutletCoords) {
      markers.push({
        id: outlet._id,
        lat,
        lng,
        title: outlet.outlet_name,
        subtitle: outlet.address,
        outletCode: outlet.outlet_code,
        phone: outlet.phone,
        ownerName: outlet.owner_name,
        color: "#0A2540",
        type: "OUTLET",
        statusLabel: outlet.lifecycle_status || outlet.status,
      });

      circles.push({
        id: `geofence-${outlet._id}`,
        lat,
        lng,
        radius: 100, // 100 meter radius standard
        color: inGeofence ? "#10B981" : "#3B82F6",
      });
    }

    const center = hasOutletCoords
      ? [lat, lng]
      : userCoords
      ? [userCoords.lat, userCoords.lng]
      : [-6.2146, 106.8451];

    return {
      liveDistanceMeters: dist,
      isInGeofence: inGeofence,
      mapMarkers: markers,
      mapCircles: circles,
      mapCenter: center,
    };
  }, [outlet, userCoords]);

  if (loading) {
    return (
      <div className="flex justify-center py-24" data-testid="outlet-detail-loading">
        <Loader2 className="animate-spin text-navy" size={28} />
      </div>
    );
  }

  if (!outlet) {
    return (
      <div className="space-y-4" data-testid="outlet-detail-empty">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <Store className="mx-auto text-slate-300" size={36} />
          <div className="text-sm font-bold text-navy">Outlet tidak ditemukan</div>
          <Button data-testid="back-button" onClick={() => navigate("/outlets")} className="bg-navy text-white">
            Kembali
          </Button>
        </div>
      </div>
    );
  }

  const cleanPhone = outlet.phone ? outlet.phone.replace(/[^0-9]/g, "") : "";
  const waPhone = cleanPhone.startsWith("0") ? `62${cleanPhone.slice(1)}` : cleanPhone;

  return (
    <div className="space-y-4" data-testid="outlet-detail-page">
      <button
        data-testid="back-button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy hover:text-navy-light"
      >
        <ArrowLeft size={16} /> Kembali
      </button>

      {/* Outlet Header Card */}
      <div className="bg-navy rounded-2xl p-5 text-white space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-bold">{outlet.outlet_code}</span>
          <LifecycleBadge status={outlet.lifecycle_status} size="sm" />
        </div>
        <div className="font-heading text-xl font-bold" data-testid="outlet-detail-name">
          {outlet.outlet_name}
        </div>
        <div className="text-xs text-slate-300 flex items-start gap-1.5">
          <MapPin size={13} className="mt-0.5 shrink-0" /> {outlet.address || "-"}
        </div>
      </div>

      {/* Interactive Geofence Map */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-navy flex items-center gap-1.5">
            <Compass size={15} className="text-gold" />
            Peta Lokasi &amp; Validasi Geofence Real-time
          </span>

          {liveDistanceMeters !== null && (
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                isInGeofence
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-amber-100 text-amber-800 border border-amber-300"
              }`}
            >
              <ShieldCheck size={12} />
              {isInGeofence
                ? `Dalam Geofence (${formatDistance(liveDistanceMeters)})`
                : `Di Luar Geofence (${formatDistance(liveDistanceMeters)})`}
            </span>
          )}
        </div>

        <MapView
          center={mapCenter}
          zoom={16}
          height="220px"
          markers={mapMarkers}
          circles={mapCircles}
          showUserLocation={true}
          showLayerToggle={true}
          showFitBounds={false}
        />

        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 gap-2">
          <span className="text-[11px] text-slate-500 font-mono">
            Radius Geofence Check-in: 100 Meter
          </span>

          {outlet.latitude && outlet.longitude && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${outlet.latitude},${outlet.longitude}${
                userCoords ? `&origin=${userCoords.lat},${userCoords.lng}` : ""
              }`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-navy hover:text-navy-light bg-slate-100 px-2.5 py-1 rounded-lg"
            >
              <Navigation size={12} />
              <span>Petunjuk Arah</span>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>

      {/* Outlet Details Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
        {outlet.status === "PENDING" && (
          <div data-testid="outlet-pending-banner" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-xs font-semibold">
            Outlet baru ini menunggu persetujuan supervisor sebelum bisa dikunjungi.
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <User size={15} className="text-slate-400" /> {outlet.owner_name || "-"}
          </div>
          {outlet.phone && (
            <div className="flex items-center gap-2">
              <a href={`tel:${outlet.phone}`} className="p-1 rounded bg-slate-100 text-slate-700">
                <Phone size={14} />
              </a>
              {waPhone && (
                <a
                  href={`https://wa.me/${waPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded bg-emerald-50 text-emerald-700"
                >
                  <MessageCircle size={14} />
                </a>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-navy">{outlet.channel_name || "-"}</span> · {outlet.area_name || "-"}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          <div className="text-center">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Transaksi</div>
            <div className="font-heading font-bold text-navy">{outlet.completed_transaction_count || 0}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Total Volume</div>
            <div className="font-heading font-bold text-navy">{outlet.total_volume || 0}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Status</div>
            <div className="font-heading font-bold text-navy text-xs">{outlet.status}</div>
          </div>
        </div>
      </div>

      {/* Foto kunjungan (opsional / wajib jika diatur) */}
      <div className="space-y-2">
        <button
          type="button"
          data-testid="checkin-photo-button"
          disabled={compressing}
          onClick={() => fileRef.current?.click()}
          className={`w-full flex items-center justify-center h-11 rounded-xl border-2 border-dashed font-bold text-sm transition-all ${
            photo ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-navy text-navy hover:bg-slate-50"
          }`}
        >
          {compressing ? (
            <>
              <Loader2 size={16} className="mr-1.5 animate-spin text-navy" />
              Mengompresi Foto (&le; 500 KB)...
            </>
          ) : photo ? (
            <>
              <Check size={16} className="mr-1.5 text-emerald-600" />
              Foto Check-in Siap ({photoInfo ? formatBytes(photoInfo.compressedSize) : "< 500 KB"})
            </>
          ) : (
            <>
              <Camera size={16} className="mr-1.5" />
              Ambil Foto Check-in / Papan Toko
            </>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          data-testid="checkin-photo-input"
          onChange={onPhoto}
        />

        {photo && (
          <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-2 overflow-hidden space-y-1.5">
            <div className="relative">
              <img src={photo} alt="Foto kunjungan" className="w-full h-40 object-cover rounded-lg border border-slate-200" />
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  setPhotoInfo(null);
                }}
                className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1 rounded-full shadow-sm"
                title="Hapus foto"
              >
                <Check size={14} className="hidden" />
                <span className="text-xs px-1 font-bold">✕</span>
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span className="flex items-center gap-1 font-medium text-emerald-700">
                <Check size={12} />
                Tervalidasi &lt; 500 KB
              </span>
              {photoInfo && (
                <span>
                  {photoInfo.width}x{photoInfo.height} px • {formatBytes(photoInfo.compressedSize)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <Button
        data-testid="start-visit-button"
        disabled={busy || outlet.status !== "ACTIVE"}
        onClick={startVisit}
        className="w-full h-12 bg-gradient-to-r from-gold to-gold-light hover:brightness-105 text-navy-dark font-bold text-base rounded-xl disabled:opacity-50 shadow-xs transition-all active:scale-[0.98]"
      >
        {busy ? <Loader2 className="animate-spin mr-2" size={18} /> : <LogIn size={18} className="mr-2" />}
        {outlet.status === "ACTIVE" ? "Mulai Kunjungan (Check-in)" : "Menunggu Approval Supervisor"}
      </Button>
    </div>
  );
}
