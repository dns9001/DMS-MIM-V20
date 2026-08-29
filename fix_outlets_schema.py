import sys

with open("src/db/schema.ts", "r") as f:
    content = f.read()

target = """  status: text("status").default("ACTIVE"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
repl = """  status: text("status").default("ACTIVE"),
  photoUrl: text("photo_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
content = content.replace(target, repl)

with open("src/db/schema.ts", "w") as f:
    f.write(content)
