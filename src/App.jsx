import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth, homeFor } from "./context/AuthContext";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";

// Layouts
import MobileLayout from "./layouts/MobileLayout";
import DesktopLayout from "./layouts/DesktopLayout";

// Code-split Pages for high performance & lightweight initial bundle
const Login = lazy(() => import("./pages/Login"));
const SalesHome = lazy(() => import("./pages/sales/SalesHome"));
const CallPlanPage = lazy(() => import("./pages/sales/CallPlanPage"));
const OutletsPage = lazy(() => import("./pages/sales/OutletsPage"));
const OutletDetail = lazy(() => import("./pages/sales/OutletDetail"));
const VisitPage = lazy(() => import("./pages/sales/VisitPage"));
const TransactionsPage = lazy(() => import("./pages/sales/TransactionsPage"));
const ProfilePage = lazy(() => import("./pages/sales/ProfilePage"));

const OwnerDashboard = lazy(() => import("./pages/owner/OwnerDashboard"));
const MonitoringPage = lazy(() => import("./pages/supervisor/MonitoringPage"));
const CallPlanManagePage = lazy(() => import("./pages/supervisor/CallPlanManagePage"));
const MasterOutletPage = lazy(() => import("./pages/admin/MasterOutletPage"));
const MasterDataPage = lazy(() => import("./pages/admin/MasterDataPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const CompanyProfilePage = lazy(() => import("./pages/settings/CompanyProfilePage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const OutletReportPage = lazy(() => import("./pages/reports/OutletReportPage"));
const InventoryPage = lazy(() => import("./pages/warehouse/InventoryPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] h-full py-16 gap-3">
      <Loader2 className="animate-spin text-navy" size={28} />
      <span className="text-xs font-semibold text-slate-500">Memuat modul...</span>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="animate-spin text-navy" size={32} />
        <span className="text-sm font-semibold text-slate-600">Memuat DMS Mahameru...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={homeFor(user)} replace />;
  }

  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <>
      <Toaster position="top-center" richColors />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Login Route */}
          <Route
            path="/login"
            element={!loading && user ? <Navigate to={homeFor(user)} replace /> : <Login />}
          />

          {/* Root Redirect */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to={homeFor(user)} replace />
              </ProtectedRoute>
            }
          />

          {/* Mobile / Sales Field Routes */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <MobileLayout>
                  <SalesHome />
                </MobileLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/call-plan"
            element={
              <ProtectedRoute>
                <MobileLayout>
                  <CallPlanPage />
                </MobileLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/outlets"
            element={
              <ProtectedRoute>
                <MobileLayout>
                  <OutletsPage />
                </MobileLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/outlets/:id"
            element={
              <ProtectedRoute>
                <MobileLayout>
                  <OutletDetail />
                </MobileLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/visit"
            element={
              <ProtectedRoute>
                <MobileLayout>
                  <VisitPage />
                </MobileLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <MobileLayout>
                  <TransactionsPage />
                </MobileLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <MobileLayout>
                  <ProfilePage />
                </MobileLayout>
              </ProtectedRoute>
            }
          />

          {/* Desktop / Management Routes */}
          <Route
            path="/owner"
            element={
              <ProtectedRoute allowedRoles={["OWNER", "ADMIN"]}>
                <DesktopLayout title="DMS Mahameru Dashboard">
                  <OwnerDashboard />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/monitoring"
            element={
              <ProtectedRoute allowedRoles={["SUPERVISOR", "ADMIN", "OWNER"]}>
                <DesktopLayout title="Live Monitoring Sales">
                  <MonitoringPage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/call-plans"
            element={
              <ProtectedRoute allowedRoles={["SUPERVISOR", "ADMIN", "OWNER"]}>
                <DesktopLayout title="Manajemen Call Plan">
                  <CallPlanManagePage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/master-outlets"
            element={
              <ProtectedRoute allowedRoles={["SUPERVISOR", "ADMIN", "OWNER"]}>
                <DesktopLayout title="Master Outlet & Lifecycle">
                  <MasterOutletPage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          {/* Alias redirect for legacy/alternative master outlet routes */}
          <Route path="/admin/outlets" element={<Navigate to="/master-outlets" replace />} />
          <Route path="/outlets-master" element={<Navigate to="/master-outlets" replace />} />

          <Route
            path="/admin/masters"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "OWNER"]}>
                <DesktopLayout title="Master Data Management">
                  <MasterDataPage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          {/* Master data alias routes */}
          <Route path="/routes" element={<Navigate to="/admin/masters?tab=routes" replace />} />
          <Route path="/rute" element={<Navigate to="/admin/masters?tab=routes" replace />} />
          <Route path="/admin/routes" element={<Navigate to="/admin/masters?tab=routes" replace />} />
          <Route path="/masters" element={<Navigate to="/admin/masters" replace />} />

          <Route
            path="/settings/company"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "OWNER", "SUPERVISOR", "WAREHOUSE", "SALES"]}>
                <DesktopLayout title="Profil Perusahaan">
                  <CompanyProfilePage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          {/* Alias redirect for company profile */}
          <Route path="/admin/company-profile" element={<Navigate to="/settings/company" replace />} />
          <Route path="/company-profile" element={<Navigate to="/settings/company" replace />} />

          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "OWNER"]}>
                <DesktopLayout title="Pengaturan Sistem">
                  <SettingsPage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />

          <Route
            path="/reports/outlets"
            element={
              <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "SUPERVISOR", "SALES"]}>
                <DesktopLayout title="Laporan Outlet">
                  <OutletReportPage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          {/* Alias redirects for outlet report routes */}
          <Route path="/reports/outlet" element={<Navigate to="/reports/outlets" replace />} />
          <Route path="/reports/outlet-report" element={<Navigate to="/reports/outlets" replace />} />

          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "SUPERVISOR", "WAREHOUSE"]}>
                <DesktopLayout title="Report Center">
                  <ReportsPage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/warehouse"
            element={
              <ProtectedRoute allowedRoles={["WAREHOUSE", "ADMIN", "OWNER"]}>
                <DesktopLayout title="Inventory & Manajemen Gudang">
                  <InventoryPage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "OWNER"]}>
                <DesktopLayout title="Audit Trail Log">
                  <AuditPage />
                </DesktopLayout>
              </ProtectedRoute>
            }
          />

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
