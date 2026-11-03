import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { desc, sql } from "drizzle-orm";
import { createPostgres } from "../../dist/db/connection.js";
import { assertDatabaseIdentity, localConfig } from "../../dist/db/local-config.js";
import { applyLocalMigrations } from "../../dist/db/migrate.js";
import { feedingStations } from "../../dist/db/schema.js";
import {
  lockAndAuthorizeStation,
  resolveStationPrincipalFromVerifiedIdentity,
  stationViewPredicate,
} from "../../dist/feedingStations/stationAuthorization.js";
import { openTestDatabase } from "./database.mjs";

const publicId = () => randomBytes(12).toString("hex");
const at = "2026-01-01T00:00:00.000Z";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
// These fixtures represent a caller that already ran required auth. The policy
// helper itself does not verify a JWT or authenticate arbitrary request input.
const verifiedIdentityFixture = (user) => ({ _id: user.public_id });

async function fixtures(connection) {
  const user = async (label) => (await connection.pool.query(`INSERT INTO users
    (public_id,first_name,last_name,email,password_hash)
    VALUES($1,$2,'Synthetic',$3,'synthetic-unused-hash') RETURNING id,public_id`,
  [publicId(), `Synthetic ${label}`, `${randomUUID()}@example.invalid`])).rows[0];
  const station = async (owner, visibility = "sensitive", active = true) => (await connection.pool.query(`
    INSERT INTO feeding_stations(public_id,name,location,created_by,visibility,active)
    VALUES($1,'Synthetic private fixture',ST_SetSRID(ST_MakePoint(34.7,32.1),4326),$2,$3,$4)
    RETURNING id,public_id`, [publicId(), owner.id, visibility, active])).rows[0];
  const grant = (station, recipient, grantor, revoked = false) => connection.pool.query(`
    INSERT INTO station_access_grants(station_id,user_id,granted_by,granted_at,revoked_at)
    VALUES($1,$2,$3,$4,CASE WHEN $5 THEN $4::timestamptz ELSE NULL END)`,
  [station.id, recipient.id, grantor.id, at, revoked]);
  return { user, station, grant };
}

async function authorization(db, user, station, action = "view") {
  return db.transaction(async (tx) => {
    const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, user ? verifiedIdentityFixture(user) : null);
    return lockAndAuthorizeStation(tx, principal, station.public_id, action);
  });
}

function allowed(result, station, canManage) {
  assert.deepEqual(result, { stationId: station.id, canView: true, canManage });
  assert.deepEqual(Object.keys(result).sort(), ["canManage", "canView", "stationId"]);
}

test("internal PostgreSQL station policy is principal/transaction scoped and discloses decisions only", async (t) => {
  const connection = await openTestDatabase(t);
  await applyLocalMigrations(connection, "test", connection.url);
  const make = await fixtures(connection);
  const owner = await make.user("owner"), grantee = await make.user("grantee");
  const unrelated = await make.user("unrelated"), revoked = await make.user("revoked");
  const professional = await make.user("future professional");
  const sensitive = await make.station(owner), regular = await make.station(owner, "regular");
  const inactive = await make.station(owner, "sensitive", false);
  await make.grant(sensitive, grantee, owner);
  await make.grant(inactive, grantee, owner);
  await make.grant(sensitive, revoked, owner, true);
  await make.grant(sensitive, professional, unrelated); // structurally valid FK, invalid owner attribution

  await t.test("every current account views active/inactive stations regardless of dormant grants; management stays owner-only", async () => {
    for (const station of [sensitive, regular, inactive]) {
      assert.equal(await authorization(connection.db, null, station), null);
      allowed(await authorization(connection.db, owner, station), station, true);
      allowed(await authorization(connection.db, owner, station, "manage"), station, true);
    }
    for (const user of [grantee, unrelated, revoked, professional]) {
      for (const station of [sensitive, regular, inactive]) {
        allowed(await authorization(connection.db, user, station), station, false);
        assert.equal(await authorization(connection.db, user, station, "manage"), null);
      }
    }
    assert.equal(await authorization(connection.db, owner, { public_id: publicId() }), null);
    assert.equal(await authorization(connection.db, owner, { public_id: "malformed" }), null);
    allowed(await authorization(connection.db, owner, { ...sensitive, public_id: sensitive.public_id.toUpperCase() }), sensitive, true);
  });

  await t.test("authorship, report assignment and future professional input create no management authority", async () => {
    await connection.pool.query(`INSERT INTO feeding_logs(public_id,station_id,user_id)
      VALUES($1,$2,$3)`, [publicId(), sensitive.id, unrelated.id]);
    await connection.pool.query(`INSERT INTO reports(public_id,description,type,location,assigned_to)
      VALUES($1,'Synthetic independent assignment','general',ST_SetSRID(ST_MakePoint(34.7,32.1),4326),$2)`,
    [publicId(), unrelated.id]);
    allowed(await authorization(connection.db, unrelated, sensitive), sensitive, false);
    assert.equal(await authorization(connection.db, unrelated, sensitive, "manage"), null);
    await connection.db.transaction(async (tx) => {
      const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, {
        ...verifiedIdentityFixture(professional), role: "municipal", company: "Synthetic organization", ownerId: owner.public_id,
      });
      allowed(await lockAndAuthorizeStation(tx, principal, sensitive.public_id), sensitive, false);
      assert.equal(await lockAndAuthorizeStation(tx, principal, sensitive.public_id, "manage"), null);
    });
  });

  await t.test("account predicate includes dormant classifications before order/limit, without returning station content", async () => {
    await connection.pool.query("UPDATE feeding_stations SET created_at='2099-01-01Z' WHERE id=$1", [sensitive.id]);
    await connection.db.transaction(async (tx) => {
      const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(unrelated));
      const visible = await tx.select({ publicId: feedingStations.publicId }).from(feedingStations)
        .where(stationViewPredicate(tx, principal)).orderBy(desc(feedingStations.createdAt), desc(feedingStations.id)).limit(1);
      assert.deepEqual(visible, [{ publicId: sensitive.public_id }]);
      const all = await tx.select({ publicId: feedingStations.publicId }).from(feedingStations)
        .where(stationViewPredicate(tx, principal));
      assert.deepEqual(new Set(all.map(row => row.publicId)), new Set([sensitive.public_id, regular.public_id, inactive.public_id]));
      const guest = await tx.select({ publicId: feedingStations.publicId }).from(feedingStations)
        .where(stationViewPredicate(tx, null));
      assert.deepEqual(guest, []);
    });
  });

  await t.test("forged, deleted-account and cross-transaction principals fail closed", async () => {
    let previousPrincipal;
    await connection.db.transaction(async (tx) => {
      previousPrincipal = await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(owner));
      assert.ok(previousPrincipal);
      assert.equal(await lockAndAuthorizeStation(tx, { userId: owner.id }, sensitive.public_id), null);
      assert.equal(await resolveStationPrincipalFromVerifiedIdentity(tx, { _id: publicId() }), null);
    });
    await connection.db.transaction(async (tx) => {
      assert.equal(await lockAndAuthorizeStation(tx, previousPrincipal, sensitive.public_id), null);
      assert.deepEqual(await tx.select({ publicId: feedingStations.publicId }).from(feedingStations)
        .where(stationViewPredicate(tx, previousPrincipal)), []);
    });
    const deleted = await make.user("deleted");
    await connection.pool.query("DELETE FROM users WHERE id=$1", [deleted.id]);
    await connection.db.transaction(async (tx) => {
      assert.equal(await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(deleted)), null);
    });
    const disappearing = await make.user("deleted after resolution");
    await connection.db.transaction(async (tx) => {
      const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(disappearing));
      assert.ok(principal);
      await tx.execute(sql`DELETE FROM users WHERE id=${disappearing.id}`);
      assert.equal(await lockAndAuthorizeStation(tx, principal, regular.public_id), null);
    });
  });

  await t.test("dormant invalid/null classification cannot alter beta access or creator management; test-only corruption rolls back", async () => {
    const rollback = new Error("Synthetic invalid-classification fixture rollback");
    await assert.rejects(connection.db.transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE feeding_stations DROP CONSTRAINT feeding_stations_visibility_allowed`);
      await tx.execute(sql`ALTER TABLE feeding_stations ALTER COLUMN visibility DROP NOT NULL`);
      for (const value of ["unclassified", null]) {
        await tx.execute(sql`UPDATE feeding_stations SET visibility=${value} WHERE id=${sensitive.id}`);
        for (const user of [owner, grantee, unrelated]) {
          const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(user));
          allowed(await lockAndAuthorizeStation(tx, principal, sensitive.public_id), sensitive, user === owner);
          const management = await lockAndAuthorizeStation(tx, principal, sensitive.public_id, "manage");
          if (user === owner) allowed(management, sensitive, true);
          else assert.equal(management, null);
        }
        assert.equal(await lockAndAuthorizeStation(tx, null, sensitive.public_id), null);
      }
      throw rollback;
    }), (error) => error === rollback);
    allowed(await authorization(connection.db, owner, sensitive), sensitive, true);
  });

  await t.test("unsupported isolation is rejected instead of using a stale transaction snapshot", async () => {
    const unsafeTransaction = (error) => error instanceof TypeError
      && error.message === "Station authorization requires a READ COMMITTED transaction";
    await assert.rejects(resolveStationPrincipalFromVerifiedIdentity(connection.db, verifiedIdentityFixture(owner)), unsafeTransaction);
    for (const isolationLevel of ["repeatable read", "serializable"]) {
      await assert.rejects(connection.db.transaction(async (tx) => {
        const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(owner));
        await lockAndAuthorizeStation(tx, principal, sensitive.public_id);
      }, { isolationLevel }), unsafeTransaction);
    }
  });
  t.diagnostic("These are internal helper assertions. Separate HTTP/PG suites verify station JSON, feeding and media boundaries.");
});

test("station-first internal authorization preserves real independent-pool lock ordering with dormant grant/classification changes", async (t) => {
  const owned = await openTestDatabase(t);
  await applyLocalMigrations(owned, "test", owned.url);
  const make = await fixtures(owned);
  const owner = await make.user("owner"), grantee = await make.user("grantee"), unrelated = await make.user("unrelated");
  const actor = async (t, label) => {
    const name = `ray-policy-${label.slice(0, 32)}-${randomBytes(6).toString("hex")}`;
    assert.match(name, /^[a-z0-9-]+$/);
    assert.ok(Buffer.byteLength(name, "utf8") <= 63, "PostgreSQL application_name must not truncate lock-observer identity");
    const connection = createPostgres({ ...localConfig("test", owned.url), application_name: name, max: 1 });
    t.after(() => connection.close());
    await assertDatabaseIdentity(connection.pool, "test");
    return { ...connection, name };
  };
  const waitForBlock = async (name, blockerPid, queryPart) => {
    const deadline = Date.now() + 8_000;
    do {
      const { rows } = await owned.pool.query(`SELECT pid FROM pg_stat_activity
        WHERE application_name=$1 AND wait_event_type='Lock'
          AND $2::integer=ANY(pg_blocking_pids(pid)) AND position($3 in lower(query))>0`,
      [name, blockerPid, queryPart]);
      if (rows.length === 1) return rows[0].pid;
      await delay(15); // bounded observation of a lock edge, never a sleep-based ordering assumption
    } while (Date.now() < deadline);
    throw new Error(`Expected station policy lock edge was not observed: ${queryPart}`);
  };
  const pidOf = async (tx) => (await tx.execute(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid;

  for (const mode of ["revoke-commit", "restrict-commit", "revoke-rollback"]) {
    await t.test(`${mode}: waiting view retains account access after dormant metadata commit or rollback`, async (t) => {
      const station = await make.station(owner, mode === "restrict-commit" ? "regular" : "sensitive");
      if (mode !== "restrict-commit") await make.grant(station, grantee, owner);
      const writer = await actor(t, `${mode}-writer`), reader = await actor(t, `${mode}-reader`);
      const locked = deferred(), release = deferred();
      const rollback = new Error("Synthetic policy writer rollback");
      let read;
      const mutation = writer.db.transaction(async (tx) => {
        const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(owner));
        allowed(await lockAndAuthorizeStation(tx, principal, station.public_id, "manage"), station, true);
        if (mode === "restrict-commit") await tx.execute(sql`UPDATE feeding_stations SET visibility='sensitive' WHERE id=${station.id}`);
        else await tx.execute(sql`UPDATE station_access_grants SET revoked_at=clock_timestamp()
          WHERE station_id=${station.id} AND user_id=${grantee.id}`);
        locked.resolve(await pidOf(tx));
        await release.promise;
        if (mode === "revoke-rollback") throw rollback;
      });
      mutation.catch(locked.reject);
      try {
        const writerPid = await locked.promise;
        read = authorization(reader.db, mode === "restrict-commit" ? unrelated : grantee, station);
        read.catch(() => {});
        const readerPid = await waitForBlock(reader.name, writerPid, "for share");
        assert.notEqual(readerPid, writerPid);
        release.resolve();
        if (mode === "revoke-rollback") await assert.rejects(mutation, (error) => error === rollback);
        else await mutation;
        const result = await read;
        allowed(result, station, false);
        if (mode === "restrict-commit") {
          assert.equal((await owned.pool.query("SELECT visibility FROM feeding_stations WHERE id=$1", [station.id])).rows[0].visibility, "sensitive");
        } else {
          const grant = (await owned.pool.query("SELECT revoked_at FROM station_access_grants WHERE station_id=$1 AND user_id=$2", [station.id, grantee.id])).rows[0];
          assert.equal(grant.revoked_at === null, mode === "revoke-rollback");
        }
      } finally {
        release.resolve();
        await Promise.allSettled([mutation, ...(read ? [read] : [])]);
      }
    });
  }

  await t.test("view-first shared station lock orders dormant grant writes without changing subsequent beta access", async (t) => {
    const station = await make.station(owner);
    await make.grant(station, grantee, owner);
    const reader = await actor(t, "view-first"), writer = await actor(t, "revoke-second");
    const locked = deferred(), release = deferred();
    let revoke;
    const read = reader.db.transaction(async (tx) => {
      const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(grantee));
      const decision = await lockAndAuthorizeStation(tx, principal, station.public_id);
      allowed(decision, station, false);
      locked.resolve(await pidOf(tx));
      await release.promise;
      return decision;
    });
    read.catch(locked.reject);
    try {
      const readerPid = await locked.promise;
      revoke = writer.db.transaction(async (tx) => {
        const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(owner));
        allowed(await lockAndAuthorizeStation(tx, principal, station.public_id, "manage"), station, true);
        await tx.execute(sql`UPDATE station_access_grants SET revoked_at=clock_timestamp()
          WHERE station_id=${station.id} AND user_id=${grantee.id}`);
      });
      revoke.catch(() => {});
      const writerPid = await waitForBlock(writer.name, readerPid, "for update");
      assert.notEqual(writerPid, readerPid);
      release.resolve();
      allowed(await read, station, false);
      await revoke;
      allowed(await authorization(reader.db, grantee, station), station, false);
    } finally {
      release.resolve();
      await Promise.allSettled([read, ...(revoke ? [revoke] : [])]);
    }
  });

  await t.test("failed internal transaction releases station lock and rolls back its grant mutation", async (t) => {
    const station = await make.station(owner);
    await make.grant(station, grantee, owner);
    const writer = await actor(t, "rollback-writer"), next = await actor(t, "after-rollback");
    const rollback = new Error("Synthetic post-authorization failure");
    await assert.rejects(writer.db.transaction(async (tx) => {
      const principal = await resolveStationPrincipalFromVerifiedIdentity(tx, verifiedIdentityFixture(owner));
      allowed(await lockAndAuthorizeStation(tx, principal, station.public_id, "manage"), station, true);
      await tx.execute(sql`UPDATE station_access_grants SET revoked_at=clock_timestamp()
        WHERE station_id=${station.id} AND user_id=${grantee.id}`);
      throw rollback;
    }), (error) => error === rollback);
    const client = await next.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM feeding_stations WHERE id=$1 FOR UPDATE NOWAIT", [station.id]);
      await client.query("ROLLBACK");
    } finally {
      try { await client.query("ROLLBACK"); } finally { client.release(true); }
    }
    allowed(await authorization(next.db, grantee, station), station, false);
    assert.equal((await owned.pool.query("SELECT revoked_at FROM station_access_grants WHERE station_id=$1 AND user_id=$2", [station.id, grantee.id])).rows[0].revoked_at, null);
  });
  t.diagnostic("Observed station lock edges establish internal transaction ordering only. Grant-management routes remain unavailable.");
});
