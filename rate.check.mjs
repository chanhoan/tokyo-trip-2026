import assert from 'node:assert/strict';
import { fetchRate } from './api/rate.js';

const reply = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => body });
const yahoo = { chart: { result: [{ meta: { regularMarketPrice: 9.1234, regularMarketTime: 1764130000 } }] } };
const er = { result: 'success', rates: { KRW: 9.05 }, time_last_update_unix: 1764115201 };
const quiet = console.error;
console.error = () => {}; // the failing sources log on purpose
try {
  assert.deepEqual(await fetchRate(reply(yahoo)), { rate: 9.1234, at: 1764130000000, source: 'Yahoo Finance' });
  // Yahoo down, broken or absurd → the daily rate
  for (const bad of [async () => { throw new Error('refused'); }, reply({}, false), reply({ chart: { result: [] } }),
    reply({ chart: { result: [{ meta: { regularMarketPrice: 912, regularMarketTime: 1764130000 } }] } })]) {
    let n = 0;
    const got = await fetchRate((url, o) => (n++ ? reply(er)() : bad(url, o)));
    assert.deepEqual(got, { rate: 9.05, at: 1764115201000, source: 'ExchangeRate-API' });
  }
  assert.equal(await fetchRate(reply({}, false)), null, 'both down → no rate');
  assert.equal(await fetchRate(reply({ result: 'error' })), null);
} finally { console.error = quiet; }
console.log('rate ok');
