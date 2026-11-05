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
let activeStore;
let navigations = [];
const reduxFile = require.resolve('react-redux');
const redux = require(reduxFile);
require.cache[reduxFile].exports = { ...redux, useStore: () => activeStore };
const routerFile = require.resolve('react-router-dom');
const router = require(routerFile);
require.cache[routerFile].exports = { ...router, useNavigate: () => path => navigations.push(path) };
const leafletFile = require.resolve('leaflet');
require.cache[leafletFile] = { id: leafletFile, filename: leafletFile, loaded: true, exports: { Icon: class Icon {} } };
let activeMap;
let mapEvents;
const mapFile = require.resolve('react-leaflet');
require.cache[mapFile] = { id: mapFile, filename: mapFile, loaded: true, exports: {
  MapContainer: 'map-container-fixture', TileLayer: 'tile-layer-fixture', Marker: 'marker-fixture',
  useMap: () => activeMap,
  useMapEvents: handlers => { mapEvents = handlers; return activeMap; },
} };
const MapPreview = require('../src/components/mapPreview/MapPreview.tsx').default;
const ReportForm = require('../src/components/reportForm/ReportForm.tsx').default;
const Report = require('../src/pages/report/Report.tsx').default;
const { isValidMapLocation } = require('../src/components/mapPreview/location.ts');
const { t } = require('../src/i18n/index.ts');
const hooks = require('../src/app/hooks.ts');
const media = require('../src/components/media/Media.tsx');
const { configureStore } = require('@reduxjs/toolkit');
const auth = require('../src/features/auth/authSlice.ts');
const reportsReducer = require('../src/features/reports/reportsSlice.ts').default;
const { http } = require('../src/api/http.ts');

function find(element, predicate) {
  if (!element || typeof element !== 'object') return;
  if (Array.isArray(element)) {
    for (const child of element) { const found = find(child, predicate); if (found) return found; }
    return;
  }
  return predicate(element) ? element : find(element.props?.children, predicate);
}

const text = element => element === null || element === undefined || typeof element === 'boolean' ? ''
  : Array.isArray(element) ? element.map(text).join('')
    : typeof element === 'object' ? text(element.props?.children) : String(element);
const button = (tree, key) => find(tree, element => element.type === 'button' && text(element) === t(key));
const submit = tree => find(tree, element => element.type === 'button' && element.props.type === 'submit');
const sameDependencies = (before, after) => before && after && before.length === after.length && before.every((value, index) => Object.is(value, after[index]));

// The production components, hook state, effects and retained callbacks execute
// against bounded hook/Leaflet doubles. This is automated simulation evidence,
// not React DOM mounting, native keyboard/Leaflet input or reader acceptance.
function fixture(context) {
  const scopes = new Map();
  let scope;
  let cursor;
  const cell = init => {
    const index = cursor++;
    if (!(index in scope.cells)) scope.cells[index] = init();
    return scope.cells[index];
  };
  context.mock.method(React, 'useState', initial => {
    const state = cell(() => ({ value: typeof initial === 'function' ? initial() : initial }));
    return [state.value, value => { state.value = typeof value === 'function' ? value(state.value) : value; }];
  });
  context.mock.method(React, 'useRef', initial => cell(() => ({ current: initial })));
  const memo = (factory, dependencies) => {
    const state = cell(() => ({}));
    if (!sameDependencies(state.dependencies, dependencies)) { state.value = factory(); state.dependencies = dependencies; }
    return state.value;
  };
  context.mock.method(React, 'useCallback', (callback, dependencies) => memo(() => callback, dependencies));
  context.mock.method(React, 'useMemo', memo);
  context.mock.method(React, 'useId', () => cell(() => 'synthetic-report-location-' + cursor));
  context.mock.method(React, 'useEffect', (effect, dependencies) => {
    const state = cell(() => ({}));
    if (!sameDependencies(state.dependencies, dependencies)) {
      scope.pending.push(() => { state.cleanup?.(); state.cleanup = effect(); state.dependencies = dependencies; });
    }
  });
  context.mock.method(hooks, 'useAppDispatch', () => activeStore.dispatch);
  context.mock.method(hooks, 'useAppSelector', selector => selector(activeStore.getState()));
  context.mock.method(media, 'useMediaCapability', () => false);
  context.mock.method(globalThis, 'fetch', () => assert.fail('Location regressions must not issue external HTTP'));
  context.after(() => { for (const state of scopes.values()) for (const item of state.cells) item?.cleanup?.(); });
  const render = (Component, props = {}) => {
    scope = scopes.get(Component);
    if (!scope) scopes.set(Component, scope = { cells: [], pending: [] });
    cursor = 0;
    const tree = Component(props);
    for (const effect of scope.pending.splice(0)) effect();
    return tree;
  };
  return { render };
}

function mapFixture(context, initial = null, disabled = false) {
  const ui = fixture(context);
  const selected = [];
  const attributes = new Map();
  let center = { lat: 32.0853, lng: 34.7818 };
  const point = (lat, lng) => ({ lat, lng, wrap: () => ({ lat, lng: lng >= -180 && lng <= 180 ? lng : ((lng + 180) % 360 + 360) % 360 - 180 }) });
  activeMap = {
    getCenter: () => point(center.lat, center.lng),
    getContainer: () => ({ setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name) }),
  };
  const props = { selectedLocation: initial, disabled, describedBy: 'synthetic-location-hint', onSelect: value => { selected.push(value); props.selectedLocation = value; } };
  const render = () => {
    const tree = ui.render(MapPreview, props);
    const map = find(tree, element => element.type === 'map-container-fixture');
    assert.ok(map, 'keep one existing map for changing and clearing a point');
    const ref = map.props.ref;
    if (typeof ref === 'function') ref(activeMap);
    else if (ref) ref.current = activeMap;
    return tree;
  };
  return { renderComponent: ui.render, render, props, selected, attributes, point, pan: value => { center = value; } };
}

const formProps = overrides => ({
  description: 'תיאור שמור Cat Кот 42', setDescription() {}, handleSubmit() {}, useLocation() {},
  location: null, setLocation() {}, type: 'general', setType() {}, mediaFiles: [], setMediaFiles() {}, ...overrides,
});

function reportFixture(context, signedIn = false) {
  const ui = fixture(context);
  activeStore = configureStore({ reducer: { auth: auth.default, reports: reportsReducer } });
  if (signedIn) activeStore.dispatch(auth.setAuth({ id: 'synthetic-user', token: 'synthetic-token', firstName: 'Synthetic', lastName: 'Carer', email: 'carer@example.invalid' }));
  const originalAdapter = http.defaults.adapter;
  context.after(() => { http.defaults.adapter = originalAdapter; });
  navigations = [];
  const requests = [];
  http.defaults.adapter = async config => {
    requests.push(config);
    return { config, status: 200, statusText: 'OK', headers: {}, data: {
      _id: 'synthetic-report', ...JSON.parse(config.data), status: 'new', media: [],
      createdAt: '2026-11-05T09:00:00Z', updatedAt: '2026-11-05T09:00:00Z', distanceKm: null,
    } };
  };
  const watches = [];
  const cleared = [];
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: {
    watchPosition(success, error) { watches.push({ success, error }); return watches.length - 1; },
    clearWatch(id) { cleared.push(id); },
  } } });
  context.after(() => { if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator; });
  const render = () => {
    const boundary = ui.render(Report);
    return ui.render(boundary.type, boundary.props);
  };
  const props = () => find(render(), element => element.type === ReportForm).props;
  return { ...ui, render, props, requests, watches, cleared, store: activeStore };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a report without an initial location has a real named map-center button', context => {
  const ui = mapFixture(context);
  const tree = ui.render();
  const control = button(tree, 'reports.selectMapCenter');
  assert.ok(control, 'keyboard users need a real focusable center-selection button before any point exists');
  assert.equal(control.props.type, 'button');
  assert.notEqual(control.props.disabled, true);
  const clear = button(tree, 'reports.clearLocation');
  assert.ok(clear, 'keep the clear control mounted so disabling it does not remove the focused node');
  assert.equal(clear.props.disabled, true);
  assert.equal(find(tree, element => element.type === 'marker-fixture'), undefined);
});

test('simulated viewport movement selects the current wrapped map center, changes and clears the point', context => {
  const ui = mapFixture(context);
  ui.render();
  ui.pan({ lat: 31.7, lng: 395 });
  button(ui.render(), 'reports.selectMapCenter').props.onClick();
  assert.deepEqual(ui.selected, [{ lat: 31.7, lng: 35 }], 'selection reads the current camera, not the initial center prop');
  const marker = find(ui.render(), element => element.type === 'marker-fixture');
  assert.deepEqual(marker.props.position, [31.7, 35]);
  assert.equal(marker.props.draggable, true);
  ui.pan({ lat: 32.2, lng: 34.9 });
  button(ui.render(), 'reports.selectMapCenter').props.onClick();
  assert.deepEqual(ui.selected.at(-1), { lat: 32.2, lng: 34.9 });
  const mapBeforeClear = find(ui.render(), element => element.type === 'map-container-fixture');
  button(ui.render(), 'reports.clearLocation').props.onClick();
  const cleared = ui.render();
  assert.equal(ui.selected.at(-1), null);
  assert.equal(find(cleared, element => element.type === 'marker-fixture'), undefined);
  assert.equal(button(cleared, 'reports.clearLocation').props.disabled, true);
  assert.equal(find(cleared, element => element.type === 'map-container-fixture').key, mapBeforeClear.key, 'location changes must not remount the map');
});

test('pointer selection and marker drag keep working with the Hebrew labelled keyboard map', context => {
  const ui = mapFixture(context, { lat: 32, lng: 34 });
  const tree = ui.render();
  const listener = find(tree, element => typeof element.type === 'function' && element.type.name === 'LocationMarker');
  assert.ok(listener);
  ui.renderComponent(listener.type, listener.props);
  assert.equal(ui.attributes.get('role'), 'region', 'the keyboard map must support its accessible name');
  assert.equal(ui.attributes.get('aria-label'), t('reports.locationMap'));
  const describedBy = ui.attributes.get('aria-describedby');
  assert.equal(describedBy, 'synthetic-location-hint');
  mapEvents.click({ latlng: ui.point(31.8, 35.1) });
  assert.deepEqual(ui.selected.at(-1), { lat: 31.8, lng: 35.1 });
  const marker = find(ui.render(), element => element.type === 'marker-fixture');
  assert.equal(marker.props.title, t('map.locationMarker'));
  assert.equal(marker.props.alt, t('map.locationMarker'));
  marker.props.eventHandlers.dragend({ target: { getLatLng: () => ui.point(32.4, 34.7) } });
  assert.deepEqual(ui.selected.at(-1), { lat: 32.4, lng: 34.7 });
});

test('pending report disables center/clear, makes the map inert and rejects retained pointer handlers', context => {
  const ui = mapFixture(context, { lat: 32, lng: 34 }, true);
  const tree = ui.render();
  assert.equal(button(tree, 'reports.selectMapCenter').props.disabled, true);
  assert.equal(button(tree, 'reports.clearLocation').props.disabled, true);
  assert.ok(find(tree, element => element.props?.inert === true), 'fieldset alone does not disable Leaflet input');
  const listener = find(tree, element => typeof element.type === 'function' && element.type.name === 'LocationMarker');
  ui.renderComponent(listener.type, listener.props);
  mapEvents.click({ latlng: ui.point(31, 35) });
  const marker = find(tree, element => element.type === 'marker-fixture');
  marker.props.eventHandlers.dragend({ target: { getLatLng: () => ui.point(31, 35) } });
  assert.deepEqual(ui.selected, []);
});

test('finite geographic validation preserves zero and rejects missing or out-of-range locations', () => {
  for (const location of [null, { lat: NaN, lng: 34 }, { lat: 32, lng: Infinity }, { lat: 90.01, lng: 0 }, { lat: -90.01, lng: 0 }, { lat: 0, lng: 180.01 }, { lat: 0, lng: -180.01 }]) {
    assert.equal(isValidMapLocation(location), false);
  }
  for (const location of [{ lat: 0, lng: 0 }, { lat: 90, lng: 180 }, { lat: -90, lng: -180 }, { lat: 32.1, lng: 34.8 }]) {
    assert.equal(isValidMapLocation(location), true);
  }
});

test('report form announces Hebrew location and changing coordinates, keeps missing/invalid submissions disabled', context => {
  const ui = fixture(context);
  for (const location of [null, { lat: NaN, lng: 34 }, { lat: 91, lng: 34 }]) {
    const tree = ui.render(ReportForm, formProps({ location }));
    assert.equal(submit(tree).props.disabled, true);
    assert.ok(text(tree).includes(t('reports.locationMissing')));
  }
  const tree = ui.render(ReportForm, formProps({ location: { lat: 32.1, lng: 34.8 } }));
  assert.equal(submit(tree).props.disabled, false);
  const status = find(tree, element => element.props?.role === 'status');
  assert.ok(status);
  assert.equal(status.props['aria-live'], 'polite');
  assert.ok(text(status).includes(t('reports.locationReady')));
  const coordinates = find(status, element => element.type === 'bdi' && element.props.dir === 'ltr');
  assert.ok(coordinates, 'isolate coordinates from Hebrew RTL copy');
  assert.match(text(coordinates), /32\.10000.*34\.80000/);
  const changed = ui.render(ReportForm, formProps({ location: { lat: 31.2, lng: 35.3 } }));
  assert.match(text(find(changed, element => element.props?.role === 'status')), /31\.20000.*35\.30000/);
  assert.equal(submit(ui.render(ReportForm, formProps({ description: ' ', location: { lat: 0, lng: 0 } }))).props.disabled, true);
  const pending = ui.render(ReportForm, formProps({ pending: true, location: { lat: 0, lng: 0 } }));
  assert.equal(find(pending, element => element.type === 'fieldset').props.disabled, true);
  assert.equal(find(pending, element => element.type === MapPreview).props.disabled, true);
  const map = find(tree, element => element.type === MapPreview);
  assert.ok(find(tree, element => element.props?.id === map.props.describedBy), 'keyboard map instructions must exist');
});

test('typed Hebrew location copy describes keyboard movement and selection without exposing translation keys', () => {
  for (const key of ['reports.locationMap', 'reports.selectMapCenter', 'reports.clearLocation', 'reports.locationInvalid', 'reports.chooseLocationHint']) {
    assert.match(t(key), /[\u0590-\u05FF]/);
    assert.notEqual(t(key), key);
  }
  assert.match(t('reports.chooseLocationHint'), /חצים/);
  assert.match(t('reports.chooseLocationHint'), /מרכז/);
});

test('manual selection/change/clear retain the complete Report draft and fence queued geolocation callbacks', context => {
  const ui = reportFixture(context);
  const description = 'חתול Cat Кот 42 — תיאור שמור';
  const selectedFile = new File(['synthetic'], 'synthetic.png', { type: 'image/png' });
  ui.props().setDescription(description);
  ui.props().setType('food');
  ui.props().setMediaFiles([selectedFile]);
  ui.props().useLocation();
  assert.equal(ui.watches.length, 1);
  const stale = ui.watches[0];
  ui.props().setLocation({ lat: 32.1, lng: 34.8 });
  assert.deepEqual(ui.cleared, [0]);
  stale.success({ coords: { latitude: 30, longitude: 33 } });
  stale.error({ code: 1 });
  assert.deepEqual(ui.props().location, { lat: 32.1, lng: 34.8 });
  assert.equal(find(ui.render(), element => element.props?.role === 'alert'), undefined);
  ui.props().setLocation({ lat: 31.9, lng: 35.2 });
  ui.props().setLocation(null);
  stale.success({ coords: { latitude: 30, longitude: 33 } });
  const retained = ui.props();
  assert.equal(retained.location, null);
  assert.equal(retained.description, description);
  assert.equal(retained.type, 'food');
  assert.equal(retained.mediaFiles[0], selectedFile);
});

test('latest geolocation intent wins, invalid/denied device location keeps manual report usable', context => {
  const ui = reportFixture(context);
  ui.props().useLocation();
  ui.props().useLocation();
  assert.deepEqual(ui.cleared, [0]);
  ui.watches[0].success({ coords: { latitude: 30, longitude: 33 } });
  assert.equal(ui.props().location, null);
  ui.watches[1].success({ coords: { latitude: 91, longitude: 33 } });
  assert.equal(ui.props().location, null);
  assert.equal(text(find(ui.render(), element => element.props?.role === 'alert')), t('reports.locationInvalid'));
  ui.watches[1].error({ code: 1 });
  assert.equal(text(find(ui.render(), element => element.props?.role === 'alert')), t('reports.locationDenied'));
  ui.props().setLocation({ lat: 0, lng: 0 });
  assert.deepEqual(ui.props().location, { lat: 0, lng: 0 });
  assert.equal(find(ui.render(), element => element.props?.role === 'alert'), undefined);
});

test('Report submit callback rejects a missing location and invalid manual input before HTTP', async context => {
  const ui = reportFixture(context);
  ui.props().setDescription('תיאור סינתטי');
  ui.props().handleSubmit({ preventDefault() {} });
  await settle();
  assert.equal(ui.requests.length, 0);
  assert.equal(text(find(ui.render(), element => element.props?.role === 'alert')), t('reports.locationRequired'));
  ui.props().setLocation({ lat: 91, lng: 34 });
  assert.equal(ui.props().location, null);
  assert.equal(text(find(ui.render(), element => element.props?.role === 'alert')), t('reports.locationInvalid'));
  ui.props().handleSubmit({ preventDefault() {} });
  await settle();
  assert.equal(ui.requests.length, 0);
});

test('guest Report sends the unchanged valid location/type/no-image payload without geolocation or Bearer', async context => {
  const ui = reportFixture(context);
  const description = 'דיווח סינתטי Cat Кот 42';
  const location = { lat: 0, lng: 0 };
  ui.props().setDescription(description);
  ui.props().setType('food');
  ui.props().setLocation(location);
  const data = ui.props();
  assert.equal(data.signedIn, false);
  data.handleSubmit({ preventDefault() {} });
  await settle();
  assert.equal(ui.requests.length, 1);
  assert.deepEqual(JSON.parse(ui.requests[0].data), { description, location, type: 'food', mediaAssetIds: [] });
  assert.equal(ui.requests[0].headers.get('Authorization'), undefined);
  assert.equal(ui.watches.length, 0);
  assert.deepEqual(navigations, ['/map-page']);
});

test('report form keeps a labelled location group and mixed-language description semantics', context => {
  const ui = fixture(context);
  const tree = ui.render(ReportForm, formProps());
  const map = find(tree, element => element.type === MapPreview);
  assert.equal(map.props.selectedLocation, null);
  const description = find(tree, element => element.type === 'textarea');
  assert.equal(description.props.dir, 'auto');
  assert.ok(find(tree, element => element.type === 'label' && element.props.htmlFor === description.props.id));
  const group = find(tree, element => element.props?.role === 'group');
  assert.ok(group);
  assert.equal(text(find(group, element => element.props?.id === group.props['aria-labelledby'])), t('reports.location'));
});
