/*
 * ならびがみえる五目ならべ — 「つめごもく もんだい」のソルバー（じゆうルール）
 * くろ（攻め方）が、決められた回数のうちに 五を つくれるかを読み切る。
 * しろ（受け方）は いちばん長く ふせぐ手を選ぶ。
 *
 * n は「くろが打てる残りの回数」。1手問題なら n = 1、3手なら 2、5手なら 3。
 * くろの候補：五の点・しろの四を ふさぐ点、または「置くと 5マスの まどに くろが 3つ（n = 2 なら 4つ）以上、しろ 0」になる点。
 *   （n = 2 で かつには 五の点が 2つ いるので 四が いる。n = 3 では 少なくとも 三が いる）
 * しろの候補：盤の すべての空き点（さきに「パス」で くろが かてるかを たしかめて、むだを はぶく）。
 * 初手（solutions）は くろも すべての空き点を しらべるので、正解がひとつかを たしかに 確かめられる。
 */
(function (global) {
  'use strict';
  const E = global.Engine;
  const { BLACK, WHITE, EMPTY } = E;

  function parse(rows) {
    const size = rows.length;
    const board = new Int8Array(size * size);
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      board[y * size + x] = c === 'X' ? BLACK : c === 'O' ? WHITE : EMPTY;
    }));
    return { size, board };
  }

  function Solver(size) {
    this.size = size;
    this.g = E.geo(size);
    this.memo = new Map();
    this.nodes = 0;
  }

  Solver.prototype.fivePoints = function (b, col) {
    const out = [];
    for (let p = 0; p < b.length; p++) if (!b[p] && E.makesFive(b, this.size, p, col, false)) out.push(p);
    return out;
  };
  // 置いたら 五ができているか
  Solver.prototype.won = function (b, p) { return E.makesFive(b, this.size, p, b[p], false) || false; };

  Solver.prototype.threatCands = function (b, n) {
    const need = n <= 2 ? 4 : 3;
    const g = this.g, out = [];
    for (let p = 0; p < b.length; p++) {
      if (b[p]) continue;
      for (const w of g.winsAt[p]) {
        let k = 1, bad = false;
        for (const q of g.wins[w]) { if (b[q] === WHITE) { bad = true; break; } if (b[q] === BLACK) k++; }
        if (!bad && k >= need) { out.push(p); break; }
      }
    }
    return out;
  };

  Solver.prototype.key = function (b, n, side) { return side + n + b.join(''); };

  // くろの番：n 回以内に 五を つくれるか
  Solver.prototype.attack = function (b, n) {
    if (this.fivePoints(b, BLACK).length) return true;
    if (n <= 1) return false;
    const k = this.key(b, n, 'a');
    const m = this.memo.get(k);
    if (m !== undefined) return m;
    this.nodes++;
    const D = this.fivePoints(b, WHITE);
    let res = false;
    if (D.length < 2) {
      const cands = D.length === 1 ? D : this.threatCands(b, n);
      for (const p of cands) {
        b[p] = BLACK;
        const r = this.defend(b, n - 1);
        b[p] = EMPTY;
        if (r) { res = true; break; }
      }
    }
    this.memo.set(k, res);
    return res;
  };

  // しろの番（くろは あと n 回）：どう ふせいでも くろが かつか
  Solver.prototype.defend = function (b, n) {
    if (this.fivePoints(b, WHITE).length) return false;
    const F = this.fivePoints(b, BLACK);
    if (F.length >= 2) return true;
    if (n < 1) return false;
    if (F.length === 1) {
      b[F[0]] = WHITE;
      const r = this.attack(b, n);
      b[F[0]] = EMPTY;
      return r;
    }
    const k = this.key(b, n, 'd');
    const m = this.memo.get(k);
    if (m !== undefined) return m;
    let res = this.attack(b, n); // しろが よそに うっても（パス）かてないなら、かてない
    if (res) {
      for (let p = 0; p < b.length && res; p++) {
        if (b[p]) continue;
        b[p] = WHITE;
        if (!this.attack(b, n)) res = false;
        b[p] = EMPTY;
      }
    }
    this.memo.set(k, res);
    return res;
  };

  // いちばん 少ない回数（max 回まで。むりなら 0）
  Solver.prototype.minLen = function (b, max) {
    for (let n = 1; n <= max; n++) if (this.attack(b, n)) return n;
    return 0;
  };

  // くろの初手の正解（すべての空き点を しらべる）
  Solver.prototype.solutions = function (b, n) {
    const out = [];
    for (let p = 0; p < b.length; p++) {
      if (b[p]) continue;
      b[p] = BLACK;
      const ok = this.won(b, p) || (n > 1 && this.defend(b, n - 1));
      b[p] = EMPTY;
      if (ok) out.push(p);
    }
    return out;
  };

  // しろの番：くろが かつまでの 回数（n 回では かてないなら n + 1）
  Solver.prototype.need = function (b, n) {
    for (let k = 1; k <= n; k++) if (this.attack(b, k)) return k;
    return n + 1;
  };

  // しろの番で いちばん 長く ふせぐ手 { move, need }。くろが あと n 回。
  Solver.prototype.bestDefense = function (b, n) {
    const W5 = this.fivePoints(b, WHITE);
    if (W5.length) return { move: W5[0], need: Infinity, whiteWins: true };
    const F = this.fivePoints(b, BLACK);
    if (F.length) return { move: F[0], need: 1 };
    let best = null;
    for (let p = 0; p < b.length; p++) {
      if (b[p]) continue;
      b[p] = WHITE;
      const nd = this.need(b, n);
      b[p] = EMPTY;
      const near = this.closeness(b, p);
      if (!best || nd > best.need || (nd === best.need && near > best.near)) best = { move: p, need: nd, near };
    }
    return best;
  };
  // くろの石に どれだけ 近いか（同じ強さの手なら、くろの石の そばを えらぶ）
  Solver.prototype.closeness = function (b, p) {
    let s = 0;
    for (const w of this.g.winsAt[p]) {
      let k = 0, bad = false;
      for (const q of this.g.wins[w]) { if (b[q] === WHITE) bad = true; if (b[q] === BLACK) k++; }
      if (!bad) s += k * k;
    }
    return s;
  };

  // 本手順：くろは 正解（ひとつめ）、しろは いちばん 長く ふせぐ手
  Solver.prototype.mainLine = function (board, n) {
    const b = board.slice();
    const line = [];
    for (let k = n; k >= 1; k--) {
      const s = this.solutions(b, k);
      if (!s.length) break;
      b[s[0]] = BLACK;
      line.push(s[0]);
      if (this.won(b, s[0])) break;
      const d = this.bestDefense(b, k - 1);
      b[d.move] = WHITE;
      line.push(d.move);
    }
    return { line, board: b };
  };

  // 本手順の くろの手が どれも ひとつに決まるか（しろは どの「いちばん長い受け」を えらんでも）
  Solver.prototype.uniqueLines = function (board, n) {
    const b = board.slice();
    for (let k = n; k >= 1; k--) {
      const s = this.solutions(b, k);
      if (s.length !== 1) return false;
      b[s[0]] = BLACK;
      if (this.won(b, s[0])) return true;
      const d = this.bestDefense(b, k - 1);
      b[d.move] = WHITE;
    }
    return false;
  };

  // まちがえやすい手：四や いきた三を つくるのに かてない くろの初手と、しろの うけ [[くろ, しろ], ...]
  Solver.prototype.traps = function (board, n) {
    const b = board.slice();
    const sol = new Set(this.solutions(b, n));
    const out = [];
    if (n < 2) return out;
    for (let p = 0; p < b.length; p++) {
      if (b[p] || sol.has(p)) continue;
      const a = E.analyze(b, this.size, p, BLACK, false);
      if (!a.fours && !a.open3) continue;
      b[p] = BLACK;
      const d = this.bestDefense(b, n - 1);
      b[p] = EMPTY;
      out.push([p, d.move, a.fours ? 4 : 3]);
    }
    out.sort((x, y) => y[2] - x[2]);
    return out.slice(0, 3).map(x => [x[0], x[1]]);
  };

  global.Tsumego = { parse, Solver };
})(typeof window !== 'undefined' ? window : globalThis);
