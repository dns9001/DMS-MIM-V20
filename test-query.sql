WITH RECURSIVE days AS (
      SELECT '2026-08-16'::date AS date
      UNION ALL
      SELECT (date + INTERVAL '1 day')::date FROM days WHERE date < '2026-08-29'::date
    ),
    visits_day AS (
      SELECT DATE(v.check_in_time) AS date, v.salesman_id, v.outlet_id
      FROM visits v
      WHERE v.status <> 'CANCELLED'
        AND DATE(v.check_in_time) BETWEEN '2026-08-16'::date AND '2026-08-29'::date
        
      GROUP BY DATE(v.check_in_time), v.salesman_id, v.outlet_id
    ),
    purchases_day AS (
      SELECT DATE(t.created_at) AS date, t.salesman_id, t.outlet_id
      FROM transactions t
      WHERE DATE(t.created_at) BETWEEN '2026-08-16'::date AND '2026-08-29'::date
        AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
        
      GROUP BY DATE(t.created_at), t.salesman_id, t.outlet_id
    ),
    product_purchases AS (
      SELECT DISTINCT DATE(t.created_at) AS date, t.salesman_id, t.outlet_id, item->>'sku_id' AS sku_id
      FROM transactions t
      INNER JOIN visits_day v
        ON v.date = DATE(t.created_at)
       AND v.salesman_id = t.salesman_id
       AND v.outlet_id = t.outlet_id
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.items, '[]'::jsonb)) item
      WHERE DATE(t.created_at) BETWEEN '2026-08-16'::date AND '2026-08-29'::date
        AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
        AND NULLIF(item->>'sku_id', '') IS NOT NULL
        
    ),
    daily AS (
      SELECT
        d.date,
        COUNT(DISTINCT (v.salesman_id, v.outlet_id))::int AS outlet_call,
        COUNT(DISTINCT (v.salesman_id, v.outlet_id)) FILTER (
          WHERE p.outlet_id IS NOT NULL
        )::int AS effective_call,
        (SELECT COUNT(*) FROM product_purchases pp WHERE pp.date = d.date)::int AS ec_product_rows
      FROM days d
      LEFT JOIN visits_day v ON v.date = d.date
      LEFT JOIN purchases_day p
        ON p.date = v.date
       AND p.salesman_id = v.salesman_id
       AND p.outlet_id = v.outlet_id
      GROUP BY d.date
    )
    SELECT date, outlet_call, effective_call, ec_product_rows
    FROM daily
    ORDER BY date;
