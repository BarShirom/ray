const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

// Reuse the existing Node + TypeScript loader; render real components without a DOM framework.
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
const { AxiosError } = require("axios");
const { t } = require("../src/i18n/index.ts");
const authReducer = require("../src/features/auth/authSlice.ts").default;
const { setAuth } = require("../src/features/auth/authSlice.ts");
const { loginUser, registerUser } = require("../src/features/auth/authThunks.ts");
const { http } = require("../src/api/http.ts");
const Login = require("../src/pages/login/Login.tsx").default;
const Register = require("../src/pages/register/Register.tsx").default;
const Navbar = require("../src/components/navbar/Navbar.tsx").default;
const About = require("../src/pages/about/About.tsx").default;

const makeStore = () => configureStore({ reducer: { auth: authReducer } });
const render = (Component, store = makeStore()) => renderToStaticMarkup(
  React.createElement(Provider, { store },
    React.createElement(MemoryRouter, null, React.createElement(Component)))
);
const response = (config, data, status = 200) => ({ data, status, statusText: "Fixture", headers: {}, config });

// These are render semantics, not browser sizing/focus evidence; mobile interaction is checked separately.
test("auth forms render Hebrew labels, application validation, and direction-safe inputs", () => {
  const login = render(Login);
  const register = render(Register);
  for (const html of [login, register]) {
    assert.match(html, /<form\b[^>]*noValidate=""/i);
    assert.ok(html.includes(t("auth.email")));
    assert.ok(html.includes(t("auth.password")));
    assert.ok(html.includes(t("auth.showPassword")));
    assert.match(html, /<input\b(?=[^>]*id="email")(?=[^>]*dir="ltr")[^>]*>/);
    assert.match(html, /<input\b(?=[^>]*id="password")(?=[^>]*dir="auto")[^>]*>/);
    assert.doesNotMatch(html, />(?:Email|Password|Show|Sign up|Log in)</);
  }
  assert.ok(login.includes(t("auth.login")));
  assert.ok(register.includes(t("auth.register")));
  assert.ok(register.includes(t("auth.passwordHint")));
  for (const name of ["firstName", "lastName", "company"]) {
    assert.match(register, new RegExp(`<input\\b(?=[^>]*id="${name}")(?=[^>]*dir="auto")[^>]*>`));
  }
});

test("navbar provides labelled compact-menu control and preserves the guest destinations", () => {
  const html = render(Navbar);
  assert.ok(html.includes(`aria-label="${t("shell.navigation")}"`));
  assert.match(html, /<button\b(?=[^>]*aria-expanded="false")(?=[^>]*aria-controls="primary-navigation-items")[^>]*>/);
  assert.match(html, /id="primary-navigation-items"/);
  assert.ok(html.includes(t("shell.newReport")));
  assert.ok(html.includes(t("shell.map")));
  assert.ok(html.includes(t("auth.register")));
  const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, ["/", "/map-page", "/register"]);
});

test("authenticated navbar uses assigned-report terminology and preserves logout", () => {
  const store = makeStore();
  store.dispatch(setAuth({ id: "fixture", firstName: "דנה Anna", lastName: "Иванова (42)", email: "demo@example.invalid", token: "fixture-token" }));
  const html = render(Navbar, store);
  assert.ok(html.includes(t("shell.assignedReports")));
  assert.ok(html.includes(t("auth.logout")));
  const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, ["/", "/map-page", "/my-reports"]);
});

test("About translates its existing heading without introducing product claims", () => {
  assert.equal(render(About), `<h1>${t("about.title")}</h1>`);
});

test("auth workflows preserve mixed-language values and unchanged API payloads", async () => {
  const store = makeStore();
  const dto = {
    firstName: "דנה Anna (42)",
    lastName: "Иванова",
    email: "Mixed.Case+42@example.invalid",
    password: "Aa_ רוסית 42!",
    company: "ארגון / Example №2",
  };
  const user = { id: "fixture-user", firstName: dto.firstName, lastName: dto.lastName, email: dto.email, company: dto.company };
  const requests = [];
  const previousAdapter = http.defaults.adapter;
  http.defaults.adapter = async (config) => {
    requests.push({ url: config.url, method: config.method, data: JSON.parse(config.data) });
    return response(config, { token: "fixture-token", user });
  };
  try {
    await store.dispatch(registerUser(dto)).unwrap();
    await store.dispatch(loginUser({ email: dto.email, password: dto.password })).unwrap();
    assert.deepEqual(requests, [
      { url: "/api/auth/register", method: "post", data: dto },
      { url: "/api/auth/login", method: "post", data: { email: dto.email, password: dto.password } },
    ]);
    assert.deepEqual(store.getState().auth.user, { ...user, token: "fixture-token" });
  } finally {
    http.defaults.adapter = previousAdapter;
  }
});

test("auth API field failures remain useful Hebrew feedback and unknown failures stay safe", async () => {
  const store = makeStore();
  const previousAdapter = http.defaults.adapter;
  try {
    http.defaults.adapter = async (config) => {
      throw new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", config, null,
        response(config, { errors: [{ path: ["password"], message: "Password must be at least 8 characters" }] }, 400));
    };
    const validation = await store.dispatch(registerUser({ firstName: "דנה", lastName: "לוי", email: "demo@example.invalid", password: "123456" }));
    assert.ok(validation.payload.includes(t("errors.passwordLength")));
    assert.doesNotMatch(validation.payload, /Request failed|Password must/);
    http.defaults.adapter = async () => { throw new Error("SQL AWS credential https://private.invalid/?signature=secret"); };
    const unknown = await store.dispatch(loginUser({ email: "demo@example.invalid", password: "unchanged" }));
    assert.equal(unknown.payload, t("errors.generic"));
    assert.doesNotMatch(unknown.payload, /SQL|AWS|credential|private|signature|secret/);
  } finally {
    http.defaults.adapter = previousAdapter;
  }
});
