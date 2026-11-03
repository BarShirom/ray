import assert from "node:assert/strict";
import test from "node:test";
import { NodePgTransaction } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  lockAndAuthorizeStation, resolveStationPrincipalFromVerifiedIdentity, stationViewPredicate,
} from "../dist/feedingStations/stationAuthorization.js";

const actorPublicId = "abcdefabcdefabcdefabcdef";
const stationPublicId = "123456123456123456123456";
const actorId = "00000000-0000-4000-8000-000000000001";
const stationId = "00000000-0000-4000-8000-000000000002";
const dialect = new PgDialect();

// Offline query-orchestration evidence only. Real policy/lock behavior belongs
// to the separate guarded PostgreSQL integration tests, not these queued results.
function fixture(results) {
  const queries = [];
  const session = {
    prepareQuery(query) {
      queries.push(query);
      return {
        setToken() { return this; },
        mapResult(value) { return value; },
        async execute() {
          assert.ok(results.length, "unexpected additional database query");
          return results.shift();
        },
      };
    },
  };
  return { tx: new NodePgTransaction(dialect, session, undefined), queries };
}
const isolation = (value = "read committed") => ({ rows: [{ isolation: value }] });

test("guest, malformed identity and forged principal refuse without data access", async () => {
  const { tx, queries } = fixture([]);
  assert.equal(await resolveStationPrincipalFromVerifiedIdentity(tx, null), null);
  assert.equal(await resolveStationPrincipalFromVerifiedIdentity(tx, { _id: "bad", role: "municipal" }), null);
  assert.equal(await lockAndAuthorizeStation(tx, null, stationPublicId), null);
  assert.equal(await lockAndAuthorizeStation(tx, {}, stationPublicId), null);
  assert.equal(dialect.sqlToQuery(stationViewPredicate(tx, {})).sql, "false");
  assert.equal(queries.length, 0);
});

test("principal resolution requires an actual READ COMMITTED transaction", async () => {
  await assert.rejects(resolveStationPrincipalFromVerifiedIdentity({}, { _id: actorPublicId }), {
    name: "TypeError", message: "Station authorization requires a READ COMMITTED transaction",
  });
  for (const unsupported of ["repeatable read", "serializable", "read uncommitted"]) {
    const { tx, queries } = fixture([isolation(unsupported)]);
    await assert.rejects(resolveStationPrincipalFromVerifiedIdentity(tx, { _id: actorPublicId }), {
      name: "TypeError", message: "Station authorization requires a READ COMMITTED transaction",
    });
    assert.equal(queries.length, 1, "unsupported isolation must not read identity/station data");
  }
});

test("stored identity resolution selects only UUID and binds the opaque principal to its transaction", async () => {
  const { tx, queries } = fixture([isolation(), [{ id: actorId }]]);
  // This fixture stands for a verified required-auth result, not HTTP authentication.
  const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, {
    _id: actorPublicId.toUpperCase(), firstName: "Synthetic", email: "private@example.invalid",
    professional: true,
  });
  assert.ok(principal);
  assert.equal(Object.isFrozen(principal), true);
  assert.deepEqual(Object.keys(principal), []);
  assert.equal(JSON.stringify(principal).includes(actorId), false);
  assert.match(queries[1].sql, /^select "id" from "users"/);
  assert.deepEqual(queries[1].params, [actorPublicId, 1]);
  const other = fixture([]);
  assert.equal(await lockAndAuthorizeStation(other.tx, principal, stationPublicId), null);
  assert.equal(dialect.sqlToQuery(stationViewPredicate(other.tx, principal)).sql, "false");
  assert.equal(other.queries.length, 0);
});

test("missing stored account produces no principal or station query", async () => {
  const { tx, queries } = fixture([isolation(), []]);
  assert.equal(await resolveStationPrincipalFromVerifiedIdentity(tx, { _id: actorPublicId }), null);
  assert.equal(queries.length, 2);
});

for (const [action, lock] of [["view", "share"], ["manage", "update"]]) {
  test(`${action} locks only the parent ID before the separate fresh policy query`, async () => {
    const { tx, queries } = fixture([
      isolation(), [{ id: actorId }], [{ id: stationId }], [{ stationId, canManage: action === "manage" }],
    ]);
    const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, { _id: actorPublicId });
    assert.deepEqual(await lockAndAuthorizeStation(tx, principal, stationPublicId.toUpperCase(), action), {
      stationId, canView: true, canManage: action === "manage",
    });
    assert.match(queries[2].sql, new RegExp(`^select "id" from "feeding_stations".*for ${lock}$`));
    assert.deepEqual(queries[2].params, [stationPublicId, 1]);
    assert.doesNotMatch(queries[2].sql, /visibility|station_access_grants|created_by/);
    assert.match(queries[3].sql, /"visibility" in \('sensitive', 'regular'\)/);
    assert.match(queries[3].sql, /select 1 from "users"/);
    assert.doesNotMatch(queries[3].sql, /"location"|"name"|"notes"|"image"|"email"|"password_hash"/);
    if (action === "view") {
      assert.match(queries[3].sql, /"station_access_grants"\."granted_by" = "feeding_stations"\."created_by"/);
      assert.match(queries[3].sql, /"station_access_grants"\."revoked_at" is null/);
    } else {
      assert.doesNotMatch(queries[3].sql, /station_access_grants|= 'regular'/);
    }
  });
}

test("missing and policy-denied parents both return null; malformed targets do not query", async () => {
  for (const rows of [[[]], [[{ id: stationId }], []]]) {
    const { tx, queries } = fixture([isolation(), [{ id: actorId }], ...rows]);
    const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, { _id: actorPublicId });
    assert.equal(await lockAndAuthorizeStation(tx, principal, "invalid"), null);
    assert.equal(queries.length, 2);
    assert.equal(await lockAndAuthorizeStation(tx, principal, stationPublicId), null);
  }
});
