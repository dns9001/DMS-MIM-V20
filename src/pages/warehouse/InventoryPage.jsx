import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2, Plus, Package, ArrowRightLeft, RotateCcw,
  CheckCircle2, AlertTriangle, Building2, User, Users, Search, Eye,
  Truck, ArrowDownLeft, ShieldAlert, Download, RefreshCw,
  FileSpreadsheet, Layers, Filter, Check, X, PlusCircle
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import StatusBadge from "../../components/StatusBadge";
import { fmtDateTime, rupiah, todayLocal } from "../../lib/format";
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

export default function InventoryPage() {
  const { user } = useAuth();
  const canAdjust = user?.role === "OWNER" || user?.role === "ADMIN" || user?.role === "WAREHOUSE";

  const [activeTab, setActiveTab] = useState("overview"); // overview, receivings, handovers, returns, monitoring, movements
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Data states
  const [inventoryItems, setInventoryItems] = useState([]);
  const [receivings, setReceivings] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [returns, setReturns] = useState([]);
  const [movements, setMovements] = useState([]);
  const [monitoringData, setMonitoringData] = useState(null);
  const [reconciliationData, setReconciliationData] = useState(null);
  const [salesmen, setSalesmen] = useState([]);
  const [skus, setSkus] = useState([]);
  const [offices, setOffices] = useState([]);

  // Date and filters
  const [filterDate, setFilterDate] = useState(todayLocal());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOfficeId, setSelectedOfficeId] = useState("ALL");
  const [stockFilterCategory, setStockFilterCategory] = useState("ALL");
  const [stockFilterStatus, setStockFilterStatus] = useState("ALL"); // ALL, REORDER, SAFE, IN_SALES, EMPTY
  const [movementTypeFilter, setMovementTypeFilter] = useState("ALL");
  const [receivingStatusFilter, setReceivingStatusFilter] = useState("ALL");
  const [salesmanFilter, setSalesmanFilter] = useState("ALL");

  // Dialog states
  const [receivingDialogOpen, setReceivingDialogOpen] = useState(false);
  const [handoverDialogOpen, setHandoverDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [opnameDialogOpen, setOpnameDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [skuBreakdownModal, setSkuBreakdownModal] = useState(null); // Selected SKU for sales breakdown modal
  const [refreshing, setRefreshing] = useState(false);

  // Forms
  const [receivingForm, setReceivingForm] = useState({
    supplier_name: "",
    po_number: "",
    warehouse_id: "off-1",
    receiving_date: todayLocal(),
    notes: "",
    auto_post: true,
    items: [],
  });

  const [handoverForm, setHandoverForm] = useState({
    salesman_id: "",
    warehouse_id: "off-1",
    business_date: todayLocal(),
    is_additional: false,
    auto_confirm: true,
    notes: "",
    items: [],
  });

  const [returnForm, setReturnForm] = useState({
    salesman_id: "",
    warehouse_id: "off-1",
    business_date: todayLocal(),
    notes: "",
    items: [],
  });

  const [adjustForm, setAdjustForm] = useState({
    location_type: "WAREHOUSE",
    location_id: "off-1",
    sku_id: "",
    adjustment_type: "IN",
    quantity: "",
    reason: "HASIL_OPNAME",
    notes: "",
  });

  const [opnameForm, setOpnameForm] = useState({
    location_type: "WAREHOUSE",
    location_id: "off-1",
    reason: "Opname Fisik Rutin",
    notes: "",
    items: [],
  });

  const [opnameSearch, setOpnameSearch] = useState("");
  const [receivingSearch, setReceivingSearch] = useState("");
  const [handoverSearch, setHandoverSearch] = useState("");

  // Load static masters once
  const loadMasters = useCallback(async () => {
    try {
      const [salesRes, skuRes, offRes] = await Promise.all([
        api.get("/masters/salesmen"),
        api.get("/masters/skus"),
        api.get("/masters/offices"),
      ]);
      setSalesmen(salesRes.data.items || []);
      setSkus(skuRes.data.items || []);
      setOffices(offRes.data.items || []);
    } catch (e) {
      console.error("Error loading masters:", e);
    }
  }, []);

  const loadAll = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [invRes, rcvRes, hndRes, retRes, mvtRes, monRes, recRes] = await Promise.all([
        api.get("/inventory"),
        api.get("/stock/receivings"),
        api.get("/stock/handovers", { params: { business_date: filterDate } }),
        api.get("/stock/returns", { params: { business_date: filterDate } }),
        api.get("/inventory/movements", { params: { from_date: filterDate, to_date: filterDate } }),
        api.get("/warehouse/monitoring", { params: { business_date: filterDate } }),
        api.get("/warehouse/reconciliation", { params: { business_date: filterDate } }),
      ]);

      setInventoryItems(invRes.data.items || []);
      setReceivings(rcvRes.data.items || []);
      setHandovers(hndRes.data.items || []);
      setReturns(retRes.data.items || []);
      setMovements(mvtRes.data.items || []);
      setMonitoringData(monRes.data || null);
      setReconciliationData(recRes.data || null);

      if (isManualRefresh) {
        toast.success("Data inventori & mutasi berhasil diperbarui.");
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterDate]);

  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set();
    skus.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [skus]);

  // Receiving Handlers
  const handleOpenNewReceiving = () => {
    const defaultWh = offices[0]?._id || "off-1";
    const defaultItems = skus.map((s) => ({
      sku_id: s._id,
      sku_code: s.code,
      sku_name: s.name,
      quantity: 0,
      unit_price: s.base_price || 0,
      notes: "",
    }));

    setReceivingForm({
      supplier_name: "",
      po_number: `PO-${filterDate.replace(/-/g, "")}-${String(receivings.length + 1).padStart(3, "0")}`,
      warehouse_id: defaultWh,
      receiving_date: filterDate,
      notes: "Penerimaan PO Pabrik Pusat",
      auto_post: true,
      items: defaultItems,
    });
    setReceivingDialogOpen(true);
  };

  const handleReceivingItemQtyChange = (skuId, val) => {
    const q = parseInt(val) || 0;
    setReceivingForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku_id === skuId ? { ...it, quantity: q } : it)),
    }));
  };

  const handleReceivingItemPriceChange = (skuId, val) => {
    const p = parseFloat(val) || 0;
    setReceivingForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku_id === skuId ? { ...it, unit_price: p } : it)),
    }));
  };

  const submitReceiving = async () => {
    if (!receivingForm.supplier_name.trim()) {
      toast.error("Nama Supplier wajib diisi.");
      return;
    }
    const validItems = receivingForm.items.filter((it) => it.quantity > 0);
    if (!validItems.length) {
      toast.error("Masukkan kuantitas minimal 1 produk (Qty > 0).");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/stock/receivings", {
        ...receivingForm,
        items: validItems,
      });
      toast.success(res.data.message || "Penerimaan barang berhasil disimpan.");
      setReceivingDialogOpen(false);
      loadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  const postReceiving = async (id) => {
    setBusy(true);
    try {
      const res = await api.post(`/stock/receivings/${id}/post`);
      toast.success(res.data.message || "Penerimaan barang berhasil diposting ke stok gudang.");
      loadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  const cancelReceiving = async (id) => {
    setBusy(true);
    try {
      await api.post(`/stock/receivings/${id}/cancel`);
      toast.success("Draft penerimaan barang berhasil dibatalkan.");
      loadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  // Handover Handlers
  const handleOpenNewHandover = (isAdditional = false) => {
    const defaultWh = offices[0]?._id || "off-1";
    const defaultItems = skus.map((s) => ({
      sku_id: s._id,
      sku_code: s.code,
      sku_name: s.name,
      unit: s.unit || "Unit",
      quantity: 0,
      notes: "",
    }));

    const nowTime = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

    setHandoverForm({
      salesman_id: salesmen[0]?._id || "",
      warehouse_id: defaultWh,
      business_date: filterDate,
      is_additional: isAdditional,
      handover_type: isAdditional ? "ADDITIONAL_HANDOVER" : "INITIAL_HANDOVER",
      handover_time: nowTime,
      auto_confirm: true,
      notes: isAdditional ? "Tambahan stok restock siang/sore" : "Serah terima pagi reguler",
      items: defaultItems,
    });
    setHandoverDialogOpen(true);
  };

  const handleHandoverItemQtyChange = (skuId, val) => {
    const q = parseInt(val) || 0;
    setHandoverForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku_id === skuId ? { ...it, quantity: q } : it)),
    }));
  };

  const submitHandover = async () => {
    if (!handoverForm.salesman_id) {
      toast.error("Pilih Salesman penerima");
      return;
    }
    const validItems = handoverForm.items.filter((it) => it.quantity > 0);
    if (!validItems.length) {
      toast.error("Masukkan kuantitas minimal untuk 1 produk (Qty > 0)");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/stock/handovers", {
        ...handoverForm,
        items: validItems,
      });
      toast.success(res.data?.message || (handoverForm.is_additional ? "Stok tambahan berhasil diserahkan ke Sales!" : "Serah terima stok pagi berhasil diserahkan ke Sales!"));
      setHandoverDialogOpen(false);
      loadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  const confirmHandover = async (id) => {
    setBusy(true);
    try {
      await api.post(`/stock/handovers/${id}/confirm`);
      toast.success("Serah terima stok berhasil dikonfirmasi!");
      loadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  // Return Handlers
  const handleOpenNewReturn = (salesId) => {
    const targetSales = salesId || salesmen[0]?._id || "";
    const defaultWh = offices[0]?._id || "off-1";
    const salesInvs = inventoryItems.filter((i) => i.location_type === "SALES" && i.location_id === targetSales);
    const returnItems = skus.map((s) => {
      const cur = salesInvs.find((i) => i.sku_id === s._id);
      return {
        sku_id: s._id,
        sku_code: s.code,
        sku_name: s.name,
        sales_stock: cur ? cur.available_stock : 0,
        quantity: cur ? cur.available_stock : 0,
        notes: "",
      };
    });

    setReturnForm({
      salesman_id: targetSales,
      warehouse_id: defaultWh,
      business_date: filterDate,
      notes: "Pengembalian sisa stok sore hari",
      items: returnItems,
    });
    setReturnDialogOpen(true);
  };

  const handleReturnSalesChange = (salesId) => {
    const salesInvs = inventoryItems.filter((i) => i.location_type === "SALES" && i.location_id === salesId);
    const returnItems = skus.map((s) => {
      const cur = salesInvs.find((i) => i.sku_id === s._id);
      return {
        sku_id: s._id,
        sku_code: s.code,
        sku_name: s.name,
        sales_stock: cur ? cur.available_stock : 0,
        quantity: cur ? cur.available_stock : 0,
        notes: "",
      };
    });

    setReturnForm((prev) => ({
      ...prev,
      salesman_id: salesId,
      items: returnItems,
    }));
  };

  const handleReturnItemQtyChange = (skuId, val) => {
    const q = parseInt(val) || 0;
    setReturnForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku_id === skuId ? { ...it, quantity: q } : it)),
    }));
  };

  const submitReturn = async () => {
    if (!returnForm.salesman_id) {
      toast.error("Pilih Salesman");
      return;
    }
    const validItems = returnForm.items.filter((it) => it.quantity > 0);
    if (!validItems.length) {
      toast.error("Pilih minimal 1 produk dengan kuantitas retur > 0");
      return;
    }

    setBusy(true);
    try {
      await api.post("/stock/returns", {
        ...returnForm,
        auto_confirm: true,
        items: validItems,
      });
      toast.success("Retur sisa stok berhasil diterima dan ditambahkan kembali ke stok gudang!");
      setReturnDialogOpen(false);
      loadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  const confirmReturn = async (id) => {
    setBusy(true);
    try {
      await api.post(`/stock/returns/${id}/confirm`);
      toast.success("Retur stok berhasil dikonfirmasi masuk gudang!");
      loadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  // Stock Adjustment Submit
  const submitAdjustment = async () => {
    if (!adjustForm.sku_id || !adjustForm.quantity || Number(adjustForm.quantity) <= 0) {
      toast.error("SKU dan kuantitas penyesuaian wajib diisi");
      return;
    }
    setBusy(true);
    try {
      await api.post("/inventory/adjustments", {
        ...adjustForm,
        quantity: Number(adjustForm.quantity),
      });
      toast.success("Penyesuaian stok berhasil disimpan dan tercatat di audit trail.");
      setAdjustDialogOpen(false);
      loadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  // Batch Stock Opname Handlers
  const handleOpenOpname = () => {
    const locType = "WAREHOUSE";
    const locId = offices[0]?._id || "off-1";
    prepareOpnameForm(locType, locId);
    setOpnameDialogOpen(true);
  };

  const prepareOpnameForm = (locType, locId) => {
    const opItems = skus.map((s) => {
      let sysQty = 0;
      if (locType === "SALES") {
        const inv = inventoryItems.find((i) => i.location_type === "SALES" && i.location_id === locId && i.sku_id === s._id);
        sysQty = inv ? inv.stock_on_hand : 0;
      } else {
        const inv = inventoryItems.find((i) => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === locId || i.office_id === locId) && i.sku_id === s._id);
        sysQty = inv ? inv.stock_on_hand : 0;
      }
      return {
        sku_id: s._id,
        sku_code: s.code,
        sku_name: s.name,
        category: s.category || "GENERAL",
        unit: s.unit || "Unit",
        system_qty: sysQty,
        physical_qty: sysQty, // default to system qty
        notes: "",
      };
    });

    setOpnameForm({
      location_type: locType,
      location_id: locId,
      reason: "Opname Fisik Rutin Gudang",
      notes: "",
      items: opItems,
    });
  };

  const handleOpnameLocationChange = (locType, locId) => {
    prepareOpnameForm(locType, locId);
  };

  const handleOpnamePhysicalChange = (skuId, val) => {
    const p = val === "" ? "" : parseInt(val);
    setOpnameForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku_id === skuId ? { ...it, physical_qty: p } : it)),
    }));
  };

  const submitOpname = async () => {
    const validItems = opnameForm.items
      .filter((it) => it.physical_qty !== "" && !isNaN(Number(it.physical_qty)))
      .map((it) => ({
        sku_id: it.sku_id,
        physical_qty: Number(it.physical_qty),
        notes: it.notes,
      }));

    if (!validItems.length) {
      toast.error("Masukkan hasil hitung fisik untuk minimal 1 produk.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/inventory/opname", {
        location_type: opnameForm.location_type,
        location_id: opnameForm.location_id,
        reason: opnameForm.reason,
        notes: opnameForm.notes,
        items: validItems,
      });
      toast.success(res.data.message || "Hasil Stock Opname berhasil diproses!");
      setOpnameDialogOpen(false);
      loadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  // CSV Export utility
  const exportStockToCsv = () => {
    const rows = [
      ["Kode SKU", "Nama Produk", "Kategori", "Satuan", "Stok Gudang", "Stok Sales", "Total Fisik", "Harga Pokok", "Total Valuasi", "Status Reorder"],
      ...filteredSkus.map((s) => {
        const whInv = inventoryItems.find((i) => (i.location_type === "WAREHOUSE" || !i.location_type) && i.sku_id === s._id);
        const slsInvs = inventoryItems.filter((i) => i.location_type === "SALES" && i.sku_id === s._id);
        const whStock = whInv ? whInv.available_stock : 0;
        const slsStock = slsInvs.reduce((sum, it) => sum + it.available_stock, 0);
        const totalQty = whStock + slsStock;
        const val = totalQty * (s.base_price || 0);
        const isLow = whStock <= (whInv?.reorder_level || 20);
        return [
          s.code,
          `"${s.name.replace(/"/g, '""')}"`,
          s.category || "GENERAL",
          s.unit || "Unit",
          whStock,
          slsStock,
          totalQty,
          s.base_price || 0,
          val,
          isLow ? "REORDER" : "AMAN",
        ];
      }),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Stok_Inventory_${filterDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Laporan stok inventaris berhasil diexport ke CSV.");
  };

  // Filtered Overview Data
  const filteredSkus = useMemo(() => {
    return skus.filter((s) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchCode = s.code.toLowerCase().includes(q);
        if (!matchName && !matchCode) return false;
      }
      if (stockFilterCategory !== "ALL" && s.category !== stockFilterCategory) {
        return false;
      }
      if (stockFilterStatus !== "ALL") {
        const whInv = inventoryItems.find((i) => (i.location_type === "WAREHOUSE" || !i.location_type) && i.sku_id === s._id);
        const slsInvs = inventoryItems.filter((i) => i.location_type === "SALES" && i.sku_id === s._id);
        const whStock = whInv ? whInv.available_stock : 0;
        const slsStock = slsInvs.reduce((sum, it) => sum + (it.available_stock || 0), 0);
        const isLow = whStock <= (whInv?.reorder_level || 20);

        if (stockFilterStatus === "REORDER" && !isLow) return false;
        if (stockFilterStatus === "SAFE" && isLow) return false;
        if (stockFilterStatus === "IN_SALES" && slsStock <= 0) return false;
        if (stockFilterStatus === "EMPTY" && whStock > 0) return false;
      }
      return true;
    });
  }, [skus, searchQuery, stockFilterCategory, stockFilterStatus, inventoryItems]);

  // Filtered Receivings
  const filteredReceivings = useMemo(() => {
    return receivings.filter((r) => {
      if (receivingStatusFilter !== "ALL" && r.status !== receivingStatusFilter) return false;
      if (selectedOfficeId !== "ALL" && r.warehouse_id !== selectedOfficeId) return false;
      return true;
    });
  }, [receivings, receivingStatusFilter, selectedOfficeId]);

  // Filtered Handovers
  const filteredHandovers = useMemo(() => {
    return handovers.filter((h) => {
      if (salesmanFilter !== "ALL" && h.salesman_id !== salesmanFilter) return false;
      if (selectedOfficeId !== "ALL" && h.warehouse_id !== selectedOfficeId) return false;
      return true;
    });
  }, [handovers, salesmanFilter, selectedOfficeId]);

  // Filtered Returns
  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      if (salesmanFilter !== "ALL" && r.salesman_id !== salesmanFilter) return false;
      if (selectedOfficeId !== "ALL" && r.warehouse_id !== selectedOfficeId) return false;
      return true;
    });
  }, [returns, salesmanFilter, selectedOfficeId]);

  // Filtered Movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (movementTypeFilter !== "ALL" && m.movement_type !== movementTypeFilter) return false;
      if (salesmanFilter !== "ALL" && m.salesman_id !== salesmanFilter) return false;
      return true;
    });
  }, [movements, movementTypeFilter, salesmanFilter]);

  // Calculations for overview
  const warehouseStockTotal = skus.reduce((sum, s) => {
    const whInv = inventoryItems.find((i) => (i.location_type === "WAREHOUSE" || !i.location_type) && i.sku_id === s._id);
    return sum + (whInv ? whInv.available_stock : 0);
  }, 0);

  const salesStockTotal = inventoryItems
    .filter((i) => i.location_type === "SALES")
    .reduce((sum, i) => sum + (i.available_stock || 0), 0);

  const totalAssetValue = skus.reduce((sum, s) => {
    const whInv = inventoryItems.find((i) => (i.location_type === "WAREHOUSE" || !i.location_type) && i.sku_id === s._id);
    const slsInvs = inventoryItems.filter((i) => i.location_type === "SALES" && i.sku_id === s._id);
    const totalQty = (whInv ? whInv.available_stock : 0) + slsInvs.reduce((acc, it) => acc + it.available_stock, 0);
    return sum + totalQty * (s.base_price || 0);
  }, 0);

  const reorderCount = skus.filter((s) => {
    const whInv = inventoryItems.find((i) => (i.location_type === "WAREHOUSE" || !i.location_type) && i.sku_id === s._id);
    return (whInv ? whInv.available_stock : 0) <= (whInv?.reorder_level || 20);
  }).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3" data-testid="inventory-loading">
        <Loader2 className="animate-spin text-navy" size={28} />
        <span className="text-sm text-slate-500 font-medium">Memuat sistem stok & gudang...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="inventory-page">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-2xl font-bold text-navy">Manajemen Stok & Gudang</h2>
            <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Partitioned Stock System
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Sistem serah terima pagi (Gudang → Sales), monitoring sisa stok harian, stock opname fisik, dan verifikasi retur sore.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="w-36 bg-white text-xs font-semibold"
          />

          <Button
            variant="outline"
            size="icon"
            onClick={() => loadAll(true)}
            disabled={refreshing}
            title="Muat Ulang Data Inventori"
            className="bg-white border-slate-300 text-slate-700 hover:bg-slate-50 h-9 w-9"
          >
            <RefreshCw className={refreshing ? "animate-spin text-navy" : "text-slate-600"} size={15} />
          </Button>

          <Button
            onClick={() => handleOpenNewReceiving()}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1.5 shadow-sm"
          >
            <Truck size={15} /> + Inbound PO
          </Button>

          <Button
            onClick={() => handleOpenNewHandover(false)}
            className="bg-navy hover:bg-navy-dark text-white text-xs font-bold gap-1.5 shadow-sm"
          >
            <ArrowRightLeft size={15} /> Serah Terima Pagi
          </Button>

          <Button
            onClick={() => handleOpenNewReturn()}
            variant="outline"
            className="border-slate-300 text-navy text-xs font-bold gap-1.5 bg-white hover:bg-slate-50 shadow-sm"
          >
            <RotateCcw size={15} /> Retur Sisa Sales
          </Button>

          <Button
            onClick={() => handleOpenOpname()}
            variant="outline"
            className="border-emerald-300 text-emerald-800 text-xs font-bold gap-1.5 bg-emerald-50 hover:bg-emerald-100 shadow-sm"
          >
            <FileSpreadsheet size={15} /> Stock Opname Fisik
          </Button>

          <Button
            onClick={() => setAdjustDialogOpen(true)}
            variant="outline"
            className={`border-slate-300 text-xs font-bold gap-1.5 bg-white hover:bg-slate-50 ${canAdjust ? "text-slate-700" : "text-slate-400 opacity-80"}`}
          >
            <Plus size={15} /> Penyesuaian
            {!canAdjust && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded font-normal">Admin Only</span>}
          </Button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Stok Fisik Gudang</span>
            <Building2 size={16} className="text-blue-600" />
          </div>
          <div className="mt-2 font-heading text-2xl font-bold text-navy">
            {warehouseStockTotal.toLocaleString("id-ID")} <span className="text-xs font-normal text-slate-500">Qty</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Tersedia di Gudang</span>
            {reorderCount > 0 && (
              <span className="text-red-600 font-bold text-[10px] bg-red-50 px-1.5 py-0.5 rounded">
                {reorderCount} Low Stock
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Stok di Tim Sales</span>
            <User size={16} className="text-amber-600" />
          </div>
          <div className="mt-2 font-heading text-2xl font-bold text-amber-700">
            {salesStockTotal.toLocaleString("id-ID")} <span className="text-xs font-normal text-slate-500">Qty</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Sedang dibawa {salesmen.length} Sales di lapangan</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Total Aset Fisik</span>
            <Package size={16} className="text-emerald-600" />
          </div>
          <div className="mt-2 font-heading text-2xl font-bold text-emerald-800">
            {(warehouseStockTotal + salesStockTotal).toLocaleString("id-ID")} <span className="text-xs font-normal text-slate-500">Qty</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Gudang + Seluruh Sales</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Status Rekonsiliasi</span>
            {reconciliationData?.total_discrepancies > 0 ? (
              <AlertTriangle size={16} className="text-red-500" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-500" />
            )}
          </div>
          <div className="mt-2 font-heading text-xl font-bold">
            {reconciliationData?.total_discrepancies > 0 ? (
              <span className="text-red-600 font-bold">{reconciliationData.total_discrepancies} Selisih</span>
            ) : (
              <span className="text-emerald-700 font-bold">Semua Seimbang</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Valuasi Stok: {rupiah(totalAssetValue)}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200 flex gap-4 overflow-x-auto text-sm font-semibold">
        {[
          { id: "overview", label: "Posisi Stok Real-Time", count: skus.length },
          { id: "receivings", label: "Penerimaan Barang (Inbound PO)", count: receivings.length },
          { id: "handovers", label: "Serah Terima Pagi (Handover)", count: handovers.length },
          { id: "returns", label: "Retur Sisa Sales", count: returns.length },
          { id: "monitoring", label: "Live Monitoring Sales Board", count: monitoringData?.sales_board?.length || 0 },
          { id: "movements", label: "Buku Mutasi & Audit Trail", count: movements.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 px-1 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? "border-navy text-navy font-bold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                activeTab === tab.id ? "bg-navy text-white" : "bg-slate-100 text-slate-600"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: POSISI STOK REAL-TIME */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Quick Filter Status Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStockFilterStatus("ALL")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${
                stockFilterStatus === "ALL"
                  ? "bg-navy text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Semua SKU ({skus.length})
            </button>
            <button
              onClick={() => setStockFilterStatus("REORDER")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                stockFilterStatus === "REORDER"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
              }`}
            >
              <AlertTriangle size={13} /> Reorder Alert ({reorderCount})
            </button>
            <button
              onClick={() => setStockFilterStatus("IN_SALES")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                stockFilterStatus === "IN_SALES"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
              }`}
            >
              <Users size={13} /> Ada di Sales ({skus.filter(s => inventoryItems.some(i => i.location_type === "SALES" && i.sku_id === s._id && i.available_stock > 0)).length})
            </button>
            <button
              onClick={() => setStockFilterStatus("SAFE")}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                stockFilterStatus === "SAFE"
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              <CheckCircle2 size={13} /> Stok Aman ({skus.length - reorderCount})
            </button>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                <Input
                  placeholder="Cari SKU atau nama produk..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs bg-white"
                />
              </div>

              <Select value={stockFilterCategory} onValueChange={setStockFilterCategory}>
                <SelectTrigger className="w-36 text-xs bg-white h-9">
                  <SelectValue placeholder="Semua Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Kategori</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportStockToCsv()}
                className="text-xs bg-white border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 h-9"
              >
                <Download size={14} /> Export CSV
              </Button>
              <div className="text-xs text-slate-500 font-medium">
                {filteredSkus.length} dari {skus.length} SKU
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs font-bold text-slate-700">KODE & SKU</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">KATEGORI</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">STOK GUDANG</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">STOK SALES (LAPANGAN)</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">TOTAL FISIK</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">EST. VALUASI</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">STATUS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSkus.map((s) => {
                  const whInv = inventoryItems.find((i) => (i.location_type === "WAREHOUSE" || !i.location_type) && i.sku_id === s._id);
                  const slsInvs = inventoryItems.filter((i) => i.location_type === "SALES" && i.sku_id === s._id);
                  const whStock = whInv ? whInv.available_stock : 0;
                  const slsStock = slsInvs.reduce((sum, it) => sum + it.available_stock, 0);
                  const totalQty = whStock + slsStock;
                  const val = totalQty * (s.base_price || 0);
                  const isLow = whStock <= (whInv?.reorder_level || 20);

                  return (
                    <TableRow key={s._id} className="hover:bg-slate-50/70">
                      <TableCell>
                        <div className="font-bold text-navy text-sm">{s.name}</div>
                        <div className="font-mono text-[11px] text-slate-500">{s.code} · {s.unit || "Unit"}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                          {s.category || "GENERAL"}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-heading font-bold text-sm ${isLow ? "text-red-600" : "text-navy"}`}>
                        {whStock.toLocaleString("id-ID")} {s.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {slsStock > 0 ? (
                          <button
                            onClick={() => setSkuBreakdownModal(s)}
                            className="inline-flex items-center gap-1 font-heading font-bold text-sm text-amber-700 hover:text-amber-900 hover:underline bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded transition-colors"
                            title="Klik untuk melihat rincian sales yang membawa produk ini"
                          >
                            <Users size={12} />
                            {slsStock.toLocaleString("id-ID")} {s.unit}
                          </button>
                        ) : (
                          <span className="font-heading text-sm text-slate-400">0 {s.unit}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-heading font-bold text-sm text-emerald-800">
                        {totalQty.toLocaleString("id-ID")} {s.unit}
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs text-slate-600">
                        {rupiah(val)}
                      </TableCell>
                      <TableCell className="text-center">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            <AlertTriangle size={12} /> REORDER
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={12} /> AMAN
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredSkus.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                      Tidak ada produk SKU yang cocok dengan filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 2: PENERIMAAN BARANG DARI PABRIK/SUPPLIER (RECEIVING) */}
      {activeTab === "receivings" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={receivingStatusFilter} onValueChange={setReceivingStatusFilter}>
                <SelectTrigger className="w-36 text-xs bg-white h-9">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Status</SelectItem>
                  <SelectItem value="POSTED">POSTED (Masuk Stok)</SelectItem>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="CANCELLED">BATAL</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
                <SelectTrigger className="w-44 text-xs bg-white h-9">
                  <SelectValue placeholder="Semua Gudang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Gudang / Kantor</SelectItem>
                  {offices.map((o) => (
                    <SelectItem key={o._id} value={o._id}>{o.office_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => handleOpenNewReceiving()} className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1 h-9">
              <Plus size={14} /> + Penerimaan Barang Baru (PO)
            </Button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs font-bold text-slate-700">NO. DOKUMEN & PO</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">SUPPLIER</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">GUDANG TUJUAN</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">TOTAL QTY</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">TOTAL NILAI</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">STATUS</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">AKSI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceivings.map((r) => (
                  <TableRow key={r._id} className="hover:bg-slate-50/70">
                    <TableCell>
                      <div className="font-bold text-navy text-xs font-mono">{r.receiving_code}</div>
                      <div className="text-[11px] text-slate-500 font-semibold">PO: {r.po_number || "-"}</div>
                      <div className="text-[10px] text-slate-400">{r.receiving_date}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-800 text-xs">{r.supplier_name}</div>
                      <div className="text-[11px] text-slate-500">{r.notes || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-slate-700 font-medium">{r.warehouse_name || "Gudang Pusat"}</div>
                    </TableCell>
                    <TableCell className="text-right font-heading font-bold text-sm text-emerald-700">
                      {r.total_quantity} Qty
                    </TableCell>
                    <TableCell className="text-right font-medium text-xs text-slate-600">
                      {rupiah(r.total_amount || 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        r.status === "POSTED"
                          ? "bg-emerald-100 text-emerald-800"
                          : (r.status === "CANCELLED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800")
                      }`}>
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedDetail({ type: "RECEIVING", data: r });
                            setDetailDialogOpen(true);
                          }}
                          className="h-7 px-2 text-xs font-semibold text-slate-700"
                        >
                          <Eye size={13} className="mr-1" /> Rincian
                        </Button>

                        {r.status === "DRAFT" && (
                          <>
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => postReceiving(r._id)}
                              className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                            >
                              Posting ke Stok
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => cancelReceiving(r._id)}
                              className="h-7 px-2 border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold"
                            >
                              Batal
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredReceivings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                      Belum ada catatan penerimaan barang dari supplier untuk filter ini.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 3: SERAH TERIMA PAGI (HANDOVER) */}
      {activeTab === "handovers" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={salesmanFilter} onValueChange={setSalesmanFilter}>
                <SelectTrigger className="w-44 text-xs bg-white h-9">
                  <SelectValue placeholder="Semua Salesman" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Salesman</SelectItem>
                  {salesmen.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
                <SelectTrigger className="w-44 text-xs bg-white h-9">
                  <SelectValue placeholder="Semua Gudang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Gudang / Kantor</SelectItem>
                  {offices.map((o) => (
                    <SelectItem key={o._id} value={o._id}>{o.office_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => handleOpenNewHandover(false)} className="bg-navy hover:bg-slate-800 text-white text-xs font-bold gap-1.5 h-9 shadow-sm">
                <Plus size={14} /> Serah Terima Pagi (Initial)
              </Button>
              <Button onClick={() => handleOpenNewHandover(true)} className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold gap-1.5 h-9 shadow-sm">
                <PlusCircle size={14} /> Tambah Stok Sales (Additional)
              </Button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs font-bold text-slate-700">KODE HANDOVER</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">SALESMAN</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">TIPE</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">TOTAL QTY</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">EST. NILAI</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">STATUS</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">AKSI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHandovers.map((h) => (
                  <TableRow key={h._id} className="hover:bg-slate-50/70">
                    <TableCell>
                      <div className="font-bold text-navy text-xs font-mono">{h.handover_code}</div>
                      <div className="text-[11px] text-slate-400">{h.business_date}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-800 text-xs">{h.salesman_name}</div>
                      <div className="text-[11px] text-slate-500">{h.warehouse_name}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${
                        h.is_additional ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {h.is_additional ? "Tambahan Siang" : "Reguler Pagi"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-heading font-bold text-sm text-navy">
                      {h.total_quantity} Qty
                    </TableCell>
                    <TableCell className="text-right font-medium text-xs text-slate-600">
                      {rupiah(h.total_estimated_value || 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={h.status === "CONFIRMED" ? "EFFECTIVE" : (h.status === "CANCELLED" ? "MISSED" : "PLAN")} label={h.status} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedDetail({ type: "HANDOVER", data: h });
                            setDetailDialogOpen(true);
                          }}
                          className="h-7 px-2 text-xs font-semibold text-slate-700"
                        >
                          <Eye size={13} className="mr-1" /> Rincian
                        </Button>

                        {h.status === "DRAFT" && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => confirmHandover(h._id)}
                            className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          >
                            Konfirmasi Transfer
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredHandovers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                      Belum ada serah terima stok untuk tanggal {filterDate}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 4: RETUR SISA SALES */}
      {activeTab === "returns" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={salesmanFilter} onValueChange={setSalesmanFilter}>
                <SelectTrigger className="w-44 text-xs bg-white h-9">
                  <SelectValue placeholder="Semua Salesman" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Salesman</SelectItem>
                  {salesmen.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => handleOpenNewReturn()} className="bg-navy text-white text-xs font-bold gap-1 h-9">
              <RotateCcw size={14} /> Input Retur Sales
            </Button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs font-bold text-slate-700">KODE RETUR</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">SALESMAN</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">TOTAL QTY RETUR</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">CATATAN</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">STATUS</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-center">AKSI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.map((r) => (
                  <TableRow key={r._id} className="hover:bg-slate-50/70">
                    <TableCell>
                      <div className="font-bold text-navy text-xs font-mono">{r.return_code}</div>
                      <div className="text-[11px] text-slate-400">{r.business_date}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-800 text-xs">{r.salesman_name}</div>
                      <div className="text-[11px] text-slate-500">{r.warehouse_name}</div>
                    </TableCell>
                    <TableCell className="text-right font-heading font-bold text-sm text-purple-700">
                      {r.total_quantity} Qty
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-xs truncate">
                      {r.notes || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={r.status === "CONFIRMED" ? "EFFECTIVE" : "PLAN"} label={r.status} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedDetail({ type: "RETURN", data: r });
                            setDetailDialogOpen(true);
                          }}
                          className="h-7 px-2 text-xs font-semibold text-slate-700"
                        >
                          <Eye size={13} className="mr-1" /> Rincian
                        </Button>

                        {r.status === "DRAFT" && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => confirmReturn(r._id)}
                            className="h-7 px-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                          >
                            Terima Retur
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredReturns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-400 text-xs">
                      Belum ada pencatatan retur sisa stok untuk tanggal {filterDate}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 5: LIVE MONITORING SALES BOARD */}
      {activeTab === "monitoring" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Papan live status pergerakan stok harian untuk seluruh tim Salesman lapangan ({filterDate}).
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAll()}
              className="text-xs bg-white text-navy font-semibold gap-1"
            >
              <RefreshCw size={13} /> Refresh Data
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {monitoringData?.sales_board?.map((sb) => (
              <div key={sb.salesman_id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-heading font-bold text-navy text-base">{sb.salesman_name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{sb.salesman_code} · {sb.phone}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    sb.handover_status === "CONFIRMED" ? "bg-emerald-100 text-emerald-700" : (sb.handover_status === "DRAFT" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")
                  }`}>
                    {sb.handover_status === "CONFIRMED" ? "STOK AKTIF" : (sb.handover_status === "DRAFT" ? "DRAFT" : "BELUM AMBIL")}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-lg text-center">
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Dibawa</div>
                    <div className="font-heading font-bold text-blue-700 text-sm">{sb.stok_dibawa}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Terjual</div>
                    <div className="font-heading font-bold text-emerald-700 text-sm">{sb.stok_terjual}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Retur</div>
                    <div className="font-heading font-bold text-purple-700 text-sm">{sb.stok_return}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Sisa Fisik</div>
                    <div className="font-heading font-bold text-navy text-sm">{sb.sisa_stok}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Outlet Call: <b>{sb.outlet_calls}</b></span>
                    <span className="text-slate-500">EC: <b>{sb.effective_calls}</b></span>
                  </div>

                  {sb.has_discrepancy ? (
                    <span className="text-red-600 font-bold text-[11px] flex items-center gap-1">
                      <AlertTriangle size={12} /> Selisih ({sb.variance > 0 ? `+${sb.variance}` : sb.variance})
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1">
                      <CheckCircle2 size={12} /> Seimbang (0)
                    </span>
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenNewReturn(sb.salesman_id)}
                    className="flex-1 h-8 text-xs font-bold border-slate-300 text-navy hover:bg-slate-50"
                  >
                    <RotateCcw size={12} className="mr-1" /> Terima Retur
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: BUKU MUTASI & AUDIT TRAIL */}
      {activeTab === "movements" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={movementTypeFilter} onValueChange={setMovementTypeFilter}>
                <SelectTrigger className="w-44 text-xs bg-white h-9">
                  <SelectValue placeholder="Semua Jenis Mutasi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Jenis Mutasi</SelectItem>
                  <SelectItem value="PURCHASE_IN">PURCHASE_IN (Inbound PO)</SelectItem>
                  <SelectItem value="TRANSFER_IN">TRANSFER_IN (Handover Pagi)</SelectItem>
                  <SelectItem value="SALES_OUT">SALES_OUT (Penjualan)</SelectItem>
                  <SelectItem value="RETURN_IN">RETURN_IN (Retur Sore)</SelectItem>
                  <SelectItem value="ADJUSTMENT_IN">ADJUSTMENT_IN (+ Penyesuaian)</SelectItem>
                  <SelectItem value="ADJUSTMENT_OUT">ADJUSTMENT_OUT (- Penyesuaian)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={salesmanFilter} onValueChange={setSalesmanFilter}>
                <SelectTrigger className="w-44 text-xs bg-white h-9">
                  <SelectValue placeholder="Semua Salesman" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Salesman</SelectItem>
                  {salesmen.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              {filteredMovements.length} mutasi tercatat
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs font-bold text-slate-700">WAKTU & NO. MUTASI</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">SKU</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">JENIS MUTASI</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700 text-right">QTY</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">LOKASI ASAL → TUJUAN</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">SALES / OPERATOR</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">CATATAN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((m) => (
                  <TableRow key={m._id} className="hover:bg-slate-50/70">
                    <TableCell>
                      <div className="font-mono text-xs font-bold text-navy">{m.movement_code || m._id}</div>
                      <div className="text-[11px] text-slate-400">{fmtDateTime(m.created_at)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-800 text-xs">{m.sku_name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{m.sku_code}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        m.movement_type === "TRANSFER_IN" || m.movement_type === "PURCHASE_IN" || m.movement_type === "RETURN_IN"
                          ? "bg-emerald-100 text-emerald-800"
                          : (m.movement_type === "SALES_OUT" || m.movement_type === "TRANSFER_OUT" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800")
                      }`}>
                        {m.movement_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-heading font-bold text-sm text-navy">
                      {m.quantity} {m.unit || ""}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {m.source_location_type} → {m.destination_location_type}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {m.salesman_name !== "-" ? m.salesman_name : m.creator_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-xs truncate">
                      {m.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredMovements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                      Belum ada mutasi stok tercatat untuk filter ini
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* DIALOG: BUAT PENERIMAAN BARANG BARU (PO PABRIK / SUPPLIER) */}
      <Dialog open={receivingDialogOpen} onOpenChange={setReceivingDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-bold text-navy flex items-center gap-2">
              <Truck size={20} className="text-emerald-700" /> Penerimaan Barang Masuk (Inbound PO Supplier)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Registrasi stok masuk dari pabrik / supplier pusat ke dalam inventaris gudang.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs font-bold">Nama Supplier / Pabrik *</Label>
                <Input
                  placeholder="Contoh: PT Sumber Pangan Nusantara"
                  value={receivingForm.supplier_name}
                  onChange={(e) => setReceivingForm((prev) => ({ ...prev, supplier_name: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nomor Purchase Order (PO)</Label>
                <Input
                  placeholder="PO-2026-XXXX"
                  value={receivingForm.po_number}
                  onChange={(e) => setReceivingForm((prev) => ({ ...prev, po_number: e.target.value }))}
                  className="text-xs bg-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Tanggal Penerimaan *</Label>
                <Input
                  type="date"
                  value={receivingForm.receiving_date}
                  onChange={(e) => setReceivingForm((prev) => ({ ...prev, receiving_date: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Gudang / Kantor Penerima *</Label>
              <Select
                value={receivingForm.warehouse_id}
                onValueChange={(v) => setReceivingForm((prev) => ({ ...prev, warehouse_id: v }))}
              >
                <SelectTrigger className="text-xs bg-white"><SelectValue placeholder="Pilih Gudang" /></SelectTrigger>
                <SelectContent>
                  {offices.map((o) => (
                    <SelectItem key={o._id} value={o._id}>{o.office_name} ({o.office_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* List SKU Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700">Daftar Produk Masuk (SKU & Kuantitas Fisik)</Label>
                <span className="text-xs text-slate-500 font-medium">
                  Total Qty: <b className="text-emerald-700">{receivingForm.items.reduce((s, it) => s + (it.quantity || 0), 0)}</b> | Subtotal: <b className="text-navy">{rupiah(receivingForm.items.reduce((s, it) => s + ((it.quantity || 0) * (it.unit_price || 0)), 0))}</b>
                </span>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Produk SKU</TableHead>
                      <TableHead className="text-xs text-right w-36">Harga Beli / Satuan</TableHead>
                      <TableHead className="text-xs text-right w-32">Kuantitas Masuk (Qty)</TableHead>
                      <TableHead className="text-xs text-right w-32">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivingForm.items.map((it) => {
                      const subtotal = (it.quantity || 0) * (it.unit_price || 0);
                      return (
                        <TableRow key={it.sku_id}>
                          <TableCell>
                            <div className="font-bold text-navy text-xs">{it.sku_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{it.sku_code}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              value={it.unit_price || ""}
                              onChange={(e) => handleReceivingItemPriceChange(it.sku_id, e.target.value)}
                              className="h-8 text-xs text-right font-medium"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              value={it.quantity || ""}
                              onChange={(e) => handleReceivingItemQtyChange(it.sku_id, e.target.value)}
                              className="h-8 text-xs text-right font-bold text-emerald-700 bg-emerald-50/50"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold text-slate-700">
                            {rupiah(subtotal)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Catatan Penerimaan</Label>
                <Input
                  placeholder="Contoh: Pengiriman batch pabrik lot A-01"
                  value={receivingForm.notes}
                  onChange={(e) => setReceivingForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="auto_post_rcv"
                  checked={receivingForm.auto_post}
                  onChange={(e) => setReceivingForm((prev) => ({ ...prev, auto_post: e.target.checked }))}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="auto_post_rcv" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Langsung posting ke stok Gudang (Auto-Post & Update Inventory)
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReceivingDialogOpen(false)} className="text-xs">
              Batal
            </Button>
            <Button disabled={busy} onClick={() => submitReceiving()} className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold">
              {busy ? <Loader2 className="animate-spin mr-1" size={14} /> : <CheckCircle2 className="mr-1" size={14} />}
              Simpan Penerimaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: BUAT SERAH TERIMA PAGI / TAMBAHAN (HANDOVER) */}
      <Dialog open={handoverDialogOpen} onOpenChange={setHandoverDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="font-heading text-lg font-bold text-navy flex items-center gap-2">
                <ArrowRightLeft size={18} />
                {handoverForm.is_additional ? "Stock Handover Tambahan (Warehouse → Sales)" : "Serah Terima Stok Pagi (Warehouse → Sales)"}
              </DialogTitle>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${
                handoverForm.is_additional ? "bg-purple-100 text-purple-700 border border-purple-200" : "bg-blue-100 text-blue-700 border border-blue-200"
              }`}>
                {handoverForm.is_additional ? "TAMBAH STOK SALES" : "STOK AWAL PAGI"}
              </span>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              {handoverForm.is_additional
                ? "Restock produk tambahan untuk salesman di lapangan tanpa menghapus riwayat serah terima sebelumnya. Saldo stok salesman akan diakumulasikan secara instan."
                : "Serah terima stok awal sebelum salesman melakukan kunjungan rute outlet harian."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Tipe Handover Selector */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setHandoverForm((prev) => ({ ...prev, is_additional: false, handover_type: "INITIAL_HANDOVER", notes: "Serah terima pagi reguler" }))}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-colors ${
                  !handoverForm.is_additional ? "bg-white text-navy shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Serah Terima Pagi (Initial)
              </button>
              <button
                type="button"
                onClick={() => setHandoverForm((prev) => ({ ...prev, is_additional: true, handover_type: "ADDITIONAL_HANDOVER", notes: "Tambahan stok restock siang/sore" }))}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-colors ${
                  handoverForm.is_additional ? "bg-purple-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Stock Handover Tambahan (Restock)
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs font-bold">Pilih Salesman Penerima *</Label>
                <Select
                  value={handoverForm.salesman_id}
                  onValueChange={(v) => setHandoverForm((prev) => ({ ...prev, salesman_id: v }))}
                >
                  <SelectTrigger className="text-xs bg-white"><SelectValue placeholder="Pilih Salesman" /></SelectTrigger>
                  <SelectContent>
                    {salesmen.map((s) => (
                      <SelectItem key={s._id} value={s._id}>{s.name} ({s.code || s._id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Gudang Asal *</Label>
                <Select
                  value={handoverForm.warehouse_id}
                  onValueChange={(v) => setHandoverForm((prev) => ({ ...prev, warehouse_id: v }))}
                >
                  <SelectTrigger className="text-xs bg-white"><SelectValue placeholder="Pilih Gudang" /></SelectTrigger>
                  <SelectContent>
                    {offices.map((o) => (
                      <SelectItem key={o._id} value={o._id}>{o.office_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Tanggal & Waktu *</Label>
                <div className="flex gap-1.5">
                  <Input
                    type="date"
                    value={handoverForm.business_date}
                    onChange={(e) => setHandoverForm((prev) => ({ ...prev, business_date: e.target.value }))}
                    className="text-xs bg-white flex-1"
                  />
                  <Input
                    type="time"
                    value={handoverForm.handover_time || "08:00"}
                    onChange={(e) => setHandoverForm((prev) => ({ ...prev, handover_time: e.target.value }))}
                    className="text-xs bg-white w-24"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700">Daftar Produk yang Diserahkan</Label>
                <span className="text-xs text-slate-500 font-medium">
                  Total Diserahkan: <b className="text-navy">{handoverForm.items.reduce((s, it) => s + (it.quantity || 0), 0)} Qty</b>
                </span>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Produk SKU</TableHead>
                      <TableHead className="text-xs text-right">Stok Gudang</TableHead>
                      <TableHead className="text-xs text-right">Stok Sales Sekarang</TableHead>
                      <TableHead className="text-xs text-right w-36">Kuantitas Serah (Qty)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {handoverForm.items.map((it) => {
                      const whInv = inventoryItems.find((i) => (i.location_type === "WAREHOUSE" || !i.location_type) && i.sku_id === it.sku_id && (!handoverForm.warehouse_id || i.location_id === handoverForm.warehouse_id));
                      const salesInv = inventoryItems.find((i) => i.location_type === "SALES" && i.location_id === handoverForm.salesman_id && i.sku_id === it.sku_id);
                      const avail = whInv ? whInv.available_stock : 0;
                      const salesStock = salesInv ? salesInv.available_stock : 0;
                      const isExceed = it.quantity > avail;
                      return (
                        <TableRow key={it.sku_id} className="hover:bg-slate-50/50">
                          <TableCell>
                            <div className="font-bold text-navy text-xs">{it.sku_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{it.sku_code}</div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold text-slate-700">
                            {avail} {it.unit || ""}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold text-purple-700">
                            {salesStock} {it.unit || ""}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min="0"
                                max={avail}
                                value={it.quantity || ""}
                                onChange={(e) => handleHandoverItemQtyChange(it.sku_id, e.target.value)}
                                className={`h-8 w-24 text-xs text-right font-bold ${isExceed ? "border-red-500 text-red-600 bg-red-50" : ""}`}
                                placeholder="0"
                              />
                              <span className="text-[11px] text-slate-500 w-8">{it.unit || "Pcs"}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Catatan Serah Terima (Opsional)</Label>
              <Input
                placeholder="Contoh: Stok reguler rute Cianjur Kota / Tambahan stok urgent"
                value={handoverForm.notes}
                onChange={(e) => setHandoverForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHandoverDialogOpen(false)} className="text-xs">
              Batal
            </Button>
            <Button disabled={busy} onClick={() => submitHandover()} className={`${handoverForm.is_additional ? "bg-purple-700 hover:bg-purple-800" : "bg-navy hover:bg-slate-800"} text-white text-xs font-bold`}>
              {busy ? <Loader2 className="animate-spin mr-1" size={14} /> : <CheckCircle2 className="mr-1" size={14} />}
              {handoverForm.is_additional ? "Konfirmasi & Tambahkan Stok Sales" : "Konfirmasi & Serahkan Stok Pagi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: INPUT RETUR SISA SALES */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-bold text-navy flex items-center gap-2">
              <RotateCcw size={18} /> Penerimaan Retur Sisa Stok Sales (Sales → Gudang)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Verifikasi sisa stok fisik yang dikembalikan oleh salesman pada sore hari untuk dimasukkan kembali ke inventaris gudang.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Salesman *</Label>
                <Select
                  value={returnForm.salesman_id}
                  onValueChange={handleReturnSalesChange}
                >
                  <SelectTrigger className="text-xs bg-white"><SelectValue placeholder="Pilih Salesman" /></SelectTrigger>
                  <SelectContent>
                    {salesmen.map((s) => (
                      <SelectItem key={s._id} value={s._id}>{s.name} ({s.code || s._id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Gudang Penerima *</Label>
                <Select
                  value={returnForm.warehouse_id}
                  onValueChange={(v) => setReturnForm((prev) => ({ ...prev, warehouse_id: v }))}
                >
                  <SelectTrigger className="text-xs bg-white"><SelectValue placeholder="Pilih Gudang" /></SelectTrigger>
                  <SelectContent>
                    {offices.map((o) => (
                      <SelectItem key={o._id} value={o._id}>{o.office_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Tanggal Pengembalian *</Label>
                <Input
                  type="date"
                  value={returnForm.business_date}
                  onChange={(e) => setReturnForm((prev) => ({ ...prev, business_date: e.target.value }))}
                  className="text-xs bg-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700">Daftar Produk yang Dikembalikan</Label>
                <span className="text-xs text-slate-500 font-medium">
                  Total Retur: <b className="text-purple-700">{returnForm.items.reduce((s, it) => s + (it.quantity || 0), 0)} Qty</b>
                </span>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Produk SKU</TableHead>
                      <TableHead className="text-xs text-right">Sisa di Tangan Sales</TableHead>
                      <TableHead className="text-xs text-right w-32">Kuantitas Retur (Qty)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnForm.items.map((it) => {
                      const isExceed = it.quantity > it.sales_stock;
                      return (
                        <TableRow key={it.sku_id}>
                          <TableCell>
                            <div className="font-bold text-navy text-xs">{it.sku_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{it.sku_code}</div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold text-amber-700">
                            {it.sales_stock} {it.unit || ""}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              max={it.sales_stock}
                              value={it.quantity || ""}
                              onChange={(e) => handleReturnItemQtyChange(it.sku_id, e.target.value)}
                              className={`h-8 text-xs text-right font-bold ${isExceed ? "border-red-500 text-red-600 bg-red-50" : ""}`}
                              placeholder="0"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Catatan Retur</Label>
              <Input
                placeholder="Contoh: Sisa kunjungan rute sore"
                value={returnForm.notes}
                onChange={(e) => setReturnForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)} className="text-xs">
              Batal
            </Button>
            <Button disabled={busy} onClick={() => submitReturn()} className="bg-navy text-white text-xs font-bold">
              {busy ? <Loader2 className="animate-spin mr-1" size={14} /> : <RotateCcw className="mr-1" size={14} />}
              Verifikasi & Terima ke Gudang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: STOCK OPNAME FISIK BATCH */}
      <Dialog open={opnameDialogOpen} onOpenChange={setOpnameDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-bold text-navy flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-emerald-700" /> Stock Opname Fisik & Rekonsiliasi
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Perhitungan fisik berkala per gudang/sales. Sistem akan otomatis menghitung selisih dan membuat mutasi penyesuaian (ADJUSTMENT_IN/OUT).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Tipe Lokasi Opname *</Label>
                <Select
                  value={opnameForm.location_type}
                  onValueChange={(v) => handleOpnameLocationChange(v, v === "WAREHOUSE" ? (offices[0]?._id || "off-1") : (salesmen[0]?._id || ""))}
                >
                  <SelectTrigger className="text-xs bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WAREHOUSE">Gudang / Kantor Cabang</SelectItem>
                    <SelectItem value="SALES">Stok di Tangan Salesman</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">
                  {opnameForm.location_type === "WAREHOUSE" ? "Pilih Gudang / Kantor *" : "Pilih Salesman *"}
                </Label>
                <Select
                  value={opnameForm.location_id}
                  onValueChange={(v) => handleOpnameLocationChange(opnameForm.location_type, v)}
                >
                  <SelectTrigger className="text-xs bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {opnameForm.location_type === "WAREHOUSE" ? (
                      offices.map((o) => (
                        <SelectItem key={o._id} value={o._id}>{o.office_name}</SelectItem>
                      ))
                    ) : (
                      salesmen.map((s) => (
                        <SelectItem key={s._id} value={s._id}>{s.name} ({s.code || s._id})</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Alasan Opname</Label>
                <Input
                  value={opnameForm.reason}
                  onChange={(e) => setOpnameForm((prev) => ({ ...prev, reason: e.target.value }))}
                  className="text-xs bg-white"
                  placeholder="Opname Fisik Rutin"
                />
              </div>
            </div>

            {/* List SKU Opname Table */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 text-slate-400" size={13} />
                  <Input
                    placeholder="Cari SKU..."
                    value={opnameSearch}
                    onChange={(e) => setOpnameSearch(e.target.value)}
                    className="pl-8 h-8 text-xs bg-white"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOpnameForm((prev) => ({
                        ...prev,
                        items: prev.items.map((it) => ({ ...it, physical_qty: it.system_qty })),
                      }));
                      toast.info("Semua kuantitas fisik disamakan dengan sistem.");
                    }}
                    className="h-8 text-[11px] font-bold text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                  >
                    <CheckCircle2 size={12} className="mr-1" /> Samakan dg Sistem
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOpnameForm((prev) => ({
                        ...prev,
                        items: prev.items.map((it) => ({ ...it, physical_qty: 0 })),
                      }));
                      toast.info("Semua kuantitas fisik direset ke 0.");
                    }}
                    className="h-8 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-300"
                  >
                    <RotateCcw size={12} className="mr-1" /> Reset ke 0
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Daftar {opnameForm.items.length} SKU untuk diverifikasi:</span>
                <div>
                  {(() => {
                    const diffCount = opnameForm.items.filter((it) => {
                      const p = Number(it.physical_qty);
                      return !isNaN(p) && p !== it.system_qty;
                    }).length;
                    return diffCount > 0 ? (
                      <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded">
                        {diffCount} SKU Memiliki Selisih Fisik
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                        Semua Fisik Sesuai Sistem (0 Selisih)
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Produk SKU</TableHead>
                      <TableHead className="text-xs text-right">Stok Sistem</TableHead>
                      <TableHead className="text-xs text-right w-36">Hitung Fisik (Qty)</TableHead>
                      <TableHead className="text-xs text-right">Selisih (+/-)</TableHead>
                      <TableHead className="text-xs text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opnameForm.items
                      .filter((it) => !opnameSearch || it.sku_name.toLowerCase().includes(opnameSearch.toLowerCase()) || it.sku_code.toLowerCase().includes(opnameSearch.toLowerCase()))
                      .map((it) => {
                        const p = Number(it.physical_qty);
                        const variance = isNaN(p) ? 0 : p - it.system_qty;
                        return (
                          <TableRow key={it.sku_id} className={variance !== 0 ? "bg-amber-50/30" : ""}>
                            <TableCell>
                              <div className="font-bold text-navy text-xs">{it.sku_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{it.sku_code}</div>
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold text-slate-600">
                              {it.system_qty} {it.unit}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="0"
                                value={it.physical_qty === "" ? "" : it.physical_qty}
                                onChange={(e) => handleOpnamePhysicalChange(it.sku_id, e.target.value)}
                                className={`h-8 text-xs text-right font-bold ${
                                  variance > 0
                                    ? "border-emerald-500 text-emerald-700 bg-emerald-50/50"
                                    : variance < 0
                                    ? "border-red-500 text-red-600 bg-red-50/50"
                                    : "bg-white"
                                }`}
                              />
                            </TableCell>
                            <TableCell className="text-right font-heading font-bold text-xs">
                              {variance > 0 ? (
                                <span className="text-emerald-700">+{variance}</span>
                              ) : variance < 0 ? (
                                <span className="text-red-600">{variance}</span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {variance === 0 ? (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                                  COCOK
                                </span>
                              ) : variance > 0 ? (
                                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                                  SURPLUS
                                </span>
                              ) : (
                                <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">
                                  DEFISIT
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Catatan Verifikasi Opname</Label>
              <Input
                placeholder="Contoh: Opname fisik akhir bulan disaksikan supervisor gudang"
                value={opnameForm.notes}
                onChange={(e) => setOpnameForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpnameDialogOpen(false)} className="text-xs">
              Batal
            </Button>
            <Button disabled={busy} onClick={() => submitOpname()} className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold">
              {busy ? <Loader2 className="animate-spin mr-1" size={14} /> : <CheckCircle2 className="mr-1" size={14} />}
              Proses Rekonsiliasi & Simpan Opname
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: PENYESUAIAN STOK */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-bold text-navy">
              Penyesuaian Stok (Stock Adjustment)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Gunakan untuk koreksi manual selisih fisik, barang rusak/kemasan cacat, atau sampel promosi.
            </DialogDescription>
          </DialogHeader>

          {!canAdjust && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2 text-xs text-amber-800">
              <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Akses Dibatasi</div>
                <div>Penyesuaian stok langsung hanya dapat dilakukan oleh role <b>OWNER</b>, <b>ADMIN</b>, atau <b>WAREHOUSE</b>.</div>
              </div>
            </div>
          )}

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Lokasi Stok *</Label>
              <Select
                disabled={!canAdjust}
                value={adjustForm.location_type}
                onValueChange={(v) => setAdjustForm((prev) => ({
                  ...prev,
                  location_type: v,
                  location_id: v === "WAREHOUSE" ? (offices[0]?._id || "off-1") : (salesmen[0]?._id || "")
                }))}
              >
                <SelectTrigger className="text-xs"><SelectValue placeholder="Pilih Lokasi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WAREHOUSE">Gudang / Kantor</SelectItem>
                  <SelectItem value="SALES">Stok Sales Lapangan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {adjustForm.location_type === "WAREHOUSE" ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Pilih Gudang *</Label>
                <Select
                  disabled={!canAdjust}
                  value={adjustForm.location_id}
                  onValueChange={(v) => setAdjustForm((prev) => ({ ...prev, location_id: v }))}
                >
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Pilih Gudang" /></SelectTrigger>
                  <SelectContent>
                    {offices.map((o) => (
                      <SelectItem key={o._id} value={o._id}>{o.office_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Pilih Salesman *</Label>
                <Select
                  disabled={!canAdjust}
                  value={adjustForm.location_id}
                  onValueChange={(v) => setAdjustForm((prev) => ({ ...prev, location_id: v }))}
                >
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Pilih Salesman" /></SelectTrigger>
                  <SelectContent>
                    {salesmen.map((s) => (
                      <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Pilih SKU *</Label>
              <Select
                disabled={!canAdjust}
                value={adjustForm.sku_id}
                onValueChange={(v) => setAdjustForm((prev) => ({ ...prev, sku_id: v }))}
              >
                <SelectTrigger className="text-xs"><SelectValue placeholder="Pilih SKU" /></SelectTrigger>
                <SelectContent>
                  {skus.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.name} ({s.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Jenis Penyesuaian</Label>
                <Select
                  disabled={!canAdjust}
                  value={adjustForm.adjustment_type}
                  onValueChange={(v) => setAdjustForm((prev) => ({ ...prev, adjustment_type: v }))}
                >
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Tambah Stok (+ IN)</SelectItem>
                    <SelectItem value="OUT">Kurang Stok (- OUT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Jumlah (Qty) *</Label>
                <Input
                  disabled={!canAdjust}
                  type="number"
                  min="1"
                  value={adjustForm.quantity}
                  onChange={(e) => setAdjustForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  className="text-xs font-bold"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Alasan Penyesuaian *</Label>
              <Select
                disabled={!canAdjust}
                value={adjustForm.reason}
                onValueChange={(v) => setAdjustForm((prev) => ({ ...prev, reason: v }))}
              >
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HASIL_OPNAME">Hasil Stock Opname Fisik</SelectItem>
                  <SelectItem value="KEMASAN_RUSAK">Barang Rusak / Kemasan Cacat</SelectItem>
                  <SelectItem value="KOREKSI_INPUT">Koreksi Kesalahan Input Admin</SelectItem>
                  <SelectItem value="SAMPEL_PROMOSI">Pengeluaran Sampel Promosi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Keterangan Tambahan</Label>
              <Input
                disabled={!canAdjust}
                value={adjustForm.notes}
                onChange={(e) => setAdjustForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="text-xs"
                placeholder="Catatan verifikator..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} className="text-xs">
              Batal
            </Button>
            <Button disabled={busy || !canAdjust} onClick={() => submitAdjustment()} className="bg-navy text-white text-xs font-bold">
              {busy ? <Loader2 className="animate-spin mr-1" size={14} /> : null}
              Simpan Penyesuaian
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: DETAIL RINCIAN */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-base font-bold text-navy">
              {selectedDetail?.type === "RECEIVING"
                ? "Detail Penerimaan Barang Supplier (Inbound PO)"
                : (selectedDetail?.type === "HANDOVER" ? "Detail Serah Terima Stok Pagi" : "Detail Pengembalian Retur Sisa")}
            </DialogTitle>
          </DialogHeader>

          {selectedDetail?.data && (
            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nomor Dokumen:</span>
                  <span className="font-bold font-mono text-navy">
                    {selectedDetail.data.receiving_code || selectedDetail.data.handover_code || selectedDetail.data.return_code}
                  </span>
                </div>
                {selectedDetail.data.po_number && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nomor PO:</span>
                    <span className="font-semibold font-mono">{selectedDetail.data.po_number}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Tanggal:</span>
                  <span className="font-semibold">{selectedDetail.data.receiving_date || selectedDetail.data.business_date}</span>
                </div>
                {selectedDetail.data.supplier_name && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Supplier:</span>
                    <span className="font-bold">{selectedDetail.data.supplier_name}</span>
                  </div>
                )}
                {selectedDetail.data.salesman_name && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Salesman:</span>
                    <span className="font-bold">{selectedDetail.data.salesman_name}</span>
                  </div>
                )}
                {selectedDetail.data.warehouse_name && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gudang:</span>
                    <span className="font-bold">{selectedDetail.data.warehouse_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-bold text-emerald-700">{selectedDetail.data.status}</span>
                </div>
                {selectedDetail.data.total_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Nilai:</span>
                    <span className="font-bold text-navy">{rupiah(selectedDetail.data.total_amount)}</span>
                  </div>
                )}
                {selectedDetail.data.notes && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Catatan:</span>
                    <span className="text-slate-700">{selectedDetail.data.notes}</span>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Produk</TableHead>
                      {selectedDetail.type === "RECEIVING" && (
                        <TableHead className="text-xs text-right">Harga Beli</TableHead>
                      )}
                      <TableHead className="text-xs text-right">Kuantitas</TableHead>
                      {selectedDetail.type === "RECEIVING" && (
                        <TableHead className="text-xs text-right">Subtotal</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedDetail.data.items || []).map((it, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="font-bold text-navy">{it.sku_name || it.sku_code || "SKU"}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{it.sku_code}</div>
                        </TableCell>
                        {selectedDetail.type === "RECEIVING" && (
                          <TableCell className="text-right text-xs">
                            {rupiah(it.unit_price || 0)}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-bold text-sm">
                          {it.quantity} {it.unit || ""}
                        </TableCell>
                        {selectedDetail.type === "RECEIVING" && (
                          <TableCell className="text-right font-semibold text-xs text-slate-700">
                            {rupiah((it.quantity || 0) * (it.unit_price || 0))}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button onClick={() => setDetailDialogOpen(false)} className="w-full bg-navy text-white text-xs">
                Tutup
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG: RINCIAN STOK SALES PER SKU */}
      <Dialog open={!!skuBreakdownModal} onOpenChange={(open) => !open && setSkuBreakdownModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-base font-bold text-navy flex items-center gap-2">
              <Users size={18} className="text-amber-600" /> Rincian Stok di Tangan Salesman
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Daftar salesman yang saat ini membawa produk <b>{skuBreakdownModal?.name}</b> ({skuBreakdownModal?.code}).
            </DialogDescription>
          </DialogHeader>

          {skuBreakdownModal && (
            <div className="space-y-3 py-1">
              <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-800">{skuBreakdownModal.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{skuBreakdownModal.code}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Total di Sales</div>
                  <div className="font-heading font-bold text-base text-amber-700">
                    {inventoryItems
                      .filter((i) => i.location_type === "SALES" && i.sku_id === skuBreakdownModal._id)
                      .reduce((sum, it) => sum + (it.available_stock || 0), 0)}{" "}
                    {skuBreakdownModal.unit || "Unit"}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs font-bold">SALESMAN</TableHead>
                      <TableHead className="text-xs font-bold text-right">STOK FISIK</TableHead>
                      <TableHead className="text-xs font-bold text-right">EST. NILAI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const salesHolding = inventoryItems.filter(
                        (i) => i.location_type === "SALES" && i.sku_id === skuBreakdownModal._id && (i.available_stock || 0) > 0
                      );

                      if (salesHolding.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-6 text-slate-400 text-xs">
                              Tidak ada salesman yang sedang membawa stok produk ini.
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return salesHolding.map((inv) => {
                        const salesman = salesmen.find((s) => s._id === inv.location_id);
                        const val = (inv.available_stock || 0) * (skuBreakdownModal.base_price || 0);
                        return (
                          <TableRow key={inv._id || inv.location_id}>
                            <TableCell>
                              <div className="font-bold text-slate-800 text-xs">
                                {salesman?.name || inv.salesman_name || inv.location_id}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {salesman?.code || "SALES"} · {salesman?.phone || "-"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-heading font-bold text-xs text-amber-700">
                              {inv.available_stock} {skuBreakdownModal.unit || "Unit"}
                            </TableCell>
                            <TableCell className="text-right font-medium text-[11px] text-slate-600">
                              {rupiah(val)}
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </div>

              <Button onClick={() => setSkuBreakdownModal(null)} className="w-full bg-navy text-white text-xs">
                Tutup
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
