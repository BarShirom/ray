import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import mongoose from "mongoose";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { reports, users } from "../../dist/db/schema.js";
import { createPostgres } from "../../dist/db/connection.js";
import { localConfig, assertDatabaseIdentity } from "../../dist/db/local-config.js";
import { applyLocalMigrations } from "../../dist/db/migrate.js";
import { createPostgresUserStore } from "../../dist/users/postgresUserStore.js";
import { createPostgresFeedingStationStore } from "../../dist/feedingStations/postgresFeedingStationStore.js";
import { createPostgresFeedingLogStore } from "../../dist/feedingLogs/postgresFeedingLogStore.js";
import { createPostgresReportStore, reportCount } from "../../dist/reports/postgresReportStore.js";
import { serializeReport } from "../../dist/serializers/reportResponse.js";
import Report from "../../dist/models/ReportModel.js";
import { openTestDatabase } from "./database.mjs";
import { startPostgresAuthApp } from "./authApp.mjs";
import { observeDatabaseTime, assertDatabaseTimestamp, assertPersistedTimestamp } from "./timestamps.mjs";

const id = () => randomBytes(12).toString("hex");
const location = { lat: 32.085312345, lng: 34.781812345 };
const input = (extra = {}) => ({ description: "  Synthetic report  ", type: "general", location, createdBy: null, createdByName: "Guest", ...extra });
const userInput = () => ({ firstName: "Synthetic", lastName: "Carer", email: `${id()}@example.invalid`, passwordHash: "synthetic-report-hash" });
const json = (value) => JSON.parse(JSON.stringify(value));
const keys = ["_id", "description", "type", "status", "location", "media", "createdBy", "assignedTo", "createdByName", "assignedToName", "createdAt", "updatedAt", "__v"];
const safeFailure = { error: "PersistenceError", message: "Report persistence operation failed" };
const codeIs = (code) => (error) => { assert.equal(error.cause?.code ?? error.code, code); return true; };
const safeError = (error) => {
  assert.equal(error.name, safeFailure.error);
  assert.equal(error.message, safeFailure.message);
  assert.equal(error.cause, undefined);
  assert.deepEqual(Object.keys(error), ["name"]);
  return true;
};
const base = "/api/reports";
const conflict = { status: 400, body: { error: "Report is already claimed or resolved" } };
const forbidden = { status: 403, body: { error: "Only assigned user can resolve the report" } };
const allStores = (db) => ({ users: createPostgresUserStore(db), stations: createPostgresFeedingStationStore(db), logs: createPostgresFeedingLogStore(db), reports: createPostgresReportStore(db) });
const app = (t, stores) => startPostgresAuthApp(t, stores.users, { stations: stores.stations, logs: stores.logs }, stores.reports);

test.beforeEach((t) => {
  const unexpected = () => { throw new Error("Unexpected MongoDB access in PostgreSQL report tests"); };
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose, "createConnection", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  t.mock.method(mongoose.Model.prototype, "save", unexpected);
});

test("installed Mongo scalar claim/resolve changes do not request automatic version increments", () => {
  // Real model change tracking only, without a Mongo connection, query or save.
  const doc = Report.hydrate({ ...input(), _id: id(), status: "new", __v: 7, media: [] });
  doc.set("assignedTo", id());
  doc.assignedToName = "Synthetic";
  doc.status = "in-progress";
  assert.equal(doc.getChanges().$inc?.__v, undefined);
  doc.status = "resolved";
  assert.equal(doc.getChanges().$inc?.__v, undefined);
  assert.equal(doc.__v, 7);
});

test("report migration upgrades 0000-0004 without inventing versions and replays", async (t) => {
  const connection = await openTestDatabase(t);
  const folder = await mkdtemp(join(tmpdir(), "ray-report-upgrade-"));
  t.after(async () => {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep + "ray-report-upgrade-"));
    await rm(folder, { recursive: true, force: true });
  });
  const root = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
  const journal = JSON.parse(await readFile(join(root, "meta/_journal.json"), "utf8"));
  const entries = journal.entries.filter((entry) => entry.idx <= 4);
  assert.equal(entries.length, 5);
  await mkdir(join(folder, "meta"));
  await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) await copyFile(join(root, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  await migrate(connection.db, { migrationsFolder: folder });
  const before = [];
  for (const snapshot of [null, "", "Historical snapshot"]) {
    before.push((await connection.pool.query(`INSERT INTO reports
      (public_id,description,type,location,created_by_name,assigned_to_name,media,created_at,updated_at)
      VALUES ($1,'  Existing  ','general',ST_SetSRID(ST_MakePoint(34.7,32.1),4326),$2,$2,$3,'2019-01-01Z','2019-01-01Z') RETURNING *`,
    [id(), snapshot, ["second", "first"]])).rows[0]);
  }
  await applyLocalMigrations(connection, "test", connection.url);
  const verify = async () => {
    const rows = (await connection.pool.query("SELECT * FROM reports ORDER BY public_id")).rows;
    const mapped = await createPostgresReportStore(connection.db).listAll();
    for (const old of before) {
      const { legacy_version, legacy_version_present, ...rest } = rows.find((row) => row.id === old.id);
      assert.deepEqual(rest, old);
      assert.equal(legacy_version, null);
      assert.equal(legacy_version_present, false);
      const response = json(serializeReport(mapped.find((row) => row.publicId === old.public_id)));
      assert.equal(Object.hasOwn(response, "__v"), false);
      assert.equal(response.createdByName, old.created_by_name);
      assert.equal(response.assignedToName, old.assigned_to_name);
      assert.deepEqual(response.media, old.media);
    }
    return rows;
  };
  const rows = await verify();
  const migrations = (await connection.pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows;
  await applyLocalMigrations(connection, "test", connection.url);
  assert.deepEqual(await verify(), rows);
  assert.deepEqual((await connection.pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows, migrations);
});

test("real ReportStore, report HTTP and combined four-domain PostgreSQL flow", async (t) => {
  const connection = await openTestDatabase(t);
  await applyLocalMigrations(connection, "test", connection.url);
  const { db, pool } = connection;
  const stores = allStores(db), store = stores.reports;
  const request = await app(t, stores);
  const row = async (publicId) => (await db.select().from(reports).where(eq(reports.publicId, publicId)))[0];
  const userRow = async (publicId) => (await db.select().from(users).where(eq(users.publicId, publicId)))[0];
  const reportFromList = async (publicId) => (await store.listAll()).find((report) => report.publicId === publicId);
  const size = async () => (await pool.query("SELECT count(*) AS n FROM reports")).rows[0].n;
  let a, b, smokeStation, smokeLog, smokeReport;

  await t.test("combined real HTTP: auth -> station -> feeding/history -> report -> other-user claim -> resolve -> statistics", async () => {
    const actors = [];
    for (const firstName of ["Creator", "Assignee"]) {
      const credentials = { firstName, lastName: "Synthetic", email: `${id()}@example.invalid`, password: "synthetic-report-password" };
      const registration = await request("POST", "/api/auth/register", credentials);
      assert.equal(registration.status, 201);
      const login = await request("POST", "/api/auth/login", credentials);
      assert.equal(login.status, 200);
      assert.deepEqual(login.body.user, registration.body.user);
      actors.push({ id: login.body.user.id, bearer: `Bearer ${login.body.token}`, name: `${firstName} Synthetic` });
    }
    [a, b] = actors;
    const global = () => request("GET", `${base}/stats`, undefined, a.bearer);
    const personal = (actor) => request("GET", `${base}/stats/me`, undefined, actor.bearer);
    assert.deepEqual(await global(), { status: 200, body: { total: 0, resolved: 0, inProgress: 0, new: 0 } });
    assert.deepEqual(await personal(b), { status: 200, body: { total: 0, resolved: 0, inProgress: 0 } });
    const station = await request("POST", "/api/feeding-stations", { name: "Combined", location }, a.bearer);
    assert.equal(station.status, 201);
    smokeStation = station.body;
    const log = await request("POST", `/api/feeding-stations/${smokeStation._id}/feedings`, { food: false, water: true }, b.bearer);
    assert.equal(log.status, 201);
    smokeLog = log.body;
    assert.equal(smokeLog.userId, b.id);
    assert.deepEqual(await request("GET", `/api/feeding-stations/${smokeStation._id}/feedings`), { status: 200, body: [smokeLog] });
    const created = await request("POST", base, { ...input(), media: ["second", "first", "second"], createdBy: b.id, createdByName: "Forged", assignedTo: b.id, assignedToName: "Forged", status: "resolved", __v: 99 }, a.bearer);
    assert.equal(created.status, 201);
    smokeReport = created.body;
    assert.deepEqual(Object.keys(smokeReport).sort(), [...keys].sort());
    assert.deepEqual(smokeReport.createdBy, { _id: a.id, firstName: "Creator", lastName: "Synthetic" });
    assert.equal(smokeReport.createdByName, a.name);
    assert.equal(smokeReport.assignedTo, null);
    assert.equal(smokeReport.assignedToName, null);
    assert.equal(smokeReport.status, "new");
    assert.equal(smokeReport.__v, 0);
    assert.equal(smokeReport.description, input().description);
    assert.deepEqual(smokeReport.media, ["second", "first", "second"]);
    assert.deepEqual(smokeReport.location, location);
    assert.deepEqual(await request("GET", base), { status: 200, body: [smokeReport] });
    assert.deepEqual(await request("GET", `${base}/me`, undefined, a.bearer), { status: 200, body: [] });
    assert.deepEqual((await global()).body, { total: 1, resolved: 0, inProgress: 0, new: 1 });
    const claimed = await request("PATCH", `${base}/${smokeReport._id.toUpperCase()}/claim`, { assignedTo: a.id, assignedToName: "Forged" }, b.bearer);
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.status, "in-progress");
    assert.deepEqual(claimed.body.assignedTo, { _id: b.id, firstName: "Assignee", lastName: "Synthetic" });
    assert.equal(claimed.body.assignedToName, b.name);
    assert.deepEqual((await global()).body, { total: 1, resolved: 0, inProgress: 1, new: 0 });
    assert.deepEqual((await personal(b)).body, { total: 1, resolved: 0, inProgress: 1 });
    assert.deepEqual((await personal(a)).body, { total: 0, resolved: 0, inProgress: 0 });
    assert.deepEqual(await request("GET", `${base}/me`, undefined, b.bearer), { status: 200, body: [claimed.body] });
    const before = await row(smokeReport._id);
    assert.deepEqual(await request("PATCH", `${base}/${smokeReport._id}/claim`, {}, b.bearer), conflict);
    assert.deepEqual(await request("PATCH", `${base}/${smokeReport._id}/resolve`, {}, a.bearer), forbidden);
    assert.deepEqual(await row(smokeReport._id), before);
    const resolved = await request("PATCH", `${base}/${smokeReport._id.toUpperCase()}/resolve`, {}, b.bearer);
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.status, "resolved");
    assert.equal(resolved.body.__v, 0);
    assert.deepEqual((await global()).body, { total: 1, resolved: 1, inProgress: 0, new: 0 });
    assert.deepEqual((await personal(b)).body, { total: 1, resolved: 1, inProgress: 0 });
    const repeated = await request("PATCH", `${base}/${smokeReport._id}/resolve`, {}, b.bearer);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.__v, 0);
    smokeReport = repeated.body;
    assert.deepEqual(await request("PATCH", `${base}/${smokeReport._id}/claim`, {}, a.bearer), conflict);
    for (const field of ["createdAt", "updatedAt"]) assert.match(smokeReport[field], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });

  await t.test("fresh pool/app reads all four domains and authenticates the existing assignee", async (t) => {
    const fresh = createPostgres(localConfig("test", connection.url));
    try {
      await assertDatabaseIdentity(fresh.pool, "test");
      const send = await app(t, allStores(fresh.db));
      assert.deepEqual(await send("GET", `/api/feeding-stations/${smokeStation._id}`), { status: 200, body: smokeStation });
      assert.deepEqual(await send("GET", `/api/feeding-stations/${smokeStation._id}/feedings`), { status: 200, body: [smokeLog] });
      assert.deepEqual(await send("GET", `${base}/me`, undefined, b.bearer), { status: 200, body: [smokeReport] });
      assert.deepEqual((await send("GET", `${base}/stats/me`, undefined, b.bearer)).body, { total: 1, resolved: 1, inProgress: 0 });
    } finally { await fresh.close(); }
  });

  await t.test("guest and invalid optional tokens create guests; validation and required-auth failures insert nothing", async () => {
    for (const token of [undefined, "Bearer invalid"]) {
      const created = await request("POST", base, { ...input(), createdBy: a.id, createdByName: "Forged", status: "resolved", assignedTo: b.id }, token);
      assert.equal(created.status, 201);
      assert.equal(created.body.createdBy, null);
      assert.equal(created.body.createdByName, "Guest");
      assert.equal(created.body.assignedTo, null);
      assert.equal(created.body.status, "new");
      assert.deepEqual(created.body.media, []);
      assert.equal(created.body.__v, 0);
    }
    const before = await size();
    for (const changes of [{ description: " " }, { type: "unknown" }, { media: [null] }, { location: { lat: "bad", lng: 1 } }]) {
      const result = await request("POST", base, { ...input(), ...changes }, a.bearer);
      assert.equal(result.status, 400);
      assert.equal(result.body.message, "Validation failed");
      assert.ok(result.body.errors.length);
    }
    for (const token of [undefined, "Bearer invalid"]) {
      for (const [method, path] of [["GET", "/me"], ["GET", "/stats"], ["GET", "/stats/me"], ["PATCH", `/${smokeReport._id}/claim`], ["PATCH", `/${smokeReport._id}/resolve`]]) {
        assert.equal((await request(method, base + path, method === "PATCH" ? {} : undefined, token)).status, 401);
      }
    }
    assert.equal(await size(), before);
  });

  await t.test("adapter defaults, trusted fields, parameterized text, Dates, UUID FKs and spatial precision", async () => {
    const reportTime = await observeDatabaseTime(db, () => store.create(input({ createdBy: a.id.toUpperCase(), createdByName: "", description: "  quote '); DROP TABLE users; --  ", media: ["b", "a", "b"], status: "resolved", assignedTo: b.id, legacyVersion: 99 })));
    const report = reportTime.value;
    assert.match(report.publicId, /^[0-9a-f]{24}$/);
    assert.equal(report.status, "new");
    assert.equal(report.assignedTo, null);
    assert.equal(report.createdBy.publicId, a.id);
    assert.equal(report.createdByName, "");
    assert.equal(report.legacyVersion, 0);
    assert.deepEqual(report.media, ["b", "a", "b"]);
    assert.equal(report.description, "  quote '); DROP TABLE users; --  ");
    assert.deepEqual(report.location, location);
    for (const field of ["createdAt", "updatedAt"]) assertDatabaseTimestamp(report[field], reportTime, "report " + field);
    assert.deepEqual(report.updatedAt, report.createdAt);
    const stored = await row(report.publicId);
    const response = (await request("GET", base)).body.find((r) => r._id === report.publicId);
    for (const field of ["createdAt", "updatedAt"]) {
      assert.deepEqual(report[field], stored[field]);
      assertPersistedTimestamp(response[field], stored[field], field);
    }
    assert.notEqual(stored.id, report.publicId);
    assert.equal(stored.createdBy, (await userRow(a.id)).id);
    assert.deepEqual((await pool.query("SELECT ST_X(location) AS lng, ST_Y(location) AS lat, ST_SRID(location) AS srid FROM reports WHERE id=$1", [stored.id])).rows[0], { ...location, srid: 4326 });
    assert.deepEqual(await reportFromList(report.publicId), report);
    assert.deepEqual(Object.keys(json(serializeReport(report))).sort(), [...keys].sort());
    assert.deepEqual(Object.keys(report.createdBy).sort(), ["firstName", "lastName", "publicId"]);
  });

  for (const legacyName of [undefined, null, "", "Legacy display", " "]) {
    await t.test(`creator/assignee legacy name ${JSON.stringify(legacyName)} and snapshot precedence`, async () => {
      const profile = await stores.users.create({ ...userInput(), firstName: " First ", lastName: " Last " });
      await db.update(users).set({ legacyName: legacyName ?? null, legacyNamePresent: legacyName !== undefined }).where(eq(users.publicId, profile.publicId));
      for (const snapshot of [null, "", "Stored snapshot"]) {
        const report = await store.create(input({ createdBy: profile.publicId, createdByName: snapshot }));
        const fallback = legacyName || " First   Last ";
        const response = json(serializeReport(report));
        assert.equal(response.createdByName, snapshot ?? fallback);
        assert.equal(Object.hasOwn(response.createdBy, "name"), legacyName !== undefined);
        assert.equal(response.createdBy.name, legacyName);
        const claimed = await store.claim(report.publicId, { publicId: profile.publicId, name: snapshot });
        assert.equal(claimed.kind, "claimed");
        const result = json(serializeReport(claimed.report));
        assert.equal(result.assignedToName, snapshot ?? fallback);
        assert.equal(result.assignedTo.name, legacyName);
        assert.deepEqual(Object.keys(result.assignedTo).sort(), ["_id", "firstName", "lastName", ...(legacyName !== undefined ? ["name"] : [])].sort());
      }
    });
  }

  await t.test("claim supplied-name then existing-snapshot then null, preserving empty strings", async () => {
    for (const [supplied, previous, expected] of [["Supplied", "Old", "Supplied"], ["", "Old", ""], [null, "Old", "Old"], [null, "", ""], [null, null, null]]) {
      const report = await store.create(input());
      await db.update(reports).set({ assignedToName: previous }).where(eq(reports.publicId, report.publicId));
      const claimed = await store.claim(report.publicId, { publicId: b.id.toUpperCase(), name: supplied });
      assert.equal(claimed.kind, "claimed");
      assert.equal(claimed.report.assignedToName, expected);
      assert.equal(claimed.report.assignedTo.publicId, b.id);
    }
  });

  for (const version of [undefined, null, 0, 7, 1.5]) {
    await t.test(`version ${JSON.stringify(version)} survives claim, resolve and refusal without increments`, async () => {
      const report = await store.create(input());
      await db.update(reports).set({ legacyVersion: version ?? null, legacyVersionPresent: version !== undefined }).where(eq(reports.publicId, report.publicId));
      const claim = await request("PATCH", `${base}/${report.publicId}/claim`, {}, b.bearer);
      assert.equal(claim.status, 200);
      const resolved = await request("PATCH", `${base}/${report.publicId}/resolve`, {}, b.bearer);
      assert.equal(resolved.status, 200);
      for (const value of [claim.body, resolved.body]) {
        assert.equal(Object.hasOwn(value, "__v"), version !== undefined);
        assert.equal(value.__v, version);
      }
      const before = await row(report.publicId);
      assert.deepEqual(await request("PATCH", `${base}/${report.publicId}/claim`, {}, b.bearer), conflict);
      assert.deepEqual(await request("PATCH", `${base}/${report.publicId}/resolve`, {}, a.bearer), forbidden);
      assert.deepEqual(await row(report.publicId), before);
    });
  }

  await t.test("list ordering and personal queries filter assignee, never creator; aggregate results match rows", async () => {
    const creatorOnly = await store.create(input({ createdBy: a.id, createdByName: a.name }));
    const newer = await store.create(input());
    await db.update(reports).set({ createdAt: new Date("2090-01-01Z") }).where(eq(reports.publicId, creatorOnly.publicId));
    await db.update(reports).set({ createdAt: new Date("2091-01-01Z") }).where(eq(reports.publicId, newer.publicId));
    await store.claim(newer.publicId, { publicId: a.id, name: a.name });
    assert.deepEqual((await store.listAll()).slice(0, 2).map((r) => r.publicId), [newer.publicId, creatorOnly.publicId]);
    const mine = await store.listAssignedTo(a.id.toUpperCase());
    assert.equal(mine[0].publicId, newer.publicId);
    assert.equal(mine.some((r) => r.publicId === creatorOnly.publicId), false);
    assert.ok(mine.every((r) => r.assignedTo.publicId === a.id));
    const all = await db.select().from(reports);
    const expected = (rows) => ({ total: rows.length, resolved: rows.filter((r) => r.status === "resolved").length, inProgress: rows.filter((r) => r.status === "in-progress").length });
    assert.deepEqual(await store.getGlobalStats(), { ...expected(all), new: all.filter((r) => r.status === "new").length });
    const actorUuid = (await userRow(a.id)).id;
    assert.deepEqual(await store.getAssignedStats(a.id.toUpperCase()), expected(all.filter((r) => r.assignedTo === actorUuid)));
    assert.deepEqual(await store.getAssignedStats(id()), { total: 0, resolved: 0, inProgress: 0 });
    assert.deepEqual(await store.listAssignedTo(id()), []);
  });

  await t.test("count conversion preserves exact bigint boundaries and rejects unsafe JSON numbers", async () => {
    const { rows } = await pool.query(`SELECT 0::bigint AS zero, 9007199254740991::bigint AS safe,
      9007199254740992::bigint AS unsafe, 9223372036854775807::bigint AS maximum, (-1)::bigint AS negative`);
    assert.equal(typeof rows[0].safe, "string");
    assert.equal(reportCount(rows[0].zero), 0);
    assert.equal(reportCount(rows[0].safe), Number.MAX_SAFE_INTEGER);
    for (const value of [rows[0].unsafe, rows[0].maximum, rows[0].negative, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => reportCount(value), /Unsafe report count/);
    for (const value of Object.values(await store.getGlobalStats())) assert.equal(Number.isSafeInteger(value), true);
  });

  await t.test("valid missing IDs differ from malformed report IDs; denied operations preserve every stored field", async () => {
    for (const action of ["claim", "resolve"]) {
      assert.deepEqual(await request("PATCH", `${base}/${id()}/${action}`, {}, a.bearer), { status: 404, body: { error: "Report not found" } });
      for (const malformed of ["bad", "g".repeat(24), "a".repeat(25)]) {
        assert.deepEqual(await request("PATCH", `${base}/${malformed}/${action}`, {}, a.bearer), { status: 500, body: { error: `Failed to ${action} report` } });
      }
    }
    const report = await store.create(input({ assignedToName: a.name }));
    const before = await row(report.publicId);
    assert.deepEqual(await request("PATCH", `${base}/${report.publicId}/resolve`, {}, a.bearer), forbidden);
    assert.deepEqual(await row(report.publicId), before);
    assert.deepEqual(await store.resolve(report.publicId, id()), { kind: "not-assignee" });
    assert.deepEqual(await row(report.publicId), before);
    assert.deepEqual(await store.claim(id(), { publicId: a.id, name: null }), { kind: "not-found" });
    assert.deepEqual(await store.resolve(id(), a.id), { kind: "not-found" });
    // No new status prerequisite: an assigned historical 'new' row can resolve.
    await db.update(reports).set({ assignedTo: (await userRow(a.id)).id }).where(eq(reports.publicId, report.publicId));
    const result = await store.resolve(report.publicId.toUpperCase(), a.id.toUpperCase());
    assert.equal(result.kind, "resolved");
    assert.equal(result.report.status, "resolved");
    assert.equal((await store.resolve(report.publicId, a.id)).kind, "resolved");
  });

  await t.test("HTTP optional auth uses legacy creator name and required claim keeps its existing snapshot behavior", async () => {
    await db.update(users).set({ legacyName: "Legacy creator", legacyNamePresent: true }).where(eq(users.publicId, a.id));
    await db.update(users).set({ legacyName: "Legacy assignee", legacyNamePresent: true }).where(eq(users.publicId, b.id));
    try {
      const created = await request("POST", base, input(), a.bearer);
      assert.equal(created.status, 201);
      assert.equal(created.body.createdBy.name, "Legacy creator");
      assert.equal(created.body.createdByName, "Legacy creator");
      const claimed = await request("PATCH", `${base}/${created.body._id}/claim`, {}, b.bearer);
      assert.equal(claimed.status, 200);
      assert.equal(claimed.body.assignedTo.name, "Legacy assignee");
      assert.equal(claimed.body.assignedToName, b.name); // required auth has first/last, not legacy name
    } finally {
      for (const actor of [a, b]) await db.update(users).set({ legacyName: null, legacyNamePresent: false }).where(eq(users.publicId, actor.id));
    }
  });

  await t.test("synthetic creator/assignee deletion SET NULL keeps reports and stored snapshots", async () => {
    const creator = await stores.users.create(userInput()), assignee = await stores.users.create(userInput());
    const report = await store.create(input({ createdBy: creator.publicId, createdByName: "Retained creator" }));
    await store.claim(report.publicId, { publicId: assignee.publicId, name: "" });
    await db.delete(users).where(eq(users.publicId, creator.publicId));
    let current = await reportFromList(report.publicId);
    assert.equal(current.createdBy, null);
    assert.equal(current.createdByName, "Retained creator");
    assert.equal(current.assignedTo.publicId, assignee.publicId);
    await db.delete(users).where(eq(users.publicId, assignee.publicId));
    current = await reportFromList(report.publicId);
    assert.equal(current.assignedTo, null);
    assert.equal(current.assignedToName, "");
    assert.equal(current.status, "in-progress");
    assert.equal(current.legacyVersion, 0);
    const response = (await request("GET", base)).body.find((r) => r._id === report.publicId);
    assert.equal(response.createdBy, null);
    assert.equal(response.assignedTo, null);
    assert.equal(response.createdByName, "Retained creator");
    assert.equal(response.assignedToName, "");
    assert.deepEqual(await store.resolve(report.publicId, a.id), { kind: "not-assignee" });
  });

  await t.test("missing referenced users and real constraint failures never become guests, success, or not-found", async () => {
    const before = await size();
    await assert.rejects(store.create(input({ createdBy: id() })), safeError);
    assert.equal(await size(), before);
    const report = await store.create(input());
    const original = await row(report.publicId);
    await assert.rejects(store.claim(report.publicId, { publicId: id(), name: "Unknown" }), safeError);
    assert.deepEqual(await row(report.publicId), original);
    for (const extra of [{ type: "unsupported" }, { location: { lat: 91, lng: 0 } }, { description: null }]) await assert.rejects(store.create(input(extra)), safeError);
    await assert.rejects(db.insert(reports).values({ ...original, id: randomUUID() }), codeIs("23505"));
    for (const extra of [{ createdBy: randomUUID() }, { assignedTo: randomUUID() }]) await assert.rejects(db.insert(reports).values({ ...original, id: randomUUID(), publicId: id(), ...extra }), codeIs("23503"));
    assert.equal(await size(), (BigInt(before) + 1n).toString());
  });

  await t.test("explicit report projections work without user credential, email or company columns", async () => {
    const rollback = new Error("Synthetic projection verification rollback");
    await assert.rejects(db.transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE users RENAME COLUMN password_hash TO hidden_test_hash`);
      await tx.execute(sql`ALTER TABLE users RENAME COLUMN email TO hidden_test_email`);
      await tx.execute(sql`ALTER TABLE users RENAME COLUMN company TO hidden_test_company`);
      const scoped = createPostgresReportStore(tx);
      const report = await scoped.create(input({ createdBy: a.id, createdByName: a.name }));
      const claim = await scoped.claim(report.publicId, { publicId: b.id, name: b.name });
      assert.deepEqual(Object.keys(claim.report.createdBy).sort(), ["firstName", "lastName", "publicId"]);
      assert.deepEqual(Object.keys(claim.report.assignedTo).sort(), ["firstName", "lastName", "publicId"]);
      assert.equal((await scoped.resolve(report.publicId, b.id)).kind, "resolved");
      assert.ok((await scoped.listAll()).some((r) => r.publicId === report.publicId));
      assert.ok((await scoped.listAssignedTo(b.id)).some((r) => r.publicId === report.publicId));
      assert.ok((await scoped.getGlobalStats()).total > 0);
      assert.ok((await scoped.getAssignedStats(b.id)).total > 0);
      throw rollback;
    }), (error) => error === rollback);
  });

  await t.test("actual query failures preserve all operation-specific HTTP errors without SQL/log leakage", async (t) => {
    const messages = [];
    t.mock.method(console, "error", (...args) => messages.push(args));
    const before = await size();
    await pool.query("ALTER TABLE reports RENAME COLUMN status TO hidden_test_status");
    try {
      for (const operation of [() => store.create(input()), () => store.listAll(), () => store.listAssignedTo(a.id),
        () => store.claim(smokeReport._id, { publicId: a.id, name: "Synthetic parameter" }), () => store.resolve(smokeReport._id, b.id),
        () => store.getGlobalStats(), () => store.getAssignedStats(a.id)]) await assert.rejects(operation(), safeError);
      for (const [method, path, error] of [["GET", "", "Failed to fetch reports"], ["GET", "/me", "Failed to fetch your reports"],
        ["GET", "/stats", "Failed to fetch global stats"], ["GET", "/stats/me", "Failed to fetch your stats"],
        ["PATCH", `/${smokeReport._id}/claim`, "Failed to claim report"], ["PATCH", `/${smokeReport._id}/resolve`, "Failed to resolve report"]]) {
        assert.deepEqual(await request(method, base + path, method === "PATCH" ? {} : undefined, b.bearer), { status: 500, body: { error } });
      }
      assert.deepEqual(await request("POST", base, input({ description: "synthetic SQL parameter must not leak" }), a.bearer), { status: 500, body: safeFailure });
    } finally { await pool.query("ALTER TABLE reports RENAME COLUMN hidden_test_status TO status"); }
    assert.equal(await size(), before);
    assert.deepEqual(messages, []);
  });

  const actor = async (t, label) => {
    const name = `ray-report-${label}-${id()}`;
    const extra = createPostgres({ ...localConfig("test", connection.url), max: 1, application_name: name });
    const releases = new Set();
    t.after(async () => { for (const release of releases) release(); await extra.close(); });
    await assertDatabaseIdentity(extra.pool, "test");
    return { ...extra, name, releases };
  };
  const ownClient = async (actor) => {
    const client = await actor.pool.connect();
    let released = false;
    const release = () => { if (!released) { released = true; actor.releases.delete(release); client.release(true); } };
    actor.releases.add(release);
    try { return { client, release, pid: (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid }; }
    catch (error) { release(); throw error; }
  };
  const waitForBlock = async (name, blockers) => {
    const deadline = Date.now() + 8000;
    do {
      const { rows } = await pool.query(`SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE application_name=$1 AND wait_event_type='Lock' AND position('for update' in lower(query))>0`, [name]);
      if (rows.length === 1 && rows[0].blockers.some((pid) => blockers.includes(pid))) return rows[0].pid;
      await delay(15);
    } while (Date.now() < deadline);
    throw new Error("Expected report row-lock wait was not observed");
  };
  const track = (pending, promise) => { pending.push(promise); promise.catch(() => {}); return promise; };

  await t.test("two real HTTP claimants wait on the same row: one winner, one conflict, unrelated report proceeds", async (t) => {
    const report = await store.create(input()), unrelated = await store.create(input());
    const gateActor = await actor(t, "claim-gate"), first = await actor(t, "claim-A"), second = await actor(t, "claim-B");
    const sendA = await app(t, allStores(first.db)), sendB = await app(t, allStores(second.db));
    const gate = await ownClient(gateActor), pending = [];
    try {
      await gate.client.query("BEGIN");
      await gate.client.query("SELECT id FROM reports WHERE public_id=$1 FOR UPDATE", [report.publicId]);
      const claimA = track(pending, sendA("PATCH", `${base}/${report.publicId}/claim`, {}, a.bearer));
      const firstPid = await waitForBlock(first.name, [gate.pid]);
      const claimB = track(pending, sendB("PATCH", `${base}/${report.publicId}/claim`, {}, b.bearer));
      const secondPid = await waitForBlock(second.name, [gate.pid, firstPid]);
      assert.notEqual(firstPid, secondPid);
      assert.equal((await request("PATCH", `${base}/${unrelated.publicId}/claim`, {}, b.bearer)).status, 200);
      await gate.client.query("COMMIT");
      const results = await Promise.all([claimA, claimB]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
      const winnerIndex = results.findIndex((r) => r.status === 200);
      const winner = [a, b][winnerIndex], loser = [a, b][1 - winnerIndex];
      assert.deepEqual(results[1 - winnerIndex], conflict);
      assert.equal(results[winnerIndex].body.assignedTo._id, winner.id);
      assert.equal((await row(report.publicId)).assignedTo, (await userRow(winner.id)).id);
      const before = await row(report.publicId);
      assert.deepEqual(await request("PATCH", `${base}/${report.publicId}/resolve`, {}, loser.bearer), forbidden);
      assert.deepEqual(await request("PATCH", `${base}/${report.publicId}/claim`, {}, winner.bearer), conflict);
      assert.deepEqual(await row(report.publicId), before);
      assert.equal((await request("PATCH", `${base}/${report.publicId}/resolve`, {}, winner.bearer)).status, 200);
      t.diagnostic("claim race: two distinct PostgreSQL PIDs observed waiting on the same report's FOR UPDATE lock chain; unrelated claim completed before release; after release exactly one 200/one 400, stored assignee matched winner, loser resolve was 403 without mutation.");
    } finally {
      try { await gate.client.query("ROLLBACK"); }
      finally { gate.release(); await Promise.allSettled(pending); }
    }
  });

  await t.test("resolve rechecks actual assignee after a concurrent stored-reference change", async (t) => {
    const report = await store.create(input());
    await store.claim(report.publicId, { publicId: a.id, name: a.name });
    const writer = await actor(t, "reference-writer"), resolver = await actor(t, "waiting-resolver");
    const send = await app(t, allStores(resolver.db));
    const gate = await ownClient(writer), pending = [];
    try {
      await gate.client.query("BEGIN");
      // Direct disposable-data fixture; no reassignment endpoint is introduced.
      await gate.client.query("UPDATE reports SET assigned_to=$1 WHERE public_id=$2", [(await userRow(b.id)).id, report.publicId]);
      const resolution = track(pending, send("PATCH", `${base}/${report.publicId}/resolve`, {}, a.bearer));
      await waitForBlock(resolver.name, [gate.pid]);
      await gate.client.query("COMMIT");
      const before = await row(report.publicId);
      assert.deepEqual(await resolution, forbidden);
      assert.deepEqual(await row(report.publicId), before);
      assert.equal(before.status, "in-progress");
      assert.equal(before.assignedToName, a.name); // stale display name cannot authorize A
      assert.equal((await request("PATCH", `${base}/${report.publicId}/resolve`, {}, b.bearer)).status, 200);
      t.diagnostic("resolve race: A's FOR UPDATE waited on a stored-assignee change to B; after commit A received 403 despite its retained display name, with row unchanged; B resolved successfully.");
    } finally {
      try { await gate.client.query("ROLLBACK"); }
      finally { gate.release(); await Promise.allSettled(pending); }
    }
  });

  await t.test("post-update projection failure rolls back claim/resolve and releases locks on a second connection", async (t) => {
    const unclaimed = await store.create(input()), assigned = await store.create(input());
    await store.claim(assigned.publicId, { publicId: b.id, name: b.name });
    const before = [await row(unclaimed.publicId), await row(assigned.publicId)];
    const failing = await actor(t, "failed-update"), next = await actor(t, "after-rollback");
    const send = await app(t, allStores(failing.db));
    // Lock/update projections do not use description; the post-update joined read
    // does. This forces failure after the write and exercises transaction rollback.
    await pool.query("ALTER TABLE reports RENAME COLUMN description TO hidden_test_description");
    try {
      assert.deepEqual(await send("PATCH", `${base}/${unclaimed.publicId}/claim`, {}, a.bearer), { status: 500, body: { error: "Failed to claim report" } });
      assert.deepEqual(await send("PATCH", `${base}/${assigned.publicId}/resolve`, {}, b.bearer), { status: 500, body: { error: "Failed to resolve report" } });
    } finally { await pool.query("ALTER TABLE reports RENAME COLUMN hidden_test_description TO description"); }
    assert.deepEqual([await row(unclaimed.publicId), await row(assigned.publicId)], before);
    const client = await ownClient(next);
    try {
      await client.client.query("BEGIN");
      for (const report of [unclaimed, assigned]) await client.client.query("SELECT id FROM reports WHERE public_id=$1 FOR UPDATE NOWAIT", [report.publicId]);
      await client.client.query("ROLLBACK");
    } finally { try { await client.client.query("ROLLBACK"); } finally { client.release(); } }
    t.diagnostic("rollback: real SQL failure in response projection after claim/resolve UPDATE restored every original column, including timestamps/version; an independent session acquired both report rows FOR UPDATE NOWAIT.");
  });
});
