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
assert.deepEqual(ids(), ['new', 'fixed:9:체크아웃', 'fixed:9:체크인'], 'deleted rows disappear; a new 08:00 place slots in before 오전 despite manual order');
context.shared = [{ id: 'lunch', day: 9, time: '13:00', at: 3 }, { id: 'late', day: 9, time: '21:00', at: 4 }];
assert.deepEqual(ids(), ['fixed:9:체크아웃', 'lunch', 'fixed:9:체크인', 'late'], 'new places land between fixed rows by time on a manually ordered day');
context.timelineOrders = {};
assert.deepEqual(ids(), ['fixed:9:체크아웃', 'lunch', 'fixed:9:체크인', 'late'], 'days without manual order remain chronological');
console.log('timeline reorder ok');
const stayContext = vm.createContext({ esc: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;') });
vm.runInContext(html.slice(html.indexOf('  function mapsUrl('), html.indexOf('  function renderTimeline(')), stayContext);
vm.runInContext(html.slice(html.indexOf('  function routeLink('), html.indexOf("  document.querySelectorAll('tr[data-stay]')")), stayContext);
const stay = { url: 'https://www.airbnb.co.kr/rooms/123', address: '' };
assert.match(stayContext.routeLink(stay), /주소 확인 중/);
assert.match(stayContext.detailLink(stay), /href="https:\/\/www.airbnb.co.kr\/rooms\/123"[^>]*>상세 안내/);
const route = stayContext.routeLink({ ...stay, address: '東京都 台東区 1-2-3' });
assert.ok(route.includes(encodeURIComponent('東京都 台東区 1-2-3')));
assert.match(route, /https:\/\/www.google.com\/maps\/dir\//);
console.log('stay details and directions ok');
// 여행 완료 stamps: where the page opens, and the shared toggle
const doneContext = vm.createContext({
  DAYS: [5, 6, 7].map(d => ({ d })), doneDays: [], current: 5, orderVersion: 0, placesLoaded: true, loadFailed: false,
  ov: { querySelectorAll: () => [] }, document: { getElementById: () => null }, console: { error() {} },
  alert: () => { doneContext.alerted = true; }
});
doneContext.byDay = d => doneContext.DAYS.find(x => x.d === d);
vm.runInContext(html.slice(html.indexOf('  function firstOpenDay('), html.indexOf('  setInterval(function ()')), doneContext);
assert.equal(doneContext.firstOpenDay(5), 5, 'nothing stamped: opens on today');
doneContext.doneDays = [5, 6];
assert.equal(doneContext.firstOpenDay(5), 7, 'opens on the first day without a stamp');
doneContext.doneDays = [6];
assert.equal(doneContext.firstOpenDay(5), 5, 'a stamp on a later day does not move the start');
doneContext.doneDays = [5];
assert.equal(doneContext.firstOpenDay(6), 6, 'days before today are not revisited');
doneContext.doneDays = [5, 6, 7];
assert.equal(doneContext.firstOpenDay(6), 6, 'every remaining day stamped: stays on today');
doneContext.doneDays = [];
let sent;
doneContext.fetch = async (url, options) => { assert.equal(options.method, 'PATCH'); sent = JSON.parse(options.body); return { ok: true }; };
await doneContext.toggleDone();
assert.deepEqual(sent, { day: 5, done: true });
assert.deepEqual(Array.from(doneContext.doneDays), [5]);
assert.notEqual(doneContext.orderVersion, 0, 'a poll that started before the save cannot overwrite the new stamp');
await doneContext.toggleDone();
assert.deepEqual(sent, { day: 5, done: false }, 'pressing again takes the stamp back');
assert.deepEqual(Array.from(doneContext.doneDays), []);
doneContext.fetch = async () => ({ ok: false, status: 500 });
await doneContext.toggleDone();
assert.deepEqual(Array.from(doneContext.doneDays), [], 'failed save keeps the previous stamps');
assert.equal(doneContext.alerted, true);
console.log('done stamps ok');
