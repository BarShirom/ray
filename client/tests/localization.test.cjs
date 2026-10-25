const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
};
const { default: i18n, t, syncDocumentLocale } = require("../src/i18n/index.ts");
const { he } = require("../src/i18n/locales/he.ts");
const format = require("../src/i18n/formatters.ts");
const { localizeError } = require("../src/i18n/errors.ts");

test("bundled synchronous Hebrew initialization, fallback and central document attributes", () => {
  assert.equal(i18n.isInitialized, true);
  assert.equal(i18n.resolvedLanguage, "he");
  assert.deepEqual(i18n.options.supportedLngs, ["he", "cimode"]);
  assert.equal(t("common.periods.morning"), "בוקר");
  const meta = {};
  const doc = { documentElement: {}, querySelector: () => ({ setAttribute: (key, value) => { meta[key] = value; } }) };
  syncDocumentLocale(undefined, doc);
  assert.equal(doc.documentElement.lang, "he");
  assert.equal(doc.documentElement.dir, "rtl");
  assert.equal(doc.title, he.common.title);
  assert.equal(meta.content, he.common.description);
  syncDocumentLocale("en", doc); // Test-only future LTR fixture; no release dictionary/choice.
  assert.equal(doc.documentElement.dir, "ltr");
  assert.equal(i18n.resolvedLanguage, "he");
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.equal(i18n.exists("missing.intentional.test"), false);
  assert.equal(t("missing.intentional.test"), he.errors.generic);
});

test("every static translation key used in source exists in the bundled Hebrew resource", () => {
  const keys = new Set();
  function visitFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "locales") visitFiles(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      function strings(node) {
        if (ts.isStringLiteral(node)) keys.add(node.text);
        if (ts.isConditionalExpression(node)) { strings(node.whenTrue); strings(node.whenFalse); }
      }
      function walk(node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === "t" && node.arguments[0]) strings(node.arguments[0]);
        ts.forEachChild(node, walk);
      }
      walk(source);
    }
  }
  visitFiles(path.join(__dirname, "../src"));
  assert.ok(keys.size > 120, "checks the actual component key surface");
  for (const key of keys) assert.ok(i18n.exists(key) || i18n.exists(`${key}_other`), `Missing Hebrew key: ${key}`);
});

test("Hebrew zero, one, two and several count forms", () => {
  assert.equal(t("common.items", { count: 0 }), "אין פריטים");
  assert.equal(t("common.items", { count: 1 }), "פריט אחד");
  assert.equal(t("common.items", { count: 2 }), "שני פריטים");
  assert.match(t("common.items", { count: 7 }), /7.*פריטים/);
  assert.equal(format.formatNumber(12345), new Intl.NumberFormat("he-IL").format(12345));
});

test("backend enum values retain their exact values and receive Hebrew display labels", () => {
  assert.deepEqual(["morning", "noon", "evening"].map(format.periodLabel), ["בוקר", "צהריים", "ערב"]);
  assert.deepEqual(["new", "in-progress", "resolved"].map(format.statusLabel), ["חדש", "בטיפול", "טופל"]);
  assert.deepEqual(["general", "food", "emergency"].map(format.reportTypeLabel), ["כללי", "מזון", "דחוף"]);
  assert.equal(format.statusLabel("unexpected"), he.common.unknownValue);
});

test("winter/summer Jerusalem time and midnight calendar boundaries", () => {
  assert.match(format.formatTime("2026-01-15T12:05:00Z"), /14:05/);
  assert.match(format.formatTime("2026-07-15T12:05:00Z"), /15:05/);
  assert.equal(format.jerusalemDay("2026-01-15T21:59:59Z"), "2026-01-15");
  assert.equal(format.jerusalemDay("2026-01-15T22:00:00Z"), "2026-01-16");
  assert.equal(format.jerusalemDay("2026-07-15T20:59:59Z"), "2026-07-15");
  assert.equal(format.jerusalemDay("2026-07-15T21:00:00Z"), "2026-07-16");
  assert.equal(format.formatRelativeDate("2026-07-15T20:59:59Z", "2026-07-15T21:01:00Z"), "אתמול");
  assert.equal(format.formatRelativeDate("2026-07-15T21:00:00Z", "2026-07-15T21:01:00Z"), "היום");
  for (const bad of [undefined, null, "", "not-a-date", new Date(NaN)]) {
    assert.equal(format.formatDateTime(bad), he.common.unknownDate);
    assert.equal(format.formatDate(bad), he.common.unknownDate);
    assert.equal(format.formatTime(bad), he.common.unknownDate);
  }
});

test("formatting does not depend on host timezone", () => {
  const loader = `const fs=require('node:fs'),ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);const f=require('./src/i18n/formatters.ts');process.stdout.write(JSON.stringify([f.formatDateTime('2026-07-15T21:01:00Z'),f.jerusalemDay('2026-01-15T22:00:00Z')]));`;
  const values = ["America/Los_Angeles", "Asia/Tokyo"].map((TZ) => execFileSync(process.execPath, ["-e", loader], { cwd: path.join(__dirname, ".."), env: { ...process.env, TZ }, encoding: "utf8" }));
  assert.equal(values[0], values[1]);
  assert.match(values[0], /00:01/);
});

test("known validation, auth, station, claim and upload errors are useful and safe", () => {
  for (const [message, context, expected] of [
    ["Invalid email or password", "login", he.errors.invalidLogin],
    ["Report is already claimed or resolved", "report", he.errors.alreadyClaimed],
    ["Feeding station is inactive", "feeding", he.errors.stationInactive],
    ["uploads unavailable in local preview", "upload", he.errors.uploadUnavailable],
    ["Station name is required.", "station", he.errors.stationName],
    ["Choose one station image or up to three report images.", "upload", he.errors.uploadCount],
  ]) assert.equal(localizeError(message, context), expected);
  for (const [status, expected] of [[401, he.errors.expiredAuth], [403, he.errors.forbidden], [500, he.errors.server]]) assert.equal(localizeError({ response: { status } }), expected);
  assert.equal(localizeError({ code: "ERR_NETWORK" }), he.errors.network);
  assert.equal(localizeError({ response: { status: 404, data: { message: "Image not found" } } }, "report"), he.errors.uploadVerification);
  assert.equal(localizeError({ message: "Image request failed. Please try again.", response: { status: 401, data: {} } }, "upload"), he.errors.expiredAuth);
  const detail = localizeError({ response: { status: 400, data: { errors: [{ field: "password", message: "Password must be at least 8 characters" }] } } }, "register");
  assert.equal(detail, `סיסמה: ${he.errors.passwordLength}`);
  assert.equal(localizeError(detail), detail, "localized field feedback survives Redux presentation");
  for (const message of ["SELECT password FROM users", "AWS secret=synthetic", "https://s3.invalid/a?X-Amz-Signature=synthetic", "prefix Invalid email or password suffix"]) {
    assert.equal(localizeError(new Error(message), "login"), he.errors.generic);
  }
  const badField = localizeError({ response: { data: { errors: [{ field: "email", message: "SQL secret=synthetic" }] } } });
  assert.equal(badField, `דוא״ל: ${he.errors.invalidValue}`);
});
