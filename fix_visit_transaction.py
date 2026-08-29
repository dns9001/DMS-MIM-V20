import sys
import re

with open("src/pages/sales/VisitPage.jsx", "r") as f:
    content = f.read()

# Add transactionNotes state
state_target = """  const [busy, setBusy] = useState(false);"""
state_repl = """  const [busy, setBusy] = useState(false);
  const [transactionNotes, setTransactionNotes] = useState("");"""
content = content.replace(state_target, state_repl)

# Update transaction payload
payload_target = """        items: cart.map((i) => ({ sku_id: i.sku_id, quantity: i.quantity, discount: 0 })),
        discount: 0,
        idempotency_key: uuid(),
        local_id: uuid(),
      };"""
payload_repl = """        items: cart.map((i) => ({ sku_id: i.sku_id, quantity: i.quantity, discount: 0 })),
        discount: 0,
        notes: transactionNotes,
        idempotency_key: uuid(),
        local_id: uuid(),
      };"""
content = content.replace(payload_target, payload_repl)

# Add textarea to ui
ui_target = """            <div className="pt-4 border-t border-slate-100 mb-6">
              <Button data-testid="save-transaction-button" disabled={busy} onClick={saveTransaction} className="w-full h-11 bg-navy hover:bg-navy-light text-white font-bold">"""
ui_repl = """            <div className="pt-4 border-t border-slate-100 mb-6">
              <div className="mb-4">
                <Label className="text-xs font-bold text-slate-700">Catatan Transaksi</Label>
                <Input
                  placeholder="Opsional (cth. Titipan di satpam, minta nota terpisah)"
                  value={transactionNotes}
                  onChange={(e) => setTransactionNotes(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button data-testid="save-transaction-button" disabled={busy} onClick={saveTransaction} className="w-full h-11 bg-navy hover:bg-navy-light text-white font-bold">"""
content = content.replace(ui_target, ui_repl)

with open("src/pages/sales/VisitPage.jsx", "w") as f:
    f.write(content)
