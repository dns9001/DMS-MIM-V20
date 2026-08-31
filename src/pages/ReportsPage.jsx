import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  Download,
  Play,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
  Filter,
  RotateCcw,
  Store,
  ArrowUpRight,
  TrendingUp,
  Users,
  MapPin,
  Package,
  Clock,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  BarChart3,
  Calendar,
  Boxes,
  Scale,
  Receipt,
  Route,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Info,
  ListChecks,
} from "lucide-react";
import api, { errMsg } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { rupiah, todayLocal, formatNumber } from "../lib/format";
import { exportToCSV, exportToXLSX, exportToPDF } from "../lib/export";

const CATEGORY_MAP = {
  ALL: { label: "Semua Laporan", icon: BarChart3 },
  SALES: { label: "Penjualan & Target", icon: TrendingUp },
  OUTLET: { label: "Outlet & Toko", icon: Store },
  INVENTORY: { label: "Stok & Gudang", icon: Boxes },
  FIELD: { label: "Operasional & Absensi", icon: Clock },
};

const STATUS_BADGE_STYLES = {
  "EFFECTIVE CALL": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "OUTLET CALL": "bg-blue-50 text-blue-700 border-blue-200",
  "TIDAK DIKUNJUNGI": "bg-slate-100 text-slate-600 border-slate-200",
  "COMPLETED": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "ACTIVE": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "NOO": "bg-blue-50 text-blue-700 border-blue-200",
  "REPEAT": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "DORMANT": "bg-rose-50 text-rose-700 border-rose-200",
  "PROSPECT": "bg-amber-50 text-amber-700 border-amber-200",
  "AMAN": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "PERLU REORDER": "bg-rose-50 text-rose-700 border-rose-200",
  "PAS (MATCH)": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "ON_DUTY": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "VISITING": "bg-purple-50 text-purple-700 border-purple-200",
  "ON_FIELD": "bg-blue-50 text-blue-700 border-blue-200",
  "OFF_DUTY": "bg-slate-100 text-slate-600 border-slate-200",
  "PRESENT": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "ABSENT": "bg-rose-50 text-rose-700 border-rose-200",
  "LATE": "bg-amber-50 text-amber-700 border-amber-200",
  "ON_TRACK": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "NEEDS_ATTENTION": "bg-amber-50 text-amber-700 border-amber-200",
  "AT_RISK": "bg-rose-50 text-rose-700 border-rose-200",
  "EFFECTIVE (ORDER)": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "SELESAI KUNJUNGAN": "bg-blue-50 text-blue-700 border-blue-200",
  "PENDING": "bg-amber-50 text-amber-700 border-amber-200",
};

export default function ReportsPage() {
  const { user } = useAuth();
  const [types, setTypes] = useState([]);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [searchReportType, setSearchReportType] = useState("");
  const [rtype, setRtype] = useState("");

  // Filter States
  const [from, setFrom] = useState(todayLocal());
  const [to, setTo] = useState(todayLocal());
  const [salesmanId, setSalesmanId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [skuId, setSkuId] = useState("");

  // Master Data
  const [salesmen, setSalesmen] = useState([]);
  const [areas, setAreas] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [channels, setChannels] = useState([]);
  const [skus, setSkus] = useState([]);

  // Result & Table States
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc"); // "asc" | "desc"
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Set initial preset date
  const setPreset = (preset) => {
    const f = (d) => {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(d);
    };
    const now = new Date();
    if (preset === "today") {
      const t = todayLocal();
      setFrom(t);
      setTo(t);
    } else if (preset === "yesterday") {
      const y = new Date(Date.now() - 86400000);
      setFrom(f(y));
      setTo(f(y));
    } else if (preset === "7d") {
      const fromD = new Date(Date.now() - 6 * 86400000);
      setFrom(f(fromD));
      setTo(f(now));
    } else if (preset === "30d") {
      const fromD = new Date(Date.now() - 29 * 86400000);
      setFrom(f(fromD));
      setTo(f(now));
    } else if (preset === "thisMonth") {
      const cur = todayLocal();
      setFrom(`${cur.slice(0, 7)}-01`);
      setTo(cur);
    } else if (preset === "lastMonth") {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      const startLastMonth = f(d);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      setFrom(startLastMonth);
      setTo(f(lastDay));
    }
  };

  const resetFilters = () => {
    const t = todayLocal();
    setFrom(t);
    setTo(t);
    setSalesmanId(user?.role === "SALES" ? user._id : "");
    setAreaId("");
    setRouteId("");
    setChannelId("");
    setSkuId("");
    setTableSearch("");
    setCurrentPage(1);
  };

  // Initial Load
  useEffect(() => {
    (async () => {
      try {
        const [t, s, a, r, c, sk] = await Promise.all([
          api.get("/reports"),
          api.get("/masters/salesmen", { params: { limit: 100 } }),
          api.get("/masters/areas", { params: { limit: 100 } }),
          api.get("/routes", { params: { limit: 100 } }).catch(() => ({ data: { items: [] } })),
          api.get("/masters/channels", { params: { limit: 100 } }),
          api.get("/masters/skus", { params: { limit: 100 } }),
        ]);

        const list = t.data.items || t.data || [];
        setTypes(list);
        if (list.length > 0) {
          setRtype(list[0].key || list[0].id);
        }
        setSalesmen(s.data.items || []);
        setAreas(a.data.items || []);
        setRoutes(r.data.items || r.data || []);
        setChannels(c.data.items || []);
        setSkus(sk.data.items || []);
      } catch (e) {
        toast.error(errMsg(e));
      }
    })();
  }, []);

  const params = useCallback(() => {
    const p = { from, to };
    if (salesmanId && salesmanId !== "ALL") p.salesman_id = salesmanId;
    if (areaId && areaId !== "ALL") p.area_id = areaId;
    if (routeId && routeId !== "ALL") p.route_id = routeId;
    if (channelId && channelId !== "ALL") p.channel_id = channelId;
    if (skuId && skuId !== "ALL") p.sku_id = skuId;
    return p;
  }, [from, to, salesmanId, areaId, routeId, channelId, skuId]);

  const runReport = useCallback(
    async (selectedType = rtype) => {
      if (!selectedType) return;
      setLoading(true);
      try {
        const { data } = await api.get(`/reports/${selectedType}`, { params: params() });
        setResult(data);
        setCurrentPage(1);
        setTableSearch("");
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        setLoading(false);
      }
    },
    [rtype, params]
  );

  // Auto-run when rtype changes
  useEffect(() => {
    if (rtype) {
      runReport(rtype);
    }
  }, [rtype]);

  // Filtered list of report types for the category view / dropdown
  const filteredTypes = useMemo(() => {
    return types.filter((t) => {
      if (activeCategory !== "ALL" && t.category !== activeCategory) return false;
      if (searchReportType) {
        const q = searchReportType.toLowerCase();
        const mName = (t.name || "").toLowerCase().includes(q);
        const mDesc = (t.description || "").toLowerCase().includes(q);
        const mKey = (t.key || t.id || "").toLowerCase().includes(q);
        if (!mName && !mDesc && !mKey) return false;
      }
      return true;
    });
  }, [types, activeCategory, searchReportType]);

  const activeReportObj = useMemo(() => {
    return types.find((t) => (t.key || t.id) === rtype);
  }, [types, rtype]);

  const rawRows = useMemo(() => {
    return result?.rows || result?.data || [];
  }, [result]);

  const columns = useMemo(() => {
    return rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  }, [rawRows]);

  // Client-side search and sorting
  const processedRows = useMemo(() => {
    let list = [...rawRows];

    // Search inside table
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter((row) => {
        return Object.values(row).some((val) =>
          String(val ?? "").toLowerCase().includes(q)
        );
      });
    }

    // Sort column
    if (sortColumn) {
      list.sort((a, b) => {
        let valA = a[sortColumn];
        let valB = b[sortColumn];

        if (typeof valA === "number" && typeof valB === "number") {
          return sortDirection === "asc" ? valA - valB : valB - valA;
        }

        const strA = String(valA ?? "").toLowerCase();
        const strB = String(valB ?? "").toLowerCase();
        return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return list;
  }, [rawRows, tableSearch, sortColumn, sortDirection]);

  // Pagination
  const totalRowsCount = processedRows.length;
  const totalPages = pageSize === "ALL" ? 1 : Math.ceil(totalRowsCount / Number(pageSize)) || 1;
  const paginatedRows = useMemo(() => {
    if (pageSize === "ALL") return processedRows;
    const start = (currentPage - 1) * Number(pageSize);
    return processedRows.slice(start, start + Number(pageSize));
  }, [processedRows, currentPage, pageSize]);

  // Dynamic KPI Metrics summary
  const reportKPIs = useMemo(() => {
    if (!rawRows.length) return null;

    let totalVolume = 0;
    let totalRevenue = 0;
    let totalPlanned = 0;
    let totalActualCalls = 0;
    let totalEffectiveCalls = 0;
    let hasVolume = false;
    let hasRevenue = false;
    let hasCalls = false;

    rawRows.forEach((r) => {
      // Find volume key
      Object.keys(r).forEach((k) => {
        const lower = k.toLowerCase();
        const val = Number(r[k]) || 0;

        if (lower.includes("volume") || lower.includes("qty") || lower.includes("kuantitas")) {
          totalVolume += val;
          hasVolume = true;
        } else if (lower.includes("nilai") || lower.includes("revenue") || lower.includes("penjualan") || lower.includes("total (rp)") || lower.includes("aset")) {
          totalRevenue += val;
          hasRevenue = true;
        } else if (lower === "planned call" || lower.includes("rencana")) {
          totalPlanned += val;
          hasCalls = true;
        } else if (lower === "outlet call" || lower.includes("kunjungan")) {
          totalActualCalls += val;
          hasCalls = true;
        } else if (lower === "effective call") {
          totalEffectiveCalls += val;
          hasCalls = true;
        }
      });
    });

    return {
      totalRows: rawRows.length,
      hasVolume,
      totalVolume,
      hasRevenue,
      totalRevenue,
      hasCalls,
      totalPlanned,
      totalActualCalls,
      totalEffectiveCalls,
      avgRevenue: totalActualCalls > 0 ? Math.round(totalRevenue / totalActualCalls) : (rawRows.length > 0 ? Math.round(totalRevenue / rawRows.length) : 0),
      ecRate: totalActualCalls > 0 ? Math.round((totalEffectiveCalls / totalActualCalls) * 100) : 0,
    };
  }, [rawRows]);

  const handleSort = (col) => {
    if (sortColumn === col) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (salesmanId && salesmanId !== "ALL") count++;
    if (areaId && areaId !== "ALL") count++;
    if (routeId && routeId !== "ALL") count++;
    if (channelId && channelId !== "ALL") count++;
    if (skuId && skuId !== "ALL") count++;
    return count;
  }, [salesmanId, areaId, routeId, channelId, skuId]);

  // Export handlers
  const getReportFilename = (type) => {
    switch (type) {
      case "route-performance":
        return "DMS_Mahameru_Laporan_Performa_Master_Rute";
      case "call-plan-detail":
        return "DMS_Mahameru_Laporan_Detail_Call_Plan";
      case "call-achievement":
        return "DMS_Mahameru_Laporan_Call_Achievement";
      case "daily-sales":
        return "DMS_Mahameru_Laporan_Harian_Penjualan";
      case "sales-performance":
        return "DMS_Mahameru_Laporan_Kinerja_Sales";
      case "target-performance":
        return "DMS_Mahameru_Laporan_Target_Volume";
      case "inventory":
        return "DMS_Mahameru_Laporan_Stok_Gudang";
      case "daily-stock-movement":
        return "DMS_Mahameru_Laporan_Mutasi_Stok";
      case "sales-stock-ledger":
        return "DMS_Mahameru_Laporan_Ledger_Stok_Sales";
      case "transactions":
        return "DMS_Mahameru_Laporan_Transaksi_Penjualan";
      case "attendance":
        return "DMS_Mahameru_Laporan_Absensi_Sales";
      default:
        return `DMS_Mahameru_${(type || "Report").replace(/-/g, "_")}`;
    }
  };

  const handleExportCSV = () => {
    if (!rawRows.length) {
      toast.error("Tidak ada data untuk diekspor");
      return;
    }
    const filename = getReportFilename(rtype);
    exportToCSV(filename, columns, rawRows);
    toast.success("Laporan CSV berhasil diunduh");
  };

  const handleExportXLSX = () => {
    if (!rawRows.length) {
      toast.error("Tidak ada data untuk diekspor");
      return;
    }
    const filename = getReportFilename(rtype);
    exportToXLSX(filename, "Laporan", rawRows);
    toast.success("Laporan Excel (XLSX) berhasil diunduh");
  };

  const handleExportPDF = () => {
    if (!rawRows.length) {
      toast.error("Tidak ada data untuk diekspor");
      return;
    }
    const pdfHeaders = columns.map((col) => ({
      key: col,
      label: col.replace(/_/g, " ").toUpperCase(),
      isMoney:
        col.toLowerCase().includes("nilai") ||
        col.toLowerCase().includes("revenue") ||
        col.toLowerCase().includes("penjualan") ||
        col.toLowerCase().includes("harga") ||
        col.toLowerCase().includes("total (rp)") ||
        col.toLowerCase().includes("subtotal"),
    }));

    const filename = getReportFilename(rtype);
    const sName = salesmen.find((s) => (s.user_id || s._id) === salesmanId)?.name;
    const aName = areas.find((a) => a._id === areaId)?.name;

    exportToPDF({
      title: activeReportObj?.name ? `DMS MAHAMERU — ${activeReportObj.name.toUpperCase()}` : "DMS MAHAMERU REPORT",
      subtitle: `Periode: ${from} s/d ${to} | Filter: ${sName ? `Sales: ${sName}` : "Semua Sales"} ${aName ? `| Area: ${aName}` : ""}`,
      headers: pdfHeaders,
      data: rawRows,
      filename,
    });
    toast.success("Laporan PDF resmi PT Mahameru Insan Mandiri berhasil diunduh");
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCellValue = (col, val) => {
    if (val === null || val === undefined || val === "") return "-";
    const lower = col.toLowerCase();

    // Check money
    if (
      typeof val === "number" &&
      (lower.includes("nilai") ||
        lower.includes("revenue") ||
        lower.includes("penjualan") ||
        lower.includes("harga") ||
        lower.includes("total (rp)") ||
        lower.includes("aset"))
    ) {
      return (
        <span className="font-semibold text-slate-800">
          {rupiah(val)}
        </span>
      );
    }

    // Number formatting
    if (typeof val === "number") {
      return <span className="font-medium text-slate-700">{formatNumber(val)}</span>;
    }

    const strVal = String(val);

    // Status Badges
    if (STATUS_BADGE_STYLES[strVal]) {
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${STATUS_BADGE_STYLES[strVal]}`}
        >
          {strVal}
        </span>
      );
    }

    // Variance Badge
    if (strVal.startsWith("PAS (MATCH)")) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {strVal}
        </span>
      );
    }
    if (strVal.startsWith("DEFISIT") || strVal.startsWith("KURANG")) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          {strVal}
        </span>
      );
    }
    if (strVal.startsWith("SURPLUS") || strVal.startsWith("LEBIH")) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          {strVal}
        </span>
      );
    }

    // Percentage
    if (strVal.endsWith("%")) {
      const num = parseFloat(strVal);
      return (
        <span
          className={`inline-flex items-center gap-1 font-bold ${
            num >= 100
              ? "text-emerald-700"
              : num >= 70
              ? "text-blue-700"
              : num > 0
              ? "text-amber-700"
              : "text-slate-500"
          }`}
        >
          {strVal}
        </span>
      );
    }

    // Multi-line items like Rincian SKU
    if (strVal.includes("\n") || lower.includes("rincian") || lower.includes("detail")) {
      const lines = strVal.split("\n").filter(Boolean);
      return (
        <div className="text-left leading-relaxed py-1 font-medium text-slate-800 space-y-1">
          {lines.map((line, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-navy/50 mt-1.5 shrink-0" />
              <span className="font-semibold text-slate-800">{line}</span>
            </div>
          ))}
        </div>
      );
    }

    return strVal;
  };

  return (
    <div className="space-y-4 pb-12" data-testid="reports-page">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center justify-center p-1.5 rounded-xl bg-navy text-gold">
                <BarChart3 size={18} />
              </span>
              <h1 className="font-heading text-xl md:text-2xl font-bold text-navy">
                Report Center
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {types.length} Jenis Laporan
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-500 max-w-2xl">
              Pusat analisis performa terpadu: target vs actual volume SKU, call achievement, efektivitas kunjungan sales, rekonsiliasi stok, dan audit mutasi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/reports/outlets"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-navy text-white text-xs font-bold shadow-sm hover:bg-navy-light transition-all"
            >
              <Store size={15} className="text-gold" />
              <span>Buka Laporan Outlet Interaktif</span>
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {Object.entries(CATEGORY_MAP).map(([key, cat]) => {
            const Icon = cat.icon;
            const count =
              key === "ALL"
                ? types.length
                : types.filter((t) => t.category === key).length;
            const isActive = activeCategory === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategory(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-navy text-white shadow-xs"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60"
                }`}
              >
                <Icon size={14} className={isActive ? "text-gold" : "text-slate-400"} />
                <span>{cat.label}</span>
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-200/80 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Filter & Report Selector Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        {/* Row 1: Report Selector & Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="space-y-1 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-700">Pilih Jenis Laporan</Label>
              {activeReportObj?.category_label && (
                <span className="text-[10px] uppercase font-bold text-navy tracking-wider">
                  Kategori: {activeReportObj.category_label}
                </span>
              )}
            </div>
            <Select value={rtype} onValueChange={(val) => setRtype(val)}>
              <SelectTrigger data-testid="report-type-select" className="text-xs h-10 border-slate-300 font-medium">
                <SelectValue placeholder="Pilih jenis laporan..." />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {filteredTypes.map((t) => (
                  <SelectItem key={t.key || t.id} value={t.key || t.id} className="py-2">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 text-xs">{t.name}</span>
                      {t.description && (
                        <span className="text-[11px] text-slate-500 leading-tight">{t.description}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Calendar size={13} className="text-slate-400" />
              Dari Tanggal
            </Label>
            <Input
              data-testid="report-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="text-xs h-10 border-slate-300"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Calendar size={13} className="text-slate-400" />
              Sampai Tanggal
            </Label>
            <Input
              data-testid="report-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="text-xs h-10 border-slate-300"
            />
          </div>
        </div>

        {/* Row 2: Dimensional Filters (Salesman, Area, Route, Channel, SKU) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Users size={13} className="text-slate-400" />
              Salesman
            </Label>
            <Select
              value={salesmanId || "ALL"}
              onValueChange={(v) => setSalesmanId(v === "ALL" ? "" : v)}
              disabled={user?.role === "SALES"}
            >
              <SelectTrigger data-testid="report-salesman" className="text-xs h-9 border-slate-300">
                <SelectValue placeholder="Semua Salesman" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Salesman</SelectItem>
                {salesmen.map((s) => (
                  <SelectItem key={s.user_id || s._id} value={s.user_id || s._id}>
                    {s.name} ({s.code || s._id?.slice(-4)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <MapPin size={13} className="text-slate-400" />
              Area / Wilayah
            </Label>
            <Select value={areaId || "ALL"} onValueChange={(v) => setAreaId(v === "ALL" ? "" : v)}>
              <SelectTrigger data-testid="report-area" className="text-xs h-9 border-slate-300">
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

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Route size={13} className="text-slate-400" />
              Rute Kunjungan
            </Label>
            <Select value={routeId || "ALL"} onValueChange={(v) => setRouteId(v === "ALL" ? "" : v)}>
              <SelectTrigger data-testid="report-route" className="text-xs h-9 border-slate-300">
                <SelectValue placeholder="Semua Rute" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="ALL">Semua Rute</SelectItem>
                {routes.map((r) => (
                  <SelectItem key={r._id} value={r._id}>
                    {r.name} {r.code ? `(${r.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Layers size={13} className="text-slate-400" />
              Channel
            </Label>
            <Select value={channelId || "ALL"} onValueChange={(v) => setChannelId(v === "ALL" ? "" : v)}>
              <SelectTrigger data-testid="report-channel" className="text-xs h-9 border-slate-300">
                <SelectValue placeholder="Semua Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Channel</SelectItem>
                {channels.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Package size={13} className="text-slate-400" />
              SKU / Produk
            </Label>
            <Select value={skuId || "ALL"} onValueChange={(v) => setSkuId(v === "ALL" ? "" : v)}>
              <SelectTrigger data-testid="report-sku" className="text-xs h-9 border-slate-300">
                <SelectValue placeholder="Semua SKU" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
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

        {/* Row 3: Presets & Action Trigger Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setPreset("today")}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setPreset("yesterday")}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
              >
                Kemarin
              </button>
              <button
                type="button"
                onClick={() => setPreset("7d")}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
              >
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => setPreset("30d")}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
              >
                30 Hari
              </button>
              <button
                type="button"
                onClick={() => setPreset("thisMonth")}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => setPreset("lastMonth")}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg hover:bg-white text-slate-600 transition-all"
              >
                Bulan Lalu
              </button>
            </div>

            <Button
              data-testid="report-run-button"
              onClick={() => runReport(rtype)}
              disabled={loading || !rtype}
              className="bg-navy hover:bg-navy-light text-white font-bold h-9 text-xs shadow-xs"
            >
              {loading ? (
                <Loader2 className="animate-spin mr-1.5" size={14} />
              ) : (
                <Play size={14} className="mr-1.5 text-gold" />
              )}
              Tampilkan Data
            </Button>

            {activeFiltersCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => resetFilters()}
                className="text-xs text-slate-500 hover:text-slate-800 h-9"
              >
                <RotateCcw size={13} className="mr-1" />
                Reset Filter ({activeFiltersCount})
              </Button>
            )}
          </div>

          {/* Export Action Buttons */}
          {rawRows.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-semibold mr-1">Ekspor:</span>
              <Button
                data-testid="report-export-csv"
                onClick={() => handleExportCSV()}
                variant="outline"
                size="sm"
                className="h-8 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <Download size={13} className="mr-1 text-slate-500" />
                CSV
              </Button>
              <Button
                data-testid="report-export-xlsx"
                onClick={() => handleExportXLSX()}
                variant="outline"
                size="sm"
                className="h-8 text-xs border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
              >
                <FileSpreadsheet size={13} className="mr-1 text-emerald-600" />
                Excel (.xlsx)
              </Button>
              <Button
                data-testid="report-export-pdf"
                onClick={() => handleExportPDF()}
                variant="outline"
                size="sm"
                className="h-8 text-xs border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
              >
                <FileText size={13} className="mr-1 text-red-600" />
                PDF Resmi
              </Button>
              <Button
                data-testid="report-print"
                onClick={() => handlePrint()}
                variant="outline"
                size="sm"
                className="h-8 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <Printer size={13} className="mr-1 text-slate-500" />
                Cetak
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic KPI Summary Metric Cards */}
      {reportKPIs && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Total Baris Data</span>
              <BarChart3 size={14} className="text-slate-400" />
            </div>
            <div className="text-xl font-bold font-heading text-navy mt-1">
              {reportKPIs.totalRows.toLocaleString("id-ID")}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Periode: {from} s/d {to}
            </div>
          </div>

          {reportKPIs.hasVolume && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Total Volume (Qty)</span>
                <Package size={14} className="text-blue-500" />
              </div>
              <div className="text-xl font-bold font-heading text-blue-700 mt-1">
                {reportKPIs.totalVolume.toLocaleString("id-ID")} <span className="text-xs font-normal text-slate-500">Unit</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Total kuantitas barang
              </div>
            </div>
          )}

          {reportKPIs.hasRevenue && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Total Nilai Penjualan</span>
                <Receipt size={14} className="text-emerald-500" />
              </div>
              <div className="text-xl font-bold font-heading text-emerald-700 mt-1">
                {rupiah(reportKPIs.totalRevenue)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Rata-rata: {rupiah(reportKPIs.avgRevenue)}
              </div>
            </div>
          )}

          {reportKPIs.hasCalls && (
            <div className="bg-navy rounded-xl p-3.5 text-white shadow-xs">
              <div className="text-[11px] font-bold text-gold uppercase tracking-wider flex items-center justify-between">
                <span>Strike Rate / EC Rate</span>
                <CheckCircle2 size={14} className="text-gold" />
              </div>
              <div className="text-xl font-bold font-heading text-white mt-1">
                {reportKPIs.ecRate}%
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                {reportKPIs.totalEffectiveCalls} EC dari {reportKPIs.totalActualCalls} Call
              </div>
            </div>
          )}
        </div>
      )}

      {/* Result Data Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs" data-testid="report-result">
        {/* Table Controls Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-navy text-sm md:text-base">
              {activeReportObj?.name || "Laporan"}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200/70 text-slate-700">
              {totalRowsCount} data
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Table Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <Input
                type="text"
                placeholder="Cari dalam tabel..."
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 h-8 text-xs bg-white border-slate-200 w-full"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Page Size Select */}
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-xs w-28 bg-white border-slate-200">
                <SelectValue placeholder="Baris/hal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 Baris</SelectItem>
                <SelectItem value="25">25 Baris</SelectItem>
                <SelectItem value="50">50 Baris</SelectItem>
                <SelectItem value="100">100 Baris</SelectItem>
                <SelectItem value="ALL">Semua Data</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="py-16 text-center text-slate-500">
            <Loader2 className="animate-spin mx-auto mb-2 text-navy" size={28} />
            <p className="text-xs font-semibold">Memuat dan menghitung data laporan...</p>
          </div>
        ) : rawRows.length === 0 ? (
          <div className="text-center py-16 text-slate-400 space-y-2" data-testid="report-empty">
            <AlertCircle className="mx-auto text-slate-300" size={32} />
            <div className="font-semibold text-slate-700 text-sm">Tidak ada data untuk periode dan filter ini</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Silakan sesuaikan filter tanggal, salesman, atau wilayah di atas dan klik tombol "Tampilkan Data".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[62vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200">
                  <TableHead className="w-12 text-[11px] font-bold uppercase tracking-wider text-slate-600 text-center">
                    #
                  </TableHead>
                  {columns.map((c) => {
                    const isSorted = sortColumn === c;
                    return (
                      <TableHead
                        key={c}
                        onClick={() => handleSort(c)}
                        className="text-[11px] font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap cursor-pointer hover:bg-slate-200/60 transition-colors select-none py-3"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{c.replace(/_/g, " ")}</span>
                          {isSorted ? (
                            sortDirection === "asc" ? (
                              <ArrowUp size={13} className="text-navy" />
                            ) : (
                              <ArrowDown size={13} className="text-navy" />
                            )
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-400 opacity-60" />
                          )}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((r, i) => {
                  const rowIndex = pageSize === "ALL" ? i + 1 : (currentPage - 1) * Number(pageSize) + i + 1;
                  return (
                    <TableRow
                      key={Object.values(r).join("|") + i}
                      data-testid={`report-row-${i}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <TableCell className="text-xs text-center text-slate-400 font-mono">
                        {rowIndex}
                      </TableCell>
                      {columns.map((c) => {
                        const isMulti =
                          c.toLowerCase().includes("rincian") ||
                          c.toLowerCase().includes("detail") ||
                          c.toLowerCase().includes("catatan") ||
                          c.toLowerCase().includes("alamat");
                        return (
                          <TableCell
                            key={c}
                            className={`text-xs py-2.5 ${
                              isMulti
                                ? "min-w-[220px] max-w-md whitespace-normal"
                                : "whitespace-nowrap"
                            }`}
                          >
                            {formatCellValue(c, r[c])}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Table Pagination Footer */}
        {totalRowsCount > 0 && pageSize !== "ALL" && (
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <div>
              Menampilkan <span className="font-bold text-slate-800">{(currentPage - 1) * Number(pageSize) + 1}</span> -{" "}
              <span className="font-bold text-slate-800">
                {Math.min(currentPage * Number(pageSize), totalRowsCount)}
              </span>{" "}
              dari <span className="font-bold text-slate-800">{totalRowsCount}</span> data
              {tableSearch && ` (hasil filter dari ${rawRows.length})`}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-7 text-xs px-2 border-slate-200"
              >
                <ChevronLeft size={13} className="mr-0.5" /> Prev
              </Button>

              <div className="px-2 text-xs font-bold text-slate-700">
                Halaman {currentPage} / {totalPages}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 text-xs px-2 border-slate-200"
              >
                Next <ChevronRight size={13} className="ml-0.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
