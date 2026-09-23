import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { users } from "../../dist/db/schema.js";
import { applyLocalMigrations } from "../../dist/db/migrate.js";
import { createPostgresFeedingStationStore } from "../../dist/feedingStations/postgresFeedingStationStore.js";
import { createPostgresFeedingLogStore } from "../../dist/feedingLogs/postgresFeedingLogStore.js";
import { createPostgresReportStore } from "../../dist/reports/postgresReportStore.js";
import { openTestDatabase } from "./database.mjs";
import { databaseClock, transactionTime, observeDatabaseTime, assertDatabaseTimestamp, assertPersistedTimestamp } from "./timestamps.mjs";

const date = (ms) => new Date(Date.UTC(2020, 0, 1) + ms);

test("database timestamp bounds reject stale, future, invalid and reversed values without tolerance", () => {
  const bounds = { before: date(100), after: date(200) };
  for (const value of [date(100), date(150), date(200)]) assertDatabaseTimestamp(value, bounds);
  for (const value of [date(99), date(201)]) {
    assert.throws(() => assertDatabaseTimestamp(value, bounds), { code: "ERR_ASSERTION", message: /outside database bounds/ });
  }
  for (const value of [new Date(NaN), undefined, date(150).toISOString()]) {
    assert.throws(() => assertDatabaseTimestamp(value, bounds), { code: "ERR_ASSERTION", message: /finite Date/ });
  }
  assert.throws(() => assertDatabaseTimestamp(date(150), { before: date(200), after: date(100) }), { code: "ERR_ASSERTION", message: /ordered/ });
});

test("HTTP timestamp assertion rejects an altered persisted instant and non-UTC serialization", () => {
  const stored = date(123);
  assertPersistedTimestamp("2020-01-01T00:00:00.123Z", stored);
  for (const value of [date(122).toISOString(), date(124).toISOString(), "2020-01-01T03:00:00.123+03:00", "invalid", undefined]) {
    assert.throws(() => assertPersistedTimestamp(value, stored), { code: "ERR_ASSERTION", message: /persisted instant exactly in UTC/ });
  }
});

test("real PostgreSQL timestamp precision and transaction semantics", async (t) => {
  const connection = await openTestDatabase(t);
  await applyLocalMigrations(connection, "test", connection.url);
  const { db, pool } = connection;

  await t.test("stored millisecond rounding differs from pg conversion of unrounded timestamps", async () => {
    const { rows: [row] } = await pool.query(`SELECT
      '2020-01-01T03:00:00.000600+03:00'::timestamptz AS raw,
      '2020-01-01T03:00:00.000600+03:00'::timestamptz(3) AS rounded_up,
      '2020-01-01T03:00:00.000400+03:00'::timestamptz(3) AS rounded_down`);
    assert.deepEqual(row.raw, date(0)); // pg's Date conversion loses sub-ms digits
    assert.deepEqual(row.rounded_up, date(1)); // PostgreSQL typmod rounds instead
    assert.deepEqual(row.rounded_down, date(0));
    assertDatabaseTimestamp(row.rounded_up, { before: row.rounded_up, after: row.rounded_up });
    // An unrounded observation parsed by pg is an invalid upper bound for the
    // same instant stored at precision 3, even without inter-machine clock skew.
    assert.throws(() => assertDatabaseTimestamp(row.rounded_up, { before: row.raw, after: row.raw }), { code: "ERR_ASSERTION" });
  });

  await t.test("omitted defaults use transaction start; trigger uses execution time and persisted UTC stays exact", async () => {
    const publicId = randomBytes(12).toString("hex");
    let expected, report;
    await db.transaction(async (tx) => {
      expected = await transactionTime(tx);
      // Bounded observation of actual database-clock advancement, without sleeps,
      // mock clocks or an artificial timing tolerance. Do not restart the transaction.
      let beforeInsert;
      for (let attempt = 0; attempt < 64; attempt++) {
        beforeInsert = await databaseClock(tx);
        if (beforeInsert > expected) break;
      }
      assert.ok(beforeInsert > expected, "Database millisecond clock did not advance within 64 observations");
      const [user] = await tx.insert(users).values({ publicId, firstName: "Timestamp", lastName: "Synthetic",
        email: `${publicId}@example.invalid`, passwordHash: "synthetic-timestamp-hash" }).returning();
      const station = await createPostgresFeedingStationStore(tx).create({ name: "Timestamp", location: { lat: 32, lng: 34 }, createdBy: publicId });
      const log = await createPostgresFeedingLogStore(tx).create({ stationId: station.publicId, userId: publicId });
      report = await createPostgresReportStore(tx).create({ description: "Timestamp", type: "general", location: { lat: 32, lng: 34 }, createdBy: null, createdByName: "Guest" });
      for (const record of [user, station, log, report]) {
        assert.deepEqual(record.createdAt, expected);
        assert.deepEqual(record.updatedAt, expected);
        assert.ok(record.createdAt < beforeInsert, "Default must predate later insert execution in this transaction");
      }
      assert.deepEqual(log.fedAt, expected);
      const update = await observeDatabaseTime(tx, () => tx.update(users).set({ company: "Trigger observation" })
        .where(eq(users.publicId, publicId)).returning());
      const changed = update.value[0];
      assertDatabaseTimestamp(changed.updatedAt, update, "trigger execution time");
      assert.ok(changed.updatedAt > expected, "Trigger must use clock_timestamp(), not transaction_timestamp()");
      assert.deepEqual(changed.createdAt, expected);
      // Explicit rollback tests elsewhere remain unchanged; here commit and read
      // again to establish real persistence independently of RETURNING.
    });
    const { rows: [persisted] } = await db.execute(sql`SELECT created_at, updated_at FROM reports WHERE public_id = ${report.publicId}`);
    assert.deepEqual(new Date(persisted.created_at), expected);
    assertPersistedTimestamp(report.createdAt.toISOString(), new Date(persisted.created_at));
    assertPersistedTimestamp(report.updatedAt.toISOString(), new Date(persisted.updated_at));
  });
});
