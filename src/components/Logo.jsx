import { useCompany } from "../context/CompanyContext";

export default function Logo({ className = "h-8", withText = false, dark = false, boxed = false, showCompanyName = false }) {
  const { companyProfile } = useCompany();
  const customLogoUrl = companyProfile?.logoUrl || companyProfile?.companyLogo;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {customLogoUrl ? (
        <div
          className={`flex items-center justify-center aspect-square shrink-0 rounded-xl overflow-hidden transition-all ${
            boxed
              ? dark
                ? "bg-slate-800/80 border border-slate-700 p-1 shadow-sm"
                : "bg-white border border-slate-200 p-1 shadow-sm"
              : ""
          }`}
          style={{ height: "100%", maxHeight: "100%" }}
        >
          <img
            src={customLogoUrl}
            alt={companyProfile?.companyName || "Company Logo"}
            className="h-full w-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div
          className={`flex items-center justify-center aspect-square shrink-0 rounded-xl transition-all ${
            boxed
              ? dark
                ? "bg-gradient-to-br from-gold/20 to-navy-dark border border-gold/40 text-gold p-1.5 shadow-sm"
                : "bg-gradient-to-br from-navy to-navy-dark text-gold border border-gold/30 p-1.5 shadow-sm"
              : ""
          }`}
          style={{ height: "100%", maxHeight: "100%" }}
        >
          <svg
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-full w-full"
          >
            {/* Mountain / Mahameru Silhouette & Distribution Node Concept */}
            <polygon
              points="24,6 42,38 6,38"
              fill="url(#goldGradient)"
              opacity="0.9"
            />
            <polygon
              points="24,14 36,36 12,36"
              fill={dark ? "#0A2540" : "#0A2540"}
            />
            <polygon
              points="24,20 31,34 17,34"
              fill="url(#goldGradient)"
            />
            <circle cx="24" cy="18" r="3" fill="#FFFFFF" />
            <circle cx="16" cy="32" r="2" fill="#FFFFFF" />
            <circle cx="32" cy="32" r="2" fill="#FFFFFF" />
            <line x1="24" y1="18" x2="16" y2="32" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2 2" />
            <line x1="24" y1="18" x2="32" y2="32" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2 2" />
            <defs>
              <linearGradient id="goldGradient" x1="6" y1="6" x2="42" y2="38" gradientUnits="userSpaceOnUse">
                <stop stopColor="#E5C378" />
                <stop offset="0.5" stopColor="#C5A059" />
                <stop offset="1" stopColor="#9A7B38" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}

      {withText && (
        <div className="flex flex-col justify-center leading-none select-none">
          <span
            className={`font-heading font-extrabold tracking-tight text-base ${
              dark ? "text-white" : "text-navy"
            }`}
          >
            {companyProfile?.companyName || "DMS Mahameru"}
          </span>
          <span
            className={`text-[9px] uppercase tracking-wider font-semibold mt-1 ${
              dark ? "text-slate-300" : "text-slate-500"
            }`}
          >
            Distribution Management System
          </span>
        </div>
      )}
    </div>
  );
}
