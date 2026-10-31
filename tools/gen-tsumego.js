// つめごもく もんだいの候補を作る：node tools/gen-tsumego.js [手数 1|3|5] [個数] [seed] [盤 9]
// CPU 同士（よわい）で ランダムに 打った 局面から、くろが ちょうど その手数で かてて、初手の正解が ひとつの ものを えらび、
// 正解に かんけいない 石を できるだけ とりのぞく（くろと しろの 石の数の 差は 1 まで）。
// 出力は JSON（rows, moves, first, line）。どれを 問題に するかは 人が えらぶ。
'use strict';
require('../js/rules.js');
require('../js/ai.js');
require('../js/tsumego.js');
const E = globalThis.Engine, AI = globalThis.AI, T = globalThis.Tsumego;

const [mv = '3', want = '10', seed = '1', sz = '9'] = process.argv.slice(2);
const N = (+mv + 1) / 2, size = +sz;
let s0 = +seed >>> 0 || 1;
Math.random = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };

function check(b) {
  const S = new T.Solver(size);
  if (S.fivePoints(b, E.WHITE).length) return null;
  for (let p = 0; p < b.length; p++) if (b[p] && E.makesFive(b, size, p, b[p], false)) return null;
  if (S.minLen(b, N) !== N) return null;
  const sol = S.solutions(b, N);
  if (sol.length !== 1) return null;
  if (!S.uniqueLines(b, N)) return null;
  return sol[0];
}

function prune(b, first) {
  let changed = true;
  while (changed) {
    changed = false;
    const order = [];
    for (let p = 0; p < b.length; p++) if (b[p]) order.push(p);
    order.sort(() => Math.random() - 0.5);
    for (const p of order) {
      const c = b[p];
      let nb = 0, nw = 0;
      for (const v of b) { if (v === 1) nb++; else if (v === 2) nw++; }
      if (c === 1) nb--; else nw--;
      if (Math.abs(nb - nw) > 1) continue;
      b[p] = 0;
      if (check(b) === first) { changed = true; } else b[p] = c;
    }
  }
}

function rows(b) {
  const out = [];
  for (let y = 0; y < size; y++) {
    let r = '';
    for (let x = 0; x < size; x++) r += '.XO'[b[y * size + x]];
    out.push(r);
  }
  return out;
}
function canon(b) {
  const keys = [];
  for (let t = 0; t < 8; t++) {
    let k = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let X = x, Y = y;
      if (t & 1) X = size - 1 - X;
      if (t & 2) Y = size - 1 - Y;
      if (t & 4) [X, Y] = [Y, X];
      k += b[Y * size + X];
    }
    keys.push(k);
  }
  return keys.sort()[0];
}

const found = [];
const seen = new Set();
let games = 0;
while (found.length < +want && games < 400) {
  games++;
  let s = E.newGame({ size, rule: 'free' });
  while (s.winner === null && found.length < +want) {
    if (s.turn === 0 && s.ply >= 6) {
      const b = s.board.slice();
      const first = check(b);
      if (first !== null) {
        prune(b, first);
        const k = canon(b);
        if (!seen.has(k)) {
          seen.add(k);
          const S = new T.Solver(size);
          const line = S.mainLine(b, N).line.map(p => E.pointName(size, p));
          const item = { moves: +mv, first: E.pointName(size, first), rows: rows(b), line };
          found.push(item);
          process.stderr.write(`#${found.length} game ${games} ply ${s.ply}: ${line.join(' ')}\n${item.rows.join('\n')}\n\n`);
        }
        break;
      }
    }
    s = E.apply(s, AI.think({ size, board: s.board, turn: s.turn, rule: 'free' }, 'easy'));
  }
}
console.log(JSON.stringify(found, null, 1));
