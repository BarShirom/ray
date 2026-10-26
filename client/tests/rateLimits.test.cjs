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

function callbackFixture(context, store, Component, props = {}) {
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
  http.defaults.adapter = async config => { calls.push(config); throw denied(config); };
  context.after(() => { http.defaults.adapter = previousAdapter; });
  const navigations = [];
  navigate = path => navigations.push(path);
  const render = () => { cursor = 0; return Component(props); };
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
  assert.ok(find(tree, element => element.props?.role === "alert" && element.props.children === text), "Expected an accessible Hebrew rate-limit alert");
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
  const station = { _id: "synthetic-station", name: "תחנה", active: true, estimatedCats: 1, estimatedKittens: 0, location };
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
  assert.equal(claim.error.message, expectedWait(2));
  assert.equal(store.getState().reports.items[0].status, "new");
  await seed({ ...report, status: "in-progress", assignedTo: user.id });
  const resolve = await store.dispatch(resolveReport({ reportId: report._id }));
  assert.equal(resolve.error.message, expectedWait(2));
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
