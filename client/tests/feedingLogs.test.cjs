// Run with: node --test tests/feedingLogs.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

// Load the actual TypeScript store in Node without adding a test dependency.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8").replace(
    "import.meta.env.VITE_API_URL", JSON.stringify("http://fixture.invalid")
  );
  module._compile(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
};
const storage = new Map();
global.self = { localStorage: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} };
const { store, persistor } = require("../src/app/store.ts");
const { http } = require("../src/api/http.ts");
const { setAuth, logout } = require("../src/features/auth/authSlice.ts");
const { fetchFeedingLogsForStation, createFeedingLog } = require("../src/features/feedingLogs/feedingLogsThunks.ts");
const { selectFeedingLogsForStation } = require("../src/features/feedingLogs/feedingLogsSelectors.ts");
const { AxiosError } = require("axios");
const select = (id = "station-a") => selectFeedingLogsForStation(store.getState(), id);
const user = { id: "user-a", firstName: "Test", lastName: "User", email: "test@example.com", token: "test-token" };
const oldLog = { _id: "old", stationId: "station-a", userId: "user-b", fedAt: "2026-09-20T06:00:00Z", food: true, water: false, createdAt: "2026-09-20T06:00:00Z", updatedAt: "2026-09-20T06:00:00Z" };
const newLog = { ...oldLog, _id: "new", userId: "user-a", fedAt: "2026-09-20T09:00:00Z", note: "Fresh food" };
const response = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });

test("feeding log Redux flow", async (t) => {
  t.after(() => persistor.pause());
  if (!persistor.getState().bootstrapped) await new Promise((resolve) => {
    const unsubscribe = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
    });
  });

  await t.test("guest creation is rejected without an HTTP request", async () => {
    store.dispatch(logout());
    let requests = 0;
    http.defaults.adapter = async (config) => { requests++; return response(config, newLog); };
    const result = await store.dispatch(createFeedingLog({ stationId: "station-a", data: {} }));
    assert.equal(result.type, createFeedingLog.rejected.type);
    assert.match(result.payload, /log in/);
    assert.equal(requests, 0);
    assert.equal(select().submitting, false);
  });

  store.dispatch(setAuth(user));
  let releaseHistory, releaseCreate, historyRequest, createRequest;
  http.defaults.adapter = (config) => {
    assert.equal(config.url, "/api/feeding-stations/station-a/feedings");
    if (config.method === "get") return new Promise((resolve) => {
      historyRequest = config;
      releaseHistory = () => resolve(response(config, [oldLog]));
    });
    return new Promise((resolve) => {
      createRequest = config;
      releaseCreate = () => resolve(response(config, newLog));
    });
  };
  let historyTask, createTask;
  await t.test("history fetch uses the station URL and tracks loading", () => {
    historyTask = store.dispatch(fetchFeedingLogsForStation("station-a"));
    assert.equal(historyRequest.method, "get");
    assert.equal(select().loading, true);
    assert.equal(select().loadError, null);
  });
  await t.test("authenticated POST sends current token and only allowed body fields", () => {
    createTask = store.dispatch(createFeedingLog({
      stationId: "station-a",
      data: { food: true, water: false, note: "Fresh food", userId: "forged", stationId: "forged" },
    }));
    assert.equal(createRequest.headers.get("Authorization"), "Bearer test-token");
    assert.deepEqual(JSON.parse(createRequest.data), { food: true, water: false, note: "Fresh food" });
    assert.equal(select().submitting, true);
    assert.equal(select().submitError, null);
  });
  await t.test("duplicate creation and fetch are suppressed while pending", async () => {
    const duplicate = await store.dispatch(createFeedingLog({ stationId: "station-a", data: {} }));
    const duplicateFetch = await store.dispatch(fetchFeedingLogsForStation("station-a"));
    assert.equal(duplicate.meta.condition, true);
    assert.equal(duplicateFetch.meta.condition, true);
    assert.equal(select().submitting, true);
    assert.equal(select().loading, true);
  });
  await t.test("created log appears immediately without a refetch", async () => {
    releaseCreate();
    await createTask;
    assert.deepEqual(select().data, [newLog]);
    assert.equal(select().submitting, false);
    assert.equal(select().loading, true);
  });
  await t.test("late history response preserves newly created log and newest-first order", async () => {
    releaseHistory();
    await historyTask;
    assert.deepEqual(select().data, [newLog, oldLog]);
    assert.equal(select().loading, false);
  });
  await t.test("repeat fetch deduplicates entries", async () => {
    http.defaults.adapter = async (config) => response(config, [oldLog, newLog]);
    await store.dispatch(fetchFeedingLogsForStation("station-a"));
    assert.deepEqual(select().data, [newLog, oldLog]);
  });
  await t.test("station histories and loading errors are isolated", async () => {
    http.defaults.adapter = async (config) => response(config, [{ ...oldLog, _id: "b-log", stationId: "station-b" }]);
    await store.dispatch(fetchFeedingLogsForStation("station-b"));
    assert.equal(select("station-b").data[0].stationId, "station-b");
    assert.deepEqual(select().data, [newLog, oldLog]);
    http.defaults.adapter = async (config) => { throw new AxiosError("Offline", "ERR_NETWORK", config); };
    await store.dispatch(fetchFeedingLogsForStation("station-b"));
    assert.equal(select("station-b").loadError, "Offline");
    assert.equal(select().loadError, null);
    assert.equal(select("station-b").loading, false);
  });
  await t.test("failed submission keeps history and exposes backend error", async () => {
    http.defaults.adapter = async (config) => {
      throw new AxiosError("Conflict", "ERR_BAD_REQUEST", config, null, {
        ...response(config, { message: "Feeding station is inactive" }), status: 409,
      });
    };
    await store.dispatch(createFeedingLog({ stationId: "station-a", data: {} }));
    assert.equal(select().submitError, "Feeding station is inactive");
    assert.equal(select().submitting, false);
    assert.deepEqual(select().data, [newLog, oldLog]);
  });
  await t.test("history retry clears only history error", async () => {
    http.defaults.adapter = async (config) => response(config, []);
    await store.dispatch(fetchFeedingLogsForStation("station-b"));
    assert.equal(select("station-b").loadError, null);
    assert.equal(select().submitError, "Feeding station is inactive");
  });
  await t.test("successful submission retry uses refreshed token and clears submission error", async () => {
    store.dispatch(setAuth({ ...user, token: "refreshed-token" }));
    http.defaults.adapter = async (config) => {
      assert.equal(config.headers.get("Authorization"), "Bearer refreshed-token");
      return response(config, newLog);
    };
    await store.dispatch(createFeedingLog({ stationId: "station-a", data: {} }));
    assert.equal(select().submitError, null);
    assert.deepEqual(select().data, [newLog, oldLog]);
  });
  await t.test("only auth is persisted", async () => {
    await persistor.flush();
    const saved = JSON.parse(storage.get("persist:root"));
    assert.deepEqual(Object.keys(saved).sort(), ["_persist", "auth"]);
  });
});
