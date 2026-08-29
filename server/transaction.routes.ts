import { Router } from "express";
import { authMiddleware, requireRoles, AuthenticatedRequest } from "./auth.js";
import { postSaleAtomic } from "./transaction.service.js";

const router = Router();

// Atomic posting endpoint. Existing legacy transaction routes remain untouched
// for compatibility; clients can migrate to this endpoint incrementally.
router.post("/post-atomic", authMiddleware, requireRoles("SALES", "SUPERVISOR", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body || {};
    const salesmanId = req.user!.role === "SALES" ? req.user!._id : String(body.salesman_id || "");
    if (!salesmanId) return res.status(400).json({ detail: "Salesman wajib ditentukan." });

    const result = await postSaleAtomic({
      invoice_number: String(body.invoice_number || "").trim(),
      salesman_id: salesmanId,
      outlet_id: String(body.outlet_id || ""),
      visit_id: body.visit_id ? String(body.visit_id) : undefined,
      office_id: body.office_id ? String(body.office_id) : undefined,
      transaction_type: body.transaction_type,
      items: Array.isArray(body.items) ? body.items : [],
      notes: body.notes,
      idempotency_key: body.idempotency_key,
    });

    return res.status(result.replayed ? 200 : 201).json({
      message: result.replayed ? "Transaksi sudah pernah diposting." : "Transaksi berhasil diposting secara atomic.",
      replayed: result.replayed,
      transaction: result.transaction,
    });
  } catch (err: any) {
    console.error("Atomic transaction failed:", err);
    return res.status(400).json({ detail: err?.message || "Transaksi gagal diposting." });
  }
});

export default router;
