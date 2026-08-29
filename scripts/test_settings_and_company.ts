import axios from "axios";

const BASE_URL = "http://localhost:3000/api";

async function testSystemAndCompanySettings() {
  console.log("==================================================================");
  console.log("TESTING SYSTEM SETTINGS & COMPANY PROFILE OPTIMIZATIONS");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Authenticate Admin
  const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
    email: "admin@mahameru.id",
    password: "admin123",
  });
  const adminToken = adminLogin.data.token;
  const adminAuth = { headers: { Authorization: `Bearer ${adminToken}` } };
  assert(adminLogin.data.user.role === "ADMIN", "Admin login successful");

  // 2. Fetch System Settings
  const settingsRes = await axios.get(`${BASE_URL}/settings`, adminAuth);
  assert(settingsRes.status === 200, "GET /api/settings returned 200 OK");
  const initialSettings = settingsRes.data.settings || settingsRes.data;
  assert(initialSettings.office_radius_m !== undefined, "Settings contain office_radius_m");

  // 3. Update System Settings
  const updatedSettingsPayload = {
    ...initialSettings,
    office_radius_m: 120,
    outlet_radius_m: 220,
    default_payment_term_days: 21,
    invoice_footer_note: "Barang yang sudah diterima wajib diperiksa bersama salesman.",
  };
  const putSettingsRes = await axios.put(`${BASE_URL}/settings`, updatedSettingsPayload, adminAuth);
  assert(putSettingsRes.status === 200, "PUT /api/settings updated successfully");
  const savedSettings = putSettingsRes.data.settings || putSettingsRes.data;
  assert(savedSettings.office_radius_m === 120, "office_radius_m updated to 120m");
  assert(savedSettings.default_payment_term_days === 21, "default_payment_term_days updated to 21 days");

  // 4. Test Reset Defaults
  const resetRes = await axios.post(`${BASE_URL}/settings/reset-defaults`, {}, adminAuth);
  assert(resetRes.status === 200, "POST /api/settings/reset-defaults executed successfully");
  const resetSettings = resetRes.data.settings || resetRes.data;
  assert(resetSettings.office_radius_m === 100, "Settings safely restored to standard (100m)");

  // 5. Test Company Profile GET & PUT
  const compRes = await axios.get(`${BASE_URL}/company-profile`);
  assert(compRes.status === 200, "GET /api/company-profile returned 200 OK");

  const compUpdateRes = await axios.put(
    `${BASE_URL}/company-profile`,
    {
      companyName: "PT Mahameru Distribusi Indonesia",
      companyLegalName: "PT Mahameru Distribusi Indonesia Tbk",
      companyCode: "MHM-JKT",
      companyEmail: "info@mahamerudistribusi.co.id",
      companyPhone: "+62 21 8370 1234",
      companyWebsite: "https://mahamerudistribusi.co.id",
      companyAddress: "Jl. Tebet Barat Dalam Raya No. 12, Tebet, Jakarta Selatan 12810",
      city: "Jakarta Selatan",
      postalCode: "12810",
      directorName: "Andis Moch Solihin",
      bankName: "Bank Central Asia (BCA)",
      bankAccountNumber: "8830-1234-5678",
      bankAccountHolder: "PT Mahameru Distribusi Indonesia",
      bankBranch: "KCP Tebet Raya",
      npwp: "01.234.567.8-012.000",
      nib: "9120001234567",
    },
    adminAuth
  );
  assert(compUpdateRes.status === 200, "PUT /api/company-profile updated successfully");
  const updatedComp = compUpdateRes.data.company_profile || compUpdateRes.data;
  assert(updatedComp.companyName === "PT Mahameru Distribusi Indonesia", "Company name verified");

  // 6. Test Public Settings Endpoint (for login / header branding)
  const publicRes = await axios.get(`${BASE_URL}/settings/public`);
  assert(publicRes.status === 200, "GET /api/settings/public returned 200 OK");
  assert(publicRes.data.company_name === "PT Mahameru Distribusi Indonesia", "Public company name accurately rendered");

  console.log("\n==================================================================");
  console.log(`TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
}

testSystemAndCompanySettings().catch((e) => {
  console.error("Test execution failed:", e.response?.data || e.message);
  process.exit(1);
});
