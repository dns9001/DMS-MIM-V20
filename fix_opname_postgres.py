import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target_opname = r"""      db\.stock_movements\.push\(movement\);
      movements\.push\(movement\);
      syncSingleDoc\("stock_movements", movement\._id, movement\);
      syncSingleDoc\("inventory", targetInv\._id, targetInv\);"""

repl_opname = r"""      db.stock_movements.push(movement);
      movements.push(movement);
      syncSingleDoc("stock_movements", movement._id, movement);
      syncSingleDoc("inventory", targetInv._id, targetInv);

      // Insert into Postgres
      try {
        const { sqlDb } = require('../src/db/index.js');
        const { stockMovements: pgStockMovements, inventory: pgInventory } = require('../src/db/schema.js');
        const { eq } = require('drizzle-orm');

        // Insert Movement
        sqlDb.insert(pgStockMovements).values({
          id: movement._id,
          movementCode: movement.movement_code,
          movementType: movement.movement_type,
          sourceLocationType: movement.source_location_type,
          sourceLocationId: movement.source_location_id,
          destinationLocationType: movement.destination_location_type,
          destinationLocationId: movement.destination_location_id,
          skuId: movement.sku_id,
          quantity: movement.quantity,
          salesmanId: movement.salesman_id,
          officeId: movement.warehouse_id, // Ensure warehouse_id falls back to officeId
          businessDate: movement.business_date,
          status: movement.status,
          notes: movement.notes,
          createdBy: movement.created_by,
          createdAt: new Date(movement.created_at)
        }).catch((e: any) => console.error("Error inserting opname movement:", e.message));

        // Update Inventory
        sqlDb.update(pgInventory).set({
          stockOnHand: targetInv.stock_on_hand,
          availableStock: targetInv.available_stock,
          updatedAt: new Date(targetInv.updated_at)
        }).where(eq(pgInventory.id, targetInv._id))
          .catch((e: any) => console.error("Error updating opname inventory:", e.message));

      } catch (err: any) {
        console.error("Error with Postgres opname sync:", err.message);
      }"""

content = re.sub(target_opname, repl_opname, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
