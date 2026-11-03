const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (module, file) => {
  const source = fs.readFileSync(file, "utf8").replaceAll("import.meta.env.VITE_API_URL", JSON.stringify("http://fixture.invalid"));
  module._compile(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText, file);
};
const { toApiFailure, apiFailure, isApiFailure } = require("../src/api/errors.ts");
const { http } = require("../src/api/http.ts");
const { t } = require("../src/i18n/index.ts");
const scope = { context: "station", sessionId: "synthetic-session", requestId: "synthetic-request" };

test("typed failures retain bounded status/retry/identity without server bodies or credential text", () => {
  for (const [status, kind] of [[401, "authentication"], [404, "not-found"], [429, "rate-limit"], [400, "validation"], [500, "server"]]) {
    const failure = toApiFailure({ response: { status, headers: { "Retry-After": "60" },
      data: { message: "SYNTHETIC_PRIVATE_TOKEN https://private.invalid/capability?signature=secret",
        errors: [{ field: "password", message: "Password is required" }] } } }, scope);
    assert.equal(failure.status, status);
    assert.equal(failure.source, "http");
    assert.equal(failure.kind, kind);
    assert.equal(failure.sessionId, scope.sessionId);
    assert.equal(failure.requestId, scope.requestId);
    assert.doesNotMatch(JSON.stringify(failure), /SYNTHETIC_PRIVATE|private.invalid|signature=secret/);
    if (status === 429) {
      assert.equal(failure.retryAfter, 60);
      assert.equal(failure.message, t("errors.rateLimitedWait", { count: 60 }));
      assert.equal(failure.fields, undefined, "throttling does not imply a validation or membership result");
    }
  }
  for (const value of ["86401", "-1", "0", "999999999", "Wed, 21 Oct 2030 07:28:00 GMT"]) {
    assert.equal(toApiFailure({ response: { status: 429, headers: { "Retry-After": value } } }, scope).retryAfter, undefined);
  }
});

test("network, cancellation and stale completions remain distinguishable without message-based policy", () => {
  assert.equal(toApiFailure({ code: "ERR_NETWORK" }, scope).kind, "network");
  assert.equal(toApiFailure({ name: "AbortError" }, scope).kind, "cancelled");
  const stale = apiFailure("stale", scope, "station");
  assert.equal(stale.kind, "stale");
  assert.equal(stale.status, undefined);
  assert.equal(stale.source, "client");
  assert.equal(isApiFailure(stale), true);
  assert.equal(isApiFailure("יש להתחבר מחדש"), false);
  const fieldFailure = toApiFailure({ response: { status: 400, data: { errors: Array.from({ length: 100 }, () =>
    ({ field: "name", message: "SYNTHETIC_INTERNAL_DETAIL" })) } } }, scope);
  assert.equal(fieldFailure.fields.length, 10);
  assert.doesNotMatch(JSON.stringify(fieldFailure), /SYNTHETIC_INTERNAL_DETAIL/);
  assert.ok(fieldFailure.message.length <= 2048);
});

test("Bearer cannot be sent by Axios to absolute or protocol-relative external URLs", async t => {
  const original = http.defaults.adapter;
  t.after(() => { http.defaults.adapter = original; });
  let calls = 0;
  http.defaults.adapter = async config => { calls++; return { status: 200, statusText: "OK", headers: {}, config, data: {} }; };
  for (const url of ["https://external.invalid/api/feeding-stations", "//external.invalid/private", "http://fixture.invalid@external.invalid/private"]) {
    await assert.rejects(http.get(url, { headers: { Authorization: "Bearer synthetic-token" } }));
  }
  assert.equal(calls, 0);
  await http.get("/api/feeding-stations", { headers: { Authorization: "Bearer synthetic-token" } });
  assert.equal(calls, 1);
});
