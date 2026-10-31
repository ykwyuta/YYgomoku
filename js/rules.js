/*
 * ならびがみえる五目ならべ — ルールエンジン
 * 盤面状態は純粋なデータとして扱い、apply は常に新しい状態を返す。
 *
 * 座標：x は左から 0〜size-1、y は上から 0〜size-1。点 p = y * size + x。
 * 石：0 = なし、1 = くろ、2 = しろ。手番 turn は 0 = くろ、1 = しろ（石の色 = turn + 1）。
 * ルール：
 *   'free'  … じゆう。たて・よこ・ななめに 5つ以上 ならべたら かち（はじめての 人むけ）
 *   'renju' … れんじゅ。くろは ちょうど 5つで かち。くろだけ「三三・四四・長連（6つ以上）」が きんじて。
 *             しろは 5つ以上で かち、きんじて なし。
 *
 * 1本の線の形は「となり 5マスずつ（計 11マス）」を見て決める。形の判定は表にためておく（classify）。
 */
(function (global) {
  'use strict';

  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const SIZES = [9, 13, 15, 19];
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];   // よこ・たて・ななめ（＼）・ななめ（／）
  const DIR_NAMES = ['よこ', 'たて', 'ななめ', 'ななめ'];

  const SIDES = [
    { name: 'くろ', kanji: '黒', mark: '●' },
    { name: 'しろ', kanji: '白', mark: '○' },
  ];

  // 線の形（強い順に大きい数）
  const NONE = 0, TWO = 1, OPEN2 = 2, THREE = 3, OPEN3 = 4, FOUR = 5, OPEN4 = 6, OVER = 7, FIVE = 8;
  const SHAPE_NAMES = ['', '二', 'いきた二', '三', 'いきた三', '四', 'いきた四', '長連', '五'];

  // ---------- 盤の形 ----------

  const geoCache = {};
  function geo(size) {
    if (geoCache[size]) return geoCache[size];
    const n = size * size;
    // 星（盤の目印）
    let stars;
    const m = (size - 1) / 2;
    if (size === 9) stars = [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]];
    else {
      const e = 3, f = size - 1 - e;
      stars = [[e, e], [f, e], [e, f], [f, f], [m, m]];
      if (size >= 19) stars = stars.concat([[e, m], [f, m], [m, e], [m, f]]);
    }
    // 点をふくむ「5マスの まど」（AI の評価用）
    const wins = [];          // まど → 5つの点
    const winsAt = [];        // 点 → まどの番号
    for (let p = 0; p < n; p++) winsAt.push([]);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      for (const [dx, dy] of DIRS) {
        const ex = x + dx * 4, ey = y + dy * 4;
        if (ex < 0 || ex >= size || ey < 0 || ey >= size) continue;
        const w = [];
        for (let k = 0; k < 5; k++) w.push((y + dy * k) * size + x + dx * k);
        for (const q of w) winsAt[q].push(wins.length);
        wins.push(w);
      }
    }
    const g = { size, n, stars: stars.map(([x, y]) => y * size + x), center: m * size + m, wins, winsAt };
    geoCache[size] = g;
    return g;
  }

  function inside(size, x, y) { return x >= 0 && y >= 0 && x < size && y < size; }

  // ---------- 1本の線の形 ----------
  // L：11マス（L[5] が いま見ている石 = 自分）。0 空き / 1 自分 / 2 ふさがっている（あいての石・盤の外）

  const TABLE = [new Int16Array(177147).fill(-1), new Int16Array(177147).fill(-1)]; // [ふつう, ちょうど5]
  function keyOf(L) { let k = 0; for (let i = 0; i < 11; i++) k = k * 3 + L[i]; return k; }

  function runAt(L, c) {
    let r = 1;
    for (let i = c - 1; i >= 0 && L[i] === 1; i--) r++;
    for (let i = c + 1; i < 11 && L[i] === 1; i++) r++;
    return r;
  }
  function isFive(L, exact) { const r = runAt(L, 5); return exact ? r === 5 : r >= 5; }

  // 置くと（まんなかの石をふくむ）五になる 空き点
  function fivePts(L, exact) {
    const out = [];
    for (let x = 0; x < 11; x++) {
      if (L[x] !== 0) continue;
      L[x] = 1;
      if (isFive(L, exact)) out.push(x);
      L[x] = 0;
    }
    return out;
  }

  // 返り値：形 + 16 × 四の数（1本の線に 四が 2つ ある「一直線の四四」に そなえる）
  function classify(L, exact) {
    const T = TABLE[exact ? 1 : 0];
    const key = keyOf(L);
    if (T[key] >= 0) return T[key];
    let res = NONE;
    const r = runAt(L, 5);
    if (r >= 5) res = exact && r > 5 ? OVER : FIVE;
    else {
      const fp = fivePts(L, exact);
      if (fp.length >= 2) {
        let straight = false;
        for (let i = 0; i < fp.length; i++) for (let j = i + 1; j < fp.length; j++) {
          if (fp[j] - fp[i] === 5) straight = true;
        }
        res = straight ? OPEN4 + 16 : FOUR + 16 * Math.min(2, fp.length);
      } else if (fp.length === 1) res = FOUR + 16;
      else {
        let best = NONE;
        for (let x = 1; x < 10 && best < OPEN3; x++) {
          if (L[x] !== 0) continue;
          L[x] = 1;
          const c = classify(L, exact) & 15;
          L[x] = 0;
          const v = c === OPEN4 ? OPEN3 : c === FOUR ? THREE : c === OPEN3 ? OPEN2 : c === THREE ? TWO : NONE;
          if (v > best) best = v;
        }
        res = best;
      }
    }
    T[key] = res;
    return res;
  }

  // 盤から 11マスを読む（p には col の石が あるものとする）
  const LBUF = new Uint8Array(11);
  function readLine(board, size, p, col, d) {
    const [dx, dy] = DIRS[d];
    const x0 = p % size, y0 = (p / size) | 0;
    for (let k = -5; k <= 5; k++) {
      if (k === 0) { LBUF[5] = 1; continue; }
      const x = x0 + dx * k, y = y0 + dy * k;
      if (!inside(size, x, y)) { LBUF[k + 5] = 2; continue; }
      const c = board[y * size + x];
      LBUF[k + 5] = c === col ? 1 : c === EMPTY ? 0 : 2;
    }
    return LBUF;
  }

  // p に col を置いたときの 4方向の形
  function shapes(board, size, p, col, exact) {
    const out = [0, 0, 0, 0];
    for (let d = 0; d < 4; d++) out[d] = classify(readLine(board, size, p, col, d), exact);
    return out;
  }

  // p に col を置いたときのまとめ
  function analyze(board, size, p, col, exact) {
    const sh = shapes(board, size, p, col, exact);
    const a = { dirs: sh.map(v => v & 15), five: false, over: false, fours: 0, open4: 0, open3: 0, three: 0, open2: 0, two: 0 };
    for (const v of sh) {
      const c = v & 15;
      if (c === FIVE) a.five = true;
      else if (c === OVER) a.over = true;
      else if (c === OPEN4) { a.open4++; a.fours++; }
      else if (c === FOUR) a.fours += v >> 4;
      else if (c === OPEN3) a.open3++;
      else if (c === THREE) a.three++;
      else if (c === OPEN2) a.open2++;
      else if (c === TWO) a.two++;
    }
    return a;
  }

  // ちょうど五／五以上になるか（いちばん かんたんな しらべかた）
  function makesFive(board, size, p, col, exact) {
    const x0 = p % size, y0 = (p / size) | 0;
    for (const [dx, dy] of DIRS) {
      let r = 1;
      for (let k = 1; ; k++) { const x = x0 + dx * k, y = y0 + dy * k; if (!inside(size, x, y) || board[y * size + x] !== col) break; r++; }
      for (let k = 1; ; k++) { const x = x0 - dx * k, y = y0 - dy * k; if (!inside(size, x, y) || board[y * size + x] !== col) break; r++; }
      if (exact ? r === 5 : r >= 5) return true;
    }
    return false;
  }

  // 置いたら五になる点（並んだ石）を返す
  function fiveLine(board, size, p, col, exact) {
    const x0 = p % size, y0 = (p / size) | 0;
    for (const [dx, dy] of DIRS) {
      const pts = [p];
      for (let k = 1; ; k++) { const x = x0 + dx * k, y = y0 + dy * k; if (!inside(size, x, y) || board[y * size + x] !== col) break; pts.push(y * size + x); }
      for (let k = 1; ; k++) { const x = x0 - dx * k, y = y0 - dy * k; if (!inside(size, x, y) || board[y * size + x] !== col) break; pts.push(y * size + x); }
      if (exact ? pts.length === 5 : pts.length >= 5) return pts.sort((a, b) => a - b);
    }
    return null;
  }

  // ---------- れんじゅの きんじて（くろだけ） ----------

  // d 方向で、p の石を「いきた四」にする 空き点
  function open4Points(board, size, p, d, col, exact) {
    const [dx, dy] = DIRS[d];
    const x0 = p % size, y0 = (p / size) | 0;
    const out = [];
    for (let k = -4; k <= 4; k++) {
      if (!k) continue;
      const x = x0 + dx * k, y = y0 + dy * k;
      if (!inside(size, x, y)) continue;
      const q = y * size + x;
      if (board[q] !== EMPTY) continue;
      board[q] = col;
      const c = classify(readLine(board, size, p, col, d), exact) & 15;
      board[q] = EMPTY;
      if (c === OPEN4) out.push(q);
    }
    return out;
  }

  // くろが p に置くと きんじてか。'overline' | 'four4' | 'three3' | null
  // depth：三が「本当の三」か（四に したとき その点が きんじてで ないか）を さかのぼって しらべる深さ
  function forbidden(board, size, p, depth) {
    depth = depth || 0;
    if (board[p] !== EMPTY) return null;
    const sh = shapes(board, size, p, BLACK, true);
    let fours = 0, over = false;
    const threeDirs = [];
    for (let d = 0; d < 4; d++) {
      const c = sh[d] & 15;
      if (c === FIVE) return null;          // 五が できれば かち（きんじてより さき）
      if (c === OVER) over = true;
      else if (c === OPEN4) fours++;
      else if (c === FOUR) fours += sh[d] >> 4;
      else if (c === OPEN3) threeDirs.push(d);
    }
    if (over) return 'overline';
    if (fours >= 2) return 'four4';
    if (threeDirs.length < 2) return null;
    board[p] = BLACK;
    let threes = 0;
    for (const d of threeDirs) {
      const pts = open4Points(board, size, p, d, BLACK, true);
      // 四に できる点が きんじてでなければ「本当の三」
      if (pts.some(q => depth >= 2 || !forbidden(board, size, q, depth + 1))) threes++;
    }
    board[p] = EMPTY;
    return threes >= 2 ? 'three3' : null;
  }

  // ---------- ゲームの状態 ----------

  // opts: { size, rule: 'free' | 'renju' }
  function newGame(opts) {
    opts = opts || {};
    const size = SIZES.includes(opts.size) ? opts.size : 13;
    const g = geo(size);
    return {
      size,
      rule: opts.rule === 'renju' ? 'renju' : 'free',
      board: new Int8Array(g.n),
      turn: 0,
      ply: 0,
      last: null,         // { side, p }
      kifu: [],
      winner: null,       // null = 対局中、0/1 = 勝った方、-1 = 引き分け
      result: null,       // 'five' | 'resign' | 'full'
      line: null,         // 五に ならんだ 点
    };
  }

  function clone(s) {
    return Object.assign({}, s, { board: s.board.slice(), kifu: s.kifu.slice() });
  }

  // その手番の色が「ちょうど五」か（れんじゅの くろ）
  function exactFor(rule, side) { return rule === 'renju' && side === 0; }

  const KN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九'];
  function pointName(size, p) { return `${(p % size) + 1}の${KN[(p / size) | 0]}`; }
  function moveText(s, p, side) {
    if (side === undefined) side = s.turn;
    return SIDES[side].mark + pointName(s.size, p);
  }

  // 置けない理由（置けるなら null）：'occupied' | 'overline' | 'four4' | 'three3'
  function illegalReason(s, p) {
    if (p < 0 || p >= s.board.length || s.board[p] !== EMPTY) return 'occupied';
    if (s.rule === 'renju' && s.turn === 0) return forbidden(s.board, s.size, p);
    return null;
  }
  function canApply(s, p) { return s.winner === null && illegalReason(s, p) === null; }

  function apply(s, p) {
    const side = s.turn;
    const why = illegalReason(s, p);
    if (s.winner !== null || why) throw new Error('illegal move: ' + (why || 'game over'));
    const n = clone(s);
    n.kifu.push(moveText(s, p, side));
    n.board[p] = side + 1;
    n.ply++;
    n.last = { side, p };
    n.turn = 1 - side;
    const line = fiveLine(s.board, s.size, p, side + 1, exactFor(s.rule, side));
    if (line) { n.winner = side; n.result = 'five'; n.line = line; }
    else if (n.ply >= n.board.length) { n.winner = -1; n.result = 'full'; }
    return n;
  }

  function resign(s) {
    const n = clone(s);
    n.winner = 1 - s.turn;
    n.result = 'resign';
    return n;
  }

  function replay(opts, moves) {
    let s = newGame(opts);
    for (const m of moves) s = apply(s, m);
    return s;
  }

  global.Engine = {
    EMPTY, BLACK, WHITE, SIZES, SIDES, DIRS, DIR_NAMES,
    NONE, TWO, OPEN2, THREE, OPEN3, FOUR, OPEN4, OVER, FIVE, SHAPE_NAMES,
    geo, classify, readLine, shapes, analyze, makesFive, fiveLine, open4Points, forbidden, exactFor,
    newGame, clone, apply, resign, replay, canApply, illegalReason,
    pointName, moveText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
