import React, { useEffect, useState, useCallback, Fragment, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ShieldCheck,
  Download,
  Search,
  Copy,
  Check,
  Calendar,
  AlertTriangle,
  Activity,
  UserCheck,
  Layers,
  FileSpreadsheet,
  ArrowRight,
  UserPlus,
  RefreshCw,
  Users,
  MapPin,
  FileText,
} from "lucide-react";
import api, { errMsg } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { exportToXLSX } from "../lib/export";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
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

const ENTITIES = [
  { value: "ALL", label: "Semua Entitas" },
  { value: "sales_outlets", label: "🎯 Penugasan & Mutasi Sales (sales_outlets)" },
  { value: "auth", label: "Autentikasi & Sesi (auth)" },
  { value: "users", label: "Pengguna & Akun (users)" },
  { value: "outlets", label: "Master Outlet (outlets)" },
  { value: "call_plans", label: "Rencana Kunjungan (call_plans)" },
  { value: "transactions", label: "Transaksi Penjualan (transactions)" },
  { value: "visits", label: "Kunjungan Sales (visits)" },
  { value: "attendance", label: "Presensi / Absensi (attendance)" },
  { value: "inventory", label: "Stok & Gudang (inventory)" },
  { value: "stock_movements", label: "Mutasi Stok (stock_movements)" },
  { value: "stock_handovers", label: "Serah Terima Pagi (stock_handovers)" },
  { value: "stock_returns", label: "Retur Sore (stock_returns)" },
  { value: "stock_receivings", label: "Penerimaan PO (stock_receivings)" },
  { value: "targets", label: "Target Volume Sales (targets)" },
  { value: "offices", label: "Master Kantor / Cabang (offices)" },
  { value: "master_wilayah", label: "Master Wilayah (master_wilayah)" },
  { value: "company_profile", label: "Profil Perusahaan (company)" },
  { value: "system_settings", label: "Pengaturan Sistem (system_settings)" },
];

function ActionBadge({ action }) {
  const act = String(action || "").toUpperCase();
  let color = "bg-slate-100 text-slate-700 border-slate-200";
  let icon = null;

  if (act === "REASSIGN_OUTLET" || act.includes("REASSIGN")) {
    color = "bg-purple-50 text-purple-800 border-purple-200";
    icon = <RefreshCw size={11} className="mr-1 text-purple-600 inline" />;
  } else if (act === "AUTO_ASSIGN_NOO" || act === "ASSIGN_OUTLET_TO_SALES" || act.includes("ASSIGN")) {
    color = "bg-indigo-50 text-indigo-800 border-indigo-200";
    icon = <UserPlus size={11} className="mr-1 text-indigo-600 inline" />;
  } else if (act === "BULK_ASSIGN_OUTLETS") {
    color = "bg-blue-50 text-blue-800 border-blue-200";
    icon = <Users size={11} className="mr-1 text-blue-600 inline" />;
  } else if (act === "UNASSIGN_OUTLET") {
    color = "bg-amber-50 text-amber-800 border-amber-200";
  } else if (act.includes("CREATE") || act.includes("CHECK_IN") || act.includes("INSERT") || act.includes("CONFIRM") || act.includes("POST")) {
    color = "bg-emerald-50 text-emerald-800 border-emerald-200";
  } else if (act.includes("UPDATE") || act.includes("SYNC") || act.includes("EDIT")) {
    color = "bg-cyan-50 text-cyan-800 border-cyan-200";
  } else if (act.includes("DELETE") || act.includes("CANCEL") || act.includes("FAIL") || act.includes("REJECT") || act.includes("ARCHIVE")) {
    color = "bg-rose-50 text-rose-800 border-rose-200";
  } else if (act.includes("CHECK_OUT") || act.includes("LOGIN") || act.includes("LOGOUT")) {
    color = "bg-amber-50 text-amber-800 border-amber-200";
  } else if (act.includes("ADJUST") || act.includes("STATUS")) {
    color = "bg-purple-50 text-purple-800 border-purple-200";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${color}`}>
      {icon}
      {action}
    </span>
  );
}

export default function AuditPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    total_logs: 0,
    total_today: 0,
    critical_actions: 0,
    total_logins: 0,
  });
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("ALL");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const resetFilters = () => {
    setEntity("ALL");
    setAction("");
    setSearch("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const setQuickDate = (type) => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    if (type === "today") {
      setFrom(todayStr);
      setTo(todayStr);
    } else if (type === "7days") {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      setFrom(past.toISOString().slice(0, 10));
      setTo(todayStr);
    } else if (type === "month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setFrom(firstDay.toISOString().slice(0, 10));
      setTo(todayStr);
    } else {
      setFrom("");
      setTo("");
    }
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/audit", {
        params: {
          entity: entity !== "ALL" ? entity : undefined,
          action: action || undefined,
          search: search || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          limit: 50,
        },
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(data?.total || 0);
      if (data?.stats) {
        setStats(data.stats);
      }
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
  }, [entity, action, search, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  const copyToClipboard = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(typeof text === "object" ? JSON.stringify(text, null, 2) : String(text));
    setCopiedId(id);
    toast.success("Disalin ke clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExport = () => {
    if (!items || items.length === 0) {
      toast.error("Tidak ada data audit untuk diexport.");
      return;
    }

    const exportRows = items.map((l, index) => ({
      No: index + 1,
      "Waktu (Server)": fmtDateTime(l.timestamp || l.created_at),
      Pengguna: l.user_name || "System",
      Role: l.role || "-",
      Aksi: l.action,
      Entitas: l.entity,
      "ID Target": l.entity_id || "-",
      "IP Address": l.ip || l.ip_address || "-",
      "Detail Payload": typeof l.details === "object" ? JSON.stringify(l.details) : String(l.details || "-"),
    }));

    exportToXLSX("Audit-Trail-Mahameru", "Audit Trail", exportRows);
    toast.success(`Berhasil mengunduh ${exportRows.length} entri audit log.`);
  };

  const hasFilters = Boolean((entity && entity !== "ALL") || action || search || from || to);
  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <div className="space-y-4" data-testid="audit-page">
      {/* Header & Title */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-navy/10 text-navy rounded-lg">
              <ShieldCheck className="text-navy" size={24} />
            </div>
            <div>
              <h2 className="font-heading text-xl font-extrabold text-navy tracking-tight">Audit Trail &amp; Keamanan Sistem</h2>
              <p className="text-xs text-slate-500">Pencatatan rekam jejak aktivitas pengguna, otorisasi, mutasi master data, transaksi &amp; inventaris fisik</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleExport()}
            data-testid="audit-export-btn"
            className="text-xs h-9 font-semibold text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 flex items-center gap-1.5"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </Button>
          <span className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-2 rounded-lg border border-slate-200">
            Total Log: {total.toLocaleString("id-ID")}
          </span>
        </div>
      </div>

      {/* KPI / Live Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Riwayat</span>
            <Layers size={16} className="text-blue-600" />
          </div>
          <div className="text-xl font-extrabold text-navy mt-1">
            {(stats.total_logs || total).toLocaleString("id-ID")}
          </div>
          <span className="text-[10px] text-slate-400">Seluruh entitas tercatat</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Aktivitas Hari Ini</span>
            <Activity size={16} className="text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">
            {stats.total_today.toLocaleString("id-ID")}
          </div>
          <span className="text-[10px] text-emerald-600/80 font-medium">Operasi log 24 jam</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sesi &amp; Login</span>
            <UserCheck size={16} className="text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-navy mt-1">
            {stats.total_logins.toLocaleString("id-ID")}
          </div>
          <span className="text-[10px] text-slate-400">Otentikasi &amp; akses masuk</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Aksi Kritis</span>
            <AlertTriangle size={16} className="text-rose-600" />
          </div>
          <div className="text-xl font-extrabold text-rose-700 mt-1">
            {stats.critical_actions.toLocaleString("id-ID")}
          </div>
          <span className="text-[10px] text-rose-500 font-medium">Batal/Void/Hapus/Adjust</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Global Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <Input
              data-testid="audit-search"
              placeholder="Cari user, aksi, ID entitas, IP, atau payload..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 text-xs h-9"
            />
          </div>

          {/* Entity Filter */}
          <div className="w-56">
            <Select
              value={entity}
              onValueChange={(v) => {
                setEntity(v);
                setPage(1);
              }}
            >
              <SelectTrigger data-testid="audit-entity-filter" className="text-xs h-9">
                <SelectValue placeholder="Pilih Entitas" />
              </SelectTrigger>
              <SelectContent>
                {ENTITIES.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Filter */}
          <Input
            data-testid="audit-action-filter"
            placeholder="Aksi (mis. LOGIN, CREATE, CANCEL)"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="w-48 text-xs h-9"
          />
        </div>

        {/* Date Range & Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <Calendar size={14} className="text-slate-400 ml-1.5" />
              <Input
                data-testid="audit-from"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="w-32 text-xs h-7 border-0 bg-transparent shadow-none"
              />
              <span className="text-xs text-slate-400 font-medium">s/d</span>
              <Input
                data-testid="audit-to"
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="w-32 text-xs h-7 border-0 bg-transparent shadow-none"
              />
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuickDate("today")}
                className="text-[11px] h-7 px-2 text-slate-600 hover:bg-slate-100"
              >
                Hari Ini
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuickDate("7days")}
                className="text-[11px] h-7 px-2 text-slate-600 hover:bg-slate-100"
              >
                7 Hari
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuickDate("month")}
                className="text-[11px] h-7 px-2 text-slate-600 hover:bg-slate-100"
              >
                Bulan Ini
              </Button>
            </div>
          </div>

          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => resetFilters()}
              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8"
            >
              <RotateCcw size={13} className="mr-1" /> Reset Filter
            </Button>
          )}
        </div>
      </div>

      {/* Main Audit Log Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2.5">
            <Loader2 className="animate-spin text-navy" size={32} />
            <span className="text-xs text-slate-500 font-medium">Memuat riwayat audit trail...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-sm text-slate-400 space-y-2" data-testid="audit-empty">
            <ShieldCheck className="mx-auto text-slate-300" size={36} />
            <div className="font-semibold text-slate-600">Tidak ada catatan audit yang sesuai kriteria filter</div>
            <p className="text-xs text-slate-400">Silakan ubah kata kunci atau rentang tanggal pencarian Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/90 border-b border-slate-200">
                  <TableHead className="text-xs font-bold text-slate-700 w-44">Waktu (Server)</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Pengguna &amp; Peran</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Aksi Operasi</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Target Entitas</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">IP Origin</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Detail Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a, i) => (
                  <Fragment key={a._id || `audit-${i}`}>
                    <TableRow data-testid={`audit-row-${i}`} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="text-xs font-mono text-slate-600 whitespace-nowrap">
                        {fmtDateTime(a.timestamp || a.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-bold text-navy">{a.user_name || "System"}</div>
                        <div className="text-[10px] text-slate-500 font-semibold">{a.role || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={a.action} />
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {a.entity}
                        </span>
                        {a.entity_id && (
                          <div className="flex items-center gap-1 mt-1 text-slate-500 text-[11px]">
                            <span>ID: {String(a.entity_id).slice(0, 16)}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(a.entity_id, `ent-${a._id}`)}
                              className="text-slate-400 hover:text-navy"
                              title="Salin ID"
                            >
                              {copiedId === `ent-${a._id}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            </button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {a.ip || a.ip_address || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-slate-500 hover:text-navy hover:bg-slate-100"
                          data-testid={`audit-expand-${i}`}
                          onClick={() => setExpanded(expanded === a._id ? null : a._id)}
                          title="Lihat rincian payload data"
                        >
                          {expanded === a._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expandable Data Payload Inspector */}
                    {expanded === a._id && (
                      <TableRow key={`${a._id}-payload`}>
                        <TableCell colSpan={6} className="bg-slate-50 p-4 border-t border-b border-slate-200">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-bold text-navy flex items-center gap-2">
                                <Activity size={14} className="text-blue-600" />
                                <span>Payload &amp; Snapshot Perubahan Data:</span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(a.details || a.metadata, `raw-${a._id}`)}
                                className="text-[11px] h-7 px-2 text-slate-600"
                              >
                                {copiedId === `raw-${a._id}` ? (
                                  <>
                                    <Check size={12} className="mr-1 text-emerald-600" /> Tersalin
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} className="mr-1" /> Salin JSON
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Assignment specific summary banner */}
                            {(a.entity === "sales_outlets" || String(a.action).includes("ASSIGN")) && (
                              <div className="bg-navy/5 border border-navy/20 rounded-xl p-3.5 space-y-2">
                                <div className="flex items-center gap-2 font-bold text-navy text-xs">
                                  <ShieldCheck size={16} className="text-navy" />
                                  <span>Ringkasan Mutasi / Penugasan Otomatis</span>
                                  <span className="text-[10px] bg-navy/10 text-navy px-2 py-0.5 rounded font-mono font-normal ml-auto">
                                    Entity: {a.entity} ({a.action})
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200 text-xs">
                                  <div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Outlet Target</div>
                                    <div className="font-bold text-navy mt-0.5">
                                      {a.details?.outlet_name || a.details?.outlet_code || a.entity_id || "-"}
                                    </div>
                                    {a.details?.outlet_code && (
                                      <div className="text-[10px] font-mono text-slate-500">{a.details.outlet_code}</div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Sales Rep Ditugaskan</div>
                                    <div className="font-bold text-emerald-700 mt-0.5 flex items-center gap-1">
                                      <UserCheck size={13} />
                                      {a.details?.new_sales_name || a.details?.sales_name || a.details?.sales_id || "-"}
                                    </div>
                                    {a.details?.previous_sales_name && a.details?.previous_sales_name !== "-" && (
                                      <div className="text-[10px] text-slate-400">
                                        Sebelumnya: <span className="line-through text-rose-600 font-medium">{a.details.previous_sales_name}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Eksekutor / PIC</div>
                                    <div className="font-bold text-slate-700 mt-0.5">
                                      {a.user_name || "System"}
                                    </div>
                                    <div className="text-[10px] text-slate-500">Peran: {a.details?.user_role || a.role || "-"}</div>
                                  </div>

                                  <div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Keterangan / Alasan</div>
                                    <div className="font-medium text-slate-700 mt-0.5 text-[11px] italic">
                                      "{a.details?.reason || a.details?.notes || a.details?.action_type || "Penugasan sistem"}"
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-mono">
                              {a.before ? (
                                <div className="bg-white p-3 rounded-lg border border-red-200 shadow-2xs">
                                  <div className="font-bold text-rose-700 font-sans mb-1.5 text-xs flex items-center justify-between">
                                    <span>SEBELUM PERUBAHAN</span>
                                    <span className="text-[10px] bg-rose-50 px-1.5 py-0.5 rounded text-rose-600">Old State</span>
                                  </div>
                                  <pre className="whitespace-pre-wrap break-all text-slate-700 max-h-56 overflow-y-auto bg-slate-50/60 p-2 rounded border border-slate-100">
                                    {JSON.stringify(a.before, null, 2)}
                                  </pre>
                                </div>
                              ) : null}

                              {a.after ? (
                                <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-2xs">
                                  <div className="font-bold text-emerald-700 font-sans mb-1.5 text-xs flex items-center justify-between">
                                    <span>SESUDAH PERUBAHAN</span>
                                    <span className="text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded text-emerald-600">New State</span>
                                  </div>
                                  <pre className="whitespace-pre-wrap break-all text-slate-700 max-h-56 overflow-y-auto bg-slate-50/60 p-2 rounded border border-slate-100">
                                    {JSON.stringify(a.after, null, 2)}
                                  </pre>
                                </div>
                              ) : null}

                              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs md:col-span-1">
                                <div className="font-bold text-slate-700 font-sans mb-1.5 text-xs flex items-center justify-between">
                                  <span>METADATA &amp; PARAMETER</span>
                                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">Context</span>
                                </div>
                                <pre className="whitespace-pre-wrap break-all text-slate-700 max-h-56 overflow-y-auto bg-slate-50/60 p-2 rounded border border-slate-100">
                                  {JSON.stringify(a.metadata || a.details || {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
        <span>
          Menampilkan baris <b>{(page - 1) * 50 + 1} - {Math.min(page * 50, total)}</b> dari total <b>{total.toLocaleString("id-ID")}</b> entri log (Halaman {page} dari {totalPages})
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            data-testid="audit-prev"
            className="text-xs h-8"
          >
            Sebelumnya
          </Button>
          <div className="px-2 font-bold text-navy">{page} / {totalPages}</div>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="audit-next"
            className="text-xs h-8"
          >
            Berikutnya
          </Button>
        </div>
      </div>
    </div>
  );
}
