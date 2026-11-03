import assert from "node:assert/strict";
import test from "node:test";
import { startApp, privacyFixture, ids, location, assertValidation } from "./helpers/contracts.mjs";
const base = "/api/feeding-stations";
const input = { name: "  Garden cats  ", location };

for (const auth of ["missing", "invalid"]) {
  test(`all station routes reject ${auth} authentication before store access`, async t => {
    const f = privacyFixture(), { request, invalidToken } = await startApp(t, { stationStore: f.store });
    for (const [method, path, body] of [["GET", base], ["HEAD", base], ["GET", `${base}/${ids.station}`],
      ["GET", `${base}/${ids.station}/feedings`], ["GET", `${base}/${ids.station}/feeding-summary`],
      ["POST", base, input], ["POST", `${base}/${ids.station}/feedings`, {}], ["DELETE", `${base}/${ids.station}`]]) {
      const response = await request(method, path, body, auth === "invalid" ? invalidToken : undefined);
      assert.equal(response.status, 401);
      if (method !== "HEAD") assert.deepEqual(response.body, { error: auth === "invalid" ? "Invalid or expired token" : "Authorization token required" });
    }
    assert.deepEqual(f.state.calls, []);
  });
}
for (const visibility of [undefined, "sensitive", "regular"]) {
  test(`creation uses trusted actor and approved fields, visibility=${visibility}`, async t => {
    const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
    const response = await request("POST", base, { ...input, notes: "  Shaded spot  ", estimatedCats: 3,
      ...(visibility === undefined ? {} : { visibility }), createdBy: ids.other, active: false, grants: [ids.other] }, token);
    assert.equal(response.status, 201);
    assert.equal(response.body.name, "Garden cats");
    assert.equal(response.body.active, true);
    assert.equal(response.body.visibility, visibility ?? "sensitive");
    const call = f.state.calls[0];
    assert.equal(call.operation, "create");
    assert.equal(call.identity._id, ids.user);
    for (const key of ["createdBy", "active", "grants"]) assert.equal(Object.hasOwn(call.args[0], key), false);
    for (const key of ["createdBy", "createdAt", "updatedAt", "__v", "userId"]) assert.equal(Object.hasOwn(response.body, key), false);
  });
}
for (const [changes, field] of [[{ name: " " }, "name"], [{ location: {} }, "location.lat"],
  [{ location: { lat: 91, lng: 34 } }, "location.lat"], [{ location: { lat: 32, lng: -181 } }, "location.lng"],
  [{ estimatedCats: -1 }, "estimatedCats"], [{ estimatedKittens: 1.5 }, "estimatedKittens"],
  [{ image: null }, "image"], [{ image: "https://external.invalid/image" }, "image"], [{ notes: null }, "notes"],
  [{ visibility: "public" }, "visibility"]]) {
  test(`protected station validation: ${field} ${JSON.stringify(changes)}`, async t => {
    const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
    assertValidation(await request("POST", base, { ...input, ...changes }, token), field);
    assert.deepEqual(f.state.calls, []);
  });
}
test("protected reads use the injected actor-scoped store", async t => {
  const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
  assert.deepEqual(await request("GET", base, undefined, token), { status: 200, body: [f.state.detail] });
  assert.deepEqual(await request("GET", `${base}/${ids.station}`, undefined, token), { status: 200, body: f.state.detail });
  assert.deepEqual(f.state.calls.map(c => [c.operation, c.identity._id]), [["list", ids.user], ["detail", ids.user]]);
});
test("invalid IDs do not reach the store; inaccessible IDs have no metadata", async t => {
  const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
  assertValidation(await request("GET", `${base}/bad`, undefined, token), "id");
  assert.equal(f.state.calls.length, 0);
  f.state.detail = null;
  assert.deepEqual(await request("GET", `${base}/${ids.station}`, undefined, token), { status: 404, body: { message: "Feeding station not found" } });
});
test("unsupported methods and paths cannot reach public fallback handlers", async t => {
  const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
  for (const [method, path] of [["DELETE", `${base}/${ids.station}`], ["PATCH", `${base}/${ids.station}/visibility`],
    ["POST", `${base}/${ids.station}/grants`], ["GET", `${base}/${ids.station}/unknown`]]) {
    assert.equal((await request(method, path, undefined, token)).status, 404);
  }
  assert.deepEqual(f.state.calls, []);
});
