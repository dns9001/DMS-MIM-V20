import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """apiRouter.post("/stock/receivings", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {"""
repl = """apiRouter.post("/stock/receivings", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target, repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
