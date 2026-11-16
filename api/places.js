import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

const KEY = 'places';
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

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const all = (await db().hgetall(KEY)) ?? {};
      const places = Object.values(all).sort((a, b) => a.at - b.at);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ places });
    }
    if (req.method === 'POST') {
      const place = parsePlace(req.body);
      if (!place) return res.status(400).json({ error: '시간, 장소, 닉네임(20자 이내)을 확인해 주세요.' });
      if ((await db().hlen(KEY)) >= MAX_PLACES) return res.status(409).json({ error: '저장할 수 있는 장소 수를 넘었어요.' });
      const item = { id: randomUUID(), ...place, at: Date.now() };
      await db().hset(KEY, { [item.id]: item });
      return res.status(201).json(item);
    }
    if (req.method === 'DELETE') {
      const id = String(req.query.id ?? '');
      if (!id) return res.status(400).json({ error: '지울 장소를 찾지 못했어요.' });
      await db().hdel(KEY, id);
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).end();
  } catch (err) {
    console.error('places api failed', err);
    return res.status(500).json({ error: '저장소에 연결하지 못했어요.' });
  }
}
