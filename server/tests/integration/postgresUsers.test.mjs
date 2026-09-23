import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { users } from "../../dist/db/schema.js";
import { applyLocalMigrations } from "../../dist/db/migrate.js";
import { createPostgresUserStore } from "../../dist/users/postgresUserStore.js";
import { openTestDatabase } from "./database.mjs";
import { startPostgresAuthApp } from "./authApp.mjs";

const publicId = () => randomBytes(12).toString("hex");
const values = (extra = {}) => ({ firstName: "Synthetic", lastName: "Carer",
  email: `${publicId()}@example.invalid`, passwordHash: "synthetic-existing-hash", ...extra });
// Never print SQL errors/parameters in assertion output, even for synthetic credentials.
const codeIs = (code) => (error) => { assert.equal(error.cause?.code ?? error.code, code); return true; };
const safeProfile = (row, company) => ({ publicId: row.publicId, firstName: row.firstName,
  lastName: row.lastName, email: row.email, ...(company === undefined ? {} : { company }) });
const identity = (row) => ({ _id: row.publicId, firstName: row.firstName, lastName: row.lastName, email: row.email });

test.beforeEach((t) => {
  const unexpected = () => { throw new Error("Unexpected MongoDB access in PostgreSQL auth test"); };
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose, "createConnection", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  t.mock.method(mongoose.Model.prototype, "save", unexpected);
});

test("user compatibility migration upgrades the previous chain without reconstructing source presence", async (t) => {
  const connection = await openTestDatabase(t);
  const folder = await mkdtemp(join(tmpdir(), "ray-user-upgrade-"));
  t.after(async () => {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep + "ray-user-upgrade-"));
    await rm(folder, { recursive: true, force: true });
  });
  const migrationRoot = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
  const journal = JSON.parse(await readFile(join(migrationRoot, "meta/_journal.json"), "utf8"));
  const oldEntries = journal.entries.filter((entry) => entry.idx <= 2);
  assert.equal(oldEntries.length, 3);
  await mkdir(join(folder, "meta"));
  await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: oldEntries }));
  for (const entry of oldEntries) await copyFile(join(migrationRoot, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  // openTestDatabase has already validated the dedicated target and acquired ownership/lock.
  await migrate(connection.db, { migrationsFolder: folder });
  const before = [];
  for (const company of [null, "", "Existing company"]) {
    before.push((await connection.pool.query(`INSERT INTO users
      (public_id, first_name, last_name, email, password_hash, company, created_at, updated_at)
      VALUES ($1,'Synthetic','Legacy',$2,$3,$4,'2019-01-01T00:00:00Z','2019-01-01T00:00:00Z') RETURNING *`,
    [publicId(), `${publicId()}@example.invalid`, "synthetic-preserved-hash", company])).rows[0]);
  }
  await applyLocalMigrations(connection, "test", connection.url);
  const after = (await connection.pool.query("SELECT * FROM users ORDER BY email")).rows;
  for (const previous of before) {
    const current = after.find((row) => row.id === previous.id);
    const { company_present, legacy_name, legacy_name_present, ...unchanged } = current;
    assert.deepEqual(unchanged, previous);
    assert.equal(company_present, true); // old SQL null is explicitly null, not reconstructed absence
    assert.equal(legacy_name, null);
    assert.equal(legacy_name_present, false);
    const profile = await createPostgresUserStore(connection.db).findByEmail(previous.email);
    assert.equal(profile.company, previous.company);
    assert.equal(Object.hasOwn(profile, "company"), true);
  }
  await applyLocalMigrations(connection, "test", connection.url);
  assert.deepEqual((await connection.pool.query("SELECT * FROM users ORDER BY email")).rows, after);
});

test("real PostgreSQL UserStore and production auth HTTP flow", async (t) => {
  const connection = await openTestDatabase(t);
  await applyLocalMigrations(connection, "test", connection.url);
  const { db, pool } = connection;
  const store = createPostgresUserStore(db);
  const request = await startPostgresAuthApp(t, store);
  const byEmail = async (email) => (await db.select().from(users).where(eq(users.email, email)))[0];

  for (const company of [undefined, null, "", "Cat Helpers"]) {
    await t.test(`adapter creates/reads unchanged hash with company ${JSON.stringify(company)}`, async () => {
      const input = values({ ...(company === undefined ? {} : { company }) });
      const profile = await store.create(input);
      const row = await byEmail(input.email);
      assert.match(profile.publicId, /^[0-9a-f]{24}$/);
      assert.notEqual(profile.publicId, row.id);
      assert.equal(row.passwordHash, input.passwordHash);
      assert.equal(row.companyPresent, company !== undefined);
      assert.equal(row.company, company ?? null);
      assert.deepEqual(profile, safeProfile(row, company));
      assert.deepEqual(await store.findByEmail(input.email), profile);
      assert.deepEqual(await store.findCredentialsByEmail(input.email), { ...profile, passwordHash: input.passwordHash });
      assert.deepEqual(await store.findIdentityByPublicId(profile.publicId.toUpperCase()), identity(row));
      assert.equal(Object.getPrototypeOf(profile), Object.prototype);
    });
  }

  await t.test("explicit undefined company and unknown legacy registration fields stay absent", async () => {
    const profile = await store.create(values({ company: undefined, name: "Forged", legacyName: "Forged", legacyNamePresent: true }));
    const row = await byEmail(profile.email);
    assert.equal(Object.hasOwn(profile, "company"), false);
    assert.equal(row.companyPresent, false);
    assert.equal(row.legacyNamePresent, false);
    assert.equal(row.legacyName, null);
  });

  for (const name of [undefined, null, "", "Legacy Carer"]) {
    await t.test(`legacy identity presence ${JSON.stringify(name)}`, async () => {
      const profile = await store.create(values());
      await db.update(users).set({ legacyName: name ?? null, legacyNamePresent: name !== undefined })
        .where(eq(users.publicId, profile.publicId));
      const row = await byEmail(profile.email);
      assert.deepEqual(await store.findIdentityByPublicId(profile.publicId), identity(row));
      assert.deepEqual(await store.findIdentityByPublicId(profile.publicId, { includeLegacyName: true }), { ...identity(row), name });
      assert.deepEqual(await store.findByEmail(profile.email), profile);
      const token = jwt.sign({ _id: profile.publicId.toUpperCase() }, process.env.JWT_SECRET);
      assert.deepEqual(await request("GET", "/optional", undefined, `Bearer ${token}`), {
        status: 200, body: { user: { ...identity(row), ...(name === undefined ? {} : { name }) } },
      });
      assert.deepEqual(await request("GET", "/protected", undefined, `Bearer ${token}`), {
        status: 401, body: { error: "User not found" },
      });
    });
  }

  await t.test("missing/malformed IDs, exact email matching, duplicates and hostile-looking inputs", async () => {
    const input = values({ email: `Case-${publicId()}@example.invalid` });
    const profile = await store.create(input);
    assert.equal(await store.findByEmail(input.email.toLowerCase()), null);
    await store.create({ ...input, email: input.email.toLowerCase() });
    await assert.rejects(store.create(input), codeIs("23505"));
    await assert.rejects(db.insert(users).values({ ...values(), publicId: profile.publicId }), codeIs("23505"));
    assert.equal(await store.findByEmail("' OR 1=1 --"), null);
    assert.equal(await store.findCredentialsByEmail("' OR 1=1 --"), null);
    const hostile = values({ email: "'; DROP TABLE users; --", firstName: "O'Reilly", company: "'); SELECT pg_sleep(99); --" });
    const saved = await store.create(hostile);
    assert.deepEqual(await store.findByEmail(hostile.email), saved);
    assert.equal(await store.findIdentityByPublicId(publicId()), null);
    assert.equal(await store.findIdentityByPublicId(undefined), null);
    assert.equal(await store.findIdentityByPublicId(null), null);
    for (const invalid of ["", "malformed", "a".repeat(24) + "\n", (await byEmail(profile.email)).id, 123]) {
      await assert.rejects(store.findIdentityByPublicId(invalid), /Invalid user public ID/);
    }
    for (const field of ["firstName", "lastName", "email", "passwordHash"]) {
      await assert.rejects(db.insert(users).values({ ...values(), publicId: publicId(), [field]: null }), codeIs("23502"));
    }
  });

  await t.test("safe SELECTs do not require the password column; actual SQL rejection propagates", async () => {
    const profile = await store.create(values());
    // Real transactional DDL proves safe SELECTs omit the hash; failure rolls it all back.
    await assert.rejects(db.transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE users RENAME COLUMN password_hash TO hidden_test_hash`);
      const scoped = createPostgresUserStore(tx);
      assert.deepEqual(await scoped.findByEmail(profile.email), profile);
      assert.deepEqual(await scoped.findIdentityByPublicId(profile.publicId), identity(profile));
      assert.deepEqual(await scoped.findIdentityByPublicId(profile.publicId, { includeLegacyName: true }), { ...identity(profile), name: undefined });
      await scoped.findCredentialsByEmail(profile.email);
    }), codeIs("42703"));
    assert.equal((await store.findCredentialsByEmail(profile.email)).passwordHash, "synthetic-existing-hash");
    await assert.rejects(db.transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE users RENAME COLUMN email TO hidden_test_email`);
      await createPostgresUserStore(tx).findByEmail(profile.email);
    }), codeIs("42703"));
  });

  let registered;
  const registration = { firstName: "  Test  ", lastName: " Carer ", email: `${publicId()}@example.invalid`, password: "synthetic-test-password" };
  await t.test("register/login via real router and authenticate using the returned public-ID token", async () => {
    const response = await request("POST", "/api/auth/register", { ...registration, legacyName: "Forged" });
    assert.equal(response.status, 201);
    registered = response.body;
    assert.deepEqual(Object.keys(registered).sort(), ["token", "user"]);
    assert.deepEqual(registered.user, { id: registered.user.id, firstName: "Test", lastName: "Carer", email: registration.email });
    const row = await byEmail(registration.email);
    assert.equal(row.publicId, registered.user.id);
    assert.notEqual(row.id, registered.user.id);
    assert.equal(bcrypt.getRounds(row.passwordHash), 10);
    assert.equal(await bcrypt.compare(registration.password, row.passwordHash), true);
    assert.equal(row.legacyNamePresent, false);
    const claims = jwt.verify(registered.token, process.env.JWT_SECRET);
    assert.equal(claims.id, row.publicId);
    assert.equal(claims.exp - claims.iat, 604800);
    assert.deepEqual(await request("GET", "/protected", undefined, `Bearer ${registered.token}`), { status: 200, body: { user: identity(row) } });
    const login = await request("POST", "/api/auth/login", registration);
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.user, registered.user);
    assert.deepEqual(Object.keys(login.body).sort(), ["token", "user"]);
    assert.equal(jwt.verify(login.body.token, process.env.JWT_SECRET).id, row.publicId);
    const upperToken = jwt.sign({ id: row.publicId.toUpperCase() }, process.env.JWT_SECRET);
    assert.deepEqual(await request("GET", "/protected", undefined, `Bearer ${upperToken}`), { status: 200, body: { user: identity(row) } });
  });

  await t.test("duplicate registration, invalid credentials and validation keep the HTTP contracts", async () => {
    assert.deepEqual(await request("POST", "/api/auth/register", registration), { status: 400, body: { msg: "User already exists" } });
    for (const input of [{ ...registration, password: "wrong" }, { ...registration, email: "missing@example.invalid" }]) {
      assert.deepEqual(await request("POST", "/api/auth/login", input), { status: 400, body: { msg: "Invalid email or password" } });
    }
    const before = (await pool.query("SELECT count(*)::integer AS n FROM users")).rows[0].n;
    for (const changes of [{ firstName: " " }, { email: "bad" }, { password: "short" }, { company: null }]) {
      const result = await request("POST", "/api/auth/register", { ...registration, email: `${publicId()}@example.invalid`, ...changes });
      assert.equal(result.status, 400);
      assert.equal(result.body.message, "Validation failed");
      assert.ok(result.body.errors.length > 0);
    }
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM users")).rows[0].n, before);
  });

  for (const company of ["", "Cat Helpers"]) {
    await t.test(`HTTP registration encodes present company ${JSON.stringify(company)}`, async () => {
      const email = `${publicId()}@example.invalid`;
      const response = await request("POST", "/api/auth/register", { ...registration, email, company });
      assert.equal(response.status, 201);
      assert.deepEqual(response.body.user, { id: response.body.user.id, firstName: "Test", lastName: "Carer", email, company });
      const row = await byEmail(email);
      assert.equal(row.companyPresent, true);
      assert.equal(row.company, company);
    });
  }

  for (const company of [undefined, null, "", "Cat Helpers"]) {
    await t.test(`HTTP login preserves company ${JSON.stringify(company)}`, async () => {
      const passwordHash = await bcrypt.hash("synthetic-company-password", 4);
      const profile = await store.create(values({ company, passwordHash }));
      const result = await request("POST", "/api/auth/login", { email: profile.email, password: "synthetic-company-password" });
      assert.equal(result.status, 200);
      const { publicId: id, ...rest } = profile;
      assert.deepEqual(result.body.user, { id, ...rest });
      assert.equal(Object.hasOwn(result.body.user, "company"), company !== undefined);
    });
  }

  await t.test("required and optional authentication preserve token failures and missing-user distinctions", async () => {
    const secret = process.env.JWT_SECRET;
    const cases = [
      [undefined, "Authorization token required"], ["Basic abc", "Authorization token required"],
      ["Bearer invalid", "Invalid or expired token"],
      [`Bearer ${jwt.sign({ id: registered.user.id }, "wrong-synthetic-secret")}`, "Invalid or expired token"],
      [`Bearer ${jwt.sign({ id: registered.user.id }, secret, { expiresIn: -1 })}`, "Invalid or expired token"],
      [`Bearer ${jwt.sign({ id: publicId() }, secret)}`, "User not found"],
      [`Bearer ${jwt.sign({}, secret)}`, "User not found"],
      [`Bearer ${jwt.sign({ id: null }, secret)}`, "User not found"],
      [`Bearer ${jwt.sign({ id: "malformed" }, secret)}`, "Invalid or expired token"],
    ];
    for (const [header, error] of cases) {
      assert.deepEqual(await request("GET", "/protected", undefined, header), { status: 401, body: { error } });
      assert.deepEqual(await request("GET", "/optional", undefined, header), { status: 200, body: { user: null } });
    }
    const token = jwt.sign({ id: publicId(), _id: registered.user.id }, secret);
    assert.deepEqual(await request("GET", "/optional", undefined, `Bearer ${token}`), { status: 200, body: { user: null } });
    delete process.env.JWT_SECRET;
    try {
      assert.deepEqual(await request("GET", "/optional", undefined, `Bearer ${registered.token}`), { status: 200, body: { user: null } });
      assert.deepEqual(await request("GET", "/protected", undefined, `Bearer ${registered.token}`), { status: 401, body: { error: "Invalid or expired token" } });
    } finally { process.env.JWT_SECRET = secret; }
  });

  await t.test("real query failures retain HTTP errors without logging SQL, hashes or parameters", async (t) => {
    const messages = [];
    t.mock.method(console, "error", (...args) => messages.push(args));
    // Owned disposable table only, tests are sequential; always restore the column.
    await pool.query("ALTER TABLE users RENAME COLUMN password_hash TO hidden_test_hash");
    try {
      assert.deepEqual(await request("POST", "/api/auth/login", registration), { status: 500, body: { msg: "Server error" } });
      assert.deepEqual(await request("POST", "/api/auth/register", { ...registration, email: `${publicId()}@example.invalid` }), { status: 500, body: { msg: "Server error" } });
    } finally { await pool.query("ALTER TABLE users RENAME COLUMN hidden_test_hash TO password_hash"); }
    assert.deepEqual(messages, [["Login error"], ["Register error"]]);
    await pool.query("ALTER TABLE users RENAME COLUMN email TO hidden_test_email");
    try {
      assert.deepEqual(await request("GET", "/protected", undefined, `Bearer ${registered.token}`), { status: 401, body: { error: "Invalid or expired token" } });
      assert.deepEqual(await request("GET", "/optional", undefined, `Bearer ${registered.token}`), { status: 200, body: { user: null } });
    } finally { await pool.query("ALTER TABLE users RENAME COLUMN hidden_test_email TO email"); }
  });
});
