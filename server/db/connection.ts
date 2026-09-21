import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export function createPostgres(config: pg.PoolConfig & { connectionString: string }) {
  const pool = new pg.Pool({
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    ...config,
  });
  // Idle clients can fail independently of an awaited query. Do not log URLs/errors
  // containing server detail or credentials. Active query errors still reject.
  pool.on("error", () => console.error("PostgreSQL idle connection failed"));
  const db = drizzle(pool, { schema });
  let closing: Promise<void> | undefined;
  return { pool, db, close: () => (closing ??= pool.end()) };
}
