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

const { configureStore } = require("@reduxjs/toolkit");
const { AxiosError } = require("axios");
const { http } = require("../src/api/http.ts");
const auth = require("../src/features/auth/authSlice.ts");
const { loginUser, registerUser, logoutUser } = require("../src/features/auth/authThunks.ts");
const { captureSession, isSessionCurrent, AUTHORITY_STORAGE_KEY } = require("../src/features/auth/session.ts");
const { createAuthPersistence, AUTH_STORAGE_KEY } = require("../src/features/auth/authPersistence.ts");
const { createRayStore, persistor: defaultPersistor } = require("../src/app/store.ts");
defaultPersistor.pause();

const userA = { id: "synthetic-a", token: "synthetic-token-a", firstName: "Synthetic", lastName: "A", email: "a@fixture.invalid" };
const userB = { ...userA, id: "synthetic-b", token: "synthetic-token-b", lastName: "B", email: "b@fixture.invalid" };
const response = (config, user) => ({ config, status: 200, statusText: "Synthetic", headers: {},
  data: { token: user.token, user: { ...user, token: undefined } } });
const makeAuthStore = () => configureStore({ reducer: { auth: auth.default } });
const deferredRequests = () => {
  const requests = [];
  const waiting = [];
  requests.waitFor = (count) => requests.length >= count ? Promise.resolve() : new Promise((resolve) => waiting.push({ count, resolve }));
  http.defaults.adapter = (config) => new Promise((resolve, reject) => {
    requests.push({ config, succeed: (user) => resolve(response(config, user)),
      fail: () => reject(new AxiosError("Synthetic failure", "ERR_BAD_RESPONSE", config, null, { ...response(config, userA), status: 401 })) });
    for (const waiter of waiting) if (requests.length >= waiter.count) waiter.resolve();
  });
  return requests;
};
const ready = (persistor) => persistor.getState().bootstrapped ? Promise.resolve() : new Promise((resolve) => {
  const unsubscribe = persistor.subscribe(() => {
    if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
  });
});
const memoryStorage = () => {
  const values = new Map();
  const events = [];
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); events.push({ key, newValue: value, storageArea: storage }); },
    removeItem: (key) => { values.delete(key); events.push({ key, newValue: null, storageArea: storage }); },
    clear: () => { values.clear(); events.push({ key: null, newValue: null, storageArea: storage }); },
  };
  return { storage, values, events };
};
function browserFixture(context, storage) {
  const listeners = new Map();
  const previous = global.window;
  global.window = {
    localStorage: storage,
    addEventListener: (kind, listener) => { if (!listeners.has(kind)) listeners.set(kind, new Set()); listeners.get(kind).add(listener); },
    removeEventListener: (kind, listener) => listeners.get(kind)?.delete(listener),
  };
  context.after(() => { if (previous === undefined) delete global.window; else global.window = previous; });
  return { fire: (kind, event) => { for (const listener of listeners.get(kind) ?? []) listener(event); } };
}

for (const completionOrder of [[0, 1], [1, 0]]) {
  test(`newest login alone commits for completion order ${completionOrder.join(",")}`, async () => {
    const store = makeAuthStore();
    const requests = deferredRequests();
    const a = store.dispatch(loginUser({ email: userA.email, password: "synthetic" }));
    const sessionA = captureSession(store.getState());
    const b = store.dispatch(loginUser({ email: userB.email, password: "synthetic" }));
    await requests.waitFor(2);
    assert.equal(store.getState().auth.user, null);
    assert.equal(isSessionCurrent(store.getState(), sessionA), false);
    const pending = [a, b];
    for (const index of completionOrder) { requests[index].succeed(index ? userB : userA); await pending[index]; }
    assert.equal(store.getState().auth.user.id, userB.id);
    assert.equal(store.getState().auth.completedAttemptId, b.requestId);
    assert.equal(store.getState().auth.loading, false);
    assert.equal(store.getState().auth.error, null);
  });
}

test("login and registration share one current-intent fence", async () => {
  const store = makeAuthStore();
  const requests = deferredRequests();
  const login = store.dispatch(loginUser({ email: userA.email, password: "synthetic" }));
  const register = store.dispatch(registerUser({ ...userB, password: "synthetic" }));
  await requests.waitFor(2);
  requests[1].succeed(userB); await register;
  requests[0].succeed(userA); const obsolete = await login;
  assert.equal(obsolete.meta.aborted, true);
  assert.equal(store.getState().auth.user.id, userB.id);
  assert.equal(store.getState().auth.completedAttemptId, register.requestId);
});

for (const newestKind of ["login", "register"]) {
  for (const completionOrder of [[0, 1], [1, 0]]) {
    test(`mixed auth attempts preserve latest ${newestKind} for completion order ${completionOrder.join(",")}`, async () => {
      const store = makeAuthStore();
      const requests = deferredRequests();
      const olderThunk = newestKind === "login" ? registerUser : loginUser;
      const newerThunk = newestKind === "login" ? loginUser : registerUser;
      const older = store.dispatch(olderThunk({ ...userA, password: "synthetic" }));
      const newer = store.dispatch(newerThunk({ ...userB, password: "synthetic" }));
      await requests.waitFor(2);
      const attempts = [older, newer];
      for (const index of completionOrder) { requests[index].succeed(index ? userB : userA); await attempts[index]; }
      assert.equal(store.getState().auth.user.id, userB.id);
      assert.equal(store.getState().auth.completedAttemptId, newer.requestId);
      assert.equal(store.getState().auth.error, null);
    });
  }
}

test("logout fences delayed success and direct obsolete fulfilled/rejected reducers", async () => {
  const store = makeAuthStore();
  const requests = deferredRequests();
  const login = store.dispatch(loginUser({ email: userA.email, password: "synthetic" }));
  await requests.waitFor(1);
  store.dispatch(auth.logout());
  const loggedOut = store.getState().auth.sessionId;
  requests[0].succeed(userA); await login;
  store.dispatch(loginUser.fulfilled({ user: userA }, login.requestId, { email: userA.email, password: "synthetic" }));
  store.dispatch(loginUser.rejected(new Error("obsolete"), login.requestId, { email: userA.email, password: "synthetic" }, "obsolete"));
  assert.equal(store.getState().auth.user, null);
  assert.equal(store.getState().auth.sessionId, loggedOut);
  assert.equal(store.getState().auth.error, null);
  assert.equal(store.getState().auth.loading, false);
});

test("logout intent clears identity before subscribers or a delayed registration can use it", async () => {
  const store = makeAuthStore();
  store.dispatch(auth.setAuth(userA));
  const requests = deferredRequests();
  const registration = store.dispatch(registerUser({ ...userB, password: "synthetic" }));
  await requests.waitFor(1);
  const snapshots = [];
  const unsubscribe = store.subscribe(() => snapshots.push(captureSession(store.getState())));
  const logout = store.dispatch(logoutUser());
  assert.equal(snapshots[0].token, null, "pending logout is already an identity transition");
  assert.equal(store.getState().auth.attemptId, null);
  requests[0].succeed(userB); await registration; await logout;
  unsubscribe();
  assert.equal(store.getState().auth.user, null);
  assert.equal(store.getState().auth.error, null);
});

test("late PersistGate completion cannot clear a current login busy flag", async () => {
  const store = makeAuthStore();
  const requests = deferredRequests();
  const login = store.dispatch(loginUser({ email: userA.email, password: "synthetic" }));
  await requests.waitFor(1);
  store.dispatch(auth.finishAuthRestoration());
  assert.equal(store.getState().auth.loading, true);
  assert.equal(captureSession(store.getState()).token, null);
  requests[0].succeed(userA); await login;
  assert.equal(store.getState().auth.loading, false);
});

test("obsolete failure cannot replace newer login state; same-account reauth rotates credentials", async () => {
  const store = makeAuthStore();
  const requests = deferredRequests();
  const old = store.dispatch(loginUser({ email: userA.email, password: "synthetic" }));
  const current = store.dispatch(loginUser({ email: userB.email, password: "synthetic" }));
  await requests.waitFor(2);
  requests[1].succeed(userB); await current;
  const previous = captureSession(store.getState());
  requests[0].fail(); await old;
  assert.equal(store.getState().auth.error, null);
  assert.equal(store.getState().auth.user.id, userB.id);
  const reauth = store.dispatch(loginUser({ email: userB.email, password: "synthetic" }));
  assert.equal(store.getState().auth.user, null, "the previous identity is removed at new intent");
  assert.equal(captureSession(store.getState()).token, null);
  await requests.waitFor(3);
  requests[2].succeed({ ...userB, token: "synthetic-refreshed" }); await reauth;
  assert.equal(isSessionCurrent(store.getState(), previous), false);
  assert.equal(store.getState().auth.user.token, "synthetic-refreshed");
});

test("current-session invalidation cannot log out a later A/B/A identity", () => {
  const store = makeAuthStore();
  store.dispatch(auth.setAuth(userA)); const a = captureSession(store.getState());
  store.dispatch(auth.setAuth(userB)); const b = captureSession(store.getState());
  store.dispatch(auth.invalidateSession({ sessionId: a.id }));
  assert.equal(store.getState().auth.user.id, userB.id);
  store.dispatch(auth.setAuth(userA));
  store.dispatch(auth.invalidateSession({ sessionId: b.id }));
  assert.equal(store.getState().auth.user.id, userA.id);
  store.dispatch(auth.invalidateSession({ sessionId: store.getState().auth.sessionId }));
  assert.equal(store.getState().auth.user, null);
});

test("queued persistence writes cannot resurrect credentials after logout or another tab", async () => {
  const { storage } = memoryStorage();
  const persistence = createAuthPersistence(storage);
  const store = makeAuthStore();
  store.dispatch(auth.setAuth(userA));
  const old = store.getState().auth;
  persistence.publish(old);
  const encodedA = storage.getItem(AUTH_STORAGE_KEY);
  store.dispatch(auth.logout()); persistence.publish(store.getState().auth);
  await persistence.storage.setItem(AUTH_STORAGE_KEY, encodedA);
  assert.equal(JSON.parse(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)).auth).user, null);
  store.dispatch(auth.setAuth(userB)); persistence.publish(store.getState().auth);
  const encodedB = storage.getItem(AUTH_STORAGE_KEY);
  await persistence.storage.setItem(AUTH_STORAGE_KEY, encodedA);
  assert.equal(storage.getItem(AUTH_STORAGE_KEY), encodedB);
  assert.equal(persistence.restore({ user: userA, sessionId: old.sessionId }), null);
});

test("partial storage failure removes stale authority and permanently blocks queued writes until a new intent", async () => {
  const { storage, values } = memoryStorage();
  let refuseMarker = false;
  const guarded = { ...storage, setItem: (key, value) => {
    if (refuseMarker && key === AUTHORITY_STORAGE_KEY) throw new Error("synthetic quota");
    storage.setItem(key, value);
  } };
  const persistence = createAuthPersistence(guarded), store = makeAuthStore();
  store.dispatch(auth.setAuth(userA)); persistence.publish(store.getState().auth);
  const oldEncoded = storage.getItem(AUTH_STORAGE_KEY);
  const oldIdentity = JSON.parse(JSON.parse(oldEncoded).auth);
  refuseMarker = true;
  store.dispatch(auth.logout());
  assert.equal(persistence.publish(store.getState().auth), false);
  assert.equal(storage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(storage.getItem(AUTHORITY_STORAGE_KEY), null);
  // Even an untrusted delayed old marker cannot enable this blocked writer.
  values.set(AUTHORITY_STORAGE_KEY, oldIdentity.sessionId);
  await persistence.storage.setItem(AUTH_STORAGE_KEY, oldEncoded);
  assert.equal(storage.getItem(AUTH_STORAGE_KEY), null);
  refuseMarker = false;
  store.dispatch(auth.setAuth(userB));
  assert.equal(persistence.publish(store.getState().auth), true);
  assert.equal(JSON.parse(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)).auth).user.id, userB.id);
});

test("pre-fencing persisted credentials require reauthentication instead of claiming new authority", async (context) => {
  const { storage } = memoryStorage();
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ auth: JSON.stringify({ user: userA, loading: true }) }));
  const instance = createRayStore(storage); context.after(instance.dispose); await ready(instance.persistor);
  assert.equal(instance.store.getState().auth.user, null);
  assert.equal(storage.getItem(AUTHORITY_STORAGE_KEY), null);
});

test("a subscriber observes accepted identity and shared authority atomically before a protected request", async (context) => {
  const { storage } = memoryStorage();
  browserFixture(context, storage);
  const instance = createRayStore(storage); context.after(instance.dispose); await ready(instance.persistor);
  const { fetchFeedingStations } = require("../src/features/feedingStations/feedingStationsThunks.ts");
  let pending, fired = false, calls = 0;
  http.defaults.adapter = async (config) => {
    calls++;
    assert.equal(config.headers.get("Authorization"), `Bearer ${userA.token}`);
    return { ...response(config, userA), data: [] };
  };
  const unsubscribe = instance.store.subscribe(() => {
    if (!fired && instance.store.getState().auth.user) {
      fired = true;
      assert.equal(captureSession(instance.store.getState()).token, userA.token);
      pending = instance.store.dispatch(fetchFeedingStations());
    }
  });
  instance.store.dispatch(auth.setAuth(userA));
  await pending.unwrap(); unsubscribe();
  assert.equal(calls, 1);
  assert.equal(instance.store.getState().auth.user.id, userA.id);
});

for (const boundary of ["completion", "restoration"]) {
  test(`foreign authority arriving inside ${boundary} ownership check is never overwritten`, async (context) => {
    const { storage, values } = memoryStorage();
    let armed = false, incoming;
    const guarded = { ...storage, getItem: (key) => {
      const value = storage.getItem(key);
      if (armed && key === AUTHORITY_STORAGE_KEY) {
        armed = false;
        values.set(AUTHORITY_STORAGE_KEY, incoming.sessionId);
        values.set(AUTH_STORAGE_KEY, JSON.stringify({ auth: JSON.stringify(incoming), _persist: JSON.stringify({ version: -1, rehydrated: true }) }));
      }
      return value;
    } };
    browserFixture(context, guarded);
    const first = createRayStore(guarded); context.after(first.dispose); await ready(first.persistor);
    first.store.dispatch(auth.setAuth(userA));
    const requests = deferredRequests();
    let attempt;
    if (boundary === "completion") {
      attempt = first.store.dispatch(loginUser({ email: userA.email, password: "synthetic" }));
      await requests.waitFor(1);
    }
    incoming = { user: userB, sessionId: "synthetic-newer-foreign-authority" };
    armed = true;
    let affected = first;
    if (boundary === "completion") { requests[0].succeed(userA); await attempt; }
    else { affected = createRayStore(guarded); context.after(affected.dispose); await ready(affected.persistor); }
    assert.equal(affected.store.getState().auth.user, null);
    assert.equal(storage.getItem(AUTHORITY_STORAGE_KEY), incoming.sessionId);
    const encoded = JSON.parse(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)).auth);
    assert.equal(encoded.user.id, userB.id, "a losing auth boundary cannot replace the newer stored identity");
  });
}

test("normal persisted refresh restores identity only; delayed hydration loses to explicit logout", async (context) => {
  const { storage } = memoryStorage();
  const first = createRayStore(storage); context.after(first.dispose); await ready(first.persistor);
  first.store.dispatch(auth.setAuth(userA)); await first.persistor.flush();
  const saved = JSON.parse(storage.getItem(AUTH_STORAGE_KEY));
  assert.deepEqual(Object.keys(saved).sort(), ["_persist", "auth"]);
  assert.deepEqual(Object.keys(JSON.parse(saved.auth)).sort(), ["sessionId", "user"]);
  const restored = createRayStore(storage); context.after(restored.dispose); await ready(restored.persistor);
  assert.deepEqual(restored.store.getState().auth.user, userA);
  assert.equal(restored.store.getState().auth.loading, true);
  restored.store.dispatch(auth.finishAuthRestoration());
  assert.equal(restored.store.getState().auth.loading, false);
  assert.deepEqual(restored.store.getState().feedingStations.data, []);
  assert.deepEqual(restored.store.getState().reports.items, []);

  const racing = createRayStore(storage); context.after(racing.dispose);
  racing.store.dispatch(auth.logout());
  await ready(racing.persistor);
  assert.equal(racing.store.getState().auth.user, null);
  assert.equal(racing.store.getState().auth.hasAuthIntent, true);
  await racing.persistor.flush();
  assert.equal(JSON.parse(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)).auth).user, null);
});

test("cross-tab replacement/logout clears identity without event loops or copying credentials", async (context) => {
  const { storage, events } = memoryStorage();
  const browser = browserFixture(context, storage);
  const tabA = createRayStore(storage); context.after(tabA.dispose); await ready(tabA.persistor);
  tabA.store.dispatch(auth.setAuth(userA));
  const tabB = createRayStore(storage); context.after(tabB.dispose); await ready(tabB.persistor);
  tabB.store.dispatch(auth.finishAuthRestoration());
  assert.equal(tabB.store.getState().auth.user.id, userA.id);
  const aSnapshot = captureSession(tabA.store.getState());
  tabB.store.dispatch(auth.setAuth(userB));
  assert.equal(isSessionCurrent(tabA.store.getState(), aSnapshot), false, "authority is checked before the storage event is delivered");
  assert.equal(captureSession(tabA.store.getState()).token, null, "obsolete credentials cannot start a protected request");
  const writesBeforeEvents = events.length;
  for (const event of [...events]) browser.fire("storage", event);
  assert.equal(tabA.store.getState().auth.user, null);
  assert.equal(tabB.store.getState().auth.user.id, userB.id);
  assert.equal(events.length, writesBeforeEvents, "foreign invalidation does not republish or loop");
  tabB.store.dispatch(auth.logout());
  for (const event of [...events]) browser.fire("storage", event);
  assert.equal(tabA.store.getState().auth.user, null);
  assert.equal(tabB.store.getState().auth.user, null);
});

test("foreign authority invalidates delayed login before storage delivery and ambiguous hydration", async (context) => {
  const { storage } = memoryStorage();
  browserFixture(context, storage);
  const tabA = createRayStore(storage); context.after(tabA.dispose); await ready(tabA.persistor);
  const requests = deferredRequests();
  const old = tabA.store.dispatch(loginUser({ email: userA.email, password: "synthetic" }));
  await requests.waitFor(1);
  const tabB = createRayStore(storage); context.after(tabB.dispose); await ready(tabB.persistor);
  tabB.store.dispatch(auth.setAuth(userB));
  requests[0].succeed(userA); await old;
  assert.equal(tabA.store.getState().auth.user, null);
  assert.equal(tabB.store.getState().auth.user.id, userB.id);
  assert.equal(JSON.parse(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)).auth).user.id, userB.id);
  storage.setItem(AUTHORITY_STORAGE_KEY, "synthetic-ambiguous-newer-event");
  const ambiguous = createRayStore(storage); context.after(ambiguous.dispose); await ready(ambiguous.persistor);
  assert.equal(ambiguous.store.getState().auth.user, null);
});

test("storage clear, lost authority and blocked storage fail closed", async (context) => {
  const { storage, events } = memoryStorage();
  const browser = browserFixture(context, storage);
  const instance = createRayStore(storage); context.after(instance.dispose); await ready(instance.persistor);
  instance.store.dispatch(auth.setAuth(userA));
  const snapshot = captureSession(instance.store.getState());
  storage.removeItem(AUTHORITY_STORAGE_KEY);
  assert.equal(isSessionCurrent(instance.store.getState(), snapshot), false);
  assert.equal(captureSession(instance.store.getState()).token, null);
  browser.fire("storage", events.at(-1));
  assert.equal(instance.store.getState().auth.user, null);
  instance.store.dispatch(auth.setAuth(userB));
  storage.clear(); browser.fire("storage", events.at(-1));
  assert.equal(instance.store.getState().auth.user, null);

  const blocked = { getItem: () => { throw new Error("synthetic storage denied"); },
    setItem: () => { throw new Error("synthetic storage denied"); }, removeItem: () => { throw new Error("synthetic storage denied"); } };
  global.window.localStorage = blocked;
  const unavailable = createRayStore(blocked); context.after(unavailable.dispose); await ready(unavailable.persistor);
  unavailable.store.dispatch(auth.setAuth(userA));
  assert.equal(unavailable.store.getState().auth.user, null);
  assert.equal(captureSession(unavailable.store.getState()).token, null);
  assert.equal(unavailable.store.getState().auth.error, require("../src/i18n/index.ts").t("auth.storageUnavailable"));
});

test("central 401 handling ignores old sessions and clears the matching session", async (context) => {
  const instance = createRayStore(null); context.after(instance.dispose); await ready(instance.persistor);
  instance.store.dispatch(auth.setAuth(userA)); const a = instance.store.getState().auth.sessionId;
  instance.store.dispatch(auth.setAuth(userB)); const b = instance.store.getState().auth.sessionId;
  instance.store.dispatch({ type: "feedingStations/fetch/rejected", payload: { kind: "authentication", source: "http", status: 401, sessionId: a, requestId: "synthetic-old", message: "Synthetic" } });
  assert.equal(instance.store.getState().auth.user.id, userB.id);
  instance.store.dispatch({ type: "feedingStations/fetch/rejected", payload: { kind: "authentication", source: "http", status: 401, sessionId: b, requestId: "synthetic-current", message: "Synthetic" } });
  assert.equal(instance.store.getState().auth.user, null);
});

test("guest refresh and a tab cleared by foreign login retain public Report discovery without adopting credentials", async (context) => {
  const { storage, events } = memoryStorage();
  const browser = browserFixture(context, storage);
  const tabA = createRayStore(storage); context.after(tabA.dispose); await ready(tabA.persistor);
  tabA.store.dispatch(auth.setAuth(userA));
  const tabB = createRayStore(storage); context.after(tabB.dispose); await ready(tabB.persistor);
  tabB.store.dispatch(auth.finishAuthRestoration());
  tabB.store.dispatch(auth.setAuth(userB));
  for (const event of [...events]) browser.fire("storage", event);
  const authorityB = storage.getItem(AUTHORITY_STORAGE_KEY);
  const guest = captureSession(tabA.store.getState());
  assert.equal(guest.actorId, null);
  assert.equal(isSessionCurrent(tabA.store.getState(), guest), true);
  const { fetchReports } = require("../src/features/reports/reportsThunks.ts");
  let requests = 0;
  http.defaults.adapter = async (config) => {
    requests++;
    assert.equal(config.url, "/api/reports");
    assert.equal(config.headers.get("Authorization"), undefined);
    return { ...response(config, userA), data: [] };
  };
  await tabA.store.dispatch(fetchReports()).unwrap();
  assert.equal(requests, 1);
  assert.equal(storage.getItem(AUTHORITY_STORAGE_KEY), authorityB, "guest discovery cannot replace B's authority");
  assert.equal(tabB.store.getState().auth.user.id, userB.id);
  tabB.store.dispatch(auth.logout());
  const refreshed = createRayStore(storage); context.after(refreshed.dispose); await ready(refreshed.persistor);
  assert.equal(refreshed.store.getState().auth.user, null);
  await refreshed.store.dispatch(fetchReports()).unwrap();
  assert.equal(requests, 2);
});

test("a 401 received before foreign storage delivery clears only the stale tab and cannot overwrite B", async (context) => {
  const { storage } = memoryStorage();
  browserFixture(context, storage);
  const tabA = createRayStore(storage); context.after(tabA.dispose); await ready(tabA.persistor);
  tabA.store.dispatch(auth.setAuth(userA)); const sessionA = tabA.store.getState().auth.sessionId;
  const tabB = createRayStore(storage); context.after(tabB.dispose); await ready(tabB.persistor);
  tabB.store.dispatch(auth.setAuth(userB));
  const savedB = storage.getItem(AUTH_STORAGE_KEY), authorityB = storage.getItem(AUTHORITY_STORAGE_KEY);
  tabA.store.dispatch({ type: "feedingStations/fetch/rejected", payload: {
    kind: "authentication", source: "http", status: 401, sessionId: sessionA, requestId: "synthetic-stale-401", message: "Synthetic",
  } });
  assert.equal(tabA.store.getState().auth.user, null);
  assert.equal(tabB.store.getState().auth.user.id, userB.id);
  assert.equal(storage.getItem(AUTH_STORAGE_KEY), savedB);
  assert.equal(storage.getItem(AUTHORITY_STORAGE_KEY), authorityB);
});

function renderedAuthSubmit(context, pageName, store) {
  const React = require("react"), jsx = require("react/jsx-runtime");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { Provider } = require("react-redux");
  const router = require("react-router-dom");
  const navigations = [], updates = [];
  const originalState = React.useState;
  let textField = 0, submit;
  context.mock.method(React, "useState", (initial) => {
    const seeded = initial === "" ? (textField++ === 0 ? userA.email : "synthetic-password")
      : initial && typeof initial === "object" && "password" in initial ? { ...userA, password: "synthetic-password", company: "" } : initial;
    const [value, setValue] = originalState(seeded);
    return [value, (next) => { updates.push(next); setValue(next); }];
  });
  for (const method of ["jsx", "jsxs"]) {
    const original = jsx[method];
    context.mock.method(jsx, method, (type, props, ...rest) => {
      if (type === "form" && props.className === "auth-form") submit = props.onSubmit;
      return original(type, props, ...rest);
    });
  }
  // Node 22 exposes the router's ESM namespace as immutable. Substitute only
  // the navigation sink while loading the real page, then restore the loader.
  const Module = require("node:module"), previousLoad = Module._load;
  const pagePath = require.resolve(`../src/pages/${pageName}/${pageName === "login" ? "Login" : "Register"}.tsx`);
  delete require.cache[pagePath];
  let Page;
  Module._load = function(request, ...args) {
    return request === "react-router-dom" ? { ...router, useNavigate: () => (path) => navigations.push(path) }
      : previousLoad.call(this, request, ...args);
  };
  try { Page = require(pagePath).default; } finally { Module._load = previousLoad; }
  context.after(() => { delete require.cache[pagePath]; });
  renderToStaticMarkup(React.createElement(Provider, { store },
    React.createElement(router.MemoryRouter, null, React.createElement(Page))));
  assert.equal(typeof submit, "function");
  return { submit: () => submit({ preventDefault() {} }), navigations, updates };
}

for (const pageName of ["login", "register"]) {
  test(`actual ${pageName} submit callback navigates only for its accepted completion`, async (context) => {
    const store = makeAuthStore(), requests = deferredRequests();
    const page = renderedAuthSubmit(context, pageName, store);
    const submission = page.submit(); await requests.waitFor(1);
    await page.submit();
    assert.equal(requests.length, 1, "same-render double submit is synchronously suppressed");
    requests[0].succeed(userA); await submission;
    assert.deepEqual(page.navigations, ["/map-page"]);
    assert.equal(store.getState().auth.user.id, userA.id);
  });

  test(`actual ${pageName} callback ignores late success after logout`, async (context) => {
    const store = makeAuthStore(), requests = deferredRequests();
    const page = renderedAuthSubmit(context, pageName, store);
    const submission = page.submit(); await requests.waitFor(1);
    store.dispatch(auth.logout());
    requests[0].succeed(userA); await submission;
    assert.deepEqual(page.navigations, []);
    assert.equal(page.updates.some(value => typeof value === "string"), false, "no obsolete error is presented");
    assert.equal(store.getState().auth.user, null);
  });

  test(`actual ${pageName} callback ignores obsolete errors after newer authentication`, async (context) => {
    const store = makeAuthStore(), requests = deferredRequests();
    const page = renderedAuthSubmit(context, pageName, store);
    const submission = page.submit(); await requests.waitFor(1);
    store.dispatch(auth.setAuth(userB));
    requests[0].fail(); await submission;
    assert.deepEqual(page.navigations, []);
    assert.equal(page.updates.some(value => typeof value === "string"), false);
    assert.equal(store.getState().auth.user.id, userB.id);
  });
}

async function durableLogoutFixture(context) {
  const saved = memoryStorage();
  const blocked = { read: false, write: false, remove: false };
  const storage = {
    getItem(key) { if (blocked.read) throw new Error("Synthetic storage denied"); return saved.storage.getItem(key); },
    setItem(key, value) { if (blocked.write) throw new Error("Synthetic storage denied"); saved.storage.setItem(key, value); },
    removeItem(key) { if (blocked.remove) throw new Error("Synthetic storage denied"); saved.storage.removeItem(key); },
  };
  const browser = browserFixture(context, storage);
  const instance = createRayStore(storage); context.after(instance.dispose); await ready(instance.persistor);
  http.defaults.adapter = async config => response(config, userA);
  await instance.store.dispatch(loginUser({ email: userA.email, password: "synthetic" })).unwrap();
  await instance.persistor.flush();
  return { ...saved, storage, blocked, browser, ...instance };
}

function renderedShell(store, path) {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const { Provider } = require("react-redux"), { MemoryRouter, Routes, Route } = require("react-router-dom");
  const Layout = require("../src/components/layout/Layout.tsx").default;
  return renderToStaticMarkup(React.createElement(Provider, { store },
    React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null, React.createElement(Route, { element: React.createElement(Layout) },
        React.createElement(Route, { path: "*", element: React.createElement("p", null, "Synthetic route") }))))));
}

function renderedLogout(context, store) {
  const React = require("react"), jsx = require("react/jsx-runtime"), router = require("react-router-dom");
  const { renderToStaticMarkup } = require("react-dom/server"), { Provider } = require("react-redux");
  const { t } = require("../src/i18n/index.ts");
  const navigations = [];
  let click;
  for (const method of ["jsx", "jsxs"]) {
    const original = jsx[method];
    context.mock.method(jsx, method, (type, props, ...rest) => {
      if (type === "button" && props.children === t("auth.logout")) click = props.onClick;
      return original(type, props, ...rest);
    });
  }
  const Module = require("node:module"), previousLoad = Module._load;
  const path = require.resolve("../src/components/navbar/Navbar.tsx");
  delete require.cache[path];
  Module._load = function(request, ...args) {
    return request === "react-router-dom" ? { ...router, useNavigate: () => destination => navigations.push(destination) }
      : previousLoad.call(this, request, ...args);
  };
  let Navbar;
  try { Navbar = require(path).default; } finally { Module._load = previousLoad; }
  context.after(() => { delete require.cache[path]; });
  renderToStaticMarkup(React.createElement(Provider, { store },
    React.createElement(router.MemoryRouter, null, React.createElement(Navbar))));
  assert.equal(typeof click, "function");
  return { click, navigations };
}

test("production logout confirms durable guest state and the actual navbar navigates on success", async context => {
  const app = await durableLogoutFixture(context), navbar = renderedLogout(context, app.store);
  await navbar.click();
  assert.deepEqual(navbar.navigations, ["/"]);
  assert.equal(app.store.getState().auth.user, null);
  assert.equal(app.store.getState().auth.logoutFailure, null);
  const stored = JSON.parse(JSON.parse(app.storage.getItem(AUTH_STORAGE_KEY)).auth);
  assert.equal(stored.user, null);
  assert.equal(stored.sessionId, app.storage.getItem(AUTHORITY_STORAGE_KEY));
  const refreshed = createRayStore(app.storage); context.after(refreshed.dispose); await ready(refreshed.persistor);
  assert.equal(refreshed.store.getState().auth.user, null);
});

test("failed actual navbar logout purges every protected domain and exposes an enduring safe shell alert", async context => {
  const app = await durableLogoutFixture(context);
  const stationId = "000000000000000000000001";
  const station = { _id: stationId, name: "Synthetic", location: { lat: 32, lng: 34 }, estimatedCats: 1, estimatedKittens: 0,
    active: true, permissions: { canManage: false, canFeed: true } };
  const log = { _id: "000000000000000000000002", stationId, food: true, water: false,
    fedAt: "2026-11-03T06:00:00.000Z", createdAt: "2026-11-03T06:00:00.000Z", updatedAt: "2026-11-03T06:00:00.000Z" };
  http.defaults.adapter = async config => ({ ...response(config, userA), data: config.url.endsWith("/feedings") ? [log]
    : config.url === "/api/feeding-stations" ? [station] : [{ _id: "synthetic-report", description: "Synthetic", type: "general" }] });
  await app.store.dispatch(require("../src/features/feedingStations/feedingStationsThunks.ts").fetchFeedingStations()).unwrap();
  await app.store.dispatch(require("../src/features/feedingLogs/feedingLogsThunks.ts").fetchFeedingLogsForStation(stationId)).unwrap();
  await app.store.dispatch(require("../src/features/reports/reportsThunks.ts").fetchReports()).unwrap();
  assert.equal(app.store.getState().feedingStations.data.length, 1);
  assert.equal(app.store.getState().feedingLogs.byStationId[stationId].data.length, 1);
  assert.equal(app.store.getState().reports.items.length, 1);
  const navbar = renderedLogout(context, app.store);
  app.blocked.write = app.blocked.remove = true;
  await navbar.click();
  assert.deepEqual(navbar.navigations, [], "failed durable removal is not the success navigation branch");
  assert.equal(app.store.getState().auth.user, null);
  assert.ok(app.store.getState().auth.logoutFailure);
  assert.deepEqual(app.store.getState().feedingStations.data, []);
  assert.deepEqual(app.store.getState().feedingLogs.byStationId, {});
  assert.deepEqual(app.store.getState().reports.items, []);
  const { t } = require("../src/i18n/index.ts");
  for (const route of ["/map-page", "/", "/login"]) {
    const markup = renderedShell(app.store, route);
    assert.match(markup, /role="alert"/);
    assert.ok(markup.includes(t("auth.logoutStorageWarning")));
    assert.ok(markup.includes(t("auth.retryLogout")));
    assert.doesNotMatch(markup, /synthetic-token|a@fixture\.invalid|Synthetic storage denied/);
  }
  app.blocked.write = app.blocked.remove = false;
  const refreshed = createRayStore(app.storage); context.after(refreshed.dispose); await ready(refreshed.persistor);
  assert.equal(refreshed.store.getState().auth.user.id, userA.id, "unavailable storage cannot promise future reload erasure");
  assert.ok(app.store.getState().auth.logoutFailure, "the original local warning survives route rendering and another store's refresh");
});

for (const failReads of [false, true]) {
  test(`logout rejects persistence failure and verifies manual recovery without writing (read denied=${failReads})`, async context => {
    const app = await durableLogoutFixture(context);
    app.blocked.read = failReads; app.blocked.write = app.blocked.remove = true;
    const failed = await app.store.dispatch(logoutUser());
    assert.equal(failed.type, "auth/logoutUser/rejected");
    assert.equal(failed.payload.kind, "storage-unavailable");
    assert.equal(app.store.getState().auth.user, null);
    const warning = app.store.getState().auth.logoutFailure;
    const stillFailed = await app.store.dispatch(logoutUser({ retrySessionId: warning.sessionId }));
    assert.equal(stillFailed.type, "auth/logoutUser/rejected");
    assert.ok(app.store.getState().auth.logoutFailure);
    assert.doesNotMatch(JSON.stringify(stillFailed.payload), /synthetic-token|fixture\.invalid|Synthetic storage denied/);
    app.blocked.read = app.blocked.write = app.blocked.remove = false;
    const writes = app.events.length;
    const retained = await app.store.dispatch(logoutUser({ retrySessionId: app.store.getState().auth.logoutFailure.sessionId }));
    assert.equal(retained.type, "auth/logoutUser/rejected", "usable storage alone does not erase retained credentials");
    assert.ok(app.store.getState().auth.logoutFailure);
    await app.persistor.flush();
    assert.equal(app.events.length, writes, "recovery and its queued persistence never mutate shared storage");
    // Model external/manual site-data clearing, not a recovery side effect.
    app.storage.removeItem(AUTH_STORAGE_KEY);
    app.storage.removeItem(AUTHORITY_STORAGE_KEY);
    const clearedWrites = app.events.length;
    const recovered = await app.store.dispatch(logoutUser({ retrySessionId: app.store.getState().auth.logoutFailure.sessionId }));
    assert.equal(recovered.type, "auth/logoutUser/fulfilled");
    assert.deepEqual(recovered.payload, { persisted: true });
    assert.equal(app.store.getState().auth.logoutFailure, null);
    await app.persistor.flush();
    assert.equal(app.events.length, clearedWrites, "successful verification does not publish guest authority");
    const refreshed = createRayStore(app.storage); context.after(refreshed.dispose); await ready(refreshed.persistor);
    assert.equal(refreshed.store.getState().auth.user, null);
  });
}

for (const newerTab of [false, true]) {
  test(`failed-logout retry cannot replace a newer B identity (foreign tab=${newerTab})`, async context => {
    const app = await durableLogoutFixture(context);
    app.blocked.write = app.blocked.remove = true;
    await app.store.dispatch(logoutUser());
    const failedSession = app.store.getState().auth.logoutFailure.sessionId;
    app.blocked.write = app.blocked.remove = false;
    const target = newerTab ? createRayStore(app.storage) : app;
    if (newerTab) { context.after(target.dispose); await ready(target.persistor); target.store.dispatch(auth.finishAuthRestoration()); }
    target.store.dispatch(auth.setAuth(userB));
    await target.persistor.flush();
    const identity = app.storage.getItem(AUTH_STORAGE_KEY), authority = app.storage.getItem(AUTHORITY_STORAGE_KEY), eventCount = app.events.length;
    const obsolete = await app.store.dispatch(logoutUser({ retrySessionId: failedSession }));
    assert.equal(obsolete.type, "auth/logoutUser/rejected");
    assert.equal(target.store.getState().auth.user.id, userB.id);
    assert.equal(app.storage.getItem(AUTH_STORAGE_KEY), identity);
    assert.equal(app.storage.getItem(AUTHORITY_STORAGE_KEY), authority);
    assert.equal(app.events.length, eventCount, "obsolete recovery performs no shared-storage writes");
    const markup = renderedShell(app.store, "/");
    const { t } = require("../src/i18n/index.ts");
    assert.ok(!markup.includes(t("auth.retryLogout")), "a superseded recovery does not offer a nonfunctional retry");
    if (newerTab) {
      assert.ok(markup.includes(t("auth.logoutStorageWarning")));
      assert.ok(markup.includes(t("auth.logoutRetrySuperseded")));
    }
  });
}

for (const kind of ["completed login", "pending login", "pending registration"]) {
  test(`old root deletion cannot invalidate a newer ${kind}`, async context => {
    const app = await durableLogoutFixture(context);
    const oldValue = app.storage.getItem(AUTH_STORAGE_KEY);
    app.storage.removeItem(AUTH_STORAGE_KEY);
    const delayed = { key: AUTH_STORAGE_KEY, oldValue, newValue: null, storageArea: app.storage };
    const requests = deferredRequests();
    const thunk = kind === "pending registration" ? registerUser : loginUser;
    const request = app.store.dispatch(thunk({ ...userB, password: "synthetic" }));
    await requests.waitFor(1);
    if (kind === "completed login") { requests[0].succeed(userB); await request; }
    const authBefore = app.store.getState().auth, writes = app.events.length;
    app.browser.fire("storage", delayed);
    assert.equal(app.store.getState().auth, authBefore);
    assert.equal(app.events.length, writes, "a delayed signal does not rebroadcast");
    if (kind !== "completed login") { requests[0].succeed(userB); await request; }
    assert.equal(app.store.getState().auth.user.id, userB.id);
  });
}

for (const loss of ["deleted", "corrupt", "unavailable"]) {
  test(`current storage reconciliation fails closed for ${loss} root identity`, async context => {
    const app = await durableLogoutFixture(context);
    if (loss === "deleted") app.storage.removeItem(AUTH_STORAGE_KEY);
    if (loss === "corrupt") app.storage.setItem(AUTH_STORAGE_KEY, "synthetic corrupt identity");
    if (loss === "unavailable") app.blocked.read = true;
    const writes = app.events.length;
    app.browser.fire("storage", { key: AUTH_STORAGE_KEY, newValue: null, storageArea: app.storage });
    assert.equal(app.store.getState().auth.user, null);
    assert.equal(app.events.length, writes, "local invalidation does not publish or adopt identity");
  });
}
