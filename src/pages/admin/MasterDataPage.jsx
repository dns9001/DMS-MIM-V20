import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2, Plus, Pencil, Trash2, Search, Power, AlertTriangle, Download, Upload,
  Users, UserCheck, Building2, MapPin, Navigation, Tag, Package, Barcode,
  DollarSign, Percent, Route as RouteIcon, MessageSquare, Target, Store,
  Globe, RefreshCw, Filter, ShieldCheck, CheckCircle2
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import StatusBadge from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import UploadDatabaseModal from "../../components/UploadDatabaseModal";
import MasterWilayahImportModal from "../../components/admin/MasterWilayahImportModal";

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE"];

const ENTITIES = {
  users: {
    label: "Pengguna & Akun",
    icon: Users,
    endpoint: "/users",
    description: "Daftar kredensial user, peranan akun, serta kantor penugasan",
    columns: [
      { k: "name", l: "Nama" },
      { k: "email", l: "Email" },
      { k: "role", l: "Role", badge: true },
      { k: "office_name", l: "Kantor Penugasan" },
      { k: "status", l: "Status", badge: true },
    ],
    fields: [
      { k: "name", l: "Nama Lengkap *", required: true, placeholder: "Contoh: Budi Santoso", colSpan: 2 },
      { k: "email", l: "Email Login *", type: "email", required: true, hideOnEdit: true, placeholder: "budi@mahameru.id" },
      { k: "password", l: "Password Akun *", type: "password", required: true, editLabel: "Password Baru (Kosongkan jika tidak diganti)", placeholder: "Minimal 6 karakter" },
      { k: "role", l: "Peranan (Role) *", type: "select", options: ["OWNER", "ADMIN", "SUPERVISOR", "SALES", "WAREHOUSE"], required: true },
      { k: "phone", l: "Nomor Telepon / WhatsApp", placeholder: "08123456789" },
      { k: "office_id", l: "Kantor Penugasan / Depo", type: "select", source: "offices", labelKey: "office_name" },
      { k: "area_id", l: "Area Wilayah Operasional", type: "select", source: "areas" },
      { k: "status", l: "Status Akun", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  salesmen: {
    label: "Salesman",
    icon: UserCheck,
    endpoint: "/masters/salesmen",
    description: "Profil tenaga penjual, kode sales, dan kantor absensi",
    columns: [
      { k: "code", l: "Kode" },
      { k: "name", l: "Nama" },
      { k: "sales_type", l: "Tipe Sales" },
      { k: "office_name", l: "Kantor Penugasan" },
      { k: "area_name", l: "Area" },
      { k: "status", l: "Status", badge: true },
    ],
    fields: [
      { k: "name", l: "Nama Lengkap Salesman *", required: true, placeholder: "Contoh: Ahmad Fadillah", colSpan: 2 },
      { k: "code", l: "Kode Salesman *", required: true, placeholder: "Contoh: SLS-01 / CANVASSER-01" },
      { k: "sales_type", l: "Tipe Penjualan", type: "select", options: ["CANVASSER", "MOTORIS", "TAKING_ORDER"] },
      { k: "office_id", l: "Kantor Penugasan (Absensi & Gudang) *", type: "select", source: "offices", labelKey: "office_name", required: true },
      { k: "area_id", l: "Area Wilayah Penugasan", type: "select", source: "areas" },
      { k: "status", l: "Status Salesman", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  offices: {
    label: "Kantor & Depo",
    icon: Building2,
    endpoint: "/masters/offices",
    description: "Master cabang kantor pusat, depo gudang, dan geofence GPS",
    columns: [
      { k: "office_name", l: "Nama Kantor / Depo" },
      { k: "code", l: "Kode" },
      { k: "address", l: "Alamat" },
      { k: "radius_m", l: "Radius Geofence (m)" },
      { k: "work_start_time", l: "Jam Masuk" },
      { k: "work_end_time", l: "Jam Pulang" },
      { k: "status", l: "Status", badge: true },
    ],
    fields: [
      { k: "office_name", l: "Nama Kantor / Depo Gudang *", required: true, placeholder: "Contoh: Depo Mahameru Cianjur", colSpan: 2 },
      { k: "code", l: "Kode Kantor / Cabang *", required: true, placeholder: "HO-JKT, DEPO-CJR" },
      { k: "radius_m", l: "Radius Geofence Presensi (Meter) *", type: "number", required: true, placeholder: "100" },
      { k: "address", l: "Alamat Lengkap Kantor *", required: true, placeholder: "Jl. Raya Cianjur No. 123", colSpan: 2 },
      { k: "latitude", l: "Latitude GPS *", type: "number", step: "0.000001", required: true, placeholder: "-6.2255" },
      { k: "longitude", l: "Longitude GPS *", type: "number", step: "0.000001", required: true, placeholder: "106.8095" },
      { k: "work_start_time", l: "Jam Masuk Kerja", placeholder: "08:00" },
      { k: "work_end_time", l: "Jam Pulang Kerja", placeholder: "17:00" },
      { k: "check_in_start", l: "Jam Buka Presensi", placeholder: "06:00" },
      { k: "late_tolerance_min", l: "Toleransi Keterlambatan (Menit)", type: "number", placeholder: "15" },
      { k: "status", l: "Status Kantor / Depo", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  areas: {
    label: "Area Wilayah",
    icon: MapPin,
    endpoint: "/masters/areas",
    description: "Zona cakupan distribusi dan operasional pemasaran",
    columns: [{ k: "name", l: "Nama Area" }, { k: "code", l: "Kode" }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "name", l: "Nama Area Wilayah *", required: true, placeholder: "Contoh: Cianjur Kota & Sekitarnya" },
      { k: "code", l: "Kode Area *", required: true, placeholder: "AR-CJR-01" },
      { k: "status", l: "Status Area", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  districts: {
    label: "Kecamatan",
    icon: Navigation,
    endpoint: "/masters/districts",
    description: "Tingkat pembagian administratif kecamatan per area",
    columns: [{ k: "name", l: "Kecamatan" }, { k: "area_name", l: "Area Terkait" }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "name", l: "Nama Kecamatan *", required: true, placeholder: "Contoh: Cianjur" },
      { k: "area_id", l: "Area Wilayah Terkait *", type: "select", source: "areas", required: true },
      { k: "status", l: "Status Kecamatan", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  villages: {
    label: "Kelurahan / Desa",
    icon: MapPin,
    endpoint: "/masters/villages",
    description: "Tingkat kelurahan dan desa administratif",
    columns: [{ k: "name", l: "Kelurahan" }, { k: "district_name", l: "Kecamatan" }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "name", l: "Nama Kelurahan / Desa *", required: true, placeholder: "Contoh: Pamoyanan" },
      { k: "district_id", l: "Kecamatan Terkait *", type: "select", source: "districts", required: true },
      { k: "status", l: "Status Kelurahan", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  channels: {
    label: "Channel Outlet",
    icon: Tag,
    endpoint: "/masters/channels",
    description: "Klasifikasi tipe toko (General Trade, Modern Trade, Grosir, dll.)",
    columns: [{ k: "name", l: "Nama Channel" }, { k: "code", l: "Kode" }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "name", l: "Nama Channel Distribusi *", required: true, placeholder: "Contoh: General Trade / Toko Kelontong" },
      { k: "code", l: "Kode Channel *", required: true, placeholder: "GT, MT, GROSIR, HOREKA" },
      { k: "status", l: "Status Channel", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  products: {
    label: "Master Brand & Produk",
    icon: Package,
    endpoint: "/masters/products",
    description: "Daftar merek dan lini kategori produk",
    columns: [{ k: "name", l: "Nama Produk" }, { k: "brand", l: "Brand" }, { k: "category", l: "Kategori" }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "name", l: "Nama Lini Produk *", required: true, placeholder: "Contoh: Mahameru Sejati Filter", colSpan: 2 },
      { k: "brand", l: "Brand / Merek Dagang", placeholder: "Contoh: Mahameru" },
      { k: "category", l: "Kategori Produk", placeholder: "SKT / SKM / SPM / Minuman" },
      { k: "status", l: "Status Produk", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  skus: {
    label: "SKU Produk",
    icon: Barcode,
    endpoint: "/masters/skus",
    description: "Item unit terkecil persediaan dan kode barcode produk",
    columns: [{ k: "sku_code", l: "Kode SKU" }, { k: "name", l: "Nama SKU" }, { k: "unit", l: "Satuan" }, { k: "base_price", l: "Harga Dasar", money: true }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "product_id", l: "Produk Induk *", type: "select", source: "products", required: true, colSpan: 2 },
      { k: "sku_code", l: "Kode SKU / Barcode *", required: true, placeholder: "SKU-001 / 899123456789" },
      { k: "name", l: "Nama Varian SKU *", required: true, placeholder: "Mahameru Filter 12s" },
      { k: "unit", l: "Satuan Dasar (CTN / SLOP / BKS / PCS)", placeholder: "PCS / BKS" },
      { k: "pack_size", l: "Isi per Karton / Pack", type: "number", placeholder: "10" },
      { k: "base_price", l: "Harga Pokok / Dasar (Rp)", type: "number", placeholder: "15000", colSpan: 2 },
      { k: "status", l: "Status SKU", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  prices: {
    label: "Daftar Harga",
    icon: DollarSign,
    endpoint: "/masters/prices",
    description: "Tabel harga jual resmi per item SKU",
    columns: [{ k: "sku_name", l: "SKU" }, { k: "price", l: "Harga Jual", money: true }, { k: "price_type", l: "Tipe" }, { k: "effective_date", l: "Berlaku Sejak" }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "sku_id", l: "SKU Produk *", type: "select", source: "skus", required: true, colSpan: 2 },
      { k: "price", l: "Harga Jual Satuan (Rp) *", type: "number", required: true, placeholder: "20000" },
      { k: "price_type", l: "Tipe Harga", type: "select", options: ["DEFAULT", "SPECIAL", "GROSIR", "RETAIL"] },
      { k: "min_qty", l: "Kuantitas Minimum (Min Qty)", type: "number", placeholder: "1" },
      { k: "effective_date", l: "Tanggal Mulai Berlaku *", type: "date", required: true },
      { k: "status", l: "Status Harga", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  promos: {
    label: "Promo & Diskon",
    icon: Percent,
    endpoint: "/masters/promos",
    description: "Program diskon promosi dan batas masa berlaku",
    columns: [{ k: "name", l: "Nama Promo" }, { k: "discount_pct", l: "Diskon %" }, { k: "start_date", l: "Mulai" }, { k: "end_date", l: "Selesai" }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "name", l: "Nama Program Promo *", required: true, placeholder: "Diskon Spesial Awal Bulan", colSpan: 2 },
      { k: "promo_code", l: "Kode Promo", placeholder: "PROMO-01" },
      { k: "promo_type", l: "Tipe Promo", type: "select", options: ["PERCENTAGE", "FIXED_AMOUNT"] },
      { k: "sku_id", l: "SKU Berlaku (Kosongkan jika semua SKU)", type: "select", source: "skus", colSpan: 2 },
      { k: "discount_pct", l: "Persentase Diskon (%)", type: "number", placeholder: "5" },
      { k: "discount_amount", l: "Potongan Nominal (Rp)", type: "number", placeholder: "1000" },
      { k: "start_date", l: "Tanggal Mulai", type: "date" },
      { k: "end_date", l: "Tanggal Selesai", type: "date" },
      { k: "status", l: "Status Promo", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  routes: {
    label: "Rute Kunjungan",
    icon: RouteIcon,
    endpoint: "/masters/routes",
    description: "Jalur rute perjalanan sales dalam area binaan",
    columns: [{ k: "name", l: "Nama Rute" }, { k: "area_name", l: "Area" }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "name", l: "Nama Rute Kunjungan *", required: true, placeholder: "Contoh: Rute Cianjur Kota - Senin" },
      { k: "area_id", l: "Area Wilayah Terkait", type: "select", source: "areas" },
      { k: "status", l: "Status Rute", type: "select", options: STATUS_OPTIONS, colSpan: 2 },
    ],
  },
  "outlet-call-reasons": {
    label: "Alasan Outlet Call",
    icon: MessageSquare,
    endpoint: "/masters/outlet-call-reasons",
    description: "Daftar alasan kunjungan tanpa transaksi (toko tutup, stok penuh, dll.)",
    columns: [{ k: "reason", l: "Alasan Kunjungan Outlet Call" }, { k: "category", l: "Kategori" }, { k: "status", l: "Status", badge: true }],
    fields: [
      { k: "reason", l: "Deskripsi Alasan Kunjungan *", required: true, placeholder: "Contoh: Toko Tutup / Pemilik Sedang Keluar", colSpan: 2 },
      { k: "category", l: "Kategori Alasan", type: "select", options: ["OPERASIONAL", "STOK_PENUH", "FINANSIAL", "KOMPETITOR", "LAINNYA"] },
      { k: "status", l: "Status Alasan", type: "select", options: STATUS_OPTIONS },
    ],
  },
  targets: {
    label: "Target Sales",
    icon: Target,
    endpoint: "/targets",
    description: "Target kuota volume penjualan per salesman per periode",
    columns: [
      { k: "salesman_name", l: "Salesman" },
      { k: "sku_name", l: "SKU Produk" },
      { k: "period", l: "Periode" },
      { k: "target_volume", l: "Target Volume" },
      { k: "unit", l: "Satuan" },
      { k: "status", l: "Status", badge: true },
    ],
    fields: [
      { k: "salesman_id", l: "Tenaga Salesman *", type: "select", source: "salesmen", valueKey: "user_id", required: true, colSpan: 2 },
      { k: "sku_id", l: "SKU Produk Terkait (Opsional)", type: "select", source: "skus", colSpan: 2 },
      { k: "period", l: "Periode Target (YYYY-MM) *", required: true, placeholder: "2026-08" },
      { k: "target_volume", l: "Target Volume Penjualan *", type: "number", required: true, placeholder: "100" },
      { k: "unit", l: "Satuan (CTN / BKS / PCS) *", required: true, placeholder: "BKS / CTN" },
      { k: "status", l: "Status Target", type: "select", options: STATUS_OPTIONS },
      { k: "notes", l: "Catatan Tambahan", placeholder: "Catatan target bulanan", colSpan: 2 },
    ],
  },
  outlets: {
    label: "Master Outlet",
    icon: Store,
    endpoint: "/outlets",
    description: "Data toko pelanggan, titik GPS koordinat, dan pemilik",
    columns: [
      { k: "outlet_code", l: "Kode" }, { k: "outlet_name", l: "Nama Outlet" }, { k: "owner_name", l: "Pemilik" },
      { k: "area_name", l: "Area" }, { k: "channel_name", l: "Channel" }, { k: "assigned_sales_name", l: "Sales Penugasan" },
      { k: "completed_transaction_count", l: "Tx Selesai" },
      { k: "lifecycle_status", l: "Status Lifecycle", badge: true },
      { k: "status", l: "Status Operasional", badge: true },
    ],
    fields: [
      { k: "outlet_name", l: "Nama Outlet Toko", required: true }, { k: "owner_name", l: "Nama Pemilik" },
      { k: "phone", l: "Nomor Telepon / WhatsApp" }, { k: "address", l: "Alamat Lengkap", required: true },
      { k: "area_id", l: "Area Wilayah", type: "select", source: "areas", required: true },
      { k: "channel_id", l: "Channel Outlet", type: "select", source: "channels", required: true },
      { k: "latitude", l: "Latitude GPS", type: "number", required: true }, { k: "longitude", l: "Longitude GPS", type: "number", required: true },
      { k: "status", l: "Status Operasional", type: "select", options: STATUS_OPTIONS },
    ],
  },
};

const SELECT_SOURCES = {
  areas: "/masters/areas",
  districts: "/masters/districts",
  products: "/masters/products",
  skus: "/masters/skus",
  channels: "/masters/channels",
  salesmen: "/masters/salesmen",
  offices: "/offices",
  outlets: "/outlets",
};

export default function MasterDataPage() {
  const { user } = useAuth();
  const isAdminOrOwner = user?.role === "ADMIN" || user?.role === "OWNER";
  const [params, setParams] = useSearchParams();
  const [downloading, setDownloading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showWilayahModal, setShowWilayahModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const tab = params.get("tab") || "users";

  const currentEntity = ENTITIES[tab] || ENTITIES.users;
  const IconComponent = currentEntity.icon;

  const handleDownloadDatabase = async () => {
    if (!isAdminOrOwner) {
      toast.error("Hanya Administrator & Owner yang berwenang mendownload seluruh database.");
      return;
    }
    setDownloading(true);
    try {
      const res = await api.get("/system/export-db", { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute("download", `mahameru-dms-database-backup-${dateStr}.json`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Snapshot seluruh database berhasil didownload!");
    } catch (err) {
      toast.error("Gagal mendownload database: " + errMsg(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="master-data-page">
      {/* Header Panel */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-navy/5 text-navy rounded-xl border border-navy/10 shrink-0">
              <IconComponent size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-lg sm:text-xl font-bold text-navy">
                  Master Data Management
                </h1>
                <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
                  {currentEntity.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentEntity.description || "Manajemen referensi data organisasi, produk, harga, channel, dan master operasional."}
              </p>
            </div>
          </div>

          {isAdminOrOwner && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Button
                onClick={() => setShowWilayahModal(true)}
                variant="outline"
                size="sm"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 shadow-2xs font-semibold shrink-0"
                title="Kelola & Import Standar Master Wilayah Indonesia (Provinsi, Kab/Kota, Kecamatan, Kelurahan)"
              >
                <Globe size={15} className="mr-1.5 text-indigo-600" />
                Master Wilayah Nasional
              </Button>

              <Button
                onClick={() => handleDownloadDatabase()}
                disabled={downloading}
                variant="outline"
                size="sm"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 shadow-2xs font-semibold shrink-0"
                title="Download seluruh data & koleksi database dalam format JSON"
              >
                {downloading ? (
                  <Loader2 size={15} className="mr-1.5 animate-spin text-emerald-600" />
                ) : (
                  <Download size={15} className="mr-1.5 text-emerald-600" />
                )}
                {downloading ? "Mendownload..." : "Download Database"}
              </Button>

              <Button
                onClick={() => setShowUploadModal(true)}
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800 shadow-2xs font-semibold shrink-0"
                title="Upload file JSON snapshot database untuk memulihkan / memperbarui data"
              >
                <Upload size={15} className="mr-1.5 text-blue-600" />
                Upload Database
              </Button>
            </div>
          )}
        </div>

        {/* Master Navigation Bar */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
            <div className="overflow-x-auto pb-1">
              <TabsList className="inline-flex h-auto p-1 bg-slate-100/80 rounded-xl gap-1 border border-slate-200/80">
                {Object.entries(ENTITIES).map(([k, e]) => {
                  const ItemIcon = e.icon;
                  return (
                    <TabsTrigger
                      key={k}
                      value={k}
                      data-testid={`master-tab-${k}`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-navy data-[state=active]:shadow-xs flex items-center gap-1.5 transition-all"
                    >
                      <ItemIcon size={13} className="shrink-0" />
                      <span>{e.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {Object.entries(ENTITIES).map(([k, e]) => (
              <TabsContent key={k} value={k} className="mt-3 focus-visible:outline-hidden">
                <MasterTab key={`${k}-${refreshKey}`} entityKey={k} config={e} active={tab === k} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>

      {/* Upload Database Modal */}
      <UploadDatabaseModal
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      {/* Master Wilayah Modal */}
      <MasterWilayahImportModal
        open={showWilayahModal}
        onOpenChange={setShowWilayahModal}
        onImportSuccess={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

function MasterTab({ entityKey, config, active }) {
  const { user } = useAuth();
  const canDelete = user?.role === "ADMIN" || user?.role === "OWNER";
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [options, setOptions] = useState({});
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const loadOptions = useCallback(async () => {
    const needed = [...new Set(config.fields.filter((f) => f.source).map((f) => f.source))];
    const extra = {};
    await Promise.all(
      needed.map(async (src) => {
        try {
          const { data } = await api.get(SELECT_SOURCES[src], {
            params: { limit: 500, status: src === "offices" ? undefined : "ACTIVE" },
          });
          extra[src] = data.items;
        } catch {
          extra[src] = [];
        }
      })
    );
    setOptions(extra);
  }, [config]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { q, page, limit: 20 };
      if (statusFilter !== "ALL") {
        params.status = statusFilter;
      }
      const { data } = await api.get(config.endpoint, { params });
      const raw = Array.isArray(data.items) ? data.items : [];
      const seen = new Set();
      const deduped = raw.filter((item) => {
        if (!item._id) return true;
        if (seen.has(item._id)) return false;
        seen.add(item._id);
        return true;
      });
      setItems(deduped);
      setTotal(data.total || deduped.length);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
  }, [config, q, page, statusFilter]);

  useEffect(() => {
    if (active) {
      load();
      loadOptions();
    }
  }, [active, load, loadOptions]);

  const lookupMaps = useMemo(() => {
    const maps = {};
    for (const [src, itms] of Object.entries(options)) {
      maps[src] = Object.fromEntries((itms || []).map((i) => [i._id, i]));
    }
    return maps;
  }, [options]);

  const displayVal = (col, item) => {
    if (col.badge) return <StatusBadge status={item[col.k]} />;
    if (col.money) return `Rp ${(item[col.k] || 0).toLocaleString("id-ID")}`;
    if (col.k.endsWith("_id")) return item[col.k] || "-";
    return item[col.k] ?? "-";
  };

  const enriched = items.map((item) => {
    const out = { ...item };
    for (const [src, map] of Object.entries(lookupMaps)) {
      const idKey = src === "offices" ? "office_id" : `${src.replace(/s$/, "")}_id`;
      if (item[idKey] && map[item[idKey]]) {
        out[`${src.replace(/s$/, "")}_name`] = map[item[idKey]].name || map[item[idKey]].office_name;
      }
    }
    if (entityKey === "targets" && item.salesman_id) {
      const sm = (options.salesmen || []).find((s) => s.user_id === item.salesman_id);
      out.salesman_name = sm?.name || item.salesman_id;
    }
    return out;
  });

  const handleToggleStatus = async (item) => {
    if (!canDelete) {
      toast.error("Hanya Admin dan Owner yang berwenang mengubah status.");
      return;
    }
    setTogglingId(item._id);
    try {
      const toggleUrl = `${config.endpoint}/${item._id}/toggle`;
      const { data } = await api.post(toggleUrl);
      const newStatus = data.status || (item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
      toast.success(`Status berhasil diubah menjadi ${newStatus}`);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setTogglingId(null);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmItem) return;
    setDeleting(true);
    try {
      const base =
        entityKey === "outlets"
          ? "/outlets"
          : entityKey === "users"
          ? "/users"
          : entityKey === "targets"
          ? "/targets"
          : entityKey === "sales_outlets"
          ? "/sales-outlets"
          : config.endpoint;
      await api.delete(`${base}/${deleteConfirmItem._id}`);
      toast.success("Data berhasil dihapus dari sistem.");
      setDeleteConfirmItem(null);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setDeleting(false);
  };

  return (
    <div className="space-y-3">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Input
              data-testid={`${entityKey}-search`}
              placeholder={`Cari data ${config.label.toLowerCase()}...`}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              leftIcon={<Search size={15} />}
              className="bg-slate-50/50"
            />
          </div>

          <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
            <SelectTrigger className="w-[140px] shrink-0 text-xs bg-slate-50/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="ACTIVE">ACTIVE</SelectItem>
              <SelectItem value="INACTIVE">INACTIVE</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="icon"
            variant="outline"
            onClick={() => load()}
            disabled={loading}
            title="Muat ulang data"
            className="h-10 w-10 shrink-0 border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>

        <Button
          data-testid={`${entityKey}-create-button`}
          onClick={() => {
            setEditItem(null);
            setFormOpen(true);
          }}
          className="bg-navy hover:bg-navy/90 text-white font-bold shrink-0 shadow-xs"
        >
          <Plus size={16} className="mr-1.5 stroke-[2.5]" /> Tambah {config.label}
        </Button>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="animate-spin text-navy" size={24} />
            <span className="text-xs font-medium">Memuat data {config.label.toLowerCase()}...</span>
          </div>
        ) : enriched.length === 0 ? (
          <div className="text-center py-16 px-4" data-testid={`${entityKey}-empty`}>
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Search size={20} />
            </div>
            <p className="text-sm font-bold text-slate-700">Tidak ada data ditemukan</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              {q ? `Pencarian "${q}" tidak menemukan hasil pada master ${config.label.toLowerCase()}.` : `Belum ada entri master ${config.label.toLowerCase()} yang terdaftar.`}
            </p>
            <Button
              onClick={() => { setEditItem(null); setFormOpen(true); }}
              variant="outline"
              size="sm"
              className="mt-4 border-navy/20 text-navy hover:bg-navy/5 font-semibold text-xs rounded-xl"
            >
              <Plus size={14} className="mr-1" /> Tambah Baru
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80">
                  {config.columns.map((c) => (
                    <TableHead key={c.k} className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-3">
                      {c.l}
                    </TableHead>
                  ))}
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right py-3 pr-4">
                    Aksi
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enriched.map((item, i) => (
                  <TableRow
                    key={item._id ? `${item._id}-${i}` : `row-${i}`}
                    data-testid={`${entityKey}-row-${i}`}
                    className="hover:bg-slate-50/60 transition-colors border-b border-slate-100"
                  >
                    {config.columns.map((c) => (
                      <TableCell key={c.k} className="text-xs font-medium py-3 text-slate-700">
                        {displayVal(c, item)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right py-3 pr-4">
                      <div className="flex justify-end items-center gap-1">
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`${entityKey}-toggle-${i}`}
                            onClick={() => handleToggleStatus(item)}
                            disabled={togglingId === item._id}
                            className={`h-8 w-8 rounded-lg ${
                              item.status === "ACTIVE"
                                ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            }`}
                            title={
                              item.status === "ACTIVE"
                                ? "Nonaktifkan Data (Jadikan INACTIVE)"
                                : "Aktifkan Data (Jadikan ACTIVE)"
                            }
                          >
                            {togglingId === item._id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Power size={14} />
                            )}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          data-testid={`${entityKey}-edit-${i}`}
                          onClick={() => {
                            setEditItem(item);
                            setFormOpen(true);
                          }}
                          title="Edit Data"
                          className="h-8 w-8 rounded-lg text-slate-600 hover:text-navy hover:bg-slate-100"
                        >
                          <Pencil size={14} />
                        </Button>
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`${entityKey}-delete-${i}`}
                            onClick={() => setDeleteConfirmItem(item)}
                            className="h-8 w-8 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            title="Hapus Data"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination & Summary */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 px-1">
        <span>
          Menampilkan <span className="font-semibold text-slate-700">{enriched.length}</span> dari{" "}
          <span className="font-semibold text-slate-700">{total}</span> data
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            data-testid={`${entityKey}-prev`}
            className="text-xs h-8 rounded-lg"
          >
            Sebelumnya
          </Button>
          <span className="px-2 text-slate-600 font-semibold">Hal {page}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            data-testid={`${entityKey}-next`}
            className="text-xs h-8 rounded-lg"
          >
            Berikutnya
          </Button>
        </div>
      </div>

      {/* Entity Add / Edit Modal */}
      <EntityFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        config={config}
        entityKey={entityKey}
        item={editItem}
        options={options}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      {/* In-App Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmItem} onOpenChange={(open) => !open && setDeleteConfirmItem(null)}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600 flex items-center gap-2">
              <AlertTriangle size={18} />
              Konfirmasi Hapus Data Master
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus data{" "}
              <b>
                {deleteConfirmItem?.name ||
                  deleteConfirmItem?.outlet_name ||
                  deleteConfirmItem?.sku_name ||
                  deleteConfirmItem?.reason ||
                  deleteConfirmItem?.code ||
                  deleteConfirmItem?.email ||
                  "ini"}
              </b>
              ? Tindakan ini akan menghapus data dari basis data relasional Cloud SQL dan Firestore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmItem(null)}
              disabled={deleting}
              className="rounded-xl text-xs"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => confirmDelete()}
              disabled={deleting}
              className="rounded-xl text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {deleting ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <Trash2 size={14} className="mr-1.5" />}
              Hapus Permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntityFormDialog({ open, onClose, config, entityKey, item, options, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const init = {};
      for (const f of config.fields) {
        init[f.k] = item?.[f.k] ?? (f.k === "status" ? "ACTIVE" : "");
      }
      setForm(init);
    }
  }, [open, item, config]);

  const submit = async () => {
    for (const f of config.fields) {
      if (f.required && !item && !form[f.k]) {
        toast.error(`${f.l} wajib diisi`);
        return;
      }
    }
    setBusy(true);
    try {
      const payload = {};
      for (const f of config.fields) {
        let v = form[f.k];
        if (v === "" || v === undefined) continue;
        if (item && f.hideOnEdit) continue;
        if (f.type === "number") v = Number(v);
        payload[f.k] = v;
      }
      if (item) {
        await api.put(`${config.endpoint}/${item._id}`, payload);
        toast.success(`Data ${config.label} berhasil diperbarui`);
      } else {
        await api.post(config.endpoint, payload);
        toast.success(`Data ${config.label} berhasil ditambahkan`);
      }
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid={`${entityKey}-form-dialog`} className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-bold text-navy flex items-center gap-2">
            <span>{item ? "Perbarui" : "Tambah"} Master {config.label}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Pastikan data yang dimasukkan valid dan tersimpan langsung ke database PostgreSQL.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
          {config.fields.map((f) => {
            if (item && f.hideOnEdit) return null;
            const spanClass = f.colSpan === 2 ? "sm:col-span-2" : "sm:col-span-1";
            return (
              <div key={f.k} className={`space-y-1.5 ${spanClass}`}>
                <Label className="text-xs font-bold text-slate-700">
                  {item && f.editLabel ? f.editLabel : f.l}
                </Label>
                {f.type === "select" ? (
                  <Select
                    value={form[f.k] || (f.k === "status" ? "ACTIVE" : "")}
                    onValueChange={(v) => setForm((s) => ({ ...s, [f.k]: v }))}
                  >
                    <SelectTrigger data-testid={`form-${f.k}`} className="w-full h-10 rounded-xl text-xs bg-white">
                      <SelectValue placeholder={`Pilih ${f.l.replace(" *", "")}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options
                        ? f.options.map((o) => (
                            <SelectItem key={o} value={o} className="text-xs">
                              {o}
                            </SelectItem>
                          ))
                        : (options[f.source] || []).map((o) => {
                            const val = f.valueKey ? o[f.valueKey] || o._id : o._id;
                            let display =
                              o[f.labelKey || "name"] || o.office_name || o.outlet_name || o.reason || val;
                            if (f.source === "outlets" && o.outlet_code) {
                              display = `[${o.outlet_code}] ${o.outlet_name || display}`;
                            } else if (f.source === "salesmen" && o.code) {
                              display = `${o.name || display} (${o.code})`;
                            }
                            return (
                              <SelectItem key={o._id || val} value={val} className="text-xs">
                                {display}
                              </SelectItem>
                            );
                          })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    data-testid={`form-${f.k}`}
                    type={f.type || "text"}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    step={f.type === "number" ? (f.step || "any") : undefined}
                    value={form[f.k] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.k]: e.target.value }))}
                    placeholder={f.placeholder || `Masukkan ${f.l.toLowerCase().replace(" *", "")}...`}
                    className="h-10 rounded-xl text-xs bg-white"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onClose()}
            disabled={busy}
            className="text-xs rounded-xl"
          >
            Batal
          </Button>
          <Button
            data-testid={`${entityKey}-form-submit`}
            disabled={busy}
            onClick={() => submit()}
            className="bg-navy hover:bg-navy/90 text-white font-bold text-xs rounded-xl px-5"
          >
            {busy ? <Loader2 className="animate-spin mr-1.5" size={15} /> : null}
            {item ? "Simpan Perubahan" : "Simpan Data Baru"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
