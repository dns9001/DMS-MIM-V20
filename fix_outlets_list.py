import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  const toDateTime = new Date\(to \+ "T23:59:59.999Z"\)\.getTime\(\);

  // 2\. Map and Enrich Each Outlet
  const enrichedOutlets = baseOutlets\.map\(\(o\) => \{
    const assignedSales = getAssignedSalesForOutlet\(o\);
    const channel = db\.channels\.find\(\(c\) => c\._id === o\.channel_id\);
    const area = db\.areas\.find\(\(a\) => a\._id === o\.area_id\);
    const prov = o\.province_name || db\.provinces\.find\(\(p\) => p\._id === o\.province_id\)\?\.name || "-";
    const reg = o\.regency_name || db\.regencies\.find\(\(r\) => r\._id === o\.regency_id\)\?\.name || "-";
    const dist = o\.district_name || db\.districts\.find\(\(d\) => d\._id === o\.district_id\)\?\.name || "-";
    const vil = o\.village_name || db\.villages\.find\(\(v\) => v\._id === o\.village_id\)\?\.name || "-";
    const post = o\.postal_code || db\.villages\.find\(\(v\) => v\._id === o\.village_id\)\?\.postal_code || "";

    // All-time completed transactions \(Strict rule: exclude CANCELLED & DRAFT\)
    const allCompletedTxns = db\.transactions
      \.filter\(\(t\) => t\.outlet_id === o\._id && t\.status !== "CANCELLED" && \(t as any\)\.status !== "DRAFT"\)
      \.sort\(\(a, b\) => \(a\.transaction_date || ""\)\.localeCompare\(b\.transaction_date || ""\)\);"""
repl = r"""  const toDateTime = new Date(to + "T23:59:59.999Z").getTime();

  // Pre-calculate completed txns to O(T)
  const txnsByOutlet = new Map<string, any[]>();
  db.transactions.forEach(t => {
    if (t.status !== "CANCELLED" && (t as any).status !== "DRAFT") {
      if (!txnsByOutlet.has(t.outlet_id)) txnsByOutlet.set(t.outlet_id, []);
      txnsByOutlet.get(t.outlet_id)!.push(t);
    }
  });

  // Pre-calculate assigned sales to O(S_O + O) instead of O(S_O * O)
  const salesOutletsMap = new Map<string, any>();
  db.sales_outlets.filter(so => so.status === "ACTIVE").forEach(so => {
     salesOutletsMap.set(so.outlet_id, so);
  });

  // 2. Map and Enrich Each Outlet
  const enrichedOutlets = baseOutlets.map((o) => {
    let assignedSales = null;
    const direct = salesOutletsMap.get(o._id);
    if (direct) {
      const user = db.users.find((u) => u._id === direct.sales_id);
      const salesman = db.salesmen.find((s) => s._id === direct.sales_id || s.user_id === direct.sales_id);
      assignedSales = {
        sales_id: direct.sales_id,
        sales_name: user?.name || salesman?.name || "-"
      };
    }

    const channel = db.channels.find((c) => c._id === o.channel_id);
    const area = db.areas.find((a) => a._id === o.area_id);
    const prov = o.province_name || db.provinces.find((p) => p._id === o.province_id)?.name || "-";
    const reg = o.regency_name || db.regencies.find((r) => r._id === o.regency_id)?.name || "-";
    const dist = o.district_name || db.districts.find((d) => d._id === o.district_id)?.name || "-";
    const vil = o.village_name || db.villages.find((v) => v._id === o.village_id)?.name || "-";
    const post = o.postal_code || db.villages.find((v) => v._id === o.village_id)?.postal_code || "";

    // All-time completed transactions (Strict rule: exclude CANCELLED & DRAFT)
    const allCompletedTxns = (txnsByOutlet.get(o._id) || []).sort((a, b) => (a.transaction_date || "").localeCompare(b.transaction_date || ""));"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
