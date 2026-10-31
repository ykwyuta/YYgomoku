// つめごもく もんだいの検証：node test/tsumego.test.js
// 全問について、ちょうど決められた手数で かてること・それより短くは かてないこと・
// 初手の正解がひとつで data の first と一致すること・本手順の くろの手が どれも ひとつに決まることを確かめる。
'use strict';
require('../js/rules.js');
require('../js/tsumego.js');
require('../js/tsumego-data.js');
const E = globalThis.Engine, T = globalThis.Tsumego, PROBS = globalThis.TSUMEGO_PROBLEMS;
const assert = require('assert');

assert.strictEqual(PROBS.length, 30, '30問');
const count = { 1: 0, 3: 0, 5: 0 };
const seen = new Set();
PROBS.forEach((pr, i) => {
  const tag = `第${i + 1}問「${pr.title}」`;
  count[pr.moves]++;
  const key = pr.rows.join('/');
  assert.ok(!seen.has(key), `${tag}：同じ問題がある`);
  seen.add(key);
  const { size, board } = T.parse(pr.rows);
  assert.ok(pr.rows.every(r => r.length === size), `${tag}：盤が 正方形でない`);
  // まだ だれも 五を つくっていない
  for (let p = 0; p < board.length; p++) assert.ok(!board[p] || !E.makesFive(board, size, p, board[p], false), `${tag}：もう 五が ある`);
  const n = (pr.moves + 1) / 2;
  const S = new T.Solver(size);
  assert.strictEqual(S.minLen(board, n + 1), n, `${tag}：最短手数`);
  const sols = S.solutions(board, n);
  assert.strictEqual(sols.length, 1, `${tag}：初手の正解がひとつではない`);
  assert.strictEqual(E.pointName(size, sols[0]), pr.first, `${tag}：初手`);
  assert.ok(S.uniqueLines(board, n), `${tag}：本手順が ひとつに決まらない`);
  // 本手順をたどると、ちょうど 五が できる
  const ml = S.mainLine(board, n);
  assert.strictEqual(ml.line.length, pr.moves, `${tag}：手順の長さ`);
  const lastB = ml.line[ml.line.length - 1];
  assert.ok(E.makesFive(ml.board, size, lastB, E.BLACK, false), `${tag}：手順のさいごに 五が ない`);
  // 解説に 本手順の くろの手が 書いてある
  for (const p of ml.line.filter((_, k) => k % 2 === 0)) assert.ok(pr.text.includes(E.pointName(size, p)), `${tag}：解説に ${E.pointName(size, p)} がない`);
  // まちがえやすい手は 本当に ふせがれる
  for (const [a, d] of S.traps(board, n)) {
    const b = board.slice();
    b[a] = E.BLACK; b[d] = E.WHITE;
    assert.ok(!S.attack(b, n - 1), `${tag}：まちがえやすい手 ${E.pointName(size, a)}`);
  }
});
assert.deepStrictEqual(count, { 1: 10, 3: 10, 5: 10 });
console.log(`all ${PROBS.length} problems OK (1手 ${count[1]}・3手 ${count[3]}・5手 ${count[5]})`);
