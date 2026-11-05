import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { createAuthRouter } from "../dist/routes/authRoutes.js";
import { loginSchema, registerSchema } from "../dist/validation/authSchemas.js";
import { PASSWORD_MESSAGES, registrationPasswordError } from "../dist/validation/passwordPolicy.js";

const input = { firstName: "Synthetic", lastName: "Carer", email: "password-policy@example.invalid" };
const secret = "synthetic-password-policy-test-secret";
const salt = "$2b$04$abcdefghijklmnopqrstuu";

async function startAuth(t, initial = []) {
  const rows = [...initial];
  const calls = { lookup: 0, credentials: 0, create: 0 };
  const store = {
    async findByEmail(email) { calls.lookup++; return rows.find(row => row.email === email) ?? null; },
    async findCredentialsByEmail(email) { calls.credentials++; return rows.find(row => row.email === email) ?? null; },
    async create(values) {
      calls.create++;
      const row = { ...values, publicId: String(rows.length + 1).padStart(24, "0") };
      rows.push(row);
      return row;
    },
    async findIdentityByPublicId(id) { return rows.find(row => row.publicId === id) ?? null; },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(store, () => secret));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}/api/auth`;
  const request = async (endpoint, body) => {
    const response = await fetch(`${url}/${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return { rows, calls, request, store };
}

test("installed Zod minimum counts Unicode code points rather than UTF-16 units", () => {
  assert.equal("🐈".repeat(7).length, 14);
  assert.equal(z.string().min(8).safeParse("🐈".repeat(7)).success, false);
  assert.equal(z.string().min(8).safeParse("🐈".repeat(8)).success, true);
  for (const character of ["a", "א", "🐈"]) {
    assert.equal(registrationPasswordError(character.repeat(7)), PASSWORD_MESSAGES.minimum);
    const password = character.repeat(8);
    assert.equal(registerSchema.parse({ ...input, password }).password === password, true);
  }
  for (const password of ["אבcd🐈🐕12", "א\u05b0".repeat(4), "e\u0301".repeat(4), "        ", " abcdef ", "abc\u0000defg"]) {
    assert.equal([...password].length, 8);
    assert.equal(registerSchema.parse({ ...input, password }).password === password, true);
  }
  assert.equal(registerSchema.safeParse({ ...input, password: "é".repeat(4) }).success, false);
});

test("registration uses actual UTF-8 bytes at ASCII, Hebrew, emoji and mixed boundaries", () => {
  const boundaries = [
    ["a".repeat(72), "a".repeat(73)],
    ["א".repeat(36), "א".repeat(36) + "a"],
    ["🐈".repeat(18), "🐈".repeat(18) + "a"],
    ["a".repeat(70) + "א", "a".repeat(71) + "א"],
    ["a".repeat(68) + "🐈", "a".repeat(69) + "🐈"],
    ["א".repeat(34) + "🐈", "א".repeat(34) + "🐈a"],
  ];
  for (const [accepted, rejected] of boundaries) {
    assert.equal(Buffer.byteLength(accepted, "utf8"), 72);
    assert.equal(Buffer.byteLength(rejected, "utf8"), 73);
    assert.equal(bcrypt.truncates(accepted), false);
    assert.equal(bcrypt.truncates(rejected), true);
    assert.equal(registerSchema.parse({ ...input, password: accepted }).password === accepted, true);
    const result = registerSchema.safeParse({ ...input, password: rejected });
    assert.equal(result.success, false);
    assert.deepEqual(result.error.issues.map(({ path, message }) => ({ path, message })), [
      { path: ["password"], message: PASSWORD_MESSAGES.maximum },
    ]);
  }
});

test("new registration rejects empty, non-string and unpaired-surrogate passwords without conversion", () => {
  for (const password of [undefined, null, 12345678, true, [], {}, ""]) {
    assert.equal(registerSchema.safeParse({ ...input, password }).success, false);
  }
  for (const password of ["abcdefg\ud800", "abcdefg\udfff", "\ud800abcdefg", "abcdefg\ud800\ud800", "abcdefg\udfff\ud800", "🐈abcdefg\udfff"]) {
    assert.equal(registrationPasswordError(password), PASSWORD_MESSAGES.invalidUnicode);
    assert.equal(registerSchema.safeParse({ ...input, password }).success, false);
  }
  assert.equal(loginSchema.parse({ email: input.email, password: "abcdefg\ud800" }).password, "abcdefg\ud800");
});

test("installed bcrypt confirms the 72-byte prefix equivalence and preserves distinct in-boundary bytes", async () => {
  for (const [original, equivalent] of [
    ["a".repeat(72) + "original", "a".repeat(72) + "different"],
    ["a".repeat(69) + "🐈", "a".repeat(69) + "🐕"],
  ]) {
    const hash = await bcrypt.hash(original, salt);
    assert.equal(await bcrypt.compare(original, hash), true);
    assert.equal(await bcrypt.compare(equivalent, hash), true);
    assert.equal(registerSchema.safeParse({ ...input, password: original }).success, false);
    assert.equal(registerSchema.safeParse({ ...input, password: equivalent }).success, false);
  }
  const hash = await bcrypt.hash("a".repeat(68) + "🐈", salt);
  assert.equal(await bcrypt.compare("a".repeat(68) + "🐕", hash), false);
  assert.equal(await bcrypt.compare("a".repeat(68) + "🐈ignored-suffix", hash), true);
  const malformedHash = await bcrypt.hash("abcdefg\ud800", salt);
  assert.equal(await bcrypt.compare("abcdefg\ud800", malformedHash), true);
  assert.equal(await bcrypt.compare("abcdefg\ufffd", malformedHash), false);
});

test("HTTP registration hashes exact raw 72-byte Unicode passwords at cost 10 and supports login", async (t) => {
  const { rows, request } = await startAuth(t);
  for (const [index, password] of ["א".repeat(34) + "🐈", " " + "a".repeat(70) + " ", "e\u0301".repeat(8), "abc\u0000defg"].entries()) {
    const registration = { ...input, email: `password-${index}@example.invalid`, password };
    const registered = await request("register", registration);
    assert.equal(registered.status, 201);
    const saved = rows.at(-1);
    assert.equal(bcrypt.getRounds(saved.passwordHash), 10);
    assert.equal(await bcrypt.compare(password, saved.passwordHash), true);
    if (password.trim() !== password) assert.equal(await bcrypt.compare(password.trim(), saved.passwordHash), false);
    if (password.normalize("NFC") !== password) assert.equal(await bcrypt.compare(password.normalize("NFC"), saved.passwordHash), false);
    const loggedIn = await request("login", registration);
    assert.equal(loggedIn.status, 200);
    if (Buffer.byteLength(password, "utf8") === 72) {
      const suffixedLogin = await request("login", { ...registration, password: password + "ignored-suffix" });
      assert.equal(suffixedLogin.status, 200);
      assert.deepEqual(suffixedLogin.body.user, registered.body.user);
    }
    for (const response of [registered, loggedIn]) {
      assert.deepEqual(Object.keys(response.body).sort(), ["token", "user"]);
      assert.deepEqual(response.body.user, { id: saved.publicId, ...input, email: registration.email });
      const claims = jwt.verify(response.body.token, secret);
      assert.equal(claims.id, saved.publicId);
      assert.equal(claims.exp - claims.iat, 604800);
      assert.equal(JSON.stringify(response.body).includes(password), false);
      assert.equal(JSON.stringify(response.body).includes(saved.passwordHash), false);
    }
  }
});

test("HTTP registration rejects before lookup/hash/write and errors or logs never echo passwords", async (t) => {
  const { calls, rows, request } = await startAuth(t);
  const hash = t.mock.method(bcrypt, "hash");
  const logged = [];
  for (const method of ["error", "warn", "log"]) t.mock.method(console, method, (...args) => logged.push(args));
  for (const [password, message] of [
    ["SECRET-PASSWORD-MARKER-".repeat(4), PASSWORD_MESSAGES.maximum],
    ["secret7", PASSWORD_MESSAGES.minimum],
    ["SECRET-PASSWORD-MARKER-\ud800", PASSWORD_MESSAGES.invalidUnicode],
  ]) {
    const rejected = await request("register", { ...input, password });
    assert.deepEqual(rejected, { status: 400, body: { message: "Validation failed", errors: [{ field: "password", message }] } });
    assert.equal(JSON.stringify(rejected.body).includes(password), false);
    assert.equal(JSON.stringify(rejected.body).includes("SECRET-PASSWORD-MARKER"), false);
  }
  assert.deepEqual(calls, { lookup: 0, credentials: 0, create: 0 });
  assert.equal(rows.length, 0);
  assert.equal(hash.mock.callCount(), 0);
  assert.deepEqual(logged, []);
});

test("legacy raw login retains existing short, overlong and malformed bcrypt hashes without rewriting them", async (t) => {
  const historical = [
    ["short", "short"],
    ["a".repeat(72) + "original", "a".repeat(72) + "different"],
    ["a".repeat(69) + "🐈", "a".repeat(69) + "🐕"],
    ["abcdefg\ud800", "abcdefg\ud800"],
  ];
  const initial = await Promise.all(historical.map(async ([password], index) => ({
    ...input, email: `legacy-${index}@example.invalid`, publicId: String(index + 1).padStart(24, "0"),
    passwordHash: await bcrypt.hash(password, salt),
  })));
  const originalHashes = initial.map(row => row.passwordHash);
  const { rows, calls, request } = await startAuth(t, initial);
  const hash = t.mock.method(bcrypt, "hash");
  for (const [index, [password, equivalent]] of historical.entries()) {
    for (const candidate of [password, equivalent]) {
      const response = await request("login", { email: initial[index].email, password: candidate });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.id, initial[index].publicId);
    }
  }
  assert.deepEqual(rows.map(row => row.passwordHash), originalHashes);
  assert.equal(calls.create, 0);
  assert.equal(hash.mock.callCount(), 0);
  assert.deepEqual(await request("login", { email: initial[0].email, password: "incorrect-secret-marker" }), {
    status: 400, body: { msg: "Invalid email or password" },
  });
});

test("authentication persistence failures retain fixed safe errors and logs", async (t) => {
  const { request, store } = await startAuth(t);
  const password = "SECRET-PASSWORD-MARKER";
  const logged = [];
  t.mock.method(console, "error", (...args) => logged.push(args));
  const fail = async () => { throw new Error(`synthetic persistence failure: ${password}`); };
  t.mock.method(store, "create", fail);
  t.mock.method(store, "findCredentialsByEmail", fail);
  for (const endpoint of ["register", "login"]) {
    const response = await request(endpoint, { ...input, password });
    assert.deepEqual(response, { status: 500, body: { msg: "Server error" } });
  }
  assert.deepEqual(logged, [["Register error"], ["Login error"]]);
  assert.equal(JSON.stringify(logged).includes(password), false);
});
