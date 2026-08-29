import { sqlDb } from "../src/db/index.js";
import { transactions, visits, outlets, skus, salesOutlets } from "../src/db/schema.js";
import { transactionItems } from "./transaction-items.schema.js";
import { InventoryRepository } from "./inventory.repository.js";
import { eq } from "drizzle-orm";

export type SaleItemInput = {
  sku_id: string;
  quantity: number;
  unit_price?: number;
  discount_amount?: number;
};

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Posts a sale as one PostgreSQL transaction. The legacy JSONB `items` field is
 * retained for compatibility, while normalized transaction_items are written
 * in the same DB transaction. Stock, movement, invoice and EC are committed
 * together or rolled back together.
 */
export async function postSaleAtomic(input: {
  invoice_number: string;
  salesman_id: string;
  outlet_id: string;
  visit_id?: string;
  office_id?: string;
  transaction_type?: string;
  items: SaleItemInput[];
  notes?: string;
  idempotency_key?: string;
}) {
  if (!input.invoice_number?.trim()) throw new Error("Nomor invoice wajib diisi.");
  if (!input.salesman_id || !input.outlet_id) throw new Error("Salesman dan outlet wajib diisi.");
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("Minimal satu item transaksi wajib diisi.");

  const cleanItems = input.items.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price ?? 0);
    const discount = Number(item.discount_amount ?? 0);
    if (!item.sku_id || !Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity setiap SKU harus bilangan bulat lebih dari 0.");
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(discount) || discount < 0) throw new Error("Harga/discount tidak valid.");
    return { ...item, quantity, unitPrice, discount };
  });

  return await sqlDb.transaction(async (tx) => {
    // Idempotency: invoice number is the durable unique business key. A retry
    // returns the existing transaction instead of creating a second sale.
    const existing = await tx.select().from(transactions).where(eq(transactions.invoiceNumber, input.invoice_number)).limit(1);
    if (existing[0]) return { transaction: existing[0], replayed: true };

    const outlet = await tx.select().from(outlets).where(eq(outlets.id, input.outlet_id)).limit(1);
    if (!outlet[0]) throw new Error("Outlet tidak ditemukan.");
    if (outlet[0].status !== "ACTIVE") throw new Error("Outlet tidak aktif.");

    // Sales can only transact against outlets explicitly assigned to them.
    // This enforces the DMS area/outlet ownership rule at the database write path,
    // rather than relying on frontend filtering.
    const assignment = await tx.select().from(salesOutlets)
      .where(eq(salesOutlets.salesmanId, input.salesman_id))
      .then((rows) => rows.find((row) => row.outletId === input.outlet_id && row.status === "ACTIVE"));
    if (!assignment) throw new Error("Outlet tidak termasuk assignment Salesman ini.");

    if (input.visit_id) {
      const visit = await tx.select().from(visits).where(eq(visits.id, input.visit_id)).limit(1);
      if (!visit[0]) throw new Error("Visit tidak ditemukan.");
      if (visit[0].salesmanId !== input.salesman_id || visit[0].outletId !== input.outlet_id) {
        throw new Error("Visit tidak sesuai dengan Salesman dan Outlet transaksi.");
      }
    }

    let subtotal = 0;
    let discountTotal = 0;
    const normalized: any[] = [];

    for (const item of cleanItems) {
      const sku = await tx.select().from(skus).where(eq(skus.id, item.sku_id)).limit(1);
      if (!sku[0]) throw new Error(`SKU ${item.sku_id} tidak ditemukan.`);
      if (sku[0].status !== "ACTIVE") throw new Error(`SKU ${item.sku_id} tidak aktif.`);

      const lineGross = item.quantity * item.unitPrice;
      const lineSubtotal = Math.max(0, lineGross - item.discount);
      subtotal += lineSubtotal;
      discountTotal += item.discount;
      normalized.push({
        id: id("txi"),
        transactionId: "",
        skuId: item.sku_id,
        productId: sku[0].productId || null,
        quantity: item.quantity,
        volume: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discount,
        subtotal: lineSubtotal,
        metadata: { source: "ATOMIC_SALE_POST" },
      });
    }

    const transactionId = id("txn");
    const now = new Date();
    const taxAmount = 0;
    const totalAmount = subtotal + taxAmount;

    for (const item of cleanItems) {
      await InventoryRepository.createOrUpdateInventory("SALES", input.salesman_id, item.sku_id, -item.quantity, tx);
      await InventoryRepository.insertMovement({
        id: id("mvt"),
        movementType: "SALES_OUT",
        sourceLocationType: "SALES",
        sourceLocationId: input.salesman_id,
        destLocationType: "OUTLET",
        destLocationId: input.outlet_id,
        skuId: item.sku_id,
        quantity: item.quantity,
        referenceId: transactionId,
        performedBy: input.salesman_id,
        notes: input.notes || "Penjualan",
      }, tx);
      await InventoryRepository.upsertSalesStockLedger(
        input.salesman_id,
        now.toISOString().slice(0, 10),
        item.sku_id,
        { soldStock: item.quantity, finalStock: -item.quantity },
        tx
      );
    }

    const legacyItems = normalized.map((x) => ({
      sku_id: x.skuId,
      product_id: x.productId,
      quantity: x.quantity,
      volume: x.volume,
      unit_price: x.unitPrice,
      discount: x.discountAmount,
      subtotal: x.subtotal,
    }));

    const inserted = await tx.insert(transactions).values({
      id: transactionId,
      invoiceNumber: input.invoice_number,
      salesmanId: input.salesman_id,
      outletId: input.outlet_id,
      visitId: input.visit_id || null,
      officeId: input.office_id || null,
      transactionType: input.transaction_type || "CASH",
      subtotal,
      discountAmount: discountTotal,
      taxAmount,
      totalAmount,
      paidAmount: totalAmount,
      paymentStatus: "PAID",
      deliveryStatus: "DELIVERED",
      items: legacyItems,
      notes: input.notes || null,
      createdAt: now,
      metadata: { idempotency_key: input.idempotency_key || null, posted_atomically: true },
    }).returning();

    for (const item of normalized) {
      item.transactionId = transactionId;
      await tx.insert(transactionItems).values(item);
    }

    // Effective Call is derived from the existence of a successful purchase
    // for the same visit. It is never accepted as a client-supplied boolean.
    if (input.visit_id) {
      await tx.update(visits).set({ isEffectiveCall: true }).where(eq(visits.id, input.visit_id));
    }

    return { transaction: inserted[0], replayed: false };
  });
}
