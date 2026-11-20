// Shared by settle.html and settle.check.mjs. Amounts are whole yen.
export const yen = (n) => '¥' + n.toLocaleString('ja-JP');

/**
 * Per-person totals for the 총무 model: each 차수 is split evenly among its 참석자,
 * and the leftover yen of an uneven split stays with whoever paid it.
 * @param {{amount:number,payer:string,split:string[]}[]} expenses
 * @param {string[]} members
 * @returns {{name:string,paid:number,owed:number,net:number}[]} net > 0 receives, net < 0 sends
 */
export function settle(expenses, members) {
  const names = [...new Set([...members, ...expenses.flatMap((e) => [e.payer, ...e.split])])];
  const paid = new Map(names.map((n) => [n, 0]));
  const owed = new Map(names.map((n) => [n, 0]));
  for (const e of expenses) {
    const share = Math.floor(e.amount / e.split.length);
    paid.set(e.payer, paid.get(e.payer) + e.amount);
    e.split.forEach((n) => owed.set(n, owed.get(n) + share));
    owed.set(e.payer, owed.get(e.payer) + e.amount - share * e.split.length);
  }
  return names.map((name) => ({ name, paid: paid.get(name), owed: owed.get(name), net: paid.get(name) - owed.get(name) }));
}

/** Configured 총무, or whoever paid the most. */
export function treasurerOf(rows, configured) {
  if (configured && rows.some((r) => r.name === configured)) return configured;
  return rows.reduce((best, r) => (r.paid > best.paid ? r : best), rows[0]).name;
}

export function shareText(rows, treasurer, expenses) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const lines = rows
    .filter((r) => r.name !== treasurer && r.net !== 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .map((r) => (r.net < 0 ? `${r.name} → ${treasurer} ${yen(-r.net)}` : `${treasurer} → ${r.name} ${yen(r.net)}`));
  return [`[도쿄 여행 정산] 총무 ${treasurer}`, ...lines, `총 지출 ${yen(total)} · ${expenses.length}건`].join('\n');
}
