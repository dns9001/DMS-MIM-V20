import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth, homeFor } from "../context/AuthContext";
import { useCompany } from "../context/CompanyContext";
import { errMsg } from "../lib/api";
import api from "../lib/api";
import Logo from "../components/Logo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";

export default function Login() {
  const { login, forgotPassword } = useAuth();
  const { companyProfile } = useCompany();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Selamat datang, ${user.name}`);
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setError(errMsg(err));
    }
    setLoading(false);
  };

  const doForgot = async () => {
    try {
      if (!forgotEmail) {
        toast.error("Masukkan alamat email Anda.");
        return;
      }
      await forgotPassword(forgotEmail);
      toast.success("Instruksi reset password telah dikirim ke email Anda.");
      setForgotOpen(false);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const appName = companyProfile?.companyName || "DMS Mahameru";
  const legalName = companyProfile?.companyLegalName || companyProfile?.companyName || "PT Mahameru Insan Mandiri";
  const appDesc = companyProfile?.companyDescription || companyProfile?.description || "Distribution Management System untuk manajemen absensi GPS, rute kunjungan outlet, manajemen stok lapangan, dan monitoring distribusi real-time dalam satu platform.";

  return (
    <div className="min-h-screen flex bg-navy" data-testid="login-page">
      {/* Left Brand Panel (Desktop) */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(https://images.pexels.com/photos/16898413/pexels-photo-16898413.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy/90 to-navy-dark/95" />
        
        {/* Brand Header */}
        <div className="relative z-10 flex items-center justify-between">
          <Logo className="h-16" boxed dark />
          {companyProfile?.companyCode && (
            <span className="px-3 py-1 rounded-full bg-white/10 text-gold border border-gold/30 text-xs font-mono font-bold tracking-wider">
              {companyProfile.companyCode}
            </span>
          )}
        </div>

        {/* Hero Copy */}
        <div className="relative z-10 space-y-4 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/20 text-gold border border-gold/40 text-xs font-bold w-fit">
            <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
            Portal Distribusi Resmi
          </div>
          <h1 className="font-heading text-4xl xl:text-5xl font-bold text-white leading-tight">
            {appName}
          </h1>
          <p className="text-slate-300 text-base leading-relaxed">
            {appDesc}
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            {["GPS Validated", "Offline Ready", "Real-time KPI"].map((t) => (
              <div key={t} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer & Contact */}
        <div className="relative z-10 text-slate-400 text-xs space-y-1.5">
          <div className="font-medium text-slate-300">
            &copy; {new Date().getFullYear()} {legalName}
          </div>
          {(companyProfile?.companyAddress || companyProfile?.companyPhone || companyProfile?.companyEmail) && (
            <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
              {companyProfile?.companyAddress && <span>{companyProfile.companyAddress}</span>}
              {companyProfile?.companyPhone && <span>Telp: {companyProfile.companyPhone}</span>}
              {companyProfile?.companyEmail && <span>Email: {companyProfile.companyEmail}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Right Login Form Container */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile Header */}
          <div className="lg:hidden flex flex-col items-center gap-3">
            <Logo className="h-16" boxed />
            <div className="text-center">
              <div className="font-heading font-bold text-navy text-lg">{appName}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-gold-dark font-bold">
                {legalName}
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="font-heading text-xl font-bold text-navy">Masuk Akun</h2>
              <p className="text-sm text-slate-500">Gunakan email dan password Anda</p>
            </div>
            
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  data-testid="login-email-input"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={companyProfile?.companyEmail || "nama@mahameru.id"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    data-testid="login-password-input"
                    type={showPw ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10 rounded-xl"
                  />
                  <button
                    type="button"
                    data-testid="login-toggle-password"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy p-1"
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              
              {error && (
                <div data-testid="login-error" className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl p-3">
                  {error}
                </div>
              )}
              
              <Button
                data-testid="login-submit-button"
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-navy hover:bg-navy-light text-white font-bold transition-all shadow-sm rounded-xl text-sm"
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                Masuk ke Sistem
              </Button>
              
              <button
                type="button"
                data-testid="forgot-password-link"
                onClick={() => setForgotOpen(true)}
                className="w-full text-center text-xs font-semibold text-gold-dark hover:underline"
              >
                Lupa password?
              </button>
            </form>

            {/* Support info from settings */}
            {(companyProfile?.companyEmail || companyProfile?.companyPhone) && (
              <div className="pt-2 text-center text-[11px] text-slate-400">
                Butuh bantuan login? Hubungi{" "}
                <span className="font-semibold text-slate-600">
                  {companyProfile.companyPhone || companyProfile.companyEmail}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent data-testid="forgot-password-dialog">
          <DialogHeader>
            <DialogTitle>Lupa Password</DialogTitle>
            <DialogDescription>Masukkan email Anda. Tautan reset akan dibuat oleh sistem.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              data-testid="forgot-email-input"
              type="email"
              placeholder="nama@mahameru.id"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />
            <Button data-testid="forgot-submit-button" onClick={doForgot} className="w-full bg-navy text-white">
              Kirim Tautan Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
