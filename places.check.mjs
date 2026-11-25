import assert from 'node:assert/strict';
import handler, { parsePlace, parseOrder, parseDone, dayOver, parseVote, voteSummary } from './api/places.js';
import { MEMBERS } from './members.js';

const ok = { day: 9, time: '13:30', name: ' 아카렌가 창고 ', placeId: 'ChIJ_abc-123', address: '요코하마', memo: '', by: '한승남' };
assert.deepEqual(parsePlace(ok), { day: 9, time: '13:30', name: '아카렌가 창고', placeId: 'ChIJ_abc-123', address: '요코하마', memo: '', by: '한승남' });
assert.ok(parsePlace({ ...ok, placeId: '' }), 'typed name without Google place is allowed');
assert.equal(parsePlace({ ...ok, day: 4 }), null, 'day before trip');
assert.equal(parsePlace({ ...ok, day: 13 }), null, 'day after trip');
assert.equal(parsePlace({ ...ok, time: '' }), null, 'missing time');
assert.equal(parsePlace({ ...ok, time: '24:00' }), null, 'invalid hour');
assert.equal(parsePlace({ ...ok, time: '9:30' }), null, 'time must be HH:MM');
assert.equal(parsePlace({ ...ok, name: '   ' }), null, 'blank name');
assert.equal(parsePlace({ ...ok, by: '' }), null, 'missing nickname');
assert.equal(parsePlace({ ...ok, by: '여행자' }), null, 'only the five members can add');
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
assert.equal(dayOver(5, new Date('2026-12-05T14:59:00Z')), false, 'the day itself (23:59 Tokyo) is not over');
assert.equal(dayOver(5, new Date('2026-12-05T15:00:00Z')), true, 'over from 00:00 Tokyo the next day');
assert.equal(dayOver(12, new Date('2026-11-25T00:00:00Z')), false);
console.log('dayOver ok');

const vote = { id: order.ids[1], by: ok.by, vote: 'like' };
assert.deepEqual(parseVote({ ...vote, extra: 'ignored' }), vote);
assert.deepEqual(parseVote({ ...vote, vote: null }), { ...vote, vote: null });
for (const bad of [null, { ...vote, id: order.ids[0] }, { ...vote, by: '여행자' },
  { ...vote, vote: 'unknown' }, { ...vote, vote: undefined }]) {
  assert.equal(parseVote(bad), null);
}
const votes = { [ok.by]: 'like', 정상범: 'dislike', unknown: 'like' };
assert.deepEqual(voteSummary(votes), { like: 1, dislike: 1, mine: null });
assert.deepEqual(voteSummary(votes, ok.by), { like: 1, dislike: 1, mine: 'like' });
assert.deepEqual(voteSummary(undefined, ok.by), { like: 0, dislike: 0, mine: null });
console.log('vote input and aggregate privacy ok');

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
let stored = true;
const ballots = {};
const id = vote.id;
const hash = data => Object.entries(data).flatMap(([key, value]) => [key, JSON.stringify(value)]);
globalThis.fetch = async (url, options) => {
  const endpoint = new URL(url);
  assert.equal(endpoint.hostname, 'redis.test');
  const cmd = JSON.parse(options.body);
  if (endpoint.pathname === '/multi-exec') {
    assert.deepEqual(cmd, [['hdel', 'places', id], ['hdel', 'place-votes', id]]);
    stored = false;
    for (const name of Object.keys(ballots)) delete ballots[name];
    return Response.json([{ result: 1 }, { result: 1 }]);
  }
  if (endpoint.pathname === '/pipeline') return Response.json(cmd.map(redisReply));
  return Response.json(redisReply(cmd));
};
function redisReply(cmd) {
  const [op, key] = cmd;
  if (op === 'smembers') return { result: [] };
  if (op === 'hgetall') {
    const data = key === 'places' && stored ? { [id]: { id, ...ok, at: 1 } } :
      key === 'place-votes' && Object.keys(ballots).length ? { [id]: ballots } : {};
    return { result: hash(data) };
  }
  const [, , keyCount, placesKey, votesKey, placeId, name, choice] = cmd;
  assert.deepEqual([op, keyCount, placesKey, votesKey, placeId], ['eval', 2, 'places', 'place-votes', id]);
  if (!stored) return { result: null };
  if (choice === '') delete ballots[name];
  else ballots[name] = choice;
  return { result: JSON.stringify(ballots) };
}
async function request(method, query = {}, body) {
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; }, end() {} };
  await handler({ method, query, body }, res);
  return res;
}
const [a, b] = MEMBERS;
if (!dayOver(12)) { // the trap only exists before the trip is over
  const warn = console.warn; let logged = '';
  console.warn = (...args) => { logged = args.join(' '); };
  const early = await request('PATCH', {}, { day: 12, done: true, by: a });
  console.warn = warn;
  assert.equal(early.code, 403, 'a day that is not over cannot be stamped');
  assert.match(logged, /[TERROR]/, 'and the attempt is logged');
  console.log('early stamp trap ok');
}
const cast = (by, vote) => request('PATCH', { vote: '1' }, { id, by, vote });
const readVotes = async query => (await request('GET', query)).data.places[0].votes;
assert.deepEqual(await readVotes(), { like: 0, dislike: 0, mine: null });
const results = await Promise.all([cast(a, 'like'), cast(b, 'dislike')]);
assert.deepEqual(results.map(res => res.code), [200, 200]);
assert.deepEqual(await readVotes({ voter: a }), { like: 1, dislike: 1, mine: 'like' });
assert.deepEqual(await readVotes(), { like: 1, dislike: 1, mine: null });
assert.deepEqual((await cast(a, 'dislike')).data, { like: 0, dislike: 2, mine: 'dislike' });
assert.deepEqual((await cast(a, null)).data, { like: 0, dislike: 1, mine: null });
assert.equal((await request('DELETE', { id })).code, 204);
assert.equal((await cast(a, 'like')).code, 404);
console.log('vote route and mocked Redis REST contract ok');
