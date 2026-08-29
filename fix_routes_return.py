import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

# Replace Return confirm
return_target_start = """  // Validate sales stock"""
return_target_end = """  syncSingleDoc("stock_returns", r._id, r);"""

match = re.search(re.escape(return_target_start) + r".*?" + re.escape(return_target_end), content, re.DOTALL)
if match:
    repl = """  try {
    await InventoryService.processReturn(r, r.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "RETURN_EXCEEDS_SALES_STOCK" });
  }

  const nowStr = new Date().toISOString();
  r.status = "CONFIRMED";
  r.confirmed_by = req.user!._id;
  r.confirmed_at = nowStr;
  r.updated_at = nowStr;
  syncSingleDoc("stock_returns", r._id, r);"""
    content = content.replace(match.group(0), repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
