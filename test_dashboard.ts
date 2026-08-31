import { sqlDb } from "./src/db/index.js";
import { sql } from "drizzle-orm";
import { getOwnerDashboardData } from './server/ownerDashboard.service.js';

// Hack the flag for the test
import * as cloudsqlSync from './server/cloudsqlSync.js';
(cloudsqlSync as any).isCloudSqlConnected = true;

async function run() {
  try {
    const req = { query: { from: '2026-08-17', to: '2026-08-30' } };
    await getOwnerDashboardData(req);
    console.log("Success");
  } catch (err) {
    console.error("ERROR:");
    console.error(err);
  }
}
run();
