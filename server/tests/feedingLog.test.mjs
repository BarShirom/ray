// Run after npm run build: node --test tests/feedingLog.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { startApp, privacyFixture, ids, assertEntity, assertValidation } from "./helpers/contracts.mjs";
import mongoose from "mongoose";
import FeedingLog from "../dist/models/FeedingLogModel.js";
import { createFeedingLogSchema } from "../dist/validation/feedingLogSchemas.js";

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

test("protected feeding endpoints preserve validation and trusted identity", async t => {
  const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
  const path = `/api/feeding-stations/${ids.station}/feedings`;
  await t.test("default receipt has food/water and own timestamps without user identity", async () => {
    const response = await request("POST", path, {}, token);
    assert.equal(response.status, 201);
    assert.equal(response.body.food, true);
    assert.equal(response.body.water, false);
    assertEntity(response.body);
    assert.equal(Object.hasOwn(response.body, "period"), false);
    assert.equal(Object.hasOwn(response.body, "note"), false);
    assert.equal(Object.hasOwn(response.body, "userId"), false);
    assert.equal(f.state.calls.at(-1).identity._id, ids.user);
  });
  await t.test("explicit period, Israel offset, water-only feeding and trimmed note survive", async () => {
    const response = await request("POST", path, {
      fedAt: "2026-09-20T09:00:00+03:00", period: "noon", food: false, water: true, note: "  Water only  ",
    }, token);
    assert.equal(response.status, 201);
    assert.equal(response.body.fedAt, "2026-09-20T06:00:00.000Z");
    assert.deepEqual([response.body.food, response.body.water, response.body.period, response.body.note], [false, true, "noon", "Water only"]);
  });
  for (const [field, value, issue] of [["userId", ids.other, "body"], ["stationId", ids.other, "body"],
    ["period", "night", "period"], ["period", null, "period"], ["note", null, "note"], ["fedAt", null, "fedAt"]]) {
    await t.test(`invalid ${field} ${value} never reaches storage`, async () => {
      const before = f.state.calls.length;
      assertValidation(await request("POST", path, { [field]: value }, token), issue);
      assert.equal(f.state.calls.length, before);
    });
  }
  await t.test("inaccessible parent hides own history, summary and write with identical 404", async () => {
    f.state.detail = null;
    const expected = { status: 404, body: { message: "Feeding station not found" } };
    assert.deepEqual(await request("POST", path, {}, token), expected);
    assert.deepEqual(await request("GET", path, undefined, token), expected);
    assert.deepEqual(await request("GET", `/api/feeding-stations/${ids.station}/feeding-summary`, undefined, token), expected);
  });
});
