import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { createPostgres } from "./connection.js";
import { assertDatabaseIdentity, localConfig, type LocalTarget } from "./local-config.js";

// Works both from db/*.ts and compiled dist/db/*.js.
export const migrationsFolder = fileURLToPath(new URL(
  import.meta.url.endsWith(".ts") ? "./migrations/" : "../../db/migrations/", import.meta.url,
));

export async function applyLocalMigrations(connection: ReturnType<typeof createPostgres>, target: LocalTarget, url: string) {
  localConfig(target, url);
  await assertDatabaseIdentity(connection.pool, target);
  await migrate(connection.db, { migrationsFolder });
}
