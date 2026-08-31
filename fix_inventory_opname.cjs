const fs = require('fs');
let code = fs.readFileSync('server/inventory.routes.ts', 'utf8');

code = code.replace(
  /const result = await sqlDb.transaction\(async \(tx\) => {/,
  `const result = isCloudSqlConnected ? await sqlDb.transaction(async (tx) => {`
).replace(
  /return totalAdjusted;\n    }\);/,
  `return totalAdjusted;\n    }) : await (async () => {\n      let totalAdjusted = 0;\n      for (const it of items) {\n        const diff = Number(it.physical_count) - Number(it.system_stock);\n        if (diff !== 0) {\n          await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Opname", null);\n          totalAdjusted++;\n        }\n      }\n      return totalAdjusted;\n    })();`
).replace(
  /const result = await sqlDb.transaction\(async \(tx\) => {\n      for \(const it of items\) {/,
  `const result = isCloudSqlConnected ? await sqlDb.transaction(async (tx) => {\n      for (const it of items) {`
).replace(
  /return items.length;\n    }\);/,
  `return items.length;\n    }) : await (async () => {\n      for (const it of items) {\n        const qty = Number(it.quantity);\n        if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity adjustment harus bilangan bulat positif.");\n        const diff = adjustment_type === "IN" ? qty : -qty;\n        await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Adjustment", null);\n      }\n      return items.length;\n    })();`
);

fs.writeFileSync('server/inventory.routes.ts', code);
