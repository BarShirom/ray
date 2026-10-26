import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gzipSync, deflateSync, brotliCompressSync } from "node:zlib";
import express from "express";
import { requestParsers, requestErrorHandler, REQUEST_BODY_BYTES, FORM_PARAMETER_LIMIT, FORM_DEPTH_LIMIT } from "../dist/middleware/requestParsing.js";
import { createLegacyApp } from "../dist/app.js";
import { createPreviewApp } from "../dist/preview/app.js";

async function listen(t, app) {
  const listener = app.listen(0, "127.0.0.1");
  await new Promise(resolve => listener.once("listening", resolve));
  t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
  const base = `http://127.0.0.1:${listener.address().port}`;
  return async (body, type = "application/json", headers = {}, path = "/echo") => {
    const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": type, ...headers }, body, signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json() };
  };
}

function parserApp() {
  const app = express();
  app.use(requestParsers());
  app.post("/echo", (req, res) => res.json(req.body));
  app.post("/internal", () => { throw new Error("synthetic-private-detail"); });
  app.use(requestErrorHandler);
  return app;
}

test("shared parsers preserve JSON, extended forms, Unicode and supported compression", async t => {
  const post = await listen(t, parserApp());
  const value = { name: "תחנת חתולים Cat 🐈", location: { lat: "32.1", lng: "34.8" }, media: ["https://example.invalid/cat.png"] };
  assert.deepEqual(await post(JSON.stringify(value)), { status: 200, body: value });
  const form = new URLSearchParams({ name: value.name, "location[lat]": "32.1", "location[lng]": "34.8", "media[]": value.media[0] }).toString();
  assert.deepEqual(await post(form, "application/x-www-form-urlencoded"), { status: 200, body: value });
  for (const [encoding, compress] of [["gzip", gzipSync], ["deflate", deflateSync], ["br", brotliCompressSync]]) {
    for (const [type, raw] of [["application/json", JSON.stringify(value)], ["application/x-www-form-urlencoded", form]]) {
      assert.deepEqual(await post(compress(raw), type, { "Content-Encoding": encoding }), { status: 200, body: value });
    }
  }
});

test("decoded body byte boundaries apply to both formats, chunked bodies and compression", async t => {
  const post = await listen(t, parserApp());
  const jsonAtLimit = "{}" + " ".repeat(REQUEST_BODY_BYTES - 2);
  assert.equal(Buffer.byteLength(jsonAtLimit), REQUEST_BODY_BYTES);
  assert.deepEqual(await post(jsonAtLimit), { status: 200, body: {} });
  assert.equal((await post(jsonAtLimit + " ")).status, 413);
  assert.equal((await post(gzipSync(jsonAtLimit + " "), "application/json", { "Content-Encoding": "gzip" })).status, 413);
  // Raw form bytes can expand through percent-encoding; keep decoded fields small.
  const field = "%20".repeat(5450);
  let form = Array.from({ length: 32 }, (_, i) => `k${i}=${field}`).join("&");
  form += " ".repeat(REQUEST_BODY_BYTES - Buffer.byteLength(form));
  assert.equal(Buffer.byteLength(form), REQUEST_BODY_BYTES);
  assert.equal((await post(form, "application/x-www-form-urlencoded")).status, 200);
  assert.equal((await post(form + " ", "application/x-www-form-urlencoded")).status, 413);
  // Async iterable makes fetch stream without a Content-Length header.
  const response = await fetch(await new Promise(resolve => {
    const server = parserApp().listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}/echo`));
    t.after(() => new Promise(done => { server.close(done); server.closeAllConnections(); }));
  }), {
    method: "POST", headers: { "Content-Type": "application/json" }, duplex: "half",
    body: (async function* () { yield jsonAtLimit; yield " "; })(), signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 413);
});

test("form parameter and nesting limits reject early at their boundaries", async t => {
  const post = await listen(t, parserApp());
  const form = count => Array.from({ length: count }, (_, i) => `k${i}=x`).join("&");
  assert.equal((await post(form(FORM_PARAMETER_LIMIT), "application/x-www-form-urlencoded")).status, 200);
  assert.deepEqual(await post(form(FORM_PARAMETER_LIMIT + 1), "application/x-www-form-urlencoded"), { status: 413, body: { message: "Too many form fields" } });
  // The shared shape guard also counts the root container, so one nested scalar
  // below the qs ceiling is the maximum supported application structure.
  assert.equal((await post("a[b][c][d]=x", "application/x-www-form-urlencoded")).status, 200);
  assert.equal((await post(`a${"[b]".repeat(FORM_DEPTH_LIMIT + 1)}=x`, "application/x-www-form-urlencoded")).status, 400);
});

for (const mode of ["legacy", "postgres"]) {
  test(`${mode} actual app maps parser errors safely before authentication`, async t => {
    t.mock.method(console, "log", () => {});
    const unexpected = () => assert.fail("Parser rejection must precede database access");
    const connection = { db: new Proxy({}, { get: unexpected }), pool: { query: unexpected } };
    const post = await listen(t, mode === "legacy" ? createLegacyApp() : createPreviewApp(connection, "synthetic-parser-secret"));
    const logs = [];
    t.mock.method(console, "error", (...args) => logs.push(args));
    assert.deepEqual(await post('{"private-body-marker":', "application/json", {}, "/api/auth/login"), { status: 400, body: { message: "Malformed request body" } });
    for (const type of ["application/json", "application/x-www-form-urlencoded"]) {
      for (const encoding of ["gzip", "deflate", "br"]) {
        assert.equal((await post(Buffer.from("invalid compressed input"), type, { "Content-Encoding": encoding }, "/api/auth/login")).status, 400);
      }
      assert.equal((await post("{}", type, { "Content-Encoding": "unsupported" }, "/api/auth/login")).status, 415);
    }
    assert.equal((await post("{}", "application/json; charset=unsupported", {}, "/api/auth/login")).status, 415);
    assert.equal((await post("{}" + " ".repeat(REQUEST_BODY_BYTES), "application/json", {}, "/api/auth/login")).status, 413);
    assert.equal((await post("{}", "application/json", {}, "/api/feeding-stations")).status, 401);
    assert.doesNotMatch(JSON.stringify(logs), /private-body-marker|invalid compressed input/);
  });

  test(`${mode} isolated child survives the confirmed decoder failure and subsequent requests`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./helpers/parserSurvival.mjs", import.meta.url)), mode], {
      encoding: "utf8", timeout: 15000, maxBuffer: 64 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, "Isolated parser child must exit successfully");
    assert.match(result.stdout, /parser-survival-ok/);
    assert.doesNotMatch(result.stderr, /uncaught|Unhandled|Error:/);
  });
}

test("unexpected error response and logs omit internal details", async t => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const post = await listen(t, parserApp());
  assert.deepEqual(await post("{}", "application/json", {}, "/internal"), { status: 500, body: { error: "ServerError", message: "Internal Server Error" } });
  assert.deepEqual(logs, [["Request failed"]]);
});
