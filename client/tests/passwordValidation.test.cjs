const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");
const ts = require("typescript");

for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8")
      .replaceAll("import.meta.env.VITE_API_URL", JSON.stringify("http://fixture.invalid"))
      .replaceAll("import.meta.env.MODE", JSON.stringify("development"));
    module._compile(ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText, filename);
  };
}
require.extensions[".css"] = () => {};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { Provider } = require("react-redux");
const { MemoryRouter } = require("react-router-dom");
const { configureStore } = require("@reduxjs/toolkit");
const { t } = require("../src/i18n/index.ts");
const { validateRegistrationPassword } = require("../src/features/auth/validateRegistrationPassword.ts");
const { registerSchema, loginSchema } = require("../../server/validation/authSchemas.ts");
const requireServer = createRequire(path.resolve(__dirname, "../../server/package.json"));
const bcrypt = requireServer("bcryptjs");
const authReducer = require("../src/features/auth/authSlice.ts").default;
const { registerUser, loginUser } = require("../src/features/auth/authThunks.ts");
const { http } = require("../src/api/http.ts");
const Register = require("../src/pages/register/Register.tsx").default;
const fields = { firstName: "Synthetic", lastName: "Boundary", email: "boundary@example.invalid" };
const acceptsOnServer = (password) => registerSchema.safeParse({ ...fields, password }).success;

// Assertions deliberately compare booleans or localized feedback, never secret-bearing DTOs.
test("registration rejects the former gap and matches the current minimum boundary", () => {
  for (const length of [0, 1, 5, 6, 7, 8, 9]) {
    const password = "x".repeat(length);
    const clientAccepted = validateRegistrationPassword(password) === undefined;
    assert.equal(clientAccepted, length >= 8);
    assert.equal(clientAccepted, acceptsOnServer(password));
  }
  assert.equal(validateRegistrationPassword(""), t("auth.passwordRequired"));
  assert.equal(validateRegistrationPassword("x".repeat(7)), t("auth.passwordTooShort"));
});

test("Unicode code points match installed server Zod rather than UTF-16 units", () => {
  const cases = [
    ["\u{1F408}".repeat(4), false],
    ["\u{1F408}".repeat(7), false],
    ["\u{1F408}".repeat(8), true],
    ["\u05D0".repeat(7), false],
    ["\u05D0".repeat(8), true],
    ["e\u0301".repeat(4), true],
    ["\uD800".repeat(7), false],
    ["\uD800".repeat(8), true],
  ];
  for (const [password, expected] of cases) {
    const clientAccepted = validateRegistrationPassword(password) === undefined;
    assert.equal(clientAccepted, expected);
    assert.equal(clientAccepted, acceptsOnServer(password));
  }
});

test("password checks add no normalization, complexity, or unsupported maximum", () => {
  const cases = [" ".repeat(8), " " + "x".repeat(6) + " ", "x".repeat(72), "x".repeat(73), "x".repeat(256), "\u05D0".repeat(36), "\u05D0".repeat(37)];
  for (const password of cases) {
    assert.equal(validateRegistrationPassword(password) === undefined, true);
    const parsed = registerSchema.safeParse({ ...fields, password });
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.password === password, true);
  }
  // Existing bcrypt byte truncation is inspected, not changed into an invented validation rule.
  assert.equal(bcrypt.truncates("x".repeat(72)), false);
  assert.equal(bcrypt.truncates("x".repeat(73)), true);
  assert.equal(bcrypt.truncates("\u05D0".repeat(36)), false);
  assert.equal(bcrypt.truncates("\u05D0".repeat(37)), true);
});

test("registration guidance and field errors are Hebrew and consistent before API submission", () => {
  const store = configureStore({ reducer: { auth: authReducer } });
  const markup = renderToStaticMarkup(React.createElement(Provider, { store },
    React.createElement(MemoryRouter, null, React.createElement(Register))));
  assert.ok(markup.includes(t("auth.passwordHint")));
  assert.ok(/<form\b[^>]*noValidate=""/i.test(markup));
  assert.ok(/<input\b(?=[^>]*id="password")(?=[^>]*type="password")(?=[^>]*aria-describedby="password-hint")[^>]*>/.test(markup));
  assert.equal(t("auth.passwordHint"), t("auth.passwordTooShort"));
  assert.ok(/[\u0590-\u05FF]/.test(validateRegistrationPassword("x".repeat(7))));
  assert.ok(!validateRegistrationPassword("x".repeat(7)).includes("auth."));
});

test("valid registration and existing shorter-account login preserve raw request values", async () => {
  const store = configureStore({ reducer: { auth: authReducer } });
  const rawPassword = " " + "\u05D0".repeat(6) + " ";
  const credentials = { ...fields, password: rawPassword };
  const profile = { id: "fixture-user", ...fields };
  const previousAdapter = http.defaults.adapter;
  let registerCalls = 0;
  let loginCalls = 0;
  http.defaults.adapter = async (config) => {
    const body = JSON.parse(config.data);
    if (config.url === "/api/auth/register") {
      registerCalls++;
      assert.equal(validateRegistrationPassword(body.password) === undefined, true);
      assert.equal(acceptsOnServer(body.password), true);
      assert.equal(body.password === rawPassword, true);
      assert.equal(body.email === credentials.email, true);
    } else {
      loginCalls++;
      assert.equal(config.url, "/api/auth/login");
      assert.equal(loginSchema.safeParse(body).success, true);
      assert.equal(body.password === "x".repeat(6), true);
    }
    return { config, data: { token: "fixture-token", user: profile }, status: 200, statusText: "Fixture", headers: {} };
  };
  try {
    const registration = await store.dispatch(registerUser(credentials));
    assert.equal(registerUser.fulfilled.match(registration), true);
    const login = await store.dispatch(loginUser({ email: fields.email, password: "x".repeat(6) }));
    assert.equal(loginUser.fulfilled.match(login), true);
    assert.equal(registerCalls, 1);
    assert.equal(loginCalls, 1);
  } finally {
    http.defaults.adapter = previousAdapter;
  }
});
