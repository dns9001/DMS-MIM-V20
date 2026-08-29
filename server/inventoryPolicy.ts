export type StockRole = "OWNER" | "ADMIN" | "SUPERVISOR" | "SALES" | "WAREHOUSE";

export const STOCK_LOCATION = {
  WAREHOUSE: "WAREHOUSE",
  SALESMAN: "SALESMAN",
} as const;

export function assertAdjustmentRole(role: string): void {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new Error("STOCK_ADJUSTMENT_FORBIDDEN");
  }
}

export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("INVALID_STOCK_QUANTITY");
  }
}

export function assertSufficientStock(availableStock: number, quantity: number): void {
  assertPositiveQuantity(quantity);
  if (availableStock < quantity) {
    throw new Error("INSUFFICIENT_STOCK");
  }
}

/**
 * Canonical movement intent. Persistence must execute the source decrement,
 * destination increment, and movement insert in one database transaction.
 */
export function createTransferIntent(args: {
  skuId: string;
  quantity: number;
  sourceLocationType: string;
  sourceLocationId: string;
  destLocationType: string;
  destLocationId: string;
  performedBy: string;
}) {
  assertPositiveQuantity(args.quantity);
  return {
    movementType: "TRANSFER",
    skuId: args.skuId,
    quantity: args.quantity,
    sourceLocationType: args.sourceLocationType,
    sourceLocationId: args.sourceLocationId,
    destLocationType: args.destLocationType,
    destLocationId: args.destLocationId,
    performedBy: args.performedBy,
  };
}

export function createSaleDeductionIntent(args: {
  skuId: string;
  quantity: number;
  salesmanId: string;
  transactionId: string;
  performedBy: string;
}) {
  assertPositiveQuantity(args.quantity);
  return {
    movementType: "SALE",
    skuId: args.skuId,
    quantity: args.quantity,
    sourceLocationType: STOCK_LOCATION.SALESMAN,
    sourceLocationId: args.salesmanId,
    destLocationType: "OUTLET",
    destLocationId: "",
    referenceId: args.transactionId,
    performedBy: args.performedBy,
  };
}
