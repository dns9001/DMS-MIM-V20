import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Pencil,
  Search,
  Route,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingUp,
  MapPin,
  Eye,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Phone,
  RefreshCw,
  Copy,
  SlidersHorizontal,
  Store,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import StatusBadge from "../../components/StatusBadge";
import { todayLocal, fmtDate, fmtDateShort, rupiah } from "../../lib/format";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";

export default function CallPlanManagePage() {
  const [date, setDate] = useState(todayLocal());
  const [salesmen, setSalesmen] = useState([]);
  const [salesmanId, setSalesmanId] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dialog states
  const [formOpen, setFormOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [detailPlanId, setDetailPlanId] = useState(null);
  const [autoGenOpen, setAutoGenOpen] = useState(false);

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api.get("/call-plans", {
          params: {
            date: date || undefined,
            salesman_id: salesmanId || undefined,
            status: statusFilter === "ALL" ? undefined : statusFilter,
          },
        }),
        api.get("/masters/salesmen", { params: { status: "ACTIVE", limit: 100 } }),
      ]);
      setPlans(Array.isArray(p.data?.items) ? p.data.items : []);
      setSalesmen(Array.isArray(s.data?.items) ? s.data.items : []);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
    setRefreshing(false);
  }, [date, salesmanId, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load(false);
  };

  const remove = async (id, planCode) => {
    if (!window.confirm(`Hapus call plan ${planCode || id}?`)) return;
    try {
      await api.delete(`/call-plans/${id}`);
      toast.success("Call plan berhasil dihapus.");
      load(false);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const duplicatePlan = async (plan) => {
    try {
      const { data: detail } = await api.get(`/call-plans/${plan._id}`);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextDate = tomorrow.toISOString().slice(0, 10);

      setEditPlan({
        ...detail,
        _id: null,
        plan_code: null,
        date: nextDate,
        salesman_id: plan.salesman_id,
        items: detail.items || [],
      });
      setFormOpen(true);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  // KPIs
  const totalPlans = plans.length;
  const totalOutlets = plans.reduce((sum, p) => sum + (p.item_count || p.total_outlets || 0), 0);
  const totalVisited = plans.reduce((sum, p) => sum + (p.visited_count || p.completed_count || 0), 0);
  const totalEffective = plans.reduce((sum, p) => sum + (p.effective_count || 0), 0);
  const totalSalesRevenue = plans.reduce((sum, p) => sum + (p.total_sales || 0), 0);
  const overallProgress = totalOutlets > 0 ? Math.round((totalVisited / totalOutlets) * 100) : 0;

  return (
    <div className="space-y-4" data-testid="callplan-manage-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="font-heading text-xl font-bold text-navy flex items-center gap-2">
            <Route className="text-gold" size={22} />
            Kelola Call Plan & Rute Kunjungan
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Susun jadwal, optimalkan urutan rute toko, dan pantau progres eksekusi tim sales di lapangan.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAutoGenOpen(true)}
            className="text-xs font-bold text-gold-dark border-gold/50 hover:bg-gold/10"
          >
            <Sparkles size={14} className="mr-1.5 text-gold-dark" /> Auto-Generate
          </Button>

          <Button
            size="sm"
            data-testid="callplan-create-button"
            onClick={() => {
              setEditPlan(null);
              setFormOpen(true);
            }}
            className="bg-navy text-white text-xs font-bold hover:bg-navy-light shadow-xs"
          >
            <Plus size={15} className="mr-1.5" /> Buat Call Plan Baru
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Total Plan</div>
          <div className="font-heading font-bold text-lg text-navy mt-0.5">{totalPlans} Jadwal</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{totalOutlets} Outlet Terencana</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Kunjungan Selesai</div>
          <div className="font-heading font-bold text-lg text-blue-700 mt-0.5">{totalVisited} Toko</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{overallProgress}% Selesai</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Effective Call (EC)</div>
          <div className="font-heading font-bold text-lg text-emerald-700 mt-0.5">{totalEffective} Order</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {totalVisited > 0 ? Math.round((totalEffective / totalVisited) * 100) : 0}% Strike Rate
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs col-span-2 sm:col-span-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Total Nilai Transaksi Plan</div>
          <div className="font-heading font-bold text-lg text-emerald-700 mt-0.5">{rupiah(totalSalesRevenue)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Dari transaksi kunjungan terencana</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Quick Date Presets */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setDate(todayLocal())}
              className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                date === todayLocal() ? "bg-navy text-white shadow-2xs" : "text-slate-600 hover:text-navy"
              }`}
            >
              Hari Ini
            </button>
            <Input
              data-testid="filter-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-7 w-36 text-xs bg-transparent border-0 font-bold text-navy focus-visible:ring-0 p-1"
            />
            {date && (
              <button
                onClick={() => setDate("")}
                className="text-[10px] text-slate-400 hover:text-slate-700 px-1 font-semibold"
                title="Semua Tanggal"
              >
                Reset
              </button>
            )}
          </div>

          {/* Salesman Select */}
          <Select value={salesmanId} onValueChange={(v) => setSalesmanId(v === "ALL" ? "" : v)}>
            <SelectTrigger data-testid="filter-salesman" className="w-52 h-9 text-xs rounded-xl bg-slate-50">
              <SelectValue placeholder="Semua Salesman" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Salesman</SelectItem>
              {salesmen.map((s, idx) => (
                <SelectItem key={s.user_id || s._id || `filter-sales-${idx}`} value={s.user_id || s._id}>
                  {s.name} ({s.code || "SALES"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Select */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-xs rounded-xl bg-slate-50">
              <SelectValue placeholder="Status Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="PUBLISHED">Published</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          size="icon"
          variant="outline"
          title="Refresh"
          onClick={() => handleRefresh()}
          disabled={refreshing}
          className="h-9 w-9 rounded-xl shrink-0"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin text-navy" : "text-slate-600"} />
        </Button>
      </div>

      {/* Plan List Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="animate-spin text-navy" size={32} />
          <span className="text-xs font-semibold text-slate-500">Memuat data Call Plan...</span>
        </div>
      ) : plans.length === 0 ? (
        <div
          className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-xs"
          data-testid="callplan-manage-empty"
        >
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Route size={24} />
          </div>
          <div className="text-base font-bold text-navy">Belum ada Call Plan yang dibuat</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Gunakan tombol &quot;Buat Call Plan Baru&quot; atau &quot;Auto-Generate&quot; untuk menyusun rencana rute kunjungan bagi salesman.
          </p>
          <Button
            onClick={() => {
              setEditPlan(null);
              setFormOpen(true);
            }}
            className="bg-navy text-white text-xs font-bold px-4 py-2 rounded-xl"
          >
            <Plus size={14} className="mr-1.5" /> Buat Call Plan Sekarang
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {plans.map((p, i) => {
            const visited = p.visited_count || p.completed_count || 0;
            const total = p.item_count || p.total_outlets || 0;
            const percent = total > 0 ? Math.round((visited / total) * 100) : 0;
            const isFinished = visited >= total && total > 0;

            return (
              <div
                key={p._id || `plan-${i}`}
                className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                data-testid={`plan-card-${i}`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-navy text-base">{p.salesman_name}</span>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {p.salesman_code}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} className="text-slate-400" />
                          {fmtDate(p.date)}
                        </span>
                        {p.area_name && <span>· {p.area_name}</span>}
                      </div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">
                        Progres: <strong className="text-navy">{visited}/{total}</strong> Outlet
                      </span>
                      <span className="font-bold text-navy">{percent}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isFinished ? "bg-emerald-500" : "bg-navy"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                      <span>Order (EC): <strong className="text-emerald-700">{p.effective_count || 0}</strong></span>
                      {p.total_sales > 0 && (
                        <span>Omset: <strong className="text-emerald-700">{rupiah(p.total_sales)}</strong></span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDetailPlanId(p._id)}
                    className="flex-1 h-8 text-xs font-bold text-navy border-slate-200 hover:bg-slate-50"
                  >
                    <Eye size={13} className="mr-1 text-slate-500" /> Detail Rute
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`plan-edit-${i}`}
                    onClick={() => {
                      setEditPlan(p);
                      setFormOpen(true);
                    }}
                    className="h-8 text-xs font-bold border-slate-200 hover:bg-slate-50"
                  >
                    <Pencil size={13} className="mr-1 text-slate-500" /> Edit
                  </Button>

                  <Button
                    size="icon"
                    variant="outline"
                    title="Duplikat ke Besok"
                    onClick={() => duplicatePlan(p)}
                    className="h-8 w-8 rounded-lg border-slate-200 text-slate-600 hover:text-navy"
                  >
                    <Copy size={13} />
                  </Button>

                  <Button
                    size="icon"
                    variant="outline"
                    data-testid={`plan-delete-${i}`}
                    onClick={() => remove(p._id, p.plan_code)}
                    className="h-8 w-8 rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Plan Form Modal (Create / Edit) */}
      <PlanFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        salesmen={salesmen}
        defaultDate={date || todayLocal()}
        editPlan={editPlan}
        onSaved={() => {
          setFormOpen(false);
          load(false);
        }}
      />

      {/* Detail Route Modal */}
      {detailPlanId && (
        <PlanDetailDialog
          planId={detailPlanId}
          open={!!detailPlanId}
          onClose={() => setDetailPlanId(null)}
          onUpdate={() => load(false)}
        />
      )}

      {/* Auto-Generate Dialog */}
      <AutoGenerateDialog
        open={autoGenOpen}
        onClose={() => setAutoGenOpen(false)}
        salesmen={salesmen}
        defaultDate={date || todayLocal()}
        onGenerated={() => {
          setAutoGenOpen(false);
          load(false);
        }}
      />
    </div>
  );
}

// ================= CREATE & EDIT PLAN FORM DIALOG =================
function PlanFormDialog({ open, onClose, salesmen, defaultDate, editPlan, onSaved }) {
  const [date, setDate] = useState(defaultDate);
  const [salesmanId, setSalesmanId] = useState("");
  const [selected, setSelected] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("smart");

  useEffect(() => {
    if (open) {
      setDate(editPlan?.date || defaultDate);
      setSalesmanId(editPlan?.salesman_id || (salesmen[0]?.user_id || salesmen[0]?._id || ""));
      setSelected([]);
      setRecs([]);
      setSearchRes([]);
      setNotes(editPlan?.notes || "");

      if (editPlan?._id) {
        (async () => {
          try {
            const { data } = await api.get(`/call-plans/${editPlan._id}`);
            setSelected(
              (data.items || []).map((it, idx) => ({
                outlet_id: it.outlet_id,
                outlet_name: it.outlet?.outlet_name || it.outlet_name,
                outlet_code: it.outlet?.outlet_code || it.outlet_code,
                address: it.outlet?.address || it.address,
                channel_name: it.outlet?.channel_name || it.channel_name,
                latitude: it.outlet?.latitude ?? it.latitude,
                longitude: it.outlet?.longitude ?? it.longitude,
                priority: it.priority || "NORMAL",
                sequence: it.sequence || idx + 1,
              }))
            );
          } catch (e) {
            toast.error(errMsg(e));
          }
        })();
      }
    }
  }, [open, editPlan, defaultDate, salesmen]);

  // Load recommendations when salesman or tab changes
  useEffect(() => {
    if (open && salesmanId) {
      loadRecs();
    }
  }, [open, salesmanId]);

  const loadRecs = async () => {
    if (!salesmanId) return;
    setLoadingRecs(true);
    try {
      const { data } = await api.get("/call-plans/smart/recommendations", {
        params: { salesman_id: salesmanId },
      });
      const list = Array.isArray(data) ? data : data.items || [];
      setRecs(list);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoadingRecs(false);
  };

  const search = async (q) => {
    setSearchQ(q);
    if (q.length < 2) {
      setSearchRes([]);
      return;
    }
    try {
      const { data } = await api.get("/outlets", {
        params: { q, status: "ACTIVE", salesman_id: salesmanId || undefined, limit: 20 },
      });
      const selectedSet = new Set(selected.map((s) => s.outlet_id));
      setSearchRes((data.items || []).filter((o) => !selectedSet.has(o._id)));
    } catch (e) {
      console.warn("Pencarian outlet gagal", e);
    }
  };

  const addOutlet = (o, priority = "NORMAL") => {
    const outId = o.outlet_id || o._id;
    if (selected.some((s) => s.outlet_id === outId)) return;

    setSelected((prev) => [
      ...prev,
      {
        outlet_id: outId,
        outlet_name: o.outlet_name,
        outlet_code: o.outlet_code,
        address: o.address,
        channel_name: o.channel_name,
        latitude: o.latitude,
        longitude: o.longitude,
        priority,
        sequence: prev.length + 1,
      },
    ]);
  };

  const addAllRecs = (itemsToAdd) => {
    const selectedSet = new Set(selected.map((s) => s.outlet_id));
    const newItems = itemsToAdd
      .filter((r) => !selectedSet.has(r.outlet_id || r._id))
      .map((r, i) => ({
        outlet_id: r.outlet_id || r._id,
        outlet_name: r.outlet_name,
        outlet_code: r.outlet_code,
        address: r.address,
        channel_name: r.channel_name,
        latitude: r.latitude,
        longitude: r.longitude,
        priority: r.priority || "NORMAL",
        sequence: selected.length + i + 1,
      }));

    if (newItems.length === 0) {
      toast.info("Semua outlet rekomendasi sudah ada di daftar.");
      return;
    }

    setSelected((prev) => [...prev, ...newItems]);
    toast.success(`${newItems.length} outlet rekomendasi ditambahkan.`);
  };

  const removeOutlet = (outletId) => {
    setSelected((prev) =>
      prev
        .filter((s) => s.outlet_id !== outletId)
        .map((it, idx) => ({ ...it, sequence: idx + 1 }))
    );
  };

  const moveUp = (idx) => {
    if (idx === 0) return;
    setSelected((prev) => {
      const arr = [...prev];
      const temp = arr[idx - 1];
      arr[idx - 1] = arr[idx];
      arr[idx] = temp;
      return arr.map((it, i) => ({ ...it, sequence: i + 1 }));
    });
  };

  const moveDown = (idx) => {
    if (idx >= selected.length - 1) return;
    setSelected((prev) => {
      const arr = [...prev];
      const temp = arr[idx + 1];
      arr[idx + 1] = arr[idx];
      arr[idx] = temp;
      return arr.map((it, i) => ({ ...it, sequence: i + 1 }));
    });
  };

  // Client-side quick geographic sort / optimizer for selected outlets
  const optimizeSelected = () => {
    if (selected.length <= 1) return;
    setOptimizing(true);

    const unvisited = [...selected];
    const optimized = [];

    // Find center or start with first outlet
    let curLat = Number(unvisited[0].latitude || -6.2088);
    let curLng = Number(unvisited[0].longitude || 106.8456);

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const lat = Number(unvisited[i].latitude || 0);
        const lng = Number(unvisited[i].longitude || 0);
        if (lat !== 0 && lng !== 0) {
          const d = (lat - curLat) ** 2 + (lng - curLng) ** 2;
          if (d < minDistance) {
            minDistance = d;
            nearestIdx = i;
          }
        }
      }

      const next = unvisited.splice(nearestIdx, 1)[0];
      optimized.push(next);
      if (next.latitude && next.longitude) {
        curLat = Number(next.latitude);
        curLng = Number(next.longitude);
      }
    }

    setSelected(optimized.map((it, idx) => ({ ...it, sequence: idx + 1 })));
    setOptimizing(false);
    toast.success("Urutan rute berhasil dioptimalkan berdasarkan kedekatan lokasi.");
  };

  const submit = async () => {
    if (!salesmanId || selected.length === 0) {
      toast.error("Pilih sales dan minimal 1 outlet.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        date,
        salesman_id: salesmanId,
        notes,
        status: "PUBLISHED",
        items: selected.map((s, i) => ({
          outlet_id: s.outlet_id,
          priority: s.priority || "NORMAL",
          sequence: i + 1,
        })),
      };

      if (editPlan?._id) {
        await api.put(`/call-plans/${editPlan._id}`, payload);
        toast.success("Call plan berhasil diperbarui.");
      } else {
        await api.post("/call-plans", payload);
        toast.success("Call plan berhasil dibuat & dipublish.");
      }
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  const availableRecs = recs.filter((r) => !selected.some((s) => s.outlet_id === (r.outlet_id || r._id)));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        data-testid="plan-form-dialog"
        className="max-h-[90vh] overflow-hidden flex flex-col max-w-2xl p-0 rounded-2xl"
      >
        <DialogHeader className="p-5 pb-3 border-b border-slate-100">
          <DialogTitle className="text-lg font-bold text-navy flex items-center gap-2">
            <Route className="text-gold" size={20} />
            {editPlan?._id ? "Edit Call Plan & Rute" : "Buat Call Plan Baru"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Tentukan tanggal kunjungan, salesman penanggung jawab, dan susunan urutan toko.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Top Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Tanggal Kunjungan</Label>
              <Input
                data-testid="plan-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 text-xs bg-white rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Salesman Penanggung Jawab</Label>
              <Select value={salesmanId} onValueChange={setSalesmanId}>
                <SelectTrigger data-testid="plan-salesman" className="h-9 text-xs bg-white rounded-xl">
                  <SelectValue placeholder="Pilih sales" />
                </SelectTrigger>
                <SelectContent>
                  {salesmen.map((s, idx) => (
                    <SelectItem key={s.user_id || s._id || `form-sales-${idx}`} value={s.user_id || s._id}>
                      {s.name} ({s.code || "SALES"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Outlet Selector with Tabs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-navy">
                Pilih Toko untuk Call Plan ({selected.length} Toko Terpilih)
              </Label>
              {selected.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => optimizeSelected()}
                  disabled={optimizing}
                  className="h-7 text-[11px] font-bold text-navy border-slate-200"
                >
                  <ArrowUpDown size={12} className="mr-1 text-gold" />
                  Optimalkan Rute
                </Button>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-2 h-9 p-1 bg-slate-100 rounded-xl">
                <TabsTrigger value="smart" className="text-xs font-bold rounded-lg flex items-center gap-1.5">
                  <Sparkles size={13} className="text-gold" />
                  Rekomendasi Cerdas ({availableRecs.length})
                </TabsTrigger>
                <TabsTrigger value="search" className="text-xs font-bold rounded-lg flex items-center gap-1.5">
                  <Search size={13} />
                  Pencarian Manual
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Smart Recommendations */}
              <TabsContent value="smart" className="mt-2 space-y-2">
                <div className="flex items-center justify-between bg-gold/10 border border-gold/30 rounded-xl p-2.5">
                  <div className="text-xs text-gold-dark font-medium">
                    Rekomendasi toko berdasarkan siklus kunjungan, toko belum order, dan toko baru (NOO).
                  </div>
                  {availableRecs.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => addAllRecs(availableRecs)}
                      className="h-7 text-xs bg-navy text-white font-bold shrink-0 ml-2"
                    >
                      Pilih Semua ({availableRecs.length})
                    </Button>
                  )}
                </div>

                {loadingRecs ? (
                  <div className="flex justify-center py-6">
                    <Loader2 size={20} className="animate-spin text-navy" />
                  </div>
                ) : availableRecs.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                    Tidak ada toko rekomendasi tambahan untuk sales ini.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-2xs">
                    {availableRecs.map((r, idx) => {
                      const recId = r.outlet_id || r._id || `rec-${idx}`;
                      return (
                        <div
                          key={recId}
                          className="flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-navy truncate">{r.outlet_name}</span>
                              {r.channel_name && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                                  {r.channel_name}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">{r.address || "-"}</div>
                            <div className="text-[10px] text-amber-700 font-semibold mt-0.5 flex items-center gap-1">
                              <span>• {r.recommendation_reason || "Jadwal siklus"}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <StatusBadge status={r.priority} />
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`rec-add-${recId}`}
                              onClick={() => addOutlet(r, r.priority)}
                              className="h-7 text-xs font-bold text-navy border-slate-200 hover:bg-navy hover:text-white"
                            >
                              <Plus size={13} className="mr-1" /> Tambah
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Tab 2: Manual Search */}
              <TabsContent value="search" className="mt-2 space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    data-testid="plan-outlet-search"
                    placeholder="Ketik nama toko, kode, atau alamat..."
                    value={searchQ}
                    onChange={(e) => search(e.target.value)}
                    className="pl-9 h-9 text-xs rounded-xl bg-white"
                  />
                </div>

                {searchRes.length > 0 && (
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-2xs">
                    {searchRes.map((o, idx) => {
                      const outId = o._id || o.outlet_id || `res-${idx}`;
                      return (
                        <div
                          key={outId}
                          className="flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="font-bold text-xs text-navy truncate">{o.outlet_name}</div>
                            <div className="text-[11px] text-slate-400 truncate">{o.address || "-"}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`plan-add-${outId}`}
                            onClick={() => addOutlet(o)}
                            className="h-7 text-xs font-bold text-navy border-slate-200"
                          >
                            <Plus size={13} className="mr-1" /> Tambah
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Selected Outlets Sequence List */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-navy">
              Daftar Urutan Rute Toko ({selected.length} Toko)
            </Label>

            {selected.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                Belum ada outlet yang dipilih. Pilih dari Rekomendasi Cerdas atau Pencarian Manual di atas.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {selected.map((s, i) => {
                  const itemKey = s.outlet_id ? `sel-${s.outlet_id}-${i}` : `sel-${i}`;
                  return (
                    <div
                      key={itemKey}
                      className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs"
                      data-testid={`selected-outlet-${i}`}
                    >
                      {/* Sequence Badge */}
                      <div className="w-6 h-6 rounded-lg bg-navy text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </div>

                      {/* Outlet Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-navy truncate">{s.outlet_name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{s.address || "-"}</div>
                      </div>

                      {/* Priority selector */}
                      <Select
                        value={s.priority}
                        onValueChange={(v) =>
                          setSelected((arr) =>
                            arr.map((x) => (x.outlet_id === s.outlet_id ? { ...x, priority: v } : x))
                          )
                        }
                      >
                        <SelectTrigger className="w-24 h-7 text-[11px] rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HIGH">HIGH</SelectItem>
                          <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                          <SelectItem value="NORMAL">NORMAL</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Up/Down Reorder */}
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => moveUp(i)}
                          disabled={i === 0}
                          className="h-6 w-6 text-slate-400 hover:text-navy"
                        >
                          <ChevronUp size={14} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => moveDown(i)}
                          disabled={i === selected.length - 1}
                          className="h-6 w-6 text-slate-400 hover:text-navy"
                        >
                          <ChevronDown size={14} />
                        </Button>
                      </div>

                      {/* Delete */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeOutlet(s.outlet_id)}
                        className="h-6 w-6 text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => onClose()} className="text-xs font-bold">
            Batal
          </Button>

          <Button
            data-testid="plan-submit"
            disabled={busy || selected.length === 0}
            onClick={() => submit()}
            className="bg-navy text-white text-xs font-bold px-5 hover:bg-navy-light"
          >
            {busy && <Loader2 className="animate-spin mr-2" size={14} />}
            {editPlan?._id ? "Simpan Perubahan" : "Terbitkan Call Plan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ================= PLAN DETAIL & PROGRESS DIALOG =================
function PlanDetailDialog({ planId, open, onClose, onUpdate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/call-plans/${planId}`);
      setData(res.data);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
  }, [planId]);

  useEffect(() => {
    if (open && planId) {
      load();
    }
  }, [open, planId, load]);

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const res = await api.post(`/call-plans/${planId}/optimize`);
      toast.success(res.data?.message || "Rute berhasil dioptimalkan.");
      load();
      if (onUpdate) onUpdate();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setOptimizing(false);
  };

  const items = data?.items || [];
  const visitedCount = items.filter((it) => ["COMPLETED", "EFFECTIVE", "VISITED"].includes(it.status || it.visit?.status)).length;
  const effectiveCount = items.filter((it) => it.status === "EFFECTIVE" || it.visit?.call_result === "EFFECTIVE").length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col max-w-xl p-0 rounded-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-slate-100">
          <DialogTitle className="text-lg font-bold text-navy flex items-center gap-2">
            <Route className="text-gold" size={20} />
            Detail Rute Call Plan ({data?.plan_code || "PLAN"})
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {data?.salesman_name} · {fmtDate(data?.date)} · Disusun oleh {data?.created_by_name || "Supervisor"}
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-navy" />
            </div>
          ) : (
            <>
              {/* Summary Pill Cards */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Outlet</div>
                  <div className="font-bold text-navy text-sm">{items.length} Toko</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Telah Dikunjungi</div>
                  <div className="font-bold text-blue-700 text-sm">{visitedCount} Toko</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Effective (EC)</div>
                  <div className="font-bold text-emerald-700 text-sm">{effectiveCount} Order</div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-navy">Urutan Kunjungan & Status Eksekusi</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOptimize()}
                  disabled={optimizing || items.length <= 1}
                  className="h-7 text-[11px] font-bold text-navy border-slate-200"
                >
                  <ArrowUpDown size={12} className="mr-1 text-gold" />
                  {optimizing ? "Mengoptimalkan..." : "Optimalkan Rute"}
                </Button>
              </div>

              {/* Items List */}
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs">
                {items.map((it, idx) => {
                  const outlet = it.outlet || {};
                  const isVisited = ["COMPLETED", "EFFECTIVE", "VISITED"].includes(it.status || it.visit?.status);
                  const isEffective = it.status === "EFFECTIVE" || it.visit?.call_result === "EFFECTIVE";

                  return (
                    <div key={it._id || `item-${idx}`} className="p-3 flex items-start gap-3 hover:bg-slate-50">
                      <div
                        className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                          isEffective
                            ? "bg-emerald-600 text-white"
                            : isVisited
                            ? "bg-blue-600 text-white"
                            : "bg-navy text-white"
                        }`}
                      >
                        {isEffective ? <CheckCircle2 size={16} /> : it.sequence || idx + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-navy truncate">
                            {outlet.outlet_name || it.outlet_name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{outlet.address || it.address || "-"}</div>
                        {it.visit && (
                          <div className="text-[10px] text-emerald-700 font-semibold mt-1">
                            Visit jam {it.visit.check_in_time ? new Date(it.visit.check_in_time).toLocaleTimeString("id-ID") : "-"}
                            {it.visit.total_sales > 0 && ` · Penjualan ${rupiah(it.visit.total_sales)}`}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusBadge status={it.status || (isVisited ? "VISITED" : "PENDING")} />
                        {it.priority === "HIGH" && <StatusBadge status="HIGH" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <Button onClick={() => onClose()} className="bg-navy text-white text-xs font-bold">
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ================= AUTO GENERATE 1-CLICK DIALOG =================
function AutoGenerateDialog({ open, onClose, salesmen, defaultDate, onGenerated }) {
  const [date, setDate] = useState(defaultDate);
  const [salesmanId, setSalesmanId] = useState(salesmen[0]?.user_id || salesmen[0]?._id || "");
  const [maxOutlets, setMaxOutlets] = useState("10");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setSalesmanId(salesmen[0]?.user_id || salesmen[0]?._id || "");
      setPreview(null);
    }
  }, [open, defaultDate, salesmen]);

  const handleGeneratePreview = async () => {
    if (!salesmanId) {
      toast.error("Pilih salesman terlebih dahulu.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/call-plans/auto-generate", {
        salesman_id: salesmanId,
        date,
        max_outlets: Number(maxOutlets) || 10,
      });
      setPreview(res.data);
      toast.success(`${res.data.items?.length || 0} outlet rekomendasi berhasil disusun.`);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
  };

  const handleSavePlan = async () => {
    if (!preview || !preview.items?.length) return;
    setSaving(true);
    try {
      await api.post("/call-plans", {
        salesman_id: salesmanId,
        date,
        status: "PUBLISHED",
        items: preview.items.map((it, idx) => ({
          outlet_id: it.outlet_id,
          priority: it.priority || "NORMAL",
          sequence: idx + 1,
        })),
      });
      toast.success("Call plan otomatis berhasil diterbitkan.");
      onGenerated();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col max-w-lg p-0 rounded-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-slate-100">
          <DialogTitle className="text-lg font-bold text-navy flex items-center gap-2">
            <Sparkles className="text-gold" size={20} />
            Auto-Generate Rute Call Plan Cerdas
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Sistem menganalisis siklus kunjungan, toko belum order, dan outlet baru untuk menyusun rute harian otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Tanggal Kunjungan</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 text-xs bg-white rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Salesman</Label>
              <Select value={salesmanId} onValueChange={setSalesmanId}>
                <SelectTrigger className="h-9 text-xs bg-white rounded-xl">
                  <SelectValue placeholder="Pilih sales" />
                </SelectTrigger>
                <SelectContent>
                  {salesmen.map((s, idx) => (
                    <SelectItem key={s.user_id || s._id || `auto-sales-${idx}`} value={s.user_id || s._id}>
                      {s.name} ({s.code || "SALES"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Maksimal Kunjungan Toko</Label>
              <Select value={maxOutlets} onValueChange={setMaxOutlets}>
                <SelectTrigger className="h-9 text-xs bg-white rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 Outlet</SelectItem>
                  <SelectItem value="8">8 Outlet</SelectItem>
                  <SelectItem value="10">10 Outlet (Standar)</SelectItem>
                  <SelectItem value="12">12 Outlet</SelectItem>
                  <SelectItem value="15">15 Outlet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => handleGeneratePreview()}
              disabled={loading}
              className="w-full bg-navy text-white text-xs font-bold h-9 hover:bg-navy-light"
            >
              {loading ? <Loader2 className="animate-spin mr-2" size={14} /> : <Sparkles className="mr-2" size={14} />}
              Susun Rekomendasi Rute
            </Button>
          </div>

          {/* Preview list */}
          {preview && (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-navy">
                Hasil Susunan Rute ({preview.items?.length || 0} Toko)
              </Label>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white max-h-48 overflow-y-auto">
                {preview.items.map((it, idx) => (
                  <div key={it.outlet_id || `prev-${idx}`} className="p-2.5 flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-md bg-navy text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs text-navy truncate">{it.outlet_name}</div>
                      <div className="text-[10px] text-amber-700 font-semibold truncate">• {it.reason}</div>
                    </div>
                    <StatusBadge status={it.priority} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => onClose()} className="text-xs font-bold">
            Batal
          </Button>

          <Button
            onClick={() => handleSavePlan()}
            disabled={saving || !preview || !preview.items?.length}
            className="bg-navy text-white text-xs font-bold px-5"
          >
            {saving && <Loader2 className="animate-spin mr-2" size={14} />}
            Terbitkan Rute Ini
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
