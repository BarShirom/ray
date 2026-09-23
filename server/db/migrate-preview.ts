import { createPostgres } from "./connection.js";
import { localConfigFromEnv } from "./local-config.js";
import { applyLocalMigrations } from "./migrate.js";
import { assertMigrationState } from "../preview/migration-state.js";

try {
  const config = localConfigFromEnv("preview");
  const connection = createPostgres(config);
  try {
    await applyLocalMigrations(connection, "preview", config.connectionString);
    await assertMigrationState(connection.pool);
    console.log("Synthetic local preview migrations applied and verified.");
  } finally { await connection.close(); }
} catch {
  console.error("Preview migration failed. Check RAY_PREVIEW_DATABASE_URL and preview-db; inspect any migration mismatch without resetting data. Connection details omitted.");
  process.exitCode = 1;
}
