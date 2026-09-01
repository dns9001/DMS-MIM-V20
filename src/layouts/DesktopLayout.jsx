import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Radar, CalendarCheck, Database, Settings, FileBarChart,
  Package, ScrollText, LogOut, Menu, Building2, Store, FileSpreadsheet,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import PageTransition from "../components/layout/PageTransition";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet";
import { Button } from "../components/ui/button";

const MENUS = [
  { to: "/owner", label: "Dashboard", icon: LayoutDashboard, roles: ["OWNER", "ADMIN"], testid: "menu-dashboard" },
  { to: "/monitoring", label: "Monitoring Sales", icon: Radar, roles: ["SUPERVISOR", "ADMIN", "OWNER"], testid: "menu-monitoring" },
  { to: "/call-plans", label: "Call Plan", icon: CalendarCheck, roles: ["SUPERVISOR", "ADMIN", "OWNER"], testid: "menu-callplans" },
  { to: "/master-outlets", label: "Master Outlet", icon: Store, roles: ["ADMIN", "OWNER", "SUPERVISOR"], testid: "menu-master-outlets" },
  { to: "/reports/outlets", label: "Laporan Outlet", icon: FileSpreadsheet, roles: ["OWNER", "ADMIN", "SUPERVISOR", "SALES"], testid: "menu-outlet-report" },
  { to: "/admin/masters", label: "Master Data", icon: Database, roles: ["ADMIN", "OWNER"], testid: "menu-masters" },
  { to: "/settings/company", label: "Profil Perusahaan", icon: Building2, roles: ["OWNER", "ADMIN"], testid: "menu-company-profile" },
  { to: "/admin/settings", label: "Pengaturan Sistem", icon: Settings, roles: ["ADMIN", "OWNER"], testid: "menu-settings" },
  { to: "/reports", label: "Report Center", icon: FileBarChart, roles: ["OWNER", "ADMIN", "SUPERVISOR", "WAREHOUSE"], testid: "menu-reports" },
  { to: "/warehouse", label: "Inventory", icon: Package, roles: ["WAREHOUSE", "ADMIN", "OWNER"], testid: "menu-inventory" },
  { to: "/audit", label: "Audit Trail", icon: ScrollText, roles: ["ADMIN", "OWNER"], testid: "menu-audit" },
];

function NavItems({ onNavigate }) {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-1.5 px-3">
      {MENUS.filter((m) => m.roles.includes(user?.role)).map((m) => (
        <NavLink
          key={m.to}
          to={m.to}
          onClick={() => onNavigate?.()}
          data-testid={m.testid}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-150 min-h-[44px] ${
              isActive
                ? "bg-gradient-to-r from-gold to-gold-light text-navy shadow-xs font-bold"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`
          }
        >
          <m.icon size={18} className="shrink-0" />
          <span className="truncate">{m.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

export default function DesktopLayout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : "U";

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-body text-slate-800">
      <aside className="hidden md:flex w-64 flex-shrink-0 bg-navy flex-col shadow-xl" data-testid="desktop-sidebar">
        <div className="p-5 border-b border-white/10">
          <Logo className="h-10" withText dark boxed />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <NavItems />
        </div>
        <div className="p-4 border-t border-white/10 flex items-center justify-between bg-black/15">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gold/20 text-gold border border-gold/40 flex items-center justify-center text-xs font-bold shrink-0">
              {initial}
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-white text-sm font-bold truncate" data-testid="sidebar-user-name">{user?.name}</div>
              <div className="text-gold text-[10px] uppercase tracking-widest font-bold truncate">{user?.role}</div>
            </div>
          </div>
          <button
            data-testid="logout-button"
            onClick={() => doLogout()}
            className="text-slate-400 hover:text-rose-300 hover:bg-white/10 rounded-lg transition-colors p-2 shrink-0 ml-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Keluar"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
        <header className="h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200/90 flex items-center px-3 sm:px-5 md:px-8 justify-between shrink-0 z-30 shadow-xs">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden text-slate-700 h-10 w-10 shrink-0" data-testid="mobile-menu-button">
                  <Menu size={22} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-navy border-none p-0 w-72 text-white flex flex-col justify-between">
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 sm:p-5 border-b border-white/10">
                    <Logo className="h-9" withText dark boxed />
                  </div>
                  <div className="py-4">
                    <NavItems onNavigate={() => setOpen(false)} />
                  </div>
                </div>
                <div className="p-4 border-t border-white/10 flex items-center justify-between bg-black/20 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gold/20 text-gold border border-gold/40 flex items-center justify-center text-xs font-bold shrink-0">
                      {initial}
                    </div>
                    <div className="leading-tight min-w-0">
                      <div className="text-white text-xs font-bold truncate">{user?.name}</div>
                      <div className="text-gold text-[9px] uppercase tracking-widest font-bold truncate">{user?.role}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => doLogout()}
                    className="text-slate-400 hover:text-rose-300 hover:bg-white/10 rounded-lg p-2 transition-colors shrink-0 ml-1"
                    title="Keluar"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <h1 className="font-heading text-sm sm:text-base md:text-lg font-bold text-navy tracking-tight truncate" data-testid="page-title">{title || "DMS Mahameru"}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="text-right leading-tight hidden sm:block">
              <div className="text-sm font-bold text-navy">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-gold-dark font-bold">{user?.role}</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center text-xs font-bold sm:hidden shrink-0 shadow-xs">
              {initial}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 md:p-8 bg-slate-50/70">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
