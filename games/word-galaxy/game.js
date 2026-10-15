
class Component extends DCLogic {
  constructor(props) {
    super(props);
    var self = this;
    this.VW = 390; this.VH = 584;
    this.seed = (props && props.seed != null) ? props.seed : 23;
    this.seedText = String(this.seed);
    this.seedMode = false;
    this.onSeedInput = function (e) { self.seedText = e.target.value; self.bump(); };
    this.buildSeed = function () {
      var n = parseInt(String(self.seedText).replace(/[^0-9]/g, ''), 10);
      if (isNaN(n)) { self.say('Type a number as seed.', 'warn'); self.bump(); return; }
      self.reseed(n);
    };
    this.randomSeed = function () { self.seedText = String(Math.floor(Math.random() * 1000000)); self.reseed(+self.seedText); };
    this.MIN_TILE = 40;
    var w = this.world();
    this.state = { ver: 0 };
    this.game = this.newGame();
    this.focus = w.current;
    var start = (props && props.start) || 'field';
    this.cam = this.camFor(start, this.focus);
    this.ptrs = {};
    this.drag = null;
    this._raf = 0; this._anim = 0; this._auto = 0;
    this.canvasRef = function (el) { self.setupCanvas(el); };
    this.onDown = function (e) { self.down(e); };
    this.onMove = function (e) { self.move(e); };
    this.onUp = function (e) { self.up(e); };
    this.onWheel = function (e) { self.wheel(e); };
    this.onMenu = function (e) { if (e.preventDefault) e.preventDefault(); };
    this.clearSel = function () { self.dirtyCells(Object.keys(self.game.sel).map(Number), 1); self.game.sel = {}; self.game.selN = 0; self.draw(); };
    this.accept = function () { self.doAccept(); };
    this.useLight = function () { self.doLight(); };
    this.cancelPick = function () { var pw = self.game.words[self.game.picked]; if (pw) self.dirtyCells(pw.cells, 1); self.game.picked = -1; self.say('', 'info'); self.draw(); self.bump(); };
    this.removePick = function () { self.doRemove(); };
  }

  componentDidUpdate(prev) {
    if (prev.start !== this.props.start && this.props.start) this.flyTo(this.camFor(this.props.start, this.focus));
  }
  componentWillUnmount() {
    if (this._anim) cancelAnimationFrame(this._anim);
    if (this._auto) cancelAnimationFrame(this._auto);
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.drag && this.drag.timer) clearTimeout(this.drag.timer);
  }
  bump() { this.setState({ ver: this.state.ver + 1 }); }
  say(t, kind, title) { this.game.msg = t; this.game.msgKind = kind || 'info'; this.game.msgTitle = title || ''; }

  // a short meaning for a word, for learners
  meaning(word) {
    var d = this.words().defs.get(word);
    if (!d) return { title: word, text: 'No meaning in this little dictionary yet.' };
    var head = word + ' · ' + d[0] + (d[1] ? ', from ' + d[1] : '') + ':';
    return { title: head, text: d[2] + (d[3] ? ' (“' + d[3] + '”)' : '') };
  }

  // ---------- static data ----------
  world() {
    if (this._w) return this._w;
    var DATA = this.generate(this.seed);
    var P = 28, M = 120, N = DATA.N, W = 2 * M + N * P;
    var fields = DATA.fields.map(function (f, i) {
      return { i: i, name: f.name, mods: f.mods, tier: f.tier, state0: f.state, goal: !!f.goal, words: f.words, len: f.len, shape: f.shape,
        cells: [], regions: [], nb: {}, minR: 1e9, maxR: -1, minC: 1e9, maxC: -1 };
    });
    var regions = DATA.regions.map(function (g, i) { return { i: i, f: g[0], found0: !!g[1], colour0: g[2], cells: [] }; });
    var owner = new Int32Array(N * N).fill(-1);
    var cells = DATA.cells.map(function (c, i) {
      var o = { i: i, r: c[0], c: c[1], l: c[2], f: c[3], g: c[4], k: c[5], flags: c[6], x: M + c[1] * P, y: M + c[0] * P };
      owner[o.r * N + o.c] = i;
      var f = fields[o.f];
      f.cells.push(i);
      if (o.r < f.minR) f.minR = o.r; if (o.r > f.maxR) f.maxR = o.r;
      if (o.c < f.minC) f.minC = o.c; if (o.c > f.maxC) f.maxC = o.c;
      regions[o.g].cells[o.k] = i;
      return o;
    });
    regions.forEach(function (g) { fields[g.f].regions.push(g.i); });
    function at(r, c) { return r < 0 || c < 0 || r >= N || c >= N ? -1 : owner[r * N + c]; }
    cells.forEach(function (o) {
      o.nb = [at(o.r - 1, o.c), at(o.r, o.c + 1), at(o.r + 1, o.c), at(o.r, o.c - 1)];
      for (var s = 1; s <= 2; s++) {
        var j = o.nb[s];
        if (j >= 0 && cells[j] && cells[j].f !== o.f) { fields[o.f].nb[cells[j].f] = 1; fields[cells[j].f].nb[o.f] = 1; }
      }
    });
    cells.forEach(function (o) {
      for (var s = 1; s <= 2; s++) {
        var j = o.nb[s];
        if (j >= 0 && cells[j].f !== o.f) { fields[o.f].nb[cells[j].f] = 1; fields[cells[j].f].nb[o.f] = 1; }
      }
    });
    function mix(a, b, t) {
      var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); });
      var pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
      return '#' + pa.map(function (v, i) { var x = Math.round(v + (pb[i] - v) * t); return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    }
    fields.forEach(function (f) {
      f.nbList = Object.keys(f.nb).map(Number);
      f.x0 = M + f.minC * P; f.x1 = M + (f.maxC + 1) * P;
      f.y0 = M + f.minR * P; f.y1 = M + (f.maxR + 1) * P;
      var t = Math.min(1, Math.hypot((f.minC + f.maxC) / 2 - N / 2, (f.minR + f.maxR) / 2 - N / 2) / (N / 2));
      f.lockBg = mix('#5a3f86', '#1b2552', t);
      f.lockFg = mix(f.lockBg, '#c0c6e8', 0.45);
    });
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var stars = [];
    for (var i = 0; i < 420; i++) stars.push([rnd() * W, rnd() * W, 0.6 + rnd() * 1.4, 0.2 + rnd() * 0.7]);
    var dict = this.words().dict;
    this._w = { fields: fields, regions: regions, cells: cells, owner: owner, at: at, stars: stars, dict: dict, current: DATA.current, N: N, P: P, M: M, W: W };
    return this._w;
  }

  // ---------- word data (built once) ----------
  words() {
    if (this._words) return this._words;
    var WD = window.WORDS;
    var list = WD.dict.split(' '), lv = WD.lv;
    var dict = new Set(list), defs = new Map();
    WD.defs.split('\n').forEach(function (line) {
      var p = line.split('\t');
      defs.set(p[0], [p[1], p[2], p[3], p[4]]);
    });
    // pools by frequency level; only words with a meaning, so learners can always look them up
    function pool(test) {
      var byLen = {};
      for (var i = 0; i < list.length; i++) {
        if (!test(lv.charCodeAt(i) - 48) || !defs.has(list[i])) continue;
        var L = list[i].length;
        (byLen[L] || (byLen[L] = [])).push(list[i]);
      }
      return byLen;
    }
    var space = {};
    WD.space.split(' ').forEach(function (w) { (space[w.length] || (space[w.length] = [])).push(w); });
    this._words = {
      dict: dict, defs: defs, N: WD.N, mask: WD.mask,
      pools: {
        easy: pool(function (l) { return l === 1; }),
        mid: pool(function (l) { return l <= 2; }),
        hard: pool(function (l) { return l >= 2 && l <= 4; }),
        space: space
      }
    };
    return this._words;
  }

  // ---------- the galaxy generator: the same seed always gives the same galaxy ----------
  // Only integer maths, Math.sqrt and stable sorts with fixed comparators, so every browser agrees.
  generate(seedIn) {
    var WDS = this.words();
    var seed = ((Math.floor(Math.abs(seedIn)) % 2147483646) + 1);
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    function K(r, c) { return r * 1000 + c; }
    var N = WDS.N, MID = N / 2;
    var POOL = WDS.pools;
    var used = new Set();
    function word(len, pools) {
      for (var p = 0; p < pools.length; p++) {
        var arr = pools[p][len];
        if (!arr) continue;
        var c = arr.filter(function (w) { return !used.has(w); });
        if (c.length) { var w = pick(c); used.add(w); return w; }
      }
      throw new Error('no word of length ' + len);
    }
    function distOf(r, c) { var dx = (c + 0.5) / N * 13 - 6.5, dy = (r + 0.5) / N * 13 - 6.5; return Math.sqrt(dx * dx + dy * dy); }

    // galaxy shape
    var mask = [], owner = [], r, c;
    for (r = 0; r < N; r++) { mask.push([]); owner.push([]); for (c = 0; c < N; c++) { mask[r].push(WDS.mask.charCodeAt(r * N + c) === 49); owner[r].push(-1); } }
    function own(rr, cc) { return rr < 0 || cc < 0 || rr >= N || cc >= N ? undefined : owner[rr][cc]; }
    var fields = [];
    function place(r0, c0, h, w) {
      var rr, cc;
      for (rr = r0; rr < r0 + h; rr++) for (cc = c0; cc < c0 + w; cc++) if (rr >= N || cc >= N || !mask[rr][cc] || owner[rr][cc] !== -1) return false;
      var id = fields.length, cells = [];
      for (rr = r0; rr < r0 + h; rr++) for (cc = c0; cc < c0 + w; cc++) { owner[rr][cc] = id; cells.push([rr, cc]); }
      fields.push({ id: id, cells: cells });
      return true;
    }
    place(MID - 6, MID - 6, 12, 12); // the core
    var SIZES = {
      1: [[5, 6], [6, 5], [6, 6], [5, 7]],
      2: [[7, 6], [6, 7], [7, 7], [8, 6]],
      3: [[8, 6], [9, 6], [8, 7], [6, 8], [7, 7]],
      4: [[12, 7], [12, 7], [11, 8], [10, 8], [7, 12], [9, 9]],
      5: [[14, 8], [13, 9], [12, 10], [8, 14], [11, 11]]
    };
    function tierAt(d) { return d < 2.9 ? 5 : d < 4.4 ? 4 : d < 5.2 ? 3 : d < 5.8 ? 2 : 1; }
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      if (!mask[r][c] || owner[r][c] !== -1) continue;
      var t = tierAt(distOf(r, c));
      var tries = shuffle(SIZES[t].slice());
      if (t > 1) tries = tries.concat(shuffle(SIZES[t - 1].slice()));
      if (t > 2) tries = tries.concat(SIZES[t - 2]);
      tries = tries.concat([[6, 6], [5, 7], [7, 5], [5, 6], [6, 5], [5, 5]]);
      for (var q = 0; q < tries.length; q++) if (place(r, c, tries[q][0], tries[q][1])) break;
    }
    var D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // leftovers join the smallest touching field
    for (var pass = 0; pass < 20; pass++) {
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
        if (!mask[r][c] || owner[r][c] !== -1) continue;
        var best = -1;
        for (q = 0; q < 4; q++) {
          var o = own(r + D4[q][0], c + D4[q][1]);
          if (o > 0 && (best < 0 || fields[o].cells.length < fields[best].cells.length)) best = o;
        }
        if (best >= 0) { owner[r][c] = best; fields[best].cells.push([r, c]); }
      }
    }
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) if (owner[r][c] === -1) mask[r][c] = false;
    // tiny fields merge into a neighbour
    fields.forEach(function (f) {
      if (f.id === 0 || !f.cells.length || f.cells.length >= 26) return;
      var touch = [];
      f.cells.forEach(function (x) {
        for (var k = 0; k < 4; k++) {
          var o2 = own(x[0] + D4[k][0], x[1] + D4[k][1]);
          if (o2 !== undefined && o2 > 0 && o2 !== f.id && fields[o2].cells.length && touch.indexOf(o2) < 0) touch.push(o2);
        }
      });
      touch.sort(function (a, b) { return fields[a].cells.length - fields[b].cells.length; });
      if (!touch.length) return;
      var g = fields[touch[0]];
      f.cells.forEach(function (x) { owner[x[0]][x[1]] = g.id; g.cells.push(x); });
      f.cells = [];
    });
    fields = fields.filter(function (f) { return f.cells.length; });
    fields.forEach(function (f, i) { f.id = i; f.cells.forEach(function (x) { owner[x[0]][x[1]] = i; }); });

    // field settings
    var NAMES = ['Vega','Altair','Deneb','Rigel','Sirius','Lyra','Mira','Castor','Pollux','Spica','Antares','Capella','Electra','Maia','Nashira','Polaris','Sadr','Wezen','Zaurak','Alcor','Mizar','Hadar','Izar','Kochab','Arcturus','Bellatrix','Rana','Okul','Tarazed','Mintaka','Alnilam','Saiph','Aldebaran','Regulus','Fomalhaut','Achernar','Canopus','Procyon','Betelgeuse','Algol','Shaula','Atria','Avior','Menkar','Diphda','Hamal','Merak','Dubhe','Phecda','Alioth','Thuban','Kaus','Nunki','Albireo','Enif','Markab','Scheat','Alpheratz','Mirach','Almach','Caph','Schedar','Ruchbah','Talitha','Tania','Alula','Chara','Muphrid','Nekkar','Seginus','Alphecca','Unuk','Sabik','Yed','Eltanin','Rastaban','Sheliak','Sulafat','Porrima','Zavijava','Denebola','Chertan','Algieba','Adhafera','Alterf','Acubens','Tegmine','Wasat','Mebsuta','Alhena','Tejat','Propus','Elnath','Alcyone','Atlas','Merope','Taygeta','Celaeno','Sterope','Pleione'];
    var nameOff = Math.floor(rnd() * NAMES.length);
    fields.forEach(function (f, i) {
      var sr = 0, sc = 0;
      f.cells.forEach(function (x) { sr += x[0]; sc += x[1]; });
      f.r = sr / f.cells.length; f.c = sc / f.cells.length;
      f.dist = distOf(f.r, f.c);
      f.name = i === 0 ? 'Galactic Core' : NAMES[(i * 37 + nameOff) % NAMES.length];
      f.mods = [];
      if (i === 0) { f.tier = 6; f.len = [6, 14]; f.pools = [POOL.space, POOL.hard]; f.mods.push('THEME'); return; }
      var n = f.cells.length;
      f.tier = Math.max(tierAt(f.dist), n >= 46 ? 2 : 1, n >= 56 ? 3 : 1, n >= 80 ? 4 : 1, n >= 110 ? 5 : 1);
      rnd();
      if (f.tier === 1) { f.len = [4, 5]; f.pools = [POOL.easy]; if (rnd() < 0.6) f.mods.push('GIFT'); }
      if (f.tier === 2) { f.len = [4, 6]; f.pools = [POOL.easy, POOL.mid]; if (rnd() < 0.4) f.mods.push('GIFT'); }
      if (f.tier === 3) { f.len = [4, 7]; f.pools = [POOL.easy, POOL.mid]; if (rnd() < 0.2) f.mods.push('GIFT'); }
      if (f.tier === 4) { f.len = [4, 10]; f.pools = [POOL.mid, POOL.hard]; if (rnd() < 0.3) f.mods.push('STAR'); }
      if (f.tier === 5) { f.len = [5, 12]; f.pools = [POOL.hard, POOL.mid]; if (rnd() < 0.3) f.mods.push('STAR'); }
      if (f.tier >= 4 && rnd() < 0.12) { f.mods.push('THEME'); f.pools = [POOL.space].concat(f.pools); }
    });

    // cut each field into word shapes
    function partition(f, lo, hi) {
      var order = f.cells.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      var free = new Set(order.map(function (x) { return K(x[0], x[1]); }));
      var out = [], budget = 60000;
      function nb(p) {
        var res = [];
        for (var k = 0; k < 4; k++) { var y = p[0] + D4[k][0], x = p[1] + D4[k][1]; if (free.has(K(y, x))) res.push([y, x]); }
        return res;
      }
      function restOk() {
        var seen = new Set();
        var ok = true;
        free.forEach(function (k) {
          if (!ok || seen.has(k)) return;
          var n = 0, st = [k]; seen.add(k);
          while (st.length) {
            var cur = st.pop(); n++;
            var ns = nb([Math.floor(cur / 1000), cur % 1000]);
            for (var m = 0; m < ns.length; m++) { var kk = K(ns[m][0], ns[m][1]); if (!seen.has(kk)) { seen.add(kk); st.push(kk); } }
          }
          if (n < lo) ok = false;
        });
        return ok;
      }
      function shape(start, L) {
        var inS = new Set([K(start[0], start[1])]), S = [start];
        var style = pick(['spread', 'spread', 'snake', 'compact']);
        while (S.length < L) {
          var fr = [], tot = 0;
          for (var a = 0; a < S.length; a++) {
            var ns = nb(S[a]);
            for (var b = 0; b < ns.length; b++) {
              var qq = ns[b], k = K(qq[0], qq[1]);
              if (inS.has(k)) continue;
              var touching = 0;
              for (var d = 0; d < 4; d++) if (inS.has(K(qq[0] + D4[d][0], qq[1] + D4[d][1]))) touching++;
              var far = Math.abs(qq[0] - start[0]) + Math.abs(qq[1] - start[1]);
              var wt = 1;
              if (style === 'spread') wt = (1 + far) * (touching === 1 ? 3 : 0.4);
              if (style === 'snake') wt = touching === 1 ? 4 + far : 0.2;
              if (style === 'compact') wt = touching * touching;
              fr.push([qq, wt]); tot += wt;
            }
          }
          if (!fr.length) return null;
          var x = rnd() * tot, pickq = fr[0][0];
          for (var e = 0; e < fr.length; e++) { x -= fr[e][1]; if (x <= 0) { pickq = fr[e][0]; break; } }
          S.push(pickq); inS.add(K(pickq[0], pickq[1]));
        }
        return S;
      }
      function go() {
        if (--budget < 0) return false;
        if (!free.size) return true;
        var start = null;
        for (var i = 0; i < order.length; i++) if (free.has(K(order[i][0], order[i][1]))) { start = order[i]; break; }
        var lens = [];
        for (var L0 = lo; L0 <= hi; L0++) lens.push(L0);
        shuffle(lens);
        // favour longer words most of the time (keys drawn first, so the sort itself never calls rnd)
        var keyed = lens.map(function (L) { return [L, rnd() < 0.6 ? -L : L]; });
        keyed.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
        for (var j = 0; j < keyed.length; j++) {
          var L = keyed[j][0];
          if (L > free.size) continue;
          for (var tt = 0; tt < 5; tt++) {
            var reg = shape(start, L);
            if (!reg) continue;
            reg.forEach(function (p) { free.delete(K(p[0], p[1])); });
            if (restOk()) {
              out.push(reg);
              if (go()) return true;
              out.pop();
            }
            reg.forEach(function (p) { free.add(K(p[0], p[1])); });
            if (budget < 0) return false;
          }
        }
        return false;
      }
      return go() ? out : null;
    }
    fields.forEach(function (f) {
      var regs = null, a;
      for (a = 0; a < 12 && !regs; a++) regs = partition(f, f.len[0], f.len[1]);
      if (!regs && f.len[0] > 4) { f.len[0] = 4; for (a = 0; a < 12 && !regs; a++) regs = partition(f, 4, f.len[1]); }
      if (!regs) { f.len[1] += 2; for (a = 0; a < 12 && !regs; a++) regs = partition(f, 4, f.len[1]); }
      if (!regs) throw new Error('could not split field ' + f.id);
      var mn = 99, mx = 0;
      f.regions = regs.map(function (reg) {
        var ord = reg.slice().sort(function (a2, b2) { return a2[0] - b2[0] || a2[1] - b2[1]; });
        if (ord.length < mn) mn = ord.length; if (ord.length > mx) mx = ord.length;
        return { cells: ord, word: word(ord.length, f.pools) };
      });
      f.len = [mn, mx];
    });

    // start: a very easy field at the tip of an arm; everything else locked
    function isRect(f) {
      var r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
      f.cells.forEach(function (x) { r0 = Math.min(r0, x[0]); r1 = Math.max(r1, x[0]); c0 = Math.min(c0, x[1]); c1 = Math.max(c1, x[1]); });
      return f.cells.length === (r1 - r0 + 1) * (c1 - c0 + 1) ? 1 : 0;
    }
    var startCands = fields.filter(function (f) { return f.tier === 1 && f.r > MID; });
    if (!startCands.length) startCands = fields.filter(function (f) { return f.tier === 1; });
    startCands.sort(function (a, b) { return (isRect(b) - isRect(a)) || (b.dist - a.dist) || (a.id - b.id); });
    var current = startCands[0].id;

    var regions = [], cellReg = {};
    fields.forEach(function (f) {
      var gift = f.id === current && f.mods.indexOf('GIFT') >= 0 ? pick(f.regions) : null;
      if (f.mods.indexOf('STAR') >= 0) { var sc0 = pick(pick(f.regions).cells); f.star = K(sc0[0], sc0[1]); }
      f.regions.forEach(function (reg) {
        var gi = regions.length;
        regions.push([f.id, reg === gift ? 1 : 0, -1]);
        reg.cells.forEach(function (x, i) { cellReg[K(x[0], x[1])] = [gi, i, reg.word[i]]; });
      });
    });
    var cells = [];
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      var o3 = owner[r][c]; if (o3 < 0) continue;
      var fl = 0;
      var dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
      for (var bit = 0; bit < 4; bit++) { if (own(r + dirs[bit][0], c + dirs[bit][1]) !== o3) fl |= 1 << bit; }
      if (fields[o3].star === K(r, c)) fl |= 16;
      var cr = cellReg[K(r, c)];
      cells.push([r, c, cr[2], o3, cr[0], cr[1], fl]);
    }
    return {
      N: N, current: current, cells: cells, regions: regions,
      fields: fields.map(function (f) {
        return { name: f.name, mods: f.mods, tier: f.tier, state: f.id === current ? 'O' : 'L', goal: f.id === 0 ? 1 : 0, words: f.regions.length, len: f.len, shape: '' };
      })
    };
  }

  reseed(n) {
    var self = this;
    this.seedText = String(n);
    this.say('Building galaxy ' + n + '…', 'info');
    this.bump();
    setTimeout(function () {
      var old = { w: self._w, seed: self.seed, game: self.game, focus: self.focus };
      try {
        self.seed = n; self._w = null; self._grp = null; self.fx = null;
        self.world();
        self.newGame();
        self.focus = self.world().current;
        self.dirtyAll();
        self.seedMode = false;
        self.say('Galaxy ' + n + ' is ready. Swipe over letters to select a word, then tap Accept.', 'good');
        self.cam = self.camFor('galaxy', self.focus);
        self.paint(); self.bump();
        self.flyTo(self.camFor('field', self.focus));
      } catch (err) {
        self._w = old.w; self.seed = old.seed; self.game = old.game; self.focus = old.focus;
        self.say('Seed ' + n + ' did not work (' + err.message + '). Try another one.', 'warn');
        self.bump();
      }
    }, 30);
  }

  newGame() {
    var w = this.world();
    var g = {
      words: [], cellWord: new Int32Array(w.cells.length).fill(-1),
      state: w.fields.map(function (f) { return f.state0; }),
      sel: {}, selN: 0, picked: -1,
      used: w.fields.map(function () { return 0; }),
      hints: w.fields.map(function () { return []; }),
      wrongMarked: {},
      msg: 'Swipe over letters to select a word, then tap Accept.', msgKind: 'info'
    };
    this.game = g;
    var self = this;
    w.regions.forEach(function (r) { if (r.found0) self.addWord(r.cells.slice(), r.colour0 >= 0 ? r.colour0 : self.pickColour(r.cells), true); });
    this.recalcLit();
    return g;
  }

  addWord(cells, colour, correct) {
    var w = this.world(), g = this.game;
    var id = g.words.length;
    var word = cells.map(function (j) { return w.cells[j].l; }).join('');
    g.words.push({ id: id, cells: cells, word: word, colour: colour, correct: correct, alive: true, f: w.cells[cells[0]].f });
    cells.forEach(function (j) { g.cellWord[j] = id; });
    return id;
  }

  // ---------- camera ----------
  galaxyScale() { return Math.min(this.VW, this.VH) / this.world().W; }
  camFor(kind, fi) {
    var w = this.world(), f = w.fields[fi], VW = this.VW, VH = this.VH;
    var cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    if (kind === 'galaxy') return { x: w.W / 2, y: w.W / 2, s: this.galaxyScale() * 0.98 };
    if (kind === 'area') return { x: cx, y: cy, s: 9 / w.P };
    var fw = f.x1 - f.x0, fh = f.y1 - f.y0;
    var s = Math.min((VW - 28) / fw, (VH - 28) / fh, 2.4);
    // the whole field fits with letters of 32 px or more: show it all; else use 40 px letters and pan
    if (s * w.P < 32) s = this.MIN_TILE / w.P;
    var x = cx, y = cy;
    // too big to fit: start at the top left, where reading starts
    if (fw * s > VW - 28) x = f.x0 - 14 / s + VW / 2 / s;
    if (fh * s > VH - 28) y = f.y0 - 14 / s + VH / 2 / s;
    return { x: x, y: y, s: s };
  }
  // the whole field, centred, even if letters get smaller than usual
  camFit(fi) {
    var f = this.world().fields[fi], fw = f.x1 - f.x0, fh = f.y1 - f.y0;
    var s = Math.min((this.VW - 36) / fw, (this.VH - 36) / fh, 2.4);
    return { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, s: s };
  }
  fieldScale(fi) { return this.camFor('field', fi).s; }
  clampCam() {
    var W = this.world().W, c = this.cam;
    c.s = Math.max(this.galaxyScale() * 0.8, Math.min(3, c.s));
    c.x = Math.max(0, Math.min(W, c.x));
    c.y = Math.max(0, Math.min(W, c.y));
  }
  flyTo(target, done) {
    var self = this, a = { x: this.cam.x, y: this.cam.y, s: this.cam.s }, b = target;
    if (this._anim) cancelAnimationFrame(this._anim);
    var dist = Math.hypot(b.x - a.x, b.y - a.y);
    var bump = Math.max(0, Math.log(dist * Math.min(a.s, b.s) / this.VW)) * 0.9;
    var dur = 650 + Math.min(900, 220 * (Math.abs(Math.log(b.s / a.s)) + bump));
    var t0 = null;
    function step(now) {
      if (t0 === null) t0 = now;
      var k = Math.min(1, (now - t0) / dur);
      var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      var ls = Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e - bump * Math.sin(Math.PI * e);
      self.cam = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, s: Math.exp(ls) };
      self.moved();
      if (k < 1) self._anim = requestAnimationFrame(step);
      else { self._anim = 0; if (done) done(); }
    }
    this._anim = requestAnimationFrame(step);
  }
  toWorld(px, py) { var c = this.cam; return { x: (px - this.VW / 2) / c.s + c.x, y: (py - this.VH / 2) / c.s + c.y }; }

  // ---------- drawing ----------
  setupCanvas(el) {
    if (!el || el === this._cv) return;
    this._cv = el;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    // 2x is sharp enough for these letters, and far fewer pixels to move than 2.6x or 3x
    this.dprFull = Math.min(2, dpr);
    // while the view moves, draw at 1x: a quarter of the pixels, and nobody sees fine detail in motion
    this.dprMove = Math.min(1, this.dprFull);
    this.dpr = this.moving ? this.dprMove : this.dprFull;
    el.width = Math.round(this.VW * this.dpr);
    el.height = Math.round(this.VH * this.dpr);
    this.ctx = el.getContext('2d', { alpha: false });
    var self = this;
    this.dirtyAll();
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self.dirtyAll(); });
  }
  draw() { this.paint(); }
  // called on every camera change; the sharp redraw comes when the view stands still
  moved() {
    var self = this;
    if (!this.moving && this._cv) {
      this.moving = true;
      this.dpr = this.dprMove;
      this._cv.width = Math.round(this.VW * this.dpr); this._cv.height = Math.round(this.VH * this.dpr);
    }
    if (this._idle) clearTimeout(this._idle);
    this._idle = setTimeout(function () {
      self._idle = 0; self.moving = false;
      if (!self._cv) return;
      self.dpr = self.dprFull;
      self._cv.width = Math.round(self.VW * self.dpr); self._cv.height = Math.round(self.VH * self.dpr);
      self.paint();
    }, 160);
    this.paint();
  }
  paint() {
    var self = this;
    if (this._raf || !this.ctx) return;
    this._raf = requestAnimationFrame(function () { self._raf = 0; self.render(); });
  }

  recalcLit() {
    var w = this.world(), g = this.game, lit = new Uint8Array(w.cells.length);
    w.fields.forEach(function (f) {
      if (g.state[f.i] !== 'O') return;
      f.cells.forEach(function (j) {
        var o = w.cells[j];
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          if (Math.abs(dy) + Math.abs(dx) > 2) continue;
          var q = w.at(o.r + dy, o.c + dx);
          if (q >= 0 && w.cells[q].f !== f.i && g.state[w.cells[q].f] === 'S') { lit[j] = 1; return; }
        }
      });
    });
    this.lit = lit;
    // edges where an open field touches a solved one: light shines in from here
    var glow = [];
    w.fields.forEach(function (f) {
      if (g.state[f.i] !== 'O') return;
      f.cells.forEach(function (j) {
        var o = w.cells[j];
        for (var k = 0; k < 4; k++) { var q = o.nb[k]; if (q >= 0 && w.cells[q].f !== f.i && g.state[w.cells[q].f] === 'S') glow.push([j, k]); }
      });
    });
    this.glow = glow;
    this.dirtyAll();
  }

  render() {
    var ctx = this.ctx, w = this.world(), c = this.cam, VW = this.VW, VH = this.VH, dpr = this.dpr;
    var DW = Math.round(VW * dpr), DH = Math.round(VH * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, DW, DH);
    var s = c.s, ox = VW / 2 - c.x * s, oy = VH / 2 - c.y * s;
    var sd = s * dpr, oxd = ox * dpr, oyd = oy * dpr;
    // stars: cheap, drawn every frame (the glow of the core is part of the cached tiles)
    ctx.fillStyle = '#dfe6ff';
    for (var i = 0; i < w.stars.length; i++) {
      var st = w.stars[i], sx = st[0] * sd + oxd, sy = st[1] * sd + oyd;
      if (sx < -8 || sy < -8 || sx > DW + 8 || sy > DH + 8) continue;
      ctx.globalAlpha = st[3];
      var d = Math.max(dpr, st[2] * dpr * Math.min(2, s * 4));
      ctx.fillRect(sx, sy, d, d);
    }
    ctx.globalAlpha = 1;
    // the letters: copied from cached tiles
    this.drawTiles(ctx, sd, oxd, oyd, DW, DH);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.renderOverlay(ox, oy, s);
    if (this.fx) this.renderFx(ox, oy, s);
  }

  // ---------- tile cache: the world is drawn once per zoom level into 256 px images ----------
  dirtyAll() {
    var self = this;
    this._ver = (this._ver || 0) + 1;
    if (this.tiles) this.tiles.forEach(function (tl) { if (tl.cv) self.spare.push(tl.cv); });
    this.tiles = new Map();
    this.spare = this.spare || [];
    this.paint();
  }
  dirtyRect(x0, y0, x1, y1) {
    this._ver = (this._ver || 0) + 1;
    if (!this.tiles) return;
    var self = this, del = [];
    this.tiles.forEach(function (tl, key) { if (tl.x0 < x1 && tl.x1 > x0 && tl.y0 < y1 && tl.y1 > y0) del.push(key); });
    del.forEach(function (key) { var tl = self.tiles.get(key); if (tl.cv) self.spare.push(tl.cv); self.tiles.delete(key); });
    this.paint();
  }
  dirtyCells(list, margin) {
    if (!list || !list.length) return;
    var w = this.world(), P = w.P, m = (margin || 0) * P + 6;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    list.forEach(function (j) { var o = w.cells[j]; if (!o) return; x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + P); y1 = Math.max(y1, o.y + P); });
    this.dirtyRect(x0 - m, y0 - m, x1 + m, y1 + m);
  }
  dirtyField(fi) {
    var f = this.world().fields[fi];
    if (f) this.dirtyRect(f.x0 - 34, f.y0 - 34, f.x1 + 34, f.y1 + 34);
  }

  tileCanvas() {
    var cv = this.spare && this.spare.pop();
    if (!cv) { cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; }
    return cv;
  }

  // draws the needed tiles; renders missing ones within a time budget, else uses a coarser or finer level for now
  drawTiles(ctx, sd, oxd, oyd, DW, DH) {
    if (!this.tiles) this.dirtyAll();
    var w = this.world(), TS = 256, self = this;
    var k = Math.max(-6, Math.min(3, Math.round(Math.log(sd) / Math.LN2)));
    var frame = (this._frame = (this._frame || 0) + 1);
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var budget = 6, missing = false;
    function tw(kk) { return TS / Math.pow(2, kk); }
    function get(kk, tx, ty, make) {
      var key = self.dpr + ':' + kk + ':' + tx + ':' + ty, tl = self.tiles.get(key);
      if (tl) { tl.used = frame; return tl; }
      if (!make) return null;
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - t0 > budget) return null;
      tl = self.renderTile(kk, tx, ty);
      tl.used = frame;
      self.tiles.set(key, tl);
      return tl;
    }
    function blit(tl, sx, sy, sw, sh, wx0, wy0, wx1, wy1) {
      if (!tl.cv) return;
      var dx0 = Math.round(wx0 * sd + oxd), dy0 = Math.round(wy0 * sd + oyd);
      var dx1 = Math.round(wx1 * sd + oxd), dy1 = Math.round(wy1 * sd + oyd);
      if (dx1 <= dx0 || dy1 <= dy0) return;
      ctx.drawImage(tl.cv, sx, sy, sw, sh, dx0, dy0, dx1 - dx0, dy1 - dy0);
    }
    var T = tw(k);
    var wx0 = (-oxd) / sd, wy0 = (-oyd) / sd, wx1 = (DW - oxd) / sd, wy1 = (DH - oyd) / sd;
    var tx0 = Math.max(0, Math.floor(wx0 / T)), ty0 = Math.max(0, Math.floor(wy0 / T));
    var tx1 = Math.min(Math.floor(w.W / T), Math.floor(wx1 / T)), ty1 = Math.min(Math.floor(w.W / T), Math.floor(wy1 / T));
    // draw the tiles nearest the screen centre first
    var list = [];
    for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) list.push([tx, ty]);
    var cx = (wx0 + wx1) / 2 / T, cy = (wy0 + wy1) / 2 / T;
    list.sort(function (a, b) { return Math.abs(a[0] + 0.5 - cx) + Math.abs(a[1] + 0.5 - cy) - (Math.abs(b[0] + 0.5 - cx) + Math.abs(b[1] + 0.5 - cy)); });
    list.forEach(function (q) {
      var tx = q[0], ty = q[1];
      var tl = get(k, tx, ty, true);
      var ax = tx * T, ay = ty * T;
      if (tl) { blit(tl, 0, 0, TS, TS, ax, ay, ax + T, ay + T); return; }
      missing = true;
      // coarser level: one quarter of its tile
      var up = get(k - 1, tx >> 1, ty >> 1, false);
      if (up) { var h = TS / 2; blit(up, (tx & 1) * h, (ty & 1) * h, h, h, ax, ay, ax + T, ay + T); return; }
      // finer level: four tiles
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        var dn = get(k + 1, tx * 2 + dx, ty * 2 + dy, false);
        if (dn) blit(dn, 0, 0, TS, TS, ax + dx * T / 2, ay + dy * T / 2, ax + (dx + 1) * T / 2, ay + (dy + 1) * T / 2);
      }
    });
    if (missing) this.paint();
    // keep memory bounded: drop tiles not used for a while
    if (this.tiles.size > 180) {
      var arr = [];
      this.tiles.forEach(function (tl, key) { arr.push([tl.used, key]); });
      arr.sort(function (a, b) { return a[0] - b[0]; });
      for (var i = 0; i < arr.length - 140; i++) { var old = this.tiles.get(arr[i][1]); if (old.cv) this.spare.push(old.cv); this.tiles.delete(arr[i][1]); }
      if (this.spare.length > 40) this.spare.length = 40;
    }
  }

  renderTile(k, tx, ty) {
    var w = this.world(), TS = 256, S = Math.pow(2, k), T = TS / S;
    var x0 = tx * T, y0 = ty * T, x1 = x0 + T, y1 = y0 + T;
    var tl = { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2, cv: null };
    // empty space: nothing to draw
    var P = w.P, M = w.M;
    var c0 = Math.max(0, Math.floor((x0 - M) / P) - 2), c1 = Math.min(w.N - 1, Math.floor((x1 - M) / P) + 2);
    var r0 = Math.max(0, Math.floor((y0 - M) / P) - 2), r1 = Math.min(w.N - 1, Math.floor((y1 - M) / P) + 2);
    var CX = w.W / 2, GR = 900;
    var nx = Math.max(x0, Math.min(CX, x1)), ny = Math.max(y0, Math.min(CX, y1));
    var inGlow = (nx - CX) * (nx - CX) + (ny - CX) * (ny - CX) < GR * GR;
    var any = inGlow;
    for (var r = r0; r <= r1 && !any; r++) for (var c = c0; c <= c1; c++) if (w.owner[r * w.N + c] >= 0) { any = true; break; }
    if (!any) return tl;
    var cv = this.tileCanvas(), ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TS, TS);
    if (inGlow) {
      var gx = (CX - x0) * S, gy = (CX - y0) * S;
      var grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, GR * S);
      grad.addColorStop(0, 'rgba(242,192,99,0.28)'); grad.addColorStop(1, 'rgba(242,192,99,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, TS, TS);
    }
    this.drawWorld(ctx, S, -x0 * S, -y0 * S, TS, TS, this.dpr || 1);
    tl.cv = cv;
    return tl;
  }

  // draws letters, words, glow, outlines and hints; s and ox/oy are in the target's pixels, px is pixels per CSS pixel
  drawWorld(ctx, s, ox, oy, VW, VH, px) {
    var w = this.world(), g = this.game, P = w.P, i;
    var COLORS = ['#9cc9ea', '#f4b26b', '#bfe08f', '#dcb0e6', '#f29b9b', '#7fd1c1'];
    var tile = P * s, tileCss = tile / px;
    var fine = tileCss >= 6, text = tileCss >= 10;
    var grp = this._grp || (this._grp = new Int32Array(w.cells.length));
    if (this._grpVer !== this._ver) { for (i = 0; i < w.cells.length; i++) grp[i] = g.cellWord[i] >= 0 ? g.cellWord[i] + 1 : (g.sel[i] ? -2 : 0); this._grpVer = this._ver; }
    if (text) { ctx.font = '800 ' + (tile * 0.5).toFixed(1) + 'px Archivo, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }
    // starlight glow, drawn under the tiles: it shines through the gaps between letters
    if (fine) {
      var depth = tile * 1.8;
      for (i = 0; i < this.glow.length; i++) {
        var gj = this.glow[i], go = w.cells[gj[0]], gx0 = go.x * s + ox, gy0 = go.y * s + oy, k2 = gj[1];
        if (gx0 > VW + depth || gy0 > VH + depth || gx0 + tile < -depth || gy0 + tile < -depth) continue;
        var lg, rx0, ry0, rw0, rh0;
        if (k2 === 0) { lg = ctx.createLinearGradient(0, gy0, 0, gy0 + depth); rx0 = gx0; ry0 = gy0; rw0 = tile; rh0 = depth; }
        if (k2 === 2) { lg = ctx.createLinearGradient(0, gy0 + tile, 0, gy0 + tile - depth); rx0 = gx0; ry0 = gy0 + tile - depth; rw0 = tile; rh0 = depth; }
        if (k2 === 3) { lg = ctx.createLinearGradient(gx0, 0, gx0 + depth, 0); rx0 = gx0; ry0 = gy0; rw0 = depth; rh0 = tile; }
        if (k2 === 1) { lg = ctx.createLinearGradient(gx0 + tile, 0, gx0 + tile - depth, 0); rx0 = gx0 + tile - depth; ry0 = gy0; rw0 = depth; rh0 = tile; }
        lg.addColorStop(0, 'rgba(255,200,95,0.95)'); lg.addColorStop(1, 'rgba(255,200,95,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(rx0, ry0, rw0, rh0);
      }
    }
    var lit = this.lit;
    for (i = 0; i < w.cells.length; i++) {
      var o = w.cells[i];
      var x = o.x * s + ox, y = o.y * s + oy;
      if (x > VW || y > VH || x + tile < 0 || y + tile < 0) continue;
      var f = w.fields[o.f], fst = g.state[o.f], wid = g.cellWord[i], sel = !!g.sel[i];
      var bg, fg = '#1d2433';
      if (wid >= 0) bg = COLORS[g.words[wid].colour % COLORS.length];
      else if (sel) { bg = '#25327f'; fg = '#ffffff'; }
      else if (fst === 'O') bg = '#f4efe4';
      else if (f.goal) { bg = '#f2c063'; fg = '#3a2806'; }
      else { bg = f.lockBg; fg = f.lockFg; }
      ctx.fillStyle = bg;
      if (!fine) { ctx.fillRect(x, y, tile + 0.3, tile + 0.3); continue; }
      var me = grp[i], fl = o.flags;
      var sT = me !== 0 && o.nb[0] >= 0 && grp[o.nb[0]] === me;
      var sR = me !== 0 && o.nb[1] >= 0 && grp[o.nb[1]] === me;
      var sB = me !== 0 && o.nb[2] >= 0 && grp[o.nb[2]] === me;
      var sL = me !== 0 && o.nb[3] >= 0 && grp[o.nb[3]] === me;
      var inT = sT ? 0 : (fl & 1 ? 3 : 1), inR = sR ? 0 : (fl & 2 ? 3 : 1), inB = sB ? 0 : (fl & 4 ? 3 : 1), inL = sL ? 0 : (fl & 8 ? 3 : 1);
      var rx = x + inL * s, ry = y + inT * s, rw = tile - (inL + inR) * s, rh = tile - (inT + inB) * s;
      // overlap merged sides a little so no hairline shows between letters of one word
      if (sL) { rx -= 0.6 * px; rw += 0.6 * px; } if (sR) rw += 0.6 * px;
      if (sT) { ry -= 0.6 * px; rh += 0.6 * px; } if (sB) rh += 0.6 * px;
      var rr = Math.min(5 * s, tile * 0.2);
      if (ctx.roundRect && tileCss >= 12) {
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, [(!sT && !sL) ? rr : 0, (!sT && !sR) ? rr : 0, (!sB && !sR) ? rr : 0, (!sB && !sL) ? rr : 0]);
        ctx.fill();
      } else ctx.fillRect(rx, ry, rw, rh);
      if ((fl & 16) && wid < 0 && fst !== 'L') { ctx.strokeStyle = '#e0a32a'; ctx.lineWidth = Math.max(px, 2 * s); ctx.strokeRect(rx + s, ry + s, rw - 2 * s, rh - 2 * s); }
      if (text) {
        var fog = false;
        ctx.fillStyle = fg;
        ctx.fillText(fog ? '·' : o.l, x + tile / 2, y + tile / 2 + tile * 0.03);
      }
    }
    // a soft gold line where the light enters
    if (fine && this.glow.length) {
      ctx.save();
      ctx.beginPath();
      for (i = 0; i < this.glow.length; i++) {
        var ge = this.glow[i], gc = w.cells[ge[0]], ex = gc.x * s + ox, ey = gc.y * s + oy;
        if (ex > VW + tile || ey > VH + tile || ex < -2 * tile || ey < -2 * tile) continue;
        var e2 = 2 * px;
        if (ge[1] === 0) { ctx.moveTo(ex + e2, ey - 1.5 * s); ctx.lineTo(ex + tile - e2, ey - 1.5 * s); }
        if (ge[1] === 2) { ctx.moveTo(ex + e2, ey + tile + 1.5 * s); ctx.lineTo(ex + tile - e2, ey + tile + 1.5 * s); }
        if (ge[1] === 3) { ctx.moveTo(ex - 1.5 * s, ey + e2); ctx.lineTo(ex - 1.5 * s, ey + tile - e2); }
        if (ge[1] === 1) { ctx.moveTo(ex + tile + 1.5 * s, ey + e2); ctx.lineTo(ex + tile + 1.5 * s, ey + tile - e2); }
      }
      ctx.strokeStyle = 'rgba(255,214,120,0.85)'; ctx.lineWidth = Math.max(px, 1.6 * s); ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(255,200,95,0.9)'; ctx.shadowBlur = 8 * px;
      ctx.stroke();
      ctx.restore();
    }
    // outlines: focused field gold, other open fields dashed blue
    var self = this;
    function outline(fi, colour, dashed, width) {
      var f = w.fields[fi];
      var fx0 = f.x0 * s + ox, fy0 = f.y0 * s + oy;
      if (f.x1 * s + ox < 0 || f.y1 * s + oy < 0 || fx0 > VW || fy0 > VH) return;
      ctx.beginPath();
      f.cells.forEach(function (j) {
        var o = w.cells[j], x = o.x * s + ox, y = o.y * s + oy, fl = o.flags;
        if (fl & 1) { ctx.moveTo(x, y); ctx.lineTo(x + tile, y); }
        if (fl & 4) { ctx.moveTo(x, y + tile); ctx.lineTo(x + tile, y + tile); }
        if (fl & 8) { ctx.moveTo(x, y); ctx.lineTo(x, y + tile); }
        if (fl & 2) { ctx.moveTo(x + tile, y); ctx.lineTo(x + tile, y + tile); }
      });
      ctx.strokeStyle = colour; ctx.lineWidth = width * px;
      ctx.setLineDash(dashed ? [6 * px, 5 * px] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    w.fields.forEach(function (f) { if (g.state[f.i] === 'O' && f.i !== self.focus) outline(f.i, '#a9c4ff', true, 2); });
    outline(this.focus, '#f2c063', false, 3);
    // word outlines: marked wrong (red dashed), picked for removal (white)
    function wordOutline(wd, colour, dashed) {
      ctx.beginPath();
      wd.cells.forEach(function (j) {
        var o = w.cells[j], x = o.x * s + ox, y = o.y * s + oy;
        for (var k = 0; k < 4; k++) {
          var n = o.nb[k];
          if (n >= 0 && g.cellWord[n] === wd.id) continue;
          if (k === 0) { ctx.moveTo(x, y + px); ctx.lineTo(x + tile, y + px); }
          if (k === 2) { ctx.moveTo(x, y + tile - px); ctx.lineTo(x + tile, y + tile - px); }
          if (k === 3) { ctx.moveTo(x + px, y); ctx.lineTo(x + px, y + tile); }
          if (k === 1) { ctx.moveTo(x + tile - px, y); ctx.lineTo(x + tile - px, y + tile); }
        }
      });
      ctx.strokeStyle = colour; ctx.lineWidth = 3 * px; ctx.setLineDash(dashed ? [5 * px, 4 * px] : []); ctx.stroke(); ctx.setLineDash([]);
    }
    Object.keys(g.wrongMarked).forEach(function (id) { var wd = g.words[+id]; if (wd && wd.alive) wordOutline(wd, '#d6452f', true); });
    if (g.picked >= 0 && g.words[g.picked].alive) wordOutline(g.words[g.picked], '#ffffff', false);
    // starlight marks
    ctx.fillStyle = '#c4700c';
    g.hints.forEach(function (list) {
      list.forEach(function (h) {
        var a = w.cells[h.a], x = a.x * s + ox, y = a.y * s + oy;
        if (h.kind === 'start') { ctx.beginPath(); ctx.arc(x + 7 * s, y + 7 * s, Math.max(1.5 * px, 3.2 * s), 0, Math.PI * 2); ctx.fill(); return; }
        var b = w.cells[h.b];
        if (a.r === b.r) ctx.fillRect(x + tile - 2.5 * s, y + 3 * s, 5 * s, tile - 6 * s);
        else ctx.fillRect(x + 3 * s, y + tile - 2.5 * s, tile - 6 * s, 5 * s);
      });
    });
  }

  celebrate(fi, opened, perfect) {
    var w = this.world(), f = w.fields[fi], parts = [];
    var COL = ['#fff4c2', '#f2c063', '#ffffff', '#9cc9ea', '#f29b9b', '#bfe08f'];
    var cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    for (var i = 0; i < 110; i++) {
      var o = w.cells[f.cells[Math.floor(Math.random() * f.cells.length)]];
      var x = o.x + 14, y = o.y + 14, a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 1.2;
      var sp = 60 + Math.random() * 240;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.9 + Math.random() * 0.9, size: 2 + Math.random() * 5, col: COL[i % COL.length], spin: Math.random() * 6 });
    }
    this.fx = { fi: fi, t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()), parts: parts, opened: opened, perfect: perfect, name: f.name };
    this.paint();
  }

  renderFx(ox, oy, s) {
    var ctx = this.ctx, w = this.world(), fx = this.fx, f = w.fields[fx.fi], VW = this.VW, VH = this.VH, P = w.P;
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // 0.6: the celebration runs at a calm pace, about 4.3 seconds
    var t = (now - fx.t0) / 1000 * 0.6;
    if (t > 2.6) { this.fx = null; return; }
    var tile = P * s;
    ctx.save();
    // 1. a shine that sweeps over the field, top left to bottom right
    var rows = f.maxR - f.minR + 1, cols = f.maxC - f.minC + 1, span = rows + cols;
    var head = t * 1.5 * span - 2;
    ctx.globalCompositeOperation = 'lighter';
    f.cells.forEach(function (j) {
      var o = w.cells[j], u = (o.r - f.minR) + (o.c - f.minC);
      var d = u - head, a = Math.exp(-d * d / 3.5) * 0.85;
      if (a < 0.02) return;
      ctx.fillStyle = 'rgba(255,240,200,' + a.toFixed(3) + ')';
      ctx.fillRect(o.x * s + ox + s, o.y * s + oy + s, tile - 2 * s, tile - 2 * s);
    });
    // 2. a ring of light
    var cx = (f.x0 + f.x1) / 2 * s + ox, cy = (f.y0 + f.y1) / 2 * s + oy;
    var R = Math.hypot(f.x1 - f.x0, f.y1 - f.y0) * s * 0.7;
    var rt = Math.min(1, t / 1.1);
    if (rt < 1) {
      ctx.beginPath(); ctx.arc(cx, cy, R * (0.2 + rt * 1.1), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(242,192,99,' + (0.55 * (1 - rt)).toFixed(3) + ')'; ctx.lineWidth = 6 * (1 - rt) + 1; ctx.stroke();
    }
    // 3. sparkles
    fx.parts.forEach(function (p) {
      if (t > p.life) return;
      var k = t / p.life, x = (p.x + p.vx * t) * s + ox, y = (p.y + p.vy * t + 120 * t * t) * s + oy;
      var r = p.size * (1 - k * 0.6) * Math.max(0.6, Math.min(1.6, s));
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      var rot = p.spin * t;
      for (var q = 0; q < 8; q++) {
        var rad = q % 2 ? r * 0.35 : r, ang = rot + q * Math.PI / 4;
        if (q === 0) ctx.moveTo(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad); else ctx.lineTo(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
      }
      ctx.closePath(); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // 4. newly opened neighbours pulse
    var pulse = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - 0.6) / 1.8)) * Math.PI * 3));
    if (t > 0.6 && fx.opened.length) {
      var self = this;
      w.fields.forEach(function (nf) {
        if (fx.opened.indexOf(nf.name) < 0) return;
        ctx.beginPath();
        nf.cells.forEach(function (j) {
          var o = w.cells[j], x = o.x * s + ox, y = o.y * s + oy, fl = o.flags;
          if (fl & 1) { ctx.moveTo(x, y); ctx.lineTo(x + tile, y); }
          if (fl & 4) { ctx.moveTo(x, y + tile); ctx.lineTo(x + tile, y + tile); }
          if (fl & 8) { ctx.moveTo(x, y); ctx.lineTo(x, y + tile); }
          if (fl & 2) { ctx.moveTo(x + tile, y); ctx.lineTo(x + tile, y + tile); }
        });
        ctx.strokeStyle = 'rgba(242,192,99,' + (0.9 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 3 + 5 * pulse; ctx.shadowColor = '#f2c063'; ctx.shadowBlur = 16 * pulse;
        ctx.stroke(); ctx.shadowBlur = 0;
      });
    }
    // 5. title
    var tt = Math.min(1, t / 0.35), fade = t > 1.8 ? Math.max(0, 1 - (t - 1.8) / 0.6) : 1;
    var scale = 0.6 + 0.4 * (1 - Math.pow(1 - tt, 3)) + 0.05 * Math.sin(t * 6) * (1 - tt);
    ctx.globalAlpha = fade;
    ctx.translate(VW / 2, VH * 0.42);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(6,9,19,0.72)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-150, -34, 300, 90, 18); ctx.fill(); } else ctx.fillRect(-150, -34, 300, 90);
    ctx.shadowColor = 'rgba(242,192,99,0.8)'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 34px Archivo, system-ui, sans-serif';
    ctx.fillText(fx.name + ' solved', 0, -4);
    ctx.fillStyle = '#f2c063';
    ctx.font = '800 18px Archivo, system-ui, sans-serif';
    ctx.fillText(fx.perfect ? '★ Perfect star ★' : (fx.opened.length ? fx.opened.length + ' new field' + (fx.opened.length > 1 ? 's' : '') + ' open' : 'Well done'), 0, 34);
    ctx.restore();
    this.paint();
  }

  // edge arrows and a small map when the field is bigger than the screen
  renderOverlay(ox, oy, s) {
    var ctx = this.ctx, w = this.world(), g = this.game, f = w.fields[this.focus], VW = this.VW, VH = this.VH;
    if (s < this.fieldScale(this.focus) * 0.75) return;
    var x0 = f.x0 * s + ox, x1 = f.x1 * s + ox, y0 = f.y0 * s + oy, y1 = f.y1 * s + oy;
    var more = { l: x0 < -4, r: x1 > VW + 4, t: y0 < -4, b: y1 > VH + 4 };
    if (!more.l && !more.r && !more.t && !more.b) return;
    function strip(side) {
      var gr, L = 34;
      if (side === 'l') gr = ctx.createLinearGradient(0, 0, L, 0);
      if (side === 'r') gr = ctx.createLinearGradient(VW, 0, VW - L, 0);
      if (side === 't') gr = ctx.createLinearGradient(0, 0, 0, L);
      if (side === 'b') gr = ctx.createLinearGradient(0, VH, 0, VH - L);
      gr.addColorStop(0, 'rgba(6,9,19,0.85)'); gr.addColorStop(1, 'rgba(6,9,19,0)');
      ctx.fillStyle = gr;
      if (side === 'l') ctx.fillRect(0, 0, L, VH);
      if (side === 'r') ctx.fillRect(VW - L, 0, L, VH);
      if (side === 't') ctx.fillRect(0, 0, VW, L);
      if (side === 'b') ctx.fillRect(0, VH - L, VW, L);
      var cx = side === 'l' ? 12 : side === 'r' ? VW - 12 : VW / 2;
      var cy = side === 't' ? 12 : side === 'b' ? VH - 12 : VH / 2;
      var d = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] }[side];
      ctx.beginPath();
      ctx.moveTo(cx + d[0] * 5 - d[1] * 7, cy + d[1] * 5 - d[0] * 7);
      ctx.lineTo(cx + d[0] * 5 + d[0] * 4, cy + d[1] * 5 + d[1] * 4);
      ctx.lineTo(cx + d[0] * 5 + d[1] * 7, cy + d[1] * 5 + d[0] * 7);
      ctx.strokeStyle = '#f2c063'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
    }
    Object.keys(more).forEach(function (k) { if (more[k]) strip(k); });
    // mini map, top right
    var cols = f.maxC - f.minC + 1, rows = f.maxR - f.minR + 1;
    var u = Math.max(2, Math.floor(Math.min(84 / cols, 96 / rows)));
    var mw = cols * u, mh = rows * u, mx = VW - mw - 12, my = 12;
    ctx.fillStyle = 'rgba(6,9,19,0.82)';
    ctx.fillRect(mx - 5, my - 5, mw + 10, mh + 10);
    var COLORS = ['#9cc9ea', '#f4b26b', '#bfe08f', '#dcb0e6', '#f29b9b', '#7fd1c1'];
    f.cells.forEach(function (j) {
      var o = w.cells[j], wid = g.cellWord[j];
      ctx.fillStyle = wid >= 0 ? COLORS[g.words[wid].colour % 6] : g.sel[j] ? '#5b6fe0' : '#8f8a80';
      ctx.fillRect(mx + (o.c - f.minC) * u, my + (o.r - f.minR) * u, u - (u > 3 ? 1 : 0), u - (u > 3 ? 1 : 0));
    });
    var P = w.P;
    var vx0 = ((-ox) / s - f.x0) / P * u, vy0 = ((-oy) / s - f.y0) / P * u;
    var vw = VW / s / P * u, vh = VH / s / P * u;
    var ax = Math.max(0, vx0), ay = Math.max(0, vy0), bx = Math.min(mw, vx0 + vw), by = Math.min(mh, vy0 + vh);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.strokeRect(mx + ax, my + ay, Math.max(2, bx - ax), Math.max(2, by - ay));
  }

  // ---------- input ----------
  pt(e) {
    var r = this._cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * this.VW / r.width, y: (e.clientY - r.top) * this.VH / r.height };
  }
  cellAtPt(p, strict) {
    var w = this.world(), q = this.toWorld(p.x, p.y);
    var cc = Math.floor((q.x - w.M) / w.P), rr = Math.floor((q.y - w.M) / w.P);
    var j = w.at(rr, cc);
    if (j < 0) return null;
    if (strict) {
      var o = w.cells[j], dx = q.x - (o.x + w.P / 2), dy = q.y - (o.y + w.P / 2);
      if (Math.abs(dx) > w.P * 0.4 || Math.abs(dy) > w.P * 0.4) return null;
    }
    return w.cells[j];
  }
  canPaint() { return this.game.state[this.focus] === 'O' && this.cam.s >= this.fieldScale(this.focus) * 0.6; }

  down(e) {
    if (!this._cv) return;
    if (this._anim) { cancelAnimationFrame(this._anim); this._anim = 0; }
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    var p = this.pt(e);
    this.ptrs[e.pointerId] = p;
    var ids = Object.keys(this.ptrs);
    if (ids.length === 2) {
      // second finger: pinch and pan; undo a stroke that just began
      if (this.drag && this.drag.mode === 'paint' && this.drag.changed.length <= 1) this.undoStroke();
      if (this.drag && this.drag.timer) clearTimeout(this.drag.timer);
      var a = this.ptrs[ids[0]], b = this.ptrs[ids[1]];
      this.drag = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam0: { x: this.cam.x, y: this.cam.y, s: this.cam.s } };
      return;
    }
    if (ids.length > 2) return;
    var g = this.game, o = this.cellAtPt(p, false);
    var mouseRight = e.button === 2 || e.button === 1;
    if (!mouseRight && o && o.f === this.focus && this.canPaint()) {
      if (g.cellWord[o.i] >= 0) {
        var self = this, wid = g.cellWord[o.i];
        this.drag = { mode: 'press', start: p, last: p, moved: false, cellI: o.i };
        this.drag.timer = setTimeout(function () {
          if (!self.drag || self.drag.moved) return;
          self.dirtyCells(Object.keys(g.sel).map(Number), 1); self.dirtyCells(g.words[wid].cells, 1);
          g.picked = wid; g.sel = {}; g.selN = 0;
          self.say('Remove ' + g.words[wid].word + '?', 'warn');
          self.drag.mode = 'held';
          self.paint(); self.bump();
        }, 550);
        return;
      }
      if (g.picked >= 0) { this.dirtyCells(g.words[g.picked].cells, 1); g.picked = -1; this.say('', 'info'); this.bump(); }
      var add = !g.sel[o.i];
      this.drag = { mode: 'paint', add: add, last: p, changed: [] };
      this.paintCell(o);
      this.paint();
      return;
    }
    this.drag = { mode: 'pan', start: p, last: p, moved: false, cell: o };
  }

  paintCell(o) {
    var g = this.game;
    if (!o || o.f !== this.focus || g.cellWord[o.i] >= 0) return;
    var d = this.drag;
    if (d.add && !g.sel[o.i]) { g.sel[o.i] = 1; g.selN++; d.changed.push(o.i); this.dirtyCells([o.i], 1); }
    else if (!d.add && g.sel[o.i]) { delete g.sel[o.i]; g.selN--; d.changed.push(o.i); this.dirtyCells([o.i], 1); }
  }
  undoStroke() {
    var g = this.game, d = this.drag;
    d.changed.forEach(function (j) { if (d.add) { delete g.sel[j]; g.selN--; } else { g.sel[j] = 1; g.selN++; } });
    this.dirtyCells(d.changed, 1);
  }

  move(e) {
    if (!this.ptrs[e.pointerId]) return;
    var p = this.pt(e);
    this.ptrs[e.pointerId] = p;
    var d = this.drag;
    if (!d) return;
    if (d.mode === 'pinch') {
      var ids = Object.keys(this.ptrs);
      if (ids.length < 2) return;
      var a = this.ptrs[ids[0]], b = this.ptrs[ids[1]];
      var dist = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      var c0 = d.cam0, s = c0.s * dist / Math.max(1, d.d0);
      // keep the world point under the first midpoint under the current midpoint
      var wx = (d.m0.x - this.VW / 2) / c0.s + c0.x, wy = (d.m0.y - this.VH / 2) / c0.s + c0.y;
      this.cam = { s: s, x: wx - (m.x - this.VW / 2) / s, y: wy - (m.y - this.VH / 2) / s };
      this.clampCam(); this.moved();
      return;
    }
    if (d.mode === 'paint') {
      var steps = Math.max(1, Math.ceil(Math.hypot(p.x - d.last.x, p.y - d.last.y) / (this.world().P * this.cam.s * 0.25)));
      for (var k = 1; k <= steps; k++) {
        var q = { x: d.last.x + (p.x - d.last.x) * k / steps, y: d.last.y + (p.y - d.last.y) * k / steps };
        this.paintCell(this.cellAtPt(q, true));
      }
      d.last = p;
      this.autoScroll(p);
      this.paint();
      return;
    }
    if (d.mode === 'press' || d.mode === 'pan' || d.mode === 'held') {
      if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < 8) return;
      d.moved = true;
      if (d.timer) { clearTimeout(d.timer); d.timer = 0; }
      this.cam.x -= (p.x - d.last.x) / this.cam.s;
      this.cam.y -= (p.y - d.last.y) / this.cam.s;
      d.last = p;
      this.clampCam(); this.moved();
    }
  }

  // while swiping near the edge, move the view so long words fit
  autoScroll(p) {
    var self = this, edge = 30;
    // only scroll towards a side where the field continues off screen
    var f = this.world().fields[this.focus], c = this.cam, s = c.s;
    var fx0 = (f.x0 - c.x) * s + this.VW / 2, fx1 = (f.x1 - c.x) * s + this.VW / 2;
    var fy0 = (f.y0 - c.y) * s + this.VH / 2, fy1 = (f.y1 - c.y) * s + this.VH / 2;
    var vx = (p.x < edge && fx0 < 4) ? -(edge - p.x) : (p.x > this.VW - edge && fx1 > this.VW - 4) ? p.x - (this.VW - edge) : 0;
    var vy = (p.y < edge && fy0 < 4) ? -(edge - p.y) : (p.y > this.VH - edge && fy1 > this.VH - 4) ? p.y - (this.VH - edge) : 0;
    this._autoV = { x: vx, y: vy };
    if ((vx || vy) && !this._auto) {
      var step = function () {
        var d = self.drag;
        if (!d || d.mode !== 'paint' || (!self._autoV.x && !self._autoV.y)) { self._auto = 0; return; }
        self.cam.x += self._autoV.x * 0.22 / self.cam.s;
        self.cam.y += self._autoV.y * 0.22 / self.cam.s;
        self.clampCam();
        self.paintCell(self.cellAtPt(d.last, true));
        self.moved();
        self._auto = requestAnimationFrame(step);
      };
      this._auto = requestAnimationFrame(step);
    }
  }

  up(e) {
    delete this.ptrs[e.pointerId];
    var d = this.drag;
    if (!d) return;
    if (d.timer) { clearTimeout(d.timer); d.timer = 0; }
    if (d.mode === 'pinch') { if (Object.keys(this.ptrs).length === 0) { this.drag = null; this.bump(); } return; }
    this.drag = null;
    this._autoV = { x: 0, y: 0 };
    if (d.mode === 'pan' && !d.moved) this.tap(d.cell);
    if (d.mode === 'press' && !d.moved) {
      var wd = this.game.words[this.game.cellWord[d.cellI]];
      var mn = this.meaning(wd.word);
      this.say(mn.text + ' Hold the word to remove it.', 'info', mn.title);
      this.bump();
    }
  }

  tap(o) {
    var w = this.world(), g = this.game;
    if (!o) return;
    var f = w.fields[o.f];
    if (o.f !== this.focus || this.cam.s < this.fieldScale(o.f) * 0.6) {
      this.dirtyField(this.focus); this.dirtyField(o.f);
      this.focus = o.f;
      g.sel = {}; g.selN = 0; g.picked = -1;
      var st = g.state[o.f];
      this.say(st === 'L' ? f.name + ' is locked. Solve a field next to it first.' : st === 'S' ? f.name + ' is solved.' : 'Swipe over letters to select a word, then tap Accept.', st === 'L' ? 'warn' : 'info');
      this.flyTo(this.camFor('field', o.f));
      this.bump();
      return;
    }
    if (g.cellWord[o.i] >= 0) { var mn = this.meaning(g.words[g.cellWord[o.i]].word); this.say(mn.text, 'info', mn.title); this.bump(); }
    else if (g.state[o.f] === 'L') { this.say(f.name + ' is locked. Solve a field next to it first.', 'warn'); this.bump(); }
    else if (g.state[o.f] === 'S') { this.say(f.name + ' is solved. Tap a field with a dashed outline.', 'info'); this.bump(); }
  }

  wheel(e) {
    if (!this._cv) return;
    if (this._anim) { cancelAnimationFrame(this._anim); this._anim = 0; }
    var p = this.pt(e), c = this.cam;
    var q = this.toWorld(p.x, p.y);
    var s = c.s * Math.exp(-e.deltaY * 0.0015);
    this.cam = { s: s, x: q.x - (p.x - this.VW / 2) / s, y: q.y - (p.y - this.VH / 2) / s };
    this.clampCam(); this.moved();
  }

  // ---------- rules ----------
  doAccept() {
    var w = this.world(), g = this.game;
    var sel = Object.keys(g.sel).map(Number).filter(function (j) { return g.cellWord[j] < 0; });
    if (sel.length < 4) { this.say('Select at least 4 letters first.', 'warn'); this.bump(); return; }
    sel.sort(function (a, b) { return w.cells[a].r - w.cells[b].r || w.cells[a].c - w.cells[b].c; });
    // the letters of a word must touch
    var inSel = {}; sel.forEach(function (j) { inSel[j] = 1; });
    var seen = {}, stack = [sel[0]], n = 0; seen[sel[0]] = 1;
    while (stack.length) { var j = stack.pop(); n++; w.cells[j].nb.forEach(function (q) { if (q >= 0 && inSel[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }); }
    var word = sel.map(function (j) { return w.cells[j].l; }).join('');
    if (n !== sel.length) { this.say('The letters of a word must touch each other.', 'warn'); this.bump(); return; }
    if (!w.dict.has(word)) { this.say(word + ' is not in the word list.', 'warn'); this.bump(); return; }
    var gi = w.cells[sel[0]].g, reg = w.regions[gi];
    var correct = reg.cells.length === sel.length && sel.every(function (j) { return w.cells[j].g === gi; });
    this.dirtyCells(sel, 1);
    this.addWord(sel, this.pickColour(sel), correct);
    g.sel = {}; g.selN = 0;
    var fi = this.focus, f = w.fields[fi];
    var full = f.cells.every(function (j) { return g.cellWord[j] >= 0; });
    if (full) {
      g.state[fi] = 'S';
      var opened = [];
      f.nbList.forEach(function (nb) { if (g.state[nb] === 'L') { g.state[nb] = 'O'; opened.push(w.fields[nb].name); } });
      this.recalcLit();
      var selfA = this, perfectA = !g.used[fi];
      this.flyTo(this.camFit(fi), function () { selfA.celebrate(fi, opened, perfectA); });
      var mw = this.meaning(word);
      this.say((opened.length ? 'Now open: ' + opened.join(', ') + '. ' : '') + 'Last word ' + mw.title + ' ' + mw.text, 'good', f.name + ' solved!' + (g.used[fi] ? '' : ' Perfect star.'));
    } else { var mn = this.meaning(word); this.say(mn.text, 'good', mn.title); }
    this.paint(); this.bump();
  }

  pickColour(cells) {
    var w = this.world(), g = this.game, taken = {};
    cells.forEach(function (j) {
      var o = w.cells[j];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var q = w.at(o.r + dy, o.c + dx);
        if (q >= 0 && g.cellWord[q] >= 0) taken[g.words[g.cellWord[q]].colour] = 1;
      }
    });
    var c = 0; while (taken[c]) c++;
    return c;
  }

  doRemove() {
    var g = this.game, wd = g.words[g.picked];
    if (!wd || !wd.alive) return;
    this.dirtyCells(wd.cells, 1);
    wd.alive = false;
    g.sel = {}; g.selN = 0;
    wd.cells.forEach(function (j) { g.cellWord[j] = -1; g.sel[j] = 1; g.selN++; });
    delete g.wrongMarked[wd.id];
    g.picked = -1;
    this.say('The letters stay selected. Swipe to change them, then tap Accept.', 'info', wd.word + ' removed.');
    this.paint(); this.bump();
  }

  lightTotal(fi) {
    var w = this.world(), g = this.game;
    return Math.min(6, 2 * w.fields[fi].nbList.filter(function (n) { return g.state[n] === 'S'; }).length);
  }

  doLight() {
    var w = this.world(), g = this.game, fi = this.focus, f = w.fields[fi], lit = this.lit;
    if (g.state[fi] !== 'O') { this.say('Starlight works only in an open field.', 'warn'); this.bump(); return; }
    if (this.lightTotal(fi) - g.used[fi] <= 0) { this.say('No starlight left here. Solve another neighbour of ' + f.name + ' to get more.', 'warn'); this.bump(); return; }
    var have = {};
    g.hints[fi].forEach(function (h) { have[h.key] = 1; });
    // 1. a wrong word that the light reaches
    var wrong = g.words.filter(function (wd) {
      return wd.alive && wd.f === fi && !wd.correct && !g.wrongMarked[wd.id] && wd.cells.some(function (j) { return lit[j]; });
    });
    var hint = null;
    if (wrong.length) {
      g.wrongMarked[wrong[0].id] = 1;
      this.dirtyCells(wrong[0].cells, 1);
      g.used[fi]++;
      this.say('Starlight: ' + wrong[0].word + ' is not part of the solution.', 'info');
      this.paint(); this.bump(); return;
    }
    // 2. walls and word starts in the lit band
    var open = function (j) { var x = g.cellWord[j]; return x < 0 || !g.words[x].correct; };
    var walls = [], starts = [];
    f.cells.forEach(function (j) {
      if (!lit[j] || !open(j)) return;
      var o = w.cells[j];
      [1, 2].forEach(function (k) {
        var q = o.nb[k];
        if (q >= 0 && lit[q] && open(q) && w.cells[q].f === fi && w.cells[q].g !== o.g && !have['w' + j + '-' + q]) walls.push({ key: 'w' + j + '-' + q, kind: 'wall', a: j, b: q });
      });
      if (o.k === 0 && !have['s' + j]) starts.push({ key: 's' + j, kind: 'start', a: j });
    });
    var n = g.used[fi];
    var pool = (n % 3 === 2 && starts.length) ? starts : (walls.length ? walls : starts);
    if (!pool.length) { this.say('Nothing left to show where the light reaches.', 'warn'); this.bump(); return; }
    hint = pool[(n * 7 + 3) % pool.length];
    g.hints[fi].push(hint);
    this.dirtyCells(hint.b != null ? [hint.a, hint.b] : [hint.a], 1);
    g.used[fi]++;
    this.say(hint.kind === 'wall' ? 'Starlight shows a wall: the cells on each side belong to different words.' : 'Starlight shows a word start: a word begins in the marked cell.', 'info');
    this.paint(); this.bump();
  }

  // ---------- markup values ----------
  renderVals() {
    var self = this, w = this.world(), g = this.game, fi = this.focus, f = w.fields[fi];
    var MODS = { FOG: 'fog', GIFT: 'gift word', STAR: 'star cell', THEME: 'theme: space' };
    var STATE = { S: 'solved', O: 'open', L: 'locked' };
    var pips = '';
    for (var q = 0; q < 6; q++) pips += q < f.tier ? '●' : '○';
    var meta = f.shape + ' · ' + f.words + ' words · ' + f.len[0] + '–' + f.len[1] + ' letters';
    if (f.mods.length) meta += ' · ' + f.mods.map(function (m) { return MODS[m]; }).join(', ');
    var covered = f.cells.filter(function (j) { return g.cellWord[j] >= 0; }).length;
    var left = Math.max(0, this.lightTotal(fi) - g.used[fi]);
    var presets = [['field', 'Field'], ['area', 'Area'], ['galaxy', 'Galaxy']].map(function (p) {
      return { label: p[1], pick: function () { self.flyTo(self.camFor(p[0], self.focus)); } };
    });
    presets.push({ label: this.seedMode ? 'Close' : 'Seed ' + this.seed, pick: function () { self.seedMode = !self.seedMode; self.seedText = String(self.seed); self.bump(); } });
    var picking = g.picked >= 0 && g.words[g.picked].alive;
    return {
      canvasRef: this.canvasRef, onDown: this.onDown, onMove: this.onMove, onUp: this.onUp, onWheel: this.onWheel, onMenu: this.onMenu,
      clearSel: this.clearSel, accept: this.accept, useLight: this.useLight, cancelPick: this.cancelPick, removePick: this.removePick,
      focusName: f.name, focusPips: pips,
      focusLevel: ['', 'Very easy', 'Easy', 'Medium', 'Hard', 'Expert', 'Master'][f.tier],
      focusProgress: g.state[fi] === 'S' ? (g.used[fi] ? 'Solved' : '\u2605 Solved') : g.state[fi] === 'L' ? 'Locked' : Math.round(100 * covered / f.cells.length) + '%',
      solvedCount: g.state.filter(function (s) { return s === 'S'; }).length, fieldCount: w.fields.length,
      lightLeft: left, presets: presets,
      showPick: picking && !this.seedMode, showActions: !picking && !this.seedMode, seedMode: this.seedMode,
      seedText: this.seedText, onSeedInput: this.onSeedInput, buildSeed: this.buildSeed, randomSeed: this.randomSeed,
      picking: picking, notPicking: !picking, pickWord: picking ? g.words[g.picked].word : '',
      msg: g.msg, msgTitle: g.msgTitle || '', msgColor: g.msgKind === 'good' ? '#a9dc8f' : g.msgKind === 'warn' ? '#f2a27c' : '#c9d1ea'
    };
  }
}
