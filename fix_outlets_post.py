import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """    photo_url: photo || undefined,
    created_by: req.user!._id,
    created_at: new Date().toISOString(),
  };"""
repl = """    photo_url: photo || undefined,
    notes: (req.body.notes || "").trim(),
    created_by: req.user!._id,
    created_at: new Date().toISOString(),
  };"""
content = content.replace(target, repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
