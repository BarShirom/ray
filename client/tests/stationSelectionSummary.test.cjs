const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
    .replaceAll('import.meta.env.VITE_API_URL', JSON.stringify('http://fixture.invalid'))
    .replaceAll('import.meta.env.MODE', JSON.stringify('postgres'));
  module._compile(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
require.extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let activeStore;
const reduxFile = require.resolve('react-redux');
require.cache[reduxFile] = { id: reduxFile, filename: reduxFile, loaded: true, exports: { ...require(reduxFile), useStore: () => activeStore } };
const { AxiosError, AxiosHeaders } = require('axios');
const auth = require('../src/features/auth/authSlice.ts');
const { createRayStore, persistor } = require('../src/app/store.ts');
persistor.pause();
const { http } = require('../src/api/http.ts');
const hooks = require('../src/app/hooks.ts');
const Summary = require('../src/components/mapSelection/StationSelectionSummary.tsx').default;
const Details = require('../src/components/feedingStationDetails/FeedingStationDetails.tsx').default;
const { fetchFeedingSummaryForStation, fetchFeedingLogsForStation } = require('../src/features/feedingLogs/feedingLogsThunks.ts');
const { fetchFeedingStationDetail } = require('../src/features/feedingStations/feedingStationsThunks.ts');
const { t } = require('../src/i18n/index.ts');
const { formatNumber } = require('../src/i18n/formatters.ts');
const user = actor => ({ id: 'synthetic-' + actor, token: 'synthetic-token-' + actor, firstName: actor, lastName: 'Fixture', email: actor + '@example.invalid' });
const station = (id = 'selected-station', active = true) => ({ _id: id, name: 'Synthetic station', active,
  estimatedCats: 4, estimatedKittens: 0, location: { lat: 32, lng: 34 }, permissions: { canFeed: active, canManage: false } });
const settle = () => new Promise(resolve => setImmediate(resolve));
function find(element, predicate) {
  if (!element || typeof element !== 'object') return;
  if (Array.isArray(element)) {
    for (const child of element) { const found = find(child, predicate); if (found) return found; }
    return;
  }
  return predicate(element) ? element : find(element.props?.children, predicate);
}

// Captured real React hook callbacks and production thunks/reducers with bounded
// HTTP responses. This does not model native layout, focus or browser scheduling.
function fixture(context, { authenticated = true, selected = station(), Component = Summary } = {}) {
  const runtime = createRayStore(null);
  context.after(() => runtime.dispose());
  activeStore = runtime.store;
  if (authenticated) activeStore.dispatch(auth.setAuth(user('A')));
  const store = activeStore, cells = [], effects = [], requests = [];
  let cursor = 0, parentClosed = 0;
  context.mock.method(React, 'useState', initial => {
    const index = cursor++;
    if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
    return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }];
  });
  context.mock.method(React, 'useRef', initial => { const index = cursor++; return cells[index] ??= { current: initial }; });
  context.mock.method(React, 'useEffect', (effect, dependencies) => { effects.push({ effect, dependencies }); });
  context.mock.method(hooks, 'useAppDispatch', () => store.dispatch);
  context.mock.method(hooks, 'useAppSelector', selector => selector(store.getState()));
  context.mock.method(http, 'get', url => new Promise((resolve, reject) => requests.push({ url, resolve: data => resolve({ data }), reject })));
  context.mock.method(http, 'post', () => assert.fail('Compact station selection must never write'));
  const render = () => { cursor = 0; effects.length = 0; return Component({ station: selected, onClose() { parentClosed++; } }); };
  let tree = render(), cleanup;
  return {
    store, requests,
    parentClosed: () => parentClosed,
    render() { tree = render(); return tree; },
    markup() { return renderToStaticMarkup(this.render()); },
    mount() { cleanup = effects.find(effect => effect.dependencies.length === 4).effect(); },
    replay() { cleanup?.(); this.mount(); },
    unmount() { cleanup?.(); },
    runRetryGate() { return effects.find(effect => effect.dependencies.length === 2).effect(); },
    runRetryGates() { return effects.filter(effect => effect.dependencies.length === 2).map(effect => effect.effect()); },
    retry() { return find(this.render(), node => node.type === 'button'); },
  };
}

test('expanding full station details preserves compact summary errors and does not bypass the explicit retry boundary', context => {
  const ui = fixture(context, { Component: Details });
  const sessionId = ui.store.getState().auth.sessionId, stationId = 'selected-station', requestId = 'summary-error';
  ui.store.dispatch({ ...fetchFeedingSummaryForStation.pending(requestId, stationId), meta: { requestId, arg: stationId, sessionId } });
  ui.store.dispatch({ ...fetchFeedingSummaryForStation.rejected(null, requestId, stationId, {
    kind: 'rate-limit', status: 429, retryAfter: 60, sessionId, requestId, source: 'http', message: 'Synthetic throttling',
  }), meta: { requestId, arg: stationId, sessionId } });
  ui.render(); ui.mount();
  assert.deepEqual(ui.requests.map(request => request.url), [
    '/api/feeding-stations/selected-station',
    '/api/feeding-stations/selected-station/feedings',
  ], 'full details may load detail and own history, but cannot repeat a failed summary automatically');
  const retry = find(ui.render(), node => node.type === 'button' && node.props.disabled === true && node.props.children === t('feeding.retry'));
  assert.ok(retry, 'the existing disabled summary retry remains available');
  ui.unmount();
});

test('reopening full details preserves detail and own-history 429 gates until explicit retries', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const ui = fixture(context, { Component: Details });
  const stationId = 'selected-station', sessionId = ui.store.getState().auth.sessionId;
  for (const [index, thunk] of [fetchFeedingStationDetail, fetchFeedingSummaryForStation, fetchFeedingLogsForStation].entries()) {
    const requestId = 'throttled-' + index;
    ui.store.dispatch({ ...thunk.pending(requestId, stationId), meta: { requestId, arg: stationId, sessionId } });
    ui.store.dispatch({ ...thunk.rejected(null, requestId, stationId, {
      kind: 'rate-limit', status: 429, retryAfter: 2, sessionId, requestId, source: 'http', message: 'Synthetic throttling',
    }), meta: { requestId, arg: stationId, sessionId } });
  }
  let tree = ui.render();
  ui.mount(); ui.replay();
  assert.deepEqual(ui.requests, [], 'opening and StrictMode replay cannot implicitly retry any throttled resource');
  const detailRetry = () => find(tree, node => node.type === 'button' && node.props.children === t('feeding.retry'));
  const historyRetry = () => find(find(tree, node => node.props?.className === 'station-feeding-history'), node => node.type === 'button' && node.props.children === t('feeding.retry'));
  assert.equal(detailRetry().props.disabled, true);
  assert.equal(historyRetry().props.disabled, true);
  const cleanups = ui.runRetryGates();
  context.mock.timers.tick(2000);
  tree = ui.render();
  assert.equal(detailRetry().props.disabled, false);
  assert.equal(historyRetry().props.disabled, false);
  assert.deepEqual(ui.requests, [], 'elapsed retry time never schedules a read');
  detailRetry().props.onClick();
  historyRetry().props.onClick();
  assert.deepEqual(ui.requests.map(request => request.url), [
    '/api/feeding-stations/selected-station',
    '/api/feeding-stations/selected-station/feedings',
  ], 'each deliberate retry reaches its existing service only once');
  for (const cleanup of cleanups) cleanup?.();
  ui.unmount();
});

test('reopening full details does not duplicate pending detail, summary or own-history reads', context => {
  const ui = fixture(context, { Component: Details });
  const stationId = 'selected-station', sessionId = ui.store.getState().auth.sessionId;
  for (const [index, thunk] of [fetchFeedingStationDetail, fetchFeedingSummaryForStation, fetchFeedingLogsForStation].entries()) {
    const requestId = 'pending-' + index;
    ui.store.dispatch({ ...thunk.pending(requestId, stationId), meta: { requestId, arg: stationId, sessionId } });
  }
  ui.render(); ui.mount(); ui.replay();
  assert.deepEqual(ui.requests, []);
  ui.unmount();
});

test('a retained full-station close callback cannot dismiss or present a replacement account selection', context => {
  const ui = fixture(context, { Component: Details });
  const close = find(ui.render(), node => node.type === 'button' && node.props['aria-label'] === t('stations.closeDetails')).props.onClick;
  ui.store.dispatch(auth.setAuth(user('B')));
  close();
  assert.equal(ui.parentClosed(), 0);
  assert.equal(ui.render(), null);
});

test('only the selected station summary is fetched once through StrictMode replay, with no detail/history/image prefetch', async context => {
  const ui = fixture(context);
  ui.mount(); ui.replay();
  assert.deepEqual(ui.requests.map(request => request.url), ['/api/feeding-stations/selected-station/feeding-summary']);
  ui.requests[0].resolve({
    food: { recency: 'under-2h', fedAt: '2026-11-03T07:08:09.000Z', userId: 'SYNTHETIC_OTHER_USER', note: 'SYNTHETIC_PRIVATE_NOTE' },
    water: { recency: 'no-record' },
  });
  await settle();
  const markup = ui.markup();
  for (const key of ['map.activeStation', 'feeding.food', 'feeding.water', 'feeding.recency.under-2h', 'feeding.recency.no-record', 'feeding.summaryMeaning']) assert.ok(markup.includes(t(key)));
  assert.ok(markup.includes(t('stations.catsCount', { number: formatNumber(4) })));
  assert.ok(markup.includes(t('stations.kittensCount', { number: formatNumber(0) })));
  assert.doesNotMatch(markup, /SYNTHETIC_OTHER_USER|SYNTHETIC_PRIVATE_NOTE|07:08:09|<time|<img|<form/);
  ui.unmount(); ui.mount();
  assert.equal(ui.requests.length, 1, 'a cached approved summary needs no automatic repeat read');
  ui.unmount();
});

test('inactive station remains readable with separate food and water and no feeding form', async context => {
  const ui = fixture(context, { selected: station('inactive-station', false) });
  ui.mount();
  ui.requests[0].resolve({ food: { recency: 'older' }, water: { recency: '2-to-6h' } });
  await settle();
  const markup = ui.markup();
  for (const key of ['map.inactiveStation', 'feeding.recency.older', 'feeding.recency.2-to-6h']) assert.ok(markup.includes(t(key)));
  assert.doesNotMatch(markup, /<form|type="submit"/);
  ui.unmount();
});

test('guests never request or present station summaries', context => {
  const ui = fixture(context, { authenticated: false });
  ui.mount(); ui.replay();
  assert.equal(ui.render(), null);
  assert.equal(ui.requests.length, 0);
  ui.unmount();
});

test('429 waits and reselection never becomes an automatic retry; only an explicit current-session retry requests again', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const ui = fixture(context);
  ui.mount();
  ui.requests[0].reject(new AxiosError('Synthetic throttling', 'ERR_BAD_REQUEST', {}, null, {
    status: 429, statusText: 'Synthetic', config: {}, headers: new AxiosHeaders({ 'Retry-After': '2' }), data: {},
  }));
  await settle();
  let retry = ui.retry();
  assert.equal(retry.props.disabled, true);
  retry.props.onClick();
  ui.unmount(); ui.mount();
  assert.equal(ui.requests.length, 1, 'neither a retained disabled callback nor reselection retries a failure');
  const clearRetryGate = ui.runRetryGate();
  context.mock.timers.tick(2000);
  retry = ui.retry();
  assert.equal(retry.props.disabled, false);
  assert.equal(ui.requests.length, 1, 'elapsed retry time never schedules a network request');
  retry.props.onClick();
  assert.equal(ui.requests.length, 2);
  ui.requests[1].resolve({ food: { recency: 'no-record' }, water: { recency: 'no-record' } });
  await settle();
  assert.equal(ui.retry(), undefined);
  clearRetryGate?.(); ui.unmount();
});

for (const changedSession of ['logout', 'account B']) {
  test(`late selected-summary responses and retained retry callbacks cannot cross ${changedSession}`, async context => {
    const ui = fixture(context);
    ui.mount();
    ui.requests[0].reject(new AxiosError('Synthetic offline', 'ERR_NETWORK'));
    await settle();
    const retry = ui.retry().props.onClick;
    retry();
    assert.equal(ui.requests.length, 2);
    if (changedSession === 'logout') ui.store.dispatch(auth.logout());
    else ui.store.dispatch(auth.setAuth(user('B')));
    assert.equal(ui.render(), null, 'the previous instance renders no replacement-account station content');
    const requests = ui.requests.length;
    retry();
    assert.equal(ui.requests.length, requests, 'a retained retry cannot borrow replacement credentials');
    ui.requests[1].resolve({ food: { recency: 'under-2h' }, water: { recency: 'older' } });
    await settle();
    assert.equal(ui.store.getState().feedingLogs.byStationId['selected-station'], undefined, 'a late response cannot repopulate cleared feeding state');
    ui.unmount();
  });
}
