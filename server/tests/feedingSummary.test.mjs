import assert from "node:assert/strict";
import test from "node:test";
import { feedingRecency, feedingTimestamp } from "../dist/feedingStations/postgresStationPrivacyStore.js";

test("shared recency buckets include each exact lower boundary and exclude its upper boundary", () => {
  const now = new Date("2026-11-03T12:00:00.000Z");
  assert.equal(feedingRecency(null, now), "no-record");
  for (const [age, expected] of [[0, "under-2h"], [2 * 3600000 - 1, "under-2h"], [2 * 3600000, "2-to-6h"],
    [6 * 3600000 - 1, "2-to-6h"], [6 * 3600000, "6-to-12h"], [12 * 3600000 - 1, "6-to-12h"],
    [12 * 3600000, "12-to-24h"], [24 * 3600000 - 1, "12-to-24h"], [24 * 3600000, "older"], [100 * 24 * 3600000, "older"]]) {
    assert.equal(feedingRecency(new Date(now.getTime() - age), now), expected, `${age}ms`);
  }
});

test("aggregate timestamp mapping preserves PostgreSQL Date milliseconds at recency boundaries", () => {
  const asOf = new Date("2026-11-03T12:00:00.123Z");
  const fedAt = new Date(asOf.getTime() - 2 * 3600000 + 1);
  for (const value of [fedAt, fedAt.toISOString()]) {
    const mapped = feedingTimestamp(value);
    assert.equal(mapped.getTime(), fedAt.getTime());
    assert.equal(feedingRecency(mapped, asOf), "under-2h");
  }
  assert.equal(feedingTimestamp(null), null);
});
