const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8")
    .replaceAll("import.meta.env.VITE_API_URL", JSON.stringify("http://fixture.invalid"))
    .replaceAll("import.meta.env.MODE", JSON.stringify("postgres"));
  module._compile(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText, filename);
};
const storage = new Map();
global.self = { localStorage: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
} };
const { store, persistor } = require("../src/app/store.ts");
const { http } = require("../src/api/http.ts");
const { setAuth, logout } = require("../src/features/auth/authSlice.ts");
const { AxiosError, AxiosHeaders } = require("axios");
const id = number => number.toString(16).padStart(24, "0");
const user = actor => ({ id: `user-${actor}`, token: `synthetic-token-${actor}`, firstName: "Synthetic", lastName: actor, email: `${actor}@example.invalid` });
const authenticate = actor => store.dispatch(setAuth(user(actor)));
const response = (config, data, headers = {}) => ({ config, data, headers: new AxiosHeaders(headers), status: 200, statusText: "OK" });
const denied = (config, status, headers = {}) => new AxiosError("Synthetic failure", "ERR_BAD_REQUEST", config, null, {
  ...response(config, {}, headers), status,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const controlledRequest = () => {
  const started = deferred(), completion = deferred();
  return { started: started.promise, resolve: completion.resolve, reject: completion.reject,
    adapter: config => { started.resolve(config); return completion.promise; } };
};
const ready = async () => {
  if (persistor.getState().bootstrapped) return;
  await new Promise(resolve => {
    const unsubscribe = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
    });
  });
};
const station = (number = 1, active = true) => ({
  _id: id(number), name: `Synthetic station ${number}`, location: { lat: 32.1, lng: 34.8 },
  estimatedCats: 3, estimatedKittens: 0, active, permissions: { canManage: false, canFeed: active },
});
const log = (number = 1, stationNumber = 1) => ({
  _id: id(number), stationId: id(stationNumber), fedAt: `2026-11-03T${String(number % 24).padStart(2, "0")}:00:00.000Z`,
  food: true, water: false, createdAt: "2026-11-03T06:00:00.000Z", updatedAt: "2026-11-03T06:00:00.000Z",
});
const summary = (food = "under-2h", water = "no-record") => ({ food: { recency: food }, water: { recency: water } });
module.exports = { store, persistor, storage, http, setAuth, logout, AxiosError, id, user, authenticate,
  response, denied, deferred, controlledRequest, ready, station, log, summary };
