import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('  // ── place search:'), html.indexOf('  var shared = []'));

class Element {
  constructor(options) { this.options = options; this.children = []; this.listeners = {}; this.hidden = false; this.disabled = false; this.open = false; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  focus() {}
  dispatch(type) { this.listeners[type]?.(); }
}
const nodes = new Map();
const node = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
const sdk = {
  places: { PlaceAutocompleteElement: Element, PlaceDetailsElement: Element,
    PlaceDetailsPlaceRequestElement: class extends Element { constructor(options) { super(); this.place = options.place; } },
    PlaceAllContentElement: Element },
  importLibrary: async name => name === 'maps'
    ? { Map: class { setCenter() {} setZoom() {} } }
    : { AdvancedMarkerElement: class {} }
};
const context = vm.createContext({
  document: { getElementById: node, createElement: () => new Element(), body: { contains: () => true } },
  google: { maps: sdk }, window: {}, current: 5, console: { error() {} },
  esc: value => String(value).replaceAll('<', '&lt;'),
  setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => ({}) })
});
vm.runInContext(source, context);
assert.equal(typeof context.previewPlace, 'function', 'rich preview is available');

const place = name => ({ id: 'ChIJ_' + name, displayName: name, formattedAddress: '도쿄',
  location: { lat: 35.7, lng: 139.8 }, fetchFields: async () => {} });
context.openPlaceSearch();
assert.equal(node('place-dialog').open, true);
const search = node('place-search').children[0];
assert.equal(search.options.requestedLanguage, 'ko', 'search requests Korean results');
assert.equal(search.options.includedRegionCodes[0], 'jp', 'search stays in Japan');
await context.previewPlace(place('라멘'));
assert.equal(context.candidate.name, '라멘');
assert.equal(context.picked, null, 'preview does not commit before confirmation');
assert.equal(node('place-choose').disabled, false);
const widget = node('place-details').children[0];
assert.ok(widget.children.some(child => child instanceof sdk.places.PlaceAllContentElement), 'request all available Google details');
widget.dispatch('gmp-error');
assert.match(node('place-status').textContent, /불러오지/);
node('place-choose').dispatch('click');
assert.equal(context.picked.name, '라멘');
assert.equal(node('place-dialog').open, false);

node('place-dialog').showModal();
let finishSlow;
const slow = context.previewPlace({ ...place('느린 응답'), fetchFields: () => new Promise(resolve => { finishSlow = resolve; }) });
await context.previewPlace(place('최신 선택'));
finishSlow();
await slow;
assert.equal(context.candidate.name, '최신 선택', 'old responses cannot replace latest result');
node('place-dialog').close();
assert.equal(context.picked.name, '라멘', 'cancel preserves previous selection');

node('place-dialog').showModal();
let finishClosed;
const closed = context.previewPlace({ ...place('닫힌 검색'), fetchFields: () => new Promise(resolve => { finishClosed = resolve; }) });
node('place-dialog').close();
finishClosed();
await closed;
assert.equal(context.candidate, null, 'closed dialog ignores pending requests');

node('place-dialog').showModal();
await context.previewPlace({ ...place('오류'), fetchFields: async () => { throw new Error('network'); } });
assert.equal(node('place-choose').disabled, true);
assert.match(node('place-status').textContent, /다시/);
node('place-dialog').close();
assert.equal(await context.loadMaps(), false, 'missing API key keeps manual input available');
context.openPlaceSearch();
node('place-search').children[0].dispatch('gmp-error');
assert.equal(node('place-manual').hidden, false, 'denied search offers manual entry');
node('place-manual').dispatch('click');
assert.match(node('f-place').innerHTML, /id="f-name"/);
assert.equal(context.picked, null, 'manual fallback clears previous picked place');
assert.equal(html, readFileSync(new URL('./도쿄·후지·요코하마 동선 지도.html', import.meta.url), 'utf8'), 'local Artifact copy stays in sync');
console.log('place preview: selection, cancel, races, failure and local sync OK');
