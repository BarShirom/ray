const assert = require("node:assert/strict");
const test = require("node:test");
const { store, persistor, http, logout, AxiosError, id, authenticate, response, denied, controlledRequest, ready, station, log, summary } = require("./stationDataHarness.cjs");
const { fetchFeedingLogsForStation, fetchFeedingSummaryForStation, createFeedingLog } = require("../src/features/feedingLogs/feedingLogsThunks.ts");
const { fetchFeedingStationDetail, fetchFeedingStations } = require("../src/features/feedingStations/feedingStationsThunks.ts");
const { selectStationKnownInactive } = require("../src/features/feedingStations/feedingStationsSelectors.ts");
const { selectFeedingLogsForStation } = require("../src/features/feedingLogs/feedingLogsSelectors.ts");
const { HISTORY_PAGE_LIMIT } = require("../src/features/feedingStations/protectedStationApi.ts");
const select = (number = 1) => selectFeedingLogsForStation(store.getState(), id(number));
const settle = () => new Promise(resolve => setImmediate(resolve));

test("protected feeding summaries and author-only paginated history", async t => {
  await ready();
  t.after(() => persistor.pause());
  await t.test("guests make no summary, history or feeding HTTP requests", async () => {
    store.dispatch(logout());
    let requests = 0;
    http.defaults.adapter = async config => { requests++; return response(config, []); };
    for (const task of [fetchFeedingLogsForStation(id(1)), fetchFeedingSummaryForStation(id(1)), createFeedingLog({ stationId: id(1), data: {} })]) {
      const result = await store.dispatch(task);
      assert.equal(result.payload.kind, "authentication");
      assert.equal(result.payload.status, 401);
    }
    assert.equal(requests, 0);
    assert.deepEqual(select().data, []);
  });

  await t.test("shared food/water buckets use their separate endpoint and cannot import identity/time/note fields", async () => {
    authenticate("A");
    for (const bucket of ["under-2h", "2-to-6h", "6-to-12h", "12-to-24h", "older", "no-record"]) {
      http.defaults.adapter = async config => {
        assert.equal(config.url, `/api/feeding-stations/${id(1)}/feeding-summary`);
        assert.equal(config.headers.get("Authorization"), "Bearer synthetic-token-A");
        return response(config, { ...summary(bucket), userId: "private-feeder", exactTimestamp: "private", note: "private", food: { recency: bucket, fedAt: "private" } });
      };
      await store.dispatch(fetchFeedingSummaryForStation(id(1)));
      assert.deepEqual(select().summary, summary(bucket));
      assert.deepEqual(select().data, []);
      assert.equal(JSON.stringify(select().summary).includes("private"), false);
    }
  });

  await t.test("summary loading is deduplicated and unknown buckets are an error, never empty success", async () => {
    authenticate("A");
    const request = controlledRequest();
    http.defaults.adapter = request.adapter;
    const task = store.dispatch(fetchFeedingSummaryForStation(id(1)));
    const config = await request.started;
    assert.equal(select().summaryLoading, true);
    assert.equal((await store.dispatch(fetchFeedingSummaryForStation(id(1)))).meta.condition, true);
    request.resolve(response(config, summary("invented")));
    assert.equal((await task).payload.kind, "protocol");
    assert.equal(select().summary, null);
    assert.equal(select().summaryLoading, false);
  });

  await t.test("own history sends Bearer, supports explicit cursor append and deduplicates the loaded rows", async () => {
    authenticate("A");
    const first = Array.from({ length: HISTORY_PAGE_LIMIT }, (_, index) => log(index + 1));
    let requests = 0;
    http.defaults.adapter = async config => {
      assert.equal(config.url, `/api/feeding-stations/${id(1)}/feedings`);
      assert.equal(config.headers.get("Authorization"), "Bearer synthetic-token-A");
      assert.equal(config.params.limit, HISTORY_PAGE_LIMIT);
      requests++;
      if (requests === 1) {
        assert.equal(config.params.after, undefined);
        return response(config, first, { "X-Next-Cursor": id(HISTORY_PAGE_LIMIT) });
      }
      assert.equal(config.params.after, id(HISTORY_PAGE_LIMIT));
      return response(config, [log(HISTORY_PAGE_LIMIT + 1)]);
    };
    await store.dispatch(fetchFeedingLogsForStation(id(1)));
    assert.equal(select().data.length, HISTORY_PAGE_LIMIT);
    assert.equal(select().nextCursor, id(HISTORY_PAGE_LIMIT));
    await store.dispatch(fetchFeedingLogsForStation({ stationId: id(1), append: true }));
    assert.equal(select().data.length, HISTORY_PAGE_LIMIT + 1);
    assert.equal(select().nextCursor, null);
    assert.equal(new Set(select().data.map(item => item._id)).size, select().data.length);
    assert.equal((await store.dispatch(fetchFeedingLogsForStation({ stationId: id(1), append: true }))).meta.condition, true);
    assert.equal(requests, 2);
    assert.equal(select().summary, null);
    assert.ok(select().data.every(item => !("userId" in item)));
  });

  await t.test("invalid history shape, other-parent records, old shared DTOs and repeating cursors reject", async () => {
    for (const mode of ["shape", "other-parent", "legacy-identity", "loop"]) {
      authenticate("A");
      let requests = 0;
      http.defaults.adapter = async config => {
        requests++;
        if (mode === "shape") return response(config, { items: [] });
        if (mode === "other-parent") return response(config, [log(1, 2)]);
        if (mode === "legacy-identity") return response(config, [{ ...log(), userId: "user-B" }]);
        const items = Array.from({ length: HISTORY_PAGE_LIMIT }, (_, index) => log(index + 1));
        return response(config, items, { "X-Next-Cursor": id(HISTORY_PAGE_LIMIT) });
      };
      let result = await store.dispatch(fetchFeedingLogsForStation(id(1)));
      if (mode === "loop") result = await store.dispatch(fetchFeedingLogsForStation({ stationId: id(1), append: true }));
      assert.equal(result.payload.kind, "protocol", mode);
      assert.equal(select().loading, false);
      assert.ok(requests <= 2);
    }
  });

  await t.test("timestamp ties retain server order across pages and duplicate rows keep their first position", async () => {
    authenticate("A");
    const tied = number => ({ ...log(number), fedAt: "2026-11-03T06:00:00.000Z", createdAt: "2026-11-03T06:00:00.000Z" });
    const first = Array.from({ length: HISTORY_PAGE_LIMIT }, (_, index) => tied(index + 1));
    http.defaults.adapter = async config => config.params.after
      ? response(config, [tied(2), tied(102), tied(101)])
      : response(config, first, { "X-Next-Cursor": id(HISTORY_PAGE_LIMIT) });
    await store.dispatch(fetchFeedingLogsForStation(id(1)));
    assert.deepEqual(select().data.map(item => item._id), first.map(item => item._id));
    await store.dispatch(fetchFeedingLogsForStation({ stationId: id(1), append: true }));
    assert.deepEqual(select().data.map(item => item._id), [...first.map(item => item._id), id(102), id(101)]);
    assert.equal(select().nextCursor, null);
  });

  await t.test("confirmed receipts survive failed refresh and take their server position when a later page returns them", async () => {
    authenticate("A");
    const tied = number => ({ ...log(number), fedAt: "2026-11-03T06:00:00.000Z", createdAt: "2026-11-03T06:00:00.000Z" });
    const first = Array.from({ length: HISTORY_PAGE_LIMIT }, (_, index) => tied(index + 1));
    const receipt = tied(101);
    let failRefresh = false;
    http.defaults.adapter = async config => {
      if (config.method === "post") return response(config, receipt);
      if (config.url.endsWith("feeding-summary")) return response(config, summary());
      if (failRefresh) throw new AxiosError("Offline", "ERR_NETWORK", config);
      return config.params.after ? response(config, [tied(102), receipt, tied(103), tied(2)])
        : response(config, first, { "X-Next-Cursor": id(HISTORY_PAGE_LIMIT) });
    };
    await store.dispatch(fetchFeedingLogsForStation(id(1)));
    failRefresh = true;
    await store.dispatch(createFeedingLog({ stationId: id(1), data: { food: true } }));
    await settle();
    assert.equal(select().loadError.kind, "network");
    assert.equal(select().data.some(item => item._id === receipt._id), true);
    failRefresh = false;
    await store.dispatch(fetchFeedingLogsForStation(id(1)));
    assert.equal(select().data.some(item => item._id === receipt._id), true, "an incomplete retry does not erase the confirmed receipt");
    await store.dispatch(fetchFeedingLogsForStation({ stationId: id(1), append: true }));
    assert.deepEqual(select().data.map(item => item._id), [...first.map(item => item._id), id(102), id(101), id(103)]);
    assert.equal(new Set(select().data.map(item => item._id)).size, select().data.length);
  });

  await t.test("author histories and load errors stay isolated by station", async () => {
    authenticate("A");
    http.defaults.adapter = async config => response(config, [log(1, config.url.includes(id(2)) ? 2 : 1)]);
    await store.dispatch(fetchFeedingLogsForStation(id(1)));
    await store.dispatch(fetchFeedingLogsForStation(id(2)));
    assert.equal(select(2).data[0].stationId, id(2));
    http.defaults.adapter = async config => { throw new AxiosError("Offline", "ERR_NETWORK", config); };
    const result = await store.dispatch(fetchFeedingLogsForStation(id(2)));
    assert.equal(result.payload.kind, "network");
    assert.equal(result.payload.status, undefined);
    assert.equal(select(2).loadError.kind, "network");
    assert.equal(select(2).data.length, 1);
    assert.equal(select().loadError, null);
  });

  await t.test("POST allowlists actor-free body, suppresses duplicates and refreshes both projections", async () => {
    authenticate("A");
    const create = controlledRequest(), history = controlledRequest(), shared = controlledRequest();
    http.defaults.adapter = config => config.method === "post" ? create.adapter(config)
      : config.url.endsWith("feeding-summary") ? shared.adapter(config) : history.adapter(config);
    const task = store.dispatch(createFeedingLog({ stationId: id(1), data: { food: true, water: false, note: "My note", userId: "forged", stationId: "forged" } }));
    const createConfig = await create.started;
    assert.equal(createConfig.headers.get("Authorization"), "Bearer synthetic-token-A");
    assert.deepEqual(JSON.parse(createConfig.data), { food: true, water: false, note: "My note" });
    assert.equal(select().submitting, true);
    assert.equal((await store.dispatch(createFeedingLog({ stationId: id(1), data: {} }))).meta.condition, true);
    const receipt = { ...log(23), note: "My note" };
    create.resolve(response(createConfig, receipt));
    await task;
    const historyConfig = await history.started, summaryConfig = await shared.started;
    assert.deepEqual(select().data, [receipt]);
    assert.equal(select().submitting, false);
    // Even a lagging read that omits the write must retain its successful receipt.
    history.resolve(response(historyConfig, [log(1)]));
    shared.resolve(response(summaryConfig, summary("under-2h", "older")));
    await settle();
    assert.equal(select().data.some(item => item._id === receipt._id), true);
    assert.deepEqual(select().summary, summary("under-2h", "older"));
    assert.equal(select().loading, false);
    assert.equal(select().summaryLoading, false);
  });

  await t.test("successful feeding supersedes older summary/history and old 401 cannot invalidate it", async () => {
    for (const staleFailure of [false, true]) {
      authenticate("A");
      const oldHistory = controlledRequest(), oldSummary = controlledRequest();
      let historyCalls = 0, summaryCalls = 0;
      http.defaults.adapter = config => {
        if (config.method === "post") return Promise.resolve(response(config, log(23)));
        if (config.url.endsWith("feeding-summary")) {
          if (++summaryCalls === 1) return oldSummary.adapter(config);
          return Promise.resolve(response(config, summary("under-2h", "no-record")));
        }
        if (++historyCalls === 1) return oldHistory.adapter(config);
        return Promise.resolve(response(config, [log(23)]));
      };
      const historyTask = store.dispatch(fetchFeedingLogsForStation(id(1)));
      const summaryTask = store.dispatch(fetchFeedingSummaryForStation(id(1)));
      const historyConfig = await oldHistory.started, summaryConfig = await oldSummary.started;
      await store.dispatch(createFeedingLog({ stationId: id(1), data: { food: true } }));
      await settle();
      assert.deepEqual(select().summary, summary());
      assert.deepEqual(select().data, [log(23)]);
      if (staleFailure) {
        oldHistory.reject(denied(historyConfig, 401));
        oldSummary.reject(denied(summaryConfig, 401));
      } else {
        oldHistory.resolve(response(historyConfig, [log(1)]));
        oldSummary.resolve(response(summaryConfig, summary("older", "older")));
      }
      assert.equal((await historyTask).payload.kind, "stale");
      assert.equal((await summaryTask).payload.kind, "stale");
      assert.equal(store.getState().auth.user.id, "user-A");
      assert.deepEqual(select().summary, summary());
      assert.deepEqual(select().data, [log(23)]);
    }
  });

  await t.test("A to B and B to A reject delayed summaries, histories and creates without refresh side effects", async () => {
    for (const [from, to] of [["A", "B"], ["B", "A"]]) for (const operation of ["summary", "history", "create"]) {
      authenticate(from);
      const request = controlledRequest();
      let requests = 0;
      http.defaults.adapter = config => { requests++; return request.adapter(config); };
      const task = store.dispatch(operation === "summary" ? fetchFeedingSummaryForStation(id(1))
        : operation === "history" ? fetchFeedingLogsForStation(id(1)) : createFeedingLog({ stationId: id(1), data: {} }));
      const config = await request.started;
      authenticate(to);
      request.resolve(response(config, operation === "summary" ? summary() : operation === "history" ? [log()] : log()));
      assert.equal((await task).payload.kind, "stale");
      assert.deepEqual(store.getState().feedingLogs.byStationId, {});
      assert.equal(store.getState().auth.user.id, `user-${to}`);
      assert.equal(requests, 1);
    }
  });

  await t.test("stale 401/404 after account switch cannot clear B's summary or log B out", async () => {
    for (const operation of ["summary", "history", "create"]) for (const status of [401, 404]) {
      authenticate("A");
      const request = controlledRequest();
      http.defaults.adapter = request.adapter;
      const task = store.dispatch(operation === "summary" ? fetchFeedingSummaryForStation(id(1))
        : operation === "history" ? fetchFeedingLogsForStation(id(1)) : createFeedingLog({ stationId: id(1), data: {} }));
      const config = await request.started;
      authenticate("B");
      http.defaults.adapter = async current => response(current, summary("older", "older"));
      await store.dispatch(fetchFeedingSummaryForStation(id(1)));
      request.reject(denied(config, status));
      assert.equal((await task).payload.kind, "stale");
      assert.equal(store.getState().auth.user.id, "user-B");
      assert.deepEqual(select().summary, summary("older", "older"));
      assert.equal(select().summaryError, null);
    }
  });

  await t.test("current parent 404 removes cached station, summary and personal history", async () => {
    authenticate("A");
    http.defaults.adapter = async config => response(config, config.url.endsWith("feeding-summary") ? summary()
      : config.url.endsWith("feedings") ? [log()] : [station()]);
    await store.dispatch(fetchFeedingStations());
    await store.dispatch(fetchFeedingLogsForStation(id(1)));
    await store.dispatch(fetchFeedingSummaryForStation(id(1)));
    http.defaults.adapter = async config => { throw denied(config, 404); };
    await store.dispatch(fetchFeedingSummaryForStation(id(1)));
    assert.deepEqual(store.getState().feedingStations.data, []);
    assert.deepEqual(store.getState().feedingLogs.byStationId, {});
    assert.equal(store.getState().feedingStations.authorizationRevision, 1);
  });

  await t.test("inactive rejection and 429 preserve personal history and submission drafts remain caller-owned", async () => {
    authenticate("A");
    http.defaults.adapter = async config => response(config, config.url.endsWith("feedings") ? [log()] : [station()]);
    await store.dispatch(fetchFeedingStations());
    await store.dispatch(fetchFeedingLogsForStation(id(1)));
    const draft = { food: false, water: true, note: "Keep this private note" };
    for (const status of [409, 429]) {
      http.defaults.adapter = async config => { throw denied(config, status, { "Retry-After": "120" }); };
      const result = await store.dispatch(createFeedingLog({ stationId: id(1), data: draft }));
      assert.equal(result.payload.status, status);
      assert.equal(result.payload.kind, status === 429 ? "rate-limit" : "validation");
      if (status === 429) assert.equal(result.payload.retryAfter, 120);
      assert.equal(select().submitting, false);
      assert.deepEqual(select().data, [log()]);
      assert.equal(draft.note, "Keep this private note");
      assert.equal(select().loadError, null);
      if (status === 409) {
        assert.equal(store.getState().feedingStations.data[0].active, false);
        assert.equal(store.getState().feedingStations.data[0].permissions.canFeed, false);
      }
    }
  });

  await t.test("logout clears both projections immediately and late create cannot dispatch refreshes", async () => {
    authenticate("A");
    const request = controlledRequest();
    let requests = 0;
    http.defaults.adapter = config => { requests++; return request.adapter(config); };
    const task = store.dispatch(createFeedingLog({ stationId: id(1), data: { water: true } }));
    const config = await request.started;
    store.dispatch(logout());
    assert.deepEqual(store.getState().feedingLogs.byStationId, {});
    request.resolve(response(config, { ...log(), food: false, water: true }));
    assert.equal((await task).payload.kind, "stale");
    assert.equal(requests, 1);
    assert.deepEqual(store.getState().feedingLogs.byStationId, {});
  });

  await t.test("inactive 409 prevents older active collection/detail reads from re-enabling feeding", async () => {
    authenticate("A");
    http.defaults.adapter = async config => response(config, [station()]);
    await store.dispatch(fetchFeedingStations());
    const list = controlledRequest(), detail = controlledRequest();
    http.defaults.adapter = config => {
      if (config.method === "post") return Promise.reject(denied(config, 409));
      return config.url.endsWith(id(1)) ? detail.adapter(config) : list.adapter(config);
    };
    const listTask = store.dispatch(fetchFeedingStations());
    const detailTask = store.dispatch(fetchFeedingStationDetail(id(1)));
    const listConfig = await list.started, detailConfig = await detail.started;
    await store.dispatch(createFeedingLog({ stationId: id(1), data: { food: true } }));
    assert.equal(store.getState().feedingStations.detailsById[id(1)].data.active, false);
    list.resolve(response(listConfig, [station()]));
    detail.resolve(response(detailConfig, station()));
    await listTask;
    assert.equal((await detailTask).payload.kind, "stale");
    assert.equal(store.getState().feedingStations.data[0].active, false);
    assert.equal(store.getState().feedingStations.detailsById[id(1)].data.permissions.canFeed, false);
  });

  await t.test("uncached inactive 409 invalidates the old detail and allows a genuinely fresh detail refresh", async () => {
    authenticate("A");
    const detail = controlledRequest();
    http.defaults.adapter = config => config.method === "post" ? Promise.reject(denied(config, 409)) : detail.adapter(config);
    const oldDetailTask = store.dispatch(fetchFeedingStationDetail(id(1)));
    const oldDetailConfig = await detail.started;
    await store.dispatch(createFeedingLog({ stationId: id(1), data: { food: true } }));
    let stationState = store.getState().feedingStations;
    assert.equal(stationState.detailsById[id(1)].loading, false);
    assert.equal(stationState.detailsById[id(1)].requestId, null);
    assert.equal(stationState.inactiveIds[id(1)], true);
    assert.equal(selectStationKnownInactive(store.getState(), id(1)), true);
    detail.resolve(response(oldDetailConfig, station()));
    assert.equal((await oldDetailTask).payload.kind, "stale");
    stationState = store.getState().feedingStations;
    assert.equal(stationState.detailsById[id(1)].data, null);
    assert.equal(stationState.inactiveIds[id(1)], true);
    assert.equal(selectStationKnownInactive(store.getState(), id(1)), true);
    http.defaults.adapter = async config => response(config, station());
    assert.equal((await store.dispatch(fetchFeedingStationDetail(id(1)))).type, fetchFeedingStationDetail.fulfilled.type);
    stationState = store.getState().feedingStations;
    assert.equal(stationState.detailsById[id(1)].data.permissions.canFeed, true);
    assert.equal(stationState.inactiveIds[id(1)], undefined);
    assert.equal(selectStationKnownInactive(store.getState(), id(1)), false);
  });
});
