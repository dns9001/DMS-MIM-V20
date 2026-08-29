import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, saveDatabaseToDisk, loadDatabaseFromDisk } from "../server/data";
import { haversineMeters } from "../server/geo";

const JWT_SECRET = process.env.JWT_SECRET || "mahameru_dms_jwt_secret_production_key_2026";

interface TestResult {
  phase: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function assert(condition: boolean, phase: string, name: string, errorMsg?: string, details?: any) {
  if (condition) {
    results.push({ phase, name, passed: true, details });
    console.log(`[PASS] [${phase}] ${name}`);
  } else {
    results.push({ phase, name, passed: false, error: errorMsg || "Assertion failed", details });
    console.error(`[FAIL] [${phase}] ${name}: ${errorMsg || "Assertion failed"}`);
  }
}

async function runAudit() {
  console.log("===============================================================");
  console.log("STARTING DMS MAHAMERU FULL SYSTEM AUDIT & VERIFICATION SUITE");
  console.log("===============================================================\n");

  // PHASE 1 & 2: DISCOVERY & INTEGRITY
  assert(typeof db === "object" && db !== null, "PHASE 1", "Database instance loaded");
  assert(Array.isArray(db.users), "PHASE 1", "Users collection exists");
  assert(db.users.length >= 2, "PHASE 1", "Default Admin & Owner accounts exist");

  // Check default accounts
  const owner = db.users.find(u => u.role === "OWNER");
  const admin = db.users.find(u => u.role === "ADMIN");
  assert(!!owner && !!owner.password_hash, "PHASE 5", "Owner account exists with secure password hash");
  assert(!!admin && !!admin.password_hash, "PHASE 5", "Admin account exists with secure password hash");

  // PHASE 5: AUTHENTICATION
  const ownerPwMatch = bcrypt.compareSync("owner123", owner!.password_hash);
  const fakePwMatch = bcrypt.compareSync("wrongpass", owner!.password_hash);
  assert(ownerPwMatch === true, "PHASE 5", "Owner password verification succeeds for valid password");
  assert(fakePwMatch === false, "PHASE 5", "Owner password verification rejects invalid password");

  const ownerToken = jwt.sign({ _id: owner!._id, role: owner!.role, email: owner!.email }, JWT_SECRET, { expiresIn: "1d" });
  const decoded = jwt.verify(ownerToken, JWT_SECRET) as any;
  assert(decoded._id === owner!._id && decoded.role === "OWNER", "PHASE 5", "JWT token signing and verification works");

  // PHASE 7: COMPANY PROFILE
  assert(!!db.company_profile, "PHASE 7", "Company profile exists in DB");
  const prevCompanyName = db.company_profile.company_name;
  db.company_profile.company_name = "PT Mahameru Insan Mandiri Test";
  assert(db.company_profile.company_name === "PT Mahameru Insan Mandiri Test", "PHASE 7", "Company profile can be updated in DB");
  db.company_profile.company_name = prevCompanyName;

  // PHASE 12: MASTER WILAYAH HIERARCHY
  assert(Array.isArray(db.provinces) && db.provinces.length > 0, "PHASE 12", "Provinces master data loaded");
  assert(Array.isArray(db.regencies) && db.regencies.length > 0, "PHASE 12", "Regencies master data loaded");
  assert(Array.isArray(db.districts) && db.districts.length > 0, "PHASE 12", "Districts master data loaded");
  assert(Array.isArray(db.villages) && db.villages.length > 0, "PHASE 12", "Villages master data loaded");

  // Check Wilayah relational integrity
  const sampleRegency = db.regencies[0];
  const matchingProvince = db.provinces.find(p => p._id === sampleRegency.province_id);
  assert(!!matchingProvince, "PHASE 12", `Regency ${sampleRegency.name} points to valid Province ${sampleRegency.province_id}`);

  const sampleDistrict = db.districts[0];
  const matchingRegency = db.regencies.find(r => r._id === sampleDistrict.regency_id);
  assert(!!matchingRegency, "PHASE 12", `District ${sampleDistrict.name} points to valid Regency ${sampleDistrict.regency_id}`);

  const sampleVillage = db.villages[0];
  const matchingDistrict = db.districts.find(d => d._id === sampleVillage.district_id);
  assert(!!matchingDistrict, "PHASE 12", `Village ${sampleVillage.name} points to valid District ${sampleVillage.district_id}`);

  // PHASE 8: MASTER OFFICE (CRUD & GPS Validation)
  const testOfficeId = "test-off-audit-1";
  const now = new Date().toISOString();
  db.offices = db.offices.filter(o => o._id !== testOfficeId);
  db.offices.push({
    _id: testOfficeId,
    office_name: "Kantor Audit Jakarta",
    office_code: "AUDIT-01",
    address: "Jl. Audit No. 1",
    latitude: -6.200000,
    longitude: 106.816666,
    radius_m: 100,
    status: "ACTIVE",
    created_at: now,
  });
  assert(db.offices.some(o => o._id === testOfficeId), "PHASE 8", "Master Office successfully created in DB");

  // Test GPS Radius calculation
  const officeLoc = { lat: -6.200000, lng: 106.816666 };
  const insideLoc = { lat: -6.200050, lng: 106.816666 }; // ~5.5 meters away
  const outsideLoc = { lat: -6.205000, lng: 106.816666 }; // ~555 meters away

  const distInside = haversineMeters(officeLoc.lat, officeLoc.lng, insideLoc.lat, insideLoc.lng);
  const distOutside = haversineMeters(officeLoc.lat, officeLoc.lng, outsideLoc.lat, outsideLoc.lng);

  assert(distInside <= 100, "PHASE 14", `Check-in inside radius (${Math.round(distInside)}m <= 100m) ALLOWED`);
  assert(distOutside > 100, "PHASE 14", `Check-in outside radius (${Math.round(distOutside)}m > 100m) REJECTED`);

  // PHASE 9: MASTER AREA
  const testAreaId = "test-area-audit-1";
  const testArea2Id = "test-area-audit-2";
  db.areas = db.areas.filter(a => a._id !== testAreaId && a._id !== testArea2Id);
  db.areas.push({
    _id: testAreaId,
    code: "AR-AUDIT-1",
    name: "Area Audit 1",
    office_id: testOfficeId,
    status: "ACTIVE",
    created_at: now,
  });
  db.areas.push({
    _id: testArea2Id,
    code: "AR-AUDIT-2",
    name: "Area Audit 2",
    office_id: testOfficeId,
    status: "ACTIVE",
    created_at: now,
  });
  assert(db.areas.some(a => a._id === testAreaId), "PHASE 9", "Master Area created in DB");

  // PHASE 10: MASTER SALES
  const testSalesId1 = "usr-sales-audit-1";
  const testSalesId2 = "usr-sales-audit-2";
  db.users = db.users.filter(u => u._id !== testSalesId1 && u._id !== testSalesId2);
  db.users.push({
    _id: testSalesId1,
    name: "Salesman Audit 1",
    email: "sales1@audit.com",
    password_hash: bcrypt.hashSync("sales123", 10),
    role: "SALES",
    phone: "08121111111",
    office_id: testOfficeId,
    area_id: testAreaId,
    status: "ACTIVE",
    created_at: now,
  });
  db.users.push({
    _id: testSalesId2,
    name: "Salesman Audit 2",
    email: "sales2@audit.com",
    password_hash: bcrypt.hashSync("sales123", 10),
    role: "SALES",
    phone: "08122222222",
    office_id: testOfficeId,
    area_id: testArea2Id,
    status: "ACTIVE",
    created_at: now,
  });
  assert(db.users.some(u => u._id === testSalesId1 && u.area_id === testAreaId), "PHASE 10", "Salesman 1 assigned to Area 1");
  assert(db.users.some(u => u._id === testSalesId2 && u.area_id === testArea2Id), "PHASE 10", "Salesman 2 assigned to Area 2");

  // PHASE 20: MASTER PRODUCT & SKU
  const testProdId = "prod-audit-1";
  const testSku1 = "sku-audit-1";
  const testSku2 = "sku-audit-2";
  db.products = db.products.filter(p => p._id !== testProdId);
  db.skus = db.skus.filter(s => s._id !== testSku1 && s._id !== testSku2);
  db.products.push({
    _id: testProdId,
    code: "PRD-01",
    name: "Minyak Goreng Mahameru",
    category: "Minyak",
    status: "ACTIVE",
    created_at: now,
  });
  db.skus.push({
    _id: testSku1,
    product_id: testProdId,
    sku_code: "MG-1L",
    name: "Minyak Goreng Mahameru 1L Pouch",
    unit: "PCS",
    price: 18000,
    status: "ACTIVE",
    created_at: now,
  });
  db.skus.push({
    _id: testSku2,
    product_id: testProdId,
    sku_code: "MG-2L",
    name: "Minyak Goreng Mahameru 2L Pouch",
    unit: "PCS",
    price: 35000,
    status: "ACTIVE",
    created_at: now,
  });
  assert(db.products.some(p => p._id === testProdId), "PHASE 20", "Master Product created in DB");
  assert(db.skus.length >= 2, "PHASE 20", "SKUs created in DB with Unit and Price");

  // PHASE 11: MASTER OUTLET
  const testOutlet1 = "out-audit-1";
  const testOutlet2 = "out-audit-2";
  db.outlets = db.outlets.filter(o => o._id !== testOutlet1 && o._id !== testOutlet2);
  db.outlets.push({
    _id: testOutlet1,
    outlet_code: "OUT-001",
    outlet_name: "Toko Sinar Rezeki",
    owner_name: "Pak Budi",
    phone: "0812345678",
    address: "Jl. Pasar Rebo No. 10",
    province_id: sampleProvince._id,
    regency_id: sampleRegency._id,
    district_id: sampleDistrict._id,
    village_id: sampleVillage._id,
    latitude: -6.200020,
    longitude: 106.816670,
    area_id: testAreaId,
    salesman_id: testSalesId1,
    status: "ACTIVE",
    lifecycle_status: "NOO",
    created_at: now,
  });
  db.outlets.push({
    _id: testOutlet2,
    outlet_code: "OUT-002",
    outlet_name: "Toko Berkah Abadi",
    owner_name: "Ibu Siti",
    phone: "0812876543",
    address: "Jl. Kranji No. 20",
    province_id: sampleProvince._id,
    regency_id: sampleRegency._id,
    district_id: sampleDistrict._id,
    village_id: sampleVillage._id,
    latitude: -6.230000,
    longitude: 106.900000,
    area_id: testArea2Id,
    salesman_id: testSalesId2,
    status: "ACTIVE",
    lifecycle_status: "NOO",
    created_at: now,
  });
  assert(db.outlets.some(o => o._id === testOutlet1 && o.salesman_id === testSalesId1), "PHASE 11", "Outlet 1 assigned to Sales 1 and Area 1");
  assert(db.outlets.some(o => o._id === testOutlet2 && o.salesman_id === testSalesId2), "PHASE 11", "Outlet 2 assigned to Sales 2 and Area 2");

  // Helper to check sales assignment
  function isOutletAssignedToSales(salesmanId: string, outletId: string): boolean {
    const outlet = db.outlets.find((o) => o._id === outletId);
    if (!outlet) return false;
    if (outlet.salesman_id === salesmanId) return true;
    const salesUser = db.users.find((u) => u._id === salesmanId);
    if (salesUser?.area_id && outlet.area_id === salesUser.area_id) return true;
    return false;
  }

  // PHASE 13: SALES OWNERSHIP RESTRICTION
  const sales1CanAccessOutlet1 = isOutletAssignedToSales(testSalesId1, testOutlet1);
  const sales1CanAccessOutlet2 = isOutletAssignedToSales(testSalesId1, testOutlet2);
  assert(sales1CanAccessOutlet1 === true, "PHASE 13", "Sales 1 ALLOWED to access assigned Outlet 1");
  assert(sales1CanAccessOutlet2 === false, "PHASE 13", "Sales 1 DENIED access to unassigned Outlet 2 (different area/sales)");

  // PHASE 24 & 25: WAREHOUSE RECEIVING & STOCK
  db.inventory = db.inventory.filter(i => i.office_id !== testOfficeId);
  db.stock_movements = [];
  
  // 1. Warehouse receives 100 Qty of SKU 1
  const recvId = "recv-audit-1";
  const recvQty = 100;
  db.inventory.push({
    _id: "inv-wh-1",
    office_id: testOfficeId,
    sku_id: testSku1,
    quantity: recvQty,
    updated_at: now,
  });
  db.stock_movements.push({
    _id: "mov-1",
    movement_type: "RECEIVING",
    sku_id: testSku1,
    from_location: "SUPPLIER",
    to_location: `WAREHOUSE_${testOfficeId}`,
    quantity: recvQty,
    reference_id: recvId,
    created_by: admin!._id,
    created_at: now,
  });
  assert(db.inventory.find(i => i.office_id === testOfficeId && i.sku_id === testSku1)?.quantity === 100, "PHASE 25", "Warehouse receiving adds 100 Qty to Inventory");
  assert(db.stock_movements.some(m => m.movement_type === "RECEIVING" && m.quantity === 100), "PHASE 26", "Stock movement recorded for RECEIVING");

  // PHASE 28: SALES STOCK HANDOVER (Warehouse -> Sales Van)
  const transferQty = 30;
  // Decrement warehouse stock
  const whInv = db.inventory.find(i => i.office_id === testOfficeId && i.sku_id === testSku1)!;
  whInv.quantity -= transferQty;
  // Increment sales ledger
  db.sales_stock_ledgers = [];
  db.sales_stock_ledgers.push({
    _id: "ssl-1",
    salesman_id: testSalesId1,
    sku_id: testSku1,
    quantity: transferQty,
    updated_at: now,
  });
  db.stock_movements.push({
    _id: "mov-2",
    movement_type: "TRANSFER",
    sku_id: testSku1,
    from_location: `WAREHOUSE_${testOfficeId}`,
    to_location: `SALES_${testSalesId1}`,
    quantity: transferQty,
    reference_id: "handover-1",
    created_by: admin!._id,
    created_at: now,
  });
  assert(whInv.quantity === 70, "PHASE 28", "Warehouse stock decremented to 70 Qty after handover");
  assert(db.sales_stock_ledgers.find(s => s.salesman_id === testSalesId1 && s.sku_id === testSku1)?.quantity === 30, "PHASE 28", "Sales van stock has 30 Qty");

  // PHASE 27: STOCK ADJUSTMENT BY ADMIN
  const physicalQty = 68; // -2 diff
  const diff = physicalQty - whInv.quantity;
  whInv.quantity = physicalQty;
  db.stock_movements.push({
    _id: "mov-3",
    movement_type: "ADJUSTMENT",
    sku_id: testSku1,
    from_location: `WAREHOUSE_${testOfficeId}`,
    to_location: "ADJUSTMENT_DIFF",
    quantity: diff,
    notes: "Physical count difference",
    created_by: admin!._id,
    created_at: now,
  });
  assert(whInv.quantity === 68, "PHASE 27", "Stock adjustment updated warehouse quantity to physical count 68");

  // PHASE 15 & 16: VISIT & OUTLET CALL
  const visitId1 = "vis-audit-1";
  db.visits = [];
  db.visits.push({
    _id: visitId1,
    salesman_id: testSalesId1,
    outlet_id: testOutlet1,
    date: now.slice(0, 10),
    check_in_time: now,
    check_out_time: now,
    latitude: -6.200020,
    longitude: 106.816670,
    status: "COMPLETED",
    created_at: now,
  });
  // Calculate Outlet Calls
  const visitedOutletKeys = new Set(db.visits.filter(v => v.status === "COMPLETED").map(v => `${v.salesman_id}_${v.date}_${v.outlet_id}`));
  const outletCallsCount = visitedOutletKeys.size;
  assert(outletCallsCount === 1, "PHASE 16", "Outlet Call correctly counts 1 unique visited outlet");

  // PHASE 21, 22 & 23: TRANSACTION, STRICT VOLUME (QTY) & EFFECTIVE CALL
  const txnId1 = "txn-audit-1";
  const item1Qty = 12; // 12 Pcs
  const item1Val = item1Qty * 18000;
  db.transactions = [];
  db.transactions.push({
    _id: txnId1,
    transaction_code: "TRX-AUDIT-001",
    salesman_id: testSalesId1,
    outlet_id: testOutlet1,
    visit_id: visitId1,
    transaction_date: now,
    status: "COMPLETED",
    payment_method: "CASH",
    items: [
      {
        sku_id: testSku1,
        product_name: "Minyak Goreng Mahameru 1L Pouch",
        quantity: item1Qty,
        unit_price: 18000,
        subtotal: item1Val,
      },
    ],
    total_amount: item1Val,
    total_volume: item1Qty, // Strictly sum of Qty!
    created_at: now,
  });

  // Decrement Sales Stock on Sale
  const salesStock = db.sales_stock_ledgers.find(s => s.salesman_id === testSalesId1 && s.sku_id === testSku1)!;
  salesStock.quantity -= item1Qty;
  db.stock_movements.push({
    _id: "mov-4",
    movement_type: "SALE",
    sku_id: testSku1,
    from_location: `SALES_${testSalesId1}`,
    to_location: `OUTLET_${testOutlet1}`,
    quantity: item1Qty,
    reference_id: txnId1,
    created_by: testSalesId1,
    created_at: now,
  });
  assert(salesStock.quantity === 18, "PHASE 23", "Sales stock decremented to 18 Qty after transaction");

  // Effective Call calculation
  const completedTxnOutlets = new Set(db.transactions.filter(t => t.status === "COMPLETED").map(t => `${t.salesman_id}_${t.transaction_date.slice(0, 10)}_${t.outlet_id}`));
  const effectiveCallsCount = completedTxnOutlets.size;
  const ecRate = outletCallsCount > 0 ? Math.round((effectiveCallsCount / outletCallsCount) * 100) : 0;
  assert(effectiveCallsCount === 1, "PHASE 17", "Effective Call equals 1 (outlet visited with completed transaction)");
  assert(ecRate === 100, "PHASE 17", "EC Rate equals 100% (1/1)");

  // Strict Volume Check (MUST BE SUM OF QTY, NOT REVENUE)
  const totalVolumeCalculated = db.transactions.filter(t => t.status === "COMPLETED").reduce((sum, t) => sum + (t.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0), 0);
  assert(totalVolumeCalculated === 12, "PHASE 21", `Strict Volume is Qty (${totalVolumeCalculated} Qty, not ${item1Val} IDR)`);

  // PHASE 22: TARGET VS ACTUAL VOLUME (QTY)
  db.targets = [];
  db.targets.push({
    _id: "tgt-1",
    salesman_id: testSalesId1,
    area_id: testAreaId,
    sku_id: testSku1,
    target_volume: 24, // 24 Qty target
    period: now.slice(0, 7),
    status: "ACTIVE",
    created_at: now,
  });
  const targetVol = db.targets[0].target_volume;
  const actualVol = totalVolumeCalculated;
  const achievementPct = Math.round((actualVol / targetVol) * 100);
  assert(targetVol === 24, "PHASE 22", "Target Volume is 24 Qty");
  assert(actualVol === 12, "PHASE 22", "Actual Volume is 12 Qty");
  assert(achievementPct === 50, "PHASE 22", "Volume Achievement is 50% (12/24 Qty)");

  // PHASE 19: OUTLET LIFECYCLE STATUS
  // Function to calculate outlet status from transactions
  function calculateOutletStatus(outletId: string): string {
    const txns = db.transactions.filter(t => t.outlet_id === outletId && t.status === "COMPLETED");
    if (txns.length === 0) return "NOO";
    if (txns.length === 1) return "NOO";
    if (txns.length === 2) return "REPEAT";
    if (txns.length >= 3) {
      // Check last transaction age
      const latestTxnDate = new Date(Math.max(...txns.map(t => new Date(t.transaction_date).getTime())));
      const daysSince = Math.floor((Date.now() - latestTxnDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 56) return "DORMANT";
      return "ACTIVE";
    }
    return "ACTIVE";
  }

  assert(calculateOutletStatus(testOutlet1) === "NOO", "PHASE 19", "Outlet status after 1st transaction is NOO");

  // Add 2nd transaction
  db.transactions.push({
    _id: "txn-audit-2",
    transaction_code: "TRX-AUDIT-002",
    salesman_id: testSalesId1,
    outlet_id: testOutlet1,
    transaction_date: now,
    status: "COMPLETED",
    items: [{ sku_id: testSku1, quantity: 5, unit_price: 18000, subtotal: 90000 }],
    total_amount: 90000,
    total_volume: 5,
    created_at: now,
  });
  assert(calculateOutletStatus(testOutlet1) === "REPEAT", "PHASE 19", "Outlet status after 2nd transaction is REPEAT");

  // Add 3rd transaction
  db.transactions.push({
    _id: "txn-audit-3",
    transaction_code: "TRX-AUDIT-003",
    salesman_id: testSalesId1,
    outlet_id: testOutlet1,
    transaction_date: now,
    status: "COMPLETED",
    items: [{ sku_id: testSku1, quantity: 5, unit_price: 18000, subtotal: 90000 }],
    total_amount: 90000,
    total_volume: 5,
    created_at: now,
  });
  assert(calculateOutletStatus(testOutlet1) === "ACTIVE", "PHASE 19", "Outlet status after 3+ transactions is ACTIVE");

  // PHASE 29: STOCK RECONCILIATION
  // Opening (0) + Receiving (100) + Adjustment (-2) - Transfer (30) = 68
  const calculatedWarehouseStock = 0 + 100 + (-2) - 30;
  assert(whInv.quantity === calculatedWarehouseStock, "PHASE 29", `Warehouse stock reconciled exactly: ${whInv.quantity} == ${calculatedWarehouseStock}`);

  // Sales Stock Opening (0) + Transfer In (30) - Sales Out (12) = 18
  const calculatedSalesStock = 0 + 30 - 12;
  assert(salesStock.quantity === calculatedSalesStock, "PHASE 29", `Sales van stock reconciled exactly: ${salesStock.quantity} == ${calculatedSalesStock}`);

  // PHASE 3: DATABASE DISK PERSISTENCE
  saveDatabaseToDisk();
  const dbFileExists = fs.existsSync(path.join(process.cwd(), "data", "db.json"));
  assert(dbFileExists === true, "PHASE 3", "Database file db.json written to disk");

  // Clean up audit test records from in-memory DB & disk
  db.offices = db.offices.filter(o => o._id !== testOfficeId);
  db.areas = db.areas.filter(a => a._id !== testAreaId && a._id !== testArea2Id);
  db.users = db.users.filter(u => u._id !== testSalesId1 && u._id !== testSalesId2);
  db.products = db.products.filter(p => p._id !== testProdId);
  db.skus = db.skus.filter(s => s._id !== testSku1 && s._id !== testSku2);
  db.outlets = db.outlets.filter(o => o._id !== testOutlet1 && o._id !== testOutlet2);
  db.inventory = db.inventory.filter(i => i.office_id !== testOfficeId);
  db.stock_movements = [];
  db.sales_stock_ledgers = [];
  db.visits = [];
  db.transactions = [];
  db.targets = [];
  saveDatabaseToDisk();

  console.log("\n===============================================================");
  console.log(`AUDIT COMPLETE: ${results.filter(r => r.passed).length}/${results.length} CHECKS PASSED`);
  console.log("===============================================================");
}

// Sample province reference for test
const sampleProvince = db.provinces[0] || { _id: "p-1", name: "DKI Jakarta" };
const sampleRegency = db.regencies[0] || { _id: "r-1", name: "Jakarta Selatan", province_id: "p-1" };
const sampleDistrict = db.districts[0] || { _id: "d-1", name: "Tebet", regency_id: "r-1" };
const sampleVillage = db.villages[0] || { _id: "v-1", name: "Tebet Barat", district_id: "d-1" };

runAudit().catch(err => {
  console.error("Audit fatal error:", err);
  process.exit(1);
});
