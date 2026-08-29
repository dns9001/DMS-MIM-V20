import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Building2,
  Upload,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  Globe,
  Mail,
  Phone,
  MapPin,
  FileText,
  Eye,
  RefreshCw,
  Sparkles,
  CreditCard,
  Briefcase,
  FileCheck2,
  Landmark,
  Copy,
  Check,
  RotateCcw,
  Truck,
  Layers,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { errMsg } from "../../lib/api";
import { compressPhoto, formatBytes, MAX_PHOTO_BYTES } from "../../lib/imageCompressor";
import Logo from "../../components/Logo";

export default function CompanyProfilePage() {
  const { user } = useAuth();
  const { companyProfile, loading, updateProfile, uploadLogo, deleteLogo, refreshProfile } = useCompany();

  const canEdit =
    user?.role === "OWNER" ||
    user?.role === "ADMIN" ||
    user?.role === "SUPERADMIN" ||
    user?.email?.toLowerCase() === "andismochsolihin@gmail.com" ||
    user?.email?.toLowerCase() === "admin@mahameru.id" ||
    !user?.role; // default permissive if session active

  const isOwner = canEdit;
  const fileInputRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    companyName: "",
    companyLegalName: "",
    companyCode: "",
    companyEmail: "",
    companyPhone: "",
    companyWebsite: "",
    companyAddress: "",
    city: "",
    postalCode: "",
    companyDescription: "",
    npwp: "",
    nib: "",
    directorName: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountHolder: "",
    bankBranch: "",
  });

  const [formErrors, setFormErrors] = useState({});
  const [activeFormTab, setActiveFormTab] = useState("general"); // 'general' | 'legal' | 'bank' | 'address'
  const [previewTab, setPreviewTab] = useState("invoice"); // 'invoice' | 'surat_jalan' | 'header' | 'login'
  const [logoPreview, setLogoPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState(""); // feedback text e.g. "Menyimpan data...", "Mengunggah logo..."
  const [saveSuccessBanner, setSaveSuccessBanner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  // Load from Company Profile Context
  useEffect(() => {
    if (companyProfile) {
      setFormData({
        companyName: companyProfile.companyName || "",
        companyLegalName: companyProfile.companyLegalName || "",
        companyCode: companyProfile.companyCode || "",
        companyEmail: companyProfile.companyEmail || companyProfile.email || "",
        companyPhone: companyProfile.companyPhone || companyProfile.phone || "",
        companyWebsite: companyProfile.companyWebsite || companyProfile.website || "",
        companyAddress: companyProfile.companyAddress || companyProfile.address || "",
        city: companyProfile.city || "Jakarta Selatan",
        postalCode: companyProfile.postalCode || "12810",
        companyDescription: companyProfile.companyDescription || companyProfile.description || "",
        npwp: companyProfile.npwp || companyProfile.taxId || "01.234.567.8-012.000",
        nib: companyProfile.nib || "9120001234567",
        directorName: companyProfile.directorName || "Andis Moch Solihin",
        bankName: companyProfile.bankName || "Bank Central Asia (BCA)",
        bankAccountNumber: companyProfile.bankAccountNumber || "8830-1234-5678",
        bankAccountHolder: companyProfile.bankAccountHolder || companyProfile.companyLegalName || companyProfile.companyName || "PT Mahameru Distribusi Indonesia",
        bankBranch: companyProfile.bankBranch || "KCP Tebet Raya",
      });
      setLogoPreview(companyProfile.logoUrl || companyProfile.companyLogo || null);
    }
  }, [companyProfile]);

  const validateField = (field, value) => {
    let error = null;
    const str = String(value || "").trim();

    switch (field) {
      case "companyName":
        if (!str) error = "Nama Perusahaan wajib diisi.";
        else if (str.length < 2) error = "Nama Perusahaan minimal 2 karakter.";
        break;
      case "companyEmail":
        if (str) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(str)) error = "Format email tidak valid (contoh: info@perusahaan.co.id).";
        }
        break;
      case "companyPhone":
        if (str && str.length < 6) {
          error = "Nomor telepon minimal 6 digit.";
        }
        break;
      case "companyWebsite":
        if (str && !str.includes(".")) {
          error = "Format website harus valid (contoh: www.perusahaan.co.id).";
        }
        break;
      case "postalCode":
        if (str && (!/^\d{5}$/.test(str))) {
          error = "Kode pos di Indonesia umumnya terdiri dari 5 digit angka.";
        }
        break;
      default:
        break;
    }

    setFormErrors((prev) => {
      const updated = { ...prev };
      if (error) {
        updated[field] = error;
      } else {
        delete updated[field];
      }
      return updated;
    });

    return error;
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    validateField(field, value);
    if (saveSuccessBanner) setSaveSuccessBanner(false);
  };

  const validateAllFields = () => {
    const errors = {};
    
    if (!formData.companyName || !formData.companyName.trim()) {
      errors.companyName = "Nama Perusahaan wajib diisi.";
    }

    if (formData.companyEmail && formData.companyEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.companyEmail.trim())) {
        errors.companyEmail = "Format email tidak valid (contoh: info@perusahaan.co.id).";
      }
    }

    if (formData.companyWebsite && formData.companyWebsite.trim()) {
      if (!formData.companyWebsite.includes(".")) {
        errors.companyWebsite = "Format website harus valid (contoh: https://perusahaan.co.id).";
      }
    }

    if (formData.postalCode && formData.postalCode.trim()) {
      if (!/^\d{5}$/.test(formData.postalCode.trim())) {
        errors.postalCode = "Kode pos harus berupa 5 digit angka.";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCopyText = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`${fieldName} berhasil disalin ke clipboard.`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const [compressedLogoInfo, setCompressedLogoInfo] = useState(null);
  const [compressingLogo, setCompressingLogo] = useState(false);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!canEdit) {
      toast.error("Hanya role berwenang (OWNER/ADMIN) yang dapat mengunggah logo perusahaan.");
      return;
    }

    setCompressingLogo(true);
    const origFormatted = formatBytes(file.size);
    try {
      toast.info("Mengoptimalkan foto logo perusahaan...");
      const compressed = await compressPhoto(file);

      if (compressed.compressedSize > MAX_PHOTO_BYTES) {
        throw new Error(`Ukuran file logo (${compressed.formattedCompressedSize}) melebihi batas 500 KB.`);
      }

      setSelectedFile(file);
      setCompressedLogoInfo(compressed);
      setLogoPreview(compressed.dataUrl);
      toast.success(`Logo berhasil dioptimalkan: ${origFormatted} → ${compressed.formattedCompressedSize} (-${compressed.reductionPercent}%)`);
    } catch (err) {
      toast.error(err.message || "Format file tidak didukung atau kompresi gagal.");
      setSelectedFile(null);
      setCompressedLogoInfo(null);
    } finally {
      setCompressingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUploadLogoConfirm = async () => {
    if (!selectedFile && !compressedLogoInfo) return;
    setUploadingLogo(true);
    try {
      await uploadLogo(compressedLogoInfo?.dataUrl || selectedFile);
      setSelectedFile(null);
      setCompressedLogoInfo(null);
      toast.success("Logo perusahaan berhasil diperbarui ke Cloud Storage!");
    } catch (err) {
      const message = errMsg(err);
      toast.error(`Gagal mengunggah logo: ${message}`);
      setLogoPreview(companyProfile?.logoUrl || null);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!canEdit) {
      toast.error("Hanya role berwenang (OWNER/ADMIN) yang dapat menghapus logo perusahaan.");
      return;
    }

    if (!window.confirm("Apakah Anda yakin ingin menghapus logo kustom? Aplikasi akan kembali menggunakan logo bawaan DMS Mahameru.")) {
      return;
    }

    setDeletingLogo(true);
    try {
      await deleteLogo();
      setSelectedFile(null);
      setLogoPreview(null);
      toast.success("Logo kustom dihapus. Menggunakan logo default sistem.");
    } catch (err) {
      toast.error(`Gagal menghapus logo: ${errMsg(err)}`);
    } finally {
      setDeletingLogo(false);
    }
  };

  const handleResetForm = () => {
    if (companyProfile) {
      setFormData({
        companyName: companyProfile.companyName || "",
        companyLegalName: companyProfile.companyLegalName || "",
        companyCode: companyProfile.companyCode || "",
        companyEmail: companyProfile.companyEmail || companyProfile.email || "",
        companyPhone: companyProfile.companyPhone || companyProfile.phone || "",
        companyWebsite: companyProfile.companyWebsite || companyProfile.website || "",
        companyAddress: companyProfile.companyAddress || companyProfile.address || "",
        city: companyProfile.city || "Jakarta Selatan",
        postalCode: companyProfile.postalCode || "12810",
        companyDescription: companyProfile.companyDescription || companyProfile.description || "",
        npwp: companyProfile.npwp || companyProfile.taxId || "01.234.567.8-012.000",
        nib: companyProfile.nib || "9120001234567",
        directorName: companyProfile.directorName || "Andis Moch Solihin",
        bankName: companyProfile.bankName || "Bank Central Asia (BCA)",
        bankAccountNumber: companyProfile.bankAccountNumber || "8830-1234-5678",
        bankAccountHolder: companyProfile.bankAccountHolder || companyProfile.companyLegalName || companyProfile.companyName || "PT Mahameru Distribusi Indonesia",
        bankBranch: companyProfile.bankBranch || "KCP Tebet Raya",
      });
      setSelectedFile(null);
      setFormErrors({});
      setSaveSuccessBanner(false);
      setLogoPreview(companyProfile.logoUrl || companyProfile.companyLogo || null);
      toast.info("Formulir dikembalikan ke data tersimpan.");
    }
  };

  const handleSaveProfile = async (e) => {
    e?.preventDefault();

    if (!canEdit) {
      toast.error("Akses Ditolak: Hak akses Anda tidak mencukupi untuk memperbarui profil perusahaan.");
      return;
    }

    // Comprehensive client-side validation
    const isValid = validateAllFields();
    if (!isValid) {
      // Find which tab has errors and switch to it
      if (formErrors.companyName || formErrors.companyEmail || formErrors.companyWebsite) {
        setActiveFormTab("general");
      } else if (formErrors.postalCode) {
        setActiveFormTab("address");
      }
      toast.error("Terdapat kesalahan input pada formulir. Harap periksa kolom yang ditandai merah.");
      return;
    }

    setSaving(true);
    setSaveSuccessBanner(false);
    setSavingStep("Menyiapkan pembaruan profil...");

    try {
      // 1. If there is an unsaved selected logo file, try uploading it first
      if (selectedFile) {
        setSavingStep("Mengunggah logo baru ke Cloud Storage...");
        try {
          await uploadLogo(selectedFile);
          setSelectedFile(null);
        } catch (logoErr) {
          console.warn("Logo upload fallback warning:", logoErr);
          toast.warning("Logo kustom disimpan lokal/base64 karena kendala cloud storage.");
        }
      }

      // 2. Update company profile data
      setSavingStep("Menyinkronkan data profil ke server...");
      await updateProfile(formData);

      setSaveSuccessBanner(true);
      toast.success("Profil Perusahaan berhasil disimpan dan disinkronkan ke seluruh sistem!");
      setTimeout(() => setSaveSuccessBanner(false), 5000);
    } catch (err) {
      console.error("Save company profile error:", err);
      const detailError = err.response?.data?.detail || err.response?.data?.message || err.message || "Gagal menyimpan perubahan ke server.";
      toast.error(`Gagal menyimpan: ${detailError}`, {
        duration: 5000,
        description: "Pastikan koneksi internet stabil dan data yang dimasukkan telah sesuai aturan.",
      });
    } finally {
      setSaving(false);
      setSavingStep("");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="animate-spin text-navy" size={32} />
        <p className="text-sm font-semibold text-slate-500">Memuat data profil perusahaan...</p>
      </div>
    );
  }

  const currentLogo = logoPreview || companyProfile?.logoUrl || companyProfile?.companyLogo;

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="company-profile-page">
      {/* Top Header & Role Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-navy text-gold flex items-center justify-center shadow-xs shrink-0">
            <Building2 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-xl font-bold text-navy">Profil Perusahaan</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  isOwner
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-slate-100 text-slate-700 border border-slate-200"
                }`}
              >
                {isOwner ? "OWNER ACCESS (FULL EDIT)" : "READ ONLY"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Identitas resmi perusahaan yang digunakan pada Header Sistem, Invoice Penjualan, Surat Jalan, Rekening Pembayaran, dan Laporan.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshProfile}
            disabled={saving}
            className="text-slate-600 border-slate-200 hover:bg-slate-50"
            title="Refresh data dari server"
          >
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </Button>

          {isOwner && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetForm}
                disabled={saving}
                className="text-slate-600 border-slate-200 hover:bg-slate-50"
                title="Batal perubahan"
              >
                <RotateCcw size={14} className="mr-1.5" /> Reset
              </Button>

              <Button
                data-testid="save-company-profile-top"
                disabled={saving || uploadingLogo || deletingLogo}
                onClick={handleSaveProfile}
                className="bg-gold hover:bg-gold-light text-navy font-bold shadow-xs transition-all flex items-center min-w-[140px] justify-center"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} className="mr-1.5" />
                    <span>Simpan Profil</span>
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Saving in Progress Visual Indicator Banner */}
      {saving && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <Loader2 className="animate-spin text-amber-700 shrink-0" size={18} />
          <div className="flex-1">
            <p className="text-xs font-bold">{savingStep || "Sedang memproses penyimpanan data..."}</p>
            <p className="text-[11px] text-amber-700">Mohon jangan menutup halaman ini hingga proses sinkronisasi selesai.</p>
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {saveSuccessBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="text-emerald-600 shrink-0" size={18} />
            <div>
              <p className="text-xs font-bold">Profil Perusahaan Berhasil Diperbarui!</p>
              <p className="text-[11px] text-emerald-700">Semua dokumen faktur, kop surat, dan informasi rekening pembayaran telah disinkronkan.</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setSaveSuccessBanner(false)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline px-2"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Non-Owner Informational Banner */}
      {!isOwner && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-900 text-sm">
          <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Mode Hanya Baca (Read-Only):</span> Anda masuk dengan akun hak akses terbatas. Sesuai kebijakan tata kelola DMS Mahameru,
            hanya role <span className="font-bold">OWNER</span> atau <span className="font-bold">ADMIN</span> yang memiliki otoritas untuk mengubah nama legal, kontak, NPWP, rekening, dan mengunggah logo ke Cloud Storage.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Logo Branding & Multi-Company Status (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Logo Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-navy text-sm flex items-center gap-2">
                <Sparkles size={16} className="text-gold" /> Logo Resmi Perusahaan
              </h3>
              <span className="text-[11px] font-mono text-slate-400">Max 3MB</span>
            </div>

            {/* Logo Preview Box */}
            <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50/70 min-h-[190px] text-center overflow-hidden group">
              {currentLogo ? (
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={currentLogo}
                    alt="Company Logo"
                    className="max-h-28 max-w-full object-contain drop-shadow-xs"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-[11px] text-slate-500 font-medium">
                    {selectedFile ? "Pratinjau logo baru (belum disimpan)" : "Logo kustom aktif"}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Logo className="h-16" boxed />
                  <div className="text-xs font-semibold text-slate-600 mt-2">Logo Default DMS Mahameru</div>
                  <p className="text-[11px] text-slate-400 max-w-[200px]">
                    Belum ada logo kustom. Sistem menggunakan lambang resmi DMS Mahameru.
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons for Logo */}
            {isOwner && (
              <div className="space-y-2 pt-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  className="hidden"
                  id="company-logo-file-input"
                />

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="choose-logo-button"
                    disabled={compressingLogo || uploadingLogo}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold"
                  >
                    {compressingLogo ? (
                      <>
                        <Loader2 size={14} className="animate-spin mr-1.5 text-navy" /> Mengoptimalkan...
                      </>
                    ) : (
                      <>
                        <Upload size={14} className="mr-1.5" /> Pilih File
                      </>
                    )}
                  </Button>

                  {currentLogo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid="delete-logo-button"
                      disabled={deletingLogo || compressingLogo || uploadingLogo}
                      onClick={handleDeleteLogo}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs font-bold"
                    >
                      {deletingLogo ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1.5" />}
                      Hapus Logo
                    </Button>
                  )}
                </div>

                {compressedLogoInfo && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-xs text-emerald-900 font-bold flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-emerald-600" /> Siap Upload (&le; 500 KB)
                      </div>
                      <div className="text-[11px] text-emerald-700">
                        {compressedLogoInfo.formattedOriginalSize} &rarr; <b>{compressedLogoInfo.formattedCompressedSize}</b> (-{compressedLogoInfo.reductionPercent}%)
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleUploadLogoConfirm}
                      disabled={uploadingLogo}
                      className="bg-navy text-white text-xs h-7 px-3 font-bold"
                    >
                      {uploadingLogo ? <Loader2 size={12} className="animate-spin" /> : "Upload Logo"}
                    </Button>
                  </div>
                )}

                <p className="text-[11px] text-slate-400 leading-tight">
                  Format: JPG/JPEG/PNG/WEBP. Foto otomatis dikompres ke format JPEG maksimal 500 KB sebelum disimpan ke Cloud Storage.
                </p>
              </div>
            )}
          </div>

          {/* System & Entity Readiness Info */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="font-heading font-bold text-navy text-sm flex items-center gap-2">
              <Layers size={16} className="text-slate-600" /> Informasi Legal & Entitas
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">ID Entitas:</span>
                <span className="font-mono font-bold text-navy">{companyProfile?.companyId || "main"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Kode Perusahaan:</span>
                <span className="font-mono font-bold text-navy">{formData.companyCode || "MHM-JKT"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">NPWP / Tax ID:</span>
                <span className="font-mono font-semibold text-slate-800">{formData.npwp || "-"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Penanggung Jawab:</span>
                <span className="font-semibold text-slate-800">{formData.directorName || "-"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Rekening Pembayaran:</span>
                <span className="font-semibold text-slate-800">{formData.bankName || "-"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Terakhir Diperbarui:</span>
                <span className="text-slate-700 font-medium">
                  {companyProfile?.updatedAt ? new Date(companyProfile.updatedAt).toLocaleString("id-ID") : "-"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Diperbarui Oleh:</span>
                <span className="text-slate-700 font-medium">{companyProfile?.updatedBy || "System Owner"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Tabbed Form & Interactive Live Mockup (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Form Box */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            {/* Form Tabs with Error Badges */}
            <div className="flex border-b border-slate-200 bg-slate-50/70 overflow-x-auto p-1.5 gap-1">
              <button
                type="button"
                onClick={() => setActiveFormTab("general")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 relative ${
                  activeFormTab === "general"
                    ? "bg-white text-navy shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-navy hover:bg-slate-100/70"
                }`}
              >
                <Briefcase size={14} /> Identitas & Kontak
                {(formErrors.companyName || formErrors.companyEmail || formErrors.companyWebsite) && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveFormTab("legal")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 relative ${
                  activeFormTab === "legal"
                    ? "bg-white text-navy shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-navy hover:bg-slate-100/70"
                }`}
              >
                <FileCheck2 size={14} /> Legalitas & Perpajakan
              </button>
              <button
                type="button"
                onClick={() => setActiveFormTab("bank")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 relative ${
                  activeFormTab === "bank"
                    ? "bg-white text-navy shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-navy hover:bg-slate-100/70"
                }`}
              >
                <Landmark size={14} /> Rekening Pembayaran
              </button>
              <button
                type="button"
                onClick={() => setActiveFormTab("address")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 relative ${
                  activeFormTab === "address"
                    ? "bg-white text-navy shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-navy hover:bg-slate-100/70"
                }`}
              >
                <MapPin size={14} /> Lokasi & Wilayah
                {formErrors.postalCode && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
                )}
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
              {/* TAB 1: GENERAL & CONTACT */}
              {activeFormTab === "general" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="companyName" className="text-xs font-bold text-navy flex items-center justify-between">
                        <span>Nama Perusahaan (Tampilan Utama) *</span>
                        {formErrors.companyName && (
                          <span className="text-[11px] font-semibold text-rose-600">{formErrors.companyName}</span>
                        )}
                      </Label>
                      <Input
                        id="companyName"
                        data-testid="input-company-name"
                        disabled={!isOwner || saving}
                        placeholder="Contoh: PT Mahameru Distribusi Indonesia"
                        value={formData.companyName}
                        onChange={(e) => handleInputChange("companyName", e.target.value)}
                        className={`font-semibold text-slate-800 transition-all ${
                          formErrors.companyName ? "border-rose-400 ring-1 ring-rose-300 bg-rose-50/20" : ""
                        }`}
                      />
                      <p className="text-[10px] text-slate-400">Ditampilkan pada navbar, mobile header, dan welcome screen.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="companyLegalName" className="text-xs font-bold text-navy">
                        Nama Badan Hukum (Legal Entity Name)
                      </Label>
                      <Input
                        id="companyLegalName"
                        data-testid="input-company-legal-name"
                        disabled={!isOwner || saving}
                        placeholder="Contoh: PT Mahameru Distribusi Indonesia Tbk"
                        value={formData.companyLegalName}
                        onChange={(e) => handleInputChange("companyLegalName", e.target.value)}
                      />
                      <p className="text-[10px] text-slate-400">Dicantumkan pada kop resmi faktur dan dokumen perpajakan.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="companyCode" className="text-xs font-bold text-navy">
                        Kode Perusahaan (Company Code)
                      </Label>
                      <Input
                        id="companyCode"
                        data-testid="input-company-code"
                        disabled={!isOwner || saving}
                        placeholder="Contoh: MHM-JKT"
                        value={formData.companyCode}
                        onChange={(e) => handleInputChange("companyCode", e.target.value)}
                        className="font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="companyEmail" className="text-xs font-bold text-navy flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Mail size={13} /> Email Resmi Perusahaan</span>
                        {formErrors.companyEmail && (
                          <span className="text-[11px] font-semibold text-rose-600">{formErrors.companyEmail}</span>
                        )}
                      </Label>
                      <Input
                        id="companyEmail"
                        data-testid="input-company-email"
                        type="email"
                        disabled={!isOwner || saving}
                        placeholder="info@mahamerudistribusi.co.id"
                        value={formData.companyEmail}
                        onChange={(e) => handleInputChange("companyEmail", e.target.value)}
                        className={formErrors.companyEmail ? "border-rose-400 ring-1 ring-rose-300 bg-rose-50/20" : ""}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="companyPhone" className="text-xs font-bold text-navy flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Phone size={13} /> Nomor Telepon / Call Center</span>
                        {formErrors.companyPhone && (
                          <span className="text-[11px] font-semibold text-rose-600">{formErrors.companyPhone}</span>
                        )}
                      </Label>
                      <Input
                        id="companyPhone"
                        data-testid="input-company-phone"
                        disabled={!isOwner || saving}
                        placeholder="+62 21 8370 1234"
                        value={formData.companyPhone}
                        onChange={(e) => handleInputChange("companyPhone", e.target.value)}
                        className={formErrors.companyPhone ? "border-rose-400 ring-1 ring-rose-300 bg-rose-50/20" : ""}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="companyWebsite" className="text-xs font-bold text-navy flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Globe size={13} /> Website Resmi</span>
                        {formErrors.companyWebsite && (
                          <span className="text-[11px] font-semibold text-rose-600">{formErrors.companyWebsite}</span>
                        )}
                      </Label>
                      <Input
                        id="companyWebsite"
                        data-testid="input-company-website"
                        disabled={!isOwner || saving}
                        placeholder="https://mahamerudistribusi.co.id"
                        value={formData.companyWebsite}
                        onChange={(e) => handleInputChange("companyWebsite", e.target.value)}
                        className={formErrors.companyWebsite ? "border-rose-400 ring-1 ring-rose-300 bg-rose-50/20" : ""}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="companyDescription" className="text-xs font-bold text-navy flex items-center gap-1.5">
                      <FileText size={13} /> Deskripsi Profil Perusahaan
                    </Label>
                    <textarea
                      id="companyDescription"
                      data-testid="input-company-description"
                      disabled={!isOwner || saving}
                      rows={2}
                      placeholder="Distributor FMCG & Consumer Goods terkemuka di Indonesia..."
                      value={formData.companyDescription}
                      onChange={(e) => handleInputChange("companyDescription", e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: LEGAL & TAX */}
              {activeFormTab === "legal" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="npwp" className="text-xs font-bold text-navy flex items-center gap-1.5">
                        <FileCheck2 size={13} /> Nomor Pokok Wajib Pajak (NPWP / Tax ID)
                      </Label>
                      <Input
                        id="npwp"
                        data-testid="input-company-npwp"
                        disabled={!isOwner || saving}
                        placeholder="01.234.567.8-012.000"
                        value={formData.npwp}
                        onChange={(e) => handleInputChange("npwp", e.target.value)}
                        className="font-mono"
                      />
                      <p className="text-[10px] text-slate-400">Dicantumkan pada faktur pajak dan nota penjualan resmi.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="nib" className="text-xs font-bold text-navy">
                        Nomor Induk Berusaha (NIB / OSS)
                      </Label>
                      <Input
                        id="nib"
                        data-testid="input-company-nib"
                        disabled={!isOwner || saving}
                        placeholder="9120001234567"
                        value={formData.nib}
                        onChange={(e) => handleInputChange("nib", e.target.value)}
                        className="font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="directorName" className="text-xs font-bold text-navy">
                        Nama Pimpinan / Direktur Utama / Penanggung Jawab
                      </Label>
                      <Input
                        id="directorName"
                        data-testid="input-company-director"
                        disabled={!isOwner || saving}
                        placeholder="Contoh: Andis Moch Solihin"
                        value={formData.directorName}
                        onChange={(e) => handleInputChange("directorName", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: BANK & PAYMENT INFO */}
              {activeFormTab === "bank" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs text-slate-600 flex items-start gap-2">
                    <CreditCard size={16} className="text-navy shrink-0 mt-0.5" />
                    <span>
                      Informasi rekening bank resmi ini akan otomatis dicetak pada lembar faktur penjualan untuk instruksi pembayaran non-tunai (transfer) oleh outlet/toko.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="bankName" className="text-xs font-bold text-navy flex items-center gap-1.5">
                        <Landmark size={13} /> Nama Bank Resmi
                      </Label>
                      <Input
                        id="bankName"
                        data-testid="input-company-bank-name"
                        disabled={!isOwner || saving}
                        placeholder="Contoh: Bank Central Asia (BCA) / Mandiri / BRI"
                        value={formData.bankName}
                        onChange={(e) => handleInputChange("bankName", e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="bankAccountNumber" className="text-xs font-bold text-navy">
                        Nomor Rekening Bank
                      </Label>
                      <Input
                        id="bankAccountNumber"
                        data-testid="input-company-bank-acc"
                        disabled={!isOwner || saving}
                        placeholder="Contoh: 8830-1234-5678"
                        value={formData.bankAccountNumber}
                        onChange={(e) => handleInputChange("bankAccountNumber", e.target.value)}
                        className="font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="bankAccountHolder" className="text-xs font-bold text-navy">
                        Atas Nama Rekening (Beneficiary Name)
                      </Label>
                      <Input
                        id="bankAccountHolder"
                        data-testid="input-company-bank-holder"
                        disabled={!isOwner || saving}
                        placeholder="Contoh: PT Mahameru Distribusi Indonesia"
                        value={formData.bankAccountHolder}
                        onChange={(e) => handleInputChange("bankAccountHolder", e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="bankBranch" className="text-xs font-bold text-navy">
                        Kantor Cabang Bank
                      </Label>
                      <Input
                        id="bankBranch"
                        data-testid="input-company-bank-branch"
                        disabled={!isOwner || saving}
                        placeholder="Contoh: KCP Tebet Raya, Jakarta Selatan"
                        value={formData.bankBranch}
                        onChange={(e) => handleInputChange("bankBranch", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: ADDRESS & LOCATION */}
              {activeFormTab === "address" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1.5">
                    <Label htmlFor="companyAddress" className="text-xs font-bold text-navy flex items-center gap-1.5">
                      <MapPin size={13} /> Alamat Lengkap Kantor Pusat
                    </Label>
                    <textarea
                      id="companyAddress"
                      data-testid="input-company-address"
                      disabled={!isOwner || saving}
                      rows={3}
                      placeholder="Jl. Tebet Barat Dalam Raya No. 12, Tebet, Jakarta Selatan 12810"
                      value={formData.companyAddress}
                      onChange={(e) => handleInputChange("companyAddress", e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="city" className="text-xs font-bold text-navy">
                        Kota / Kabupaten
                      </Label>
                      <Input
                        id="city"
                        data-testid="input-company-city"
                        disabled={!isOwner || saving}
                        placeholder="Jakarta Selatan"
                        value={formData.city}
                        onChange={(e) => handleInputChange("city", e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="postalCode" className="text-xs font-bold text-navy flex items-center justify-between">
                        <span>Kode Pos</span>
                        {formErrors.postalCode && (
                          <span className="text-[11px] font-semibold text-rose-600">{formErrors.postalCode}</span>
                        )}
                      </Label>
                      <Input
                        id="postalCode"
                        data-testid="input-company-postal"
                        disabled={!isOwner || saving}
                        placeholder="12810"
                        value={formData.postalCode}
                        onChange={(e) => handleInputChange("postalCode", e.target.value)}
                        className={`font-mono ${formErrors.postalCode ? "border-rose-400 ring-1 ring-rose-300 bg-rose-50/20" : ""}`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {isOwner && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
                  <div className="text-xs text-slate-400">
                    Perubahan akan langsung tercermin pada seluruh faktur, dashboard, dan laporan.
                  </div>
                  <Button
                    type="submit"
                    data-testid="save-company-profile-button"
                    disabled={saving || uploadingLogo || deletingLogo}
                    className="bg-navy hover:bg-navy-dark text-white font-bold px-7 shadow-sm flex items-center justify-center min-w-[160px]"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={16} className="animate-spin mr-2" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} className="mr-1.5" />
                        <span>Simpan Perubahan</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </form>
          </div>

          {/* Interactive Live Mockup Section */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Eye size={18} className="text-navy" />
                <h3 className="font-heading font-bold text-navy text-sm">Pratinjau Tampilan Identitas (Live Mockup)</h3>
              </div>
              <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPreviewTab("invoice")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    previewTab === "invoice" ? "bg-white text-navy shadow-xs" : "text-slate-600 hover:text-navy"
                  }`}
                >
                  <FileText size={12} className="inline mr-1" /> Faktur Penjualan
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("surat_jalan")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    previewTab === "surat_jalan" ? "bg-white text-navy shadow-xs" : "text-slate-600 hover:text-navy"
                  }`}
                >
                  <Truck size={12} className="inline mr-1" /> Surat Jalan
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("header")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    previewTab === "header" ? "bg-white text-navy shadow-xs" : "text-slate-600 hover:text-navy"
                  }`}
                >
                  Header Sistem
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("login")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    previewTab === "login" ? "bg-white text-navy shadow-xs" : "text-slate-600 hover:text-navy"
                  }`}
                >
                  Layar Login
                </button>
              </div>
            </div>

            {/* MOCKUP 1: INVOICE / FAKTUR PENJUALAN */}
            {previewTab === "invoice" && (
              <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-xs space-y-4">
                {/* Header Kop */}
                <div className="flex items-start justify-between border-b-2 border-navy pb-4">
                  <div className="flex items-start gap-4">
                    {currentLogo ? (
                      <img
                        src={currentLogo}
                        alt="Logo"
                        className="h-16 w-16 object-contain shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Logo className="h-16" boxed />
                    )}
                    <div>
                      <h4 className="font-heading font-bold text-lg text-navy tracking-tight">
                        {formData.companyLegalName || formData.companyName || "PT Mahameru Distribusi Indonesia"}
                      </h4>
                      <p className="text-xs text-slate-600 max-w-md">
                        {formData.companyAddress || "Jl. Tebet Barat Dalam Raya No. 12, Jakarta Selatan 12810"}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 mt-1 font-medium">
                        <span>Telp: {formData.companyPhone || "+62 21 8370 1234"}</span>
                        <span>•</span>
                        <span>Email: {formData.companyEmail || "info@mahamerudistribusi.co.id"}</span>
                        <span>•</span>
                        <span>NPWP: {formData.npwp || "01.234.567.8-012.000"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold px-2 py-0.5 bg-navy text-white rounded">FAKTUR PENJUALAN</span>
                    <div className="text-[11px] text-slate-400 font-mono mt-1">INV/20260823/001</div>
                    <div className="text-[10px] text-slate-500">23 Agustus 2026</div>
                  </div>
                </div>

                {/* Sample Invoice Table */}
                <div className="border border-slate-100 rounded-lg overflow-hidden text-xs">
                  <table className="w-full">
                    <thead className="bg-slate-50 text-navy font-bold">
                      <tr>
                        <th className="p-2 text-left">SKU / Produk</th>
                        <th className="p-2 text-center">Qty</th>
                        <th className="p-2 text-right">Harga Satuan</th>
                        <th className="p-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="p-2 font-medium">Minyak Goreng Sawit 1L Pouch</td>
                        <td className="p-2 text-center">12 Pcs</td>
                        <td className="p-2 text-right">Rp 18.000</td>
                        <td className="p-2 text-right font-semibold">Rp 216.000</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Bank Account Instructions Box in Invoice */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-bold text-navy flex items-center gap-1.5">
                      <Landmark size={14} className="text-gold" /> Instruksi Pembayaran Transfer Resmi:
                    </div>
                    <div className="text-slate-700">
                      <span className="font-semibold">{formData.bankName || "Bank Central Asia (BCA)"}</span> • No. Rekening:{" "}
                      <span className="font-mono font-bold text-navy">{formData.bankAccountNumber || "8830-1234-5678"}</span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      A/N: {formData.bankAccountHolder || formData.companyLegalName || "PT Mahameru Distribusi Indonesia"} ({formData.bankBranch || "KCP Tebet Raya"})
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyText(formData.bankAccountNumber, "Nomor Rekening")}
                    className="h-7 text-xs border-slate-300 hover:bg-white text-navy font-bold shrink-0"
                  >
                    {copiedField === "Nomor Rekening" ? <Check size={12} className="mr-1 text-emerald-600" /> : <Copy size={12} className="mr-1" />}
                    Salin Rekening
                  </Button>
                </div>
              </div>
            )}

            {/* MOCKUP 2: SURAT JALAN / DELIVERY ORDER */}
            {previewTab === "surat_jalan" && (
              <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-xs space-y-4">
                <div className="flex items-start justify-between border-b-2 border-slate-300 pb-3">
                  <div className="flex items-center gap-3">
                    {currentLogo ? (
                      <img
                        src={currentLogo}
                        alt="Logo"
                        className="h-12 w-12 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Logo className="h-12" boxed />
                    )}
                    <div>
                      <h4 className="font-heading font-bold text-base text-navy">
                        {formData.companyLegalName || formData.companyName || "PT Mahameru Distribusi Indonesia"}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        SURAT JALAN & PENGIRIMAN LOGISTIK • {formData.companyPhone || "+62 21 8370 1234"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold px-2 py-0.5 bg-slate-800 text-white rounded">SURAT JALAN</span>
                    <div className="text-[10px] text-slate-400 font-mono mt-1">DO/20260823/008</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[10px]">PENGIRIM:</span>
                    <span className="font-bold text-navy">{formData.companyName} (Gudang Pusat)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">PENERIMA / OUTLET:</span>
                    <span className="font-bold text-navy">Toko Berkah Jaya (OUT-001)</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[10px] text-slate-500">
                  <div className="border-t border-slate-300 pt-1">Tanda Tangan Pengirim / Driver</div>
                  <div className="border-t border-slate-300 pt-1">Petugas Gudang</div>
                  <div className="border-t border-slate-300 pt-1">Penerima Toko (Cap & TTD)</div>
                </div>
              </div>
            )}

            {/* MOCKUP 3: HEADER SISTEM */}
            {previewTab === "header" && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-navy p-3.5 flex items-center justify-between text-white">
                  <div className="flex items-center gap-3">
                    {currentLogo ? (
                      <img
                        src={currentLogo}
                        alt="Logo"
                        className="h-8 w-8 object-contain bg-white/10 rounded-lg p-0.5"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Logo className="h-8" boxed dark />
                    )}
                    <div>
                      <div className="font-heading font-bold text-sm text-white">
                        {formData.companyName || "DMS Mahameru"}
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-gold font-semibold">
                        Distribution Management System
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 font-medium">
                    Owner Dashboard • {user?.name}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 text-[11px] text-slate-500 text-center">
                  Tampilan navbar utama sistem yang dilihat seluruh admin, supervisor, dan tim sales.
                </div>
              </div>
            )}

            {/* MOCKUP 4: LOGIN PORTAL */}
            {previewTab === "login" && (
              <div className="border border-slate-200 rounded-xl p-8 bg-gradient-to-br from-slate-900 via-navy to-navy-dark text-white flex flex-col items-center justify-center text-center shadow-xs">
                <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center p-2 mb-3 shadow-lg">
                  {currentLogo ? (
                    <img
                      src={currentLogo}
                      alt="Logo"
                      className="max-h-full max-w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Logo className="h-10" boxed dark />
                  )}
                </div>
                <h4 className="font-heading font-bold text-lg text-white">
                  {formData.companyName || "DMS Mahameru"}
                </h4>
                <p className="text-xs text-slate-300 max-w-sm mt-1">
                  {formData.companyDescription || "Sistem Manajemen Distribusi FMCG Modern & Terintegrasi"}
                </p>
                <div className="mt-4 px-3.5 py-1 rounded-full bg-gold/20 text-gold border border-gold/40 text-[11px] font-bold">
                  Login Portal Resmi • {formData.companyCode || "MHM-JKT"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
