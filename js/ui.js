/*
 * ならびがみえる五目ならべ — 画面表示と操作
 */
(function () {
  'use strict';
  const E = window.Engine;
  const AI = window.AI;
  const TS = window.Tsumego;
  const PROBS = window.TSUMEGO_PROBLEMS || [];
  const $ = id => document.getElementById(id);
  const STORE = 'yygomoku.v1';
  const KN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九'];

  const app = {
    G: null,
    states: [],         // states[k] = k 手目のあとの局面（まった用）
    moves: [],
    mode: 'cpu',        // 'cpu' | 'two' | 'tsume'
    human: [true, false],
    level: 'beginner',
    rule: 'free',
    size: 13,
    preview: null,      // おく前に たしかめている点
    look: null,         // タッチした石（ならびを見せる）
    hint: null,
    busy: false,
    token: 0,           // 新しいゲームやまったで、古い CPU の思考結果を捨てるため
    anim: null,
    lastIllegal: null,
    settings: { runs: true, wins: true, danger: true, confirm: true, numbers: false, sound: true },
    tsume: null,        // つめごもく中：{ idx, solver, n, failed, demo }
    tsumeDone: {},
  };

  let cells = [];

  // ---------- 保存 ----------

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        settings: app.settings,
        tsumeDone: app.tsumeDone,
        game: {
          mode: app.mode, human: app.human, level: app.level, rule: app.rule, size: app.size,
          moves: app.moves, tsume: app.tsume ? app.tsume.idx : null,
        },
      }));
    } catch (e) { /* 保存できない環境でも遊べる */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  }

  // ---------- 小さな図（ルールの説明用） ----------

  // rows：X くろ / O しろ / x o うすい石（これから おく） / + 五の点（みどり）/ ! ふさぐ ところ / * ×じるし（おけない）
  function miniSVG(rows) {
    const h = rows.length, w = rows[0].length, u = 20;
    const W = w * u, H = h * u;
    let s = `<rect class="mb" x="0" y="0" width="${W}" height="${H}"/>`;
    for (let x = 0; x < w; x++) s += `<line class="ml" x1="${x * u + u / 2}" y1="0" x2="${x * u + u / 2}" y2="${H}"/>`;
    for (let y = 0; y < h; y++) s += `<line class="ml" x1="0" y1="${y * u + u / 2}" x2="${W}" y2="${y * u + u / 2}"/>`;
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      const cx = x * u + u / 2, cy = y * u + u / 2;
      if (c === 'X' || c === 'x') s += `<circle class="s1${c === 'x' ? ' gh' : ''}" cx="${cx}" cy="${cy}" r="8.6"/>`;
      if (c === 'O' || c === 'o') s += `<circle class="s2${c === 'o' ? ' gh' : ''}" cx="${cx}" cy="${cy}" r="8.6"/>`;
      if (c === '+') s += `<circle class="lib" cx="${cx}" cy="${cy}" r="4"/>`;
      if (c === '!') s += `<circle class="wn" cx="${cx}" cy="${cy}" r="6"/><text class="tx k" x="${cx}" y="${cy + 0.5}">!</text>`;
      if (c === '*') s += `<path class="x" d="M${cx - 5},${cy - 5}L${cx + 5},${cy + 5}M${cx + 5},${cy - 5}L${cx - 5},${cy + 5}"/>`;
    }));
    return `<svg class="mini" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`;
  }

  const GUIDE = [
    ['石を おく', 'くろと しろが 1こずつ じゅんばんに、線と 線が まじわる ところに 石を おくよ。くろが さき。おいた 石は うごかないし、とられる ことも ないよ。',
      ['.....', '.X...', '..O..', '...X.', '.....']],
    ['5つ ならべたら かち', 'たて・よこ・ななめの どれかに、じぶんの 石を 5つ つづけて ならべたら かち！',
      ['X....', '.X...', '..X..', '...X.', '....X']],
    ['四（よん）', 'あと 1つで 5つに なる ならびが「四」。あいては ＋ を ふさがないと まけちゃう。',
      ['......', 'OXXXX+', '......']],
    ['いきた四', 'りょうはしが あいている 4つは「いきた四」。あいては かたほうしか ふさげないから、もう かち！',
      ['......', '+XXXX+', '......']],
    ['いきた三', 'りょうはしが あいた 3つは「いきた三」。ほうっておくと いきた四に されるので、はしの ! を ふさごう。',
      ['.......', '.!XXX!.', '.......']],
    ['とびの 三・とびの 四', 'あいだが 1つ あいていても なかま。とびの 四は、あいだの ＋ に おけば 5つ！',
      ['.......', '.XX+XX.', '.......', '.!X.XX!', '.......']],
    ['四三（しさん）', '四と いきた三を いっぺんに つくる かたち。あいてが 四を ふさいでいる あいだに、三を いきた四に できるよ。',
      ['...X..', '...X..', '...X..', '.XXx..', '......', '......']],
    ['ふせぐ', 'あいての 四・いきた三を みつけたら ふさごう。でも、じぶんが 5つ ならべられる ときは、ふせぐより さきに 5つ！',
      ['.......', '.OXXXX.', '.......', '.!OOO!.', '.......']],
    ['れんじゅの きんじて', 'れんじゅルールでは くろだけ「三三」「四四」「長連（6つ いじょう）」に なる ところ（×）に おけないよ。しろは どこでも OK。',
      ['......', '..X...', '..X...', 'XX*...', '......']],
    ['ひきわけ', '盤が ぜんぶ うまって、どちらも 5つ ならべられなかったら ひきわけ。',
      ['XOXOX', 'OXOXO', 'OXOXO', 'XOXOX', 'XOXOX']],
  ];

  function fillGuide() {
    $('guide-list').innerHTML = GUIDE.map(([t, d, rows]) =>
      `<div class="g-item">${miniSVG(rows)}<div class="g-body"><b>${t}</b><p>${d}</p></div></div>`).join('');
  }

  // ---------- 初期化 ----------

  function init() {
    const board = $('board');
    board.addEventListener('click', e => {
      const c = e.target.closest('.pt');
      if (c) onPoint(+c.dataset.p);
    });

    $('btn-menu').addEventListener('click', () => {
      $('btn-resign').disabled = !canResign();
      $('dlg-menu').showModal();
    });
    $('btn-guide').addEventListener('click', () => $('dlg-guide').showModal());
    $('btn-hint').addEventListener('click', onHint);
    $('btn-undo').addEventListener('click', onUndo);
    $('btn-tsume').addEventListener('click', openTsumeList);
    $('btn-ts-retry').addEventListener('click', () => { if (app.tsume) startTsume(app.tsume.idx, []); });
    $('btn-ts-answer').addEventListener('click', () => { if (app.tsume && !app.tsume.demo) tsumeResult('answer'); });
    $('dlg-tsume').addEventListener('close', () => {
      const v = $('dlg-tsume').returnValue;
      if (/^\d+$/.test(v)) startTsume(+v, []);
    });
    $('dlg-tsume-result').addEventListener('close', () => onTsumeResult($('dlg-tsume-result').returnValue));

    $('dlg-menu').addEventListener('close', () => {
      const v = $('dlg-menu').returnValue;
      if (v === 'new') openNew(false);
      else if (v === 'howto') $('dlg-howto').showModal();
      else if (v === 'tsume') openTsumeList();
      else if (v === 'guide') $('dlg-guide').showModal();
      else if (v === 'settings') openSettings();
      else if (v === 'resign') onResign();
    });
    const fNew = $('dlg-new').querySelector('form');
    fNew.addEventListener('change', syncNewForm);
    $('dlg-new').addEventListener('close', () => {
      if ($('dlg-new').returnValue !== 'ok') return;
      const order = fNew.order.value === 'random' ? (Math.random() < 0.5 ? 'first' : 'second') : fNew.order.value;
      startGame({ mode: fNew.mode.value, level: fNew.level.value, order, rule: fNew.rule.value, size: +fNew.size.value });
    });
    $('dlg-settings').addEventListener('close', () => {
      const f = $('dlg-settings').querySelector('form');
      for (const k of Object.keys(app.settings)) app.settings[k] = f[k].checked;
      app.preview = null;
      save();
      render();
    });
    $('dlg-result').addEventListener('close', () => {
      const v = $('dlg-result').returnValue;
      if (v === 'new') openNew(false);
      else if (v === 'undo') onUndo();
    });

    fillGuide();
    new ResizeObserver(() => {
      const w = $('board').clientWidth / app.size;
      document.body.classList.toggle('small-cells', w < 26);
    }).observe($('board'));

    const saved = load();
    if (saved && saved.settings) Object.assign(app.settings, saved.settings);
    if (saved && saved.tsumeDone) app.tsumeDone = saved.tsumeDone;
    const g = saved && saved.game;
    if (g && g.mode === 'tsume' && PROBS[g.tsume]) {
      startTsume(g.tsume, g.moves || []);
    } else if (g && Array.isArray(g.moves)) {
      app.mode = g.mode === 'two' ? 'two' : 'cpu';
      app.human = g.human || [true, false];
      app.level = AI.LEVELS[g.level] ? g.level : 'beginner';
      app.rule = g.rule === 'renju' ? 'renju' : 'free';
      app.size = E.SIZES.includes(g.size) ? g.size : 13;
      rebuild(g.moves);
      setupBoard();
      render();
      if (app.G.winner === null) proceed();
    } else {
      startGame({ mode: 'cpu', level: 'beginner', order: 'first', rule: 'free', size: 13 }, true);
      openNew(true);
    }
  }

  function openSettings() {
    const f = $('dlg-settings').querySelector('form');
    for (const k of Object.keys(app.settings)) f[k].checked = app.settings[k];
    $('dlg-settings').showModal();
  }

  function openNew(first) {
    const f = $('dlg-new').querySelector('form');
    if (app.mode !== 'tsume') {
      f.mode.value = app.mode;
      f.level.value = app.level;
      f.rule.value = app.rule;
      f.size.value = String(app.size);
    }
    $('welcome').hidden = !first;
    $('btn-new-cancel').hidden = !!first;
    syncNewForm();
    $('dlg-new').showModal();
  }
  function syncNewForm() {
    const f = $('dlg-new').querySelector('form');
    const cpu = f.mode.value === 'cpu';
    f.querySelectorAll('.cpu-only').forEach(el => { el.hidden = !cpu; });
  }

  function startGame(o, silent) {
    app.token++;
    app.busy = false;
    app.tsume = null;
    document.body.classList.remove('tsume-mode');
    app.mode = o.mode;
    app.level = o.level || 'beginner';
    app.rule = o.rule === 'renju' ? 'renju' : 'free';
    app.size = E.SIZES.includes(o.size) ? o.size : 13;
    app.human = o.mode === 'cpu' ? (o.order === 'second' ? [false, true] : [true, false]) : [true, true];
    rebuild([]);
    $('kifu').innerHTML = '';
    setupBoard();
    save();
    render();
    if (!silent) proceed();
  }

  function rebuild(moves) {
    let s = app.mode === 'tsume' ? tsumeStart(app.tsume.idx) : E.newGame({ size: app.size, rule: app.rule });
    app.states = [s];
    app.moves = [];
    for (const m of moves) {
      if (!E.canApply(s, m)) break;
      s = E.apply(s, m);
      app.states.push(s);
      app.moves.push(m);
    }
    app.G = s;
    app.preview = null;
    app.look = null;
    app.hint = null;
    app.lastIllegal = null;
  }

  // 盤の線と点を作り直す
  function setupBoard() {
    const n = app.size;
    document.documentElement.style.setProperty('--n', n);
    document.body.classList.toggle('big19', n >= 19);
    const board = $('board');
    let svg = `<svg class="grid" viewBox="0 0 ${n} ${n}" preserveAspectRatio="none" aria-hidden="true">`;
    for (let i = 0; i < n; i++) {
      const edge = i === 0 || i === n - 1 ? ' edge' : '';
      svg += `<line class="ln${edge}" x1="0.5" y1="${i + 0.5}" x2="${n - 0.5}" y2="${i + 0.5}"/>`;
      svg += `<line class="ln${edge}" x1="${i + 0.5}" y1="0.5" x2="${i + 0.5}" y2="${n - 0.5}"/>`;
    }
    const r = n >= 19 ? 0.09 : 0.08;
    for (const p of E.geo(n).stars) svg += `<circle class="star" cx="${p % n + 0.5}" cy="${((p / n) | 0) + 0.5}" r="${r}"/>`;
    svg += '</svg><svg class="fiveline" id="fiveline" viewBox="0 0 ' + n + ' ' + n + '" aria-hidden="true"></svg>';
    board.innerHTML = svg;
    cells = [];
    for (let p = 0; p < n * n; p++) {
      const c = document.createElement('div');
      c.className = 'pt';
      c.dataset.p = p;
      board.appendChild(c);
      cells.push(c);
    }
    let f = '', rk = '';
    for (let i = 0; i < n; i++) { f += `<span>${i + 1}</span>`; rk += `<span>${KN[i]}</span>`; }
    $('files').innerHTML = f;
    $('ranks').innerHTML = rk;
    document.body.classList.toggle('small-cells', board.clientWidth / n < 26);
  }

  // ---------- 状態の問い合わせ ----------

  function humanTurn() { return app.G.winner === null && app.human[app.G.turn] && !app.busy; }
  function canResign() { return app.mode !== 'tsume' && app.G.winner === null && humanTurn() && app.G.ply > 0; }
  const color = side => side + 1;
  const exactOf = (G, side) => E.exactFor(G.rule, side);

  function playerName(side) {
    if (app.mode === 'two') return E.SIDES[side].name;
    if (app.mode === 'tsume') return side === 0 ? 'あなた' : 'しろ';
    return app.human[side] ? 'あなた' : 'CPU';
  }

  // いまの手番から見た「かてる点・ふさがないと まける点・あぶない点・きんじて」
  const threatCache = new WeakMap();
  function threats(G) {
    if (threatCache.has(G)) return threatCache.get(G);
    const n = G.size, b = G.board, me = G.turn, op = 1 - me;
    const out = { wins: new Set(), must: new Set(), warn: new Set(), forbid: new Map() };
    if (G.winner === null) {
      const near = nearMask(b, n);
      for (let p = 0; p < b.length; p++) {
        if (b[p] || !near[p]) continue;
        if (E.makesFive(b, n, p, color(me), exactOf(G, me))) out.wins.add(p);
        if (E.makesFive(b, n, p, color(op), exactOf(G, op))) { out.must.add(p); continue; }
        const d = E.analyze(b, n, p, color(op), exactOf(G, op));
        if (d.open4 || d.fours >= 2 || (d.fours && d.open3) || d.open3 >= 2) {
          if (!(exactOf(G, op) && E.forbidden(b, n, p))) out.warn.add(p);
        }
        if (exactOf(G, me)) {
          const a = E.analyze(b, n, p, color(me), true);
          if (a.over || a.fours >= 2 || a.open3 >= 2) {
            const why = E.forbidden(b, n, p);
            if (why) out.forbid.set(p, why);
          }
        }
      }
    }
    threatCache.set(G, out);
    return out;
  }
  // 石の まわり 4マス以内（ここより とおくでは 五も きんじても できない）
  function nearMask(b, n) {
    const m = new Uint8Array(b.length);
    for (let p = 0; p < b.length; p++) {
      if (!b[p]) continue;
      const x0 = p % n, y0 = (p / n) | 0;
      for (const [dx, dy] of E.DIRS) for (let k = -4; k <= 4; k++) {
        const x = x0 + dx * k, y = y0 + dy * k;
        if (x >= 0 && y >= 0 && x < n && y < n) m[y * n + x] = 1;
      }
    }
    return m;
  }

  // 石 p から d の むきに つながった 同じ色の 石
  function runStones(b, n, p, d) {
    const col = b[p], [dx, dy] = E.DIRS[d];
    const x0 = p % n, y0 = (p / n) | 0, pts = [p];
    for (const s of [1, -1]) {
      for (let k = 1; ; k++) {
        const x = x0 + dx * k * s, y = y0 + dy * k * s;
        if (x < 0 || y < 0 || x >= n || y >= n || b[y * n + x] !== col) break;
        pts.push(y * n + x);
      }
    }
    return pts;
  }
  // まだ 5つに のばせる ならびか（あいての石や はしに じゃまされていない）
  function alive(b, n, pts, d) {
    const col = b[pts[0]], [dx, dy] = E.DIRS[d];
    const x0 = pts[0] % n, y0 = (pts[0] / n) | 0;
    const tOf = q => (dx ? (q % n - x0) / dx : (((q / n) | 0) - y0) / dy);
    let lo = Infinity, hi = -Infinity;
    for (const q of pts) { const t = tOf(q); lo = Math.min(lo, t); hi = Math.max(hi, t); }
    let span = pts.length;
    for (const [t0, s] of [[hi, 1], [lo, -1]]) {
      for (let k = 1; k <= 5 - pts.length; k++) {
        const t = t0 + k * s, x = x0 + dx * t, y = y0 + dy * t;
        if (x < 0 || y < 0 || x >= n || y >= n) break;
        const c = b[y * n + x];
        if (c && c !== col) break;
        span++;
      }
    }
    return span >= 5;
  }
  // 石ごとの ならびの数（3つ以上・のばせる ものだけ）。数字は ならびの はしの 石に つける
  function runBadges(G) {
    const n = G.size, b = G.board;
    const out = new Map();
    for (let p = 0; p < b.length; p++) {
      if (!b[p]) continue;
      for (let d = 0; d < 4; d++) {
        const pts = runStones(b, n, p, d);
        if (pts.length < 3) continue;
        if (Math.max(...pts) !== p) continue; // はしの 石だけ
        if (pts.length < 5 && !alive(b, n, pts, d)) continue;
        const v = Math.min(5, pts.length);
        if (!out.has(p) || out.get(p) < v) out.set(p, v);
      }
    }
    return out;
  }
  // その色の いちばん長い ならび
  function longest(G, col) {
    const n = G.size, b = G.board;
    let best = 0;
    for (let p = 0; p < b.length; p++) {
      if (b[p] !== col) continue;
      for (let d = 0; d < 4; d++) best = Math.max(best, runStones(b, n, p, d).length);
    }
    return best;
  }

  const SHAPE_TEXT = {
    [E.OPEN4]: 'いきた四', [E.FOUR]: '四', [E.OPEN3]: 'いきた三', [E.THREE]: '三', [E.OPEN2]: '二', [E.TWO]: '二',
  };
  function bigShape(a) {
    if (a.five) return { t: '五', cls: 'good', d: '5つ ならんで かち！' };
    if (a.open4) return { t: 'いきた四', cls: 'good', d: 'りょうはしが あいた 4つ。あいては もう ふせげないよ！' };
    if (a.fours >= 2) return { t: '四四', cls: 'good', d: '四が 2つ いっぺんに できる。あいては 1つしか ふさげないよ！' };
    if (a.fours && a.open3) return { t: '四三', cls: 'good', d: '四と いきた三が いっぺんに できる。かちの かたち！' };
    if (a.open3 >= 2) return { t: '三三', cls: 'good', d: 'いきた三が 2つ。あいては 1つしか ふさげないよ。' };
    if (a.fours) return { t: '四', cls: '', d: 'あと 1つで 五。あいては ふさがないと まけるよ。' };
    if (a.open3) return { t: 'いきた三', cls: '', d: 'ほうっておかれたら、つぎに いきた四に できるよ。' };
    return null;
  }

  // 置いたら どうなるか
  function previewInfo(G, p) {
    const n = G.size, me = G.turn, op = 1 - me;
    const a = E.analyze(G.board, n, p, color(me), exactOf(G, me));
    const d = E.analyze(G.board, n, p, color(op), exactOf(G, op));
    const tr = threats(G);
    const b = G.board.slice();
    b[p] = color(me);
    let longestRun = 1;
    for (let k = 0; k < 4; k++) longestRun = Math.max(longestRun, runStones(b, n, p, k).length);
    return { a, d, tr, longestRun };
  }

  // 手の番号
  function moveNumbers() {
    const nums = new Int16Array(app.size * app.size);
    let k = 0;
    for (let i = 1; i < app.states.length; i++) nums[app.states[i].last.p] = ++k;
    return nums;
  }

  // ---------- 描画 ----------

  function render() {
    renderBoard();
    renderPlayers();
    renderStatus();
    renderInfo();
    renderKifu();
    const tsDemo = app.tsume && app.tsume.demo;
    $('btn-hint').disabled = !humanTurn() || tsDemo;
    $('btn-undo').disabled = !canUndo() || tsDemo;
  }

  function renderBoard() {
    const G = app.G, n = G.size, b = G.board;
    const ht = humanTurn();
    const tr = ht ? threats(G) : null;
    const assist = ht && !app.tsume;
    const runs = app.settings.runs ? runBadges(G) : null;
    const nums = app.settings.numbers ? moveNumbers() : null;
    const last = G.last ? G.last.p : -1;
    const five = new Set(G.line || []);
    const pv = app.preview !== null && ht ? app.preview : null;
    // タッチした石の ならび
    const runSet = new Set(), runOpp = new Set(), runEmpty = new Set();
    if (app.look !== null && b[app.look]) {
      const col = b[app.look];
      const opp = app.mode === 'two' ? false : !app.human[col - 1];
      for (let d = 0; d < 4; d++) {
        for (const q of runStones(b, n, app.look, d)) (opp ? runOpp : runSet).add(q);
      }
    } else if (pv !== null) {
      const bb = b.slice();
      bb[pv] = color(G.turn);
      for (let d = 0; d < 4; d++) {
        const pts = runStones(bb, n, pv, d);
        if (pts.length >= 2) for (const q of pts) if (q !== pv) runSet.add(q);
      }
    }
    for (let p = 0; p < n * n; p++) {
      const c = cells[p];
      const cls = ['pt'];
      let h = '';
      const st = b[p];
      if (st) {
        const sc2 = ['stone', 'c' + st];
        if (p === last && !five.size) sc2.push('last');
        if (five.has(p)) sc2.push('five');
        let inner = '';
        if (nums && nums[p]) { inner = `<span class="num">${nums[p]}</span>`; sc2.push('has-num'); }
        h += `<div class="${sc2.join(' ')}">${inner}</div>`;
        if (runs && runs.has(p) && !five.size) {
          const v = runs.get(p);
          h += `<span class="badge r${v}">${v}</span>`;
        }
        if (runSet.has(p)) cls.push('run');
        if (runOpp.has(p)) cls.push('run-opp');
        if (app.look === p) cls.push('sel');
      } else {
        if (pv === p) h += `<div class="stone ghost c${color(G.turn)}"></div>`;
        else if (tr) {
          if (tr.forbid.has(p)) cls.push('forbid');
          else if (app.settings.wins && assist && tr.wins.has(p)) cls.push('win');
          else if (app.settings.danger && assist && tr.must.has(p)) cls.push('must');
          else if (app.settings.danger && assist && tr.warn.has(p) && !tr.must.size) cls.push('warn');
        }
      }
      if (app.hint === p) cls.push('hint-to');
      c.className = cls.join(' ');
      c.innerHTML = h;
    }
    // 五の線
    const fl = $('fiveline');
    if (fl) {
      if (G.line && G.line.length) {
        const a = G.line[0], z = G.line[G.line.length - 1];
        fl.innerHTML = `<line x1="${a % n + 0.5}" y1="${((a / n) | 0) + 0.5}" x2="${z % n + 0.5}" y2="${((z / n) | 0) + 0.5}"/>`;
      } else fl.innerHTML = '';
    }
  }

  function renderPlayers() {
    const G = app.G;
    const bs = app.mode === 'cpu' && app.human[1] && !app.human[0] ? 1 : 0;
    for (const [elId, side] of [['player-bottom', bs], ['player-top', 1 - bs]]) {
      const el = $(elId);
      const active = G.turn === side && G.winner === null;
      el.className = `player s${side}${active ? ' active' : ''}`;
      let h = `<div class="pname"><b><i class="pstone s${side}"></i>${playerName(side)}</b><small>${app.mode === 'two' ? (side === 0 ? 'さきに うつ' : 'あとに うつ') : E.SIDES[side].name}${app.rule === 'renju' && side === 0 && app.mode !== 'tsume' ? '（きんじて あり）' : ''}</small></div>`;
      const L = Math.min(5, longest(G, color(side)));
      let bar = '';
      for (let i = 0; i < 5; i++) bar += `<i class="${i < L ? 'pstone s' + side : 'empty'}"></i>`;
      h += `<div class="caps"><span class="lbl">いちばん ながい ならび</span><span class="runbar">${bar}</span><span class="goal">${L} / 5</span></div>`;
      if (app.mode === 'tsume' && side === 0) {
        const left = app.tsume.n - blackMovesMade();
        h += `<div class="pextra">のこり<br><b>${Math.max(0, left)}</b>手</div>`;
      }
      el.innerHTML = h;
    }
  }

  function lastLine(G) {
    if (!G.last) return '';
    return `<span class="lastmv">${playerName(G.last.side)}：${G.kifu[G.kifu.length - 1]}</span>`;
  }

  function renderStatus() {
    const G = app.G;
    const el = $('status');
    let cls = 's' + G.turn, text;
    const who = playerName(G.turn);
    const ts = app.tsume;
    const ht = humanTurn();
    if (ts) {
      const pr = PROBS[ts.idx];
      const left = ts.n - blackMovesMade();
      if (ts.demo) { cls += ' hint'; text = 'こたえを ならべているよ…'; }
      else if (G.winner === 0) { cls = 'end'; text = `<b>せいかい！</b> ${pr.moves}手で 5つ ならんだよ`; }
      else if (G.winner === 1) { cls += ' check'; text = '<b>ざんねん！</b> しろが さきに 5つ ならべたよ。「まった」で もどろう'; }
      else if (ts.failed && G.turn === 0) { cls += ' check'; text = '<b>ざんねん！</b> ふせがれちゃった。「まった」で もどって もういちど！'; }
      else if (!app.human[G.turn]) { cls += ' think'; text = 'しろが ふせぎかたを かんがえているよ<span class="dots"><i></i><i></i><i></i></span>'; }
      else if (app.hint !== null) { cls += ' hint'; text = `ヒント：<b>${E.pointName(G.size, app.hint)}</b> ひかっている ところに おいてね`; }
      else if (app.preview !== null && ht) { text = 'ここで いい？ もういちど タッチすると おくよ'; }
      else { text = `<b>第${ts.idx + 1}問（${pr.moves}手）</b> のこり ${left}手で 5つ ならべよう！`; }
      el.className = 'status ' + cls;
      el.innerHTML = `<span class="msg">${text}</span>${G.last ? lastLine(G) : `<span class="lastmv">「${pr.title}」</span>`}`;
      return;
    }
    const tr = ht ? threats(G) : null;
    if (G.winner !== null) {
      cls = 'end';
      text = G.winner === -1 ? 'ひきわけ' : `${playerName(G.winner)}の かち！`;
      text += '　<small>「メニュー」から あたらしく はじめられるよ</small>';
    } else if (!app.human[G.turn]) {
      cls += ' think';
      text = 'CPU が かんがえ中<span class="dots"><i></i><i></i><i></i></span>';
    } else if (app.hint !== null) {
      cls += ' hint';
      text = `ヒント：<b>${E.pointName(G.size, app.hint)}</b> が おすすめ！ ひかっている ところに おいてね`;
    } else if (app.preview !== null && ht) {
      text = 'ここで いい？ <b>もういちど タッチ</b>すると おくよ';
    } else if (tr && tr.wins.size && app.settings.wins) {
      cls += ' hint';
      text = `<b>チャンス！</b> <span class="lg lg-win"></span> に おくと 5つ ならぶよ！`;
    } else if (tr && tr.must.size) {
      cls += ' check';
      text = `<b>あぶない！</b> ${app.mode === 'two' ? E.SIDES[1 - G.turn].name : 'あいて'}が 4つ ならべたよ。${app.settings.danger ? '<span class="lg lg-must"></span> を' : 'はしを'} ふさごう！`;
    } else if (tr && tr.warn.size && app.settings.danger) {
      cls += ' check';
      text = `<b>きを つけて！</b> ${app.mode === 'two' ? E.SIDES[1 - G.turn].name + 'に' : 'あいてに'} いきた三が あるよ。<span class="lg lg-warn">!</span> を ふさごう`;
    } else {
      const goal = G.ply < 4 ? 'たて・よこ・ななめに 5つ ならべたら かち！' : '石を おく ところを タッチしてね';
      text = app.mode === 'two' ? `<b>${who}</b>の ばんだよ。${goal}` : `<b>あなたの ばん</b>（${E.SIDES[G.turn].name}）だよ。${goal}`;
    }
    el.className = 'status ' + cls;
    el.innerHTML = `<span class="msg">${text}</span>${lastLine(G)}`;
  }

  const REASON = {
    occupied: 'もう 石が あるよ。',
    overline: '<b>長連（ちょうれん）</b>：れんじゅでは、くろが 6つ いじょう ならぶ ところには おけないよ。',
    four4: '<b>四四（よんよん）</b>：れんじゅでは、くろは 四が 2つ いっぺんに できる ところには おけないよ。',
    three3: '<b>三三（さんさん）</b>：れんじゅでは、くろは いきた三が 2つ いっぺんに できる ところには おけないよ。',
  };
  const REASON_SHORT = { overline: 'きんじて：長連', four4: 'きんじて：四四', three3: 'きんじて：三三', occupied: 'そこには おけないよ' };

  function renderInfo() {
    const G = app.G;
    const info = $('info');
    const ht = humanTurn();
    if (app.preview !== null && ht) {
      const { a, d, tr, longestRun } = previewInfo(G, app.preview);
      const p = app.preview;
      const me = E.SIDES[G.turn].name;
      const lines = [];
      const big = bigShape(a);
      if (big) lines.push(`<b class="${big.cls}">${big.t}！</b> ${big.d}`);
      if (!a.five) {
        if (tr.must.has(p)) lines.push('<b class="good">あいての 四を ふさいだ！</b>');
        else if (tr.warn.has(p)) lines.push('<b class="good">あいての いきた三を ふさいだ！</b>');
        else if (d.open3 || d.fours) lines.push('あいての ならびの じゃまに なるよ。');
        if (tr.wins.size && !tr.wins.has(p)) lines.push(`<b class="bad">まって！ 5つ ならべられる ところが あるよ（<span class="lg lg-win"></span>）</b>`);
        else if (tr.must.size && !tr.must.has(p)) lines.push(`<b class="bad">あぶない！ あいてが つぎに 5つ ならべちゃう（<span class="lg lg-must"></span>）。ふさがなくて いい？</b>`);
        else if (tr.warn.size && !tr.warn.has(p) && !a.fours && !(big && big.cls === 'good')) lines.push(`<b class="bad">あいての いきた三が そのままだよ（<span class="lg lg-warn">!</span>）</b>`);
      }
      if (!big) lines.push(`おいた 石の ならびは いちばん ながくて <b>${longestRun}つ</b>。`);
      info.innerHTML = `<div class="card"><div class="card-body"><div class="card-head"><i class="pstone s${G.turn}"></i><b>${E.pointName(G.size, p)}</b><span class="owner s${G.turn}">${me}</span></div>` +
        `<p class="desc">${lines.join('<br>')}</p><p class="note">もういちど タッチすると おくよ。ほかの ところを タッチすると えらびなおせるよ。</p></div></div>`;
      return;
    }
    if (app.look !== null && G.board[app.look]) {
      const p = app.look, n = G.size, col = G.board[p], side = col - 1;
      const mine = app.mode === 'two' ? side === G.turn : app.human[side];
      const rows = [];
      for (let d = 0; d < 4; d++) {
        const pts = runStones(G.board, n, p, d);
        const sh = E.classify(E.readLine(G.board, n, p, col, d), exactOf(G, side)) & 15;
        let note = '';
        if (pts.length >= 5) note = '<b class="good">5つ！</b>';
        else if (sh >= E.THREE && SHAPE_TEXT[sh]) note = `<b class="${mine ? 'good' : 'bad'}">${SHAPE_TEXT[sh]}</b>`;
        else if (pts.length >= 2 && !alive(G.board, n, pts, d)) note = '（もう 5つに ならない）';
        rows.push(`${E.DIR_NAMES[d]}${d >= 2 ? (d === 2 ? '＼' : '／') : ''}：<b>${pts.length}つ</b> ${note}`);
      }
      const owner = app.mode === 'two' ? `${E.SIDES[side].name}の 石` : (mine ? 'あなたの 石' : (app.mode === 'tsume' ? 'しろの 石' : 'CPU の 石'));
      info.innerHTML = `<div class="card"><div class="card-body"><div class="card-head"><i class="pstone s${side}"></i><b>${E.SIDES[side].name}</b>` +
        `<span class="owner s${side}">${owner}</span><span class="where">${E.pointName(n, p)}</span></div><p class="desc">${rows.join('<br>')}</p></div></div>`;
      return;
    }
    if (app.lastIllegal) {
      info.innerHTML = `<div class="tips"><p class="tip-main">そこには おけないよ</p><p class="desc">${REASON[app.lastIllegal] || ''}</p></div>`;
      return;
    }
    if (app.tsume) {
      const pr = PROBS[app.tsume.idx];
      info.innerHTML = `<div class="tips"><p class="tip-main">第${app.tsume.idx + 1}問「${pr.title}」</p>` +
        `<p class="desc">くろを ${app.tsume.n}かい うつまでに、たて・よこ・ななめの どれかに 5つ ならべよう。しろは いちばん ながく ふせぐ 手を うってくるよ。</p></div>`;
      return;
    }
    info.innerHTML =
      '<div class="tips"><p class="tip-main">石を タッチすると ならびが みえるよ。</p>' +
      '<ul class="legend">' +
      '<li><span class="lg lg-n4">4</span> ならんだ 石の かず</li>' +
      '<li><span class="lg lg-win"></span> おくと 5つで かち</li>' +
      '<li><span class="lg lg-must"></span> ふさがないと まける</li>' +
      '<li><span class="lg lg-warn">!</span> あいての いきた三</li>' +
      (app.rule === 'renju' ? '<li><span class="lg lg-forbid">×</span> くろの きんじて</li>' : '') +
      '</ul></div>';
  }

  function renderKifu() {
    const ol = $('kifu');
    const k = app.G.kifu;
    if (ol.children.length > k.length) ol.innerHTML = '';
    for (let i = ol.children.length; i < k.length; i++) {
      const li = document.createElement('li');
      li.textContent = k[i];
      ol.appendChild(li);
    }
  }

  // ---------- 演出 ----------

  function animateMove() {
    const a = app.anim;
    app.anim = null;
    if (!a) return;
    const st = cells[a.p] && cells[a.p].querySelector('.stone');
    if (st) st.classList.add('drop');
  }
  let toastTimer = 0;
  function toast(html, cls) {
    const el = $('toast');
    el.innerHTML = html;
    el.className = 'toast show ' + (cls || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 1800);
  }
  let actx = null;
  function tone(freq, start, dur, type, vol) {
    const t0 = actx.currentTime + start;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol || 0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    return o;
  }
  function sound(kind) {
    if (!app.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      if (kind === 'move') {
        const o = tone(1200, 0, 0.07, 'triangle', 0.3);
        o.frequency.exponentialRampToValueAtTime(220, actx.currentTime + 0.06);
      } else if (kind === 'four') {
        [700, 900, 1100].forEach((f, i) => tone(f, 0.08 + i * 0.06, 0.12, 'triangle', 0.16));
      } else if (kind === 'check') {
        tone(660, 0.05, 0.15, 'square', 0.07); tone(880, 0.2, 0.2, 'square', 0.07);
      } else if (kind === 'win') {
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.3, 'triangle', 0.22));
      } else if (kind === 'lose') {
        [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.35, 'sine', 0.2));
      }
    } catch (e) { /* 音が出せない環境では鳴らさない */ }
  }
  function confetti() {
    const box = $('confetti');
    box.innerHTML = '';
    const colors = ['#111', '#f5f5f4', '#f59e0b', '#16a34a', '#2563eb'];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('i');
      s.style.left = Math.random() * 100 + '%';
      s.style.background = colors[i % colors.length];
      s.style.borderRadius = '50%';
      s.style.width = s.style.height = '12px';
      s.style.animationDelay = Math.random() * 0.6 + 's';
      s.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
      box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 3600);
  }

  // ---------- 操作 ----------

  function onPoint(p) {
    const G = app.G;
    app.lastIllegal = null;
    if (G.board[p]) {
      app.preview = null;
      app.look = app.look === p ? null : p;
      return render();
    }
    app.look = null;
    if (!humanTurn()) { app.preview = null; return render(); }
    const why = E.illegalReason(G, p);
    if (why) {
      app.preview = null;
      app.lastIllegal = why;
      toast(REASON_SHORT[why] || 'そこには おけないよ');
      return render();
    }
    if (app.settings.confirm && app.preview !== p && app.hint !== p) {
      app.preview = p;
      return render();
    }
    commit(p);
  }

  function commit(p) {
    const prev = app.G;
    const G = E.apply(prev, p);
    app.states.push(G);
    app.moves.push(p);
    app.G = G;
    app.preview = null;
    app.look = null;
    app.hint = null;
    app.lastIllegal = null;
    app.anim = { p };
    if (app.tsume && prev.turn === 0 && !app.tsume.demo && G.winner === null) {
      const left = app.tsume.n - blackMovesMade();
      app.tsume.failed = left < 1 || !app.tsume.solver.defend(G.board.slice(), left);
    }
    save();
    render();
    animateMove();
    sound('move');
    if (app.G.winner !== null) return finish();
    // 四・いきた三の お知らせ
    if (app.mode !== 'tsume') {
      const a = E.analyze(prev.board, prev.size, p, color(prev.turn), exactOf(prev, prev.turn));
      const big = bigShape(a);
      const byHuman = app.mode === 'cpu' && app.human[prev.turn];
      if (big && (a.fours || a.open3)) {
        if (byHuman || app.mode === 'two') {
          setTimeout(() => sound('four'), 60);
          toast(`<b>${big.t}！</b>`, 'cap');
        } else {
          setTimeout(() => sound('check'), 120);
          toast(`<b>${big.t}！</b> ${a.fours ? 'ふさいで！' : 'きを つけて'}`, 'check');
        }
      }
    }
    proceed();
  }

  function stateForAI(G) {
    return { size: G.size, board: Array.from(G.board), turn: G.turn, rule: G.rule };
  }

  function onHint() {
    if (!humanTurn()) return;
    const G = app.G;
    app.preview = null;
    if (app.tsume) {
      const left = app.tsume.n - blackMovesMade();
      const sols = app.tsume.failed ? [] : app.tsume.solver.solutions(G.board.slice(), left);
      if (!sols.length) { toast('「まった」で もどってみよう'); return; }
      app.hint = sols[0];
      return render();
    }
    const btn = $('btn-hint');
    btn.disabled = true;
    btn.classList.add('busy');
    const tk = app.token;
    ask(G, 'hint').then(m => {
      btn.classList.remove('busy');
      if (tk !== app.token || app.G !== G || m === null || m < 0) { render(); return; }
      app.hint = m;
      render();
    });
  }

  function canUndo() {
    if (app.G.result === 'resign') return true;
    if (!app.moves.length) return false;
    if (app.mode === 'two') return true;
    return undoTarget() >= 0;
  }
  // まったで戻る先（人が打つ番の局面のうち、いまより前で一番新しいもの）
  function undoTarget() {
    for (let k = app.moves.length - 1; k >= 0; k--) if (app.human[app.states[k].turn]) return k;
    return -1;
  }
  function onUndo() {
    const top = app.states[app.states.length - 1];
    if (app.G.result === 'resign' && app.G !== top) {
      // こうさんを取り消して、その局面にもどる
      app.G = top;
      save();
      render();
      return proceed();
    }
    if (!canUndo()) return;
    let k = app.mode === 'two' ? app.moves.length - 1 : undoTarget();
    if (k < 0) k = 0;
    app.token++;
    app.busy = false;
    app.moves.length = k;
    app.states.length = k + 1;
    app.G = app.states[k];
    if (app.tsume) app.tsume.failed = false;
    app.preview = null;
    app.look = null;
    app.hint = null;
    app.lastIllegal = null;
    save();
    render();
    toast('もどしたよ');
    proceed();
  }

  function onResign() {
    if (!canResign()) return;
    if (!confirm('こうさん しますか？')) return;
    app.G = E.resign(app.G); // states には積まない（まったで こうさん前に戻れる）
    save();
    render();
    finish();
  }

  // ---------- CPU ----------

  let worker = null, workerOK = typeof Worker !== 'undefined', reqId = 0;
  const pending = new Map();
  function runLocal(job) {
    setTimeout(() => job.resolve(AI.think(job.st, job.level)), 30);
  }
  function getWorker() {
    if (!workerOK) return null;
    if (!worker) {
      try {
        worker = new Worker('js/worker.js');
        worker.onmessage = e => {
          const job = pending.get(e.data.id);
          pending.delete(e.data.id);
          if (job) job.resolve(e.data.result);
        };
        worker.onerror = () => {
          // file:// などで Worker が使えないときは画面側で考える
          workerOK = false;
          worker = null;
          for (const job of pending.values()) runLocal(job);
          pending.clear();
        };
      } catch (e) {
        workerOK = false;
        worker = null;
      }
    }
    return worker;
  }
  function ask(G, level) {
    return new Promise(resolve => {
      const job = { st: stateForAI(G), level, resolve };
      const w = getWorker();
      if (!w) return runLocal(job);
      const id = ++reqId;
      pending.set(id, job);
      w.postMessage({ id, st: job.st, level });
    });
  }

  function proceed() {
    const G = app.G;
    if (G.winner !== null || app.human[G.turn]) return;
    app.busy = true;
    render();
    const tk = app.token;
    const t0 = Date.now();
    if (app.tsume) {
      setTimeout(() => {
        if (tk !== app.token || app.G !== G) return;
        const left = app.tsume.n - blackMovesMade();
        const d = app.tsume.solver.bestDefense(G.board.slice(), Math.max(0, left));
        app.busy = false;
        commit(d.move);
        if (app.tsume && app.tsume.failed && app.G.winner === null) setTimeout(() => { if (tk === app.token) tsumeResult('fail'); }, 900);
      }, app.tsume.demo ? 700 : 600);
      return;
    }
    ask(G, app.level).then(m => {
      if (tk !== app.token || app.G !== G) return;
      setTimeout(() => {
        if (tk !== app.token || app.G !== G) return;
        app.busy = false;
        if (m === null || m < 0 || !E.canApply(G, m)) {
          // 置ける ところが ない（ほぼ ない）ときは ひきわけ
          app.G = Object.assign(E.clone(G), { winner: -1, result: 'full' });
          app.states[app.states.length - 1] = app.G;
          render();
          return finish();
        }
        commit(m);
      }, Math.max(0, 500 - (Date.now() - t0)));
    });
  }

  function finish() {
    const G = app.G;
    app.busy = false;
    render();
    if (app.tsume) {
      if (app.tsume.demo) return tsumeDemoEnd();
      return tsumeResult(G.winner === 0 ? 'solved' : 'fail');
    }
    let title, text = '', cls = '';
    const solo = app.mode === 'cpu';
    if (G.winner === -1) {
      title = 'ひきわけ';
      text = 'ばんが いっぱいに なったよ。どちらも 5つ ならべられなかったね。';
    } else {
      const wn = playerName(G.winner), ln = playerName(1 - G.winner);
      const won = solo ? app.human[G.winner] : true;
      title = solo ? (won ? 'かったよ！ おめでとう！' : 'まけちゃった…') : `${wn}（${E.SIDES[G.winner].name}）の かち！`;
      cls = won ? 'win' : 'lose';
      if (G.result === 'five') text = solo ? (won ? '5つ ならんだ！ すごい！' : 'CPU が さきに 5つ ならべたよ。「まった」で もどって やりなおせるよ！') : '5つ ならんだよ！';
      else if (G.result === 'resign') text = solo && !won ? 'こうさん したよ。また ちょうせん してね！' : `${ln}が こうさん したよ。`;
      if (won) { sound('win'); confetti(); } else sound('lose');
    }
    $('result-title').textContent = title;
    $('result-title').className = cls;
    $('result-text').textContent = text;
    $('btn-result-undo').hidden = !canUndo();
    setTimeout(() => { if (!document.querySelector('dialog[open]')) $('dlg-result').showModal(); }, 900);
  }

  // ---------- つめごもく ----------

  function blackMovesMade() {
    let n = 0;
    for (let k = 0; k < app.moves.length; k++) if (app.states[k].turn === 0) n++;
    return n;
  }
  function tsumeStart(idx) {
    const pos = TS.parse(PROBS[idx].rows);
    const s = E.newGame({ size: E.SIZES.includes(pos.size) ? pos.size : 9, rule: 'free' });
    s.board = pos.board;
    return s;
  }
  function startTsume(idx, moves) {
    app.token++;
    app.busy = false;
    app.mode = 'tsume';
    app.human = [true, false];
    const pr = PROBS[idx];
    const pos = TS.parse(pr.rows);
    app.size = pos.size;
    app.tsume = { idx, solver: new TS.Solver(pos.size), n: (pr.moves + 1) / 2, failed: false, demo: false };
    document.body.classList.add('tsume-mode');
    rebuild([]);
    for (const m of moves || []) {
      if (app.G.winner !== null || !E.canApply(app.G, m)) break;
      app.G = E.apply(app.G, m);
      app.states.push(app.G);
      app.moves.push(m);
    }
    // くろの番で、まだ 終わっていない 局面まで もどす
    while (app.moves.length && (app.G.turn === 1 || app.G.winner !== null)) {
      app.moves.pop(); app.states.pop(); app.G = app.states[app.states.length - 1];
    }
    if (app.moves.length) {
      const left = app.tsume.n - blackMovesMade();
      app.tsume.failed = left < 1 || !app.tsume.solver.attack(app.G.board.slice(), left);
    }
    $('kifu').innerHTML = '';
    setupBoard();
    save();
    render();
  }
  const TS_GROUPS = { 1: '五を つくろう', 3: 'いきた四・四四', 5: '三三・四三' };
  function openTsumeList() {
    const done = Object.keys(app.tsumeDone).length;
    let h = `<p class="ts-count">クリア <b>${done}</b> / ${PROBS.length}もん</p>`;
    for (const n of [1, 3, 5]) {
      h += `<h3>${n}手（${TS_GROUPS[n]}）</h3><div class="ts-grid">`;
      PROBS.forEach((p, i) => {
        if (p.moves !== n) return;
        const ok = app.tsumeDone[i];
        h += `<button type="submit" value="${i}" class="ts-btn${ok ? ' done' : ''}${app.tsume && app.tsume.idx === i ? ' cur' : ''}">` +
          `<b>${i + 1}</b><small>${p.title}</small>${ok ? '<i>★</i>' : ''}</button>`;
      });
      h += '</div>';
    }
    $('tsume-list').innerHTML = h;
    $('dlg-tsume').showModal();
  }
  function answerLine(idx) {
    const pr = PROBS[idx];
    const pos = TS.parse(pr.rows);
    return new TS.Solver(pos.size).mainLine(pos.board, (pr.moves + 1) / 2).line;
  }
  function lineHTML(size, line) {
    return line.map((m, k) => `<span class="s${k % 2}">${k % 2 ? '○' : '●'}${E.pointName(size, m)}</span>`).join(' ');
  }
  // kind: 'solved' | 'fail' | 'answer'
  function tsumeResult(kind) {
    const idx = app.tsume.idx, pr = PROBS[idx];
    if (kind === 'solved') {
      app.tsumeDone[idx] = true;
      save();
      sound('win');
      confetti();
    } else if (kind === 'fail') {
      sound('lose');
    }
    const title = { solved: 'せいかい！ おみごと！', fail: 'ざんねん…', answer: `第${idx + 1}問の こたえ` }[kind];
    let h = `<h2 class="${kind === 'solved' ? 'win' : kind === 'fail' ? 'lose' : ''}">${title}</h2>`;
    h += `<p class="ts-sub">第${idx + 1}問「${pr.title}」（${pr.moves}手）</p>`;
    if (kind === 'fail') {
      h += '<p>しろに ふせがれちゃった。「まった」で もどるか、もういちど はじめから やってみよう。どうしても わからない ときは「こたえを みる」を おしてね。</p>';
    } else {
      h += `<div class="ts-answer">こたえ：${lineHTML(app.size, answerLine(idx))}</div><p class="ts-text">${pr.text}</p>`;
      const pos = TS.parse(pr.rows);
      const traps = new TS.Solver(pos.size).traps(pos.board, (pr.moves + 1) / 2);
      if (traps.length) {
        const nm = p => E.pointName(pos.size, p);
        h += '<div class="ts-traps"><b>まちがえやすい 手</b><ul>' +
          traps.map(([a, d]) => `<li><span class="s0">●${nm(a)}</span> → <span class="s1">○${nm(d)}</span> で ふせがれちゃう</li>`).join('') + '</ul></div>';
      }
    }
    const btn = (v, label, cls) => `<button type="submit" value="${v}"${cls ? ` class="${cls}"` : ''}>${label}</button>`;
    let b = '';
    if (kind === 'solved') b = btn('list', 'もんだい いちらん') + (idx + 1 < PROBS.length ? btn('next', 'つぎの もんだい', 'primary') : '');
    else if (kind === 'fail') b = btn('undo', 'まった') + btn('answer', 'こたえを みる') + btn('retry', 'もういちど', 'primary');
    else b = btn('close', 'とじる') + btn('demo', 'こたえを ならべる', 'primary');
    $('tsume-result').innerHTML = h + `<div class="dlg-buttons">${b}</div>`;
    setTimeout(() => {
      if (document.querySelector('dialog[open]')) return;
      $('dlg-tsume-result').showModal();
    }, kind === 'solved' ? 900 : 100);
  }
  function onTsumeResult(v) {
    if (!app.tsume) return;
    const idx = app.tsume.idx;
    if (v === 'next') startTsume(idx + 1, []);
    else if (v === 'list') openTsumeList();
    else if (v === 'retry') startTsume(idx, []);
    else if (v === 'undo') onUndo();
    else if (v === 'answer') tsumeResult('answer');
    else if (v === 'demo') tsumeDemo();
  }
  // こたえを盤に ならべる
  function tsumeDemo() {
    const idx = app.tsume.idx;
    startTsume(idx, []);
    const line = answerLine(idx);
    app.tsume.demo = true;
    app.busy = true;
    render();
    const tk = app.token;
    const step = k => {
      if (tk !== app.token || k >= line.length) return;
      app.busy = false;
      app.human = [true, true]; // 両方とも ここで打つ
      commit(line[k]);
      app.busy = app.G.winner === null;
      render();
      setTimeout(() => step(k + 1), 1100);
    };
    setTimeout(() => step(0), 600);
  }
  function tsumeDemoEnd() {
    app.tsume.demo = false;
    app.human = [true, false];
    render();
    toast('5つ ならんだ！');
  }

  window.GomokuApp = app; // デバッグ用
  document.addEventListener('DOMContentLoaded', init);
})();
