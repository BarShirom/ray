const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
    .replaceAll('import.meta.env.VITE_API_URL', JSON.stringify('http://fixture.invalid'))
    .replaceAll('import.meta.env.MODE', JSON.stringify('production'));
  module._compile(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
require.extensions['.css'] = () => {};
const React = require('react');
let activeStore;
const reduxFile = require.resolve('react-redux');
require.cache[reduxFile] = { id: reduxFile, filename: reduxFile, loaded: true, exports: { ...require(reduxFile), useStore: () => activeStore, useSelector: selector => selector(activeStore.getState()) } };
const { configureStore } = require('@reduxjs/toolkit');
const auth = require('../src/features/auth/authSlice.ts');
const stations = require('../src/features/feedingStations/feedingStationsSlice.ts');
const logs = require('../src/features/feedingLogs/feedingLogsSlice.ts');
const reports = require('../src/features/reports/reportsSlice.ts');
const hooks = require('../src/app/hooks.ts');
const media = require('../src/components/media/Media.tsx');
const { http } = require('../src/api/http.ts');
const { AxiosError } = require('axios');
const CreateStation = require('../src/components/createFeedingStation/CreateFeedingStation.tsx').default;
const StationDetails = require('../src/components/feedingStationDetails/FeedingStationDetails.tsx').default;
// Map callback tests use the real page and reducers; Leaflet and its children
// are not mounted. Actual camera behavior is covered separately and in-browser.
for (const request of ['react-leaflet', '../src/components/feedingStationMarker/FeedingStationMarker.tsx', '../src/components/createFeedingStation/StationLocationPicker.tsx', '../src/components/reportMarker/ReportMarker.tsx', '../src/components/mapPreview/LocalizedMapControls.tsx']) {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: request === 'react-leaflet'
    ? { MapContainer() {}, TileLayer() {}, useMap() {} } : { __esModule: true, default() {} } };
}
const MapPage = require('../src/pages/mapPage/MapPage.tsx').default;
const { t } = require('../src/i18n/index.ts');

function find(element, predicate) {
  if (!element || typeof element !== 'object') return;
  if (Array.isArray(element)) { for (const child of element) { const found = find(child, predicate); if (found) return found; } return; }
  return predicate(element) ? element : find(element.props?.children, predicate);
}
function fixture(context, Component = CreateStation, props = {}, actor = 'synthetic-a') {
  const report = { _id: 'synthetic-report', status: 'new', type: 'general', description: 'Synthetic public report', location: { lat: 32, lng: 34 }, createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z' };
  const initialReports = reports.default(undefined, { type: 'fixture' });
  activeStore = configureStore({ reducer: { auth: auth.default, feedingStations: stations.default, feedingLogs: logs.default, reports: reports.default },
    preloadedState: { reports: { ...initialReports, items: [report] } } });
  activeStore.dispatch(auth.setAuth({ id: actor, firstName: 'A', lastName: 'Fixture', email: 'a@example.invalid', token: 'synthetic-a-token' }));
  activeStore.dispatch(reports.addReport(report));
  const cells = []; let cursor = 0;
  context.mock.method(React, 'useState', initial => {
    const index = cursor++;
    if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
    return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }];
  });
  context.mock.method(React, 'useRef', initial => { const index = cursor++; return cells[index] ??= { current: initial }; });
  context.mock.method(React, 'useEffect', () => {});
  context.mock.method(React, 'useMemo', calculate => calculate());
  context.mock.method(React, 'useCallback', callback => callback);
  context.mock.method(hooks, 'useAppDispatch', () => activeStore.dispatch);
  context.mock.method(hooks, 'useAppSelector', selector => selector(activeStore.getState()));
  context.mock.method(media, 'useMediaCapability', () => false);
  context.mock.method(global, 'fetch', () => assert.fail('No image request or external fallback is allowed'));
  const calls = [], previousAdapter = http.defaults.adapter;
  http.defaults.adapter = async config => {
    calls.push(config);
    throw new AxiosError('synthetic legacy refusal', 'ERR_BAD_RESPONSE', config, null,
      { status: 503, statusText: 'Unavailable', headers: {}, config, data: { message: 'Legacy station routes are retired' } });
  };
  context.after(() => { http.defaults.adapter = previousAdapter; });
  const render = () => {
    cursor = 0;
    let element = Component({ open: true, location: { lat: 32, lng: 34 }, onCancel: () => assert.fail('Draft closed'), onChangeLocation() {}, onCreated: () => assert.fail('False success'), ...props });
    while (typeof element?.type === 'function') element = element.type(element.props);
    return element;
  };
  const input = id => find(render(), element => element.props?.id === id);
  if (Component === CreateStation) {
    input('station-name').props.onChange({ target: { value: 'SYNTHETIC station' } });
    input('station-notes').props.onChange({ target: { value: 'SYNTHETIC preserved note' } });
  }
  return { render, input, calls, submit: () => find(render(), element => element.type === 'form').props.onSubmit({ preventDefault() {} }) };
}

test('normal mode suppresses the unsupported station-image picker and has no legacy upload fallback', async context => {
  const ui = fixture(context);
  assert.equal(ui.input('station-image').props.disabled, true);
  assert.equal(ui.input('station-image').props.accept, 'image/jpeg,image/png,image/webp');
  assert.ok(find(ui.render(), element => element.type === 'p' && element.props.children === t('stations.uploadsUnavailable')));
  // Even a programmatically supplied selection must fail closed before a request.
  ui.input('station-image').props.onChange({ target: { files: [new File(['synthetic'], 'fixture.png', { type: 'image/png' })], value: 'fixture.png' } });
  await ui.submit();
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.input('station-name').props.value, 'SYNTHETIC station');
  assert.equal(ui.input('station-notes').props.value, 'SYNTHETIC preserved note');
});

test('normal-mode no-image station creation preserves the real 503 refusal without retry or alternate endpoint', async context => {
  const ui = fixture(context);
  await ui.submit();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].url, '/api/feeding-stations');
  assert.equal(ui.calls[0].headers.get('Authorization'), 'Bearer synthetic-a-token');
  assert.equal('image' in JSON.parse(ui.calls[0].data), false);
  assert.equal(activeStore.getState().feedingStations.createError.status, 503);
  assert.equal(activeStore.getState().feedingStations.createError.message, t('errors.server'));
  assert.equal(ui.input('station-name').props.value, 'SYNTHETIC station');
  assert.equal(ui.input('station-notes').props.value, 'SYNTHETIC preserved note');
});

test('a retained station-creation callback cannot create under a replacement account', async context => {
  for (const [actor, nextActor] of [['synthetic-a', 'synthetic-b'], ['synthetic-b', 'synthetic-a'], ['synthetic-a', 'synthetic-a']]) {
    const ui = fixture(context, CreateStation, {}, actor);
    const retained = find(ui.render(), element => element.type === 'form').props.onSubmit;
    activeStore.dispatch(auth.setAuth({ id: nextActor, firstName: 'Other', lastName: 'Fixture', email: 'other@example.invalid', token: 'other-synthetic-token' }));
    await retained({ preventDefault() {} });
    assert.equal(ui.calls.length, 0, 'the old form must not borrow the replacement session');
  }
});

test('retained feeding and map report-action callbacks cannot borrow a new account', async context => {
  for (const [actor, nextActor] of [['synthetic-a', 'synthetic-b'], ['synthetic-b', 'synthetic-a']]) {
    const station = { _id: 'synthetic-station', name: 'SYNTHETIC station', active: true, permissions: { canFeed: true, canManage: false }, estimatedCats: 1, estimatedKittens: 0, location: { lat: 32, lng: 34 } };
    const ui = fixture(context, StationDetails, { station, onClose() {} }, actor);
    find(ui.render(), element => element.type === 'button' && element.props.children === t('feeding.fedHere')).props.onClick();
    const retained = find(ui.render(), element => element.type === 'form').props.onSubmit;
    activeStore.dispatch(auth.setAuth({ id: nextActor, firstName: 'Other', lastName: 'Fixture', email: 'other@example.invalid', token: 'other-synthetic-token' }));
    await retained({ preventDefault() {} });
    assert.equal(ui.calls.length, 0, 'old feeding draft must not post under B');

    const map = fixture(context, MapPage, {}, actor);
    const reportCard = find(map.render(), element => element.props?.report?._id === 'synthetic-report' && typeof element.props.onPrimary === 'function');
    assert.ok(reportCard);
    activeStore.dispatch(auth.setAuth({ id: nextActor, firstName: 'Other', lastName: 'Fixture', email: 'other@example.invalid', token: 'other-synthetic-token' }));
    await reportCard.props.onPrimary('synthetic-report', 'new');
    assert.equal(map.calls.length, 0, 'old report action must not claim under B');
  }
});
