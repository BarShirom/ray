import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../../dist/models/UserModel.js";

export const ids = {
  user: "100000000000000000000001",
  other: "100000000000000000000002",
  station: "200000000000000000000001",
  report: "300000000000000000000001",
};
export const timestamp = "2026-09-20T09:00:00.000Z";
export const location = { lat: 32.1, lng: 34.8 };
export const userFields = {
  _id: ids.user, firstName: "Test", lastName: "Carer", email: "carer@example.invalid",
};
export const populatedUser = { _id: ids.user, firstName: "Test", lastName: "Carer" };
export const json = (value) => JSON.parse(JSON.stringify(value));
export function assertId(value) { assert.match(value, /^[a-f0-9]{24}$/); }
export function assertDate(value) {
  assert.equal(typeof value, "string");
  assert.equal(new Date(value).toISOString(), value);
}
export function assertEntity(value) {
  assertId(value._id);
  assertDate(value.createdAt);
  assertDate(value.updatedAt);
}
export function assertValidation(response, field) {
  assert.equal(response.status, 400);
  assert.deepEqual(Object.keys(response.body).sort(), ["errors", "message"]);
  assert.equal(response.body.message, "Validation failed");
  assert.ok(response.body.errors.length > 0);
  for (const issue of response.body.errors) {
    assert.deepEqual(Object.keys(issue).sort(), ["field", "message"]);
    assert.equal(typeof issue.field, "string");
    assert.equal(typeof issue.message, "string");
  }
  assert.ok(response.body.errors.some((issue) => issue.field === field));
}

// Offline Mongoose document: real defaults/casting/serialization, synthetic saved fields.
// This does NOT exercise database writes or Mongoose's timestamp save hooks.
export function document(Model, values = {}) {
  const doc = new Model({ createdAt: timestamp, updatedAt: timestamp, __v: 0, ...values });
  assert.equal(doc.validateSync(), undefined);
  return doc;
}
export function stubCreate(t, Model, onCreate = () => {}) {
  t.mock.method(Model, "create", async (values) => {
    onCreate(values);
    return document(Model, values);
  });
}
export function stubList(t, Model, expectedFilter, expectedOrder, rows, populate = false) {
  t.mock.method(Model, "find", (filter) => {
    assert.deepEqual(filter, expectedFilter);
    return { sort(order) {
      assert.deepEqual(order, expectedOrder);
      const result = { lean: async () => rows };
      return populate ? { populate(spec) { assertPopulation(spec); return result; } } : result;
    } };
  });
}
function assertPopulation(spec) {
  assert.deepEqual(spec, [
    { path: "createdBy", select: "firstName lastName name" },
    { path: "assignedTo", select: "firstName lastName name" },
  ]);
}
export function stubReportDocument(t, doc, users = [populatedUser]) {
  t.mock.method(doc, "save", async () => doc);
  t.mock.method(doc, "populate", async (spec) => {
    assertPopulation(spec);
    const out = doc.toObject();
    for (const field of ["createdBy", "assignedTo"]) {
      out[field] = users.find((user) => String(user._id) === String(out[field])) ?? null;
    }
    return { toObject: () => out };
  });
  return doc;
}

export async function startApp(t, { user = userFields } = {}) {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "ray-contract-tests-only-not-a-production-secret";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  // authMiddleware calls dotenv.config at import time. Never read a local .env.
  t.mock.method(dotenv, "config", () => ({ parsed: {} }));
  t.mock.method(console, "log", () => {});
  const unexpected = () => { throw new Error("Unexpected database access in offline contract test"); };
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose, "createConnection", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  t.mock.method(mongoose.Model.prototype, "save", unexpected);
  t.mock.method(User, "findById", (id) => {
    assert.equal(String(id), ids.user);
    return { select(fields) {
      assert.ok(fields === "_id firstName lastName email" || fields === "_id firstName lastName name email");
      const result = user ? { ...user, _id: new mongoose.Types.ObjectId(user._id) } : null;
      const query = Promise.resolve(result);
      query.lean = async () => result;
      return query;
    } };
  });
  const [{ default: auth }, { default: reports }, { default: stations }] = await Promise.all([
    import("../../dist/routes/authRoutes.js"),
    import("../../dist/routes/reportRoutes.js"),
    import("../../dist/routes/feedingStationRoutes.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use("/api/auth", auth);
  app.use("/api/reports", reports);
  app.use("/api/feeding-stations", stations);
  // Same JSON shape as server.ts, without importing startup or uploads.
  app.use((err, _req, res, _next) => res.status(500).json({
    error: err?.name || "ServerError", message: err?.message || "Internal Server Error",
  }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, "listening");
  const token = jwt.sign({ id: ids.user }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const invalidToken = jwt.sign({ id: ids.user }, "different-test-secret");
  async function request(method, path, body, bearer) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.match(response.headers.get("content-type"), /application\/json/);
    return { status: response.status, body: await response.json() };
  }
  return { request, token, invalidToken };
}
