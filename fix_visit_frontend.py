import sys
import re

with open("src/pages/sales/VisitPage.jsx", "r") as f:
    content = f.read()

# Add visitNotes state
state_target = """  const [checkoutOpen, setCheckoutOpen] = useState(false);"""
state_repl = """  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [visitNotes, setVisitNotes] = useState("");"""
content = content.replace(state_target, state_repl)

# Update doCheckout payload
payload_target = """        open_call_reason_id: txns.length === 0 ? reasonId || null : null,
        confirm_early: confirmEarly,"""
payload_repl = """        open_call_reason_id: txns.length === 0 ? reasonId || null : null,
        notes: visitNotes,
        confirm_early: confirmEarly,"""
content = content.replace(payload_target, payload_repl)

# Add Input to dialog
dialog_target = """            {txns.length === 0 && (
              <Select value={reasonId} onValueChange={setReasonId}>"""
dialog_repl = """            <Input
              placeholder="Catatan Kunjungan (Opsional)"
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
              className="h-11"
            />
            {txns.length === 0 && (
              <Select value={reasonId} onValueChange={setReasonId}>"""
content = content.replace(dialog_target, dialog_repl)

with open("src/pages/sales/VisitPage.jsx", "w") as f:
    f.write(content)
