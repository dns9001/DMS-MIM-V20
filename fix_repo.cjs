const fs = require('fs');
let code = fs.readFileSync('server/inventory.repository.ts', 'utf8');

if (!code.includes('isCloudSqlConnected')) {
  code = code.replace(
    'import { sqlDb } from "../src/db/index.js";',
    'import { sqlDb } from "../src/db/index.js";\nimport { isCloudSqlConnected } from "./cloudsqlSync.js";\nimport { db } from "./data.js";'
  );
}

// 1. getInventory
code = code.replace(
  'getInventory: async (locationType: string, locationId: string, skuId: string, tx: any = sqlDb) => {',
  `getInventory: async (locationType: string, locationId: string, skuId: string, tx: any = sqlDb) => {
    if (!isCloudSqlConnected) {
      const existing = db.inventory.find(i => (i.location_type === locationType || (!i.location_type && locationType === "WAREHOUSE")) && (i.location_id === locationId || i.office_id === locationId) && i.sku_id === skuId);
      if (!existing) return null;
      return { id: existing._id, stockOnHand: existing.stock_on_hand, availableStock: existing.available_stock, locationType, locationId, skuId };
    }`
);

// 2. getInventoryListByLocation
code = code.replace(
  'getInventoryListByLocation: async (locationType: string, locationId: string, tx: any = sqlDb) => {',
  `getInventoryListByLocation: async (locationType: string, locationId: string, tx: any = sqlDb) => {
    if (!isCloudSqlConnected) {
      return db.inventory.filter(i => (i.location_type === locationType || (!i.location_type && locationType === "WAREHOUSE")) && (i.location_id === locationId || i.office_id === locationId)).map(i => ({
        id: i._id, stockOnHand: i.stock_on_hand, availableStock: i.available_stock, locationType, locationId, skuId: i.sku_id
      }));
    }`
);

// 3. createOrUpdateInventory
code = code.replace(
  'createOrUpdateInventory: async (locationType: string, locationId: string, skuId: string, qtyDelta: number, tx: any = sqlDb) => {',
  `createOrUpdateInventory: async (locationType: string, locationId: string, skuId: string, qtyDelta: number, tx: any = sqlDb) => {
    if (!isCloudSqlConnected) {
      let existing = db.inventory.find(i => (i.location_type === locationType || (!i.location_type && locationType === "WAREHOUSE")) && (i.location_id === locationId || i.office_id === locationId) && i.sku_id === skuId);
      if (existing) {
        existing.stock_on_hand += qtyDelta;
        existing.available_stock += qtyDelta;
        return { id: existing._id, stockOnHand: existing.stock_on_hand, availableStock: existing.available_stock, allocatedStock: existing.allocated_stock, locationType, locationId, skuId };
      } else {
        const newInv = {
           _id: \`inv-\${Date.now()}\`,
           id: \`inv-\${Date.now()}\`,
           location_type: locationType,
           location_id: locationId,
           sku_id: skuId,
           stock_on_hand: qtyDelta,
           available_stock: qtyDelta,
           allocated_stock: 0,
           status: "ACTIVE"
        };
        db.inventory.push(newInv);
        return { id: newInv.id, stockOnHand: newInv.stock_on_hand, availableStock: newInv.available_stock, allocatedStock: newInv.allocated_stock, locationType, locationId, skuId };
      }
    }`
);

// 4. insertMovement
code = code.replace(
  'insertMovement: async (mvt: any, tx: any = sqlDb) => {',
  `insertMovement: async (mvt: any, tx: any = sqlDb) => {
    if (!isCloudSqlConnected) return { id: mvt.id || \`mvt-\${Date.now()}\` };`
);

// 5. upsertSalesStockLedger
code = code.replace(
  'upsertSalesStockLedger: async (salesmanId: string, date: string, skuId: string, updates: any, tx: any = sqlDb) => {',
  `upsertSalesStockLedger: async (salesmanId: string, date: string, skuId: string, updates: any, tx: any = sqlDb) => {
    if (!isCloudSqlConnected) return {};`
);

fs.writeFileSync('server/inventory.repository.ts', code);
