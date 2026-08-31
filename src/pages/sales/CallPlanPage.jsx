import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  ChevronRight,
  CheckCircle2,
  Route,
  Calendar,
  Store,
  Map as MapIcon,
  List,
  Compass,
  Navigation,
  Sparkles,
  Phone,
  RefreshCw,
  Search,
  ArrowUpDown,
  ExternalLink,
  Clock,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import StatusBadge from "../../components/StatusBadge";
import MapView from "../../components/MapView";
import { todayLocal, fmtDate, fmtDateShort, rupiah } from "../../lib/format";
import { useLiveLocation } from "../../context/LiveLocationContext";
import { haversineMeters, formatDistance } from "../../lib/geo";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export default function CallPlanPage() {
  const navigate = useNavigate();
  const { coords: userCoords } = useLiveLocation();
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [filter, setFilter] = useState("ALL"); // ALL | PENDING | EFFECTIVE | DONE
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("list"); // list | map

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const { data } = await api.get("/call-plans/my", { params: { date: selectedDate } });
      setData(data);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load(false);
  };

  const handleOptimizeRoute = async () => {
    if (!data?.plan?._id) return;
    setOptimizing(true);
    try {
      const res = await api.post(`/call-plans/${data.plan._id}/optimize`);
      toast.success(res.data?.message || "Rute kunjungan berhasil dioptimalkan!");
      load(false);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setOptimizing(false);
  };

  const plan = data?.plan || data?.call_plan || null;
  const items = data?.items || [];
  const summary = data?.summary || {};

  const effectiveCount = items.filter((it) => it.status === "EFFECTIVE").length;
  const completedCount = items.filter((it) => ["COMPLETED", "EFFECTIVE", "VISITED"].includes(it.status)).length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  // Filter items by status & search query
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((it) => {
      const isVisited = ["COMPLETED", "EFFECTIVE", "VISITED"].includes(it.status);
      const isEffective = it.status === "EFFECTIVE";

      if (filter === "PENDING" && isVisited) return false;
      if (filter === "DONE" && !isVisited) return false;
      if (filter === "EFFECTIVE" && !isEffective) return false;

      if (q) {
        const outlet = it.outlet || {};
        const name = (outlet.outlet_name || it.outlet_name || "").toLowerCase();
        const address = (outlet.address || it.address || "").toLowerCase();
        const phone = (outlet.phone || it.phone || "").toLowerCase();
        const owner = (outlet.owner_name || it.owner_name || "").toLowerCase();
        return name.includes(q) || address.includes(q) || phone.includes(q) || owner.includes(q);
      }

      return true;
    });
  }, [items, filter, searchQuery]);

  // Find next nearest pending outlet
  const nextTargetOutlet = useMemo(() => {
    const pendingList = items.filter((it) => !["COMPLETED", "EFFECTIVE", "VISITED"].includes(it.status));
    if (pendingList.length === 0) return null;

    if (!userCoords || isNaN(userCoords.lat) || isNaN(userCoords.lng)) {
      return pendingList[0];
    }

    let nearest = pendingList[0];
    let minDistance = Infinity;

    pendingList.forEach((it) => {
      const outlet = it.outlet || {};
      const lat = Number(outlet.latitude ?? it.latitude);
      const lng = Number(outlet.longitude ?? it.longitude);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        const dist = haversineMeters(userCoords.lat, userCoords.lng, lat, lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = { ...it, distanceInMeters: dist };
        }
      }
    });

    return nearest;
  }, [items, userCoords]);

  // Generate Map Markers & Polylines for Call Plan Route
  const { routeMarkers, routePolylines, mapCenter } = useMemo(() => {
    const markers = [];
    const validPositions = [];

    // If user coords available, start polyline from current position
    if (userCoords && !isNaN(userCoords.lat) && !isNaN(userCoords.lng)) {
      validPositions.push([userCoords.lat, userCoords.lng]);
    }

    items.forEach((it, idx) => {
      const outlet = it.outlet || {};
      const lat = Number(outlet.latitude ?? it.latitude);
      const lng = Number(outlet.longitude ?? it.longitude);
      const seq = it.sequence || idx + 1;

      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        validPositions.push([lat, lng]);

        let color = "#0A2540";
        let statusLabel = "Rute Plan";
        if (it.status === "EFFECTIVE") {
          color = "#10B981";
          statusLabel = "Effective (Order)";
        } else if (it.status === "COMPLETED") {
          color = "#3B82F6";
          statusLabel = "Selesai Visit";
        } else if (it.priority === "HIGH") {
          color = "#EF4444";
          statusLabel = "Prioritas Tinggi";
        }

        markers.push({
          id: it._id || `plan-marker-${idx}`,
          lat,
          lng,
          title: `${seq}. ${outlet.outlet_name || it.outlet_name || "Outlet"}`,
          subtitle: outlet.address || it.address,
          badge: `${seq}`,
          color,
          type: "VISIT",
          statusLabel,
          phone: outlet.phone || it.phone,
          ownerName: outlet.owner_name || it.owner_name,
          onSelect: () => navigate(`/outlets/${it.outlet_id}?plan_item=${it._id}`),
          actionLabel: "Buka Toko",
        });
      }
    });

    const polylines = [];
    if (validPositions.length >= 2) {
      polylines.push({
        id: "call-plan-route-line",
        positions: validPositions,
        color: "#C5A059",
        weight: 4,
        dashArray: "6, 6",
      });
    }

    const center =
      validPositions.length > 0
        ? validPositions[0]
        : userCoords
        ? [userCoords.lat, userCoords.lng]
        : [-6.2146, 106.8451];

    return { routeMarkers: markers, routePolylines: polylines, mapCenter: center };
  }, [items, userCoords, navigate]);

  return (
    <div className="space-y-4" data-testid="callplan-page">
      {/* Header & Date Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="font-heading text-xl font-bold text-navy tracking-tight flex items-center gap-2">
            <Route className="text-gold" size={22} />
            Rencana Kunjungan (Call Plan)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {plan
              ? `Disusun oleh ${plan.created_by_name || "Supervisor"} · ${items.length} outlet terencana`
              : "Belum ada rencana kunjungan pada tanggal ini"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Date Picker */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setSelectedDate(todayLocal())}
              className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                selectedDate === todayLocal()
                  ? "bg-navy text-white shadow-2xs"
                  : "text-slate-600 hover:text-navy"
              }`}
            >
              Hari Ini
            </button>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-7 w-36 text-xs bg-transparent border-0 font-bold text-navy focus-visible:ring-0 p-1"
            />
          </div>

          <Button
            size="icon"
            variant="outline"
            title="Refresh data"
            onClick={() => handleRefresh()}
            disabled={refreshing}
            className="h-8 w-8 rounded-xl border-slate-200"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-navy" : "text-slate-600"} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3" data-testid="callplan-loading">
          <Loader2 className="animate-spin text-navy" size={32} />
          <span className="text-sm font-medium text-slate-500">Memuat rute Call Plan...</span>
        </div>
      ) : !plan ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-xs" data-testid="callplan-empty">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <MapPin size={28} />
          </div>
          <div className="space-y-1">
            <div className="text-base font-bold text-navy">Tidak ada call plan aktif untuk {fmtDate(selectedDate)}</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Supervisor belum menerbitkan rencana kunjungan untuk tanggal ini. Anda tetap dapat melakukan kunjungan mandiri ke outlet terdaftar.
            </p>
          </div>
          <div className="flex justify-center gap-2 pt-2">
            <Button
              onClick={() => navigate("/outlets")}
              className="bg-navy text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-navy-light"
            >
              <Store size={14} className="mr-1.5" /> Buka Daftar Outlet
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Progress Card */}
          <div className="bg-gradient-to-br from-navy via-navy to-navy-dark text-white rounded-2xl p-4 shadow-sm space-y-3 border border-navy-light/20">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-gold font-bold flex items-center gap-1">
                  <Sparkles size={12} /> Target Rute Harian
                </span>
                <div className="font-heading font-bold text-lg">
                  {completedCount} dari {items.length} Outlet Selesai
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold bg-white/10 px-3 py-1 rounded-full border border-white/10">
                  {progressPercent}%
                </span>
              </div>
            </div>
            <div className="w-full bg-white/15 h-2.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gold to-gold-light rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
              <span>Effective Call (EC): <strong className="text-emerald-400">{effectiveCount} Toko</strong></span>
              <button
                onClick={() => handleOptimizeRoute()}
                disabled={optimizing || items.length <= 1}
                className="text-gold-light hover:text-white font-bold inline-flex items-center gap-1 text-[11px] underline underline-offset-2"
              >
                {optimizing ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpDown size={12} />}
                Optimalkan Urutan Rute
              </button>
            </div>
          </div>

          {/* Quick Summary Counts */}
          <div className="grid grid-cols-5 gap-1.5 text-center" data-testid="callplan-summary">
            {[
              ["Planned", summary.planned || items.length, "text-navy"],
              ["Selesai", summary.completed ?? completedCount, "text-blue-700"],
              ["Order (EC)", summary.effective ?? effectiveCount, "text-emerald-700"],
              ["Pending", summary.pending ?? (items.length - completedCount), "text-amber-700"],
              ["Missed", summary.missed ?? 0, "text-rose-700"],
            ].map(([l, v, color]) => (
              <div key={l} className="bg-white border border-slate-200/90 rounded-xl p-2 sm:p-2.5 shadow-2xs">
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold truncate">{l}</div>
                <div className={`font-heading font-bold text-sm sm:text-base ${color}`}>{v ?? 0}</div>
              </div>
            ))}
          </div>

          {/* Next Nearest Target Outlet Card */}
          {nextTargetOutlet && (
            <div className="bg-gradient-to-r from-gold/10 via-amber-50 to-white border border-gold/40 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold text-navy flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                  {nextTargetOutlet.sequence || 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-gold-dark tracking-wider bg-gold/20 px-2 py-0.5 rounded-full">
                      Tujuan Berikutnya
                    </span>
                    {nextTargetOutlet.priority === "HIGH" && (
                      <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        Prioritas Tinggi
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-base text-navy mt-0.5">
                    {nextTargetOutlet.outlet?.outlet_name || nextTargetOutlet.outlet_name}
                  </div>
                  <div className="text-xs text-slate-500 truncate max-w-md">
                    {nextTargetOutlet.outlet?.address || nextTargetOutlet.address || "-"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {nextTargetOutlet.outlet?.latitude && nextTargetOutlet.outlet?.longitude && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${nextTargetOutlet.outlet.latitude},${nextTargetOutlet.outlet.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-50"
                  >
                    <Navigation size={13} className="text-navy" /> Rute Maps
                  </a>
                )}
                <Button
                  onClick={() => navigate(`/outlets/${nextTargetOutlet.outlet_id}?plan_item=${nextTargetOutlet._id}`)}
                  className="bg-navy text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-navy-light shadow-xs"
                >
                  <Store size={13} className="mr-1.5" /> Buka & Kunjungi
                </Button>
              </div>
            </div>
          )}

          {/* View Mode Toggle & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            {/* Filter Pills */}
            <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl overflow-x-auto">
              {[
                { id: "ALL", label: `Semua (${items.length})` },
                { id: "PENDING", label: `Belum (${items.length - completedCount})` },
                { id: "EFFECTIVE", label: `EC / Order (${effectiveCount})` },
                { id: "DONE", label: `Selesai (${completedCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    filter === tab.id
                      ? "bg-white text-navy shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* List vs Map Switcher */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Cari toko rute..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white rounded-xl border-slate-200"
                />
              </div>

              <div className="flex bg-slate-200/80 p-1 rounded-xl shrink-0">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-lg transition-all text-xs font-bold flex items-center gap-1 ${
                    viewMode === "list" ? "bg-white text-navy shadow-xs" : "text-slate-600 hover:text-navy"
                  }`}
                >
                  <List size={14} />
                  <span className="hidden sm:inline">Daftar</span>
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={`p-1.5 rounded-lg transition-all text-xs font-bold flex items-center gap-1 ${
                    viewMode === "map" ? "bg-white text-navy shadow-xs" : "text-slate-600 hover:text-navy"
                  }`}
                >
                  <MapIcon size={14} />
                  <span className="hidden sm:inline">Peta Rute</span>
                </button>
              </div>
            </div>
          </div>

          {/* Map View */}
          {viewMode === "map" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapIcon size={16} className="text-navy" />
                  <span className="text-xs font-bold text-navy">Peta Rute Urutan Kunjungan Toko</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-mono">
                  {routeMarkers.length} Toko Berkoordinat
                </span>
              </div>

              <MapView
                center={mapCenter}
                zoom={14}
                height="420px"
                markers={routeMarkers}
                polylines={routePolylines}
                showUserLocation={true}
                showLayerToggle={true}
                showFitBounds={true}
              />

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-navy inline-block" /> Belum Visit
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Order (EC)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Selesai Visit
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Prioritas Tinggi
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* List View */}
          <div className="space-y-2">
            {filteredItems.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-400">
                Tidak ada outlet yang sesuai dengan filter atau pencarian.
              </div>
            ) : (
              filteredItems.map((it, idx) => {
                const isVisited = ["COMPLETED", "EFFECTIVE", "VISITED"].includes(it.status);
                const isEffective = it.status === "EFFECTIVE";
                const outlet = it.outlet || {};
                const lat = Number(outlet.latitude ?? it.latitude);
                const lng = Number(outlet.longitude ?? it.longitude);

                let distanceStr = null;
                if (userCoords && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                  const dist = haversineMeters(userCoords.lat, userCoords.lng, lat, lng);
                  distanceStr = formatDistance(dist);
                }

                return (
                  <div
                    key={it._id || `plan-item-${idx}`}
                    data-testid={`callplan-item-${idx}`}
                    className={`w-full bg-white border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition-all hover:shadow-xs ${
                      isEffective
                        ? "border-emerald-200 bg-emerald-50/30"
                        : isVisited
                        ? "border-slate-200 bg-slate-50/70"
                        : "border-slate-200 hover:border-navy/50"
                    }`}
                  >
                    <div
                      onClick={() => navigate(`/outlets/${it.outlet_id}?plan_item=${it._id}`)}
                      className="flex items-start gap-3 flex-1 cursor-pointer min-w-0"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-heading font-bold text-sm shrink-0 shadow-2xs ${
                          isEffective
                            ? "bg-emerald-600 text-white"
                            : isVisited
                            ? "bg-blue-600 text-white"
                            : it.priority === "HIGH"
                            ? "bg-red-600 text-white"
                            : "bg-navy text-white"
                        }`}
                      >
                        {isEffective ? (
                          <CheckCircle2 size={20} />
                        ) : isVisited ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          it.sequence || idx + 1
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-navy truncate">
                            {outlet.outlet_name || it.outlet_name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            ({outlet.outlet_code || it.outlet_code || "OUT"})
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {outlet.address || it.address || "-"}
                        </div>

                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-medium flex-wrap">
                          {outlet.channel_name && (
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold text-[10px]">
                              {outlet.channel_name}
                            </span>
                          )}

                          {outlet.owner_name && (
                            <span>Pemilik: <strong className="text-slate-600">{outlet.owner_name}</strong></span>
                          )}

                          {distanceStr && (
                            <span className="text-navy font-bold flex items-center gap-1 bg-navy/5 px-1.5 py-0.5 rounded">
                              <Compass size={11} /> {distanceStr}
                            </span>
                          )}

                          {it.visit?.total_sales > 0 && (
                            <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-100/80 px-2 py-0.5 rounded">
                              <DollarSign size={11} /> {rupiah(it.visit.total_sales)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={it.status} />
                        {it.priority === "HIGH" && <StatusBadge status={it.priority} />}
                      </div>

                      <div className="flex items-center gap-1">
                        {outlet.phone && (
                          <a
                            href={`https://wa.me/${outlet.phone.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Hubungi WhatsApp"
                            className="p-2 rounded-xl bg-slate-100 text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <Phone size={14} />
                          </a>
                        )}

                        {lat !== 0 && lng !== 0 && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Buka Navigasi Google Maps"
                            className="p-2 rounded-xl bg-slate-100 text-navy hover:bg-navy/10 transition-colors"
                          >
                            <Navigation size={14} />
                          </a>
                        )}

                        <Button
                          size="sm"
                          onClick={() => navigate(`/outlets/${it.outlet_id}?plan_item=${it._id}`)}
                          className="h-8 text-xs font-bold bg-navy text-white rounded-xl hover:bg-navy-light"
                        >
                          {isVisited ? "Lihat" : "Kunjungi"}
                          <ChevronRight size={14} className="ml-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
