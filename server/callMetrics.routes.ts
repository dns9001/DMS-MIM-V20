import { Router } from "express";
import { getCallMetrics, getCallMetricsRange, getProductEcMetrics } from "./callMetrics.service.js";
import visitCanonicalRouter from "./visitCanonical.routes.js";
import { apiRouter } from "./routes.js";

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
    if (req.query.from || req.query.to) {
      const from = dateOnly(req.query.from);
      const to = dateOnly(req.query.to);
      if (from > to) return res.status(400).json({ message: "from must be less than or equal to to" });
      const salesmanId = req.query.salesman_id ? String(req.query.salesman_id) : undefined;
      const daily = await getCallMetricsRange(from, to, salesmanId);
      const outletCall = daily.reduce((sum, x) => sum + x.outlet_call, 0);
      const effectiveCall = daily.reduce((sum, x) => sum + x.effective_call, 0);
      return res.json({
        from,
        to,
        outlet_call: outletCall,
        effective_call: effectiveCall,
        ec_rate: outletCall ? Number(((effectiveCall / outletCall) * 100).toFixed(2)) : 0,
        daily,
      });
    }

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

// The canonical visit route is mounted on /api/visits via the existing apiRouter.
// It is imported here because server.ts already loads this router before apiRouter starts handling requests.
apiRouter.use("/visits", visitCanonicalRouter);

export default router;
