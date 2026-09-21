import type pg from "pg";

export type LocalTarget = "local" | "test";
const targets = {
  local: { variable: "RAY_LOCAL_DATABASE_URL", port: "55432", database: "ray_local", user: "ray_local" },
  test: { variable: "RAY_TEST_DATABASE_URL", port: "55433", database: "ray_test", user: "ray_test" },
} as const;

// Reject query parameters too: pg connection URLs can override host/database via
// their query string. Numeric loopback only avoids DNS and localhost aliases.
export function localConfig(target: LocalTarget, value: string | undefined): pg.PoolConfig & { connectionString: string } {
  const expected = targets[target];
  const reject = () => new Error(`${expected.variable} must target 127.0.0.1:${expected.port}/${expected.database} as ${expected.user}, with a password and no URL parameters`);
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw reject(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== "127.0.0.1"
    || url.port !== expected.port || url.pathname !== `/${expected.database}`
    || url.username !== expected.user || !url.password || url.search || url.hash) throw reject();
  // SSL is disabled only for this strictly validated local Docker connection.
  // The general-purpose connection module never overrides TLS configuration.
  return { connectionString: url.href, ssl: false };
}

export function localConfigFromEnv(target: LocalTarget) {
  return localConfig(target, process.env[targets[target].variable]);
}

export async function assertDatabaseIdentity(client: Pick<pg.Pool, "query">, target: LocalTarget) {
  const expected = targets[target];
  const result = await client.query("SELECT current_database() AS database, current_user AS username, inet_server_port() AS port");
  const row = result.rows[0];
  if (row.database !== expected.database || row.username !== expected.user || row.port !== 5432) {
    throw new Error("Refusing unexpected local PostgreSQL database identity");
  }
}
