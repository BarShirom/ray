import type pg from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrationsFolder } from "../db/migrate.js";

export async function assertMigrationState(pool: Pick<pg.Pool, "query">) {
  try {
    const expected = readMigrationFiles({ migrationsFolder });
    const { rows } = await pool.query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id");
    if (rows.length !== expected.length || expected.some((migration, i) =>
      rows[i].hash !== migration.hash || Number(rows[i].created_at) !== migration.folderMillis)) {
      throw new Error("Migration journal mismatch");
    }
  } catch {
    throw new Error("Preview migrations missing or unexpected. Run npm.cmd run db:migrate:preview --prefix server; inspect mismatches without resetting data.");
  }
}
