import { Router } from "express";
import { getCallMetrics, getProductEcMetrics } from "./callMetrics.service.js";

const router = Router();

function dateOnly(value: unknown): string {
  const valueString = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueString)) {
    throw new Error("date must use YYYY-MM-DD");
  }
  return valueString;
}

/** Canonical DMS metrics. Mount this router under /api/metrics. */
router.get("/calls", async (req, res) => {
  try {
    const date = dateOnly(req.query.date);
    const salesmanId = req.query.salesman_id ? String(req.query.salesman_id) : undefined;
    const metrics = await getCallMetrics(date, salesmanId);
    return res.json({ date, ...metrics });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
  }
});

router.get("/ec-product", async (req, res) => {
  try {
    const date = dateOnly(req.query.date);
    const salesmanId = req.query.salesman_id ? String(req.query.salesman_id) : undefined;
    const items = await getProductEcMetrics(date, salesmanId);
    return res.json({ date, items });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
  }
});

export default router;
