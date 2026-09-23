import assert from "node:assert/strict";
import test from "node:test";
import Report from "../dist/models/ReportModel.js";
import { startApp, document, stubReportDocument, stubList, ids, location, populatedUser } from "./helpers/contracts.mjs";

const input = { description: "  Keep report whitespace  ", type: "food", location, media: ["second.jpg", "first.mp4"] };
const fixture = (fields = {}) => document(Report, { ...input, _id: ids.report, ...fields });
const privateFields = { email: "private@example.invalid", company: "private", password: "private", passwordHash: "private", token: "private", internalId: "private-uuid" };

for (const action of ["create", "claim", "resolve"]) {
  test(`HTTP ${action} uses the real adapter and whitelists populated summaries`, async (t) => {
    const { request, token } = await startApp(t);
    const users = [{ ...populatedUser, name: "Legacy", ...privateFields }];
    let doc;
    if (action === "create") {
      t.mock.method(Report, "create", async (values) => {
        assert.equal(values.createdBy, ids.user);
        assert.equal(values.createdByName, "Test Carer");
        assert.equal(values.status, "new");
        assert.equal(Object.hasOwn(values, "assignedTo"), false);
        assert.equal(Object.hasOwn(values, "assignedToName"), false);
        doc = stubReportDocument(t, fixture(values), users);
        return doc;
      });
    } else {
      doc = stubReportDocument(t, fixture({ assignedTo: action === "resolve" ? ids.user : null }), users);
      t.mock.method(Report, "findById", async () => doc);
    }
    const response = await request(action === "create" ? "POST" : "PATCH",
      action === "create" ? "/api/reports" : `/api/reports/${ids.report}/${action}`,
      { ...input, createdBy: ids.other, assignedTo: ids.other, status: "resolved", createdByName: "Forged", assignedToName: "Forged" }, token);
    assert.equal(response.status, action === "create" ? 201 : 200);
    assert.equal(response.body.description, input.description);
    assert.deepEqual(response.body.media, input.media);
    assert.equal(response.body.__v, 0);
    assert.deepEqual(response.body[action === "create" ? "createdBy" : "assignedTo"], { ...populatedUser, name: "Legacy" });
    assert.equal(response.body[action === "create" ? "createdByName" : "assignedToName"], action === "resolve" ? "Legacy" : "Test Carer");
    for (const key of Object.keys(privateFields)) assert.equal(Object.hasOwn(response.body, key), false);
  });
}

test("HTTP list and assigned-to-me share historical name, omission and version behavior", async (t) => {
  const { request, token } = await startApp(t);
  const rows = [
    { _id: ids.report, createdBy: { _id: ids.user, name: "", firstName: " First ", lastName: "Last", ...privateFields },
      assignedTo: null, createdByName: null, assignedToName: "", __v: 7 },
    { _id: ids.other, location: null, media: null, createdBy: null, createdByName: "Snapshot", updatedAt: null },
  ];
  const expected = [
    { _id: ids.report, createdBy: { _id: ids.user, name: "", firstName: " First ", lastName: "Last" },
      assignedTo: null, createdByName: " First  Last", assignedToName: "", __v: 7 },
    { ...rows[1], assignedToName: null },
  ];
  stubList(t, Report, undefined, { createdAt: -1 }, rows, true);
  assert.deepEqual(await request("GET", "/api/reports"), { status: 200, body: expected });
  stubList(t, Report, { assignedTo: ids.user }, { createdAt: -1 }, rows, true);
  assert.deepEqual(await request("GET", "/api/reports/me", undefined, token), { status: 200, body: expected });
});

test("claim keeps an empty stored snapshot when the authenticated user has no name", async (t) => {
  const { request, token } = await startApp(t, { user: { _id: ids.user, firstName: "", lastName: null, name: "Ignored by required auth" } });
  const doc = stubReportDocument(t, fixture({ assignedToName: "" }), []);
  t.mock.method(Report, "findById", async () => doc);
  const response = await request("PATCH", `/api/reports/${ids.report}/claim`, { assignedToName: "Forged" }, token);
  assert.equal(response.status, 200);
  assert.equal(response.body.assignedToName, "");
  assert.equal(response.body.assignedTo, null);
  assert.equal(String(doc.assignedTo), ids.user);
});

test("HTTP resolution uses the raw assignee even when population cannot find the user", async (t) => {
  const { request, token } = await startApp(t);
  const doc = stubReportDocument(t, fixture({ assignedTo: ids.user, assignedToName: "Retained assignee" }), []);
  t.mock.method(Report, "findById", async () => doc);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request("PATCH", `/api/reports/${ids.report}/resolve`, {}, token);
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "resolved");
    assert.equal(response.body.assignedTo, null);
    assert.equal(response.body.assignedToName, "Retained assignee");
  }
  assert.equal(doc.save.mock.callCount(), 2);
});

for (const [method, path, error] of [
  ["GET", "/api/reports", "Failed to fetch reports"],
  ["GET", "/api/reports/me", "Failed to fetch your reports"],
  ["PATCH", "/api/reports/malformed/claim", "Failed to claim report"],
  ["PATCH", "/api/reports/malformed/resolve", "Failed to resolve report"],
  ["GET", "/api/reports/stats", "Failed to fetch global stats"],
  ["GET", "/api/reports/stats/me", "Failed to fetch your stats"],
]) {
  test(`${path} preserves its operation-specific database error`, async (t) => {
    const { request, token } = await startApp(t);
    const reject = async () => { throw new Error("synthetic database failure"); };
    t.mock.method(Report, "find", () => ({ sort: () => ({ populate: () => ({ lean: reject }) }) }));
    const lookup = t.mock.method(Report, "findById", reject);
    t.mock.method(Report, "countDocuments", reject);
    assert.deepEqual(await request(method, path, method === "PATCH" ? {} : undefined, token), { status: 500, body: { error } });
    if (method === "PATCH") assert.equal(lookup.mock.calls[0].arguments[0], "malformed");
  });
}

for (const phase of ["create", "populate"]) {
  test(`creation forwards ${phase} failure to next(err)`, async (t) => {
    const { request } = await startApp(t);
    const failure = new Error("synthetic report failure");
    failure.name = "SyntheticReportError";
    t.mock.method(Report, "create", async () => {
      if (phase === "create") throw failure;
      const doc = fixture();
      t.mock.method(doc, "populate", async () => { throw failure; });
      return doc;
    });
    assert.deepEqual(await request("POST", "/api/reports", input), {
      status: 500, body: { error: failure.name, message: failure.message },
    });
  });
}

for (const action of ["claim", "resolve"]) {
  for (const phase of ["save", "populate"]) {
    test(`${action} retains its 500 on ${phase} failure`, async (t) => {
      const { request, token } = await startApp(t);
      const doc = stubReportDocument(t, fixture({ assignedTo: action === "resolve" ? ids.user : null }));
      const reject = async () => { throw new Error("synthetic write failure"); };
      doc[phase].mock.mockImplementation(reject);
      t.mock.method(Report, "findById", async () => doc);
      assert.deepEqual(await request("PATCH", `/api/reports/${ids.report}/${action}`, {}, token), {
        status: 500, body: { error: `Failed to ${action} report` },
      });
      if (phase === "save") assert.equal(doc.populate.mock.callCount(), 0);
    });
  }
}
