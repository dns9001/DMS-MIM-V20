import { Router } from "express";
import { authMiddleware, requireRoles, AuthenticatedRequest } from "./auth.js";
import { postSaleAtomic } from "./transaction.service.js";
import { sqlDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";
import { transactionItems } from "./transaction-items.schema.js";
import { transactions, skus } from "../src/db/schema.js";

const router = Router();

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

/**
 * Product Effective Call: one EC per distinct outlet/product/day.
 * A second invoice for the same outlet and SKU on the same day does not
 * increase EC. The metric is derived from posted transaction_items.
 */
router.get("/ec-product", authMiddleware, requireRoles("SALES", "SUPERVISOR", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ detail: "Format date harus YYYY-MM-DD." });

    const salesmanId = req.user!.role === "SALES" ? req.user!._id : String(req.query.salesman_id || "");
    const salesmanFilter = salesmanId ? sql`AND t.salesman_id = ${salesmanId}` : sql``;

    const rows = await sqlDb.execute(sql`
      SELECT
        ti.sku_id,
        COALESCE(ti.product_id, s.product_id) AS product_id,
        COUNT(DISTINCT t.outlet_id)::int AS effective_call,
        COALESCE(SUM(ti.quantity), 0)::int AS volume,
        COUNT(DISTINCT t.id)::int AS transaction_count
      FROM transaction_items ti
      INNER JOIN transactions t ON t.id = ti.transaction_id
      LEFT JOIN skus s ON s.id = ti.sku_id
      WHERE t.created_at >= ${date}::date
        AND t.created_at < (${date}::date + INTERVAL '1 day')
        ${salesmanFilter}
      GROUP BY ti.sku_id, COALESCE(ti.product_id, s.product_id)
      ORDER BY effective_call DESC, volume DESC, ti.sku_id
    `);

    return res.json({
      date,
      salesman_id: salesmanId || null,
      definition: "EC Product = jumlah outlet unik yang membeli SKU tersebut pada hari yang sama.",
      items: rows.rows,
      total: rows.rows.length,
    });
  } catch (err: any) {
    console.error("EC product report failed:", err);
    return res.status(500).json({ detail: err?.message || "Gagal mengambil EC per product." });
  }
});

export default router;
