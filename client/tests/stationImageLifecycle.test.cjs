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
const beginImageLoad = mediaApi.beginStationImageLoad;
const source = 'http://fixture.invalid/api/media/11111111-1111-4111-8111-111111111111/content';
const user = id => ({ id, token: 'synthetic-same-token', firstName: 'Synthetic', lastName: 'Fixture', email: 'fixture@example.invalid' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const controlled = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

// Captures the real effect and real render gates without a DOM/test framework.
// Object URL decoding and visual browser acceptance remain separate evidence.
function fixture(context, actor) {
  activeStore = configureStore({ reducer: { auth: auth.default } });
  activeStore.dispatch(auth.setAuth(user(actor)));
  const cells = [], effects = [], tasks = []; let cursor = 0;
  context.mock.method(mediaApi, 'beginStationImageLoad', (...args) => { const task = beginImageLoad(...args); tasks.push(task); return task; });
  context.mock.method(React, 'useState', initial => {
    const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
    return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }];
  });
  context.mock.method(React, 'useRef', initial => { const index = cursor++; return cells[index] ??= { current: initial }; });
  context.mock.method(React, 'useEffect', effect => { effects.push(effect); });
  context.mock.method(hooks, 'useAppSelector', selector => selector(activeStore.getState()));
  return { render: () => { cursor = 0; effects.length = 0; return StationMediaImage({ src: source, alt: 'SYNTHETIC image' }); },
    runImageEffect: () => effects.at(-1)(), completed: () => tasks.at(-1)?.completed, store: activeStore };
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
