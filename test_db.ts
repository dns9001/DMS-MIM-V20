import { pool } from "./src/db/index.js";
async function test() {
  const client = await pool.connect();
  const res = await client.query("SELECT count(*) FROM users");
  console.log("Relational Users count:", res.rows[0].count);
  const res2 = await client.query("SELECT count(*) FROM dms_document_store WHERE collection_name = 'users'");
  console.log("Document Users count:", res2.rows[0].count);
  client.release();
  process.exit(0);
}
test();
