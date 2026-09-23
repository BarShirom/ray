import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Station from "../dist/models/FeedingStationModel.js";
import Log from "../dist/models/FeedingLogModel.js";
import { mongoFeedingStationStore as stations } from "../dist/feedingStations/mongoFeedingStationStore.js";
import { mongoFeedingLogStore as logs } from "../dist/feedingLogs/mongoFeedingLogStore.js";
import { serializeFeedingStation } from "../dist/serializers/feedingStationResponse.js";
import { serializeFeedingLog } from "../dist/serializers/feedingLogResponse.js";
import { isPublicId } from "../dist/utils/publicId.js";
import { ids, document, json, stubList, timestamp } from "./helpers/contracts.mjs";

const logId = "400000000000000000000001";
const point = { lat: 0, lng: -73.123456 };
const poison = { password: "private", passwordHash: "private", internalId: "private-uuid", user: { email: "private" } };

test.beforeEach((t) => {
  const unexpected = () => { throw new Error("Unexpected database access in offline adapter test"); };
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose, "createConnection", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  t.mock.method(mongoose.Model.prototype, "save", unexpected);
});

test("station creation maps only existing fields, trusted creator and model defaults", async (t) => {
  let saved;
  t.mock.method(Station, "create", async (values) => {
    assert.deepEqual(values, { name: "  Garden cats  ", location: point, createdBy: ids.user,
      estimatedCats: undefined, estimatedKittens: undefined, image: undefined, notes: undefined });
    saved = document(Station, { ...values, _id: ids.station, __v: 4 });
    return saved;
  });
  const record = await stations.create({ name: "  Garden cats  ", location: { ...point, ...poison },
    createdBy: ids.user, active: false, _id: ids.other, __v: 99, ...poison });
  assert.equal(Object.getPrototypeOf(record), Object.prototype);
  assert.equal(record.publicId, ids.station);
  assert.equal(record.createdBy, ids.user);
  assert.equal(record.name, "Garden cats");
  assert.equal(record.estimatedCats, 0);
  assert.equal(record.estimatedKittens, 0);
  assert.equal(record.active, true);
  assert.equal(record.legacyVersion, 4);
  assert.deepEqual(record.location, point);
  assert.deepEqual(json(serializeFeedingStation(record)), json(saved));
});

for (const details of [{}, { fedAt: new Date("2026-09-23T09:00:00.123+03:00"), period: "morning", food: false, water: false, note: "  " }]) {
  test(`log creation preserves model defaults and explicit values: ${JSON.stringify(details)}`, async (t) => {
    let saved;
    t.mock.method(Log, "create", async (values) => {
      assert.deepEqual(values, { stationId: ids.station, userId: ids.user, fedAt: details.fedAt,
        period: details.period, food: details.food, water: details.water, note: details.note });
      saved = document(Log, { ...values, _id: logId });
      return saved;
    });
    const before = Date.now();
    const record = await logs.create({ stationId: ids.station, userId: ids.user, ...details, ...poison, __v: 99 });
    assert.equal(Object.getPrototypeOf(record), Object.prototype);
    assert.equal(record.publicId, logId);
    assert.equal(record.stationId, ids.station);
    assert.equal(record.userId, ids.user);
    assert.equal(record.food, details.food ?? true);
    assert.equal(record.water, details.water ?? false);
    if (details.fedAt) {
      assert.equal(record.fedAt.toISOString(), "2026-09-23T06:00:00.123Z");
      assert.equal(record.note, "");
    } else {
      assert.ok(record.fedAt.getTime() >= before && record.fedAt.getTime() <= Date.now());
      assert.equal(record.note, undefined);
    }
    assert.deepEqual(json(serializeFeedingLog(record)), json(saved));
  });
}

for (const version of [undefined, null, 0, 7]) {
  test(`lean station/log mapping and whitelisting retain version ${version}`, async (t) => {
    const station = {
      _id: new mongoose.Types.ObjectId(ids.station), name: "Legacy station", location: point,
      createdBy: new mongoose.Types.ObjectId(ids.user), active: false, estimatedCats: 0, estimatedKittens: null,
      image: "", notes: "  untrimmed historical notes  ", createdAt: new Date(timestamp), updatedAt: null,
      ...(version === undefined ? {} : { __v: version }),
    };
    const log = {
      _id: new mongoose.Types.ObjectId(logId), stationId: station._id, userId: station.createdBy,
      food: false, water: null, period: "", note: "  historical note  ",
      fedAt: new Date("2026-09-23T09:00:00.123+03:00"), createdAt: new Date(timestamp), updatedAt: null,
      ...(version === undefined ? {} : { __v: version }),
    };
    t.mock.method(Station, "findById", (id) => {
      assert.equal(id, ids.station);
      return { lean: async () => ({ ...station, ...poison, location: { ...point, ...poison } }) };
    });
    stubList(t, Log, { stationId: ids.station }, { fedAt: -1, createdAt: -1 }, [{ ...log, ...poison }]);
    const stationRecord = await stations.findByPublicId(ids.station);
    const [logRecord] = await logs.listForStation(ids.station);
    for (const record of [stationRecord, logRecord]) {
      assert.equal(Object.getPrototypeOf(record), Object.prototype);
      assert.equal(typeof record.publicId, "string");
      assert.equal(record.legacyVersion, version);
      assert.equal(Object.hasOwn(record, "legacyVersion"), version !== undefined);
      for (const key of ["_id", "__v", ...Object.keys(poison)]) assert.equal(Object.hasOwn(record, key), false);
    }
    assert.equal(stationRecord.createdBy, ids.user);
    assert.equal(logRecord.stationId, ids.station);
    assert.equal(logRecord.userId, ids.user);
    const stationResponse = serializeFeedingStation({ ...stationRecord, ...poison, __v: 99, location: { ...point, ...poison } });
    const logResponse = serializeFeedingLog({ ...logRecord, ...poison, __v: 99 });
    assert.equal(Object.hasOwn(stationResponse, "__v"), version !== undefined);
    assert.equal(Object.hasOwn(logResponse, "__v"), version !== undefined);
    assert.deepEqual(json(stationResponse), json(station));
    assert.deepEqual(json(logResponse), json(log));
  });
}

for (const fields of [{}, { image: null, notes: null, location: null, createdBy: null, active: null },
  { image: "", notes: "", location: {}, estimatedCats: null, estimatedKittens: 0 }]) {
  test(`historical station reads do not invent defaults: ${JSON.stringify(fields)}`, async (t) => {
    const row = { _id: new mongoose.Types.ObjectId(ids.station), ...fields };
    stubList(t, Station, { active: true }, { createdAt: -1 }, [row]);
    const [record] = await stations.listActive();
    assert.deepEqual(json(serializeFeedingStation(record)), json(row));
  });
}

for (const fields of [{}, { fedAt: null, food: null, water: null, period: null, note: null, stationId: null, userId: null },
  { food: false, water: false, period: "", note: "" }]) {
  test(`historical log reads do not invent defaults: ${JSON.stringify(fields)}`, async (t) => {
    const row = { _id: new mongoose.Types.ObjectId(logId), ...fields };
    stubList(t, Log, { stationId: ids.station }, { fedAt: -1, createdAt: -1 }, [row]);
    const [record] = await logs.listForStation(ids.station);
    assert.deepEqual(json(serializeFeedingLog(record)), json(row));
  });
}

test("missing station and empty collections differ from rejected database operations", async (t) => {
  const find = t.mock.method(Station, "findById", () => ({ lean: async () => null }));
  stubList(t, Station, { active: true }, { createdAt: -1 }, []);
  stubList(t, Log, { stationId: ids.station }, { fedAt: -1, createdAt: -1 }, []);
  assert.equal(await stations.findByPublicId(ids.station), null);
  assert.deepEqual(await stations.listActive(), []);
  assert.deepEqual(await logs.listForStation(ids.station), []);
  const failure = new Error("synthetic database failure");
  const reject = async () => { throw failure; };
  find.mock.mockImplementation(() => ({ lean: reject }));
  Station.find.mock.mockImplementation(() => ({ sort: () => ({ lean: reject }) }));
  Log.find.mock.mockImplementation(() => ({ sort: () => ({ lean: reject }) }));
  t.mock.method(Station, "create", reject);
  t.mock.method(Log, "create", reject);
  for (const operation of [
    () => stations.findByPublicId(ids.station), () => stations.listActive(),
    () => stations.create({ name: "Test", location: point, createdBy: ids.user }),
    () => logs.listForStation(ids.station), () => logs.create({ stationId: ids.station, userId: ids.user }),
  ]) await assert.rejects(operation, (error) => error === failure);
});

test("public-ID guard accepts exactly 24 hex characters, including uppercase", () => {
  for (const value of [ids.station, "ABCDEF".repeat(4), "aBcDeF".repeat(4)]) assert.equal(isPublicId(value), true);
  for (const value of [undefined, null, 123, {}, [], [ids.station], new String(ids.station),
    new mongoose.Types.ObjectId(ids.station), "", "a".repeat(23), "a".repeat(25), "g".repeat(24),
    ` ${ids.station}`, `${ids.station} `, `${ids.station}\n`, `${ids.station}\r\n`, "abcdefghijkl", "１２３４５６７８９０１２３４５６７８９０１２３４"]) {
    assert.equal(isPublicId(value), false, `must reject ${String(value)}`);
  }
});
