const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

// Synthetic adapters and captured real component callbacks; this is not browser
// mounting, a screen-reader check or evidence of actual API/network behavior.
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

const React = require("react");
let activeStore;
const reduxFile = require.resolve("react-redux");
const redux = require(reduxFile);
require.cache[reduxFile].exports = { ...redux, useStore: () => activeStore };
const { configureStore } = require("@reduxjs/toolkit");
const { AxiosError, AxiosHeaders } = require("axios");
const { http } = require("../src/api/http.ts");
const { retryAfterSeconds } = require("../src/api/retryAfter.ts");
const { t } = require("../src/i18n/index.ts");
const { localizeError } = require("../src/i18n/errors.ts");
const hooks = require("../src/app/hooks.ts");
const media = require("../src/components/media/Media.tsx");
const authReducer = require("../src/features/auth/authSlice.ts").default;
const { setAuth } = require("../src/features/auth/authSlice.ts");
const reportsReducer = require("../src/features/reports/reportsSlice.ts").default;
const { claimReport, resolveReport, fetchReports } = require("../src/features/reports/reportsThunks.ts");
const stationsReducer = require("../src/features/feedingStations/feedingStationsSlice.ts").default;
const logsReducer = require("../src/features/feedingLogs/feedingLogsSlice.ts").default;

let navigate = () => assert.fail("Unexpected navigation in rejection fixture");
const routerFile = require.resolve("react-router-dom");
const router = require(routerFile);
require.cache[routerFile].exports = { ...router, useNavigate: () => navigate };
// The real Report owns draft state and submission. Its map child is not rendered
// by this callback fixture, so importing Leaflet/browser globals is unnecessary.
const reportFormFile = require.resolve("../src/components/reportForm/ReportForm.tsx");
require.cache[reportFormFile] = { id: reportFormFile, filename: reportFormFile, loaded: true, exports: { __esModule: true, default: function SyntheticReportForm() {} } };
const Login = require("../src/pages/login/Login.tsx").default;
const Register = require("../src/pages/register/Register.tsx").default;
const Report = require("../src/pages/report/Report.tsx").default;
const CreateStation = require("../src/components/createFeedingStation/CreateFeedingStation.tsx").default;
const StationDetails = require("../src/components/feedingStationDetails/FeedingStationDetails.tsx").default;

const user = { id: "synthetic-user", token: "synthetic-token", firstName: "Synthetic", lastName: "Carer", email: "carer@example.invalid" };
const location = { lat: 32.1, lng: 34.8 };
const makeStore = (authenticated = true) => {
  const store = configureStore({ reducer: { auth: authReducer, reports: reportsReducer, feedingStations: stationsReducer, feedingLogs: logsReducer } });
  if (authenticated) store.dispatch(setAuth(user));
  return store;
};
const denied = (config, seconds = "60") => new AxiosError("Synthetic rejected request", "ERR_BAD_REQUEST", config, null, {
  status: 429, statusText: "Too Many Requests", config, headers: new AxiosHeaders({ "Retry-After": seconds }),
  // A 429 must win even when response text/fields could otherwise imply membership.
  data: { msg: "User already exists", errors: [{ field: "password", message: "Password is required" }] },
});
const expectedWait = seconds => t("errors.rateLimitedWait", { count: seconds });
const settle = () => new Promise(resolve => setImmediate(resolve));

// Response ordering is explicit; ERR_NETWORK is an injected adapter failure,
// not a native offline event or an actual disconnected request.
function controlledResponses() {
  const requests = [], waiting = [];
  return {
    requests,
    waitFor: count => requests.length >= count ? Promise.resolve() : new Promise(resolve => waiting.push({ count, resolve })),
    respond: config => new Promise((resolve, reject) => {
      requests.push({
        config,
        failNetwork: () => reject(new AxiosError("Synthetic connection unavailable", "ERR_NETWORK", config)),
        succeed: data => resolve({ config, data, headers: new AxiosHeaders(), status: 200, statusText: "Synthetic" }),
      });
      for (const waiter of waiting) if (requests.length >= waiter.count) waiter.resolve();
    }),
  };
}

function callbackFixture(context, store, Component, props = {}, respond = config => { throw denied(config); }) {
  const cells = [];
  let cursor = 0;
  const cell = init => {
    const index = cursor++;
    if (!(index in cells)) cells[index] = init();
    return index;
  };
  context.mock.method(React, "useState", initial => {
    const index = cell(() => typeof initial === "function" ? initial() : initial);
    return [cells[index], value => { cells[index] = typeof value === "function" ? value(cells[index]) : value; }];
  });
  context.mock.method(React, "useRef", initial => cells[cell(() => ({ current: initial }))]);
  context.mock.method(React, "useEffect", () => {});
  context.mock.method(React, "useCallback", callback => callback);
  context.mock.method(hooks, "useAppDispatch", () => store.dispatch);
  context.mock.method(hooks, "useAppSelector", selector => selector(store.getState()));
  context.mock.method(media, "useMediaCapability", () => true);
  context.mock.method(global, "fetch", () => assert.fail("No external requests in callback fixture"));
  const previousAdapter = http.defaults.adapter;
  const calls = [];
  http.defaults.adapter = async config => { calls.push(config); return respond(config); };
  context.after(() => { http.defaults.adapter = previousAdapter; });
  const navigations = [];
  navigate = path => navigations.push(path);
  const render = () => {
    activeStore = store;
    cursor = 0;
    let element = Component(props);
    // Execute keyed session-boundary wrappers in this captured-callback fixture.
    while (typeof element?.type === "function") element = element.type(element.props);
    return element;
  };
  return { render, calls, navigations };
}
function find(element, predicate) {
  if (element === null || element === undefined || typeof element !== "object") return;
  if (Array.isArray(element)) {
    for (const child of element) { const found = find(child, predicate); if (found) return found; }
    return;
  }
  if (predicate(element)) return element;
  return find(element.props?.children, predicate);
}
const input = (tree, id) => {
  const found = find(tree, element => element.props?.id === id);
  assert.ok(found, `Missing fixture control: ${id}`);
  return found;
};
const form = tree => find(tree, element => element.type === "form");
const change = (fixture, id, value) => input(fixture.render(), id).props.onChange({ target: { value, name: id } });
function assertAlert(tree, text) {
  assert.ok(find(tree, element => element.props?.role === "alert" && element.props.children === text), "Expected Hebrew feedback with alert semantics");
}

test("Retry-After accepts bounded integer seconds across fetch/Axios headers and ignores unsafe metadata", () => {
  for (const seconds of ["1", "2", "60", "86400"]) {
    for (const headers of [new Headers({ "Retry-After": seconds }), new AxiosHeaders({ "Retry-After": seconds }), { "retry-after": seconds }, { "Retry-After": seconds }]) {
      assert.equal(retryAfterSeconds(headers), Number(seconds));
    }
  }
  for (const value of [undefined, null, 60, [], "", "0", "-1", "1.5", "1e3", "86401", "9".repeat(1_000), "Wed, 21 Oct 2030 07:28:00 GMT", "synthetic-private-marker"]) {
    assert.equal(retryAfterSeconds({ "retry-after": value }), undefined);
  }
});

test("429 feedback is Hebrew, independent of account/field text, bounded and stable through thunk remapping", () => {
  for (const context of ["generic", "login", "register", "station", "feeding", "report", "upload"]) {
    const error = denied({});
    const text = localizeError(error, context);
    assert.equal(text, expectedWait(60));
    assert.match(text, /[\u0590-\u05FF]/);
    assert.equal(localizeError({ message: text }, context), text);
    assert.doesNotMatch(text, /password|User already exists|synthetic|Invalid/i);
    assert.equal(localizeError({ status: 429, data: { message: "Invalid email or password" } }, context), t("errors.rateLimited"));
  }
  for (const seconds of [1, 2, 60, 86400]) {
    const text = localizeError({ response: { status: 429, headers: { "retry-after": String(seconds) } } });
    assert.equal(text, expectedWait(seconds));
    assert.ok(text.length < 200);
    assert.equal(text.includes("{{"), false);
  }
  assert.equal(localizeError({ response: { status: 429, headers: { "retry-after": "synthetic-private-marker" } } }), t("errors.rateLimited"));
});

test("real login and registration callbacks retain drafts and make one attempt after a 429", async context => {
  for (const [name, Component] of [["login", Login], ["registration", Register]]) {
    await context.test(name, async sub => {
      const store = makeStore(false);
      const fixture = callbackFixture(sub, store, Component);
      const draft = { firstName: "דנה Anna", lastName: "Иванова", email: "synthetic@example.invalid", password: "synthetic-password-only", company: "ארגון Example" };
      const ids = Component === Login ? ["email", "password"] : Object.keys(draft);
      for (const id of ids) change(fixture, id, draft[id]);
      await form(fixture.render()).props.onSubmit({ preventDefault() {} });
      await settle();
      const tree = fixture.render();
      for (const id of ids) assert.equal(input(tree, id).props.value === draft[id], true, `${id} draft retained`);
      assertAlert(tree, expectedWait(60));
      assert.equal(fixture.calls.length, 1);
      assert.equal(store.getState().auth.loading, false);
      assert.equal(store.getState().auth.user, null);
      assert.equal(store.getState().auth.error, expectedWait(60));
      assert.deepEqual(fixture.navigations, []);
      fixture.render();
      await settle();
      assert.equal(fixture.calls.length, 1, "rerender does not retry authentication");
    });
  }
});

test("real report callback preserves mixed text, location and type after throttled creation", async context => {
  const store = makeStore(false);
  const fixture = callbackFixture(context, store, Report);
  const reportForm = () => find(fixture.render(), element => typeof element.props?.setDescription === "function");
  const description = "תיאור חתול (Cat) Кот 42";
  reportForm().props.setDescription(description);
  reportForm().props.setLocation(location);
  reportForm().props.setType("emergency");
  reportForm().props.handleSubmit({ preventDefault() {} });
  await settle();
  const retained = reportForm().props;
  assert.equal(retained.description, description);
  assert.deepEqual(retained.location, location);
  assert.equal(retained.type, "emergency");
  assert.deepEqual(retained.mediaFiles, []);
  assert.equal(retained.pending, false);
  assertAlert(fixture.render(), expectedWait(60));
  assert.equal(fixture.calls.length, 1);
  assert.equal(store.getState().reports.items.length, 0);
  assert.deepEqual(fixture.navigations, []);
  await settle();
  assert.equal(fixture.calls.length, 1);
});

test("real station callback keeps fields and location without closing or claiming creation on 429", async context => {
  const store = makeStore();
  let created = 0;
  let cancelled = 0;
  const fixture = callbackFixture(context, store, CreateStation, { open: true, location, onCreated() { created++; }, onCancel() { cancelled++; }, onChangeLocation() {} });
  const draft = { "station-name": "תחנה Cat Кот", "station-cats": "12", "station-kittens": "2", "station-notes": "מים ומזון — notes 42" };
  for (const [id, value] of Object.entries(draft)) change(fixture, id, value);
  await form(fixture.render()).props.onSubmit({ preventDefault() {} });
  const tree = fixture.render();
  for (const [id, value] of Object.entries(draft)) assert.equal(input(tree, id).props.value, value);
  assert.deepEqual(JSON.parse(fixture.calls[0].data).location, location);
  assertAlert(tree, expectedWait(60));
  assert.equal(store.getState().feedingStations.creating, false);
  assert.equal(store.getState().feedingStations.data.length, 0);
  assert.equal(fixture.calls.length, 1);
  assert.equal(created, 0);
  assert.equal(cancelled, 0);
  await settle();
  assert.equal(fixture.calls.length, 1);
});

test("real feeding-log callback retains open draft and food/water choices after 429", async context => {
  const store = makeStore();
  const station = { _id: "111111111111111111111111", name: "תחנה", active: true, permissions: { canManage: true, canFeed: true }, estimatedCats: 1, estimatedKittens: 0, location };
  const fixture = callbackFixture(context, store, StationDetails, { station, onClose() { assert.fail("Rejected log must not close details"); } });
  const open = find(fixture.render(), element => element.type === "button" && element.props.children === t("feeding.fedHere"));
  assert.ok(open);
  open.props.onClick();
  change(fixture, "feeding-note", "רק מים — water only Кот 42");
  change(fixture, "feeding-period", "evening");
  const checkboxes = [];
  const collect = element => { if (element.type === "input" && element.props.type === "checkbox") checkboxes.push(element); return false; };
  find(fixture.render(), collect);
  checkboxes[0].props.onChange({ target: { checked: false } });
  checkboxes[1].props.onChange({ target: { checked: true } });
  await form(fixture.render()).props.onSubmit({ preventDefault() {} });
  const tree = fixture.render();
  assert.equal(input(tree, "feeding-note").props.value, "רק מים — water only Кот 42");
  assert.equal(input(tree, "feeding-period").props.value, "evening");
  const payload = JSON.parse(fixture.calls[0].data);
  assert.equal(payload.food, false);
  assert.equal(payload.water, true);
  const retainedChoices = [];
  find(tree, element => { if (element.type === "input" && element.props.type === "checkbox") retainedChoices.push(element.props.checked); return false; });
  assert.deepEqual(retainedChoices, [false, true]);
  assertAlert(tree, expectedWait(60));
  assert.ok(form(tree), "draft remains open after rejected save");
  const logs = store.getState().feedingLogs.byStationId[station._id];
  assert.equal(logs.submitting, false);
  assert.deepEqual(logs.data, []);
  assert.equal(fixture.calls.length, 1);
  await settle();
  assert.equal(fixture.calls.length, 1);
});

test("mock UI callbacks: login retains a network-failed draft and succeeds only after explicit retry", async context => {
  const store = makeStore(false), responses = controlledResponses();
  const fixture = callbackFixture(context, store, Login, {}, responses.respond);
  const draft = { email: "network-recovery@example.invalid", password: "סיסמה Cat Кот 42" };
  for (const [id, value] of Object.entries(draft)) change(fixture, id, value);
  const failed = form(fixture.render()).props.onSubmit({ preventDefault() {} });
  await responses.waitFor(1);
  responses.requests[0].failNetwork();
  await failed;
  const retained = fixture.render();
  for (const [id, value] of Object.entries(draft)) assert.equal(input(retained, id).props.value, value);
  assertAlert(retained, t("errors.network"));
  assert.equal(store.getState().auth.user, null);
  assert.equal(store.getState().auth.loading, false);
  assert.deepEqual(fixture.navigations, []);
  fixture.render();
  await settle();
  assert.equal(fixture.calls.length, 1, "rendering and settling cannot retry the rejected login");

  const retried = form(fixture.render()).props.onSubmit({ preventDefault() {} });
  await responses.waitFor(2);
  assert.equal(fixture.calls.length, 2, "one failed login plus one explicit retry");
  for (const config of fixture.calls) {
    assert.equal(config.method, "post");
    assert.equal(config.url, "/api/auth/login");
    assert.equal(config.headers.get("Authorization"), undefined);
    assert.deepEqual(JSON.parse(config.data), draft);
  }
  const { token, ...profile } = user;
  responses.requests[1].succeed({ token, user: profile });
  await retried;
  assert.equal(store.getState().auth.user.id, user.id);
  assert.equal(store.getState().auth.error, null);
  assert.deepEqual(fixture.navigations, ["/map-page"]);
  assert.equal(find(fixture.render(), element => element.props?.role === "alert"), undefined);
  await settle();
  assert.equal(fixture.calls.length, 2);
});

test("mock UI callbacks: report preserves mixed-language fields after network failure and explicitly retries once", async context => {
  const store = makeStore(), responses = controlledResponses();
  const fixture = callbackFixture(context, store, Report, {}, responses.respond);
  const reportForm = () => find(fixture.render(), element => typeof element.props?.setDescription === "function");
  const description = "חתול זקוק לעזרה — Cat Кот 42";
  reportForm().props.setDescription(description);
  reportForm().props.setLocation(location);
  reportForm().props.setType("emergency");
  reportForm().props.handleSubmit({ preventDefault() {} });
  await responses.waitFor(1);
  responses.requests[0].failNetwork();
  // Report's native callback intentionally returns void; drain its thunk/unwrap
  // completion, without timers, after explicitly releasing the response.
  await settle();
  const retained = reportForm().props;
  assert.equal(retained.description, description);
  assert.deepEqual(retained.location, location);
  assert.equal(retained.type, "emergency");
  assert.deepEqual(retained.mediaFiles, []);
  assert.equal(retained.pending, false);
  assertAlert(fixture.render(), t("errors.network"));
  assert.deepEqual(store.getState().reports.items, []);
  assert.deepEqual(fixture.navigations, []);
  fixture.render();
  await settle();
  assert.equal(fixture.calls.length, 1, "rendering and settling cannot resubmit the retained Report");

  reportForm().props.handleSubmit({ preventDefault() {} });
  await responses.waitFor(2);
  assert.equal(fixture.calls.length, 2, "one failed Report POST plus one explicit retry");
  for (const config of fixture.calls) {
    assert.equal(config.method, "post");
    assert.equal(config.url, "/api/reports");
    assert.equal(config.headers.get("Authorization") === `Bearer ${user.token}`, true);
    assert.deepEqual(JSON.parse(config.data), { description, location, type: "emergency", mediaAssetIds: [] });
  }
  const report = { _id: "network-recovered-report", description, location, type: "emergency", status: "new",
    createdAt: "2026-11-05T10:00:00.000Z", updatedAt: "2026-11-05T10:00:00.000Z", media: [] };
  responses.requests[1].succeed(report);
  await settle();
  assert.deepEqual(store.getState().reports.items, [report]);
  assert.deepEqual(fixture.navigations, ["/map-page"]);
  assert.equal(reportForm().props.pending, false);
  assert.equal(find(fixture.render(), element => element.props?.role === "alert"), undefined);
  await settle();
  assert.equal(fixture.calls.length, 2);
});

test("mock UI callbacks: feeding preserves its network-failed choices and retries one write before bounded refreshes", async context => {
  const store = makeStore(), responses = controlledResponses();
  const station = { _id: "111111111111111111111111", name: "תחנת Cat Кот", active: true,
    permissions: { canManage: true, canFeed: true }, estimatedCats: 1, estimatedKittens: 0, location };
  const fixture = callbackFixture(context, store, StationDetails,
    { station, onClose() { assert.fail("Saving a feeding must not close station details"); } }, responses.respond);
  find(fixture.render(), element => element.type === "button" && element.props.children === t("feeding.fedHere")).props.onClick();
  const note = "רק מים — water only Кот 42";
  change(fixture, "feeding-note", note);
  change(fixture, "feeding-period", "evening");
  const choices = tree => {
    const values = [];
    find(tree, element => { if (element.type === "input" && element.props.type === "checkbox") values.push(element); return false; });
    return values;
  };
  const checkboxes = choices(fixture.render());
  checkboxes[0].props.onChange({ target: { checked: false } });
  checkboxes[1].props.onChange({ target: { checked: true } });
  const failed = form(fixture.render()).props.onSubmit({ preventDefault() {} });
  await responses.waitFor(1);
  responses.requests[0].failNetwork();
  await failed;
  const retained = fixture.render();
  assert.ok(form(retained), "failed save keeps the draft open");
  assert.equal(input(retained, "feeding-note").props.value, note);
  assert.equal(input(retained, "feeding-period").props.value, "evening");
  assert.deepEqual(choices(retained).map(element => element.props.checked), [false, true]);
  assertAlert(retained, t("errors.network"));
  assert.equal(store.getState().feedingLogs.byStationId[station._id].submitError.kind, "network");
  assert.deepEqual(store.getState().feedingLogs.byStationId[station._id].data, []);
  fixture.render();
  await settle();
  assert.equal(fixture.calls.length, 1, "failed write does not retry or refresh history/summary");

  const retried = form(fixture.render()).props.onSubmit({ preventDefault() {} });
  await responses.waitFor(2);
  assert.equal(fixture.calls.length, 2, "one failed feeding POST plus one explicit retry");
  const payload = { period: "evening", food: false, water: true, note };
  for (const config of fixture.calls) {
    assert.equal(config.method, "post");
    assert.equal(config.url, `/api/feeding-stations/${station._id}/feedings`);
    assert.equal(config.headers.get("Authorization") === `Bearer ${user.token}`, true);
    assert.deepEqual(JSON.parse(config.data), payload);
  }
  const instant = "2026-11-05T10:00:00.000Z";
  const receipt = { _id: "222222222222222222222222", stationId: station._id, ...payload,
    fedAt: instant, createdAt: instant, updatedAt: instant };
  responses.requests[1].succeed(receipt);
  await responses.waitFor(4);
  assert.deepEqual(responses.requests.slice(2).map(request => request.config.url).sort(),
    [`/api/feeding-stations/${station._id}/feeding-summary`, `/api/feeding-stations/${station._id}/feedings`].sort());
  for (const request of responses.requests.slice(2)) {
    assert.equal(request.config.method, "get");
    assert.equal(request.config.headers.get("Authorization") === `Bearer ${user.token}`, true);
    request.succeed(request.config.url.endsWith("/feeding-summary")
      ? { food: { recency: "no-record" }, water: { recency: "under-2h" } } : [receipt]);
  }
  await retried;
  await settle();
  const recovered = fixture.render(), logs = store.getState().feedingLogs.byStationId[station._id];
  assert.equal(form(recovered), undefined, "successful receipt closes the draft form");
  assert.ok(find(recovered, element => element.props?.role === "status" && element.props.children === t("feeding.recorded")));
  assert.deepEqual(logs.data, [receipt]);
  assert.equal(logs.submitError, null);
  assert.equal(logs.submitting, false);
  assert.equal(logs.loading, false);
  assert.equal(logs.summaryLoading, false);
  assert.equal(find(recovered, element => element.props?.role === "alert"), undefined);
  fixture.render();
  await settle();
  assert.equal(fixture.calls.filter(config => config.method === "post").length, 2);
  assert.equal(fixture.calls.length, 4, "only the two expected successful-write refreshes follow the manual retry");
});

test("throttled claim/resolve do not mutate report status, clear auth or retry automatically", async context => {
  const store = makeStore();
  const previousAdapter = http.defaults.adapter;
  context.after(() => { http.defaults.adapter = previousAdapter; });
  const report = { _id: "synthetic-report", description: "חתול", type: "general", status: "new", location, createdAt: "2026-10-26T09:00:00Z", updatedAt: "2026-10-26T09:00:00Z", media: [] };
  let calls = 0;
  const seed = async row => {
    http.defaults.adapter = async config => ({ status: 200, statusText: "OK", headers: {}, config, data: [row] });
    await store.dispatch(fetchReports()).unwrap();
    http.defaults.adapter = async config => { calls++; throw denied(config, "2"); };
  };
  await seed(report);
  const claim = await store.dispatch(claimReport({ reportId: report._id }));
  assert.equal(claim.payload.message, expectedWait(2));
  assert.equal(claim.payload.status, 429);
  assert.equal(claim.payload.retryAfter, 2);
  assert.equal(store.getState().reports.items[0].status, "new");
  await seed({ ...report, status: "in-progress", assignedTo: user.id });
  const resolve = await store.dispatch(resolveReport({ reportId: report._id }));
  assert.equal(resolve.payload.message, expectedWait(2));
  assert.equal(resolve.payload.kind, "rate-limit");
  assert.equal(store.getState().reports.items[0].status, "in-progress");
  assert.equal(store.getState().auth.user.id, user.id);
  await settle();
  assert.equal(calls, 2);
});

test("report's real upload rejection callback keeps selected file and draft without submitting or retrying", async context => {
  const store = makeStore();
  const fixture = callbackFixture(context, store, Report);
  let requests = 0;
  context.mock.method(global, "fetch", async () => {
    requests++;
    return new Response(JSON.stringify({ message: "Too many requests. Please try again later." }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "2" } });
  });
  const reportForm = () => find(fixture.render(), element => typeof element.props?.setDescription === "function");
  const selected = new File(["synthetic image bytes"], "תמונה Cat Кот.png", { type: "image/png" });
  reportForm().props.setDescription("תיאור שמור — retained draft");
  reportForm().props.setLocation(location);
  reportForm().props.setMediaFiles([selected]);
  reportForm().props.handleSubmit({ preventDefault() {} });
  for (let attempt = 0; attempt < 20 && (requests === 0 || reportForm().props.pending); attempt++) await settle();
  assert.equal(reportForm().props.pending, false);
  assert.equal(reportForm().props.description, "תיאור שמור — retained draft");
  assert.deepEqual(reportForm().props.location, location);
  assert.equal(reportForm().props.mediaFiles[0] === selected, true);
  assertAlert(fixture.render(), expectedWait(2));
  assert.equal(fixture.calls.length, 0, "parent report is not submitted after rejected intent");
  assert.equal(requests, 1, "no automatic intent retry");
  assert.deepEqual(fixture.navigations, []);
});
