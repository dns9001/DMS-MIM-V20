import sys

with open("src/db/schema.ts", "r") as f:
    content = f.read()

# Fix inventory table
inv_target = """  reorderLevel: integer("reorder_level").default(10),
  status: text("status").default("ACTIVE"),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
inv_repl = """  reorderLevel: integer("reorder_level").default(10),
  status: text("status").default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
content = content.replace(inv_target, inv_repl)

# Fix stockHandovers table
sh_target = """  status: text("status").default("PENDING"),
  items: jsonb("items").notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
sh_repl = """  status: text("status").default("PENDING"),
  items: jsonb("items").notNull(),
  notes: text("notes"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
content = content.replace(sh_target, sh_repl)

# Fix stockReturns table
sr_target = """  status: text("status").default("PENDING"),
  items: jsonb("items").notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
sr_repl = """  status: text("status").default("PENDING"),
  items: jsonb("items").notNull(),
  notes: text("notes"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
content = content.replace(sr_target, sr_repl)

# Fix stockReceivings table
rcv_target = """export const stockReceivings = pgTable("stock_receivings", {
  id: text("id").primaryKey(),
  receivingNumber: text("receiving_number").notNull(),
  officeId: text("office_id").notNull(),
  supplierName: text("supplier_name"),
  receivedDate: text("received_date").notNull(),
  items: jsonb("items").notNull(),
  receivedBy: text("received_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
rcv_repl = """export const stockReceivings = pgTable("stock_receivings", {
  id: text("id").primaryKey(),
  receivingNumber: text("receiving_number").notNull(),
  poNumber: text("po_number"),
  officeId: text("office_id").notNull(),
  supplierName: text("supplier_name"),
  receivedDate: text("received_date").notNull(),
  status: text("status").default("DRAFT"),
  totalQuantity: integer("total_quantity").default(0),
  totalValue: doublePrecision("total_value").default(0),
  items: jsonb("items").notNull(),
  notes: text("notes"),
  receivedBy: text("received_by").notNull(),
  postedBy: text("posted_by"),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata"),
});"""
content = content.replace(rcv_target, rcv_repl)

with open("src/db/schema.ts", "w") as f:
    f.write(content)
