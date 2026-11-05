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
const { configureStore } = require('@reduxjs/toolkit');
let activeStore;
const reduxFile = require.resolve('react-redux');
require.cache[reduxFile] = { id: reduxFile, filename: reduxFile, loaded: true, exports: {
  ...require(reduxFile), useStore: () => activeStore, useSelector: selector => selector(activeStore.getState()),
} };
const auth = require('../src/features/auth/authSlice.ts');
const { reportActionFor } = require('../src/components/reportCard/reportAction.ts');
const Card = require('../src/components/reportCard/ReportCard.tsx').default;
const Details = require('../src/components/reportDetails/ReportDetails.tsx').default;
const { t } = require('../src/i18n/index.ts');
const a = { id: 'synthetic-a', token: 'synthetic-token-a', firstName: 'A', lastName: 'Fixture', email: 'a@example.invalid' };
const b = { ...a, id: 'synthetic-b', token: 'synthetic-token-b' };
const report = { _id: 'synthetic-report', type: 'emergency', status: 'new', description: 'חתול (Cat) кот <script>\nתיאור מלא',
  createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-02T11:00:00Z', distanceKm: null,
  location: { lat: 32, lng: 34 }, createdByName: 'מדווח Reporter кот', assignedToName: 'מטפל Carer кот', media: [] };
function setup(context, actor = null) {
  activeStore = configureStore({ reducer: { auth: auth.default } });
  if (actor) activeStore.dispatch(auth.setAuth(actor));
  context.mock.method(globalThis, 'fetch', () => assert.fail('Report presentation must not issue HTTP'));
  return activeStore;
}
function findAll(element, predicate) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(child => findAll(child, predicate));
  return [...(predicate(element) ? [element] : []), ...findAll(element.props?.children, predicate)];
}
function find(element, predicate) { return findAll(element, predicate)[0]; }

test('one shared report action matrix preserves guest, assignee and status boundaries', context => {
  setup(context);
  for (const [status, assignedTo, guest, owner, other] of [
    ['new', null, null, 'claim', 'claim'],
    ['in-progress', a.id, null, 'resolve', null],
    ['in-progress', { _id: a.id }, null, 'resolve', null],
    ['in-progress', { id: a.id }, null, 'resolve', null],
    ['in-progress', null, null, null, null],
    ['resolved', a.id, null, null, null],
  ]) {
    const row = { ...report, status, assignedTo };
    assert.equal(reportActionFor(row, false, null), guest);
    assert.equal(reportActionFor(row, true, a.id), owner);
    assert.equal(reportActionFor(row, true, b.id), other);
  }
});

test('legacy ReportCard consumers remain compatible and details never activate claim/resolve', context => {
  setup(context, a);
  let primary = 0, opens = 0;
  const legacy = Card({ report, onPrimary: () => primary++ });
  assert.equal(findAll(legacy, node => node.type === 'button').length, 1);
  const opener = { fixture: 'list-opener' };
  let tree = Card({ report, onPrimary: () => primary++, onOpenDetails: target => { assert.equal(target, opener); opens++; } });
  const buttons = findAll(tree, node => node.type === 'button');
  assert.equal(buttons.length, 2);
  for (const button of buttons) assert.equal(findAll(button.props.children, node => node.type === 'button').length, 0);
  buttons[0].props.onClick({ currentTarget: opener });
  assert.equal(opens, 1); assert.equal(primary, 0);
  buttons[1].props.onClick(); assert.equal(primary, 1);
  for (const props of [{ actionPending: true }, { actionDisabled: true }]) {
    tree = Card({ report, onPrimary: () => primary++, onOpenDetails: () => {}, ...props });
    const action = findAll(tree, node => node.type === 'button')[1];
    assert.equal(action.props.disabled, true);
    action.props.onClick(); assert.equal(primary, 1, 'a retained disabled action must also refuse programmatic dispatch');
  }
});

test('public report full details preserve mixed text, dates, names, existing media and validated navigation', context => {
  setup(context);
  const row = { ...report, status: 'resolved', media: ['https://media.fixture.invalid/cat.png', 'https://media.fixture.invalid/cat.mp4'] };
  const html = renderToStaticMarkup(React.createElement(Details, { report: row, onClose() {}, onPrimary() {} }));
  assert.ok(html.includes('חתול (Cat) кот &lt;script&gt;\nתיאור מלא'));
  assert.ok(html.includes('<bdi>מדווח Reporter кот</bdi>'));
  assert.ok(html.includes('<bdi>מטפל Carer кот</bdi>'));
  assert.ok(html.includes('dateTime="2026-01-01T10:00:00Z"'));
  assert.ok(html.includes('dateTime="2026-01-02T11:00:00Z"'));
  assert.ok(html.includes(t('reports.updatedAt')));
  assert.ok(html.includes(t('reports.resolvedMeaning')));
  assert.ok(html.includes('https://waze.com/ul?ll=32,34&amp;navigate=yes'));
  assert.ok(html.includes('https://www.google.com/maps/search/?api=1&amp;query=32,34'));
  assert.ok(html.includes('<img ') && html.includes('<video ') && html.includes('referrerPolicy="no-referrer"'));
  assert.doesNotMatch(html, new RegExp(`${t('reports.claim')}|${t('reports.resolve')}`));
  assert.ok(html.startsWith('<dialog') || html.includes('<dialog'), 'full details use a real dialog element');
});

test('malformed report coordinates never enter navigation links; zero is valid and invalid update dates are omitted', context => {
  setup(context);
  const render = location => renderToStaticMarkup(React.createElement(Details, { report: { ...report, location, updatedAt: 'invalid-date' }, onClose() {}, onPrimary() {} }));
  for (const location of [{ lat: NaN, lng: 34 }, { lat: 91, lng: 34 }, { lat: 32, lng: 181 }, { lat: '32', lng: 34 }, null]) {
    const html = render(location);
    assert.ok(html.includes(t('reports.navigationUnavailable')));
    assert.doesNotMatch(html, /waze\.com|google\.com\/maps|invalid-date/);
  }
  assert.ok(render({ lat: 0, lng: 0 }).includes('ll=0,0'));
});

// Runs production effect/refs/handlers with an explicit native-dialog model.
// No browser layout, native focus scheduling or assistive-technology claim.
function lifecycle(context, actor = a) {
  const store = setup(context, actor);
  const cells = [], effects = []; let cursor = 0;
  context.mock.method(React, 'useRef', value => { const index = cursor++; return cells[index] ??= { current: value }; });
  context.mock.method(React, 'useEffect', effect => { effects.push(effect); });
  context.mock.method(React, 'useId', () => 'synthetic-title');
  let parentClosed = 0, actions = 0;
  let extra = {};
  const render = () => { cursor = 0; effects.length = 0; return Details({ report, onClose: () => parentClosed++, onPrimary: () => actions++, ...extra }); };
  let tree = render();
  const dialog = { open: false, closes: 0, opens: 0, showModal() { this.open = true; this.opens++; }, close() { if (this.open) { this.open = false; this.closes++; } } };
  tree.props.ref.current = dialog;
  const mount = effects[0]; let cleanup;
  return {
    dialog, store, tree: () => tree, closed: () => parentClosed, actions: () => actions,
    mount() { cleanup = mount(); },
    replay() { tree.props.ref.current = null; cleanup(); tree.props.ref.current = dialog; cleanup = mount(); },
    unmount() { tree.props.ref.current = null; cleanup(); },
    render(props = {}) { extra = props; tree = render(); return tree; },
    close() { find(tree, node => node.type === 'button' && node.props['aria-label']).props.onClick(); },
    act() { find(tree, node => node.type === 'button' && node.props.className === 'btn btn-brand').props.onClick(); },
    escape() { let prevented = false; tree.props.onCancel({ preventDefault() { prevented = true; } }); return prevented; },
  };
}

for (const method of ['close', 'escape']) test(`report dialog ${method} synchronously closes once after StrictMode replay without listening to stale close events`, context => {
  const ui = lifecycle(context); ui.mount(); ui.replay();
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.tree().props.onClose, undefined, 'queued native close events do not drive parent selection');
  if (method === 'escape') assert.equal(ui.escape(), true); else ui.close();
  assert.equal(ui.dialog.open, false); assert.equal(ui.closed(), 1);
  ui.close(); ui.escape(); assert.equal(ui.closed(), 1);
  ui.unmount(); assert.equal(ui.dialog.opens, 2); assert.equal(ui.dialog.closes, 2);
});

test('report modal actions distinguish pending from retry-disabled and remain mounted after a transition', context => {
  const ui = lifecycle(context); ui.mount();
  ui.act(); assert.equal(ui.actions(), 1); assert.equal(ui.dialog.open, true);
  for (const props of [{ actionPending: true }, { actionDisabled: true }]) {
    const tree = ui.render(props); const action = find(tree, node => node.type === 'button' && node.props.className === 'btn btn-brand');
    assert.equal(action.props.disabled, true); ui.act(); assert.equal(ui.actions(), 1);
    assert.equal(Boolean(find(tree, node => node.props?.role === 'status')), Boolean(props.actionPending));
  }
  ui.unmount();
});

for (const transition of ['logout', 'account-change', 'same-account-reauth']) test(`retained report close/action handlers are fenced after ${transition}`, context => {
  const ui = lifecycle(context); ui.mount();
  if (transition === 'logout') ui.store.dispatch(auth.logout());
  else ui.store.dispatch(auth.setAuth(transition === 'account-change' ? b : a));
  ui.act(); ui.close(); ui.escape();
  assert.equal(ui.actions(), 0); assert.equal(ui.closed(), 0);
  ui.unmount(); assert.equal(ui.dialog.open, false); assert.equal(ui.closed(), 0);
});

test('a retained report dialog callback cannot dismiss or act after unmount', context => {
  const ui = lifecycle(context); ui.mount(); ui.unmount();
  ui.act(); ui.close(); ui.escape(); assert.equal(ui.actions(), 0); assert.equal(ui.closed(), 0);
});
