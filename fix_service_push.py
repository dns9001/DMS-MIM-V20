import sys

with open("server/inventory.service.ts", "r") as f:
    content = f.read()

def replace_mem_if(old_if):
    return old_if + """ else {
         db.inventory.push({
            _id: inv.id || `inv-${Date.now()}`,
            location_type: (inv.locationType as any) || "WAREHOUSE",
            location_id: inv.locationId || "",
            office_id: inv.locationType === "WAREHOUSE" ? (inv.locationId || "") : "",
            sku_id: inv.skuId || "",
            stock_on_hand: inv.stockOnHand || 0,
            available_stock: inv.availableStock || 0,
            allocated_stock: inv.allocatedStock || 0,
            status: (inv.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }"""

content = content.replace(
    """      if (memInv) {
         memInv.stock_on_hand = inv.stockOnHand;
         memInv.available_stock = inv.availableStock;
      }""",
    replace_mem_if("""      if (memInv) {
         memInv.stock_on_hand = inv.stockOnHand;
         memInv.available_stock = inv.availableStock;
      }""")
)

# Replace for W1, S1, W2, S2, W3 (I used different names: memW, memS, memS2, memW2, memRcv, memOp, etc)
# Let's just do a generic replace using regex.

import re

content = re.sub(r'(if \((mem\w+)\) \{ \2\.stock_on_hand = (inv\w*)\.stockOnHand; \2\.available_stock = \3\.availableStock; \})', 
    r'''\1 else {
         db.inventory.push({
            _id: \3.id || `inv-${Date.now()}`,
            location_type: (\3.locationType as any) || "WAREHOUSE",
            location_id: \3.locationId || "",
            office_id: \3.locationType === "WAREHOUSE" ? (\3.locationId || "") : "",
            sku_id: \3.skuId || "",
            stock_on_hand: \3.stockOnHand || 0,
            available_stock: \3.availableStock || 0,
            allocated_stock: \3.allocatedStock || 0,
            status: (\3.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }''', content)

with open("server/inventory.service.ts", "w") as f:
    f.write(content)
