const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (module, file) => {
  const source = fs.readFileSync(file, "utf8").replaceAll("import.meta.env.VITE_API_URL", JSON.stringify("http://fixture.invalid"));
  module._compile(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText, file);
};
const { createRayStore } = require("../src/app/store.ts");
const { setAuth, logout } = require("../src/features/auth/authSlice.ts");
const thunks = require("../src/features/reports/reportsThunks.ts");
const { http } = require("../src/api/http.ts");
const { AxiosError } = require("axios");
const a = { id: "synthetic-a", firstName: "Synthetic", lastName: "A", email: "a@example.invalid", token: "synthetic-token-a" };
const b = { ...a, id: "synthetic-b", lastName: "B", email: "b@example.invalid", token: "synthetic-token-b" };
const row = { _id: "synthetic-report", description: "Synthetic public report", type: "general", status: "new",
  createdAt: "2026-01-01Z", updatedAt: "2026-01-01Z", location: { lat: 32, lng: 34 }, media: [], distanceKm: null };
const input = { description: row.description, type: row.type, location: row.location };
function setup(t, actor) {
  const saved = new Map();
  const app = createRayStore({ getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) });
  if (actor) app.store.dispatch(setAuth(actor));
  const adapter = http.defaults.adapter;
  t.after(() => { http.defaults.adapter = adapter; app.dispose(); });
  return app.store;
}
const response = (config, data) => ({ config, status: 200, statusText: "OK", headers: {}, data });

for (const [from, to] of [[a, b], [b, a], [a, a]]) {
  test(`production store fences every delayed report action ${from.id} -> ${to.id}, including same-token reauthentication`, async t => {
    const store = setup(t, from);
    for (const [make, data] of [
      [() => thunks.fetchReports(), [row]], [() => thunks.createReport(input), row],
      [() => thunks.claimReport({ reportId: row._id }), row], [() => thunks.resolveReport({ reportId: row._id }), row],
      [() => thunks.fetchMyReports(), [{ ...row, assignedTo: from.id }]],
      [() => thunks.fetchUserStats(), { total: 1, resolved: 0, inProgress: 1 }],
    ]) {
      store.dispatch(setAuth(from));
      let release;
      http.defaults.adapter = config => new Promise(resolve => { release = () => resolve(response(config, data)); });
      const request = store.dispatch(make());
      assert.equal(typeof release, "function");
      store.dispatch(setAuth(to));
      const sessionId = store.getState().auth.sessionId;
      release();
      const action = await request;
      assert.equal(action.meta.requestStatus, "rejected");
      assert.equal(action.payload.kind, "stale");
      assert.equal(store.getState().auth.sessionId, sessionId);
      assert.equal(store.getState().auth.user.id, to.id);
      assert.deepEqual(store.getState().reports.items, []);
      assert.deepEqual(store.getState().reports.assigned.items, []);
      assert.equal(store.getState().reports.publicRequestId, null);
    }
  });
}

test("stale report401 cannot expire B; a current report401 invalidates the production session", async t => {
  const store = setup(t, a);
  let reject;
  const failure = config => new AxiosError("Synthetic auth failure", "ERR_BAD_RESPONSE", config, null,
    { ...response(config, { message: "Invalid or expired token" }), status: 401 });
  http.defaults.adapter = config => new Promise((_, no) => { reject = () => no(failure(config)); });
  const pending = store.dispatch(thunks.fetchMyReports());
  store.dispatch(setAuth(b));
  reject();
  const stale = await pending;
  assert.equal(stale.payload.kind, "stale");
  assert.equal(store.getState().auth.user.id, b.id);
  http.defaults.adapter = async config => { throw failure(config); };
  const current = await store.dispatch(thunks.fetchMyReports());
  assert.equal(current.payload.status, 401);
  assert.equal(store.getState().auth.user, null);
  assert.deepEqual(store.getState().reports.assigned.items, []);
});

test("public report discovery/submission survives logout without Bearer, while protected actions do not send HTTP", async t => {
  const store = setup(t, a);
  store.dispatch(logout());
  let calls = 0;
  http.defaults.adapter = async config => {
    calls++;
    assert.equal(config.headers.get("Authorization"), undefined);
    return response(config, config.method === "get" ? [row] : row);
  };
  await store.dispatch(thunks.fetchReports()).unwrap();
  await store.dispatch(thunks.createReport(input)).unwrap();
  assert.equal(calls, 2);
  assert.equal(store.getState().reports.items[0]._id, row._id);
  const denied = await store.dispatch(thunks.claimReport({ reportId: row._id }));
  assert.equal(denied.payload.status, 401);
  assert.equal(calls, 2);
});

test("a local guest denial cannot expire an auth success sharing the current intent generation", async t => {
  const store = setup(t);
  const { loginUser } = require("../src/features/auth/authThunks.ts");
  const { fetchFeedingStations } = require("../src/features/feedingStations/feedingStationsThunks.ts");
  let release;
  http.defaults.adapter = config => new Promise(resolve => { release = () => resolve(response(config, { user: a, token: a.token })); });
  const login = store.dispatch(loginUser({ email: a.email, password: "synthetic-unused-password" }));
  const denied = store.dispatch(fetchFeedingStations());
  // Deliver the accepted auth reducer completion before the already queued local
  // station rejection. The authority generation deliberately stays unchanged.
  store.dispatch(loginUser.fulfilled({ user: a }, login.requestId, { email: a.email, password: "synthetic-unused-password" }));
  const result = await denied;
  assert.equal(result.payload.status, 401);
  assert.equal(result.payload.source, "client");
  assert.equal(store.getState().auth.user.id, a.id);
  release();
  await login;
  assert.equal(store.getState().auth.user.id, a.id);
});
