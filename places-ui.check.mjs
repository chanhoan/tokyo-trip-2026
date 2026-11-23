import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('  // ── place search:'), html.indexOf('  var shared = []'));
const timeContext = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('  function timeOptions('), html.indexOf('  function renderDetail(')), timeContext);
assert.equal(typeof timeContext.timeOptions, 'function', 'visible hour/minute choices replace native time input');
for (const [count, label] of [[24, '시'], [60, '분']]) {
  const options = timeContext.timeOptions(count, label);
  assert.equal((options.match(/<option/g) || []).length, count + 1);
  assert.ok(options.includes('<option value="">' + label + '</option>'));
  assert.ok(options.includes('value="00"'));
  assert.ok(options.includes('value="' + (count - 1) + '"'));
}
assert.ok(!html.includes('type="time"'), 'Safari cannot hide the native time UI because it is no longer used');
assert.match(html, /id="f-hour"[^>]*required/);
assert.match(html, /id="f-minute"[^>]*required/);

class Element {
  constructor(options) { this.options = options; this.children = []; this.listeners = {}; this.style = {}; this.classList = { toggle() {} }; this.hidden = false; this.disabled = false; this.open = false; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  focus() { this.focused = true; }
  dispatch(type, event = {}) { return this.listeners[type]?.(event); }
  get firstChild() { return this.children[0]; }
}
const nodes = new Map();
const node = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
const sdk = {
  places: { PlaceDetailsElement: Element,
    Place: class { constructor({ id }) { this.id = id; } async fetchFields() { this.displayName = this.id.replace('ChIJ_', ''); this.formattedAddress = '도쿄'; this.location = { lat: 35.7, lng: 139.8 }; } },
    PlaceDetailsPlaceRequestElement: class extends Element { constructor(options) { super(); this.place = options.place; } },
    PlaceAllContentElement: Element, AdvancedPlaceDetailsElement: Element, PlaceMediaElement: class extends Element { constructor(options) { super(); Object.assign(this, options); this.searchMediaCount = 0; } } },
  importLibrary: async name => name === 'maps'
    ? { Map: class { constructor(el, options) { this.options = options; this.center = { lat: 35.68, lng: 139.76 }; } getCenter() { return this.center; } setCenter(center) { this.center = center; } panTo() {} panBy() {} addListener(type, listener) { this['on' + type] = listener; } setZoom(zoom) { this.zoom = zoom; } fitBounds() {} } }
    : name === 'marker' ? { AdvancedMarkerElement: class extends Element { constructor(options) { super(); Object.assign(this, options); } } }
    : { LatLngBounds: class { extend() {} } }
};
let geoFix = { latitude: 37.56, longitude: 126.97 }; // Seoul: outside Japan
let geoCalls = 0;
const searchBodies = [];
const searchReplies = []; // queued Text Search replies: JSON body, 'fail', or a pending Promise
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const rest = name => ({ id: 'ChIJ_' + name, displayName: { text: name }, formattedAddress: '도쿄', location: { latitude: 35.7, longitude: 139.8 }, rating: 4.4, userRatingCount: 10, photos: [{ name: 'places/ChIJ_' + name + '/photos/p1', authorAttributions: [{ displayName: '작가' }] }] });
const context = vm.createContext({
  document: { getElementById: node, createElement: () => new Element(), body: { contains: () => true } },
  google: { maps: sdk }, window: {}, current: 5, console: { error() {} },
  esc: value => String(value).replaceAll('<', '&lt;'),
  setTimeout, clearTimeout, AbortSignal,
  fetch: async (url, options) => {
    if (!String(url).includes('searchText')) return { ok: true, json: async () => ({}) };
    searchBodies.push(JSON.parse(options.body));
    const reply = await searchReplies.shift();
    return reply === 'fail' ? { ok: false, status: 403 } : { ok: true, json: async () => reply ?? { places: [] } };
  },
  navigator: { geolocation: { getCurrentPosition: success => { geoCalls++; success({ coords: geoFix }); } } }
});
vm.runInContext(source, context);
assert.equal(geoCalls, 1, 'location is requested on page load, before the search opens');
assert.equal(typeof context.previewPlace, 'function', 'rich preview is available');

const place = name => ({ id: 'ChIJ_' + name, displayName: name, formattedAddress: '도쿄',
  location: { lat: 35.7, lng: 139.8 }, fetchFields: async () => {} });
await context.openPlaceSearch();
assert.equal(node('place-dialog').open, true);
assert.ok(!node('place-query').focused, 'opening the map does not focus the search box (no keyboard pop-up)');
assert.match(html, /id="place-title"[^>]*tabindex="-1"[^>]*autofocus/, 'dialog opens with focus on the hidden title, not a button with a focus ring');
assert.ok(context.placeMap, 'map exists before any search');
assert.equal(context.placeMap.options.gestureHandling, 'greedy', 'full-screen map pans with one finger');
assert.deepEqual(context.placeMap.center, { lat: 35.68, lng: 139.76 }, 'viewer outside Japan keeps the Tokyo centre');
assert.equal(node('place-sheet')['data-size'], 'peek', 'sheet opens low so the map shows');
node('place-handle').dispatch('click');
assert.equal(node('place-sheet')['data-size'], 'half', 'handle raises the sheet');
context.placeMap.onclick();
assert.equal(node('place-sheet')['data-size'], 'peek', 'tapping the map lowers the sheet');
Object.assign(context.window, { innerHeight: 844, matchMedia: () => ({ matches: false }) });
node('place-handle').setPointerCapture = () => {};
node('place-sheet').offsetHeight = 148;
node('place-handle').dispatch('pointerdown', { clientY: 700, pointerId: 1, currentTarget: node('place-handle') });
node('place-handle').dispatch('pointermove', { clientY: 150 });
assert.equal(node('place-sheet').style.height, '698px', 'sheet follows the finger');
node('place-sheet').offsetHeight = 698;
node('place-handle').dispatch('pointerup', {});
node('place-handle').dispatch('click');
assert.equal(node('place-sheet')['data-size'], 'full', 'release snaps to the nearest size; the trailing click is ignored');
context.placeMap.onclick();
node('place-status').setPointerCapture = () => {};
node('place-sheet').offsetHeight = 148;
node('place-status').dispatch('pointerdown', { clientY: 700, pointerId: 2, currentTarget: node('place-status') });
node('place-status').dispatch('pointermove', { clientY: 670 });
node('place-sheet').offsetHeight = 178;
node('place-status').dispatch('pointerup', {});
assert.equal(node('place-sheet')['data-size'], 'half', 'a short drag on the status line still moves one step up');
delete context.window.matchMedia;
node('place-dialog').close();
geoFix = { latitude: 35.71, longitude: 139.79 }; // Asakusa
await context.openPlaceSearch();
assert.deepEqual({ ...context.placeMap.center }, { lat: 35.71, lng: 139.79 }, 'viewer in Japan centres the map on themselves');
assert.equal(node('place-map').hidden, false, 'map is visible before searching');
assert.ok(html.includes('<legend>방문 시간 (24시간)</legend>'));
assert.ok(!html.includes('지도·사진·리뷰로 장소 찾기'), 'short button text');
node('place-query').value = '  이치란  ';
searchReplies.push({ places: [rest('라멘'), rest('다른 가게')], nextPageToken: 'p2' });
await context.searchPlaces();
assert.equal(searchBodies.at(-1).textQuery, '이치란');
assert.equal(searchBodies.at(-1).pageSize, 20, 'Google pages hold at most 20');
const list = node('place-results').children[0];
const more = node('place-results').children[1];
assert.equal(list.children.length, 2, 'results render as a list');
assert.match(list.children[0].firstChild.children[3].textContent, /★ 4\.4 \(10\) · 도쿄/);
const thumb = list.children[0].firstChild.children[1].children[0];
assert.match(thumb.src, /places\/ChIJ_라멘\/photos\/p1\/media\?maxWidthPx=128/, 'list shows the first photo as a thumbnail');
assert.equal(thumb.loading, 'lazy', 'thumbnails load only when scrolled into view');
assert.equal(list.children[0].firstChild.children[4].textContent, '사진: 작가', 'photo author is credited');
assert.equal(context.placeMarkers.length, 2, 'every search result has a pin');
assert.equal(more.hidden, false, 'more button shows while Google has another page');
assert.equal(context.candidate, null, 'search results do not select a place automatically');
searchReplies.push({ places: [{ ...rest('셋째'), photos: undefined }] });
await more.dispatch('click');
assert.equal(searchBodies.at(-1).pageToken, 'p2', 'next page uses the token');
assert.equal(searchBodies.at(-1).textQuery, '이치란', 'next page repeats the same query');
assert.equal(list.children.length, 3, 'next page appends to the list');
assert.equal(list.children[2].firstChild.children[0].textContent, '3', 'numbering continues across pages');
assert.equal(context.placeMarkers.length, 3, 'next page adds pins');
assert.equal(more.hidden, true, 'more button hides on the last page');
assert.equal(list.children[2].firstChild.focused, true, 'focus moves to the first new result');
assert.equal(list.children[2].firstChild.children[1].children.length, 0, 'place without photos keeps an empty thumbnail box');
context.placeMarkers[0].marker.dispatch('gmp-click');
await tick();
assert.equal(context.candidate.name, '라멘', 'pin opens place details');
assert.equal(node('place-back').focused, true, 'selection moves focus into the detail view');
await list.children[1].firstChild.dispatch('click');
assert.equal(context.candidate.name, '다른 가게', 'result row opens place details');
assert.equal(context.placeMarkers.length, 3, 'browsing keeps all result pins');
node('place-back').dispatch('click');
assert.equal(node('place-results').hidden, false, 'back restores existing result list');
assert.equal(context.candidate, null, 'back clears unconfirmed candidate');
assert.equal(node('place-results').focused, true, 'back restores result focus');
await context.previewPlace(place('라멘'));
assert.equal(context.candidate.name, '라멘');
assert.equal(context.picked, null, 'preview does not commit before confirmation');
assert.equal(node('place-choose').disabled, false);
assert.equal(node('place-menu-photos').children.length, 0, 'menu photos load only when requested');
node('place-menu').dispatch('click');
const menuWidget = node('place-menu-photos').children[0];
assert.ok(menuWidget, 'menu button opens the photo search widget');
const menuMedia = menuWidget.children.find(child => child instanceof sdk.places.PlaceMediaElement);
assert.equal(menuWidget.style.visibility, 'hidden', 'unfiltered default photos are hidden');
menuWidget.dispatch('gmp-load');
assert.equal(menuMedia.query, 'メニュー', 'menu photo search uses Japanese for Japanese businesses');
menuMedia.searchMediaCount = 5;
menuWidget.dispatch('gmp-load');
assert.match(node('place-menu-status').textContent, /5/);
node('place-overview').dispatch('click');
assert.equal(node('place-details').hidden, false);
node('place-menu').dispatch('click');
assert.equal(node('place-menu-photos').children[0], menuWidget, 'toggle reuses loaded menu photos');
const menuHeading = node('place-status').textContent;
node('place-details').children[0].dispatch('gmp-load');
assert.equal(node('place-status').textContent, menuHeading, 'background overview cannot replace menu status');
node('place-overview').dispatch('click');
const widget = node('place-details').children[0];
assert.ok(widget.children.some(child => child instanceof sdk.places.PlaceAllContentElement), 'request all available Google details');
widget.dispatch('gmp-error');
assert.match(node('place-status').textContent, /불러오지/);
node('place-choose').dispatch('click');
assert.equal(context.picked.name, '라멘');
assert.equal(node('place-dialog').open, false);
assert.ok(!node('f-memo').focused, 'choosing a place does not focus the memo (no keyboard pop-up)');

node('place-dialog').showModal();
let finishSlow;
const slow = context.previewPlace({ ...place('느린 응답'), fetchFields: () => new Promise(resolve => { finishSlow = resolve; }) });
await context.previewPlace(place('최신 선택'));
finishSlow();
await slow;
assert.equal(context.candidate.name, '최신 선택', 'old responses cannot replace latest result');
node('place-dialog').close();
assert.equal(context.picked.name, '라멘', 'cancel preserves previous selection');
menuWidget.dispatch('gmp-load');
assert.equal(node('place-menu-photos').children.length, 0, 'closed preview clears menu content');

await context.openPlaceSearch();
node('place-query').value = '첫 검색';
searchReplies.push({ places: [rest('라멘')], nextPageToken: 'x' });
await context.searchPlaces();
assert.equal(context.placeMap.zoom, 16, 'one result stays at a useful street zoom');
const oldPin = context.placeMarkers[0].marker;
const oldMore = node('place-results').children[1];
searchReplies.push('fail');
await oldMore.dispatch('click');
assert.equal(oldMore.textContent, '다시 시도', 'failed page offers retry');
assert.equal(oldMore.disabled, false);
assert.match(node('place-status').textContent, /더 불러오지/);
assert.equal(node('place-results').children[0].children.length, 1, 'failed page keeps loaded results');
let releaseOld;
searchReplies.push(new Promise(resolve => { releaseOld = resolve; }));
node('place-query').value = '느린 검색';
const slowSearch = context.searchPlaces();
await tick();
node('place-query').value = '새 검색';
searchReplies.push({ places: [] });
await context.searchPlaces();
assert.equal(context.candidate, null, 'new search clears candidate');
assert.equal(node('place-detail-actions').hidden, true, 'new search hides old place photo actions');
oldPin.dispatch('gmp-click');
await tick();
assert.equal(context.candidate, null, 'stale pin events cannot select previous search results');
releaseOld({ places: [rest('라멘')] });
await slowSearch;
assert.equal(context.placeMarkers.length, 0, 'stale search results cannot add pins');
assert.match(node('place-status').textContent, /없어요/);
searchReplies.push('fail');
await context.searchPlaces();
assert.equal(node('place-map').hidden, false, 'search errors leave map visible');
assert.equal(node('place-manual').hidden, false, 'denied search offers manual entry');
node('place-dialog').close();

node('place-dialog').showModal();
await context.previewPlace(place('메뉴 없음'));
node('place-menu').dispatch('click');
const emptyMenu = node('place-menu-photos').children[0];
emptyMenu.dispatch('gmp-load');
emptyMenu.dispatch('gmp-load');
assert.equal(emptyMenu.hidden, true, 'zero menu matches never display fallback general photos');
assert.match(node('place-menu-status').textContent, /찾지 못/);
emptyMenu.dispatch('gmp-error');
assert.match(node('place-menu-status').textContent, /다시/);
const failedMenuStatus = node('place-menu-status').textContent;
emptyMenu.children.find(child => child instanceof sdk.places.PlaceMediaElement).searchMediaCount = 5;
emptyMenu.dispatch('gmp-load');
assert.equal(node('place-menu-status').textContent, failedMenuStatus, 'late load after failure cannot report detached photos as loaded');
node('place-overview').dispatch('click');
node('place-dialog').close();

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
await context.openPlaceSearch();
node('place-query').value = '오류';
searchReplies.push('fail');
await context.searchPlaces();
assert.equal(node('place-manual').hidden, false, 'denied search offers manual entry');
node('place-manual').dispatch('click');
assert.match(node('f-place').innerHTML, /id="f-name"/);
assert.equal(context.picked, null, 'manual fallback clears previous picked place');
assert.equal(html, readFileSync(new URL('./도쿄·후지·요코하마 동선 지도.html', import.meta.url), 'utf8'), 'local Artifact copy stays in sync');

const submitSource = html.slice(html.indexOf("  detail.addEventListener('submit'"), html.indexOf("  detail.addEventListener('click'"));
const submitTarget = new Element();
const fields = Object.fromEntries(['f-hour', 'f-minute', 'f-name', 'f-memo', 'f-by', 'submit'].map(id => [id, { value: '', disabled: false }]));
const form = { id: 'add-form', querySelector: selector => fields[selector === 'button[type="submit"]' ? 'submit' : selector.slice(1)] };
let posted;
let putUrl;
let responseOk = true;
const submitContext = vm.createContext({
  detail: submitTarget, current: 5, picked: null, editing: null, document: { getElementById: node },
  localStorage: { setItem() {} }, showPicked() {}, mountPlaceInput() {}, load: async () => {}, alert() {},
  setNowTime(f) { f.querySelector('#f-hour').value = '12'; f.querySelector('#f-minute').value = '34'; },
  fetch: async (url, options) => { posted = JSON.parse(options.body); putUrl = options.method === 'PUT' ? url : null; return { ok: responseOk, json: async () => ({ error: '저장 실패' }) }; }
});
vm.runInContext(submitSource, submitContext);
for (const [hour, minute] of [['00', '00'], ['09', '05'], ['23', '59']]) {
  fields['f-hour'].value = hour;
  fields['f-minute'].value = minute;
  fields['f-name'].value = '센소지';
  fields['f-by'].value = '여행자';
  submitTarget.dispatch('submit', { target: form, preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(posted.time, hour + ':' + minute, 'POST preserves padded 24-hour time');
  assert.equal(fields['f-hour'].value + ':' + fields['f-minute'].value, '12:34', 'saving resets the time to now');
  assert.equal(fields['f-by'].value, '여행자', 'saving preserves nickname');
}
responseOk = false;
fields['f-hour'].value = '09';
fields['f-minute'].value = '05';
submitTarget.dispatch('submit', { target: form, preventDefault() {} });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(fields['f-hour'].value, '09', 'failed save preserves hour');
assert.equal(fields['f-minute'].value, '05', 'failed save preserves minute');
responseOk = true;
submitContext.editing = 'abc-1';
submitTarget.dispatch('submit', { target: form, preventDefault() {} });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(putUrl, '/api/places?id=abc-1', 'editing saves with PUT to the same id');
assert.equal(submitContext.editing, null, 'a saved edit returns the form to adding');
assert.equal(fields.submit.textContent, '12/5 일정에 추가', 'submit label goes back to add');
context.picked = { name: '센소지', placeId: 'x', address: '' };
context.showPicked();
assert.match(node('f-picked').innerHTML, /picked-clear/, 'picked place has a clear button');
const clickSource = html.slice(html.indexOf("  detail.addEventListener('click'"), html.indexOf('  async function moveFixedItem('));
const clickTarget = new Element();
let cleared = false;
const clickContext = vm.createContext({ detail: clickTarget, picked: { name: '센소지' }, showPicked() { cleared = true; }, confirm: () => false });
vm.runInContext(clickSource, clickContext);
clickTarget.dispatch('click', { target: { closest: selector => selector === '.picked-clear' ? {} : null } });
assert.equal(clickContext.picked, null, 'clear button drops the picked place before saving');
assert.ok(cleared, 'form re-renders without the picked place');
console.log('place preview: selection, cancel, races, failure and local sync OK');
