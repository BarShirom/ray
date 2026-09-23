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
import { users, feedingStations, feedingLogs } from "../../dist/db/schema.js";
import { createPostgres } from "../../dist/db/connection.js";
import { localConfig, assertDatabaseIdentity } from "../../dist/db/local-config.js";
import { applyLocalMigrations } from "../../dist/db/migrate.js";
import { createPostgresUserStore } from "../../dist/users/postgresUserStore.js";
import { createPostgresFeedingStationStore } from "../../dist/feedingStations/postgresFeedingStationStore.js";
import { createPostgresFeedingLogStore } from "../../dist/feedingLogs/postgresFeedingLogStore.js";
import { FeedingStationMissingError, FeedingStationInactiveError } from "../../dist/feedingLogs/feedingPersistenceErrors.js";
import { serializeFeedingStation } from "../../dist/serializers/feedingStationResponse.js";
import { serializeFeedingLog } from "../../dist/serializers/feedingLogResponse.js";
import { openTestDatabase } from "./database.mjs";
import { startPostgresAuthApp } from "./authApp.mjs";

const publicId = () => randomBytes(12).toString("hex");
const location = { lat: 32.085312345, lng: 34.781812345 };
const stationInput = (createdBy, extra = {}) => ({ name: "  Synthetic station  ", location, createdBy, ...extra });
const base = "/api/feeding-stations";
const safeFailure = { error: "PersistenceError", message: "Feeding persistence operation failed" };
const codeIs = (code) => (error) => { assert.equal(error.cause?.code ?? error.code, code); return true; };
const isSafeFailure = (error) => {
  assert.equal(error.name, safeFailure.error);
  assert.equal(error.message, safeFailure.message);
  assert.equal(error.cause, undefined);
  assert.deepEqual(Object.keys(error), ["name"]);
  return true;
};
const storesFor = (db) => ({ stations: createPostgresFeedingStationStore(db), logs: createPostgresFeedingLogStore(db) });
const json = (value) => JSON.parse(JSON.stringify(value));
const stationKeys = ["_id", "name", "location", "estimatedCats", "estimatedKittens", "createdBy", "active", "createdAt", "updatedAt", "__v"];
const logKeys = ["_id", "stationId", "userId", "fedAt", "food", "water", "createdAt", "updatedAt", "__v"];
const keysAre = (row, keys) => assert.deepEqual(Object.keys(row).sort(), [...keys].sort());
const iso = (value) => { assert.match(value, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/); assert.ok(Number.isFinite(Date.parse(value))); };

// These traps cover every parent/subtest, including the complete HTTP composition.
test.beforeEach((t) => {
  const unexpected = () => { throw new Error("Unexpected MongoDB access in PostgreSQL feeding test"); };
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose, "createConnection", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  t.mock.method(mongoose.Model.prototype, "save", unexpected);
});

test("feeding compatibility migration upgrades 0000-0003 synthetic rows and replays", async (t) => {
  const connection = await openTestDatabase(t);
  const folder = await mkdtemp(join(tmpdir(), "ray-feeding-upgrade-"));
  t.after(async () => {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep + "ray-feeding-upgrade-"));
    await rm(folder, { recursive: true, force: true });
  });
  const root = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
  const journal = JSON.parse(await readFile(join(root, "meta/_journal.json"), "utf8"));
  const entries = journal.entries.filter((entry) => entry.idx <= 3);
  assert.equal(entries.length, 4);
  await mkdir(join(folder, "meta"));
  await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) await copyFile(join(root, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  await migrate(connection.db, { migrationsFolder: folder });
  const { pool } = connection;
  const user = (await pool.query(`INSERT INTO users (public_id,first_name,last_name,email,password_hash)
    VALUES ($1,'Synthetic','Upgrade',$2,'synthetic-hash') RETURNING id`, [publicId(), `${publicId()}@example.invalid`])).rows[0];
  const before = [];
  for (const [text, period] of [[null, null], ["", "morning"], [" preserved text ", "evening"]]) {
    const station = (await pool.query(`INSERT INTO feeding_stations
      (public_id,name,location,created_by,image,notes,created_at,updated_at)
      VALUES ($1,'Upgrade',ST_SetSRID(ST_MakePoint(34.7,32.1),4326),$2,$3,$3,'2019-01-01Z','2019-01-01Z') RETURNING *`,
    [publicId(), user.id, text])).rows[0];
    const log = (await pool.query(`INSERT INTO feeding_logs
      (public_id,station_id,user_id,period,note,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,'2019-01-01Z','2019-01-01Z') RETURNING *`,
    [publicId(), station.id, user.id, period, text])).rows[0];
    before.push({ station, log });
  }
  await applyLocalMigrations(connection, "test", connection.url);
  const check = async () => {
    for (const { station, log } of before) {
      const currentStation = (await pool.query("SELECT * FROM feeding_stations WHERE id=$1", [station.id])).rows[0];
      const currentLog = (await pool.query("SELECT * FROM feeding_logs WHERE id=$1", [log.id])).rows[0];
      const { image_present, notes_present, legacy_version: sv, legacy_version_present: sp, ...oldStation } = currentStation;
      const { period_present, note_present, legacy_version: lv, legacy_version_present: lp, ...oldLog } = currentLog;
      assert.deepEqual(oldStation, station);
      assert.deepEqual(oldLog, log);
      assert.deepEqual([image_present, notes_present, period_present, note_present], [true, true, true, true]);
      assert.deepEqual([sv, lv, sp, lp], [null, null, false, false]);
      const readStation = json(serializeFeedingStation(await storesFor(connection.db).stations.findByPublicId(station.public_id)));
      const [readLog] = (await storesFor(connection.db).logs.listForStation(station.public_id)).map(serializeFeedingLog).map(json);
      assert.equal(readStation.image, station.image);
      assert.equal(readStation.notes, station.notes);
      assert.equal(readLog.period, log.period);
      assert.equal(readLog.note, log.note);
      assert.equal(Object.hasOwn(readStation, "__v"), false);
      assert.equal(Object.hasOwn(readLog, "__v"), false);
    }
  };
  await check();
  const journalBefore = (await pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows;
  await applyLocalMigrations(connection, "test", connection.url);
  await check();
  assert.deepEqual((await pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows, journalBefore);
});

test("real PostgreSQL feeding adapters and complete production HTTP flow", async (t) => {
  const connection = await openTestDatabase(t);
  await applyLocalMigrations(connection, "test", connection.url);
  const { db, pool } = connection;
  const { stations, logs } = storesFor(db);
  const userStore = createPostgresUserStore(db);
  const user = await userStore.create({ firstName: "Synthetic", lastName: "Adapter", email: `${publicId()}@example.invalid`, passwordHash: "synthetic-existing-hash" });
  const request = await startPostgresAuthApp(t, userStore, { stations, logs });
  const counts = async () => (await pool.query(`SELECT
    (SELECT count(*)::integer FROM users) AS users,
    (SELECT count(*)::integer FROM feeding_stations) AS stations,
    (SELECT count(*)::integer FROM feeding_logs) AS logs`)).rows[0];
  const stationRow = async (id) => (await db.select().from(feedingStations).where(eq(feedingStations.publicId, id)))[0];
  const logRow = async (id) => (await db.select().from(feedingLogs).where(eq(feedingLogs.publicId, id)))[0];

  await t.test("adapters preserve observed Mongo defaults, whitelist, Dates, public IDs and actual spatial/FK values", async () => {
    const before = Date.now();
    const station = await stations.create(stationInput(user.publicId.toUpperCase(), {
      active: false, publicId: publicId(), legacyVersion: 99, imagePresent: true, notesPresent: true,
    }));
    assert.match(station.publicId, /^[0-9a-f]{24}$/);
    assert.equal(station.name, "Synthetic station");
    assert.deepEqual(station.location, location);
    assert.deepEqual([station.estimatedCats, station.estimatedKittens, station.active, station.legacyVersion], [0, 0, true, 0]);
    for (const key of ["image", "notes"]) assert.equal(Object.hasOwn(station, key), false);
    const log = await logs.create({ stationId: station.publicId.toUpperCase(), userId: user.publicId.toUpperCase(), legacyVersion: 99, notePresent: true });
    assert.match(log.publicId, /^[0-9a-f]{24}$/);
    assert.deepEqual([log.food, log.water, log.legacyVersion], [true, false, 0]);
    assert.equal(log.stationId, station.publicId);
    assert.equal(log.userId, user.publicId);
    for (const key of ["period", "note"]) assert.equal(Object.hasOwn(log, key), false);
    for (const date of [station.createdAt, station.updatedAt, log.fedAt, log.createdAt, log.updatedAt]) {
      assert.ok(date instanceof Date);
      assert.ok(date.getTime() >= before && date.getTime() <= Date.now());
    }
    assert.deepEqual(await stations.findByPublicId(station.publicId.toUpperCase()), station);
    assert.deepEqual(await logs.listForStation(station.publicId.toUpperCase()), [log]);
    const sr = await stationRow(station.publicId), lr = await logRow(log.publicId);
    const ur = (await db.select({ id: users.id }).from(users).where(eq(users.publicId, user.publicId)))[0];
    assert.notEqual(sr.id, station.publicId);
    assert.notEqual(lr.id, log.publicId);
    assert.deepEqual([sr.createdBy, lr.userId, lr.stationId], [ur.id, ur.id, sr.id]);
    assert.deepEqual([sr.imagePresent, sr.notesPresent, lr.periodPresent, lr.notePresent], [false, false, false, false]);
    const spatial = (await pool.query("SELECT ST_X(location) AS lng, ST_Y(location) AS lat, ST_SRID(location) AS srid FROM feeding_stations WHERE id=$1", [sr.id])).rows[0];
    assert.deepEqual(spatial, { ...location, srid: 4326 });
    keysAre(json(serializeFeedingStation(station)), stationKeys);
    keysAre(json(serializeFeedingLog(log)), logKeys);
  });

  await t.test("explicit values, parameterized text, trimming, empty strings and false flags survive", async () => {
    const hostile = "  quote '); DROP TABLE users; --  ";
    const station = await stations.create(stationInput(user.publicId, { name: hostile, estimatedCats: 3, estimatedKittens: 1, image: "", notes: hostile }));
    const date = new Date("2020-02-03T04:05:06.789Z");
    const log = await logs.create({ stationId: station.publicId, userId: user.publicId, fedAt: date, food: false, water: false, period: "noon", note: hostile });
    assert.equal(station.name, hostile.trim());
    assert.equal(station.notes, hostile);
    assert.equal(station.image, "");
    assert.deepEqual([station.estimatedCats, station.estimatedKittens], [3, 1]);
    assert.deepEqual([log.food, log.water, log.period, log.note, log.fedAt], [false, false, "noon", hostile.trim(), date]);
    const blank = await logs.create({ stationId: station.publicId, userId: user.publicId, note: "  " });
    assert.equal(blank.note, "");
    assert.deepEqual(await stations.findByPublicId(station.publicId), station);
    assert.ok((await logs.listForStation(station.publicId)).some((row) => row.publicId === log.publicId && row.note === hostile.trim()));
  });

  for (const value of [undefined, null, "", "Stored text"]) {
    await t.test(`historical station/log optional field presence ${JSON.stringify(value)} reaches unchanged HTTP serializers`, async () => {
      const station = await stations.create(stationInput(user.publicId));
      const log = await logs.create({ stationId: station.publicId, userId: user.publicId });
      await db.update(feedingStations).set({ image: value ?? null, notes: value ?? null, imagePresent: value !== undefined, notesPresent: value !== undefined }).where(eq(feedingStations.publicId, station.publicId));
      // SQL enum forbids empty/arbitrary period strings; test each allowed presence state.
      const period = value === "" ? "morning" : value === "Stored text" ? "evening" : value;
      await db.update(feedingLogs).set({ note: value ?? null, notePresent: value !== undefined, period: period ?? null, periodPresent: period !== undefined }).where(eq(feedingLogs.publicId, log.publicId));
      const detail = await request("GET", `${base}/${station.publicId}`);
      const history = await request("GET", `${base}/${station.publicId}/feedings`);
      assert.equal(detail.status, 200);
      assert.equal(history.status, 200);
      for (const key of ["image", "notes"]) {
        assert.equal(detail.body[key], value);
        assert.equal(Object.hasOwn(detail.body, key), value !== undefined);
      }
      for (const [key, expected] of [["note", value], ["period", period]]) {
        assert.equal(history.body[0][key], expected);
        assert.equal(Object.hasOwn(history.body[0], key), expected !== undefined);
      }
    });
  }

  for (const version of [undefined, null, 0, 7, 1.5]) {
    await t.test(`legacy version ${JSON.stringify(version)} round-trips without invented defaults`, async () => {
      const station = await stations.create(stationInput(user.publicId));
      const log = await logs.create({ stationId: station.publicId, userId: user.publicId });
      for (const [table, id] of [[feedingStations, station.publicId], [feedingLogs, log.publicId]]) {
        await db.update(table).set({ legacyVersion: version ?? null, legacyVersionPresent: version !== undefined }).where(eq(table.publicId, id));
      }
      const detail = await request("GET", `${base}/${station.publicId}`);
      const history = await request("GET", `${base}/${station.publicId}/feedings`);
      for (const row of [detail.body, history.body[0]]) {
        assert.equal(row.__v, version);
        assert.equal(Object.hasOwn(row, "__v"), version !== undefined);
        assert.equal(Object.hasOwn(row, "legacyVersion"), false);
        assert.equal(Object.hasOwn(row, "legacyVersionPresent"), false);
      }
    });
  }

  await t.test("active station ordering and station-specific fedAt/createdAt/id history ordering execute in SQL", async () => {
    const first = await stations.create(stationInput(user.publicId));
    const second = await stations.create(stationInput(user.publicId));
    const inactive = await stations.create(stationInput(user.publicId));
    await db.update(feedingStations).set({ createdAt: new Date("2090-01-01Z") }).where(eq(feedingStations.publicId, first.publicId));
    await db.update(feedingStations).set({ createdAt: new Date("2091-01-01Z") }).where(eq(feedingStations.publicId, second.publicId));
    await db.update(feedingStations).set({ active: false }).where(eq(feedingStations.publicId, inactive.publicId));
    const list = await stations.listActive();
    assert.deepEqual(list.slice(0, 2).map((row) => row.publicId), [second.publicId, first.publicId]);
    assert.equal(list.some((row) => row.publicId === inactive.publicId), false);
    assert.equal((await stations.findByPublicId(inactive.publicId)).active, false);
    const fixtures = [];
    for (const [fedAt, createdAt] of [["2020-01-01Z", "2022-01-01Z"], ["2021-01-01Z", "2022-01-01Z"], ["2021-01-01Z", "2023-01-01Z"], ["2021-01-01Z", "2023-01-01Z"]]) {
      const log = await logs.create({ stationId: first.publicId, userId: user.publicId, fedAt: new Date(fedAt) });
      await db.update(feedingLogs).set({ createdAt: new Date(createdAt) }).where(eq(feedingLogs.publicId, log.publicId));
      fixtures.push(await logRow(log.publicId));
    }
    await logs.create({ stationId: second.publicId, userId: user.publicId, fedAt: new Date("2099-01-01Z") });
    fixtures.sort((a, b) => b.fedAt - a.fedAt || b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
    assert.deepEqual((await logs.listForStation(first.publicId)).map((row) => row.publicId), fixtures.map((row) => row.publicId));
  });

  await t.test("missing rows/empty history are distinct from real failures; no missing users are invented", async () => {
    const station = await stations.create(stationInput(user.publicId));
    const before = await counts();
    assert.equal(await stations.findByPublicId(publicId()), null);
    assert.deepEqual(await logs.listForStation(station.publicId), []);
    await assert.rejects(logs.create({ stationId: publicId(), userId: user.publicId }), FeedingStationMissingError);
    await assert.rejects(stations.create(stationInput(publicId())), isSafeFailure);
    await assert.rejects(logs.create({ stationId: station.publicId, userId: publicId() }), isSafeFailure);
    assert.deepEqual(await counts(), before);
    await db.update(feedingStations).set({ active: false }).where(eq(feedingStations.publicId, station.publicId));
    await assert.rejects(logs.create({ stationId: station.publicId, userId: user.publicId }), FeedingStationInactiveError);
    assert.deepEqual(await counts(), before);
  });

  await t.test("unique IDs and SQL FK/count/location/period constraints remain enforced", async () => {
    const station = await stations.create(stationInput(user.publicId));
    const log = await logs.create({ stationId: station.publicId, userId: user.publicId });
    const sr = await stationRow(station.publicId), lr = await logRow(log.publicId);
    await assert.rejects(db.insert(feedingStations).values({ ...sr, id: randomUUID() }), codeIs("23505"));
    await assert.rejects(db.insert(feedingLogs).values({ ...lr, id: randomUUID() }), codeIs("23505"));
    await assert.rejects(db.insert(feedingStations).values({ ...sr, id: randomUUID(), publicId: publicId(), createdBy: randomUUID() }), codeIs("23503"));
    for (const extra of [{ stationId: randomUUID() }, { userId: randomUUID() }]) {
      await assert.rejects(db.insert(feedingLogs).values({ ...lr, id: randomUUID(), publicId: publicId(), ...extra }), codeIs("23503"));
    }
    for (const extra of [{ estimatedCats: -1 }, { estimatedKittens: -1 }, { location: { lat: 91, lng: 34 } }]) {
      await assert.rejects(stations.create(stationInput(user.publicId, extra)), isSafeFailure);
    }
    for (const period of ["", "midnight"]) await assert.rejects(logs.create({ stationId: station.publicId, userId: user.publicId, period }), isSafeFailure);
  });

  await t.test("joined projections never need user email/hash or leak internal metadata", async () => {
    const rollback = new Error("Synthetic rollback after projection verification");
    await assert.rejects(db.transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE users RENAME COLUMN password_hash TO hidden_test_hash`);
      await tx.execute(sql`ALTER TABLE users RENAME COLUMN email TO hidden_test_email`);
      const scoped = storesFor(tx);
      const station = await scoped.stations.create(stationInput(user.publicId));
      const log = await scoped.logs.create({ stationId: station.publicId, userId: user.publicId });
      assert.deepEqual(await scoped.stations.findByPublicId(station.publicId), station);
      assert.ok((await scoped.stations.listActive()).some((row) => row.publicId === station.publicId));
      assert.deepEqual(await scoped.logs.listForStation(station.publicId), [log]);
      keysAre(json(serializeFeedingStation(station)), stationKeys);
      keysAre(json(serializeFeedingLog(log)), logKeys);
      throw rollback;
    }), (error) => error === rollback);
  });

  let a, b, httpStation, httpLog;
  await t.test("register/login A and B, A creates station, public reads, B feeds A's station, public history", async () => {
    const registered = [];
    for (const firstName of ["User A", "User B"]) {
      const input = { firstName, lastName: "Synthetic", email: `${publicId()}@example.invalid`, password: "synthetic-feeding-password" };
      const registration = await request("POST", "/api/auth/register", input);
      assert.equal(registration.status, 201);
      const login = await request("POST", "/api/auth/login", input);
      assert.equal(login.status, 200);
      assert.deepEqual(login.body.user, registration.body.user);
      registered.push({ id: login.body.user.id, bearer: `Bearer ${login.body.token}` });
    }
    [a, b] = registered;
    const creation = await request("POST", base, { name: "  HTTP station  ", location, createdBy: b.id, active: false }, a.bearer);
    assert.equal(creation.status, 201);
    httpStation = creation.body;
    keysAre(httpStation, stationKeys);
    assert.match(httpStation._id, /^[0-9a-f]{24}$/);
    assert.equal(httpStation.name, "HTTP station");
    assert.equal(httpStation.createdBy, a.id);
    assert.equal(httpStation.active, true);
    assert.equal(httpStation.__v, 0);
    assert.deepEqual(httpStation.location, location);
    const listing = await request("GET", base);
    assert.equal(listing.status, 200);
    assert.ok(Array.isArray(listing.body));
    assert.deepEqual(listing.body.find((row) => row._id === httpStation._id), httpStation);
    assert.deepEqual(await request("GET", `${base}/${httpStation._id.toUpperCase()}`), { status: 200, body: httpStation });
    const feeding = await request("POST", `${base}/${httpStation._id.toUpperCase()}/feedings`, {
      fedAt: "2024-04-03T09:08:07.456+03:00", food: false, water: false, period: "morning", note: "  Shared care  ",
    }, b.bearer);
    assert.equal(feeding.status, 201);
    httpLog = feeding.body;
    keysAre(httpLog, [...logKeys, "period", "note"]);
    assert.deepEqual([httpLog.stationId, httpLog.userId, httpLog.food, httpLog.water, httpLog.__v], [httpStation._id, b.id, false, false, 0]);
    assert.equal(httpLog.fedAt, "2024-04-03T06:08:07.456Z");
    assert.equal(httpLog.note, "Shared care");
    assert.deepEqual(await request("GET", `${base}/${httpStation._id}/feedings`), { status: 200, body: [httpLog] });
    for (const value of [httpStation.createdAt, httpStation.updatedAt, httpLog.fedAt, httpLog.createdAt, httpLog.updatedAt]) iso(value);
    const sr = await stationRow(httpStation._id), lr = await logRow(httpLog._id);
    const rows = await db.select({ id: users.id, publicId: users.publicId }).from(users);
    assert.equal(sr.createdBy, rows.find((row) => row.publicId === a.id).id);
    assert.equal(lr.userId, rows.find((row) => row.publicId === b.id).id);
    assert.equal(lr.stationId, sr.id);
  });

  await t.test("fresh connection/app reads persisted data and authenticates against the same PostgreSQL", async (t) => {
    const fresh = createPostgres(localConfig("test", connection.url));
    try {
      await assertDatabaseIdentity(fresh.pool, "test");
      const freshRequest = await startPostgresAuthApp(t, createPostgresUserStore(fresh.db), storesFor(fresh.db));
      assert.deepEqual(await freshRequest("GET", `${base}/${httpStation._id}`), { status: 200, body: httpStation });
      assert.deepEqual(await freshRequest("GET", `${base}/${httpStation._id}/feedings`), { status: 200, body: [httpLog] });
      const protectedResponse = await freshRequest("GET", "/protected", undefined, b.bearer);
      assert.equal(protectedResponse.status, 200);
      assert.equal(protectedResponse.body.user._id, b.id);
    } finally { await fresh.close(); }
  });

  await t.test("guest/invalid-token writes and invalid bodies do not insert; middleware order and ownership contracts hold", async () => {
    const before = await counts();
    for (const [authorization, error] of [[undefined, "Authorization token required"], ["Bearer invalid", "Invalid or expired token"]]) {
      for (const path of [base, `${base}/${httpStation._id}/feedings`, `${base}/bad/feedings`]) {
        assert.deepEqual(await request("POST", path, {}, authorization), { status: 401, body: { error } });
      }
    }
    for (const body of [{ name: " ", location }, { name: "Invalid", location, image: null }, { name: "Invalid", location, notes: null }, { name: "Invalid", location, estimatedCats: -1 }]) {
      const response = await request("POST", base, body, a.bearer);
      assert.equal(response.status, 400);
      assert.equal(response.body.message, "Validation failed");
      assert.ok(response.body.errors.length);
    }
    for (const body of [{ userId: a.id }, { stationId: publicId() }, { extra: true }, { period: "" }, { period: null }, { note: null }, { fedAt: "not-a-date" }, { food: "false" }]) {
      const response = await request("POST", `${base}/${httpStation._id}/feedings`, body, b.bearer);
      assert.equal(response.status, 400);
      assert.equal(response.body.message, "Validation failed");
      assert.ok(response.body.errors.length);
      if (Object.keys(body).some((key) => ["userId", "stationId", "extra"].includes(key))) assert.equal(response.body.errors[0].field, "body");
    }
    assert.deepEqual(await counts(), before);
  });

  await t.test("malformed and missing IDs retain 400 field names and 404 bodies", async () => {
    for (const [method, suffix, field] of [["GET", "", "id"], ["GET", "/feedings", "stationId"], ["POST", "/feedings", "stationId"]]) {
      const malformed = await request(method, `${base}/bad${suffix}`, method === "POST" ? {} : undefined, b.bearer);
      assert.deepEqual(malformed, { status: 400, body: { message: "Validation failed", errors: [{ field, message: "Invalid feeding station ID" }] } });
      assert.deepEqual(await request(method, `${base}/${publicId()}${suffix}`, method === "POST" ? {} : undefined, b.bearer), { status: 404, body: { message: "Feeding station not found" } });
    }
  });

  await t.test("HTTP empty optionals/default feeding, station-specific history and inactive public reads", async () => {
    const created = await request("POST", base, { name: "Optional HTTP", location, image: "", notes: "  " }, a.bearer);
    assert.equal(created.status, 201);
    assert.equal(created.body.image, "");
    assert.equal(created.body.notes, "  ");
    const path = `${base}/${created.body._id}`;
    assert.deepEqual(await request("GET", `${path}/feedings`), { status: 200, body: [] });
    const beforeTime = Date.now();
    const feeding = await request("POST", `${path}/feedings`, {}, b.bearer);
    assert.equal(feeding.status, 201);
    keysAre(feeding.body, logKeys);
    assert.deepEqual([feeding.body.food, feeding.body.water, feeding.body.__v], [true, false, 0]);
    assert.ok(Date.parse(feeding.body.fedAt) >= beforeTime && Date.parse(feeding.body.fedAt) <= Date.now());
    const blankNote = await request("POST", `${path}/feedings`, { note: "  " }, b.bearer);
    assert.equal(blankNote.status, 201);
    assert.equal(blankNote.body.note, "");
    const history = await request("GET", `${path}/feedings`);
    assert.equal(history.body.length, 2);
    assert.ok(history.body.every((row) => row.stationId === created.body._id));
    assert.deepEqual(await request("GET", `${base}/${httpStation._id}/feedings`), { status: 200, body: [httpLog] });
    await db.update(feedingStations).set({ active: false }).where(eq(feedingStations.publicId, created.body._id));
    const before = await counts();
    assert.deepEqual(await request("POST", `${path}/feedings`, {}, b.bearer), { status: 409, body: { message: "Feeding station is inactive" } });
    assert.deepEqual(await counts(), before);
    assert.equal((await request("GET", path)).body.active, false);
    assert.deepEqual(await request("GET", `${path}/feedings`), history);
    assert.equal((await request("GET", base)).body.some((row) => row._id === created.body._id), false);
  });

  await t.test("real rejected SELECT/INSERT queries stay safe failures, never missing rows or empty arrays", async (t) => {
    const messages = [];
    t.mock.method(console, "error", (...args) => messages.push(args));
    const before = await counts();
    await pool.query("ALTER TABLE feeding_stations RENAME COLUMN notes TO hidden_test_notes");
    try {
      await assert.rejects(stations.listActive(), isSafeFailure);
      await assert.rejects(stations.findByPublicId(httpStation._id), isSafeFailure);
      await assert.rejects(stations.create(stationInput(a.id, { notes: "synthetic SQL parameter must not leak" })), isSafeFailure);
      for (const path of [base, `${base}/${httpStation._id}`]) assert.deepEqual(await request("GET", path), { status: 500, body: safeFailure });
      assert.deepEqual(await request("POST", base, { name: "Synthetic", location, notes: "secret-synthetic-note" }, a.bearer), { status: 500, body: safeFailure });
    } finally { await pool.query("ALTER TABLE feeding_stations RENAME COLUMN hidden_test_notes TO notes"); }
    await pool.query("ALTER TABLE feeding_logs RENAME COLUMN note TO hidden_test_note");
    try {
      await assert.rejects(logs.listForStation(httpStation._id), isSafeFailure);
      await assert.rejects(logs.create({ stationId: httpStation._id, userId: b.id, note: "secret-synthetic-note" }), isSafeFailure);
      assert.deepEqual(await request("GET", `${base}/${httpStation._id}/feedings`), { status: 500, body: safeFailure });
      assert.deepEqual(await request("POST", `${base}/${httpStation._id}/feedings`, { note: "secret-synthetic-note" }, b.bearer), { status: 500, body: safeFailure });
    } finally { await pool.query("ALTER TABLE feeding_logs RENAME COLUMN hidden_test_note TO note"); }
    assert.deepEqual(messages, []);
    assert.deepEqual(await counts(), before);
  });

  // Separate, guarded connection pools provide real competing sessions. The main
  // suite pool observes locks; its advisory-lock connection remains untouched.
  const actor = async (t, label, max = 1) => {
    const name = `ray-feeding-${label}-${publicId()}`;
    const connection = createPostgres({ ...localConfig("test", process.env.RAY_TEST_DATABASE_URL), application_name: name, max });
    const releases = new Set();
    t.after(async () => {
      for (const release of releases) release();
      await connection.close();
    });
    await assertDatabaseIdentity(connection.pool, "test");
    return { ...connection, name, releases };
  };
  const waitForBlock = async (name, blockerPid, queryPart) => {
    const deadline = Date.now() + 8000;
    do {
      const { rows } = await pool.query(`SELECT pid, wait_event_type FROM pg_stat_activity
        WHERE application_name=$1 AND wait_event_type='Lock'
          AND $2::integer=ANY(pg_blocking_pids(pid)) AND position($3 in lower(query))>0`,
      [name, blockerPid, queryPart]);
      if (rows.length === 1) return rows[0].pid;
      await delay(15); // bounded polling of observed lock state, never a timing assumption
    } while (Date.now() < deadline);
    throw new Error(`Expected database lock edge was not observed: ${queryPart}`);
  };
  const track = (pending, promise) => { pending.push(promise); promise.catch(() => {}); return promise; };
  const ownClient = async (connection) => {
    const client = await connection.pool.connect();
    let released = false;
    const release = () => {
      if (!released) { released = true; connection.releases.delete(release); client.release(true); }
    };
    // The actor's cleanup releases clients before ending its pool, including if
    // a later acquisition fails before the calling test enters try/finally.
    connection.releases.add(release);
    try {
      const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      return { client, pid, release };
    } catch (error) { release(); throw error; }
  };

  for (const action of ["deactivate", "delete"]) {
    await t.test(`${action}-first after HTTP precheck waits on row lock, then returns ${action === "delete" ? 404 : 409} without inserting`, async (t) => {
      const station = await stations.create(stationInput(a.id));
      const writer = await actor(t, action);
      const feeding = await actor(t, "waiting-feeding");
      const send = await startPostgresAuthApp(t, createPostgresUserStore(feeding.db), storesFor(feeding.db));
      const { client, pid, release } = await ownClient(writer);
      const pending = [];
      try {
        await client.query("BEGIN");
        if (action === "delete") await client.query("DELETE FROM feeding_stations WHERE public_id=$1", [station.publicId]);
        else await client.query("UPDATE feeding_stations SET active=false WHERE public_id=$1", [station.publicId]);
        const response = track(pending, send("POST", `${base}/${station.publicId}/feedings`, {}, b.bearer));
        await waitForBlock(feeding.name, pid, "for share");
        await client.query("COMMIT");
        assert.deepEqual(await response, action === "delete"
          ? { status: 404, body: { message: "Feeding station not found" } }
          : { status: 409, body: { message: "Feeding station is inactive" } });
        assert.deepEqual(await logs.listForStation(station.publicId), []);
        t.diagnostic(`${action}-first: HTTP passed the unlocked precheck, feeding FOR SHARE was observed blocked by the writer, commit yielded the expected error and zero logs.`);
      } finally {
        try { await client.query("ROLLBACK"); }
        finally { release(); await Promise.allSettled(pending); }
      }
    });
  }

  await t.test("feeding-first holds station lock through insert/commit and deactivation cannot overtake", async (t) => {
    const station = await stations.create(stationInput(a.id));
    const blocker = await actor(t, "insert-gate");
    const feeding = await actor(t, "feeding-first");
    const deactivating = await actor(t, "deactivating-second");
    const send = await startPostgresAuthApp(t, createPostgresUserStore(feeding.db), storesFor(feeding.db));
    const gate = await ownClient(blocker), update = await ownClient(deactivating);
    const pending = [];
    try {
      await gate.client.query("BEGIN");
      await gate.client.query("LOCK TABLE feeding_logs IN SHARE MODE");
      const response = track(pending, send("POST", `${base}/${station.publicId}/feedings`, {}, b.bearer));
      const feedingPid = await waitForBlock(feeding.name, gate.pid, "insert into");
      // The insert is blocked on the table, after the adapter's station row lock.
      await update.client.query("BEGIN");
      const deactivate = track(pending, update.client.query("UPDATE feeding_stations SET active=false WHERE public_id=$1", [station.publicId]));
      await waitForBlock(deactivating.name, feedingPid, "update");
      assert.deepEqual(await logs.listForStation(station.publicId), []);
      await gate.client.query("COMMIT");
      assert.equal((await response).status, 201);
      await deactivate;
      const visible = await update.client.query(`SELECT count(*)::integer AS n FROM feeding_logs l
        JOIN feeding_stations s ON l.station_id=s.id WHERE s.public_id=$1`, [station.publicId]);
      assert.equal(visible.rows[0].n, 1);
      await update.client.query("COMMIT");
      assert.equal((await stations.findByPublicId(station.publicId)).active, false);
      assert.equal((await logs.listForStation(station.publicId)).length, 1);
      t.diagnostic("feeding-first: observed insert -> table gate and deactivation -> feeding transaction lock edges; after gate release feeding returned 201, deactivation's next statement saw the committed log before its own commit.");
    } finally {
      try { await gate.client.query("ROLLBACK"); }
      finally {
        gate.release();
        try { await Promise.allSettled(pending); await update.client.query("ROLLBACK"); }
        finally { update.release(); }
      }
    }
  });

  await t.test("two simultaneous legitimate HTTP feedings share the station lock and both commit", async (t) => {
    const station = await stations.create(stationInput(a.id));
    const blocker = await actor(t, "concurrent-gate");
    const first = await actor(t, "concurrent-first"), second = await actor(t, "concurrent-second");
    const sendFirst = await startPostgresAuthApp(t, createPostgresUserStore(first.db), storesFor(first.db));
    const sendSecond = await startPostgresAuthApp(t, createPostgresUserStore(second.db), storesFor(second.db));
    const gate = await ownClient(blocker);
    const pending = [];
    try {
      await gate.client.query("BEGIN");
      await gate.client.query("LOCK TABLE feeding_logs IN SHARE MODE");
      const one = track(pending, sendFirst("POST", `${base}/${station.publicId}/feedings`, {}, b.bearer));
      const two = track(pending, sendSecond("POST", `${base}/${station.publicId}/feedings`, {}, b.bearer));
      const pid1 = await waitForBlock(first.name, gate.pid, "insert into");
      const pid2 = await waitForBlock(second.name, gate.pid, "insert into");
      assert.notEqual(pid1, pid2);
      await gate.client.query("COMMIT");
      const responses = await Promise.all([one, two]);
      assert.deepEqual(responses.map((row) => row.status), [201, 201]);
      assert.notEqual(responses[0].body._id, responses[1].body._id);
      assert.equal((await logs.listForStation(station.publicId)).length, 2);
      t.diagnostic("concurrent feedings: two distinct PostgreSQL PIDs reached blocked INSERTs while holding compatible station locks; releasing the table gate produced two 201 responses and two distinct persisted logs.");
    } finally {
      try { await gate.client.query("ROLLBACK"); }
      finally { gate.release(); await Promise.allSettled(pending); }
    }
  });

  await t.test("transaction failure rolls back without a partial log or retained station lock", async (t) => {
    const station = await stations.create(stationInput(a.id));
    const feeding = await actor(t, "failed-transaction");
    const nextWriter = await actor(t, "after-rollback");
    const before = await counts();
    await assert.rejects(createPostgresFeedingLogStore(feeding.db).create({ stationId: station.publicId, userId: b.id, period: "invalid-synthetic-period" }), isSafeFailure);
    assert.deepEqual(await counts(), before);
    assert.deepEqual(await logs.listForStation(station.publicId), []);
    const { client, release } = await ownClient(nextWriter);
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM feeding_stations WHERE public_id=$1 FOR UPDATE NOWAIT", [station.publicId]);
      await client.query("UPDATE feeding_stations SET active=false WHERE public_id=$1", [station.publicId]);
      await client.query("COMMIT");
    } finally { try { await client.query("ROLLBACK"); } finally { release(); } }
    t.diagnostic("rollback: invalid period rejected by the real CHECK constraint; total rows unchanged, empty history, and an independent session acquired FOR UPDATE NOWAIT immediately.");
  });
});
