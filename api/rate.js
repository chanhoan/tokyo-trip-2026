// 엔화 환율: won per 1 yen. Yahoo's quote moves within minutes (market hours); open.er-api.com is the daily fallback.
// Fetched here, not in the browser: Yahoo sends no CORS headers, and the edge cache spares both sources.
// shortcut: Yahoo's chart endpoint is unofficial; if it starts refusing, the fallback keeps the page going.
const SOURCES = [
  {
    name: 'Yahoo Finance',
    url: 'https://query1.finance.yahoo.com/v8/finance/chart/JPYKRW=X?range=1d&interval=5m',
    read: (j) => {
      const m = j?.chart?.result?.[0]?.meta;
      return { rate: m?.regularMarketPrice, at: m?.regularMarketTime * 1000 };
    },
  },
  {
    name: 'ExchangeRate-API',
    url: 'https://open.er-api.com/v6/latest/JPY',
    read: (j) => ({ rate: j?.result === 'success' ? j.rates?.KRW : undefined, at: j?.time_last_update_unix * 1000 }),
  },
];

// A yen has been worth 5–15 won for decades; anything outside that is a broken reply, not a rate.
const sane = ({ rate, at }) => Number.isFinite(rate) && rate > 5 && rate < 15 && Number.isFinite(at) && at > 0;

export async function fetchRate(get = fetch) {
  for (const s of SOURCES) {
    try {
      const r = await get(s.url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const q = s.read(await r.json());
      if (sane(q)) return { rate: q.rate, at: q.at, source: s.name };
      throw new Error('bad reply');
    } catch (err) {
      console.error('rate source failed', s.name, String(err));
    }
  }
  return null;
}

export default async function handler(req, res) {
  const q = await fetchRate();
  if (!q) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: '환율을 불러오지 못했어요.' });
  }
  // five minutes at the edge, so the whole group shares one lookup
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).json(q);
}
