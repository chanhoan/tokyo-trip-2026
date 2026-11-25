import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';
import { MEMBERS } from '../members.js';

const KEY = 'places';
const VOTES_KEY = 'place-votes';
const ORDER_KEY = 'timeline-order';
const DONE_KEY = 'done-days'; // set of days stamped 여행 완료
// ponytail: flat cap instead of rate limiting; the URL is only shared within the group
const MAX_PLACES = 300;

export function db() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
  });
}

export function parsePlace(body) {
  if (!body || typeof body !== 'object') return null;
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const day = Number(body.day);
  const time = str(body.time);
  const name = str(body.name);
  const placeId = str(body.placeId);
  const address = str(body.address);
  const memo = str(body.memo);
  const by = str(body.by);
  if (!Number.isInteger(day) || day < 5 || day > 12) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (!name || name.length > 120 || memo.length > 200 || !MEMBERS.includes(by)) return null;
  if (placeId && !/^[A-Za-z0-9_-]{1,300}$/.test(placeId)) return null;
  if (address.length > 200) return null;
  return { day, time, name, placeId, address, memo, by };
}

export function parseOrder(body) {
  if (!body || !Number.isInteger(body.day) || body.day < 5 || body.day > 12) return null;
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 320) return null;
  const fixed = 'fixed:' + body.day + ':';
  if (body.ids.some(id => typeof id !== 'string' || id.length > 160 ||
    !(id.startsWith(fixed) && id.length > fixed.length && !/[\u0000-\u001f]/.test(id) || /^[a-f0-9-]{36}$/.test(id)))) return null;
  if (new Set(body.ids).size !== body.ids.length) return null;
  return { day: body.day, ids: body.ids };
}

export function parseDone(body) {
  if (!body || !Number.isInteger(body.day) || body.day < 5 || body.day > 12 || typeof body.done !== 'boolean') return null;
  return { day: body.day, done: body.done };
}

export function parseVote(body) {
  if (!body || typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id) ||
    !MEMBERS.includes(body.by) || !['like', 'dislike', null].includes(body.vote)) return null;
  return { id: body.id, by: body.by, vote: body.vote };
}

export function voteSummary(votes = {}, by) {
  const choices = MEMBERS.map(member => votes[member]);
  return {
    like: choices.filter(choice => choice === 'like').length,
    dislike: choices.filter(choice => choice === 'dislike').length,
    mine: choices[MEMBERS.indexOf(by)] ?? null,
  };
}

// Check existence and change only this member's vote in one Redis operation.
const SAVE_VOTE = `
  if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return nil end
  local votes = cjson.decode(redis.call('HGET', KEYS[2], ARGV[1]) or '{}')
  if ARGV[3] == '' then votes[ARGV[2]] = nil else votes[ARGV[2]] = ARGV[3] end
  if next(votes) == nil then
    redis.call('HDEL', KEYS[2], ARGV[1])
    return '{}'
  end
  local updated = cjson.encode(votes)
  redis.call('HSET', KEYS[2], ARGV[1], updated)
  return updated
`;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const redis = db();
      const [all, orders, done, votes] = await Promise.all([
        redis.hgetall(KEY), redis.hgetall(ORDER_KEY), redis.smembers(DONE_KEY), redis.hgetall(VOTES_KEY),
      ]);
      const places = Object.values(all ?? {}).sort((a, b) => a.at - b.at)
        .map(place => ({ ...place, votes: voteSummary(votes?.[place.id], req.query?.voter) }));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ places, orders: orders ?? {}, done: (done ?? []).map(Number) });
    }
    if (req.method === 'POST') {
      const place = parsePlace(req.body);
      if (!place) return res.status(400).json({ error: '시간, 장소, 추가하는 사람을 확인해 주세요.' });
      if ((await db().hlen(KEY)) >= MAX_PLACES) return res.status(409).json({ error: '저장할 수 있는 장소 수를 넘었어요.' });
      const item = { id: randomUUID(), ...place, at: Date.now() };
      await db().hset(KEY, { [item.id]: item });
      return res.status(201).json(item);
    }
    if (req.method === 'PUT' && req.query.id) {
      const id = String(req.query.id);
      const place = parsePlace(req.body);
      if (!place) return res.status(400).json({ error: '시간, 장소, 추가하는 사람을 확인해 주세요.' });
      const old = await db().hget(KEY, id);
      if (!old) return res.status(404).json({ error: '이미 지워진 일정이에요.' });
      const item = { ...old, ...place }; // keeps id and at, so the row keeps its place in the saved order
      await db().hset(KEY, { [id]: item });
      return res.status(200).json(item);
    }
    if (req.method === 'PUT') {
      const order = parseOrder(req.body);
      if (!order) return res.status(400).json({ error: '일정 순서를 확인해 주세요.' });
      await db().hset(ORDER_KEY, { [order.day]: order.ids });
      return res.status(200).json(order);
    }
    if (req.method === 'PATCH' && req.query?.vote === '1') {
      const vote = parseVote(req.body);
      if (!vote) return res.status(400).json({ error: '일정과 투표하는 사람을 확인해 주세요.' });
      const updated = await db().eval(SAVE_VOTE, [KEY, VOTES_KEY], [vote.id, vote.by, vote.vote ?? '']);
      if (updated == null) return res.status(404).json({ error: '이미 지워진 일정이에요.' });
      return res.status(200).json(voteSummary(updated, vote.by));
    }
    if (req.method === 'PATCH') {
      const mark = parseDone(req.body);
      if (!mark) return res.status(400).json({ error: '날짜를 확인해 주세요.' });
      // SADD/SREM are idempotent, so two people stamping at once cannot lose each other's day
      await (mark.done ? db().sadd(DONE_KEY, mark.day) : db().srem(DONE_KEY, mark.day));
      return res.status(200).json(mark);
    }
    if (req.method === 'DELETE') {
      const id = String(req.query.id ?? '');
      if (!id) return res.status(400).json({ error: '지울 장소를 찾지 못했어요.' });
      await db().multi().hdel(KEY, id).hdel(VOTES_KEY, id).exec();
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE');
    return res.status(405).end();
  } catch (err) {
    console.error('places api failed', err);
    return res.status(500).json({ error: '저장소에 연결하지 못했어요.' });
  }
}
