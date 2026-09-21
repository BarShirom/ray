import { defineConfig } from "drizzle-kit";

// Generation is offline. Applying migrations goes through the guarded script.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
});
