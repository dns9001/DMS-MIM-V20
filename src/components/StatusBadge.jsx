const STYLES = {
  ACTIVE: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  COMPLETED: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  EFFECTIVE: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  ACHIEVED: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  OVER_ACHIEVED: { cls: "bg-emerald-100 text-emerald-900 border-emerald-300 font-bold", dot: "bg-emerald-600 animate-pulse" },
  ON_DUTY: { cls: "bg-blue-50 text-blue-800 border-blue-200", dot: "bg-blue-500 animate-pulse" },
  ON_FIELD: { cls: "bg-blue-50 text-blue-800 border-blue-200", dot: "bg-blue-500 animate-pulse" },
  VISITING: { cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500 animate-ping" },
  IN_PROGRESS: { cls: "bg-blue-50 text-blue-800 border-blue-200", dot: "bg-blue-500" },
  OPEN: { cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  PENDING_APPROVAL: { cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  PENDING: { cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  DRAFT: { cls: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
  PUBLISHED: { cls: "bg-blue-50 text-blue-800 border-blue-200", dot: "bg-blue-500" },
  PLANNED: { cls: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
  MISSED: { cls: "bg-rose-50 text-rose-800 border-rose-200", dot: "bg-rose-500" },
  REJECTED: { cls: "bg-rose-50 text-rose-800 border-rose-200", dot: "bg-rose-500" },
  CANCELLED: { cls: "bg-rose-50 text-rose-800 border-rose-200", dot: "bg-rose-500" },
  INACTIVE: { cls: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400" },
  ARCHIVED: { cls: "bg-stone-100 text-stone-600 border-stone-300", dot: "bg-stone-400" },
  PROSPECT: { cls: "bg-slate-100 text-slate-700 border-slate-300", dot: "bg-slate-400" },
  NOO: { cls: "bg-blue-50 text-blue-800 border-blue-200", dot: "bg-blue-500" },
  REPEAT: { cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  DORMANT: { cls: "bg-rose-50 text-rose-800 border-rose-200", dot: "bg-rose-500" },
  OFF_DUTY: { cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  ABSENT: { cls: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400" },
  HIGH: { cls: "bg-rose-50 text-rose-800 border-rose-200", dot: "bg-rose-500" },
  MEDIUM: { cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  NORMAL: { cls: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
  FAILED: { cls: "bg-rose-50 text-rose-800 border-rose-200", dot: "bg-rose-500" },
  SYNCED: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  SYNCING: { cls: "bg-blue-50 text-blue-800 border-blue-200", dot: "bg-blue-500 animate-spin" },
};

export default function StatusBadge({ status, label, withDot = true }) {
  const item = STYLES[status] || { cls: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" };
  return (
    <span
      data-testid={`status-${(status || "unknown").toLowerCase()}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${item.cls}`}
    >
      {withDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`} />}
      <span>{label || status || "-"}</span>
    </span>
  );
}

