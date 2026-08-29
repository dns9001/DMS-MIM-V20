import { db } from "./data";

export interface ResolvedSkuInfo {
  sku_id: string;
  sku_code: string;
  sku_name: string;
  product_id?: string;
  product_name?: string;
  uom: string;
  resolved_name: string;
}

/**
 * Checks if a string looks like an internal technical ID / UUID / database key
 * e.g., "sku-178770073895", "65f1234abc...", "uuid-...", "usr-...", etc.
 */
export function isTechnicalId(str?: string | null): boolean {
  if (!str || typeof str !== "string") return true;
  const s = str.trim();
  if (!s) return true;
  if (/^sku-\d+/i.test(s)) return true;
  if (/^prd-\d+/i.test(s)) return true;
  if (/^usr-\d+/i.test(s)) return true;
  if (/^off-\d+/i.test(s)) return true;
  if (/^item-\d+/i.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^[0-9a-f]{24}$/i.test(s)) return true; // MongoDB ObjectId
  return false;
}

/**
 * Resolves full human-readable SKU information following strict priority:
 * 1. SKU Name (from master SKUs)
 * 2. Product Name (from master Products relation)
 * 3. SKU Code (if non-technical)
 * 4. Fallback: "SKU Tidak Ditemukan"
 *
 * Technical IDs/UUIDs are strictly blocked from being displayed as display names.
 */
export function resolveSkuInfo(skuInput: any): ResolvedSkuInfo {
  const rawId = typeof skuInput === "string" 
    ? skuInput 
    : (skuInput?._id || skuInput?.sku_id || skuInput?.id || "");

  // Find SKU in database
  let skuObj: any = null;
  if (typeof skuInput === "object" && skuInput !== null && (skuInput.name || skuInput.sku_name)) {
    skuObj = skuInput;
  }
  
  if (!skuObj && rawId) {
    skuObj = db.skus.find((s) => s._id === rawId || s.code === rawId || (s as any).sku_code === rawId);
  }

  // Extract candidate sku_name
  let skuName = "";
  if (skuObj?.name && !isTechnicalId(skuObj.name)) {
    skuName = skuObj.name;
  } else if (skuObj?.sku_name && !isTechnicalId(skuObj.sku_name)) {
    skuName = skuObj.sku_name;
  } else if (typeof skuInput === "object" && skuInput !== null) {
    if (skuInput.sku_name && !isTechnicalId(skuInput.sku_name)) skuName = skuInput.sku_name;
    else if (skuInput.name && !isTechnicalId(skuInput.name)) skuName = skuInput.name;
  }

  // Lookup Product relation for product_name fallback
  const prodId = skuObj?.product_id || (typeof skuInput === "object" ? skuInput?.product_id : "");
  let productName = "";
  if (prodId) {
    const prod = db.products.find((p) => p._id === prodId || p.code === prodId);
    if (prod?.name && !isTechnicalId(prod.name)) {
      productName = prod.name;
    } else if (prod?.product_name && !isTechnicalId(prod.product_name)) {
      productName = prod.product_name;
    }
  }

  // Extract sku_code
  let skuCode = "";
  if (skuObj?.code && !isTechnicalId(skuObj.code)) {
    skuCode = skuObj.code;
  } else if (skuObj?.sku_code && !isTechnicalId(skuObj.sku_code)) {
    skuCode = skuObj.sku_code;
  } else if (typeof skuInput === "object" && skuInput !== null) {
    if (skuInput.sku_code && !isTechnicalId(skuInput.sku_code)) skuCode = skuInput.sku_code;
    else if (skuInput.code && !isTechnicalId(skuInput.code)) skuCode = skuInput.code;
  }

  // Extract UOM / Unit
  const uom = skuObj?.unit || skuObj?.uom || (typeof skuInput === "object" ? (skuInput.unit || skuInput.uom) : "") || "Unit";

  // Prioritas Resolusi:
  // sku_name -> product_name -> sku_code -> "SKU Tidak Ditemukan"
  let resolvedName = "SKU Tidak Ditemukan";
  if (skuName && skuName.trim()) {
    resolvedName = skuName.trim();
  } else if (productName && productName.trim()) {
    resolvedName = productName.trim();
  } else if (skuCode && skuCode.trim()) {
    resolvedName = skuCode.trim();
  }

  return {
    sku_id: rawId || skuObj?._id || "-",
    sku_code: skuCode || "-",
    sku_name: skuName || "-",
    product_id: prodId || undefined,
    product_name: productName || undefined,
    uom: uom || "Unit",
    resolved_name: resolvedName,
  };
}

/**
 * Format a list of items for reports (Stock Handover, Stock Return, Receiving, Transactions).
 * Format: {sku_name}: {qty} {uom}
 * Multi-line by default for PDF and Table display.
 *
 * Example:
 * Biskuit Coklat 200gr: 50 BKS
 * Biskuit Vanilla 200gr: 50 BKS
 * Wafer Keju 100gr: 100 BKS
 */
export function formatSkuItemsSummary(items: any[], multiLine = true): string {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return "-";
  }

  const lines = items.map((it) => {
    const info = resolveSkuInfo(it);
    const qty = Number(it.quantity ?? it.qty ?? it.volume ?? 0);
    const uom = it.unit || it.uom || info.uom || "Unit";
    return `${info.resolved_name}: ${qty} ${uom}`;
  });

  return lines.join(multiLine ? "\n" : ", ");
}
