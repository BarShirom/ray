import { createPostgres } from "./connection.js";
import { localConfigFromEnv } from "./local-config.js";
import { applyLocalMigrations } from "./migrate.js";

try {
  const config = localConfigFromEnv("local");
  const connection = createPostgres(config);
  try {
    await applyLocalMigrations(connection, "local", config.connectionString);
    console.log("Ray local PostgreSQL migrations applied.");
  } finally {
    await connection.close();
  }
} catch {
  console.error("Local migration failed. Check RAY_LOCAL_DATABASE_URL and the local Docker service; connection details are omitted.");
  process.exitCode = 1;
}
