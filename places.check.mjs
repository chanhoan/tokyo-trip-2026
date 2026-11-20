import assert from 'node:assert/strict';
import { parsePlace, parseOrder, parseDone } from './api/places.js';

const ok = { day: 9, time: '13:30', name: ' 아카렌가 창고 ', placeId: 'ChIJ_abc-123', address: '요코하마', memo: '', by: '민수' };
assert.deepEqual(parsePlace(ok), { day: 9, time: '13:30', name: '아카렌가 창고', placeId: 'ChIJ_abc-123', address: '요코하마', memo: '', by: '민수' });
assert.ok(parsePlace({ ...ok, placeId: '' }), 'typed name without Google place is allowed');
assert.equal(parsePlace({ ...ok, day: 4 }), null, 'day before trip');
assert.equal(parsePlace({ ...ok, day: 13 }), null, 'day after trip');
assert.equal(parsePlace({ ...ok, time: '' }), null, 'missing time');
assert.equal(parsePlace({ ...ok, time: '24:00' }), null, 'invalid hour');
assert.equal(parsePlace({ ...ok, time: '9:30' }), null, 'time must be HH:MM');
assert.equal(parsePlace({ ...ok, name: '   ' }), null, 'blank name');
assert.equal(parsePlace({ ...ok, by: '' }), null, 'missing nickname');
assert.equal(parsePlace({ ...ok, placeId: 'x"><script>' }), null, 'placeId charset');
assert.equal(parsePlace({ ...ok, name: { $gt: '' } }), null, 'non-string name');
assert.equal(parsePlace(null), null);
console.log('parsePlace ok');
const order = { day: 9, ids: ['fixed:9:아사쿠사 체크아웃', '12345678-1234-1234-1234-123456789abc'] };
assert.deepEqual(parseOrder(order), order);
for (const bad of [null, {}, { ...order, day: 13 }, { ...order, day: '9' },
  { ...order, ids: [] }, { ...order, ids: ['fixed:8:다른 날짜'] },
  { ...order, ids: [null] }, { ...order, ids: ['fixed:9:'] },
  { ...order, ids: ['fixed:9:줄\n바꿈'] }, { ...order, ids: ['unknown'] },
  { ...order, ids: [order.ids[0], order.ids[0]] }, { ...order, ids: Array(321).fill(order.ids[0]) }]) {
  assert.equal(parseOrder(bad), null);
}
console.log('parseOrder ok');
assert.deepEqual(parseDone({ day: 5, done: true }), { day: 5, done: true });
assert.deepEqual(parseDone({ day: 12, done: false, extra: 1 }), { day: 12, done: false }, 'unknown fields are dropped');
for (const bad of [null, {}, { day: 4, done: true }, { day: 13, done: true }, { day: '5', done: true },
  { day: 5.5, done: true }, { day: 5 }, { day: 5, done: 'true' }, { day: 5, done: 1 }]) {
  assert.equal(parseDone(bad), null);
}
console.log('parseDone ok');
