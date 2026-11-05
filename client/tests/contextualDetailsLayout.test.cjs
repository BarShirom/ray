const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const postcss = require('postcss');

const parse = file => postcss.parse(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'));
function baseRule(root, selector) {
  const found = root.nodes.find(node => node.type === 'rule' && node.selectors.includes(selector));
  assert.ok(found, `unconditional rule for ${selector}`);
  return Object.fromEntries(found.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
}

// These source contracts apply at both requested mobile widths. PostCSS does
// not calculate pixels, overflow, native focus, attribution visibility or reflow.
for (const width of [320, 390]) {
  test(`contextual CSS retains in-flow wrapping and reachable controls at the ${width}px mobile breakpoint`, () => {
    const map = parse('pages/mapPage/MapPage.css');
    const card = baseRule(map, '.map-layout .map-selection-card');
    assert.equal(card['min-width'], '0');
    assert.equal(card['overflow-wrap'], 'anywhere');
    assert.ok(!card.position || card.position === 'static', 'card cannot overlay Leaflet controls or attribution');
    assert.equal(baseRule(map, '.map-layout')['grid-template-columns'], 'minmax(0, 1fr)');
    assert.equal(baseRule(map, '.map-layout .map-selection-heading')['flex-wrap'], 'wrap');
    assert.equal(baseRule(map, '.map-layout .map-selection-card .btn')['max-width'], '100%');
    assert.equal(baseRule(map, '.map-layout .map-selection-card .btn')['white-space'], 'normal');
    assert.equal(baseRule(map, '.map-layout .btn')['min-height'], '44px');
    const desktop = map.nodes.find(node => node.type === 'atrule' && node.name === 'media' && node.params === '(min-width: 900px)');
    assert.ok(desktop && width < 900, 'desktop columns cannot apply at either mobile width');
    const modal = parse('components/reportDetails/ReportDetails.css');
    assert.equal(baseRule(modal, '.report-details').width, 'min(560px, calc(100vw - 24px))');
    assert.equal(baseRule(modal, '.report-details')['overflow-wrap'], 'anywhere');
    assert.equal(baseRule(modal, '.report-details__header')['flex-wrap'], 'wrap');
    assert.equal(baseRule(modal, '.report-details__body')['min-height'], '0');
    assert.equal(baseRule(modal, '.report-details__body')['overflow-y'], 'auto');
    assert.equal(baseRule(modal, '.report-details__navigation')['flex-wrap'], 'wrap');
    assert.equal(baseRule(modal, '.report-details .btn')['min-height'], '44px');
  });
}
