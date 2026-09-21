import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import User from "../dist/models/UserModel.js";
import { mongoUserStore as users } from "../dist/users/mongoUserStore.js";
import { serializeAuthResponse } from "../dist/serializers/authResponse.js";
import { ids, userFields, document } from "./helpers/contracts.mjs";

const stored = { ...userFields, email: "Carer@Example.invalid", password: "synthetic-existing-hash" };
const expected = { publicId: ids.user, firstName: "Test", lastName: "Carer", email: stored.email };

// All database access is stubbed; real Mongoose documents exercise mapping/casting.
test.beforeEach((t) => {
  const unexpected = () => { throw new Error("Unexpected database access"); };
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose, "createConnection", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  t.mock.method(mongoose.Model.prototype, "save", unexpected);
});

for (const company of [undefined, null, "Cat Helpers", ""]) {
  test(`email mapping and serializer preserve company ${JSON.stringify(company)}`, async (t) => {
    const doc = document(User, { ...stored, ...(company === undefined ? {} : { company }) });
    t.mock.method(User, "findOne", async (filter) => {
      assert.deepEqual(filter, { email: stored.email }); // no lowercasing
      return doc;
    });
    const profile = await users.findByEmail(stored.email);
    const expectedProfile = { ...expected, ...(company === undefined ? {} : { company }) };
    assert.deepEqual(profile, expectedProfile);
    assert.equal(Object.getPrototypeOf(profile), Object.prototype);
    const credentials = await users.findCredentialsByEmail(stored.email);
    assert.deepEqual(credentials, { ...expectedProfile, passwordHash: stored.password });
    const response = serializeAuthResponse({
      ...credentials, password: "plaintext-never-returned", _id: doc._id,
      internalId: "internal-id", __v: 42, createdAt: new Date(), name: "Private legacy name",
    }, "synthetic-token");
    assert.deepEqual(response, {
      user: { id: ids.user, firstName: "Test", lastName: "Carer", email: stored.email,
        ...(company === undefined ? {} : { company }) }, token: "synthetic-token",
    });
  });
}

test("mapping preserves legacy null/missing fields and Mongoose's undefined company omission", async (t) => {
  const doc = User.hydrate({ _id: ids.user, firstName: null, company: undefined });
  t.mock.method(User, "findOne", async () => doc);
  const profile = await users.findByEmail(stored.email);
  assert.deepEqual(profile, {
    publicId: ids.user, firstName: null, lastName: undefined, email: undefined,
  });
  assert.equal(Object.hasOwn(profile, "company"), false);
  assert.equal(Object.hasOwn(serializeAuthResponse({ ...profile, company: undefined }, "token").user, "company"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(serializeAuthResponse(profile, "token"))), {
    user: { id: ids.user, firstName: null }, token: "token",
  });
});

test("create writes only existing MongoDB fields and keeps the supplied hash unchanged", async (t) => {
  t.mock.method(User, "create", async (values) => {
    assert.deepEqual(values, { firstName: "Test", lastName: "Carer", email: stored.email,
      password: stored.password, company: undefined });
    return document(User, { ...values, _id: ids.user });
  });
  const result = await users.create({ ...expected, passwordHash: stored.password,
    password: "untrusted", _id: ids.other, name: "untrusted", role: "admin" });
  assert.deepEqual(result, expected);
});

for (const includeLegacyName of [false, true]) {
  test(`public-ID identity is plain and safe; legacy name = ${includeLegacyName}`, async (t) => {
    const raw = { ...stored, _id: new mongoose.Types.ObjectId(ids.user), name: "Legacy Name",
      company: "private", __v: 1, passwordHash: "private", internalId: "private" };
    t.mock.method(User, "findById", (id) => {
      assert.equal(id, ids.user);
      return { select(fields) {
        assert.equal(fields, includeLegacyName ? "_id firstName lastName name email" : "_id firstName lastName email");
        // Hydration deliberately has no schema-defined name accessor. Lean retains it.
        return includeLegacyName ? { lean: async () => raw } : Promise.resolve(User.hydrate(raw));
      } };
    });
    assert.deepEqual(await users.findIdentityByPublicId(ids.user, { includeLegacyName }), {
      _id: ids.user, firstName: "Test", lastName: "Carer", email: stored.email,
      ...(includeLegacyName ? { name: "Legacy Name" } : {}),
    });
  });
}

test("missing records return null; database failures propagate unchanged from every operation", async (t) => {
  const find = t.mock.method(User, "findOne", async () => null);
  const findId = t.mock.method(User, "findById", () => ({ select: () => {
    const query = Promise.resolve(null);
    query.lean = async () => null;
    return query;
  } }));
  assert.equal(await users.findByEmail(stored.email), null);
  assert.equal(await users.findCredentialsByEmail(stored.email), null);
  assert.equal(await users.findIdentityByPublicId(ids.user), null);
  assert.equal(await users.findIdentityByPublicId(ids.user, { includeLegacyName: true }), null);
  const failure = new Error("synthetic database failure");
  find.mock.mockImplementation(async () => { throw failure; });
  findId.mock.mockImplementation(() => ({ select: () => ({
    then: (_resolve, reject) => reject(failure), lean: async () => { throw failure; },
  }) }));
  t.mock.method(User, "create", async () => { throw failure; });
  for (const call of [
    () => users.findByEmail(stored.email), () => users.findCredentialsByEmail(stored.email),
    () => users.create({ ...expected, passwordHash: stored.password }),
    () => users.findIdentityByPublicId(ids.user),
    () => users.findIdentityByPublicId(ids.user, { includeLegacyName: true }),
  ]) await assert.rejects(call, (error) => error === failure);
});
