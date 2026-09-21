import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../dist/models/UserModel.js";
import Report from "../dist/models/ReportModel.js";
import { mongoUserStore as users } from "../dist/users/mongoUserStore.js";
import { startApp, document, ids, userFields, location, stubReportDocument } from "./helpers/contracts.mjs";

const input = { firstName: "Test", lastName: "Carer", email: "Carer@Example.invalid", password: "test-password-only" };
const reportInput = { description: "Cats need help", type: "general", location, createdBy: ids.other, createdByName: "Forged" };

function captureReport(t) {
  t.mock.method(Report, "create", async (values) =>
    stubReportDocument(t, document(Report, { ...values, _id: ids.report })));
}

test("HTTP registration uses safe lookup, login alone requests credentials; bcrypt cost and JWT stay compatible", async (t) => {
  const { request } = await startApp(t);
  // Spies call the real adapter; only the underlying Mongoose operations are replaced.
  const safe = t.mock.method(users, "findByEmail");
  const credentials = t.mock.method(users, "findCredentialsByEmail");
  const find = t.mock.method(User, "findOne", async (filter) => {
    assert.deepEqual(filter, { email: input.email });
    return null;
  });
  let saved;
  t.mock.method(User, "create", async (values) => {
    assert.deepEqual(Object.keys(values).sort(), ["company", "email", "firstName", "lastName", "password"]);
    assert.equal(values.email, input.email);
    assert.equal(values.company, undefined);
    assert.equal(bcrypt.getRounds(values.password), 10);
    assert.equal(await bcrypt.compare(input.password, values.password), true);
    saved = document(User, { ...values, _id: ids.user });
    return saved;
  });
  const registration = await request("POST", "/api/auth/register", input);
  assert.equal(registration.status, 201);
  assert.equal(safe.mock.callCount(), 1);
  assert.equal(credentials.mock.callCount(), 0);
  find.mock.mockImplementation(async (filter) => {
    assert.deepEqual(filter, { email: input.email });
    return saved;
  });
  const login = await request("POST", "/api/auth/login", input);
  assert.equal(login.status, 200);
  assert.equal(safe.mock.callCount(), 1);
  assert.equal(credentials.mock.callCount(), 1);
  for (const response of [registration, login]) {
    assert.deepEqual(response.body.user, { id: ids.user, firstName: input.firstName, lastName: input.lastName, email: input.email });
    const claims = jwt.verify(response.body.token, process.env.JWT_SECRET);
    assert.equal(claims.id, ids.user);
    assert.equal(typeof claims.id, "string");
    assert.equal(claims.exp - claims.iat, 604800);
  }
});

test("both middleware attach only a plain string-ID identity, preserving optional legacy name", async (t) => {
  await startApp(t, { user: { ...userFields, name: "Legacy Name", password: "private",
    passwordHash: "private", company: "private", __v: 1 } });
  const { authMiddleware } = await import("../dist/middleware/authMiddleware.js");
  const { optionalAuthMiddleware } = await import("../dist/middleware/optionalAuthMiddleware.js");
  const token = jwt.sign({ id: ids.user }, process.env.JWT_SECRET);
  for (const [middleware, optional] of [[authMiddleware, false], [optionalAuthMiddleware, true]]) {
    const req = { headers: { authorization: `Bearer ${token}` } };
    let calls = 0;
    await middleware(req, { status() { assert.fail("valid user must authenticate"); } }, () => { calls++; });
    assert.equal(calls, 1);
    assert.equal(Object.getPrototypeOf(req.user), Object.prototype);
    assert.deepEqual(req.user, { ...userFields, ...(optional ? { name: "Legacy Name" } : {}) });
  }
});

test("optional auth supports legacy _id claims and name snapshots; required auth does not accept that claim", async (t) => {
  const { request } = await startApp(t, { user: { ...userFields, name: "Legacy Name" } });
  const find = User.findById;
  const lookedUp = [];
  t.mock.method(User, "findById", (id) => {
    lookedUp.push(id);
    return id === undefined ? { select: async () => null } : find(id);
  });
  captureReport(t);
  const token = jwt.sign({ _id: ids.user }, process.env.JWT_SECRET);
  const response = await request("POST", "/api/reports", reportInput, token);
  assert.equal(response.status, 201);
  assert.equal(response.body.createdBy._id, ids.user);
  assert.equal(response.body.createdByName, "Legacy Name");
  assert.deepEqual(await request("GET", "/api/reports/me", undefined, token), {
    status: 401, body: { error: "User not found" },
  });
  assert.deepEqual(lookedUp, [ids.user, undefined]);
});

for (const scenario of ["missing-user", "database-failure", "missing-secret", "missing-claim", "expired", "malformed-id", "empty-bearer"]) {
  test(`optional auth falls back to guest: ${scenario}`, async (t) => {
    const { request, token } = await startApp(t, scenario === "missing-user" ? { user: null } : {});
    captureReport(t);
    let bearer = token;
    if (scenario === "database-failure" || scenario === "malformed-id") {
      t.mock.method(User, "findById", () => ({ select: () => ({ lean: async () => { throw new Error("synthetic lookup failure"); } }) }));
    }
    if (scenario === "missing-claim") bearer = jwt.sign({ unrelated: ids.user }, process.env.JWT_SECRET);
    if (scenario === "expired") bearer = jwt.sign({ id: ids.user }, process.env.JWT_SECRET, { expiresIn: -1 });
    if (scenario === "malformed-id") bearer = jwt.sign({ id: "malformed" }, process.env.JWT_SECRET);
    if (scenario === "empty-bearer") bearer = " ";
    if (scenario === "missing-secret") delete process.env.JWT_SECRET;
    const response = await request("POST", "/api/reports", reportInput, bearer);
    assert.equal(response.status, 201);
    assert.equal(response.body.createdBy, null);
    assert.equal(response.body.createdByName, "Guest");
  });
}

test("lookup/create failures preserve auth HTTP error envelopes", async (t) => {
  const { request, token } = await startApp(t);
  t.mock.method(console, "error", () => {});
  const fail = () => { throw new Error("synthetic database failure"); };
  const find = t.mock.method(User, "findOne", fail);
  for (const endpoint of ["register", "login"]) {
    assert.deepEqual(await request("POST", `/api/auth/${endpoint}`, input), { status: 500, body: { msg: "Server error" } });
  }
  find.mock.mockImplementation(async () => null);
  t.mock.method(User, "create", fail);
  assert.deepEqual(await request("POST", "/api/auth/register", input), { status: 500, body: { msg: "Server error" } });
  t.mock.method(User, "findById", () => ({ select: async () => fail() }));
  assert.deepEqual(await request("GET", "/api/reports/me", undefined, token), {
    status: 401, body: { error: "Invalid or expired token" },
  });
});

test("missing JWT secret keeps register/login 500 and required auth 401", async (t) => {
  const { request, token } = await startApp(t);
  t.mock.method(console, "error", () => {});
  delete process.env.JWT_SECRET;
  for (const endpoint of ["register", "login"]) {
    assert.deepEqual(await request("POST", `/api/auth/${endpoint}`, input), { status: 500, body: { msg: "Internal server error" } });
  }
  assert.deepEqual(await request("GET", "/api/reports/me", undefined, token), {
    status: 401, body: { error: "Invalid or expired token" },
  });
});
