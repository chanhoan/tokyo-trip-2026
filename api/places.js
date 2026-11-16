import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

const KEY = 'places';
const ORDER_KEY = 'timeline-order';
// ponytail: flat cap instead of rate limiting; the URL is only shared within the group
const MAX_PLACES = 300;

function db() {
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
  if (!name || name.length > 120 || memo.length > 200 || !by || by.length > 20) return null;
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

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const [all, orders] = await Promise.all([db().hgetall(KEY), db().hgetall(ORDER_KEY)]);
      const places = Object.values(all ?? {}).sort((a, b) => a.at - b.at);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ places, orders: orders ?? {} });
    }
    if (req.method === 'POST') {
      const place = parsePlace(req.body);
      if (!place) return res.status(400).json({ error: '시간, 장소, 닉네임(20자 이내)을 확인해 주세요.' });
      if ((await db().hlen(KEY)) >= MAX_PLACES) return res.status(409).json({ error: '저장할 수 있는 장소 수를 넘었어요.' });
      const item = { id: randomUUID(), ...place, at: Date.now() };
      await db().hset(KEY, { [item.id]: item });
      return res.status(201).json(item);
    }
    if (req.method === 'PUT') {
      const order = parseOrder(req.body);
      if (!order) return res.status(400).json({ error: '일정 순서를 확인해 주세요.' });
      await db().hset(ORDER_KEY, { [order.day]: order.ids });
      return res.status(200).json(order);
    }
    if (req.method === 'DELETE') {
      const id = String(req.query.id ?? '');
      if (!id) return res.status(400).json({ error: '지울 장소를 찾지 못했어요.' });
      await db().hdel(KEY, id);
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).end();
  } catch (err) {
    console.error('places api failed', err);
    return res.status(500).json({ error: '저장소에 연결하지 못했어요.' });
  }
}
