const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");
const ts = require("typescript");

for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8")
      // Server source uses NodeNext .js specifiers; resolve its TypeScript
      // companions while exercising the real source schema in this CJS loader.
      .replace(/(from\s+["'])(\.[^"']+)\.js(["'])/g, (match, prefix, relative, suffix) =>
        fs.existsSync(path.resolve(path.dirname(filename), relative + ".ts")) ? prefix + relative + ".ts" + suffix : match)
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
const { localizeError } = require("../src/i18n/errors.ts");
const { validateRegistrationPassword } = require("../src/features/auth/validateRegistrationPassword.ts");
const { registerSchema, loginSchema } = require("../../server/validation/authSchemas.ts");
const requireServer = createRequire(path.resolve(__dirname, "../../server/package.json"));
const bcrypt = requireServer("bcryptjs");
const { z } = requireServer("zod");
const { AxiosError } = require("axios");
const authReducer = require("../src/features/auth/authSlice.ts").default;
const { registerUser, loginUser } = require("../src/features/auth/authThunks.ts");
const { http } = require("../src/api/http.ts");
const Register = require("../src/pages/register/Register.tsx").default;
const fields = { firstName: "Synthetic", lastName: "Boundary", email: "boundary@example.invalid" };
const acceptsOnServer = (password) => registerSchema.safeParse({ ...fields, password }).success;

function find(element, predicate) {
  if (element === null || typeof element !== "object") return;
  if (Array.isArray(element)) {
    for (const child of element) { const found = find(child, predicate); if (found) return found; }
    return;
  }
  if (predicate(element)) return element;
  return find(element.props?.children, predicate);
}

// Captures the real registration callbacks with synthetic refs/transport. This
// verifies draft/state/ARIA props, not browser mounting or reader announcements.
function registrationFixture(context, respond) {
  const store = configureStore({ reducer: { auth: authReducer } });
  const hooks = require("../src/app/hooks.ts");
  const Module = require("node:module");
  const redux = require("react-redux"), router = require("react-router-dom");
  const pagePath = require.resolve("../src/pages/register/Register.tsx");
  const previousPage = require.cache[pagePath], previousLoad = Module._load;
  const navigations = [], focused = [], calls = [], cells = [];
  let cursor = 0, Page;
  delete require.cache[pagePath];
  Module._load = function(request, ...args) {
    if (request === "react-redux") return { ...redux, useStore: () => store };
    if (request === "react-router-dom") return { ...router, useNavigate: () => path => navigations.push(path) };
    return previousLoad.call(this, request, ...args);
  };
  try { Page = require(pagePath).default; } finally { Module._load = previousLoad; }
  context.after(() => { require.cache[pagePath] = previousPage; });
  const cell = initialize => {
    const index = cursor++;
    if (!(index in cells)) cells[index] = initialize();
    return index;
  };
  context.mock.method(React, "useState", initial => {
    const index = cell(() => typeof initial === "function" ? initial() : initial);
    return [cells[index], value => { cells[index] = typeof value === "function" ? value(cells[index]) : value; }];
  });
  context.mock.method(React, "useRef", initial => cells[cell(() => ({ current: initial }))]);
  context.mock.method(React, "useEffect", () => {});
  context.mock.method(hooks, "useAppDispatch", () => store.dispatch);
  context.mock.method(hooks, "useAppSelector", selector => selector(store.getState()));
  context.mock.method(global, "fetch", () => assert.fail("No external calls in password fixture"));
  const previousAdapter = http.defaults.adapter;
  http.defaults.adapter = async config => { calls.push(config); return respond(config); };
  context.after(() => { http.defaults.adapter = previousAdapter; });
  const render = () => {
    cursor = 0;
    const tree = Page();
    const form = find(tree, element => element.type === "form");
    form.props.ref.current = { elements: { namedItem: name => ({
      validity: { typeMismatch: false }, focus: () => focused.push(name),
    }) } };
    return tree;
  };
  const input = (tree, id) => find(tree, element => element.type === "input" && element.props.id === id);
  return {
    store, render, calls, focused, navigations, input,
    change: (name, value) => input(render(), name).props.onChange({ target: { name, value } }),
    submit: () => find(render(), element => element.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}

// Assertions deliberately compare booleans or localized feedback, never secret-bearing DTOs.
test("registration rejects the former gap and matches the Unicode minimum boundary", () => {
  for (const length of [0, 1, 5, 6, 7, 8, 9]) {
    const password = "x".repeat(length);
    const clientAccepted = validateRegistrationPassword(password) === undefined;
    assert.equal(clientAccepted, length >= 8);
    assert.equal(clientAccepted, acceptsOnServer(password));
  }
  assert.equal(validateRegistrationPassword(""), t("auth.passwordRequired"));
  assert.equal(validateRegistrationPassword("x".repeat(7)), t("auth.passwordTooShort"));
});

test("Unicode code points match installed Zod rather than UTF-16 units", () => {
  const cases = [
    ["\u{1F408}".repeat(4), false],
    ["\u{1F408}".repeat(7), false],
    ["\u{1F408}".repeat(8), true],
    ["\u05D0".repeat(7), false],
    ["\u05D0".repeat(8), true],
    ["e\u0301".repeat(4), true],
    ["Cat\u05D0\u05D1\u{1F408}ab", true],
  ];
  for (const [password, expected] of cases) {
    const clientAccepted = validateRegistrationPassword(password) === undefined;
    assert.equal(z.string().min(8).safeParse(password).success, expected);
    assert.equal(clientAccepted, expected);
    assert.equal(clientAccepted, acceptsOnServer(password));
  }
});

test("UTF-8 registration boundaries match the server and installed bcrypt truncation", () => {
  const cases = [
    ["ASCII 72", "x".repeat(72), 72, true],
    ["ASCII 73", "x".repeat(73), 73, false],
    ["Hebrew 72", "\u05D0".repeat(36), 72, true],
    ["Hebrew mixed 73", "\u05D0".repeat(36) + "x", 73, false],
    ["Hebrew 74", "\u05D0".repeat(37), 74, false],
    ["emoji 72", "\u{1F408}".repeat(18), 72, true],
    ["emoji mixed 73", "\u{1F408}".repeat(17) + "abcde", 73, false],
    ["emoji 76", "\u{1F408}".repeat(19), 76, false],
    ["three-byte 72", "\u20ac".repeat(24), 72, true],
    ["three-byte mixed 73", "\u20ac".repeat(24) + "x", 73, false],
    ["mixed 72", "\u{1F408}".repeat(8) + "\u05D0".repeat(16) + "abcd1234", 72, true],
    ["mixed 73", "\u{1F408}".repeat(8) + "\u05D0".repeat(16) + "abcd12345", 73, false],
    ["largest Unicode scalar 72", "\u{10ffff}".repeat(18), 72, true],
  ];
  for (const [label, password, bytes, expected] of cases) {
    assert.equal(new TextEncoder().encode(password).length, bytes, label);
    assert.equal(validateRegistrationPassword(password) === undefined, expected, label);
    assert.equal(acceptsOnServer(password), expected, label);
    assert.equal(bcrypt.truncates(password), !expected, label);
    if (!expected) assert.equal(validateRegistrationPassword(password), t("auth.passwordTooLong"));
  }
});

test("new registration rejects malformed Unicode without replacing its characters", () => {
  for (const password of ["\uD800", "\uDC00", "\uD800".repeat(8), "\uDC00".repeat(8), "validtext\uD800", "\uDC00validtext", "\uD800\u{1F408}validtext"]) {
    assert.equal(validateRegistrationPassword(password), t("auth.passwordInvalidUnicode"));
    assert.equal(acceptsOnServer(password), false);
    assert.equal(loginSchema.safeParse({ email: fields.email, password }).success, true, "existing login acceptance is preserved");
  }
  assert.equal(validateRegistrationPassword("\u{1F408}".repeat(8)), undefined, "valid surrogate pairs are accepted");
  assert.equal(validateRegistrationPassword("\ufffd".repeat(8)), undefined, "a real replacement character is valid Unicode");
});

test("valid password checks add no normalization, trimming or composition rule", () => {
  const cases = [" ".repeat(8), " " + "x".repeat(6) + " ", "x".repeat(72), "\u05D0".repeat(36), "e\u0301".repeat(4), "\u00e9".repeat(8)];
  for (const password of cases) {
    assert.equal(validateRegistrationPassword(password) === undefined, true);
    const parsed = registerSchema.safeParse({ ...fields, password });
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.password === password, true);
  }
  assert.equal(validateRegistrationPassword("\u00e9".repeat(4)), t("auth.passwordTooShort"), "canonical equivalents are counted as submitted");
});

test("registration guidance and field errors are Hebrew and consistent before API submission", () => {
  const store = configureStore({ reducer: { auth: authReducer } });
  const markup = renderToStaticMarkup(React.createElement(Provider, { store },
    React.createElement(MemoryRouter, null, React.createElement(Register))));
  assert.ok(markup.includes(t("auth.passwordHint")));
  assert.ok(/<form\b[^>]*noValidate=""/i.test(markup));
  assert.ok(/<input\b(?=[^>]*id="password")(?=[^>]*type="password")(?=[^>]*aria-describedby="password-hint")[^>]*>/.test(markup));
  assert.match(t("auth.passwordHint"), /8.*72.*UTF-8/);
  assert.ok(t("auth.passwordHint").includes("2 בתים"));
  assert.ok(t("auth.passwordHint").includes("4 בתים"));
  assert.equal(new TextEncoder().encode("\u05D0").length, 2);
  assert.equal(new TextEncoder().encode("\u{1F408}").length, 4);
  assert.doesNotMatch(markup, /(?:minlength|maxlength)=/i, "native UTF-16 limits would disagree with the Unicode/byte policy");
  assert.ok(/[\u0590-\u05FF]/.test(validateRegistrationPassword("x".repeat(7))));
  assert.ok(!validateRegistrationPassword("x".repeat(7)).includes("auth."));
});

test("registration callbacks show inline password errors and retain drafts without a request", async context => {
  for (const [name, password, key] of [
    ["short", "\u{1F408}".repeat(7), "passwordTooShort"],
    ["overlong", "\u05D0".repeat(36) + "x", "passwordTooLong"],
    ["malformed", "validtext\uD800", "passwordInvalidUnicode"],
  ]) await context.test(name, async sub => {
    const fixture = registrationFixture(sub, () => assert.fail("Invalid registration must not call API"));
    const draft = { ...fields, password, company: "ארגון Synthetic" };
    for (const [field, value] of Object.entries(draft)) fixture.change(field, value);
    await fixture.submit();
    const tree = fixture.render(), input = fixture.input(tree, "password");
    assert.equal(input.props["aria-invalid"], true);
    assert.equal(input.props["aria-describedby"], "password-error password-hint");
    assert.equal(input.props.dir, "auto");
    const error = find(tree, element => element.props?.id === "password-error");
    assert.equal(error.props.children, t(`auth.${key}`));
    assert.equal(error.props.role, "alert");
    for (const [field, value] of Object.entries(draft)) assert.equal(fixture.input(tree, field).props.value === value, true, `${field} draft retained`);
    assert.deepEqual(fixture.focused, ["password"]);
    assert.equal(fixture.calls.length, 0);
    assert.deepEqual(fixture.navigations, []);
  });
});

test("recoverable API password errors retain the raw registration draft", async context => {
  const fixture = registrationFixture(context, config => { throw new AxiosError("Synthetic validation failure", "ERR_BAD_REQUEST", config, undefined, {
    config, status: 400, statusText: "Synthetic", headers: {},
    data: { errors: [{ field: "password", message: "Password must be at most 72 UTF-8 bytes" }] },
  }); });
  const draft = { ...fields, password: " \u05D0\u05D1\u05D2\u05D3\u05D4\u05D5 ", company: "ארגון Synthetic" };
  for (const [field, value] of Object.entries(draft)) fixture.change(field, value);
  await fixture.submit();
  const tree = fixture.render();
  for (const [field, value] of Object.entries(draft)) assert.equal(fixture.input(tree, field).props.value === value, true, `${field} draft retained`);
  const expected = `${t("auth.password")}: ${t("errors.passwordBytes")}`;
  assert.ok(find(tree, element => element.props?.role === "alert" && element.props.children === expected));
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.store.getState().auth.user, null);
  assert.deepEqual(fixture.navigations, []);
});

test("server password policy errors become safe field-specific Hebrew feedback", async () => {
  for (const [message, key] of [
    ["Password must be at least 8 characters", "passwordLength"],
    ["Password must be at most 72 UTF-8 bytes", "passwordBytes"],
    ["Password contains invalid Unicode", "passwordUnicode"],
  ]) {
    for (const location of [{ field: "password" }, { path: ["password"] }]) {
      const text = localizeError({ response: { status: 400, data: { errors: [{ ...location, message }] } } }, "register");
      assert.equal(text, `${t("auth.password")}: ${t(`errors.${key}`)}`);
      assert.equal(localizeError(text, "register"), text, "localized feedback survives thunk/component mapping");
      assert.match(text, /[\u0590-\u05FF]/);
      assert.equal(text.includes(message), false);
    }
  }
  const store = configureStore({ reducer: { auth: authReducer } });
  const previousAdapter = http.defaults.adapter;
  const rawPassword = "synthetic-private-marker-" + "x".repeat(73);
  http.defaults.adapter = async config => {
    const parsed = registerSchema.safeParse(JSON.parse(config.data));
    assert.equal(parsed.success, false);
    const errors = parsed.error.issues.map(({ path, message }) => ({ field: path.join("."), message }));
    throw new AxiosError("Synthetic validation failure", "ERR_BAD_REQUEST", config, undefined, {
      config, status: 400, statusText: "Synthetic", headers: {}, data: { errors },
    });
  };
  try {
    const result = await store.dispatch(registerUser({ ...fields, password: rawPassword }));
    assert.equal(registerUser.rejected.match(result), true);
    assert.equal(result.payload, `${t("auth.password")}: ${t("errors.passwordBytes")}`);
    assert.equal(store.getState().auth.error, result.payload);
    assert.equal(JSON.stringify(result.payload).includes(rawPassword), false);
  } finally {
    http.defaults.adapter = previousAdapter;
  }
});

test("valid registration and existing short or overlong logins preserve raw request values", async () => {
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
      assert.equal(["x".repeat(6), "\u05D0".repeat(37)].includes(body.password), true);
    }
    return { config, data: { token: "fixture-token", user: profile }, status: 200, statusText: "Fixture", headers: {} };
  };
  try {
    const registration = await store.dispatch(registerUser(credentials));
    assert.equal(registerUser.fulfilled.match(registration), true);
    const login = await store.dispatch(loginUser({ email: fields.email, password: "x".repeat(6) }));
    assert.equal(loginUser.fulfilled.match(login), true);
    const historicalLogin = await store.dispatch(loginUser({ email: fields.email, password: "\u05D0".repeat(37) }));
    assert.equal(loginUser.fulfilled.match(historicalLogin), true);
    assert.equal(registerCalls, 1);
    assert.equal(loginCalls, 2);
  } finally {
    http.defaults.adapter = previousAdapter;
  }
});
