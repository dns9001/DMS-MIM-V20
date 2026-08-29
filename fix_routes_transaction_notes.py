import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """  const { outlet_id, visit_id, items, payment_method, latitude, longitude, mock_location } = req.body || {};"""
repl = """  const { outlet_id, visit_id, items, payment_method, notes, latitude, longitude, mock_location } = req.body || {};"""
content = content.replace(target, repl)

target2 = """      const newTxn: Transaction = {
        _id: newTxnId,
        transaction_code: invoiceNumber,"""
repl2 = """      const newTxn: Transaction = {
        _id: newTxnId,
        transaction_code: invoiceNumber,
        notes: notes || "", """
content = content.replace(target2, repl2)

with open("server/routes.ts", "w") as f:
    f.write(content)
