import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target1 = """apiRouter.post("/stock/handovers", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), (req: AuthenticatedRequest, res) => {"""
repl1 = """apiRouter.post("/stock/handovers", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target1, repl1)

target2 = """apiRouter.post("/stock/returns", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), (req: AuthenticatedRequest, res) => {"""
repl2 = """apiRouter.post("/stock/returns", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target2, repl2)

target3 = """apiRouter.post("/stock/receivings", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), (req: AuthenticatedRequest, res) => {"""
repl3 = """apiRouter.post("/stock/receivings", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target3, repl3)

with open("server/routes.ts", "w") as f:
    f.write(content)
