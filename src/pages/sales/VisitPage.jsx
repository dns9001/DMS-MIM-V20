import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, LogOut, ShoppingCart } from "lucide-react";
import api, { errMsg, errDetail } from "../../lib/api";
import { getPosition } from "../../lib/geo";
import { postQueued, getLocalVisit, setLocalVisit } from "../../lib/offline";
import { uuid, rupiah, fmtTime } from "../../lib/format";
import { VisitTimer } from "./SalesHome";
import StatusBadge from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";

export default function VisitPage() {
  const navigate = useNavigate();
  const [visit, setVisit] = useState(null);
  const [txns, setTxns] = useState([]);
  const [skus, setSkus] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [pickSku, setPickSku] = useState("");
  const [qty, setQty] = useState("1");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [visitNotes, setVisitNotes] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [earlyInfo, setEarlyInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [transactionNotes, setTransactionNotes] = useState("");

  const isLocal = visit?._id === "@local" || visit?.local;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/visits/active");
      if (data.visit) {
        setVisit(data.visit);
        const d = await api.get(`/visits/${data.visit._id}`);
        setTxns(d.data.transactions);
      } else {
        const local = getLocalVisit();
        setVisit(local);
      }
      const [s, r] = await Promise.all([
        api.get("/transactions/sku-list"),
        api.get("/masters/outlet-call-reasons", { params: { status: "ACTIVE", limit: 50 } }),
      ]);
      setSkus(s.data.items);
      setReasons(r.data.items);
    } catch (e) {
      const local = getLocalVisit();
      if (local) setVisit(local);
      else toast.error(errMsg(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addItem = () => {
    const sku = skus.find((s) => s.sku_id === pickSku);
    if (!sku) return;
    const q = parseInt(qty, 10);
    if (!q || q <= 0) {
      toast.error("Qty tidak valid");
      return;
    }
    setCart((c) => {
      const ex = c.find((i) => i.sku_id === sku.sku_id);
      if (ex) return c.map((i) => (i.sku_id === sku.sku_id ? { ...i, quantity: i.quantity + q } : i));
      return [...c, { sku_id: sku.sku_id, name: sku.name, unit: sku.unit, price: sku.price, quantity: q }];
    });
    setPickSku("");
    setQty("1");
  };

  const cartTotal = cart.reduce((a, i) => a + i.price * i.quantity, 0);
  const cartTotalVolume = cart.reduce((a, i) => a + i.quantity, 0);

  const saveTransaction = async () => {
    if (cart.length === 0) {
      toast.error("Keranjang kosong");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        visit_id: visit._id,
        outlet_id: visit.outlet_id,
        items: cart.map((i) => ({ sku_id: i.sku_id, quantity: i.quantity, discount: 0 })),
        discount: 0,
        notes: transactionNotes,
        idempotency_key: uuid(),
        local_id: uuid(),
      };
      const r = await postQueued("/transactions", payload);
      if (r.offline) toast.warning("Offline: transaksi masuk antrean sinkronisasi");
      else toast.success(`Transaksi ${rupiah((r.transaction ?? r).total || 0)} tersimpan`);
      setCart([]);
      if (!isLocal) await load();
      else setTxns((t) => [...t, { _id: uuid(), transaction_code: "OFFLINE", total: cartTotal, transaction_date: new Date().toISOString(), items: cart }]);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  const doCheckout = async (confirmEarly = false) => {
    setBusy(true);
    try {
      const pos = await getPosition();
      const payload = {
        ...pos,
        outlet_call_reason_id: txns.length === 0 ? reasonId || null : null,
        open_call_reason_id: txns.length === 0 ? reasonId || null : null,
        notes: visitNotes,
        confirm_early: confirmEarly,
      };
      const r = await postQueued(`/visits/${isLocal ? "@local" : visit._id}/check-out`, payload);
      if (r.offline) {
        toast.warning("Offline: check-out masuk antrean sinkronisasi");
      } else {
        const result = (r.visit ?? r).call_result;
        toast.success(result === "EFFECTIVE" ? "Kunjungan selesai: EFFECTIVE CALL" : "Kunjungan selesai: OUTLET CALL");
      }
      setLocalVisit(null);
      setCheckoutOpen(false);
      navigate("/home");
    } catch (e) {
      const d = errDetail(e);
      if (e.response?.status === 409 && d?.min_minutes !== undefined) {
        setEarlyInfo(d);
      } else {
        toast.error(errMsg(e));
      }
    }
    setBusy(false);
  };

  if (loading) {
    return <div className="flex justify-center py-24" data-testid="visit-loading"><Loader2 className="animate-spin text-navy" size={28} /></div>;
  }

  if (!visit) {
    return (
      <div className="space-y-4" data-testid="visit-empty">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <ShoppingCart className="mx-auto text-slate-300" size={36} />
          <div className="text-sm font-bold text-navy">Tidak ada kunjungan aktif</div>
          <p className="text-xs text-slate-500">Check-in ke outlet dari menu Call Plan atau Outlet untuk memulai kunjungan.</p>
          <Button data-testid="goto-outlets" onClick={() => navigate("/outlets")} className="bg-navy text-white">Cari Outlet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="visit-page">
      <div className="bg-navy rounded-2xl p-5 text-white space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-bold">Kunjungan Aktif {isLocal && "(Offline)"}</span>
          <VisitTimer since={visit.check_in_time} />
        </div>
        <div className="font-heading text-xl font-bold" data-testid="visit-outlet-name">{visit.outlet_name}</div>
        <div className="text-xs text-slate-300">Check-in {fmtTime(visit.check_in_time)}</div>
        {visit.visit_source && <StatusBadge status={visit.visit_source === "PLANNED" ? "PLANNED" : visit.visit_source === "NEW_OUTLET" ? "HIGH" : "MEDIUM"} label={visit.visit_source} />}
      </div>

      {/* Transactions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Transaksi Kunjungan</div>
          <span className="text-xs font-bold text-navy" data-testid="visit-txn-count">{txns.length} transaksi</span>
        </div>
        {txns.map((t, i) => {
          const tVol = t.total_volume || (t.items || []).reduce((acc, it) => acc + Number(it.quantity || it.volume || 0), 0);
          return (
            <div key={t._id} className="flex justify-between items-center bg-slate-50 rounded-lg p-3" data-testid={`visit-txn-${i}`}>
              <div>
                <div className="text-sm font-bold text-navy">{t.transaction_code || t.invoice_number}</div>
                <div className="text-[10px] text-slate-500 font-medium">
                  <span className="text-emerald-700 font-bold">Vol: {tVol} Qty</span> · {(t.items || []).length} item
                </div>
              </div>
              <div className="font-heading font-bold text-navy">{rupiah(t.total)}</div>
            </div>
          );
        })}

        <div className="border-t border-dashed border-slate-200 pt-3 space-y-2">
          <div className="text-xs font-bold text-slate-500">Tambah Item Produk</div>
          <div className="flex gap-1.5 sm:gap-2">
            <Select value={pickSku} onValueChange={setPickSku}>
              <SelectTrigger data-testid="sku-select" className="h-11 flex-1 text-xs sm:text-sm"><SelectValue placeholder="Pilih SKU" /></SelectTrigger>
              <SelectContent>
                {skus.map((s) => (
                  <SelectItem key={s.sku_id} value={s.sku_id} className="text-xs sm:text-sm">{s.name} — {rupiah(s.price)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input data-testid="qty-input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 w-16 sm:w-24 text-xs sm:text-sm text-center px-1" placeholder="Qty" />
            <Button data-testid="add-item-button" onClick={addItem} className="h-11 px-3 sm:px-4 bg-navy text-white shrink-0"><Plus size={16} /></Button>
          </div>
          {cart.map((i) => (
            <div key={i.sku_id} className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-xs">
                <div className="font-bold text-navy">{i.name}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  <span className="font-bold text-emerald-700">{i.quantity} {i.unit || "Pcs"}</span> x {rupiah(i.price)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => {
                      if (i.quantity > 1) {
                        setCart((c) => c.map((x) => x.sku_id === i.sku_id ? { ...x, quantity: x.quantity - 1 } : x));
                      } else {
                        setCart((c) => c.filter((x) => x.sku_id !== i.sku_id));
                      }
                    }}
                    className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-xs font-bold text-navy">{i.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setCart((c) => c.map((x) => x.sku_id === i.sku_id ? { ...x, quantity: x.quantity + 1 } : x))}
                    className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                  >
                    +
                  </button>
                </div>
                <span className="font-bold text-xs text-navy min-w-[70px] text-right">{rupiah(i.price * i.quantity)}</span>
                <button data-testid={`remove-item-${i.sku_id}`} onClick={() => setCart((c) => c.filter((x) => x.sku_id !== i.sku_id))} className="text-red-400 hover:text-red-600 p-1">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {cart.length > 0 && (
            <>
              <div className="flex justify-between items-center font-heading font-bold text-navy text-sm pt-1 border-t border-slate-100">
                <div className="text-xs text-slate-500 font-semibold">
                  Total Volume: <span className="text-emerald-700 font-bold">{cartTotalVolume} Qty</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 mr-2">Total:</span>
                  <span data-testid="cart-total" className="text-base text-navy">{rupiah(cartTotal)}</span>
                </div>
              </div>
              <Button data-testid="save-transaction-button" disabled={busy} onClick={saveTransaction} className="w-full h-11 bg-navy hover:bg-navy-light text-white font-bold">
                {busy ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                Simpan Transaksi (Vol: {cartTotalVolume} Qty)
              </Button>
            </>
          )}
        </div>
      </div>

      <Button
        data-testid="checkout-visit-button"
        onClick={() => setCheckoutOpen(true)}
        className="w-full h-12 bg-gold hover:bg-gold-light text-navy-dark font-bold text-base rounded-xl"
      >
        <LogOut size={18} className="mr-2" />
        Check-out Outlet
      </Button>

      {/* checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent data-testid="checkout-dialog">
          <DialogHeader>
            <DialogTitle>Check-out Kunjungan</DialogTitle>
            <DialogDescription>
              {txns.length > 0
                ? "Ada transaksi pada kunjungan ini — kunjungan berstatus EFFECTIVE CALL & OUTLET CALL."
                : "Kunjungan tanpa transaksi tetap tercatat sebagai OUTLET CALL. Wajib memilih alasan tidak transaksi."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Catatan Kunjungan (Opsional)"
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
              className="h-11"
            />
            {txns.length === 0 && (
              <Select value={reasonId} onValueChange={setReasonId}>
                <SelectTrigger data-testid="outlet-call-reason-select" className="h-11"><SelectValue placeholder="Pilih alasan kunjungan tanpa transaksi *" /></SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r._id} value={r._id}>{r.reason}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              data-testid="checkout-confirm-button"
              disabled={busy || (txns.length === 0 && !reasonId)}
              onClick={() => doCheckout(false)}
              className="w-full h-12 bg-gold hover:bg-gold-light text-navy-dark font-bold rounded-xl"
            >
              {busy ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
              Konfirmasi Check-out
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* early checkout warning */}
      <Dialog open={!!earlyInfo} onOpenChange={() => setEarlyInfo(null)}>
        <DialogContent data-testid="early-checkout-dialog">
          <DialogHeader>
            <DialogTitle>Durasi Kunjungan Kurang</DialogTitle>
            <DialogDescription>{earlyInfo?.message}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {earlyInfo?.can_override ? (
              <Button data-testid="early-checkout-confirm" disabled={busy} onClick={() => { setEarlyInfo(null); doCheckout(true); }} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                Tetap Check-out (Durasi {earlyInfo?.duration_minutes?.toFixed?.(1)} menit)
              </Button>
            ) : (
              <div className="text-sm text-red-600">Check-out sebelum durasi minimum tidak diizinkan.</div>
            )}
            <Button variant="outline" onClick={() => setEarlyInfo(null)} className="w-full">Kembali</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
