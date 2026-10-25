const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

// Reuse the existing lightweight TypeScript harness; all HTTP stays in a synthetic adapter.
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
const { renderToStaticMarkup } = require("react-dom/server");
const { Provider } = require("react-redux");
const { configureStore } = require("@reduxjs/toolkit");
const reportsReducer = require("../src/features/reports/reportsSlice.ts").default;
const { createReport, claimReport, resolveReport } = require("../src/features/reports/reportsThunks.ts");
const { http } = require("../src/api/http.ts");
const { AxiosError } = require("axios");
const { getReporterName } = require("../src/features/reports/getReporterName.ts");
const { getAssigneeName } = require("../src/features/reports/getAssigneeName.ts");
const { t } = require("../src/i18n/index.ts");
const ReportCard = require("../src/components/reportCard/ReportCard.tsx").default;
const names = "חתול (Cat) Кот 123";
const report = {
  _id: "synthetic-report", description: names, type: "food", status: "new",
  location: { lat: 32.0853, lng: 34.7818 }, createdAt: "2026-01-15T21:30:00Z",
  updatedAt: "2026-01-15T21:30:00Z", distanceKm: null, media: [], createdByName: names,
};
const auth = { token: "synthetic-token", id: "synthetic-user", firstName: "Synthetic", lastName: "Carer" };
const store = configureStore({ reducer: { auth: (state = { user: auth, loading: false, error: null }) => state, reports: reportsReducer } });
const response = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });

test("report workflows preserve backend enums, coordinates and mixed-language user data", async () => {
  let request;
  http.defaults.adapter = async (config) => { request = config; return response(config, report); };
  const payload = { description: names, type: "food", location: report.location, mediaAssetIds: [] };
  await store.dispatch(createReport(payload)).unwrap();
  assert.deepEqual(JSON.parse(request.data), payload);
  assert.equal(request.headers.get("Authorization"), "Bearer synthetic-token");
  assert.equal(store.getState().reports[0].description, names);

  http.defaults.adapter = async (config) => { request = config; return response(config, { ...report, status: "in-progress", assignedTo: "synthetic-user" }); };
  await store.dispatch(claimReport({ reportId: report._id })).unwrap();
  assert.equal(request.url, "/api/reports/synthetic-report/claim");
  assert.deepEqual(JSON.parse(request.data), {});
  assert.equal(store.getState().reports[0].status, "in-progress");
  http.defaults.adapter = async (config) => { request = config; return response(config, { ...report, status: "resolved" }); };
  await store.dispatch(resolveReport({ reportId: report._id })).unwrap();
  assert.equal(request.url, "/api/reports/synthetic-report/resolve");
  assert.equal(store.getState().reports[0].status, "resolved");
});

test("report cards render Hebrew labels and exact timestamps while isolating user content", () => {
  const html = renderToStaticMarkup(React.createElement(Provider, { store }, React.createElement(ReportCard, { report, onPrimary: () => {} })));
  assert.ok(html.includes(t("reports.reporter")));
  assert.ok(html.includes(t("reports.claim")));
  assert.ok(html.includes('dateTime="2026-01-15T21:30:00Z"'));
  assert.ok(html.includes('dir="auto"'));
  assert.ok(html.includes(`<bdi>${names}</bdi>`));
  assert.ok(!html.includes("Reporter:"));
  assert.ok(!html.includes("in-progress"));
});

test("claim failures retain useful Hebrew feedback and hide unknown backend details", async () => {
  http.defaults.adapter = async (config) => {
    throw new AxiosError("Request failed with status code 409", "ERR_BAD_REQUEST", config, null, {
      ...response(config, { message: "Report is already claimed or resolved" }), status: 409,
    });
  };
  const claimed = await store.dispatch(claimReport({ reportId: report._id }));
  assert.equal(claimed.error.message, t("errors.alreadyClaimed"));
  const unsafe = "SQL synthetic-secret https://signed.fixture.invalid/?signature=private";
  http.defaults.adapter = async (config) => {
    throw new AxiosError(unsafe, "ERR_BAD_RESPONSE", config, null, {
      ...response(config, { message: unsafe }), status: 500,
    });
  };
  const failed = await store.dispatch(resolveReport({ reportId: report._id }));
  assert.equal(failed.error.message, t("errors.server"));
  assert.ok(!failed.error.message.includes(unsafe));
});

test("report display-name fallbacks are localized without rewriting supplied names", () => {
  assert.equal(getReporterName(report), names);
  assert.equal(getReporterName({ ...report, createdByName: null }), t("reports.guest"));
  assert.equal(getAssigneeName({ ...report, assignedToName: names }), names);
  assert.equal(getAssigneeName(report), t("reports.unassigned"));
});

test("selected-file and assigned-report counts have natural zero, one, two and several forms", () => {
  for (const key of ["reports.selectedFiles", "reports.assignedCount", "map.stationCount"]) {
    const outputs = [0, 1, 2, 7].map((count) => t(key, { count }));
    assert.equal(new Set(outputs).size, 4);
    assert.ok(outputs.every((text) => /[א-ת]/u.test(text) && !text.includes("{{") && !text.includes(key)));
    assert.ok(outputs[3].includes("7"));
  }
});
