import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Receipt,
  Search,
  Calendar,
  Layers,
  DollarSign,
  ShoppingBag,
  Filter,
  Eye,
  Ban,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  ArrowUpDown,
  Printer,
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import { rupiah, fmtDateTime, todayLocal } from "../../lib/format";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useAuth } from "../../context/AuthContext";

export default function TransactionsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Cancellation State
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (date) params.date = date;
      const { data } = await api.get("/transactions", { params });
      setItems(data.items || []);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const viewDetail = async (txn) => {
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/transactions/${txn._id || txn.invoice_number}`);
      setDetail(data);
    } catch (e) {
      setDetail(txn);
    }
    setLoadingDetail(false);
  };

  const handleCancelTransaction = async () => {
    if (!cancelReason.trim()) {
      toast.error("Alasan pembatalan transaksi wajib diisi.");
      return;
    }
    setCancelling(true);
    try {
      await api.post(`/transactions/${detail._id}/cancel`, { reason: cancelReason });
      toast.success("Transaksi berhasil dibatalkan dan stok dikembalikan.");
      setCancelDialogOpen(false);
      setCancelReason("");
      setDetail((prev) => (prev ? { ...prev, status: "CANCELLED" } : null));
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setCancelling(false);
  };

  // Filter items
  const filteredItems = items.filter((t) => {
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchCode = (t.invoice_number || t.transaction_code || "").toLowerCase().includes(q);
      const matchOutlet = (t.outlet_name || "").toLowerCase().includes(q);
      const matchSales = (t.salesman_name || "").toLowerCase().includes(q);
      const matchArea = (t.area_name || "").toLowerCase().includes(q);
      const matchItem = (t.items || []).some((it) =>
        (it.sku_name || it.product_name || "").toLowerCase().includes(q)
      );
      if (!matchCode && !matchOutlet && !matchSales && !matchArea && !matchItem) return false;
    }
    return true;
  });

  // Calculate volume & financial summaries
  const validItems = filteredItems.filter((t) => t.status !== "CANCELLED");
  const totalVolume = validItems.reduce(
    (acc, t) =>
      acc +
      (t.total_volume != null
        ? Number(t.total_volume)
        : (t.items || []).reduce((sum, it) => sum + Number(it.quantity || it.volume || 0), 0)),
    0
  );
  const totalRevenue = validItems.reduce((acc, t) => acc + Number(t.total || 0), 0);
  const totalCount = validItems.length;

  // Breakdown volume per SKU across valid transactions
  const volumeBySkuMap = {};
  validItems.forEach((t) => {
    (t.items || []).forEach((it) => {
      const name = it.sku_name || it.product_name || "SKU";
      const vol = Number(it.quantity ?? it.volume ?? 0);
      if (!volumeBySkuMap[name]) volumeBySkuMap[name] = 0;
      volumeBySkuMap[name] += vol;
    });
  });

  const handlePrintInvoice = () => {
    if (!detail) return;
    
    // Create an iframe to hold the print content
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    
    // Simple basic POS receipt layout
    doc.write(`
      <html>
        <head>
          <title>Struk - ${detail.invoice_number || detail.transaction_code}</title>
          <style>
            body { font-family: monospace; width: 300px; margin: 0 auto; color: #000; font-size: 12px; }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .flex-between { display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; }
            td { vertical-align: top; padding: 2px 0; }
            .col-qty { width: 30px; }
            .col-name { width: auto; }
            .col-total { width: 80px; text-align: right; }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 14px; margin-bottom: 5px;">MAHAMERU DMS</div>
          <div class="center">Struk Pembelian</div>
          
          <div class="divider"></div>
          
          <div><span class="bold">No:</span> ${detail.invoice_number || detail.transaction_code}</div>
          <div><span class="bold">Waktu:</span> ${fmtDateTime(detail.created_at)}</div>
          <div><span class="bold">Sales:</span> ${detail.salesman_name || detail.salesman_id}</div>
          <div><span class="bold">Outlet:</span> ${detail.outlet_name || detail.outlet_id}</div>
          
          <div class="divider"></div>
          
          <table>
            ${(detail.items || []).map((it) => {
              const qty = Number(it.quantity ?? it.volume ?? 0);
              const price = Number(it.unit_price ?? it.unitPrice ?? 0);
              const sub = Number(it.subtotal ?? qty * price);
              return `
                <tr>
                  <td class="col-name">${it.sku_name || it.skuName}</td>
                  <td class="col-qty right">${qty}x</td>
                  <td class="col-total">${rupiah(sub)}</td>
                </tr>
              `;
            }).join("")}
          </table>
          
          <div class="divider"></div>
          
          <div class="flex-between">
            <span>Subtotal</span>
            <span>${rupiah(detail.subtotal || detail.total)}</span>
          </div>
          ${Number(detail.discount) > 0 ? `
          <div class="flex-between">
            <span>Diskon</span>
            <span>- ${rupiah(detail.discount)}</span>
          </div>
          ` : ""}
          <div class="flex-between bold" style="font-size: 14px; margin-top: 5px;">
            <span>TOTAL</span>
            <span>${rupiah(detail.total)}</span>
          </div>
          
          <div class="divider"></div>
          
          <div class="center">Status: ${detail.payment_method} - ${detail.status}</div>
          <div class="center" style="margin-top: 10px;">Terima Kasih!</div>
        </body>
      </html>
    `);
    
    doc.close();
    
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 500);
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-10" data-testid="transactions-page">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="font-heading text-xl font-bold text-navy flex items-center gap-2">
            <Receipt className="text-gold" size={22} />
            Daftar & Detail Transaksi Penjualan
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pusat data transaksi resmi dengan Volume (Qty) produk per SKU terverifikasi.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <Calendar size={15} className="text-slate-400" />
            <Input
              data-testid="txn-date-filter"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-36 h-8 text-xs border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none font-medium text-navy"
            />
            {date && (
              <button
                onClick={() => setDate("")}
                className="text-[10px] text-slate-400 hover:text-slate-600 ml-1 underline"
              >
                Semua
              </button>
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-32 text-xs rounded-xl border-slate-200 bg-slate-50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="PAID">PAID</SelectItem>
              <SelectItem value="COMPLETED">COMPLETED</SelectItem>
              <SelectItem value="CANCELLED">CANCELLED</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards: Volume, Revenue, Tx Count */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Total Volume */}
        <div className="bg-gradient-to-br from-navy via-navy-light to-navy-dark text-white rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-bold flex items-center gap-1.5">
                <Layers size={13} />
                Total Volume Terjual
              </span>
              <div className="font-heading text-2xl font-bold mt-1.5 text-white flex items-baseline gap-1.5">
                <span data-testid="txn-total-volume">{totalVolume.toLocaleString("id-ID")}</span>
                <span className="text-xs font-normal text-gold/80">Qty</span>
              </div>
              <div className="text-[11px] text-slate-300 mt-1">
                Akumulasi qty item dari {totalCount} transaksi valid
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gold/20 flex items-center justify-center text-gold">
              <Layers size={20} />
            </div>
          </div>
        </div>

        {/* Total Nilai Penjualan */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex justify-between items-start">
          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold flex items-center gap-1.5">
              <DollarSign size={13} className="text-emerald-600" />
              Total Nilai Penjualan
            </span>
            <div
              className="font-heading text-2xl font-bold mt-1.5 text-navy"
              data-testid="txn-total-revenue"
            >
              {rupiah(totalRevenue)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {statusFilter === "CANCELLED" ? "Nilai transaksi dibatalkan" : "Omzet penjualan bersih"}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <DollarSign size={20} />
          </div>
        </div>

        {/* Total Transaksi */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex justify-between items-start">
          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold flex items-center gap-1.5">
              <ShoppingBag size={13} className="text-blue-600" />
              Jumlah Transaksi
            </span>
            <div className="font-heading text-2xl font-bold mt-1.5 text-navy" data-testid="txn-total-count">
              {totalCount}{" "}
              <span className="text-xs font-normal text-slate-400">Nota / Invoice</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Rata-rata: {totalCount > 0 ? (totalVolume / totalCount).toFixed(1) : 0} Qty / transaksi
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <ShoppingBag size={20} />
          </div>
        </div>
      </div>

      {/* Volume Breakdown per SKU */}
      {Object.keys(volumeBySkuMap).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
            <Layers size={12} className="text-gold" />
            Distribusi Volume per SKU Hari/Periode Ini:
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(volumeBySkuMap).map(([skuName, vol]) => (
              <div
                key={skuName}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs"
              >
                <span className="text-slate-600 font-medium">{skuName}:</span>
                <span className="font-bold text-navy bg-gold/20 text-navy-dark px-1.5 py-0.5 rounded-md text-[11px]">
                  {vol} Qty
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari No. Invoice, Outlet, Salesman, Area, atau SKU..."
          className="pl-9 h-11 bg-white border-slate-200 rounded-xl text-sm focus-visible:ring-navy"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="animate-spin text-navy" size={28} />
          <span className="ml-2 text-sm text-slate-500">Memuat data transaksi...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredItems.length === 0 && (
        <div
          className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm"
          data-testid="txn-empty"
        >
          <Receipt className="mx-auto text-slate-300 mb-3" size={40} />
          <div className="text-base font-bold text-navy">Belum ada transaksi ditemukan</div>
          <div className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            {search || date || statusFilter !== "ALL"
              ? "Tidak ada transaksi yang cocok dengan filter yang dipilih. Coba atur ulang tanggal atau pencarian."
              : "Transaksi akan otomatis tercatat saat Sales melakukan penjualan selama kunjungan outlet aktif."}
          </div>
        </div>
      )}

      {/* Transaction List */}
      {!loading && filteredItems.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100">
          <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <div className="col-span-3">Invoice & Tanggal</div>
            <div className="col-span-3">Outlet & Area</div>
            <div className="col-span-2">Salesman</div>
            <div className="col-span-2 text-right">Volume (Qty)</div>
            <div className="col-span-2 text-right">Total Nilai</div>
          </div>

          {filteredItems.map((t, i) => {
            const isCancelled = t.status === "CANCELLED";
            const rowVolume =
              t.total_volume != null
                ? Number(t.total_volume)
                : (t.items || []).reduce(
                    (sum, it) => sum + Number(it.quantity || it.volume || 0),
                    0
                  );

            return (
              <div
                key={t._id || i}
                data-testid={`txn-row-${i}`}
                onClick={() => viewDetail(t)}
                className={`p-4 hover:bg-slate-50/80 cursor-pointer transition-colors flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-3 items-start md:items-center ${
                  isCancelled ? "bg-red-50/30 opacity-75" : ""
                }`}
              >
                {/* Col 1: Invoice & Tanggal */}
                <div className="col-span-3 w-full flex justify-between md:block">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-navy font-mono">
                      {t.invoice_number || t.transaction_code}
                    </span>
                    {isCancelled ? (
                      <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                        BATAL
                      </span>
                    ) : (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">
                        {t.status || "PAID"}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {fmtDateTime(t.transaction_date)}
                  </div>
                </div>

                {/* Col 2: Outlet & Area */}
                <div className="col-span-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <Building2 size={12} className="text-slate-400" />
                    {t.outlet_name || "Outlet"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {t.area_name ? `Area: ${t.area_name}` : "-"}
                  </div>
                </div>

                {/* Col 3: Salesman */}
                <div className="col-span-2">
                  <div className="text-xs text-slate-700 font-medium flex items-center gap-1">
                    <User size={12} className="text-slate-400" />
                    {t.salesman_name || "-"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {(t.items || []).length} SKU Produk
                  </div>
                </div>

                {/* Col 4: Volume */}
                <div className="col-span-2 w-full flex justify-between md:block md:text-right">
                  <span className="md:hidden text-xs text-slate-500">Volume:</span>
                  <div>
                    <span className="font-heading font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg text-xs">
                      {rowVolume} Qty
                    </span>
                  </div>
                </div>

                {/* Col 5: Total Nilai */}
                <div className="col-span-2 w-full flex justify-between md:block md:text-right">
                  <span className="md:hidden text-xs text-slate-500">Total:</span>
                  <div className="font-heading font-bold text-navy text-sm">
                    {rupiah(t.total)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transaction Detail Dialog (MAHAMERU DMS COMPLIANT) */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden" data-testid="txn-detail-dialog">
          {detail && (
            <div className="flex flex-col max-h-[85vh]">
              {/* Header Modal */}
              <div className="bg-navy text-white p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-bold flex items-center gap-1.5">
                    <Receipt size={14} />
                    Detail Transaksi Resmi
                  </span>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      detail.status === "CANCELLED"
                        ? "bg-red-500/20 text-red-300 border border-red-500/30"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {detail.status || "COMPLETED"}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-heading text-xl font-bold font-mono">
                      {detail.invoice_number || detail.transaction_code}
                    </h3>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Waktu: {fmtDateTime(detail.transaction_date)}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-xs text-gold font-bold">
                      Metode: {detail.payment_method || "CASH"}
                    </div>
                    <div className="text-xs text-slate-300">
                      Salesman: {detail.salesman_name || "-"}
                    </div>
                  </div>
                </div>

                {/* Outlet info strip */}
                <div className="bg-navy-light/60 border border-white/10 rounded-xl p-2.5 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-gold" />
                    <span className="font-bold text-white">{detail.outlet_name || "Outlet"}</span>
                    {detail.outlet_code && (
                      <span className="text-[10px] text-slate-400">({detail.outlet_code})</span>
                    )}
                  </div>
                  {detail.area_name && (
                    <div className="text-[11px] text-slate-300">
                      Area: <span className="text-white font-medium">{detail.area_name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Body */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div>
                  <div className="text-xs uppercase font-bold tracking-wider text-slate-500 mb-2 flex items-center justify-between">
                    <span>Daftar Transaction Item & Volume</span>
                    <span className="text-[11px] font-normal text-slate-400">
                      *Volume = Qty masing-masing SKU
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                        <tr>
                          <th className="py-2.5 px-3">No</th>
                          <th className="py-2.5 px-3">Produk & SKU</th>
                          <th className="py-2.5 px-3 text-center bg-gold/10 text-navy-dark font-bold">
                            Volume (Qty)
                          </th>
                          <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                          <th className="py-2.5 px-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(detail.items || []).map((it, idx) => {
                          const itemQty = Number(it.quantity ?? it.volume ?? it.qty ?? 0);
                          const itemPrice = Number(it.unit_price ?? it.unitPrice ?? it.price ?? 0);
                          const itemSub = Number(it.subtotal ?? itemQty * itemPrice);

                          return (
                            <tr key={it.sku_id || idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-navy">
                                  {it.sku_name || it.skuName || "SKU"}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {it.product_name || it.productName || "Produk"}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center bg-gold/5 font-heading font-bold text-emerald-800 text-sm">
                                {itemQty} <span className="text-[10px] font-normal text-slate-500">Qty</span>
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-600">
                                {rupiah(itemPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-navy">
                                {rupiah(itemSub)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Calculation Summary Footer */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span className="font-bold flex items-center gap-1.5 text-navy">
                      <Layers size={14} className="text-gold" />
                      TOTAL VOLUME (SUM OF ITEM QTY):
                    </span>
                    <span className="font-heading font-bold text-emerald-800 text-sm bg-emerald-100/80 px-2.5 py-0.5 rounded-lg border border-emerald-300">
                      {detail.total_volume != null
                        ? detail.total_volume
                        : (detail.items || []).reduce(
                            (acc, i) => acc + Number(i.quantity || i.volume || 0),
                            0
                          )}{" "}
                      Qty
                    </span>
                  </div>

                  <div className="border-t border-slate-200 my-1 pt-2 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal Nilai</span>
                      <span>{rupiah(detail.subtotal || detail.total)}</span>
                    </div>
                    {Number(detail.discount) > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Potongan / Diskon</span>
                        <span>- {rupiah(detail.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center font-heading font-bold text-navy text-base pt-1 border-t border-slate-200">
                      <span>TOTAL PEMBAYARAN</span>
                      <span className="text-gold-dark">{rupiah(detail.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Cancellation notice if already cancelled */}
                {detail.status === "CANCELLED" && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle size={14} />
                      Transaksi ini telah dibatalkan
                    </div>
                    <div className="text-[11px] text-red-600">
                      Seluruh kuantitas volume produk telah otomatis dikembalikan ke stok fisik salesman.
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="border-t border-slate-200 p-4 bg-slate-50 flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePrintInvoice()}
                    className="text-navy border-slate-300 hover:bg-slate-100 text-xs rounded-xl h-9 font-medium"
                  >
                    <Printer size={14} className="mr-1.5" />
                    Cetak Struk
                  </Button>
                  
                  {detail.status !== "CANCELLED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCancelDialogOpen(true)}
                      className="text-red-600 border-red-200 hover:bg-red-50 text-xs rounded-xl h-9 font-medium"
                    >
                      <Ban size={14} className="mr-1.5" />
                      Batalkan Transaksi (Retur Stok)
                    </Button>
                  )}
                </div>

                <Button
                  onClick={() => setDetail(null)}
                  className="bg-navy hover:bg-navy-light text-white text-xs h-9 px-4 rounded-xl"
                >
                  Tutup
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Transaction Cancellation */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md" data-testid="cancel-txn-dialog">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Ban size={18} />
              Konfirmasi Pembatalan Transaksi
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Membatalkan transaksi akan mengecualikan Volume dan Revenue dari seluruh laporan dan
              mengembalikan stok SKU ke tangan Salesman terkait.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-bold text-navy block mb-1">
                Alasan Pembatalan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Contoh: Salah input pesanan outlet / Toko membatalkan pembelian..."
                className="w-full h-20 text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelDialogOpen(false)}
                className="text-xs rounded-xl h-9"
              >
                Batal
              </Button>
              <Button
                size="sm"
                disabled={cancelling || !cancelReason.trim()}
                onClick={() => handleCancelTransaction()}
                className="bg-red-600 hover:bg-red-700 text-white text-xs rounded-xl h-9"
              >
                {cancelling ? <Loader2 className="animate-spin mr-1.5" size={14} /> : null}
                Ya, Batalkan Transaksi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
