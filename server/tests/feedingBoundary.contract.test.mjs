import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Station from "../dist/models/FeedingStationModel.js";
import Log from "../dist/models/FeedingLogModel.js";
import { startApp, document, ids, location, json, stubList } from "./helpers/contracts.mjs";

const base = "/api/feeding-stations";
const stationInput = { name: "  Garden cats  ", location };
const logId = "400000000000000000000001";
const poison = { password: "private", passwordHash: "private", internalId: "private-uuid", user: { email: "private" } };

for (const version of [undefined, 0, 8]) {
  test(`HTTP creation whitelists both domains and retains __v ${version}`, async (t) => {
    const { request, token } = await startApp(t);
    let stationDoc;
    let logDoc;
    const events = [];
    t.mock.method(Station, "create", async (values) => {
      assert.equal(values.createdBy, ids.user);
      assert.equal(Object.hasOwn(values, "active"), false);
      stationDoc = document(Station, { ...values, _id: ids.station, __v: version });
      return stationDoc;
    });
    const stationResponse = await request("POST", base, { ...stationInput, active: false, createdBy: ids.other }, token);
    assert.deepEqual(stationResponse, { status: 201, body: json(stationDoc) });
    assert.equal(Object.hasOwn(stationResponse.body, "__v"), version !== undefined);
    t.mock.method(Station, "findById", (id) => {
      assert.equal(id, ids.station);
      return { lean: async () => { events.push("station"); return stationDoc.toObject(); } };
    });
    t.mock.method(Log, "create", async (values) => {
      events.push("create");
      assert.equal(values.stationId, ids.station);
      assert.equal(values.userId, ids.user);
      logDoc = document(Log, { ...values, _id: logId, __v: version });
      return logDoc;
    });
    const logResponse = await request("POST", `${base}/${ids.station}/feedings`, {
      food: false, water: false, note: "  ", fedAt: "2026-09-23T09:00:00.123+03:00",
    }, token);
    assert.deepEqual(logResponse, { status: 201, body: json(logDoc) });
    assert.equal(logResponse.body.fedAt, "2026-09-23T06:00:00.123Z");
    assert.equal(Object.hasOwn(logResponse.body, "__v"), version !== undefined);
    assert.deepEqual(events, ["station", "create"]);
  });
}

test("HTTP reads preserve historical absence/null/false and whitelist lean database fields", async (t) => {
  const { request } = await startApp(t);
  const station = { _id: new mongoose.Types.ObjectId(ids.station), active: true,
    createdBy: new mongoose.Types.ObjectId(ids.user), location: { lat: 0, lng: -73.123456 }, image: null, notes: "", __v: 5 };
  const rawStation = { ...station, ...poison, location: { ...station.location, internalId: "private-location" } };
  stubList(t, Station, { active: true }, { createdAt: -1 }, [rawStation]);
  t.mock.method(Station, "findById", () => ({ lean: async () => rawStation }));
  assert.deepEqual(await request("GET", base), { status: 200, body: [json(station)] });
  assert.deepEqual(await request("GET", `${base}/${ids.station}`), { status: 200, body: json(station) });
  const historical = [
    { _id: new mongoose.Types.ObjectId(logId), stationId: station._id, userId: station.createdBy,
      food: false, water: false, note: "", period: null, fedAt: null, __v: 0 },
    { _id: new mongoose.Types.ObjectId(ids.other), stationId: station._id, userId: null },
  ];
  stubList(t, Log, { stationId: ids.station }, { fedAt: -1, createdAt: -1 }, historical.map((row) => ({ ...row, ...poison })));
  assert.deepEqual(await request("GET", `${base}/${ids.station}/feedings`), { status: 200, body: json(historical) });
});

test("uppercase route IDs reach Mongo unchanged and serialize as canonical public IDs", async (t) => {
  const { request, token } = await startApp(t);
  const routeId = "ABCDEF".repeat(4);
  const row = document(Station, { ...stationInput, _id: routeId, createdBy: ids.user }).toObject();
  t.mock.method(Station, "findById", (id) => {
    assert.equal(id, routeId);
    return { lean: async () => row };
  });
  stubList(t, Log, { stationId: routeId }, { fedAt: -1, createdAt: -1 }, []);
  t.mock.method(Log, "create", async (values) => {
    assert.equal(values.stationId, routeId);
    return document(Log, values);
  });
  assert.deepEqual(await request("GET", `${base}/${routeId}`), { status: 200, body: json(row) });
  assert.deepEqual(await request("GET", `${base}/${routeId}/feedings`), { status: 200, body: [] });
  const created = await request("POST", `${base}/${routeId}/feedings`, {}, token);
  assert.equal(created.status, 201);
  assert.equal(created.body.stationId, routeId.toLowerCase());
});

test("route ID validation rejects trailing whitespace before database access with the existing field names", async (t) => {
  const { request, token } = await startApp(t);
  const lookup = t.mock.method(Station, "findById", () => assert.fail("invalid ID must not query Mongo"));
  for (const suffix of [" ", "\n", "\r\n"]) {
    const routeId = encodeURIComponent(ids.station + suffix);
    for (const [method, path, field] of [
      ["GET", `${base}/${routeId}`, "id"],
      ["GET", `${base}/${routeId}/feedings`, "stationId"],
      ["POST", `${base}/${routeId}/feedings`, "stationId"],
    ]) {
      assert.deepEqual(await request(method, path, method === "POST" ? {} : undefined, token), {
        status: 400, body: { message: "Validation failed", errors: [{ field, message: "Invalid feeding station ID" }] },
      });
    }
  }
  assert.equal(lookup.mock.callCount(), 0);
});

for (const active of [undefined, null]) {
  test(`historical activity ${active} blocks insertion but permits public history`, async (t) => {
    const { request, token } = await startApp(t);
    t.mock.method(Station, "findById", () => ({ lean: async () => ({ _id: ids.station, active }) }));
    const create = t.mock.method(Log, "create", () => assert.fail("inactive station must not insert"));
    stubList(t, Log, { stationId: ids.station }, { fedAt: -1, createdAt: -1 }, []);
    assert.deepEqual(await request("POST", `${base}/${ids.station}/feedings`, {}, token), {
      status: 409, body: { message: "Feeding station is inactive" },
    });
    assert.deepEqual(await request("GET", `${base}/${ids.station}/feedings`), { status: 200, body: [] });
    assert.equal(create.mock.callCount(), 0);
  });
}

for (const [method, path, failingOperation] of [
  ["POST", base, "station-create"], ["GET", base, "station-list"],
  ["GET", `${base}/${ids.station}`, "station-lookup"],
  ["POST", `${base}/${ids.station}/feedings`, "station-lookup"],
  ["GET", `${base}/${ids.station}/feedings`, "station-lookup"],
  ["POST", `${base}/${ids.station}/feedings`, "log-create"],
  ["GET", `${base}/${ids.station}/feedings`, "log-list"],
]) {
  test(`${method} ${path} forwards ${failingOperation} failure to the existing error handler`, async (t) => {
    const { request, token } = await startApp(t);
    const failure = new Error("synthetic database rejection");
    failure.name = "SyntheticDatabaseError";
    const reject = async () => { throw failure; };
    t.mock.method(Station, "create", reject);
    t.mock.method(Station, "find", () => ({ sort: () => ({ lean: reject }) }));
    t.mock.method(Station, "findById", () => ({ lean: failingOperation === "station-lookup"
      ? reject : async () => ({ _id: ids.station, active: true }) }));
    const create = t.mock.method(Log, "create", reject);
    const find = t.mock.method(Log, "find", () => ({ sort: () => ({ lean: reject }) }));
    assert.deepEqual(await request(method, path, method === "POST" ? (path === base ? stationInput : {}) : undefined, token), {
      status: 500, body: { error: failure.name, message: failure.message },
    });
    if (failingOperation === "station-lookup") {
      assert.equal(create.mock.callCount(), 0);
      assert.equal(find.mock.callCount(), 0);
    }
  });
}
