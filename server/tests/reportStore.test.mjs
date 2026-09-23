import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Report from "../dist/models/ReportModel.js";
import { mongoReportStore as reports } from "../dist/reports/mongoReportStore.js";
import { serializeReport } from "../dist/serializers/reportResponse.js";
import { reportFullName } from "../dist/reports/reportNames.js";
import { document, stubReportDocument, stubList, ids, json, timestamp } from "./helpers/contracts.mjs";

const input = { description: "  Cats need help  ", type: "general", location: { lat: 0, lng: -73.123456 } };
const poison = { email: "private@example.invalid", password: "private", passwordHash: "private", company: "private", token: "private", internalId: "private-uuid" };
const fixture = (fields = {}) => document(Report, { ...input, _id: ids.report, ...fields });

test.beforeEach((t) => {
  const unexpected = () => { throw new Error("Unexpected database access in offline report test"); };
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose, "createConnection", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  t.mock.method(mongoose.Model.prototype, "save", unexpected);
});

for (const authenticated of [false, true]) {
  test(`creation maps existing fields and populates a plain safe result: authenticated=${authenticated}`, async (t) => {
    const creator = authenticated ? ids.user : null;
    const name = authenticated ? "Legacy creator" : "Guest";
    const media = authenticated ? ["second.jpg", "first.mp4", "second.jpg"] : undefined;
    t.mock.method(Report, "create", async (values) => {
      assert.deepEqual(values, { ...input, media: media ?? [], status: "new", createdBy: creator, createdByName: name });
      return stubReportDocument(t, fixture(values), [{ _id: ids.user, name: "Legacy creator", ...poison }]);
    });
    const record = await reports.create({ ...input, media, createdBy: creator, createdByName: name,
      assignedTo: ids.other, assignedToName: "Forged", status: "resolved", __v: 99, ...poison });
    assert.equal(Object.getPrototypeOf(record), Object.prototype);
    assert.equal(record.publicId, ids.report);
    assert.equal(record.description, input.description);
    assert.deepEqual(record.media, media ?? []);
    assert.equal(record.status, "new");
    assert.equal(record.assignedTo, null);
    assert.equal(record.assignedToName, null);
    assert.equal(record.createdByName, name);
    assert.equal(record.legacyVersion, 0);
    if (authenticated) {
      assert.deepEqual(json(record.createdBy), { publicId: ids.user, name: "Legacy creator" });
      assert.equal(Object.getPrototypeOf(record.createdBy), Object.prototype);
    } else assert.equal(record.createdBy, null);
    assert.deepEqual(json(serializeReport(record)).createdBy, authenticated ? { _id: ids.user, name: "Legacy creator" } : null);
    for (const key of Object.keys(poison)) assert.equal(Object.hasOwn(record, key), false);
  });
}

for (const version of [undefined, null, 0, 8]) {
  test(`lean mapping and both serializer whitelists preserve version ${version}`, async (t) => {
    const row = { ...input, _id: new mongoose.Types.ObjectId(ids.report), status: "in-progress",
      media: ["second.jpg", "first.mp4"], createdAt: new Date("2026-09-23T09:00:00.123+03:00"), updatedAt: new Date(timestamp),
      createdBy: { _id: new mongoose.Types.ObjectId(ids.user), firstName: " Test ", lastName: null, name: "Legacy" },
      assignedTo: { _id: new mongoose.Types.ObjectId(ids.other), firstName: "", lastName: "Carer", name: "" },
      createdByName: "", assignedToName: null, ...(version === undefined ? {} : { __v: version }) };
    const raw = { ...row, ...poison, location: { ...row.location, ...poison },
      createdBy: { ...row.createdBy, ...poison }, assignedTo: { ...row.assignedTo, ...poison } };
    stubList(t, Report, undefined, { createdAt: -1 }, [raw], true);
    const [record] = await reports.listAll();
    assert.equal(record.createdBy.publicId, ids.user);
    assert.equal(record.assignedTo.publicId, ids.other);
    assert.equal(record.legacyVersion, version);
    assert.equal(Object.hasOwn(record, "legacyVersion"), version !== undefined);
    for (const mapped of [record, record.createdBy, record.assignedTo, record.location]) {
      assert.equal(Object.getPrototypeOf(mapped), Object.prototype);
      for (const key of Object.keys(poison)) assert.equal(Object.hasOwn(mapped, key), false);
    }
    const response = serializeReport({ ...record, ...poison, __v: 99, location: { ...record.location, ...poison },
      createdBy: { ...record.createdBy, ...poison }, assignedTo: { ...record.assignedTo, ...poison } });
    assert.deepEqual(json(response), json({ ...row, assignedToName: "Carer" }));
    assert.equal(response.createdAt, "2026-09-23T06:00:00.123Z");
    assert.equal(Object.hasOwn(response, "__v"), version !== undefined);
  });
}

test("name precedence preserves stored empty strings and the exact untrimmed legacy/first-last fallback", () => {
  for (const [stored, user, expected] of [
    ["Stored", { name: "Legacy", firstName: "First", lastName: "Last" }, "Stored"],
    ["", { name: "Legacy" }, ""], [null, { name: "Legacy", firstName: "First" }, "Legacy"],
    [undefined, { name: "", firstName: " First ", lastName: " Last " }, " First   Last "],
    [null, { name: " ", firstName: "First" }, " "], [null, { firstName: "", lastName: "Last" }, "Last"],
    [null, { firstName: null, lastName: "" }, null], ["Snapshot", null, "Snapshot"],
    [undefined, undefined, null],
  ]) {
    const summary = user == null ? user : { publicId: ids.user, ...user };
    const result = serializeReport({ publicId: ids.report, createdBy: summary, assignedTo: summary,
      createdByName: stored, assignedToName: stored });
    assert.equal(result.createdByName, expected);
    assert.equal(result.assignedToName, expected);
  }
  assert.equal(reportFullName({ name: "", firstName: "", lastName: null }), null);
});

test("historical missing/null fields are preserved without read defaults or invented user summaries", async (t) => {
  const rows = [
    { _id: new mongoose.Types.ObjectId(ids.report) },
    { _id: new mongoose.Types.ObjectId(ids.report), description: null, type: null, status: null,
      location: null, media: null, createdAt: null, updatedAt: null, createdBy: null, assignedTo: null,
      createdByName: "Retained creator", assignedToName: "" },
  ];
  stubList(t, Report, { assignedTo: ids.user }, { createdAt: -1 }, rows, true);
  const records = await reports.listAssignedTo(ids.user);
  assert.deepEqual(json(records.map(serializeReport)), [
    { _id: ids.report, createdByName: null, assignedToName: null }, json(rows[1]),
  ]);
});

for (const status of ["in-progress", "resolved"]) {
  test(`claim refuses ${status} without mutation, save or population`, async (t) => {
    const doc = stubReportDocument(t, fixture({ status, assignedTo: ids.other, assignedToName: "Existing" }));
    const before = doc.toObject();
    t.mock.method(Report, "findById", async (id) => { assert.equal(id, ids.report); return doc; });
    assert.deepEqual(await reports.claim(ids.report, { publicId: ids.user, name: "Carer" }), { kind: "not-new" });
    assert.deepEqual(doc.toObject(), before);
    assert.equal(doc.save.mock.callCount(), 0);
    assert.equal(doc.populate.mock.callCount(), 0);
  });
}

for (const [actorName, storedName, expected] of [["Carer", "Old", "Carer"], [null, "", ""], [null, "Old", "Old"], [null, null, null]]) {
  test(`claim name fallback ${JSON.stringify([actorName, storedName])} and save-before-populate`, async (t) => {
    const doc = stubReportDocument(t, fixture({ assignedToName: storedName }), []);
    const events = [];
    doc.save.mock.mockImplementation(async () => { events.push("save"); return doc; });
    doc.populate.mock.mockImplementation(async (spec) => {
      assert.deepEqual(spec, [{ path: "createdBy", select: "firstName lastName name" }, { path: "assignedTo", select: "firstName lastName name" }]);
      events.push("populate");
      return { toObject: () => ({ ...doc.toObject(), createdBy: null, assignedTo: null }) };
    });
    t.mock.method(Report, "findById", async () => { events.push("lookup"); return doc; });
    const outcome = await reports.claim(ids.report, { publicId: ids.user, name: actorName });
    assert.equal(outcome.kind, "claimed");
    assert.equal(String(doc.assignedTo), ids.user);
    assert.equal(doc.status, "in-progress");
    assert.equal(doc.assignedToName, expected);
    assert.equal(outcome.report.assignedTo, null); // dangling populated user does not erase the snapshot
    assert.equal(serializeReport(outcome.report).assignedToName, expected);
    assert.deepEqual(events, ["lookup", "save", "populate"]);
  });
}

for (const assignedTo of [null, ids.other]) {
  test(`resolve denies raw assignee ${assignedTo} regardless of display name, without mutation`, async (t) => {
    const doc = stubReportDocument(t, fixture({ status: "in-progress", assignedTo, assignedToName: "Carer" }));
    const before = doc.toObject();
    t.mock.method(Report, "findById", async () => doc);
    assert.deepEqual(await reports.resolve(ids.report, ids.user), { kind: "not-assignee" });
    assert.deepEqual(doc.toObject(), before);
    assert.equal(doc.save.mock.callCount(), 0);
    assert.equal(doc.populate.mock.callCount(), 0);
  });
}

test("resolve authorizes raw ID despite missing populated user and permits repeated resolution even from new", async (t) => {
  const doc = stubReportDocument(t, fixture({ assignedTo: ids.user, assignedToName: "Snapshot" }), []);
  t.mock.method(Report, "findById", async () => doc);
  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await reports.resolve(ids.report, ids.user);
    assert.equal(outcome.kind, "resolved");
    assert.equal(outcome.report.status, "resolved");
    assert.equal(outcome.report.assignedTo, null);
    assert.equal(outcome.report.assignedToName, "Snapshot");
  }
  assert.equal(doc.save.mock.callCount(), 2);
});

test("statistics retain exact sequential filters and numeric values", async (t) => {
  const filters = [];
  t.mock.method(Report, "countDocuments", async (filter) => {
    filters.push(filter);
    return filter?.status === "resolved" ? 0 : filter?.status === "in-progress" ? 2 : filter?.status === "new" ? 3 : 5;
  });
  assert.deepEqual(await reports.getGlobalStats(), { total: 5, resolved: 0, inProgress: 2, new: 3 });
  assert.deepEqual(await reports.getAssignedStats(ids.user), { total: 5, resolved: 0, inProgress: 2 });
  assert.deepEqual(filters, [undefined, { status: "resolved" }, { status: "in-progress" }, { status: "new" },
    { assignedTo: ids.user }, { assignedTo: ids.user, status: "resolved" }, { assignedTo: ids.user, status: "in-progress" }]);
});

test("missing records differ from database failures across all operations", async (t) => {
  const lookup = t.mock.method(Report, "findById", async () => null);
  assert.deepEqual(await reports.claim(ids.report, { publicId: ids.user, name: null }), { kind: "not-found" });
  assert.deepEqual(await reports.resolve(ids.report, ids.user), { kind: "not-found" });
  const failure = new Error("synthetic database failure");
  const reject = async () => { throw failure; };
  lookup.mock.mockImplementation(reject);
  t.mock.method(Report, "create", reject);
  t.mock.method(Report, "find", () => ({ sort: () => ({ populate: () => ({ lean: reject }) }) }));
  t.mock.method(Report, "countDocuments", reject);
  for (const operation of [
    () => reports.create({ ...input, createdBy: null, createdByName: "Guest" }),
    () => reports.listAll(), () => reports.listAssignedTo(ids.user),
    () => reports.claim("malformed", { publicId: ids.user, name: null }),
    () => reports.resolve("malformed", ids.user), () => reports.getGlobalStats(), () => reports.getAssignedStats(ids.user),
  ]) await assert.rejects(operation, (error) => error === failure);
});
