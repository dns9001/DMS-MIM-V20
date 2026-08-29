import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target_txn_start = """      db.transactions.push(newTxn);"""
target_txn_end = """      // Create Accounts Receivable record if payment is CREDIT"""

match_txn = re.search(re.escape(target_txn_start) + r".*?" + re.escape(target_txn_end), content, re.DOTALL)
if match_txn:
    repl_txn = """      db.transactions.push(newTxn);
      syncSingleDoc("transactions", newTxn._id, newTxn);

      try {
        const { sqlDb } = require('../src/db/index.js');
        const { transactions: pgTransactions } = require('../src/db/schema.js');
        await sqlDb.insert(pgTransactions).values({
          id: newTxn._id,
          invoiceNumber: newTxn.invoice_number,
          salesmanId: newTxn.salesman_id,
          outletId: newTxn.outlet_id,
          visitId: newTxn.visit_id,
          officeId: "off-1",
          transactionType: newTxn.payment_method,
          subtotal: newTxn.subtotal,
          discountAmount: newTxn.discount_total,
          taxAmount: newTxn.tax,
          totalAmount: newTxn.total,
          paidAmount: newTxn.status === "PAID" ? newTxn.total : 0,
          paymentStatus: newTxn.status === "PAID" ? "PAID" : "UNPAID",
          deliveryStatus: "DELIVERED",
          items: newTxn.items,
          createdAt: new Date(newTxn.created_at)
        });
      } catch (err: any) {
        console.error("Error inserting transaction to Postgres:", err.message);
      }

      // Create Accounts Receivable record if payment is CREDIT"""
    content = content.replace(match_txn.group(0), repl_txn)

with open("server/routes.ts", "w") as f:
    f.write(content)
