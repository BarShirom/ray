// Deliberately isolated: a parser regression must terminate this disposable child,
// never the test runner. Synthetic loopback traffic only; no database or storage.
import assert from "node:assert/strict";
import { request } from "node:http";
import { gzipSync } from "node:zlib";
import mongoose from "mongoose";
import { createLegacyApp } from "../../dist/app.js";
import { createPreviewApp } from "../../dist/preview/app.js";

const unexpected = () => assert.fail("No persistence allowed in parser regression");
mongoose.Query.prototype.exec = unexpected;
mongoose.connect = unexpected;
console.log = () => {};
const connection = { db: new Proxy({}, { get: unexpected }), pool: { query: unexpected } };
const app = process.argv[2] === "legacy" ? createLegacyApp() : createPreviewApp(connection, "synthetic-parser-test-secret");
const listener = app.listen(0, "127.0.0.1");
await new Promise(resolve => listener.once("listening", resolve));
const port = listener.address().port;

async function post(body, type, encoding) {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1", port, method: "POST", path: "/api/feeding-stations", agent: false,
      headers: { "Content-Type": type, "Content-Encoding": encoding, "Content-Length": body.length },
    }, res => {
      res.resume();
      res.once("end", () => resolve(res.statusCode));
      res.once("error", reject);
    });
    req.setTimeout(3000, () => req.destroy(new Error("Synthetic request deadline")));
    req.once("error", reject);
    req.end(body);
  });
}

try {
  for (const [type, plain] of [["application/json", "{}"], ["application/x-www-form-urlencoded", "name=synthetic"]]) {
    // Bounded regression for GHSA-27r3-jxmh-p828's late decoder error.
    const fixture = Buffer.concat([gzipSync(plain), Buffer.from([0]), Buffer.alloc(100 * 1024, 0x58)]);
    assert.equal(await post(fixture, type, "gzip"), 401);
    // Give late stream events a turn before proving the listener still responds.
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
    assert.equal(await post(Buffer.from(plain), type, "identity"), 401);
    assert.equal(await post(Buffer.from("invalid compressed input"), type, "gzip"), 400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
  }
} finally {
  await new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); });
}
process.stdout.write("parser-survival-ok\n");
