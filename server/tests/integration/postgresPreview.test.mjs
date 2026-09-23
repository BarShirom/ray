import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { openTestDatabase } from "./database.mjs";
import { applyLocalMigrations } from "../../dist/db/migrate.js";
import { createPreviewApp } from "../../dist/preview/app.js";
import { assertMigrationState } from "../../dist/preview/migration-state.js";
import { closePreview } from "../../dist/preview/runtime.js";
import { insertSyntheticSeed, demoPassword, seedPreview } from "../../dist/preview/seed.js";

test("actual preview composition on disposable PostgreSQL", async (t) => {
  const unexpected = () => { throw new Error("Unexpected Mongo access"); };
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose, "createConnection", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  t.mock.method(mongoose.Model.prototype, "save", unexpected);
  const connection = await openTestDatabase(t);
  await t.test("missing migration state fails safely without auto migration", async () => {
    await assert.rejects(assertMigrationState(connection.pool), /db:migrate:preview/);
    assert.equal((await connection.pool.query("SELECT to_regclass('public.users') AS value")).rows[0].value, null);
    await assert.rejects(seedPreview(connection, connection.url), /RAY_PREVIEW_DATABASE_URL/);
  });
  await applyLocalMigrations(connection, "test", connection.url);
  await assertMigrationState(connection.pool);
  await t.test("unexpected migration hash refuses readiness without modifying schema", async () => {
    const client = await connection.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE drizzle.__drizzle_migrations SET hash='synthetic-mismatch' WHERE id=(SELECT min(id) FROM drizzle.__drizzle_migrations)");
      await assert.rejects(assertMigrationState(client), /db:migrate:preview/);
    } finally { await client.query("ROLLBACK"); client.release(); }
    await assertMigrationState(connection.pool);
  });
  const app = createPreviewApp(connection, "dedicated-synthetic-preview-secret");
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, path, body, token, extra = {}) => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  };
  let token, station, report;
  await t.test("repeatable seed preserves hashes and existing records; conflicts roll back", async () => {
    await insertSyntheticSeed(connection);
    const snapshot = async () => (await connection.pool.query("SELECT jsonb_build_object('users',(SELECT jsonb_agg(u) FROM users u),'stations',(SELECT jsonb_agg(s) FROM feeding_stations s),'logs',(SELECT jsonb_agg(l) FROM feeding_logs l),'reports',(SELECT jsonb_agg(r) FROM reports r)) AS value")).rows[0].value;
    const before = await snapshot();
    // A partially seeded database is completed without rewriting existing users.
    await connection.pool.query("DELETE FROM feeding_logs WHERE public_id=$1", [before.logs[0].public_id]);
    await insertSyntheticSeed(connection);
    const repaired = await snapshot();
    assert.equal(repaired.logs.length, 3);
    assert.deepEqual(repaired.users, before.users);
    await insertSyntheticSeed(connection);
    assert.deepEqual(await snapshot(), repaired);
    await connection.pool.query("UPDATE users SET email='synthetic-conflict@example.invalid' WHERE email='demo1@ray.example.invalid'");
    const conflicted = await snapshot();
    await assert.rejects(insertSyntheticSeed(connection), /conflict/);
    assert.deepEqual(await snapshot(), conflicted);
    await connection.pool.query("UPDATE users SET email='demo1@ray.example.invalid' WHERE email='synthetic-conflict@example.invalid'");
  });
  await t.test("CORS exact origin and uploads unavailable", async () => {
    const ok = await request("OPTIONS", "/api/reports", undefined, undefined, { Origin: "http://127.0.0.1:5175", "Access-Control-Request-Method": "POST" });
    assert.equal(ok.status, 204); assert.equal(ok.headers.get("access-control-allow-origin"), "http://127.0.0.1:5175");
    const denied = await request("GET", "/readyz", undefined, undefined, { Origin: "https://remote.invalid" });
    assert.equal(denied.status, 500); assert.equal(denied.headers.get("access-control-allow-origin"), null);
    const upload = await request("POST", "/api/upload/media", {});
    assert.equal(upload.status, 503); assert.equal(upload.body.message, "uploads unavailable in local preview");
  });
  await t.test("real auth, stations, logs and reports use one SQL database", async () => {
    const registration = await request("POST", "/api/auth/register", { firstName: "Synthetic", lastName: "Preview", email: "preview-http@example.invalid", password: demoPassword });
    assert.equal(registration.status, 201);
    token = registration.body.token;
    assert.ok(token);
    const jwt = (await import("jsonwebtoken")).default;
    assert.ok(jwt.verify(token, "dedicated-synthetic-preview-secret"));
    assert.throws(() => jwt.verify(token, "unrelated-normal-secret"));
    const login = await request("POST", "/api/auth/login", { email: "preview-http@example.invalid", password: demoPassword });
    assert.equal(login.status, 200);
    const created = await request("POST", "/api/feeding-stations", { name: "SYNTHETIC HTTP station", location: { lat: 32.08, lng: 34.78 } }, token);
    assert.equal(created.status, 201); station = created.body;
    assert.equal((await request("POST", `/api/feeding-stations/${station._id}/feedings`, { note: "SYNTHETIC feeding", water: true }, token)).status, 201);
    assert.equal((await request("GET", `/api/feeding-stations/${station._id}/feedings`)).body.length, 1);
    const made = await request("POST", "/api/reports", { description: "SYNTHETIC HTTP report; no real incident", type: "general", location: { lat: 32.08, lng: 34.78 } }, token);
    assert.equal(made.status, 201); report = made.body;
    const second = await request("POST", "/api/auth/login", { email: "demo2@ray.example.invalid", password: demoPassword });
    assert.equal(second.status, 200);
    assert.equal((await request("PATCH", `/api/reports/${report._id}/claim`, {}, second.body.token)).status, 200);
    assert.equal((await request("PATCH", `/api/reports/${report._id}/resolve`, {}, second.body.token)).status, 200);
    assert.ok((await request("GET", "/api/reports/me", undefined, second.body.token)).body.some(r => r._id === report._id && r.status === "resolved"));
    assert.equal((await request("GET", "/api/reports/stats", undefined, second.body.token)).body.total, 4);
    assert.equal((await request("POST", "/api/feeding-stations", {})).status, 401);
    await insertSyntheticSeed(connection);
    assert.equal((await request("GET", "/api/feeding-stations")).body.length, 4);
    assert.equal((await connection.pool.query("SELECT count(*) FROM users")).rows[0].count, '3');
  });
  await t.test("shutdown bounds stalled HTTP requests and ends its real PostgreSQL pool", async () => {
    const { createPostgres } = await import("../../dist/db/connection.js");
    const { localConfig } = await import("../../dist/db/local-config.js");
    const { get } = await import("node:http");
    const own = createPostgres(localConfig("test", connection.url));
    await own.pool.query("SELECT 1");
    const shutdownApp = createPreviewApp(own, "synthetic-shutdown-secret");
    let reached;
    const waiting = new Promise(resolve => { reached = resolve; });
    shutdownApp.get("/test-only-stalled", () => reached());
    const listener = await new Promise(resolve => { const s = shutdownApp.listen(0, "127.0.0.1", () => resolve(s)); });
    const pending = new Promise(resolve => { get('http://127.0.0.1:' + listener.address().port + '/test-only-stalled').on("error", resolve); });
    await waiting;
    let deadline;
    try {
      await Promise.race([closePreview(listener, own), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("shutdown deadline exceeded")), 3000); })]);
      await pending;
      assert.equal(listener.listening, false);
      await assert.rejects(own.pool.query("SELECT 1"), /end/);
    } finally { clearTimeout(deadline); listener.closeAllConnections(); listener.close(); await own.close(); }
  });
  await t.test("readiness fails with a closed real pool; shutdown closes listener and pool", async () => {
    assert.equal((await request("GET", "/readyz")).status, 200);
    // Ending a separate real pool exercises database access failure without changing persistent DBs.
    const { createPostgres } = await import("../../dist/db/connection.js");
    const { localConfig } = await import("../../dist/db/local-config.js");
    const other = createPostgres(localConfig("test", connection.url));
    const failingApp = createPreviewApp(other, "synthetic-secret");
    const listener = await new Promise(resolve => { const s = failingApp.listen(0, "127.0.0.1", () => resolve(s)); });
    await other.close();
    const result = await fetch(`http://127.0.0.1:${listener.address().port}/readyz`);
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { ready: false });
    await closePreview(listener, other);
    assert.equal(listener.listening, false);
    assert.equal((await request("GET", "/readyz")).status, 200);
  });
});
