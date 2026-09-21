import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../dist/models/UserModel.js";
import { startApp, stubCreate, document, ids, assertId, assertValidation } from "./helpers/contracts.mjs";

const input = { firstName: "Test", lastName: "Carer", email: "carer@example.invalid", password: "test-password-only" };
function assertAuth(response, status, company) {
  assert.equal(response.status, status);
  assert.deepEqual(Object.keys(response.body).sort(), ["token", "user"]);
  const expected = { id: response.body.user.id, firstName: input.firstName, lastName: input.lastName, email: input.email };
  if (company !== undefined) expected.company = company;
  assert.deepEqual(response.body.user, expected); // no password/hash/nested token
  assertId(response.body.user.id);
  assert.equal(typeof response.body.token, "string");
  const payload = jwt.verify(response.body.token, process.env.JWT_SECRET);
  assert.equal(payload.id, response.body.user.id);
  assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60);
}

for (const company of [undefined, "Cat Helpers", ""]) {
  test(`register contract, company ${JSON.stringify(company)}`, async (t) => {
    const { request } = await startApp(t);
    t.mock.method(User, "findOne", async (filter) => { assert.deepEqual(filter, { email: input.email }); return null; });
    let created;
    stubCreate(t, User, (values) => { created = values; });
    assertAuth(await request("POST", "/api/auth/register", { ...input, company }), 201, company);
    assert.notEqual(created.password, input.password);
    assert.equal(await bcrypt.compare(input.password, created.password), true);
  });
}
for (const company of [undefined, null, "Cat Helpers", ""]) {
  test(`login contract, stored company ${JSON.stringify(company)}`, async (t) => {
    const { request } = await startApp(t);
    const password = await bcrypt.hash(input.password, 4);
    t.mock.method(User, "findOne", async (filter) => {
      assert.deepEqual(filter, { email: input.email });
      return document(User, { ...input, _id: ids.user, password, company });
    });
    assertAuth(await request("POST", "/api/auth/login", { email: input.email, password: input.password }), 200, company);
  });
}
test("duplicate registration and invalid credentials retain msg errors", async (t) => {
  const { request } = await startApp(t);
  const existing = document(User, { ...input, password: await bcrypt.hash(input.password, 4) });
  const find = t.mock.method(User, "findOne", async () => existing);
  assert.deepEqual(await request("POST", "/api/auth/register", input), { status: 400, body: { msg: "User already exists" } });
  assert.deepEqual(await request("POST", "/api/auth/login", { ...input, password: "wrong" }), { status: 400, body: { msg: "Invalid email or password" } });
  find.mock.mockImplementation(async () => null);
  assert.deepEqual(await request("POST", "/api/auth/login", input), { status: 400, body: { msg: "Invalid email or password" } });
});
for (const [endpoint, changes, field] of [
  ["register", { email: "bad" }, "email"], ["register", { firstName: " " }, "firstName"],
  ["register", { password: "short" }, "password"], ["register", { company: null }, "company"],
  ["login", { email: "bad" }, "email"], ["login", { password: "" }, "password"],
]) {
  test(`${endpoint} validates ${field}`, async (t) => {
    const { request } = await startApp(t);
    assertValidation(await request("POST", `/api/auth/${endpoint}`, { ...input, ...changes }), field);
  });
}
