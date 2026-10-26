import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createAbuseProtection, RATE_LIMIT_MESSAGE } from "../dist/security/abuseProtection.js";
import { requestParsers, requestErrorHandler } from "../dist/middleware/requestParsing.js";
import { createAuthRouter } from "../dist/routes/authRoutes.js";
import { createReportRouter } from "../dist/routes/reportRoutes.js";
import { createFeedingStationRouter } from "../dist/routes/feedingStationRoutes.js";
import { createMediaRouter } from "../dist/media/routes.js";
import { createAuthMiddleware } from "../dist/middleware/authMiddleware.js";
import { createOptionalAuthMiddleware } from "../dist/middleware/optionalAuthMiddleware.js";
import { createLegacyApp } from "../dist/app.js";
import { createPreviewApp } from "../dist/preview/app.js";

const secret = "synthetic-rate-contract-secret-only";
const userA = "100000000000000000000001", userB = "100000000000000000000002";
const stationId = "200000000000000000000001", reportId = "300000000000000000000001";
const location = { lat: 32.1, lng: 34.8 };
const report = { description: "דיווח בדיקה Synthetic", type: "general", location };
const station = { name: "תחנת בדיקה Synthetic", location };
const clock = () => {
  let time = 1_000_000;
  return { now: () => time, advance: milliseconds => { time += milliseconds; } };
};
const two = { limit: 2, windowMs: 60_000 };

async function listen(t, app) {
  const listener = app.listen(0, "127.0.0.1");
  await new Promise(resolve => listener.once("listening", resolve));
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  return async (method, path, body, token, extraHeaders = {}) => {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}${path}`, {
      method, redirect: "manual", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text };
  };
}

function limited(response, seconds = 60) {
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), String(seconds));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(response.body, { message: RATE_LIMIT_MESSAGE });
}

function stores() {
  const calls = { lookup: 0, registration: 0, credentials: 0, report: 0, claim: 0, resolve: 0, station: 0, feeding: 0, read: 0, content: 0 };
  const users = {
    async findIdentityByPublicId(id) { calls.lookup++; return [userA, userB].includes(id) ? { _id: id, firstName: "Synthetic", lastName: "Carer" } : null; },
    async findByEmail() { calls.registration++; return null; },
    async findCredentialsByEmail() { calls.credentials++; return null; },
    async create(input) { return { ...input, publicId: userA }; },
  };
  const record = { ...report, publicId: reportId, createdBy: null, assignedTo: null, status: "new" };
  const reports = {
    async create(input) { calls.report++; return { ...record, ...input, createdBy: input.createdBy ? { publicId: input.createdBy } : null }; },
    async claim(_id, actor) { calls.claim++; return { kind: "claimed", report: { ...record, assignedTo: { publicId: actor.publicId }, status: "in_progress" } }; },
    async resolve() { calls.resolve++; return { kind: "resolved", report: { ...record, status: "resolved" } }; },
    async listAll() { calls.read++; return []; }, async listAssignedTo() { calls.read++; return []; },
    async getGlobalStats() { calls.read++; return { total: 0, resolved: 0, inProgress: 0, new: 0 }; },
    async getAssignedStats() { calls.read++; return { total: 0, resolved: 0, inProgress: 0 }; },
  };
  const stationRecord = { ...station, publicId: stationId, createdBy: userA, active: true };
  const stations = {
    async create(input) { calls.station++; return { ...stationRecord, ...input }; },
    async findByPublicId() { calls.read++; return stationRecord; },
    async listActive() { calls.read++; return []; },
  };
  const logs = { async create(input) { calls.feeding++; return { ...input, publicId: "400000000000000000000001" }; }, async listForStation() { calls.read++; return []; } };
  return { users, reports, stations, logs, calls };
}

function compose(fixtures, abuse) {
  const app = express();
  app.use("/api", abuse.ingress);
  app.use(requestParsers());
  const authenticate = createAuthMiddleware(fixtures.users, () => secret);
  app.use("/api/auth", createAuthRouter(fixtures.users, () => secret, abuse));
  app.use("/api/reports", createReportRouter(fixtures.reports, authenticate, createOptionalAuthMiddleware(fixtures.users, () => secret), undefined, abuse));
  app.use("/api/feeding-stations", createFeedingStationRouter(fixtures.stations, fixtures.logs, authenticate, undefined, abuse));
  app.use("/api/media", createMediaRouter({ content: async () => { fixtures.calls.content++; return "https://synthetic.invalid/image"; } }, authenticate, abuse));
  app.use(requestErrorHandler);
  return app;
}

test("real auth routes bound repeated attempts before validation, account queries and password work", async t => {
  const time = clock(), f = stores();
  const post = await listen(t, compose(f, createAbuseProtection({ now: time.now, policies: { login: two, registration: two } })));
  for (let i = 0; i < 2; i++) {
    const response = await post("POST", "/api/auth/login", { email: "synthetic@example.invalid", password: "synthetic-only" });
    assert.equal(response.status, 400);
    assert.equal(response.body.msg, "Invalid email or password");
  }
  const before = f.calls.credentials;
  limited(await post("POST", "/api/auth/login", { email: "different@example.invalid", password: "private-marker" }, undefined, { "X-Forwarded-For": "198.51.100.55" }));
  limited(await post("POST", "/api/auth/login", {}));
  assert.equal(f.calls.credentials, before);
  for (let i = 0; i < 2; i++) {
    const response = await post("POST", "/api/auth/register", { firstName: "סינתטי", lastName: "Synthetic", email: `synthetic${i}@example.invalid`, password: "synthetic-only" });
    assert.equal(response.status, 201);
  }
  limited(await post("POST", "/api/auth/register", {}));
  assert.equal(f.calls.registration, 2);
  time.advance(59_001);
  limited(await post("POST", "/api/auth/login", {}), 1);
  time.advance(999);
  assert.equal((await post("POST", "/api/auth/login", {})).status, 400);
});

test("normal login still returns the existing profile/token contract", async t => {
  const f = stores(), passwordHash = await bcrypt.hash("synthetic-only", 10);
  f.users.findCredentialsByEmail = async () => ({ publicId: userA, firstName: "Synthetic", lastName: "Carer", email: "synthetic@example.invalid", passwordHash });
  const post = await listen(t, compose(f, createAbuseProtection()));
  const response = await post("POST", "/api/auth/login", { email: "synthetic@example.invalid", password: "synthetic-only" });
  assert.equal(response.status, 200);
  assert.equal(jwt.verify(response.body.token, secret).id, userA);
  assert.equal(response.body.user.firstName, "Synthetic");
});

test("guest reports have a separate budget and rejected writes never reach the store", async t => {
  const time = clock(), f = stores();
  const request = await listen(t, compose(f, createAbuseProtection({ now: time.now, policies: { guestWrite: two, accountWrite: two } })));
  assert.equal((await request("POST", "/api/reports", report)).status, 201);
  assert.equal((await request("POST", "/api/reports", report, "not-a-jwt")).status, 201);
  limited(await request("POST", "/api/reports", report, undefined, { Forwarded: "for=198.51.100.1" }));
  assert.equal(f.calls.report, 2);
  const token = jwt.sign({ id: userA }, secret);
  assert.equal((await request("POST", "/api/reports", report, token)).status, 201);
  assert.equal(f.calls.report, 3);
  time.advance(60_000);
  assert.equal((await request("POST", "/api/reports", report)).status, 201);
});

test("authenticated report actions, station and feeding writes share an actor budget without crossing accounts", async t => {
  const time = clock(), f = stores();
  const request = await listen(t, compose(f, createAbuseProtection({ now: time.now, policies: { accountWrite: two } })));
  const a = jwt.sign({ id: userA }, secret), b = jwt.sign({ id: userB }, secret);
  assert.equal((await request("POST", `/api/feeding-stations/${stationId}/feedings`, { food: false, water: true, note: "מים Water" }, a)).status, 201);
  assert.equal((await request("PATCH", `/api/reports/${reportId}/claim`, {}, a)).status, 200);
  const reads = f.calls.read;
  limited(await request("POST", "/api/feeding-stations", station, a));
  limited(await request("PATCH", `/api/reports/${reportId}/resolve`, {}, a));
  assert.equal(f.calls.station, 0); assert.equal(f.calls.resolve, 0); assert.equal(f.calls.read, reads);
  assert.equal((await request("POST", "/api/feeding-stations", station, b)).status, 201);
  assert.equal((await request("POST", "/api/reports", report, b)).status, 201);
  assert.equal((await request("POST", "/api/feeding-stations", station)).status, 401);
  time.advance(60_000);
  assert.equal((await request("PATCH", `/api/reports/${reportId}/resolve`, {}, a)).status, 200);
  assert.equal(f.calls.feeding, 1); assert.equal(f.calls.claim, 1); assert.equal(f.calls.resolve, 1);
});

test("public lists, authenticated statistics and signed reads are bounded before expensive work", async t => {
  const time = clock(), f = stores();
  const request = await listen(t, compose(f, createAbuseProtection({ now: time.now, policies: { publicRead: two } })));
  assert.equal((await request("GET", "/api/reports")).status, 200);
  assert.equal((await request("GET", "/api/media/synthetic/content")).status, 302);
  const lookups = f.calls.lookup;
  limited(await request("GET", "/api/reports/stats", undefined, jwt.sign({ id: userA }, secret)));
  limited(await request("GET", "/api/feeding-stations"));
  assert.equal(f.calls.read, 1); assert.equal(f.calls.content, 1); assert.equal(f.calls.lookup, lookups);
  time.advance(60_000);
  assert.equal((await request("GET", "/api/reports/stats", undefined, jwt.sign({ id: userA }, secret))).status, 200);
});

for (const mode of ["legacy", "postgres"]) {
  test(`${mode} actual app rejects ingress before parsing, ignores proxy headers and preserves liveness/retirement`, async t => {
    t.mock.method(console, "log", () => {});
    const time = clock(), options = { now: time.now, policies: { ingress: { limit: 1, windowMs: 60_000 } } };
    const unexpected = () => assert.fail("No database or storage side effect permitted");
    const connection = { db: new Proxy({}, { get: unexpected }), pool: { query: unexpected } };
    const app = mode === "legacy" ? createLegacyApp(options) : createPreviewApp(connection, secret, undefined, "dev/", options);
    assert.equal(app.get("trust proxy"), false);
    const request = await listen(t, app);
    const origin = mode === "legacy" ? "http://localhost:5173" : "http://127.0.0.1:5175";
    assert.equal((await request("POST", "/api/auth/login", "{", undefined, { Origin: origin })).status, 400);
    const rejection = await request("POST", "/api/auth/login", "{", undefined, { Origin: origin, "X-Forwarded-For": "203.0.113.3", "X-Real-IP": "198.51.100.1" });
    limited(rejection);
    limited(await request("POST", "/unknown-parser-path", "{"));
    assert.match(rejection.headers.get("access-control-expose-headers"), /Retry-After/i);
    assert.equal((await request("GET", "/healthz")).status, 200);
    assert.equal((await request("POST", "/api/upload/media", "{")).status, 503);
    if (mode === "postgres") limited(await request("GET", "/readyz"));
    time.advance(60_000);
    assert.equal((await request("POST", "/api/auth/login", "{")).status, 400);
  });
}
