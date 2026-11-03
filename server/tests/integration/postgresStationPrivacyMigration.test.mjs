import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { applyLocalMigrations } from "../../dist/db/migrate.js";
import { assertNoExistingRayObjects, openTestDatabase } from "./database.mjs";

const publicId = () => randomBytes(12).toString("hex");
const codeIs = (code) => (error) => { assert.equal(error.cause?.code ?? error.code, code); return true; };
const migrationsRoot = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
const oldTables = ["users", "feeding_stations", "feeding_logs", "reports", "media_assets"];
const checksum = Buffer.alloc(32, 7).toString("base64");
const createdAt = "2019-02-03T04:05:06.123Z";
const updatedAt = "2020-07-08T09:10:11.456Z";

async function insertUser(pool, suffix, extra = {}) {
  const { rows } = await pool.query(`INSERT INTO users
    (public_id,first_name,last_name,email,password_hash,company,company_present,
     legacy_name,legacy_name_present,created_at,updated_at)
    VALUES($1,$2,'Synthetic',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
  [publicId(), `Synthetic ${suffix}`, `${randomUUID()}@example.invalid`, `synthetic-hash-${suffix}`,
    extra.company ?? null, extra.companyPresent ?? false, extra.legacyName ?? null,
    extra.legacyNamePresent ?? false, createdAt, updatedAt]);
  return rows[0];
}

async function insertStation(pool, owner, extra = {}) {
  const { rows } = await pool.query(`INSERT INTO feeding_stations
    (public_id,name,location,created_by,estimated_cats,estimated_kittens,image,notes,
     image_present,notes_present,legacy_version,legacy_version_present,active,created_at,updated_at)
    VALUES($1,$2,ST_SetSRID(ST_MakePoint(34.781812345,32.085312345),4326),$3,
     7,2,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
  [publicId(), "Synthetic preserved station", owner.id, extra.image ?? null, extra.notes ?? null,
    extra.imagePresent ?? true, extra.notesPresent ?? true, extra.legacyVersion ?? null,
    extra.legacyVersionPresent ?? false, extra.active ?? true, createdAt, updatedAt]);
  return rows[0];
}

async function oldRows(pool) {
  const snapshot = {};
  for (const table of oldTables) {
    // Fixed suite-owned names only; a full row comparison covers every old column.
    snapshot[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  return snapshot;
}

async function geometrySnapshot(pool) {
  return (await pool.query(`SELECT 'station' AS kind,public_id,
      encode(ST_AsEWKB(location),'hex') AS ewkb,ST_SRID(location) AS srid,
      ST_X(location) AS lng,ST_Y(location) AS lat FROM feeding_stations
    UNION ALL SELECT 'report',public_id,encode(ST_AsEWKB(location),'hex'),
      ST_SRID(location),ST_X(location),ST_Y(location) FROM reports ORDER BY kind,public_id`)).rows;
}

async function geometryTypes(pool) {
  return (await pool.query(`SELECT attrelid::regclass::text AS table_name,
    format_type(atttypid,atttypmod) AS type FROM pg_attribute
    WHERE attrelid=ANY($1::regclass[]) AND attname='location' ORDER BY table_name`,
  [["feeding_stations", "reports"]])).rows;
}

async function migrationHashes(entries) {
  return Promise.all(entries.map(async (entry) => ({
    hash: createHash("sha256").update(await readFile(join(migrationsRoot, `${entry.tag}.sql`))).digest("hex"),
    when: entry.when,
  })));
}

test("guarded existing-object probe refuses a grant-table sentinel without adopting, clearing or migrating it", async (t) => {
  const connection = await openTestDatabase(t);
  const { pool } = connection;
  // openTestDatabase established identity, exclusive suite lock and initial empty
  // ownership. Only this disposable suite creates/cleans the sentinel below.
  await pool.query("CREATE TABLE public.station_access_grants (marker text PRIMARY KEY)");
  const marker = `Synthetic untouched sentinel ${randomUUID()}`;
  await pool.query("INSERT INTO public.station_access_grants(marker) VALUES($1)", [marker]);
  const snapshot = async () => ({
    rows: (await pool.query("SELECT * FROM public.station_access_grants ORDER BY marker")).rows,
    object: (await pool.query("SELECT oid,relfilenode FROM pg_class WHERE oid='public.station_access_grants'::regclass")).rows,
    others: (await pool.query(`SELECT to_regclass('public.users') AS users,
      to_regclass('public.feeding_stations') AS stations,to_regclass('public.feeding_logs') AS logs,
      to_regclass('public.reports') AS reports,to_regclass('public.media_assets') AS media,
      to_regnamespace('drizzle') AS migrations,to_regproc('public.ray_set_updated_at') AS trigger_function`)).rows,
  });
  const before = await snapshot();
  assert.deepEqual(before.rows, [{ marker }]);
  assert.ok(Object.values(before.others[0]).every((value) => value === null));
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(assertNoExistingRayObjects(pool), /^Error: Refusing existing Ray objects\./);
    assert.deepEqual(await snapshot(), before, "refusal leaves sentinel identity/data and all other namespaces unchanged");
  }
  t.diagnostic("Real probe/refusal is exercised under unchanged suite ownership. The failed-open ownsObjects cleanup branch is source-reviewed, not runtime exercised by this sentinel test.");
});

test("station privacy upgrade preserves every 0000-0006 field, attachment and journal entry; replay is inert", async (t) => {
  const connection = await openTestDatabase(t);
  const { pool } = connection;
  const folder = await mkdtemp(join(tmpdir(), "ray-station-privacy-upgrade-"));
  t.after(async () => {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep + "ray-station-privacy-upgrade-"));
    await rm(folder, { recursive: true, force: true });
  });
  const journal = JSON.parse(await readFile(join(migrationsRoot, "meta/_journal.json"), "utf8"));
  const entries = journal.entries.filter((entry) => entry.idx <= 6);
  assert.deepEqual(entries.map((entry) => entry.idx), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(journal.entries[7].tag, "0007_station_visibility");
  const hashesBefore = await migrationHashes(entries);
  await mkdir(join(folder, "meta"));
  await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) await copyFile(join(migrationsRoot, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  await migrate(connection.db, { migrationsFolder: folder });

  const owner = await insertUser(pool, "owner", { company: "", companyPresent: true });
  const feeder = await insertUser(pool, "feeder", { legacyName: "Synthetic legacy name", legacyNamePresent: true });
  await insertUser(pool, "unrelated", { company: "Synthetic company", companyPresent: true });
  const stationAsset = randomUUID(), reportAsset = randomUUID();
  const stationUrl = `http://127.0.0.1:4001/api/media/${stationAsset}/content`;
  const reportUrl = `http://127.0.0.1:4001/api/media/${reportAsset}/content`;
  const stations = [
    await insertStation(pool, owner, { image: stationUrl, notes: "  עברית Русский Synthetic  ", legacyVersion: 0, legacyVersionPresent: true }),
    await insertStation(pool, owner, { image: "", notes: "", active: false, legacyVersion: 9.5, legacyVersionPresent: true }),
    await insertStation(pool, feeder, { imagePresent: false, notesPresent: false }),
  ];
  for (const [index, station] of stations.entries()) {
    await pool.query(`INSERT INTO feeding_logs
      (public_id,station_id,user_id,fed_at,period,food,water,note,period_present,note_present,
       legacy_version,legacy_version_present,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [publicId(), station.id, feeder.id, "2018-03-04T05:06:07.890Z",
      index === 0 ? "evening" : null, index === 0, index === 1,
      index === 0 ? "  Synthetic private feeding note  " : index === 1 ? "" : null,
      index !== 2, index !== 2, index === 0 ? 0 : null, index === 0, createdAt, updatedAt]);
  }
  const { rows: [report] } = await pool.query(`INSERT INTO reports
    (public_id,description,type,status,location,created_by,assigned_to,created_by_name,
     assigned_to_name,media,legacy_version,legacy_version_present,created_at,updated_at)
    VALUES($1,'Synthetic preserved report','food','in-progress',
      ST_SetSRID(ST_MakePoint(35.123456789,31.987654321),4326),$2,$3,$4,$5,$6,0,true,$7,$8)
    RETURNING *`,
  [publicId(), owner.id, feeder.id, "Synthetic reporter", "Synthetic assignee",
    [reportUrl, "https://synthetic.invalid/preserved-external-string"], createdAt, updatedAt]);
  await pool.query(`INSERT INTO reports(public_id,description,type,location,created_at,updated_at)
    VALUES($1,'Synthetic guest report','general',ST_SetSRID(ST_MakePoint(34,32),4326),$2,$3)`,
  [publicId(), createdAt, updatedAt]);
  for (const [id, purpose, stationId, reportId, position] of [
    [stationAsset, "station", stations[0].id, null, null], [reportAsset, "report", null, report.id, 0],
  ]) {
    await pool.query(`INSERT INTO media_assets
      (id,owner_id,purpose,source_key,output_key,content_type,byte_length,checksum,state,
       upload_expires_at,expires_at,processing_until,lease,attempts,last_attempt_at,
       output_bytes,output_checksum,width,height,station_id,report_id,position,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,'image/png',123,$6,'ready',$7,$8,NULL,NULL,2,$9,
        67,$6,17,19,$10,$11,$12,$13,$14)`,
    [id, owner.id, purpose, `dev/incoming/${id}`, `dev/ready/${id}.webp`, checksum,
      "2020-01-01T00:05:00.000Z", "2020-01-01T01:00:00.000Z", "2020-01-01T00:04:00.000Z",
      stationId, reportId, position, createdAt, updatedAt]);
  }
  const before = await oldRows(pool), geometryBefore = await geometrySnapshot(pool);
  const geometryTypesBefore = await geometryTypes(pool);
  assert.ok(geometryTypesBefore.every((row) => row.type === "geometry(Point,4326)"));
  const columnsBefore = (await pool.query(`SELECT table_name,column_name,
    data_type,udt_name,is_nullable,column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position`, [oldTables])).rows;
  const constraintsBefore = (await pool.query(`SELECT conrelid::regclass::text AS table_name,
    conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid=ANY($1::regclass[]) ORDER BY conrelid::regclass::text,conname`, [oldTables])).rows;
  const beforeJournal = (await pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows;
  assert.deepEqual(beforeJournal.map((row) => ({ hash: row.hash, when: Number(row.created_at) })), hashesBefore);

  await applyLocalMigrations(connection, "test", connection.url);
  const check = async () => {
    const current = await oldRows(pool);
    for (const table of oldTables) {
      assert.equal(current[table].length, before[table].length, `${table}: no rows removed or invented`);
      for (const [index, row] of current[table].entries()) {
        if (table === "feeding_stations") {
          const { visibility, ...oldColumns } = row;
          assert.equal(visibility, "sensitive", "every old station is protected, including inactive and previously fed stations");
          assert.deepEqual(oldColumns, before[table][index], "every old station column, including original timestamps, is unchanged");
        } else assert.deepEqual(row, before[table][index], `${table}: every original column is unchanged`);
      }
    }
    assert.deepEqual(await geometrySnapshot(pool), geometryBefore);
    assert.deepEqual(await geometryTypes(pool), geometryTypesBefore);
    assert.ok(geometryBefore.every((row) => row.srid === 4326));
    const currentColumns = (await pool.query(`SELECT table_name,column_name,
      data_type,udt_name,is_nullable,column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name=ANY($1::text[]) AND column_name <> 'visibility'
      ORDER BY table_name,ordinal_position`, [oldTables])).rows;
    assert.deepEqual(currentColumns, columnsBefore);
    const currentConstraints = (await pool.query(`SELECT conrelid::regclass::text AS table_name,
      conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=ANY($1::regclass[])
      ORDER BY conrelid::regclass::text,conname`, [oldTables])).rows;
    const constraintKey = (row) => `${row.table_name}:${row.conname}`;
    const oldConstraintKeys = new Set(constraintsBefore.map(constraintKey));
    assert.deepEqual(currentConstraints.filter((row) => oldConstraintKeys.has(constraintKey(row))), constraintsBefore,
      "every previous constraint, including its exact definition, remains unchanged");
    assert.deepEqual(currentConstraints.filter((row) => !oldConstraintKeys.has(constraintKey(row)))
      .map(({ table_name, conname }) => ({ table_name, conname })), [
      { table_name: "feeding_stations", conname: "feeding_stations_visibility_allowed" },
      { table_name: "feeding_stations", conname: "feeding_stations_visibility_not_null" },
    ], "PostgreSQL 18 adds exactly the visibility CHECK and named NOT NULL constraint to old tables");
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM station_access_grants")).rows[0].n, 0,
      "previous feedings and report assignments do not create grants");
    const currentJournal = (await pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows;
    assert.equal(currentJournal.length, journal.entries.length);
    assert.deepEqual(currentJournal.slice(0, 7), beforeJournal);
    assert.deepEqual(await migrationHashes(entries), hashesBefore);
  };
  await check();
  const afterJournal = (await pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows;
  await applyLocalMigrations(connection, "test", connection.url);
  await check();
  assert.deepEqual((await pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows, afterJournal);
});

test("fresh station privacy schema enforces restrictive defaults, grant identity, time checks and indexes", async (t) => {
  const connection = await openTestDatabase(t);
  await applyLocalMigrations(connection, "test", connection.url);
  const { pool } = connection;
  const owner = await insertUser(pool, "owner"), recipient = await insertUser(pool, "recipient");
  const grantor = await insertUser(pool, "independent-grantor");
  const station = await insertStation(pool, owner);
  assert.equal(station.visibility, "sensitive");
  for (const value of ["", "public", "REGULAR", "unknown", null]) {
    await assert.rejects(pool.query("UPDATE feeding_stations SET visibility=$1 WHERE id=$2", [value, station.id]),
      codeIs(value === null ? "23502" : "23514"));
  }
  await pool.query("UPDATE feeding_stations SET visibility='regular' WHERE id=$1", [station.id]);
  await pool.query("UPDATE feeding_stations SET visibility='sensitive' WHERE id=$1", [station.id]);
  const at = "2026-01-02T03:04:05.678Z";
  const insertGrant = (extra = {}) => pool.query(`INSERT INTO station_access_grants
    (station_id,user_id,granted_by,granted_at,revoked_at) VALUES($1,$2,$3,$4,$5) RETURNING *`,
  [extra.stationId ?? station.id, extra.userId ?? recipient.id, extra.grantedBy ?? owner.id,
    extra.grantedAt ?? at, extra.revokedAt ?? null]);
  await assert.rejects(pool.query(`INSERT INTO station_access_grants(station_id,user_id,granted_by)
    VALUES($1,$2,$3)`, [station.id, recipient.id, owner.id]), codeIs("23502"));
  for (const values of [[null, recipient.id, owner.id], [station.id, null, owner.id], [station.id, recipient.id, null]]) {
    await assert.rejects(pool.query(`INSERT INTO station_access_grants(station_id,user_id,granted_by,granted_at)
      VALUES($1,$2,$3,$4)`, [...values, at]), codeIs("23502"));
  }
  for (const extra of [{ stationId: randomUUID() }, { userId: randomUUID() }, { grantedBy: randomUUID() }]) {
    await assert.rejects(insertGrant(extra), codeIs("23503"));
  }
  await assert.rejects(insertGrant({ userId: owner.id }), codeIs("23514"));
  await assert.rejects(insertGrant({ revokedAt: "2026-01-02T03:04:05.677Z" }), codeIs("23514"));
  const { rows: [grant] } = await insertGrant();
  assert.equal(grant.revoked_at, null);
  assert.equal(grant.granted_at.toISOString(), at);
  await assert.rejects(insertGrant(), codeIs("23505"));
  await pool.query("UPDATE station_access_grants SET revoked_at=granted_at WHERE station_id=$1 AND user_id=$2", [station.id, recipient.id]);
  await assert.rejects(insertGrant(), codeIs("23505"), "the one-row identity remains unique after revocation");
  await pool.query("UPDATE station_access_grants SET granted_at=$3,revoked_at=NULL WHERE station_id=$1 AND user_id=$2",
    [station.id, recipient.id, "2026-02-01T00:00:00.000Z"]);
  assert.equal((await pool.query("SELECT count(*)::integer AS n FROM station_access_grants")).rows[0].n, 1);
  // FKs enforce structure, not owner authority: future write helpers must verify the owner.
  await pool.query("UPDATE station_access_grants SET granted_by=$3 WHERE station_id=$1 AND user_id=$2", [station.id, recipient.id, grantor.id]);
  const grantsBeforeDelete = (await pool.query("SELECT * FROM station_access_grants ORDER BY station_id,user_id")).rows;
  for (const [table, id, constraint] of [
    ["feeding_stations", station.id, "station_access_grants_station_id_feeding_stations_id_fk"],
    ["users", recipient.id, "station_access_grants_user_id_users_id_fk"],
    ["users", grantor.id, "station_access_grants_granted_by_users_id_fk"],
  ]) {
    const beforeDelete = (await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows;
    await assert.rejects(pool.query(`DELETE FROM ${table} WHERE id=$1`, [id]), (error) => {
      codeIs("23001")(error); // RESTRICT deletion, distinct from dangling INSERT's 23503
      assert.equal(error.constraint, constraint);
      return true;
    });
    assert.deepEqual((await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows, beforeDelete);
    assert.deepEqual((await pool.query("SELECT * FROM station_access_grants ORDER BY station_id,user_id")).rows, grantsBeforeDelete);
  }
  const fks = (await pool.query(`SELECT pg_get_constraintdef(oid) AS definition,confdeltype,confupdtype
    FROM pg_constraint WHERE conrelid='station_access_grants'::regclass AND contype='f'`)).rows;
  assert.equal(fks.length, 3);
  for (const fk of fks) {
    assert.equal(fk.confdeltype, "r");
    assert.equal(fk.confupdtype, "a");
  }
  const primary = (await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='station_access_grants'::regclass AND contype='p'`)).rows;
  assert.deepEqual(primary.map((row) => row.definition), ["PRIMARY KEY (station_id, user_id)"]);
  const { rows: [index] } = await pool.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='public'
    AND tablename='station_access_grants' AND indexname='station_access_grants_active_user_station_idx'`);
  assert.match(index.indexdef, /USING btree \(user_id, station_id\)/);
  assert.match(index.indexdef, /WHERE \(revoked_at IS NULL\)/);
  const { rows: [grantTime] } = await pool.query(`SELECT is_nullable,column_default,datetime_precision
    FROM information_schema.columns WHERE table_schema='public' AND table_name='station_access_grants' AND column_name='granted_at'`);
  assert.deepEqual(grantTime, { is_nullable: "NO", column_default: null, datetime_precision: 3 });
  t.diagnostic("Constraint evidence is structural only; no API or invitation/grant-management workflow is exercised.");
});
