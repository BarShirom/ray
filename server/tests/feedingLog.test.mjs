// Run after npm run build: node --test tests/feedingLog.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { startApp, ids, document, json, assertEntity, assertValidation } from "./helpers/contracts.mjs";
import { stubFeedingLogDatabase } from "./helpers/feedingLogDatabase.mjs";
import mongoose from "mongoose";
import FeedingLog from "../dist/models/FeedingLogModel.js";
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
  const { request: httpRequest, token } = await startApp(t);
  const stationId = ids.station;
  const userId = new mongoose.Types.ObjectId(ids.user);
  const forgedId = ids.other;
  const state = {};
  t.beforeEach(() => Object.assign(state, {
    station: { _id: stationId, active: true }, events: [], created: undefined, history: [],
  }));
  stubFeedingLogDatabase(t, state, stationId);

  async function request(method, body, id = stationId, authenticated = true) {
    state.events = [];
    return httpRequest(method, `/api/feeding-stations/${id}/feedings`, body, authenticated ? token : undefined);
  }

  await t.test("POST requires authentication", async () => {
    assert.equal((await request("POST", {}, stationId, false)).status, 401);
    assert.deepEqual(state.events, []);
  });

  await t.test("POST checks station before creating with trusted IDs and defaults", async () => {
    const response = await request("POST", {});
    assert.equal(response.status, 201);
    assert.deepEqual(state.events, ["station", "create"]);
    assert.equal(state.created.stationId, stationId);
    assert.equal(String(state.created.userId), String(userId));
    assert.equal(response.body.stationId, stationId);
    assert.equal(response.body.userId, userId.toString());
    assert.equal(response.body.food, true);
    assert.equal(response.body.water, false);
    assert.ok(Number.isFinite(Date.parse(response.body.fedAt)));
    assertEntity(response.body);
    assert.equal(Object.hasOwn(response.body, "period"), false);
    assert.equal(Object.hasOwn(response.body, "note"), false);
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
      assertValidation(response, field === "period" ? "period" : "body");
      assert.deepEqual(state.events, []);
    });
  }

  for (const method of ["POST", "GET"]) {
    await t.test(`${method} rejects malformed stationId before lookup`, async () => {
      const response = await request(method, method === "POST" ? {} : undefined, "invalid");
      assert.equal(response.status, 400);
      assert.equal(response.body.message, "Validation failed");
      assert.equal(response.body.errors[0].field, "stationId");
      assert.deepEqual(state.events, []);
    });
    await t.test(`${method} returns 404 for missing station without accessing logs`, async () => {
      state.station = null;
      const response = await request(method, method === "POST" ? {} : undefined);
      assert.equal(response.status, 404);
      assert.equal(response.body.message, "Feeding station not found");
      assert.deepEqual(state.events, ["station"]);
      state.station = { _id: stationId, active: true };
    });
  }

  await t.test("inactive station rejects creation but retains public history access", async () => {
    state.station = { _id: stationId, active: false };
    const response = await request("POST", {});
    assert.equal(response.status, 409);
    assert.equal(response.body.message, "Feeding station is inactive");
    assert.deepEqual(state.events, ["station"]);
    const historyResponse = await request("GET", undefined, stationId, false);
    assert.equal(historyResponse.status, 200);
    assert.deepEqual(historyResponse.body, []);
    state.station = { _id: stationId, active: true };
  });

  await t.test("public GET queries only this station with newest-fedAt-first order", async () => {
    state.history = [
      document(FeedingLog, { stationId, userId, fedAt: "2026-09-20T10:00:00Z", createdAt: "2026-09-20T11:00:00Z" }).toObject(),
      document(FeedingLog, { stationId, userId, fedAt: "2026-09-20T10:00:00Z", createdAt: "2026-09-20T10:00:00Z" }).toObject(),
      document(FeedingLog, { stationId, userId, fedAt: "2026-09-19T10:00:00Z" }).toObject(),
    ];
    const response = await request("GET", undefined, stationId, false);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, json(state.history));
    response.body.forEach(assertEntity);
    assert.deepEqual(state.events, ["station", "logs"]);
  });

  await t.test("explicit false flags and empty trimmed note survive serialization", async () => {
    const response = await request("POST", { food: false, water: false, note: "  " });
    assert.equal(response.status, 201);
    assert.equal(response.body.food, false);
    assert.equal(response.body.water, false);
    assert.equal(response.body.note, "");
    assert.equal(Object.hasOwn(response.body, "period"), false);
  });
  for (const field of ["period", "note", "fedAt"]) {
    await t.test(`POST rejects explicit null ${field}`, async () => {
      assertValidation(await request("POST", { [field]: null }), field);
      assert.deepEqual(state.events, []);
    });
  }

  await t.test("controller independently ignores body IDs", async () => {
    state.events = [];
    let status;
    const res = { status(code) { status = code; return this; }, json() {} };
    await createFeedingLog({
      params: { stationId }, user: { _id: userId.toString() }, body: { stationId: forgedId, userId: forgedId },
    }, res, (err) => { throw err; });
    assert.equal(status, 201);
    assert.equal(state.created.stationId, stationId);
    assert.equal(String(state.created.userId), String(userId));
    assert.deepEqual(state.events, ["station", "create"]);
  });
});
