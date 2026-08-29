import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Home, CalendarCheck, Store, Receipt, User, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import { pendingCount, flushQueue } from "../lib/offline";

const NAV = [
  { to: "/home", label: "Beranda", icon: Home, testid: "nav-home" },
  { to: "/call-plan", label: "Call Plan", icon: CalendarCheck, testid: "nav-callplan" },
  { to: "/outlets", label: "Outlet", icon: Store, testid: "nav-outlets" },
  { to: "/transactions", label: "Transaksi", icon: Receipt, testid: "nav-transactions" },
  { to: "/profile", label: "Profil", icon: User, testid: "nav-profile" },
];

export default function MobileLayout({ children }) {
  const { user } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(pendingCount());

  useEffect(() => {
    const update = () => setPending(pendingCount());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("mhm-queue", update);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("mhm-queue", update);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-slate-50 pb-24 relative shadow-xl">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between shadow-xs">
        <Logo className="h-7 sm:h-8" withText />
        <div className="flex items-center gap-1.5 sm:gap-2">
          {pending > 0 && (
            <button
              data-testid="sync-badge"
              onClick={() => flushQueue()}
              className="flex items-center gap-1 bg-amber-100/80 text-amber-800 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200"
            >
              <RefreshCw size={10} className="animate-spin" /> {pending}
            </button>
          )}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100/80 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-slate-200/80">
            <span
              data-testid="online-indicator"
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${online ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-rose-500 ring-2 ring-rose-200"}`}
              title={online ? "Online" : "Offline"}
            />
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-600">{online ? "Online" : "Offline"}</span>
          </div>
          <div className="text-right leading-tight pl-0.5 sm:pl-1">
            <div className="text-xs font-bold text-navy max-w-[70px] sm:max-w-[90px] truncate" data-testid="header-user-name">{user?.name}</div>
            <div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-gold-dark font-bold">{user?.role}</div>
          </div>
        </div>
      </header>
      <main className="p-3 sm:p-4 space-y-4">{children}</main>
      <nav
        data-testid="bottom-nav"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/95 backdrop-blur-md border-t border-slate-200/90 pb-safe z-50 flex justify-around items-center h-16 shadow-lg"
      >
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            data-testid={n.testid}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-1 sm:px-3 py-1 min-w-[50px] sm:min-w-[56px] transition-all duration-150 relative ${
                isActive ? "text-navy font-bold scale-105" : "text-slate-400 hover:text-slate-600"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <n.icon size={19} className={isActive ? "text-navy" : "text-slate-400"} />
                <span className="text-[10px] tracking-tight">{n.label}</span>
                {isActive && (
                  <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-gold" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
