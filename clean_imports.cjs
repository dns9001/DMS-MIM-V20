const fs = require('fs');
let content = fs.readFileSync('server/routes.ts', 'utf8');

// Remove _require polyfills if any
content = content.replace(/import\s*\{\s*createRequire\s*\}\s*from\s*"module";\s*const\s*_require\s*=\s*typeof\s*require\s*!==\s*"undefined"\s*\?\s*require\s*:\s*createRequire\(import\.meta\.url\);\n?/g, '');

// Ensure top-level imports for sqlDb, schemas, and drizzle-orm
const dbImports = `
import { sqlDb } from "../src/db/index.js";
import {
  users as pgUsers,
  outlets as pgOutlets,
  salesOutlets as pgSalesOutlets,
  callPlans as pgCallPlans,
  callPlanItems as pgCallPlanItems,
  attendance as pgAttendance,
  gpsEvents as pgGpsEvents,
  visits as pgVisits,
  transactions as pgTransactions,
  inventory as pgInventory,
  stockMovements as pgStockMovements,
  stockHandovers as pgStockHandovers,
  stockReturns as pgStockReturns,
  stockReceivings as pgStockReceivings,
  salesStockLedgers as pgSalesStockLedgers,
  targets as pgTargets,
  auditLogs as pgAuditLogs
} from "../src/db/schema.js";
import { eq, and } from "drizzle-orm";
`;

// Insert after other imports at top
content = content.replace('import { Router, Response } from "express";', 'import { Router, Response } from "express";\n' + dbImports);

// Now remove all local _require statements
// Pattern: const { ... } = _require(...);
content = content.replace(/\s*const\s*\{\s*sqlDb\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*auditLogs:\s*pgAuditLogs\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*attendance:\s*pgAttendance\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*outlets:\s*pgOutlets\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*visits:\s*pgVisits\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*transactions:\s*pgTransactions\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*targets:\s*pgTargets\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*gpsEvents:\s*pgGpsEvents\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*callPlans:\s*pgCallPlans,\s*callPlanItems:\s*pgCallPlanItems\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*callPlanItems:\s*pgCallPlanItems\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*salesStockLedgers\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*stockHandovers\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*stockHandovers:\s*pgStockHandovers\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*stockReturns:\s*pgStockReturns\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*stockReceivings\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*stockReceivings:\s*pgStockReceivings\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*stockMovements:\s*pgStockMovements,\s*inventory:\s*pgInventory\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*salesOutlets:\s*pgSalesOutlets\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*eq\s*\}\s*=\s*_require\([^)]+\);/g, '');
content = content.replace(/\s*const\s*\{\s*eq,\s*and\s*\}\s*=\s*_require\([^)]+\);/g, '');

// Also replace any leftover references to stockHandovers / stockReceivings / salesStockLedgers if used directly without alias
content = content.replace(/\bsqlDb\.insert\(stockHandovers\)/g, 'sqlDb.insert(pgStockHandovers)');
content = content.replace(/\bsqlDb\.insert\(stockReceivings\)/g, 'sqlDb.insert(pgStockReceivings)');
content = content.replace(/\bsqlDb\.insert\(salesStockLedgers\)/g, 'sqlDb.insert(pgSalesStockLedgers)');
content = content.replace(/\bsqlDb\.update\(salesStockLedgers\)/g, 'sqlDb.update(pgSalesStockLedgers)');

fs.writeFileSync('server/routes.ts', content);
console.log("Successfully cleaned and upgraded imports in server/routes.ts");
