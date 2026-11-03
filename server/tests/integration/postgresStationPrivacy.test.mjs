import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { openTestDatabase } from "./database.mjs";
import { applyLocalMigrations } from "../../dist/db/migrate.js";
import { createPreviewApp } from "../../dist/preview/app.js";
import { createPostgres } from "../../dist/db/connection.js";
import { localConfig, assertDatabaseIdentity } from "../../dist/db/local-config.js";

const id = () => randomBytes(12).toString("hex");
const secret = "synthetic-station-privacy-endpoint-secret";
const base = "/api/feeding-stations";
const discoveryKeys = ["_id", "name", "location", "estimatedCats", "estimatedKittens", "visibility", "permissions"];
const ownKeys = ["_id", "stationId", "fedAt", "food", "water", "createdAt", "updatedAt"];
const hidden = { status: 404, body: { message: "Feeding station not found" } };
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
const shape = ({ status, body }) => ({ status, body });

async function serve(t, connection) {
  const server = createPreviewApp(connection, secret).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return async (method, path, body, token, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  };
}

async function fixtures(connection, request) {
  const user = async label => {
    const row = (await connection.pool.query(`INSERT INTO users(public_id,first_name,last_name,email,password_hash)
      VALUES($1,$2,'Synthetic',$3,'synthetic-unused-hash') RETURNING id,public_id`,
    [id(), `Synthetic ${label}`, `${randomUUID()}@example.invalid`])).rows[0];
    return { ...row, token: jwt.sign({ id: row.public_id, role: "municipal", profession: "veterinarian" }, secret, { expiresIn: "1h" }) };
  };
  const owner = await user("owner"), grantee = await user("grantee"), outsider = await user("outsider");
  const revoked = await user("revoked"), wrongGrantor = await user("wrong grantor");
  const station = async (visibility, extra = {}) => {
    const made = await request("POST", base, { name: "Synthetic protected station", location: { lat: 32.1, lng: 34.8 },
      notes: "Synthetic private location note", ...(visibility === undefined ? {} : { visibility }), ...extra }, owner.token);
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const row = (await connection.pool.query("SELECT id,public_id FROM feeding_stations WHERE public_id=$1", [made.body._id])).rows[0];
    return { ...row, dto: made.body };
  };
  const grant = (parent, recipient, grantor = owner, revoke = false) => connection.pool.query(`
    INSERT INTO station_access_grants(station_id,user_id,granted_by,granted_at,revoked_at)
    VALUES($1,$2,$3,'2026-01-01Z',CASE WHEN $4 THEN '2026-01-01Z'::timestamptz ELSE NULL END)`,
  [parent.id, recipient.id, grantor.id, revoke]);
  return { owner, grantee, outsider, revoked, wrongGrantor, station, grant };
}

test("actual PostgreSQL preview routes enforce station/feed audiences, minimized DTOs and private caching", async t => {
  const unexpected = () => assert.fail("No Mongo operation permitted in PostgreSQL station privacy tests");
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  const connection = await openTestDatabase(t);
  await applyLocalMigrations(connection, "test", connection.url);
  const request = await serve(t, connection), f = await fixtures(connection, request);
  const sensitive = await f.station(), regular = await f.station("regular"), inactive = await f.station("sensitive");
  await connection.pool.query("UPDATE feeding_stations SET active=false WHERE id=$1", [inactive.id]);
  await f.grant(sensitive, f.grantee);
  await f.grant(sensitive, f.revoked, f.owner, true);
  await f.grant(sensitive, f.wrongGrantor, f.outsider);

  const privateHeaders = response => {
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("etag"), null);
  };

  await t.test("guests and invalid tokens receive 401 on every path, including HEAD and unknown methods", async () => {
    for (const token of [undefined, "invalid"]) for (const [method, path, body] of [
      ["GET", base], ["HEAD", base], ["GET", `${base}/${regular.public_id}`], ["HEAD", `${base}/${sensitive.public_id}`],
      ["GET", `${base}/${sensitive.public_id}/feedings`], ["GET", `${base}/${regular.public_id}/feeding-summary`],
      ["POST", `${base}/${regular.public_id}/feedings`, {}], ["DELETE", `${base}/${sensitive.public_id}`],
    ]) {
      const response = await request(method, path, body, token);
      assert.equal(response.status, 401);
      privateHeaders(response);
      if (method === "HEAD") assert.equal(response.body, null);
      else keys(response.body, ["error"]);
    }
  });

  await t.test("regular authenticated access/feed; sensitive owner/grantee only; no professional or wrong-grantor bypass", async () => {
    assert.equal(sensitive.dto.visibility, "sensitive");
    for (const actor of [f.owner, f.grantee, f.outsider, f.revoked, f.wrongGrantor]) {
      const allowedSensitive = [f.owner, f.grantee].includes(actor);
      const list = await request("GET", base, undefined, actor.token);
      assert.equal(list.status, 200); privateHeaders(list);
      assert.deepEqual(new Set(list.body.map(s => s._id)), new Set([regular.public_id, ...(allowedSensitive ? [sensitive.public_id] : [])]));
      assert.equal(list.headers.get("x-total-count"), null);
      list.body.forEach(row => { keys(row, discoveryKeys); keys(row.location, ["lat", "lng"]); keys(row.permissions, ["canFeed", "canManage"]); });
      for (const parent of [regular, sensitive]) {
        const detail = await request("GET", `${base}/${parent.public_id}`, undefined, actor.token);
        const feed = await request("POST", `${base}/${parent.public_id}/feedings`, { water: true, note: `own ${actor.public_id}` }, actor.token);
        if (parent === sensitive && !allowedSensitive) {
          assert.deepEqual(shape(detail), hidden); assert.deepEqual(shape(feed), hidden);
        } else {
          assert.equal(detail.status, 200); assert.equal(feed.status, 201);
          keys(detail.body, [...discoveryKeys, "active", "notes"]);
          assert.equal(detail.body.permissions.canManage, actor === f.owner);
          assert.equal(detail.body.permissions.canFeed, true);
          keys(feed.body, [...ownKeys, "note"]);
        }
        privateHeaders(detail); privateHeaders(feed);
      }
    }
  });

  await t.test("inaccessible, revoked and nonexistent IDs are indistinguishable across detail/history/summary/write", async () => {
    const missing = id();
    for (const actor of [f.outsider, f.revoked, f.wrongGrantor]) for (const parent of [sensitive.public_id, missing]) {
      for (const [method, tail, body] of [["GET", ""], ["GET", "/feedings"], ["GET", "/feeding-summary"], ["POST", "/feedings", {}]]) {
        assert.deepEqual(shape(await request(method, `${base}/${parent}${tail}`, body, actor.token)), hidden);
      }
    }
    assert.equal((await request("POST", `${base}/${inactive.public_id}/feedings`, {}, f.owner.token)).status, 409);
    assert.equal((await request("GET", `${base}/${inactive.public_id}/feedings`, undefined, f.owner.token)).status, 200);
  });

  await t.test("own history excludes every other author; owner gets no extra personal feed records", async () => {
    for (const actor of [f.owner, f.grantee, f.outsider]) {
      const history = await request("GET", `${base}/${regular.public_id}/feedings`, undefined, actor.token);
      assert.equal(history.status, 200);
      assert.equal(history.body.length, 1);
      assert.equal(history.body[0].note, `own ${actor.public_id}`);
      history.body.forEach(row => keys(row, [...ownKeys, "note"]));
    }
    const summary = await request("GET", `${base}/${regular.public_id}/feeding-summary`, undefined, f.outsider.token);
    assert.equal(summary.status, 200);
    assert.deepEqual(summary.body, { food: { recency: "under-2h" }, water: { recency: "under-2h" } });
    assert.doesNotMatch(JSON.stringify(summary.body), /stationId|userId|note|fedAt|createdAt|updatedAt|count|asOf|_id|Synthetic/);
  });

  await t.test("revocation removes station-scoped own-history access while preserving rows", async () => {
    const before = (await connection.pool.query("SELECT * FROM feeding_logs WHERE station_id=$1 AND user_id=$2 ORDER BY id", [sensitive.id, f.grantee.id])).rows;
    assert.equal(before.length, 1);
    const client = await connection.pool.connect();
    await client.query("BEGIN");
    try {
      await client.query("SELECT id FROM feeding_stations WHERE id=$1 FOR UPDATE", [sensitive.id]);
      await client.query("UPDATE station_access_grants SET revoked_at=clock_timestamp() WHERE station_id=$1 AND user_id=$2", [sensitive.id, f.grantee.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    assert.deepEqual(shape(await request("GET", `${base}/${sensitive.public_id}/feedings`, undefined, f.grantee.token)), hidden);
    assert.deepEqual((await connection.pool.query("SELECT * FROM feeding_logs WHERE station_id=$1 AND user_id=$2 ORDER BY id", [sensitive.id, f.grantee.id])).rows, before);
  });

  await t.test("authorized HEAD has no body/ETag/304; unexpected methods cannot disclose or mutate", async () => {
    for (const path of [base, `${base}/${sensitive.public_id}`, `${base}/${regular.public_id}/feedings`, `${base}/${regular.public_id}/feeding-summary`]) {
      const head = await request("HEAD", path, undefined, f.owner.token, { "If-None-Match": "*", "If-Modified-Since": "Tue, 01 Jan 2099 00:00:00 GMT" });
      assert.equal(head.status, 200); assert.equal(head.body, null); privateHeaders(head);
    }
    for (const method of ["DELETE", "PUT", "PATCH"]) {
      const response = await request(method, `${base}/${sensitive.public_id}`, {}, f.outsider.token);
      assert.equal(response.status, 404); privateHeaders(response);
    }
    assert.equal((await request("POST", `${base}/${sensitive.public_id}/grants`, {}, f.owner.token)).status, 404);
    assert.equal((await request("POST", "/api/station-access/recipient-reference", {}, f.owner.token)).status, 503);
  });

  await t.test("unsupported image input cannot be written and legacy external image data is preserved but omitted", async () => {
    const url = "https://unsupported.example.invalid/synthetic-location.jpg";
    assert.equal((await request("POST", base, { name: "Synthetic invalid image", location: { lat: 32, lng: 34 }, image: url }, f.owner.token)).status, 400);
    await connection.pool.query("UPDATE feeding_stations SET image=$1,image_present=true WHERE id=$2", [url, sensitive.id]);
    const detail = await request("GET", `${base}/${sensitive.public_id}`, undefined, f.owner.token);
    assert.equal(detail.status, 200); assert.equal(Object.hasOwn(detail.body, "image"), false);
    assert.equal((await connection.pool.query("SELECT image FROM feeding_stations WHERE id=$1", [sensitive.id])).rows[0].image, url);
  });

  await t.test("SQL-filtered pagination has no hidden totals or cursor anchors; unsupported search/filter inputs fail safely", async () => {
    const expected = [regular.public_id];
    const paginationRows = [];
    await connection.pool.query("UPDATE feeding_stations SET created_at='2020-01-01Z' WHERE id=$1", [regular.id]);
    for (let n = 0; n < 4; n++) {
      const parent = await f.station("regular");
      expected.push(parent.public_id);
      paginationRows.push(parent);
      // timestamp(3) rounds these inputs to .123 and .124 seconds. The first
      // three rows tie at millisecond precision across one-row page boundaries.
      await connection.pool.query("UPDATE feeding_stations SET created_at=$1 WHERE id=$2", [
        n < 3 ? "2030-01-01T00:00:00.123456Z" : "2030-01-01T00:00:00.123789Z", parent.id,
      ]);
    }
    const stored = (await connection.pool.query(`SELECT public_id,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
      FROM feeding_stations WHERE id=ANY($1::uuid[])`, [paginationRows.map(row => row.id)])).rows;
    assert.deepEqual(Object.fromEntries(stored.map(row => [row.public_id, row.created_at])),
      Object.fromEntries(paginationRows.map((row, n) => [row.public_id,
        n < 3 ? "2030-01-01T00:00:00.123000Z" : "2030-01-01T00:00:00.124000Z"])));
    const tiedOrder = paginationRows.slice(0, 3).sort((a, b) => a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
      .map(row => row.public_id);
    // Put hidden records ahead of visible rows. Pagination must scope before
    // LIMIT and must not issue hidden-inclusive totals or a hidden cursor.
    await connection.pool.query("UPDATE feeding_stations SET created_at='2099-01-01Z' WHERE id=$1", [sensitive.id]);
    const seen = [];
    let after;
    do {
      const page = await request("GET", base + "?limit=1" + (after ? `&after=${after}` : ""), undefined, f.outsider.token);
      assert.equal(page.status, 200);
      assert.equal(page.body.length, 1);
      seen.push(page.body[0]._id);
      after = page.headers.get("x-next-cursor");
      if (after) assert.equal(after, page.body.at(-1)._id);
      assert.equal(page.headers.get("x-total-count"), null);
      assert.ok(seen.length <= expected.length, "pagination must advance");
    } while (after);
    assert.deepEqual(new Set(seen), new Set(expected));
    assert.equal(seen.length, expected.length);
    assert.deepEqual(seen, [paginationRows[3].public_id, ...tiedOrder, regular.public_id]);
    const badCursor = await request("GET", `${base}?after=${sensitive.public_id}`, undefined, f.outsider.token);
    assert.deepEqual(shape(badCursor), shape(await request("GET", `${base}?after=${id()}`, undefined, f.outsider.token)));
    assert.equal(badCursor.status, 400);
    for (const query of ["limit=0", "limit=201", "limit=1.5", "limit=01", "limit=1&limit=2", "after=invalid", "search=Synthetic", "active=false", "createdBy=" + f.owner.public_id]) {
      assert.equal((await request("GET", `${base}?${query}`, undefined, f.outsider.token)).status, 400);
    }
    assert.equal((await request("GET", `${base}/${sensitive.public_id}?unknown=true`, undefined, f.owner.token)).status, 400);
  });

  await t.test("own-log cursors/order are author and parent scoped, preserving null/presence and future timestamps", async () => {
    const own = [];
    // These microsecond inputs are rounded by timestamp(3); verify the stored
    // milliseconds and equal-key ties before exercising paginated ordering.
    for (const [fedAt, createdAt] of [["2020-01-01Z", "2021-01-01Z"], ["2022-01-01Z", "2021-01-01Z"],
      ["2022-01-01T00:00:00.123456Z", "2023-01-01T00:00:00.456789Z"],
      ["2022-01-01T00:00:00.123456Z", "2023-01-01T00:00:00.456789Z"],
      ["2022-01-01T00:00:00.123456Z", "2023-01-01T00:00:00.456789Z"],
      ["2022-01-01T00:00:00.123789Z", "2023-01-01T00:00:00.456789Z"], ["2099-01-01Z", "2024-01-01Z"]]) {
      const row = (await connection.pool.query(`INSERT INTO feeding_logs(public_id,station_id,user_id,fed_at,created_at,updated_at,food,water,period,period_present,note,note_present)
        VALUES($1,$2,$3,$4,$5,$5,false,false,NULL,true,NULL,true) RETURNING id,public_id,fed_at,created_at,
        to_char(fed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS stored_fed_at,
        to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS stored_created_at`,
      [id(), regular.id, f.wrongGrantor.id, fedAt, createdAt])).rows[0];
      own.push(row);
    }
    assert.deepEqual(own.slice(2, 6).map(row => [row.stored_fed_at, row.stored_created_at]), [
      ["2022-01-01T00:00:00.123000Z", "2023-01-01T00:00:00.457000Z"],
      ["2022-01-01T00:00:00.123000Z", "2023-01-01T00:00:00.457000Z"],
      ["2022-01-01T00:00:00.123000Z", "2023-01-01T00:00:00.457000Z"],
      ["2022-01-01T00:00:00.124000Z", "2023-01-01T00:00:00.457000Z"],
    ]);
    const tiedOrder = own.slice(2, 5).sort((a, b) => a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
      .map(row => row.public_id);
    const expected = (await connection.pool.query(`SELECT public_id FROM feeding_logs WHERE station_id=$1 AND user_id=$2
      ORDER BY fed_at DESC,created_at DESC,id DESC`, [regular.id, f.wrongGrantor.id])).rows.map(row => row.public_id);
    const seen = [];
    let after;
    do {
      const page = await request("GET", `${base}/${regular.public_id}/feedings?limit=2` + (after ? `&after=${after}` : ""), undefined, f.wrongGrantor.token);
      assert.equal(page.status, 200);
      assert.ok(page.body.length <= 2);
      seen.push(...page.body.map(row => row._id));
      for (const row of page.body.filter(row => own.some(value => value.public_id === row._id))) {
        keys(row, [...ownKeys, "period", "note"]);
        assert.equal(row.period, null); assert.equal(row.note, null);
      }
      after = page.headers.get("x-next-cursor");
      assert.ok(seen.length <= expected.length);
    } while (after);
    assert.deepEqual(seen, expected);
    assert.deepEqual(seen.filter(publicId => tiedOrder.includes(publicId)), tiedOrder);
    const otherAuthorLog = (await connection.pool.query("SELECT public_id FROM feeding_logs WHERE station_id=$1 AND user_id=$2 LIMIT 1", [regular.id, f.owner.id])).rows[0].public_id;
    const crossAuthor = await request("GET", `${base}/${regular.public_id}/feedings?after=${otherAuthorLog}`, undefined, f.wrongGrantor.token);
    assert.equal(crossAuthor.status, 400);
    assert.deepEqual(shape(crossAuthor), shape(await request("GET", `${base}/${regular.public_id}/feedings?after=${id()}`, undefined, f.wrongGrantor.token)));
    assert.equal((await request("GET", `${base}/${regular.public_id}/feedings?limit=101`, undefined, f.owner.token)).status, 400);
  });

  await t.test("summary independently buckets food/water and excludes future/neither events, retaining all own history", async () => {
    const parent = await f.station("regular");
    const summary = () => request("GET", `${base}/${parent.public_id}/feeding-summary`, undefined, f.outsider.token);
    assert.deepEqual((await summary()).body, { food: { recency: "no-record" }, water: { recency: "no-record" } });
    const record = async (age, food, water, author = f.owner) => connection.pool.query(`
      INSERT INTO feeding_logs(public_id,station_id,user_id,fed_at,food,water,note,note_present)
      VALUES($1,$2,$3,clock_timestamp()-$4::interval,$5,$6,'Synthetic private note',true)`,
    [id(), parent.id, author.id, age, food, water]);
    await record("-3 days", true, true);
    await record("0 seconds", false, false);
    assert.deepEqual((await summary()).body, { food: { recency: "no-record" }, water: { recency: "no-record" } });
    for (const [age, bucket] of [["2 days", "older"], ["18 hours", "12-to-24h"], ["8 hours", "6-to-12h"], ["3 hours", "2-to-6h"], ["1 hour", "under-2h"]]) {
      await record(age, true, false);
      assert.deepEqual((await summary()).body, { food: { recency: bucket }, water: { recency: "no-record" } });
    }
    await record("8 hours", false, true, f.grantee);
    assert.deepEqual((await summary()).body, { food: { recency: "under-2h" }, water: { recency: "6-to-12h" } });
    const own = await request("GET", `${base}/${parent.public_id}/feedings`, undefined, f.owner.token);
    assert.equal(own.status, 200);
    assert.equal(own.body.length, 7);
    assert.ok(own.body.some(row => Date.parse(row.fedAt) > Date.now()), "future own receipts must remain available");
  });

  await t.test("unknown stored visibility fails closed even for creator; synthetic corruption is restored", async () => {
    const parent = await f.station();
    await connection.pool.query("ALTER TABLE feeding_stations DROP CONSTRAINT feeding_stations_visibility_allowed");
    try {
      await connection.pool.query("UPDATE feeding_stations SET visibility='unclassified-synthetic' WHERE id=$1", [parent.id]);
      for (const actor of [f.owner, f.outsider]) {
        assert.deepEqual(shape(await request("GET", `${base}/${parent.public_id}`, undefined, actor.token)), hidden);
        assert.deepEqual(shape(await request("POST", `${base}/${parent.public_id}/feedings`, {}, actor.token)), hidden);
        assert.equal((await request("GET", base, undefined, actor.token)).body.some(row => row._id === parent.public_id), false);
      }
    } finally {
      await connection.pool.query("UPDATE feeding_stations SET visibility='sensitive' WHERE id=$1", [parent.id]);
      await connection.pool.query("ALTER TABLE feeding_stations ADD CONSTRAINT feeding_stations_visibility_allowed CHECK (visibility IN ('sensitive','regular'))");
    }
  });

  await t.test("malformed parser and forwarded SQL failures retain private no-store headers and safe errors", async () => {
    const malformed = await request("POST", base, "{", f.owner.token);
    assert.equal(malformed.status, 400); privateHeaders(malformed);
    await connection.pool.query("ALTER TABLE feeding_stations RENAME COLUMN name TO synthetic_hidden_name");
    try {
      for (const path of [base, `${base}/${sensitive.public_id}`]) {
        const response = await request("GET", path, undefined, f.owner.token);
        assert.equal(response.status, 500); privateHeaders(response);
        assert.deepEqual(response.body, { error: "ServerError", message: "Internal Server Error" });
        assert.doesNotMatch(JSON.stringify(response.body), /synthetic_hidden_name|SELECT|uuid|postgres|Synthetic private location note/i);
      }
    } finally { await connection.pool.query("ALTER TABLE feeding_stations RENAME COLUMN synthetic_hidden_name TO name"); }
  });
});

test("actual station/feed endpoints serialize against revoke/classification writers on independent PostgreSQL sessions", async t => {
  const owned = await openTestDatabase(t);
  await applyLocalMigrations(owned, "test", owned.url);
  const request = await serve(t, owned), f = await fixtures(owned, request);
  const actor = async (t, label) => {
    const name = `ray-api-${label}-${randomBytes(6).toString("hex")}`;
    const connection = createPostgres({ ...localConfig("test", owned.url), application_name: name, max: 1 });
    t.after(() => connection.close());
    await assertDatabaseIdentity(connection.pool, "test");
    return { ...connection, name };
  };
  const waitForBlock = async (name, blockerPid, queryPart) => {
    const deadline = Date.now() + 8000;
    do {
      const result = await owned.pool.query(`SELECT pid FROM pg_stat_activity
        WHERE application_name=$1 AND wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid))
          AND position($3 in lower(query))>0`, [name, blockerPid, queryPart]);
      if (result.rows.length === 1) return result.rows[0].pid;
      await delay(15);
    } while (Date.now() < deadline);
    throw new Error(`Expected actual endpoint lock edge was not observed: ${queryPart}`);
  };

  for (const mode of ["revoke-commit", "revoke-rollback", "restrict-commit", "restrict-rollback"]) {
    await t.test(`${mode}: waiting production request rechecks committed authorization after lock`, async t => {
      const restricting = mode.startsWith("restrict");
      const parent = await f.station(restricting ? "regular" : "sensitive");
      if (!restricting) await f.grant(parent, f.grantee);
      const mutation = await actor(t, `${mode}-writer`), api = await actor(t, `${mode}-api`);
      const send = await serve(t, api), client = await mutation.pool.connect();
      const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      let pending;
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM feeding_stations WHERE id=$1 FOR UPDATE", [parent.id]);
        if (restricting) await client.query("UPDATE feeding_stations SET visibility='sensitive' WHERE id=$1", [parent.id]);
        else await client.query("UPDATE station_access_grants SET revoked_at=clock_timestamp() WHERE station_id=$1 AND user_id=$2", [parent.id, f.grantee.id]);
        pending = restricting
          ? send("GET", `${base}/${parent.public_id}`, undefined, f.outsider.token)
          : send("POST", `${base}/${parent.public_id}/feedings`, { water: true }, f.grantee.token);
        pending.catch(() => {});
        const waitingPid = await waitForBlock(api.name, pid, "for share");
        assert.notEqual(waitingPid, pid);
        await client.query(mode.endsWith("rollback") ? "ROLLBACK" : "COMMIT");
        const response = await pending;
        if (mode.endsWith("commit")) assert.deepEqual(shape(response), hidden);
        else assert.equal(response.status, restricting ? 200 : 201);
        const stored = (await owned.pool.query("SELECT count(*)::int AS n FROM feeding_logs WHERE station_id=$1", [parent.id])).rows[0].n;
        assert.equal(stored, mode === "revoke-rollback" ? 1 : 0);
        if (mode === "revoke-commit") {
          // A later attempt cannot reuse the prior auth boundary's principal.
          assert.deepEqual(shape(await send("POST", `${base}/${parent.public_id}/feedings`, {}, f.grantee.token)), hidden);
        }
        t.diagnostic(`${mode}: observed distinct backend PIDs ${pid}/${waitingPid}; station FOR SHARE waited on policy writer, then production endpoint used the post-lock policy.`);
      } finally {
        try { await client.query("ROLLBACK"); }
        finally { client.release(); if (pending) await Promise.allSettled([pending]); }
      }
    });
  }

  await t.test("admitted feeding retains its shared station lock through INSERT; owner revoke waits and later feed is denied", async t => {
    const parent = await f.station();
    await f.grant(parent, f.grantee);
    const tableGate = await actor(t, "feed-gate"), api = await actor(t, "feed-first"), mutation = await actor(t, "revoke-second");
    const send = await serve(t, api), gate = await tableGate.pool.connect(), writer = await mutation.pool.connect();
    const gatePid = (await gate.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    let feeding, revoke;
    try {
      await gate.query("BEGIN");
      await gate.query("LOCK TABLE feeding_logs IN SHARE MODE");
      feeding = send("POST", `${base}/${parent.public_id}/feedings`, { food: false, water: true }, f.grantee.token);
      feeding.catch(() => {});
      const feedingPid = await waitForBlock(api.name, gatePid, "insert into");
      await writer.query("BEGIN");
      revoke = writer.query("SELECT id FROM feeding_stations WHERE id=$1 FOR UPDATE", [parent.id]);
      revoke.catch(() => {});
      const writerPid = await waitForBlock(mutation.name, feedingPid, "for update");
      assert.notEqual(writerPid, feedingPid);
      await gate.query("COMMIT");
      assert.equal((await feeding).status, 201);
      await revoke;
      const observed = (await writer.query("SELECT count(*)::int AS n FROM feeding_logs WHERE station_id=$1", [parent.id])).rows[0].n;
      assert.equal(observed, 1);
      await writer.query("UPDATE station_access_grants SET revoked_at=clock_timestamp() WHERE station_id=$1 AND user_id=$2", [parent.id, f.grantee.id]);
      await writer.query("COMMIT");
      assert.deepEqual(shape(await send("POST", `${base}/${parent.public_id}/feedings`, {}, f.grantee.token)), hidden);
      assert.equal((await owned.pool.query("SELECT count(*)::int AS n FROM feeding_logs WHERE station_id=$1", [parent.id])).rows[0].n, 1);
      t.diagnostic(`feed-first: INSERT at PID ${feedingPid} waited on gate ${gatePid}; revoke PID ${writerPid} waited on station lock, observed exactly one committed feeding, then blocked all later feed attempts.`);
    } finally {
      try { await gate.query("ROLLBACK"); }
      finally {
        gate.release();
        if (feeding) await Promise.allSettled([feeding]);
        if (revoke) await Promise.allSettled([revoke]);
        try { await writer.query("ROLLBACK"); } finally { writer.release(); }
      }
    }
  });
});
