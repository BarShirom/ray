// Run after npm run build: node --test tests/feedingLog.test.mjs
import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import FeedingLog from "../dist/models/FeedingLogModel.js";
import FeedingStation from "../dist/models/FeedingStationModel.js";
import User from "../dist/models/UserModel.js";
import { createFeedingLogSchema } from "../dist/validation/feedingLogSchemas.js";
import { createFeedingLog } from "../dist/controllers/feedingLogController.js";

test("feeding log schema and model", async (t) => {
  await t.test("valid input converts fedAt and trims note", () => {
    const parsed = createFeedingLogSchema.parse({
      fedAt: "2026-09-20T09:00:00+03:00",
      period: "morning",
      food: false,
      water: true,
      note: "  Fresh water  ",
    });
    assert.equal(parsed.fedAt.toISOString(), "2026-09-20T06:00:00.000Z");
    assert.equal(parsed.note, "Fresh water");
    assert.equal(parsed.food, false);
    assert.equal(parsed.water, true);
    assert.deepEqual(createFeedingLogSchema.parse({}), {});
  });

  for (const [label, body] of [
    ["invalid period", { period: "night" }],
    ["invalid date", { fedAt: "not-a-date" }],
    ["null date", { fedAt: null }],
    ["numeric date", { fedAt: 123 }],
    ["non-boolean food", { food: "true" }],
    ["non-boolean water", { water: 1 }],
    ["non-string note", { note: [] }],
    ["body userId", { userId: new mongoose.Types.ObjectId().toString() }],
    ["body stationId", { stationId: new mongoose.Types.ObjectId().toString() }],
    ["unknown field", { extra: true }],
  ]) {
    await t.test(`rejects ${label}`, () => {
      assert.equal(createFeedingLogSchema.safeParse(body).success, false);
    });
  }

  await t.test("model defaults, references, required IDs and timestamps", () => {
    const before = Date.now();
    const log = new FeedingLog({
      stationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      note: "  Cats fed  ",
    });
    assert.equal(log.validateSync(), undefined);
    assert.ok(log.fedAt.getTime() >= before && log.fedAt.getTime() <= Date.now());
    assert.equal(log.food, true);
    assert.equal(log.water, false);
    assert.equal(log.period, undefined);
    assert.equal(log.note, "Cats fed");
    assert.equal(FeedingLog.schema.options.timestamps, true);
    assert.equal(FeedingLog.schema.path("stationId").options.ref, "FeedingStation");
    assert.equal(FeedingLog.schema.path("userId").options.ref, "User");
    const errors = new FeedingLog().validateSync().errors;
    assert.ok(errors.stationId);
    assert.ok(errors.userId);
    log.period = "night";
    assert.ok(log.validateSync().errors.period);
  });
});

test("feeding log endpoints with stubbed database calls", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "feeding-log-test-secret-only";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const { default: router } = await import("../dist/routes/feedingStationRoutes.js");
  const stationId = new mongoose.Types.ObjectId().toString();
  const userId = new mongoose.Types.ObjectId();
  const forgedId = new mongoose.Types.ObjectId().toString();
  let station = { _id: stationId, active: true };
  let events = [];
  let created;
  let history = [];

  t.mock.method(User, "findById", () => ({
    select: async () => ({ _id: userId }),
  }));
  t.mock.method(FeedingStation, "findById", (id) => {
    assert.equal(id, stationId);
    events.push("station");
    return { lean: async () => station };
  });
  t.mock.method(FeedingLog, "create", async (data) => {
    events.push("create");
    created = data;
    const log = new FeedingLog(data);
    await log.validate();
    return log;
  });
  t.mock.method(FeedingLog, "find", (filter) => {
    assert.deepEqual(filter, { stationId });
    events.push("logs");
    return {
      sort(order) {
        assert.deepEqual(order, { fedAt: -1, createdAt: -1 });
        return { lean: async () => history };
      },
    };
  });

  const app = express();
  app.use(express.json());
  app.use("/api/feeding-stations", router);
  app.use((err, _req, res, _next) => res.status(500).json({ message: err.message }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/feeding-stations`;
  const token = jwt.sign({ id: userId.toString() }, process.env.JWT_SECRET);

  async function request(method, body, id = stationId, authenticated = true) {
    events = [];
    const headers = { "Content-Type": "application/json" };
    if (authenticated) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${base}/${id}/feedings`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }

  await t.test("POST requires authentication", async () => {
    assert.equal((await request("POST", {}, stationId, false)).status, 401);
    assert.deepEqual(events, []);
  });

  await t.test("POST checks station before creating with trusted IDs and defaults", async () => {
    const response = await request("POST", {});
    assert.equal(response.status, 201);
    assert.deepEqual(events, ["station", "create"]);
    assert.equal(created.stationId, stationId);
    assert.equal(created.userId, userId);
    assert.equal(response.body.stationId, stationId);
    assert.equal(response.body.userId, userId.toString());
    assert.equal(response.body.food, true);
    assert.equal(response.body.water, false);
    assert.ok(Number.isFinite(Date.parse(response.body.fedAt)));
  });

  await t.test("POST preserves explicit feeding details", async () => {
    const response = await request("POST", {
      fedAt: "2026-09-20T06:00:00Z", period: "noon", food: false, water: true, note: "  Water only  ",
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.fedAt, "2026-09-20T06:00:00.000Z");
    assert.equal(response.body.food, false);
    assert.equal(response.body.water, true);
    assert.equal(response.body.period, "noon");
    assert.equal(response.body.note, "Water only");
  });

  for (const [field, value] of [["userId", forgedId], ["stationId", forgedId], ["period", "night"]]) {
    await t.test(`POST rejects body ${field} before accessing stations or logs`, async () => {
      const response = await request("POST", { [field]: value });
      assert.equal(response.status, 400);
      assert.equal(response.body.message, "Validation failed");
      assert.ok(response.body.errors.length > 0);
      assert.deepEqual(events, []);
    });
  }

  for (const method of ["POST", "GET"]) {
    await t.test(`${method} rejects malformed stationId before lookup`, async () => {
      const response = await request(method, method === "POST" ? {} : undefined, "invalid");
      assert.equal(response.status, 400);
      assert.equal(response.body.message, "Validation failed");
      assert.equal(response.body.errors[0].field, "stationId");
      assert.deepEqual(events, []);
    });
    await t.test(`${method} returns 404 for missing station without accessing logs`, async () => {
      station = null;
      const response = await request(method, method === "POST" ? {} : undefined);
      assert.equal(response.status, 404);
      assert.equal(response.body.message, "Feeding station not found");
      assert.deepEqual(events, ["station"]);
      station = { _id: stationId, active: true };
    });
  }

  await t.test("inactive station rejects creation but retains public history access", async () => {
    station = { _id: stationId, active: false };
    const response = await request("POST", {});
    assert.equal(response.status, 409);
    assert.equal(response.body.message, "Feeding station is inactive");
    assert.deepEqual(events, ["station"]);
    const historyResponse = await request("GET", undefined, stationId, false);
    assert.equal(historyResponse.status, 200);
    assert.deepEqual(historyResponse.body, []);
    station = { _id: stationId, active: true };
  });

  await t.test("public GET queries only this station with newest-fedAt-first order", async () => {
    history = [{ stationId, fedAt: "2026-09-20T10:00:00Z" }];
    const response = await request("GET", undefined, stationId, false);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, history);
    assert.deepEqual(events, ["station", "logs"]);
  });

  await t.test("controller independently ignores body IDs", async () => {
    events = [];
    let status;
    const res = { status(code) { status = code; return this; }, json() {} };
    await createFeedingLog({
      params: { stationId }, user: { _id: userId }, body: { stationId: forgedId, userId: forgedId },
    }, res, (err) => { throw err; });
    assert.equal(status, 201);
    assert.equal(created.stationId, stationId);
    assert.equal(created.userId, userId);
    assert.deepEqual(events, ["station", "create"]);
  });
});
