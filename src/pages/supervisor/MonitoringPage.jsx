import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Check,
  X,
  RefreshCw,
  Search,
  Filter,
  MapPin,
  Phone,
  Clock,
  TrendingUp,
  Target,
  ShoppingBag,
  Users,
  Store,
  Eye,
  Download,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Battery,
  Navigation,
  Calendar,
  Building2,
  ShieldAlert,
  Info,
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import StatusBadge from "../../components/StatusBadge";
import MapView from "../../components/MapView";
import { rupiah, fmtTime, fmtDateTime, todayLocal } from "../../lib/format";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";

const STATUS_CONFIG = {
  OFF_DUTY: { label: "Off Duty", badge: "OFF_DUTY", color: "bg-slate-100 text-slate-700 border-slate-300" },
  ON_DUTY: { label: "Standby Depo", badge: "ON_DUTY", color: "bg-blue-100 text-blue-800 border-blue-300" },
  ON_FIELD: { label: "On Field", badge: "ON_FIELD", color: "bg-amber-100 text-amber-800 border-amber-300" },
  VISITING: { label: "Sedang Visit", badge: "VISITING", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

export default function MonitoringPage() {
  const [data, setData] = useState({ items: [], summary: {} });
  const [pending, setPending] = useState([]);
  const [offices, setOffices] = useState([]);
  const [areas, setAreas] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [areaFilter, setAreaFilter] = useState("ALL");
  const [officeFilter, setOfficeFilter] = useState("ALL");
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);
  const [autoRefreshSec, setAutoRefreshSec] = useState(10);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [m, p, o, a, v] = await Promise.all([
        api.get("/monitoring/sales", { params: { date: selectedDate } }),
        api.get("/outlets/pending"),
        api.get("/offices"),
        api.get("/areas").catch(() => ({ data: { items: [] } })),
        api.get("/visits", { params: { date: selectedDate, limit: 300 } }),
      ]);

      const salesList = Array.isArray(m.data?.items)
        ? m.data.items
        : Array.isArray(m.data?.salesmen)
        ? m.data.salesmen
        : [];

      setData({
        items: salesList,
        summary: m.data?.summary || {},
      });
      setPending(Array.isArray(p.data?.items) ? p.data.items : []);
      setOffices(Array.isArray(o.data?.items) ? o.data.items : []);
      setAreas(Array.isArray(a.data?.items) ? a.data.items : []);
      setVisits(Array.isArray(v.data?.items) ? v.data.items : []);
      setLastSyncTime(new Date());
    } catch (e) {
      if (!silent) toast.error(errMsg(e));
    }
    if (!silent) setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    load(false);
  }, [load]);

  // Live Auto-Refresh Interval
  useEffect(() => {
    setAutoRefreshSec(refreshIntervalSec);
    if (refreshIntervalSec === 0) return;

    const interval = setInterval(() => {
      setAutoRefreshSec((prev) => {
        if (prev <= 1) {
          load(true);
          return refreshIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [load, refreshIntervalSec]);

  // Approve / Reject NOO Outlets
  const approve = async (id) => {
    try {
      await api.post(`/outlets/${id}/approve`);
      toast.success("Outlet berhasil diverifikasi & disetujui.");
      load(true);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const reject = async (id) => {
    try {
      await api.post(`/outlets/${id}/reject`, { reason: "Ditolak supervisor lapangan" });
      toast.success("Pengajuan outlet ditolak.");
      load(true);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const safeOffices = Array.isArray(offices) ? offices : [];
  const safeAreas = Array.isArray(areas) ? areas : [];
  const safeItems = Array.isArray(data.items) ? data.items : [];
  const safeVisits = Array.isArray(visits) ? visits : [];
  const safePending = Array.isArray(pending) ? pending : [];

  // Filtered Salesmen list
  const filteredSales = useMemo(() => {
    return safeItems.filter((s) => {
      const matchQuery =
        !searchQuery ||
        (s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.code || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.area || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.office_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.active_outlet || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && s.status !== "OFF_DUTY") ||
        s.status === statusFilter;

      const matchArea =
        areaFilter === "ALL" || s.area_id === areaFilter || s.area === areaFilter;

      const matchOffice =
        officeFilter === "ALL" || s.office_id === officeFilter;

      return matchQuery && matchStatus && matchArea && matchOffice;
    });
  }, [safeItems, searchQuery, statusFilter, areaFilter, officeFilter]);

  // Overall KPIs calculations
  const totalSalesmen = safeItems.length;
  const activeInField = safeItems.filter((s) => s.status !== "OFF_DUTY").length;
  const totalPlanned = safeItems.reduce((acc, s) => acc + (s.planned || 0), 0);
  const totalCalls = safeItems.reduce((acc, s) => acc + (s.outlet_calls || s.actual || 0), 0);
  const totalEC = safeItems.reduce((acc, s) => acc + (s.effective_calls || s.effective || 0), 0);
  const overallEcRate = totalCalls > 0 ? Math.round((totalEC / totalCalls) * 100) : 0;
  const totalVol = safeItems.reduce((acc, s) => acc + (s.volume || s.actual_volume || 0), 0);
  const totalRevenue = safeItems.reduce((acc, s) => acc + (s.sales_value || s.revenue || 0), 0);

  // Map Center resolution
  const mapCenter = useMemo(() => {
    if (mapFocus) return [mapFocus.lat, mapFocus.lng];
    if (selectedSalesman?.last_location?.lat) {
      return [selectedSalesman.last_location.lat, selectedSalesman.last_location.lng];
    }
    if (safeOffices[0]?.latitude) return [safeOffices[0].latitude, safeOffices[0].longitude];
    const firstLoc = safeItems.find((s) => s.last_location?.lat)?.last_location;
    if (firstLoc) return [firstLoc.lat, firstLoc.lng];
    return [-6.2146, 106.8451]; // Default fallback Jabodetabek
  }, [mapFocus, selectedSalesman, safeOffices, safeItems]);

  // Interactive Markers for MapView
  const markers = useMemo(() => {
    const list = [];

    // 1. Office / Depo HQ Markers
    safeOffices
      .filter((o) => o && o.latitude)
      .forEach((o, idx) => {
        list.push({
          id: `office-${o._id || idx}`,
          lat: o.latitude,
          lng: o.longitude,
          type: "OFFICE",
          title: o.office_name || "Depo Distribusi Mahameru",
          subtitle: `Kode: ${o.office_code || "-"} · Radius Geofence: ${o.attendance_radius || o.radius_m || 100}m`,
          status: o.status || "ACTIVE",
          statusLabel: o.status === "ACTIVE" ? "Depo Aktif" : "Non-Aktif",
          color: "#0A2540",
          badge: "HQ",
          address: o.address || "-",
          radius: o.attendance_radius || o.radius_m || 100,
          googleMapsUrl: `https://www.google.com/maps?q=${o.latitude},${o.longitude}`,
        });
      });

    // 2. Focused Salesman View (Shows their path & stops)
    if (selectedSalesman) {
      const s = selectedSalesman;
      if (s.last_location && s.last_location.lat) {
        list.push({
          id: `sales-focus-${s.salesman_id || s._id}`,
          lat: s.last_location.lat,
          lng: s.last_location.lng,
          type: "SALESMAN",
          title: s.name,
          subtitle: `Area: ${s.area || "Umum"} · Status: ${STATUS_CONFIG[s.status]?.label || s.status}`,
          phone: s.phone,
          status: s.status,
          statusLabel: STATUS_CONFIG[s.status]?.label || "Aktif",
          color: "#C5A059",
          badge: s.name ? s.name.charAt(0).toUpperCase() : "S",
          isPulsing: true,
          metrics: {
            effectiveCalls: s.effective_calls || s.effective || 0,
            totalCalls: s.outlet_calls || s.actual || 0,
            plannedCalls: s.planned || 0,
            ecRate:
              (s.outlet_calls || s.actual || 0) > 0
                ? Math.round(
                    ((s.effective_calls || s.effective || 0) /
                      (s.outlet_calls || s.actual || 0)) *
                      100
                  )
                : 0,
            volume: s.volume || s.actual_volume || 0,
            revenue: s.sales_value || s.revenue || 0,
          },
          googleMapsUrl: `https://www.google.com/maps?q=${s.last_location.lat},${s.last_location.lng}`,
        });
      }

      // Trail of today's visits for this selected salesman
      const trail = Array.isArray(s.visits_trail) ? s.visits_trail : [];
      trail.forEach((v, idx) => {
        if (v.check_in_lat && v.check_in_lng) {
          const isEC = v.call_result === "EFFECTIVE";
          list.push({
            id: `trail-stop-${v._id || idx}`,
            lat: v.check_in_lat,
            lng: v.check_in_lng,
            type: "VISIT",
            title: v.outlet_name || "Outlet Mahameru",
            subtitle: `Urutan #${idx + 1} · ${v.outlet_code || "-"} · ${isEC ? "Order Berhasil" : "Non-Order"}`,
            salesmanName: s.name,
            phone: v.phone || v.outlet_phone,
            address: v.address || v.outlet_address,
            callResult: v.call_result || (isEC ? "EFFECTIVE" : "OPEN"),
            statusLabel: isEC ? "Effective Call (EC)" : "Outlet Call (Non-EC)",
            color: isEC ? "#10B981" : "#F59E0B",
            badge: `${idx + 1}`,
            checkInTime: v.check_in_time ? fmtTime(v.check_in_time) : null,
            revenue: v.revenue || 0,
            volume: v.volume || 0,
            reason: v.outlet_call_reason || v.open_call_reason || v.notes,
            googleMapsUrl: `https://www.google.com/maps?q=${v.check_in_lat},${v.check_in_lng}`,
          });
        }
      });

      return list;
    }

    // 3. All Salesmen Real-time Locations
    filteredSales
      .filter((s) => s && s.last_location && s.last_location.lat)
      .forEach((s, idx) => {
        const isVisiting = s.status === "VISITING";
        const isOnField = s.status === "ON_FIELD";
        const color = isVisiting ? "#10B981" : isOnField ? "#C5A059" : "#64748B";

        list.push({
          id: `sales-pos-${s._id || s.salesman_id || idx}`,
          lat: s.last_location.lat,
          lng: s.last_location.lng,
          type: "SALESMAN",
          title: s.name,
          subtitle: `${s.area || "Area"} · ${s.active_outlet ? `Di: ${s.active_outlet}` : STATUS_CONFIG[s.status]?.label || s.status}`,
          phone: s.phone,
          status: s.status,
          statusLabel: STATUS_CONFIG[s.status]?.label || s.status,
          color,
          badge: s.name ? s.name.charAt(0).toUpperCase() : "S",
          isPulsing: isVisiting || isOnField,
          metrics: {
            effectiveCalls: s.effective_calls || s.effective || 0,
            totalCalls: s.outlet_calls || s.actual || 0,
            plannedCalls: s.planned || 0,
            ecRate: s.ec_rate || 0,
            volume: s.volume || s.actual_volume || 0,
            revenue: s.sales_value || s.revenue || 0,
          },
          actionLabel: "Fokus Sales",
          onSelect: () => handleSelectSalesmanRow(s),
          googleMapsUrl: `https://www.google.com/maps?q=${s.last_location.lat},${s.last_location.lng}`,
        });
      });

    // 4. Overall Today's Outlet Visits
    safeVisits
      .filter((v) => v && v.check_in_lat)
      .forEach((v, idx) => {
        const isEC = v.call_result === "EFFECTIVE";
        const isOpen = v.call_result === "OPEN";
        const color = isEC ? "#10B981" : isOpen ? "#F59E0B" : "#3B82F6";

        list.push({
          id: `visit-pin-${v._id || idx}`,
          lat: v.check_in_lat,
          lng: v.check_in_lng,
          type: "VISIT",
          title: v.outlet_name || "Outlet Mahameru",
          subtitle: `${v.salesman_name || "Sales"} · ${isEC ? "Order Sukses" : "Kunjungan Toko"}`,
          salesmanName: v.salesman_name || "-",
          phone: v.phone || v.outlet_phone,
          address: v.address || v.outlet_address,
          callResult: v.call_result || (isEC ? "EFFECTIVE" : "OPEN"),
          statusLabel: isEC ? "Effective Call (EC)" : "Outlet Call (Non-EC)",
          color,
          badge: isEC ? "EC" : "NC",
          checkInTime: v.check_in_time ? fmtTime(v.check_in_time) : null,
          revenue: v.revenue || 0,
          volume: v.volume || 0,
          googleMapsUrl: `https://www.google.com/maps?q=${v.check_in_lat},${v.check_in_lng}`,
        });
      });

    return list;
  }, [safeOffices, filteredSales, safeVisits, selectedSalesman]);

  // Office geofence circles
  const circles = useMemo(() => {
    return safeOffices
      .filter((o) => o && o.latitude)
      .map((o, idx) => ({
        id: `geofence-circle-${o._id || idx}`,
        lat: o.latitude,
        lng: o.longitude,
        radius: o.attendance_radius || o.radius_m || 100,
        color: "#0A2540",
      }));
  }, [safeOffices]);

  // Polyline path for selected salesman trail
  const polylines = useMemo(() => {
    if (!selectedSalesman || !selectedSalesman.visits_trail) return [];
    const trail = selectedSalesman.visits_trail;
    const positions = [];

    if (selectedSalesman.check_in_lat && selectedSalesman.check_in_lng) {
      positions.push([selectedSalesman.check_in_lat, selectedSalesman.check_in_lng]);
    }

    trail.forEach((v) => {
      if (v.check_in_lat && v.check_in_lng) {
        positions.push([v.check_in_lat, v.check_in_lng]);
      }
    });

    if (selectedSalesman.last_location?.lat && selectedSalesman.last_location?.lng) {
      positions.push([selectedSalesman.last_location.lat, selectedSalesman.last_location.lng]);
    }

    if (positions.length < 2) return [];

    return [
      {
        id: `trail-poly-${selectedSalesman.salesman_id || selectedSalesman._id}`,
        positions,
        color: "#C5A059",
        weight: 4,
        dashArray: "6, 8",
        opacity: 0.85,
      },
    ];
  }, [selectedSalesman]);

  // Export CSV
  const exportToCSV = () => {
    if (filteredSales.length === 0) {
      toast.error("Tidak ada data monitoring sales untuk diexport.");
      return;
    }

    const headers = [
      "Nama Sales",
      "Kode Sales",
      "Area",
      "Kantor / Depo",
      "Status Live",
      "Absen Masuk",
      "Absen Pulang",
      "Durasi Kerja",
      "Planned Calls",
      "Outlet Calls",
      "Effective Calls (EC)",
      "EC Rate (%)",
      "Target Vol (Qty)",
      "Actual Vol (Qty)",
      "Ach (%)",
      "Total Penjualan (Rp)",
      "Outlet Aktif Saat Ini",
    ];

    const rows = filteredSales.map((s) => [
      `"${s.name || ""}"`,
      `"${s.code || s.salesman_id || ""}"`,
      `"${s.area || ""}"`,
      `"${s.office_name || ""}"`,
      `"${STATUS_CONFIG[s.status]?.label || s.status || ""}"`,
      `"${s.check_in_time ? fmtTime(s.check_in_time) : "-"}"`,
      `"${s.check_out_time ? fmtTime(s.check_out_time) : "-"}"`,
      `"${s.work_duration_formatted || "-"}"`,
      s.planned || 0,
      s.outlet_calls || s.actual || 0,
      s.effective_calls || s.effective || 0,
      `${s.ec_rate || 0}%`,
      s.target_volume || 0,
      s.actual_volume || s.volume || 0,
      `"${s.achievement_formatted || (s.achievement_percentage ? `${s.achievement_percentage}%` : "-")}"`,
      s.sales_value || s.revenue || 0,
      `"${s.active_outlet || "-"}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Mahameru_Monitoring_Sales_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Laporan monitoring sales berhasil diunduh.");
  };

  const handleSelectSalesmanRow = (salesman) => {
    setSelectedSalesman(salesman);
    if (salesman.last_location?.lat) {
      setMapFocus({ lat: salesman.last_location.lat, lng: salesman.last_location.lng });
    }
  };

  if (loading && safeItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28 space-y-3" data-testid="monitoring-loading">
        <Loader2 className="animate-spin text-navy" size={36} />
        <span className="text-sm font-semibold text-slate-500">Memuat data real-time monitoring sales...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="monitoring-page">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-heading text-xl font-bold text-navy">Monitoring Sales &amp; Radar GPS Tim</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Radar Live GPS
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Pantau posisi sales, rute kunjungan, progres panggilan terencana, rasio order (EC), dan target volume harian.
            Terakhir update: {lastSyncTime.toLocaleTimeString("id-ID")}.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Picker */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
            <Calendar size={13} className="text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
            />
          </div>

          {/* Sync Interval Selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <Clock size={13} className="text-slate-500 ml-1.5" />
            <select
              value={refreshIntervalSec}
              onChange={(e) => setRefreshIntervalSec(Number(e.target.value))}
              className="bg-transparent text-xs font-semibold text-slate-700 outline-none pr-2 cursor-pointer"
              title="Interval Sinkronisasi Otomatis"
            >
              <option value={5}>⚡ 5 Detik (Ultra Live)</option>
              <option value={10}>🟢 10 Detik (Real-Time)</option>
              <option value={30}>⏱️ 30 Detik</option>
              <option value={60}>⏲️ 60 Detik</option>
              <option value={0}>⏸️ Manual</option>
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            className="text-xs font-semibold text-slate-700 hover:bg-slate-50 h-8"
          >
            <Download size={13} className="mr-1.5" /> Export CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            data-testid="monitoring-refresh"
            onClick={() => load(false)}
            disabled={loading}
            className="text-xs font-semibold border-slate-300 text-navy hover:bg-slate-50 h-8"
          >
            <RefreshCw size={13} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {refreshIntervalSec > 0 ? `Sinkron (${autoRefreshSec}s)` : "Refresh"}
          </Button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tim Lapangan</span>
            <Users size={16} className="text-blue-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-navy">{activeInField}</span>
            <span className="text-xs text-slate-400">/ {totalSalesmen} Aktif</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium">
            {totalSalesmen - activeInField} Belum Absen / Off
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-indigo-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Outlet Calls</span>
            <Store size={16} className="text-indigo-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-indigo-700">{totalCalls}</span>
            <span className="text-xs text-slate-400">/ {totalPlanned} Rencana</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium">
            Capaian Call: {totalPlanned > 0 ? Math.round((totalCalls / totalPlanned) * 100) : 0}%
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Effective Call (EC)</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-emerald-700">{totalEC}</span>
            <span className="text-xs text-slate-400">Order Berhasil</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium">
            {totalCalls - totalEC} Non-EC (Tanpa Order)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">EC Rate</span>
            <TrendingUp size={16} className="text-purple-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-purple-700">{overallEcRate}%</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium">
            Efektivitas konversi order toko
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Volume Qty</span>
            <ShoppingBag size={16} className="text-amber-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-amber-700">{totalVol}</span>
            <span className="text-xs text-slate-400">Pcs / Karton</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium">
            Total unit terdistribusi
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-gold transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Penjualan</span>
            <Target size={16} className="text-gold-dark" />
          </div>
          <div className="mt-1 text-base font-bold text-navy truncate">
            {rupiah(totalRevenue)}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium">
            Nilai faktur transaksi
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList className="bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="sales" data-testid="tab-sales-monitoring" className="text-xs font-semibold">
            Sales, Peta &amp; Aktivitas
          </TabsTrigger>
          <TabsTrigger value="approvals" data-testid="tab-approvals" className="text-xs font-semibold relative">
            Approval Outlet Baru (NOO)
            {safePending.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white rounded-full px-1.5 py-0.2 text-[10px] font-bold">
                {safePending.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          {/* Map View Container */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-navy" />
                <span className="text-xs font-bold text-navy">Peta Sebaran GPS &amp; Rute Kunjungan Tim</span>
                {selectedSalesman && (
                  <span className="text-xs font-semibold text-gold-dark bg-gold/10 px-2 py-0.5 rounded-full border border-gold/20 flex items-center gap-1">
                    <span>Fokus:</span>
                    <strong>{selectedSalesman.name}</strong>
                  </span>
                )}
              </div>

              {selectedSalesman && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSalesman(null);
                    setMapFocus(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 h-7"
                >
                  <X size={12} className="mr-1" /> Reset Fokus Peta
                </Button>
              )}
            </div>

            <MapView
              center={mapCenter}
              zoom={selectedSalesman ? 15 : 13}
              height="480px"
              markers={markers}
              circles={circles}
              polylines={polylines}
              showSearch={true}
              showLayerToggle={true}
              showFitBounds={true}
              showUserLocation={true}
            />

            {/* Map Legend */}
            <div className="flex gap-4 text-[11px] font-semibold text-slate-600 flex-wrap items-center pt-1 border-t border-slate-100">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-navy inline-block shadow-sm" /> Kantor / Depo Geofence
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-gold inline-block shadow-sm" /> Posisi Sales Live
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm" /> Effective Call (Order)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-sm" /> Outlet Call (Non-EC)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-500 inline-block shadow-sm" /> Kunjungan Berlangsung
              </span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <Input
                placeholder="Cari sales, kode, toko..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto flex-wrap sm:flex-nowrap">
              {/* Area Filter */}
              <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
                <span className="text-slate-400 font-semibold">Area:</span>
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="ALL">Semua Area</option>
                  {safeAreas.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Office Filter */}
              <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
                <Building2 size={13} className="text-slate-400" />
                <select
                  value={officeFilter}
                  onChange={(e) => setOfficeFilter(e.target.value)}
                  className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="ALL">Semua Depo</option>
                  {safeOffices.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.office_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1 overflow-x-auto">
                {[
                  { key: "ALL", label: "Semua" },
                  { key: "ACTIVE", label: "Aktif Lapangan" },
                  { key: "VISITING", label: "Sedang Visit" },
                  { key: "ON_FIELD", label: "Di Lapangan" },
                  { key: "ON_DUTY", label: "Standby Depo" },
                  { key: "OFF_DUTY", label: "Off Duty" },
                ].map((st) => (
                  <Button
                    key={st.key}
                    variant={statusFilter === st.key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(st.key)}
                    className={`h-8 text-xs font-semibold whitespace-nowrap px-2.5 ${
                      statusFilter === st.key ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {st.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Sales Monitoring Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 border-b border-slate-200">
                    {[
                      "Petugas Sales",
                      "Status Live",
                      "Lokasi GPS Terakhir",
                      "Plan Call",
                      "Outlet Call",
                      "Effective (EC)",
                      "EC Rate",
                      "Target Vol",
                      "Actual Vol",
                      "Ach %",
                      "Penjualan (Rp)",
                      "Absensi",
                      "Aksi",
                    ].map((h) => (
                      <TableHead key={h} className="text-xs font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap py-3">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map((s, i) => {
                    const sm = s.summary || {};
                    const isSelected = selectedSalesman?.salesman_id === s.salesman_id || selectedSalesman?._id === s._id;
                    const loc = s.last_location;

                    return (
                      <TableRow
                        key={`sales-mon-${s.salesman_id || s._id || i}`}
                        data-testid={`sales-row-${i}`}
                        className={`hover:bg-slate-50/90 transition-colors cursor-pointer ${
                          isSelected ? "bg-blue-50/70 border-l-4 border-l-navy" : ""
                        }`}
                        onClick={() => handleSelectSalesmanRow(s)}
                      >
                        {/* Sales Name & Identity */}
                        <TableCell className="py-3">
                          <div className="font-bold text-navy text-sm flex items-center gap-1.5">
                            <span>{s.name}</span>
                            {s.phone && (
                              <a
                                href={`https://wa.me/${s.phone.replace(/^0/, "62").replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-emerald-600 hover:text-emerald-700 p-0.5"
                                title="Chat WhatsApp Sales"
                              >
                                <Phone size={12} />
                              </a>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                            <span>{s.area || "Area -"}</span>
                            <span>•</span>
                            <span>{s.office_name || "Depo Pusat"}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {s.code || s.salesman_id}
                          </div>
                        </TableCell>

                        {/* Status Live */}
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                              STATUS_CONFIG[s.status]?.color || "bg-slate-100 text-slate-700 border-slate-300"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                s.status === "VISITING"
                                  ? "bg-emerald-500 animate-ping"
                                  : s.status === "ON_FIELD"
                                  ? "bg-amber-500"
                                  : s.status === "ON_DUTY"
                                  ? "bg-blue-500"
                                  : "bg-slate-400"
                              }`}
                            />
                            {STATUS_CONFIG[s.status]?.label || s.status}
                          </span>
                        </TableCell>

                        {/* Last GPS Location */}
                        <TableCell className="max-w-xs">
                          {s.active_outlet ? (
                            <div className="space-y-0.5">
                              <div className="font-bold text-blue-700 text-xs flex items-center gap-1">
                                <Store size={12} />
                                <span className="truncate">{s.active_outlet}</span>
                              </div>
                              <div className="text-[10px] text-slate-400">Sedang kunjungan toko</div>
                            </div>
                          ) : loc?.lat ? (
                            <div className="space-y-0.5">
                              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                                <Navigation size={11} className="text-slate-400" />
                                <span>{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <span>Sumber: {loc.source || "GPS"}</span>
                                {loc.battery && <span>• 🔋{loc.battery}%</span>}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Belum ada sinyal</span>
                          )}
                        </TableCell>

                        {/* Planned Calls */}
                        <TableCell className="font-semibold text-slate-700">
                          {sm.planned ?? s.planned ?? 0}
                        </TableCell>

                        {/* Outlet Calls */}
                        <TableCell className="font-bold text-blue-600">
                          {sm.outlet_calls ?? sm.actual ?? s.actual ?? 0}
                        </TableCell>

                        {/* Effective Calls */}
                        <TableCell className="text-emerald-600 font-bold">
                          {sm.effective_calls ?? sm.effective ?? s.effective ?? 0}
                        </TableCell>

                        {/* EC Rate */}
                        <TableCell className="text-purple-600 font-bold">
                          {sm.ec_rate ?? sm.effective_ratio ?? s.ec_rate ?? 0}%
                        </TableCell>

                        {/* Target Volume */}
                        <TableCell className="text-slate-600 font-semibold">
                          {s.target_volume ? `${s.target_volume} Qty` : "-"}
                        </TableCell>

                        {/* Actual Volume */}
                        <TableCell className="text-amber-700 font-bold">
                          {sm.total_volume ?? sm.volume ?? s.volume ?? 0} Qty
                        </TableCell>

                        {/* Ach % */}
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              (s.achievement_percentage || 0) >= 100
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : (s.achievement_percentage || 0) >= 75
                                ? "bg-gold/20 text-gold-dark border border-gold/30"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {s.achievement_formatted || (s.target_volume ? `${s.achievement_percentage}%` : "-")}
                          </span>
                        </TableCell>

                        {/* Sales Revenue */}
                        <TableCell className="font-bold text-navy whitespace-nowrap">
                          {rupiah(sm.sales_value ?? s.sales_value ?? 0)}
                        </TableCell>

                        {/* Attendance Time */}
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                          {s.check_in_time ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 font-medium text-slate-700">
                                <Clock size={11} className="text-emerald-600" />
                                <span>{fmtTime(s.check_in_time)}</span>
                              </div>
                              {s.check_out_time && (
                                <div className="text-[10px] text-slate-400">
                                  Pulang: {fmtTime(s.check_out_time)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Belum Absen</span>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSalesman(s);
                            }}
                            className="h-7 px-2.5 text-xs font-semibold text-navy hover:bg-navy hover:text-white"
                          >
                            <Eye size={12} className="mr-1" /> Rincian
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredSales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-12 text-slate-400 text-sm">
                        Tidak ada data sales yang cocok dengan kriteria filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals" className="space-y-3 pt-2">
          {safePending.length === 0 && (
            <div
              className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-400 space-y-2"
              data-testid="approvals-empty"
            >
              <CheckCircle2 size={36} className="mx-auto text-emerald-500/80" />
              <div className="font-bold text-slate-700">Semua Outlet Telah Disetujui</div>
              <p className="text-xs text-slate-400">Tidak ada pengajuan outlet baru (NOO) yang menunggu persetujuan supervisor.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {safePending.map((o, i) => (
              <div
                key={`pending-${o._id || i}`}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm"
                data-testid={`approval-row-${i}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-navy text-base">
                      {o.outlet_name}{" "}
                      <span className="text-slate-400 text-xs font-mono font-normal">({o.outlet_code})</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">{o.address}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Pemilik: <span className="font-semibold">{o.owner_name}</span> · {o.phone || "-"}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                      <span>Diajukan oleh: <strong className="text-slate-600">{o.created_by_name || "-"}</strong></span>
                      <span>•</span>
                      <span>GPS: {o.latitude?.toFixed(5)}, {o.longitude?.toFixed(5)}</span>
                    </div>
                  </div>
                  <StatusBadge status={o.status} />
                </div>

                {o.photo && (
                  <img
                    src={o.photo}
                    alt="Foto Outlet"
                    className="w-full h-44 object-cover rounded-lg border border-slate-200"
                  />
                )}

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <Button
                    data-testid={`approve-${i}`}
                    onClick={() => approve(o._id)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9"
                  >
                    <Check size={14} className="mr-1.5" /> Setujui Outlet
                  </Button>
                  <Button
                    data-testid={`reject-${i}`}
                    onClick={() => reject(o._id)}
                    variant="outline"
                    className="flex-1 border-red-300 text-red-600 hover:bg-red-50 font-bold text-xs h-9"
                  >
                    <X size={14} className="mr-1.5" /> Tolak
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Salesman Detail Activity Modal */}
      {selectedSalesman && (
        <Dialog open={!!selectedSalesman} onOpenChange={(open) => !open && setSelectedSalesman(null)}>
          <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-navy flex items-center justify-between">
                <span>Rincian Aktivitas: {selectedSalesman.name}</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    STATUS_CONFIG[selectedSalesman.status]?.color || "bg-slate-100 text-slate-700"
                  }`}
                >
                  {STATUS_CONFIG[selectedSalesman.status]?.label || selectedSalesman.status}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Area: {selectedSalesman.area || "-"} · Kantor: {selectedSalesman.office_name || "Depo Pusat"} · Kode: {selectedSalesman.code || selectedSalesman.salesman_id}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Quick Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Kunjungan</div>
                  <div className="text-base font-bold text-navy">
                    {selectedSalesman.outlet_calls || selectedSalesman.actual || 0} / {selectedSalesman.planned || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Effective Call (EC)</div>
                  <div className="text-base font-bold text-emerald-600">
                    {selectedSalesman.effective_calls || selectedSalesman.effective || 0} EC
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Volume Qty</div>
                  <div className="text-base font-bold text-amber-700">
                    {selectedSalesman.volume || selectedSalesman.actual_volume || 0} Qty
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Penjualan</div>
                  <div className="text-base font-bold text-navy truncate">
                    {rupiah(selectedSalesman.sales_value || selectedSalesman.revenue || 0)}
                  </div>
                </div>
              </div>

              {/* Call Plan Progress Compliance */}
              {selectedSalesman.call_plan && (
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-900">Kepatuhan Rencana Kunjungan (Call Plan)</span>
                    <span className="font-bold text-indigo-700">
                      {selectedSalesman.call_plan.compliance_percentage}% Selesai
                    </span>
                  </div>
                  <div className="w-full bg-indigo-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all"
                      style={{ width: `${selectedSalesman.call_plan.compliance_percentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-indigo-800">
                    <span>Terencana: {selectedSalesman.call_plan.planned} Toko</span>
                    <span>Telah Dikunjungi: {selectedSalesman.call_plan.visited} Toko</span>
                    <span>Sisa: {selectedSalesman.call_plan.pending} Toko</span>
                  </div>
                </div>
              )}

              {/* Contact & Attendance Details */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Clock size={13} className="text-blue-600" />
                    <span>
                      Absensi: {selectedSalesman.check_in_time ? fmtTime(selectedSalesman.check_in_time) : "Belum Masuk"}
                      {selectedSalesman.check_out_time ? ` - Pulang: ${fmtTime(selectedSalesman.check_out_time)}` : ""}
                    </span>
                  </div>
                  {selectedSalesman.active_outlet && (
                    <div className="text-blue-700 font-bold flex items-center gap-1">
                      <Store size={13} /> Sedang di toko: {selectedSalesman.active_outlet}
                    </div>
                  )}
                  {selectedSalesman.last_location?.lat && (
                    <div className="text-slate-500 text-[11px] flex items-center gap-1">
                      <MapPin size={12} className="text-slate-400" />
                      <span>GPS: {selectedSalesman.last_location.lat.toFixed(5)}, {selectedSalesman.last_location.lng.toFixed(5)}</span>
                      <a
                        href={`https://www.google.com/maps?q=${selectedSalesman.last_location.lat},${selectedSalesman.last_location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 font-semibold underline ml-1"
                      >
                        Buka Maps
                      </a>
                    </div>
                  )}
                </div>

                {selectedSalesman.phone && (
                  <a
                    href={`https://wa.me/${selectedSalesman.phone.replace(/^0/, "62").replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors"
                  >
                    <Phone size={13} /> Chat WhatsApp
                  </a>
                )}
              </div>

              {/* Timeline of Visits */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Kronologi Kunjungan Toko Hari Ini ({Array.isArray(selectedSalesman.visits_trail) ? selectedSalesman.visits_trail.length : 0})
                </h4>

                {(!selectedSalesman.visits_trail || selectedSalesman.visits_trail.length === 0) && (
                  <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Belum ada riwayat kunjungan toko yang tercatat hari ini.
                  </div>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {selectedSalesman.visits_trail?.map((v, idx) => (
                    <div
                      key={`visit-detail-${v._id || idx}`}
                      className="flex items-start justify-between p-3 rounded-lg border border-slate-200 bg-white text-xs hover:border-slate-300"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-navy flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                            {idx + 1}
                          </span>
                          <span>{v.outlet_name}</span>
                          <span className="text-slate-400 text-[10px]">({v.outlet_code})</span>
                        </div>
                        <div className="text-slate-500 text-[11px] pl-6">{v.address}</div>
                        <div className="text-[10px] text-slate-400 pl-6 flex items-center gap-2">
                          <span>Waktu: {fmtTime(v.check_in_time)}</span>
                          {v.check_out_time && <span>- {fmtTime(v.check_out_time)}</span>}
                          {v.duration_minutes > 0 && <span>• Durasi: {v.duration_minutes}m</span>}
                          {v.distance_m != null && <span>• Jarak: {v.distance_m}m</span>}
                        </div>
                      </div>

                      <div className="text-right space-y-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            v.call_result === "EFFECTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {v.call_result === "EFFECTIVE" ? "Effective Call (EC)" : "Non-EC Call"}
                        </span>
                        {v.revenue > 0 && (
                          <div className="font-bold text-navy text-xs">{rupiah(v.revenue)}</div>
                        )}
                        {v.volume > 0 && (
                          <div className="text-slate-500 text-[10px]">{v.volume} Qty</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Close Button */}
              <div className="flex justify-end pt-2 border-t border-slate-200">
                <Button variant="outline" size="sm" onClick={() => setSelectedSalesman(null)} className="text-xs">
                  Tutup
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
