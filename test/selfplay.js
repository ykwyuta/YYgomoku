// CPU 同士の自動対戦：node test/selfplay.js [くろの強さ] [しろの強さ] [局数] [盤の大きさ] [free|renju]
'use strict';
require('../js/rules.js');
require('../js/ai.js');
const E = globalThis.Engine, AI = globalThis.AI;
const [l0 = 'normal', l1 = 'easy', games = '2', size = '13', rule = 'free'] = process.argv.slice(2);
const tally = { 0: 0, 1: 0, '-1': 0 };
for (let g = 0; g < +games; g++) {
  let s = E.newGame({ size: +size, rule });
  let maxT = 0, totT = 0;
  while (s.winner === null) {
    const t0 = Date.now();
    const m = AI.think({ size: s.size, board: s.board, turn: s.turn, rule: s.rule }, s.turn === 0 ? l0 : l1);
    const dt = Date.now() - t0;
    maxT = Math.max(maxT, dt); totT += dt;
    if (!E.canApply(s, m)) throw new Error('illegal move from AI: ' + m + ' ' + E.illegalReason(s, m));
    s = E.apply(s, m);
  }
  tally[s.winner]++;
  console.log(`game ${g + 1}: winner=${s.winner} result=${s.result} ply=${s.ply} avg=${(totT / s.ply).toFixed(0)}ms max=${maxT}ms`);
  if (g === 0) console.log(s.kifu.join(' '));
}
console.log(`${l0}(くろ) ${tally[0]} - ${tally[1]} ${l1}(しろ)  引き分け ${tally[-1]}`);
