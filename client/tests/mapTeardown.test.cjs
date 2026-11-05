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
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'class') this.className = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  setAttributeNS(_namespace, name, value) { this.setAttribute(name, value); }
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
  hasChildNodes() { return this.childNodes.length > 0; }
  querySelector(selector) { return findNode(this, node => selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.nodeName.toLowerCase() === selector); }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }; }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; this.focus(); }
  close() { this.open = false; }
}
const document = new Node('#document', null, 9);
document.ownerDocument = document;
document.createElement = name => new Node(name, document);
document.createElementNS = (_namespace, name) => document.createElement(name);
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

async function pageFixture(context, { actor, strict = false, stations = false } = {}) {
  const { Provider } = require('react-redux');
  const { MemoryRouter, Routes, Route, useNavigate } = require('react-router-dom');
  const { createRayStore } = require('../src/app/store.ts');
  const { http } = require('../src/api/http.ts');
  const MapPage = require('../src/pages/mapPage/MapPage.tsx').default;
  const auth = require('../src/features/auth/authSlice.ts');
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
  const calls = [];
  http.defaults.adapter = async config => {
    calls.push(config);
    let data = [];
    if (stations && config.url === '/api/feeding-stations') data = [station];
    else if (config.url === `/api/feeding-stations/${station._id}`) data = station;
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
  return { ...app, storage, container, calls, station,
    map: () => maps.at(-1),
    navigate: path => React.act(async () => { navigate(path); }),
    authenticate: id => React.act(async () => { app.store.dispatch(auth.setAuth(user(id))); }),
    logout: () => React.act(async () => { app.store.dispatch(auth.logout()); }),
    button(label) {
      const button = findNode(container, node => node.nodeName === 'BUTTON' && node.textContent === label);
      assert.ok(button, `Missing button: ${label}`);
      const props = button[Object.keys(button).find(key => key.startsWith('__reactProps$'))];
      return React.act(async () => { props.onClick({ stopPropagation() {}, currentTarget: button }); });
    },
  };
}

function assertRemoved(map) {
  assert.equal(map.getPane('mapPane'), undefined);
  const layers = [];
  map.eachLayer(layer => layers.push(layer));
  assert.deepEqual(layers, []);
}

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
