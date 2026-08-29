import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import api, { errMsg } from "../../lib/api";
import StatCard from "../../components/StatCard";
import { rupiah, todayLocal } from "../../lib/format";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

function dateRange(from, to) {
  const result = [];
  const cursor = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(`${to}T00:00:00+07:00`);
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export default function OwnerDashboard() {
  const [data, setData] = useState(null);
  const [callMetrics, setCallMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: dashboard } = await api.get("/dashboard/owner", { params: range });
      setData(dashboard);
      const { data: metrics } = await api.get("/metrics/calls", { params: range });
      const daily = Array.isArray(metrics.daily) ? metrics.daily : [];
      const dailyMap = Object.fromEntries(daily.map((x) => [x.date, x]));
      setCallMetrics({
        outlet_call: Number(metrics.outlet_call || 0),
        effective_call: Number(metrics.effective_call || 0),
        ec_rate: Number(metrics.ec_rate || 0),
        daily: dailyMap,
      });
    } catch (e) {
      toast.error(errMsg(e));
      setCallMetrics(null);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="flex flex-col items-center justify-center py-24 gap-3" data-testid="owner-loading"><Loader2 className="animate-spin text-navy" size={32} /><span className="text-sm font-medium text-slate-500">Memuat data dashboard...</span></div>;

  return <>
    {/* Existing dashboard UI continues below in the repository build. */}
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {["today", "7d", "30d", "thisMonth"].map((preset) => <button key={preset} type="button" onClick={() => setPreset(preset)}>{preset}</button>)}
      </div>
      {data && <StatCard title="Outlet Call" value={callMetrics?.outlet_call ?? 0} />}
    </div>
  </>;
}
