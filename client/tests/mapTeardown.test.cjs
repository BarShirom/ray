const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

// A bounded DOM double lets the installed React DOM, React Leaflet and Leaflet
// execute their real mount/unmount lifecycles offline. It has no layout engine,
// native events, tiles or accessibility tree; this is not browser acceptance.
class Node {
  constructor(name, ownerDocument, nodeType = 1) {
    this.nodeName = this.tagName = name.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
    this.namespaceURI = 'http://www.w3.org/1999/xhtml';
    this.childNodes = [];
    this.style = {};
    this.className = '';
    this.disabled = false;
    this.attributes = {};
    this.listeners = new Map();
    this.clientWidth = this.offsetWidth = 800;
    this.clientHeight = this.offsetHeight = 600;
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get children() { return this.childNodes.filter(node => node.nodeType === 1); }
  get lastChild() { return this.childNodes.at(-1) ?? null; }
  get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null; }
  get isConnected() { return this === document || Boolean(this.parentNode?.isConnected); }
  get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    if (value) this.appendChild(this.ownerDocument.createTextNode(value));
  }
  appendChild(node) { return this.insertBefore(node, null); }
  insertBefore(node, before) {
    if (node.nodeType === 11) { for (const child of [...node.childNodes]) this.insertBefore(child, before); return node; }
    node.parentNode?.removeChild(node);
    this.childNodes.splice(before ? this.childNodes.indexOf(before) : this.childNodes.length, 0, node);
    node.parentNode = this;
    return node;
  }
  removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; return node; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'class') this.className = String(value); if (name === 'disabled') this.disabled = true; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'disabled') this.disabled = false; }
  setAttributeNS(_namespace, name, value) { this.setAttribute(name, value); }
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
  hasChildNodes() { return this.childNodes.length > 0; }
  querySelector(selector) { return findNode(this, node => selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.nodeName.toLowerCase() === selector); }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }; }
  // Match the bounded focus-order model in stationDialogLifecycle.test.cjs:
  // native close can return to a connected enabled opener. Creation removes its
  // picker opener, so the parent must supply a surviving return target. Native
  // tab order, pixels and assistive-technology behavior remain browser checks.
  focus() { if (this.isConnected && !this.disabled) this.ownerDocument.activeElement = this; }
  showModal() { this.previousFocus = this.ownerDocument.activeElement; this.open = true; this.focus(); }
  close() {
    if (!this.open) return;
    this.open = false;
    if (this.previousFocus?.isConnected && !this.previousFocus.disabled) this.previousFocus.focus();
    else if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
  }
}
const document = new Node('#document', null, 9);
document.ownerDocument = document;
document.createElement = name => new Node(name, document);
document.createElementNS = (_namespace, name) => {
  const node = document.createElement(name);
  // Let Leaflet mount/remove the real SVG path used by the selected-point
  // CircleMarker. This models renderer availability, not SVG layout or pixels.
  if (name === 'svg') node.createSVGRect = () => ({});
  return node;
};
document.createTextNode = value => Object.assign(new Node('#text', document, 3), { nodeValue: String(value) });
document.createDocumentFragment = () => new Node('#fragment', document, 11);
document.documentElement = document.appendChild(document.createElement('html'));
document.body = document.documentElement.appendChild(document.createElement('body'));
document.activeElement = document.body;
document.querySelector = () => null;
const window = new Node('window', document, 0);
Object.assign(window, { document, screen: { deviceXDPI: 96, logicalXDPI: 96 }, devicePixelRatio: 1,
  location: new URL('http://fixture.invalid/map'),
  HTMLElement: Node, HTMLIFrameElement: class extends Node {},
  getComputedStyle: node => ({ position: node.style.position ?? 'static', ...node.style }),
  requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout });
document.defaultView = window;
Object.assign(globalThis, { window, document, HTMLElement: Node, Element: Node, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'offline lifecycle fixture', platform: 'Win32' } });

require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8')
  .replaceAll('import.meta.env.VITE_API_URL', JSON.stringify('http://fixture.invalid'))
  .replaceAll('import.meta.env.MODE', JSON.stringify('postgres')), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
require.extensions['.css'] = () => {};
const React = require('react');
const { createRoot } = require('react-dom/client');
const { MapContainer, useMap } = require('react-leaflet');
const L = require('leaflet');
const { stationViewport, DEFAULT_STATION_VIEW } = require('../src/pages/mapPage/stationViewport.ts');
const maps = [];
L.Map.addInitHook(function () { maps.push(this); });

function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes) { const found = findNode(child, predicate); if (found) return found; }
}

function findNodes(node, predicate) {
  const found = predicate(node) ? [node] : [];
  for (const child of node.childNodes) found.push(...findNodes(child, predicate));
  return found;
}

const reactProps = node => node[Object.keys(node).find(key => key.startsWith('__reactProps$'))];

function Viewport({ stations, capture }) {
  const map = useMap();
  const viewport = React.useRef(null);
  React.useEffect(() => {
    const current = stationViewport(map);
    viewport.current = current;
    capture({ map, viewport: current });
    return () => { current.dispose(); viewport.current = null; };
  }, [map, capture]);
  React.useEffect(() => { viewport.current?.fit(stations); }, [stations]);
  return null;
}
function StationMap({ capture, stations = [] }) {
  return React.createElement(MapContainer, { center: DEFAULT_STATION_VIEW.center, zoom: 13,
    zoomControl: false, attributionControl: false, trackResize: false }, React.createElement(Viewport, { capture, stations }));
}

test('installed Leaflet stop after remove reproduces the reported pane failure', () => {
  const container = document.body.appendChild(document.createElement('div'));
  const map = L.map(container, { center: DEFAULT_STATION_VIEW.center, zoom: 13,
    zoomControl: false, attributionControl: false, trackResize: false });
  map.remove();
  assert.throws(() => map.stop(), /_leaflet_pos/);
  container.parentNode.removeChild(container);
});

test('real React Leaflet parent removal precedes child disposal safely', async () => {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  let current;
  await React.act(() => { root.render(React.createElement(StationMap, { capture: value => { current = value; } })); });
  assert.ok(current);
  assert.deepEqual([current.map.getCenter().lat, current.map.getCenter().lng], DEFAULT_STATION_VIEW.center);
  await React.act(() => { root.unmount(); });
  assert.equal(current.map.getPane('mapPane'), undefined);
  assert.doesNotThrow(() => { current.viewport.dispose(); current.viewport.fit([{ location: { lat: 31, lng: 35 } }]); });
  container.parentNode.removeChild(container);
});

test('StrictMode replays the live viewport effect and fences obsolete fit work', async () => {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  const captured = [];
  const capture = current => captured.push(current);
  try {
    await React.act(() => { root.render(React.createElement(React.StrictMode, null,
      React.createElement(StationMap, { capture, stations: [{ location: { lat: 31, lng: 35 } }] }))); });
    assert.equal(captured.length, 2, 'the installed React renderer actually replays the effect');
    assert.equal(captured[0].map, captured[1].map);
    const map = captured[1].map;
    map.setView([30, 34], 14, { animate: false });
    captured[0].viewport.dispose();
    captured[0].viewport.fit([{ location: { lat: 29, lng: 33 } }]);
    assert.ok(map.getCenter().equals([30, 34]), 'the replay-disposed controller cannot restore the previous fit');
    assert.equal(map.getZoom(), 14);
  } finally {
    await React.act(() => { root.unmount(); });
    container.parentNode.removeChild(container);
  }
  for (const current of captured) {
    assert.doesNotThrow(() => { current.viewport.dispose(); current.viewport.dispose(); current.viewport.fit([{ location: { lat: 29, lng: 33 } }]); });
    assertRemoved(current.map);
  }
});

async function pageFixture(context, { actor, strict = false, stations = false, inactiveStations = false, reports = false, reportCount = 3, stationUnavailable = false, stationCollectionGate = null } = {}) {
  const { Provider } = require('react-redux');
  const { MemoryRouter, Routes, Route, useNavigate } = require('react-router-dom');
  const { createRayStore } = require('../src/app/store.ts');
  const { http } = require('../src/api/http.ts');
  const MapPage = require('../src/pages/mapPage/MapPage.tsx').default;
  const auth = require('../src/features/auth/authSlice.ts');
  const { AxiosError } = require('axios');
  const data = new globalThis.Map();
  const storage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const previousStorage = window.localStorage;
  window.localStorage = storage;
  const app = createRayStore(storage);
  const user = id => ({ id, firstName: id, lastName: 'Fixture', email: `${id}@example.invalid`, token: `synthetic-${id}` });
  if (actor) app.store.dispatch(auth.setAuth(user(actor)));
  const previous = http.defaults.adapter;
  const station = { _id: '000000000000000000000001', name: 'Synthetic station', location: { lat: 31, lng: 35 },
    estimatedCats: 2, estimatedKittens: 0, active: true, permissions: { canManage: false, canFeed: true } };
  const inactiveStation = { ...station, _id: '000000000000000000000002', name: 'Synthetic inactive station',
    location: { lat: 31.1, lng: 35.1 }, active: false, permissions: { canManage: false, canFeed: false } };
  const stationItems = stations ? [station, ...(inactiveStations ? [inactiveStation] : [])] : [];
  const reportItems = reports ? [
    ['emergency', 'new'], ['food', 'in-progress'], ['general', 'resolved'],
  ].slice(0, reportCount).map(([type, status], index) => ({ _id: `00000000000000000000010${index}`, description: `Synthetic report ${index}`,
    type, status, location: { lat: 32 + index / 10, lng: 34 + index / 10 },
    createdAt: '2026-11-05T08:00:00.000Z', updatedAt: '2026-11-05T08:00:00.000Z',
    assignedTo: 'synthetic-a', distanceKm: null, media: [] })) : [];
  const calls = [];
  let stationFailure = stationUnavailable;
  http.defaults.adapter = async config => {
    calls.push(config);
    if (stationCollectionGate && config.url === '/api/feeding-stations') await stationCollectionGate;
    if (stationFailure && config.url === '/api/feeding-stations') {
      throw new AxiosError('Synthetic offline station request', 'ERR_NETWORK', config);
    }
    let data = [];
    if (config.url === '/api/reports') data = reportItems;
    else if (config.url === '/api/feeding-stations') data = stationItems;
    else if (stationItems.some(item => config.url === `/api/feeding-stations/${item._id}`)) {
      data = stationItems.find(item => config.url === `/api/feeding-stations/${item._id}`);
    }
    else if (config.url?.endsWith('/summary')) data = { food: { recency: 'no-record' }, water: { recency: 'no-record' } };
    return { config, data, headers: {}, status: 200, statusText: 'OK' };
  };
  let navigate;
  function Navigation() { navigate = useNavigate(); return null; }
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  context.after(async () => {
    await React.act(() => { root.unmount(); });
    app.dispose(); http.defaults.adapter = previous; window.localStorage = previousStorage;
    container.parentNode.removeChild(container);
  });
  await React.act(async () => {
    const page = React.createElement(Provider, { store: app.store },
      React.createElement(MemoryRouter, { initialEntries: ['/map'] },
        React.createElement(Navigation), React.createElement(Routes, null,
          React.createElement(Route, { path: '/map', element: React.createElement(MapPage) }),
          React.createElement(Route, { path: '/login', element: React.createElement('h1', null, 'Login') }))));
    root.render(strict ? React.createElement(React.StrictMode, null, page) : page);
  });
  const buttonNode = label => findNode(container, node => node.nodeName === 'BUTTON' && node.textContent === label);
  const checkboxNode = label => {
    const field = findNode(container, node => node.nodeName === 'LABEL' && node.textContent.trim() === label);
    return field && findNode(field, node => node.nodeName === 'INPUT' && reactProps(node)?.type === 'checkbox');
  };
  return { ...app, storage, container, calls, station, inactiveStation, stationItems, reportItems, buttonNode, checkboxNode,
    restoreStations() { stationFailure = false; },
    map: () => maps.at(-1),
    navigate: path => React.act(async () => { navigate(path); }),
    authenticate: id => React.act(async () => { app.store.dispatch(auth.setAuth(user(id))); }),
    logout: () => React.act(async () => { app.store.dispatch(auth.logout()); }),
    button(label) {
      const button = buttonNode(label);
      assert.ok(button, `Missing button: ${label}`);
      return React.act(async () => { reactProps(button).onClick({ stopPropagation() {}, currentTarget: button }); });
    },
    checkbox(label, checked) {
      const checkbox = checkboxNode(label);
      assert.ok(checkbox, `Missing checkbox: ${label}`);
      return React.act(async () => { reactProps(checkbox).onChange({ target: { checked } }); });
    },
  };
}

function assertRemoved(map) {
  assert.equal(map.getPane('mapPane'), undefined);
  const layers = [];
  map.eachLayer(layer => layers.push(layer));
  assert.deepEqual(layers, []);
}

function assertCollections(ui, stations, reports) {
  for (const [attribute, expected] of [['data-station-id', stations], ['data-report-id', reports]]) {
    const items = findNodes(ui.container, node => node.nodeName === 'LI' && node.getAttribute(attribute) !== null);
    assert.deepEqual(items.map(node => node.getAttribute(attribute)).sort(), expected.map(item => item._id).sort(),
      `${attribute} list is the visible collection`);
  }
  const markerPoints = [];
  ui.map().eachLayer(layer => {
    if (layer instanceof L.Marker) {
      const point = layer.getLatLng();
      markerPoints.push(`${point.lat},${point.lng}`);
    }
  });
  assert.deepEqual(markerPoints.sort(), [...stations, ...reports].map(item => `${item.location.lat},${item.location.lng}`).sort(),
    'map markers and the non-map list expose the same filtered items');
}

function assertScope(ui, selectedKey) {
  const { t } = require('../src/i18n/index.ts');
  for (const key of ['map.scopeAll', 'map.scopeReports', 'map.scopeStations']) {
    const button = ui.buttonNode(t(key));
    assert.ok(button, `Missing scope control: ${key}`);
    assert.equal(button.getAttribute('aria-pressed'), String(key === selectedKey));
  }
}

function assertOrderedResultsAndCounts(ui, expectedSequence, expectedReports, expectedStations) {
  const { t } = require('../src/i18n/index.ts');
  const list = findNode(ui.container, node => node.nodeName === 'UL' && node.className === 'map-result-list');
  assert.ok(list);
  const items = list.children.filter(node => node.nodeName === 'LI');
  const actualSequence = items.map(node => {
    const reportId = node.getAttribute('data-report-id');
    return reportId !== null ? `report:${reportId}` : `station:${node.getAttribute('data-station-id')}`;
  });
  // Expected sequences below are explicit fixture examples, never generated by
  // the production interleaving rule or sorted before comparison.
  assert.deepEqual(actualSequence, expectedSequence, 'mixed list DOM order matches the explicit fixture sequence');
  assert.equal(items.filter(node => node.getAttribute('data-report-id') !== null).length, expectedReports);
  assert.equal(items.filter(node => node.getAttribute('data-station-id') !== null).length, expectedStations ?? 0);
  const status = findNode(ui.container, node => node.className === 'map-result-status');
  assert.ok(status);
  assert.equal(status.getAttribute('role'), 'status');
  const expectedText = expectedStations === null
    ? t('map.visibleReports', { count: expectedReports })
    : `${t('map.visibleReports', { count: expectedReports })}, ${t('map.visibleStations', { count: expectedStations })}`;
  assert.equal(status.textContent, expectedText,
    'counts describe visible results after scope/filtering; guest station counts are omitted');
}

// These IDs name the fixed API fixtures above, not a reconstructed presentation
// algorithm. Every expected sequence is written out at its assertion/case.
const R0 = 'report:000000000000000000000100';
const R1 = 'report:000000000000000000000101';
const R2 = 'report:000000000000000000000102';
const S0 = 'station:000000000000000000000001';
const S1 = 'station:000000000000000000000002';

test('ordered mixed results and visible counts follow scopes and filters when reports outnumber stations', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', reports: true, stations: true, inactiveStations: true });
  const { t } = require('../src/i18n/index.ts');
  const { reportTypeLabel, statusLabel } = require('../src/i18n/formatters.ts');
  assertOrderedResultsAndCounts(ui, [R0, S0, R1, S1, R2], 3, 2);
  await ui.button(t('map.scopeReports'));
  assertOrderedResultsAndCounts(ui, [R0, R1, R2], 3, 0);
  await ui.checkbox(reportTypeLabel('emergency'), false);
  assertOrderedResultsAndCounts(ui, [R1, R2], 2, 0);
  await ui.button(t('map.scopeAll'));
  assertOrderedResultsAndCounts(ui, [R1, S0, R2, S1], 2, 2);
  await ui.checkbox(statusLabel('in-progress'), false);
  assertOrderedResultsAndCounts(ui, [R2, S0, S1], 1, 2);
  await ui.button(t('map.scopeStations'));
  assertOrderedResultsAndCounts(ui, [S0, S1], 0, 2);
  await ui.checkbox(t('map.inactiveStations'), false);
  assertOrderedResultsAndCounts(ui, [S0], 0, 1);
  await ui.button(t('map.scopeAll'));
  assertOrderedResultsAndCounts(ui, [R2, S0], 1, 1);
  await ui.checkbox(t('map.activeStations'), false);
  assertOrderedResultsAndCounts(ui, [R2], 1, 0);
  await ui.checkbox(reportTypeLabel('general'), false);
  assertOrderedResultsAndCounts(ui, [], 0, 0);
});

test('ordered mixed results and visible counts retain a station tail when stations outnumber reports', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', reports: true, reportCount: 1, stations: true, inactiveStations: true });
  const { t } = require('../src/i18n/index.ts');
  assertOrderedResultsAndCounts(ui, [R0, S0, S1], 1, 2);
  await ui.button(t('map.scopeStations'));
  assertOrderedResultsAndCounts(ui, [S0, S1], 0, 2);
  await ui.button(t('map.scopeReports'));
  assertOrderedResultsAndCounts(ui, [R0], 1, 0);
  await ui.button(t('map.scopeAll'));
  assertOrderedResultsAndCounts(ui, [R0, S0, S1], 1, 2);
});

for (const sample of [
  { name: 'reports only', reports: true, stations: false,
    all: [R0, R1, R2], reportsOnly: [R0, R1, R2], stationsOnly: [], reportCount: 3, stationCount: 0 },
  { name: 'stations only', reports: false, stations: true,
    all: [S0, S1], reportsOnly: [], stationsOnly: [S0, S1], reportCount: 0, stationCount: 2 },
]) {
  test(`ordered results and visible counts support an empty domain: ${sample.name}`, async context => {
    const ui = await pageFixture(context, { actor: 'synthetic-a', reports: sample.reports, stations: sample.stations, inactiveStations: true });
    const { t } = require('../src/i18n/index.ts');
    assertOrderedResultsAndCounts(ui, sample.all, sample.reportCount, sample.stationCount);
    await ui.button(t('map.scopeReports'));
    assertOrderedResultsAndCounts(ui, sample.reportsOnly, sample.reportCount, 0);
    await ui.button(t('map.scopeStations'));
    assertOrderedResultsAndCounts(ui, sample.stationsOnly, 0, sample.stationCount);
    await ui.button(t('map.scopeAll'));
    assertOrderedResultsAndCounts(ui, sample.all, sample.reportCount, sample.stationCount);
  });
}

test('guest ordered results and counts never include protected stations across scopes and report filters', async context => {
  const ui = await pageFixture(context, { reports: true, stations: true, inactiveStations: true });
  const { t } = require('../src/i18n/index.ts');
  const { reportTypeLabel } = require('../src/i18n/formatters.ts');
  assertOrderedResultsAndCounts(ui, [R0, R1, R2], 3, null);
  await ui.button(t('map.scopeReports'));
  assertOrderedResultsAndCounts(ui, [R0, R1, R2], 3, null);
  await ui.checkbox(reportTypeLabel('emergency'), false);
  assertOrderedResultsAndCounts(ui, [R1, R2], 2, null);
  await ui.button(t('map.scopeStations'));
  assertOrderedResultsAndCounts(ui, [], 0, null);
  await ui.button(t('map.scopeAll'));
  assertOrderedResultsAndCounts(ui, [R1, R2], 2, null);
  assert.ok(ui.calls.every(config => !config.url.startsWith('/api/feeding-stations')));
  for (const station of ui.stationItems) assert.ok(!ui.container.textContent.includes(station.name));
});

test('mobile map shell exposes public reports and a list link without fetching or disclosing stations to guests', async context => {
  const ui = await pageFixture(context, { stations: true, inactiveStations: true, reports: true });
  const { t } = require('../src/i18n/index.ts');
  assertScope(ui, 'map.scopeAll');
  assertCollections(ui, [], ui.reportItems);
  const shell = findNode(ui.container, node => node.className === 'map-layout');
  assert.equal(shell.getAttribute('dir'), 'rtl');
  const mapIndex = shell.children.findIndex(node => node.className === 'map-center');
  const sidebarIndex = shell.children.findIndex(node => node.className === 'map-sidebar');
  const sidebar = shell.children[sidebarIndex];
  const supportIndex = sidebar?.children.findIndex(node => node.className === 'map-support');
  const listIndex = sidebar?.children.findIndex(node => node.getAttribute('id') === 'map-results');
  assert.ok(mapIndex >= 0 && sidebarIndex > mapIndex,
    'mobile DOM order puts the real map before filters, full notices, counts and list');
  assert.ok(supportIndex >= 0 && listIndex > supportIndex,
    'supporting controls remain available beside the list after the map');
  const header = findNode(shell, node => node.className === 'map-shell-header');
  assert.equal(findNode(header, node => node.className === 'map-filter-panel'), undefined);
  assert.equal(findNode(header, node => node.className === 'map-result-status'), undefined);
  assert.equal(findNode(header, node => node.className === 'map-access-notice'), undefined);
  assert.ok(findNode(header, node => node.nodeName === 'A' && node.getAttribute('href') === '#map-support'),
    'moving filters after the map preserves a named filter bypass link');
  assert.ok(findNode(sidebar, node => node.className === 'map-filter-panel'));
  assert.ok(findNode(sidebar, node => node.className === 'map-result-status'));
  const notice = findNode(sidebar, node => node.className === 'map-access-notice');
  assert.ok(notice?.textContent.includes(t('map.stationSignInRequired')));
  assert.ok(findNode(notice, node => node.nodeName === 'A' && node.getAttribute('href') === '/login'));
  assert.ok(findNode(notice, node => node.nodeName === 'A' && node.getAttribute('href') === '/register'));
  const actions = findNode(header, node => node.className === 'map-care-actions');
  assert.equal(actions.children.length, 2, 'reports and station sign-in retain equal creation entry points');
  assert.ok(actions.children.every(node => node.className === 'btn btn-brand'));
  assert.equal(actions.children[0].getAttribute('href'), '/');
  assert.equal(actions.children[1].getAttribute('href'), '/login');
  assert.equal(actions.children[1].textContent, t('map.stationCareSignIn'));
  assert.ok(ui.calls.some(config => config.url === '/api/reports'));
  assert.ok(ui.calls.every(config => !config.url.startsWith('/api/feeding-stations')));
  const listLink = findNode(ui.container, node => node.nodeName === 'A' && node.getAttribute('href') === '#map-results');
  assert.ok(listLink?.textContent.trim(), 'the visible list has a named map bypass link');
  assert.ok(findNode(ui.container, node => node.getAttribute('id') === 'map-results'));
  assert.ok(findNode(ui.container, node => node.nodeName === 'A' && node.getAttribute('href') === '/' && node.textContent.trim()),
    'new reports use the existing public report route');
  await ui.button(t('map.scopeStations'));
  assertScope(ui, 'map.scopeStations');
  assertCollections(ui, [], []);
  assert.ok(ui.container.textContent.includes(t('map.stationSignInRequired')));
  for (const station of ui.stationItems) assert.ok(!ui.container.textContent.includes(station.name));
  assert.ok(ui.calls.every(config => !config.url.startsWith('/api/feeding-stations')),
    'station presentation does not initiate a protected guest request');
  await ui.button(t('map.scopeReports'));
  assertCollections(ui, [], ui.reportItems);
});

test('mobile scope and report/station filters share their list and marker collections without changing the camera', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', stations: true, inactiveStations: true, reports: true });
  const { t } = require('../src/i18n/index.ts');
  const { reportTypeLabel, statusLabel } = require('../src/i18n/formatters.ts');
  const map = ui.map();
  map.setView([30, 33], 15, { animate: false });
  assertScope(ui, 'map.scopeAll');
  assertCollections(ui, ui.stationItems, ui.reportItems);
  assert.ok(findNode(ui.container, node => node.nodeName === 'DETAILS'), 'secondary report filters use a native disclosure');
  await ui.button(t('map.scopeReports'));
  assertScope(ui, 'map.scopeReports');
  assertCollections(ui, [], ui.reportItems);
  await ui.checkbox(reportTypeLabel('emergency'), false);
  assertCollections(ui, [], ui.reportItems.slice(1));
  await ui.checkbox(statusLabel('in-progress'), false);
  assertCollections(ui, [], [ui.reportItems[2]]);
  await ui.button(t('map.scopeStations'));
  assertCollections(ui, ui.stationItems, []);
  await ui.checkbox(t('map.activeStations'), false);
  assertCollections(ui, [ui.inactiveStation], []);
  await ui.checkbox(t('map.inactiveStations'), false);
  assertCollections(ui, [], []);
  await ui.button(t('map.scopeAll'));
  assertCollections(ui, [], [ui.reportItems[2]]);
  await ui.checkbox(t('map.activeStations'), true);
  assertCollections(ui, [ui.station], [ui.reportItems[2]]);
  assert.equal(ui.map(), map, 'presentation filters must not remount Leaflet');
  assert.ok(map.getCenter().equals([30, 33]));
  assert.equal(map.getZoom(), 15);
});

test('an unavailable station collection leaves public reports usable and recovers only after explicit retry', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', stations: true, reports: true, stationUnavailable: true });
  const { t } = require('../src/i18n/index.ts');
  const map = ui.map();
  assertCollections(ui, [], ui.reportItems);
  assert.ok(findNode(ui.container, node => node.getAttribute('role') === 'alert'));
  assert.ok(ui.buttonNode(t('map.retry')));
  await ui.button(t('map.scopeStations'));
  assertCollections(ui, [], []);
  await ui.button(t('map.scopeReports'));
  assertCollections(ui, [], ui.reportItems);
  assert.equal(ui.calls.filter(config => config.url === '/api/feeding-stations').length, 1,
    'scope changes must not bypass explicit retry or trigger a request loop');
  ui.restoreStations();
  await ui.button(t('map.scopeAll'));
  await ui.button(t('map.retry'));
  assertCollections(ui, ui.stationItems, ui.reportItems);
  assert.equal(ui.calls.filter(config => config.url === '/api/feeding-stations').length, 2);
  assert.equal(ui.map(), map);
});

test('a delayed first station collection cannot move the Reports camera before stations become visible', async context => {
  let releaseStations;
  const stationCollectionGate = new Promise(resolve => { releaseStations = resolve; });
  const ui = await pageFixture(context, { actor: 'synthetic-a', stations: true, reports: true, stationCollectionGate });
  const { t } = require('../src/i18n/index.ts');
  const map = ui.map();
  assert.equal(ui.store.getState().feedingStations.loading, true);
  await ui.button(t('map.scopeReports'));
  map.setView([30, 33], 15, { animate: false });
  await React.act(async () => { releaseStations(); });
  assert.equal(ui.store.getState().feedingStations.data.length, 1, 'the real collection fulfilled while Reports was selected');
  assertCollections(ui, [], ui.reportItems);
  assert.equal(ui.map(), map);
  assert.ok(map.getCenter().equals([30, 33]), 'a hidden first station result cannot alter the Reports camera');
  assert.equal(map.getZoom(), 15);
  await ui.button(t('map.scopeAll'));
  assertCollections(ui, ui.stationItems, ui.reportItems);
  assert.equal(ui.map(), map, 'revealing stations reuses the existing Leaflet instance');
  assert.ok(map.getCenter().equals(ui.station.location), 'the first station fit is deferred until its markers become visible');
  assert.equal(map.getZoom(), DEFAULT_STATION_VIEW.zoom);
});

test('station list details and session changes reset scope, filters, selection and protected camera state', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', strict: true, stations: true, inactiveStations: true, reports: true });
  const { t } = require('../src/i18n/index.ts');
  const { reportTypeLabel } = require('../src/i18n/formatters.ts');
  await ui.checkbox(reportTypeLabel('emergency'), false);
  await ui.button(t('map.scopeStations'));
  await ui.checkbox(t('map.activeStations'), false);
  const item = findNode(ui.container, node => node.getAttribute('data-station-id') === ui.inactiveStation._id);
  const detailsButton = item && findNode(item, node => node.nodeName === 'BUTTON');
  assert.ok(detailsButton);
  assert.ok(detailsButton.getAttribute('aria-label')?.includes(ui.inactiveStation.name));
  assert.ok(detailsButton.getAttribute('aria-label')?.includes(t('stations.details')));
  await React.act(async () => { reactProps(detailsButton).onClick({ currentTarget: detailsButton }); });
  const dialog = findNode(ui.container, node => node.className === 'station-details');
  assert.equal(dialog?.open, true, 'the list opens the existing station dialog');
  const map = ui.map();
  map.setView([29, 33], 16, { animate: false });
  await ui.authenticate('synthetic-b');
  assertRemoved(map);
  assert.equal(dialog.open, false);
  assert.equal(dialog.isConnected, false);
  assertScope(ui, 'map.scopeAll');
  assertCollections(ui, ui.stationItems, ui.reportItems);
  assert.equal(reactProps(ui.checkboxNode(t('map.activeStations'))).checked, true);
  assert.equal(reactProps(ui.checkboxNode(reportTypeLabel('emergency'))).checked, true);
  assert.ok(!ui.map().getCenter().equals([29, 33]));
  await ui.button(t('map.scopeReports'));
  await ui.checkbox(reportTypeLabel('emergency'), false);
  const replacement = ui.map();
  await ui.logout();
  assertRemoved(replacement);
  assertScope(ui, 'map.scopeAll');
  assertCollections(ui, [], ui.reportItems);
  assert.equal(reactProps(ui.checkboxNode(reportTypeLabel('emergency'))).checked, true);
  for (const station of ui.stationItems) assert.ok(!ui.container.textContent.includes(station.name));
  assert.deepEqual([ui.map().getCenter().lat, ui.map().getCenter().lng], DEFAULT_STATION_VIEW.center);
});

test('mobile domain changes preserve station creation and keyboard location selection without a write', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', stations: true, reports: true });
  const { t } = require('../src/i18n/index.ts');
  await ui.button(t('map.addStation'));
  const map = ui.map();
  const picker = findNode(ui.container, node => node.className === 'station-location-keyboard');
  assert.ok(picker?.isConnected);
  await ui.button(t('map.scopeReports'));
  await ui.button(t('map.scopeStations'));
  assert.equal(ui.map(), map);
  assert.equal(picker.isConnected, true);
  map.setView([32.2, 34.9], 15, { animate: false });
  await ui.button(t('stations.selectMapCenter'));
  const dialog = findNode(ui.container, node => node.className === 'create-station-dialog');
  assert.equal(dialog?.open, true);
  assert.ok(dialog.textContent.includes('32.20000, 34.90000'));
  await ui.button(t('stations.changeLocation'));
  assert.equal(dialog.open, false);
  assert.ok(findNode(ui.container, node => node.className === 'station-location-keyboard')?.isConnected);
  await ui.button(t('map.cancelCreation'));
  assert.equal(findNode(ui.container, node => node.className === 'station-location-keyboard'), undefined);
  assert.ok(ui.calls.every(config => config.method === 'get'), 'selection/cancellation must not create a station');
});

test('actual MapPage survives repeated router navigation to Login and back', async context => {
  const ui = await pageFixture(context);
  for (let iteration = 0; iteration < 3; iteration++) {
    const map = ui.map();
    map.setView([31, 35], 15, { animate: false });
    await ui.navigate('/login');
    assert.equal(ui.container.textContent, 'Login');
    assertRemoved(map);
    await ui.navigate('/map');
    assert.notEqual(ui.map(), map);
    assert.deepEqual([ui.map().getCenter().lat, ui.map().getCenter().lng], DEFAULT_STATION_VIEW.center);
  }
});

test('actual MapPage logout removes the popup, station layers and location picker', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', stations: true });
  const { t } = require('../src/i18n/index.ts');
  const map = ui.map();
  const popup = L.popup({ autoPan: false }).setLatLng([31, 35]).setContent(document.createElement('span')).openOn(map);
  assert.equal(popup.isOpen(), true);
  await ui.button(t('map.addStation'));
  const picker = findNode(ui.container, node => node.className === 'station-location-keyboard');
  assert.ok(picker?.isConnected);
  await ui.logout();
  assertRemoved(map);
  assert.equal(popup.isOpen(), false);
  assert.equal(picker.isConnected, false);
  assert.equal(findNode(ui.container, node => node.className === 'station-location-keyboard'), undefined);
  assert.equal(ui.store.getState().feedingStations.data.length, 0);
  assert.notEqual(ui.map(), map);
  assert.deepEqual([ui.map().getCenter().lat, ui.map().getCenter().lng], DEFAULT_STATION_VIEW.center);
});

test('actual MapPage A to B to A transitions discard previous dialog and camera state under StrictMode', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', strict: true, stations: true });
  const mapsSeen = new Set();
  for (const actor of ['synthetic-b', 'synthetic-a']) {
    const map = ui.map();
    assert.ok(!mapsSeen.has(map)); mapsSeen.add(map);
    let marker;
    map.eachLayer(layer => { if (layer instanceof L.Marker) marker = layer; });
    assert.ok(marker);
    await React.act(async () => { marker.fire('click'); });
    const dialog = findNode(ui.container, node => node.className === 'station-details');
    assert.equal(dialog?.open, true);
    map.setView([29, 33], 16, { animate: false });
    await ui.authenticate(actor);
    assertRemoved(map);
    assert.equal(dialog.open, false);
    assert.equal(dialog.isConnected, false);
    assert.equal(findNode(ui.container, node => node.className === 'station-details'), undefined);
    assert.notEqual(ui.map(), map);
    // The new account's own collection fits; the old manually panned center is gone.
    assert.ok(ui.map().getCenter().equals(ui.station.location));
  }
});

test('another production store logout and manually delivered storage event safely remount the map', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a' });
  const { createRayStore } = require('../src/app/store.ts');
  const { logout } = require('../src/features/auth/authSlice.ts');
  const otherTab = createRayStore(ui.storage);
  context.after(() => otherTab.dispose());
  const map = ui.map();
  await React.act(async () => {
    otherTab.store.dispatch(logout());
    for (const listener of window.listeners.get('storage') ?? []) listener({ key: 'ray:auth-authority', storageArea: ui.storage });
  });
  assert.equal(ui.store.getState().auth.user, null);
  assertRemoved(map);
  assert.notEqual(ui.map(), map);
});

function escapeAt(node) {
  const result = { prevented: false, stopped: false };
  const event = { key: 'Escape', target: node, currentTarget: node,
    preventDefault() { result.prevented = true; }, stopPropagation() { result.stopped = true; } };
  reactProps(node).onKeyDownCapture(event);
  return result;
}

for (const strict of [false, true]) {
  test(`station picker and form cancellation restore the creation trigger without camera changes (StrictMode=${strict})`, async context => {
    const ui = await pageFixture(context, { actor: 'synthetic-a', strict, stations: true, reports: true });
    const { t } = require('../src/i18n/index.ts');
    const opener = ui.buttonNode(t('map.addStation'));
    const map = ui.map();
    map.setView([32.2, 34.9], 15, { animate: false });
    const actions = findNode(ui.container, node => node.className === 'map-care-actions');
    assert.equal(actions.children.length, 2);
    assert.equal(actions.children[0].getAttribute('href'), '/');
    assert.ok(actions.children[1] === opener, 'authenticated station creation retains equal entry prominence');
    for (const phase of ['picker', 'form']) {
      for (const method of ['explicit', 'Escape']) {
        opener.focus();
        await ui.button(t('map.addStation'));
        assert.ok(opener.disabled, 'the active creation trigger is disabled while its picker/form exists');
        const select = ui.buttonNode(t('stations.selectMapCenter'));
        assert.ok(select?.isConnected);
        assert.ok(document.activeElement === select, 'opening creation provides an immediately usable keyboard location control');
        const shell = findNode(ui.container, node => node.className === 'map-layout');
        let dialog;
        if (phase === 'form') {
          await ui.button(t('stations.selectMapCenter'));
          dialog = findNode(ui.container, node => node.className === 'create-station-dialog');
          assert.equal(dialog?.open, true);
          assert.ok(dialog.textContent.includes('32.20000, 34.90000'));
          // The shell must leave Escape to the native dialog cancel path.
          await React.act(async () => { assert.deepEqual(escapeAt(shell), { prevented: false, stopped: false }); });
          assert.equal(dialog.open, true);
        }
        if (method === 'explicit') await ui.button(t(phase === 'picker' ? 'map.cancelCreation' : 'stations.cancel'));
        else await React.act(async () => {
          if (phase === 'picker') assert.deepEqual(escapeAt(shell), { prevented: true, stopped: true });
          else {
            let prevented = false;
            reactProps(dialog).onCancel({ preventDefault() { prevented = true; } });
            assert.ok(prevented, 'the form closes explicitly before its parent removes it');
          }
        });
        if (dialog) { assert.equal(dialog.open, false); assert.equal(dialog.isConnected, false); }
        assert.equal(findNode(ui.container, node => node.className === 'station-location-keyboard'), undefined);
        assert.equal(findNode(ui.container, node => node.className === 'create-station-dialog'), undefined);
        assert.ok(document.activeElement === opener, `${phase} ${method} restores the surviving original creation trigger`);
        assert.equal(opener.disabled, false, 'focus returns only after the opener is enabled again');
        assert.equal(ui.map(), map);
        assert.ok(map.getCenter().equals([32.2, 34.9]));
        assert.equal(map.getZoom(), 15);
      }
    }
    assert.ok(ui.calls.every(config => config.method === 'get'), 'picker and cancellation paths perform no write');
  });

  test(`station change-location preserves the draft and refocuses the picker before reopening (StrictMode=${strict})`, async context => {
    const ui = await pageFixture(context, { actor: 'synthetic-a', strict, stations: true });
    const { t } = require('../src/i18n/index.ts');
    const opener = ui.buttonNode(t('map.addStation'));
    const map = ui.map();
    await ui.button(t('map.addStation'));
    map.setView([32.2, 34.9], 15, { animate: false });
    await ui.button(t('stations.selectMapCenter'));
    const dialog = findNode(ui.container, node => node.className === 'create-station-dialog');
    const name = findNode(dialog, node => node.getAttribute('id') === 'station-name');
    await React.act(async () => { reactProps(name).onChange({ target: { value: 'Synthetic preserved draft' } }); });
    await ui.button(t('stations.changeLocation'));
    assert.equal(dialog.open, false);
    assert.equal(dialog.isConnected, true, 'the closed form remains mounted to preserve its draft');
    const select = ui.buttonNode(t('stations.selectMapCenter'));
    assert.ok(document.activeElement === select, 'changing location focuses the new surviving picker control after modal cleanup');
    map.setView([32.3, 35], 15, { animate: false });
    await ui.button(t('stations.selectMapCenter'));
    assert.equal(dialog.open, true);
    assert.ok(dialog.textContent.includes('32.30000, 35.00000'));
    assert.equal(reactProps(name).value, 'Synthetic preserved draft');
    await ui.button(t('stations.cancel'));
    assert.ok(document.activeElement === opener);
    assert.equal(ui.map(), map);
    assert.ok(map.getCenter().equals([32.3, 35]));
    assert.ok(ui.calls.every(config => config.method === 'get'));
  });
}

for (const phase of ['picker', 'form']) {
  for (const transition of ['logout', 'account change']) {
    test(`obsolete ${phase} cancel and Escape cannot restore focus after ${transition}`, async context => {
      const ui = await pageFixture(context, { actor: 'synthetic-a', strict: true, stations: true });
      const { t } = require('../src/i18n/index.ts');
      const oldOpener = ui.buttonNode(t('map.addStation'));
      await ui.button(t('map.addStation'));
      const oldShell = findNode(ui.container, node => node.className === 'map-layout');
      const oldPicker = findNode(ui.container, node => node.className === 'station-location-keyboard');
      const oldMap = ui.map();
      let oldDialog;
      let oldCancel;
      if (phase === 'form') {
        await ui.button(t('stations.selectMapCenter'));
        oldDialog = findNode(ui.container, node => node.className === 'create-station-dialog');
        oldCancel = reactProps(ui.buttonNode(t('stations.cancel'))).onClick;
      } else oldCancel = reactProps(ui.buttonNode(t('map.cancelCreation'))).onClick;
      const oldEscape = phase === 'form' ? reactProps(oldDialog).onCancel : reactProps(oldShell).onKeyDownCapture;
      if (transition === 'logout') await ui.logout();
      else await ui.authenticate('synthetic-b');
      assertRemoved(oldMap);
      assert.equal(oldOpener.isConnected, false);
      assert.equal(oldPicker.isConnected, false);
      if (oldDialog) { assert.equal(oldDialog.open, false); assert.equal(oldDialog.isConnected, false); }
      const replacementMap = ui.map();
      replacementMap.setView([30, 34], 14, { animate: false });
      let currentFocus = ui.buttonNode(t('map.scopeReports'));
      let replacementPicker;
      let replacementDialog;
      if (transition === 'account change') {
        await ui.button(t('map.addStation'));
        if (phase === 'form') await ui.button(t('stations.selectMapCenter'));
        replacementPicker = findNode(ui.container, node => node.className === 'station-location-keyboard');
        replacementDialog = findNode(ui.container, node => node.className === 'create-station-dialog');
        currentFocus = phase === 'form' ? replacementDialog : ui.buttonNode(t('stations.selectMapCenter'));
      }
      currentFocus.focus();
      context.mock.method(oldOpener, 'focus', () => assert.fail('obsolete opener must never receive focus'));
      const replacementOpener = ui.buttonNode(t('map.addStation'));
      if (replacementOpener) context.mock.method(replacementOpener, 'focus', () => assert.fail('old callbacks must not focus the replacement account opener'));
      await React.act(async () => {
        oldCancel();
        oldEscape({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
      });
      assert.ok(document.activeElement === currentFocus, 'obsolete callbacks leave replacement-session focus unchanged');
      assert.ok(findNode(ui.container, node => node.className === 'station-location-keyboard') === replacementPicker);
      assert.ok(findNode(ui.container, node => node.className === 'create-station-dialog') === replacementDialog);
      if (phase === 'form' && replacementDialog) assert.equal(replacementDialog.open, true,
        'old callbacks cannot dismiss the replacement account form');
      if (phase === 'picker' && replacementPicker) assert.equal(replacementPicker.isConnected, true);
      assert.equal(ui.map(), replacementMap);
      assert.ok(replacementMap.getCenter().equals([30, 34]));
      assert.equal(replacementMap.getZoom(), 14);
      if (transition === 'logout') assert.equal(ui.buttonNode(t('map.addStation')), undefined);
      assert.ok(ui.calls.every(config => config.method === 'get'));
    });
  }
}

test('station-details Escape retains its existing focus return with the creation Escape boundary', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', stations: true });
  const item = findNode(ui.container, node => node.getAttribute('data-station-id') === ui.station._id);
  const opener = findNode(item, node => node.nodeName === 'BUTTON');
  await React.act(async () => { reactProps(opener).onClick({ currentTarget: opener }); });
  const dialog = findNode(ui.container, node => node.className === 'station-details');
  assert.equal(dialog?.open, true);
  const shell = findNode(ui.container, node => node.className === 'map-layout');
  await React.act(async () => {
    assert.deepEqual(escapeAt(shell), { prevented: false, stopped: false });
    reactProps(dialog).onCancel({ preventDefault() {} });
  });
  assert.equal(dialog.open, false);
  assert.equal(dialog.isConnected, false);
  assert.ok(document.activeElement === opener);
});


test('station-details Escape leaves an active creation picker intact and preserves both focus targets', async context => {
  const ui = await pageFixture(context, { actor: 'synthetic-a', strict: true, stations: true });
  const { t } = require('../src/i18n/index.ts');
  const creationOpener = ui.buttonNode(t('map.addStation'));
  const map = ui.map();
  map.setView([32.2, 34.9], 15, { animate: false });
  await ui.button(t('map.addStation'));
  const picker = findNode(ui.container, node => node.className === 'station-location-keyboard');
  const item = findNode(ui.container, node => node.getAttribute('data-station-id') === ui.station._id);
  const detailsOpener = findNode(item, node => node.nodeName === 'BUTTON');
  await React.act(async () => { reactProps(detailsOpener).onClick({ currentTarget: detailsOpener }); });
  const dialog = findNode(ui.container, node => node.className === 'station-details');
  assert.equal(dialog?.open, true);
  const shell = findNode(ui.container, node => node.className === 'map-layout');
  await React.act(async () => {
    assert.deepEqual(escapeAt(shell), { prevented: false, stopped: false },
      'a selected station dialog owns Escape even while creation is picking');
    reactProps(dialog).onCancel({ preventDefault() {} });
  });
  assert.equal(dialog.open, false);
  assert.equal(dialog.isConnected, false);
  assert.ok(document.activeElement === detailsOpener);
  assert.equal(picker.isConnected, true);
  assert.ok(findNode(ui.container, node => node.className === 'station-location-keyboard') === picker,
    'closing details does not cancel the existing creation picker');
  await ui.button(t('map.cancelCreation'));
  assert.equal(picker.isConnected, false);
  assert.ok(document.activeElement === creationOpener);
  assert.equal(ui.map(), map);
  assert.ok(map.getCenter().equals([32.2, 34.9]));
  assert.equal(map.getZoom(), 15);
  assert.ok(ui.calls.every(config => config.method === 'get'));
});
