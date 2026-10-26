import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { z } from "zod";
import { registerSchema, loginSchema } from "../dist/validation/authSchemas.js";
import { createFeedingStationSchema } from "../dist/validation/feedingStationSchemas.js";
import { createFeedingLogSchema } from "../dist/validation/feedingLogSchemas.js";
import { createReportSchema } from "../dist/validation/reportSchemas.js";
import { mediaReportSchema, mediaStationSchema, intentSchema } from "../dist/media/validation.js";
import { boundedArray, bodyShapeError, INPUT_LIMITS } from "../dist/validation/inputBounds.js";
import { validateBody, validateRequestShape } from "../dist/middleware/validateBody.js";
import { createReportRouter } from "../dist/routes/reportRoutes.js";

const location = { lat: 32.1, lng: 34.8 };
const report = { description: "  חתולים זקוקים לעזרה — cats need care  ", type: "general", location };
const station = { name: "  תחנת האכלה  ", location };
const registration = { firstName: "שירה", lastName: "כהן", email: "carer@example.invalid", password: "test-password-only" };
const assetIds = [1, 2, 3].map(value => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`);

function invoke(schema, body) {
  const request = { body };
  let status;
  let response;
  let continued = false;
  const res = { status(value) { status = value; return this; }, json(value) { response = value; return this; } };
  validateBody(schema)(request, res, () => { continued = true; });
  return { status, response, continued, body: request.body };
}

test("ordinary mixed Hebrew/English inputs preserve existing transformations and raw passwords", () => {
  assert.equal(createReportSchema.parse(report).description, report.description);
  assert.equal(createFeedingStationSchema.parse(station).name, station.name.trim());
  assert.equal(createFeedingLogSchema.parse({ note: "  מים ומזון — water and food  " }).note, "מים ומזון — water and food");
  assert.equal(createFeedingLogSchema.parse({ fedAt: "2026-10-26T09:00:00+02:00", food: true }).fedAt.toISOString(), "2026-10-26T07:00:00.000Z");
  for (const password of ["🐈".repeat(8), "א".repeat(8), " " + "א".repeat(6) + " ", "x".repeat(256)]) {
    assert.equal(registerSchema.parse({ ...registration, password }).password === password, true);
  }
  for (const password of ["🐈".repeat(7), "א".repeat(7)]) {
    assert.equal(registerSchema.safeParse({ ...registration, password }).success, false);
  }
  assert.equal(loginSchema.parse({ email: registration.email, password: "short" }).password, "short");
  assert.equal(mediaStationSchema.safeParse({ ...station, imageAssetId: assetIds[0] }).success, true);
  assert.equal(mediaReportSchema.safeParse({ ...report, mediaAssetIds: assetIds }).success, true);
});

test("every product text limit accepts its boundary and rejects the next Unicode code point", () => {
  const boundaries = [
    [registerSchema, registration, "firstName", INPUT_LIMITS.personName],
    [registerSchema, registration, "lastName", INPUT_LIMITS.personName],
    [registerSchema, registration, "company", INPUT_LIMITS.company],
    [createFeedingStationSchema, station, "name", INPUT_LIMITS.stationName],
    [createFeedingStationSchema, station, "notes", INPUT_LIMITS.description],
    [createFeedingLogSchema, {}, "note", INPUT_LIMITS.feedingNote],
    [createReportSchema, report, "description", INPUT_LIMITS.description],
    [createFeedingStationSchema, station, "image", INPUT_LIMITS.url],
  ];
  for (const [schema, input, field, limit] of boundaries) {
    for (const character of ["א", "🐈"]) {
      assert.equal(invoke(schema, { ...input, [field]: character.repeat(limit) }).continued, true, `${field} boundary`);
      const rejected = invoke(schema, { ...input, [field]: character.repeat(limit + 1) });
      assert.equal(rejected.status, 400, `${field} excess`);
      assert.equal(rejected.response.errors[0].field, field);
      assert.equal(rejected.response.errors[0].message, "Text exceeds allowed length");
    }
  }
  const email = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61);
  assert.equal(email.length, INPUT_LIMITS.email);
  for (const schema of [registerSchema, loginSchema]) {
    assert.equal(schema.safeParse({ ...registration, email }).success, true);
    assert.equal(schema.safeParse({ ...registration, email: email + "d" }).success, false);
  }
  assert.equal(createReportSchema.safeParse({ ...report, media: ["x".repeat(INPUT_LIMITS.url)] }).success, true);
  assert.equal(createReportSchema.safeParse({ ...report, media: ["x".repeat(INPUT_LIMITS.url + 1)] }).success, false);
});

test("array limits stop before item validation, including each alternate S3 field", () => {
  let parsedItems = 0;
  const countedItem = z.preprocess(value => { parsedItems++; return value; }, z.string());
  const result = boundedArray(countedItem, 3).safeParse(Array(1_000).fill(0));
  assert.equal(result.success, false);
  assert.equal(parsedItems, 0);
  assert.equal(result.error.issues.length, 1);
  assert.equal(createReportSchema.safeParse({ ...report, media: Array(INPUT_LIMITS.legacyMedia).fill("photo.jpg") }).success, true);
  const cases = [
    [createReportSchema, "media", Array(1_000).fill(0)],
    [mediaReportSchema, "media", Array(1_000).fill(0)],
    [mediaReportSchema, "mediaAssetIds", Array(1_000).fill(0)],
  ];
  for (const [schema, field, input] of cases) {
    const rejected = schema.safeParse({ ...report, [field]: input });
    assert.equal(rejected.success, false);
    assert.equal(rejected.error.issues.length, 1);
    assert.deepEqual(rejected.error.issues[0].path, [field]);
  }
  assert.equal(createReportSchema.safeParse({ ...report, media: Array(INPUT_LIMITS.legacyMedia + 1).fill("photo.jpg") }).success, false);
  assert.equal(mediaReportSchema.safeParse({ ...report, media: [] }).success, true);
  assert.equal(mediaReportSchema.safeParse({ ...report, media: ["photo.jpg"] }).success, false);
  assert.equal(mediaReportSchema.safeParse({ ...report, mediaAssetIds: [...assetIds, assetIds[0]] }).success, false);
  assert.equal(mediaReportSchema.safeParse({ ...report, mediaAssetIds: [assetIds[0], assetIds[0]] }).success, false);
});

test("shape budgets cover exact field, value, key, string, nesting and collection boundaries", () => {
  const object = count => Object.fromEntries(Array.from({ length: count }, (_, index) => [`field${index}`, 0]));
  assert.equal(bodyShapeError(object(INPUT_LIMITS.objectFields)), undefined);
  assert.ok(bodyShapeError(object(INPUT_LIMITS.objectFields + 1)));
  assert.equal(bodyShapeError({ ["x".repeat(INPUT_LIMITS.fieldName)]: 0 }), undefined);
  assert.ok(bodyShapeError({ ["x".repeat(INPUT_LIMITS.fieldName + 1)]: 0 }));
  assert.equal(bodyShapeError({ password: "x".repeat(INPUT_LIMITS.stringUnits) }), undefined);
  assert.ok(bodyShapeError({ password: "x".repeat(INPUT_LIMITS.stringUnits + 1) }));
  assert.equal(bodyShapeError({ media: Array(INPUT_LIMITS.legacyMedia).fill(0) }), undefined);
  assert.ok(bodyShapeError({ media: Array(INPUT_LIMITS.legacyMedia + 1).fill(0) }));
  const nested = {};
  let leaf = nested;
  for (let depth = 0; depth < INPUT_LIMITS.depth; depth++) { leaf.child = {}; leaf = leaf.child; }
  assert.equal(bodyShapeError(nested), undefined);
  leaf.child = {};
  assert.ok(bodyShapeError(nested));
  const full = { a: object(31), b: object(31), c: object(31), d: object(30) };
  assert.equal(bodyShapeError(full), undefined); // Exactly 128 values including containers.
  full.d.extra = 0;
  assert.ok(bodyShapeError(full));
  for (const input of [null, "text", [], Array(6).fill({})]) assert.ok(bodyShapeError(input));
});

test("oversized structures fail before Zod and ordinary error envelopes stay bounded", () => {
  const neverParse = { safeParse() { assert.fail("shape guard must reject before Zod"); } };
  for (const body of [{ ...report, media: Array(1_000).fill(0) }, { extra: { child: { child: { child: { child: { child: {} } } } } } }]) {
    const rejected = invoke(neverParse, body);
    assert.equal(rejected.status, 400);
    assert.equal(rejected.response.errors.length, 1);
    assert.ok(JSON.stringify(rejected.response).length < 200);
  }
  const shape = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`field${index}`, z.string()]));
  const rejected = invoke(z.object(shape), Object.fromEntries(Object.keys(shape).map(key => [key, 0])));
  assert.equal(rejected.status, 400);
  assert.equal(rejected.response.message, "Validation failed");
  assert.equal(rejected.response.errors.length, INPUT_LIMITS.errors);
  assert.ok(JSON.stringify(rejected.response).length < 3_500);
  const longIssue = invoke(z.object({ note: z.string().superRefine((_value, ctx) => ctx.addIssue({ code: "custom", path: ["x".repeat(1_000)], message: "x".repeat(1_000) })) }), { note: "text" });
  assert.equal(longIssue.response.errors[0].field.length, INPUT_LIMITS.fieldName);
  assert.equal(longIssue.response.errors[0].message.length, 200);
  const marker = "synthetic-unrecognized-field";
  const strict = invoke(createFeedingLogSchema, { [marker]: 0 });
  assert.equal(strict.response.errors[0].message, "Unrecognized fields");
  assert.equal(JSON.stringify(strict.response).includes(marker), false);
  assert.equal(invoke(registerSchema, undefined).status, 400);
  let continued = false;
  validateRequestShape({ body: undefined }, { status() { assert.fail("bodyless reads must pass"); } }, () => { continued = true; });
  assert.equal(continued, true);
});

test("media intent checksum bounds retain valid intent and reject an oversized checksum", () => {
  const intent = { purpose: "report", contentType: "image/jpeg", byteLength: 1, checksum: Buffer.alloc(32).toString("base64") };
  assert.equal(intentSchema.safeParse(intent).success, true);
  assert.equal(intentSchema.safeParse({ ...intent, checksum: "x".repeat(100_000) }).success, false);
});

test("guest report HTTP validation rejects excessive collections and still accepts subsequent ordinary requests", async t => {
  let creates = 0;
  const store = { async create(input) { creates++; assert.equal(input.createdBy, null); return { ...input, publicId: "synthetic-report", createdBy: null, status: "new" }; } };
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use("/api/reports", createReportRouter(store, (_req, _res, next) => next(), (_req, _res, next) => next()));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, "listening");
  const submit = input => fetch(`http://127.0.0.1:${server.address().port}/api/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const rejected = await submit({ ...report, media: Array(1_000).fill(0) });
  assert.equal(rejected.status, 400);
  const response = await rejected.text();
  assert.ok(response.length < 200);
  assert.equal(creates, 0);
  const accepted = await submit(report);
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).description, report.description);
  assert.equal(creates, 1);
});
