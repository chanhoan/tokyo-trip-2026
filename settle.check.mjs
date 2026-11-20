import assert from 'node:assert/strict';
import { settle, treasurerOf, shareText, yen } from './settle-calc.js';
import { parseConfig, parseExpense } from './api/expenses.js';
import { MEMBERS } from './members.js';
import { readFileSync } from 'node:fs';

// The design's example: 4 people, 한승남 skipped the 이자카야.
const members = MEMBERS;
const all = ['정찬환', '정상범', '한승남', '이영석'];
const expenses = [
  { title: '신칸센 도시락', amount: 4800, payer: '정찬환', split: all },
  { title: '온천 입장', amount: 6400, payer: '정상범', split: all },
  { title: '이자카야', amount: 18000, payer: '정찬환', split: ['정찬환', '정상범', '이영석'] },
  { title: '택시', amount: 2400, payer: '한승남', split: all },
];
const rows = settle(expenses, members);
const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
assert.deepEqual(byName['정찬환'], { name: '정찬환', paid: 22800, owed: 9400, net: 13400 });
assert.deepEqual(byName['정상범'], { name: '정상범', paid: 6400, owed: 9400, net: -3000 });
assert.deepEqual(byName['한승남'], { name: '한승남', paid: 2400, owed: 3400, net: -1000 });
assert.deepEqual(byName['이영석'], { name: '이영석', paid: 0, owed: 9400, net: -9400 });
assert.deepEqual(byName['하지원'], { name: '하지원', paid: 0, owed: 0, net: 0 }, 'member with no 차수 is listed at 0');
assert.equal(rows.reduce((s, r) => s + r.net, 0), 0, 'nets balance');
assert.equal(treasurerOf(rows, ''), '정찬환', 'auto = biggest payer');
assert.equal(treasurerOf(rows, '이영석'), '이영석');
assert.equal(shareText(rows, '정찬환', expenses),
  '[도쿄 여행 정산] 총무 정찬환\n이영석 → 정찬환 ¥9,400\n정상범 → 정찬환 ¥3,000\n한승남 → 정찬환 ¥1,000\n총 지출 ¥31,600 · 4건');
// 총무 who paid little gets money back flowing the other way
assert.match(shareText(rows, '이영석', expenses), /이영석 → 정찬환 ¥13,400/);

// Uneven split: leftover yen stays with the payer, totals still balance.
const odd = settle([{ amount: 1000, payer: '정상범', split: ['정찬환', '정상범', '한승남'] }], members);
assert.deepEqual(odd.map((r) => r.owed), [333, 334, 333, 0, 0]);
assert.equal(odd.reduce((s, r) => s + r.net, 0), 0);
assert.equal(yen(1234567), '¥1,234,567');
console.log('settle calc ok');

assert.deepEqual(parseConfig({ treasurer: ' 정찬환 ' }), { treasurer: '정찬환' });
assert.deepEqual(parseConfig({}), { treasurer: '' }, 'auto 총무');
assert.equal(parseConfig({ treasurer: '여행자' }), null, '총무 must be a member');
const indexMembers = readFileSync(new URL('./index.html', import.meta.url), 'utf8').match(/var MEMBERS = (\[[^\]]*\])/)[1].replace(/'/g, '"');
assert.deepEqual(JSON.parse(indexMembers), MEMBERS, 'index.html member list matches members.js');
const ok = { title: ' 라멘 ', amount: 3600, payer: '정찬환', split: ['정찬환', '정상범'] };
assert.deepEqual(parseExpense(ok), { title: '라멘', amount: 3600, payer: '정찬환', split: ['정찬환', '정상범'] });
for (const bad of [{ ...ok, title: '' }, { ...ok, amount: 0 }, { ...ok, amount: 1.5 }, { ...ok, amount: '3600' },
  { ...ok, payer: '모르는 사람' }, { ...ok, split: [] }, { ...ok, split: ['정찬환', '모르는 사람'] }, { ...ok, split: ['정찬환', '정찬환'] }]) {
  assert.equal(parseExpense(bad), null, JSON.stringify(bad));
}
console.log('expense parsing ok');
