const assert = require("node:assert/strict");
const test = require("node:test");
const { store, persistor, storage, http, logout, id, authenticate, response, denied, controlledRequest, ready, station } = require("./stationDataHarness.cjs");
const { createFeedingStation, fetchFeedingStationDetail, fetchFeedingStations } = require("../src/features/feedingStations/feedingStationsThunks.ts");
const { validateStationCreation } = require("../src/features/feedingStations/validateStationCreation.ts");
const { STATION_PAGE_LIMIT, MAX_STATION_PAGES } = require("../src/features/feedingStations/protectedStationApi.ts");
const state = () => store.getState().feedingStations;
const payload = { name: "  Garden Cats  ", location: { lat: 32, lng: 34 }, estimatedCats: 0, estimatedKittens: 0 };

test("protected station collection, detail and creation", async t => {
  await ready();
  t.after(() => persistor.pause());
  await t.test("guest reads, detail and creation perform no HTTP", async () => {
    store.dispatch(logout());
    let requests = 0;
    http.defaults.adapter = async config => { requests++; return response(config, station()); };
    for (const task of [fetchFeedingStations(), fetchFeedingStationDetail(id(1)), createFeedingStation(payload)]) {
      const result = await store.dispatch(task);
      assert.equal(result.payload.kind, "authentication");
      assert.equal(result.payload.status, 401);
    }
    assert.equal(requests, 0);
    assert.deepEqual(state().data, []);
  });

  for (const [label, changes] of [
    ["blank name", { name: "  " }], ["missing location", { location: undefined }],
    ["non-finite location", { location: { lat: Infinity, lng: 34 } }], ["negative cats", { estimatedCats: -1 }],
    ["fractional kittens", { estimatedKittens: 1.5 }], ["empty count", { estimatedCats: NaN }],
    ["local image path", { image: "C:/photos/cat.jpg" }],
  ]) await t.test(`${label} rejects before POST`, async () => {
    authenticate("A");
    const data = { ...payload, ...changes };
    assert.ok(validateStationCreation(data));
    let requests = 0;
    http.defaults.adapter = async config => { requests++; return response(config, station()); };
    assert.equal((await store.dispatch(createFeedingStation(data))).type, createFeedingStation.rejected.type);
    assert.equal(requests, 0);
  });

  await t.test("all pages carry current Bearer and retain inactive stations without fabricated fields", async () => {
    authenticate("A");
    const firstPage = Array.from({ length: STATION_PAGE_LIMIT }, (_, index) => station(index + 1));
    let requests = 0;
    http.defaults.adapter = async config => {
      assert.equal(config.headers.get("Authorization"), "Bearer synthetic-token-A");
      assert.equal(config.params.limit, STATION_PAGE_LIMIT);
      requests++;
      if (requests === 1) {
        assert.equal(config.params.after, undefined);
        return response(config, firstPage, { "X-Next-Cursor": id(STATION_PAGE_LIMIT) });
      }
      assert.equal(config.params.after, id(STATION_PAGE_LIMIT));
      return response(config, [station(STATION_PAGE_LIMIT + 1, false)]);
    };
    const result = await store.dispatch(fetchFeedingStations());
    assert.equal(result.type, fetchFeedingStations.fulfilled.type);
    assert.equal(requests, 2);
    assert.equal(state().data.length, STATION_PAGE_LIMIT + 1);
    assert.equal(state().data.at(-1).active, false);
    for (const record of state().data) for (const key of ["createdBy", "createdAt", "updatedAt", "visibility"]) assert.equal(key in record, false);
  });

  await t.test("creation allowlists fields and an older fetch cannot erase its receipt", async () => {
    authenticate("A");
    const fetch = controlledRequest(), create = controlledRequest();
    http.defaults.adapter = config => config.method === "get" ? fetch.adapter(config) : create.adapter(config);
    const fetchTask = store.dispatch(fetchFeedingStations());
    const fetchConfig = await fetch.started;
    const createTask = store.dispatch(createFeedingStation({ ...payload, createdBy: "forged", active: false, visibility: "sensitive" }));
    const createConfig = await create.started;
    assert.equal(createConfig.headers.get("Authorization"), "Bearer synthetic-token-A");
    assert.deepEqual(JSON.parse(createConfig.data), { ...payload, name: "Garden Cats" });
    assert.equal((await store.dispatch(createFeedingStation(payload))).meta.condition, true);
    assert.equal((await store.dispatch(fetchFeedingStations())).meta.condition, true);
    create.resolve(response(createConfig, { ...station(2), notes: "Synthetic note" }));
    await createTask;
    assert.equal(state().data[0]._id, id(2));
    fetch.resolve(response(fetchConfig, [station(1)]));
    await fetchTask;
    assert.deepEqual(new Set(state().data.map(item => item._id)), new Set([id(1), id(2)]));
    assert.equal(state().detailsById[id(2)].data.notes, "Synthetic note");
    http.defaults.adapter = async config => response(config, [station(1)]);
    await store.dispatch(fetchFeedingStations());
    assert.deepEqual(state().data, [station(1)]);
  });

  await t.test("private asset attachment is forwarded and detail fetch obtains image/notes", async () => {
    authenticate("A");
    const imageAssetId = "00000000-0000-4000-8000-000000000001";
    const detail = { ...station(), image: `http://fixture.invalid/api/media/${imageAssetId}/content`, notes: "Protected notes" };
    http.defaults.adapter = async config => {
      assert.equal(config.headers.get("Authorization"), "Bearer synthetic-token-A");
      if (config.method === "post") assert.equal(JSON.parse(config.data).imageAssetId, imageAssetId);
      else assert.equal(config.url, `/api/feeding-stations/${id(1)}`);
      return response(config, detail);
    };
    await store.dispatch(createFeedingStation({ ...payload, imageAssetId }));
    await store.dispatch(fetchFeedingStationDetail(id(1)));
    assert.deepEqual(state().detailsById[id(1)].data, detail);
  });

  await t.test("cursor loops, malformed arrays, duplicate IDs and old DTOs fail without publishing partial collections", async () => {
    for (const mode of ["loop", "shape", "duplicate", "old-dto", "bad-header", "wrong-anchor"]) {
      authenticate("A");
      let requests = 0;
      http.defaults.adapter = async config => {
        requests++;
        if (mode === "shape") return response(config, { items: [] });
        if (mode === "old-dto") return response(config, [{ ...station(), createdBy: "user-A", visibility: "regular" }]);
        if (mode === "duplicate") return response(config, [station(), station()]);
        if (mode === "bad-header") return response(config, [station()], { "X-Next-Cursor": "untrusted" });
        const page = Array.from({ length: STATION_PAGE_LIMIT }, (_, index) => station(index + 1));
        return response(config, page, { "X-Next-Cursor": id(mode === "wrong-anchor" ? 1 : STATION_PAGE_LIMIT) });
      };
      const result = await store.dispatch(fetchFeedingStations());
      assert.equal(result.payload.kind, "protocol", mode);
      assert.deepEqual(state().data, [], mode);
      assert.equal(state().loading, false, mode);
      assert.ok(requests <= 2, mode);
    }
  });

  await t.test("page budget exhaustion is a visible failure instead of truncated success", async () => {
    authenticate("A");
    let requests = 0;
    http.defaults.adapter = async config => {
      const start = requests++ * STATION_PAGE_LIMIT + 1;
      const page = Array.from({ length: STATION_PAGE_LIMIT }, (_, index) => station(start + index));
      return response(config, page, { "X-Next-Cursor": page.at(-1)._id });
    };
    const result = await store.dispatch(fetchFeedingStations());
    assert.equal(result.payload.kind, "protocol");
    assert.equal(requests, MAX_STATION_PAGES);
    assert.deepEqual(state().data, []);
  });

  await t.test("A to B and B to A delayed collection/detail/create cannot populate the new account", async () => {
    for (const [from, to] of [["A", "B"], ["B", "A"]]) for (const operation of ["list", "detail", "create"]) {
      authenticate(from);
      const request = controlledRequest();
      http.defaults.adapter = request.adapter;
      const task = store.dispatch(operation === "list" ? fetchFeedingStations() : operation === "detail" ? fetchFeedingStationDetail(id(1)) : createFeedingStation(payload));
      const config = await request.started;
      authenticate(to);
      request.resolve(response(config, operation === "list" ? [station()] : station()));
      const result = await task;
      assert.equal(result.payload.kind, "stale", `${from}/${operation}`);
      assert.deepEqual(state().data, []);
      assert.deepEqual(state().detailsById, {});
      assert.equal(state().error, null);
      assert.equal(state().createError, null);
      assert.equal(store.getState().auth.user.id, `user-${to}`);
    }
  });

  await t.test("stale 401/404 cannot log out B or remove B's station", async () => {
    for (const status of [401, 404]) {
      authenticate("A");
      const request = controlledRequest();
      http.defaults.adapter = request.adapter;
      const task = store.dispatch(fetchFeedingStationDetail(id(1)));
      const config = await request.started;
      authenticate("B");
      http.defaults.adapter = async current => response(current, [station()]);
      await store.dispatch(fetchFeedingStations());
      request.reject(denied(config, status));
      assert.equal((await task).payload.kind, "stale");
      assert.equal(store.getState().auth.user.id, "user-B");
      assert.deepEqual(state().data, [station()]);
      assert.equal(state().authorizationRevision, 0);
    }
  });

  await t.test("current parent 404 removes the station and blocks an older list from restoring it", async () => {
    authenticate("A");
    const request = controlledRequest();
    http.defaults.adapter = request.adapter;
    const listTask = store.dispatch(fetchFeedingStations());
    const listConfig = await request.started;
    http.defaults.adapter = async config => { throw denied(config, 404); };
    await store.dispatch(fetchFeedingStationDetail(id(1)));
    assert.equal(state().authorizationRevision, 1);
    assert.equal(state().detailsById[id(1)].error.kind, "not-found");
    request.resolve(response(listConfig, [station()]));
    await listTask;
    assert.deepEqual(state().data, []);
  });

  await t.test("429 preserves retry metadata, existing entities and independent create errors", async () => {
    authenticate("A");
    http.defaults.adapter = async config => response(config, [station()]);
    await store.dispatch(fetchFeedingStations());
    http.defaults.adapter = async config => { throw denied(config, 429, { "Retry-After": "75" }); };
    const result = await store.dispatch(createFeedingStation(payload));
    assert.equal(result.payload.kind, "rate-limit");
    assert.equal(result.payload.status, 429);
    assert.equal(result.payload.retryAfter, 75);
    assert.ok(result.payload.requestId);
    assert.equal(result.payload.sessionId, store.getState().auth.sessionId);
    assert.deepEqual(state().data, [station()]);
    assert.equal(state().error, null);
  });

  await t.test("current 401 clears the protected session; logout discards a delayed success", async () => {
    authenticate("A");
    http.defaults.adapter = async config => { throw denied(config, 401); };
    assert.equal((await store.dispatch(fetchFeedingStations())).payload.status, 401);
    assert.equal(store.getState().auth.user, null);
    assert.deepEqual(state().data, []);
    authenticate("A");
    const request = controlledRequest();
    http.defaults.adapter = request.adapter;
    const task = store.dispatch(createFeedingStation(payload));
    const config = await request.started;
    store.dispatch(logout());
    request.resolve(response(config, station()));
    assert.equal((await task).payload.kind, "stale");
    assert.deepEqual(state().data, []);
  });

  await t.test("protected collections/details and capability strings are never persisted", async () => {
    authenticate("A");
    await persistor.flush();
    assert.deepEqual(Object.keys(JSON.parse(storage.get("persist:root"))).sort(), ["_persist", "auth"]);
    assert.equal(storage.get("persist:root").includes("Protected notes"), false);
  });
});
