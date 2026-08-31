import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  RefreshCw,
  Search,
  Filter,
  RotateCcw,
  Store,
  Calendar,
  User,
  MapPin,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  BarChart3,
  Layers,
  X,
  Phone,
  CreditCard,
  Percent,
  Receipt,
  Eye,
  Building2,
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { rupiah, todayLocal } from "../../lib/format";
import { exportToCSV, exportToXLSX, exportToPDF } from "../../lib/export";

const STATUS_BADGES = {
  NOO: {
    label: "NOO (New Outlet Opening)",
    short: "NOO",
    bg: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    desc: "1 Transaksi Berhasil",
  },
  REPEAT: {
    label: "REPEAT",
    short: "REPEAT",
    bg: "bg-purple-50 text-purple-700 border-purple-200",
    dot: "bg-purple-500",
    desc: "2 Transaksi Berhasil",
  },
  ACTIVE: {
    label: "ACTIVE",
    short: "ACTIVE",
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    desc: ">= 3 Transaksi & < 56 Hari",
  },
  DORMANT: {
    label: "DORMANT",
    short: "DORMANT",
    bg: "bg-amber-50 text-amber-700 border-amber-300",
    dot: "bg-amber-500 animate-pulse",
    desc: ">= 56 Hari Tanpa Transaksi",
  },
  PROSPECT: {
    label: "PROSPECT",
    short: "PROSPECT",
    bg: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    desc: "Belum Pernah Transaksi",
  },
};

export default function OutletReportPage() {
  const { user } = useAuth();
  const isSalesRole = user?.role === "SALES";

  // Filter States
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayLocal());
  const [salesmanId, setSalesmanId] = useState("ALL");
  const [areaId, setAreaId] = useState("ALL");
  const [provinceId, setProvinceId] = useState("ALL");
  const [regencyId, setRegencyId] = useState("ALL");
  const [districtId, setDistrictId] = useState("ALL");
  const [villageId, setVillageId] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [productId, setProductId] = useState("ALL");
  const [skuId, setSkuId] = useState("ALL");
  const [statusMode, setStatusMode] = useState("current"); // "current" | "period"
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // "all" | "dormant" | "noo" | "area" | "sales" | "region"

  // Master Data
  const [salesmen, setSalesmen] = useState([]);
  const [areas, setAreas] = useState([]);
  const [products, setProducts] = useState([]);
  const [skus, setSkus] = useState([]);

  // Administrative Regional Lists
  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);

  // Data Result
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Detail Modal State
  const [selectedOutletId, setSelectedOutletId] = useState(null);
  const [outletDetail, setOutletDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState("profile"); // "profile" | "product" | "transactions" | "visits"

  // Load Master Selectors & Provinces on Mount
  useEffect(() => {
    async function loadMasters() {
      try {
        const [salesRes, areaRes, prodRes, skuRes, provRes] = await Promise.all([
          api.get("/masters/salesmen", { params: { limit: 100 } }),
          api.get("/masters/areas", { params: { limit: 100 } }),
          api.get("/masters/products", { params: { limit: 100 } }),
          api.get("/masters/skus", { params: { limit: 100 } }),
          api.get("/regions/provinces"),
        ]);
        setSalesmen(salesRes.data.items || salesRes.data || []);
        setAreas(areaRes.data.items || areaRes.data || []);
        setProducts(prodRes.data.items || prodRes.data || []);
        setSkus(skuRes.data.items || skuRes.data || []);
        setProvinces(provRes.data.items || provRes.data || []);
      } catch (err) {
        console.error("Failed to load filter options:", err);
      }
    }
    loadMasters();
  }, []);

  // Cascading Load: Regencies
  useEffect(() => {
    let mounted = true;
    if (!provinceId || provinceId === "ALL") {
      setRegencies([]);
      setRegencyId("ALL");
      setDistricts([]);
      setDistrictId("ALL");
      setVillages([]);
      setVillageId("ALL");
      return;
    }
    const fetchRegencies = async () => {
      try {
        const { data } = await api.get("/regions/regencies", {
          params: { province_id: provinceId },
        });
        if (mounted) {
          setRegencies(data.items || data || []);
        }
      } catch (err) {
        console.error("Gagal memuat kabupaten/kota filter:", err);
      }
    };
    fetchRegencies();
    return () => { mounted = false; };
  }, [provinceId]);

  // Cascading Load: Districts
  useEffect(() => {
    let mounted = true;
    if (!regencyId || regencyId === "ALL") {
      setDistricts([]);
      setDistrictId("ALL");
      setVillages([]);
      setVillageId("ALL");
      return;
    }
    const fetchDistricts = async () => {
      try {
        const { data } = await api.get("/regions/districts", {
          params: { regency_id: regencyId },
        });
        if (mounted) {
          setDistricts(data.items || data || []);
        }
      } catch (err) {
        console.error("Gagal memuat kecamatan filter:", err);
      }
    };
    fetchDistricts();
    return () => { mounted = false; };
  }, [regencyId]);

  // Cascading Load: Villages
  useEffect(() => {
    let mounted = true;
    if (!districtId || districtId === "ALL") {
      setVillages([]);
      setVillageId("ALL");
      return;
    }
    const fetchVillages = async () => {
      try {
        const { data } = await api.get("/regions/villages", {
          params: { district_id: districtId },
        });
        if (mounted) {
          setVillages(data.items || data || []);
        }
      } catch (err) {
        console.error("Gagal memuat kelurahan filter:", err);
      }
    };
    fetchVillages();
    return () => { mounted = false; };
  }, [districtId]);

  // Fetch Outlet Report
  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        from,
        to,
        area_id: areaId,
        province_id: provinceId,
        regency_id: regencyId,
        district_id: districtId,
        village_id: villageId,
        salesman_id: isSalesRole ? user._id : salesmanId,
        status: statusFilter,
        product_id: productId,
        sku_id: skuId,
        status_mode: statusMode,
        q: searchQuery,
      };
      const res = await api.get("/reports/outlets", { params });
      setReportData(res.data);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [
    from,
    to,
    areaId,
    provinceId,
    regencyId,
    districtId,
    villageId,
    salesmanId,
    statusFilter,
    productId,
    skuId,
    statusMode,
    searchQuery,
    isSalesRole,
    user,
  ]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Fetch Outlet Detail Drawer
  const openOutletDetail = async (outletId) => {
    setSelectedOutletId(outletId);
    setDetailTab("profile");
    setLoadingDetail(true);
    try {
      const res = await api.get(`/reports/outlets/${outletId}`, {
        params: { from, to },
      });
      setOutletDetail(res.data);
    } catch (err) {
      toast.error(errMsg(err));
      setSelectedOutletId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeOutletDetail = () => {
    setSelectedOutletId(null);
    setOutletDetail(null);
  };

  // Quick Date Presets
  const handleDatePreset = (preset) => {
    const today = new Date();
    const f = (d) => d.toISOString().slice(0, 10);
    if (preset === "today") {
      setFrom(f(today));
      setTo(f(today));
    } else if (preset === "7d") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFrom(f(d));
      setTo(f(today));
    } else if (preset === "30d") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      setFrom(f(d));
      setTo(f(today));
    } else if (preset === "thisMonth") {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      setFrom(f(d));
      setTo(f(today));
    } else if (preset === "90d") {
      const d = new Date();
      d.setDate(d.getDate() - 89);
      setFrom(f(d));
      setTo(f(today));
    }
  };

  const handleResetFilters = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setFrom(d.toISOString().slice(0, 10));
    setTo(todayLocal());
    setSalesmanId("ALL");
    setAreaId("ALL");
    setProvinceId("ALL");
    setRegencyId("ALL");
    setDistrictId("ALL");
    setVillageId("ALL");
    setStatusFilter("ALL");
    setProductId("ALL");
    setSkuId("ALL");
    setStatusMode("current");
    setSearchQuery("");
  };

  // Export handlers
  const outletsList = reportData?.outlets || [];
  const kpis = reportData?.kpis || {};

  const handleExportCSV = () => {
    if (!outletsList.length) {
      toast.error("Tidak ada data outlet untuk diekspor");
      return;
    }
    const headers = [
      "Kode Outlet",
      "Nama Outlet",
      "Pemilik",
      "No. Telepon",
      "Alamat",
      "Provinsi",
      "Kabupaten/Kota",
      "Kecamatan",
      "Kelurahan/Desa",
      "Kode Pos",
      "Wilayah Penugasan Sales",
      "Sales Penanggung Jawab",
      "Status Lifecycle",
      "Outlet Call",
      "Effective Call",
      "EC Rate (%)",
      "Total Transaksi (Periode)",
      "Volume (Qty)",
      "Revenue (Rp)",
      "Transaksi Pertama",
      "Transaksi Terakhir",
      "Hari Sejak Txn Terakhir",
    ];

    const rows = outletsList.map((o) => ({
      "Kode Outlet": o.outlet_code,
      "Nama Outlet": o.outlet_name,
      "Pemilik": o.owner_name,
      "No. Telepon": o.phone,
      "Alamat": o.address,
      "Provinsi": o.province_name || "-",
      "Kabupaten/Kota": o.regency_name || "-",
      "Kecamatan": o.district_name || "-",
      "Kelurahan/Desa": o.village_name || "-",
      "Kode Pos": o.postal_code || "-",
      "Wilayah Penugasan Sales": o.area_name,
      "Sales Penanggung Jawab": o.assigned_sales_name,
      "Status Lifecycle": o.lifecycle_status,
      "Outlet Call": o.outlet_call,
      "Effective Call": o.effective_call,
      "EC Rate (%)": `${o.ec_rate}%`,
      "Total Transaksi (Periode)": o.transaction_count,
      "Volume (Qty)": o.volume,
      "Revenue (Rp)": o.revenue,
      "Transaksi Pertama": o.first_transaction_date || "-",
      "Transaksi Terakhir": o.last_transaction_date || "-",
      "Hari Sejak Txn Terakhir": o.days_since_last_transaction !== null ? `${o.days_since_last_transaction} hari` : "-",
    }));

    exportToCSV("DMS_Mahameru_Laporan_Outlet", headers, rows);
    toast.success("Laporan Outlet CSV berhasil diunduh");
  };

  const handleExportXLSX = () => {
    if (!outletsList.length) {
      toast.error("Tidak ada data outlet untuk diekspor");
      return;
    }
    const rows = outletsList.map((o) => ({
      "Kode Outlet": o.outlet_code,
      "Nama Outlet": o.outlet_name,
      "Pemilik": o.owner_name,
      "No. Telepon": o.phone,
      "Alamat": o.address,
      "Provinsi": o.province_name || "-",
      "Kabupaten/Kota": o.regency_name || "-",
      "Kecamatan": o.district_name || "-",
      "Kelurahan/Desa": o.village_name || "-",
      "Kode Pos": o.postal_code || "-",
      "Area Penugasan": o.area_name,
      "Sales PIC": o.assigned_sales_name,
      "Status": o.lifecycle_status,
      "Outlet Call": o.outlet_call,
      "Effective Call": o.effective_call,
      "EC Rate (%)": `${o.ec_rate}%`,
      "Total Transaksi": o.transaction_count,
      "Volume (Qty)": o.volume,
      "Revenue (Rp)": o.revenue,
      "Transaksi Pertama": o.first_transaction_date || "-",
      "Transaksi Terakhir": o.last_transaction_date || "-",
      "Hari Sejak Txn Terakhir": o.days_since_last_transaction !== null ? o.days_since_last_transaction : "-",
    }));

    exportToXLSX("DMS_Mahameru_Laporan_Outlet", "Outlet Report", rows);
    toast.success("Laporan Outlet Excel (XLSX) berhasil diunduh");
  };

  const handleExportPDF = () => {
    if (!outletsList.length) {
      toast.error("Tidak ada data outlet untuk diekspor");
      return;
    }
    const pdfHeaders = [
      { key: "outlet_code", label: "KODE" },
      { key: "outlet_name", label: "NAMA OUTLET" },
      { key: "regency_name", label: "KAB/KOTA" },
      { key: "area_name", label: "AREA" },
      { key: "assigned_sales_name", label: "SALES" },
      { key: "lifecycle_status", label: "STATUS" },
      { key: "outlet_call", label: "CALL" },
      { key: "effective_call", label: "EC" },
      { key: "ec_rate_str", label: "EC RATE" },
      { key: "transaction_count", label: "TXN" },
      { key: "volume", label: "VOLUME (QTY)" },
      { key: "revenue", label: "REVENUE (RP)", isMoney: true },
      { key: "last_transaction_date", label: "LAST TXN" },
    ];

    const pdfRows = outletsList.map((o) => ({
      ...o,
      regency_name: o.regency_name || "-",
      ec_rate_str: `${o.ec_rate}%`,
    }));

    exportToPDF({
      title: "DMS MAHAMERU — LAPORAN PERFORMA & STATUS OUTLET",
      subtitle: `Periode: ${from} s/d ${to} | Area: ${areaId} | Wilayah: ${provinceId !== "ALL" ? provinceId : "Semua"} | Sales: ${salesmanId} | Mode: ${statusMode === "current" ? "Status Saat Ini" : "Status Periode"}`,
      headers: pdfHeaders,
      data: pdfRows,
      filename: "DMS_Mahameru_Laporan_Outlet",
    });
    toast.success("Laporan PDF resmi PT Mahameru Insan Mandiri berhasil diunduh");
  };

  const handlePrint = () => {
    window.print();
  };

  // Filtered list based on active tab
  const tabFilteredOutlets = useMemo(() => {
    if (activeTab === "dormant") {
      return outletsList.filter((o) => o.lifecycle_status === "DORMANT");
    }
    if (activeTab === "noo") {
      return outletsList.filter((o) => o.lifecycle_status === "NOO");
    }
    return outletsList;
  }, [outletsList, activeTab]);

  return (
    <div className="space-y-5 pb-16" data-testid="outlet-report-page">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-navy/5 text-navy font-bold">
              <Store size={22} className="text-navy" />
            </span>
            <div>
              <h1 className="font-heading text-xl sm:text-2xl font-bold text-navy tracking-tight">
                Laporan Outlet
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Satu sumber informasi utama performa outlet, filter wilayah bertingkat, status NOO / Repeat / Active / Dormant, volume & revenue
              </p>
            </div>
          </div>
        </div>

        {/* Action & Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReport()}
            disabled={loading}
            className="h-9 text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={13} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Muat Ulang
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportCSV()}
            disabled={!outletsList.length}
            className="h-9 text-xs border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            <Download size={13} className="mr-1.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportXLSX()}
            disabled={!outletsList.length}
            className="h-9 text-xs border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold"
          >
            <FileSpreadsheet size={13} className="mr-1.5 text-emerald-600" />
            Excel (XLSX)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportPDF()}
            disabled={!outletsList.length}
            className="h-9 text-xs border-red-300 text-red-700 bg-red-50 hover:bg-red-100 font-semibold"
          >
            <FileText size={13} className="mr-1.5 text-red-600" />
            PDF Resmi
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrint()}
            className="h-9 text-xs border-slate-300 text-slate-700 hover:bg-slate-100 hidden sm:inline-flex"
          >
            <Printer size={13} className="mr-1.5" />
            Cetak
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-navy" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Filter & Parameter Laporan</span>
          </div>
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => handleDatePreset("today")}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => handleDatePreset("7d")}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
            >
              7 Hari
            </button>
            <button
              type="button"
              onClick={() => handleDatePreset("30d")}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
            >
              30 Hari
            </button>
            <button
              type="button"
              onClick={() => handleDatePreset("thisMonth")}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
            >
              Bulan Ini
            </button>
            <button
              type="button"
              onClick={() => handleDatePreset("90d")}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
            >
              90 Hari
            </button>
          </div>
        </div>

        {/* Row 1: Primary Dimensions & Period Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {/* Date From */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-600">Tanggal Mulai</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="text-xs h-9"
              data-testid="filter-date-from"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-600">Tanggal Akhir</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="text-xs h-9"
              data-testid="filter-date-to"
            />
          </div>

          {/* Area (Penugasan Sales) */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-600">Area Sales</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger className="text-xs h-9" data-testid="filter-area">
                <SelectValue placeholder="Semua Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Area</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sales */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-600">Salesman</Label>
            {isSalesRole ? (
              <Input
                disabled
                value={user?.name || "Sales Anda"}
                className="text-xs h-9 bg-slate-100 text-slate-700 font-semibold"
              />
            ) : (
              <Select value={salesmanId} onValueChange={setSalesmanId}>
                <SelectTrigger className="text-xs h-9" data-testid="filter-sales">
                  <SelectValue placeholder="Semua Sales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Sales</SelectItem>
                  {salesmen.map((s) => (
                    <SelectItem key={s.user_id || s._id} value={s.user_id || s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Status Outlet */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-600">Status Outlet</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-xs h-9" data-testid="filter-status">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="NOO">NOO (1 Transaksi)</SelectItem>
                <SelectItem value="REPEAT">REPEAT (2 Transaksi)</SelectItem>
                <SelectItem value="ACTIVE">ACTIVE (&ge; 3 Transaksi)</SelectItem>
                <SelectItem value="DORMANT">DORMANT (&ge; 56 Hari Diam)</SelectItem>
                <SelectItem value="PROSPECT">PROSPECT (0 Transaksi)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mode Status */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-600">Mode Status</Label>
            <Select value={statusMode} onValueChange={setStatusMode}>
              <SelectTrigger className="text-xs h-9" data-testid="filter-status-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Status Real-time</SelectItem>
                <SelectItem value="period">Berdasarkan Periode</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* SKU / Produk */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-600">Filter SKU</Label>
            <Select value={skuId} onValueChange={setSkuId}>
              <SelectTrigger className="text-xs h-9" data-testid="filter-sku">
                <SelectValue placeholder="Semua SKU" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua SKU</SelectItem>
                {skus.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Cascading Administrative Region Filters (Provinsi -> Kab/Kota -> Kecamatan -> Kelurahan) */}
        <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-navy">
            <MapPin size={13} className="text-navy" />
            <span>Filter Wilayah Administratif Resmi</span>
            <span className="text-[10px] text-slate-400 font-normal ml-1">
              (Master Wilayah Bertingkat ID-based)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {/* 1. Provinsi */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-600">Provinsi</Label>
              <Select value={provinceId} onValueChange={setProvinceId}>
                <SelectTrigger className="text-xs h-8.5 bg-white border-slate-200" data-testid="filter-province">
                  <SelectValue placeholder="Semua Provinsi" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="ALL">Semua Provinsi</SelectItem>
                  {provinces.map((p) => (
                    <SelectItem key={p._id} value={p._id} className="text-xs font-medium">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Kabupaten / Kota */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-600">Kabupaten / Kota</Label>
              <Select
                value={regencyId}
                onValueChange={setRegencyId}
                disabled={provinceId === "ALL" || !regencies.length}
              >
                <SelectTrigger className="text-xs h-8.5 bg-white border-slate-200" data-testid="filter-regency">
                  <SelectValue placeholder={provinceId === "ALL" ? "Pilih Provinsi Dahulu" : "Semua Kab/Kota"} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="ALL">Semua Kab/Kota</SelectItem>
                  {regencies.map((r) => (
                    <SelectItem key={r._id} value={r._id} className="text-xs font-medium">
                      {r.type ? `${r.type} ` : ""}{r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 3. Kecamatan */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-600">Kecamatan</Label>
              <Select
                value={districtId}
                onValueChange={setDistrictId}
                disabled={regencyId === "ALL" || !districts.length}
              >
                <SelectTrigger className="text-xs h-8.5 bg-white border-slate-200" data-testid="filter-district">
                  <SelectValue placeholder={regencyId === "ALL" ? "Pilih Kab/Kota Dahulu" : "Semua Kecamatan"} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="ALL">Semua Kecamatan</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d._id} value={d._id} className="text-xs font-medium">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 4. Kelurahan / Desa */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-600">Kelurahan / Desa</Label>
              <Select
                value={villageId}
                onValueChange={setVillageId}
                disabled={districtId === "ALL" || !villages.length}
              >
                <SelectTrigger className="text-xs h-8.5 bg-white border-slate-200" data-testid="filter-village">
                  <SelectValue placeholder={districtId === "ALL" ? "Pilih Kecamatan Dahulu" : "Semua Kelurahan/Desa"} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="ALL">Semua Kelurahan/Desa</SelectItem>
                  {villages.map((v) => (
                    <SelectItem key={v._id} value={v._id} className="text-xs font-medium">
                      {v.name} {v.postal_code ? `(${v.postal_code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Search and Reset Line */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Cari kode, nama outlet, pemilik, telepon, alamat, kab/kota, kelurahan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9"
              data-testid="search-outlet-input"
            />
          </div>

          <div className="flex items-center gap-2">
            {(salesmanId !== "ALL" ||
              areaId !== "ALL" ||
              provinceId !== "ALL" ||
              regencyId !== "ALL" ||
              districtId !== "ALL" ||
              villageId !== "ALL" ||
              statusFilter !== "ALL" ||
              skuId !== "ALL" ||
              searchQuery ||
              statusMode !== "current") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleResetFilters()}
                className="text-xs text-slate-500 hover:text-slate-800 h-9"
              >
                <RotateCcw size={12} className="mr-1.5" />
                Reset Filter
              </Button>
            )}
            <Button
              onClick={() => fetchReport()}
              disabled={loading}
              className="bg-navy hover:bg-navy-light text-white font-bold h-9 text-xs px-4 shadow-xs"
              data-testid="apply-filter-button"
            >
              {loading ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Filter size={13} className="mr-1.5" />}
              Terapkan Filter
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-2.5">
        {/* TOTAL OUTLET */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Outlet</span>
          <div className="mt-1">
            <span className="text-xl font-bold font-heading text-navy">
              {kpis.total_outlets?.toLocaleString("id-ID") || 0}
            </span>
            <span className="text-[10px] text-slate-400 block">Terdaftar</span>
          </div>
        </div>

        {/* NOO */}
        <div className="bg-white p-3 rounded-2xl border border-blue-200/90 bg-blue-50/20 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">NOO</span>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.2 rounded-full">
              {kpis.noo_pct || 0}%
            </span>
          </div>
          <div className="mt-1">
            <span className="text-xl font-bold font-heading text-blue-800">
              {kpis.noo?.toLocaleString("id-ID") || 0}
            </span>
            <span className="text-[10px] text-blue-600/80 block">1 Transaksi</span>
          </div>
        </div>

        {/* REPEAT */}
        <div className="bg-white p-3 rounded-2xl border border-purple-200/90 bg-purple-50/20 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-purple-700 tracking-wider">Repeat</span>
            <span className="text-[10px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.2 rounded-full">
              {kpis.repeat_pct || 0}%
            </span>
          </div>
          <div className="mt-1">
            <span className="text-xl font-bold font-heading text-purple-800">
              {kpis.repeat?.toLocaleString("id-ID") || 0}
            </span>
            <span className="text-[10px] text-purple-600/80 block">2 Transaksi</span>
          </div>
        </div>

        {/* ACTIVE */}
        <div className="bg-white p-3 rounded-2xl border border-emerald-200/90 bg-emerald-50/20 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Active</span>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.2 rounded-full">
              {kpis.active_pct || 0}%
            </span>
          </div>
          <div className="mt-1">
            <span className="text-xl font-bold font-heading text-emerald-800">
              {kpis.active?.toLocaleString("id-ID") || 0}
            </span>
            <span className="text-[10px] text-emerald-600/80 block">&ge; 3 Txn &lt; 56d</span>
          </div>
        </div>

        {/* DORMANT */}
        <div className="bg-white p-3 rounded-2xl border border-amber-300 bg-amber-50/40 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Dormant</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-200 px-1.5 py-0.2 rounded-full">
              {kpis.dormant_pct || 0}%
            </span>
          </div>
          <div className="mt-1">
            <span className="text-xl font-bold font-heading text-amber-900">
              {kpis.dormant?.toLocaleString("id-ID") || 0}
            </span>
            <span className="text-[10px] text-amber-700 block font-medium">&ge; 56 Hari Diam</span>
          </div>
        </div>

        {/* PROSPECT */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Prospect</span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-full">
              {kpis.prospect_pct || 0}%
            </span>
          </div>
          <div className="mt-1">
            <span className="text-xl font-bold font-heading text-slate-700">
              {kpis.prospect?.toLocaleString("id-ID") || 0}
            </span>
            <span className="text-[10px] text-slate-400 block">0 Transaksi</span>
          </div>
        </div>

        {/* OUTLET CALL */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Outlet Call</span>
          <div className="mt-1">
            <span className="text-xl font-bold font-heading text-navy">
              {kpis.outlet_call?.toLocaleString("id-ID") || 0}
            </span>
            <span className="text-[10px] text-slate-400 block">Outlet Dikunjungi</span>
          </div>
        </div>

        {/* EFFECTIVE CALL */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Effective Call</span>
          <div className="mt-1">
            <span className="text-xl font-bold font-heading text-emerald-700">
              {kpis.effective_call?.toLocaleString("id-ID") || 0}
            </span>
            <span className="text-[10px] text-slate-400 block">Kunjungan + Order</span>
          </div>
        </div>

        {/* EC RATE */}
        <div className="bg-navy p-3 rounded-2xl text-white shadow-xs flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-gold tracking-wider">EC Rate</span>
          <div className="mt-1">
            <span className="text-xl font-bold font-heading text-white">
              {kpis.ec_rate || 0}%
            </span>
            <span className="text-[10px] text-slate-300 block">Rasio Efektivitas</span>
          </div>
        </div>

        {/* TOTAL VOLUME & REVENUE */}
        <div className="bg-gradient-to-br from-navy-light to-navy p-3 rounded-2xl text-white shadow-xs flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-gold tracking-wider">Total Volume & Nilai</span>
          <div className="mt-1">
            <div className="text-base font-bold text-white">
              {kpis.total_volume?.toLocaleString("id-ID") || 0} <span className="text-[10px] font-normal text-slate-200">Qty</span>
            </div>
            <div className="text-[11px] font-bold text-gold truncate">
              {rupiah(kpis.total_revenue || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs View Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pt-2">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === "all"
                ? "bg-navy text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Store size={14} />
            Semua Outlet ({outletsList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dormant")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === "dormant"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
            }`}
          >
            <AlertTriangle size={14} />
            Outlet Dormant ({kpis.dormant || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("noo")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === "noo"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200"
            }`}
          >
            <TrendingUp size={14} />
            Outlet Baru / NOO ({kpis.noo || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("region")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === "region"
                ? "bg-navy text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Building2 size={14} />
            Rekap per Kab/Kota ({reportData?.region_report?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("area")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === "area"
                ? "bg-navy text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <MapPin size={14} />
            Rekap per Area ({reportData?.area_report?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sales")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === "sales"
                ? "bg-navy text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <User size={14} />
            Rekap per Sales ({reportData?.sales_report?.length || 0})
          </button>
        </div>

        <div className="text-xs text-slate-500 pb-2">
          Menampilkan <span className="font-bold text-slate-800">{tabFilteredOutlets.length}</span> baris data
        </div>
      </div>

      {/* Main Content Tables */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <Loader2 size={32} className="animate-spin text-navy mx-auto mb-3" />
          <span className="text-sm font-semibold text-slate-600">Menghitung dan memuat laporan outlet real-time...</span>
        </div>
      ) : activeTab === "region" ? (
        /* REGION / KABUPATEN RECAP TABLE */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <span className="font-heading font-bold text-navy text-sm">Rekap Performa Outlet Berdasarkan Wilayah Administratif (Kabupaten/Kota)</span>
            <span className="text-xs text-slate-500 font-semibold">{reportData?.region_report?.length || 0} Kabupaten/Kota</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead className="text-xs font-bold text-slate-700">Kabupaten / Kota</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Provinsi</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Total Outlet</TableHead>
                  <TableHead className="text-xs font-bold text-blue-700 text-center">NOO</TableHead>
                  <TableHead className="text-xs font-bold text-purple-700 text-center">Repeat</TableHead>
                  <TableHead className="text-xs font-bold text-emerald-700 text-center">Active</TableHead>
                  <TableHead className="text-xs font-bold text-amber-700 text-center">Dormant</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Outlet Call</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Effective Call</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">EC Rate</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">Volume (Qty)</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">Revenue (Rp)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reportData?.region_report || []).map((r, idx) => (
                  <TableRow key={r.regency_id || idx} className="hover:bg-slate-50/80">
                    <TableCell className="font-bold text-navy text-xs">{r.regency_name}</TableCell>
                    <TableCell className="text-xs text-slate-600">{r.province_name}</TableCell>
                    <TableCell className="text-center font-bold text-xs">{r.total_outlets}</TableCell>
                    <TableCell className="text-center text-xs text-blue-700 font-semibold">{r.noo}</TableCell>
                    <TableCell className="text-center text-xs text-purple-700 font-semibold">{r.repeat}</TableCell>
                    <TableCell className="text-center text-xs text-emerald-700 font-semibold">{r.active}</TableCell>
                    <TableCell className="text-center text-xs text-amber-700 font-semibold">{r.dormant}</TableCell>
                    <TableCell className="text-center text-xs">{r.outlet_call}</TableCell>
                    <TableCell className="text-center text-xs font-semibold text-emerald-700">{r.effective_call}</TableCell>
                    <TableCell className="text-center text-xs font-bold">{r.ec_rate}%</TableCell>
                    <TableCell className="text-right text-xs font-bold">{r.volume.toLocaleString("id-ID")}</TableCell>
                    <TableCell className="text-right text-xs font-bold text-navy">{rupiah(r.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : activeTab === "area" ? (
        /* AREA SUMMARY TABLE */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <span className="font-heading font-bold text-navy text-sm">Rekap Performa Outlet Berdasarkan Area Penugasan Sales</span>
            <span className="text-xs text-slate-500 font-semibold">{reportData?.area_report?.length || 0} Area</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead className="text-xs font-bold text-slate-700">Nama Area</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Total Outlet</TableHead>
                  <TableHead className="text-xs font-bold text-blue-700 text-center">NOO</TableHead>
                  <TableHead className="text-xs font-bold text-purple-700 text-center">Repeat</TableHead>
                  <TableHead className="text-xs font-bold text-emerald-700 text-center">Active</TableHead>
                  <TableHead className="text-xs font-bold text-amber-700 text-center">Dormant</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Outlet Call</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Effective Call</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">EC Rate</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">Volume (Qty)</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">Revenue (Rp)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reportData?.area_report || []).map((a) => (
                  <TableRow key={a.area_id} className="hover:bg-slate-50/80">
                    <TableCell className="font-bold text-navy text-xs">{a.area_name}</TableCell>
                    <TableCell className="text-center font-bold text-xs">{a.total_outlets}</TableCell>
                    <TableCell className="text-center text-xs text-blue-700 font-semibold">{a.noo}</TableCell>
                    <TableCell className="text-center text-xs text-purple-700 font-semibold">{a.repeat}</TableCell>
                    <TableCell className="text-center text-xs text-emerald-700 font-semibold">{a.active}</TableCell>
                    <TableCell className="text-center text-xs text-amber-700 font-semibold">{a.dormant}</TableCell>
                    <TableCell className="text-center text-xs">{a.outlet_call}</TableCell>
                    <TableCell className="text-center text-xs font-semibold text-emerald-700">{a.effective_call}</TableCell>
                    <TableCell className="text-center text-xs font-bold">{a.ec_rate}%</TableCell>
                    <TableCell className="text-right text-xs font-bold">{a.volume.toLocaleString("id-ID")}</TableCell>
                    <TableCell className="text-right text-xs font-bold text-navy">{rupiah(a.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : activeTab === "sales" ? (
        /* SALES SUMMARY TABLE */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <span className="font-heading font-bold text-navy text-sm">Rekap Performa Outlet Berdasarkan Sales</span>
            <span className="text-xs text-slate-500 font-semibold">{reportData?.sales_report?.length || 0} Salesman</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead className="text-xs font-bold text-slate-700">Nama Salesman</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Area</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Total Outlet</TableHead>
                  <TableHead className="text-xs font-bold text-blue-700 text-center">NOO</TableHead>
                  <TableHead className="text-xs font-bold text-purple-700 text-center">Repeat</TableHead>
                  <TableHead className="text-xs font-bold text-emerald-700 text-center">Active</TableHead>
                  <TableHead className="text-xs font-bold text-amber-700 text-center">Dormant</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Outlet Call</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Effective Call</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">EC Rate</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">Target Volume</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">Actual Volume</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">Ach (%)</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">Revenue (Rp)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reportData?.sales_report || []).map((s) => (
                  <TableRow key={s.salesman_id} className="hover:bg-slate-50/80">
                    <TableCell className="font-bold text-navy text-xs">{s.salesman_name}</TableCell>
                    <TableCell className="text-xs text-slate-600">{s.area_name}</TableCell>
                    <TableCell className="text-center font-bold text-xs">{s.total_outlets}</TableCell>
                    <TableCell className="text-center text-xs text-blue-700 font-semibold">{s.noo}</TableCell>
                    <TableCell className="text-center text-xs text-purple-700 font-semibold">{s.repeat}</TableCell>
                    <TableCell className="text-center text-xs text-emerald-700 font-semibold">{s.active}</TableCell>
                    <TableCell className="text-center text-xs text-amber-700 font-semibold">{s.dormant}</TableCell>
                    <TableCell className="text-center text-xs">{s.outlet_call}</TableCell>
                    <TableCell className="text-center text-xs font-semibold text-emerald-700">{s.effective_call}</TableCell>
                    <TableCell className="text-center text-xs font-bold">{s.ec_rate}%</TableCell>
                    <TableCell className="text-right text-xs text-slate-500">{s.target_volume ? s.target_volume.toLocaleString("id-ID") : "-"}</TableCell>
                    <TableCell className="text-right text-xs font-bold">{s.actual_volume.toLocaleString("id-ID")}</TableCell>
                    <TableCell className="text-center text-xs font-bold">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${s.achievement_pct >= 100 ? "bg-emerald-100 text-emerald-800" : s.achievement_pct > 0 ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>
                        {s.achievement_pct}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold text-navy">{rupiah(s.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        /* OUTLETS TABLE (ALL / DORMANT / NOO) */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {tabFilteredOutlets.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Store size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">Tidak ada data outlet yang sesuai dengan filter ini.</p>
              <p className="text-xs text-slate-400 mt-1">Coba sesuaikan rentang tanggal, wilayah administratif, status, atau kata kunci pencarian.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-100">
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Kode Outlet</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Nama Outlet & Pemilik</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Wilayah Administratif</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Area Sales</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Sales PIC</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap text-center">Status</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap text-center">Outlet Call</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap text-center">Effective Call</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap text-center">EC Rate</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap text-center">Transaksi</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap text-right">Volume (Qty)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap text-right">Revenue (Rp)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap">Txn Terakhir</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 whitespace-nowrap text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabFilteredOutlets.map((o) => {
                    const badge = STATUS_BADGES[o.lifecycle_status] || STATUS_BADGES.PROSPECT;
                    return (
                      <TableRow
                        key={o._id}
                        className="hover:bg-slate-50/90 transition-colors cursor-pointer"
                        onClick={() => openOutletDetail(o._id)}
                      >
                        <TableCell className="font-mono text-xs font-bold text-navy whitespace-nowrap">
                          {o.outlet_code}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="font-bold text-xs text-slate-900">{o.outlet_name}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <span>{o.owner_name}</span>
                            {o.channel_name && o.channel_name !== "-" && (
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px]">
                                {o.channel_name}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">
                            {o.regency_name !== "-" ? o.regency_name : o.province_name}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            {o.district_name && o.district_name !== "-" && <span>Kec. {o.district_name}</span>}
                            {o.village_name && o.village_name !== "-" && <span>&bull; {o.village_name}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 whitespace-nowrap">
                          {o.area_name}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 whitespace-nowrap">
                          <div className="font-medium">{o.assigned_sales_name}</div>
                          {o.assigned_sales_code && o.assigned_sales_code !== "-" && (
                            <span className="text-[10px] text-slate-400 font-mono">{o.assigned_sales_code}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.bg}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {badge.short}
                          </span>
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap text-xs">
                          {o.outlet_call > 0 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-800 font-bold text-[11px]">
                              1
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap text-xs">
                          {o.effective_call > 0 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              1
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap text-xs font-bold">
                          {o.outlet_call > 0 ? (
                            <span className={o.ec_rate >= 100 ? "text-emerald-700 font-bold" : "text-slate-700"}>
                              {o.ec_rate}%
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap text-xs font-bold text-slate-800">
                          {o.transaction_count}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-xs font-bold text-slate-800">
                          {o.volume.toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-xs font-bold text-navy">
                          {rupiah(o.revenue)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {o.last_transaction_date ? (
                            <div>
                              <div className="font-semibold text-slate-700">{o.last_transaction_date}</div>
                              <div className="text-[10px] text-slate-400">
                                {o.days_since_last_transaction !== null ? `${o.days_since_last_transaction} hari lalu` : "-"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Belum ada</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openOutletDetail(o._id);
                            }}
                            className="h-7 text-xs text-navy hover:bg-navy/10 px-2 font-semibold"
                          >
                            <Eye size={13} className="mr-1" /> Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* OUTLET DETAIL DRAWER / MODAL */}
      {selectedOutletId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-navy p-5 text-white flex items-center justify-between border-b border-navy-light shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-2xl">
                  <Store size={22} className="text-gold" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading font-bold text-lg text-white">
                      {outletDetail?.outlet_profile?.outlet_name || "Detail Performa Outlet"}
                    </h3>
                    {outletDetail?.outlet_profile?.lifecycle_status && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gold text-navy uppercase">
                        {outletDetail.outlet_profile.lifecycle_status}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 font-mono mt-0.5">
                    {outletDetail?.outlet_profile?.outlet_code || selectedOutletId} &bull; {outletDetail?.outlet_profile?.area_name} &bull; PIC: {outletDetail?.outlet_profile?.salesman_name}
                  </p>
                </div>
              </div>

              <button
                onClick={() => closeOutletDetail()}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sub-Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-5 pt-3 overflow-x-auto shrink-0">
              <button
                onClick={() => setDetailTab("profile")}
                className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                  detailTab === "profile"
                    ? "bg-white text-navy border-gold shadow-xs"
                    : "text-slate-500 border-transparent hover:text-slate-800"
                }`}
              >
                Profil & Wilayah
              </button>
              <button
                onClick={() => setDetailTab("product")}
                className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                  detailTab === "product"
                    ? "bg-white text-navy border-gold shadow-xs"
                    : "text-slate-500 border-transparent hover:text-slate-800"
                }`}
              >
                Rincian Produk & SKU ({outletDetail?.product_performance?.length || 0})
              </button>
              <button
                onClick={() => setDetailTab("transactions")}
                className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                  detailTab === "transactions"
                    ? "bg-white text-navy border-gold shadow-xs"
                    : "text-slate-500 border-transparent hover:text-slate-800"
                }`}
              >
                Riwayat Transaksi ({outletDetail?.transaction_history?.length || 0})
              </button>
              <button
                onClick={() => setDetailTab("visits")}
                className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                  detailTab === "visits"
                    ? "bg-white text-navy border-gold shadow-xs"
                    : "text-slate-500 border-transparent hover:text-slate-800"
                }`}
              >
                Riwayat Kunjungan ({outletDetail?.visit_history?.length || 0})
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {loadingDetail ? (
                <div className="py-16 text-center">
                  <Loader2 size={32} className="animate-spin text-navy mx-auto mb-3" />
                  <span className="text-xs font-semibold text-slate-500">Memuat rincian transaksi & performa outlet...</span>
                </div>
              ) : !outletDetail ? (
                <div className="py-12 text-center text-slate-400">Data outlet tidak ditemukan.</div>
              ) : detailTab === "profile" ? (
                /* PROFILE & SUMMARY TAB */
                <div className="space-y-5">
                  {/* KPI mini-cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Kunjungan (Call)</span>
                      <span className="text-lg font-bold font-heading text-navy mt-1 block">
                        {outletDetail.activity_summary.outlet_call > 0 ? "Tercatat (1)" : "Belum Dikunjungi (0)"}
                      </span>
                      <span className="text-[10px] text-slate-400">Periode Laporan</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Effective Call</span>
                      <span className="text-lg font-bold font-heading text-emerald-700 mt-1 block">
                        {outletDetail.activity_summary.effective_call > 0 ? "Efektif (EC)" : "Belum Order (0)"}
                      </span>
                      <span className="text-[10px] text-slate-400">EC Rate: {outletDetail.activity_summary.ec_rate}%</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Volume Periode Ini</span>
                      <span className="text-lg font-bold font-heading text-navy mt-1 block">
                        {outletDetail.activity_summary.volume.toLocaleString("id-ID")} <span className="text-xs font-normal">Qty</span>
                      </span>
                      <span className="text-[10px] text-slate-400">{outletDetail.activity_summary.transaction_count} Transaksi</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Revenue Periode Ini</span>
                      <span className="text-lg font-bold font-heading text-emerald-700 mt-1 block">
                        {rupiah(outletDetail.activity_summary.revenue)}
                      </span>
                      <span className="text-[10px] text-slate-400">Total Nilai Penjualan</span>
                    </div>
                  </div>

                  {/* Profile Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100 pb-2 flex items-center justify-between">
                        <span>Informasi Outlet & Pemilik</span>
                        <Store size={14} className="text-slate-400" />
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Nama Outlet:</span>
                          <span className="font-semibold text-slate-800">{outletDetail.outlet_profile.outlet_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Nama Pemilik:</span>
                          <span className="font-semibold text-slate-800">{outletDetail.outlet_profile.owner_name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Nomor Telepon:</span>
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            {outletDetail.outlet_profile.phone}
                            {outletDetail.outlet_profile.phone !== "-" && (
                              <a
                                href={`https://wa.me/${outletDetail.outlet_profile.phone.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 hover:text-emerald-700 ml-1"
                              >
                                <Phone size={12} />
                              </a>
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Alamat Lengkap:</span>
                          <span className="font-semibold text-slate-800 text-right max-w-[240px]">{outletDetail.outlet_profile.address}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Saluran / Channel:</span>
                          <span className="font-semibold text-slate-800">{outletDetail.outlet_profile.channel_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Term of Payment:</span>
                          <span className="font-semibold text-slate-800">
                            {outletDetail.outlet_profile.payment_term_days || outletDetail.outlet_profile.term_of_payment || 0} Hari
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Credit Limit:</span>
                          <span className="font-semibold text-slate-800">{rupiah(outletDetail.outlet_profile.credit_limit || 0)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100 pb-2 flex items-center justify-between">
                        <span>Penugasan Sales & Status</span>
                        <MapPin size={14} className="text-slate-400" />
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Area Penugasan Sales:</span>
                          <span className="font-semibold text-slate-800">{outletDetail.outlet_profile.area_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Sales Penanggung Jawab:</span>
                          <span className="font-semibold text-slate-800">{outletDetail.outlet_profile.salesman_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Status Lifecycle:</span>
                          <span className="font-bold text-navy">{outletDetail.outlet_profile.lifecycle_status}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Transaksi Pertama:</span>
                          <span className="font-semibold text-slate-800">{outletDetail.transaction_summary.first_transaction_date}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Transaksi Terakhir:</span>
                          <span className="font-semibold text-slate-800">{outletDetail.transaction_summary.last_transaction_date}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Hari Sejak Txn Terakhir:</span>
                          <span className="font-semibold text-slate-800">
                            {outletDetail.transaction_summary.days_since_last_transaction !== null
                              ? `${outletDetail.transaction_summary.days_since_last_transaction} hari`
                              : "-"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Transaksi Sepanjang Masa:</span>
                          <span className="font-semibold text-slate-800">
                            {outletDetail.transaction_summary.all_time_transactions} Transaksi ({outletDetail.transaction_summary.all_time_volume.toLocaleString("id-ID")} Qty &bull; {rupiah(outletDetail.transaction_summary.all_time_revenue)})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : detailTab === "product" ? (
                /* PRODUCT & SKU PERFORMANCE TAB */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Kinerja Penjualan per SKU (Target vs Aktual Volume)
                    </h4>
                  </div>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-100">
                          <TableHead className="text-xs font-bold text-slate-700">Kode SKU</TableHead>
                          <TableHead className="text-xs font-bold text-slate-700">Nama SKU & Produk</TableHead>
                          <TableHead className="text-xs font-bold text-slate-700 text-right">Target (Qty)</TableHead>
                          <TableHead className="text-xs font-bold text-slate-700 text-right">Aktual (Qty)</TableHead>
                          <TableHead className="text-xs font-bold text-slate-700 text-center">Ach (%)</TableHead>
                          <TableHead className="text-xs font-bold text-slate-700 text-center">Txn</TableHead>
                          <TableHead className="text-xs font-bold text-slate-700 text-right">Revenue (Rp)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(outletDetail.product_performance || []).map((p) => (
                          <TableRow key={p.sku_id} className="hover:bg-slate-50">
                            <TableCell className="font-mono text-xs font-bold text-navy">{p.sku_code}</TableCell>
                            <TableCell className="text-xs font-semibold text-slate-800">{p.sku_name}</TableCell>
                            <TableCell className="text-right text-xs text-slate-500">
                              {p.target_volume ? p.target_volume.toLocaleString("id-ID") : "-"}
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-slate-900">
                              {p.actual_volume.toLocaleString("id-ID")}
                            </TableCell>
                            <TableCell className="text-center text-xs font-bold">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] ${
                                  p.achievement_pct >= 100
                                    ? "bg-emerald-100 text-emerald-800"
                                    : p.achievement_pct > 0
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {p.achievement_pct}%
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-xs">{p.transaction_count}</TableCell>
                            <TableCell className="text-right text-xs font-bold text-navy">{rupiah(p.revenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : detailTab === "transactions" ? (
                /* TRANSACTIONS TAB */
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Riwayat Transaksi Penjualan Lengkap
                  </h4>
                  {outletDetail.transaction_history?.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">Belum ada transaksi tercatat untuk outlet ini.</div>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-100">
                            <TableHead className="text-xs font-bold text-slate-700">No. Invoice</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700">Tanggal</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700">Salesman</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700">Rincian Barang (SKU x Qty)</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700 text-right">Volume (Qty)</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700 text-right">Total (Rp)</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700 text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {outletDetail.transaction_history.map((t) => (
                            <TableRow key={t._id} className="hover:bg-slate-50">
                              <TableCell className="font-mono text-xs font-bold text-navy">{t.invoice_number}</TableCell>
                              <TableCell className="text-xs text-slate-600 whitespace-nowrap">{t.transaction_date?.slice(0, 10)}</TableCell>
                              <TableCell className="text-xs text-slate-700">{t.salesman_name}</TableCell>
                              <TableCell className="text-xs text-slate-700">
                                <div className="space-y-0.5">
                                  {t.items.map((it, idx) => (
                                    <div key={idx} className="text-[11px]">
                                      &bull; <span className="font-semibold">{it.sku_name || it.product_name}</span> ({it.quantity} @ {rupiah(it.unit_price)})
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-xs font-bold text-slate-800">{t.volume}</TableCell>
                              <TableCell className="text-right text-xs font-bold text-navy">{rupiah(t.revenue)}</TableCell>
                              <TableCell className="text-center text-xs">
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                  {t.status}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ) : (
                /* VISITS TAB */
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Riwayat Kunjungan Sales
                  </h4>
                  {outletDetail.visit_history?.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">Belum ada kunjungan tercatat untuk outlet ini.</div>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-100">
                            <TableHead className="text-xs font-bold text-slate-700">Tanggal</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700">Salesman</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700 text-center">Waktu Masuk / Keluar</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700 text-center">Hasil Kunjungan</TableHead>
                            <TableHead className="text-xs font-bold text-slate-700">Catatan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {outletDetail.visit_history.map((v) => (
                            <TableRow key={v._id} className="hover:bg-slate-50">
                              <TableCell className="text-xs font-bold text-slate-800 whitespace-nowrap">{v.date}</TableCell>
                              <TableCell className="text-xs text-slate-700">{v.salesman_name}</TableCell>
                              <TableCell className="text-center text-xs text-slate-600 whitespace-nowrap">
                                {v.check_in_time ? new Date(v.check_in_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"} s/d{" "}
                                {v.check_out_time && v.check_out_time !== "-" ? new Date(v.check_out_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                              </TableCell>
                              <TableCell className="text-center text-xs">
                                <span
                                  className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                    v.is_effective
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                      : "bg-amber-100 text-amber-800 border border-amber-200"
                                  }`}
                                >
                                  {v.is_effective ? "EFFECTIVE CALL" : "OPEN / TANPA ORDER"}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-slate-600 max-w-[200px] truncate">{v.notes || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => closeOutletDetail()} className="text-xs font-bold">
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
