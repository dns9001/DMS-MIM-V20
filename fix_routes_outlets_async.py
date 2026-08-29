import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """apiRouter.post("/outlets", authMiddleware, (req: AuthenticatedRequest, res) => {"""
repl = """apiRouter.post("/outlets", authMiddleware, async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target, repl)

target2 = """apiRouter.post("/visits/:id/check-out", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "SALES"), (req: AuthenticatedRequest, res) => {"""
repl2 = """apiRouter.post("/visits/:id/check-out", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "SALES"), async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target2, repl2)

target3 = """apiRouter.post("/visits/check-in", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "SALES"), (req: AuthenticatedRequest, res) => {"""
repl3 = """apiRouter.post("/visits/check-in", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "SALES"), async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target3, repl3)

with open("server/routes.ts", "w") as f:
    f.write(content)
