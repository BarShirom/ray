import { createServer, type Server } from "node:http";
import type { Express } from "express";
import { createPostgres } from "../db/connection.js";
import { assertDatabaseIdentity } from "../db/local-config.js";
import { previewConfig } from "./config.js";
import { assertMigrationState } from "./migration-state.js";
import { createPreviewApp } from "./app.js";

export function closePreview(server: Server, connection: Pick<ReturnType<typeof createPostgres>, "close">) {
  return new Promise<void>((resolve, reject) => {
    const force = setTimeout(() => server.closeAllConnections(), 1_000);
    force.unref();
    server.close((error) => {
      clearTimeout(force);
      connection.close().then(() => error ? reject(error) : resolve(), reject);
    });
  });
}

// Use Node's listener: Express 5 also invokes its app.listen callback on errors.
export function listenLoopback(app: Express, port: number) {
  return new Promise<Server>((resolve, reject) => {
    const listener = createServer(app);
    listener.once("error", () => reject(new Error(
      "Preview API cannot bind 127.0.0.1:" + port + "; check for an occupied port. No alternate port was selected.",
    )));
    listener.listen(port, "127.0.0.1", () => resolve(listener));
  });
}

export async function startPreview(env: NodeJS.ProcessEnv = process.env) {
  const config = previewConfig(env);
  const connection = createPostgres(config.database);
  try {
    try { await assertDatabaseIdentity(connection.pool, "preview"); }
    catch { throw new Error("Preview database unavailable or unexpected. Check the dedicated preview-db service and configuration."); }
    await assertMigrationState(connection.pool);
    const app = createPreviewApp(connection, config.secret);
    const server = await listenLoopback(app, 4001);
    let closing: Promise<void> | undefined;
    return { close: () => (closing ??= closePreview(server, connection)) };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
