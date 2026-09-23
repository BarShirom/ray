const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8")
    .replace("import.meta.env.VITE_API_URL", JSON.stringify("http://127.0.0.1:4001"))
    .replace("import.meta.env.MODE", JSON.stringify("postgres"));
  module._compile(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
};
test("preview upload helper refuses before sending any provider or API request", async (t) => {
  const axios = require("axios");
  const post = t.mock.method(axios, "post", () => { assert.fail("preview must not upload"); });
  const { uploadMedia } = require("../src/api/upload.ts");
  await assert.rejects(uploadMedia([new File(["synthetic"], "demo.png", { type: "image/png" })]), /uploads unavailable in local preview/);
  assert.equal(post.mock.callCount(), 0);
});
