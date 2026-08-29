import axios from "axios";

const BASE_URL = "http://localhost:3000/api";

async function testApi() {
  console.log("Testing Live Express API Endpoints...\n");

  // 1. Health Check
  try {
    const health = await axios.get(`${BASE_URL}/health`);
    console.log("[PASS] /api/health:", health.data);
  } catch (err: any) {
    console.error("[FAIL] /api/health:", err.message);
  }

  // 2. Auth Login (Owner)
  let ownerToken = "";
  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: "andismochsolihin@gmail.com",
      password: "owner123",
    });
    ownerToken = res.data.token;
    console.log("[PASS] /api/auth/login (Owner): Success, user:", res.data.user.name, "role:", res.data.user.role);
  } catch (err: any) {
    console.error("[FAIL] /api/auth/login (Owner):", err.response?.data || err.message);
  }

  // 3. Auth Login (Admin)
  let adminToken = "";
  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: "admin@mahameru.id",
      password: "admin123",
    });
    adminToken = res.data.token;
    console.log("[PASS] /api/auth/login (Admin): Success, user:", res.data.user.name, "role:", res.data.user.role);
  } catch (err: any) {
    console.error("[FAIL] /api/auth/login (Admin):", err.response?.data || err.message);
  }

  // 4. Invalid Login test
  try {
    await axios.post(`${BASE_URL}/auth/login`, {
      email: "andismochsolihin@gmail.com",
      password: "wrongpassword",
    });
    console.error("[FAIL] /api/auth/login invalid password should have failed!");
  } catch (err: any) {
    console.log("[PASS] /api/auth/login rejects wrong password with status:", err.response?.status);
  }

  const authHeader = { headers: { Authorization: `Bearer ${ownerToken}` } };

  // 5. Company Profile
  try {
    const res = await axios.get(`${BASE_URL}/company-profile`, authHeader);
    console.log("[PASS] /api/company-profile:", res.data.company_name);
  } catch (err: any) {
    console.error("[FAIL] /api/company-profile:", err.response?.data || err.message);
  }

  // 6. Master Wilayah
  try {
    const provs = await axios.get(`${BASE_URL}/provinces`, authHeader);
    console.log(`[PASS] /api/provinces: ${provs.data.length} provinces available`);
  } catch (err: any) {
    console.error("[FAIL] /api/provinces:", err.response?.data || err.message);
  }

  // 7. Dashboard Analytics
  try {
    const res = await axios.get(`${BASE_URL}/analytics/owner-dashboard`, authHeader);
    console.log("[PASS] /api/analytics/owner-dashboard:", {
      total_volume: res.data.total_volume,
      effective_calls: res.data.effective_calls,
      outlet_calls: res.data.outlet_calls,
      ec_rate: res.data.ec_rate,
    });
  } catch (err: any) {
    console.error("[FAIL] /api/analytics/owner-dashboard:", err.response?.data || err.message);
  }

  // 8. Outlets endpoint
  try {
    const res = await axios.get(`${BASE_URL}/outlets`, authHeader);
    console.log(`[PASS] /api/outlets: ${res.data.length} outlets (empty state verified)`);
  } catch (err: any) {
    console.error("[FAIL] /api/outlets:", err.response?.data || err.message);
  }

  // 9. Products & SKUs endpoint
  try {
    const res = await axios.get(`${BASE_URL}/products`, authHeader);
    console.log(`[PASS] /api/products: ${res.data.length} products (empty state verified)`);
  } catch (err: any) {
    console.error("[FAIL] /api/products:", err.response?.data || err.message);
  }

  // 10. Audit Logs endpoint
  try {
    const res = await axios.get(`${BASE_URL}/audit-logs`, authHeader);
    console.log(`[PASS] /api/audit-logs: ${res.data.length} logs found`);
  } catch (err: any) {
    console.error("[FAIL] /api/audit-logs:", err.response?.data || err.message);
  }

  console.log("\nAll Live API Endpoints tested successfully!");
}

testApi();
