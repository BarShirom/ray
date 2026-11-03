import assert from "node:assert/strict";
import test from "node:test";
import { startApp, privacyFixture, ids, location, assertValidation } from "./helpers/contracts.mjs";
const base = "/api/feeding-stations";

test("feeding receipt excludes actor/version metadata and retains input semantics", async t => {
  const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
  const response = await request("POST", `${base}/${ids.station}/feedings`, {
    food: false, water: false, note: "  ", fedAt: "2026-09-23T09:00:00.123+03:00",
  }, token);
  assert.equal(response.status, 201);
  assert.equal(response.body.fedAt, "2026-09-23T06:00:00.123Z");
  assert.equal(response.body.note, "");
  assert.deepEqual(Object.keys(response.body).sort(), ["_id", "stationId", "food", "water", "fedAt", "createdAt", "updatedAt", "note"].sort());
  assert.equal(f.state.calls[0].identity._id, ids.user);
  assert.equal(f.state.calls[0].args[0], ids.station);
});
test("own history and shared summary use separate handlers, preserving explicit historical nulls", async t => {
  const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
  f.state.logs = [{ _id: ids.other, stationId: ids.station, food: false, water: false, period: null, note: "", fedAt: null }];
  assert.deepEqual(await request("GET", `${base}/${ids.station}/feedings`, undefined, token), { status: 200, body: f.state.logs });
  assert.deepEqual(await request("GET", `${base}/${ids.station}/feeding-summary`, undefined, token), {
    status: 200, body: { food: { recency: "no-record" }, water: { recency: "no-record" } },
  });
  assert.deepEqual(f.state.calls.map(c => c.operation), ["ownLogs", "summary"]);
});
test("route ID whitespace is rejected before protected store access", async t => {
  const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
  for (const suffix of [" ", "\n", "\r\n"]) {
    const id = encodeURIComponent(ids.station + suffix);
    for (const [method, path, field] of [["GET", `${base}/${id}`, "id"], ["GET", `${base}/${id}/feedings`, "stationId"],
      ["GET", `${base}/${id}/feeding-summary`, "stationId"], ["POST", `${base}/${id}/feedings`, "stationId"]]) {
      assertValidation(await request(method, path, method === "POST" ? {} : undefined, token), field);
    }
  }
  assert.deepEqual(f.state.calls, []);
  assert.equal((await request("GET", `${base}/${"ABCDEF".repeat(4)}`, undefined, token)).status, 200);
});
for (const active of [false, undefined, null]) {
  test(`historical activity ${active} blocks feed writes but permits authorized own history`, async t => {
    const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
    f.state.detail.active = active;
    assert.deepEqual(await request("POST", `${base}/${ids.station}/feedings`, {}, token), { status: 409, body: { message: "Feeding station is inactive" } });
    assert.deepEqual(await request("GET", `${base}/${ids.station}/feedings`, undefined, token), { status: 200, body: [] });
  });
}
for (const [method, path, body] of [["POST", base, { name: "Garden cats", location }], ["GET", base],
  ["GET", `${base}/${ids.station}`], ["POST", `${base}/${ids.station}/feedings`, {}],
  ["GET", `${base}/${ids.station}/feedings`], ["GET", `${base}/${ids.station}/feeding-summary`]]) {
  test(`${method} ${path} propagates service failure instead of empty success`, async t => {
    const f = privacyFixture(), { request, token } = await startApp(t, { stationStore: f.store });
    f.state.failure = Object.assign(new Error("synthetic database rejection"), { name: "SyntheticDatabaseError" });
    assert.deepEqual(await request(method, path, body, token), { status: 500, body: { error: "SyntheticDatabaseError", message: "synthetic database rejection" } });
  });
}
