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
const reduxFile = require.resolve('react-redux');
require.cache[reduxFile] = { id: reduxFile, filename: reduxFile, loaded: true, exports: { ...require(reduxFile), useStore: () => activeStore } };
const { configureStore } = require('@reduxjs/toolkit');
const auth = require('../src/features/auth/authSlice.ts');
const stations = require('../src/features/feedingStations/feedingStationsSlice.ts');
const logs = require('../src/features/feedingLogs/feedingLogsSlice.ts');
const { fetchFeedingStationDetail } = require('../src/features/feedingStations/feedingStationsThunks.ts');
const { stationInactive } = require('../src/features/feedingStations/protectedStationApi.ts');
const { http } = require('../src/api/http.ts');
const hooks = require('../src/app/hooks.ts');
const Details = require('../src/components/feedingStationDetails/FeedingStationDetails.tsx').default;
const { t } = require('../src/i18n/index.ts');

function find(element, predicate) {
  if (!element || typeof element !== 'object') return;
  if (Array.isArray(element)) {
    for (const child of element) { const found = find(child, predicate); if (found) return found; }
    return;
  }
  return predicate(element) ? element : find(element.props?.children, predicate);
}

// Runs the production component's effect, refs and handlers. The dialog double
// models close() changing open synchronously, restoring focus and queuing close
// on the user-interaction task source. This is deterministic lifecycle evidence,
// not a mounted DOM, native browser or assistive-technology acceptance result.
function fixture(context) {
  activeStore = configureStore({ reducer: { auth: auth.default, feedingStations: stations.default, feedingLogs: logs.default } });
  activeStore.dispatch(auth.setAuth({ id: 'synthetic-a', token: 'synthetic-token', firstName: 'A', lastName: 'Fixture', email: 'a@example.invalid' }));
  const cells = [], effects = []; let cursor = 0;
  context.mock.method(React, 'useState', initial => {
    const index = cursor++;
    if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
    return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }];
  });
  context.mock.method(React, 'useRef', initial => { const index = cursor++; return cells[index] ??= { current: initial }; });
  context.mock.method(React, 'useEffect', (effect, dependencies) => { effects.push({ effect, dependencies }); });
  context.mock.method(hooks, 'useAppDispatch', () => activeStore.dispatch);
  context.mock.method(hooks, 'useAppSelector', selector => selector(activeStore.getState()));
  context.mock.method(globalThis, 'fetch', () => assert.fail('The dialog lifecycle must not issue HTTP'));

  const focusEvents = [], document = { activeElement: null };
  class Element {
    isConnected = true;
    focus(options) { document.activeElement = this; focusEvents.push({ element: this, options }); }
  }
  for (const [key, value] of [['HTMLElement', Element], ['document', document]]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    context.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  }
  const opener = new Element(); document.activeElement = opener;
  let parentClosed = 0;
  const station = { _id: 'synthetic-station', name: 'Synthetic station', active: true, permissions: { canFeed: true, canManage: false },
    estimatedCats: 1, estimatedKittens: 0, location: { lat: 32, lng: 34 } };
  const render = () => {
    cursor = 0; effects.length = 0;
    return Details({ station, onClose: () => { parentClosed++; } });
  };
  let tree = render();
  const queued = [];
  class Dialog extends Element {
    open = false;
    previousFocus = null;
    showModal() {
      assert.equal(this.open, false);
      this.previousFocus = document.activeElement;
      this.open = true;
      this.focus();
    }
    close() {
      if (!this.open) return;
      this.open = false;
      if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
      queued.push(() => tree.props.onClose({ currentTarget: this }));
    }
  }
  const dialog = new Dialog(); tree.props.ref.current = dialog;
  const setup = effects.find(item => item.dependencies.length === 0).effect;
  let cleanup;
  return {
    dialog, opener, document, focusEvents, queued, store: activeStore, station,
    render() { tree = render(); return tree; },
    parentClosed: () => parentClosed,
    mount() { cleanup = setup(); },
    replay() {
      // React's StrictMode disconnect/reconnect preserves hook refs and the node;
      // host refs can be detached before passive cleanup, then reattached.
      tree.props.ref.current = null;
      cleanup();
      tree.props.ref.current = dialog;
      cleanup = setup();
    },
    unmount() { tree.props.ref.current = null; cleanup(); dialog.isConnected = false; },
    deliverNext() { assert.ok(queued.length); queued.shift()(); },
    drain() { while (queued.length) queued.shift()(); },
    closeButton() { find(tree, node => node.type === 'button' && node.props['aria-label']).props.onClick(); },
    escape() { let prevented = false; tree.props.onCancel({ preventDefault() { prevented = true; } }); return prevented; },
  };
}

test('StrictMode setup-cleanup-setup ignores the delayed cleanup close event after reopening', context => {
  const ui = fixture(context);
  ui.mount(); ui.replay();
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.queued.length, 1);
  const focusCount = ui.focusEvents.length;
  ui.deliverNext();
  assert.equal(ui.dialog.open, true, 'an obsolete close event cannot dismiss the reopened dialog');
  assert.equal(ui.parentClosed(), 0);
  assert.equal(ui.document.activeElement, ui.dialog);
  assert.equal(ui.focusEvents.length, focusCount, 'an obsolete event cannot move focus out of the reopened dialog');
  ui.unmount(); ui.drain();
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.parentClosed(), 0);
});

for (const action of ['closeButton', 'escape']) {
  test(`${action} closes once and restores connected opener focus after StrictMode replay`, context => {
    const ui = fixture(context);
    ui.mount(); ui.replay();
    if (action === 'escape') assert.equal(ui.escape(), true);
    else ui.closeButton();
    assert.equal(ui.dialog.open, false);
    assert.equal(ui.parentClosed(), 1);
    assert.equal(ui.document.activeElement, ui.opener);
    assert.ok(ui.focusEvents.some(event => event.element === ui.opener && event.options?.preventScroll === true));
    ui.drain(); ui.closeButton();
    assert.equal(ui.parentClosed(), 1, 'queued cleanup/current close events and duplicate handlers cannot repeat dismissal');
    ui.unmount(); ui.drain();
    assert.equal(ui.parentClosed(), 1);
  });
}

test('a legitimate native close still dismisses once after an obsolete cleanup event', context => {
  const ui = fixture(context);
  ui.mount(); ui.replay(); ui.deliverNext();
  ui.dialog.close();
  assert.equal(ui.parentClosed(), 0, 'native close notification remains asynchronous');
  ui.deliverNext();
  assert.equal(ui.parentClosed(), 1);
  assert.equal(ui.document.activeElement, ui.opener);
  ui.unmount(); ui.drain();
  assert.equal(ui.parentClosed(), 1);
});

test('unmount closes the native dialog without a stale parent callback or detached focus target', context => {
  const ui = fixture(context);
  ui.mount(); ui.replay();
  ui.opener.isConnected = false;
  const focusCount = ui.focusEvents.length;
  ui.unmount(); ui.drain();
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.queued.length, 0);
  assert.equal(ui.parentClosed(), 0, 'cleanup notifications cannot dismiss a replacement parent selection');
  assert.equal(ui.focusEvents.length, focusCount, 'neither cleanup nor its queued notifications focus a detached opener');
});

test('an uncached inactive observation suppresses feeding until a fresh authoritative detail recovers it', context => {
  const ui = fixture(context), stationId = ui.station._id, sessionId = ui.store.getState().auth.sessionId;
  ui.store.dispatch({ ...fetchFeedingStationDetail.pending('old-detail', stationId), meta: { requestId: 'old-detail', arg: stationId, sessionId } });
  ui.store.dispatch(stationInactive({ stationId, sessionId }));
  assert.equal(ui.store.getState().feedingStations.detailsById[stationId].data, null, 'do not fabricate station metadata for an inactive observation');
  assert.deepEqual(ui.store.getState().feedingStations.data, []);
  let tree = ui.render();
  assert.ok(find(tree, node => node.type === 'p' && node.props.children === t('feeding.inactive')));
  assert.equal(find(tree, node => node.type === 'button' && node.props.children === t('feeding.fedHere')), undefined);
  ui.store.dispatch({ ...fetchFeedingStationDetail.fulfilled(ui.station, 'old-detail', stationId), meta: { requestId: 'old-detail', arg: stationId, sessionId } });
  tree = ui.render();
  assert.equal(find(tree, node => node.type === 'button' && node.props.children === t('feeding.fedHere')), undefined, 'a superseded active detail cannot reenable feeding');
  ui.store.dispatch({ ...fetchFeedingStationDetail.pending('fresh-detail', stationId), meta: { requestId: 'fresh-detail', arg: stationId, sessionId } });
  ui.store.dispatch({ ...fetchFeedingStationDetail.fulfilled(ui.station, 'fresh-detail', stationId), meta: { requestId: 'fresh-detail', arg: stationId, sessionId } });
  assert.ok(find(ui.render(), node => node.type === 'button' && node.props.children === t('feeding.fedHere')), 'a current authoritative detail can recover active feeding');
});

test('an inactive observation also fences a retained feeding form before React rerenders', async context => {
  const ui = fixture(context), stationId = ui.station._id, sessionId = ui.store.getState().auth.sessionId;
  find(ui.render(), node => node.type === 'button' && node.props.children === t('feeding.fedHere')).props.onClick();
  const submit = find(ui.render(), node => node.type === 'form').props.onSubmit;
  ui.store.dispatch({ ...fetchFeedingStationDetail.pending('pending-detail', stationId), meta: { requestId: 'pending-detail', arg: stationId, sessionId } });
  ui.store.dispatch(stationInactive({ stationId, sessionId }));
  let posts = 0;
  context.mock.method(http, 'post', async () => { posts++; throw new Error('Synthetic forbidden stale submission'); });
  await submit({ preventDefault() {} });
  assert.equal(posts, 0, 'a retained active form must consult the current inactive observation');
  assert.equal(find(ui.render(), node => node.type === 'form'), undefined);
});
