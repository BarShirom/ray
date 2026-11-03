const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8")
      .replaceAll("import.meta.env.VITE_API_URL", JSON.stringify("http://fixture.invalid"))
      .replaceAll("import.meta.env.MODE", JSON.stringify("postgres"));
    module._compile(ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText, filename);
  };
}
require.extensions[".css"] = () => {};

const { http } = require("../src/api/http.ts");
const auth = require("../src/features/auth/authSlice.ts");
const { loginUser, registerUser, logoutUser } = require("../src/features/auth/authThunks.ts");
const { captureSession, isSessionCurrent, AUTHORITY_STORAGE_KEY } = require("../src/features/auth/session.ts");
const { AUTH_STORAGE_KEY } = require("../src/features/auth/authPersistence.ts");
const { createRayStore, persistor: defaultPersistor } = require("../src/app/store.ts");
defaultPersistor.pause();

const userA = { id: "recovery-a", token: "recovery-token-a", firstName: "Synthetic", lastName: "A", email: "recovery-a@fixture.invalid" };
const userB = { ...userA, id: "recovery-b", token: "recovery-token-b", lastName: "B", email: "recovery-b@fixture.invalid" };
const response = (config, user) => ({ config, status: 200, statusText: "Synthetic", headers: {},
  data: { token: user.token, user: { ...user, token: undefined } } });
const ready = (persistor) => persistor.getState().bootstrapped ? Promise.resolve() : new Promise(resolve => {
  const unsubscribe = persistor.subscribe(() => {
    if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
  });
});
const deferredRequests = () => {
  const requests = [], waiting = [];
  requests.waitFor = count => requests.length >= count ? Promise.resolve() : new Promise(resolve => waiting.push({ count, resolve }));
  http.defaults.adapter = config => new Promise(resolve => {
    requests.push({ config, succeed: user => resolve(response(config, user)) });
    for (const waiter of waiting) if (requests.length >= waiter.count) waiter.resolve();
  });
  return requests;
};
const identity = (user, sessionId) => JSON.stringify({ auth: JSON.stringify({ user, sessionId }),
  _persist: JSON.stringify({ version: -1, rehydrated: true }) });
const assertGuest = app => {
  const state = app.store.getState();
  assert.equal(state.auth.user, null);
  assert.equal(state.auth.attemptId, null);
  assert.equal(captureSession(state).token, null);
  assert.deepEqual(state.feedingStations.data, []);
  assert.deepEqual(state.feedingLogs.byStationId, {});
  assert.deepEqual(state.reports.items, []);
  assert.doesNotMatch(JSON.stringify(state), /recovery-token-|recovery-[ab]@fixture\.invalid/);
};

// The hook injects another production store's operation after a read has captured
// its return value. This models suspension at a storage boundary deterministically;
// it is not an actual browser scheduler or evidence of browser event ordering.
// The Map double shares one storage object, records attempted writes/removals, and
// delivers notifications only when requested. Browsers use separate Storage
// objects per window, deliver events asynchronously, and exclude the source tab.
async function fixture(context) {
  const values = new Map(), operations = [], events = [], listeners = new Map();
  const denied = { read: false, write: false, remove: false };
  let readHook = null;
  const storage = {
    getItem(key) {
      if (denied.read) throw new Error("Synthetic storage denied");
      const value = values.get(key) ?? null;
      readHook?.(key, value);
      return value;
    },
    setItem(key, value) {
      operations.push({ kind: "set", key, value });
      if (denied.write) throw new Error("Synthetic storage denied");
      const oldValue = values.get(key) ?? null;
      values.set(key, value);
      events.push({ key, oldValue, newValue: value, storageArea: storage });
    },
    removeItem(key) {
      operations.push({ kind: "remove", key });
      if (denied.remove) throw new Error("Synthetic storage denied");
      const oldValue = values.get(key) ?? null;
      values.delete(key);
      events.push({ key, oldValue, newValue: null, storageArea: storage });
    },
  };
  const previousWindow = global.window;
  global.window = {
    localStorage: storage,
    addEventListener(kind, listener) {
      if (!listeners.has(kind)) listeners.set(kind, new Set());
      listeners.get(kind).add(listener);
    },
    removeEventListener(kind, listener) { listeners.get(kind)?.delete(listener); },
  };
  context.after(() => { if (previousWindow === undefined) delete global.window; else global.window = previousWindow; });
  const makeTab = async () => {
    const tab = createRayStore(storage);
    context.after(tab.dispose);
    await ready(tab.persistor);
    return tab;
  };
  const first = await makeTab();
  http.defaults.adapter = async config => response(config, userA);
  await first.store.dispatch(loginUser({ email: userA.email, password: "synthetic" })).unwrap();
  await first.persistor.flush();
  return { ...first, values, operations, events, storage, denied, makeTab,
    hook: callback => { readHook = callback; },
    fire: (kind, event) => { for (const listener of [...(listeners.get(kind) ?? [])]) listener(event); },
  };
}

async function failLogout(app) {
  app.denied.write = app.denied.remove = true;
  const result = await app.store.dispatch(logoutUser());
  assert.equal(result.type, "auth/logoutUser/rejected");
  assert.equal(result.payload.kind, "storage-unavailable");
  assert.equal(app.store.getState().auth.user, null);
  assert.ok(app.store.getState().auth.logoutFailure);
  app.denied.write = app.denied.remove = false;
  await app.persistor.flush();
  return app.store.getState().auth.logoutFailure.sessionId;
}

async function retryReadOnly(app, permittedOperations = []) {
  const operationCount = app.operations.length;
  const failedSession = app.store.getState().auth.logoutFailure.sessionId;
  const result = await app.store.dispatch(logoutUser({ retrySessionId: failedSession }));
  await app.persistor.flush();
  assert.deepEqual(app.operations.slice(operationCount), permittedOperations,
    "recovery and its queued redux-persist flush attempt no shared writes or removals");
  assertGuest(app);
  assert.doesNotMatch(JSON.stringify(result.payload), /recovery-token-|fixture\.invalid|Synthetic storage denied/);
  return result;
}

async function pausedTab(app) {
  const tab = await app.makeTab();
  tab.store.dispatch(auth.finishAuthRestoration());
  await tab.persistor.flush();
  tab.persistor.pause();
  return tab;
}

test("read-only recovery cannot overwrite B published after its last ownership read", async context => {
  const app = await fixture(context);
  const b = await pausedTab(app);
  const failedSession = await failLogout(app);
  let injected = false, authorityB, identityB;
  const permitted = [], operationsBefore = app.operations.length;
  app.hook(key => {
    if (injected || key !== AUTH_STORAGE_KEY) return;
    injected = true;
    app.hook(null);
    const before = app.operations.length;
    b.store.dispatch(auth.setAuth(userB));
    permitted.push(...app.operations.slice(before));
    authorityB = app.storage.getItem(AUTHORITY_STORAGE_KEY);
    identityB = app.storage.getItem(AUTH_STORAGE_KEY);
  });
  await app.store.dispatch(logoutUser({ retrySessionId: failedSession }));
  await app.persistor.flush();
  assert.equal(injected, true);
  assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), authorityB);
  assert.equal(app.storage.getItem(AUTH_STORAGE_KEY), identityB);
  assert.equal(b.store.getState().auth.user.id, userB.id);
  assertGuest(app);
  assert.deepEqual(app.operations.slice(operationsBefore), permitted);
});

for (const boundary of [AUTHORITY_STORAGE_KEY, AUTH_STORAGE_KEY]) {
  for (const kind of ["login", "registration", "same-account reauthentication"]) {
    test(`${kind} intent survives recovery suspended after reading ${boundary}`, async context => {
      const app = await fixture(context), b = await pausedTab(app);
      await failLogout(app);
      const previousB = captureSession(b.store.getState());
      const requests = deferredRequests(), permitted = [];
      const expectedUser = kind === "same-account reauthentication" ? { ...userA, token: "recovery-token-refreshed" } : userB;
      let pending, authorityB, identityB, injected = false;
      app.hook(key => {
        if (injected || key !== boundary) return;
        injected = true;
        app.hook(null);
        const before = app.operations.length;
        pending = b.store.dispatch((kind === "registration" ? registerUser : loginUser)({ ...expectedUser, password: "synthetic" }));
        permitted.push(...app.operations.slice(before));
        authorityB = app.storage.getItem(AUTHORITY_STORAGE_KEY);
        identityB = app.storage.getItem(AUTH_STORAGE_KEY);
      });
      const result = await retryReadOnly(app, permitted);
      assert.equal(injected, true);
      assert.equal(result.type, "auth/logoutUser/rejected");
      assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), authorityB);
      assert.equal(app.storage.getItem(AUTH_STORAGE_KEY), identityB);
      assert.equal(b.store.getState().auth.attemptId, pending.requestId);
      await requests.waitFor(1);
      requests[0].succeed(expectedUser);
      await pending.unwrap();
      assert.equal(b.store.getState().auth.user.token, expectedUser.token);
      assert.equal(b.store.getState().auth.completedAttemptId, pending.requestId);
      assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), authorityB);
      assert.equal(JSON.parse(JSON.parse(app.storage.getItem(AUTH_STORAGE_KEY)).auth).user.token, expectedUser.token);
      assert.equal(isSessionCurrent(b.store.getState(), previousB), false);
      assertGuest(app);
    });
  }
}

for (const ordering of ["B before recovery", "B after recovery"]) {
  test(`new authentication survives reversed ordering: ${ordering}`, async context => {
    const app = await fixture(context), b = await pausedTab(app);
    await failLogout(app);
    if (ordering === "B before recovery") b.store.dispatch(auth.setAuth(userB));
    const result = await retryReadOnly(app);
    assert.equal(result.type, "auth/logoutUser/rejected");
    assert.equal(result.payload.kind, ordering === "B before recovery" ? "superseded" : "storage-unavailable");
    if (ordering === "B after recovery") b.store.dispatch(auth.setAuth(userB));
    const storedIdentity = app.storage.getItem(AUTH_STORAGE_KEY), authorityB = app.storage.getItem(AUTHORITY_STORAGE_KEY);
    const writes = app.operations.length;
    const staleEvents = [...app.events].reverse();
    for (const event of staleEvents) app.fire("storage", event);
    app.fire("focus"); app.fire("pageshow");
    await app.persistor.flush(); await b.persistor.flush();
    assert.equal(b.store.getState().auth.user.id, userB.id);
    assert.equal(app.storage.getItem(AUTH_STORAGE_KEY), storedIdentity);
    assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), authorityB);
    assert.equal(app.operations.length, writes, "stale signals do not republish authority");
    assertGuest(app);
  });
}

test("ordinary durable logout still persists guest authority and refresh remains guest", async context => {
  const app = await fixture(context);
  const before = app.operations.length;
  const result = await app.store.dispatch(logoutUser());
  await app.persistor.flush();
  assert.equal(result.type, "auth/logoutUser/fulfilled");
  assert.deepEqual(result.payload, { persisted: true });
  const saved = JSON.parse(JSON.parse(app.storage.getItem(AUTH_STORAGE_KEY)).auth);
  assert.equal(saved.user, null);
  assert.equal(saved.sessionId, app.storage.getItem(AUTHORITY_STORAGE_KEY));
  assert.ok(app.operations.length > before);
  assertGuest(app);
  assertGuest(await app.makeTab());
});

test("restored access and repeated recovery retain the warning until both keys are externally absent", async context => {
  const app = await fixture(context);
  await failLogout(app);
  const saved = app.storage.getItem(AUTH_STORAGE_KEY), marker = app.storage.getItem(AUTHORITY_STORAGE_KEY);
  app.denied.read = true;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await retryReadOnly(app);
    assert.equal(result.payload.kind, "storage-unavailable");
    assert.ok(app.store.getState().auth.logoutFailure);
  }
  app.denied.read = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await retryReadOnly(app);
    assert.equal(result.payload.kind, "storage-unavailable");
    assert.equal(app.storage.getItem(AUTH_STORAGE_KEY), saved);
    assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), marker);
    assert.ok(app.store.getState().auth.logoutFailure);
  }
  const refreshed = await app.makeTab();
  assert.equal(refreshed.store.getState().auth.user.id, userA.id, "unchanged old credentials retain their documented refresh risk");
  app.storage.removeItem(AUTHORITY_STORAGE_KEY);
  app.storage.removeItem(AUTH_STORAGE_KEY);
  const result = await retryReadOnly(app);
  assert.equal(result.type, "auth/logoutUser/fulfilled");
  assert.deepEqual(result.payload, { persisted: true });
  assert.equal(app.store.getState().auth.logoutFailure, null);
  assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), null);
  assert.equal(app.storage.getItem(AUTH_STORAGE_KEY), null);
  assertGuest(await app.makeTab());
});

for (const condition of ["corrupt root", "empty root", "missing marker", "missing root", "owned guest root"]) {
  test(`read-only recovery preserves ambiguous storage: ${condition}`, async context => {
    const app = await fixture(context);
    const originalSession = app.store.getState().auth.sessionId;
    await failLogout(app);
    if (condition === "corrupt root") app.storage.setItem(AUTH_STORAGE_KEY, "{synthetic-corrupt-root");
    if (condition === "empty root") app.storage.setItem(AUTH_STORAGE_KEY, "");
    if (condition === "missing marker") app.storage.removeItem(AUTHORITY_STORAGE_KEY);
    if (condition === "missing root") app.storage.removeItem(AUTH_STORAGE_KEY);
    if (condition === "owned guest root") app.storage.setItem(AUTH_STORAGE_KEY, identity(null, originalSession));
    const saved = [...app.values.entries()];
    const result = await retryReadOnly(app);
    assert.equal(result.type, "auth/logoutUser/rejected");
    assert.equal(result.payload.kind, "storage-unavailable");
    assert.deepEqual([...app.values.entries()], saved);
    assert.ok(app.store.getState().auth.logoutFailure);
  });
}

for (const recovery of ["failed", "confirmed absent"]) {
  test(`a fresh same-tab login establishes new durable authority after ${recovery} read-only recovery`, async context => {
    const app = await fixture(context), obsolete = captureSession(app.store.getState());
    await failLogout(app);
    if (recovery === "confirmed absent") {
      app.storage.removeItem(AUTHORITY_STORAGE_KEY); app.storage.removeItem(AUTH_STORAGE_KEY);
    }
    const retried = await retryReadOnly(app);
    assert.equal(retried.type, recovery === "failed" ? "auth/logoutUser/rejected" : "auth/logoutUser/fulfilled");
    const requests = deferredRequests();
    const login = app.store.dispatch(loginUser({ email: userB.email, password: "synthetic" }));
    await requests.waitFor(1);
    assert.equal(app.store.getState().auth.logoutFailure, null);
    assert.equal(app.store.getState().auth.user, null);
    requests[0].succeed(userB);
    await login.unwrap();
    await app.persistor.flush();
    assert.equal(app.store.getState().auth.user.token, userB.token);
    assert.equal(captureSession(app.store.getState()).token, userB.token);
    assert.equal(isSessionCurrent(app.store.getState(), obsolete), false);
    assert.equal(JSON.parse(JSON.parse(app.storage.getItem(AUTH_STORAGE_KEY)).auth).user.token, userB.token);
    assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), app.store.getState().auth.sessionId);
    const refreshed = await app.makeTab();
    assert.equal(refreshed.store.getState().auth.user.token, userB.token);
  });
}

for (const foreignKey of [AUTHORITY_STORAGE_KEY, AUTH_STORAGE_KEY]) {
  test(`foreign ${foreignKey} alone supersedes obsolete recovery without modifying either key`, async context => {
    const app = await fixture(context);
    await failLogout(app);
    app.storage.setItem(foreignKey, foreignKey === AUTHORITY_STORAGE_KEY
      ? "synthetic-foreign-generation" : identity(userB, "synthetic-foreign-generation"));
    const saved = [...app.values.entries()];
    const result = await retryReadOnly(app);
    assert.equal(result.type, "auth/logoutUser/rejected");
    assert.equal(result.payload.kind, "superseded");
    assert.deepEqual([...app.values.entries()], saved);
    assert.ok(app.store.getState().auth.logoutFailure);
  });
}

test("recovery after another tab's durable logout preserves that newer guest authority", async context => {
  const app = await fixture(context), b = await pausedTab(app);
  await failLogout(app);
  const newerLogout = await b.store.dispatch(logoutUser());
  assert.equal(newerLogout.type, "auth/logoutUser/fulfilled");
  const saved = app.storage.getItem(AUTH_STORAGE_KEY), marker = app.storage.getItem(AUTHORITY_STORAGE_KEY);
  const result = await retryReadOnly(app);
  assert.equal(result.type, "auth/logoutUser/rejected");
  assert.equal(result.payload.kind, "superseded");
  assert.equal(app.storage.getItem(AUTH_STORAGE_KEY), saved);
  assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), marker);
  assertGuest(b);
});

for (const boundary of [AUTHORITY_STORAGE_KEY, AUTH_STORAGE_KEY]) {
  test(`authentication published during absent-storage confirmation survives ${boundary} read`, async context => {
    const app = await fixture(context), b = await pausedTab(app);
    await failLogout(app);
    app.storage.removeItem(AUTHORITY_STORAGE_KEY); app.storage.removeItem(AUTH_STORAGE_KEY);
    const permitted = [];
    let injected = false, markerB, savedB;
    app.hook(key => {
      if (key !== boundary || injected) return;
      injected = true; app.hook(null);
      const before = app.operations.length;
      b.store.dispatch(auth.setAuth(userB));
      permitted.push(...app.operations.slice(before));
      markerB = app.storage.getItem(AUTHORITY_STORAGE_KEY); savedB = app.storage.getItem(AUTH_STORAGE_KEY);
    });
    await retryReadOnly(app, permitted);
    assert.equal(injected, true);
    assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), markerB);
    assert.equal(app.storage.getItem(AUTH_STORAGE_KEY), savedB);
    assert.equal(b.store.getState().auth.user.id, userB.id);
  });
}

test("two observers discard A on the same B change without loops, adoption, or stale-event logout", async context => {
  const app = await fixture(context), observer = await pausedTab(app), secondObserver = await pausedTab(app), b = await pausedTab(app);
  const snapshotA = captureSession(observer.store.getState());
  await failLogout(app);
  b.store.dispatch(auth.setAuth(userB));
  const markerB = app.storage.getItem(AUTHORITY_STORAGE_KEY), savedB = app.storage.getItem(AUTH_STORAGE_KEY);
  assert.equal(captureSession(observer.store.getState()).token, null, "authority fencing precedes notification delivery");
  assert.equal(isSessionCurrent(observer.store.getState(), snapshotA), false);
  const before = app.operations.length;
  const authorityEvent = app.events.findLast(event => event.key === AUTHORITY_STORAGE_KEY);
  app.fire("storage", authorityEvent);
  app.fire("storage", authorityEvent);
  for (const event of [...app.events].reverse()) app.fire("storage", event);
  app.fire("focus"); app.fire("pageshow");
  await app.persistor.flush(); await observer.persistor.flush(); await secondObserver.persistor.flush(); await b.persistor.flush();
  assertGuest(app); assertGuest(observer); assertGuest(secondObserver);
  assert.ok(app.store.getState().auth.logoutFailure, "a storage signal does not erase the failed-logout warning");
  assert.equal(b.store.getState().auth.user.id, userB.id);
  assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), markerB);
  assert.equal(app.storage.getItem(AUTH_STORAGE_KEY), savedB);
  assert.equal(app.operations.length, before);
  const refreshed = await app.makeTab();
  assert.equal(refreshed.store.getState().auth.user.id, userB.id);
  assert.notEqual(refreshed.store.getState().auth.user.token, userA.token);
});

test("failed logout and read-only retries keep populated protected domains cleared despite a late response", async context => {
  const app = await fixture(context);
  const { fetchFeedingStations } = require("../src/features/feedingStations/feedingStationsThunks.ts");
  const { fetchFeedingLogsForStation } = require("../src/features/feedingLogs/feedingLogsThunks.ts");
  const { fetchReports, fetchMyReports } = require("../src/features/reports/reportsThunks.ts");
  const stationId = "000000000000000000000011";
  const station = { _id: stationId, name: "Synthetic protected station", location: { lat: 32, lng: 34 },
    estimatedCats: 1, estimatedKittens: 0, active: true, permissions: { canManage: false, canFeed: true } };
  const log = { _id: "000000000000000000000012", stationId, food: true, water: false,
    fedAt: "2026-11-03T06:00:00.000Z", createdAt: "2026-11-03T06:00:00.000Z", updatedAt: "2026-11-03T06:00:00.000Z" };
  const report = { _id: "recovery-protected-report", description: "Synthetic protected report", type: "general", assignedTo: userA.id };
  http.defaults.adapter = async config => ({ ...response(config, userA), data: config.url.endsWith("/feedings") ? [log]
    : config.url === "/api/feeding-stations" ? [station] : [report] });
  await app.store.dispatch(fetchFeedingStations()).unwrap();
  await app.store.dispatch(fetchFeedingLogsForStation(stationId)).unwrap();
  await app.store.dispatch(fetchReports()).unwrap();
  await app.store.dispatch(fetchMyReports()).unwrap();
  assert.equal(app.store.getState().feedingStations.data.length, 1);
  assert.equal(app.store.getState().feedingLogs.byStationId[stationId].data.length, 1);
  assert.equal(app.store.getState().reports.items.length, 1);
  assert.equal(app.store.getState().reports.assigned.items.length, 1);
  let started, finish, calls = 0;
  const requestStarted = new Promise(resolve => { started = resolve; });
  http.defaults.adapter = config => {
    calls++;
    assert.equal(config.headers.get("Authorization"), `Bearer ${userA.token}`);
    started();
    return new Promise(resolve => { finish = () => resolve({ ...response(config, userA), data: [station] }); });
  };
  const delayed = app.store.dispatch(fetchFeedingStations());
  await requestStarted;
  await failLogout(app);
  assertGuest(app);
  assert.deepEqual(app.store.getState().reports.assigned.items, []);
  finish();
  const stale = await delayed;
  assert.equal(stale.type, "feedingStations/fetchAll/rejected");
  assertGuest(app);
  await retryReadOnly(app);
  await retryReadOnly(app);
  const denied = await app.store.dispatch(fetchFeedingStations());
  assert.equal(denied.type, "feedingStations/fetchAll/rejected");
  assert.equal(calls, 1, "the locally purged guest sends no additional protected HTTP request");
  assertGuest(app);
});
