import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

export interface User {
  _id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "OWNER" | "ADMIN" | "SUPERVISOR" | "SALES" | "WAREHOUSE";
  phone: string;
  status: "ACTIVE" | "INACTIVE";
  office_id?: string;
  area_id?: string;
  created_at: string;
  last_location?: {
    latitude: number;
    longitude: number;
    lat?: number;
    lng?: number;
    timestamp: string;
    battery?: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    source?: string;
  };
}

export interface Office {
  _id: string;
  office_name: string;
  office_code?: string;
  code?: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  work_start_time?: string;
  work_end_time?: string;
  check_in_start?: string;
  late_tolerance_min?: number;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
}

export interface Province {
  _id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
}

export interface Regency {
  _id: string;
  province_id: string;
  code: string;
  name: string;
  type: "KOTA" | "KABUPATEN";
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
}

export interface District {
  _id: string;
  regency_id: string;
  province_id?: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
}

export interface Village {
  _id: string;
  district_id: string;
  regency_id?: string;
  province_id?: string;
  code: string;
  name: string;
  postal_code: string;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
}

export interface MasterEntity {
  _id: string;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
  [key: string]: any;
}

export type OutletLifecycleStatus = "PROSPECT" | "NOO" | "REPEAT" | "ACTIVE" | "DORMANT";

export interface Outlet {
  notes?: string;
  _id: string;
  outlet_code: string;
  outlet_name: string;
  owner_name: string;
  phone: string;
  address: string;
  address_line?: string;
  address_detail?: string;
  province_id?: string;
  province_name?: string;
  regency_id?: string;
  regency_name?: string;
  district_id?: string;
  district_name?: string;
  village_id?: string;
  village_name?: string;
  postal_code?: string;
  latitude: number;
  longitude: number;
  area_id: string;
  channel_id: string;
  route_id?: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "PENDING";
  lifecycle_status?: OutletLifecycleStatus;
  completed_transaction_count?: number;
  last_completed_transaction_at?: string | null;
  first_completed_transaction_at?: string | null;
  total_volume?: number;
  total_revenue?: number;
  created_by: string;
  created_at: string;
  updated_at?: string;
  photo_url?: string;
  credit_limit?: number;
  term_of_payment?: number;
  payment_term_days?: number;
}

export interface SalesOutlet {
  _id: string;
  sales_id: string;
  outlet_id: string;
  area_id: string;
  status: "ACTIVE" | "INACTIVE";
  assigned_at: string;
  assigned_by: string;
  unassigned_at?: string;
  unassigned_by?: string;
  notes?: string;
}

export interface CallPlan {
  _id: string;
  plan_code: string;
  salesman_id: string;
  date: string;
  route_id?: string;
  status: "DRAFT" | "PUBLISHED" | "COMPLETED";
  total_outlets: number;
  notes?: string;
  created_at: string;
  created_by: string;
}

export interface CallPlanItem {
  _id: string;
  call_plan_id: string;
  outlet_id: string;
  sequence: number;
  status: "PENDING" | "VISITED" | "MISSED";
  created_at: string;
}

export interface Attendance {
  notes?: string;
  _id: string;
  salesman_id: string;
  date: string;
  check_in_time: string;
  check_out_time?: string;
  check_in_lat: number;
  check_in_lng: number;
  check_out_lat?: number;
  check_out_lng?: number;
  office_id: string;
  distance_in_m: number;
  distance_out_m?: number;
  status: "PRESENT" | "LATE" | "ABSENT";
  scheduled_in?: string;
  scheduled_out?: string;
  late_minutes?: number;
  early_leave_minutes?: number;
  overtime_minutes?: number;
  work_duration_seconds?: number;
  work_duration_formatted?: string;
  photo_in?: string;
  photo_out?: string;
  mock_location?: boolean;
}

export interface Visit {
  _id: string;
  salesman_id: string;
  outlet_id: string;
  date: string;
  check_in_time: string;
  check_out_time?: string;
  check_in_lat: number;
  check_in_lng: number;
  check_out_lat?: number;
  check_out_lng?: number;
  distance_m: number;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  call_result?: "EFFECTIVE" | "OPEN";
  open_reason_id?: string;
  notes?: string;
  photo_url?: string;
  duration_seconds?: number;
  total_sales?: number;
  created_at: string;
}

export interface TransactionItem {
  transaction_id?: string;
  transactionId?: string;
  product_id: string;
  productId?: string;
  sku_id: string;
  skuId?: string;
  product_name: string;
  productName?: string;
  sku_name: string;
  skuName?: string;
  quantity: number;
  qty?: number;
  volume: number; // Volume is strictly Qty of this SKU
  unit_price: number;
  unitPrice?: number;
  discount: number;
  subtotal: number;
}

export interface Transaction {
  notes?: string;
  _id: string;
  invoice_number: string;
  transaction_code?: string;
  salesman_id: string;
  outlet_id: string;
  visit_id: string;
  transaction_date: string;
  items: TransactionItem[];
  total_volume: number; // SUM(transactionItems.qty)
  subtotal: number;
  discount_total: number;
  tax: number;
  total: number;
  total_amount?: number;
  payment_method: "CASH" | "CREDIT" | "TRANSFER";
  status: "PENDING" | "PAID" | "DELIVERED" | "COMPLETED" | "CANCELLED";
  created_at: string;
}

export interface InventoryItem {
  _id: string;
  location_type: "WAREHOUSE" | "SALES";
  location_id: string; // office_id if WAREHOUSE, salesman user_id if SALES
  office_id?: string; // backward compat alias
  warehouse_id?: string;
  sku_id: string;
  stock_on_hand: number;
  allocated_stock: number;
  available_stock: number;
  quantity?: number;
  reorder_level?: number;
  updated_at?: string;
  last_updated?: string;
  status?: string;
  [key: string]: any;
}

export type StockMovementType =
  | "PURCHASE_IN"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "SALES_OUT"
  | "RETURN_IN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "REVERSAL";

export interface StockMovement {
  _id: string;
  movement_code: string;
  movement_type: StockMovementType;
  source_location_type: "WAREHOUSE" | "SALES" | "SUPPLIER" | "OUTLET" | "NONE";
  source_location_id: string;
  destination_location_type: "WAREHOUSE" | "SALES" | "OUTLET" | "NONE";
  destination_location_id: string;
  sku_id: string;
  quantity: number;
  salesman_id?: string;
  warehouse_id?: string;
  outlet_id?: string;
  reference_id?: string;
  business_date: string;
  status: "COMPLETED" | "CANCELLED";
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface DailyStockHandoverItem {
  sku_id: string;
  quantity: number;
  notes?: string;
}

export interface DailyStockHandover {
  _id: string;
  handover_code: string;
  business_date: string;
  warehouse_id: string; // office_id
  salesman_id: string; // user_id
  status: "DRAFT" | "PREPARED" | "CONFIRMED" | "CANCELLED";
  is_additional?: boolean;
  items: DailyStockHandoverItem[];
  notes?: string;
  prepared_by?: string;
  prepared_at?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DailyStockReturnItem {
  sku_id: string;
  quantity: number;
  notes?: string;
}

export interface DailyStockReturn {
  _id: string;
  return_code: string;
  business_date: string;
  warehouse_id: string;
  salesman_id: string;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  items: DailyStockReturnItem[];
  notes?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SalesStockLedger {
  _id: string; // `${salesman_id}_${business_date}_${sku_id}`
  salesman_id: string;
  business_date: string;
  sku_id: string;
  opening_balance: number;
  transfers_in: number;
  sales_out: number;
  returns_out: number;
  closing_balance: number;
  expected_balance: number;
  discrepancy: number;
  status: "BALANCED" | "SURPLUS" | "DEFICIT";
  last_movement_id?: string;
  notes?: string;
  updated_at: string;
}

export interface StockReceivingItem {
  sku_id: string;
  quantity: number;
  unit_price?: number;
  notes?: string;
  sku_code?: string;
  sku_name?: string;
  unit?: string;
}

export interface StockReceiving {
  _id: string;
  receiving_code: string;
  po_number?: string;
  supplier_name: string;
  warehouse_id: string;
  receiving_date: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  items: StockReceivingItem[];
  total_quantity: number;
  total_value?: number;
  notes?: string;
  received_by?: string;
  posted_by?: string;
  posted_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Target {
  _id: string;
  target_code: string;
  period: string; // e.g. "2026-08" or "2026-08-22"
  from_date?: string;
  to_date?: string;
  salesman_id?: string;
  area_id?: string;
  product_id?: string;
  sku_id?: string;
  target_volume: number; // Volume in Qty (Official Mahameru DMS standard: Volume = Qty)
  unit?: string;
  notes?: string;
  status: "ACTIVE" | "INACTIVE";
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CashDeposit {
  _id: string;
  deposit_code: string;
  salesman_id: string;
  business_date: string;
  expected_cash_amount: number;
  actual_deposit_amount: number;
  variance_amount: number;
  notes?: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  verified_by?: string;
  verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ReceivablePayment {
  _id: string;
  payment_code: string;
  amount: number;
  payment_date: string;
  payment_method: "CASH" | "TRANSFER";
  reference_no?: string;
  received_by: string;
  notes?: string;
  created_at: string;
}

export interface Receivable {
  _id: string;
  invoice_id: string;
  invoice_number: string;
  outlet_id: string;
  salesman_id: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
  payments: ReceivablePayment[];
  created_at: string;
  updated_at: string;
}

export interface DailyReconciliationRecord {
  _id: string;
  reconciliation_code: string;
  salesman_id: string;
  business_date: string;
  stock_status: "BALANCED" | "VARIANCE";
  cash_status: "BALANCED" | "VARIANCE";
  total_stock_variance: number;
  total_cash_variance: number;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  approved_by?: string;
  approved_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  _id: string;
  user_id: string;
  action: string;
  entity: string;
  entity_id: string;
  details: any;
  ip_address?: string;
  created_at: string;
}

export interface CompanyProfile {
  _id: string;
  companyId: string;
  companyName: string;
  companyLegalName: string;
  companyCode: string;
  companyAddress: string;
  address: string;
  city?: string;
  postalCode?: string;
  companyPhone: string;
  phone: string;
  companyEmail: string;
  email: string;
  companyWebsite: string;
  website: string;
  companyDescription: string;
  description: string;
  npwp?: string;
  taxId?: string;
  nib?: string;
  directorName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  bankBranch?: string;
  companyLogo?: string | null;
  logoUrl?: string | null;
  logoStoragePath?: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  [key: string]: any;
}

// In-Memory Database collections with Disk Persistence
export const db = {
  users: [] as User[],
  company_profile: {
    _id: "comp-main",
    companyId: "main",
    companyName: "PT Mahameru Insan Mandiri",
    companyLegalName: "PT Mahameru Insan Mandiri",
    companyCode: "MHM-JKT",
    companyAddress: "Jl. Tebet Barat Dalam Raya No. 12, Tebet, Jakarta Selatan 12810",
    address: "Jl. Tebet Barat Dalam Raya No. 12, Tebet, Jakarta Selatan 12810",
    city: "Jakarta Selatan",
    postalCode: "12810",
    companyPhone: "+62 21 8370 1234",
    phone: "+62 21 8370 1234",
    companyEmail: "info@mahamerudistribusi.co.id",
    email: "info@mahamerudistribusi.co.id",
    companyWebsite: "https://mahamerudistribusi.co.id",
    website: "https://mahamerudistribusi.co.id",
    companyDescription: "Distributor FMCG & Consumer Goods terkemuka di Indonesia dengan jaringan distribusi modern dan terintegrasi.",
    description: "Distributor FMCG & Consumer Goods terkemuka di Indonesia dengan jaringan distribusi modern dan terintegrasi.",
    npwp: "01.234.567.8-012.000",
    taxId: "01.234.567.8-012.000",
    nib: "9120001234567",
    directorName: "Andis Moch Solihin",
    bankName: "Bank Central Asia (BCA)",
    bankAccountNumber: "8830-1234-5678",
    bankAccountHolder: "PT Mahameru Insan Mandiri",
    bankBranch: "KCP Tebet Raya",
    companyLogo: null as string | null,
    logoUrl: null as string | null,
    logoStoragePath: null as string | null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    updatedBy: "usr-owner",
  } as CompanyProfile,
  offices: [] as Office[],
  provinces: [] as Province[],
  regencies: [] as Regency[],
  districts: [] as District[],
  villages: [] as Village[],
  areas: [] as MasterEntity[],
  channels: [] as MasterEntity[],
  routes: [] as MasterEntity[],
  products: [] as MasterEntity[],
  skus: [] as MasterEntity[],
  prices: [] as MasterEntity[],
  promos: [] as MasterEntity[],
  salesmen: [] as MasterEntity[],
  open_call_reasons: [] as MasterEntity[],
  outlets: [] as Outlet[],
  sales_outlets: [] as SalesOutlet[],
  call_plans: [] as CallPlan[],
  call_plan_items: [] as CallPlanItem[],
  attendance: [] as Attendance[],
  visits: [] as Visit[],
  transactions: [] as Transaction[],
  inventory: [] as InventoryItem[],
  stock_movements: [] as StockMovement[],
  stock_handovers: [] as DailyStockHandover[],
  stock_returns: [] as DailyStockReturn[],
  stock_receivings: [] as StockReceiving[],
  sales_stock_ledgers: [] as SalesStockLedger[],
  targets: [] as Target[],
  cash_deposits: [] as CashDeposit[],
  receivables: [] as Receivable[],
  daily_reconciliations: [] as DailyReconciliationRecord[],
  audit_logs: [] as AuditLog[],
  gps_events: [] as any[],
  password_resets: new Map<string, { email: string; expires: number }>(),
  settings: {
    // Global Office & Operational Shift Settings
    office_name: "Kantor Pusat Mahameru Distribusi Indonesia",
    office_address: "Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan, DKI Jakarta 12190",
    office_latitude: -6.2255,
    office_longitude: 106.8085,
    office_radius_m: 100,
    work_start_time: "08:00",
    work_end_time: "17:00",
    check_in_start: "06:00",
    check_in_end: "12:00",
    check_out_start: "16:00",
    late_tolerance_min: 15,
    auto_alpha_time: "13:00",
    working_days_per_month: 26,
    working_days: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
    allow_early_checkout: false,
    require_selfie_attendance: true,

    // Geofencing GPS & Location Integrity
    outlet_radius_m: 200,
    duplicate_radius_m: 50,
    gps_accuracy_max_m: 50,
    fake_gps_policy: "REJECT" as "REJECT" | "FLAG" | "ALLOW",
    allow_fake_gps: false,
    enforce_office_geofence: true,
    enforce_outlet_geofence: true,
    require_gps_on_order: true,
    require_outlet_photo_visit: true,
    gps_tracking_interval_seconds: 60,
    max_geofence_m: 200,

    // Sales & Field Operations
    visit_min_duration_sec: 180, // 3 minutes
    min_visit_minutes: 3,
    min_target_daily_calls: 15,
    enforce_call_plan: false,
    new_outlet_approval: true,
    open_call_reason_required: true,
    offline_sync_enabled: true,
    auto_approve_outlets: false,

    // Finance & Invoicing
    currency_symbol: "Rp",
    company_name: "PT Mahameru Insan Mandiri",
    default_payment_term_days: 14,
    tax_rate_percentage: 11,
    invoice_prefix: "INV",
    invoice_footer_note: "Barang yang sudah dibeli tidak dapat dikembalikan tanpa nota retur resmi.",
    auto_generate_invoice_pdf: true,
    enable_audit_logging: true,
    session_timeout_hours: 24,
  } as Record<string, any>,
};

// Seed initial clean baseline data (System accounts & administrative taxonomy only)

const DB_FILE_PATH = path.join(process.cwd(), "data", "db.json");

let saveDiskTimeout: NodeJS.Timeout | null = null;

export function saveDatabaseToDisk(immediate = false) {
  // Local In-Memory Cache (Disk Persistance) has been removed.
  // PostgreSQL is now the only single source of truth.
  // We still prune memory arrays to prevent memory leaks in the RAM cache.
  if (db.audit_logs && db.audit_logs.length > 2000) {
    db.audit_logs = db.audit_logs.slice(-1500);
  }
  if (db.gps_events && db.gps_events.length > 2000) {
    db.gps_events = db.gps_events.slice(-1500);
  }
}

// Memory Idempotency & Mutex Locks for high-concurrency protection
const processedIdempotencyKeys = new Map<string, { timestamp: number; response: any }>();
const activeLocks = new Set<string>();

export async function executeWithMutex<T>(lockKey: string, fn: () => Promise<T> | T): Promise<T> {
  const startTime = Date.now();
  while (activeLocks.has(lockKey)) {
    if (Date.now() - startTime > 5000) {
      throw new Error("Lock timeout: transaksi sedang diproses oleh antrian lain.");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  activeLocks.add(lockKey);
  try {
    return await fn();
  } finally {
    activeLocks.delete(lockKey);
  }
}

export function checkIdempotency(key: string | undefined): { isDuplicate: boolean; cachedResponse?: any } {
  if (!key) return { isDuplicate: false };
  const existing = processedIdempotencyKeys.get(key);
  if (existing) {
    return { isDuplicate: true, cachedResponse: existing.response };
  }
  return { isDuplicate: false };
}

export function recordIdempotency(key: string | undefined, response: any) {
  if (!key) return;
  processedIdempotencyKeys.set(key, { timestamp: Date.now(), response });
  if (processedIdempotencyKeys.size > 1000) {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, v] of processedIdempotencyKeys.entries()) {
      if (v.timestamp < cutoff) processedIdempotencyKeys.delete(k);
    }
  }
}

export function ensureDefaultUsers() {
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  const now = new Date().toISOString();

  const standardUsers: User[] = [
    {
      _id: "usr-owner",
      name: "Andis Moch Solihin",
      email: "andismochsolihin@gmail.com",
      password_hash: hash("owner123"),
      role: "OWNER",
      phone: "081122334455",
      status: "ACTIVE",
      created_at: now,
    },
    {
      _id: "usr-owner-dina",
      name: "Dina Sapitri",
      email: "dinasapitri9001@gmail.com",
      password_hash: hash("owner123"),
      role: "OWNER",
      phone: "081122334455",
      status: "ACTIVE",
      created_at: now,
    },
    {
      _id: "usr-admin",
      name: "Super Administrator",
      email: "admin@mahameru.id",
      password_hash: hash("admin123"),
      role: "ADMIN",
      phone: "081234567890",
      status: "ACTIVE",
      created_at: now,
    },
    {
      _id: "usr-spv",
      name: "Budi Santoso (Supervisor)",
      email: "spv@mahameru.id",
      password_hash: hash("spv123"),
      role: "SUPERVISOR",
      phone: "081298765432",
      status: "ACTIVE",
      created_at: now,
    },
    {
      _id: "usr-sales1",
      name: "Rian Hidayat (Salesman)",
      email: "sales1@mahameru.id",
      password_hash: hash("sales123"),
      role: "SALES",
      phone: "081311223344",
      status: "ACTIVE",
      created_at: now,
    },
    {
      _id: "usr-warehouse",
      name: "Dedi Supriyadi (Gudang)",
      email: "gudang@mahameru.id",
      password_hash: hash("gudang123"),
      role: "WAREHOUSE",
      phone: "081399887766",
      status: "ACTIVE",
      created_at: now,
    },
  ];

  if (!Array.isArray(db.users)) {
    db.users = [];
  }

  // Deduplicate existing db.users by email and _id
  const seenEmails = new Set<string>();
  const seenIds = new Set<string>();
  const uniqueUsers: User[] = [];

  for (const u of db.users) {
    const emailNorm = (u.email || "").toLowerCase().trim();
    if (!emailNorm || seenEmails.has(emailNorm) || seenIds.has(u._id)) {
      continue;
    }
    seenEmails.add(emailNorm);
    seenIds.add(u._id);
    uniqueUsers.push(u);
  }

  db.users = uniqueUsers;

  // Ensure all standard users exist in db.users
  for (const su of standardUsers) {
    const existing = db.users.find((u) => u.email.toLowerCase() === su.email.toLowerCase());
    if (!existing) {
      db.users.push(su);
    } else if (!existing.password_hash) {
      existing.password_hash = su.password_hash;
    }
  }
}

export function auditAndRepairDatabase(): { fixedIssues: string[]; totalRecords: number; status: string } {
  const fixedIssues: string[] = [];
  const now = new Date().toISOString();

  // 1. Ensure Company Profile & Settings
  if (!db.company_profile) {
    db.company_profile = {
      _id: "cp-1",
      companyId: "cp-1",
      companyName: "PT Mahameru Insan Mandiri",
      companyLegalName: "PT Mahameru Insan Mandiri",
      companyCode: "MHM",
      companyAddress: "Jl. Tebet Barat Dalam Raya No. 12, Jakarta Selatan 12810",
      address: "Jl. Tebet Barat Dalam Raya No. 12, Jakarta Selatan 12810",
      companyPhone: "0812-3456-7890",
      phone: "0812-3456-7890",
      companyEmail: "info@mahameru.id",
      email: "info@mahameru.id",
      companyWebsite: "https://mahameru.id",
      website: "https://mahameru.id",
      companyDescription: "Distributor FMCG & Consumer Goods",
      description: "Distributor FMCG & Consumer Goods",
      createdAt: now,
      updatedAt: now,
      updatedBy: "usr-owner",
    } as CompanyProfile;
    fixedIssues.push("Initialized default company_profile.");
  }

  if (!db.settings) {
    db.settings = {
      company_name: db.company_profile?.companyName || "PT Mahameru Insan Mandiri",
      office_address: db.company_profile?.companyAddress || "Jl. Tebet Barat Dalam Raya No. 12, Jakarta Selatan 12810",
      office_name: "Kantor Pusat Mahameru",
      company_phone: db.company_profile?.companyPhone || "0812-3456-7890",
      company_email: db.company_profile?.companyEmail || "info@mahameru.id",
      currency_symbol: "Rp",
      office_latitude: -6.2383,
      office_longitude: 106.8525,
      office_radius_m: 100,
      max_geofence_m: 150,
      outlet_radius_m: 150,
      enforce_office_geofence: true,
      enforce_outlet_geofence: true,
      allow_fake_gps: false,
      allow_early_checkout: false,
      check_in_start: "07:30",
      check_out_start: "16:30",
      late_tolerance_min: 15,
      visit_min_duration_sec: 60,
      auto_approve_outlets: true,
      default_credit_limit: 10000000,
      default_payment_term_days: 14,
    } as Record<string, any>;
    fixedIssues.push("Initialized global system settings with standard defaults.");
  }

  // 2. Ensure Master Offices
  if (!Array.isArray(db.offices) || db.offices.length === 0) {
    db.offices = [
      {
        _id: "off-1",
        office_code: "JKT-01",
        office_name: "Kantor Pusat & Gudang Jakarta",
        address: "Jl. Tebet Barat Dalam Raya No. 12, Tebet, Jakarta Selatan 12810",
        latitude: -6.2383,
        longitude: 106.8525,
        radius_m: 100,
        status: "ACTIVE",
        created_at: now,
      },
    ];
    fixedIssues.push("Created default headquarters office off-1.");
  }

  const validOfficeIds = new Set(db.offices.map((o) => o._id));

  // 3. Ensure Master Users & Passwords
  ensureDefaultUsers();

  // Repair user references
  for (const user of db.users) {
    if (!user.office_id || !validOfficeIds.has(user.office_id)) {
      user.office_id = "off-1";
      fixedIssues.push(`Assigned user ${user.name} (${user.email}) to default office off-1.`);
    }
  }

  // 4. Ensure Master Area & Channels
  ensureDefaultMasterData();

  // 5. Salesmen profiles
  if (!Array.isArray(db.salesmen)) db.salesmen = [];

  // 6. Repair Outlets (ensure arrays and proper status)
  if (!Array.isArray(db.outlets)) db.outlets = [];

  // 7. Products, SKUs & Prices (ensure arrays, never create dummy SKUs or prices)
  if (!Array.isArray(db.products)) db.products = [];
  if (!Array.isArray(db.skus)) db.skus = [];
  if (!Array.isArray(db.prices)) db.prices = [];
  if (!Array.isArray(db.promos)) db.promos = [];
  if (!Array.isArray(db.routes)) db.routes = [];

  // 8. Inventory Integrity (Warehouse Stock & Non-Negative Balances, never create dummy stock)
  if (!Array.isArray(db.inventory)) db.inventory = [];
  for (const inv of db.inventory) {
    if (typeof inv.stock_on_hand !== "number" || isNaN(inv.stock_on_hand) || inv.stock_on_hand < 0) {
      inv.stock_on_hand = typeof inv.quantity === "number" && inv.quantity >= 0 ? inv.quantity : 0;
      fixedIssues.push(`Corrected invalid negative/NaN inventory stock_on_hand for ${inv._id || inv.sku_id}.`);
    }
    if (typeof inv.allocated_stock !== "number" || isNaN(inv.allocated_stock) || inv.allocated_stock < 0) {
      inv.allocated_stock = 0;
    }
    inv.available_stock = Math.max(0, inv.stock_on_hand - inv.allocated_stock);
    inv.quantity = inv.stock_on_hand;
  }

  // 9. Transactions (Volume, Subtotal, Totals calculation)
  if (!Array.isArray(db.transactions)) db.transactions = [];
  for (const txn of db.transactions) {
    if (Array.isArray(txn.items)) {
      let calculatedVolume = 0;
      let calculatedSubtotal = 0;
      for (const item of txn.items) {
        const q = Number(item.quantity || item.qty || 0);
        const p = Number(item.unit_price || item.unitPrice || 0);
        const d = Number(item.discount || 0);
        item.volume = q;
        item.subtotal = q * p - d;
        calculatedVolume += q;
        calculatedSubtotal += item.subtotal;
      }
      if (txn.total_volume !== calculatedVolume) {
        txn.total_volume = calculatedVolume;
        fixedIssues.push(`Recalculated total volume for transaction ${txn.invoice_number || txn._id}.`);
      }
      if (typeof txn.total !== "number" || isNaN(txn.total)) {
        txn.subtotal = calculatedSubtotal;
        txn.total = calculatedSubtotal + Number(txn.tax || 0) - Number(txn.discount_total || 0);
        fixedIssues.push(`Recalculated total amount for transaction ${txn.invoice_number || txn._id}.`);
      }
    }
  }

  // Save changes to disk
  saveDatabaseToDisk(true);

  // Count total records
  let totalRecords = 0;
  for (const key of Object.keys(db)) {
    const val = (db as any)[key];
    if (Array.isArray(val)) totalRecords += val.length;
    else if (val && typeof val === "object") totalRecords += 1;
  }

  return {
    fixedIssues,
    totalRecords,
    status: fixedIssues.length === 0 ? "DATABASE_HEALTHY" : "DATABASE_REPAIRED",
  };
}

export function ensureDefaultMasterData() {
  const now = new Date().toISOString();

  if (!db.channels || db.channels.length === 0) {
    db.channels = [
      { _id: "ch-1", code: "GT", name: "General Trade (Toko Kelontong/Warung)", status: "ACTIVE", created_at: now },
      { _id: "ch-2", code: "MT", name: "Modern Trade (Minimarket/Supermarket)", status: "ACTIVE", created_at: now },
      { _id: "ch-3", code: "HORECA", name: "Hotel, Resto & Kafe", status: "ACTIVE", created_at: now },
      { _id: "ch-4", code: "WS", name: "Wholesaler (Grosir)", status: "ACTIVE", created_at: now },
    ];
  } else {
    const stdChannels: MasterEntity[] = [
      { _id: "ch-1", code: "GT", name: "General Trade (Toko Kelontong/Warung)", status: "ACTIVE", created_at: now },
      { _id: "ch-2", code: "MT", name: "Modern Trade (Minimarket/Supermarket)", status: "ACTIVE", created_at: now },
      { _id: "ch-3", code: "HORECA", name: "Hotel, Resto & Kafe", status: "ACTIVE", created_at: now },
      { _id: "ch-4", code: "WS", name: "Wholesaler (Grosir)", status: "ACTIVE", created_at: now },
    ];
    for (const sc of stdChannels) {
      if (!db.channels.some((c) => c._id === sc._id || c.code === sc.code)) {
        db.channels.push(sc);
      }
    }
  }

  if (!db.open_call_reasons || db.open_call_reasons.length === 0) {
    db.open_call_reasons = [
      { _id: "ocr-1", code: "CLOSED", name: "Toko Tutup / Libur", description: "Outlet sedang tutup saat dikunjungi", status: "ACTIVE", created_at: now },
      { _id: "ocr-2", code: "OWNER_AWAY", name: "Pemilik / Penanggung Jawab Tidak di Tempat", description: "Tidak bisa mengambil keputusan PO", status: "ACTIVE", created_at: now },
      { _id: "ocr-3", code: "OVERSTOCK", name: "Stok Masih Banyak", description: "Stok produk masih mencukupi hingga kunjungan berikutnya", status: "ACTIVE", created_at: now },
      { _id: "ocr-4", code: "BUDGET", name: "Kendala Keuangan / Budget", description: "Belum ada dana belanja", status: "ACTIVE", created_at: now },
      { _id: "ocr-5", code: "RELOCATED", name: "Toko Sudah Pindah Alamat", description: "Perlu pembaruan master data outlet", status: "ACTIVE", created_at: now },
      { _id: "ocr-6", code: "OTHER", name: "Alasan Lainnya", description: "Alasan spesifik dijelaskan pada catatan", status: "ACTIVE", created_at: now },
    ];
  }

  // Ensure baseline office exists if none
  if (!db.offices || db.offices.length === 0) {
    db.offices = [
      {
        _id: "off-1",
        office_code: "JKT-01",
        office_name: "Kantor Pusat & Gudang Jakarta",
        address: "Jl. Tebet Barat Dalam Raya No. 12, Tebet, Jakarta Selatan 12810",
        latitude: -6.2383,
        longitude: 106.8525,
        radius_m: 100,
        status: "ACTIVE",
        created_at: now,
      },
    ];
  }

  // Ensure baseline area exists if none
  if (!db.areas || db.areas.length === 0) {
    db.areas = [
      {
        _id: "area-1",
        code: "AREA-JKT-01",
        name: "Jakarta Selatan 1",
        office_id: "off-1",
        status: "ACTIVE",
        created_at: now,
      },
    ];
  }

  // Ensure all collections are safely initialized as arrays
  if (!db.products) db.products = [];
  if (!db.skus) db.skus = [];
  if (!db.prices) db.prices = [];
  if (!db.promos) db.promos = [];
  if (!db.routes) db.routes = [];
  if (!db.inventory) db.inventory = [];
  if (!db.outlets) db.outlets = [];
  if (!db.salesmen) db.salesmen = [];
  if (!db.sales_outlets) db.sales_outlets = [];
  if (!db.call_plans) db.call_plans = [];
  if (!db.call_plan_items) db.call_plan_items = [];
  if (!db.attendance) db.attendance = [];
  if (!db.visits) db.visits = [];
  if (!db.transactions) db.transactions = [];
  if (!db.stock_movements) db.stock_movements = [];
  if (!db.stock_handovers) db.stock_handovers = [];
  if (!db.stock_returns) db.stock_returns = [];
  if (!db.stock_receivings) db.stock_receivings = [];
  if (!db.sales_stock_ledgers) db.sales_stock_ledgers = [];
  if (!db.targets) db.targets = [];
  if (!db.cash_deposits) db.cash_deposits = [];
  if (!db.receivables) db.receivables = [];
  if (!db.daily_reconciliations) db.daily_reconciliations = [];
  if (!db.audit_logs) db.audit_logs = [];
  if (!db.gps_events) db.gps_events = [];
}

export function loadDatabaseFromDisk(): boolean {
  // Local disk persistence has been disabled in favor of PostgreSQL as the single source of truth.
  return false;
}

export function resetToCleanFreshDatabase() {
  ensureDefaultUsers();
  ensureDefaultMasterData();

  // Explicitly wipe all operational and transaction collections to 0
  db.areas = [];
  db.routes = [];
  db.products = [];
  db.skus = [];
  db.prices = [];
  db.promos = [];
  db.salesmen = [];
  db.outlets = [];
  db.sales_outlets = [];
  db.call_plans = [];
  db.call_plan_items = [];
  db.attendance = [];
  db.visits = [];
  db.transactions = [];
  db.inventory = [];
  db.stock_movements = [];
  db.stock_handovers = [];
  db.stock_returns = [];
  db.stock_receivings = [];
  db.sales_stock_ledgers = [];
  db.targets = [];
  db.cash_deposits = [];
  db.receivables = [];
  db.daily_reconciliations = [];
  db.audit_logs = [];
  db.gps_events = [];

  saveDatabaseToDisk(true);
}

// Initial DB initialization: Load from disk or seed
if (!loadDatabaseFromDisk()) {
  ensureDefaultUsers();
  ensureDefaultMasterData();
  auditAndRepairDatabase();
  saveDatabaseToDisk();
} else {
  ensureDefaultUsers();
  ensureDefaultMasterData();
  auditAndRepairDatabase();
  saveDatabaseToDisk();
}


