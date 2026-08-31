import { pool } from "./src/db/index.js";

async function check() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT * FROM inventory`);
    console.log("Current inventory rows in PostgreSQL:", res.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}
check();
