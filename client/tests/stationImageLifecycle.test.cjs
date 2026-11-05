const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.VITE_API_URL', JSON.stringify('http://fixture.invalid')).replaceAll('import.meta.env.MODE', JSON.stringify('postgres'));
  module._compile(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
};
require.extensions['.css'] = () => {};
const React = require('react');
let activeStore;
const reduxFile = require.resolve('react-redux');
require.cache[reduxFile] = { id: reduxFile, filename: reduxFile, loaded: true, exports: { ...require(reduxFile), useStore: () => activeStore } };
const { configureStore } = require('@reduxjs/toolkit');
const auth = require('../src/features/auth/authSlice.ts');
const hooks = require('../src/app/hooks.ts');
const { StationMediaImage } = require('../src/components/media/StationMediaImage.tsx');
const mediaApi = require('../src/api/media.ts');
const stations = require('../src/features/feedingStations/feedingStationsSlice.ts');
const logs = require('../src/features/feedingLogs/feedingLogsSlice.ts');
const { fetchFeedingStations, fetchFeedingStationDetail } = require('../src/features/feedingStations/feedingStationsThunks.ts');
const { fetchFeedingLogsForStation, fetchFeedingSummaryForStation } = require('../src/features/feedingLogs/feedingLogsThunks.ts');
const { http } = require('../src/api/http.ts');
const { AxiosError, AxiosHeaders } = require('axios');
const { t: translate } = require('../src/i18n/index.ts');
const beginImageLoad = mediaApi.beginStationImageLoad;
const source = 'http://fixture.invalid/api/media/11111111-1111-4111-8111-111111111111/content';
const user = id => ({ id, token: 'synthetic-same-token', firstName: 'Synthetic', lastName: 'Fixture', email: 'fixture@example.invalid' });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const controlled = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const descendants = element => !element || typeof element !== 'object' ? []
  : [element, ...React.Children.toArray(element.props?.children).flatMap(descendants)];
const retryButton = element => descendants(element).find(item => item.type === 'button');
const text = element => typeof element === 'string' || typeof element === 'number' ? String(element)
  : React.Children.toArray(element?.props?.children).map(text).join('');
const response = (config, data, status = 200) => ({ config, data, status, statusText: 'Synthetic fixture', headers: new AxiosHeaders() });
const useAdapter = (context, adapter) => {
  const previous = http.defaults.adapter;
  http.defaults.adapter = adapter;
  context.after(() => { http.defaults.adapter = previous; });
};

// Captures the real effect and real render gates without a DOM/test framework.
// Object URL decoding and visual browser acceptance remain separate evidence.
function fixture(context, actor) {
  activeStore = configureStore({ reducer: { auth: auth.default, feedingStations: stations.default, feedingLogs: logs.default } });
  activeStore.dispatch(auth.setAuth(user(actor)));
  const cells = [], effects = [], tasks = [], committedEffects = new Map(); let cursor = 0;
  context.mock.method(mediaApi, 'beginStationImageLoad', (...args) => { const task = beginImageLoad(...args); tasks.push(task); return task; });
  context.mock.method(React, 'useState', initial => {
    const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
    return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }];
  });
  context.mock.method(React, 'useRef', initial => { const index = cursor++; return cells[index] ??= { current: initial }; });
  context.mock.method(React, 'useEffect', (effect, dependencies) => { effects.push({ index: cursor++, effect, dependencies }); });
  context.mock.method(hooks, 'useAppSelector', selector => selector(activeStore.getState()));
  context.after(() => {
    for (const effect of committedEffects.values()) effect.cleanup?.();
    for (const task of tasks) task.dispose();
  });
  return { render: (src = source) => { cursor = 0; effects.length = 0; return StationMediaImage({ src, alt: 'SYNTHETIC image' }); },
    // Explicit commits execute captured production effects in declaration order.
    // This is a hook/callback double, not React scheduling or browser rendering.
    commitEffects: () => {
      for (const effect of effects) {
        const previous = committedEffects.get(effect.index);
        if (previous && effect.dependencies?.every((value, index) => Object.is(value, previous.dependencies?.[index]))
          && effect.dependencies.length === previous.dependencies?.length) continue;
        previous?.cleanup?.();
        committedEffects.set(effect.index, { dependencies: effect.dependencies, cleanup: effect.effect() });
      }
    },
    runImageEffect: () => effects.at(-1).effect(), completed: () => tasks.at(-1)?.completed, store: activeStore };
}

test('actual station-image effect hides old decoded bytes synchronously and revokes on identity change', async context => {
  for (const [first, second] of [['a', 'b'], ['b', 'a'], ['a', 'a']]) {
    const ui = fixture(context, first), created = controlled(), revoked = [];
    context.mock.method(URL, 'createObjectURL', () => { created.resolve(); return 'blob:synthetic-old'; });
    context.mock.method(URL, 'revokeObjectURL', value => revoked.push(value));
    context.mock.method(global, 'fetch', async url => String(url).endsWith('/read-url')
      ? json({ url: 'https://synthetic-s3.invalid/image', expiresIn: 60 })
      : new Response('synthetic webp', { headers: { 'Content-Type': 'image/webp' } }));
    assert.notEqual(ui.render().type, 'img');
    const cleanup = ui.runImageEffect();
    await created.promise; await ui.completed();
    assert.equal(ui.render().type, 'img');
    ui.store.dispatch(auth.setAuth(user(second)));
    assert.notEqual(ui.render().type, 'img', 'render must gate the old image before effect cleanup, even for identical token/account');
    cleanup();
    assert.deepEqual(revoked, ['blob:synthetic-old']);
  }
});

test('obsolete Ray image 401 cannot clear the replacement account, and guests issue no read', async context => {
  const ui = fixture(context, 'a'), entered = controlled(), issuer = controlled(); let calls = 0;
  context.mock.method(global, 'fetch', () => { calls++; entered.resolve(); return issuer.promise; });
  ui.render(); const cleanup = ui.runImageEffect(); await entered.promise;
  ui.store.dispatch(auth.setAuth(user('b')));
  issuer.resolve(json({}, 401));
  await ui.completed();
  assert.equal(ui.store.getState().auth.user.id, 'b');
  assert.notEqual(ui.render().type, 'img');
  cleanup();
  ui.store.dispatch(auth.logout());
  assert.notEqual(ui.render().type, 'img');
  ui.runImageEffect();
  await ui.completed();
  assert.equal(calls, 1, 'guest must not request either the issuer or byte endpoint');
});

test('protected-image asset 404 renders a retry while only a parent 404 evicts station and feeding state', async context => {
  const ui = fixture(context, 'a');
  const stationId = '000000000000000000000001';
  const station = { _id: stationId, name: 'SYNTHETIC media parent', location: { lat: 32.1, lng: 34.8 }, estimatedCats: 2, estimatedKittens: 0,
    active: true, permissions: { canManage: false, canFeed: true } };
  const detail = { ...station, image: source, notes: 'Synthetic fixture only' };
  const history = [{ _id: '000000000000000000000002', stationId, food: true, water: false,
    fedAt: '2026-11-05T10:00:00.000Z', createdAt: '2026-11-05T10:00:00.000Z', updatedAt: '2026-11-05T10:00:00.000Z' }];
  const summary = { food: { recency: 'under-2h' }, water: { recency: 'no-record' } };
  const parent = controlled(), parentStarted = controlled(); let missingParent = false, apiCalls = 0, imageCalls = 0;
  useAdapter(context, config => {
    apiCalls++;
    assert.equal(config.headers.get('Authorization'), 'Bearer synthetic-same-token');
    if (config.url === '/api/feeding-stations') return Promise.resolve(response(config, [station]));
    if (config.url.endsWith('/feedings')) return Promise.resolve(response(config, history));
    if (config.url.endsWith('/feeding-summary')) return Promise.resolve(response(config, summary));
    assert.equal(config.url, `/api/feeding-stations/${stationId}`);
    if (missingParent) { parentStarted.resolve(config); return parent.promise; }
    return Promise.resolve(response(config, detail));
  });
  for (const task of [fetchFeedingStations(), fetchFeedingStationDetail(stationId), fetchFeedingLogsForStation(stationId), fetchFeedingSummaryForStation(stationId)]) {
    assert.match((await ui.store.dispatch(task)).type, /\/fulfilled$/);
  }
  const before = ui.store.getState();
  context.mock.method(global, 'fetch', async url => {
    imageCalls++; assert.equal(url, source.replace('/content', '/read-url'));
    return json({ message: 'Synthetic asset missing' }, 404);
  });
  ui.render(); ui.commitEffects(); await ui.completed();
  const fallback = ui.render(); ui.commitEffects();
  assert.equal(fallback.type, 'span'); assert.equal(fallback.props.role, 'status');
  assert.ok(text(fallback).includes(translate('media.unavailable')));
  assert.equal(text(retryButton(fallback)), translate('media.retry'));
  assert.equal(retryButton(fallback).props.disabled, false);
  assert.deepEqual(ui.store.getState(), before, 'an asset failure must not remove its parent, own history, summary or authentication');
  assert.equal(imageCalls, 1); assert.equal(apiCalls, 4, 'rendering an asset error starts no parent refresh or automatic image retry');

  missingParent = true;
  const task = ui.store.dispatch(fetchFeedingStationDetail(stationId));
  const config = await parentStarted.promise;
  assert.equal(ui.store.getState().feedingLogs.byStationId[stationId].data.length, 1, 'pending parent requests preserve existing history');
  parent.reject(new AxiosError('Synthetic parent missing', 'ERR_BAD_REQUEST', config, null, response(config, {}, 404)));
  const result = await task;
  assert.equal(result.payload.status, 404);
  const after = ui.store.getState();
  assert.deepEqual(after.feedingStations.data, []);
  assert.equal(after.feedingStations.detailsById[stationId].data, null);
  assert.equal(after.feedingStations.unavailableIds[stationId], true);
  assert.equal(after.feedingLogs.byStationId[stationId], undefined);
  assert.deepEqual(after.auth, before.auth, 'a missing station does not expire the current Ray identity');
  assert.equal(apiCalls, 5); assert.equal(imageCalls, 1);
});

test('private byte 401 and 404 remain image failures; only the current Ray issuer 401 expires authentication', async context => {
  for (const status of [401, 404]) {
    const ui = fixture(context, 'a'); let calls = 0;
    const before = ui.store.getState().auth;
    context.mock.method(global, 'fetch', async url => {
      calls++;
      return String(url).endsWith('/read-url') ? json({ url: 'https://synthetic-s3.invalid/missing', expiresIn: 60 })
        : new Response(null, { status });
    });
    context.mock.method(URL, 'createObjectURL', () => assert.fail('failed bytes cannot become an object URL'));
    ui.render(); ui.commitEffects(); await ui.completed();
    const fallback = ui.render(); ui.commitEffects();
    assert.equal(fallback.props.role, 'status');
    assert.ok(text(fallback).includes(translate('media.unavailable')));
    assert.ok(retryButton(fallback));
    assert.deepEqual(ui.store.getState().auth, before, `byte ${status} is not a Ray authentication result`);
    assert.equal(calls, 2, 'failed byte reads must not renew the capability automatically');
  }
  const ui = fixture(context, 'a'); let calls = 0;
  context.mock.method(global, 'fetch', async () => { calls++; return json({}, 401); });
  ui.render(); ui.commitEffects(); await ui.completed();
  assert.equal(ui.store.getState().auth.user, null);
  assert.equal(ui.render().type, 'span');
  assert.equal(calls, 1, 'current issuer rejection must stop before any private-byte request');
});

test('protected-image Retry-After gates its actual button and permits only one explicit retry without automatic requests', async context => {
  const ui = fixture(context, 'a'); let calls = 0, now = 0, nextTimer = 0;
  const timers = new Map();
  // Controlled hook timers, not browser elapsed-time or scheduling evidence.
  context.mock.method(global, 'setTimeout', (callback, milliseconds) => {
    assert.equal(milliseconds, 5000);
    const handle = ++nextTimer; timers.set(handle, { at: now + milliseconds, callback }); return handle;
  });
  context.mock.method(global, 'clearTimeout', handle => { timers.delete(handle); });
  const advance = milliseconds => {
    now += milliseconds;
    for (const [handle, timer] of [...timers]) if (timer.at <= now) { timers.delete(handle); timer.callback(); }
  };
  context.mock.method(global, 'fetch', async () => { calls++; return json({}, 429, { 'Retry-After': '5' }); });
  ui.render(); ui.commitEffects(); await ui.completed();
  let fallback = ui.render(); ui.commitEffects();
  assert.equal(fallback.props.role, 'status');
  assert.ok(text(fallback).includes(translate('errors.rateLimitedWait', { count: 5 })));
  assert.equal(retryButton(fallback).props.disabled, true);
  assert.equal(calls, 1); assert.equal(timers.size, 1);
  advance(4999); fallback = ui.render(); ui.commitEffects();
  assert.equal(retryButton(fallback).props.disabled, true); assert.equal(calls, 1);
  advance(1); fallback = ui.render(); ui.commitEffects();
  assert.equal(retryButton(fallback).props.disabled, false);
  assert.equal(calls, 1, 'expiry only enables the control; it cannot schedule a request');
  retryButton(fallback).props.onClick();
  assert.equal(calls, 1, 'the callback only changes retry identity until effects are explicitly committed');
  ui.render(); ui.commitEffects(); await ui.completed();
  fallback = ui.render(); ui.commitEffects();
  assert.equal(retryButton(fallback), undefined, 'failed explicit retry offers no second retry for the same source/session');
  assert.equal(calls, 2);
  advance(5000); ui.render(); ui.commitEffects();
  assert.equal(calls, 2, 'neither retry wait nor subsequent render starts an automatic request');
  assert.equal(ui.store.getState().auth.user.id, 'a');
});

test('protected-image decode-error callback revokes once and a new source or session restores one retry', async context => {
  const ui = fixture(context, 'a'), revoked = []; let created = 0, calls = 0;
  context.mock.method(URL, 'createObjectURL', () => `blob:synthetic-callback-${++created}`);
  context.mock.method(URL, 'revokeObjectURL', value => revoked.push(value));
  context.mock.method(global, 'fetch', async url => {
    calls++;
    return String(url).endsWith('/read-url') ? json({ url: 'https://synthetic-s3.invalid/image', expiresIn: 60 })
      : new Response('synthetic nondecoding bytes', { headers: { 'Content-Type': 'image/webp' } });
  });
  const failDisplayedImage = async src => {
    ui.render(src); ui.commitEffects(); await ui.completed();
    const image = ui.render(src); ui.commitEffects();
    assert.equal(image.type, 'img'); assert.equal(image.props.referrerPolicy, 'no-referrer');
    const before = calls;
    // Manually deliver the actual component callback; no decoder is present.
    image.props.onError(); image.props.onError();
    const fallback = ui.render(src); ui.commitEffects();
    assert.equal(fallback.props.role, 'status');
    assert.ok(text(fallback).includes(translate('media.unavailable')));
    assert.equal(calls, before, 'decode-error handling only disposes and renders fallback');
    assert.deepEqual(revoked, Array.from({ length: created }, (_, index) => `blob:synthetic-callback-${index + 1}`));
    return fallback;
  };
  let fallback = await failDisplayedImage(source);
  retryButton(fallback).props.onClick();
  fallback = await failDisplayedImage(source);
  assert.equal(retryButton(fallback), undefined);
  const changedSource = source.replace('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
  fallback = await failDisplayedImage(changedSource);
  assert.ok(retryButton(fallback), 'new source has its own initial retry');
  retryButton(fallback).props.onClick();
  fallback = await failDisplayedImage(changedSource);
  assert.equal(retryButton(fallback), undefined);
  ui.store.dispatch(auth.setAuth(user('b')));
  fallback = await failDisplayedImage(changedSource);
  assert.ok(retryButton(fallback), 'new session cannot inherit the exhausted prior-session retry');
  assert.equal(created, 5); assert.equal(calls, 10);
});
