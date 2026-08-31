import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  Navigation,
  Camera,
  MapPin,
  ChevronRight,
  AlertTriangle,
  Store,
  X,
  Check,
  Phone,
  User,
  List,
  Map as MapIcon,
  Compass,
} from "lucide-react";
import api, { errMsg, errDetail } from "../../lib/api";
import { getPosition, haversineMeters, formatDistance } from "../../lib/geo";
import { compressPhoto, formatBytes, MAX_PHOTO_BYTES } from "../../lib/imageCompressor";
import StatusBadge from "../../components/StatusBadge";
import LifecycleBadge from "../../components/LifecycleBadge";
import RegionSelectGroup from "../../components/admin/RegionSelectGroup";
import MapView from "../../components/MapView";
import { useLiveLocation } from "../../context/LiveLocationContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

export default function OutletsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "search";
  return (
    <div className="space-y-4" data-testid="outlets-page">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-navy tracking-tight flex items-center gap-2">
          <Store className="text-gold" size={22} />
          Manajemen Outlet
        </h2>
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList className="w-full grid grid-cols-3 bg-slate-200/70 p-1 rounded-xl">
          <TabsTrigger value="search" data-testid="tab-search" className="rounded-lg font-bold text-xs">Cari Outlet</TabsTrigger>
          <TabsTrigger value="nearby" data-testid="tab-nearby" className="rounded-lg font-bold text-xs">Terdekat (GPS)</TabsTrigger>
          <TabsTrigger value="new" data-testid="tab-new" className="rounded-lg font-bold text-xs">+ Tambah Baru</TabsTrigger>
        </TabsList>
        <TabsContent value="search"><SearchTab /></TabsContent>
        <TabsContent value="nearby"><NearbyTab /></TabsContent>
        <TabsContent value="new"><NewOutletTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function OutletRow({ o, right, testid, onClick, userCoords }) {
  const distanceStr = useMemo(() => {
    if (o.distance_m !== undefined) return formatDistance(o.distance_m);
    if (userCoords && o.latitude && o.longitude) {
      const d = haversineMeters(userCoords.lat, userCoords.lng, o.latitude, o.longitude);
      return formatDistance(d);
    }
    return null;
  }, [o, userCoords]);

  return (
    <button
      data-testid={testid}
      onClick={() => onClick()}
      className="w-full bg-white border border-slate-200/90 hover:border-navy/40 rounded-2xl p-4 flex items-center gap-3.5 text-left shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all"
    >
      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-navy shrink-0 font-bold">
        <Store size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-navy truncate max-w-[180px]">{o.outlet_name}</span>
          <LifecycleBadge status={o.lifecycle_status} size="sm" />
          {o.status !== "ACTIVE" && <StatusBadge status={o.status} />}
        </div>
        <div className="text-xs text-slate-500 truncate mt-0.5">{o.address || "Alamat belum diatur"}</div>
        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
          <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded font-semibold text-slate-600">{o.outlet_code}</span>
          {o.owner_name && <span>· {o.owner_name}</span>}
          {o.channel_name && <span className="bg-slate-100 px-1.5 py-0.2 rounded">{o.channel_name}</span>}
          {distanceStr && (
            <span className="text-navy font-bold flex items-center gap-0.5 bg-navy/5 px-1.5 py-0.2 rounded">
              <Compass size={10} /> {distanceStr}
            </span>
          )}
        </div>
      </div>
      {right || <ChevronRight size={18} className="text-slate-300 shrink-0" />}
    </button>
  );
}

function SearchTab() {
  const navigate = useNavigate();
  const { coords: userCoords } = useLiveLocation();
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("list"); // list | map
  const timer = useRef(null);

  const search = useCallback(async (kw) => {
    setLoading(true);
    try {
      const { data } = await api.get("/outlets", { params: { q: kw, limit: 40 } });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    search("");
  }, [search]);

  const onChange = (v) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 400);
  };

  const mapMarkers = useMemo(() => {
    return items
      .filter((o) => o.latitude && o.longitude)
      .map((o) => {
        let color = "#0A2540";
        if (o.lifecycle_status === "LOYAL") color = "#10B981";
        else if (o.lifecycle_status === "REPEAT") color = "#3B82F6";
        else if (o.lifecycle_status === "NEW") color = "#F59E0B";

        return {
          id: o._id,
          lat: Number(o.latitude),
          lng: Number(o.longitude),
          title: o.outlet_name,
          subtitle: o.address,
          outletCode: o.outlet_code,
          phone: o.phone,
          ownerName: o.owner_name,
          color,
          type: "OUTLET",
          statusLabel: o.lifecycle_status || o.status,
          onSelect: () => navigate(`/outlets/${o._id}`),
          actionLabel: "Buka Toko",
        };
      });
  }, [items, navigate]);

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="outlet-search-input"
            placeholder="Cari nama toko, pemilik, telepon, atau kode..."
            value={q}
            onChange={(e) => onChange(e.target.value)}
            className="pl-10 pr-9 h-11 rounded-xl bg-white border-slate-200 shadow-2xs"
          />
          {q && (
            <button
              onClick={() => { setQ(""); search(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex bg-slate-200/80 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setViewMode("list")}
              title="Tampilan Daftar"
              className={`p-2 rounded-lg transition-all text-xs font-bold ${
                viewMode === "list" ? "bg-white text-navy shadow-xs" : "text-slate-600 hover:text-navy"
              }`}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode("map")}
              title="Tampilan Peta Real-Time"
              className={`p-2 rounded-lg transition-all text-xs font-bold ${
                viewMode === "map" ? "bg-white text-navy shadow-xs" : "text-slate-600 hover:text-navy"
              }`}
            >
              <MapIcon size={16} />
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-navy" size={24} />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-2xs" data-testid="outlet-search-empty">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-2">
            <Store size={22} />
          </div>
          <div className="text-sm font-bold text-navy">Tidak ada outlet ditemukan</div>
          <p className="text-xs text-slate-500 mt-1">Coba kata kunci lain atau gunakan tab Tambah Baru.</p>
        </div>
      )}

      {/* Map View Mode */}
      {viewMode === "map" && !loading && items.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-navy flex items-center gap-1.5">
              <MapIcon size={15} className="text-gold" />
              Peta Sebaran Outlet ({mapMarkers.length} Toko)
            </span>
          </div>
          <MapView
            center={userCoords ? [userCoords.lat, userCoords.lng] : [-6.2146, 106.8451]}
            zoom={13}
            height="400px"
            markers={mapMarkers}
            showUserLocation={true}
            showLayerToggle={true}
            showFitBounds={true}
          />
        </div>
      )}

      {/* List View Mode */}
      {viewMode === "list" && (
        <div className="space-y-2">
          {items.map((o, i) => (
            <OutletRow
              key={o._id}
              o={o}
              testid={`outlet-row-${i}`}
              onClick={() => navigate(`/outlets/${o._id}`)}
              userCoords={userCoords}
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="text-center text-[11px] text-slate-400 font-medium py-1">
          Menampilkan {items.length} dari {total} outlet terdaftar
        </div>
      )}
    </div>
  );
}

function NearbyTab() {
  const navigate = useNavigate();
  const { coords: liveCoords, forceRefreshGps } = useLiveLocation();
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("list");

  const locate = async () => {
    setLoading(true);
    try {
      let pos = liveCoords;
      if (!pos) {
        pos = await forceRefreshGps();
      }
      if (!pos) {
        const rawPos = await getPosition();
        pos = { lat: rawPos.latitude, lng: rawPos.longitude };
      }

      const { data } = await api.get("/outlets/nearby", {
        params: { lat: pos.lat, lng: pos.lng, radius: 5000 },
      });
      setItems(data.items || []);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (liveCoords && !items) {
      locate();
    }
  }, [liveCoords]);

  const mapMarkers = useMemo(() => {
    return (items || [])
      .filter((o) => o.latitude && o.longitude)
      .map((o) => ({
        id: o._id,
        lat: Number(o.latitude),
        lng: Number(o.longitude),
        title: o.outlet_name,
        subtitle: o.address,
        outletCode: o.outlet_code,
        phone: o.phone,
        ownerName: o.owner_name,
        color: "#10B981",
        type: "OUTLET",
        statusLabel: `${Math.round(o.distance_m)}m`,
        badge: `${Math.round(o.distance_m)}m`,
        onSelect: () => navigate(`/outlets/${o._id}`),
        actionLabel: "Buka Toko",
      }));
  }, [items, navigate]);

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <Button
          data-testid="nearby-locate-button"
          onClick={() => locate()}
          disabled={loading}
          className="flex-1 h-12 bg-navy hover:bg-navy-light text-white font-bold rounded-xl shadow-xs transition-all active:scale-[0.98]"
        >
          {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <Navigation className="mr-2" size={18} />}
          Cari Outlet Terdekat (Radius 5 km)
        </Button>

        {items && items.length > 0 && (
          <div className="flex bg-slate-200/80 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-lg text-xs font-bold ${
                viewMode === "list" ? "bg-white text-navy shadow-xs" : "text-slate-600"
              }`}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`p-2 rounded-lg text-xs font-bold ${
                viewMode === "map" ? "bg-white text-navy shadow-xs" : "text-slate-600"
              }`}
            >
              <MapIcon size={16} />
            </button>
          </div>
        )}
      </div>

      {viewMode === "map" && items && items.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-2">
          <MapView
            center={liveCoords ? [liveCoords.lat, liveCoords.lng] : [-6.2146, 106.8451]}
            zoom={14}
            height="400px"
            markers={mapMarkers}
            showUserLocation={true}
            showLayerToggle={true}
            showFitBounds={true}
          />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500 shadow-2xs" data-testid="nearby-empty">
          Tidak ada outlet aktif dalam radius 5 km dari lokasi Anda saat ini.
        </div>
      )}

      {viewMode === "list" && (
        <div className="space-y-2">
          {(items || []).map((o, i) => (
            <OutletRow
              key={o._id}
              o={o}
              testid={`nearby-row-${i}`}
              onClick={() => navigate(`/outlets/${o._id}`)}
              right={
                <span className="text-xs font-bold text-navy bg-gold/20 border border-gold/40 px-2 py-1 rounded-lg shrink-0">
                  {Math.round(o.distance_m)} m
                </span>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NewOutletTab() {
  const navigate = useNavigate();
  const { coords: liveCoords, forceRefreshGps } = useLiveLocation();
  const [form, setForm] = useState({
    outlet_name: "",
    owner_name: "",
    phone: "",
    address: "",
    street_address: "",
    address_line: "",
    province_id: "prov-32",
    province_name: "JAWA BARAT",
    regency_id: "reg-3203",
    regency_name: "KABUPATEN CIANJUR",
    district_id: "dist-320301",
    district_name: "CIANJUR",
    village_id: "vil-32030101",
    village_name: "PAMOYANAN",
    postal_code: "43211",
    area_id: "",
    channel_id: "",
    city: "",
    notes: "",
  });
  const [geo, setGeo] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [areas, setAreas] = useState([]);
  const [channels, setChannels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dups, setDups] = useState(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [photoInfo, setPhotoInfo] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, c] = await Promise.all([
          api.get("/masters/areas", { params: { status: "ACTIVE", limit: 100 } }),
          api.get("/masters/channels", { params: { status: "ACTIVE", limit: 100 } }),
        ]);
        setAreas(a.data.items || a.data || []);
        setChannels(c.data.items || c.data || []);
        if (a.data.items?.[0]) {
          setForm((f) => ({ ...f, area_id: a.data.items[0]._id }));
        }
        if (c.data.items?.[0]) {
          setForm((f) => ({ ...f, channel_id: c.data.items[0]._id }));
        }
      } catch (e) {
        toast.error(errMsg(e));
      }
    })();
  }, []);

  const grabGps = async () => {
    try {
      let pos = await forceRefreshGps();
      if (!pos) {
        const raw = await getPosition();
        pos = { latitude: raw.latitude, longitude: raw.longitude, accuracy: raw.accuracy };
      } else {
        pos = { latitude: pos.lat, longitude: pos.lng, accuracy: pos.accuracy || 8 };
      }
      setGeo(pos);
      toast.success(`Lokasi GPS didapat (akurasi ±${Math.round(pos.accuracy)}m)`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCompressing(true);
    try {
      const result = await compressPhoto(f, {
        maxSizeBytes: MAX_PHOTO_BYTES,
        initialQuality: 0.85,
      });
      setPhoto(result.dataUrl);
      setPhotoInfo(result);
      toast.success(`Foto terkompresi: ${formatBytes(result.compressedSize)} (Maks 500 KB)`);
    } catch (err) {
      toast.error(err.message || "Gagal mengompres foto");
    } finally {
      setCompressing(false);
    }
  };

  const handleRegionChange = (regionData) => {
    setForm((f) => ({
      ...f,
      ...regionData,
      address_line: regionData.street_address,
      city: regionData.regency_name,
    }));
  };

  const submit = async (force = false) => {
    if (!form.outlet_name.trim()) {
      toast.error("Nama outlet wajib diisi");
      return;
    }
    if (!form.province_id || !form.regency_id || !form.district_id || !form.village_id) {
      toast.error("Pilih struktur wilayah administratif secara lengkap dari Master Data");
      return;
    }
    if (!geo) {
      toast.error("Ambil lokasi GPS terlebih dahulu");
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form, latitude: geo.latitude, longitude: geo.longitude, photo, force_create: force };
      const { data } = await api.post("/outlets", payload);
      setDups(null);
      toast.success(
        data.status === "PENDING_APPROVAL"
          ? "Outlet diajukan dan menunggu approval supervisor"
          : "Outlet berhasil dibuat"
      );
      navigate(`/outlets/${data._id}`);
    } catch (e) {
      const d = errDetail(e);
      if (e.response?.status === 409 && d?.duplicates) {
        setDups(d.duplicates);
      } else {
        toast.error(errMsg(e));
      }
    }
    setBusy(false);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-2xs space-y-3.5 pt-4" data-testid="new-outlet-form">
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-slate-700">Nama Outlet / Toko *</Label>
        <Input data-testid="new-outlet-name" value={form.outlet_name} onChange={set("outlet_name")} placeholder="Contoh: Toko Berkah Jaya" className="h-11 rounded-xl" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-slate-700">Nama Pemilik / Penanggung Jawab</Label>
        <Input data-testid="new-outlet-owner" value={form.owner_name} onChange={set("owner_name")} placeholder="Contoh: Bpk. H. Ahmad" className="h-11 rounded-xl" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-slate-700">Nomor Telepon / WhatsApp</Label>
        <Input data-testid="new-outlet-phone" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="08xxxxxxxxxx" className="h-11 rounded-xl" />
      </div>

      {/* Master Wilayah Administratif 4 Tingkat */}
      <RegionSelectGroup
        value={{
          province_id: form.province_id,
          province_name: form.province_name,
          regency_id: form.regency_id,
          regency_name: form.regency_name,
          district_id: form.district_id,
          district_name: form.district_name,
          village_id: form.village_id,
          village_name: form.village_name,
          postal_code: form.postal_code,
          street_address: form.street_address || form.address_line || form.address,
        }}
        onChange={handleRegionChange}
        required={true}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-700">Area Operasional *</Label>
          <Select value={form.area_id} onValueChange={(v) => setForm((f) => ({ ...f, area_id: v }))}>
            <SelectTrigger data-testid="new-outlet-area" className="h-11 rounded-xl"><SelectValue placeholder="Pilih area" /></SelectTrigger>
            <SelectContent>
              {areas.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-700">Channel</Label>
          <Select value={form.channel_id} onValueChange={(v) => setForm((f) => ({ ...f, channel_id: v }))}>
            <SelectTrigger data-testid="new-outlet-channel" className="h-11 rounded-xl"><SelectValue placeholder="Pilih channel" /></SelectTrigger>
            <SelectContent>
              {channels.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-slate-700">Catatan / Patokan Lokasi (Opsional)</Label>
        <Input
          value={form.notes}
          onChange={set("notes")}
          placeholder="Contoh: Sebelah pos ronda / Toko buka jam 07:30"
          className="h-11 rounded-xl text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <Button
          type="button"
          variant="outline"
          data-testid="new-outlet-gps"
          onClick={() => grabGps()}
          className={`h-11 rounded-xl font-bold border transition-all ${
            geo ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-navy text-navy"
          }`}
        >
          {geo ? <Check size={16} className="mr-1.5 text-emerald-600" /> : <MapPin size={16} className="mr-1.5" />}
          {geo ? `GPS OK (±${Math.round(geo.accuracy)}m)` : "Ambil GPS Lokasi"}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="new-outlet-photo"
          disabled={compressing}
          onClick={() => fileRef.current?.click()}
          className={`h-11 rounded-xl font-bold border transition-all ${
            photo ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-navy text-navy"
          }`}
        >
          {compressing ? (
            <>
              <Loader2 size={16} className="mr-1.5 animate-spin" />
              Kompresi...
            </>
          ) : photo ? (
            <>
              <Check size={16} className="mr-1.5 text-emerald-600" />
              Foto Siap
            </>
          ) : (
            <>
              <Camera size={16} className="mr-1.5" />
              Foto Outlet
            </>
          )}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          data-testid="new-outlet-photo-input"
          onChange={onPhoto}
        />
      </div>

      {/* Interactive Map Picker Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowMapPicker(!showMapPicker)}
          className="text-xs font-semibold text-navy hover:underline flex items-center gap-1"
        >
          <MapIcon size={13} className="text-gold" />
          {showMapPicker ? "Tutup Peta Penyesuaian Titik" : "Sesuaikan Koordinat via Peta Interaktif"}
        </button>

        {showMapPicker && (
          <div className="mt-2 space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50">
            <MapView
              center={
                geo
                  ? [geo.latitude, geo.longitude]
                  : liveCoords
                  ? [liveCoords.lat, liveCoords.lng]
                  : [-6.2146, 106.8451]
              }
              zoom={16}
              height="240px"
              isPicker={true}
              pickerPosition={
                geo
                  ? { lat: geo.latitude, lng: geo.longitude }
                  : liveCoords
                  ? { lat: liveCoords.lat, lng: liveCoords.lng }
                  : { lat: -6.2146, lng: 106.8451 }
              }
              onPickerChange={(pos) => setGeo({ latitude: pos.lat, longitude: pos.lng, accuracy: 5 })}
              showUserLocation={true}
            />
            <p className="text-[10px] text-slate-400 text-center">
              Klik pada peta atau seret pin merah untuk mengatur posisi toko secara presisi.
            </p>
          </div>
        )}
      </div>

      {photo && (
        <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-2 overflow-hidden space-y-1.5">
          <div className="relative">
            <img src={photo} alt="Foto outlet" className="w-full h-36 object-cover rounded-lg border border-slate-200" />
            <button
              type="button"
              onClick={() => {
                setPhoto(null);
                setPhotoInfo(null);
              }}
              className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1 rounded-full shadow-sm"
              title="Hapus foto"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span className="flex items-center gap-1 font-medium text-emerald-700">
              <Check size={12} />
              Terkonfirmasi &lt; 500 KB
            </span>
            {photoInfo && (
              <span>
                {photoInfo.width}x{photoInfo.height} px • {formatBytes(photoInfo.compressedSize)}
              </span>
            )}
          </div>
        </div>
      )}

      <Button
        data-testid="new-outlet-submit"
        disabled={busy}
        onClick={() => submit(false)}
        className="w-full h-12 bg-gradient-to-r from-gold to-gold-light hover:brightness-105 text-navy-dark font-bold rounded-xl shadow-xs transition-all active:scale-[0.98]"
      >
        {busy ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
        Ajukan Outlet Baru
      </Button>
      <p className="text-[10px] text-slate-400 text-center">Outlet baru dari sales akan diverifikasi melalui approval supervisor/admin.</p>

      <Dialog open={!!dups} onOpenChange={() => setDups(null)}>
        <DialogContent data-testid="duplicate-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="text-amber-500" size={18} /> Kemungkinan Duplikat</DialogTitle>
            <DialogDescription>Kemungkinan outlet duplikat ditemukan. Gunakan outlet existing atau tetap ajukan outlet baru.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-auto">
            {(dups || []).map((d) => (
              <button
                key={d.outlet_id}
                data-testid={`dup-use-${d.outlet_id}`}
                onClick={() => navigate(`/outlets/${d.outlet_id}`)}
                className="w-full text-left bg-slate-50 border border-slate-200 rounded-lg p-3"
              >
                <div className="font-bold text-sm text-navy">{d.outlet_name} <span className="text-slate-400 font-normal">({d.outlet_code})</span></div>
                <div className="text-xs text-slate-500">{d.address}</div>
                <div className="text-[10px] text-amber-600 font-bold mt-1">{d.reason}</div>
              </button>
            ))}
          </div>
          <Button data-testid="dup-force-create" disabled={busy} onClick={() => submit(true)} variant="outline" className="w-full border-navy text-navy font-bold">
            Tetap Ajukan Outlet Baru
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
