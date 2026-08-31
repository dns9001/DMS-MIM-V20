import { sqlDb } from "./src/db/index.js";
import { sql } from "drizzle-orm";

async function run() {
  const from = '2026-08-17';
  const to = '2026-08-30';
  const safeFrom = from;
  const safeTo = to;
  let conditionsTxn = `to_char(t.created_at, 'YYYY-MM-DD') >= '${safeFrom}' AND to_char(t.created_at, 'YYYY-MM-DD') <= '${safeTo}' AND t.payment_status != 'CANCELLED' AND t.delivery_status != 'CANCELLED'`;
  let conditionsVis = `v.status = 'COMPLETED' AND to_char(v.check_in_time, 'YYYY-MM-DD') >= '${safeFrom}' AND to_char(v.check_in_time, 'YYYY-MM-DD') <= '${safeTo}'`;
  let conditionsArea = "";
  let conditionsSales = "";
  let skuFilter = "";

  const mainQuery = `
    WITH valid_visits AS (
      SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id
      FROM visits v
      JOIN outlets o ON v.outlet_id = o.id
      WHERE ${conditionsVis} ${conditionsArea}
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
      (SELECT count(DISTINCT id) FROM filtered_items) as transaction_count
  `;

  try {
    await sqlDb.execute(sql.raw(mainQuery));
    console.log("mainQuery Success");
  } catch (e) { console.error("mainQuery Error", e.message); }

  const newOutletsQ = `
    SELECT count(*) as count 
    FROM outlets o 
    WHERE to_char(o.created_at, 'YYYY-MM-DD') >= '${safeFrom}' 
      AND to_char(o.created_at, 'YYYY-MM-DD') <= '${safeTo}'
      ${conditionsArea}
  `;
  try { await sqlDb.execute(sql.raw(newOutletsQ)); console.log("newOutletsQ Success"); } catch(e){ console.error("newOutletsQ Error", e.message); }

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
  try { await sqlDb.execute(sql.raw(lifecycleQuery)); console.log("lifecycleQuery Success"); } catch(e){ console.error("lifecycleQuery Error", e.message); }

  const tgtQuery = `
    SELECT 
      COALESCE(sum(target_volume), 0) as target_vol,
      COALESCE(sum(target_revenue), 0) as target_rev
    FROM targets t
    WHERE t.period_month = '2026-08'
  `;
  try { await sqlDb.execute(sql.raw(tgtQuery)); console.log("tgtQuery Success"); } catch(e){ console.error("tgtQuery Error", e.message); }

  const stockQuery = `
    SELECT 
      location_type,
      SUM(stock_on_hand) as total_stock
    FROM inventory
    GROUP BY location_type
  `;
  try { await sqlDb.execute(sql.raw(stockQuery)); console.log("stockQuery Success"); } catch(e){ console.error("stockQuery Error", e.message); }

  // Check trendQuery
  const trendQuery = `
    WITH valid_visits AS (
      SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id
      FROM visits v
      JOIN outlets o ON v.outlet_id = o.id
      WHERE ${conditionsVis} ${conditionsArea}
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
  try { await sqlDb.execute(sql.raw(trendQuery)); console.log("trendQuery Success"); } catch(e){ console.error("trendQuery Error", e.message); }

  // Area query
  const areaQuery = `
    WITH valid_visits AS (
      SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id, o.area_id
      FROM visits v
      JOIN outlets o ON v.outlet_id = o.id
      WHERE ${conditionsVis} ${conditionsSales}
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
      WHERE t.period_month = '2026-08'
      GROUP BY u.area_id
    ) t ON a.id = t.area_id
    ORDER BY sales_value DESC
  `;
  try { await sqlDb.execute(sql.raw(areaQuery)); console.log("areaQuery Success"); } catch(e){ console.error("areaQuery Error", e.message); }
  
  // salesmanQuery
  const salesmanQuery = `
    WITH valid_visits AS (
      SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id
      FROM visits v
      JOIN outlets o ON v.outlet_id = o.id
      WHERE ${conditionsVis} ${conditionsArea}
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
      WHERE period_month = '2026-08'
      GROUP BY salesman_id
    ) t ON u.id = t.salesman_id
    WHERE u.role = 'SALES'
    ORDER BY sales_value DESC
  `;
  try { await sqlDb.execute(sql.raw(salesmanQuery)); console.log("salesmanQuery Success"); } catch(e){ console.error("salesmanQuery Error", e.message); }

  // skuQuery
  const skuQuery = `
    WITH valid_visits AS (
      SELECT DISTINCT v.salesman_id, to_char(v.check_in_time, 'YYYY-MM-DD') as visit_date, v.outlet_id
      FROM visits v
      JOIN outlets o ON v.outlet_id = o.id
      WHERE ${conditionsVis} ${conditionsArea}
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
    ORDER BY qty DESC
  `;
  try { await sqlDb.execute(sql.raw(skuQuery)); console.log("skuQuery Success"); } catch(e){ console.error("skuQuery Error", e.message); }

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
  try { await sqlDb.execute(sql.raw(outletQuery)); console.log("outletQuery Success"); } catch(e){ console.error("outletQuery Error", e.message); }

  console.log("All done");
  process.exit(0);
}
run();
