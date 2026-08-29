/**
 * Checks if a string is a technical ID (sku-123..., UUID, etc.)
 */
export function isTechnicalId(str) {
  if (!str || typeof str !== "string") return true;
  const s = str.trim();
  if (!s) return true;
  if (/^sku-\d+/i.test(s)) return true;
  if (/^prd-\d+/i.test(s)) return true;
  if (/^usr-\d+/i.test(s)) return true;
  if (/^off-\d+/i.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^[0-9a-f]{24}$/i.test(s)) return true;
  return false;
}

/**
 * Resolves human-readable SKU name with strict fallbacks:
 * sku_name -> product_name -> sku_code -> "SKU Tidak Ditemukan"
 */
export function resolveClientSkuName(item, masterSkus = [], masterProducts = []) {
  if (!item) return "SKU Tidak Ditemukan";
  
  const rawId = typeof item === "string" ? item : (item._id || item.sku_id || item.id);
  const skuObj = masterSkus.find((s) => s._id === rawId || s.code === rawId) || (typeof item === "object" ? item : null);

  // 1. sku_name
  if (skuObj?.name && !isTechnicalId(skuObj.name)) return skuObj.name;
  if (skuObj?.sku_name && !isTechnicalId(skuObj.sku_name)) return skuObj.sku_name;
  if (item.sku_name && !isTechnicalId(item.sku_name)) return item.sku_name;
  if (item.name && !isTechnicalId(item.name)) return item.name;

  // 2. product_name
  const prodId = skuObj?.product_id || item?.product_id;
  if (prodId) {
    const prod = masterProducts.find((p) => p._id === prodId || p.code === prodId);
    if (prod?.name && !isTechnicalId(prod.name)) return prod.name;
  }
  if (item.product_name && !isTechnicalId(item.product_name)) return item.product_name;

  // 3. sku_code
  if (skuObj?.code && !isTechnicalId(skuObj.code)) return skuObj.code;
  if (skuObj?.sku_code && !isTechnicalId(skuObj.sku_code)) return skuObj.sku_code;
  if (item.sku_code && !isTechnicalId(item.sku_code)) return item.sku_code;

  return "SKU Tidak Ditemukan";
}

/**
 * Formats multi-line or single-line item summary: {sku_name}: {qty} {uom}
 */
export function formatClientSkuItems(items, masterSkus = [], masterProducts = [], multiLine = true) {
  if (!items || !Array.isArray(items) || items.length === 0) return "-";

  const lines = items.map((it) => {
    const name = resolveClientSkuName(it, masterSkus, masterProducts);
    const qty = it.quantity ?? it.qty ?? it.volume ?? 0;
    const uom = it.unit || it.uom || "Unit";
    return `${name}: ${qty} ${uom}`;
  });

  return lines.join(multiLine ? "\n" : ", ");
}
