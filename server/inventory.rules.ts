export const InventoryRules = {
  validateQuantity: (qty: number) => {
    if (qty <= 0) throw new Error("Kuantitas harus lebih dari 0.");
  },
  validateStockAvailability: (availableStock: number, requestedQty: number, itemName: string) => {
    if (availableStock < requestedQty) {
      throw new Error(`Stok produk "${itemName}" tidak mencukupi. Sisa: ${availableStock}, Diminta: ${requestedQty}`);
    }
  },
  validateNoNegativeStock: (stockOnHand: number) => {
    if (stockOnHand < 0) {
      throw new Error("Stok tidak boleh bernilai negatif.");
    }
  },
};
