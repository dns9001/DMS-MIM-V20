import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

content = content.replace('created_at: r.createdAt?.toISOString() || ""', 'created_at: r.updatedAt?.toISOString() || ""')

target = """  try {
    await InventoryService.processReceiving(r, r.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {"""

repl = """  const nowStr = new Date().toISOString();
  try {
    await InventoryService.processReceiving(r, r.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {"""

content = content.replace(target, repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
