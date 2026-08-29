export default function StatCard({ label, value, sub, icon: Icon, accent = false, testid }) {
  return (
    <div
      data-testid={testid}
      className={`p-3.5 sm:p-4 rounded-xl border flex flex-col justify-between gap-1.5 sm:gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        accent
          ? "bg-gradient-to-br from-navy via-navy-light to-navy-dark text-white border-navy/80 shadow-xs"
          : "bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs"
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider line-clamp-1 ${accent ? "text-gold" : "text-slate-500"}`}>
          {label}
        </span>
        {Icon && (
          <div className={`p-1.5 rounded-lg shrink-0 transition-colors ${accent ? "bg-white/10 text-gold" : "bg-slate-100 text-slate-500"}`}>
            <Icon size={15} className="sm:w-4 sm:h-4" />
          </div>
        )}
      </div>
      <div className={`font-heading text-lg sm:text-2xl font-extrabold tracking-tight truncate ${accent ? "text-white" : "text-navy"}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-[10px] sm:text-xs font-medium truncate ${accent ? "text-slate-300" : "text-slate-500"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

