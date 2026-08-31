const fs = require('fs');
let code = fs.readFileSync('server/inventory.routes.ts', 'utf8');

code = code.replace(
  /const conditions = \[\];[\s\S]*?const movements = await sqlDb.select\(\).from\(stockMovements\).where\(and\(\.\.\.conditions\)\).orderBy\(desc\(stockMovements.createdAt\)\);/,
  `let movements: any[] = [];
  if (isCloudSqlConnected) {
    const conditions = [];
    if (from_date) conditions.push(gte(stockMovements.createdAt, new Date(from_date)));
    if (to_date) { const toDate = new Date(to_date); toDate.setHours(23, 59, 59, 999); conditions.push(lte(stockMovements.createdAt, toDate)); }
    if (sku_id) conditions.push(eq(stockMovements.skuId, sku_id));
    if (movement_type) conditions.push(eq(stockMovements.movementType, movement_type));
    if (salesman_id) conditions.push(eq(stockMovements.performedBy, salesman_id));
    movements = await sqlDb.select().from(stockMovements).where(and(...conditions)).orderBy(desc(stockMovements.createdAt));
  } else {
    movements = []; // fallback in-memory movements not implemented or fetched from somewhere else if needed, returning empty for now
  }`
);

fs.writeFileSync('server/inventory.routes.ts', code);
