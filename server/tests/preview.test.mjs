import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { previewConfig } from "../dist/preview/config.js";
import { localConfig } from "../dist/db/local-config.js";
import { cleanupTestDatabase } from "./integration/database.mjs";

const url = "postgresql://ray_preview:synthetic@127.0.0.1:55434/ray_preview";
const secret = "synthetic-preview-secret-with-32-characters";
test("preview requires dedicated exact URL and distinct secret without fallbacks", () => {
  assert.equal(previewConfig({ RAY_PREVIEW_DATABASE_URL: url, RAY_PREVIEW_JWT_SECRET: secret }).secret, secret);
  for (const value of [undefined, "", url.replace("127.0.0.1", "localhost"), url.replace("127.0.0.1", "remote.invalid"), url.replace("55434", "55432"), url.replace("/ray_preview", "/ray_local"), url.replace("ray_preview:", "ray_local:"), url + "?host=remote.invalid", url + "#x", url.replace(":synthetic", ":")]) {
    assert.throws(() => localConfig("preview", value), /RAY_PREVIEW_DATABASE_URL/);
  }
  for (const env of [{ JWT_SECRET: secret, DATABASE_URL: url }, { RAY_PREVIEW_DATABASE_URL: url, JWT_SECRET: secret }, { RAY_PREVIEW_DATABASE_URL: url, RAY_PREVIEW_JWT_SECRET: "short" }, { RAY_PREVIEW_DATABASE_URL: url, RAY_PREVIEW_JWT_SECRET: secret, JWT_SECRET: secret }]) assert.throws(() => previewConfig(env));
});
test("test cleanup rejects preview and development before making any query", async () => {
  const connection = { pool: { query() { assert.fail("must refuse before query"); } } };
  await assert.rejects(cleanupTestDatabase(connection, url), /RAY_TEST_DATABASE_URL/);
  await assert.rejects(cleanupTestDatabase(connection, "postgresql://ray_local:x@127.0.0.1:55432/ray_local"), /RAY_TEST_DATABASE_URL/);
});
test("preview import graph excludes dotenv, Cloudinary, upload routes and normal startup", async () => {
  const seen = new Set();
  async function visit(url) {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const source = await readFile(url, "utf8");
    for (const match of source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
      assert.doesNotMatch(match[1], /dotenv|cloudinary|uploadRoutes|\/server\.js/);
      if (match[1].startsWith(".")) await visit(new URL(match[1], url));
    }
  }
  await visit(new URL("../dist/preview-server.js", import.meta.url));
  assert.ok(seen.size > 20);
});
test("missing preview config exits safely without reading dotenv or starting normal server", () => {
  const env = { ...process.env, RAY_PREVIEW_DATABASE_URL: "", RAY_PREVIEW_JWT_SECRET: "", DATABASE_URL: "postgresql://private-sentinel.invalid" };
  const result = spawnSync(process.execPath, ["dist/preview-server.js"], { cwd: new URL("../", import.meta.url), env, encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RAY_PREVIEW_DATABASE_URL/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-sentinel|dotenv|MongoDB/);
});

test("loopback startup refuses an occupied port without announcing readiness", async () => {
  const { createServer } = await import("node:http");
  const { default: express } = await import("express");
  const { listenLoopback } = await import("../dist/preview/runtime.js");
  const blocker = createServer();
  await new Promise(resolve => blocker.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(listenLoopback(express(), blocker.address().port), /cannot bind 127.0.0.1/);
    assert.equal(blocker.listening, true);
  } finally { await new Promise(resolve => blocker.close(resolve)); }
});
test("successful listener binds numeric loopback and closes cleanly", async () => {
  const { default: express } = await import("express");
  const { listenLoopback, closePreview } = await import("../dist/preview/runtime.js");
  const listener = await listenLoopback(express(), 0);
  assert.equal(listener.address().address, "127.0.0.1");
  let closed = false;
  await closePreview(listener, { close: async () => { closed = true; } });
  assert.equal(closed, true); assert.equal(listener.listening, false);
});
