import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target_save = """  db.stock_returns.push(newReturn);
  syncSingleDoc("stock_returns", newReturn._id, newReturn);"""

repl_save = """  if (!db.stock_returns) db.stock_returns = [];
  db.stock_returns.push(newReturn as any);
  syncSingleDoc("stock_returns", newReturn._id, newReturn);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockReturns: pgStockReturns } = require('../src/db/schema.js');

    await sqlDb.insert(pgStockReturns).values({
      id: newReturn._id,
      returnNumber: newReturn.return_code,
      salesmanId: newReturn.salesman_id,
      officeId: newReturn.warehouse_id,
      returnDate: newReturn.business_date,
      status: newReturn.status,
      items: newReturn.items,
      notes: newReturn.notes,
      approvedBy: newReturn.confirmed_by,
      createdAt: new Date(newReturn.created_at),
      updatedAt: new Date(newReturn.updated_at)
    });
  } catch (err: any) {
    console.error("Error inserting return to Postgres:", err.message);
  }"""

content = content.replace(target_save, repl_save)

with open("server/routes.ts", "w") as f:
    f.write(content)
