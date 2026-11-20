import { randomUUID } from 'node:crypto';
import { db } from './places.js';
import { MEMBERS } from '../members.js';

const KEY = 'expenses';
const CONFIG_KEY = 'settle-config';
// ponytail: flat cap instead of rate limiting, same as places
const MAX_EXPENSES = 300;
const MAX_AMOUNT = 10_000_000;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
// Members are fixed (members.js); the only setting is the 총무, '' = whoever paid the most.
export function parseConfig(body) {
  const treasurer = str(body?.treasurer);
  return treasurer && !MEMBERS.includes(treasurer) ? null : { treasurer };
}

export function parseExpense(body) {
  const title = str(body?.title);
  const amount = body?.amount;
  const payer = str(body?.payer);
  const split = body?.split;
  if (!title || title.length > 40) return null;
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) return null;
  if (!MEMBERS.includes(payer) || !Array.isArray(split) || !split.length) return null;
  if (!split.every((n) => MEMBERS.includes(n)) || new Set(split).size !== split.length) return null;
  return { title, amount, payer, split };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const [all, config] = await Promise.all([db().hgetall(KEY), db().get(CONFIG_KEY)]);
      const expenses = Object.values(all ?? {}).sort((a, b) => a.at - b.at);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ expenses, config: config ?? { treasurer: '' } });
    }
    const id = String(req.query.id ?? '');
    if (req.method === 'PUT' && !id) {
      const config = parseConfig(req.body);
      if (!config) return res.status(400).json({ error: '총무를 다시 골라 주세요.' });
      await db().set(CONFIG_KEY, config);
      return res.status(200).json(config);
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const expense = parseExpense(req.body);
      if (!expense) return res.status(400).json({ error: '금액, 내용, 낸 사람, 참석자를 확인해 주세요.' });
      if (req.method === 'POST') {
        if ((await db().hlen(KEY)) >= MAX_EXPENSES) return res.status(409).json({ error: '저장할 수 있는 차수 수를 넘었어요.' });
        const item = { id: randomUUID(), ...expense, at: Date.now() };
        await db().hset(KEY, { [item.id]: item });
        return res.status(201).json(item);
      }
      const old = await db().hget(KEY, id);
      if (!old) return res.status(404).json({ error: '이미 지워진 차수예요.' });
      const item = { ...old, ...expense };
      await db().hset(KEY, { [id]: item });
      return res.status(200).json(item);
    }
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: '지울 차수를 찾지 못했어요.' });
      await db().hdel(KEY, id);
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).end();
  } catch (err) {
    console.error('expenses api failed', err);
    return res.status(500).json({ error: '저장소에 연결하지 못했어요.' });
  }
}
