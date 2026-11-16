import assert from 'node:assert/strict';
import { parsePlace } from './api/places.js';

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
