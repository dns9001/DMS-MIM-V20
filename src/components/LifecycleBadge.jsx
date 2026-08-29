export const LIFECYCLE_DETAILS = {
  PROSPECT: {
    label: "Prospect",
    badge: "PROSPECT",
    rule: "0 Transaksi",
    description: "Belum pernah ada transaksi selesai",
    classes: "bg-slate-100 text-slate-700 border-slate-300",
    dot: "bg-slate-400",
    cardBorder: "border-slate-300",
    cardBg: "bg-slate-50",
    textCol: "text-slate-700",
  },
  NOO: {
    label: "NOO",
    badge: "NOO",
    rule: "1x Transaksi Selesai",
    description: "New Outlet Opening (Toko Baru Aktif)",
    classes: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    cardBorder: "border-blue-300",
    cardBg: "bg-blue-50/50",
    textCol: "text-blue-700",
  },
  REPEAT: {
    label: "Repeat",
    badge: "REPEAT",
    rule: "2x Transaksi Selesai",
    description: "Repeat Order (Pelanggan Berulang)",
    classes: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    cardBorder: "border-amber-300",
    cardBg: "bg-amber-50/50",
    textCol: "text-amber-700",
  },
  ACTIVE: {
    label: "Active",
    badge: "ACTIVE",
    rule: "≥3x Transaksi Selesai",
    description: "Outlet Aktif Rutin (<56 hari)",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    cardBorder: "border-emerald-300",
    cardBg: "bg-emerald-50/50",
    textCol: "text-emerald-700",
  },
  DORMANT: {
    label: "Dormant",
    badge: "DORMANT",
    rule: "Inaktif ≥ 56 Hari (8 Minggu)",
    description: "Tidak ada transaksi dalam 8 minggu terakhir",
    classes: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    cardBorder: "border-rose-300",
    cardBg: "bg-rose-50/50",
    textCol: "text-rose-700",
  },
};

export default function LifecycleBadge({ status, size = "md", showRule = false, withDot = true }) {
  const normStatus = (status || "PROSPECT").toUpperCase();
  const cfg = LIFECYCLE_DETAILS[normStatus] || LIFECYCLE_DETAILS.PROSPECT;

  const sizeCls = size === "sm"
    ? "px-2 py-0.5 text-[10px]"
    : size === "lg"
    ? "px-3 py-1 text-xs font-bold"
    : "px-2.5 py-0.5 text-[11px] font-semibold";

  return (
    <span
      data-testid={`lifecycle-badge-${normStatus.toLowerCase()}`}
      title={`${cfg.label}: ${cfg.description} (${cfg.rule})`}
      className={`inline-flex items-center gap-1.5 rounded-full border tracking-wide whitespace-nowrap shadow-2xs ${sizeCls} ${cfg.classes}`}
    >
      {withDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />}
      <span className="font-bold">{cfg.label}</span>
      {showRule && <span className="text-[10px] opacity-75 font-normal">({cfg.rule})</span>}
    </span>
  );
}
