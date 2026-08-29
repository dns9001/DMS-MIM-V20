import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

# Replace handover creation
target_hnd_start = """  db.stock_handovers.push(newHandover as any);"""
target_hnd_end = """  // If auto_confirm requested (direct immediate handover)"""

match_hnd = re.search(re.escape(target_hnd_start) + r".*?" + re.escape(target_hnd_end), content, re.DOTALL)
if match_hnd:
    repl_hnd = """  db.stock_handovers.push(newHandover as any);
  syncSingleDoc("stock_handovers", newHandover._id, newHandover);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockHandovers } = require('../src/db/schema.js');
    await sqlDb.insert(stockHandovers).values({
      id: newHandover._id,
      handoverNumber: newHandover.handover_code,
      salesmanId: newHandover.salesman_id,
      officeId: newHandover.warehouse_id,
      handoverDate: newHandover.business_date,
      status: newHandover.status,
      items: newHandover.items,
      notes: newHandover.notes,
      approvedBy: newHandover.confirmed_by,
      createdAt: new Date(newHandover.created_at)
    });
  } catch (err: any) {
    console.error("Error inserting handover to Postgres:", err.message);
  }

  // If auto_confirm requested (direct immediate handover)"""
    content = content.replace(match_hnd.group(0), repl_hnd)

# Replace return creation
target_ret_start = """  db.stock_returns.push(newReturn);"""
target_ret_end = """  // If auto_confirm requested (direct immediate return)"""

match_ret = re.search(re.escape(target_ret_start) + r".*?" + re.escape(target_ret_end), content, re.DOTALL)
if match_ret:
    repl_ret = """  db.stock_returns.push(newReturn);
  syncSingleDoc("stock_returns", newReturn._id, newReturn);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockReturns } = require('../src/db/schema.js');
    await sqlDb.insert(stockReturns).values({
      id: newReturn._id,
      returnNumber: newReturn.return_code,
      salesmanId: newReturn.salesman_id,
      officeId: newReturn.warehouse_id,
      returnDate: newReturn.business_date,
      status: newReturn.status,
      items: newReturn.items,
      notes: newReturn.notes,
      approvedBy: newReturn.confirmed_by,
      createdAt: new Date(newReturn.created_at)
    });
  } catch (err: any) {
    console.error("Error inserting return to Postgres:", err.message);
  }

  // If auto_confirm requested (direct immediate return)"""
    content = content.replace(match_ret.group(0), repl_ret)

with open("server/routes.ts", "w") as f:
    f.write(content)
