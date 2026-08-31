import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
}

// Function to create or retrieve the connection pool.
export const createPool = () => {
  if (!global._postgresPool) {
    const poolConfig = process.env.SQL_HOST
      ? {
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
        }
      : { connectionString: process.env.DATABASE_URL };

    global._postgresPool = new Pool({
      ...poolConfig,
      max: 10,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on("error", (err) => {
      // Benign idle disconnection or socket reset
      if (err.message && (err.message.includes("ECONNRESET") || err.message.includes("closed"))) {
        console.warn("[Cloud SQL] Idle client disconnected gracefully, will reconnect automatically.");
      } else {
        console.error("Unexpected error on idle SQL pool client:", err);
      }
    });
  }
  return global._postgresPool;
};

// Create or retrieve the pool instance.
export const pool = createPool();

// Initialize Drizzle with the pool and schema.
export const sqlDb = drizzle(pool, { schema });
