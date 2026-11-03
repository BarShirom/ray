import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { createLegacyApp } from "../dist/app.js";
import retired from "../dist/routes/feedingStationRoutes.js";

async function listen(t, app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return async (method, path, headers = {}, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers, ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text) : null, headers: response.headers };
  };
}

for (const composition of ["legacy app", "default station router"]) {
  test(`${composition} refuses every station/feed path before parser, authentication or storage`, async t => {
    const unexpected = () => assert.fail("Retired station routes must perform no database/cloud operation");
    t.mock.method(mongoose, "connect", unexpected);
    t.mock.method(mongoose, "createConnection", unexpected);
    t.mock.method(mongoose.Query.prototype, "exec", unexpected);
    t.mock.method(mongoose.Model.prototype, "save", unexpected);
    t.mock.method(cloudinary.uploader, "upload", unexpected);
    t.mock.method(cloudinary.uploader, "upload_stream", unexpected);
    t.mock.method(console, "log", () => {});
    const app = composition === "legacy app" ? createLegacyApp({ policies: { ingress: { limit: 1, windowMs: 60000 } } }) : express().use("/api/feeding-stations", retired);
    const request = await listen(t, app);
    const prefixes = composition === "legacy app" ? ["/api/feeding-stations", "/api/station-access"] : ["/api/feeding-stations"];
    for (const prefix of prefixes) for (const tail of ["", "/", "/200000000000000000000001", "/200000000000000000000001/feedings", "/recipient-reference", "/unknown/child"]) {
      for (const method of ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", ...(composition === "legacy app" ? [] : ["OPTIONS"])]) {
        const response = await request(method, prefix + tail, {
          "Content-Type": "application/json", Authorization: "Bearer invalid", "Content-Encoding": "unsupported",
        }, ["POST", "PATCH", "PUT", "DELETE"].includes(method) ? "{" : undefined);
        assert.equal(response.status, 503, `${method} ${prefix + tail}`);
        assert.deepEqual(response.body, method === "HEAD" ? null : { message: "Station service unavailable" });
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(response.headers.get("referrer-policy"), "no-referrer");
        assert.equal(response.headers.get("etag"), null);
        assert.equal(response.headers.get("location"), null);
      }
    }
    if (composition === "legacy app") {
      // CORS preflight intentionally remains ahead of retired namespace refusal.
      assert.equal((await request("OPTIONS", "/api/feeding-stations", { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET" })).status, 204);
      assert.equal((await request("GET", "/healthz")).status, 200);
      assert.equal((await request("PATCH", "/api/reports/200000000000000000000001/claim")).status, 401);
      // A fresh composition proves unrelated parser/auth behavior without
      // consuming the one-request admission budget used above.
      const fresh = await listen(t, createLegacyApp());
      assert.equal((await fresh("POST", "/api/auth/login", { "Content-Type": "application/json" }, "{")).status, 400);
    }
  });
}
