// ルールエンジンと CPU のテスト：node test/rules.test.js
'use strict';
require('../js/rules.js');
require('../js/ai.js');
const E = globalThis.Engine, AI = globalThis.AI;
const assert = require('assert');

// 文字で盤を作る（X = くろ、O = しろ、. = なし）
function pos(rows, rule, turn) {
  const size = rows.length;
  const s = E.newGame({ size, rule: rule || 'free' });
  assert.strictEqual(s.size, size);
  rows.forEach((r, y) => [...r].forEach((c, x) => { s.board[y * size + x] = c === 'X' ? 1 : c === 'O' ? 2 : 0; }));
  s.turn = turn || 0;
  return s;
}
const P = (s, x, y) => y * s.size + x;
const st = s => ({ size: s.size, board: s.board, turn: s.turn, rule: s.rule });

// 線の形
{
  const T = L => E.classify(Uint8Array.from(L), false) & 15;
  assert.strictEqual(T([0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0]), E.FIVE);
  assert.strictEqual(T([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]), E.OPEN4);
  assert.strictEqual(T([0, 0, 0, 2, 1, 1, 1, 1, 0, 0, 0]), E.FOUR);
  assert.strictEqual(T([0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0].map((v, i) => (i === 5 ? 1 : v))), E.FIVE);
  assert.strictEqual(T([0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0]), E.OPEN3);
  assert.strictEqual(T([0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0]), E.OPEN3, 'とびの三');
  assert.strictEqual(T([0, 0, 0, 2, 1, 1, 1, 0, 0, 0, 0]), E.THREE);
  assert.strictEqual(T([0, 0, 0, 2, 1, 1, 1, 0, 2, 0, 0]), E.NONE, 'もう 五に ならない');
  assert.strictEqual(T([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0]), E.OPEN2);
  // 一直線の四四（X.XXX.X の まんなか）
  assert.strictEqual(E.classify(Uint8Array.from([0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0]), false) >> 4, 2);
  // れんじゅの くろ：6つは 長連
  assert.strictEqual(E.classify(Uint8Array.from([0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0]), true) & 15, E.OVER);
  assert.strictEqual(E.classify(Uint8Array.from([0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0]), false) & 15, E.FIVE);
  console.log('shapes OK');
}

// 5つ ならべて かち（よこ・たて・ななめ）
{
  for (const [rows, x, y] of [
    [['.........', '.XXXX....', '.........', '.........', '.........', '.........', '.........', '.........', '.........'], 5, 1],
    [['.........', '....X....', '....X....', '....X....', '....X....', '.........', '.........', '.........', '.........'], 4, 5],
    [['X........', '.X.......', '..X......', '...X.....', '.........', '.........', '.........', '.........', '.........'], 4, 4],
    [['.........', '.........', '.........', '.........', '....X....', '...X.....', '..X......', '.X.......', '.........'], 5, 3],
  ]) {
    const s = pos(rows);
    const n = E.apply(s, P(s, x, y));
    assert.strictEqual(n.winner, 0);
    assert.strictEqual(n.result, 'five');
    assert.strictEqual(n.line.length, 5);
    assert.ok(n.line.includes(P(s, x, y)));
  }
  console.log('five OK');
}

// 6つ以上：じゆうなら かち、れんじゅの くろは きんじて、れんじゅの しろは かち
{
  const rows = ['.........', 'XX.XXX...', '.........', '.........', '.........', '.........', '.........', '.........', '.........'];
  const f = pos(rows, 'free');
  assert.strictEqual(E.apply(f, P(f, 2, 1)).winner, 0);
  const r = pos(rows, 'renju');
  assert.strictEqual(E.illegalReason(r, P(r, 2, 1)), 'overline');
  assert.throws(() => E.apply(r, P(r, 2, 1)));
  const w = pos(rows.map(t => t.replace(/X/g, 'O')), 'renju', 1);
  assert.strictEqual(E.apply(w, P(w, 2, 1)).winner, 1);
  console.log('overline OK');
}

// れんじゅの きんじて
{
  // 三三
  const s = pos(['.........', '.........', '....X....', '....X....', '..XX.....', '.........', '.........', '.........', '.........'], 'renju');
  assert.strictEqual(E.illegalReason(s, P(s, 4, 4)), 'three3');
  // しろなら おける。じゆうなら おける
  assert.strictEqual(E.illegalReason(Object.assign(E.clone(s), { turn: 1 }), P(s, 4, 4)), null);
  assert.strictEqual(E.illegalReason(Object.assign(E.clone(s), { rule: 'free' }), P(s, 4, 4)), null);
  // かたほうが しろに ふさがれた 三は 三では ない（三三に ならない）
  const t = pos(['.........', '....O....', '....X....', '....X....', '..XX.....', '....O....', '.........', '.........', '.........'], 'renju');
  assert.strictEqual(E.illegalReason(t, P(t, 4, 4)), null);
  // 四四
  const u = pos(['.........', '....X....', '....X....', '....X....', '.XXX.....', '.........', '.........', '.........', '.........'], 'renju');
  assert.strictEqual(E.illegalReason(u, P(u, 4, 4)), 'four4');
  // 一直線の四四
  const v = pos(['.........', '.........', '.........', '.........', 'X.X.X.X..', '.........', '.........', '.........', '.........'], 'renju');
  assert.strictEqual(E.illegalReason(v, P(v, 3, 4)), 'four4', 'X.XXX.X');
  // 四三は きんじてでは ない
  const w = pos(['.........', '....X....', '....X....', '....X....', '..XX.....', '.........', '.........', '.........', '.........'], 'renju');
  assert.strictEqual(E.illegalReason(w, P(w, 4, 4)), null);
  // 五が できるなら 三三でも おける
  const x = pos(['.........', '....X....', '....X....', '....X....', '..XX.X...', '.....X...', '.........', '.........', '.........'].map((r, y) => (y === 1 ? '....X....' : r)), 'renju');
  x.board[P(x, 4, 0)] = 1;
  assert.ok(E.makesFive(x.board, 9, P(x, 4, 4), 1, true));
  assert.strictEqual(E.illegalReason(x, P(x, 4, 4)), null);
  console.log('forbidden OK');
}

// 盤が うまったら ひきわけ
{
  const s = E.newGame({ size: 9 });
  // 五が できない ならべかた（2列ずつ 色を かえ、1行ごとに ずらす）
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) s.board[y * 9 + x] = (((x + 2 * y) >> 1) % 2) + 1;
  for (let p = 0; p < 81; p++) assert.ok(!E.makesFive(s.board, 9, p, s.board[p], false), 'テスト用の盤に 五が ある');
  const last = 80;
  s.board[last] = 0;
  s.ply = 80;
  s.turn = 0; // 9の九 は くろの 石が 入る 場所
  const n = E.apply(s, last);
  assert.strictEqual(n.winner, -1);
  assert.strictEqual(n.result, 'full');
  console.log('full board OK');
}

// まった用：replay で同じ局面にもどる
{
  const s0 = E.newGame({ size: 13 });
  const moves = [84, 85, 71, 72, 58];
  const s = E.replay({ size: 13 }, moves);
  assert.strictEqual(s.ply, 5);
  assert.deepStrictEqual(s.kifu, moves.map((m, i) => E.SIDES[i % 2].mark + E.pointName(13, m)));
  assert.strictEqual(s0.ply, 0);
  console.log('replay OK');
}

// CPU：かてる手は うつ。あいての 四は ふさぐ。いきた三も ふさぐ（ふつう以上）
{
  const win = pos(['.........', '.........', '..OOO....', '.........', '.XXXX....', '.........', '.........', '.........', '.........']);
  for (const lv of ['easy', 'normal', 'hard']) {
    const m = AI.think(st(win), lv);
    assert.ok(m === P(win, 0, 4) || m === P(win, 5, 4), `${lv}：五を つくる`);
  }
  const block = pos(['.........', '.........', 'OOOO.....', '.........', '..XX.....', '.........', '.........', '.........', '.........']);
  for (const lv of ['easy', 'normal', 'hard']) assert.strictEqual(AI.think(st(block), lv), P(block, 4, 2), `${lv}：四を ふさぐ`);
  const three = pos(['.............', '.............', '.............', '.............', '.............', '....OOO......', '.............', '......X......', '.....X.......', '.............', '.............', '.............', '.............']);
  for (const lv of ['normal', 'hard']) {
    const m = AI.think(st(three), lv);
    assert.ok([P(three, 3, 5), P(three, 7, 5), P(three, 2, 5), P(three, 8, 5)].includes(m), `${lv}：いきた三を ふさぐ (${E.pointName(13, m)})`);
  }
  // 四を つづけて かつ（VCF）
  const vcf = pos(['.............', '.............', '.............', '...XXX.O.....', '.............', '......X......', '......X......', '......X......', '.......O.....', '.............', '.............', '.............', '.............']);
  vcf.board[P(vcf, 2, 3)] = 2; // よこの 三は かたほう ふさぐ
  const v = AI.vcf(st(vcf), 1, 10);
  assert.ok(v >= 0, 'VCF が 見つかる');
  console.log('cpu OK');
}

// れんじゅの くろの CPU は きんじてに うたない
{
  const s = pos(['.........', '.........', '....X....', '....X....', '..XX.....', '.........', '.........', '.........', '.........'], 'renju');
  s.board[P(s, 0, 8)] = 2; s.board[P(s, 8, 8)] = 2; s.board[P(s, 8, 0)] = 2; s.board[P(s, 0, 0)] = 2;
  for (let i = 0; i < 5; i++) for (const lv of ['beginner', 'easy', 'normal']) {
    const m = AI.think(st(s), lv);
    assert.ok(E.canApply(s, m), `${lv}：${E.pointName(9, m)} は きんじて`);
  }
  console.log('cpu renju OK');
}

// CPU 同士で さいごまで（反則が ないか）
{
  for (const [rule, size] of [['free', 9], ['renju', 13]]) {
    let s = E.newGame({ size, rule });
    while (s.winner === null) {
      const m = AI.think(st(s), s.turn === 0 ? 'easy' : 'beginner');
      assert.ok(E.canApply(s, m), `CPU の 反則 ${E.pointName(size, m)} ${E.illegalReason(s, m)}`);
      s = E.apply(s, m);
    }
  }
  console.log('selfplay OK');
}

console.log('all OK');
