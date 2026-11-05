const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

// Load the actual merged Hebrew resource, including imported domain resources.
// This reuses the existing lightweight TypeScript test harness without a build.
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
};
const { he } = require("../src/i18n/locales/he.ts");

function stringEntries(value, prefix = "he") {
  return Object.entries(value).flatMap(([key, entry]) => {
    const name = `${prefix}.${key}`;
    return typeof entry === "string" ? [[name, entry]] : stringEntries(entry, name);
  });
}

test("all bundled Hebrew interface strings omit the prohibited punctuation", () => {
  const entries = stringEntries(he);
  assert.ok(entries.length > 200, "checks the complete merged Hebrew interface resource");
  for (const [key, value] of entries) {
    assert.doesNotMatch(value, /\u2014/u, `${key} contains prohibited U+2014 punctuation`);
  }
});

test("the offline prototype keeps Hebrew RTL copy without literal or encoded U+2014", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../docs/prototypes/mobile-map.html"), "utf8");
  assert.match(html, /<html\s+lang="he"\s+dir="rtl">/u);
  assert.match(html, /[\u0590-\u05ff]/u, "the checked prototype contains Hebrew copy");
  assert.doesNotMatch(html, /(?:\u2014|&mdash(?:;|(?![a-z0-9=]))|&#0*8212(?:;|(?!\d))|&#x0*2014(?:;|(?![0-9a-f]))|\\u(?:2014|\{0*2014\}))/iu,
    "prototype copy must not introduce U+2014 literally, as an HTML entity or as a JavaScript Unicode escape");
});
