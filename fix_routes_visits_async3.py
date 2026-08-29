import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """apiRouter.post("/visits/:id/check-out", authMiddleware, (req: AuthenticatedRequest, res) => {"""
repl = """apiRouter.post("/visits/:id/check-out", authMiddleware, async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target, repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
