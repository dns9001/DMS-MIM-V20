import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

# Replace Handover confirm
handover_target_start = """  // 1. ATOMIC VALIDATION: Check warehouse stock for all items"""
handover_target_end = """  syncSingleDoc("stock_handovers", h._id, h);"""

match = re.search(re.escape(handover_target_start) + r".*?" + re.escape(handover_target_end), content, re.DOTALL)
if match:
    repl = """  try {
    await InventoryService.processHandover(h, h.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "INSUFFICIENT_WAREHOUSE_STOCK" });
  }

  const nowStr = new Date().toISOString();
  h.status = "CONFIRMED";
  h.confirmed_by = req.user!._id;
  h.confirmed_at = nowStr;
  h.updated_at = nowStr;
  syncSingleDoc("stock_handovers", h._id, h);"""
    content = content.replace(match.group(0), repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
