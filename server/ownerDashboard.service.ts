import { sqlDb } from "../src/db/index.js";
import { isCloudSqlConnected } from "./cloudsqlSync.js";
import { sql } from "drizzle-orm";
import { db } from "./data.js";

function getOwnerDashboardDataInMemory(req: any) {
  const from = req.query.from || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const areaId = req.query.areaId;
  const salesmanId = req.query.salesmanId;
  const skuId = req.query.skuId;

  const safeFrom = from.replace(/[^0-9-]/g, '');
  const safeTo = to.replace(/[^0-9-]/g, '');
  const currentMonth = safeTo.substring(0, 7);

  const outletsMap = new Map((db.outlets || []).map((o: any) => [o._id || o.id, o]));
  const usersMap = new Map((db.users || []).map((u: any) => [u._id || u.id, u]));
  const areasMap = new Map((db.areas || []).map((a: any) => [a._id || a.id, a]));
  const skusMap = new Map((db.skus || []).map((s: any) => [s._id || s.id, s]));

  // Filter transactions
  const validTxns = (db.transactions || []).filter((t: any) => {
    const createdDate = (t.created_at || t.date || "").slice(0, 10);
    if (createdDate < safeFrom || createdDate > safeTo) return false;
    if (t.status === "CANCELLED" || t.payment_status === "CANCELLED" || t.delivery_status === "CANCELLED") return false;
    if (salesmanId && t.salesman_id !== salesmanId) return false;
    const outlet = outletsMap.get(t.outlet_id);
    if (areaId && outlet?.area_id !== areaId) return false;
    return true;
  });

  // Filter visits
  const validVisits = (db.visits || []).filter((v: any) => {
    const visitDate = (v.check_in_time || v.date || "").slice(0, 10);
    if (visitDate < safeFrom || visitDate > safeTo) return false;
    if (v.status === "CANCELLED") return false;
    if (salesmanId && v.salesman_id !== salesmanId) return false;
    const outlet = outletsMap.get(v.outlet_id);
    if (areaId && outlet?.area_id !== areaId) return false;
    return true;
  });

  // Visit set for effective call matching: "salesmanId|visitDate|outletId"
  const visitKeySet = new Set<string>();
  const distinctVisitOutlets = new Set<string>();
  validVisits.forEach((v: any) => {
    const visitDate = (v.check_in_time || v.date || "").slice(0, 10);
    visitKeySet.add(`${v.salesman_id}|${visitDate}|${v.outlet_id}`);
    distinctVisitOutlets.add(v.outlet_id);
  });

  let total_volume = 0;
  let total_revenue = 0;
  const distinctTxnOutlets = new Set<string>();
  const effectiveOutletsSet = new Set<string>();
  const txnIdSet = new Set<string>();

  const dailyStats: Record<string, { sales_value: number; volume: number; outlet_calls: Set<string>; effective_calls: Set<string> }> = {};

  // Initialize date range for trend
  const fromDate = new Date(safeFrom);
  const toDate = new Date(safeTo);
  for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    dailyStats[dateStr] = { sales_value: 0, volume: 0, outlet_calls: new Set(), effective_calls: new Set() };
  }

  validVisits.forEach((v: any) => {
    const dateStr = (v.check_in_time || v.date || "").slice(0, 10);
    if (dailyStats[dateStr]) {
      dailyStats[dateStr].outlet_calls.add(v.outlet_id);
    }
  });

  // Aggregate items and sales
  validTxns.forEach((t: any) => {
    const txnDate = (t.created_at || t.date || "").slice(0, 10);
    const hasVisit = visitKeySet.has(`${t.salesman_id}|${txnDate}|${t.outlet_id}`);
    const items = Array.isArray(t.items) ? t.items : [];

    let txnHasMatchingSku = false;
    items.forEach((item: any) => {
      const itemSkuId = item.sku_id || item._id;
      if (skuId && itemSkuId !== skuId) return;

      txnHasMatchingSku = true;
      const qty = Number(item.quantity || item.qty || 0);
      const price = Number(item.price || item.unit_price || 0);
      total_volume += qty;
      total_revenue += qty * price;

      if (dailyStats[txnDate]) {
        dailyStats[txnDate].volume += qty;
        dailyStats[txnDate].sales_value += qty * price;
      }
    });

    if (txnHasMatchingSku) {
      txnIdSet.add(t._id || t.id);
      distinctTxnOutlets.add(t.outlet_id);
      if (hasVisit) {
        effectiveOutletsSet.add(t.outlet_id);
        if (dailyStats[txnDate]) {
          dailyStats[txnDate].effective_calls.add(t.outlet_id);
        }
      }
    }
  });

  const outlet_calls = distinctVisitOutlets.size;
  const effective_calls = effectiveOutletsSet.size;
  const transaction_count = txnIdSet.size;
  const ec_rate = outlet_calls > 0 ? Math.round((effective_calls / outlet_calls) * 100) : 0;

  // Lifecycle status counts
  const noo_count = (db.outlets || []).filter((o: any) => {
    if (areaId && o.area_id !== areaId) return false;
    return o.lifecycle_status === "NOO" || o.lifecycle_status === "NEW";
  }).length;

  const repeat_count = (db.outlets || []).filter((o: any) => {
    if (areaId && o.area_id !== areaId) return false;
    return o.lifecycle_status === "REPEAT";
  }).length;

  const active_count = (db.outlets || []).filter((o: any) => {
    if (areaId && o.area_id !== areaId) return false;
    return o.lifecycle_status === "ACTIVE";
  }).length;

  const dormant_count = (db.outlets || []).filter((o: any) => {
    if (areaId && o.area_id !== areaId) return false;
    return o.lifecycle_status === "DORMANT" || o.lifecycle_status === "INACTIVE";
  }).length;

  const totalFilteredOutlets = (db.outlets || []).filter((o: any) => !areaId || o.area_id === areaId).length;
  const coverage = totalFilteredOutlets > 0 ? Math.round((distinctTxnOutlets.size / totalFilteredOutlets) * 100) : 0;

  // Planned calls across call plans in range
  const relevantCallPlans = (db.call_plans || []).filter((cp: any) => {
    const cpDate = (cp.date || "").slice(0, 10);
    if (cpDate < safeFrom || cpDate > safeTo) return false;
    if (salesmanId && cp.salesman_id !== salesmanId) return false;
    return true;
  });
  const planned_calls = relevantCallPlans.reduce((sum: number, cp: any) => {
    const items = (db.call_plan_items || []).filter((i: any) => i.call_plan_id === cp._id);
    return sum + (items.length || Number(cp.total_outlets || 0));
  }, 0);
  const missed_calls = Math.max(0, planned_calls - outlet_calls);

  // New Outlets
  const new_outlets = (db.outlets || []).filter((o: any) => {
    const createdDate = (o.created_at || "").slice(0, 10);
    if (createdDate < safeFrom || createdDate > safeTo) return false;
    if (areaId && o.area_id !== areaId) return false;
    return true;
  }).length;

  // Targets
  const activeTargets = (db.targets || []).filter((tg: any) => {
    if (tg.period_month !== currentMonth) return false;
    if (salesmanId && tg.salesman_id !== salesmanId) return false;
    return true;
  });
  const target_volume = activeTargets.reduce((sum: number, tg: any) => sum + Number(tg.target_volume || 0), 0);
  const achievement_percentage = target_volume > 0 ? Math.round((total_volume / target_volume) * 100) : 0;

  // Stock
  let warehouseStock = 0;
  let salesmanStock = 0;
  (db.inventory || []).forEach((inv: any) => {
    const qty = Number(inv.stock_on_hand || inv.quantity || 0);
    if (inv.location_type === "WAREHOUSE" || inv.location_type === "OFFICE") {
      warehouseStock += qty;
    } else if (inv.location_type === "SALESMAN" || inv.location_type === "SALES") {
      salesmanStock += qty;
    }
  });
  const stock_on_hand = warehouseStock + salesmanStock;

  // Active salesmen
  const active_salesmen = (db.users || []).filter((u: any) => u.role === "SALES" && u.status === "ACTIVE").length;

  // Trend list
  const trend = Object.keys(dailyStats).sort().map((dateStr) => {
    const dStat = dailyStats[dateStr];
    const oc = dStat.outlet_calls.size;
    const ec = dStat.effective_calls.size;
    return {
      date: dateStr,
      sales_value: dStat.sales_value,
      volume: dStat.volume,
      outlet_calls: oc,
      effective_calls: ec,
      ec_rate: oc > 0 ? Math.round((ec / oc) * 100) : 0,
      planned: 0,
    };
  });

  // Area performance
  const area_performance = (db.areas || []).map((area: any) => {
    const aId = area._id || area.id;
    let aVol = 0;
    let aVal = 0;
    const aVisits = new Set<string>();
    const aEc = new Set<string>();

    validTxns.forEach((t: any) => {
      const o = outletsMap.get(t.outlet_id);
      if (o?.area_id === aId) {
        let hasMatched = false;
        (t.items || []).forEach((item: any) => {
          if (!skuId || item.sku_id === skuId) {
            hasMatched = true;
            const q = Number(item.quantity || 0);
            const p = Number(item.price || item.unit_price || 0);
            aVol += q;
            aVal += q * p;
          }
        });
        const txnDate = (t.created_at || t.date || "").slice(0, 10);
        if (hasMatched && visitKeySet.has(`${t.salesman_id}|${txnDate}|${t.outlet_id}`)) {
          aEc.add(t.outlet_id);
        }
      }
    });

    validVisits.forEach((v: any) => {
      const o = outletsMap.get(v.outlet_id);
      if (o?.area_id === aId) {
        aVisits.add(v.outlet_id);
      }
    });

    const aTgt = (db.targets || []).filter((tg: any) => {
      const u = usersMap.get(tg.salesman_id);
      return tg.period_month === currentMonth && u?.area_id === aId;
    }).reduce((s: number, tg: any) => s + Number(tg.target_volume || 0), 0);

    const aOc = aVisits.size;
    const aEffective = aEc.size;

    return {
      area_id: aId,
      area: area.area_name || area.name,
      area_name: area.area_name || area.name,
      volume: aVol,
      sales_value: aVal,
      total_sales: aVal,
      outlet_calls: aOc,
      effective_calls: aEffective,
      target_volume: aTgt || null,
      achievement_percentage: aTgt > 0 ? Math.round((aVol / aTgt) * 100) : 0,
      achievement_formatted: aTgt > 0 ? `${Math.round((aVol / aTgt) * 100)}%` : "-",
      ec_rate: aOc > 0 ? Math.round((aEffective / aOc) * 100) : 0,
    };
  });

  // Salesman performance
  const salesman_performance = (db.users || []).filter((u: any) => u.role === "SALES").map((user: any) => {
    const sId = user._id || user.id;
    let sVol = 0;
    let sVal = 0;
    let sTxns = 0;
    const sVisits = new Set<string>();
    const sEc = new Set<string>();

    validTxns.forEach((t: any) => {
      if (t.salesman_id === sId) {
        let hasItem = false;
        (t.items || []).forEach((item: any) => {
          if (!skuId || item.sku_id === skuId) {
            hasItem = true;
            const q = Number(item.quantity || 0);
            const p = Number(item.price || item.unit_price || 0);
            sVol += q;
            sVal += q * p;
          }
        });
        if (hasItem) {
          sTxns++;
          const txnDate = (t.created_at || t.date || "").slice(0, 10);
          if (visitKeySet.has(`${sId}|${txnDate}|${t.outlet_id}`)) {
            sEc.add(t.outlet_id);
          }
        }
      }
    });

    validVisits.forEach((v: any) => {
      if (v.salesman_id === sId) {
        sVisits.add(v.outlet_id);
      }
    });

    const sTgt = (db.targets || []).filter((tg: any) => tg.period_month === currentMonth && tg.salesman_id === sId)
      .reduce((s: number, tg: any) => s + Number(tg.target_volume || 0), 0);

    const uArea = areasMap.get(user.area_id);
    const sOc = sVisits.size;
    const sEffective = sEc.size;

    return {
      salesman_id: sId,
      name: user.name,
      code: user.name,
      area: uArea?.area_name || user.area_id || "-",
      volume: sVol,
      sales_value: sVal,
      value: sVal,
      txns: sTxns,
      outlet_calls: sOc,
      effective_calls: sEffective,
      target_volume: sTgt || null,
      achievement_percentage: sTgt > 0 ? Math.round((sVol / sTgt) * 100) : 0,
      achievement_formatted: sTgt > 0 ? `${Math.round((sVol / sTgt) * 100)}%` : "-",
      ec_rate: sOc > 0 ? Math.round((sEffective / sOc) * 100) : 0,
      planned: 0,
    };
  });

  // Product coverage
  const product_coverage = (db.skus || []).map((sku: any) => {
    const skId = sku._id || sku.id;
    let pVol = 0;
    let pVal = 0;

    validTxns.forEach((t: any) => {
      (t.items || []).forEach((item: any) => {
        if (item.sku_id === skId) {
          const q = Number(item.quantity || 0);
          const p = Number(item.price || item.unit_price || 0);
          pVol += q;
          pVal += q * p;
        }
      });
    });

    return {
      sku_id: skId,
      sku: sku.sku_name || sku.name,
      code: sku.sku_code || sku.code,
      qty: pVol,
      value: pVal,
      sales_value: pVal,
      effective_calls: 0,
      target_volume: null,
      achievement_percentage: 0,
      achievement_formatted: "-",
      outlet_calls: outlet_calls,
      coverage: 0,
    };
  });

  // Top Outlets
  const outletSalesMap: Record<string, { volume: number; value: number }> = {};
  validTxns.forEach((t: any) => {
    if (!outletSalesMap[t.outlet_id]) outletSalesMap[t.outlet_id] = { volume: 0, value: 0 };
    (t.items || []).forEach((item: any) => {
      if (!skuId || item.sku_id === skuId) {
        const q = Number(item.quantity || 0);
        const p = Number(item.price || item.unit_price || 0);
        outletSalesMap[t.outlet_id].volume += q;
        outletSalesMap[t.outlet_id].value += q * p;
      }
    });
  });

  const top_outlets = Object.keys(outletSalesMap)
    .map((oId) => {
      const o = outletsMap.get(oId);
      return {
        name: o?.outlet_name || o?.name || oId,
        volume: outletSalesMap[oId].volume,
        value: outletSalesMap[oId].value,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  return {
    totals: {
      sales_value: total_revenue,
      total_sales: total_revenue,
      total_volume: total_volume,
      volume: total_volume,
      target_volume: target_volume,
      actual_volume: total_volume,
      achievement_percentage: achievement_percentage,
      achievement_formatted: `${achievement_percentage}%`,
      achievement_status: "Target Berdasarkan Volume",
      transactions: transaction_count,
      transaction_count: transaction_count,
      planned: planned_calls,
      outlet_calls: outlet_calls,
      actual: outlet_calls,
      effective_calls: effective_calls,
      effective: effective_calls,
      ec_rate: ec_rate,
      effective_ratio: ec_rate,
      missed: missed_calls,
      coverage: coverage,
      new_outlets: new_outlets,
      noo_count: noo_count,
      repeat_count: repeat_count,
      active_count: active_count,
      dormant_count: dormant_count,
      active_sales: active_salesmen,
      active_salesmen: active_salesmen,
      warehouse_stock: warehouseStock,
      salesman_stock: salesmanStock,
      stock_on_hand: stock_on_hand,
    },
    trend,
    area_performance,
    product_coverage,
    salesman_performance,
    top_outlets,
  };
}

export async function getOwnerDashboardData(req: any) {
  if (!isCloudSqlConnected) {
    return getOwnerDashboardDataInMemory(req);
  }

  try {
    const from = req.query.from || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const areaId = req.query.areaId;
    const salesmanId = req.query.salesmanId;
    const skuId = req.query.skuId;

    // We will build parts of the WHERE clause manually for the raw SQL
    const safeFrom = from.replace(/[^0-9-]/g, '');
    const safeTo = to.replace(/[^0-9-]/g, '');
    const safeAreaId = areaId ? areaId.replace(/[^a-zA-Z0-9_-]/g, '') : null;
    const safeSalesmanId = salesmanId ? salesmanId.replace(/[^a-zA-Z0-9_-]/g, '') : null;
    const safeSkuId = skuId ? skuId.replace(/[^a-zA-Z0-9_-]/g, '') : null;

    let conditionsTxn = `to_char(t.created_at, 'YYYY-MM-DD') >= '${safeFrom}' AND to_char(t.created_at, 'YYYY-MM-DD') <= '${safeTo}' AND t.payment_status != 'CANCELLED' AND t.delivery_status != 'CANCELLED'`;
    let conditionsVis = `v.status = 'COMPLETED' AND to_char(v.check_in_time, 'YYYY-MM-DD') >= '${safeFrom}' AND to_char(v.check_in_time, 'YYYY-MM-DD') <= '${safeTo}'`;
    let conditionsArea = "";
    let conditionsSales = "";

    if (safeAreaId) {
      conditionsArea = ` AND o.area_id = '${safeAreaId}'`;
    }
    let conditionsSalesVis = "";
    if (safeSalesmanId) {
      conditionsSales = ` AND t.salesman_id = '${safeSalesmanId}'`;
      conditionsSalesVis = ` AND v.salesman_id = '${safeSalesmanId}'`;
    }

    let skuFilter = safeSkuId ? ` AND item->>'sku_id' = '${safeSkuId}'` : "";

    const mainQuery = `
      WITH valid_visits AS (
        SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id
        FROM visits v
        JOIN outlets o ON v.outlet_id = o.id
        WHERE ${conditionsVis} ${conditionsArea} ${conditionsSalesVis}
      ),
      valid_txns AS (
        SELECT t.id, t.salesman_id, t.outlet_id, to_char(t.created_at, 'YYYY-MM-DD') as txn_date, t.items
        FROM transactions t
        JOIN outlets o ON t.outlet_id = o.id
        WHERE ${conditionsTxn} ${conditionsArea} ${conditionsSales}
      ),
      txn_items AS (
        SELECT t.id, t.salesman_id, t.outlet_id, t.txn_date, jsonb_array_elements(t.items) as item
        FROM valid_txns t
      ),
      filtered_items AS (
        SELECT id, salesman_id, outlet_id, txn_date, 
               COALESCE((item->>'quantity')::numeric, 0) as qty, 
               COALESCE((item->>'price')::numeric, (item->>'unit_price')::numeric, 0) as price
        FROM txn_items
        WHERE 1=1 ${skuFilter}
      ),
      effective_calls AS (
        SELECT DISTINCT f.salesman_id, f.txn_date, f.outlet_id
        FROM filtered_items f
        JOIN valid_visits v ON v.salesman_id = f.salesman_id AND v.visit_date = f.txn_date AND v.outlet_id = f.outlet_id
      )
      SELECT 
        (SELECT count(DISTINCT outlet_id) FROM valid_visits) as outlet_calls,
        (SELECT count(DISTINCT outlet_id) FROM effective_calls) as effective_calls,
        (SELECT COALESCE(sum(qty), 0) FROM filtered_items) as total_volume,
        (SELECT COALESCE(sum(qty * price), 0) FROM filtered_items) as total_revenue,
        (SELECT count(DISTINCT id) FROM filtered_items) as transaction_count,
        (SELECT count(DISTINCT outlet_id) FROM filtered_items) as distinct_txn_outlets
    `;

    const kpiRes = await sqlDb.execute(sql.raw(mainQuery));
    const kpiData = kpiRes.rows[0];

    const total_revenue = Number(kpiData?.total_revenue) || 0;
    const total_volume = Number(kpiData?.total_volume) || 0;
    const outlet_calls = Number(kpiData?.outlet_calls) || 0;
    const effective_calls = Number(kpiData?.effective_calls) || 0;
    const transaction_count = Number(kpiData?.transaction_count) || 0;
    const distinct_txn_outlets = Number(kpiData?.distinct_txn_outlets) || 0;
    const ec_rate = outlet_calls > 0 ? Math.round((effective_calls / outlet_calls) * 100) : 0;

    // Planned calls in range
    let planned_calls = 0;
    try {
      const plannedQ = `
        SELECT COALESCE(sum(COALESCE(cpi.count, cp.total_outlets, 0)), 0) as planned_calls
        FROM call_plans cp
        LEFT JOIN (
          SELECT call_plan_id, count(*) as count FROM call_plan_items GROUP BY call_plan_id
        ) cpi ON cp.id = cpi.call_plan_id
        WHERE to_char(cp.date, 'YYYY-MM-DD') >= '${safeFrom}' AND to_char(cp.date, 'YYYY-MM-DD') <= '${safeTo}'
        ${safeSalesmanId ? ` AND cp.salesman_id = '${safeSalesmanId}'` : ""}
      `;
      const plannedRes = await sqlDb.execute(sql.raw(plannedQ));
      planned_calls = Number(plannedRes.rows[0]?.planned_calls) || 0;
    } catch {
      planned_calls = 0;
    }
    const missed_calls = Math.max(0, planned_calls - outlet_calls);

    // Total outlets for coverage
    let coverage = 0;
    try {
      const totalOutletsQ = `SELECT count(*) as count FROM outlets o WHERE 1=1 ${conditionsArea}`;
      const totalOutletsRes = await sqlDb.execute(sql.raw(totalOutletsQ));
      const totalOutletsCount = Number(totalOutletsRes.rows[0]?.count) || 0;
      coverage = totalOutletsCount > 0 ? Math.round((distinct_txn_outlets / totalOutletsCount) * 100) : 0;
    } catch {
      coverage = 0;
    }

    // New Outlets count
    const newOutletsQ = `
      SELECT count(*) as count 
      FROM outlets o 
      WHERE to_char(o.created_at, 'YYYY-MM-DD') >= '${safeFrom}' 
        AND to_char(o.created_at, 'YYYY-MM-DD') <= '${safeTo}'
        ${conditionsArea}
    `;
    const newOutletsRes = await sqlDb.execute(sql.raw(newOutletsQ));
    const new_outlets = Number(newOutletsRes.rows[0]?.count) || 0;

    const lifecycleQuery = `
      WITH outlet_txns AS (
        SELECT 
          outlet_id, 
          min(created_at) as first_txn,
          max(created_at) as last_txn,
          count(*) as total_txns
        FROM transactions
        WHERE payment_status != 'CANCELLED' AND delivery_status != 'CANCELLED'
          AND to_char(created_at, 'YYYY-MM-DD') <= '${safeTo}'
        GROUP BY outlet_id
      )
      SELECT 
        (SELECT count(*) FROM outlet_txns WHERE total_txns = 1 AND to_char(first_txn, 'YYYY-MM-DD') >= '${safeFrom}') as noo_count,
        (SELECT count(*) FROM outlet_txns WHERE total_txns = 2 AND to_char(last_txn, 'YYYY-MM-DD') >= '${safeFrom}') as repeat_count,
        (SELECT count(*) FROM outlet_txns WHERE total_txns >= 3 AND to_char(last_txn, 'YYYY-MM-DD') >= '${safeFrom}') as active_count,
        (SELECT count(*) FROM outlet_txns WHERE last_txn < (CURRENT_DATE - INTERVAL '8 weeks')) as dormant_count
    `;
    const lcRes = await sqlDb.execute(sql.raw(lifecycleQuery));
    const lcData = lcRes.rows[0] || {};

    // Targets (overall)
    const currentMonth = safeTo.substring(0, 7);
    const tgtQuery = `
      SELECT 
        COALESCE(sum(target_volume), 0) as target_vol,
        COALESCE(sum(target_revenue), 0) as target_rev
      FROM targets t
      WHERE t.period_month = '${currentMonth}'
      ${safeSalesmanId ? ` AND t.salesman_id = '${safeSalesmanId}'` : ""}
    `;
    const tgtRes = await sqlDb.execute(sql.raw(tgtQuery));
    const target_volume = Number(tgtRes.rows[0]?.target_vol) || 0;
    
    let achievement_percentage = 0;
    if (target_volume > 0) {
      achievement_percentage = Math.round((total_volume / target_volume) * 100);
    }

    // Active salesmen
    const activeSalesmenRes = await sqlDb.execute(sql.raw(`SELECT count(*) as count FROM users WHERE role='SALES' AND status='ACTIVE'`));
    const active_salesmen = Number(activeSalesmenRes.rows[0]?.count) || 0;
    
    const stockQuery = `
      SELECT 
        location_type,
        SUM(stock_on_hand) as total_stock
      FROM inventory
      GROUP BY location_type
    `;
    const stockRes = await sqlDb.execute(sql.raw(stockQuery));
    
    let warehouseStock = 0;
    let salesmanStock = 0;
    stockRes.rows.forEach(r => {
      if (r.location_type === 'WAREHOUSE' || r.location_type === 'OFFICE') {
        warehouseStock += Number(r.total_stock) || 0;
      } else if (r.location_type === 'SALESMAN') {
        salesmanStock += Number(r.total_stock) || 0;
      }
    });
    
    const stock_on_hand = warehouseStock + salesmanStock;

    // Trend query
    const trendQuery = `
      WITH valid_visits AS (
        SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id
        FROM visits v
        JOIN outlets o ON v.outlet_id = o.id
        WHERE ${conditionsVis} ${conditionsArea} ${conditionsSalesVis}
      ),
      valid_txns AS (
        SELECT t.id, t.salesman_id, t.outlet_id, to_char(t.created_at, 'YYYY-MM-DD') as txn_date, t.items
        FROM transactions t
        JOIN outlets o ON t.outlet_id = o.id
        WHERE ${conditionsTxn} ${conditionsArea} ${conditionsSales}
      ),
      txn_items AS (
        SELECT t.id, t.salesman_id, t.outlet_id, t.txn_date, jsonb_array_elements(t.items) as item
        FROM valid_txns t
      ),
      filtered_items AS (
        SELECT id, salesman_id, outlet_id, txn_date, 
               COALESCE((item->>'quantity')::numeric, 0) as qty, 
               COALESCE((item->>'price')::numeric, (item->>'unit_price')::numeric, 0) as price
        FROM txn_items
        WHERE 1=1 ${skuFilter}
      ),
      effective_calls AS (
        SELECT DISTINCT f.salesman_id, f.txn_date, f.outlet_id
        FROM filtered_items f
        JOIN valid_visits v ON v.salesman_id = f.salesman_id AND v.visit_date = f.txn_date AND v.outlet_id = f.outlet_id
      )
      SELECT 
        series.date,
        COALESCE(sales.sales_value, 0) as sales_value,
        COALESCE(sales.volume, 0) as volume,
        COALESCE(oc.outlet_calls, 0) as outlet_calls,
        COALESCE(ec.effective_calls, 0) as effective_calls
      FROM (
        SELECT to_char(generate_series('${safeFrom}'::date, '${safeTo}'::date, '1 day'::interval), 'YYYY-MM-DD') as date
      ) series
      LEFT JOIN (
        SELECT txn_date as date, sum(qty * price) as sales_value, sum(qty) as volume
        FROM filtered_items
        GROUP BY txn_date
      ) sales ON series.date = sales.date
      LEFT JOIN (
        SELECT visit_date as date, count(DISTINCT outlet_id) as outlet_calls
        FROM valid_visits
        GROUP BY visit_date
      ) oc ON series.date = oc.date
      LEFT JOIN (
        SELECT txn_date as date, count(DISTINCT outlet_id) as effective_calls
        FROM effective_calls
        GROUP BY txn_date
      ) ec ON series.date = ec.date
      ORDER BY series.date ASC
    `;
    const trendRes = await sqlDb.execute(sql.raw(trendQuery));
    const trend = trendRes.rows.map(row => ({
      date: row.date,
      sales_value: Number(row.sales_value),
      volume: Number(row.volume),
      outlet_calls: Number(row.outlet_calls),
      effective_calls: Number(row.effective_calls),
      ec_rate: Number(row.outlet_calls) > 0 ? Math.round((Number(row.effective_calls)/Number(row.outlet_calls))*100) : 0,
      planned: 0
    }));

    // Area performance
    const areaQuery = `
      WITH valid_visits AS (
        SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id, o.area_id
        FROM visits v
        JOIN outlets o ON v.outlet_id = o.id
        WHERE ${conditionsVis} ${conditionsSalesVis}
      ),
      valid_txns AS (
        SELECT t.id, t.salesman_id, t.outlet_id, to_char(t.created_at, 'YYYY-MM-DD') as txn_date, t.items, o.area_id
        FROM transactions t
        JOIN outlets o ON t.outlet_id = o.id
        WHERE ${conditionsTxn} ${conditionsSales}
      ),
      txn_items AS (
        SELECT t.id, t.salesman_id, t.outlet_id, t.area_id, t.txn_date, jsonb_array_elements(t.items) as item
        FROM valid_txns t
      ),
      filtered_items AS (
        SELECT id, salesman_id, outlet_id, area_id, txn_date, 
               COALESCE((item->>'quantity')::numeric, 0) as qty, 
               COALESCE((item->>'price')::numeric, (item->>'unit_price')::numeric, 0) as price
        FROM txn_items
        WHERE 1=1 ${skuFilter}
      ),
      effective_calls AS (
        SELECT DISTINCT f.salesman_id, f.txn_date, f.outlet_id, f.area_id
        FROM filtered_items f
        JOIN valid_visits v ON v.salesman_id = f.salesman_id AND v.visit_date = f.txn_date AND v.outlet_id = f.outlet_id
      )
      SELECT 
        a.id as area_id,
        a.area_name as area,
        a.area_name as area_name,
        COALESCE(sales.volume, 0) as volume,
        COALESCE(sales.sales_value, 0) as sales_value,
        COALESCE(sales.total_sales, 0) as total_sales,
        COALESCE(oc.outlet_calls, 0) as outlet_calls,
        COALESCE(ec.effective_calls, 0) as effective_calls,
        COALESCE(t.target_volume, 0) as target_volume
      FROM areas a
      LEFT JOIN (
        SELECT area_id, sum(qty * price) as sales_value, sum(qty * price) as total_sales, sum(qty) as volume
        FROM filtered_items
        GROUP BY area_id
      ) sales ON a.id = sales.area_id
      LEFT JOIN (
        SELECT area_id, count(DISTINCT outlet_id) as outlet_calls
        FROM valid_visits
        GROUP BY area_id
      ) oc ON a.id = oc.area_id
      LEFT JOIN (
        SELECT area_id, count(DISTINCT outlet_id) as effective_calls
        FROM effective_calls
        GROUP BY area_id
      ) ec ON a.id = ec.area_id
      LEFT JOIN (
        SELECT u.area_id, sum(t.target_volume) as target_volume
        FROM targets t
        JOIN users u ON t.salesman_id = u.id
        WHERE t.period_month = '${currentMonth}'
        GROUP BY u.area_id
      ) t ON a.id = t.area_id
      ${safeAreaId ? ` WHERE a.id = '${safeAreaId}'` : ""}
      ORDER BY sales_value DESC
    `;
    const areaRes = await sqlDb.execute(sql.raw(areaQuery));
    const area_performance = areaRes.rows.map(row => ({
      ...row,
      volume: Number(row.volume),
      sales_value: Number(row.sales_value),
      total_sales: Number(row.total_sales),
      outlet_calls: Number(row.outlet_calls),
      effective_calls: Number(row.effective_calls),
      target_volume: Number(row.target_volume) || null,
      achievement_percentage: Number(row.target_volume) > 0 ? Math.round((Number(row.volume) / Number(row.target_volume))*100) : 0,
      achievement_formatted: Number(row.target_volume) > 0 ? `${Math.round((Number(row.volume) / Number(row.target_volume))*100)}%` : '-',
      ec_rate: Number(row.outlet_calls) > 0 ? Math.round((Number(row.effective_calls)/Number(row.outlet_calls))*100) : 0,
    }));

    // Salesman Performance
    const salesmanQuery = `
      WITH valid_visits AS (
        SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id
        FROM visits v
        JOIN outlets o ON v.outlet_id = o.id
        WHERE ${conditionsVis} ${conditionsArea} ${conditionsSalesVis}
      ),
      valid_txns AS (
        SELECT t.id, t.salesman_id, t.outlet_id, to_char(t.created_at, 'YYYY-MM-DD') as txn_date, t.items
        FROM transactions t
        JOIN outlets o ON t.outlet_id = o.id
        WHERE ${conditionsTxn} ${conditionsArea}
      ),
      txn_items AS (
        SELECT t.id, t.salesman_id, t.outlet_id, t.txn_date, jsonb_array_elements(t.items) as item
        FROM valid_txns t
      ),
      filtered_items AS (
        SELECT id, salesman_id, outlet_id, txn_date, 
               COALESCE((item->>'quantity')::numeric, 0) as qty, 
               COALESCE((item->>'price')::numeric, (item->>'unit_price')::numeric, 0) as price
        FROM txn_items
        WHERE 1=1 ${skuFilter}
      ),
      effective_calls AS (
        SELECT DISTINCT f.salesman_id, f.txn_date, f.outlet_id
        FROM filtered_items f
        JOIN valid_visits v ON v.salesman_id = f.salesman_id AND v.visit_date = f.txn_date AND v.outlet_id = f.outlet_id
      )
      SELECT 
        u.id as salesman_id,
        u.name as name,
        u.name as code,
        a.area_name as area,
        COALESCE(sales.volume, 0) as volume,
        COALESCE(sales.sales_value, 0) as sales_value,
        COALESCE(sales.txns, 0) as txns,
        COALESCE(sales.total_sales, 0) as value,
        COALESCE(oc.outlet_calls, 0) as outlet_calls,
        COALESCE(ec.effective_calls, 0) as effective_calls,
        COALESCE(t.target_volume, 0) as target_volume
      FROM users u
      LEFT JOIN areas a ON u.area_id = a.id
      LEFT JOIN (
        SELECT salesman_id, sum(qty * price) as sales_value, sum(qty * price) as total_sales, sum(qty) as volume, count(DISTINCT id) as txns
        FROM filtered_items
        GROUP BY salesman_id
      ) sales ON u.id = sales.salesman_id
      LEFT JOIN (
        SELECT salesman_id, count(DISTINCT outlet_id) as outlet_calls
        FROM valid_visits
        GROUP BY salesman_id
      ) oc ON u.id = oc.salesman_id
      LEFT JOIN (
        SELECT salesman_id, count(DISTINCT outlet_id) as effective_calls
        FROM effective_calls
        GROUP BY salesman_id
      ) ec ON u.id = ec.salesman_id
      LEFT JOIN (
        SELECT salesman_id, sum(target_volume) as target_volume
        FROM targets
        WHERE period_month = '${currentMonth}'
        GROUP BY salesman_id
      ) t ON u.id = t.salesman_id
      WHERE u.role = 'SALES' ${safeSalesmanId ? ` AND u.id = '${safeSalesmanId}'` : ""}
      ORDER BY sales_value DESC
    `;
    const salesmanRes = await sqlDb.execute(sql.raw(salesmanQuery));
    const salesman_performance = salesmanRes.rows.map(row => ({
      ...row,
      volume: Number(row.volume),
      sales_value: Number(row.sales_value),
      value: Number(row.value),
      txns: Number(row.txns),
      outlet_calls: Number(row.outlet_calls),
      effective_calls: Number(row.effective_calls),
      target_volume: Number(row.target_volume) || null,
      achievement_percentage: Number(row.target_volume) > 0 ? Math.round((Number(row.volume) / Number(row.target_volume))*100) : 0,
      achievement_formatted: Number(row.target_volume) > 0 ? `${Math.round((Number(row.volume) / Number(row.target_volume))*100)}%` : '-',
      ec_rate: Number(row.outlet_calls) > 0 ? Math.round((Number(row.effective_calls)/Number(row.outlet_calls))*100) : 0,
      planned: 0
    }));

    // SKU Coverage
    const skuQuery = `
      WITH valid_visits AS (
        SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id
        FROM visits v
        JOIN outlets o ON v.outlet_id = o.id
        WHERE ${conditionsVis} ${conditionsArea} ${conditionsSalesVis}
      ),
      valid_txns AS (
        SELECT t.id, t.salesman_id, t.outlet_id, to_char(t.created_at, 'YYYY-MM-DD') as txn_date, t.items
        FROM transactions t
        JOIN outlets o ON t.outlet_id = o.id
        WHERE ${conditionsTxn} ${conditionsArea} ${conditionsSales}
      ),
      txn_items AS (
        SELECT t.id, t.salesman_id, t.outlet_id, t.txn_date, jsonb_array_elements(t.items) as item
        FROM valid_txns t
      ),
      filtered_items AS (
        SELECT id, salesman_id, outlet_id, txn_date, 
               item->>'sku_id' as sku_id,
               COALESCE((item->>'quantity')::numeric, 0) as qty, 
               COALESCE((item->>'price')::numeric, (item->>'unit_price')::numeric, 0) as price
        FROM txn_items
        WHERE 1=1 ${skuFilter}
      ),
      effective_calls AS (
        SELECT DISTINCT f.salesman_id, f.txn_date, f.outlet_id, f.sku_id
        FROM filtered_items f
        JOIN valid_visits v ON v.salesman_id = f.salesman_id AND v.visit_date = f.txn_date AND v.outlet_id = f.outlet_id
      )
      SELECT 
        s.id as sku_id,
        s.sku_name as sku,
        s.sku_code as code,
        COALESCE(sales.volume, 0) as qty,
        COALESCE(sales.sales_value, 0) as value,
        COALESCE(sales.sales_value, 0) as sales_value,
        COALESCE(ec.effective_calls, 0) as effective_calls
      FROM skus s
      LEFT JOIN (
        SELECT sku_id, sum(qty * price) as sales_value, sum(qty) as volume
        FROM filtered_items
        GROUP BY sku_id
      ) sales ON s.id = sales.sku_id
      LEFT JOIN (
        SELECT sku_id, count(DISTINCT outlet_id) as effective_calls
        FROM effective_calls
        GROUP BY sku_id
      ) ec ON s.id = ec.sku_id
      ${safeSkuId ? ` WHERE s.id = '${safeSkuId}'` : ""}
      ORDER BY qty DESC
    `;
    
    const outletQuery = `
      WITH valid_txns AS (
        SELECT t.id, t.salesman_id, t.outlet_id, to_char(t.created_at, 'YYYY-MM-DD') as txn_date, t.items
        FROM transactions t
        JOIN outlets o ON t.outlet_id = o.id
        WHERE ${conditionsTxn} ${conditionsArea} ${conditionsSales}
      ),
      txn_items AS (
        SELECT t.id, t.outlet_id, jsonb_array_elements(t.items) as item
        FROM valid_txns t
      ),
      filtered_items AS (
        SELECT id, outlet_id, 
               COALESCE((item->>'quantity')::numeric, 0) as qty, 
               COALESCE((item->>'price')::numeric, (item->>'unit_price')::numeric, 0) as price
        FROM txn_items
        WHERE 1=1 ${skuFilter}
      )
      SELECT 
        o.id as outlet_id,
        o.outlet_name as name,
        COALESCE(sales.volume, 0) as volume,
        COALESCE(sales.sales_value, 0) as value
      FROM outlets o
      JOIN (
        SELECT outlet_id, sum(qty * price) as sales_value, sum(qty) as volume
        FROM filtered_items
        GROUP BY outlet_id
      ) sales ON o.id = sales.outlet_id
      ORDER BY sales_value DESC
      LIMIT 20
    `;
    const outletRes = await sqlDb.execute(sql.raw(outletQuery));
    const top_outlets = outletRes.rows.map(row => ({
      name: row.name,
      volume: Number(row.volume),
      value: Number(row.value)
    }));

    const skuRes = await sqlDb.execute(sql.raw(skuQuery));
    const product_coverage = skuRes.rows.map(row => ({
      ...row,
      qty: Number(row.qty),
      value: Number(row.value),
      sales_value: Number(row.sales_value),
      effective_calls: Number(row.effective_calls),
      target_volume: null,
      achievement_percentage: 0,
      achievement_formatted: '-',
      outlet_calls: outlet_calls,
      coverage: outlet_calls > 0 ? Math.round((Number(row.effective_calls)/outlet_calls)*100) : 0
    }));

    const inMemFallback = getOwnerDashboardDataInMemory(req);

    return {
      totals: {
        sales_value: total_revenue || inMemFallback.totals.sales_value,
        total_sales: total_revenue || inMemFallback.totals.total_sales,
        total_volume: total_volume || inMemFallback.totals.total_volume,
        volume: total_volume || inMemFallback.totals.volume,
        target_volume: target_volume || inMemFallback.totals.target_volume,
        actual_volume: total_volume || inMemFallback.totals.actual_volume,
        achievement_percentage: achievement_percentage || inMemFallback.totals.achievement_percentage,
        achievement_formatted: `${achievement_percentage || inMemFallback.totals.achievement_percentage}%`,
        achievement_status: "Target Berdasarkan Volume",
        transactions: transaction_count || inMemFallback.totals.transactions,
        transaction_count: transaction_count || inMemFallback.totals.transaction_count,
        planned: planned_calls || inMemFallback.totals.planned,
        outlet_calls: outlet_calls || inMemFallback.totals.outlet_calls,
        actual: outlet_calls || inMemFallback.totals.actual,
        effective_calls: effective_calls || inMemFallback.totals.effective_calls,
        effective: effective_calls || inMemFallback.totals.effective,
        ec_rate: ec_rate || inMemFallback.totals.ec_rate,
        effective_ratio: ec_rate || inMemFallback.totals.effective_ratio,
        missed: missed_calls || inMemFallback.totals.missed,
        coverage: coverage || inMemFallback.totals.coverage,
        new_outlets: new_outlets || inMemFallback.totals.new_outlets,
        noo_count: Number(lcData.noo_count) || inMemFallback.totals.noo_count,
        repeat_count: Number(lcData.repeat_count) || inMemFallback.totals.repeat_count,
        active_count: Number(lcData.active_count) || inMemFallback.totals.active_count,
        dormant_count: Number(lcData.dormant_count) || inMemFallback.totals.dormant_count,
        active_sales: active_salesmen || inMemFallback.totals.active_sales,
        active_salesmen: active_salesmen || inMemFallback.totals.active_salesmen,
        warehouse_stock: warehouseStock || inMemFallback.totals.warehouse_stock,
        salesman_stock: salesmanStock || inMemFallback.totals.salesman_stock,
        stock_on_hand: stock_on_hand || inMemFallback.totals.stock_on_hand
      },
      trend: (trend && trend.length > 0) ? trend : inMemFallback.trend,
      area_performance: (area_performance && area_performance.length > 0) ? area_performance : inMemFallback.area_performance, 
      product_coverage: (product_coverage && product_coverage.length > 0) ? product_coverage : inMemFallback.product_coverage,
      salesman_performance: (salesman_performance && salesman_performance.length > 0) ? salesman_performance : inMemFallback.salesman_performance,
      top_outlets: (top_outlets && top_outlets.length > 0) ? top_outlets : inMemFallback.top_outlets
    };
  } catch (error) {
    console.warn("[getOwnerDashboardData] PostgreSQL query failed, falling back to in-memory store:", error);
    return getOwnerDashboardDataInMemory(req);
  }
}

