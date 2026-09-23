import { createPostgres } from "./connection.js";
import { localConfigFromEnv } from "./local-config.js";
import { seedPreview } from "../preview/seed.js";

try {
  const config = localConfigFromEnv("preview");
  const connection = createPostgres(config);
  try {
    await seedPreview(connection, config.connectionString);
    console.log("Synthetic preview seed complete (existing records preserved).");
  } finally { await connection.close(); }
} catch {
  console.error("Synthetic preview seed failed; transaction rolled back. Check dedicated preview config, migrations and seed ID/email conflicts. No existing records were overwritten.");
  process.exitCode = 1;
}
