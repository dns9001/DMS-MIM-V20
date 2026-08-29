import axios from "axios";

const BASE_URL = "http://localhost:3000/api";

let testsPassed = 0;
let testsFailed = 0;

function logPass(name: string, details?: any) {
  testsPassed++;
  console.log(`[PASS] ${name}${details ? ` -> ${JSON.stringify(details)}` : ""}`);
}

function logFail(name: string, err: any) {
  testsFailed++;
  console.error(`[FAIL] ${name} ->`, err?.response?.data || err?.message || err);
}

async function runE2ETest() {
  console.log("===============================================================");
  console.log("STARTING FULL END-TO-END LIVE API & FEATURE TEST FOR DMS MAHAMERU");
  console.log("===============================================================\n");

  // 1. Health check
  try {
    const res = await axios.get(`${BASE_URL}/health`);
    logPass("GET /api/health", res.data);
  } catch (err: any) {
    logFail("GET /api/health", err);
  }

  // 2. Test All User Logins
  const roles = [
    { role: "OWNER", email: "andismochsolihin@gmail.com", pass: "owner123" },
    { role: "ADMIN", email: "admin@mahameru.id", pass: "admin123" },
    { role: "SUPERVISOR", email: "spv@mahameru.id", pass: "spv123" },
    { role: "SALES", email: "budi@mahameru.id", pass: "sales123" },
    { role: "WAREHOUSE", email: "gudang@mahameru.id", pass: "gudang123" },
  ];

  const tokens: Record<string, string> = {};

  for (const cred of roles) {
    try {
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        email: cred.email,
        password: cred.pass,
      });
      tokens[cred.role] = res.data.token;
      logPass(`POST /api/auth/login as ${cred.role}`, { name: res.data.user.name, role: res.data.user.role });
    } catch (err: any) {
      logFail(`POST /api/auth/login as ${cred.role}`, err);
    }
  }

  const authH = (role: string) => ({
    headers: { Authorization: `Bearer ${tokens[role]}` },
  });

  // 3. /auth/me for each user
  for (const cred of roles) {
    try {
      const res = await axios.get(`${BASE_URL}/auth/me`, authH(cred.role));
      logPass(`GET /api/auth/me for ${cred.role}`, { user: res.data.user?.name });
    } catch (err: any) {
      logFail(`GET /api/auth/me for ${cred.role}`, err);
    }
  }

  // 4. Company Profile
  try {
    const res = await axios.get(`${BASE_URL}/company-profile`, authH("ADMIN"));
    logPass("GET /api/company-profile", { company: res.data.company_name, phone: res.data.phone });
  } catch (err: any) {
    logFail("GET /api/company-profile", err);
  }

  // 5. Master Data Hierarchy (Wilayah)
  try {
    const provs = await axios.get(`${BASE_URL}/provinces`, authH("ADMIN"));
    logPass(`GET /api/provinces (${provs.data.length} records)`);

    const reg = await axios.get(`${BASE_URL}/regencies`, authH("ADMIN"));
    logPass(`GET /api/regencies (${reg.data.length} records)`);

    const dist = await axios.get(`${BASE_URL}/districts`, authH("ADMIN"));
    logPass(`GET /api/districts (${dist.data.length} records)`);

    const vil = await axios.get(`${BASE_URL}/villages`, authH("ADMIN"));
    logPass(`GET /api/villages (${vil.data.length} records)`);
  } catch (err: any) {
    logFail("GET Wilayah Master Data", err);
  }

  // 6. Master Offices, Channels, Routes, Areas
  try {
    const offices = await axios.get(`${BASE_URL}/offices`, authH("ADMIN"));
    logPass(`GET /api/offices (${offices.data.length} records)`);

    const channels = await axios.get(`${BASE_URL}/channels`, authH("ADMIN"));
    logPass(`GET /api/channels (${channels.data.length} records)`);

    const routes = await axios.get(`${BASE_URL}/routes`, authH("ADMIN"));
    logPass(`GET /api/routes (${routes.data.length} records)`);

    const areas = await axios.get(`${BASE_URL}/areas`, authH("ADMIN"));
    logPass(`GET /api/areas (${areas.data.length} records)`);
  } catch (err: any) {
    logFail("GET Master Organization Data", err);
  }

  // 7. Products & SKUs
  let testSkuId = "";
  try {
    const prods = await axios.get(`${BASE_URL}/products`, authH("ADMIN"));
    logPass(`GET /api/products (${prods.data.length} products)`);

    const skus = await axios.get(`${BASE_URL}/skus`, authH("ADMIN"));
    logPass(`GET /api/skus (${skus.data.length} SKUs)`);
    if (skus.data.length > 0) {
      testSkuId = skus.data[0]._id;
    }
  } catch (err: any) {
    logFail("GET Products & SKUs", err);
  }

  // 8. Warehouse Stock APIs
  try {
    const stockSummary = await axios.get(`${BASE_URL}/stock/summary`, authH("WAREHOUSE"));
    logPass("GET /api/stock/summary", { itemsCount: stockSummary.data.length });

    const myStock = await axios.get(`${BASE_URL}/stock/my-stock`, authH("SALES"));
    logPass("GET /api/stock/my-stock for Sales", { itemsCount: myStock.data.length });

    const stockCards = await axios.get(`${BASE_URL}/stock/cards`, authH("WAREHOUSE"));
    logPass("GET /api/stock/cards", { movements: stockCards.data.length });
  } catch (err: any) {
    logFail("GET Stock APIs", err);
  }

  // 9. Attendance check-in & today
  try {
    const todayAtt = await axios.get(`${BASE_URL}/attendance/today`, authH("SALES"));
    logPass("GET /api/attendance/today", { attendance: todayAtt.data ? "Found" : "None" });
  } catch (err: any) {
    logFail("GET /api/attendance/today", err);
  }

  // 10. Outlets & Pending NOO
  let sampleOutletId = "";
  try {
    const outlets = await axios.get(`${BASE_URL}/outlets`, authH("SALES"));
    logPass(`GET /api/outlets (${outlets.data.length} outlets)`);
    if (outlets.data.length > 0) {
      sampleOutletId = outlets.data[0]._id;
    }

    const pending = await axios.get(`${BASE_URL}/outlets/pending`, authH("SUPERVISOR"));
    logPass(`GET /api/outlets/pending (${pending.data?.items?.length || pending.data?.length || 0} pending)`);
  } catch (err: any) {
    logFail("GET Outlets & Pending NOO", err);
  }

  // 11. Call Plans & Active Visits
  try {
    const callPlans = await axios.get(`${BASE_URL}/call-plans`, authH("SALES"));
    logPass(`GET /api/call-plans (${callPlans.data.length} plans)`);

    const activeVisit = await axios.get(`${BASE_URL}/visits/active`, authH("SALES"));
    logPass("GET /api/visits/active", { activeVisit: activeVisit.data ? activeVisit.data._id : "None" });
  } catch (err: any) {
    logFail("GET Call Plans / Visits", err);
  }

  // 12. Dashboard Endpoints
  try {
    const salesDash = await axios.get(`${BASE_URL}/dashboard/sales`, authH("SALES"));
    logPass("GET /api/dashboard/sales", { salesName: salesDash.data.salesman?.name });

    const spvDash = await axios.get(`${BASE_URL}/dashboard/supervisor`, authH("SUPERVISOR"));
    logPass("GET /api/dashboard/supervisor", { totalSales: spvDash.data.summary?.total_salesmen });

    const spvMonitoring = await axios.get(`${BASE_URL}/monitoring/sales`, authH("SUPERVISOR"));
    logPass("GET /api/monitoring/sales", { monitoredSales: spvMonitoring.data.items?.length });

    const ownerDash = await axios.get(`${BASE_URL}/analytics/owner-dashboard`, authH("OWNER"));
    logPass("GET /api/analytics/owner-dashboard", {
      totalVolume: ownerDash.data.total_volume,
      effectiveCalls: ownerDash.data.effective_calls,
      ecRate: ownerDash.data.ec_rate,
    });
  } catch (err: any) {
    logFail("GET Dashboard Endpoints", err);
  }

  // 13. Reports Endpoints
  try {
    const salesRep = await axios.get(`${BASE_URL}/reports/sales`, authH("OWNER"));
    logPass("GET /api/reports/sales", { totalTransactions: salesRep.data.total_transactions });

    const outletRep = await axios.get(`${BASE_URL}/reports/outlet-performance`, authH("SUPERVISOR"));
    logPass("GET /api/reports/outlet-performance", { totalOutlets: outletRep.data.total_outlets });
  } catch (err: any) {
    logFail("GET Reports Endpoints", err);
  }

  // 14. Audit Logs
  try {
    const logs = await axios.get(`${BASE_URL}/audit-logs`, authH("ADMIN"));
    logPass(`GET /api/audit-logs (${logs.data.items?.length || logs.data.length || 0} logs)`);
  } catch (err: any) {
    logFail("GET /api/audit-logs", err);
  }

  console.log("\n===============================================================");
  console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("===============================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runE2ETest();
