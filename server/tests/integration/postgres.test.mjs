import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { desc, eq, sql } from "drizzle-orm";
import { users, reports, feedingStations, feedingLogs } from "../../dist/db/schema.js";
import { localConfig } from "../../dist/db/local-config.js";
import { applyLocalMigrations } from "../../dist/db/migrate.js";
import { cleanupTestDatabase, openTestDatabase } from "./database.mjs";

const publicId = () => randomBytes(12).toString("hex");
const point = { x: 34.7818, y: 32.0853 }; // longitude, latitude; deliberately asymmetric
const oldDate = new Date("2019-02-03T04:05:06.789Z");
const userValues = (extra = {}) => ({ publicId: publicId(), firstName: "Synthetic", lastName: "Carer", email: `${publicId()}@example.invalid`, passwordHash: "$2b$04$synthetic-unchanged-hash", ...extra });
const codeIs = (code) => (error) => { assert.equal(error.cause?.code ?? error.code, code); return true; };

test("local tooling refuses unsafe targets before cleanup", async () => {
  const valid = "postgresql://ray_test:synthetic@127.0.0.1:55433/ray_test";
  assert.equal(localConfig("test", valid).ssl, false);
  for (const value of [
    undefined,
    "postgresql://ray_local:synthetic@127.0.0.1:55432/ray_local",
    valid.replace("127.0.0.1", "db.example.invalid"),
    valid.replace("/ray_test", "/unexpected"),
    valid.replace(":55433", ":55432"),
    valid.replace("127.0.0.1", "localhost"),
    `${valid}?host=db.example.invalid`,
    `${valid}?database=ray_local`,
    `${valid}#ignored`,
  ]) {
    assert.throws(() => localConfig("test", value), /RAY_TEST_DATABASE_URL/);
    // No connection needed: guard must reject before accessing it.
    await assert.rejects(cleanupTestDatabase(undefined, value), /RAY_TEST_DATABASE_URL/);
  }
  assert.throws(() => localConfig("local", valid), /RAY_LOCAL_DATABASE_URL/);
});

test("real PostgreSQL/PostGIS foundation", async (t) => {
  const connection = await openTestDatabase(t);
  const { db, pool, url } = connection;
  const one = async (table, values) => (await db.insert(table).values(values).returning())[0];
  const journal = JSON.parse(await readFile(new URL("../../db/migrations/meta/_journal.json", import.meta.url), "utf8"));

  await t.test("fresh database accepts migrations and exposes PostGIS", async () => {
    await applyLocalMigrations(connection, "test", url);
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations")).rows[0].count, journal.entries.length);
    const { rows } = await pool.query("SELECT extversion FROM pg_extension WHERE extname = 'postgis'");
    assert.match(rows[0].extversion, /^3\.6\./);
    const versions = await pool.query("SELECT current_setting('server_version') AS postgres, postgis_lib_version() AS postgis");
    t.diagnostic(`Database versions: PostgreSQL ${versions.rows[0].postgres}, PostGIS ${versions.rows[0].postgis}`);
  });

  const before = Date.now();
  const user = await one(users, userValues());
  const station = await one(feedingStations, { publicId: publicId(), name: "Synthetic garden", location: point, createdBy: user.id });
  const report = await one(reports, { publicId: publicId(), description: "Synthetic report", type: "general", location: point });
  const log = await one(feedingLogs, { publicId: publicId(), stationId: station.id, userId: user.id });
  const fixtures = [[users, user], [reports, report], [feedingStations, station], [feedingLogs, log]];

  await t.test("all four tables return UUIDs, public IDs, defaults and nullable fields", () => {
    for (const [, row] of fixtures) {
      assert.match(row.id, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
      assert.match(row.publicId, /^[0-9a-f]{24}$/);
      for (const field of ["createdAt", "updatedAt"]) assert.ok(row[field].getTime() >= before && row[field].getTime() <= Date.now());
    }
    assert.equal(user.company, null);
    assert.equal(user.passwordHash, "$2b$04$synthetic-unchanged-hash");
    assert.equal(station.estimatedCats, 0);
    assert.equal(station.estimatedKittens, 0);
    assert.equal(station.active, true);
    assert.equal(station.image, null);
    assert.equal(station.notes, null);
    assert.equal(report.status, "new");
    assert.deepEqual(report.media, []);
    for (const field of ["createdBy", "assignedTo", "createdByName", "assignedToName"]) assert.equal(report[field], null);
    assert.equal(log.food, true);
    assert.equal(log.water, false);
    assert.equal(log.period, null);
    assert.equal(log.note, null);
    assert.ok(log.fedAt.getTime() >= before && log.fedAt.getTime() <= Date.now());
  });

  await t.test("reapplying migrations keeps journal and existing rows unchanged", async () => {
    const beforeJournal = (await pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows;
    await applyLocalMigrations(connection, "test", url);
    assert.deepEqual((await pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows, beforeJournal);
    for (const [table, row] of fixtures) assert.deepEqual((await db.select().from(table).where(eq(table.id, row.id)))[0], row);
  });

  await t.test("unique public IDs and strict lowercase 24-character hex on all tables", async () => {
    for (const [table, row] of fixtures) {
      await assert.rejects(one(table, { ...row, id: randomUUID() }), codeIs("23505"));
      for (const invalid of ["abc", "g".repeat(24), "a".repeat(25), "A".repeat(24), "a".repeat(24) + "\n"]) {
        await assert.rejects(one(table, { ...row, id: randomUUID(), publicId: invalid }), codeIs("23514"));
      }
      await assert.rejects(one(table, { ...row, id: randomUUID(), publicId: null }), codeIs("23502"));
    }
  });

  await t.test("email uniqueness is case-sensitive and optional empty values survive", async () => {
    await one(users, userValues({ email: "Case@example.invalid", company: "" }));
    await one(users, userValues({ email: "case@example.invalid", company: null }));
    await assert.rejects(one(users, userValues({ email: "Case@example.invalid" })), codeIs("23505"));
    const result = await one(feedingLogs, { publicId: publicId(), stationId: station.id, userId: user.id, food: false, water: false, note: "" });
    assert.equal(result.food, false);
    assert.equal(result.water, false);
    assert.equal(result.note, "");
    const stored = (await db.select().from(users).where(eq(users.email, "Case@example.invalid")))[0];
    assert.equal(stored.company, "");
  });

  await t.test("CHECK and integer constraints reject invalid input", async () => {
    for (const [table, row, changes, code] of [
      [reports, report, { type: "rescue" }, "23514"],
      [reports, report, { status: "closed" }, "23514"],
      [feedingLogs, log, { period: "night" }, "23514"],
      [feedingStations, station, { name: " \t\n" }, "23514"],
      [feedingStations, station, { estimatedCats: -1 }, "23514"],
      [feedingStations, station, { estimatedKittens: -1 }, "23514"],
      [feedingStations, station, { estimatedCats: 1.5 }, "22P02"],
      [feedingStations, station, { estimatedKittens: 1.5 }, "22P02"],
    ]) await assert.rejects(db.update(table).set(changes).where(eq(table.id, row.id)), codeIs(code));
    for (const value of ["emergency", "food", "general"]) await db.update(reports).set({ type: value }).where(eq(reports.id, report.id));
    for (const value of ["new", "in-progress", "resolved"]) await db.update(reports).set({ status: value }).where(eq(reports.id, report.id));
    for (const value of ["morning", "noon", "evening", null]) await db.update(feedingLogs).set({ period: value }).where(eq(feedingLogs.id, log.id));
  });

  await t.test("every FK rejects dangling internal UUIDs", async () => {
    for (const [table, row, field] of [
      [reports, report, "createdBy"], [reports, report, "assignedTo"],
      [feedingStations, station, "createdBy"], [feedingLogs, log, "stationId"], [feedingLogs, log, "userId"],
    ]) await assert.rejects(db.update(table).set({ [field]: randomUUID() }).where(eq(table.id, row.id)), codeIs("23503"));
  });

  await t.test("report deletion sets both user FKs to NULL and keeps snapshots", async () => {
    const disposableUser = await one(users, userValues());
    const owned = await one(reports, { publicId: publicId(), description: "Snapshot", type: "food", location: point,
      createdBy: disposableUser.id, assignedTo: disposableUser.id, createdByName: "Stored creator", assignedToName: "Stored assignee" });
    await db.delete(users).where(eq(users.id, disposableUser.id));
    const result = (await db.select().from(reports).where(eq(reports.id, owned.id)))[0];
    assert.equal(result.createdBy, null);
    assert.equal(result.assignedTo, null);
    assert.equal(result.createdByName, "Stored creator");
    assert.equal(result.assignedToName, "Stored assignee");
  });

  await t.test("station creators, logged stations and log users cannot be deleted", async () => {
    const creator = await one(users, userValues());
    await one(feedingStations, { publicId: publicId(), name: "Creator restriction", location: point, createdBy: creator.id });
    await assert.rejects(db.delete(users).where(eq(users.id, creator.id)), codeIs("23001"));
    const feeder = await one(users, userValues());
    await one(feedingLogs, { publicId: publicId(), stationId: station.id, userId: feeder.id });
    await assert.rejects(db.delete(users).where(eq(users.id, feeder.id)), codeIs("23001"));
    await assert.rejects(db.delete(feedingStations).where(eq(feedingStations.id, station.id)), codeIs("23001"));
  });

  await t.test("historical millisecond timestamps insert unchanged; SQL updates trigger all tables", async () => {
    for (const [table, row] of fixtures) {
      const historical = await one(table, { ...row, id: randomUUID(), publicId: publicId(),
        ...(table === users ? { email: `${publicId()}@example.invalid` } : {}), createdAt: oldDate, updatedAt: oldDate });
      assert.equal(historical.createdAt.toISOString(), oldDate.toISOString());
      assert.equal(historical.updatedAt.toISOString(), oldDate.toISOString());
      // Direct SQL also exercises the trigger; no ORM update hook involved.
      const updated = await db.execute(sql`UPDATE ${table} SET updated_at = ${oldDate} WHERE id = ${historical.id} RETURNING created_at, updated_at`);
      assert.equal(new Date(updated.rows[0].created_at).toISOString(), oldDate.toISOString());
      assert.ok(new Date(updated.rows[0].updated_at).getTime() > oldDate.getTime());
      assert.ok(Math.abs(Date.now() - new Date(updated.rows[0].updated_at).getTime()) < 5_000);
    }
  });

  await t.test("history sorts fed_at, created_at, then UUID descending; repeat feedings allowed", async () => {
    const isolated = await one(feedingStations, { publicId: publicId(), name: "Ordering", location: point, createdBy: user.id });
    const dates = [
      ["00000000-0000-4000-8000-000000000001", "2020-01-01", "2020-01-03"],
      ["00000000-0000-4000-8000-000000000002", "2020-01-02", "2020-01-02"],
      ["00000000-0000-4000-8000-000000000003", "2020-01-02", "2020-01-03"],
      ["00000000-0000-4000-8000-000000000004", "2020-01-02", "2020-01-03"],
    ];
    for (const [id, fedAt, createdAt] of dates) await one(feedingLogs, { id, publicId: publicId(), stationId: isolated.id, userId: user.id, fedAt: new Date(fedAt), createdAt: new Date(createdAt) });
    const rows = await db.select().from(feedingLogs).where(eq(feedingLogs.stationId, isolated.id))
      .orderBy(desc(feedingLogs.fedAt), desc(feedingLogs.createdAt), desc(feedingLogs.id));
    assert.deepEqual(rows.map((row) => row.id), dates.map(([id]) => id).reverse());
  });

  await t.test("spatial columns round-trip longitude/latitude and enforce Point/4326", async () => {
    for (const [table, row] of [[reports, report], [feedingStations, station]]) {
      const returned = (await db.select().from(table).where(eq(table.id, row.id)))[0];
      assert.deepEqual(returned.location, point);
      const result = await db.execute(sql`SELECT ST_X(location) AS lng, ST_Y(location) AS lat, ST_SRID(location) AS srid FROM ${table} WHERE id = ${row.id}`);
      assert.deepEqual(result.rows[0], { lng: 34.7818, lat: 32.0853, srid: 4326 });
      for (const location of [{ x: 181, y: 32 }, { x: -181, y: 32 }, { x: 34, y: 91 }, { x: 34, y: -91 }]) {
        await assert.rejects(db.update(table).set({ location }).where(eq(table.id, row.id)), codeIs("23514"));
      }
      await assert.rejects(db.execute(sql`UPDATE ${table} SET location = ST_GeomFromText('POINT EMPTY',4326) WHERE id = ${row.id}`), codeIs("23514"));
      await assert.rejects(db.execute(sql`UPDATE ${table} SET location = ST_SetSRID(ST_MakePoint(34,32),3857) WHERE id = ${row.id}`), codeIs("22023"));
      await assert.rejects(db.execute(sql`UPDATE ${table} SET location = ST_GeomFromText('LINESTRING(34 32,35 33)',4326) WHERE id = ${row.id}`), codeIs("22023"));
    }
  });

  await t.test("ST_DWithin geography uses metres for both spatial domains", async () => {
    for (const [table, base] of [[reports, { description: "Distance", type: "general" }], [feedingStations, { name: "Distance", createdBy: user.id }]]) {
      const near = await one(table, { ...base, publicId: publicId(), location: { x: point.x + 0.001, y: point.y } });
      const far = await one(table, { ...base, publicId: publicId(), location: { x: point.x + 0.02, y: point.y } });
      const rows = await db.execute(sql`SELECT id, ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(${point.x},${point.y}),4326)::geography) AS metres
        FROM ${table} WHERE id IN (${near.id},${far.id})
        AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(${point.x},${point.y}),4326)::geography, ${200})`);
      assert.deepEqual(rows.rows.map((row) => row.id), [near.id]);
      assert.ok(rows.rows[0].metres > 90 && rows.rows[0].metres < 100);
      const farther = await db.execute(sql`SELECT ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(${point.x},${point.y}),4326)::geography) AS metres FROM ${table} WHERE id = ${far.id}`);
      assert.ok(farther.rows[0].metres > 1800 && farther.rows[0].metres < 2000);
    }
  });

  await t.test("required indexes, timestamp precision and spatial typmods exist", async () => {
    const indexes = (await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1::text[])", [["users", "reports", "feeding_stations", "feeding_logs"]])).rows;
    const definitions = new Map(indexes.map((row) => [row.indexname, row.indexdef]));
    const expected = {
      users_email_unique: /UNIQUE.*\(email\)/,
      reports_created_at_idx: /\(created_at DESC/,
      reports_assigned_to_created_at_idx: /\(assigned_to, created_at DESC/,
      reports_created_by_idx: /\(created_by\)/,
      reports_status_idx: /\(status\)/,
      feeding_stations_created_by_idx: /\(created_by\)/,
      feeding_stations_active_created_at_idx: /\(created_at DESC.*WHERE \(active = true\)/,
      feeding_logs_user_id_idx: /\(user_id\)/,
      feeding_logs_station_history_idx: /\(station_id, fed_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC NULLS LAST\)/,
      reports_location_geography_idx: /USING gist \(\(\(location\)::geography\)\)/,
      feeding_stations_location_geography_idx: /USING gist \(\(\(location\)::geography\)\)/,
    };
    for (const name of ["users", "reports", "feeding_stations", "feeding_logs"]) {
      expected[`${name}_pkey`] = /UNIQUE.*\(id\)/;
      expected[`${name}_public_id_unique`] = /UNIQUE.*\(public_id\)/;
    }
    assert.deepEqual([...definitions.keys()].sort(), Object.keys(expected).sort());
    for (const [name, pattern] of Object.entries(expected)) assert.match(definitions.get(name), pattern, name);
    const precision = await pool.query(`SELECT table_name, column_name, data_type, datetime_precision
      FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = ANY($1::text[]) AND column_name IN ('created_at','updated_at')`, [["users", "reports", "feeding_stations", "feeding_logs"]]);
    assert.equal(precision.rows.length, 8);
    for (const row of precision.rows) {
      assert.equal(row.data_type, "timestamp with time zone");
      assert.equal(row.datetime_precision, 3);
    }
    const geometries = await pool.query("SELECT f_table_name, type, srid, coord_dimension FROM geometry_columns WHERE f_table_schema = 'public' AND f_table_name = ANY($1::text[]) ORDER BY f_table_name", [["reports", "feeding_stations"]]);
    assert.deepEqual(geometries.rows, [
      { f_table_name: "feeding_stations", type: "POINT", srid: 4326, coord_dimension: 2 },
      { f_table_name: "reports", type: "POINT", srid: 4326, coord_dimension: 2 },
    ]);
  });
});
