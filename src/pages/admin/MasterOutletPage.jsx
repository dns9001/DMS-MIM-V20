import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Store, Search, Plus, RefreshCw, Filter, Download, ExternalLink,
  MapPin, Phone, User, Calendar, ShoppingBag, Eye, Pencil, Trash2,
  CheckCircle2, AlertTriangle, Clock, ArrowUpDown, ChevronRight,
  TrendingUp, ShieldAlert, Sparkles, Building, Layers, Info, X, Globe, Power, Loader2,
  UserCheck, Activity, Users, CheckSquare, Square, ArrowRightLeft, UserPlus, ListChecks
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import LifecycleBadge, { LIFECYCLE_DETAILS } from "../../components/LifecycleBadge";
import StatusBadge from "../../components/StatusBadge";
import RegionSelectGroup from "../../components/admin/RegionSelectGroup";
import MasterWilayahImportModal from "../../components/admin/MasterWilayahImportModal";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import MapView from "../../components/MapView";

export default function MasterOutletPage() {
  const { user } = useAuth();
  const canDelete = user?.role === "ADMIN" || user?.role === "OWNER";
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [items, setItems] = useState([]);
  const [viewMode, setViewMode] = useState("table"); // "table" | "map"
  const [summary, setSummary] = useState({
    total_outlets: 0,
    prospect_count: 0,
    noo_count: 0,
    repeat_count: 0,
    active_count: 0,
    dormant_count: 0,
    inactive_count: 0,
  });

  // Masters for filters and forms
  const [areas, setAreas] = useState([]);
  const [channels, setChannels] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLifecycle, setSelectedLifecycle] = useState("ALL");
  const [selectedArea, setSelectedArea] = useState("ALL");
  const [selectedProvince, setSelectedProvince] = useState("ALL");
  const [selectedRegency, setSelectedRegency] = useState("ALL");
  const [selectedChannel, setSelectedChannel] = useState("ALL");
  const [selectedSalesman, setSelectedSalesman] = useState("ALL");
  const [selectedOpStatus, setSelectedOpStatus] = useState("ALL");
  const [selectedAssignmentStatus, setSelectedAssignmentStatus] = useState("ALL"); // "ALL" | "ASSIGNED" | "UNASSIGNED"

  // Penugasan & Reassignment States
  const [selectedOutletIds, setSelectedOutletIds] = useState(new Set());
  const [reassignModalOutlet, setReassignModalOutlet] = useState(null);
  const [reassignForm, setReassignForm] = useState({
    new_sales_id: "",
    reason: "Reorganisasi Wilayah",
    notes: "",
  });
  const [reassignLoading, setReassignLoading] = useState(false);

  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignForm, setBulkAssignForm] = useState({
    sales_id: "",
    notes: "Penugasan Massal Salesman",
  });
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);

  // Selected Outlet for Detail
  const [detailOutletId, setDetailOutletId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Master Wilayah Modal
  const [wilayahModalOpen, setWilayahModalOpen] = useState(false);

  // Add / Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteConfirmOutlet, setDeleteConfirmOutlet] = useState(null);
  const [deletingOutlet, setDeletingOutlet] = useState(false);
  const [togglingOutletId, setTogglingOutletId] = useState(null);
  const [formData, setFormData] = useState({
    outlet_name: "",
    outlet_code: "",
    owner_name: "",
    phone: "",
    address: "",
    street_address: "",
    address_line: "",
    province_id: "",
    province_name: "",
    regency_id: "",
    regency_name: "",
    district_id: "",
    district_name: "",
    village_id: "",
    village_name: "",
    postal_code: "",
    latitude: -6.8172,
    longitude: 107.1428,
    area_id: "",
    channel_id: "",
    route_id: "",
    assigned_sales_id: "",
    credit_limit: 0,
    payment_term_days: 0,
    status: "ACTIVE",
  });
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Business Rules Info Dialog
  const [rulesOpen, setRulesOpen] = useState(false);

  // Fetch Masters
  const fetchMasters = useCallback(async () => {
    try {
      const [resAreas, resChannels, resSalesmen, resRoutes, resProv] = await Promise.all([
        api.get("/masters/areas"),
        api.get("/masters/channels"),
        api.get("/masters/salesmen"),
        api.get("/masters/routes"),
        api.get("/regions/provinces"),
      ]);
      setAreas(resAreas.data.items || resAreas.data || []);
      setChannels(resChannels.data.items || resChannels.data || []);
      setSalesmen(resSalesmen.data.items || resSalesmen.data || []);
      setRoutes(resRoutes.data.items || resRoutes.data || []);
      setProvinces(resProv.data.items || resProv.data || []);
    } catch (e) {
      console.error("Gagal memuat master pendukung:", e);
    }
  }, []);

  // Fetch Regencies when filter province changes
  useEffect(() => {
    if (selectedProvince && selectedProvince !== "ALL") {
      api.get("/regions/regencies", { params: { province_id: selectedProvince } })
        .then((res) => setRegencies(res.data.items || res.data || []))
        .catch(() => setRegencies([]));
    } else {
      setRegencies([]);
      setSelectedRegency("ALL");
    }
  }, [selectedProvince]);

  // Fetch Outlets
  const fetchOutlets = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery) params.q = searchQuery;
      if (selectedLifecycle !== "ALL") params.lifecycle_status = selectedLifecycle;
      if (selectedArea !== "ALL") params.area_id = selectedArea;
      if (selectedProvince !== "ALL") params.province_id = selectedProvince;
      if (selectedRegency !== "ALL") params.regency_id = selectedRegency;
      if (selectedChannel !== "ALL") params.channel_id = selectedChannel;
      if (selectedSalesman !== "ALL") params.salesman_id = selectedSalesman;
      if (selectedOpStatus !== "ALL") params.status = selectedOpStatus;

      const { data } = await api.get("/outlets", { params });
      setItems(data.items || []);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedLifecycle, selectedArea, selectedProvince, selectedRegency, selectedChannel, selectedSalesman, selectedOpStatus]);

  useEffect(() => {
    fetchMasters();
  }, [fetchMasters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOutlets();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchOutlets]);

  // Recalculate All Statuses
  const handleRecalculateAll = async () => {
    setRecalculating(true);
    try {
      const { data } = await api.post("/outlets/recalculate-all");
      toast.success(data.message || "Seluruh status lifecycle outlet berhasil diperbarui!");
      await fetchOutlets();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRecalculating(false);
    }
  };

  // Open Detail
  const handleOpenDetail = async (outletId) => {
    setDetailOutletId(outletId);
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/outlets/${outletId}`);
      setDetailData(data);
    } catch (e) {
      toast.error(errMsg(e));
      setDetailOutletId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Recalculate Single Outlet
  const handleRecalculateSingle = async (outletId) => {
    try {
      const { data } = await api.post(`/outlets/${outletId}/recalculate`);
      toast.success(`Status ${data.outlet?.outlet_name} diperbarui: ${data.summary?.lifecycle_status}`);
      if (detailOutletId === outletId) {
        handleOpenDetail(outletId);
      }
      fetchOutlets();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  // Filtered displayed items based on assignment status filter
  const displayedItems = useMemo(() => {
    if (selectedAssignmentStatus === "ASSIGNED") {
      return items.filter((o) => o.assigned_sales_id || (o.assigned_sales_name && o.assigned_sales_name !== "-"));
    }
    if (selectedAssignmentStatus === "UNASSIGNED") {
      return items.filter((o) => !o.assigned_sales_id && (!o.assigned_sales_name || o.assigned_sales_name === "-"));
    }
    return items;
  }, [items, selectedAssignmentStatus]);

  // Penugasan Handlers
  const handleOpenReassign = (outlet) => {
    setReassignModalOutlet(outlet);
    setReassignForm({
      new_sales_id: outlet.assigned_sales_id || "",
      reason: "Reorganisasi Wilayah",
      notes: "",
    });
  };

  const handleSaveReassign = async (e) => {
    e.preventDefault();
    if (!reassignModalOutlet || !reassignForm.new_sales_id) {
      toast.error("Silakan pilih sales penerima penugasan.");
      return;
    }
    setReassignLoading(true);
    try {
      const { data } = await api.post("/sales-outlets/reassign", {
        outlet_id: reassignModalOutlet._id,
        new_sales_id: reassignForm.new_sales_id,
        reason: reassignForm.reason,
        notes: reassignForm.notes,
      });
      toast.success(data.message || "Penugasan outlet berhasil diperbarui!");
      setReassignModalOutlet(null);
      await fetchOutlets();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setReassignLoading(false);
    }
  };

  const handleSaveBulkAssign = async (e) => {
    e.preventDefault();
    if (selectedOutletIds.size === 0) {
      toast.error("Silakan pilih minimal 1 outlet terlebih dahulu.");
      return;
    }
    if (!bulkAssignForm.sales_id) {
      toast.error("Silakan pilih sales tujuan penugasan.");
      return;
    }
    setBulkAssignLoading(true);
    try {
      const { data } = await api.post("/sales-outlets/bulk-assign", {
        sales_id: bulkAssignForm.sales_id,
        outlet_ids: Array.from(selectedOutletIds),
        notes: bulkAssignForm.notes,
      });
      toast.success(data.message || `${selectedOutletIds.size} outlet berhasil ditugaskan!`);
      setSelectedOutletIds(new Set());
      setBulkAssignOpen(false);
      await fetchOutlets();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBulkAssignLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedOutletIds.size === displayedItems.length && displayedItems.length > 0) {
      setSelectedOutletIds(new Set());
    } else {
      setSelectedOutletIds(new Set(displayedItems.map((o) => o._id)));
    }
  };

  const toggleSelectOutlet = (id) => {
    const next = new Set(selectedOutletIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedOutletIds(next);
  };

  // Outlet Map Markers
  const outletMarkers = useMemo(() => {
    return items
      .filter((o) => o && o.latitude && o.longitude && !isNaN(o.latitude) && !isNaN(o.longitude))
      .map((o) => {
        const isLoyal = o.lifecycle_status === "LOYAL";
        const isRepeat = o.lifecycle_status === "REPEAT";
        const isNoo = o.lifecycle_status === "NOO";
        const color = isLoyal ? "#10B981" : isRepeat ? "#3B82F6" : isNoo ? "#F59E0B" : "#64748B";

        return {
          id: `outlet-marker-${o._id}`,
          lat: Number(o.latitude),
          lng: Number(o.longitude),
          type: "OUTLET",
          title: o.outlet_name,
          subtitle: `Kode: ${o.outlet_code} · ${o.channel_name || "Retail"}`,
          outletCode: o.outlet_code,
          ownerName: o.owner_name,
          phone: o.phone,
          address: o.address || `${o.village_name ? `${o.village_name}, ` : ""}${o.district_name ? `${o.district_name}, ` : ""}${o.regency_name || ""}`,
          assignedSalesName: o.assigned_sales_name,
          lifecycleStatus: o.lifecycle_status || "PROSPECT",
          status: o.status || "ACTIVE",
          statusLabel: o.lifecycle_status || "PROSPECT",
          color: color,
          badge: o.outlet_code ? o.outlet_code.replace(/^OUT-/, "") : "OUT",
          completedTxCount: o.completed_transaction_count || 0,
          totalRevenue: o.total_revenue || 0,
          totalVolume: o.total_volume || 0,
          actionLabel: "Lihat Detail",
          onSelect: () => handleOpenDetail(o._id),
          googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${o.latitude},${o.longitude}`,
        };
      });
  }, [items]);

  const mapCenter = useMemo(() => {
    const valid = outletMarkers.find((m) => m.lat && m.lng);
    if (valid) return [valid.lat, valid.lng];
    return [-6.8172, 107.1428];
  }, [outletMarkers]);

  // Open Create Form
  const handleOpenCreate = () => {
    setEditItem(null);
    setFormData({
      outlet_name: "",
      outlet_code: "",
      owner_name: "",
      phone: "",
      address: "",
      street_address: "",
      address_line: "",
      province_id: provinces[0]?._id || "prov-32",
      province_name: provinces[0]?.name || "JAWA BARAT",
      regency_id: "reg-3203",
      regency_name: "KABUPATEN CIANJUR",
      district_id: "dist-320301",
      district_name: "CIANJUR",
      village_id: "vil-32030101",
      village_name: "PAMOYANAN",
      postal_code: "43211",
      latitude: -6.8172,
      longitude: 107.1428,
      area_id: areas[0]?._id || "area-1",
      channel_id: channels[0]?._id || "ch-1",
      route_id: routes[0]?._id || "rt-1",
      assigned_sales_id: salesmen[0]?.user_id || salesmen[0]?._id || "",
      credit_limit: 0,
      payment_term_days: 0,
      status: "ACTIVE",
    });
    setDuplicateWarning(null);
    setFormOpen(true);
  };

  // Open Edit Form
  const handleOpenEdit = async (outlet) => {
    setEditItem(outlet);
    
    let pId = outlet.province_id || "prov-32";
    let pName = outlet.province_name || "JAWA BARAT";
    let rId = outlet.regency_id || "reg-3203";
    let rName = outlet.regency_name || "KABUPATEN CIANJUR";
    let dId = outlet.district_id || "dist-320301";
    let dName = outlet.district_name || "CIANJUR";
    let vId = outlet.village_id || "vil-32030101";
    let vName = outlet.village_name || "PAMOYANAN";
    let post = outlet.postal_code || "43211";
    let street = outlet.address_line || outlet.address || "";

    if (outlet.village_id) {
      try {
        const { data } = await api.get(`/regions/hierarchy/${outlet.village_id}`);
        if (data.hierarchy) {
          pId = data.hierarchy.province_id;
          pName = data.hierarchy.province_name;
          rId = data.hierarchy.regency_id;
          rName = data.hierarchy.regency_name;
          dId = data.hierarchy.district_id;
          dName = data.hierarchy.district_name;
          vId = data.hierarchy.village_id;
          vName = data.hierarchy.village_name;
          post = data.hierarchy.postal_code || post;
        }
      } catch (e) {
        console.warn("Could not fetch hierarchy:", e);
      }
    }

    setFormData({
      outlet_name: outlet.outlet_name || "",
      outlet_code: outlet.outlet_code || "",
      owner_name: outlet.owner_name || "",
      phone: outlet.phone || "",
      address: outlet.address || "",
      street_address: street,
      address_line: street,
      province_id: pId,
      province_name: pName,
      regency_id: rId,
      regency_name: rName,
      district_id: dId,
      district_name: dName,
      village_id: vId,
      village_name: vName,
      postal_code: post,
      latitude: outlet.latitude || -6.8172,
      longitude: outlet.longitude || 107.1428,
      area_id: outlet.area_id || "",
      channel_id: outlet.channel_id || "",
      route_id: outlet.route_id || "",
      assigned_sales_id: outlet.assigned_sales_id || "",
      credit_limit: outlet.credit_limit || 0,
      payment_term_days: outlet.payment_term_days || 0,
      status: outlet.status || "ACTIVE",
    });
    setDuplicateWarning(null);
    setFormOpen(true);
  };

  // Handle Region Change from RegionSelectGroup
  const handleRegionChange = (regionData) => {
    setFormData((prev) => ({
      ...prev,
      ...regionData,
      street_address: regionData.street_address,
      address_line: regionData.street_address,
      address: regionData.full_address || regionData.street_address || prev.address,
    }));
  };

  // GPS Auto-detect
  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      toast.error("Browser tidak mendukung geolokasi.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        toast.success("Koordinat GPS berhasil diperoleh!");
        setGpsLoading(false);
      },
      (err) => {
        toast.error(`Gagal mendapatkan GPS: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Submit Form
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.outlet_name.trim()) {
      toast.error("Nama outlet wajib diisi.");
      return;
    }
    if (!formData.province_id || !formData.regency_id || !formData.district_id || !formData.village_id) {
      toast.error("Struktur wilayah administratif (Provinsi, Kab/Kota, Kecamatan, Kelurahan/Desa) wajib dipilih lengkap dari Master Data.");
      return;
    }

    try {
      // Validate administrative region hierarchy
      await api.post("/regions/validate", {
        province_id: formData.province_id,
        regency_id: formData.regency_id,
        district_id: formData.district_id,
        village_id: formData.village_id,
      });

      if (editItem) {
        await api.put(`/outlets/${editItem._id}`, formData);
        toast.success("Data outlet dan master wilayah berhasil diperbarui!");
      } else {
        await api.post("/outlets", formData);
        toast.success("Outlet baru berhasil didaftarkan dengan master wilayah resmi!");
      }
      setFormOpen(false);
      fetchOutlets();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  // Toggle Outlet Operational Status
  const handleToggleOutletStatus = async (outlet) => {
    if (!canDelete) {
      toast.error("Hanya Admin, Supervisor, dan Owner yang berwenang mengubah status outlet.");
      return;
    }
    setTogglingOutletId(outlet._id);
    try {
      const { data } = await api.post(`/outlets/${outlet._id}/toggle`);
      const newStatus = data.status || (outlet.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
      toast.success(`Status operasional outlet "${outlet.outlet_name}" berhasil diubah menjadi ${newStatus}.`);
      if (detailOutletId === outlet._id) {
        setDetailData((prev) => (prev ? { ...prev, status: newStatus } : prev));
      }
      fetchOutlets();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setTogglingOutletId(null);
    }
  };

  // Archive / Delete Outlet confirmation trigger
  const handleDeleteOutlet = (outlet) => {
    if (!canDelete) {
      toast.error("Hanya Admin dan Owner yang memiliki akses menghapus outlet.");
      return;
    }
    setDeleteConfirmOutlet(outlet);
  };

  // Confirm delete execution
  const confirmDeleteOutlet = async () => {
    if (!deleteConfirmOutlet) return;
    setDeletingOutlet(true);
    try {
      const { data } = await api.delete(`/outlets/${deleteConfirmOutlet._id}`);
      toast.success(data.message || "Outlet berhasil dihapus.");
      if (detailOutletId === deleteConfirmOutlet._id) setDetailOutletId(null);
      setDeleteConfirmOutlet(null);
      fetchOutlets();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDeletingOutlet(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!items.length) {
      toast.error("Tidak ada data untuk diexport.");
      return;
    }
    const headers = [
      "Kode Outlet",
      "Nama Outlet",
      "Pemilik",
      "Telepon",
      "Alamat",
      "Area",
      "Channel",
      "Salesman Ditugaskan",
      "Status Lifecycle",
      "Total Transaksi Selesai",
      "Transaksi Terakhir",
      "Hari Sejak Tx Terakhir",
      "Total Omset (Rp)",
      "Status Operasional",
    ];

    const rows = items.map((o) => [
      `"${o.outlet_code}"`,
      `"${o.outlet_name.replace(/"/g, '""')}"`,
      `"${(o.owner_name || "").replace(/"/g, '""')}"`,
      `"${o.phone || ""}"`,
      `"${(o.address || "").replace(/"/g, '""')}"`,
      `"${o.area_name || ""}"`,
      `"${o.channel_name || ""}"`,
      `"${o.assigned_sales_name || ""}"`,
      `"${o.lifecycle_status || "PROSPECT"}"`,
      o.completed_transaction_count || 0,
      `"${o.last_completed_transaction_at ? o.last_completed_transaction_at.slice(0, 10) : "-"}"`,
      o.days_since_last_transaction !== null ? o.days_since_last_transaction : "-",
      o.total_revenue || 0,
      `"${o.status}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Master_Outlet_Mahameru_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export data CSV berhasil!");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="master-outlet-page">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-navy text-gold flex items-center justify-center shadow-xs shrink-0">
            <Store size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-xl md:text-2xl font-bold text-navy tracking-tight">
                Master Outlet & Lifecycle
              </h1>
              <span className="bg-gold/15 text-navy text-[11px] font-bold px-2 py-0.5 rounded-full border border-gold/40">
                Automated
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Manajemen master data toko, otomatisasi status transaksi (NOO, Repeat, Active, Dormant), serta kepemilikan area.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkAssignOpen(true)}
            data-testid="btn-bulk-assign-header"
            className="rounded-xl border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100/80 text-xs font-semibold gap-1.5 h-9"
          >
            <UserCheck size={15} className="text-blue-600" />
            Penugasan Massal
            {selectedOutletIds.size > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-blue-600 text-white rounded-full text-[10px] font-bold">
                {selectedOutletIds.size}
              </span>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setWilayahModalOpen(true)}
            data-testid="btn-open-wilayah-master"
            className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold gap-1.5 h-9 bg-gold/5 border-gold/30 hover:bg-gold/10"
          >
            <Globe size={15} className="text-gold" />
            Master Wilayah (CSV)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setRulesOpen(true)}
            data-testid="btn-rules-info"
            className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold gap-1.5 h-9"
          >
            <Info size={15} className="text-navy" />
            Aturan Status
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRecalculateAll()}
            disabled={recalculating}
            data-testid="btn-recalculate-all"
            className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold gap-1.5 h-9"
          >
            <RefreshCw size={14} className={recalculating ? "animate-spin text-navy" : "text-slate-500"} />
            Hitung Ulang Status
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportCSV()}
            data-testid="btn-export-csv"
            className="rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold gap-1.5 h-9"
          >
            <Download size={14} className="text-slate-500" />
            Export CSV
          </Button>

          <Button
            onClick={() => handleOpenCreate()}
            data-testid="btn-add-outlet"
            className="bg-navy hover:bg-navy-light text-white rounded-xl text-xs font-bold gap-1.5 h-9 shadow-xs"
          >
            <Plus size={16} />
            Tambah Outlet
          </Button>
        </div>
      </div>

      {/* KPI Cards (Interactive Lifecycle Filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* All Outlets Card */}
        <button
          onClick={() => setSelectedLifecycle("ALL")}
          data-testid="kpi-card-all"
          className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
            selectedLifecycle === "ALL"
              ? "bg-navy text-white border-navy shadow-md ring-2 ring-navy/20"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-slate-300 hover:shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${selectedLifecycle === "ALL" ? "text-slate-300" : "text-slate-500"}`}>
              Total Outlet
            </span>
            <Store size={16} className={selectedLifecycle === "ALL" ? "text-gold" : "text-slate-400"} />
          </div>
          <div className="text-2xl font-heading font-bold mt-2">{summary.total_outlets}</div>
          <div className={`text-[10px] mt-1 truncate ${selectedLifecycle === "ALL" ? "text-slate-300" : "text-slate-400"}`}>
            Semua toko terdaftar
          </div>
        </button>

        {/* Prospect Card */}
        <button
          onClick={() => setSelectedLifecycle("PROSPECT")}
          data-testid="kpi-card-prospect"
          className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
            selectedLifecycle === "PROSPECT"
              ? "bg-slate-800 text-white border-slate-800 shadow-md ring-2 ring-slate-400/30"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-slate-300 hover:shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${selectedLifecycle === "PROSPECT" ? "text-slate-200" : "text-slate-600"}`}>
              Prospect
            </span>
            <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
          </div>
          <div className="text-2xl font-heading font-bold mt-2 text-slate-700">
            {summary.prospect_count}
          </div>
          <div className={`text-[10px] mt-1 truncate ${selectedLifecycle === "PROSPECT" ? "text-slate-200" : "text-slate-500"}`}>
            0 Transaksi Selesai
          </div>
        </button>

        {/* NOO Card */}
        <button
          onClick={() => setSelectedLifecycle("NOO")}
          data-testid="kpi-card-noo"
          className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
            selectedLifecycle === "NOO"
              ? "bg-blue-700 text-white border-blue-700 shadow-md ring-2 ring-blue-400/30"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-blue-200 hover:shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${selectedLifecycle === "NOO" ? "text-blue-100" : "text-blue-700"}`}>
              NOO
            </span>
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          </div>
          <div className="text-2xl font-heading font-bold mt-2 text-blue-700">
            {summary.noo_count}
          </div>
          <div className={`text-[10px] mt-1 truncate ${selectedLifecycle === "NOO" ? "text-blue-100" : "text-slate-500"}`}>
            1x Transaksi Selesai
          </div>
        </button>

        {/* Repeat Card */}
        <button
          onClick={() => setSelectedLifecycle("REPEAT")}
          data-testid="kpi-card-repeat"
          className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
            selectedLifecycle === "REPEAT"
              ? "bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-400/30"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-amber-200 hover:shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${selectedLifecycle === "REPEAT" ? "text-amber-100" : "text-amber-700"}`}>
              Repeat
            </span>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          </div>
          <div className="text-2xl font-heading font-bold mt-2 text-amber-700">
            {summary.repeat_count}
          </div>
          <div className={`text-[10px] mt-1 truncate ${selectedLifecycle === "REPEAT" ? "text-amber-100" : "text-slate-500"}`}>
            2x Transaksi Selesai
          </div>
        </button>

        {/* Active Card */}
        <button
          onClick={() => setSelectedLifecycle("ACTIVE")}
          data-testid="kpi-card-active"
          className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
            selectedLifecycle === "ACTIVE"
              ? "bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-400/30"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-emerald-200 hover:shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${selectedLifecycle === "ACTIVE" ? "text-emerald-100" : "text-emerald-700"}`}>
              Active
            </span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl font-heading font-bold mt-2 text-emerald-700">
            {summary.active_count}
          </div>
          <div className={`text-[10px] mt-1 truncate ${selectedLifecycle === "ACTIVE" ? "text-emerald-100" : "text-slate-500"}`}>
            ≥3x Selesai & Aktif
          </div>
        </button>

        {/* Dormant Card */}
        <button
          onClick={() => setSelectedLifecycle("DORMANT")}
          data-testid="kpi-card-dormant"
          className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
            selectedLifecycle === "DORMANT"
              ? "bg-rose-700 text-white border-rose-700 shadow-md ring-2 ring-rose-400/30"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-rose-200 hover:shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${selectedLifecycle === "DORMANT" ? "text-rose-100" : "text-rose-700"}`}>
              Dormant
            </span>
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          </div>
          <div className="text-2xl font-heading font-bold mt-2 text-rose-700">
            {summary.dormant_count}
          </div>
          <div className={`text-[10px] mt-1 truncate ${selectedLifecycle === "DORMANT" ? "text-rose-100" : "text-slate-500"}`}>
            Inaktif ≥ 56 Hari
          </div>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {/* Search Box */}
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="input-search-outlet"
              placeholder="Cari kode, nama toko, pemilik, alamat, telepon..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-10 rounded-xl bg-slate-50/50 border-slate-200 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Province Filter */}
          <div>
            <Select value={selectedProvince} onValueChange={setSelectedProvince}>
              <SelectTrigger data-testid="select-filter-province" className="h-10 rounded-xl bg-slate-50/50 border-slate-200 text-xs">
                <SelectValue placeholder="Semua Provinsi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Provinsi</SelectItem>
                {provinces.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Regency Filter */}
          <div>
            <Select
              value={selectedRegency}
              onValueChange={setSelectedRegency}
              disabled={!selectedProvince || selectedProvince === "ALL"}
            >
              <SelectTrigger data-testid="select-filter-regency" className="h-10 rounded-xl bg-slate-50/50 border-slate-200 text-xs disabled:opacity-50">
                <SelectValue placeholder={selectedProvince && selectedProvince !== "ALL" ? "Semua Kab/Kota" : "Pilih Prov Dulu"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Kab/Kota</SelectItem>
                {regencies.map((r) => (
                  <SelectItem key={r._id} value={r._id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Area Filter */}
          <div>
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger data-testid="select-filter-area" className="h-10 rounded-xl bg-slate-50/50 border-slate-200 text-xs">
                <SelectValue placeholder="Pilih Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Area</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Salesman Filter */}
          <div>
            <Select value={selectedSalesman} onValueChange={setSelectedSalesman}>
              <SelectTrigger data-testid="select-filter-salesman" className="h-10 rounded-xl bg-slate-50/50 border-slate-200 text-xs">
                <SelectValue placeholder="Pilih Salesman" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Salesman</SelectItem>
                {salesmen.map((s) => (
                  <SelectItem key={s._id} value={s.user_id || s._id}>{s.name} ({s.code || "SALES"})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Penugasan Filter */}
          <div>
            <Select value={selectedAssignmentStatus} onValueChange={setSelectedAssignmentStatus}>
              <SelectTrigger data-testid="select-filter-assignment" className="h-10 rounded-xl bg-slate-50/50 border-slate-200 text-xs font-medium">
                <SelectValue placeholder="Status Penugasan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Penugasan</SelectItem>
                <SelectItem value="ASSIGNED">Sudah Ditugaskan</SelectItem>
                <SelectItem value="UNASSIGNED">Belum Ditugaskan</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filter tags & quick reset */}
        {(selectedLifecycle !== "ALL" || selectedProvince !== "ALL" || selectedRegency !== "ALL" || selectedArea !== "ALL" || selectedChannel !== "ALL" || selectedSalesman !== "ALL" || selectedAssignmentStatus !== "ALL" || searchQuery) && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 text-[11px] font-medium">Filter Aktif:</span>
              {selectedLifecycle !== "ALL" && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                  Lifecycle: {selectedLifecycle}
                  <button onClick={() => setSelectedLifecycle("ALL")} className="hover:text-rose-500"><X size={12} /></button>
                </span>
              )}
              {selectedAssignmentStatus !== "ALL" && (
                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                  Penugasan: {selectedAssignmentStatus === "ASSIGNED" ? "Sudah Ditugaskan" : "Belum Ditugaskan"}
                  <button onClick={() => setSelectedAssignmentStatus("ALL")} className="hover:text-rose-500"><X size={12} /></button>
                </span>
              )}
              {selectedProvince !== "ALL" && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                  Prov: {provinces.find((p) => p._id === selectedProvince)?.name || selectedProvince}
                  <button onClick={() => { setSelectedProvince("ALL"); setSelectedRegency("ALL"); }} className="hover:text-rose-500"><X size={12} /></button>
                </span>
              )}
              {selectedRegency !== "ALL" && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                  Kota: {regencies.find((r) => r._id === selectedRegency)?.name || selectedRegency}
                  <button onClick={() => setSelectedRegency("ALL")} className="hover:text-rose-500"><X size={12} /></button>
                </span>
              )}
              {selectedArea !== "ALL" && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                  Area: {areas.find((a) => a._id === selectedArea)?.name || selectedArea}
                  <button onClick={() => setSelectedArea("ALL")} className="hover:text-rose-500"><X size={12} /></button>
                </span>
              )}
              {selectedChannel !== "ALL" && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                  Channel: {channels.find((c) => c._id === selectedChannel)?.name || selectedChannel}
                  <button onClick={() => setSelectedChannel("ALL")} className="hover:text-rose-500"><X size={12} /></button>
                </span>
              )}
              {selectedSalesman !== "ALL" && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                  Sales: {salesmen.find((s) => s.user_id === selectedSalesman || s._id === selectedSalesman)?.name || selectedSalesman}
                  <button onClick={() => setSelectedSalesman("ALL")} className="hover:text-rose-500"><X size={12} /></button>
                </span>
              )}
            </div>

            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedLifecycle("ALL");
                setSelectedAssignmentStatus("ALL");
                setSelectedProvince("ALL");
                setSelectedRegency("ALL");
                setSelectedArea("ALL");
                setSelectedChannel("ALL");
                setSelectedSalesman("ALL");
                setSelectedOpStatus("ALL");
              }}
              data-testid="btn-reset-filters"
              className="text-xs text-rose-600 hover:underline font-semibold"
            >
              Reset Semua Filter
            </button>
          </div>
        )}
      </div>

      {/* View Mode Switcher */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-300/60 shadow-2xs">
          <button
            onClick={() => setViewMode("table")}
            data-testid="btn-view-table"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === "table"
                ? "bg-white text-navy shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers size={14} />
            <span>Tabel Data ({items.length})</span>
          </button>
          <button
            onClick={() => setViewMode("map")}
            data-testid="btn-view-map"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === "map"
                ? "bg-navy text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <MapPin size={14} />
            <span>Peta Sebaran GPS ({outletMarkers.length})</span>
          </button>
        </div>

        {viewMode === "map" && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Klik pin toko di peta untuk rincian lengkap & navigasi Google Maps
          </div>
        )}
      </div>

      {viewMode === "map" ? (
        /* Peta Sebaran Outlet */
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-navy" />
              <span className="text-xs font-bold text-navy">Peta Interaktif Sebaran Outlet Mahameru</span>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {outletMarkers.length} Toko Berkoordinat
              </span>
            </div>

            {/* Map Legend */}
            <div className="flex gap-3 text-[11px] font-semibold text-slate-600 flex-wrap items-center">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Loyal (≥4 Tx)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Repeat (2-3 Tx)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> New Outlet (1 Tx)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" /> Prospect (0 Tx)
              </span>
            </div>
          </div>

          <MapView
            center={mapCenter}
            zoom={13}
            height="540px"
            markers={outletMarkers}
            showLayerToggle={true}
          />

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-gold-dark" />
              <span>
                Menampilkan <b>{outletMarkers.length}</b> toko di peta sesuai filter aktif saat ini.
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Koordinat GPS & Validasi Geofence Real-time
            </span>
          </div>
        </div>
      ) : (
        /* Main Table */
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-b border-slate-200">
                <TableHead className="w-10 text-center py-3.5 px-3">
                  <input
                    type="checkbox"
                    checked={displayedItems.length > 0 && selectedOutletIds.size === displayedItems.length}
                    onChange={toggleSelectAll}
                    title="Pilih Semua Outlet Ditampilkan"
                    className="rounded border-slate-300 text-navy focus:ring-navy h-4 w-4 cursor-pointer"
                  />
                </TableHead>
                <TableHead className="font-bold text-xs text-navy uppercase py-3.5 px-4">Kode & Nama Toko</TableHead>
                <TableHead className="font-bold text-xs text-navy uppercase py-3.5 px-4">Kontak & Pemilik</TableHead>
                <TableHead className="font-bold text-xs text-navy uppercase py-3.5 px-4">Channel & Area</TableHead>
                <TableHead className="font-bold text-xs text-navy uppercase py-3.5 px-4">Sales Ditugaskan</TableHead>
                <TableHead className="font-bold text-xs text-navy uppercase py-3.5 px-4 text-center">Tx Selesai</TableHead>
                <TableHead className="font-bold text-xs text-navy uppercase py-3.5 px-4 text-center">Status Lifecycle</TableHead>
                <TableHead className="font-bold text-xs text-navy uppercase py-3.5 px-4">Tx Terakhir</TableHead>
                <TableHead className="font-bold text-xs text-navy uppercase py-3.5 px-4 text-right">Total Omset</TableHead>
                <TableHead className="font-bold text-xs text-navy uppercase py-3.5 px-4 text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="animate-spin text-navy" size={24} />
                      <span className="text-xs font-semibold">Memuat data master outlet...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : displayedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Store size={36} className="text-slate-300" />
                      <span className="font-bold text-sm text-navy">Tidak ada outlet yang cocok</span>
                      <p className="text-xs text-slate-400">
                        Sesuaikan kata kunci pencarian atau reset filter untuk melihat daftar outlet.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                displayedItems.map((o, idx) => {
                  const isSelected = selectedOutletIds.has(o._id);
                  const isAssigned = !!o.assigned_sales_id || (o.assigned_sales_name && o.assigned_sales_name !== "-");

                  return (
                    <TableRow
                      key={o._id}
                      data-testid={`outlet-row-${o.outlet_code.toLowerCase()}`}
                      className={`border-b border-slate-100 transition-colors ${
                        isSelected ? "bg-blue-50/60 hover:bg-blue-50/80" : "hover:bg-slate-50/70"
                      }`}
                    >
                      {/* Row Checkbox */}
                      <TableCell className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOutlet(o._id)}
                          className="rounded border-slate-300 text-navy focus:ring-navy h-4 w-4 cursor-pointer"
                        />
                      </TableCell>

                      {/* Code & Name */}
                      <TableCell className="py-3 px-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span
                              onClick={() => handleOpenDetail(o._id)}
                              className="font-bold text-sm text-navy hover:text-gold-dark hover:underline cursor-pointer truncate max-w-[200px]"
                              title={o.outlet_name}
                            >
                              {o.outlet_name}
                            </span>
                            {o.status !== "ACTIVE" && <StatusBadge status={o.status} />}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-semibold">
                              {o.outlet_code}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate max-w-[180px]" title={o.address}>
                              · {o.address}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Owner & Contact */}
                      <TableCell className="py-3 px-4 text-xs">
                        <div className="font-medium text-slate-800">{o.owner_name || "-"}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {o.phone ? (
                            <a
                              href={`https://wa.me/${o.phone.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-emerald-600 hover:underline flex items-center gap-1"
                            >
                              <Phone size={11} className="text-emerald-500" />
                              {o.phone}
                            </a>
                          ) : (
                            "-"
                          )}
                        </div>
                      </TableCell>

                      {/* Channel & Area */}
                      <TableCell className="py-3 px-4 text-xs">
                        <div className="font-semibold text-slate-800">{o.channel_name || "-"}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin size={11} className="text-gold" />
                          {o.area_name || "-"}
                        </div>
                      </TableCell>

                      {/* Sales Representative */}
                      <TableCell className="py-3 px-4 text-xs">
                        {isAssigned ? (
                          <div className="flex items-center justify-between gap-1.5">
                            <div>
                              <div className="font-semibold text-slate-800 flex items-center gap-1">
                                <span>{o.assigned_sales_name}</span>
                                {o.assigned_sales_code && o.assigned_sales_code !== "-" && (
                                  <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1 rounded">
                                    {o.assigned_sales_code}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {o.assignment_type === "DIRECT" ? (
                                  <span className="text-blue-600 font-medium">Penugasan Langsung</span>
                                ) : o.assignment_type === "AREA_OWNERSHIP" ? (
                                  <span className="text-slate-500">Pemilik Area</span>
                                ) : (
                                  "Ditugaskan"
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleOpenReassign(o)}
                              title="Ubah Penugasan Sales (Reassign)"
                              className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <ArrowRightLeft size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenReassign(o)}
                            className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2 py-1 rounded-lg font-semibold transition-colors"
                          >
                            <UserPlus size={12} />
                            + Tugaskan
                          </button>
                        )}
                      </TableCell>

                      {/* Completed Transactions Count */}
                      <TableCell className="py-3 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-xs font-bold text-navy">
                          {o.completed_transaction_count || 0}
                        </span>
                      </TableCell>

                      {/* Lifecycle Status Badge */}
                      <TableCell className="py-3 px-4 text-center">
                        <LifecycleBadge status={o.lifecycle_status} />
                      </TableCell>

                      {/* Last Transaction */}
                      <TableCell className="py-3 px-4 text-xs">
                        {o.last_completed_transaction_at ? (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {new Date(o.last_completed_transaction_at).toLocaleDateString("id-ID", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {o.days_since_last_transaction === 0
                                ? "Hari ini"
                                : `${o.days_since_last_transaction} hari lalu`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Belum pernah</span>
                        )}
                      </TableCell>

                      {/* Total Revenue */}
                      <TableCell className="py-3 px-4 text-right text-xs font-mono font-bold text-navy">
                        Rp {(o.total_revenue || 0).toLocaleString("id-ID")}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenReassign(o)}
                            title="Tugaskan / Mutasi Sales"
                            data-testid={`btn-reassign-${o.outlet_code.toLowerCase()}`}
                            className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg"
                          >
                            <UserCheck size={14} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDetail(o._id)}
                            title="Lihat Detail Profil Outlet"
                            data-testid={`btn-detail-${o.outlet_code.toLowerCase()}`}
                            className="h-8 w-8 text-slate-600 hover:text-navy hover:bg-slate-100 rounded-lg"
                          >
                            <Eye size={15} />
                          </Button>

                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleOutletStatus(o)}
                              disabled={togglingOutletId === o._id}
                              title={o.status === "ACTIVE" ? "Nonaktifkan Outlet (Set INACTIVE)" : "Aktifkan Outlet (Set ACTIVE)"}
                              data-testid={`btn-toggle-${o.outlet_code.toLowerCase()}`}
                              className={`h-8 w-8 rounded-lg ${o.status === "ACTIVE" ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`}
                            >
                              <Power size={14} />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(o)}
                            title="Edit Master Data Outlet"
                            data-testid={`btn-edit-${o.outlet_code.toLowerCase()}`}
                            className="h-8 w-8 text-slate-600 hover:text-navy hover:bg-slate-100 rounded-lg"
                          >
                            <Pencil size={14} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRecalculateSingle(o._id)}
                            title="Hitung Ulang Status Lifecycle"
                            data-testid={`btn-recalc-${o.outlet_code.toLowerCase()}`}
                            className="h-8 w-8 text-slate-500 hover:text-gold-dark hover:bg-gold/10 rounded-lg"
                          >
                            <RefreshCw size={13} />
                          </Button>

                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteOutlet(o)}
                              title="Hapus / Arsipkan Outlet"
                              data-testid={`btn-delete-${o.outlet_code.toLowerCase()}`}
                              className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>Menampilkan <b>{displayedItems.length}</b> dari {items.length} outlet</span>
          <span className="text-[11px] text-slate-400">
            DMS Mahameru · Transaction-Based Outlet Lifecycle Engine
          </span>
        </div>
      </div>
      )}

      {/* ================= OUTLET DETAIL DIALOG ================= */}
      <Dialog open={!!detailOutletId} onOpenChange={(open) => !open && setDetailOutletId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
          {detailLoading || !detailData ? (
            <div className="py-16 text-center text-slate-500">
              <RefreshCw className="animate-spin text-navy mx-auto mb-2" size={28} />
              <span className="text-xs font-semibold">Memuat profil lengkap outlet...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Detail Header */}
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="flex items-start gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-navy text-gold flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
                    <Store size={28} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-heading font-bold text-navy" data-testid="detail-outlet-name">
                        {detailData.outlet_name}
                      </h2>
                      <LifecycleBadge status={detailData.lifecycle_status} size="lg" />
                      <StatusBadge status={detailData.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-navy font-bold">
                        {detailData.outlet_code}
                      </span>
                      <span>· {detailData.channel_name}</span>
                      <span>· Area {detailData.area_name}</span>
                      {detailData.route_name && <span>· Rute {detailData.route_name}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handleOpenReassign(detailData);
                    }}
                    className="border-blue-200 text-blue-700 bg-blue-50/60 hover:bg-blue-100 rounded-xl text-xs font-bold gap-1.5"
                  >
                    <UserCheck size={13} className="text-blue-600" />
                    Mutasi Penugasan
                  </Button>

                  {canDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleOutletStatus(detailData)}
                      disabled={togglingOutletId === detailData._id}
                      className={`rounded-xl text-xs font-semibold gap-1.5 ${detailData.status === "ACTIVE" ? "text-amber-700 hover:bg-amber-50" : "text-emerald-700 hover:bg-emerald-50"}`}
                    >
                      <Power size={13} />
                      {detailData.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRecalculateSingle(detailData._id)}
                    className="rounded-xl text-xs font-semibold gap-1.5"
                  >
                    <RefreshCw size={13} />
                    Hitung Ulang Status
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDetailOutletId(null);
                      handleOpenEdit(detailData);
                    }}
                    className="bg-navy hover:bg-navy-light text-white rounded-xl text-xs font-bold gap-1.5"
                  >
                    <Pencil size={13} />
                    Edit Data
                  </Button>
                </div>
              </div>

              {/* Detail Tabs */}
              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList className="bg-slate-100 p-1 rounded-xl w-full grid grid-cols-5">
                  <TabsTrigger value="overview" className="rounded-lg text-xs font-bold">
                    Ringkasan & Profil
                  </TabsTrigger>
                  <TabsTrigger value="products" className="rounded-lg text-xs font-bold">
                    Produk ({detailData.product_breakdown?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="transactions" className="rounded-lg text-xs font-bold">
                    Transaksi ({detailData.all_transactions?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="visits" className="rounded-lg text-xs font-bold">
                    Kunjungan ({detailData.all_visits?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="assignments" className="rounded-lg text-xs font-bold text-navy">
                    Audit Penugasan ({detailData.assignment_history?.length || 0})
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: OVERVIEW & PROFILE */}
                <TabsContent value="overview" className="space-y-4 pt-2">
                  {/* Status Rule Explanation Box */}
                  <div className={`p-4 rounded-xl border ${
                    detailData.lifecycle_status === "DORMANT"
                      ? "bg-rose-50/60 border-rose-200 text-rose-800"
                      : detailData.lifecycle_status === "ACTIVE"
                      ? "bg-emerald-50/60 border-emerald-200 text-emerald-800"
                      : detailData.lifecycle_status === "REPEAT"
                      ? "bg-amber-50/60 border-amber-200 text-amber-800"
                      : detailData.lifecycle_status === "NOO"
                      ? "bg-blue-50/60 border-blue-200 text-blue-800"
                      : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}>
                    <div className="flex items-start gap-3">
                      <Sparkles size={18} className="shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-sm">
                          Status Lifecycle: {detailData.lifecycle_label} ({detailData.lifecycle_badge})
                        </div>
                        <p className="text-xs mt-0.5 opacity-90">
                          {detailData.lifecycle_description}. Status ini dihitung otomatis berdasarkan jumlah transaksi selesai dan tanggal transaksi terakhir.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Total Transaksi Selesai</div>
                      <div className="text-xl font-heading font-bold text-navy mt-1">
                        {detailData.completed_transaction_count || 0}x
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Order Valid</div>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Hari Sejak Tx Terakhir</div>
                      <div className="text-xl font-heading font-bold text-navy mt-1">
                        {detailData.days_since_last_transaction !== null ? `${detailData.days_since_last_transaction} hari` : "-"}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {detailData.days_since_last_transaction >= 56 ? "Inaktif ≥8 Minggu" : "Aktif"}
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Total Volume Terjual</div>
                      <div className="text-xl font-heading font-bold text-navy mt-1">
                        {detailData.total_volume || 0} <span className="text-xs font-normal">Karton</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Akumulasi volume</div>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Total Omset (Revenue)</div>
                      <div className="text-lg font-heading font-bold text-navy mt-1 font-mono">
                        Rp {(detailData.total_revenue || 0).toLocaleString("id-ID")}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Semua invoice selesai</div>
                    </div>
                  </div>

                  {/* Profile Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      <h3 className="font-bold text-xs text-navy uppercase tracking-wider flex items-center justify-between">
                        <span>Informasi Wilayah & Alamat</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-normal">
                          Master Wilayah Resmi
                        </span>
                      </h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Provinsi:</span>
                          <span className="font-bold text-navy">{detailData.province_name || "-"}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Kabupaten / Kota:</span>
                          <span className="font-semibold text-slate-800">{detailData.regency_name || "-"}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Kecamatan:</span>
                          <span className="font-semibold text-slate-800">{detailData.district_name || "-"}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Kelurahan / Desa:</span>
                          <span className="font-semibold text-slate-800">{detailData.village_name || "-"}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Kode Pos:</span>
                          <span className="font-mono font-semibold text-slate-800">{detailData.postal_code || "-"}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Jalan / Gedung:</span>
                          <span className="font-semibold text-slate-800 text-right max-w-[240px]">
                            {detailData.address_line || detailData.address}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Koordinat GPS:</span>
                          <a
                            href={`https://www.google.com/maps?q=${detailData.latitude},${detailData.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                          >
                            <ExternalLink size={12} />
                            {detailData.latitude}, {detailData.longitude}
                          </a>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Limit Kredit:</span>
                          <span className="font-mono font-bold text-navy">
                            Rp {(detailData.credit_limit || 0).toLocaleString("id-ID")} ({detailData.payment_term_days || 0} hari)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      <h3 className="font-bold text-xs text-navy uppercase tracking-wider">Penugasan Sales & Wilayah</h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Area Operasional:</span>
                          <span className="font-semibold text-slate-800">{detailData.area_name}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Channel Distribusi:</span>
                          <span className="font-semibold text-slate-800">{detailData.channel_name}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Salesman Penugasan:</span>
                          <span className="font-bold text-navy">{detailData.assigned_sales_name || "-"}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-500">Tipe Penugasan:</span>
                          <span className="font-semibold text-slate-800">
                            {detailData.assignment_type === "DIRECT" ? "Penugasan Langsung (Direct)" : "Pemilik Wilayah Area"}
                          </span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Pertama Kali Transaksi:</span>
                          <span className="font-semibold text-slate-800">
                            {detailData.first_completed_transaction_at
                              ? new Date(detailData.first_completed_transaction_at).toLocaleDateString("id-ID")
                              : "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 2: PURCHASED PRODUCTS BREAKDOWN */}
                <TabsContent value="products" className="space-y-3 pt-2">
                  <div className="text-xs text-slate-500">
                    Daftar SKU produk yang pernah dipesan oleh outlet ini dari transaksi selesai.
                  </div>
                  {detailData.product_breakdown?.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-xs">
                      Belum ada riwayat pembelian produk untuk outlet ini.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-xs font-bold py-2.5">SKU & Nama Produk</TableHead>
                            <TableHead className="text-xs font-bold py-2.5 text-center">Frekuensi Order</TableHead>
                            <TableHead className="text-xs font-bold py-2.5 text-center">Total Volume (Qty)</TableHead>
                            <TableHead className="text-xs font-bold py-2.5 text-right">Total Nilai Pembelian</TableHead>
                            <TableHead className="text-xs font-bold py-2.5">Terakhir Dipesan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailData.product_breakdown?.map((p) => (
                            <TableRow key={p.sku_id} className="text-xs">
                              <TableCell className="font-semibold text-navy py-2.5">
                                <div>{p.sku_name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{p.sku_code} · {p.product_name}</div>
                              </TableCell>
                              <TableCell className="text-center font-bold py-2.5">{p.transaction_count}x</TableCell>
                              <TableCell className="text-center font-bold text-navy py-2.5">{p.total_volume}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-navy py-2.5">
                                Rp {p.total_subtotal.toLocaleString("id-ID")}
                              </TableCell>
                              <TableCell className="text-slate-500 py-2.5">
                                {new Date(p.last_purchased_at).toLocaleDateString("id-ID")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* TAB 3: TRANSACTION HISTORY */}
                <TabsContent value="transactions" className="space-y-3 pt-2">
                  <div className="text-xs text-slate-500">
                    Riwayat seluruh transaksi penjualan di outlet ini.
                  </div>
                  {detailData.all_transactions?.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-xs">
                      Belum ada transaksi di outlet ini.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-xs font-bold py-2.5">No Invoice & Tanggal</TableHead>
                            <TableHead className="text-xs font-bold py-2.5">Salesman</TableHead>
                            <TableHead className="text-xs font-bold py-2.5 text-center">Item Produk</TableHead>
                            <TableHead className="text-xs font-bold py-2.5 text-center">Status</TableHead>
                            <TableHead className="text-xs font-bold py-2.5 text-right">Total Transaksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailData.all_transactions?.map((t) => (
                            <TableRow key={t._id} className="text-xs">
                              <TableCell className="py-2.5">
                                <div className="font-mono font-bold text-navy">{t.invoice_number}</div>
                                <div className="text-[10px] text-slate-400">
                                  {new Date(t.transaction_date).toLocaleDateString("id-ID", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 text-slate-700">{t.salesman_name || "-"}</TableCell>
                              <TableCell className="py-2.5 text-center">
                                <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded text-[11px]">
                                  {(t.items || []).length} SKU ({t.total_volume || (t.items || []).reduce((s, i) => s + (i.quantity || 0), 0)} Qty)
                                </span>
                              </TableCell>
                              <TableCell className="py-2.5 text-center">
                                <StatusBadge status={t.status} />
                              </TableCell>
                              <TableCell className="py-2.5 text-right font-mono font-bold text-navy">
                                Rp {(t.total || 0).toLocaleString("id-ID")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* TAB 4: VISIT HISTORY */}
                <TabsContent value="visits" className="space-y-3 pt-2">
                  <div className="text-xs text-slate-500">
                    Riwayat kunjungan salesman ke outlet ini beserta hasil dan bukti kehadiran.
                  </div>
                  {detailData.all_visits?.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-xs">
                      Belum ada catatan kunjungan sales ke outlet ini.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-xs font-bold py-2.5">Waktu Kunjungan</TableHead>
                            <TableHead className="text-xs font-bold py-2.5">Salesman</TableHead>
                            <TableHead className="text-xs font-bold py-2.5 text-center">Hasil Call</TableHead>
                            <TableHead className="text-xs font-bold py-2.5 text-center">Durasi</TableHead>
                            <TableHead className="text-xs font-bold py-2.5">Catatan / Alasan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailData.all_visits?.map((v) => (
                            <TableRow key={v._id} className="text-xs">
                              <TableCell className="py-2.5">
                                <div className="font-semibold text-slate-800">
                                  {new Date(v.check_in_time || v.created_at || v.date).toLocaleDateString("id-ID", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 text-slate-700">{v.salesman_name || "-"}</TableCell>
                              <TableCell className="py-2.5 text-center">
                                <StatusBadge status={v.call_result || v.status} />
                              </TableCell>
                              <TableCell className="py-2.5 text-center text-slate-500 font-mono">
                                {v.duration_seconds ? `${Math.round(v.duration_seconds / 60)} mnt` : "-"}
                              </TableCell>
                              <TableCell className="py-2.5 text-slate-600 truncate max-w-[200px]">
                                {v.notes || v.open_reason || "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* TAB 5: ASSIGNMENT AUDIT & HISTORY */}
                <TabsContent value="assignments" className="space-y-4 pt-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Rekam jejak otomatis penugasan salesmen, mutasi teritori, dan audit log perubahan outlet ini.</span>
                    <span className="font-semibold bg-navy/10 text-navy px-2 py-0.5 rounded text-[11px]">
                      Sales Aktif: {detailData.assigned_sales_name || "Belum Ditugaskan"}
                    </span>
                  </div>

                  {/* Assignment History Table */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-navy flex items-center gap-1.5">
                      <UserCheck size={14} className="text-emerald-600" />
                      <span>Riwayat Penugasan Salesman</span>
                    </div>

                    {(!detailData.assignment_history || detailData.assignment_history.length === 0) ? (
                      <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-400 text-xs">
                        Belum ada riwayat penugasan tersimpan untuk outlet ini.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead className="text-xs font-bold py-2.5">Salesman Ditugaskan</TableHead>
                              <TableHead className="text-xs font-bold py-2.5 text-center">Status</TableHead>
                              <TableHead className="text-xs font-bold py-2.5">Tanggal Penugasan</TableHead>
                              <TableHead className="text-xs font-bold py-2.5">Ditugaskan Oleh</TableHead>
                              <TableHead className="text-xs font-bold py-2.5">Catatan / Mutasi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detailData.assignment_history.map((so) => (
                              <TableRow key={so._id} className="text-xs">
                                <TableCell className="py-2.5 font-bold text-navy">
                                  {so.sales_name}
                                </TableCell>
                                <TableCell className="py-2.5 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    so.status === "ACTIVE"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-slate-100 text-slate-600"
                                  }`}>
                                    {so.status === "ACTIVE" ? "AKTIF" : "NONAKTIF / SELESAI"}
                                  </span>
                                </TableCell>
                                <TableCell className="py-2.5 text-slate-600 font-mono">
                                  {new Date(so.assigned_at).toLocaleDateString("id-ID", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </TableCell>
                                <TableCell className="py-2.5 text-slate-700">
                                  {so.assigned_by_name || "System"}
                                </TableCell>
                                <TableCell className="py-2.5 text-slate-600 italic">
                                  {so.notes || "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Specific Outlet Audit Logs */}
                  {detailData.audit_history && detailData.audit_history.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="text-xs font-bold text-navy flex items-center gap-1.5">
                        <Activity size={14} className="text-blue-600" />
                        <span>Log Jejak Audit Terkait Outlet ({detailData.audit_history.length})</span>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead className="text-xs font-bold py-2">Waktu</TableHead>
                              <TableHead className="text-xs font-bold py-2">Pengguna</TableHead>
                              <TableHead className="text-xs font-bold py-2">Aksi</TableHead>
                              <TableHead className="text-xs font-bold py-2">Detail Perubahan</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detailData.audit_history.map((al, idx) => (
                              <TableRow key={al._id || idx} className="text-xs">
                                <TableCell className="py-2 font-mono text-slate-500 whitespace-nowrap">
                                  {new Date(al.timestamp || al.created_at).toLocaleDateString("id-ID", {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </TableCell>
                                <TableCell className="py-2 font-semibold text-slate-800">
                                  {al.user_name || al.details?.user_name || "System"}
                                </TableCell>
                                <TableCell className="py-2">
                                  <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-bold">
                                    {al.action}
                                  </span>
                                </TableCell>
                                <TableCell className="py-2 text-slate-600 truncate max-w-xs font-mono text-[11px]">
                                  {al.details?.reason || al.details?.notes || (al.details?.new_sales_name ? `Sales: ${al.details.new_sales_name}` : JSON.stringify(al.details || {}))}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <DialogFooter className="border-t border-slate-100 pt-3">
                <Button variant="outline" onClick={() => setDetailOutletId(null)}>
                  Tutup
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= ADD / EDIT OUTLET DIALOG ================= */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-heading font-bold text-navy flex items-center gap-2">
              <Store size={20} className="text-gold" />
              {editItem ? "Edit Master Outlet" : "Pendaftaran Outlet Baru"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {editItem
                ? "Perbarui master data profil, wilayah penugasan, atau koordinat lokasi outlet."
                : "Daftarkan outlet baru. Status otomatis menjadi PROSPECT (0 transaksi)."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitForm} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Outlet Name */}
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs font-bold text-navy">Nama Toko / Outlet *</Label>
                <Input
                  required
                  placeholder="Contoh: Toko Berkah Jaya"
                  value={formData.outlet_name}
                  onChange={(e) => setFormData({ ...formData, outlet_name: e.target.value })}
                  className="rounded-xl text-sm"
                  data-testid="input-form-outlet-name"
                />
              </div>

              {/* Outlet Code (Optional / Auto) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Kode Outlet (Kosongkan utk auto-generate)</Label>
                <Input
                  placeholder="OUT-XXX"
                  value={formData.outlet_code}
                  onChange={(e) => setFormData({ ...formData, outlet_code: e.target.value })}
                  className="rounded-xl font-mono text-sm uppercase"
                  data-testid="input-form-outlet-code"
                />
              </div>

              {/* Owner Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Nama Pemilik / Penanggung Jawab</Label>
                <Input
                  placeholder="Contoh: H. Ahmad"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                  className="rounded-xl text-sm"
                  data-testid="input-form-owner-name"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Nomor Telepon / WhatsApp</Label>
                <Input
                  placeholder="08123456789"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="rounded-xl text-sm"
                  data-testid="input-form-phone"
                />
              </div>

              {/* Channel */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Channel Distribusi</Label>
                <Select
                  value={formData.channel_id}
                  onValueChange={(v) => setFormData({ ...formData, channel_id: v })}
                >
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue placeholder="Pilih Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Area */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Area Operasional *</Label>
                <Select
                  value={formData.area_id}
                  onValueChange={(v) => setFormData({ ...formData, area_id: v })}
                >
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue placeholder="Pilih Area" />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Route */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Rute Kunjungan (Opsional)</Label>
                <Select
                  value={formData.route_id}
                  onValueChange={(v) => setFormData({ ...formData, route_id: v })}
                >
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue placeholder="Pilih Rute" />
                  </SelectTrigger>
                  <SelectContent>
                    {routes.map((r) => (
                      <SelectItem key={r._id} value={r._id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Master Wilayah Administratif (Provinsi -> Kota -> Kecamatan -> Kelurahan -> Jalan) */}
              <div className="md:col-span-2">
                <RegionSelectGroup
                  value={{
                    province_id: formData.province_id,
                    province_name: formData.province_name,
                    regency_id: formData.regency_id,
                    regency_name: formData.regency_name,
                    district_id: formData.district_id,
                    district_name: formData.district_name,
                    village_id: formData.village_id,
                    village_name: formData.village_name,
                    postal_code: formData.postal_code,
                    street_address: formData.street_address || formData.address_line || formData.address,
                  }}
                  onChange={handleRegionChange}
                  disabled={false}
                  required={true}
                />
              </div>

              {/* GPS Coordinates */}
              <div className="space-y-1.5 md:col-span-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-bold text-navy flex items-center gap-1.5">
                    <MapPin size={14} className="text-gold" />
                    Titik Koordinat GPS *
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDetectGps()}
                    disabled={gpsLoading}
                    className="h-7 text-[11px] rounded-lg border-slate-300 font-semibold gap-1"
                  >
                    <MapPin size={12} />
                    {gpsLoading ? "Mendeteksi..." : "Ambil Lokasi Saat Ini"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium">Latitude:</span>
                    <Input
                      type="number"
                      step="any"
                      required
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: Number(e.target.value) })}
                      className="rounded-lg font-mono text-xs mt-0.5 bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium">Longitude:</span>
                    <Input
                      type="number"
                      step="any"
                      required
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: Number(e.target.value) })}
                      className="rounded-lg font-mono text-xs mt-0.5 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Credit limit */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Credit Limit (Rp)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.credit_limit}
                  onChange={(e) => setFormData({ ...formData, credit_limit: Number(e.target.value) })}
                  className="rounded-xl text-sm font-mono"
                />
              </div>

              {/* Payment term */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">TOP (Term of Payment - Hari)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.payment_term_days}
                  onChange={(e) => setFormData({ ...formData, payment_term_days: Number(e.target.value) })}
                  className="rounded-xl text-sm"
                />
              </div>

              {/* Sales Penugasan */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Salesman Penugasan (Opsional)</Label>
                <Select
                  value={formData.assigned_sales_id || "NONE"}
                  onValueChange={(val) => setFormData({ ...formData, assigned_sales_id: val === "NONE" ? "" : val })}
                >
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue placeholder="Pilih Salesman Penugasan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">-- Belum Ditugaskan --</SelectItem>
                    {salesmen.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name} ({s.code || s._id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status Operasional */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-navy">Status Operasional Outlet</Label>
                <Select
                  value={formData.status || "ACTIVE"}
                  onValueChange={(val) => setFormData({ ...formData, status: val })}
                >
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue placeholder="Pilih Status Operasional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">ACTIVE (Aktif Beroperasi)</SelectItem>
                    <SelectItem value="INACTIVE">INACTIVE (Nonaktif / Tutup)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs font-bold text-navy">Catatan Tambahan Outlet</Label>
                <Input
                  placeholder="Contoh: Patokan dekat pertigaan masjid, toko buka pukul 08:00"
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="rounded-xl text-sm"
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-slate-100 gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="rounded-xl">
                Batal
              </Button>
              <Button type="submit" data-testid="btn-submit-outlet" className="bg-navy hover:bg-navy-light text-white rounded-xl font-bold">
                {editItem ? "Simpan Perubahan" : "Daftarkan Outlet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= BUSINESS RULES INFO DIALOG ================= */}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-w-xl rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-heading font-bold text-navy flex items-center gap-2">
              <Info size={18} className="text-gold" />
              Aturan Lifecycle Status Outlet DMS Mahameru
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Otomatisasi status toko dihitung dari riwayat transaksi selesai (Completed Transactions).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
              <LifecycleBadge status="PROSPECT" />
              <div>
                <div className="font-bold text-slate-800">Prospect (0 Transaksi)</div>
                <div className="text-slate-500 mt-0.5">Toko terdaftar di sistem namun belum pernah ada transaksi selesai.</div>
              </div>
            </div>

            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-200 flex items-start gap-3">
              <LifecycleBadge status="NOO" />
              <div>
                <div className="font-bold text-blue-900">New Outlet Opening / NOO (1x Transaksi Selesai)</div>
                <div className="text-slate-600 mt-0.5">Toko baru yang telah berhasil melakukan 1 kali transaksi penjualan selesai.</div>
              </div>
            </div>

            <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200 flex items-start gap-3">
              <LifecycleBadge status="REPEAT" />
              <div>
                <div className="font-bold text-amber-900">Repeat Customer (2x Transaksi Selesai)</div>
                <div className="text-slate-600 mt-0.5">Toko yang telah melakukan transaksi kedua kalinya.</div>
              </div>
            </div>

            <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 flex items-start gap-3">
              <LifecycleBadge status="ACTIVE" />
              <div>
                <div className="font-bold text-emerald-900">Active Outlet (≥3x Transaksi Selesai)</div>
                <div className="text-slate-600 mt-0.5">
                  Toko aktif rutin dengan transaksi ≥3 kali dan bertransaksi dalam kurun waktu kurang dari 56 hari (8 minggu).
                </div>
              </div>
            </div>

            <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-200 flex items-start gap-3">
              <LifecycleBadge status="DORMANT" />
              <div>
                <div className="font-bold text-rose-900">Dormant Outlet (Inaktif ≥ 56 Hari / 8 Minggu)</div>
                <div className="text-slate-600 mt-0.5">
                  Toko yang tidak memiliki transaksi selesai dalam 56 hari terakhir. Jika toko DORMANT melakukan transaksi baru, statusnya otomatis kembali menjadi <b>ACTIVE</b> (bukan NOO).
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-100/70 rounded-xl text-[11px] text-slate-600 space-y-1">
              <div className="font-bold text-navy flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-600" />
                Catatan Penting:
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Kunjungan tanpa transaksi (Non-EC) <b>tidak</b> merubah status transaksi outlet.</li>
                <li>Transaksi yang dibatalkan (Cancelled) <b>tidak</b> dihitung dalam riwayat status.</li>
                <li>Salesman hanya dapat melihat & bertransaksi pada outlet di area penugasannya.</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button onClick={() => setRulesOpen(false)} className="bg-navy hover:bg-navy-light text-white rounded-xl text-xs font-bold">
              Mengerti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= MASTER WILAYAH IMPORT MODAL ================= */}
      <MasterWilayahImportModal
        open={wilayahModalOpen}
        onOpenChange={setWilayahModalOpen}
        onImportSuccess={() => {
          fetchMasters();
          fetchOutlets();
        }}
      />

      {/* ================= IN-APP DELETE CONFIRMATION DIALOG ================= */}
      <Dialog open={!!deleteConfirmOutlet} onOpenChange={(open) => !open && setDeleteConfirmOutlet(null)}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600 flex items-center gap-2">
              <AlertTriangle size={18} />
              Konfirmasi Hapus / Arsipkan Outlet
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-2">
              Apakah Anda yakin ingin menghapus outlet{" "}
              <b>{deleteConfirmOutlet?.outlet_name} ({deleteConfirmOutlet?.outlet_code})</b>?
              <br className="mt-1" />
              Jika outlet memiliki riwayat transaksi, status outlet akan diubah menjadi <b>ARCHIVED</b> untuk menjaga integritas data keuangan & pelaporan. Jika belum memiliki transaksi, data akan dihapus permanen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmOutlet(null)}
              disabled={deletingOutlet}
              className="rounded-xl text-xs"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => confirmDeleteOutlet()}
              disabled={deletingOutlet}
              className="rounded-xl text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {deletingOutlet ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <Trash2 size={14} className="mr-1.5" />}
              Hapus / Arsipkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= SINGLE REASSIGN OUTLET DIALOG ================= */}
      <Dialog open={!!reassignModalOutlet} onOpenChange={(open) => !open && setReassignModalOutlet(null)}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <form onSubmit={handleSaveReassign} className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-navy">
                <UserCheck size={20} className="text-blue-600" />
                <DialogTitle className="text-base font-bold font-heading">
                  Penugasan / Mutasi Sales Outlet
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-500 pt-1">
                Atur atau pindahkan penugasan outlet ini ke salesman yang ditunjuk. Sistem akan mencatat riwayat mutasi penugasan secara otomatis.
              </DialogDescription>
            </DialogHeader>

            {reassignModalOutlet && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Nama Outlet:</span>
                  <span className="font-bold text-navy">{reassignModalOutlet.outlet_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Kode & Wilayah:</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {reassignModalOutlet.outlet_code} · {reassignModalOutlet.area_name || "-"}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Sales Saat Ini:</span>
                  <span className="font-semibold text-slate-800">
                    {reassignModalOutlet.assigned_sales_name || "Belum Ditugaskan"}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Pilih Salesman Penerima <span className="text-rose-500">*</span></Label>
                <Select
                  value={reassignForm.new_sales_id}
                  onValueChange={(val) => setReassignForm({ ...reassignForm, new_sales_id: val })}
                >
                  <SelectTrigger data-testid="select-reassign-salesman" className="h-10 rounded-xl bg-white border-slate-200 text-xs">
                    <SelectValue placeholder="-- Pilih Salesman --" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesmen.map((s) => (
                      <SelectItem key={s._id} value={s.user_id || s._id}>
                        {s.name} ({s.code || "SALES"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Alasan Mutasi / Penugasan</Label>
                <Select
                  value={reassignForm.reason}
                  onValueChange={(val) => setReassignForm({ ...reassignForm, reason: val })}
                >
                  <SelectTrigger data-testid="select-reassign-reason" className="h-10 rounded-xl bg-white border-slate-200 text-xs">
                    <SelectValue placeholder="Pilih Alasan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Reorganisasi Wilayah">Reorganisasi Wilayah / Area</SelectItem>
                    <SelectItem value="Rotasi Sales Rutin">Rotasi Sales Rutin</SelectItem>
                    <SelectItem value="Sales Resign / Ganti Shift">Sales Resign / Ganti Shift</SelectItem>
                    <SelectItem value="Pemerataan Beban Toko">Pemerataan Beban Toko</SelectItem>
                    <SelectItem value="Optimalisasi Rute Kunjungan">Optimalisasi Rute Kunjungan</SelectItem>
                    <SelectItem value="Penugasan Toko Baru (NOO)">Penugasan Toko Baru (NOO)</SelectItem>
                    <SelectItem value="Lainnya">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Catatan Tambahan (Opsional)</Label>
                <Input
                  data-testid="input-reassign-notes"
                  placeholder="Contoh: Mulai aktif kunjungan Senin depan..."
                  value={reassignForm.notes}
                  onChange={(e) => setReassignForm({ ...reassignForm, notes: e.target.value })}
                  className="h-10 rounded-xl bg-white border-slate-200 text-xs"
                />
              </div>

              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 flex items-start gap-2 text-[11px] text-blue-900">
                <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Riwayat transaksi, piutang, dan histori kunjungan outlet tetap tersimpan aman. Sistem audit penugasan akan otomatis diperbarui.
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReassignModalOutlet(null)}
                disabled={reassignLoading}
                className="rounded-xl text-xs"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={reassignLoading || !reassignForm.new_sales_id}
                className="rounded-xl text-xs bg-navy hover:bg-navy-light text-white font-bold"
              >
                {reassignLoading ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <UserCheck size={14} className="mr-1.5" />}
                Simpan Penugasan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= BULK ASSIGN OUTLETS DIALOG ================= */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="max-w-lg rounded-2xl p-6">
          <form onSubmit={handleSaveBulkAssign} className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-navy">
                <Users size={20} className="text-blue-600" />
                <DialogTitle className="text-base font-bold font-heading">
                  Penugasan Massal Outlet (Bulk Assignment)
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-500 pt-1">
                Tugaskan sekaligus beberapa outlet terpilih ke seorang salesman.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {selectedOutletIds.size === 0 ? (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <span>
                    Belum ada outlet yang dipilih. Silakan centang kotak pada tabel outlet sebelum melakukan penugasan massal.
                  </span>
                </div>
              ) : (
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-navy">
                    <span>{selectedOutletIds.size} Outlet Terpilih:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedOutletIds(new Set())}
                      className="text-[11px] text-rose-600 hover:underline font-semibold"
                    >
                      Batal Pilih Semua
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {Array.from(selectedOutletIds).map((id) => {
                      const o = items.find((item) => item._id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded-md text-[11px] text-slate-700 shadow-2xs font-medium"
                        >
                          <span className="font-semibold">{o?.outlet_name || id}</span>
                          <button
                            type="button"
                            onClick={() => toggleSelectOutlet(id)}
                            className="text-slate-400 hover:text-rose-500 ml-0.5"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Tugaskan ke Salesman <span className="text-rose-500">*</span></Label>
                <Select
                  value={bulkAssignForm.sales_id}
                  onValueChange={(val) => setBulkAssignForm({ ...bulkAssignForm, sales_id: val })}
                >
                  <SelectTrigger data-testid="select-bulk-salesman" className="h-10 rounded-xl bg-white border-slate-200 text-xs">
                    <SelectValue placeholder="-- Pilih Salesman Tujuan --" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesmen.map((s) => (
                      <SelectItem key={s._id} value={s.user_id || s._id}>
                        {s.name} ({s.code || "SALES"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Catatan / Alasan Penugasan Massal</Label>
                <Input
                  data-testid="input-bulk-notes"
                  placeholder="Contoh: Reorganisasi kuartal baru..."
                  value={bulkAssignForm.notes}
                  onChange={(e) => setBulkAssignForm({ ...bulkAssignForm, notes: e.target.value })}
                  className="h-10 rounded-xl bg-white border-slate-200 text-xs"
                />
              </div>

              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 flex items-start gap-2 text-[11px] text-blue-900">
                <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Sistem akan otomatis menonaktifkan penugasan sebelumnya untuk toko-toko ini dan membuat catatan audit terperinci.
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkAssignOpen(false)}
                disabled={bulkAssignLoading}
                className="rounded-xl text-xs"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={bulkAssignLoading || selectedOutletIds.size === 0 || !bulkAssignForm.sales_id}
                className="rounded-xl text-xs bg-navy hover:bg-navy-light text-white font-bold"
              >
                {bulkAssignLoading ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <UserCheck size={14} className="mr-1.5" />}
                Tugaskan {selectedOutletIds.size} Outlet
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= FLOATING SELECTION ACTION BAR ================= */}
      {selectedOutletIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-navy text-white px-5 py-3 rounded-2xl shadow-xl border border-gold/30 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <CheckSquare className="text-gold" size={18} />
            <span className="text-xs font-bold font-heading">
              {selectedOutletIds.size} Outlet Terpilih
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setBulkAssignOpen(true)}
              className="bg-gold hover:bg-gold-light text-navy font-bold text-xs rounded-xl h-8 gap-1.5"
            >
              <UserCheck size={14} />
              Tugaskan ke Salesman
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedOutletIds(new Set())}
              className="text-slate-300 hover:text-white hover:bg-white/10 text-xs rounded-xl h-8"
            >
              Batal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
