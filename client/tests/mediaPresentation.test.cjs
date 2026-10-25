const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const loadTypeScript = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8")
    .replace("import.meta.env.VITE_API_URL", JSON.stringify("http://127.0.0.1:4001"))
    .replace("import.meta.env.MODE", JSON.stringify("postgres"));
  module._compile(ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText, filename);
};
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;
require.extensions[".css"] = () => {};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { FilePreview, MediaImage } = require("../src/components/media/Media.tsx");
const { t: translate } = require("../src/i18n/index.ts");

test("synthetic selected image has a Hebrew label and preserves an isolated mixed long filename", (t) => {
  t.mock.method(global, "fetch", () => assert.fail("presentation fixtures must not make requests"));
  // SSR does not run effects. Supply only the local object-URL state that the
  // existing preview effect sets; this is a labelled presentation fixture.
  t.mock.method(React, "useState", () => ["blob:local-synthetic-fixture", () => {}]);
  const filename = `צילום (Garden) кошка 123 ${"שם-ארוך-".repeat(20)}<script>.png`;
  const file = new File(["synthetic local fixture"], filename, { type: "image/png" });
  const markup = renderToStaticMarkup(React.createElement(FilePreview, { file, index: 1 }));
  assert.ok(markup.includes(`alt="${translate("media.selectedImage", { number: "2" })}"`));
  assert.ok(markup.includes('<figcaption><bdi dir="auto">'));
  assert.ok(markup.includes("צילום (Garden) кошка 123"));
  assert.ok(markup.includes("&lt;script&gt;.png"), "filenames remain escaped user content");
  assert.ok(markup.includes("שם-ארוך-".repeat(20)), "long filenames remain unmodified");
  assert.doesNotMatch(markup, /[\u202a-\u202e\u2066-\u2069]/u, "no direction-control characters enter user content");
});

test("synthetic image failure renders Hebrew fallback and preserves the single explicit retry", (t) => {
  t.mock.method(global, "fetch", () => assert.fail("presentation fixtures must not make requests"));
  // Render the two existing failure states without an image request or a DOM.
  let states = [true, false];
  t.mock.method(React, "useState", () => [states.shift(), () => {}]);
  const render = () => renderToStaticMarkup(React.createElement(MediaImage, {
    src: "data:image/png;base64,c3ludGhldGlj", alt: "Synthetic fixture",
  }));
  const firstFailure = render();
  assert.ok(firstFailure.includes(translate("media.unavailable")));
  assert.ok(firstFailure.includes(translate("media.retry")));
  assert.equal((firstFailure.match(/<button\b/g) ?? []).length, 1);
  states = [true, true];
  const retriedFailure = render();
  assert.ok(retriedFailure.includes(translate("media.unavailable")));
  assert.doesNotMatch(retriedFailure, /<button\b/, "an unsuccessful explicit retry cannot start a loop");
});
