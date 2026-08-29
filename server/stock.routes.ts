import { Router } from "express";
import { authMiddleware, requireRoles, AuthenticatedRequest } from "./auth.js";
import { sqlDb } from "../src/db/index.js";
import { stockHandovers, stockReturns, stockReceivings } from "../src/db/schema.js";
import { eq, desc } from "drizzle-orm";
import { InventoryService } from "./inventory.service.js";
import { db } from "./data.js";

const router = Router();

// Handovers
router.get("/handovers", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const items = await sqlDb.select().from(stockHandovers).orderBy(desc(stockHandovers.createdAt));
  res.json({ items, total: items.length });
});

router.post("/handovers/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const handovers = await sqlDb.select().from(stockHandovers).where(eq(stockHandovers.id, req.params.id));
    if (!handovers.length) return res.status(404).json({ detail: "Handover not found" });
    const h = handovers[0];
    if (h.status === "CONFIRMED") return res.status(400).json({ detail: "Already confirmed" });

    await InventoryService.processHandover(h, h.items as any[], req.user!._id);
    
    await sqlDb.update(stockHandovers).set({ status: "CONFIRMED" }).where(eq(stockHandovers.id, h.id));
    res.json({ message: "Handover confirmed" });
  } catch (err: any) {
    res.status(400).json({ detail: err.message });
  }
});

// Returns
router.get("/returns", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const items = await sqlDb.select().from(stockReturns).orderBy(desc(stockReturns.createdAt));
  res.json({ items, total: items.length });
});

router.post("/returns/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const returns = await sqlDb.select().from(stockReturns).where(eq(stockReturns.id, req.params.id));
    if (!returns.length) return res.status(404).json({ detail: "Return not found" });
    const r = returns[0];
    if (r.status === "CONFIRMED") return res.status(400).json({ detail: "Already confirmed" });

    await InventoryService.processReturn(r, r.items as any[], req.user!._id);
    
    await sqlDb.update(stockReturns).set({ status: "CONFIRMED" }).where(eq(stockReturns.id, r.id));
    res.json({ message: "Return confirmed" });
  } catch (err: any) {
    res.status(400).json({ detail: err.message });
  }
});

export default router;
