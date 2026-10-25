const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");
const compile = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8")
    .replaceAll("import.meta.env.VITE_API_URL", JSON.stringify("http://fixture.invalid"))
    .replaceAll("import.meta.env.MODE", JSON.stringify("postgres"));
  module._compile(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
require.extensions[".ts"] = compile;
require.extensions[".tsx"] = compile;
require.extensions[".css"] = () => {};

const React = require("react");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
const { Provider } = require("react-redux");
const { MemoryRouter } = require("react-router-dom");
const { configureStore } = require("@reduxjs/toolkit");
const { AxiosError } = require("axios");
const { http } = require("../src/api/http.ts");
const authReducer = require("../src/features/auth/authSlice.ts").default;
const { setAuth, logout } = require("../src/features/auth/authSlice.ts");
const reportsReducer = require("../src/features/reports/reportsSlice.ts").default;
const { fetchMyReports, fetchReports, claimReport, resolveReport } = require("../src/features/reports/reportsThunks.ts");
const { selectAllReports, selectAssignedReports, selectAssignedReportsState } = require("../src/features/reports/reportsSelectors.ts");
const MyReports = require("../src/pages/myReports/MyReports.tsx").default;
const { t } = require("../src/i18n/index.ts");

const userA = { id: "actor-a", token: "synthetic-token-a", firstName: "Synthetic", lastName: "A", email: "a@fixture.invalid" };
const userB = { ...userA, id: "actor-b", token: "synthetic-token-b", lastName: "B", email: "b@fixture.invalid" };
const makeStore = (user = userA) => {
  const store = configureStore({ reducer: { auth: authReducer, reports: reportsReducer } });
  if (user) store.dispatch(setAuth(user));
  return store;
};
const report = (id, assignedTo = { _id: userA.id }, extra = {}) => ({
  _id: id, description: `SYNTHETIC ${id}`, type: "general", status: "in-progress",
  createdAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-02T10:00:00Z",
  location: { lat: 32.0853, lng: 34.7818 }, media: [], distanceKm: null,
  createdBy: { _id: userB.id }, createdByName: "Synthetic reporter B", assignedTo, ...extra,
});
const response = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
const fail = (config, status, data = {}) => new AxiosError("Synthetic request failure", "ERR_BAD_RESPONSE", config, null, { ...response(config, data), status });
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function waitFor(store, status) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (selectAssignedReportsState(store.getState()).status === status) return;
    await settle();
  }
  assert.fail(`Assigned request did not reach ${status}`);
}
function render(store) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ["/my-reports"] },
    React.createElement(Provider, { store }, React.createElement(MyReports))));
}

test("direct assigned request loads independently, excludes other actors and preserves the public collection", async () => {
  const store = makeStore();
  const publicOnly = report("public-other", { _id: userB.id });
  http.defaults.adapter = async (config) => response(config, [publicOnly]);
  await store.dispatch(fetchReports());
  let request;
  http.defaults.adapter = async (config) => { request = config; return response(config, [report("mine"), publicOnly]); };
  await store.dispatch(fetchMyReports()).unwrap();
  assert.equal(request.url, "/api/reports/me");
  assert.equal(request.headers.get("Authorization"), `Bearer ${userA.token}`);
  assert.deepEqual(selectAssignedReports(store.getState()).map((item) => item._id), ["mine"]);
  assert.equal(selectAssignedReports(store.getState())[0].createdBy._id, userB.id, "assignment, not reporter identity, controls membership");
  assert.deepEqual(selectAllReports(store.getState()).map((item) => item._id), ["public-other"]);
  assert.equal(selectAssignedReportsState(store.getState()).status, "succeeded");
});

test("initial and delayed requests show loading; successful zero alone shows empty and duplicate pending fetch is suppressed", async () => {
  const store = makeStore();
  assert.equal(selectAssignedReportsState(store.getState()).status, "idle");
  assert.ok(render(store).includes(t("reports.loadingAssigned")));
  assert.ok(!render(store).includes(t("reports.assignedEmpty")));
  let release, requests = 0;
  http.defaults.adapter = (config) => { requests++; return new Promise((resolve) => { release = () => resolve(response(config, [])); }); };
  const pending = store.dispatch(fetchMyReports());
  const duplicate = await store.dispatch(fetchMyReports());
  await settle();
  assert.equal(duplicate.meta.condition, true);
  assert.equal(requests, 1);
  assert.equal(selectAssignedReportsState(store.getState()).status, "loading");
  assert.ok(render(store).includes(t("reports.loadingAssigned")));
  assert.ok(!render(store).includes(t("reports.assignedEmpty")));
  release();
  await pending;
  assert.ok(render(store).includes(t("reports.assignedEmpty")));
});

test("normalization supports assignedTo string, _id/id objects and nullish _id fallback with safe timestamp sorting", async () => {
  const store = makeStore();
  const rows = [
    report("old", userA.id, { updatedAt: "2026-01-01T00:00:00Z" }),
    report("new", { id: userA.id }, { updatedAt: "2026-04-01T00:00:00Z" }),
    report("fallback", { _id: undefined, id: userA.id }, { updatedAt: "invalid", createdAt: "2026-03-01T00:00:00Z" }),
    report("unassigned", null), report("other", userB.id),
  ];
  http.defaults.adapter = async (config) => response(config, rows);
  await store.dispatch(fetchMyReports());
  assert.deepEqual(selectAssignedReports(store.getState()).map((item) => item._id), ["new", "fallback", "old"]);
});

test("failed request keeps a distinct safe error and can retry to success", async () => {
  const store = makeStore();
  http.defaults.adapter = async (config) => { throw fail(config, 500, { message: "SQL synthetic-private-detail" }); };
  await store.dispatch(fetchMyReports());
  assert.equal(selectAssignedReportsState(store.getState()).status, "failed");
  assert.equal(selectAssignedReportsState(store.getState()).error, t("errors.server"));
  assert.ok(!render(store).includes(t("reports.assignedEmpty")));
  http.defaults.adapter = async (config) => response(config, [report("retried")]);
  await store.dispatch(fetchMyReports());
  assert.equal(selectAssignedReportsState(store.getState()).status, "succeeded");
  assert.deepEqual(selectAssignedReports(store.getState()).map((item) => item._id), ["retried"]);
});

test("logout and account/token switches hide data immediately and fence late assigned responses", async () => {
  const store = makeStore();
  http.defaults.adapter = async (config) => response(config, [report("actor-a-data")]);
  await store.dispatch(fetchMyReports());
  let release;
  http.defaults.adapter = (config) => new Promise((resolve) => { release = () => resolve(response(config, [report("late-a-data")])); });
  const old = store.dispatch(fetchMyReports());
  await settle();
  store.dispatch(logout());
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  store.dispatch(setAuth(userB));
  release();
  await old;
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  assert.equal(selectAssignedReportsState(store.getState()).status, "idle");
  http.defaults.adapter = async (config) => response(config, [report("actor-b-data", userB.id)]);
  await store.dispatch(fetchMyReports());
  assert.deepEqual(selectAssignedReports(store.getState()).map((item) => item._id), ["actor-b-data"]);
  store.dispatch(setAuth({ ...userB, token: "synthetic-refreshed-token" }));
  assert.deepEqual(selectAssignedReports(store.getState()), []);
});

test("fresh login hides assigned data during authentication and prevents report requests until resolved", async () => {
  const store = makeStore();
  http.defaults.adapter = async (config) => response(config, [report("private")]);
  await store.dispatch(fetchMyReports());
  store.dispatch({ type: "auth/loginUser/pending" });
  let requests = 0;
  http.defaults.adapter = async (config) => { requests++; return response(config, []); };
  const blocked = await store.dispatch(fetchMyReports());
  assert.equal(blocked.meta.condition, true);
  assert.equal(requests, 0);
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  assert.ok(render(store).includes(t("reports.authRestoring")));
  assert.ok(!render(store).includes("SYNTHETIC private"));
  store.dispatch(setAuth(userB));
  store.dispatch({ type: "auth/loginUser/fulfilled", payload: { user: userB } });
  await store.dispatch(fetchMyReports());
  assert.equal(requests, 1);
  assert.equal(selectAssignedReportsState(store.getState()).status, "succeeded");
});

test("expired authentication has a separate state, clears protected data and stale 401 cannot expire a new actor", async () => {
  const store = makeStore();
  http.defaults.adapter = async (config) => response(config, [report("private")]);
  await store.dispatch(fetchMyReports());
  http.defaults.adapter = async (config) => { throw fail(config, 401, { error: "Invalid or expired token" }); };
  const expired = await store.dispatch(fetchMyReports());
  assert.equal(expired.payload.status, 401);
  assert.equal(selectAssignedReportsState(store.getState()).status, "unauthorized");
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  assert.ok(render(store).includes(t("reports.assignedExpired")));
  assert.ok(!render(store).includes("SYNTHETIC private"));
  let reject;
  http.defaults.adapter = (config) => new Promise((_resolve, rejectPromise) => { reject = () => rejectPromise(fail(config, 401)); });
  const stale = store.dispatch(fetchMyReports());
  await settle();
  store.dispatch(setAuth(userB));
  reject();
  await stale;
  assert.equal(selectAssignedReportsState(store.getState()).status, "idle");
  assert.equal(store.getState().auth.user.id, userB.id);
});

test("claim/resolve update assigned cards independently and late snapshots preserve newer mutations in both lists", async () => {
  const store = makeStore();
  const fresh = report("claim-me", null, { status: "new", createdByName: "Synthetic preserved name" });
  http.defaults.adapter = async (config) => response(config, config.url === "/api/reports" ? [fresh] : []);
  await store.dispatch(fetchReports());
  await store.dispatch(fetchMyReports());
  let releaseAssigned, releasePublic;
  http.defaults.adapter = (config) => new Promise((resolve) => {
    const release = () => resolve(response(config, config.url === "/api/reports" ? [fresh] : []));
    if (config.url === "/api/reports") releasePublic = release;
    else releaseAssigned = release;
  });
  const assignedSnapshot = store.dispatch(fetchMyReports());
  const publicSnapshot = store.dispatch(fetchReports());
  await settle();
  http.defaults.adapter = async (config) => response(config, { ...fresh, status: "in-progress", assignedTo: userA.id, createdByName: undefined });
  await store.dispatch(claimReport({ reportId: fresh._id }));
  assert.equal(selectAssignedReports(store.getState())[0].status, "in-progress");
  assert.equal(selectAssignedReports(store.getState())[0].createdByName, "Synthetic preserved name");
  releaseAssigned(); releasePublic();
  await Promise.all([assignedSnapshot, publicSnapshot]);
  assert.equal(selectAssignedReports(store.getState())[0].status, "in-progress");
  assert.equal(selectAllReports(store.getState())[0].status, "in-progress");
  assert.equal(selectAllReports(store.getState())[0].createdByName, "Synthetic preserved name");

  let releaseResolveSnapshot;
  const claimed = selectAssignedReports(store.getState())[0];
  http.defaults.adapter = (config) => new Promise((resolve) => { releaseResolveSnapshot = () => resolve(response(config, [claimed])); });
  const beforeResolve = store.dispatch(fetchMyReports());
  await settle();
  http.defaults.adapter = async (config) => response(config, { ...claimed, status: "resolved", updatedAt: "2026-06-01T00:00:00Z" });
  await store.dispatch(resolveReport({ reportId: fresh._id }));
  releaseResolveSnapshot();
  await beforeResolve;
  assert.equal(selectAssignedReports(store.getState())[0].status, "resolved");
});

test("late actor-A mutation cannot repopulate actor-B assigned collection", async () => {
  const store = makeStore();
  let release;
  http.defaults.adapter = (config) => new Promise((resolve) => { release = () => resolve(response(config, report("late-claim", userA.id))); });
  const claim = store.dispatch(claimReport({ reportId: "late-claim" }));
  await settle();
  store.dispatch(setAuth(userB));
  release();
  await claim;
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  assert.deepEqual(store.getState().reports.assigned.items, []);
});

test("401 while resolving clears assigned cards without changing the authenticated account", async () => {
  const store = makeStore();
  http.defaults.adapter = async (config) => response(config, [report("private")]);
  await store.dispatch(fetchMyReports());
  http.defaults.adapter = async (config) => { throw fail(config, 401); };
  await store.dispatch(resolveReport({ reportId: "private" }));
  assert.equal(selectAssignedReportsState(store.getState()).status, "unauthorized");
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  assert.equal(store.getState().auth.user.id, userA.id);
});

test("a late successful assigned snapshot cannot clear a newer resolve authentication failure", async () => {
  const store = makeStore();
  http.defaults.adapter = async (config) => response(config, [report("private")]);
  await store.dispatch(fetchMyReports());
  let release;
  http.defaults.adapter = (config) => new Promise((resolve) => { release = () => resolve(response(config, [report("private")])); });
  const pending = store.dispatch(fetchMyReports());
  await settle();
  http.defaults.adapter = async (config) => { throw fail(config, 401); };
  await store.dispatch(resolveReport({ reportId: "private" }));
  assert.equal(selectAssignedReportsState(store.getState()).status, "unauthorized");
  release();
  await pending;
  assert.equal(selectAssignedReportsState(store.getState()).status, "unauthorized");
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  assert.ok(render(store).includes(t("reports.assignedExpired")));
});

test("a new token for the same actor fences a mutation started with the earlier credentials", async () => {
  const store = makeStore();
  let release;
  http.defaults.adapter = (config) => new Promise((resolve) => { release = () => resolve(response(config, report("old-token-claim", userA.id))); });
  const pending = store.dispatch(claimReport({ reportId: "old-token-claim" }));
  await settle();
  store.dispatch(setAuth({ ...userA, token: "synthetic-new-session-token" }));
  release();
  await pending;
  assert.equal(selectAssignedReportsState(store.getState()).status, "idle");
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  assert.deepEqual(store.getState().reports.assigned.items, []);
});

test("captured actual page effect loads once; actual retry fetches and relogin clears stale credentials", async (context) => {
  // SSR does not schedule effects. Capture and replay the real callback, not a fake page lifecycle.
  const store = makeStore();
  const effects = [], buttons = [], warnings = [];
  context.mock.method(console, "warn", (message) => { warnings.push(message); });
  context.mock.method(React, "useEffect", (effect, deps) => { if (deps?.[0] === store.dispatch) effects.push({ effect, deps }); });
  for (const method of ["jsx", "jsxs"]) {
    const original = jsx[method];
    context.mock.method(jsx, method, (type, props, ...rest) => {
      if (type === "button") buttons.push(props);
      return original(type, props, ...rest);
    });
  }
  let requests = 0;
  http.defaults.adapter = async (config) => { requests++; throw fail(config, 500); };
  render(store);
  assert.equal(effects.length, 1);
  const dependencies = effects[0].deps;
  effects[0].effect(); effects[0].effect();
  await waitFor(store, "failed");
  assert.equal(requests, 1, "Strict Mode callback replay does not duplicate a pending request");
  render(store);
  assert.deepEqual(effects.at(-1).deps, dependencies, "load status is excluded from effect dependencies");
  http.defaults.adapter = async (config) => { requests++; return response(config, [report("retried-page")]); };
  const retry = buttons.find((button) => button.children === t("reports.retryAssigned"));
  assert.ok(retry);
  retry.onClick();
  await waitFor(store, "succeeded");
  assert.ok(render(store).includes("SYNTHETIC retried-page"));
  assert.equal(requests, 2);
  assert.deepEqual(effects.at(-1).deps, dependencies);
  http.defaults.adapter = async (config) => { throw fail(config, 401); };
  await store.dispatch(fetchMyReports());
  render(store);
  const login = buttons.find((button) => button.children === t("reports.signInAgain"));
  assert.ok(login);
  login.onClick();
  await settle();
  assert.equal(store.getState().auth.user, null, "relogin clears stale token before navigating to public login route");
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  assert.ok(warnings.every((message) => /call navigate\(\) in a React\.useEffect/u.test(message)), "only the expected unmounted SSR navigation warning is allowed; actual browser navigation is checked separately");
});
