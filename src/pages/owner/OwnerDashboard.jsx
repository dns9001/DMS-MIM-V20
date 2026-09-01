import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Filter } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import api, { errMsg } from "../../lib/api";
import StatCard from "../../components/StatCard";
import { rupiah, todayLocal, fmtDate } from "../../lib/format";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Button } from "../../components/ui/button";

export default function OwnerDashboard() {
  const [data, setData] = useState(null);
  const [callMetrics, setCallMetrics] = useState(null);
  const [callMetricsError, setCallMetricsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [selectedArea, setSelectedArea] = useState("ALL");
  const [selectedSalesman, setSelectedSalesman] = useState("ALL");

  const [range, setRange] = useState(() => {
    const f = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const to = new Date();
    const from = new Date(Date.now() - 13 * 86400000);
    return { from: f(from), to: f(to) };
  });

  const setPreset = (preset) => {
    const f = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const now = new Date();
    if (preset === "today") { const t = todayLocal(); setRange({ from: t, to: t }); }
    else if (preset === "7d") setRange({ from: f(new Date(Date.now() - 6 * 86400000)), to: f(now) });
    else if (preset === "30d") setRange({ from: f(new Date(Date.now() - 29 * 86400000)), to: f(now) });
    else if (preset === "thisMonth") { const cur = todayLocal(); setRange({ from: `${cur.slice(0, 7)}-01`, to: cur }); }
  };

  useEffect(() => {
    async function loadMasterFilters() {
      try {
        const [areasRes, usersRes] = await Promise.allSettled([
          api.get("/areas"),
          api.get("/users"),
        ]);
        if (areasRes.status === "fulfilled") {
          setAreas(Array.isArray(areasRes.value.data) ? areasRes.value.data : []);
        }
        if (usersRes.status === "fulfilled") {
          const uList = Array.isArray(usersRes.value.data) ? usersRes.value.data : [];
          setSalesmen(uList.filter((u) => u.role === "SALES"));
        }
      } catch (err) {
        console.warn("Failed to load filter options", err);
      }
    }
    loadMasterFilters();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setCallMetricsError(false);
    try {
      const params = {
        ...range,
        ...(selectedArea !== "ALL" ? { areaId: selectedArea } : {}),
        ...(selectedSalesman !== "ALL" ? { salesmanId: selectedSalesman, salesman_id: selectedSalesman } : {}),
      };

      const [dashResult, metricsResult] = await Promise.allSettled([
        api.get("/dashboard/owner", { params }),
        api.get("/metrics/calls", { params }),
      ]);

      if (dashResult.status === "fulfilled") {
        setData(dashResult.value.data);
      } else {
        toast.error(errMsg(dashResult.reason));
      }

      if (metricsResult.status === "fulfilled") {
        const metrics = metricsResult.value.data || {};
        const daily = Array.isArray(metrics.daily) ? metrics.daily : [];
        const dailyMap = Object.fromEntries(daily.map((x) => [x.date, x]));
        setCallMetrics({
          outlet_call: Number(metrics.outlet_call || 0),
          effective_call: Number(metrics.effective_call || 0),
          ec_rate: Number(metrics.ec_rate || 0),
          daily: dailyMap,
        });
      } else {
        setCallMetrics(null);
        setCallMetricsError(true);
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [range, selectedArea, selectedSalesman]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="flex flex-col items-center justify-center py-24 gap-3" data-testid="owner-loading"><Loader2 className="animate-spin text-navy" size={32} /><span className="text-sm font-medium text-slate-500">Memuat data dashboard...</span></div>;

  const t = data?.totals || {};
  const canonicalOutletCall = callMetrics?.outlet_call ?? t.outlet_calls ?? (callMetricsError ? 0 : null);
  const canonicalEffectiveCall = callMetrics?.effective_call ?? t.effective_calls ?? (callMetricsError ? 0 : null);
  const canonicalEcRate = callMetrics?.ec_rate ?? t.ec_rate ?? (callMetricsError ? 0 : null);
  const canonicalTrend = (data?.trend || []).map((row) => ({
    ...row,
    outlet_calls: callMetrics?.daily?.[row.date]?.outlet_call ?? row.outlet_calls ?? 0,
    effective_calls: callMetrics?.daily?.[row.date]?.effective_call ?? row.effective_calls ?? 0,
  }));

  return (
    <div className="space-y-6" data-testid="owner-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-heading text-xl font-extrabold text-navy tracking-tight">DMS Mahameru Dashboard</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Google Cloud SQL (PostgreSQL) Active
            </span>
          </div>
          <p className="text-xs text-slate-500">Distribution Management System — Data live real-time dari Database Utama PostgreSQL (Single Source of Truth)</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger className="w-36 text-xs h-9">
                <SelectValue placeholder="Semua Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Area</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a._id || a.id} value={a._id || a.id}>
                    {a.area_name || a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSalesman} onValueChange={setSelectedSalesman}>
              <SelectTrigger className="w-36 text-xs h-9">
                <SelectValue placeholder="Semua Sales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Sales</SelectItem>
                {salesmen.map((s) => (
                  <SelectItem key={s._id || s.id} value={s._id || s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button type="button" onClick={() => setPreset("today")} className="px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-white hover:shadow-xs transition-all">Hari Ini</button>
            <button type="button" onClick={() => setPreset("7d")} className="px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-white hover:shadow-xs transition-all">7 Hari</button>
            <button type="button" onClick={() => setPreset("30d")} className="px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-white hover:shadow-xs transition-all">30 Hari</button>
            <button type="button" onClick={() => setPreset("thisMonth")} className="px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-white hover:shadow-xs transition-all">Bulan Ini</button>
          </div>

          <div className="flex items-center gap-1.5">
            <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="w-36 text-xs h-9" />
            <span className="text-xs text-slate-400 font-semibold">s/d</span>
            <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="w-36 text-xs h-9" />
          </div>

          <Button variant="outline" size="icon" onClick={() => load()} className="h-9 w-9" title="Segarkan Data">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {callMetricsError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800" role="alert">
          Data Outlet Call / Effective Call tidak tersedia dari server canonical. KPI Call dikosongkan untuk mencegah penggunaan data legacy.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3" data-testid="owner-kpis">
        <StatCard label="Nilai Penjualan (Revenue)" value={rupiah(t.sales_value ?? t.total_sales ?? 0)} testid="kpi-total-sales" />
        <StatCard label="Target Volume (Qty)" value={`${(t.target_volume ?? 0).toLocaleString("id-ID")} Qty`} sub="Target kuantitas produk" testid="kpi-target-volume" />
        <StatCard label="Actual Volume (Qty)" value={`${(t.total_volume ?? t.volume ?? 0).toLocaleString("id-ID")} Qty`} sub={`Ach: ${t.achievement_formatted || `${t.achievement_percentage ?? 0}%`}`} testid="kpi-total-volume" />
        <StatCard label="Volume Achievement" value={t.achievement_formatted || `${t.achievement_percentage ?? 0}%`} sub={t.achievement_status || "Target Berdasarkan Volume"} testid="kpi-volume-achievement" />
        <StatCard label="Transaksi" value={t.transactions ?? t.transaction_count ?? 0} testid="kpi-total-txn" />
        <StatCard label="Planned Call" value={t.planned ?? 0} testid="kpi-planned" />
        <StatCard label="Outlet Call" value={canonicalOutletCall ?? "—"} testid="kpi-outlet-call" />
        <StatCard label="Effective Call" value={canonicalEffectiveCall ?? "—"} testid="kpi-effective" />
        <StatCard label="EC Rate" value={canonicalEcRate == null ? "—" : `${canonicalEcRate}%`} testid="kpi-ec-rate" />
        <StatCard label="Missed Call" value={t.missed ?? 0} testid="kpi-missed" />
        <StatCard label="Coverage Outlet" value={`${t.coverage ?? 0}%`} testid="kpi-coverage" />
        <StatCard label="NOO (Outlet Baru)" value={t.noo_count ?? 0} testid="kpi-noo" />
        <StatCard label="Repeat Order" value={t.repeat_count ?? 0} testid="kpi-repeat" />
        <StatCard label="Active Outlet" value={t.active_count ?? 0} testid="kpi-active" />
        <StatCard label="Dormant Outlet" value={t.dormant_count ?? 0} testid="kpi-dormant" />
        <StatCard label="Total Stock" value={(t.stock_on_hand ?? 0).toLocaleString("id-ID")} testid="kpi-total-stock" />
        <StatCard label="Stock Warehouse" value={(t.warehouse_stock ?? 0).toLocaleString("id-ID")} testid="kpi-warehouse-stock" />
        <StatCard label="Stock Salesman" value={(t.salesman_stock ?? 0).toLocaleString("id-ID")} testid="kpi-salesman-stock" />
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-navy text-sm">Tren Penjualan (Revenue)</h3>
            <span className="text-[11px] font-semibold text-slate-500">Omset Harian</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trend || []}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C5A059" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#C5A059" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1).replace(/\.0$/, "")}jt` : `${Math.round(v / 1000)}rb`} />
                <Tooltip formatter={(v) => rupiah(v)} labelFormatter={(d) => fmtDate(d)} />
                <Area type="monotone" dataKey="sales_value" name="Penjualan" stroke="#0A2540" fill="url(#colorSales)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-navy text-sm">Tren Kunjungan (Outlet Call vs Effective Call)</h3>
            <span className="text-[11px] font-semibold text-slate-500">Aktivitas Kunjungan</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={canonicalTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} allowDecimals={false} />
                <Tooltip labelFormatter={(d) => fmtDate(d)} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: '4px' }} />
                <Bar dataKey="outlet_calls" name="Outlet Call" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="effective_calls" name="Effective Call" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Performance Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-heading font-bold text-navy text-sm mb-3">Performa Area &amp; Volume Target</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Ach %</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.area_performance || []).map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{a.area || "-"}</TableCell>
                    <TableCell>{a.target_volume != null ? `${a.target_volume.toLocaleString("id-ID")} Qty` : "-"}</TableCell>
                    <TableCell>{(a.volume ?? 0).toLocaleString("id-ID")} Qty</TableCell>
                    <TableCell>{a.achievement_formatted || (a.target_volume != null ? `${a.achievement_percentage}%` : "-")}</TableCell>
                    <TableCell>{rupiah(a.sales_value ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-heading font-bold text-navy text-sm mb-3">Target vs Actual Volume Produk</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Ach %</TableHead>
                  <TableHead>Nilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.product_coverage || []).map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.sku || "-"}</TableCell>
                    <TableCell>{s.target_volume != null ? `${s.target_volume.toLocaleString("id-ID")} Qty` : "-"}</TableCell>
                    <TableCell>{(s.qty ?? 0).toLocaleString("id-ID")} Qty</TableCell>
                    <TableCell>{s.achievement_formatted || (s.target_volume != null ? `${s.achievement_percentage}%` : "-")}</TableCell>
                    <TableCell>{rupiah(s.value ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-heading font-bold text-navy text-sm mb-3">Performa Salesman &amp; Volume Target</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Ach %</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.salesman_performance || []).map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.name || "-"}</TableCell>
                    <TableCell>{s.target_volume != null ? `${s.target_volume.toLocaleString("id-ID")} Qty` : "-"}</TableCell>
                    <TableCell>{(s.volume ?? 0).toLocaleString("id-ID")} Qty</TableCell>
                    <TableCell>{s.achievement_formatted || (s.target_volume != null ? `${s.achievement_percentage}%` : "-")}</TableCell>
                    <TableCell>{rupiah(s.value ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Top 20 Outlets */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <h3 className="font-heading font-bold text-navy text-sm mb-3">Top 20 Outlets by Revenue</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Outlet Name</TableHead>
                <TableHead>Volume Penjualan</TableHead>
                <TableHead>Total Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.top_outlets || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-slate-400">
                    Belum ada data transaksi outlet pada periode yang dipilih.
                  </TableCell>
                </TableRow>
              ) : (
                (data?.top_outlets || []).map((o, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-bold text-slate-500 w-16">#{i + 1}</TableCell>
                    <TableCell className="font-medium text-navy">{o.name || "-"}</TableCell>
                    <TableCell>{(o.volume ?? 0).toLocaleString("id-ID")} Qty</TableCell>
                    <TableCell className="font-semibold text-slate-800">{rupiah(o.value ?? 0)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

    </div>
  );
}
