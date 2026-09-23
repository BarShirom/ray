import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

function milliseconds(value, label) {
  assert.ok(value instanceof Date && Number.isFinite(value.getTime()), `${label} must be a finite Date`);
  return value.getTime();
}

export async function databaseClock(db) {
  // Cast in PostgreSQL: timestamptz(3) rounds, while pg truncates sub-ms Date data.
  const { rows } = await db.execute(sql`SELECT clock_timestamp()::timestamptz(3) AS observed`);
  // Drizzle execute returns timestamp text; normalize only this SQL observation.
  const observed = new Date(rows[0].observed);
  milliseconds(observed, "database clock");
  return observed;
}

export async function transactionTime(tx) {
  const { rows } = await tx.execute(sql`SELECT transaction_timestamp()::timestamptz(3) AS started`);
  const started = new Date(rows[0].started);
  milliseconds(started, "transaction time");
  return started;
}

export async function observeDatabaseTime(db, operation) {
  // For now() defaults, sample BEFORE the operation starts its transaction, not
  // merely before an INSERT inside an already-open transaction. Inside an existing
  // transaction, compare defaults to transactionTime(tx) exactly instead.
  const before = await databaseClock(db);
  const value = await operation();
  const after = await databaseClock(db);
  assert.ok(after >= before, "Database clock moved backwards during observation");
  return { value, before, after };
}

export function assertDatabaseTimestamp(actual, { before, after }, label = "timestamp") {
  const value = milliseconds(actual, label);
  const lower = milliseconds(before, "lower database bound");
  const upper = milliseconds(after, "upper database bound");
  assert.ok(lower <= upper, "Database bounds must be ordered");
  assert.ok(value >= lower && value <= upper,
    `${label}: ${actual.toISOString()} outside database bounds [${before.toISOString()}, ${after.toISOString()}]`);
}

export function assertPersistedTimestamp(serialized, stored, label = "HTTP timestamp") {
  milliseconds(stored, "persisted timestamp");
  assert.equal(serialized, stored.toISOString(), `${label} must serialize the persisted instant exactly in UTC`);
}
