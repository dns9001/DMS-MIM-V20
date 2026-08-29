import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Calendar, TrendingUp, Layers, Users, Store } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import api, { errMsg } from "../../lib/api";
import StatCard from "../../components/StatCard";
import { rupiah, todayLocal } from "../../lib/format";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";

export default function OwnerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(() => {
    const f = (d) => {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(d);
    };
    const to = new Date();
    const from = new Date(Date.now() - 13 * 86400000);
    return { from: f(from), to: f(to) };
  });

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
      setRange({ from: t, to: t });
    } else if (preset === "7d") {
      const from = new Date(Date.now() - 6 * 86400000);
      setRange({ from: f(from), to: f(now) });
    } else if (preset === "30d") {
      const from = new Date(Date.now() - 29 * 86400000);
      setRange({ from: f(from), to: f(now) });
    } else if (preset === "thisMonth") {
      const cur = todayLocal();
      setRange({ from: `${cur.slice(0, 7)}-01`, to: cur });
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/dashboard/owner", { params: range });
      setData(data);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3" data-testid="owner-loading">
        <Loader2 className="animate-spin text-navy" size={32} />
        <span className="text-sm font-medium text-slate-500">Memuat data dashboard...</span>
      </div>
    );
  }

  const t = data?.totals || {};

  return (
    <div className="space-y-6" data-testid="owner-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="font-heading text-xl font-extrabold text-navy tracking-tight">DMS Mahameru Dashboard</h2>
          <p className="text-xs text-slate-500">Distribution Management System — Monitoring Distribusi & Kinerja Penjualan</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setPreset("today")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                range.from === range.to && range.to === todayLocal()
                  ? "bg-white text-navy shadow-xs"
                  : "text-slate-600 hover:text-navy"
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setPreset("7d")}
              className="px-2.5 py-1 text-xs font-semibold rounded-md text-slate-600 hover:text-navy transition-all"
            >
              7 Hari
            </button>
            <button
              onClick={() => setPreset("thisMonth")}
              className="px-2.5 py-1 text-xs font-semibold rounded-md text-slate-600 hover:text-navy transition-all"
            >
              Bulan Ini
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <Input data-testid="owner-from" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="w-36 text-xs h-9" />
            <span className="text-xs text-slate-400 font-semibold">s/d</span>
            <Input data-testid="owner-to" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="w-36 text-xs h-9" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3" data-testid="owner-kpis">
        <StatCard label="Nilai Penjualan (Revenue)" value={rupiah(t.sales_value ?? t.total_sales ?? 0)} accent testid="kpi-total-sales" />
        <StatCard
          label="Target Volume (Qty)"
          value={`${(t.target_volume ?? 0).toLocaleString("id-ID")} Qty`}
          sub="Target kuantitas produk"
          testid="kpi-target-volume"
        />
        <StatCard
          label="Actual Volume (Qty)"
          value={`${(t.total_volume ?? t.volume ?? 0).toLocaleString("id-ID")} Qty`}
          sub={`Ach: ${t.achievement_formatted || `${t.achievement_percentage ?? 0}%`}`}
          testid="kpi-total-volume"
        />
        <StatCard
          label="Volume Achievement"
          value={t.achievement_formatted || `${t.achievement_percentage ?? 0}%`}
          sub={t.achievement_status || "Target Berdasarkan Volume"}
          testid="kpi-volume-achievement"
        />
        <StatCard label="Transaksi" value={t.transactions ?? t.transaction_count ?? 0} testid="kpi-total-txn" />
        <StatCard label="Planned Call" value={t.planned ?? 0} testid="kpi-planned" />
        <StatCard label="Outlet Call" value={t.outlet_calls ?? t.actual ?? 0} testid="kpi-outlet-call" />
        <StatCard label="Effective Call" value={t.effective_calls ?? t.effective ?? 0} testid="kpi-effective" />
        <StatCard label="EC Rate" value={`${t.ec_rate ?? t.effective_ratio ?? 0}%`} testid="kpi-ec-rate" />
        <StatCard label="Missed Call" value={t.missed ?? 0} testid="kpi-missed" />
        <StatCard label="Coverage Outlet" value={`${t.coverage ?? 0}%`} testid="kpi-coverage" />
        <StatCard label="Outlet Baru" value={t.new_outlets ?? 0} testid="kpi-new-outlets" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-navy text-sm">Tren Penjualan (Revenue)</h3>
            <span className="text-[11px] font-semibold text-slate-500">Omset Harian</span>
          </div>
          <div className="h-64" data-testid="chart-sales-trend">
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
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                <Tooltip formatter={(v) => rupiah(v)} contentStyle={{ backgroundColor: '#0A2540', color: '#fff', borderRadius: '8px', fontSize: '12px' }} />
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
          <div className="h-64" data-testid="chart-call-trend">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0A2540', color: '#fff', borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: '4px' }} />
                <Bar dataKey="outlet_calls" name="Outlet Call" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="effective_calls" name="Effective Call" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-navy text-sm">Performa Area &amp; Volume Target</h3>
            <span className="text-[11px] text-slate-500 font-semibold">{data?.area_performance?.length || 0} Area</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs font-bold text-slate-700">Area</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Target</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Actual</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Ach %</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.area_performance || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-slate-400 text-xs">
                      Belum ada data performa area
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.area_performance || []).map((a, i) => (
                    <TableRow key={`area-${a.area || a.area_id || i}`} data-testid={`area-row-${i}`} className="hover:bg-slate-50/60">
                      <TableCell className="font-bold text-navy text-xs">{a.area || "-"}</TableCell>
                      <TableCell className="text-right text-slate-600 text-xs">{a.target_volume ? `${a.target_volume} Qty` : "-"}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700 text-xs">{a.volume ?? 0} Qty</TableCell>
                      <TableCell className="text-right text-xs">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${
                          (a.achievement_percentage || 0) >= 100
                            ? "bg-emerald-100 text-emerald-800"
                            : (a.achievement_percentage || 0) >= 80
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {a.achievement_formatted || (a.target_volume ? `${a.achievement_percentage}%` : "-")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold text-navy text-xs">{rupiah(a.sales_value ?? 0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-navy text-sm">Target vs Actual Volume Produk</h3>
            <span className="text-[11px] text-slate-500 font-semibold">{data?.product_coverage?.length || 0} SKU</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs font-bold text-slate-700">SKU</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Target</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Actual</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Ach %</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Nilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.product_coverage || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-slate-400 text-xs">
                      Belum ada data target produk SKU
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.product_coverage || []).map((s, i) => (
                    <TableRow key={`sku-${s.sku || s.sku_id || i}`} data-testid={`sku-row-${i}`} className="hover:bg-slate-50/60">
                      <TableCell className="font-bold text-navy text-xs">{s.sku || "-"}</TableCell>
                      <TableCell className="text-right text-slate-600 text-xs">{s.target_volume ? `${s.target_volume} Qty` : "-"}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-700 text-xs">{s.qty ?? 0} Qty</TableCell>
                      <TableCell className="text-right text-xs">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${
                          (s.achievement_percentage || 0) >= 100
                            ? "bg-emerald-100 text-emerald-800"
                            : (s.achievement_percentage || 0) >= 80
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {s.achievement_formatted || (s.target_volume ? `${s.achievement_percentage}%` : "-")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold text-navy text-xs">{rupiah(s.value ?? 0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-navy text-sm">Performa Salesman &amp; Volume Target</h3>
            <span className="text-[11px] text-slate-500 font-semibold">{data?.salesman_performance?.length || 0} Sales</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs font-bold text-slate-700">Sales</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Target</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Actual</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Ach %</TableHead>
                  <TableHead className="text-xs text-right font-bold text-slate-700">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.salesman_performance || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-slate-400 text-xs">
                      Belum ada data performa salesman
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.salesman_performance || []).map((s, i) => (
                    <TableRow key={`sales-${s.name || s.salesman_id || i}`} data-testid={`salesman-row-${i}`} className="hover:bg-slate-50/60">
                      <TableCell className="font-bold text-navy text-xs">{s.name || "-"}</TableCell>
                      <TableCell className="text-right text-slate-600 text-xs">{s.target_volume ? `${s.target_volume} Qty` : "-"}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700 text-xs">{s.volume ?? 0} Qty</TableCell>
                      <TableCell className="text-right text-xs">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${
                          (s.achievement_percentage || 0) >= 100
                            ? "bg-emerald-100 text-emerald-800"
                            : (s.achievement_percentage || 0) >= 80
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {s.achievement_formatted || (s.target_volume ? `${s.achievement_percentage}%` : "-")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold text-navy text-xs">{rupiah(s.value ?? 0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
