import { createPostgres } from "../../dist/db/connection.js";
import { assertDatabaseIdentity, localConfig, localConfigFromEnv } from "../../dist/db/local-config.js";

export async function cleanupTestDatabase(connection, url) {
  // Validate before ANY query, including identity lookup or destructive SQL.
  localConfig("test", url);
  await assertDatabaseIdentity(connection.pool, "test");
  // Only objects owned by this suite; no CASCADE on domain tables or extensions.
  await connection.pool.query(`
    DROP TABLE IF EXISTS public.feeding_logs;
    DROP TABLE IF EXISTS public.feeding_stations;
    DROP TABLE IF EXISTS public.reports;
    DROP TABLE IF EXISTS public.users;
    DROP FUNCTION IF EXISTS public.ray_set_updated_at();
    DROP TABLE IF EXISTS drizzle.__drizzle_migrations;
    DROP SCHEMA IF EXISTS drizzle;
  `);
}

export async function openTestDatabase(t) {
  const config = localConfigFromEnv("test");
  const connection = createPostgres({ ...config, max: 2 });
  let lock;
  let ownsObjects = false;
  t.after(async () => {
    try {
      if (ownsObjects) await cleanupTestDatabase(connection, config.connectionString);
    } finally {
      if (lock) lock.release(true);
      await connection.close();
    }
  });
  await assertDatabaseIdentity(connection.pool, "test");
  lock = await connection.pool.connect();
  const { rows } = await lock.query("SELECT pg_try_advisory_lock(1010, 10) AS acquired");
  if (!rows[0].acquired) throw new Error("Another Ray integration suite is running");
  const existing = await connection.pool.query(`
    SELECT to_regclass('public.users') AS users,
      to_regclass('public.reports') AS reports,
      to_regclass('public.feeding_stations') AS stations,
      to_regclass('public.feeding_logs') AS logs,
      to_regnamespace('drizzle') AS migrations,
      to_regproc('public.ray_set_updated_at') AS trigger_function
  `);
  if (Object.values(existing.rows[0]).some((value) => value !== null)) {
    throw new Error("Refusing existing Ray objects. Recreate only the disposable test-db service; see setup documentation.");
  }
  ownsObjects = true;
  return { ...connection, url: config.connectionString };
}
