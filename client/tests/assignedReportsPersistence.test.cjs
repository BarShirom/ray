const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8")
      .replaceAll("import.meta.env.VITE_API_URL", JSON.stringify("http://fixture.invalid"))
      .replaceAll("import.meta.env.MODE", JSON.stringify("postgres"));
    module._compile(ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText, filename);
  };
}
require.extensions[".css"] = () => {};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { Provider } = require("react-redux");
const { MemoryRouter, Routes, Route } = require("react-router-dom");

test("hard-refresh credentials restore through the production persisted store before assigned reports load", async (t) => {
  t.mock.method(global, "fetch", () => assert.fail("this synthetic adapter test must not make network requests"));
  const user = {
    id: "synthetic-restored-user", firstName: "Synthetic", lastName: "Carer",
    email: "restore@ray.example.invalid", token: "synthetic-restored-token",
  };
  // Actual redux-persist storage format. A previously interrupted login may
  // have persisted loading=true, but no report collection belongs in storage.
  const saved = new Map([["persist:root", JSON.stringify({
    auth: JSON.stringify({ user, loading: true, error: null }),
    _persist: JSON.stringify({ version: -1, rehydrated: true }),
  })]]);
  global.self = { localStorage: {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  } };

  // Import the real store only after installing synthetic browser storage.
  // Node runs this file in its own test process, with a fresh module cache.
  const { store, persistor } = require("../src/app/store.ts");
  t.after(() => persistor.pause());
  assert.equal(persistor.getState().bootstrapped, false);
  assert.equal(store.getState()._persist.rehydrated, false);
  assert.equal(store.getState().auth.user, null, "protected identity is initially unresolved");

  await new Promise((resolve) => {
    const unsubscribe = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
    });
  });
  const { t: translate } = require("../src/i18n/index.ts");
  const { finishAuthRestoration } = require("../src/features/auth/authSlice.ts");
  const { selectUserId, selectToken, selectAuthLoading } = require("../src/features/auth/authSelectors.ts");
  const { selectAllReports, selectAssignedReports, selectAssignedReportsState } = require("../src/features/reports/reportsSelectors.ts");
  const UsersRoutes = require("../src/routes/UsersRoutes.tsx").default;
  const MyReports = require("../src/pages/myReports/MyReports.tsx").default;
  const route = (element) => renderToStaticMarkup(
    React.createElement(Provider, { store },
      React.createElement(MemoryRouter, { initialEntries: ["/my-reports"] },
        React.createElement(Routes, null,
          React.createElement(Route, { element: React.createElement(UsersRoutes) },
            React.createElement(Route, { path: "/my-reports", element }))))),
  );

  assert.deepEqual(store.getState().auth.user, user);
  assert.equal(selectAuthLoading(store.getState()), true);
  const restoring = route(React.createElement("p", null, "SYNTHETIC PROTECTED CONTENT"));
  assert.match(restoring, /role="status"/);
  assert.ok(restoring.includes(translate("auth.checking")));
  assert.doesNotMatch(restoring, /SYNTHETIC PROTECTED CONTENT/);

  // This is the same production action invoked by PersistGate.onBeforeLift.
  // It clears only a stale transient busy flag; /me still validates credentials.
  store.dispatch(finishAuthRestoration());
  assert.equal(selectAuthLoading(store.getState()), false);
  assert.equal(selectUserId(store.getState()), user.id);
  assert.equal(selectToken(store.getState()), user.token);
  assert.ok(route(React.createElement("p", null, "SYNTHETIC PROTECTED CONTENT")).includes("SYNTHETIC PROTECTED CONTENT"));
  assert.deepEqual(selectAllReports(store.getState()), []);
  assert.deepEqual(selectAssignedReports(store.getState()), []);

  const { http } = require("../src/api/http.ts");
  const { fetchMyReports } = require("../src/features/reports/reportsThunks.ts");
  const report = {
    _id: "synthetic-restored-report", description: "SYNTHETIC restored assigned report",
    status: "in-progress", type: "general", location: { lat: 32, lng: 34 },
    assignedTo: { _id: user.id, name: "Synthetic Carer" },
    createdAt: "2026-10-20T09:00:00Z", updatedAt: "2026-10-21T10:00:00Z",
    distanceKm: null, media: [],
  };
  const previousAdapter = http.defaults.adapter;
  t.after(() => { http.defaults.adapter = previousAdapter; });
  let requests = 0;
  let respond;
  http.defaults.adapter = (config) => {
    requests++;
    assert.equal(config.url, "/api/reports/me", "assigned loading does not visit or fetch the map");
    assert.equal(config.method, "get");
    assert.equal(config.headers.get("Authorization"), `Bearer ${user.token}`);
    return new Promise((resolve) => {
      respond = () => resolve({ config, data: [report], status: 200, statusText: "Fixture", headers: {} });
    });
  };

  const pending = store.dispatch(fetchMyReports());
  assert.equal(selectAssignedReportsState(store.getState()).status, "loading");
  assert.deepEqual(selectAssignedReports(store.getState()), []);
  assert.equal(requests, 1);
  respond();
  await pending.unwrap();
  assert.equal(selectAssignedReportsState(store.getState()).status, "succeeded");
  assert.deepEqual(selectAssignedReports(store.getState()), [report]);
  assert.deepEqual(selectAllReports(store.getState()), [], "the assigned endpoint does not populate the public map collection");
  assert.ok(route(React.createElement(MyReports)).includes(report.description));
  assert.equal(requests, 1, "SSR is presentation evidence, not a claim that server rendering ran useEffect");

  await persistor.flush();
  const encoded = saved.get("persist:root");
  const persisted = JSON.parse(encoded);
  assert.deepEqual(Object.keys(persisted).sort(), ["_persist", "auth"]);
  assert.deepEqual(JSON.parse(persisted.auth).user, user);
  assert.equal(JSON.parse(persisted.auth).loading, false);
  assert.equal(encoded.includes(report.description), false, "report data is never persisted to browser storage");
});
