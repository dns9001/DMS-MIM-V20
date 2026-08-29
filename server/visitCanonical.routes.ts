import { Router } from "express";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { sqlDb } from "../src/db/index.js";
import { authMiddleware, AuthenticatedRequest } from "./auth.js";

const router = Router();

function asDate(value: unknown): Date {
  if (value == null || value === "") return new Date();
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("check_in_time tidak valid");
  return date;
}

/**
 * Canonical visit creation. All business-critical validation is performed against PostgreSQL.
 * This route intentionally does not trust is_effective_call from the client.
 */
router.post("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const requestedSalesmanId = String(req.body?.salesman_id || "").trim();
    const outletId = String(req.body?.outlet_id || "").trim();
    const callPlanId = req.body?.call_plan_id ? String(req.body.call_plan_id).trim() : null;

    if (!outletId) return res.status(400).json({ success: false, message: "outlet_id wajib diisi" });

    const salesmanRows = await sqlDb.execute(sql`
      SELECT s.id, s.area_id, s.status, u.status AS user_status
      FROM salesmen s
      JOIN users u ON u.id = s.user_id
      WHERE (${requestedSalesmanId} <> '' AND s.id = ${requestedSalesmanId})
         OR (${requestedSalesmanId} = '' AND s.user_id = ${req.user!._id})
      LIMIT 1
    `);
    const salesman = salesmanRows.rows[0] as any;
    if (!salesman || salesman.status !== "ACTIVE" || salesman.user_status !== "ACTIVE") {
      return res.status(403).json({ success: false, message: "Salesman tidak aktif atau tidak valid" });
    }

    if (requestedSalesmanId && String(salesman.id) !== requestedSalesmanId) {
      return res.status(403).json({ success: false, message: "Salesman tidak sesuai dengan sesi pengguna" });
    }

    const outletRows = await sqlDb.execute(sql`
      SELECT id, area_id, status
      FROM outlets
      WHERE id = ${outletId}
      LIMIT 1
    `);
    const outlet = outletRows.rows[0] as any;
    if (!outlet || outlet.status !== "ACTIVE") {
      return res.status(404).json({ success: false, message: "Outlet tidak ditemukan atau tidak aktif" });
    }

    const assignmentRows = await sqlDb.execute(sql`
      SELECT id
      FROM sales_outlets
      WHERE salesman_id = ${salesman.id}
        AND outlet_id = ${outletId}
        AND COALESCE(status, 'ACTIVE') = 'ACTIVE'
      LIMIT 1
    `);
    if (!assignmentRows.rows.length) {
      return res.status(403).json({ success: false, message: "Outlet tidak termasuk assignment Salesman ini" });
    }

    if (callPlanId) {
      const planRows = await sqlDb.execute(sql`
        SELECT cp.id
        FROM call_plans cp
        JOIN call_plan_items cpi ON cpi.call_plan_id = cp.id
        WHERE cp.id = ${callPlanId}
          AND cp.salesman_id = ${salesman.id}
          AND cpi.outlet_id = ${outletId}
          AND COALESCE(cp.status, 'ACTIVE') = 'ACTIVE'
        LIMIT 1
      `);
      if (!planRows.rows.length) {
        return res.status(403).json({ success: false, message: "Call Plan tidak valid untuk Salesman dan Outlet ini" });
      }
    }

    const latitude = req.body?.check_in_lat == null ? null : Number(req.body.check_in_lat);
    const longitude = req.body?.check_in_lng == null ? null : Number(req.body.check_in_lng);
    if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
      return res.status(400).json({ success: false, message: "Koordinat GPS tidak valid" });
    }

    const id = String(req.body?.id || randomUUID());
    const checkInTime = asDate(req.body?.check_in_time);
    const checkInDistance = req.body?.check_in_distance == null ? null : Number(req.body.check_in_distance);
    if (checkInDistance !== null && (!Number.isFinite(checkInDistance) || checkInDistance < 0)) {
      return res.status(400).json({ success: false, message: "check_in_distance tidak valid" });
    }

    const inserted = await sqlDb.execute(sql`
      INSERT INTO visits (
        id, salesman_id, outlet_id, call_plan_id, check_in_time,
        check_in_lat, check_in_lng, check_in_distance, check_in_photo,
        is_effective_call, non_productive_reason_id, notes, status, metadata
      ) VALUES (
        ${id}, ${salesman.id}, ${outletId}, ${callPlanId}, ${checkInTime},
        ${latitude}, ${longitude}, ${checkInDistance}, ${req.body?.check_in_photo || null},
        false, ${req.body?.non_productive_reason_id || null}, ${req.body?.notes || null}, 'COMPLETED',
        ${JSON.stringify({ source: "canonical_postgres", created_by: req.user!._id })}::jsonb
      )
      RETURNING id, salesman_id, outlet_id, call_plan_id, check_in_time, check_in_lat, check_in_lng,
        check_in_distance, check_in_photo, is_effective_call, status
    `);

    return res.status(201).json({ success: true, message: "Visit berhasil dicatat", data: inserted.rows[0] });
  } catch (error: any) {
    if (String(error?.code) === "23505") {
      return res.status(409).json({ success: false, message: "Visit dengan ID tersebut sudah tercatat" });
    }
    console.error("[Canonical Visit]", error);
    return res.status(500).json({ success: false, message: "Gagal mencatat visit: " + (error?.message || String(error)) });
  }
});

export default router;
