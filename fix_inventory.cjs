const fs = require('fs');
let code = fs.readFileSync('server/inventory.routes.ts', 'utf8');

code = code.replace(
  'import { resolveSkuInfo } from "./skuResolver.js";',
  'import { resolveSkuInfo } from "./skuResolver.js";\nimport { isCloudSqlConnected } from "./cloudsqlSync.js";'
);

code = code.replace(
  /const conditions = \[\];[\s\S]*?const items = await sqlDb.select\(\).from\(inventory\).where\(and\(\.\.\.conditions\)\);/,
  `let items: any[] = [];
  if (isCloudSqlConnected) {
    const conditions = [];
    if (location_type) conditions.push(eq(inventory.locationType, location_type));
    if (location_id) conditions.push(eq(inventory.locationId, location_id));
    if (sku_id) conditions.push(eq(inventory.skuId, sku_id));
    items = await sqlDb.select().from(inventory).where(and(...conditions));
  } else {
    items = db.inventory.filter((i) => {
      let m = true;
      if (location_type && i.location_type !== location_type) m = false;
      if (location_id && i.location_id !== location_id) m = false;
      if (sku_id && i.sku_id !== sku_id) m = false;
      return m;
    }).map((i) => ({
      id: i._id, locationType: i.location_type, locationId: i.location_id, skuId: i.sku_id,
      stockOnHand: i.stock_on_hand, availableStock: i.available_stock, allocatedStock: i.allocated_stock,
      status: i.status, updatedAt: i.updated_at ? new Date(i.updated_at) : new Date(),
    }));
  }`
);

fs.writeFileSync('server/inventory.routes.ts', code);
