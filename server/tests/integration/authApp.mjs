import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import dotenv from "dotenv";

// Only composition/endpoints are test-owned; auth logic and validation are production code.
export async function startPostgresAuthApp(t, store) {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "ray-postgres-auth-tests-only-synthetic-secret";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  t.mock.method(dotenv, "config", () => ({ parsed: {} }));
  const [{ createAuthRouter }, { createAuthMiddleware }, { createOptionalAuthMiddleware }] = await Promise.all([
    import("../../dist/routes/authRoutes.js"),
    import("../../dist/middleware/authMiddleware.js"),
    import("../../dist/middleware/optionalAuthMiddleware.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(store));
  app.get("/protected", createAuthMiddleware(store), (req, res) => res.json({ user: req.user }));
  app.get("/optional", createOptionalAuthMiddleware(store), (req, res) => res.json({ user: req.user ?? null }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, "listening");
  return async (method, path, body, authorization) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.match(response.headers.get("content-type"), /application\/json/);
    return { status: response.status, body: await response.json() };
  };
}
