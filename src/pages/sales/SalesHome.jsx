import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarCheck, Store, StoreIcon, MapPin, LogIn, LogOut, Loader2,
  Navigation, ClipboardList, Package, RotateCcw, Sparkles, TrendingUp, CheckCircle2, Clock,
  Radio, Compass, ShieldCheck, Camera, Check, X,
} from "lucide-react";
import api, { errMsg, errDetail } from "../../lib/api";
import { getPosition, haversineMeters, formatDistance } from "../../lib/geo";
import { compressPhoto, formatBytes, MAX_PHOTO_BYTES } from "../../lib/imageCompressor";
import { postQueued, getLocalVisit } from "../../lib/offline";
import { useAuth } from "../../context/AuthContext";
import { useLiveLocation } from "../../context/LiveLocationContext";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import { fmtTime, fmtDate, fmtDayDateWIB, formatDuration, rupiah, todayLocal, formatNumber } from "../../lib/format";

export function LiveWIBClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = now.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div className="flex items-center gap-1.5 font-mono text-xs text-gold bg-black/30 px-2.5 py-1 rounded-lg border border-gold/30 backdrop-blur-xs">
      <Clock size={13} className="text-gold animate-pulse" />
      <span className="font-bold tracking-wider">{timeStr} WIB</span>
    </div>
  );
}

export function WorkDurationTicker({ since }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  return (
    <span className="font-bold font-mono text-emerald-300">
      {formatDuration(diffSec)}
    </span>
  );
}

export default function SalesHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { coords: liveCoords, accuracy: userAccuracy, isTracking } = useLiveLocation();
  const [data, setData] = useState(null);
  const [stockToday, setStockToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const [pendingAttendanceType, setPendingAttendanceType] = useState(null);
  const [selfiePhoto, setSelfiePhoto] = useState(null);
  const [selfiePhotoInfo, setSelfiePhotoInfo] = useState(null);
  const [compressingSelfie, setCompressingSelfie] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [dashRes, stockRes] = await Promise.all([
        api.get("/dashboard/sales"),
        api.get("/sales/stock/today"),
      ]);
      setData(dashRes.data);
      setStockToday(stockRes.data);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const handleSelfieFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingSelfie(true);
    try {
      const res = await compressPhoto(file, {
        maxSizeBytes: MAX_PHOTO_BYTES,
        initialQuality: 0.85,
      });
      setSelfiePhoto(res.dataUrl);
      setSelfiePhotoInfo(res);
      toast.success(`Foto selfie siap: ${formatBytes(res.compressedSize)} (Maks 500 KB)`);
    } catch (err) {
      toast.error(err.message || "Gagal mengompres foto selfie");
    } finally {
      setCompressingSelfie(false);
    }
  };

  const triggerAttendance = (type) => {
    setPendingAttendanceType(type);
    setSelfiePhoto(null);
    setSelfiePhotoInfo(null);
    setSelfieModalOpen(true);
  };

  const doAttendance = async (type, selfieBase64 = null) => {
    setBusy(true);
    try {
      const pos = await getPosition();
      if (type === "in") {
        const payload = {
          ...pos,
          photo_in: selfieBase64 || selfiePhoto || undefined,
        };
        const r = await postQueued("/attendance/check-in", payload);
        if (r.offline) toast.warning("Offline: absen masuk masuk antrean sinkronisasi");
        else toast.success("Absen masuk berhasil. Selamat bekerja!");
      } else {
        const payload = {
          ...pos,
          photo_out: selfieBase64 || selfiePhoto || undefined,
        };
        const { data } = await api.post("/attendance/check-out", payload);
        setSummary(data.summary);
        toast.success("Absen pulang berhasil");
      }
      setSelfieModalOpen(false);
      setSelfiePhoto(null);
      setSelfiePhotoInfo(null);
      await load();
    } catch (e) {
      const d = errDetail(e);
      if (d && typeof d === "object" && d.distance !== undefined && d.distance !== null) {
        toast.error(`${d.message} — Jarak Anda ${Math.round(d.distance)}m (maks ${d.radius}m)`, { duration: 6000 });
      } else {
        toast.error(errMsg(e));
      }
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 gap-3" data-testid="sales-home-loading">
        <Loader2 className="animate-spin text-navy" size={32} />
        <span className="text-sm font-medium text-slate-500">Memuat dashboard sales...</span>
      </div>
    );
  }

  const att = data?.attendance;
  const onDuty = att?.status === "ON_DUTY";
  const serverVisit = data?.active_visit;
  const localVisit = getLocalVisit();
  const activeVisit = serverVisit || localVisit;
  const s = data?.summary || {};

  return (
    <div className="space-y-4" data-testid="sales-home">
      {/* Attendance card */}
      <div className="bg-gradient-to-br from-navy via-navy to-navy-dark rounded-2xl p-5 text-white shadow-lg space-y-4 border border-navy-light/20 relative overflow-hidden">
        {/* Background decorative flare */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-gold/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold font-bold flex items-center gap-1.5 mb-0.5">
              <Sparkles size={12} /> Status Kerja & Shift Salesman
            </div>
            <div className="font-heading text-lg font-bold tracking-tight" data-testid="duty-status">
              {onDuty ? "SEDANG BERTUGAS (ON DUTY)" : att?.status === "OFF_DUTY" ? "SUDAH ABSEN PULANG" : "BELUM ABSEN MASUK"}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <LiveWIBClock />
            <StatusBadge status={onDuty ? "ON_DUTY" : att?.status || "ABSENT"} />
          </div>
        </div>

        {/* Shift Schedule Info Pill */}
        <div className="bg-white/5 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Clock size={13} className="text-gold" />
            <span>Jam Kerja Standar: <strong>{data?.shift_config?.work_start_time || "08:00"} - {data?.shift_config?.work_end_time || "17:00"} WIB</strong></span>
          </div>
          <div className="text-[11px] text-amber-300 font-medium">
            Toleransi Terlambat: {data?.shift_config?.late_tolerance_min ?? 15} menit
          </div>
        </div>

        {att && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 text-xs">
            <div>
              <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Absen Masuk</div>
              <div className="font-bold text-white text-sm flex items-center gap-1.5" data-testid="checkin-time">
                {fmtTime(att.check_in_time)}
                {att.raw_status === "LATE" ? (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-medium">
                    +{att.late_minutes || 0}m
                  </span>
                ) : (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-medium">
                    On-time
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Absen Pulang</div>
              <div className="font-bold text-white text-sm" data-testid="checkout-time">
                {att.check_out_time ? fmtTime(att.check_out_time) : <span className="text-slate-400 italic">Belum Pulang</span>}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Durasi Kerja</div>
              <div className="font-bold text-white text-sm">
                {att.check_out_time ? (
                  <span className="text-slate-200">{att.work_duration || "-"}</span>
                ) : att.check_in_time ? (
                  <WorkDurationTicker since={att.check_in_time} />
                ) : "-"}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Kantor Penugasan</div>
              <div className="font-bold text-slate-200 text-xs truncate" title={att.office_name}>{att.office_name || "Depo Pusat"}</div>
            </div>
          </div>
        )}

        {!att && data?.assigned_office && (() => {
          const off = data.assigned_office;
          let dist = null;
          let inRange = false;
          if (liveCoords && off.latitude && off.longitude) {
            dist = haversineMeters(liveCoords.lat, liveCoords.lng, off.latitude, off.longitude);
            inRange = dist <= (off.radius_m || 100);
          }

          return (
            <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 text-xs space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-slate-300 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                  <MapPin size={12} className="text-gold" /> Kantor Penugasan Anda
                </span>
                <span className="text-[10px] text-gold font-mono font-bold">Maks Radius: {off.radius_m}m</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-sm">{off.office_name}</div>
                  <div className="text-[11px] text-slate-300 line-clamp-1">{off.address}</div>
                </div>
                {dist !== null && (
                  <div className="text-right shrink-0">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${
                        inRange
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      <ShieldCheck size={12} />
                      {formatDistance(dist)} ({inRange ? "Dalam Radius" : "Di Luar"})
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {!att && !data?.assigned_office && (
          <div className="bg-amber-500/20 border border-amber-400/40 p-3 rounded-xl text-xs text-amber-200 space-y-1">
            <div className="font-bold flex items-center gap-1">
              <MapPin size={13} className="text-amber-300" /> Belum Ada Kantor Penugasan
            </div>
            <p className="text-[11px] text-amber-100/90 leading-tight">
              Anda belum ditugaskan ke kantor tertentu. Harap hubungi Supervisor atau Administrator untuk mengatur kantor penugasan Anda.
            </p>
          </div>
        )}

        {!onDuty && att?.status !== "OFF_DUTY" && (
          <Button
            data-testid="attendance-checkin-button"
            disabled={busy || !data?.assigned_office}
            onClick={() => triggerAttendance("in")}
            className="w-full h-12 bg-gradient-to-r from-gold to-gold-light hover:brightness-105 text-navy-dark font-bold text-base rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 className="animate-spin mr-2" size={18} /> : <LogIn className="mr-2" size={18} />}
            Absen Masuk (Foto Selfie & GPS Kantor)
          </Button>
        )}

        {onDuty && (
          <Button
            data-testid="attendance-checkout-button"
            disabled={busy || !!activeVisit}
            onClick={() => triggerAttendance("out")}
            className="w-full h-12 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold rounded-xl shadow-sm transition-all active:scale-[0.98]"
            title={activeVisit ? "Selesaikan kunjungan aktif dulu" : ""}
          >
            {busy ? <Loader2 className="animate-spin mr-2" size={18} /> : <LogOut className="mr-2" size={18} />}
            Absen Pulang (Rekap Hari Ini)
          </Button>
        )}
      </div>

      {/* Active visit banner */}
      {activeVisit && (
        <button
          data-testid="active-visit-card"
          onClick={() => navigate("/visit")}
          className="w-full bg-gradient-to-r from-amber-50 to-amber-100/60 border-2 border-gold rounded-2xl p-4 text-left shadow-md space-y-2 active:scale-[0.99] transition-transform relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-gold-dark font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Kunjungan Sedang Berlangsung
            </span>
            <div className="bg-white/80 px-2.5 py-0.5 rounded-full border border-gold/40 shadow-2xs">
              <VisitTimer since={activeVisit.check_in_time} />
            </div>
          </div>
          <div className="font-heading font-bold text-navy text-lg leading-tight">{activeVisit.outlet_name}</div>
          <div className="text-xs text-slate-600 flex items-center justify-between">
            <span>Check-in: <strong>{fmtTime(activeVisit.check_in_time)}</strong></span>
            <span className="text-navy font-bold flex items-center gap-0.5">Buka Form Kunjungan &rarr;</span>
          </div>
        </button>
      )}

      {/* KPI Call Summary */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2 flex items-center justify-between">
          <span>Kinerja Panggilan Hari Ini</span>
          <span className="text-[10px] text-slate-400 font-normal">{fmtDate(todayLocal())}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="kpi-grid">
          <StatCard label="Planned" value={s.planned ?? 0} testid="kpi-planned" />
          <StatCard label="Call" value={s.outlet_calls ?? s.actual ?? 0} testid="kpi-outlet-call" />
          <StatCard label="Effective" value={s.effective_calls ?? s.effective ?? 0} testid="kpi-effective" />
          <StatCard label="EC Rate" value={`${s.ec_rate ?? s.effective_ratio ?? 0}%`} testid="kpi-ec-rate" />
        </div>
      </div>

      {/* Target Volume vs Actual Achievement Card (Strictly Volume Qty) */}
      {data?.target_performance && (
        <div className="bg-gradient-to-br from-navy via-navy to-navy-dark text-white rounded-2xl p-4.5 shadow-md space-y-3.5 border border-navy-light/30" data-testid="target-volume-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gold font-bold flex items-center gap-1">
                <TrendingUp size={12} /> Target Penjualan Berdasarkan Volume
              </div>
              <div className="font-heading font-bold text-base tracking-tight">Pencapaian Volume ({data.target_performance.period})</div>
            </div>
            <div className="text-right">
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold shadow-xs ${
                data.target_performance.achievement_percentage >= 100
                  ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/50"
                  : data.target_performance.achievement_percentage >= 75
                  ? "bg-gold/25 text-gold-light border border-gold/50"
                  : "bg-blue-500/25 text-blue-300 border border-blue-400/50"
              }`}>
                {data.target_performance.status_label || `${data.target_performance.achievement_percentage}%`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-white/5 p-3 rounded-xl border border-white/10 text-center">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-300 font-bold">Target Volume</div>
              <div className="font-heading font-bold text-gold text-lg">{data.target_performance.target_volume?.toLocaleString("id-ID") || 0}</div>
              <div className="text-[9px] text-slate-300">Qty / Karton</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-300 font-bold">Actual Volume</div>
              <div className="font-heading font-bold text-emerald-400 text-lg">{data.target_performance.actual_volume?.toLocaleString("id-ID") || 0}</div>
              <div className="text-[9px] text-slate-300">Qty Terjual</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-300 font-bold">Achievement</div>
              <div className="font-heading font-bold text-white text-lg">{data.target_performance.achievement_formatted || `${data.target_performance.achievement_percentage}%`}</div>
              <div className="text-[9px] text-slate-300">Actual / Target</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  data.target_performance.achievement_percentage >= 100
                    ? "bg-emerald-400"
                    : data.target_performance.achievement_percentage >= 75
                    ? "bg-gold"
                    : "bg-blue-400"
                }`}
                style={{ width: `${Math.min(100, data.target_performance.achievement_percentage || 0)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-300 font-medium">
              <span>Sisa Target: <strong>{Math.max(0, (data.target_performance.target_volume || 0) - (data.target_performance.actual_volume || 0)).toLocaleString("id-ID")} Qty</strong></span>
              <span>Total Nilai: <strong>{rupiah(data.target_performance.revenue || 0)}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Daily Volume & Value */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label="Volume Terjual Hari Ini"
          value={`${formatNumber(s.total_volume ?? s.volume ?? 0)} Qty`}
          sub={`${s.transaction_count ?? s.txn_count ?? 0} transaksi berhasil`}
          testid="kpi-total-volume"
        />
        <StatCard
          label="Nilai Penjualan (Revenue)"
          value={rupiah(s.sales_value ?? s.revenue ?? 0)}
          sub={s.call_achievement != null ? `Call Ach: ${s.call_achievement}%` : "Hari ini"}
          testid="kpi-sales-value"
        />
      </div>

      {/* Volume by SKU with Target Comparison */}
      {data?.volume_by_sku && data.volume_by_sku.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-bold text-slate-600">
              Target &amp; Volume per SKU ({data.period || "Bulan Ini"})
            </span>
            <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Hari ini: {formatNumber(s.total_volume ?? s.volume ?? 0)} Qty
            </span>
          </div>
          <div className="space-y-2">
            {data.volume_by_sku.map((v) => (
              <div key={v.sku_id} className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-navy">{v.sku_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[11px]">
                      Target: <strong className="text-slate-800">{v.target_volume || 0} {v.unit}</strong>
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      v.achievement_percentage >= 100
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : v.achievement_percentage >= 75
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}>
                      {v.achievement_percentage}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Hari ini: <strong className="text-emerald-700 font-bold">{v.volume || 0} {v.unit}</strong> ({rupiah(v.revenue || 0)})</span>
                  <span>Total Aktual: <strong className="text-navy font-bold">{v.actual_volume || 0} {v.unit}</strong></span>
                </div>
                {v.target_volume > 0 && (
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-navy rounded-full transition-all"
                      style={{ width: `${Math.min(100, v.achievement_percentage || 0)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales Daily Stock Status Card */}
      {stockToday && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3" data-testid="sales-stock-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-navy/10 flex items-center justify-center text-navy font-bold">
                <Package size={16} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Stok Fisik Sales</div>
                <div className="font-heading font-bold text-navy text-sm">Posisi Stok Kanvas Hari Ini</div>
              </div>
            </div>
            <button
              onClick={() => setStockModalOpen(true)}
              className="text-xs text-navy hover:text-navy-light font-bold underline bg-slate-100 px-2.5 py-1 rounded-lg"
            >
              Rincian SKU
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 bg-slate-50/90 p-3 rounded-xl text-center border border-slate-100">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Dibawa</div>
              <div className="font-heading font-bold text-blue-700 text-base">{formatNumber(stockToday.totals?.total_dibawa || 0)}</div>
              <div className="text-[9px] text-slate-400">Qty</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Terjual</div>
              <div className="font-heading font-bold text-emerald-700 text-base">{formatNumber(stockToday.totals?.total_terjual || 0)}</div>
              <div className="text-[9px] text-slate-400">Qty</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Retur</div>
              <div className="font-heading font-bold text-purple-700 text-base">{formatNumber(stockToday.totals?.total_return || 0)}</div>
              <div className="text-[9px] text-slate-400">Qty</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Sisa Fisik</div>
              <div className="font-heading font-bold text-navy text-base">{formatNumber(stockToday.totals?.total_sisa || 0)}</div>
              <div className="text-[9px] text-slate-400">Qty</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500 font-bold mb-2">Aksi Cepat Lapangan</div>
        <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
          {[
            { label: "Call Plan", icon: CalendarCheck, to: "/call-plan", testid: "qa-callplan" },
            { label: "Cari Outlet", icon: Store, to: "/outlets?tab=search", testid: "qa-search" },
            { label: "Tambah Outlet", icon: StoreIcon, to: "/outlets?tab=new", testid: "qa-new-outlet" },
            { label: "Terdekat", icon: Navigation, to: "/outlets?tab=nearby", testid: "qa-nearby" },
          ].map((a) => (
            <button
              key={a.label}
              data-testid={a.testid}
              onClick={() => navigate(a.to)}
              className="bg-white border border-slate-200/90 hover:border-navy/40 rounded-xl p-2 sm:p-3 flex flex-col items-center gap-1 sm:gap-1.5 shadow-2xs hover:shadow-xs active:scale-[0.96] transition-all"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 flex items-center justify-center text-navy shrink-0">
                <a.icon size={16} className="sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {!data?.has_call_plan && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 flex gap-2.5 items-start" data-testid="no-callplan-note">
          <ClipboardList size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <span>Belum ada Call Plan hari ini. Anda tetap dapat mengunjungi outlet existing (Non-Plan) atau menambah outlet baru.</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-3 text-[11px] text-slate-500 flex gap-2.5 items-center">
        <MapPin size={15} className="shrink-0 text-navy" />
        <span>Absensi dan kunjungan diverifikasi GPS radius kantor/outlet. Pastikan GPS aktif.</span>
      </div>

      {/* Stock Detail Dialog */}
      <Dialog open={stockModalOpen} onOpenChange={setStockModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-base font-bold text-navy flex items-center gap-2">
              <Package size={16} /> Rincian Stok Produk Dibawa Hari Ini
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-bold text-slate-700">Produk SKU</th>
                    <th className="p-2.5 font-bold text-slate-700 text-center">Dibawa</th>
                    <th className="p-2.5 font-bold text-slate-700 text-center">Terjual</th>
                    <th className="p-2.5 font-bold text-slate-700 text-center">Retur</th>
                    <th className="p-2.5 font-bold text-slate-700 text-right">Sisa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockToday?.items?.map((it) => (
                    <tr key={it.sku_id} className="hover:bg-slate-50/50">
                      <td className="p-2.5">
                        <div className="font-bold text-navy">{it.sku_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{it.sku_code}</div>
                      </td>
                      <td className="p-2.5 text-center font-bold text-blue-700">{it.stok_dibawa}</td>
                      <td className="p-2.5 text-center font-bold text-emerald-700">{it.stok_terjual}</td>
                      <td className="p-2.5 text-center font-bold text-purple-700">{it.stok_return}</td>
                      <td className="p-2.5 text-right font-bold text-navy">{it.sisa_stok} {it.unit}</td>
                    </tr>
                  ))}
                  {(!stockToday?.items || stockToday.items.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">
                        Belum ada stok yang diserahkan untuk hari ini
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg text-[11px] text-slate-500">
              💡 <b>Catatan:</b> Stok yang Anda bawa bukan penjualan. Penjualan hanya tercatat saat transaksi penjualan ke outlet diselesaikan. Sisa stok di akhir rute dikembalikan ke gudang.
            </div>

            <Button onClick={() => setStockModalOpen(false)} className="w-full bg-navy text-white text-xs">
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily summary dialog after checkout */}
      <Dialog open={!!summary} onOpenChange={() => setSummary(null)}>
        <DialogContent data-testid="daily-summary-dialog">
          <DialogHeader>
            <DialogTitle>Ringkasan Hari Ini</DialogTitle>
          </DialogHeader>
          {summary && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-lg p-3"><div className="text-[10px] text-slate-400 uppercase">Masuk</div><div className="font-bold">{fmtTime(summary.check_in_time)}</div></div>
                <div className="bg-slate-50 rounded-lg p-3"><div className="text-[10px] text-slate-400 uppercase">Pulang</div><div className="font-bold">{fmtTime(summary.check_out_time)}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Planned Call", summary.planned],
                  ["Outlet Call", summary.outlet_calls ?? summary.actual],
                  ["Effective Call", summary.effective_calls ?? summary.effective],
                  ["EC Rate", `${summary.ec_rate ?? summary.effective_ratio ?? 0}%`],
                  ["Missed Call", summary.missed],
                  ["Outlet Baru", summary.new_outlets]
                ].map(([l, v]) => (
                  <div key={l} className="bg-slate-50 rounded-lg p-2">
                    <div className="text-[10px] text-slate-400 uppercase">{l}</div>
                    <div className="font-heading font-bold text-navy">{v}</div>
                  </div>
                ))}
              </div>
              <div className="bg-navy text-white rounded-lg p-3 flex justify-between">
                <span className="text-gold text-xs font-bold uppercase">Nilai Penjualan</span>
                <span className="font-heading font-bold">{rupiah(summary.sales_value ?? summary.revenue ?? 0)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Call Achievement: <b>{summary.call_achievement != null ? `${summary.call_achievement}%` : "-"}</b></span>
                <span>EC Rate: <b>{summary.ec_rate ?? summary.effective_ratio != null ? `${summary.ec_rate ?? summary.effective_ratio}%` : "-"}</b></span>
              </div>
              <Button data-testid="summary-close-button" onClick={() => setSummary(null)} className="w-full bg-navy text-white">Tutup</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Selfie Attendance Capture Dialog */}
      <Dialog open={selfieModalOpen} onOpenChange={setSelfieModalOpen}>
        <DialogContent className="max-w-md" data-testid="selfie-attendance-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-navy">
              <Camera size={20} className="text-gold" />
              Foto Selfie {pendingAttendanceType === "in" ? "Absen Masuk" : "Absen Pulang"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-500">
              Ambil foto selfie wajah Anda untuk verifikasi kehadiran. Foto akan secara otomatis dikompres dengan batas maksimal <b>500 KB</b>.
            </p>

            {selfiePhoto ? (
              <div className="space-y-2">
                <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900 aspect-4/3 max-h-64 flex items-center justify-center">
                  <img src={selfiePhoto} alt="Selfie preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelfiePhoto(null);
                      setSelfiePhotoInfo(null);
                    }}
                    className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white p-1.5 rounded-full"
                    title="Ambil ulang selfie"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="flex items-center gap-1 font-semibold text-emerald-700">
                    <Check size={14} /> Terkompresi &le; 500 KB
                  </span>
                  {selfiePhotoInfo && (
                    <span>
                      {selfiePhotoInfo.width}x{selfiePhotoInfo.height} • {formatBytes(selfiePhotoInfo.compressedSize)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-6 bg-slate-50 hover:bg-slate-100/80 transition-colors">
                <label className="cursor-pointer flex flex-col items-center gap-2.5 w-full">
                  <div className="w-14 h-14 rounded-full bg-navy/5 text-navy flex items-center justify-center">
                    {compressingSelfie ? <Loader2 className="animate-spin text-navy" size={26} /> : <Camera size={26} />}
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-navy">
                      {compressingSelfie ? "Mengompresi Selfie..." : "Buka Kamera / Pilih Foto Selfie"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      JPEG/JPG/PNG • Kompresi otomatis &le; 500 KB
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    disabled={compressingSelfie}
                    onChange={handleSelfieFile}
                  />
                </label>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setSelfieModalOpen(false)}
                className="flex-1 rounded-xl"
              >
                Batal
              </Button>
              <Button
                type="button"
                disabled={busy || compressingSelfie}
                onClick={() => doAttendance(pendingAttendanceType, selfiePhoto)}
                className="flex-1 bg-gradient-to-r from-gold to-gold-light hover:brightness-105 text-navy-dark font-bold rounded-xl shadow-sm"
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Check size={16} className="mr-2" />
                    Konfirmasi Absensi
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VisitTimer({ since }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, Date.now() - new Date(since).getTime());
  const m = Math.floor(diff / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  return (
    <span data-testid="visit-timer" className="font-heading font-bold text-navy tabular-nums">
      {String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}
