import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { createLegacyApp } from "../dist/app.js";
import { createPreviewApp } from "../dist/preview/app.js";

function forbidPersistence(t) {
  const unexpected = () => assert.fail("Upload rejection must not access persistence");
  t.mock.method(mongoose, "connect", unexpected);
  t.mock.method(mongoose, "createConnection", unexpected);
  t.mock.method(mongoose.Query.prototype, "exec", unexpected);
  t.mock.method(mongoose.Model.prototype, "save", unexpected);
  return {
    db: new Proxy({}, { get: unexpected }),
    pool: new Proxy({}, { get: unexpected }),
  };
}

async function listen(t, app) {
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function refused(base, { path = "/api/upload/media", method = "POST", body, headers = {} }, message) {
  const response = await fetch(base + path, { method, body, headers });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message });
}

// Reading the complete local import graph also catches provider setup at module
// import time, before a runtime upload spy could be attached.
test("actual legacy composition never imports a multipart or Cloudinary provider", async () => {
  const visited = new Set();
  async function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = await readFile(url, "utf8");
    for (const match of source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
      assert.doesNotMatch(match[1], /cloudinary|multer|uploadMiddleware|dotenv/);
      if (match[1].startsWith(".")) await visit(new URL(match[1], url));
    }
  }
  await visit(new URL("../dist/app.js", import.meta.url));
  assert.ok(visited.has(new URL("../dist/routes/uploadRoutes.js", import.meta.url).href));
});

test("legacy uploads are retired for guests and supplied bearer tokens before body parsing", async (t) => {
  forbidPersistence(t);
  t.mock.method(console, "log", () => {});
  const base = await listen(t, createLegacyApp());
  const form = new FormData();
  form.append("media", new Blob(["synthetic image bytes"], { type: "image/png" }), "synthetic.png");
  await refused(base, { body: form }, "Legacy media uploads are retired");
  // The malformed body would produce a parser error if mounted before retirement.
  for (const authorization of [undefined, "Bearer synthetic-not-a-jwt"]) {
    const response = await fetch(base + "/api/upload/media", {
      method: "POST", body: "{", headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { message: "Legacy media uploads are retired" });
  }
  await refused(base, { path: "/api/upload/other", body: "media=synthetic", headers: { "Content-Type": "application/x-www-form-urlencoded" } }, "Legacy media uploads are retired");
  await refused(base, { path: "/api/upload", method: "GET" }, "Legacy media uploads are retired");
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/api/reports/me")).status, 401);
});

test("PostgreSQL preview keeps legacy uploads unavailable with media disabled and enabled", async (t) => {
  for (const enabled of [false, true]) {
    const connection = forbidPersistence(t);
    let storageCalls = 0;
    const unexpected = async () => { storageCalls += 1; assert.fail("No storage operation permitted"); };
    const storage = enabled ? {
      signUpload: unexpected, source: unexpected, putOutput: unexpected,
      signRead: unexpected, deleteObject: unexpected,
    } : undefined;
    const base = await listen(t, createPreviewApp(connection, "synthetic-preview-secret-only", storage));
    const form = new FormData();
    form.append("media", new Blob(["synthetic"], { type: "image/png" }), "synthetic.png");
    await refused(base, { body: form }, "uploads unavailable in local preview");
    await refused(base, { body: "{", headers: { "Content-Type": "application/json" } }, "uploads unavailable in local preview");
    const capabilities = await fetch(base + "/api/media/capabilities");
    assert.deepEqual(await capabilities.json(), { enabled, maxBytes: 8388608, stationImages: 1, reportImages: 3 });
    const unauthenticated = await fetch(base + "/api/media/uploads", {
      method: "POST", body: "{}", headers: { "Content-Type": "application/json" },
    });
    assert.equal(unauthenticated.status, enabled ? 401 : 503);
    assert.equal(storageCalls, 0);
    assert.equal((await fetch(base + "/healthz")).status, 200);
  }
});
