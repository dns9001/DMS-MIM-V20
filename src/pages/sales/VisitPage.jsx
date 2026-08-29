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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

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

  useEffect(() => { load(); }, [load]);

  const addItem = () => {
    const sku = skus.find((s) => s.sku_id === pickSku);
    if (!sku) return;
    const q = parseInt(qty, 10);
    if (!q || q <= 0) { toast.error("Qty tidak valid"); return; }
    setCart((c) => {
      const ex = c.find((i) => i.sku_id === sku.sku_id);
      if (ex) return c.map((i) => (i.sku_id === sku.sku_id ? { ...i, quantity: i.quantity + q } : i));
      return [...c, { sku_id: sku.sku_id, name: sku.name, unit: sku.unit, price: sku.price, quantity: q }];
    });
    setPickSku(""); setQty("1");
  };

  const cartTotal = cart.reduce((a, i) => a + i.price * i.quantity, 0);
  const cartTotalVolume = cart.reduce((a, i) => a + i.quantity, 0);

  const saveTransaction = async () => {
    if (cart.length === 0) { toast.error("Keranjang kosong"); return; }
    if (isLocal) { toast.error("Transaksi belum dapat diposting sebelum kunjungan tersinkronisasi"); return; }
    setBusy(true);
    try {
      const idempotencyKey = uuid();
      const payload = {
        visit_id: visit._id,
        outlet_id: visit.outlet_id,
        items: cart.map((i) => ({ sku_id: i.sku_id, quantity: i.quantity, discount: 0 })),
        discount: 0,
        notes: transactionNotes,
        idempotency_key: idempotencyKey,
        local_id: idempotencyKey,
      };
      const r = await postQueued("/transactions/post-atomic", payload);
      if (r.offline) toast.warning("Offline: transaksi masuk antrean sinkronisasi");
      else toast.success(`Transaksi ${rupiah((r.transaction ?? r).total || 0)} tersimpan`);
      setCart([]);
      await load();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  const doCheckout = async (confirmEarly = false) => {
    setBusy(true);
    try {
      const pos = await getPosition();
      const payload = {
        ...pos,
        outlet_call_reason_id: txns.length === 0 ? reasonId || null : null,
        notes: visitNotes,
        confirm_early: confirmEarly,
      };
      const r = await postQueued(`/visits/${isLocal ? "@local" : visit._id}/check-out`, payload);
      if (r.offline) toast.warning("Offline: check-out masuk antrean sinkronisasi");
      else {
        const result = (r.visit ?? r).call_result;
        toast.success(result === "EFFECTIVE" ? "Kunjungan selesai: EFFECTIVE CALL" : "Kunjungan selesai: OUTLET CALL");
      }
      setLocalVisit(null); setCheckoutOpen(false); navigate("/home");
    } catch (e) {
      const d = errDetail(e);
      if (e.response?.status === 409 && d?.min_minutes !== undefined) setEarlyInfo(d);
      else toast.error(errMsg(e));
    }
    setBusy(false);
  };

  if (loading) return <div className="flex justify-center py-24" data-testid="visit-loading"><Loader2 className="animate-spin text-navy" size={28} /></div>;
  if (!visit) return <div className="space-y-4" data-testid="visit-empty"><div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3"><ShoppingCart className="mx-auto text-slate-300" size={36} /><div className="text-sm font-bold text-navy">Tidak ada kunjungan aktif</div><p className="text-xs text-slate-500">Check-in ke outlet dari menu Call Plan atau Outlet untuk memulai kunjungan.</p><Button data-testid="goto-outlets" onClick={() => navigate("/outlets")} className="bg-navy text-white">Cari Outlet</Button></div></div>;

  return (
    <div className="space-y-4" data-testid="visit-page">
      <div className="bg-navy rounded-2xl p-5 text-white space-y-2"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-[0.2em] text-gold font-bold">Kunjungan Aktif {isLocal && "(Offline)"}</span><VisitTimer since={visit.check_in_time} /></div><div className="font-heading text-xl font-bold" data-testid="visit-outlet-name">{visit.outlet_name}</div><div className="text-xs text-slate-300">Check-in {fmtTime(visit.check_in_time)}</div>{visit.visit_source && <StatusBadge status={visit.visit_source === "PLANNED" ? "PLANNED" : visit.visit_source === "NEW_OUTLET" ? "HIGH" : "MEDIUM"} label={visit.visit_source} />}</div>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"><div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Transaksi Kunjungan</div><span className="text-xs font-bold text-navy" data-testid="visit-txn-count">{txns.length} transaksi</span></div>{txns.map((t, i) => { const tVol = t.total_volume || (t.items || []).reduce((acc, it) => acc + Number(it.quantity || it.volume || 0), 0); return <div key={t._id} className="flex justify-between items-center bg-slate-50 rounded-lg p-3" data-testid={`visit-txn-${i}`}><div><div className="text-sm font-bold text-navy">{t.transaction_code || t.invoice_number}</div><div className="text-[10px] text-slate-500 font-medium"><span className="text-emerald-700 font-bold">Vol: {tVol} Qty</span> · {(t.items || []).length} item</div></div><div className="font-heading font-bold text-navy">{rupiah(t.total)}</div></div>; })}
        <div className="border-t border-dashed border-slate-200 pt-3 space-y-2"><div className="text-xs font-bold text-slate-500">Tambah Item Produk</div><div className="flex gap-1.5 sm:gap-2"><Select value={pickSku} onValueChange={setPickSku}><SelectTrigger data-testid="sku-select" className="h-11 flex-1 text-xs sm:text-sm"><SelectValue placeholder="Pilih SKU" /></SelectTrigger><SelectContent>{skus.map((s) => <SelectItem key={s.sku_id} value={s.sku_id} className="text-xs sm:text-sm">{s.name} — {rupiah(s.price)}</SelectItem>)}</SelectContent></Select><Input data-testid="qty-input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 w-16 sm:w-24 text-xs sm:text-sm text-center px-1" placeholder="Qty" /><Button data-testid="add-item-button" onClick={addItem} className="h-11 px-3 sm:px-4 bg-navy text-white shrink-0"><Plus size={16} /></Button></div>{cart.map((i) => <div key={i.sku_id} className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-3"><div className="text-xs"><div className="font-bold text-navy">{i.name}</div><div className="text-slate-500 text-[11px] mt-0.5"><span className="font-bold text-emerald-700">{i.quantity} {i.unit || "Pcs"}</span> x {rupiah(i.price)}</div></div><div className="flex items-center gap-2"><div className="font-bold text-navy text-xs">{rupiah(i.price * i.quantity)}</div><Button variant="ghost" size="icon" onClick={() => setCart((c) => c.filter((x) => x.sku_id !== i.sku_id))} className="text-red-500"><Trash2 size={16} /></Button></div></div>)}{cart.length > 0 && <div className="bg-navy text-white rounded-xl p-4 space-y-2"><div className="flex justify-between text-xs"><span>Total Volume</span><span className="font-bold">{cartTotalVolume} Qty</span></div><div className="flex justify-between text-sm"><span>Total</span><span className="font-bold">{rupiah(cartTotal)}</span></div><Input value={transactionNotes} onChange={(e) => setTransactionNotes(e.target.value)} placeholder="Catatan transaksi (opsional)" className="bg-white text-slate-900" /><Button data-testid="save-transaction" disabled={busy} onClick={saveTransaction} className="w-full bg-gold text-navy font-bold">{busy ? <Loader2 className="animate-spin" size={16} /> : "Simpan Transaksi"}</Button></div>}</div>
      </div>
      <Button data-testid="checkout-button" onClick={() => setCheckoutOpen(true)} disabled={busy} className="w-full h-12 bg-navy text-white"><LogOut size={17} className="mr-2" />Selesaikan Kunjungan</Button>
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}><DialogContent><DialogHeader><DialogTitle>Selesaikan Kunjungan</DialogTitle><DialogDescription>Pastikan transaksi sudah dicatat sebelum check-out.</DialogDescription></DialogHeader><div className="space-y-3">{txns.length === 0 && reasons.length > 0 && <Select value={reasonId} onValueChange={setReasonId}><SelectTrigger><SelectValue placeholder="Pilih alasan tanpa transaksi" /></SelectTrigger><SelectContent>{reasons.map((r) => <SelectItem key={r._id} value={r._id}>{r.name}</SelectItem>)}</SelectContent></Select>}{txns.length === 0 && <Input value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} placeholder="Catatan kunjungan (opsional)" />}<Button disabled={busy} onClick={() => doCheckout(false)} className="w-full bg-navy text-white">Check-out</Button></div></DialogContent></Dialog>
      <Dialog open={!!earlyInfo} onOpenChange={(v) => !v && setEarlyInfo(null)}><DialogContent><DialogHeader><DialogTitle>Check-out terlalu cepat</DialogTitle><DialogDescription>Minimal durasi kunjungan belum terpenuhi.</DialogDescription></DialogHeader>{earlyInfo && <div className="space-y-3"><p className="text-sm">Silakan tunggu sampai minimal {earlyInfo.min_minutes} menit atau konfirmasi lebih awal jika diizinkan.</p><Button disabled={busy} onClick={() => { setEarlyInfo(null); doCheckout(true); }} className="w-full bg-navy text-white">Konfirmasi Check-out Lebih Awal</Button></div>}</DialogContent></Dialog>
    </div>
  );
}
