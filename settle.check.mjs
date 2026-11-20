import assert from 'node:assert/strict';
import { settle, treasurerOf, shareText, yen, wheelAngle, iGa, when } from './settle-calc.js';
import { parseConfig, parseExpense, treated } from './api/expenses.js';
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

// 룰렛 쏘기: one 참석자 is drawn and pays the whole 차수; the settlement follows with no special case.
const cafe = { title: '카페', amount: 10000, payer: '정찬환', split: [...MEMBERS] };
MEMBERS.forEach((name, i) => {
  const drawn = treated(cafe, true, {}, (n) => { assert.equal(n, MEMBERS.length); return i; }, 111);
  assert.deepEqual(drawn, { ...cafe, split: [name], treat: name, rolls: [{ at: 111, among: cafe.split, winner: name }] }, 'every 참석자 can be drawn');
});
const shot = treated(cafe, true, {}, () => 1, 111);
assert.deepEqual(Object.fromEntries(settle([shot], MEMBERS).map((r) => [r.name, r.net])),
  { 정찬환: 10000, 정상범: -10000, 한승남: 0, 이영석: 0, 하지원: 0 }, 'the drawn person owes the payer the whole amount');
// 이력: it can be spun again, and every draw stays on record with its time and the people it was drawn from.
const four = MEMBERS.filter((m) => m !== '하지원');
const again = treated({ ...cafe, split: four }, true, shot, () => 0, 222);
assert.equal(again.treat, '정찬환', 'the latest draw decides');
assert.deepEqual(again.rolls, [{ at: 111, among: cafe.split, winner: '정상범' }, { at: 222, among: four, winner: '정찬환' }], 're-rolls pile up, oldest first');
const fixed = { ...again, ...treated({ ...cafe, amount: 12000, split: ['정찬환'] }, false, again) };
assert.equal(fixed.treat, '정찬환', 'fixing the amount keeps the result');
assert.deepEqual(fixed.rolls, again.rolls, 'a plain edit keeps the history');
assert.equal('rolls' in parseExpense({ ...cafe, rolls: [] }), false, 'the history cannot be written from the browser');
assert.equal(treated(cafe, false).treat, undefined, '1/N is not marked');
assert.equal(treated(cafe, false, shot).treat, undefined, 'saving as 1/N again removes the mark');
assert.equal(when(Date.UTC(2026, 11, 5, 3, 4, 5)), '12/5 12:04:05', 'Tokyo time, whatever the device time zone');
// No payer on a roll: the winner pays it themselves, so nobody owes anyone.
const solo = parseExpense({ ...cafe, payer: '', roll: true });
assert.equal(parseExpense({ ...cafe, payer: '' }), null, '1/N still needs a payer');
const self = treated(solo, true, {}, () => 2, 333);
assert.equal(self.payer, self.treat, 'empty payer becomes the winner');
assert.ok(settle([self], MEMBERS).every((r) => r.net === 0), 'self-treat settles to zero');
assert.equal(treated({ ...cafe, payer: '' }, true, shot, () => 0, 444).payer, '정찬환', 'a re-roll with no payer moves it to the new winner');
// The wheel only reveals the server's draw, so it has to stop on that name.
for (const n of [2, 3, 4, 5]) for (let i = 0; i < n; i++) for (const off of [-0.5, -0.25, 0, 0.25, 0.5]) {
  const underPin = ((-wheelAngle(i, n, off) % 360) + 360) % 360;
  assert.equal(Math.floor(underPin / (360 / n)), i, `slice ${i} of ${n}, offset ${off}`);
}
assert.equal(iGa('정상범'), '이');
assert.equal(iGa('김민수'), '가');
console.log('treat roulette ok');
