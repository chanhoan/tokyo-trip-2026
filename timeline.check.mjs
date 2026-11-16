import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('index.html', 'utf8');
assert.equal(html, readFileSync('도쿄·후지·요코하마 동선 지도.html', 'utf8'));
new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const day = { d: 9, items: [['오전', '체크아웃'], ['오후', '체크인']] };
const context = vm.createContext({
  shared: [{ id: 'place', day: 9, time: '13:00', at: 1 }], timelineOrders: {},
  placesLoaded: true, loadFailed: false, orderSaving: false, orderVersion: 0,
  current: 9, byDay: () => day, renderTimeline() {}, console: { error() {} },
  detail: { querySelectorAll: () => [] }, alert: () => { context.alerted = true; }
});
vm.runInContext(html.slice(html.indexOf('  var SLOT ='), html.indexOf('  function mapsUrl(')), context);
vm.runInContext(html.slice(html.indexOf('  async function moveFixedItem('), html.indexOf('  setInterval(function ()')), context);
const ids = () => Array.from(context.timelineRows(day), r => r.id);
assert.deepEqual(ids(), ['fixed:9:체크아웃', 'place', 'fixed:9:체크인']);
let requests = 0;
context.fetch = async (url, options) => {
  requests++;
  assert.equal(options.method, 'PUT');
  assert.deepEqual(JSON.parse(options.body), { day: 9, ids: ['place', 'fixed:9:체크아웃', 'fixed:9:체크인'] });
  return { ok: true };
};
await context.moveFixedItem({ dataset: { id: 'fixed:9:체크아웃', step: '1' } });
assert.deepEqual(ids(), ['place', 'fixed:9:체크아웃', 'fixed:9:체크인']);
assert.equal(context.orderSaving, false);
context.fetch = async () => { requests++; return { ok: false, status: 500 }; };
await context.moveFixedItem({ dataset: { id: 'fixed:9:체크아웃', step: '1' } });
assert.deepEqual(ids(), ['place', 'fixed:9:체크아웃', 'fixed:9:체크인'], 'failed save keeps previous order');
assert.equal(context.alerted, true);
await context.moveFixedItem({ dataset: { id: 'fixed:9:체크인', step: '1' } });
assert.equal(requests, 2, 'cannot move past last row');
context.orderSaving = true;
await context.moveFixedItem({ dataset: { id: 'fixed:9:체크아웃', step: '1' } });
assert.equal(requests, 2, 'cannot overlap saves');
context.shared = [{ id: 'new', day: 9, time: '08:00', at: 2 }];
assert.deepEqual(ids(), ['fixed:9:체크아웃', 'fixed:9:체크인', 'new'], 'deleted rows disappear; new places append after manual order');
context.timelineOrders = {};
assert.deepEqual(ids(), ['new', 'fixed:9:체크아웃', 'fixed:9:체크인'], 'days without manual order remain chronological');
console.log('timeline reorder ok');
const stayContext = vm.createContext({ esc: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;') });
vm.runInContext(html.slice(html.indexOf('  function mapsUrl('), html.indexOf('  function renderTimeline(')), stayContext);
vm.runInContext(html.slice(html.indexOf('  function stayLinks('), html.indexOf("  document.querySelectorAll('[data-stay]')")), stayContext);
const stay = { url: 'https://www.airbnb.co.kr/rooms/123', address: '' };
assert.match(stayContext.stayLinks(stay), /disabled[^>]*>길찾기 · 주소 확인 중/);
assert.match(stayContext.stayLinks(stay), /href="https:\/\/www.airbnb.co.kr\/rooms\/123"[^>]*>숙소 상세 안내/);
const route = stayContext.stayLinks({ ...stay, address: '東京都 台東区 1-2-3' });
assert.ok(route.includes(encodeURIComponent('東京都 台東区 1-2-3')));
assert.ok(!route.includes('disabled'));
assert.match(route, /https:\/\/www.google.com\/maps\/dir\//);
console.log('stay details and directions ok');
