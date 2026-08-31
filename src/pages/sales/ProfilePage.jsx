import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { User, KeyRound, LogOut, ShieldCheck, Building2, MapPin, Loader2, RefreshCw, Phone, Mail } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import api, { errMsg } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

export default function ProfilePage() {
  const { user, logout, changePassword, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offices, setOffices] = useState([]);
  const [areas, setAreas] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [offRes, arRes] = await Promise.all([
          api.get("/offices").catch(() => ({ data: [] })),
          api.get("/areas").catch(() => ({ data: [] })),
        ]);
        if (active) {
          setOffices(Array.isArray(offRes.data) ? offRes.data : offRes.data?.items || []);
          setAreas(Array.isArray(arRes.data) ? arRes.data : arRes.data?.items || []);
        }
      } catch (e) {
        // fallback
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (refreshUser) await refreshUser();
      const [offRes, arRes] = await Promise.all([
        api.get("/offices").catch(() => ({ data: [] })),
        api.get("/areas").catch(() => ({ data: [] })),
      ]);
      setOffices(Array.isArray(offRes.data) ? offRes.data : offRes.data?.items || []);
      setAreas(Array.isArray(arRes.data) ? arRes.data : arRes.data?.items || []);
      toast.success("Data profil berhasil disegarkan.");
    } catch (e) {
      toast.error("Gagal menyinkronkan profil.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const assignedOffice = offices.find((o) => o._id === user?.office_id);
  const assignedArea = areas.find((a) => a._id === user?.area_id);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      toast.error("Isi kata sandi lama dan baru.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Kata sandi minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setLoading(true);
    try {
      await changePassword(newPassword, oldPassword);
      toast.success("Kata sandi berhasil diperbarui!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(errMsg(err));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4" data-testid="profile-page">
      {/* Profile Header Card */}
      <div className="bg-gradient-to-br from-navy via-navy to-navy-dark rounded-2xl p-5 text-white shadow-lg space-y-4 border border-navy-light/20 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gold/20 text-gold border-2 border-gold/40 flex items-center justify-center text-xl font-bold shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="leading-tight">
              <h2 className="text-base font-bold text-white font-heading" data-testid="profile-user-name">
                {user?.name || "Pengguna"}
              </h2>
              <div className="text-gold text-xs font-semibold uppercase tracking-wider mt-0.5">
                {user?.role || "SALES"}
              </div>
              <div className="text-slate-300 text-xs mt-1">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={() => handleRefresh()}
            disabled={refreshing}
            title="Segarkan data akun"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-navy font-bold text-sm">
          <ShieldCheck size={16} className="text-gold" />
          <span>Informasi Akun</span>
        </div>
        <div className="space-y-2 text-xs divide-y divide-slate-100">
          <div className="pt-2 flex justify-between items-center">
            <span className="text-slate-500">Status Akun</span>
            <span className="font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {user?.status || "ACTIVE"}
            </span>
          </div>
          <div className="pt-2 flex justify-between items-center">
            <span className="text-slate-500">Kantor Penugasan</span>
            <span className="font-semibold text-slate-800 text-right">
              {assignedOffice?.office_name || (user?.office_id ? "Kantor Pusat Jakarta" : "-")}
            </span>
          </div>
          {assignedArea && (
            <div className="pt-2 flex justify-between items-center">
              <span className="text-slate-500">Wilayah / Area</span>
              <span className="font-semibold text-slate-800">{assignedArea.name}</span>
            </div>
          )}
          {user?.phone && (
            <div className="pt-2 flex justify-between items-center">
              <span className="text-slate-500">Nomor Telepon</span>
              <span className="font-medium text-slate-700">{user.phone}</span>
            </div>
          )}
          <div className="pt-2 flex justify-between items-center">
            <span className="text-slate-500">ID Pengguna</span>
            <span className="font-mono text-slate-600 text-[10px] truncate max-w-[160px]">{user?._id || user?.uid || "-"}</span>
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-navy font-bold text-sm">
          <KeyRound size={16} className="text-gold" />
          <span>Ubah Kata Sandi</span>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Kata Sandi Lama</Label>
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kata Sandi Baru</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Konfirmasi Kata Sandi Baru</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi kata sandi baru"
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-navy text-white text-xs">
            {loading ? <Loader2 className="animate-spin" size={14} /> : "Simpan Kata Sandi Baru"}
          </Button>
        </form>
      </div>

      {/* Logout Button */}
      <Button
        onClick={() => handleLogout()}
        variant="destructive"
        className="w-full text-xs font-bold gap-2 py-3"
      >
        <LogOut size={16} /> Keluar dari Aplikasi
      </Button>
    </div>
  );
}
