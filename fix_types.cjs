const fs = require('fs');
let content = fs.readFileSync('server/routes.ts', 'utf8');

// Remove duplicate sqlDb import around line 86
content = content.replace(/import\s*\{\s*sqlDb\s*\}\s*from\s*"\.\.\/src\/db\/index\.js";\n?/g, (match, offset) => {
  // Keep only the first occurrence at the top
  return offset < 200 ? match : '';
});

// Fix salesStockLedgers references
content = content.replace(/\bwhere\(eq\(salesStockLedgers\./g, 'where(eq(pgSalesStockLedgers.');
content = content.replace(/\bfrom\(salesStockLedgers\)/g, 'from(pgSalesStockLedgers)');
content = content.replace(/\binsert\(salesStockLedgers\)/g, 'insert(pgSalesStockLedgers)');
content = content.replace(/\bupdate\(salesStockLedgers\)/g, 'update(pgSalesStockLedgers)');

// Fix updatedAt in stockHandovers update / insert
content = content.replace(/await sqlDb\.update\(pgStockHandovers\)\.set\(\{\s*status:\s*h\.status,\s*approvedBy:\s*h\.confirmed_by,\s*updatedAt:\s*new Date\(h\.updated_at\)\s*\}\)/g, 
  'await sqlDb.update(pgStockHandovers).set({ status: h.status, approvedBy: h.confirmed_by })');

// Fix updatedAt in stockReturns insert & update
content = content.replace(/createdAt:\s*new Date\(newReturn\.created_at\),\s*updatedAt:\s*new Date\(newReturn\.updated_at\)/g,
  'createdAt: new Date(newReturn.created_at)');

content = content.replace(/await sqlDb\.update\(pgStockReturns\)\.set\(\{\s*status:\s*r\.status,\s*approvedBy:\s*r\.confirmed_by,\s*updatedAt:\s*new Date\(r\.updated_at\)\s*\}\)/g,
  'await sqlDb.update(pgStockReturns).set({ status: r.status, approvedBy: r.confirmed_by })');

fs.writeFileSync('server/routes.ts', content);
console.log("Typescript fixes applied to server/routes.ts");
