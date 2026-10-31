/*
 * ならびがみえる五目ならべ — CPU 思考ルーチン
 * - 置く点の「形」（五・四・三・二）で 手の よさを 見つもる（Engine.classify の表を使う）
 * - 「四を つづけて かつ」手順（VCF）を 読む
 * - アルファベータ探索（深さを ふやしながら、制限時間で うちきり）。葉では「5マスの まど」の数で 形勢を 見る
 */
(function (global) {
  'use strict';
  const E = global.Engine;
  const { BLACK, EMPTY } = E;

  const WIN = 1e7;
  // まどの中の 自分の石の数 → 点数（あいての石が まじった まどは 0）
  const WW = [0, 1, 10, 80, 600, 0];

  const LEVELS = {
    beginner: { name: 'はじめて' },
    easy: { name: 'よわい' },
    normal: { name: 'ふつう', time: 900, maxDepth: 4, width: 10, vcf: 8, guard: false },
    hard: { name: 'つよい', time: 2200, maxDepth: 8, width: 12, vcf: 14, guard: true },
    hint: { name: 'ヒント', time: 1200, maxDepth: 6, width: 10, vcf: 12, guard: true },
  };

  // ---------- 探索用の盤（石を置く・もどすが速い） ----------

  function Board(st) {
    const size = st.size, g = E.geo(size);
    this.size = size; this.n = g.n; this.g = g;
    this.rule = st.rule;
    this.b = Int8Array.from(st.board);
    this.near = new Int16Array(g.n);          // まわり 2マス以内の 石の数
    this.cnt = new Int8Array(g.wins.length * 2); // まどごとの くろ・しろの 数
    this.score = [0, 0];                       // まどの点数の合計（くろ・しろ）
    this.stones = 0;
    const b = this.b;
    this.b = new Int8Array(g.n);
    for (let p = 0; p < g.n; p++) if (b[p]) this.put(p, b[p]);
  }
  Board.prototype.exact = function (col) { return this.rule === 'renju' && col === BLACK; };
  Board.prototype.winVal = function (w) {
    const k0 = this.cnt[w * 2], k1 = this.cnt[w * 2 + 1];
    if (k0 && k1) return [0, 0];
    return [k0 ? WW[k0] : 0, k1 ? WW[k1] : 0];
  };
  Board.prototype.touch = function (p, d) {
    const s = this.size, x0 = p % s, y0 = (p / s) | 0;
    for (let y = Math.max(0, y0 - 2); y <= Math.min(s - 1, y0 + 2); y++) {
      for (let x = Math.max(0, x0 - 2); x <= Math.min(s - 1, x0 + 2); x++) this.near[y * s + x] += d;
    }
  };
  Board.prototype.put = function (p, col) {
    const ws = this.g.winsAt[p];
    for (const w of ws) { const v = this.winVal(w); this.score[0] -= v[0]; this.score[1] -= v[1]; }
    this.b[p] = col;
    for (const w of ws) { this.cnt[w * 2 + col - 1]++; const v = this.winVal(w); this.score[0] += v[0]; this.score[1] += v[1]; }
    this.touch(p, 1);
    this.stones++;
  };
  Board.prototype.take = function (p) {
    const col = this.b[p];
    const ws = this.g.winsAt[p];
    for (const w of ws) { const v = this.winVal(w); this.score[0] -= v[0]; this.score[1] -= v[1]; }
    this.b[p] = EMPTY;
    for (const w of ws) { this.cnt[w * 2 + col - 1]--; const v = this.winVal(w); this.score[0] += v[0]; this.score[1] += v[1]; }
    this.touch(p, -1);
    this.stones--;
  };
  Board.prototype.cands = function () {
    const out = [];
    if (!this.stones) { out.push(this.g.center); return out; }
    for (let p = 0; p < this.n; p++) if (!this.b[p] && this.near[p]) out.push(p);
    return out;
  };
  Board.prototype.isForbidden = function (p, col, a) {
    if (!this.exact(col)) return false;
    if (a && !a.over && a.fours < 2 && a.open3 < 2) return false;
    return !!E.forbidden(this.b, this.size, p);
  };

  // 形 → 点数
  function shapeScore(a) {
    if (a.five) return 1e6;
    if (a.over) return -1;
    if (a.open4 || a.fours >= 2) return 1e5;
    if (a.fours && a.open3) return 5e4;
    if (a.open3 >= 2) return 2e4;
    let s = 0;
    if (a.fours) s += 1500;
    s += a.open3 * 1000 + a.three * 150 + a.open2 * 100 + a.two * 15;
    return s;
  }

  // 候補の点ごとに：自分が置いた形・あいてが置いた形
  function scoreMoves(B, col) {
    const opp = 3 - col;
    const list = [];
    for (const p of B.cands()) {
      const a = E.analyze(B.b, B.size, p, col, B.exact(col));
      const d = E.analyze(B.b, B.size, p, opp, B.exact(opp));
      if (B.isForbidden(p, col, a)) continue;
      const sa = shapeScore(a);
      // あいてにとって きんじての点は ふさがなくてよい
      const sd = d.five ? 1e6 : (B.exact(opp) && (d.over || d.fours >= 2 || d.open3 >= 2) && E.forbidden(B.b, B.size, p)) ? 0 : shapeScore(d);
      list.push({ p, a, d, sa, sd, s: sa + sd * 0.9 + centerBonus(B, p) });
    }
    list.sort((x, y) => y.s - x.s);
    return list;
  }
  function centerBonus(B, p) {
    const s = B.size, c = (s - 1) / 2;
    return -(Math.abs(p % s - c) + Math.abs(((p / s) | 0) - c)) * 0.5;
  }

  // ---------- 四を つづけて かつ（VCF） ----------

  // col が p に置いて 四に なったとき、あいてが ふさぐ点（五の点）
  function fivePointsAround(B, p, col) {
    const s = B.size, x0 = p % s, y0 = (p / s) | 0, out = [];
    const ex = B.exact(col);
    for (const [dx, dy] of E.DIRS) {
      for (let k = -4; k <= 4; k++) {
        if (!k) continue;
        const x = x0 + dx * k, y = y0 + dy * k;
        if (x < 0 || y < 0 || x >= s || y >= s) continue;
        const q = y * s + x;
        if (B.b[q] || out.includes(q)) continue;
        if (E.makesFive(B.b, s, q, col, ex)) out.push(q);
      }
    }
    return out;
  }
  function anyFive(B, col) {
    const ex = B.exact(col);
    for (let p = 0; p < B.n; p++) if (!B.b[p] && B.near[p] && E.makesFive(B.b, B.size, p, col, ex)) return p;
    return -1;
  }

  // col の番で、四を つづけて かてるなら 最初の手（なければ -1）
  function vcf(B, col, depth, deadline) {
    const opp = 3 - col;
    const f = anyFive(B, col);
    if (f >= 0) return f;
    if (depth <= 0 || Date.now() > deadline) return -1;
    if (anyFive(B, opp) >= 0) return -1; // あいてに 四が あると、ふさがないといけない（ここでは読まない）
    const ex = B.exact(col);
    for (const p of B.cands()) {
      const a = E.analyze(B.b, B.size, p, col, ex);
      if (!a.fours) continue;
      if (B.isForbidden(p, col, a)) continue;
      B.put(p, col);
      const fp = fivePointsAround(B, p, col);
      let ok = false;
      if (fp.length >= 2) ok = true; // いきた四・四四（あいてに 五の点が ないことは 上で たしかめた）
      else if (fp.length === 1) {
        const q = fp[0];
        // あいてが ふさぐ点で 五が できるなら だめ
        if (!E.makesFive(B.b, B.size, q, opp, B.exact(opp))) {
          B.put(q, opp);
          // ふさいだ石で あいてに 四が できたら、その先は読まない（安全のため）
          if (anyFive(B, opp) < 0) ok = vcf(B, col, depth - 1, deadline) >= 0;
          B.take(q);
        }
      }
      B.take(p);
      if (ok) return p;
    }
    return -1;
  }
  // ---------- アルファベータ ----------

  function evalFor(B, col) {
    const me = B.score[col - 1], op = B.score[2 - col];
    return me * 1.15 - op;
  }

  function Searcher(B, cfg, deadline) {
    this.B = B; this.cfg = cfg; this.deadline = deadline; this.nodes = 0; this.abort = false;
  }
  Searcher.prototype.search = function (col, depth, alpha, beta, ply) {
    const B = this.B;
    if ((++this.nodes & 255) === 0 && Date.now() > this.deadline) this.abort = true;
    if (this.abort) return 0;
    const list = scoreMoves(B, col);
    if (!list.length) return 0;
    if (list[0].a.five) return WIN - ply;
    // あいてに 五の点がある → ふさぐしかない
    const blocks = list.filter(m => m.d.five);
    let moves;
    if (blocks.length >= 2) return -(WIN - ply - 1);
    if (blocks.length === 1) moves = blocks;
    else {
      if (list[0].sa >= 1e5) return WIN - ply - 2; // いきた四・四四
      if (depth <= 0) return evalFor(B, col);
      // あいてに いきた四の点があるなら、ふさぐか 四を うつ
      const oppWin = list.filter(m => m.sd >= 1e5);
      if (oppWin.length) moves = list.filter(m => m.sd >= 1e4 || m.a.fours).slice(0, this.cfg.width);
      else moves = list.slice(0, depth >= 3 ? this.cfg.width : Math.max(6, this.cfg.width - 3));
      if (!moves.length) moves = list.slice(0, 3);
    }
    let best = -Infinity;
    for (const m of moves) {
      B.put(m.p, col);
      const v = -this.search(3 - col, depth - 1, -beta, -alpha, ply + 1);
      B.take(m.p);
      if (this.abort) return best === -Infinity ? 0 : best;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  };
  Searcher.prototype.root = function (col, depth, order) {
    const B = this.B;
    let best = null, bestV = -Infinity, alpha = -Infinity;
    const scored = [];
    for (const m of order) {
      B.put(m.p, col);
      const v = -this.search(3 - col, depth - 1, -Infinity, -alpha, 1);
      B.take(m.p);
      if (this.abort) break;
      scored.push({ m, v });
      if (v > bestV) { bestV = v; best = m; }
      if (v > alpha) alpha = v;
    }
    return { best, bestV, scored, done: !this.abort };
  };

  // ---------- 考える ----------

  // st：{ size, board, turn, rule }。返り値は 点の番号
  function think(st, level) {
    const B = new Board(st);
    const col = st.turn + 1, opp = 3 - col;
    const list = scoreMoves(B, col);
    if (!list.length) {
      for (let p = 0; p < B.n; p++) if (!B.b[p] && !B.isForbidden(p, col)) return p;
      return -1;
    }
    const win = list.find(m => m.a.five);
    const blocks = list.filter(m => m.d.five);
    const rnd = Math.random;

    if (level === 'beginner') {
      if (win && rnd() < 0.95) return win.p;
      if (blocks.length && rnd() < 0.55) return blocks[0].p;
      if (rnd() < 0.55) {
        // てきとうに：自分か あいての石の すぐ となり
        const nb = list.filter(m => isAdjacent(B, m.p));
        const pool = nb.length ? nb : list;
        return pool[(rnd() * pool.length) | 0].p;
      }
      return noisyPick(list, 0.9);
    }
    if (win) return win.p;
    if (blocks.length) return blocks[0].p;
    if (level === 'easy') {
      const ow = list.find(m => m.sa >= 1e5);
      if (ow && rnd() < 0.8) return ow.p;
      return noisyPick(list, 0.6);
    }

    const cfg = LEVELS[level] || LEVELS.normal;
    const t0 = Date.now();
    const deadline = t0 + cfg.time;
    // いきた四・四四・四三 が うてるなら うつ
    const strong = list.find(m => m.sa >= 1e5);
    if (strong) return strong.p;
    // 四を つづけて かてるか
    const v = vcf(B, col, cfg.vcf, t0 + cfg.time * 0.3);
    if (v >= 0) return v;

    // あいての いきた四の点（いきた三）を ふさぐ 手を 必ず 候補に
    let order = list.slice(0, cfg.width + 4);
    const S = new Searcher(B, cfg, deadline);
    let best = order[0], scored = null;
    for (let depth = 2; depth <= cfg.maxDepth; depth++) {
      const r = S.root(col, depth, order);
      if (!r.done) { if (r.best && r.bestV > -WIN / 2 && r.scored.length > order.length / 2) best = r.best; break; }
      best = r.best || best;
      scored = r.scored;
      if (r.bestV >= WIN / 2) break;
      if (r.bestV <= -WIN / 2) break;
      // よかった手から 順に 読みなおす
      order = r.scored.slice().sort((a, b) => b.v - a.v).map(x => x.m);
      if (Date.now() - t0 > cfg.time * 0.55) break;
    }
    // つよい：あいてに 四を つづけて かたれる手は さける
    if (cfg.guard) {
      const tryOrder = [best].concat((scored ? scored.slice().sort((a, b) => b.v - a.v).map(x => x.m) : order).filter(m => m !== best));
      for (const m of tryOrder.slice(0, 6)) {
        B.put(m.p, col);
        const danger = vcf(B, opp, 10, Date.now() + 120) >= 0;
        B.take(m.p);
        if (!danger) return m.p;
      }
    }
    return best.p;
  }

  function isAdjacent(B, p) {
    const s = B.size, x0 = p % s, y0 = (p / s) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if ((dx || dy) && x >= 0 && y >= 0 && x < s && y < s && B.b[y * s + x]) return true;
    }
    return false;
  }
  // 上のほうの手から、ばらつきを つけて えらぶ
  function noisyPick(list, noise) {
    let best = list[0], bv = -Infinity;
    for (const m of list.slice(0, 12)) {
      const v = (m.sa + m.sd * 0.8 + 20) * (1 - noise / 2 + Math.random() * noise);
      if (v > bv) { bv = v; best = m; }
    }
    return best.p;
  }

  // 盤の形勢（くろから見た点数）：UI 用
  function evaluate(st) {
    const B = new Board(st);
    return B.score[0] - B.score[1];
  }

  global.AI = { LEVELS, think, vcf: (st, col, depth) => vcf(new Board(st), col, depth || 12, Date.now() + 2000), evaluate, Board, scoreMoves, shapeScore };
})(typeof window !== 'undefined' ? window : globalThis);
