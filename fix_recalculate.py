import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""export function recalculateAllOutletStatuses\(currentDate: Date = new Date\(\)\) \{
  db\.outlets\.forEach\(\(o\) => \{
    recalculateOutletSummary\(o\._id, currentDate\);
  \}\);
\}"""
repl = r"""export function recalculateAllOutletStatuses(currentDate: Date = new Date()) {
  // O(T) single pass over transactions to aggregate
  const completedTxns = db.transactions.filter(
    (t) => t.status !== "CANCELLED" && (t as any).status !== "DRAFT"
  );
  
  const aggregation = new Map<string, any[]>();
  for (const t of completedTxns) {
    if (!aggregation.has(t.outlet_id)) {
      aggregation.set(t.outlet_id, []);
    }
    aggregation.get(t.outlet_id)!.push(t);
  }

  for (const o of db.outlets) {
    const txns = aggregation.get(o._id) || [];
    txns.sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
    
    const count = txns.length;
    const firstTxn = txns[0];
    const lastTxn = txns[txns.length - 1];
    
    const firstAt = firstTxn ? firstTxn.transaction_date : null;
    const lastAt = lastTxn ? lastTxn.transaction_date : null;
    
    const totalVolume = txns.reduce(
      (sum, t) => sum + (t.total_volume ?? (t.items || []).reduce((is: number, i: any) => is + (Number(i.quantity ?? i.volume) || 0), 0)),
      0
    );
    const totalRevenue = txns.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    
    const prevStatus = o.lifecycle_status;
    const newStatus = calculateOutletStatus(count, lastAt, currentDate);
    
    o.completed_transaction_count = count;
    o.first_completed_transaction_at = firstAt;
    o.last_completed_transaction_at = lastAt;
    o.lifecycle_status = newStatus;
    o.total_volume = totalVolume;
    o.total_revenue = totalRevenue;
  }
}"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
