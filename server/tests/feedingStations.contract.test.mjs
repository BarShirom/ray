import assert from "node:assert/strict";
import test from "node:test";
import Station from "../dist/models/FeedingStationModel.js";
import { startApp, stubCreate, stubList, document, ids, location, json, assertEntity, assertValidation } from "./helpers/contracts.mjs";
const input = { name: "  Garden cats  ", location };

for (const auth of ["missing", "invalid"]) {
  test(`station creation rejects ${auth} authentication`, async (t) => {
    const { request, invalidToken } = await startApp(t);
    assert.deepEqual(await request("POST", "/api/feeding-stations", input, auth === "invalid" ? invalidToken : undefined), {
      status: 401, body: { error: auth === "invalid" ? "Invalid or expired token" : "Authorization token required" },
    });
  });
}
for (const optional of [{}, { image: "", notes: "" }, { image: "https://media.example.invalid/cats.jpg", notes: "  Shaded spot  ", estimatedCats: 3, estimatedKittens: 1 }]) {
  test(`station creation contract ${JSON.stringify(optional)}`, async (t) => {
    const { request, token } = await startApp(t);
    let created;
    stubCreate(t, Station, (data) => { created = data; });
    const response = await request("POST", "/api/feeding-stations", { ...input, ...optional, createdBy: ids.other, active: false }, token);
    assert.equal(response.status, 201);
    assertEntity(response.body);
    assert.equal(String(created.createdBy), ids.user);
    assert.equal(response.body.createdBy, ids.user);
    assert.equal(response.body.name, "Garden cats");
    assert.deepEqual(response.body.location, location);
    assert.equal(response.body.active, true);
    assert.equal(response.body.estimatedCats, optional.estimatedCats ?? 0);
    assert.equal(response.body.estimatedKittens, optional.estimatedKittens ?? 0);
    for (const field of ["image", "notes"]) {
      assert.equal(Object.hasOwn(response.body, field), Object.hasOwn(optional, field));
      assert.equal(response.body[field], optional[field]);
    }
  });
}
for (const [changes, field] of [[{ name: " " }, "name"], [{ location: {} }, "location.lat"], [{ estimatedCats: -1 }, "estimatedCats"], [{ estimatedKittens: 1.5 }, "estimatedKittens"], [{ image: null }, "image"], [{ notes: null }, "notes"]]) {
  test(`station validation: ${field}`, async (t) => {
    const { request, token } = await startApp(t);
    assertValidation(await request("POST", "/api/feeding-stations", { ...input, ...changes }, token), field);
  });
}
test("public station list requests active-only newest-first and returns array", async (t) => {
  const { request } = await startApp(t);
  const rows = [document(Station, { ...input, createdBy: ids.user }).toObject()];
  stubList(t, Station, { active: true }, { createdAt: -1 }, rows);
  const response = await request("GET", "/api/feeding-stations");
  assert.deepEqual(response, { status: 200, body: json(rows) });
  assertEntity(response.body[0]);
  assert.equal(response.body[0].createdBy, ids.user);
});
for (const active of [true, false]) {
  test(`public detail access, active=${active}, stored null optional fields`, async (t) => {
    const { request } = await startApp(t);
    const row = document(Station, { ...input, _id: ids.station, createdBy: ids.user, active, image: null, notes: null }).toObject();
    t.mock.method(Station, "findById", (id) => {
      assert.equal(id, ids.station);
      return { lean: async () => row };
    });
    assert.deepEqual(await request("GET", `/api/feeding-stations/${ids.station}`), { status: 200, body: json(row) });
  });
}
test("station malformed and missing IDs retain distinct responses", async (t) => {
  const { request } = await startApp(t);
  const lookup = t.mock.method(Station, "findById", (id) => {
    assert.equal(id, ids.station);
    return { lean: async () => null };
  });
  assert.deepEqual(await request("GET", "/api/feeding-stations/bad"), { status: 400, body: { message: "Validation failed", errors: [{ field: "id", message: "Invalid feeding station ID" }] } });
  assert.equal(lookup.mock.callCount(), 0);
  assert.deepEqual(await request("GET", `/api/feeding-stations/${ids.station}`), { status: 404, body: { message: "Feeding station not found" } });
});
