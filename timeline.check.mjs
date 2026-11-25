import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
// 참가자 picture: the file the dialog points at has to ship with the page
const crewSrc = html.match(/<dialog id="crew-dialog"[\s\S]*?<img src="([^"]+)"/)?.[1];
assert.ok(crewSrc && existsSync(crewSrc), 'crew picture is in the repo under the name the page uses');
console.log('crew picture ok');
// Header badge: days left before the trip, the trip day during it, nothing once it is over
const badgeContext = vm.createContext({ DAYS: Array.from({ length: 8 }, (_, i) => ({ d: 5 + i })) });
vm.runInContext(html.slice(html.indexOf('  function tripBadge('), html.indexOf('  function setNowTime(')), badgeContext);
const badge = (month, day, year = '2026') => badgeContext.tripBadge({ year, month, day }); // same zero-padded strings tokyoNow() gives
assert.equal(badge('11', '24'), 'D-11');
assert.equal(badge('10', '31'), 'D-35', 'counts across a month end');
assert.equal(badge('12', '04'), 'D-1');
assert.equal(badge('12', '05'), '1일차', 'departure day is day 1, not D-0');
assert.equal(badge('12', '07'), '3일차');
assert.equal(badge('12', '12'), '8일차');
assert.equal(badge('12', '13'), '', 'hidden once the trip is over');
assert.equal(badge('01', '02', '2027'), '');
console.log('trip badge ok');
// Weather: where the group is by the hour, and reading Open-Meteo's reply
const wx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('  var SPOTS = '), html.indexOf('  function loadWeather(')), wx);
assert.equal(wx.spotAt(7, 11), 'tokyo');
assert.equal(wx.spotAt(7, 12), 'fuji', 'after the 11:32 arrival at 신후지');
assert.equal(wx.spotAt(8, 14), 'fuji');
assert.equal(wx.spotAt(8, 15), 'tokyo', 'back on the 15:18 arrival');
assert.equal(wx.spotAt(11, 17), 'kawagoe');
assert.equal(wx.spotAt(11, 18), 'tokyo');
assert.equal(wx.spotAt(5, 14), null, 'not landed yet (15:15 arrival)');
assert.equal(wx.spotAt(12, 16), null, 'flown out (15:05 departure)');
assert.equal(wx.daySpot(5), 'tokyo', 'arrival day falls back to its first area');
assert.equal(wx.daySpot(8), 'fuji', 'a day in two areas shows the one at noon');
assert.equal(wx.daySpot(10), 'yokohama');
for (let d = 5; d <= 12; d++) for (const [hour, spot] of wx.ROUTE[d]) {
  assert.ok(Number.isInteger(hour) && hour >= 0 && hour < 24 && (spot === null || spot in wx.SPOTS), `route of 12/${d} names a known area`);
}
assert.equal(wx.forecastFrom(5), '11/20', 'a 16-day forecast reaches a date 15 days ahead');
assert.equal(wx.forecastFrom(12), '11/27');
const reply = {
  daily: { time: ['2026-12-07', '2026-12-08'], weather_code: [3, 61], temperature_2m_min: [4.6, null], temperature_2m_max: [12.4, null] },
  hourly: { time: ['2026-12-07T11:00', '2026-12-07T12:00', '2026-12-07T13:00'], weather_code: [0, 61, 2], temperature_2m: [3.6, 11.5, null], precipitation_probability: [10, null, 5], is_day: [1, 1, 0] }
};
const indexed = wx.indexForecast(reply);
assert.deepEqual({ ...indexed.daily['2026-12-07'] }, { code: 3, min: 5, max: 12 });
assert.equal(indexed.daily['2026-12-08'], undefined, 'a day without temperatures is treated as no forecast, not as 0 degrees');
assert.deepEqual({ ...indexed.hourly['2026-12-07T11:00'] }, { code: 0, temp: 4, rain: 10, day: true });
assert.equal(indexed.hourly['2026-12-07T13:00'], undefined);
// 12/7: Tokyo's 11:00, then Fuji's 12:00; hours with no forecast are left out
const hours = Array.from(wx.dayHours(7, { tokyo: indexed, fuji: indexed }), (r) => `${r.hour}@${r.spot}:${r.temp}:${r.rain}`);
assert.deepEqual(hours, ['11@tokyo:4:10', '12@fuji:12:null']);
assert.deepEqual(Array.from(wx.dayHours(7, { tokyo: indexed }), (r) => r.hour), [11], 'an area without a forecast leaves its hours out');
assert.deepEqual(Array.from(wx.wxLook(0)), ['☀️', '맑음']);
assert.equal(wx.wxLook(2)[1], '구름조금');
assert.deepEqual(Array.from(wx.wxLook(0, false)), ['🌙', '맑음'], 'no sun at night');
assert.deepEqual(Array.from(wx.wxLook(3)), ['☁️', '흐림']);
assert.equal(wx.wxLook(45)[1], '안개');
assert.equal(wx.wxLook(53)[1], '이슬비');
assert.equal(wx.wxLook(63)[1], '비');
assert.equal(wx.wxLook(81)[1], '비');
assert.equal(wx.wxLook(73)[1], '눈');
assert.equal(wx.wxLook(86)[1], '눈');
assert.equal(wx.wxLook(96)[1], '뇌우');
// The reply goes into innerHTML, so only numbers may come out of it: markup or text from the weather service must never reach the page.
const hostile = wx.indexForecast({
  daily: { time: ['2026-12-07', '2026-12-08'], weather_code: [3, 3], temperature_2m_min: ['<b>4</b>', 4], temperature_2m_max: [12, 12] },
  hourly: { time: ['2026-12-07T11:00', '2026-12-07T12:00'], weather_code: [0, 0], temperature_2m: [4, '<img src=x onerror=alert(1)>'], precipitation_probability: ['<img src=x onerror=alert(1)>', 10], is_day: [1, 1] }
});
assert.equal(hostile.daily['2026-12-07'], undefined, 'a non-numeric temperature drops the day');
assert.deepEqual({ ...hostile.daily['2026-12-08'] }, { code: 3, min: 4, max: 12 });
assert.equal(hostile.hourly['2026-12-07T11:00'].rain, null, 'a non-numeric chance of rain is shown as nothing');
assert.equal(hostile.hourly['2026-12-07T12:00'], undefined, 'a non-numeric temperature drops the hour');
assert.equal(wx.indexForecast(reply).hourly['2026-12-07T11:00'].rain, 10);
// Timeline rows: each row reads the forecast of its own hour, in the area the group is in then
vm.runInContext(html.slice(html.indexOf('  var SLOT ='), html.indexOf('  function mapsUrl(')), wx);
const both = { tokyo: indexed, fuji: indexed };
assert.equal(wx.rowForecast(7, '10:40', both).spot, 'tokyo', 'nearest hour: 11시 is still Tokyo');
assert.equal(wx.rowForecast(7, '11:32', both).spot, 'fuji', '11:32 신후지 도착 reads the 12시 forecast in Fuji');
assert.equal(wx.rowForecast(7, '이동', both), null, 'a row without a time of its own gets no weather');
assert.equal(wx.rowForecast(5, '12:40', both), null, 'not landed yet');
const late = wx.indexForecast({ daily: { time: [], weather_code: [], temperature_2m_min: [], temperature_2m_max: [] },
  hourly: { time: ['2026-12-07T14:00', '2026-12-07T23:00'], weather_code: [2, 0], temperature_2m: [12, 7], precipitation_probability: [30, 5], is_day: [1, 0] } });
assert.equal(wx.rowForecast(7, '오후', { fuji: late }).hour, 14, 'labels like 오후 use their slot hour');
assert.equal(wx.rowForecast(7, '23:50', { fuji: late }).hour, 23, 'a late row stays on its own day');
console.log('weather ok');
// Theme button: flips what is shown; choosing what the system already uses goes back to following the system
const themeContext = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('  function nextTheme('), html.indexOf('  function renderTheme(')), themeContext);
assert.equal(themeContext.nextTheme(false, false), 'dark', 'light system, light shown');
assert.equal(themeContext.nextTheme(true, false), '', 'light system, dark shown: back to following the system');
assert.equal(themeContext.nextTheme(true, true), 'light', 'dark system, dark shown');
assert.equal(themeContext.nextTheme(false, true), '', 'dark system, light shown: back to following the system');
// Both pages apply the stored choice in <head>, before anything is painted, with the very same snippet
const early = html.match(/<script>\(function \(\) \{ try \{ var t = localStorage\.getItem\('theme'\)[^\n]*<\/script>/)?.[0];
assert.ok(early, 'index.html applies the stored theme in <head>');
assert.ok(html.indexOf(early) < html.indexOf('<div class="wrap">'), 'before the body content');
assert.ok(readFileSync('settle.html', 'utf8').includes(early), 'settle.html applies it the same way');
console.log('theme ok');
