import assert from "node:assert/strict";
import test from "node:test";
import Report from "../dist/models/ReportModel.js";
import { startApp, document, stubReportDocument, stubList, ids, populatedUser as userFields, location, json, assertEntity, assertValidation } from "./helpers/contracts.mjs";

const input = { description: "  Cats need help  ", type: "general", location };
const fixture = (values = {}) => document(Report, { ...input, _id: ids.report, ...values });

for (const identity of ["guest", "authenticated", "invalid-token"]) {
  test(`report creation: ${identity}`, async (t) => {
    const { request, token, invalidToken } = await startApp(t);
    let created;
    t.mock.method(Report, "create", async (values) => {
      created = values;
      return stubReportDocument(t, fixture(values));
    });
    const response = await request("POST", "/api/reports", {
      ...input, createdBy: ids.other, assignedTo: ids.other, status: "resolved", createdByName: "Forged",
    }, identity === "authenticated" ? token : identity === "invalid-token" ? invalidToken : undefined);
    assert.equal(response.status, 201);
    assertEntity(response.body);
    assert.equal(response.body.description, input.description);
    assert.equal(response.body.type, "general");
    assert.equal(response.body.status, "new");
    assert.deepEqual(response.body.location, location);
    assert.deepEqual(response.body.media, []);
    assert.equal(response.body.assignedTo, null);
    assert.equal(response.body.assignedToName, null);
    assert.equal(created.createdBy, identity === "authenticated" ? ids.user : null);
    assert.equal(response.body.createdByName, identity === "authenticated" ? "Test Carer" : "Guest");
    assert.deepEqual(response.body.createdBy, identity === "authenticated" ? userFields : null);
  });
}
test("report creation preserves media array and emergency type", async (t) => {
  const { request } = await startApp(t);
  t.mock.method(Report, "create", async (values) => stubReportDocument(t, fixture(values)));
  const media = ["https://media.example.invalid/cat.jpg", "https://media.example.invalid/cat.mp4"];
  const response = await request("POST", "/api/reports", { ...input, type: "emergency", media });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.media, media);
  assert.equal(response.body.type, "emergency");
});
for (const [changes, field] of [[{ description: " " }, "description"], [{ type: "rescue" }, "type"], [{ location: { lat: "32", lng: 34 } }, "location.lat"], [{ media: null }, "media"]]) {
  test(`report validation: ${field}`, async (t) => {
    const { request } = await startApp(t);
    assertValidation(await request("POST", "/api/reports", { ...input, ...changes }), field);
  });
}
test("report list preserves populated objects, stored names, fallback names and nulls", async (t) => {
  const { request } = await startApp(t);
  const base = fixture().toObject();
  const rows = [
    { ...base, createdBy: userFields, assignedTo: userFields, createdByName: "Stored creator", assignedToName: "Stored assignee" },
    { ...base, createdBy: userFields, assignedTo: { _id: ids.other, name: "Legacy name" } },
    { ...base, createdBy: null, assignedTo: null },
    { ...base, createdBy: userFields, createdByName: "" },
  ];
  stubList(t, Report, undefined, { createdAt: -1 }, rows, true);
  const response = await request("GET", "/api/reports");
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body));
  assert.deepEqual(response.body, json(rows.map((row, index) => ({ ...row,
    createdByName: ["Stored creator", "Test Carer", null, ""][index],
    assignedToName: ["Stored assignee", "Legacy name", null, null][index],
  }))));
  response.body.forEach(assertEntity);
});
test("/me queries assigned-to-me and returns an array", async (t) => {
  const { request, token } = await startApp(t);
  // Middleware supplies a public-ID string; compare the same identity as before.
  t.mock.method(Report, "find", (filter) => {
    assert.deepEqual(Object.keys(filter), ["assignedTo"]);
    assert.equal(String(filter.assignedTo), ids.user);
    return { sort(order) {
      assert.deepEqual(order, { createdAt: -1 });
      return { populate: () => ({ lean: async () => [] }) };
    } };
  });
  assert.deepEqual(await request("GET", "/api/reports/me", undefined, token), { status: 200, body: [] });
});
for (const action of ["claim", "resolve"]) {
  for (const auth of ["missing", "invalid", "valid-missing-user"]) {
    test(`${action} requires valid authentication: ${auth}`, async (t) => {
      const { request, token, invalidToken } = await startApp(t, auth === "valid-missing-user" ? { user: null } : {});
      const result = await request("PATCH", `/api/reports/${ids.report}/${action}`, {}, auth === "invalid" ? invalidToken : auth === "valid-missing-user" ? token : undefined);
      assert.deepEqual(result, { status: 401, body: { error: auth === "missing" ? "Authorization token required" : auth === "invalid" ? "Invalid or expired token" : "User not found" } });
    });
  }
  test(`${action}: missing report`, async (t) => {
    const { request, token } = await startApp(t);
    t.mock.method(Report, "findById", async (id) => { assert.equal(id, ids.report); return null; });
    assert.deepEqual(await request("PATCH", `/api/reports/${ids.report}/${action}`, {}, token), { status: 404, body: { error: "Report not found" } });
  });
  test(`${action}: malformed ID currently becomes 500`, async (t) => {
    const { request, token } = await startApp(t);
    t.mock.method(Report, "findById", async () => { throw new Error("synthetic cast failure"); });
    assert.deepEqual(await request("PATCH", `/api/reports/malformed/${action}`, {}, token), { status: 500, body: { error: `Failed to ${action} report` } });
  });
}
for (const status of ["in-progress", "resolved"]) {
  test(`claim rejects ${status}`, async (t) => {
    const { request, token } = await startApp(t);
    t.mock.method(Report, "findById", async () => fixture({ status }));
    assert.deepEqual(await request("PATCH", `/api/reports/${ids.report}/claim`, {}, token), { status: 400, body: { error: "Report is already claimed or resolved" } });
  });
}
test("claim returns populated authenticated assignee", async (t) => {
  const { request, token } = await startApp(t);
  const doc = stubReportDocument(t, fixture());
  t.mock.method(Report, "findById", async (id) => { assert.equal(id, ids.report); return doc; });
  const response = await request("PATCH", `/api/reports/${ids.report}/claim`, { assignedTo: ids.other }, token);
  assert.equal(response.status, 200);
  assertEntity(response.body);
  assert.equal(response.body.status, "in-progress");
  assert.deepEqual(response.body.assignedTo, userFields);
  assert.equal(response.body.assignedToName, "Test Carer");
  assert.equal(doc.save.mock.callCount(), 1);
});
for (const assignedTo of [null, ids.other, ids.user]) {
  test(`resolve authorization: ${assignedTo}`, async (t) => {
    const { request, token } = await startApp(t);
    const doc = stubReportDocument(t, fixture({ assignedTo, status: "in-progress" }));
    t.mock.method(Report, "findById", async () => doc);
    const response = await request("PATCH", `/api/reports/${ids.report}/resolve`, {}, token);
    if (assignedTo !== ids.user) {
      assert.deepEqual(response, { status: 403, body: { error: "Only assigned user can resolve the report" } });
      assert.equal(doc.save.mock.callCount(), 0);
    } else {
      assert.equal(response.status, 200);
      assertEntity(response.body);
      assert.equal(response.body.status, "resolved");
      assert.deepEqual(response.body.assignedTo, userFields);
      assert.equal(response.body.assignedToName, "Test Carer");
      assert.equal((await request("PATCH", `/api/reports/${ids.report}/resolve`, {}, token)).status, 200);
    }
  });
}
for (const personal of [false, true]) {
  test(`report statistics: ${personal ? "mine" : "global"}`, async (t) => {
    const { request, token } = await startApp(t);
    const filters = [];
    t.mock.method(Report, "countDocuments", async (filter) => {
      filters.push(json(filter ?? {}));
      return filter?.status === "resolved" ? 2 : filter?.status === "in-progress" ? 3 : filter?.status === "new" ? 4 : 9;
    });
    const path = `/api/reports/stats${personal ? "/me" : ""}`;
    assert.equal((await request("GET", path)).status, 401);
    assert.deepEqual(await request("GET", path, undefined, token), { status: 200, body: personal ? { total: 9, resolved: 2, inProgress: 3 } : { total: 9, resolved: 2, inProgress: 3, new: 4 } });
    const scope = personal ? { assignedTo: ids.user } : {};
    assert.deepEqual(filters, [scope, { ...scope, status: "resolved" }, { ...scope, status: "in-progress" }, ...(personal ? [] : [{ status: "new" }])]);
  });
}
