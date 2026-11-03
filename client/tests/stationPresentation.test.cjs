const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { stationViewport, DEFAULT_STATION_VIEW } = require('../src/pages/mapPage/stationViewport.ts');
const Summary = require('../src/components/feedingStationDetails/FeedingCoordinationSummary.tsx').default;
const { t } = require('../src/i18n/index.ts');
const { localizeError } = require('../src/i18n/errors.ts');

test('a fresh station map resets camera and popup without animation, fits once, and cannot fit after disposal', () => {
  const calls = [];
  const camera = Object.fromEntries(['stop', 'closePopup', 'setView', 'fitBounds'].map(method => [method, (...args) => calls.push([method, ...args])]));
  const a = stationViewport(camera);
  assert.deepEqual(calls, [['stop'], ['closePopup'], ['setView', DEFAULT_STATION_VIEW.center, 13, { animate: false }]]);
  a.fit([]);
  a.fit([{ location: { lat: 31, lng: 35 } }]);
  a.fit([{ location: { lat: 30, lng: 34 } }]);
  assert.deepEqual(calls[3], ['fitBounds', [[31, 35]], { padding: [24, 24], maxZoom: 13, animate: false }]);
  assert.equal(calls.filter(call => call[0] === 'fitBounds').length, 1);
  a.dispose();
  const afterDispose = calls.length;
  a.fit([{ location: { lat: 29, lng: 33 } }]);
  assert.equal(calls.length, afterDispose, 'old effects cannot re-center a replacement map');
  const b = stationViewport(camera);
  b.fit([{ location: { lat: 32, lng: 34 } }]);
  assert.deepEqual(calls.at(-2), ['setView', DEFAULT_STATION_VIEW.center, 13, { animate: false }]);
  assert.deepEqual(calls.at(-1)[1], [[32, 34]], 'new epoch has a fresh fit lifecycle');
  b.dispose();
});

test('shared food and water render independently without feeder, note or exact-time fields', () => {
  const markup = renderToStaticMarkup(React.createElement(Summary, { summary: {
    food: { recency: 'under-2h', userId: 'SYNTHETIC_OTHER_USER', fedAt: '2026-11-03T07:08:09.000Z', note: 'SYNTHETIC_PRIVATE_NOTE' },
    water: { recency: 'no-record' },
  } }));
  for (const key of ['feeding.food', 'feeding.water', 'feeding.recency.under-2h', 'feeding.recency.no-record']) assert.ok(markup.includes(t(key)));
  assert.doesNotMatch(markup, /SYNTHETIC_OTHER_USER|SYNTHETIC_PRIVATE_NOTE|07:08:09|<time/);
  assert.match(t('feeding.summaryMeaning'), /אינו אומר/);
  assert.match(t('feeding.recency.no-record'), /Ray/);
});

test('all approved recency buckets have Hebrew presentation without exact event instants', () => {
  for (const recency of ['under-2h', '2-to-6h', '6-to-12h', '12-to-24h', 'older', 'no-record']) {
    const markup = renderToStaticMarkup(React.createElement(Summary, { summary: { food: { recency }, water: { recency } } }));
    assert.ok(markup.includes(t('feeding.recency.' + recency)));
    assert.doesNotMatch(markup, /feeding\.recency|datetime=|<time/);
  }
});

test('typed throttling retains bounded retry metadata at the presentation boundary', () => {
  const failure = { kind: 'rate-limit', status: 429, sessionId: 'synthetic', requestId: 'retry', message: 'untrusted server text', retryAfter: 60 };
  assert.equal(localizeError(failure, 'feeding'), t('errors.rateLimitedWait', { count: 60 }));
  for (const retryAfter of [-1, 0, 86401, Infinity, NaN, '60']) {
    assert.equal(localizeError({ ...failure, retryAfter }, 'feeding'), t('errors.rateLimited'));
  }
  assert.equal(localizeError({ ...failure, retryAfter: 5, response: { status: 429, headers: { 'retry-after': '2' } } }), t('errors.rateLimitedWait', { count: 2 }));
});
