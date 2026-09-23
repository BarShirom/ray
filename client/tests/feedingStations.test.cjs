// Run with: node --test tests/feedingStations.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8").replace(
    "import.meta.env.VITE_API_URL", JSON.stringify("http://fixture.invalid")
  ).replace("import.meta.env.MODE", JSON.stringify("development"));
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
const { uploadMedia } = require("../src/api/upload.ts");
const { setAuth, logout } = require("../src/features/auth/authSlice.ts");
const { createFeedingStation, fetchFeedingStations } = require("../src/features/feedingStations/feedingStationsThunks.ts");
const { validateStationCreation } = require("../src/features/feedingStations/validateStationCreation.ts");
const axios = require("axios");
const payload = { name: "  Garden Cats  ", location: { lat: 32, lng: 34 }, estimatedCats: 0, estimatedKittens: 0 };
const station = { ...payload, name: "Garden Cats", _id: "station-new", createdBy: "user-one", active: true, createdAt: "2026-09-20T12:00:00Z", updatedAt: "2026-09-20T12:00:00Z" };
const oldStation = { ...station, _id: "station-old", createdAt: "2026-09-19T12:00:00Z" };
const state = () => store.getState().feedingStations;
const response = (config, data) => ({ config, data, status: 200, statusText: "OK", headers: {} });

test("station creation flow", async (t) => {
  t.after(() => persistor.pause());
  if (!persistor.getState().bootstrapped) await new Promise((resolve) => {
    const unsubscribe = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
    });
  });
  await t.test("guest cannot send a creation request", async () => {
    store.dispatch(logout());
    let requests = 0;
    http.defaults.adapter = async (config) => { requests++; return response(config, station); };
    const result = await store.dispatch(createFeedingStation(payload));
    assert.match(result.payload, /log in/);
    assert.equal(requests, 0);
    assert.equal(state().creating, false);
  });
  store.dispatch(setAuth({ id: "user-one", firstName: "Test", lastName: "User", email: "test@example.com", token: "current-token" }));
  for (const [label, changes] of [
    ["blank name", { name: "  " }],
    ["missing location", { location: undefined }],
    ["non-finite location", { location: { lat: Infinity, lng: 34 } }],
    ["negative cats", { estimatedCats: -1 }],
    ["fractional kittens", { estimatedKittens: 1.5 }],
    ["empty count", { estimatedCats: NaN }],
    ["local image path", { image: "C:/photos/cat.jpg" }],
  ]) {
    await t.test(`${label} is blocked before POST`, async () => {
      const data = { ...payload, ...changes };
      assert.ok(validateStationCreation(data));
      let requests = 0;
      http.defaults.adapter = async (config) => { requests++; return response(config, station); };
      assert.equal((await store.dispatch(createFeedingStation(data))).type, createFeedingStation.rejected.type);
      assert.equal(requests, 0);
    });
  }
  let finishFetch, finishCreate, pendingFetch, pendingCreate, postRequests = 0;
  http.defaults.adapter = (config) => {
    assert.equal(config.url, "/api/feeding-stations");
    if (config.method === "get") return new Promise((resolve) => { finishFetch = () => resolve(response(config, [oldStation])); });
    postRequests++;
    assert.equal(config.headers.get("Authorization"), "Bearer current-token");
    assert.deepEqual(JSON.parse(config.data), { ...payload, name: "Garden Cats" });
    return new Promise((resolve) => { finishCreate = () => resolve(response(config, station)); });
  };
  await t.test("authenticated POST allowlists fields and uses current token", () => {
    pendingFetch = store.dispatch(fetchFeedingStations());
    pendingCreate = store.dispatch(createFeedingStation({ ...payload, createdBy: "forged", active: false }));
    assert.equal(state().loading, true);
    assert.equal(state().creating, true);
  });
  await t.test("duplicate submission is suppressed", async () => {
    const duplicate = await store.dispatch(createFeedingStation(payload));
    assert.equal(duplicate.meta.condition, true);
    assert.equal(postRequests, 1);
    assert.equal(state().creating, true);
  });
  await t.test("success immediately inserts the station without a refetch", async () => {
    finishCreate();
    await pendingCreate;
    assert.deepEqual(state().data, [station]);
    assert.equal(state().creating, false);
    assert.equal(state().loading, true);
  });
  await t.test("late fetch preserves newly created station in newest-first order", async () => {
    finishFetch();
    await pendingFetch;
    assert.deepEqual(state().data, [station, oldStation]);
  });
  await t.test("fresh fetch still replaces the server list", async () => {
    http.defaults.adapter = async (config) => response(config, [station]);
    await store.dispatch(fetchFeedingStations());
    assert.deepEqual(state().data, [station]);
  });
  await t.test("backend validation error is useful and does not change fetch error", async () => {
    http.defaults.adapter = async (config) => { throw new axios.AxiosError("Bad request", "ERR_BAD_REQUEST", config, null, {
      ...response(config, { message: "Validation failed", errors: [{ field: "name", message: "Name is required" }] }), status: 400,
    }); };
    await store.dispatch(createFeedingStation(payload));
    assert.equal(state().createError, "name: Name is required");
    assert.equal(state().error, null);
    assert.equal(state().creating, false);
  });
  await t.test("existing upload helper supplies a URL for station creation", async () => {
    const imageUrl = "https://example.com/uploaded-cat.png";
    const file = new File(["fixture"], "cat.png", { type: "image/png" });
    t.mock.method(axios, "post", async (url, form) => {
      assert.equal(url, "http://fixture.invalid/api/upload/media");
      assert.equal(form.get("media").name, "cat.png");
      return { data: { items: [{ url: imageUrl, public_id: "fixture" }] } };
    });
    const [image] = await uploadMedia([file]);
    http.defaults.adapter = async (config) => {
      assert.equal(JSON.parse(config.data).image, imageUrl);
      return response(config, { ...station, image });
    };
    await store.dispatch(createFeedingStation({ ...payload, image }));
    assert.equal(state().data.length, 1);
    assert.equal(state().data[0].image, imageUrl);
    assert.equal(state().createError, null);
  });
  await t.test("station data and creation state are not persisted", async () => {
    await persistor.flush();
    assert.deepEqual(Object.keys(JSON.parse(storage.get("persist:root"))).sort(), ["_persist", "auth"]);
  });
});
