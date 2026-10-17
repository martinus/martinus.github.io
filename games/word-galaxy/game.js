
class Component extends DCLogic {
  constructor(props) {
    super(props);
    var self = this;
    this.VW = 390; this.VH = 648;
    // language: from the page, else the last one used in this browser; each language has its own saved galaxy
    this.lang = (props && props.lang) || this.storedLang() || 'en';
    if (this.lang !== 'de' || !this.hasWords('de')) this.lang = this.lang === 'de' && this.hasWords('de') ? 'de' : 'en';
    // a saved game continues; a different galaxy in the address asks first
    var saved = this.loadSave(this.lang);
    var asked = (props && props.seed != null) ? +props.seed : null;
    var askedLevel = this.cleanLevel(props && props.level);
    this.seed = asked != null ? asked : (saved ? saved.seed : 23);
    // a galaxy without a level is from before levels existed: hard. New players start with medium.
    this.level = asked != null ? askedLevel : (saved ? this.cleanLevel(saved.level) : 'medium');
    // the newest generator for new galaxies; a saved galaxy keeps the version it was made with
    this.gen = saved && saved.seed === this.seed && this.cleanLevel(saved.level) === this.level ? (saved.gen || 1) : Component.GEN;
    this.menuOpen = false;
    this.confirm = null;
    this.newOpen = false; this.newLevel = this.level;
    if (saved && asked != null && (saved.seed !== asked || this.cleanLevel(saved.level) !== askedLevel) && this.saveHasProgress(saved)) {
      this.seed = saved.seed; this.level = this.cleanLevel(saved.level); this.gen = saved.gen || 1;
      this.confirm = { title: this.T('openTitle', asked), text: this.T('openText', saved.seed, asked), yes: this.T('openYes', asked), no: this.T('openNo'),
        action: function () { self.reseed(asked, askedLevel); } };
    }
    this.seedText = String(this.seed);
    this.seedMode = false;
    this.toggleMenu = function () { self.menuOpen = !self.menuOpen; self.bump(); };
    this.openNewGalaxy = function () { self.menuOpen = false; self.newOpen = true; self.newLevel = self.level; self.seedText = String(Math.floor(Math.random() * 1000000)); self.bump(); };
    this.closeSeed = function () { self.newOpen = false; self.bump(); };
    this.switchLang = function () { self.menuOpen = false; self.changeLang(self.lang === 'de' ? 'en' : 'de'); };
    this.confirmNo = function () { self.confirm = null; self.bump(); };
    this.confirmYes = function () {
      var c = self.confirm; self.confirm = null;
      if (c && c.action) c.action(); else if (c && c.seed != null) self.reseed(c.seed); else self.bump();
    };
    this.shareProgress = function () { self.menuOpen = false; self.doShare(); };
    this.onSeedInput = function (e) { self.seedText = e.target.value; self.bump(); };
    this.buildSeed = function () {
      var n = parseInt(String(self.seedText).replace(/[^0-9]/g, ''), 10);
      if (isNaN(n)) { self.say(self.T('typeNumber'), 'warn'); self.bump(); return; }
      self.newOpen = false;
      self.requestBuild(n, self.newLevel);
    };
    this.randomSeed = function () { self.seedText = String(Math.floor(Math.random() * 1000000)); self.bump(); };
    this.levelPick = {
      easy: function () { self.newLevel = 'easy'; self.bump(); },
      medium: function () { self.newLevel = 'medium'; self.bump(); },
      hard: function () { self.newLevel = 'hard'; self.bump(); }
    };
    this.MIN_TILE = 40;
    var w = this.world();
    this.state = { ver: 0 };
    this.game = this.newGame();
    this.focus = w.current;
    if (saved && saved.seed === this.seed && this.cleanLevel(saved.level) === this.level && !this.restore(saved) && this.saveHasProgress(saved)) {
      // never lose a saved game silently: keep a copy
      try { localStorage.setItem(this.saveKey(this.lang, 'backup'), JSON.stringify(saved)); } catch (e) {}
      this.say(this.T('saveBroken'), 'warn');
    }
    var start = (props && props.start) || 'field';
    this.cam = this.camFor(start, this.focus);
    this.ptrs = {};
    this.drag = null;
    this._raf = 0; this._anim = 0; this._auto = 0;
    this.canvasRef = function (el) { self.setupCanvas(el); };
    this.loRef = function (el) { self.setupLo(el); };
    this.zoomRef = function (el) { self.setupZoom(el); };
    this.onDown = function (e) { self.down(e); };
    this.onMove = function (e) { self.move(e); };
    this.onUp = function (e) { self.up(e); };
    this.onWheel = function (e) { self.wheel(e); };
    this.onMenu = function (e) { if (e.preventDefault) e.preventDefault(); };
    this.clearSel = function () { self.dirtyCells(Object.keys(self.game.sel).map(Number), 1); self.game.sel = {}; self.game.selN = 0; self.draw(); self.refreshQuick(); };
    this.accept = function () { self.doAccept(); };
    this.useLight = function () { self.doLight(); };
    this.cancelPick = function () { var pw = self.game.words[self.game.picked]; if (pw) self.dirtyCells(pw.cells, 1); self.game.picked = -1; self.say('', 'info'); self.quick = self.quickPos(); self.draw(); self.bump(); };
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

  // ---------- texts in English and German ----------
  T(key) {
    var S = Component.STR || (Component.STR = {
      en: {
        openTitle: 'Open galaxy {0}?', openText: 'You have progress in galaxy {0}. Opening galaxy {1} removes that progress.', openYes: 'Open galaxy {0}', openNo: 'Keep my galaxy',
        typeNumber: 'Type a number for the galaxy.', saveBroken: 'Your saved game could not be loaded. A copy is kept in this browser.',
        noMeaning: 'No meaning in this little dictionary yet.', from: 'from', core: 'Galactic Core',
        building: 'Building galaxy {0}…', ready: 'Galaxy {0} is ready. Swipe over letters to select a word, then tap the ✓ button.', seedFail: 'Galaxy {0} did not work ({1}). Try another number.',
        linkOpen: 'Open the link on your other device. It asks before it replaces the progress there.', linkCopied: 'Progress link copied.', linkSent: 'Progress link sent.',
        copyFail: 'Could not copy the link in this browser.', linkFail: 'Could not make the link ({0}).', saveFail: 'Could not save the progress in this browser.',
        linkBad: 'This progress link does not work ({0}).', shareTitle: 'Word Galaxy progress',
        loadTitle: 'Load progress from the link?', loadText: 'The link has {0}. This browser has {1}. Loading replaces the progress in this browser.', loadYes: 'Load progress', loadNo: 'Keep this progress',
        galaxyDesc: 'galaxy {0} ({1}) with {2}', fields1: '1 solved field', fieldsN: '{0} solved fields',
        welcome: 'Welcome back. Your galaxy is as you left it.',
        newTitle: 'Start a new galaxy?', newText: 'This removes all progress in galaxy {0}. You can not undo this.', newYes: 'Start new galaxy', keepPlaying: 'Keep playing',
        bigSolved: '{0} solved', perfect: 'Perfect',
        removeAsk: 'Remove {0}? Tap anywhere else to keep it.', holdToRemove: 'Hold the word to remove it.',
        locked: '{0} is locked. Solve a field next to it first.', isSolved: '{0} is solved.', howTo: 'Swipe over letters to select a word, then tap the ✓ button.',
        solvedOther: '{0} is solved. Tap a field with a dashed outline.', min4: 'Select at least 4 letters first.', touch: 'The letters of a word must touch each other.', notInList: '{0} is not in the word list.',
        nowOpen: 'Now open: {0}. ', earned1: 'You earned 1 star. ', earnedN: 'You earned {0} stars. ', lastWord: 'Last word {0} {1}', fieldSolved: '{0} solved!', perfectNo: ' Perfect, no stars used.',
        cheers: 'Great!|Well done!|Super!|Fantastic!|You did it!', notHere: '{0} is a word, but not the one we look for here. Hold it to remove it.',
        removed: '{0} removed.', staySelected: 'The letters stay selected. Swipe to change them, then tap the ✓ button.',
        starsOpen: 'Stars work only in an open field.', noStars: 'No stars left. Solve fields to earn stars: harder fields give more.',
        starWrong: 'A star shows: {0} is not part of the solution.', starNothing: 'A star has nothing more to show in this field.',
        starWall: 'A star shows a wall: the cells on each side belong to different words.', starStart: 'A star shows a word start: a word begins in the marked cell.',
        tiers: '|Very easy|Easy|Medium|Hard|Expert|Master', solved: 'Solved', locked1: 'Locked',
        lvEasy: 'Easy', lvMedium: 'Medium', lvHard: 'Hard',
        lvEasyDesc: 'Short, well known words and small fields. Good for children.', lvMediumDesc: 'Words up to 9 letters. Medium fields.', lvHardDesc: 'Long words and big fields.',
        menu: 'Menu', starsAria: 'Use one star for a hint ({0} left)', starsTitle: 'Use a star for a hint', accept: 'Accept the selected word', remove: 'Remove {0}',
        zGalaxy: 'Show the whole galaxy', zArea: 'Show the area around this field', zField: 'Show this field',
        map: 'Galaxy map. Swipe over letters to select a word. Drag elsewhere to move around. Pinch or scroll to zoom.',
        menuGalaxy: 'Galaxy {0} · {1}', copyLink: 'Copy progress link', newGalaxy: 'New galaxy…', allGames: 'All games', close: 'Close', otherLang: 'Deutsch', otherLangAria: 'Auf Deutsch spielen',
        ngTitle: 'New galaxy', ngLevel: 'Difficulty', ngNumber: 'Galaxy number', ngRandom: 'Random', ngStart: 'Start', ngCancel: 'Cancel',
        loadingWords: 'Loading the words…', loadFail: 'Could not load the words. Check the connection and try again.', firstGame: 'Choose how hard your galaxy should be.'
      },
      de: {
        openTitle: 'Galaxie {0} öffnen?', openText: 'Du hast Fortschritt in Galaxie {0}. Wenn du Galaxie {1} öffnest, ist dieser Fortschritt weg.', openYes: 'Galaxie {0} öffnen', openNo: 'Meine Galaxie behalten',
        typeNumber: 'Gib eine Zahl für die Galaxie ein.', saveBroken: 'Dein gespeichertes Spiel konnte nicht geladen werden. Eine Kopie bleibt in diesem Browser.',
        noMeaning: 'Für dieses Wort gibt es noch keine Erklärung.', from: 'von', core: 'Galaktischer Kern',
        building: 'Galaxie {0} wird gebaut …', ready: 'Galaxie {0} ist fertig. Wische über Buchstaben, um ein Wort zu wählen, dann tippe auf ✓.', seedFail: 'Galaxie {0} hat nicht funktioniert ({1}). Versuche eine andere Zahl.',
        linkOpen: 'Öffne den Link auf deinem anderen Gerät. Es fragt, bevor es den Fortschritt dort ersetzt.', linkCopied: 'Fortschritts-Link kopiert.', linkSent: 'Fortschritts-Link gesendet.',
        copyFail: 'Der Link konnte in diesem Browser nicht kopiert werden.', linkFail: 'Der Link konnte nicht erstellt werden ({0}).', saveFail: 'Der Fortschritt konnte in diesem Browser nicht gespeichert werden.',
        linkBad: 'Dieser Fortschritts-Link funktioniert nicht ({0}).', shareTitle: 'Word Galaxy – Fortschritt',
        loadTitle: 'Fortschritt aus dem Link laden?', loadText: 'Der Link hat {0}. Dieser Browser hat {1}. Beim Laden wird der Fortschritt in diesem Browser ersetzt.', loadYes: 'Fortschritt laden', loadNo: 'Diesen Fortschritt behalten',
        galaxyDesc: 'Galaxie {0} ({1}) mit {2}', fields1: '1 gelösten Feld', fieldsN: '{0} gelösten Feldern',
        welcome: 'Willkommen zurück. Deine Galaxie ist so, wie du sie verlassen hast.',
        newTitle: 'Neue Galaxie starten?', newText: 'Damit ist der ganze Fortschritt in Galaxie {0} weg. Das kann man nicht rückgängig machen.', newYes: 'Neue Galaxie starten', keepPlaying: 'Weiterspielen',
        bigSolved: '{0} gelöst', perfect: 'Perfekt',
        removeAsk: '{0} entfernen? Tippe woanders hin, um es zu behalten.', holdToRemove: 'Halte das Wort gedrückt, um es zu entfernen.',
        locked: '{0} ist gesperrt. Löse zuerst ein Feld daneben.', isSolved: '{0} ist gelöst.', howTo: 'Wische über Buchstaben, um ein Wort zu wählen, dann tippe auf ✓.',
        solvedOther: '{0} ist gelöst. Tippe auf ein Feld mit gestricheltem Rand.', min4: 'Wähle zuerst mindestens 4 Buchstaben.', touch: 'Die Buchstaben eines Wortes müssen sich berühren.', notInList: '{0} ist nicht in der Wortliste.',
        nowOpen: 'Jetzt offen: {0}. ', earned1: 'Du bekommst 1 Stern. ', earnedN: 'Du bekommst {0} Sterne. ', lastWord: 'Letztes Wort {0} {1}', fieldSolved: '{0} gelöst!', perfectNo: ' Perfekt, ohne Sterne.',
        cheers: 'Super!|Toll gemacht!|Klasse!|Spitze!|Geschafft!', notHere: '{0} ist ein Wort, aber nicht das gesuchte. Halte es gedrückt, um es zu entfernen.',
        removed: '{0} entfernt.', staySelected: 'Die Buchstaben bleiben gewählt. Wische, um sie zu ändern, dann tippe auf ✓.',
        starsOpen: 'Sterne helfen nur in einem offenen Feld.', noStars: 'Keine Sterne mehr. Löse Felder, um Sterne zu bekommen: schwerere Felder geben mehr.',
        starWrong: 'Ein Stern zeigt: {0} gehört nicht zur Lösung.', starNothing: 'Ein Stern kann in diesem Feld nichts mehr zeigen.',
        starWall: 'Ein Stern zeigt eine Wand: Die Felder auf beiden Seiten gehören zu verschiedenen Wörtern.', starStart: 'Ein Stern zeigt einen Wortanfang: Im markierten Feld beginnt ein Wort.',
        tiers: '|Sehr leicht|Leicht|Mittel|Schwer|Experte|Meister', solved: 'Gelöst', locked1: 'Gesperrt',
        lvEasy: 'Leicht', lvMedium: 'Mittel', lvHard: 'Schwer',
        lvEasyDesc: 'Kurze, bekannte Wörter und kleine Felder. Gut für Kinder.', lvMediumDesc: 'Wörter bis 9 Buchstaben. Mittlere Felder.', lvHardDesc: 'Lange Wörter und große Felder.',
        menu: 'Menü', starsAria: 'Einen Stern als Hilfe nutzen ({0} übrig)', starsTitle: 'Einen Stern als Hilfe nutzen', accept: 'Gewähltes Wort annehmen', remove: '{0} entfernen',
        zGalaxy: 'Die ganze Galaxie zeigen', zArea: 'Die Gegend um dieses Feld zeigen', zField: 'Dieses Feld zeigen',
        map: 'Karte der Galaxie. Wische über Buchstaben, um ein Wort zu wählen. Ziehe woanders, um dich zu bewegen. Mit zwei Fingern oder dem Mausrad zoomen.',
        menuGalaxy: 'Galaxie {0} · {1}', copyLink: 'Fortschritts-Link kopieren', newGalaxy: 'Neue Galaxie …', allGames: 'Alle Spiele', close: 'Schließen', otherLang: 'English', otherLangAria: 'Play in English',
        ngTitle: 'Neue Galaxie', ngLevel: 'Schwierigkeit', ngNumber: 'Galaxie-Nummer', ngRandom: 'Zufällig', ngStart: 'Starten', ngCancel: 'Abbrechen',
        loadingWords: 'Die Wörter werden geladen …', loadFail: 'Die Wörter konnten nicht geladen werden. Prüfe die Verbindung und versuche es noch einmal.', firstGame: 'Wähle, wie schwer deine Galaxie sein soll.'
      }
    });
    var tb = S[this.lang] || S.en, str = tb[key] != null ? tb[key] : S.en[key], args = arguments;
    return String(str).replace(/\{(\d)\}/g, function (m, i) { return args[+i + 1]; });
  }
  levelName(lv) { return this.T(lv === 'easy' ? 'lvEasy' : lv === 'medium' ? 'lvMedium' : 'lvHard'); }
  fieldsText(n) { return n === 1 ? this.T('fields1') : this.T('fieldsN', n); }

  say(t, kind, title) { this.game.msg = t; this.game.msgKind = kind || 'info'; this.game.msgTitle = title || ''; }

  // a short meaning for a word, for learners
  meaning(word) {
    var d = this.words().defs.get(word);
    if (!d) return { title: word, text: this.T('noMeaning') };
    if (this.lang === 'de') {
      // German: word class and article, e.g. "HUND · Nomen, der:"
      return { title: word + ' · ' + d[0] + (d[1] ? ', ' + d[1] : '') + ':', text: d[2] + (d[3] ? ' („' + d[3] + '“)' : '') };
    }
    var head = word + ' · ' + d[0] + (d[1] ? ', ' + this.T('from') + ' ' + d[1] : '') + ':';
    return { title: head, text: d[2] + (d[3] ? ' (“' + d[3] + '”)' : '') };
  }

  // ---------- static data ----------
  world() {
    if (this._w) return this._w;
    var self = this;
    var DATA = this.generate(this.seed);
    var P = 28, M = 120, N = DATA.N, W = 2 * M + N * P;
    var fields = DATA.fields.map(function (f, i) {
      return { i: i, name: i === 0 ? self.T('core') : f.name, mods: f.mods, tier: f.tier, state0: f.state, goal: !!f.goal, words: f.words, len: f.len, shape: f.shape,
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
    // accepted words: the common ones, and every word of this galaxy's solution
    var dict = new Set(this.words().accept);
    regions.forEach(function (g) { dict.add(g.cells.map(function (j) { return cells[j].l; }).join('')); });
    this._w = { fields: fields, regions: regions, cells: cells, owner: owner, at: at, stars: stars, dict: dict, current: DATA.current, N: N, P: P, M: M, W: W };
    return this._w;
  }

  // ---------- word data (built once) ----------
  static get GEN() { return 4; }
  // all beginnings of accepted words, to stop searching early
  // accepted words of 4 to 6 letters as numbers (5 bits per letter), for fast checks while building a galaxy
  static letterCode(ch) { var c = ch.charCodeAt(0); return c >= 65 && c <= 90 ? c - 64 : ch === 'Ä' ? 27 : ch === 'Ö' ? 28 : ch === 'Ü' ? 29 : 31; }
  acceptCodes(old) {
    var W = this.words(), key = old ? 'acceptCodesOld' : 'acceptCodes';
    if (!W[key]) {
      var set = new Set();
      (old ? W.acceptOld : W.accept).forEach(function (w) {
        if (w.length < 4 || w.length > 6) return;
        var code = 0;
        for (var i = 0; i < w.length; i++) code = code * 32 + Component.letterCode(w[i]);
        set.add(code);
      });
      W[key] = set;
    }
    return W[key];
  }
  loadTrapCache(key) {
    try { var c = JSON.parse(localStorage.getItem('wordgalaxy:cache:' + key.split(':')[0])); return c && c.key === key ? c.fields : null; } catch (e) { return null; }
  }
  saveTrapCache(key, fields) {
    try { localStorage.setItem('wordgalaxy:cache:' + key.split(':')[0], JSON.stringify({ key: key, fields: fields })); } catch (e) {}
  }
  acceptPrefixes() {
    var W = this.words();
    if (!W.acceptPre) {
      var pre = new Set();
      W.accept.forEach(function (w) { for (var i = 1; i <= w.length; i++) pre.add(w.slice(0, i)); });
      W.acceptPre = pre;
    }
    return W.acceptPre;
  }
  wordSource(lang) {
    if (lang === 'de') return typeof window !== 'undefined' && window.WORDS_DE ? window.WORDS_DE : window.WORDS_DE;
    return window.WORDS;
  }
  words() {
    var lang = this.lang === 'de' ? 'de' : 'en';
    if (!this._wordsBy) this._wordsBy = {};
    if (this._wordsBy[lang]) return this._wordsBy[lang];
    var WD = this.wordSource(lang);
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
    function byLen(words) {
      var out = {};
      words.forEach(function (w) { if (w) (out[w.length] || (out[w.length] = [])).push(w); });
      return out;
    }
    var space = byLen(WD.space.split(' '));
    // accepted when selected: common words only (rare words make dead ends nobody thinks of), never rude ones
    var bad = new Set((WD.bad || '').split(' ')), accept = new Set();
    for (var ai = 0; ai < list.length; ai++) {
      var av = lv.charCodeAt(ai) - 48;
      if ((lang === 'de' ? av !== 9 : av <= 3) && !bad.has(list[ai])) accept.add(list[ai]);
    }
    WD.space.split(' ').forEach(function (w) { if (w) accept.add(w); });
    // words added for children later (level 7): galaxies from older generator versions must not see them
    var dictOld = new Set(), acceptOld = new Set();
    for (var oi = 0; oi < list.length; oi++) { if (lv.charCodeAt(oi) - 48 === 7) continue; dictOld.add(list[oi]); if (accept.has(list[oi])) acceptOld.add(list[oi]); }
    WD.space.split(' ').forEach(function (w) { if (w) acceptOld.add(w); });
    this._wordsBy[lang] = {
      dict: dict, defs: defs, N: WD.N, mask: WD.mask, lang: lang, accept: accept, dictOld: dictOld, acceptOld: acceptOld,
      pools: {
        easy: pool(function (l) { return l === 1; }),
        mid: pool(function (l) { return l <= 2; }),
        hard: pool(function (l) { return l >= 2 && l <= 4; }),
        space: space,
        // for children: well known, friendly words (checked by hand for German)
        kid: byLen((WD.kid || '').split(' ').filter(function (w) { return defs.has(w); })),
        kidSpace: byLen((WD.kidspace || '').split(' ')),
        // version 4: very easy words for children, then easy ones (German: checked by hand)
        kid1: byLen((WD.kid1 || WD.kid || '').split(' ').filter(function (w) { return defs.has(w); })),
        kid2: byLen((WD.kid2 || '').split(' ').filter(function (w) { return defs.has(w); })),
        all: pool(function (l) { return l !== 7; })
      }
    };
    return this._wordsBy[lang];
  }

  // ---------- the galaxy generator: the same seed always gives the same galaxy ----------
  // Only integer maths, Math.sqrt and stable sorts with fixed comparators, so every browser agrees.
  generate(seedIn) {
    var WDS = this.words();
    // overall difficulty: 'hard' is the original galaxy and must never change (saved games depend on it)
    var LV = this.level === 'easy' || this.level === 'medium' ? this.level : 'hard', HARD = LV === 'hard';
    // generator version: galaxies started before version 2 keep their words (their saves depend on them)
    var GEN2 = (this.gen || 1) >= 2, GEN3 = (this.gen || 1) >= 3, GEN4 = (this.gen || 1) >= 4, self = this;
    var KIDS = GEN4 && LV === 'easy';
    var seed = ((Math.floor(Math.abs(seedIn)) % 2147483646) + 1), seed0 = seed;
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
        // children: a very easy word again is better than a harder new one
        if (KIDS && p === 0 && arr.length) return pick(arr);
      }
      if (!HARD || WDS.lang !== 'en') {
        // easier galaxies (and German ones) may use a word twice, or take any word of that length
        for (p = 0; p < pools.length; p++) { var a2 = pools[p][len]; if (a2 && a2.length) return pick(a2); }
        var any = POOL.all[len]; if (any && any.length) return pick(any);
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
    var CORE = HARD ? 12 : LV === 'medium' ? 10 : 8;
    place(MID - CORE / 2, MID - CORE / 2, CORE, CORE); // the core
    // [rows, columns]: fields are taller than wide, so they fit a phone held upright
    var SIZES = {
      1: [[6, 5], [7, 5], [6, 5], [7, 6]],
      2: [[8, 6], [7, 6], [8, 6], [9, 7]],
      3: [[9, 7], [9, 6], [10, 7], [8, 6]],
      4: [[11, 8], [12, 8], [12, 9], [11, 7], [12, 7]],
      5: [[13, 9], [14, 10], [13, 10], [12, 9]]
    };
    if (LV === 'medium') SIZES = { 1: SIZES[1], 2: SIZES[2], 3: SIZES[3], 4: SIZES[4] };
    // small fields for children: a few short words each, so a field is solved quickly
    if (LV === 'easy') SIZES = { 1: [[5, 4], [6, 4], [5, 5], [6, 5]], 2: [[6, 5], [7, 5], [6, 4]], 3: [[7, 5], [7, 6], [6, 5]] };
    function tierAt(d) {
      if (LV === 'easy') return d < 2.9 ? 3 : d < 4.4 ? 2 : 1;
      if (LV === 'medium') return d < 2.9 ? 4 : d < 4.4 ? 3 : d < 5.4 ? 2 : 1;
      return d < 2.9 ? 5 : d < 4.4 ? 4 : d < 5.2 ? 3 : d < 5.8 ? 2 : 1;
    }
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      if (!mask[r][c] || owner[r][c] !== -1) continue;
      var t = tierAt(distOf(r, c));
      var tries = shuffle(SIZES[t].slice());
      if (t > 1) tries = tries.concat(shuffle(SIZES[t - 1].slice()));
      if (t > 2) tries = tries.concat(SIZES[t - 2]);
      tries = tries.concat(LV === 'easy' ? [[5, 4], [4, 4], [5, 3], [4, 3]] : [[6, 5], [7, 5], [5, 4], [5, 5], [6, 4], [4, 4]]);
      for (var q = 0; q < tries.length; q++) if (place(r, c, tries[q][0], tries[q][1])) break;
    }
    var D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // leftovers join the smallest touching field
    for (var pass = 0; pass < 20; pass++) {
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
        if (!mask[r][c] || owner[r][c] !== -1) continue;
        var best = -1, bestScore = 1e9;
        for (q = 0; q < 4; q++) {
          var o = own(r + D4[q][0], c + D4[q][1]);
          if (!(o > 0)) continue;
          // q 0 and 1 are below and above: joining there keeps fields tall, but not taller than 15 rows
          var fo = fields[o], rr0 = r, rr1 = r;
          for (var z = 0; z < fo.cells.length; z++) { if (fo.cells[z][0] < rr0) rr0 = fo.cells[z][0]; if (fo.cells[z][0] > rr1) rr1 = fo.cells[z][0]; }
          var sc2 = fo.cells.length + (q < 2 ? 0 : 25) + (rr1 - rr0 + 1 > 15 ? 200 : 0);
          if (sc2 < bestScore) { best = o; bestScore = sc2; }
        }
        if (best >= 0) { owner[r][c] = best; fields[best].cells.push([r, c]); }
      }
    }
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) if (owner[r][c] === -1) mask[r][c] = false;
    // tiny fields merge into a neighbour
    fields.forEach(function (f) {
      if (f.id === 0 || !f.cells.length || f.cells.length >= (LV === 'easy' ? 12 : 26)) return;
      var touch = [];
      f.cells.forEach(function (x) {
        for (var k = 0; k < 4; k++) {
          var o2 = own(x[0] + D4[k][0], x[1] + D4[k][1]);
          if (o2 !== undefined && o2 > 0 && o2 !== f.id && fields[o2].cells.length && touch.indexOf(o2) < 0) touch.push(o2);
        }
      });
      function boxWith(o2) {
        var r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
        fields[o2].cells.concat(f.cells).forEach(function (x) { r0 = Math.min(r0, x[0]); r1 = Math.max(r1, x[0]); c0 = Math.min(c0, x[1]); c1 = Math.max(c1, x[1]); });
        return [r1 - r0 + 1, c1 - c0 + 1];
      }
      // aim for a little taller than wide (about 1.4), like the screen of a phone held upright,
      // and never bigger than 15 rows by 11 columns
      function badness(o2) {
        var b = boxWith(o2);
        return Math.abs(b[0] / b[1] - 1.4) + (b[0] > 15 ? 10 + b[0] : 0) + (b[1] > 11 ? 10 + b[1] : 0);
      }
      touch.sort(function (a, b) { return (badness(a) - badness(b)) || (fields[a].cells.length - fields[b].cells.length); });
      if (!touch.length) return;
      var g = fields[touch[0]];
      f.cells.forEach(function (x) { owner[x[0]][x[1]] = g.id; g.cells.push(x); });
      f.cells = [];
    });
    fields = fields.filter(function (f) { return f.cells.length; });
    // fields wider than 11 columns (thin parts of the arms): split into a left and a right half
    function connected(cells) {
      var set = new Set(cells.map(function (x) { return K(x[0], x[1]); })), seen = new Set(), st = [cells[0]];
      seen.add(K(cells[0][0], cells[0][1]));
      while (st.length) {
        var x = st.pop();
        for (var k = 0; k < 4; k++) { var kk = K(x[0] + D4[k][0], x[1] + D4[k][1]); if (set.has(kk) && !seen.has(kk)) { seen.add(kk); st.push([x[0] + D4[k][0], x[1] + D4[k][1]]); } }
      }
      return seen.size === cells.length;
    }
    var split = [];
    fields.forEach(function (f, i) {
      if (i === 0) { split.push(f); return; }
      var c0 = 1e9, c1 = -1;
      f.cells.forEach(function (x) { c0 = Math.min(c0, x[1]); c1 = Math.max(c1, x[1]); });
      if (c1 - c0 + 1 <= 11 || f.cells.length < 40) { split.push(f); return; }
      var mid = Math.floor((c0 + c1 + 1) / 2), done = false;
      [0, 1, -1, 2, -2, 3, -3].forEach(function (dm) {
        if (done) return;
        var m = mid + dm;
        var left = f.cells.filter(function (x) { return x[1] < m; }), right = f.cells.filter(function (x) { return x[1] >= m; });
        if (left.length >= 20 && right.length >= 20 && connected(left) && connected(right)) { split.push({ cells: left }); split.push({ cells: right }); done = true; }
      });
      if (!done) split.push(f);
    });
    fields = split;
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
      if (!HARD) { levelField(f, i); return; }
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

    function levelField(f, i) {
      var n = f.cells.length;
      if (LV === 'easy') {
        if (i === 0) { f.tier = 3; f.len = [4, 6]; f.pools = KIDS ? [POOL.kidSpace, POOL.kid1, POOL.kid2] : [POOL.kidSpace, POOL.kid, POOL.easy]; f.mods.push('THEME'); return; }
        f.tier = Math.min(3, Math.max(tierAt(f.dist), n >= 40 ? 2 : 1, n >= 60 ? 3 : 1));
        f.len = f.tier < 3 ? [4, 5] : [4, 6];
        // version 4: only words for children; a word may come twice rather than a harder word
        f.pools = KIDS ? [POOL.kid1, POOL.kid2] : [POOL.kid, POOL.easy];
        if (rnd() < 0.5) f.mods.push('GIFT');
        return;
      }
      if (i === 0) { f.tier = 5; f.len = [5, 10]; f.pools = [POOL.space, POOL.mid, POOL.hard]; f.mods.push('THEME'); return; }
      f.tier = Math.min(4, Math.max(tierAt(f.dist), n >= 56 ? 2 : 1, n >= 80 ? 3 : 1, n >= 110 ? 4 : 1));
      var T = [null, [[4, 5], [POOL.easy]], [[4, 6], [POOL.easy, POOL.mid]], [[4, 7], [POOL.mid, POOL.easy]], [[4, 9], [POOL.mid, POOL.hard]]][f.tier];
      f.len = T[0]; f.pools = T[1];
      if (f.tier <= 2 && rnd() < 0.4) f.mods.push('GIFT');
      if (f.tier >= 3 && rnd() < 0.12) { f.mods.push('THEME'); f.pools = [POOL.space].concat(f.pools); }
    }

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
        // children find straight words (a row or a column, sometimes with one bend) much more easily
        var style = KIDS ? pick(['line', 'line', 'line', 'snake']) : pick(['spread', 'spread', 'snake', 'compact']);
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
              if (style === 'line') wt = touching !== 1 ? 0.05 : (qq[0] === start[0] || qq[1] === start[1]) ? 12 : 0.6;
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
    var cacheKey = [WDS.lang, LV, seedIn, this.gen, (GEN4 ? WDS.accept : WDS.acceptOld).size].join(':'), trapCache = GEN3 && !HARD ? self.loadTrapCache(cacheKey) : null, newCache = {};
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
      if (GEN2 && LV === 'easy') avoidLookalikes(f);
      if (GEN3 && !HARD) {
        // the swaps take a while: their result is kept in this browser and reused on the next visit
        var hit = trapCache && trapCache[f.id], added = [];
        if (hit && hit.w && hit.w.length === f.regions.length) {
          f.regions.forEach(function (reg, i) { if (hit.w[i].length === reg.cells.length) reg.word = hit.w[i]; });
          hit.u.forEach(function (w) { used.add(w); });
          added = hit.u;
        } else added = reduceTraps(f);
        newCache[f.id] = { w: f.regions.map(function (reg) { return reg.word; }), u: added };
      }
    });
    if (GEN3 && !HARD) self.saveTrapCache(cacheKey, newCache);

    // A trap is a word the player can select that is not a word of the solution: a dead end.
    // Easy and medium galaxies swap words until a field has few traps left.
    function reduceTraps(f) {
      var acc = self.acceptCodes(!GEN4);
      var cells = f.cells.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), n = cells.length;
      var idx = {}; cells.forEach(function (x, i) { idx[K(x[0], x[1])] = i; });
      var nb = cells.map(function (x) {
        var out = [];
        for (var d = 0; d < 4; d++) { var q = idx[K(x[0] + D4[d][0], x[1] + D4[d][1])]; if (q !== undefined) out.push(q); }
        return out;
      });
      var R = f.regions.length, regOf = new Int32Array(n), regPos = new Int32Array(n);
      f.regions.forEach(function (reg, ri) { reg.cells.forEach(function (x, i) { var q = idx[K(x[0], x[1])]; regOf[q] = ri; regPos[q] = i; }); });
      // every connected group of 4 to S cells, listed once (the shapes do not depend on the letters)
      var S = Math.min(f.len[1] + 1, 6), shapes = [], touch = []; for (var r0 = 0; r0 < R; r0++) touch.push([]);
      var mark = new Uint8Array(n);
      function record(sub) {
        if (sub.length < 4) return;
        var sh = sub.slice().sort(function (a, b) { return a - b; }), rs = [];
        for (var a = 0; a < sh.length; a++) { var rg = regOf[sh[a]]; if (rs.indexOf(rg) < 0) rs.push(rg); }
        // the solution's own word is no trap
        if (rs.length === 1 && f.regions[rs[0]].cells.length === sh.length) return;
        var id = shapes.length; shapes.push(sh);
        rs.forEach(function (rg) { touch[rg].push(id); });
      }
      function grow(v, sub, untried) {
        while (untried.length) {
          var u = untried.pop();
          sub.push(u); record(sub);
          if (sub.length < S) {
            var added = [];
            nb[u].forEach(function (w) { if (w > v && !mark[w]) { mark[w] = 1; added.push(w); } });
            grow(v, sub, untried.concat(added));
            added.forEach(function (w) { mark[w] = 0; });
          }
          sub.pop();
        }
      }
      for (var v = 0; v < n; v++) {
        var untried = [];
        mark.fill(0); mark[v] = 1;
        nb[v].forEach(function (w) { if (w > v) { mark[w] = 1; untried.push(w); } });
        grow(v, [v], untried);
      }
      var L = new Int32Array(n), trap = new Uint8Array(shapes.length), total = 0;
      function letters() { for (var q = 0; q < n; q++) L[q] = Component.letterCode(f.regions[regOf[q]].word[regPos[q]]); }
      function isTrap(id) { var sh = shapes[id], code = 0; for (var a = 0; a < sh.length; a++) code = code * 32 + L[sh[a]]; return acc.has(code) ? 1 : 0; }
      letters();
      for (var id0 = 0; id0 < shapes.length; id0++) { trap[id0] = isTrap(id0); total += trap[id0]; }
      function perRegion(rg) { var c = 0, t = touch[rg]; for (var a = 0; a < t.length; a++) c += trap[t[a]]; return c; }
      // traps after giving region rg another word (only the shapes touching it can change)
      function tryWord(rg, w) {
        var old = f.regions[rg].word; f.regions[rg].word = w; letters();
        var t = touch[rg], d = 0;
        for (var a = 0; a < t.length; a++) d += isTrap(t[a]) - trap[t[a]];
        f.regions[rg].word = old; letters();
        return total + d;
      }
      function setWord(rg, w) {
        f.regions[rg].word = w; letters();
        var t = touch[rg];
        for (var a = 0; a < t.length; a++) { var nt = isTrap(t[a]); total += nt - trap[t[a]]; trap[t[a]] = nt; }
      }
      // own random numbers, so the rest of the galaxy does not depend on the swaps
      var ls = ((seed0 * 31 + f.id * 7919) % 2147483646) + 1;
      function lrnd() { ls = (ls * 16807) % 2147483647; return (ls - 1) / 2147483646; }
      function fresh(len, pools) {
        for (var p = 0; p < pools.length; p++) {
          var arr = pools[p][len]; if (!arr) continue;
          var c = arr.filter(function (w) { return !used.has(w); });
          if (c.length) return c[Math.floor(lrnd() * c.length)];
          if (KIDS && p === 0 && arr.length) return arr[Math.floor(lrnd() * arr.length)];
        }
        return null;
      }
      var target = LV === 'easy' ? 0 : Math.floor(R * 0.8), stuck = {}, added = [];
      for (var round = 0; round < 2 * R && total > target; round++) {
        var worst = -1, wc = 0;
        for (var r = 0; r < R; r++) { if (stuck[r]) continue; var c = perRegion(r); if (c > wc) { wc = c; worst = r; } }
        if (worst < 0) break;
        var len = f.regions[worst].cells.length, best = total, bestWord = null;
        for (var t2 = 0; t2 < 3; t2++) {
          var cand = fresh(len, f.pools);
          if (!cand) break;
          var tt = tryWord(worst, cand);
          if (tt < best) { best = tt; bestWord = cand; }
        }
        if (bestWord) { setWord(worst, bestWord); used.add(bestWord); added.push(bestWord); } else stuck[worst] = 1;
      }
      return added;
    }

    // A word is confusing when one letter more or one letter less also makes a word,
    // e.g. GEHÖR next to a T (GEHÖRT). For children, pick other words until nothing like that is left.
    function avoidLookalikes(f) {
      var dict = GEN4 ? WDS.dict : WDS.dictOld;
      function letters() {
        var at = {};
        f.regions.forEach(function (reg) { reg.cells.forEach(function (x, i) { at[K(x[0], x[1])] = reg.word[i]; }); });
        return at;
      }
      function read(cells, at) {
        return cells.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (x) { return at[K(x[0], x[1])]; }).join('');
      }
      function joined(cells) {
        if (!cells.length) return false;
        var set = {}, seen = {}, st = [cells[0]], n = 0;
        cells.forEach(function (x) { set[K(x[0], x[1])] = 1; });
        seen[K(cells[0][0], cells[0][1])] = 1;
        while (st.length) {
          var x = st.pop(); n++;
          for (var d = 0; d < 4; d++) { var kk = K(x[0] + D4[d][0], x[1] + D4[d][1]); if (set[kk] && !seen[kk]) { seen[kk] = 1; st.push([x[0] + D4[d][0], x[1] + D4[d][1]]); } }
        }
        return n === cells.length;
      }
      function confusing(reg, at) {
        var mine = {};
        reg.cells.forEach(function (x) { mine[K(x[0], x[1])] = 1; });
        // one letter less (the rest still touching)
        if (reg.cells.length > 4) for (var i = 0; i < reg.cells.length; i++) {
          var rest = reg.cells.filter(function (x, j) { return j !== i; });
          if (joined(rest) && dict.has(read(rest, at))) return true;
        }
        // one letter more from a neighbouring cell of the same field
        var tried = {};
        for (var a = 0; a < reg.cells.length; a++) for (var d = 0; d < 4; d++) {
          var y = reg.cells[a][0] + D4[d][0], x2 = reg.cells[a][1] + D4[d][1], kk = K(y, x2);
          if (mine[kk] || tried[kk] || at[kk] === undefined) continue;
          tried[kk] = 1;
          if (dict.has(read(reg.cells.concat([[y, x2]]), at))) return true;
        }
        return false;
      }
      for (var round = 0; round < 8; round++) {
        var at = letters(), bad = f.regions.filter(function (reg) { return confusing(reg, at); });
        if (!bad.length) return;
        bad.forEach(function (reg) { reg.word = word(reg.cells.length, f.pools); });
      }
    }

    // start: a very easy field at the tip of an arm; everything else locked
    function isTall(f) {
      var r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
      f.cells.forEach(function (x) { r0 = Math.min(r0, x[0]); r1 = Math.max(r1, x[0]); c0 = Math.min(c0, x[1]); c1 = Math.max(c1, x[1]); });
      return r1 - r0 > c1 - c0 ? 1 : 0;
    }
    function isRect(f) {
      var r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
      f.cells.forEach(function (x) { r0 = Math.min(r0, x[0]); r1 = Math.max(r1, x[0]); c0 = Math.min(c0, x[1]); c1 = Math.max(c1, x[1]); });
      return f.cells.length === (r1 - r0 + 1) * (c1 - c0 + 1) ? 1 : 0;
    }
    var startCands = fields.filter(function (f) { return f.tier === 1 && f.r > MID; });
    if (!startCands.length) startCands = fields.filter(function (f) { return f.tier === 1; });
    startCands = fields.filter(function (f) { return f.tier === 1; });
    function low(f) { return f.r > MID ? 1 : 0; }
    startCands.sort(function (a, b) { return (isTall(b) - isTall(a)) || (low(b) - low(a)) || (isRect(b) - isRect(a)) || (b.dist - a.dist) || (a.id - b.id); });
    var current = startCands[0].id;
    // more starting points, as far from each other as possible (no random numbers, so the galaxy itself stays the same)
    var starts = [startCands[0]], NS = LV === 'easy' ? 4 : 2;
    while (starts.length < NS && starts.length < startCands.length) {
      var best = null, bestD = -1;
      startCands.forEach(function (f) {
        if (starts.indexOf(f) >= 0) return;
        var dmin = 1e18;
        starts.forEach(function (o) { var dr = f.r - o.r, dc = f.c - o.c; dmin = Math.min(dmin, dr * dr + dc * dc); });
        if (dmin > bestD) { bestD = dmin; best = f; }
      });
      starts.push(best);
    }
    var startIds = starts.map(function (f) { return f.id; });

    var regions = [], cellReg = {};
    fields.forEach(function (f) {
      var isStart = GEN2 && LV === 'easy' ? startIds.indexOf(f.id) >= 0 : f.id === current;
      var gift = isStart && (f.mods.indexOf('GIFT') >= 0 || LV === 'easy') ? pick(f.regions) : null;
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
        return { name: f.name, mods: f.mods, tier: f.tier, state: startIds.indexOf(f.id) >= 0 ? 'O' : 'L', goal: f.id === 0 ? 1 : 0, words: f.regions.length, len: f.len, shape: '' };
      })
    };
  }

  reseed(n, level) {
    var self = this;
    this.seedText = String(n);
    this.say(this.T('building', n), 'info');
    this.bump();
    setTimeout(function () {
      var old = { w: self._w, seed: self.seed, level: self.level, gen: self.gen, game: self.game, focus: self.focus };
      try {
        self.seed = n; self._w = null; self._grp = null; self.fx = null; self.gen = Component.GEN;
        if (level) self.level = self.cleanLevel(level);
        self.world();
        self.newGame();
        self.focus = self.world().current;
        self.dirtyAll();
        self.seedMode = false;
        self.save();
        self.say(self.T('ready', n), 'good');
        self.cam = self.camFor('galaxy', self.focus);
        self.paint(); self.bump();
        self.flyTo(self.camFor('field', self.focus));
      } catch (err) {
        self._w = old.w; self.seed = old.seed; self.level = old.level; self.gen = old.gen; self.game = old.game; self.focus = old.focus;
        self.say(self.T('seedFail', n, err.message), 'warn');
        self.bump();
      }
    }, 30);
  }

  // ---------- saving: one game in this browser ----------
  cleanLevel(lv) { return lv === 'easy' || lv === 'medium' ? lv : 'hard'; }
  saveKey(lang, kind) { return 'wordgalaxy:' + (kind || 'save') + (lang === 'de' ? ':de' : ''); }
  storedLang() { try { var l = localStorage.getItem('wordgalaxy:lang'); return l === 'de' || l === 'en' ? l : null; } catch (e) { return null; } }
  hasWords(lang) { try { return !!this.wordSource(lang); } catch (e) { return false; } }
  loadSave(lang) {
    try {
      var raw = typeof localStorage !== 'undefined' && localStorage.getItem(this.saveKey(lang));
      var sv = raw && JSON.parse(raw);
      return sv && sv.v === 1 && typeof sv.seed === 'number' ? sv : null;
    } catch (e) { return null; }
  }
  saveHasProgress(sv) {
    return !!sv && (sv.words.some(function (x) { return !x[3]; }) || sv.state.indexOf('S') >= 0);
  }
  hasProgress() {
    var g = this.game;
    return g.words.some(function (wd) { return wd.alive && !wd.gift; }) || g.state.indexOf('S') >= 0;
  }
  save() {
    var sv = this.saveData();
    try { if (typeof localStorage !== 'undefined') { localStorage.setItem(this.saveKey(this.lang), JSON.stringify(sv)); localStorage.setItem('wordgalaxy:lang', this.lang); } } catch (e) {}
  }
  saveData() {
    var g = this.game, alive = [], index = {};
    g.words.forEach(function (wd) { if (wd.alive) { index[wd.id] = alive.length; alive.push([wd.cells, wd.colour, wd.correct ? 1 : 0, wd.gift ? 1 : 0]); } });
    var wrong = Object.keys(g.wrongMarked).map(function (id) { return index[id]; }).filter(function (x) { return x != null; });
    return { v: 1, seed: this.seed, level: this.level, lang: this.lang, gen: this.gen || 1, focus: this.focus, state: g.state, words: alive, used: g.used, hints: g.hints, wrong: wrong };
  }

  // ---------- moving progress to another device: the whole save in a link ----------
  // The code is the save as JSON, with word cells as differences (small numbers), deflated, in base64url.
  exportCode() {
    var sv = this.saveData();
    var c = { v: 1, seed: sv.seed, level: sv.level, lang: sv.lang, gen: sv.gen, focus: sv.focus, state: sv.state.join(''), used: sv.used, hints: sv.hints, wrong: sv.wrong,
      words: sv.words.map(function (x) { var d = x[0].map(function (j, i) { return i ? j - x[0][i - 1] : j; }); return [d, x[1], x[2], x[3]]; }) };
    var json = JSON.stringify(c);
    var b64 = function (bytes) {
      var bin = '', u = new Uint8Array(bytes);
      for (var i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    var raw = new TextEncoder().encode(json);
    if (typeof CompressionStream === 'undefined') return Promise.resolve('j' + b64(raw));
    return new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
      .then(function (buf) { return 'z' + b64(buf); });
  }
  importCode(code) {
    var kind = code.charAt(0), s = code.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var done = function (text) {
      var c = JSON.parse(text);
      if (!c || c.v !== 1 || typeof c.seed !== 'number') throw new Error('not a Word Galaxy progress link');
      return { v: 1, seed: c.seed, level: c.level || 'hard', lang: c.lang === 'de' ? 'de' : 'en', gen: c.gen || 1, focus: c.focus, state: c.state.split(''), used: c.used, hints: c.hints, wrong: c.wrong,
        words: c.words.map(function (x) { var cells = [], a = 0; x[0].forEach(function (d, i) { a = i ? a + d : d; cells.push(a); }); return [cells, x[1], x[2], x[3]]; }) };
    };
    if (kind === 'j') return Promise.resolve(done(new TextDecoder().decode(u)));
    if (kind !== 'z' || typeof DecompressionStream === 'undefined') return Promise.reject(new Error('this browser can not read the link'));
    return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text().then(done);
  }
  shareBase() {
    var l = typeof location !== 'undefined' ? location : null;
    if (l && /^https?:$/.test(l.protocol) && /word-galaxy/.test(l.pathname)) return l.origin + l.pathname;
    return 'https://martin.ankerl.com/games/word-galaxy/';
  }
  doShare() {
    var self = this;
    this.bump();
    this.exportCode().then(function (code) {
      var url = self.shareBase() + '#p=' + code;
      var told = function () { self.say(self.T('linkOpen'), 'good', self.T('linkCopied')); self.bump(); };
      var fail = function () { self.say(self.T('copyFail'), 'warn'); self.bump(); };
      var coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
      if (coarse && typeof navigator !== 'undefined' && navigator.share) {
        navigator.share({ title: self.T('shareTitle'), url: url }).then(function () { self.say(self.T('linkOpen'), 'good', self.T('linkSent')); self.bump(); }).catch(function () {});
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(url).then(told, fail);
      } else fail();
    }, function (err) { self.say(self.T('linkFail', err.message), 'warn'); self.bump(); });
  }
  // a progress link was opened: load it, and ask first when this browser has progress of its own
  offerImport(sv) {
    var self = this, solved = function (st) { return st.filter(function (x) { return x === 'S'; }).length; };
    var apply = function () {
      try {
        var old = localStorage.getItem(self.saveKey(sv.lang));
        if (old) localStorage.setItem(self.saveKey(sv.lang, 'backup'), old);
        localStorage.setItem(self.saveKey(sv.lang), JSON.stringify(sv));
        localStorage.setItem('wordgalaxy:lang', sv.lang);
      } catch (e) { self.say(self.T('saveFail'), 'warn'); self.bump(); return; }
      location.replace(location.pathname);
    };
    // the link replaces the saved galaxy of its own language
    var mine = sv.lang === this.lang ? this.saveData() : this.loadSave(sv.lang);
    if (!mine || !this.saveHasProgress(mine)) { apply(); return; }
    var desc = function (x) { return self.T('galaxyDesc', x.seed, self.levelName(self.cleanLevel(x.level)), self.fieldsText(solved(x.state))); };
    this.confirm = { title: this.T('loadTitle'), text: this.T('loadText', desc(sv), desc(mine)), yes: this.T('loadYes'), no: this.T('loadNo'), action: apply };
    this.bump();
  }
  restore(sv) {
    var w = this.world(), g = this.game, self = this;
    if (!sv.state || sv.state.length !== w.fields.length) return false;
    g.words = []; g.cellWord.fill(-1);
    var ids = [];
    sv.words.forEach(function (x) {
      var ok = x[0].every(function (j) { return j >= 0 && j < w.cells.length && g.cellWord[j] < 0; });
      if (!ok) { ids.push(-1); return; }
      var id = self.addWord(x[0].slice(), x[1], !!x[2]);
      if (x[3]) g.words[id].gift = true;
      ids.push(id);
    });
    g.state = sv.state.slice();
    // starting points added later are open in older saves too
    w.fields.forEach(function (f, i) { if (f.state0 === 'O' && g.state[i] === 'L') g.state[i] = 'O'; });
    if (sv.used && sv.used.length === w.fields.length) g.used = sv.used.slice();
    if (sv.hints && sv.hints.length === w.fields.length) g.hints = sv.hints;
    (sv.wrong || []).forEach(function (i) { if (ids[i] >= 0) g.wrongMarked[ids[i]] = 1; });
    if (sv.focus >= 0 && sv.focus < w.fields.length) this.focus = sv.focus;
    this.recalcLit();
    if (this.hasProgress()) this.say(this.T('welcome'), 'info');
    return true;
  }
  requestBuild(n, level) {
    var self = this;
    if (this.hasProgress()) {
      this.confirm = { title: this.T('newTitle'), text: this.T('newText', this.seed), yes: this.T('newYes'), no: this.T('keepPlaying'), action: function () { self.reseed(n, level); } };
      this.bump();
    } else this.reseed(n, level);
  }
  // switch the language: keep this galaxy saved, and continue the saved galaxy of the other language
  changeLang(to) {
    var self = this;
    if (!this.hasWords(to)) {
      if (typeof window !== 'undefined' && window.loadWords) {
        this.say(this.T('loadingWords'), 'info'); this.bump();
        window.loadWords(to, function (ok) { if (ok && self.hasWords(to)) self.changeLang(to); else { self.say(self.T('loadFail'), 'warn'); self.bump(); } });
      }
      return;
    }
    this.save();
    var sv = this.loadSave(to);
    this.lang = to;
    try { localStorage.setItem('wordgalaxy:lang', to); } catch (e) {}
    this.seed = sv ? sv.seed : 23; this.level = sv ? this.cleanLevel(sv.level) : 'medium'; this.gen = sv ? (sv.gen || 1) : Component.GEN;
    this._w = null; this._grp = null; this.fx = null;
    this.world();
    this.newGame();
    this.focus = this.world().current;
    if (sv) this.restore(sv); else this.say(this.T('howTo'), 'info');
    this.dirtyAll();
    this.cam = this.camFor('field', this.focus);
    if (!sv) { this.save(); this.newOpen = true; this.newLevel = this.level; this.seedText = String(Math.floor(Math.random() * 1000000)); this.say(this.T('firstGame'), 'info'); }
    this.paint(); this.bump();
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
      msg: this.T('howTo'), msgKind: 'info', msgTitle: ''
    };
    this.game = g;
    var self = this;
    w.regions.forEach(function (r) { if (r.found0) { var id = self.addWord(r.cells.slice(), r.colour0 >= 0 ? r.colour0 : self.pickColour(r.cells), true); g.words[id].gift = true; } });
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
      else { self._anim = 0; self.settle(); if (done) done(); }
    }
    this._anim = requestAnimationFrame(step);
  }
  toWorld(px, py) { var c = this.cam; return { x: (px - this.VW / 2) / c.s + c.x, y: (py - this.VH / 2) / c.s + c.y }; }

  // ---------- drawing ----------
  setupCanvas(el) {
    if (!el || el === this._cv) return;
    var first = !this.ctx;
    this._cv = el;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    // 2x is sharp enough for these letters, and far fewer pixels to move than 2.6x or 3x
    this.dpr = Math.min(2, dpr);
    var W = Math.round(this.VW * this.dpr), H = Math.round(this.VH * this.dpr);
    // setting the size clears the canvas, so only do it when the size really changed (phones resize often)
    var changed = el.width !== W || el.height !== H;
    if (changed) { el.width = W; el.height = H; }
    this.ctx = el.getContext('2d', { alpha: false });
    var self = this;
    if (first) {
      this.dirtyAll();
      // the letters' font arrives later: redraw, but keep showing the old tiles until the new ones are ready
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self.dirtyAll(true); });
    } else if (changed && this.cam && this._w) this.render();
  }
  // the motion layer: twice the size of the view in each direction, drawn at 1x.
  // While the view moves, the browser only moves and scales this picture (a GPU job), so motion stays smooth.
  setupLo(el) {
    if (!el || el === this._lo) return;
    this._lo = el;
    this.loM = 0.5;
    var LW = Math.round(this.VW * (1 + 2 * this.loM)), LH = Math.round(this.VH * (1 + 2 * this.loM));
    el.style.width = LW + 'px'; el.style.height = LH + 'px';
    el.style.left = Math.round(-this.VW * this.loM) + 'px'; el.style.top = Math.round(-this.VH * this.loM) + 'px';
    if (el.width !== LW || el.height !== LH) { el.width = LW; el.height = LH; }
    this.loW = LW; this.loH = LH;
    this.loCtx = el.getContext('2d', { alpha: false });
    this.loCam = null;
  }
  draw() { this.paint(); }

  // the selected letters, when they form a word from the word list (no hint: any listed word counts)
  validSelection() {
    var w = this.world(), g = this.game;
    if (g.state[this.focus] !== 'O' || g.picked >= 0) return null;
    var sel = Object.keys(g.sel).map(Number).filter(function (j) { return g.cellWord[j] < 0; });
    if (sel.length < 4) return null;
    sel.sort(function (a, b) { return w.cells[a].r - w.cells[b].r || w.cells[a].c - w.cells[b].c; });
    var inSel = {}; sel.forEach(function (j) { inSel[j] = 1; });
    var seen = {}, stack = [sel[0]], n = 0; seen[sel[0]] = 1;
    while (stack.length) { var j = stack.pop(); n++; w.cells[j].nb.forEach(function (q) { if (q >= 0 && inSel[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }); }
    if (n !== sel.length) return null;
    if (!w.dict.has(sel.map(function (j) { return w.cells[j].l; }).join(''))) return null;
    return sel;
  }
  // a small accept button next to a valid selection, so the finger does not travel to the bottom bar
  quickPos() {
    var d = this.drag;
    if (this.moving || this._anim) return null;
    if (d && (d.mode === 'paint' || d.mode === 'pinch' || d.moved)) return null;
    var g = this.game, w = this.world(), kind = 'accept', j;
    if (g.picked >= 0 && g.words[g.picked] && g.words[g.picked].alive) {
      // a held word: the remove button goes on the letter that was held
      var pc = g.words[g.picked].cells;
      kind = 'remove';
      j = pc.indexOf(this.pickCell) >= 0 ? this.pickCell : pc[pc.length - 1];
    } else {
      var sel = this.validSelection();
      if (!sel) return null;
      // next to the last letter: the one the finger stopped on, else the last one in reading order
      j = g.sel[this.lastCell] && sel.indexOf(this.lastCell) >= 0 ? this.lastCell : sel[sel.length - 1];
    }
    var c = this.cam, s = c.s, P = w.P, B = 44;
    var o = w.cells[j];
    var cx = (o.x + P - c.x) * s + this.VW / 2, cy = (o.y - c.y) * s + this.VH / 2;
    // centre on the upper right corner of that letter, so it covers only a part of it
    var x = cx - B / 2, y = cy - B / 2;
    x = Math.round(Math.min(this.VW - B - 4, Math.max(4, x)));
    y = Math.round(Math.min(this.VH - B - 4, Math.max(4, y)));
    return { x: x, y: y, kind: kind };
  }
  refreshQuick() {
    var q = this.quickPos(), o = this.quick;
    if ((!q && !o) || (q && o && q.x === o.x && q.y === o.y && q.kind === o.kind)) return;
    this.quick = q;
    this.bump();
  }
  // called on every camera change; the sharp redraw comes when the view stands still
  moved() {
    var self = this;
    if (this._lo && !this.moving) {
      this.moving = true;
      var L = this.loCam, c0 = this.cam;
      if (!L || this.loMissing || this.loVer !== this._ver || Math.abs(L.s / c0.s - 1) > 0.3) this.renderLo();
      // the sharp picture stays visible and moves along (see updateLo); no switch to the blurrier one
      this.refreshQuick();
    }
    if (this._idle) clearTimeout(this._idle);
    this._idle = setTimeout(function () {
      self._idle = 0;
      if (!self.moving) return;
      self.moving = false;
      self.render();
      self.refreshQuick();
    }, 140);
    this.paint();
  }
  // the view stands still: draw it sharp and show it
  settle() {
    if (this._idle) { clearTimeout(this._idle); this._idle = 0; }
    if (!this.moving) return;
    this.moving = false;
    this.render();
    this.refreshQuick();
  }
  paint() {
    var self = this;
    if (this._raf || !this.ctx) return;
    this._raf = requestAnimationFrame(function () {
      self._raf = 0;
      if (self.moving && self._lo) self.updateLo(); else self.render();
    });
  }
  renderLo() {
    var c = this.cam;
    this.loCam = { x: c.x, y: c.y, s: c.s };
    this.loVer = this._ver;
    this.loMissing = this.renderBase(this.loCtx, this.loW, this.loH, 1, this.loCam);
    this._lo.style.transform = 'none';
  }
  // while the view stands still the motion layer lies hidden under the sharp canvas: draw it there, a little per frame
  prepareLo() {
    var self = this;
    if (!this._lo || this.moving || this._prepLo) return;
    var L = this.loCam, c = this.cam;
    if (L && !this.loMissing && this.loVer === this._ver && L.x === c.x && L.y === c.y && L.s === c.s) return;
    this._prepLo = setTimeout(function () {
      self._prepLo = 0;
      if (self.moving || self.drag) { if (!self.moving) self.prepareLo(); return; }
      self.renderLo();
      if (self.loMissing) self.prepareLo();
    }, 120);
  }
  // per frame while moving: only a CSS transform, unless the picture no longer covers the view
  updateLo() {
    var c = this.cam, L = this.loCam;
    if (!L) { this.renderLo(); L = this.loCam; }
    var k = c.s / L.s;
    var halfW = this.VW / 2 / c.s, halfH = this.VH / 2 / c.s;
    var coverW = this.loW / 2 / L.s, coverH = this.loH / 2 / L.s;
    var outside = Math.abs(c.x - L.x) + halfW > coverW || Math.abs(c.y - L.y) + halfH > coverH;
    // also redraw when the letters changed while moving (e.g. selecting while the view scrolls by itself)
    if (outside || k > 1.8 || k < 0.55 || this.loMissing || this.loVer !== this._ver) { this.renderLo(); L = this.loCam; k = 1; }
    var tx = (L.x - c.x) * c.s, ty = (L.y - c.y) * c.s;
    this._lo.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + k.toFixed(5) + ')';
    // the sharp picture moves the same way on top; the motion layer only fills the edges that come into view.
    // When letters changed while moving, or the zoom changed a lot, the sharp picture is out of date: hide it.
    var M = this.mainCam, cv = this._cv;
    if (cv) {
      var km = M ? c.s / M.s : 0;
      if (!M || this.mainVer !== this._ver || km > 2.2 || km < 0.45) cv.style.opacity = '0';
      else {
        cv.style.transform = 'translate(' + ((M.x - c.x) * c.s).toFixed(2) + 'px,' + ((M.y - c.y) * c.s).toFixed(2) + 'px) scale(' + km.toFixed(5) + ')';
        cv.style.opacity = '1';
      }
    }
    if (this.loMissing) this.paint();
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
    // the glow from solved neighbours is switched off: it distracted from the letters
    this.glow = [];
    this.dirtyAll();
  }

  // ---------- zoom strip: galaxy -> area -> field, joined by lines like a NASA zoom picture ----------
  setupZoom(el) {
    if (!el || el === this._zc) return;
    this._zc = el;
    var dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.zDpr = dpr;
    this.zW = this.VW; this.zH = 70;
    el.width = Math.round(this.zW * dpr); el.height = Math.round(this.zH * dpr);
    this.zCtx = el.getContext('2d');
    this._zoomKey = null;
    this.paint();
  }
  zoomLayout() {
    var W = this.zW || this.VW, gap = 24, m = 9, pw = Math.floor((W - 2 * m - 2 * gap) / 3), ph = 58;
    return [0, 1, 2].map(function (i) { return { x: m + i * (pw + gap), y: 6, w: pw, h: ph }; });
  }
  zoomLevel() {
    var s = this.cam.s;
    if (s >= this.fieldScale(this.focus) * 0.7) return 2;
    if (s >= this.camFor('area', this.focus).s * 0.5) return 1;
    return 0;
  }
  // the world rectangles the three pictures show
  zoomRects() {
    var w = this.world(), f = w.fields[this.focus], P = w.P, L = this.zoomLayout(), asp = L[0].w / L[0].h;
    function fit(x0, y0, x1, y1) {
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rw = x1 - x0, rh = y1 - y0;
      if (rw / rh < asp) rw = rh * asp; else rh = rw / asp;
      return { x0: cx - rw / 2, y0: cy - rh / 2, x1: cx + rw / 2, y1: cy + rh / 2 };
    }
    var fr = fit(f.x0 - P, f.y0 - P, f.x1 + P, f.y1 + P);
    var as = this.camFor('area', this.focus).s, aw = this.VW / as;
    var cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    var ar = fit(Math.min(cx - aw / 2, fr.x0 - 2 * P), Math.min(cy - aw / asp / 2, fr.y0 - 2 * P), Math.max(cx + aw / 2, fr.x1 + 2 * P), Math.max(cy + aw / asp / 2, fr.y1 + 2 * P));
    var gr = fit(0, 0, w.W, w.W);
    return [gr, ar, fr];
  }
  renderZoomStrip() {
    var ctx = this.zCtx; if (!ctx) return;
    var dpr = this.zDpr, L = this.zoomLayout(), R = this.zoomRects(), self = this, missing = false;
    var level = this.zoomLevel();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, this._zc.width, this._zc.height);
    this._zp = this._zp || [];
    L.forEach(function (b, i) {
      var pc = self._zp[i];
      if (!pc) { pc = self._zp[i] = document.createElement('canvas'); }
      var PW = Math.round(b.w * dpr), PH = Math.round(b.h * dpr);
      if (pc.width !== PW || pc.height !== PH) { pc.width = PW; pc.height = PH; }
      var r = R[i], s = b.w / (r.x1 - r.x0);
      if (self.renderBase(pc.getContext('2d'), b.w, b.h, dpr, { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, s: s }, true)) missing = true;
      ctx.drawImage(pc, Math.round(b.x * dpr), Math.round(b.y * dpr));
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // a box for the next picture, and two lines from the box to it
    function boxIn(i) {
      var b = L[i], r = R[i], n = R[i + 1], k = b.w / (r.x1 - r.x0);
      return { x0: b.x + (n.x0 - r.x0) * k, y0: b.y + (n.y0 - r.y0) * k, x1: b.x + (n.x1 - r.x0) * k, y1: b.y + (n.y1 - r.y0) * k };
    }
    ctx.lineWidth = 1.2;
    [0, 1].forEach(function (i) {
      var q = boxIn(i), nb = L[i + 1];
      var x0 = Math.max(L[i].x, q.x0), y0 = Math.max(L[i].y, q.y0), x1 = Math.min(L[i].x + L[i].w, q.x1), y1 = Math.min(L[i].y + L[i].h, q.y1);
      ctx.strokeStyle = 'rgba(238,240,247,0.9)';
      ctx.strokeRect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0));
      ctx.strokeStyle = 'rgba(201,209,234,0.5)';
      ctx.beginPath();
      ctx.moveTo(x1, y0); ctx.lineTo(nb.x, nb.y);
      ctx.moveTo(x1, y1); ctx.lineTo(nb.x, nb.y + nb.h);
      ctx.stroke();
    });
    // frames: the current zoom in gold
    L.forEach(function (b, i) {
      ctx.strokeStyle = i === level ? '#f2c063' : '#2e3a62';
      ctx.lineWidth = i === level ? 2.5 : 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, 6); else ctx.rect(b.x, b.y, b.w, b.h);
      ctx.stroke();
    });
    this._zoomMissing = missing;
  }
  updateZoomStrip() {
    if (!this.zCtx) return;
    var g = this.game, key = [this.seed, this.focus, this.zoomLevel(), g.words.length, g.state.join(''), this.VW].join('|');
    if (key === this._zoomKey && !this._zoomMissing) return;
    this._zoomKey = key;
    this.renderZoomStrip();
    if (this._zoomMissing) this.paint();
  }

  render() {
    if (!this.ctx) return;
    var c = this.cam, s = c.s, ox = this.VW / 2 - c.x * s, oy = this.VH / 2 - c.y * s;
    this.renderBase(this.ctx, this.VW, this.VH, this.dpr, c);
    // the sharp canvas now shows exactly this view
    this.mainCam = { x: c.x, y: c.y, s: c.s }; this.mainVer = this._ver;
    if (this._cv) { this._cv.style.transform = 'none'; this._cv.style.opacity = '1'; }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.renderOverlay(ox, oy, s);
    if (this.fx) this.renderFx(ox, oy, s);
    this.updateZoomStrip();
    this.prepareLo();
  }

  // background, stars and the cached letter tiles for one canvas; returns true while some tiles are still missing
  renderBase(ctx, VW, VH, dpr, c, small) {
    var w = this.world();
    var DW = Math.round(VW * dpr), DH = Math.round(VH * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, DW, DH);
    var s = c.s, sd = s * dpr, oxd = (VW / 2 - c.x * s) * dpr, oyd = (VH / 2 - c.y * s) * dpr;
    ctx.fillStyle = '#dfe6ff';
    // small pictures: only every fourth star, and fainter
    for (var i = 0; i < w.stars.length; i += small ? 4 : 1) {
      var st = w.stars[i], sx = st[0] * sd + oxd, sy = st[1] * sd + oyd;
      if (sx < -8 || sy < -8 || sx > DW + 8 || sy > DH + 8) continue;
      ctx.globalAlpha = small ? st[3] * 0.6 : st[3];
      var d = Math.max(dpr, st[2] * dpr * Math.min(2, s * 4));
      ctx.fillRect(sx, sy, d, d);
    }
    ctx.globalAlpha = 1;
    return this.drawTiles(ctx, sd, oxd, oyd, DW, DH, dpr);
  }

  // ---------- tile cache: the world is drawn once per zoom level into 256 px images ----------
  dirtyAll(soft) {
    var self = this;
    this._ver = (this._ver || 0) + 1;
    if (soft && this.tiles) { this.tiles.forEach(function (tl) { tl.stale = true; }); this.paint(); return; }
    if (this.tiles) this.tiles.forEach(function (tl) { if (tl.cv) self.spare.push(tl.cv); });
    this.tiles = new Map();
    this.spare = this.spare || [];
    this.paint();
  }
  dirtyRect(x0, y0, x1, y1) {
    this._ver = (this._ver || 0) + 1;
    if (!this.tiles) return;
    // a changed tile is redrawn in the very next frame (never half old, half new); see drawTiles
    this.tiles.forEach(function (tl) { if (tl.x0 < x1 && tl.x1 > x0 && tl.y0 < y1 && tl.y1 > y0) tl.stale = 'now'; });
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
  drawTiles(ctx, sd, oxd, oyd, DW, DH, dpr) {
    if (!this.tiles) this.dirtyAll();
    var w = this.world(), TS = 256, self = this;
    var k = Math.max(-6, Math.min(3, Math.round(Math.log(sd) / Math.LN2)));
    var frame = (this._frame = (this._frame || 0) + 1);
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var budget = 6, missing = false;
    function tw(kk) { return TS / Math.pow(2, kk); }
    function find(kk, tx, ty) {
      // this canvas's own tiles first, else the same place drawn for the other canvas (same size in the world)
      var tl = self.tiles.get(dpr + ':' + kk + ':' + tx + ':' + ty);
      if (!tl) tl = self.tiles.get((dpr === 1 ? self.dpr : 1) + ':' + kk + ':' + tx + ':' + ty);
      return tl;
    }
    function get(kk, tx, ty, make) {
      var key = dpr + ':' + kk + ':' + tx + ':' + ty, tl = self.tiles.get(key);
      if (tl && !tl.stale) { tl.used = frame; return tl; }
      if (!make) { tl = tl || find(kk, tx, ty); if (tl) tl.used = frame; return tl || null; }
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      // no time left this frame: show the old picture of a changed tile, and draw it next frame
      // no time left this frame: a tile changed by the player is still drawn now, so the picture never shows
      // half a change; other old tiles (e.g. after the font arrived) are shown and redrawn in the next frames
      if (now - t0 > budget && !(tl && tl.stale === 'now')) { if (tl) { tl.used = frame; missing = true; self._staleShown = (self._staleShown || 0) + 1; } return tl || null; }
      var nt = self.renderTile(kk, tx, ty, dpr);
      if (tl && tl.cv) self.spare.push(tl.cv);
      nt.used = frame;
      self.tiles.set(key, nt);
      return nt;
    }
    function base(bx, by) {
      var key = '1:-3:' + bx + ':' + by, tl = self.tiles.get(key);
      if (!tl) { tl = self.renderTile(-3, bx, by, 1); self.tiles.set(key, tl); }
      tl.used = frame;
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
      self._holes = (self._holes || 0) + 1;
      // coarser level: one quarter of its tile
      var up = get(k - 1, tx >> 1, ty >> 1, false);
      if (up) { var h = TS / 2; blit(up, (tx & 1) * h, (ty & 1) * h, h, h, ax, ay, ax + T, ay + T); return; }
      // last resort under everything: the low resolution picture of the whole galaxy, so there is never a hole
      var KB = -3, TB = tw(KB);
      if (k > KB) {
        var bx = Math.floor(ax / TB), by = Math.floor(ay / TB), bt = base(bx, by);
        if (bt) { var r2 = TS / TB; blit(bt, (ax - bx * TB) * r2, (ay - by * TB) * r2, T * r2, T * r2, ax, ay, ax + T, ay + T); }
      }
      // finer level: four tiles
      var got = 0;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        var dn = get(k + 1, tx * 2 + dx, ty * 2 + dy, false);
        if (dn) { got++; blit(dn, 0, 0, TS, TS, ax + dx * T / 2, ay + dy * T / 2, ax + (dx + 1) * T / 2, ay + (dy + 1) * T / 2); }
      }
      if (got < 4 && k <= KB) self._empty = (self._empty || 0) + 1;
    });
    if (missing) this.paint();
    var result = missing;
    // keep memory bounded: drop tiles not used for a while
    if (this.tiles.size > 180) {
      var arr = [];
      this.tiles.forEach(function (tl, key) { arr.push([tl.used, key]); });
      arr.sort(function (a, b) { return a[0] - b[0]; });
      for (var i = 0; i < arr.length - 140; i++) { var old = this.tiles.get(arr[i][1]); if (old.cv) this.spare.push(old.cv); this.tiles.delete(arr[i][1]); }
      if (this.spare.length > 40) this.spare.length = 40;
    }
    return result;
  }

  renderTile(k, tx, ty, dpr) {
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
    this.drawWorld(ctx, S, -x0 * S, -y0 * S, TS, TS, dpr || 1);
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
      var dimIt = o.f !== this.focus && fst !== 'L';
      if (!fine) { ctx.fillRect(x, y, tile + 0.3, tile + 0.3); if (dimIt) { ctx.fillStyle = 'rgba(6,9,19,0.45)'; ctx.fillRect(x, y, tile + 0.3, tile + 0.3); } continue; }
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
      // (flag 16 marks an old 'star cell' idea that has no meaning in the game; it is not drawn)
      if (text) {
        var fog = false;
        ctx.fillStyle = fg;
        ctx.fillText(fog ? '·' : o.l, x + tile / 2, y + tile / 2 + tile * 0.03);
      }
      // other fields are darker, so the field being played stands out
      if (dimIt) { ctx.fillStyle = 'rgba(6,9,19,0.45)'; ctx.fillRect(rx, ry, rw, rh); }
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
    w.fields.forEach(function (f) { if (g.state[f.i] === 'S' && f.i !== self.focus) outline(f.i, '#7fd17a', false, 2.5); });
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
    ctx.fillText(this.T('bigSolved', fx.name), 0, -4);
    ctx.fillStyle = '#f2c063';
    ctx.font = '800 18px Archivo, system-ui, sans-serif';
    var gotStars = this.starsFor(fx.fi);
    ctx.fillText((fx.perfect ? this.T('perfect') + '  ·  ' : '') + '+' + gotStars + ' ★', 0, 34);
    ctx.restore();
    this.paint();
  }

  // edge arrows and a small map when the field is bigger than the screen
  // share of letters already in words, per field (cached until words change)
  fieldProgress() {
    var w = this.world(), g = this.game, key = g.words.length + '|' + g.state.join('');
    if (this._progKey === key) return this._prog;
    var done = w.fields.map(function () { return 0; });
    for (var j = 0; j < w.cells.length; j++) if (g.cellWord[j] >= 0) done[w.cells[j].f]++;
    this._prog = done.map(function (d, i) { return d / w.fields[i].cells.length; });
    this._progKey = key;
    return this._prog;
  }
  // zoomed out: a green check on solved fields, the percent on started ones
  renderBadges(ox, oy, s) {
    var ctx = this.ctx, w = this.world(), g = this.game, VW = this.VW, VH = this.VH, prog = this.fieldProgress();
    ctx.font = '800 11px Archivo, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    w.fields.forEach(function (f) {
      var st = g.state[f.i];
      if (st === 'L') return;
      var done = st === 'S', p = prog[f.i];
      if (!done && (p <= 0 || p >= 1)) return;
      var fw = (f.x1 - f.x0) * s, fh = (f.y1 - f.y0) * s;
      if (fw < 14 || fh < 14) return;
      var cx = (f.x0 + f.x1) / 2 * s + ox, cy = (f.y0 + f.y1) / 2 * s + oy;
      if (cx < -30 || cy < -30 || cx > VW + 30 || cy > VH + 30) return;
      var r = Math.max(7, Math.min(13, Math.min(fw, fh) * 0.22));
      if (done) {
        ctx.fillStyle = '#2f8a3a'; ctx.strokeStyle = '#d8f5cf'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.8, r * 0.22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(cx - r * 0.45, cy + r * 0.02); ctx.lineTo(cx - r * 0.1, cy + r * 0.38); ctx.lineTo(cx + r * 0.48, cy - r * 0.35); ctx.stroke();
        ctx.lineCap = 'butt';
      } else {
        var txt = Math.round(p * 100) + '%', tw = Math.max(30, ctx.measureText(txt).width + 12), th = 19;
        ctx.fillStyle = 'rgba(17,26,51,0.92)'; ctx.strokeStyle = '#a9c4ff'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, th / 2); else ctx.rect(cx - tw / 2, cy - th / 2, tw, th);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#eef0f7'; ctx.fillText(txt, cx, cy + 0.5);
      }
    });
  }

  renderOverlay(ox, oy, s) {
    var ctx = this.ctx, w = this.world(), g = this.game, f = w.fields[this.focus], VW = this.VW, VH = this.VH;
    if (s < this.fieldScale(this.focus) * 0.75) { this.renderBadges(ox, oy, s); return; }
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
    // a held word waits for its remove button; a touch anywhere else keeps the word
    if (g.picked >= 0) { this.cancelPick(); }
    if (!mouseRight && o && o.f === this.focus && this.canPaint()) {
      if (g.cellWord[o.i] >= 0) {
        var self = this, wid = g.cellWord[o.i];
        this.drag = { mode: 'press', start: p, last: p, moved: false, cellI: o.i };
        this.drag.timer = setTimeout(function () {
          if (!self.drag || self.drag.moved) return;
          self.dirtyCells(Object.keys(g.sel).map(Number), 1); self.dirtyCells(g.words[wid].cells, 1);
          g.picked = wid; g.sel = {}; g.selN = 0;
          self.pickCell = self.drag.cellI;
          self.say(self.T('removeAsk', g.words[wid].word), 'warn');
          self.drag.mode = 'held';
          self.quick = self.quickPos();
          self.paint(); self.bump();
        }, 550);
        return;
      }
      if (g.picked >= 0) { this.dirtyCells(g.words[g.picked].cells, 1); g.picked = -1; this.say('', 'info'); this.bump(); }
      var add = !g.sel[o.i];
      this.drag = { mode: 'paint', add: add, last: p, changed: [] };
      this.paintCell(o);
      this.paint();
      this.refreshQuick();
      return;
    }
    this.drag = { mode: 'pan', start: p, last: p, moved: false, cell: o };
  }

  paintCell(o) {
    var g = this.game;
    if (!o || o.f !== this.focus || g.cellWord[o.i] >= 0) return;
    var d = this.drag;
    if (d.add && !g.sel[o.i]) { g.sel[o.i] = 1; g.selN++; d.changed.push(o.i); this.dirtyCells([o.i], 1); this.lastCell = o.i; }
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
        self.paint();
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
      this.say(mn.text + ' ' + this.T('holdToRemove'), 'info', mn.title);
      this.bump();
    }
    this.refreshQuick();
  }

  tap(o) {
    var w = this.world(), g = this.game;
    // a tap on empty space clears the selection
    if (!o) { if (g.selN) this.clearSel(); return; }
    var f = w.fields[o.f];
    if (o.f !== this.focus || this.cam.s < this.fieldScale(o.f) * 0.6) {
      this.dirtyField(this.focus); this.dirtyField(o.f);
      this.focus = o.f;
      this.save();
      g.sel = {}; g.selN = 0; g.picked = -1;
      var st = g.state[o.f];
      this.say(st === 'L' ? this.T('locked', f.name) : st === 'S' ? this.T('isSolved', f.name) : this.T('howTo'), st === 'L' ? 'warn' : 'info');
      this.flyTo(this.camFor('field', o.f));
      this.bump();
      return;
    }
    if (g.cellWord[o.i] >= 0) { var mn = this.meaning(g.words[g.cellWord[o.i]].word); this.say(mn.text, 'info', mn.title); this.bump(); }
    else if (g.state[o.f] === 'L') { this.say(this.T('locked', f.name), 'warn'); this.bump(); }
    else if (g.state[o.f] === 'S') { this.say(this.T('solvedOther', f.name), 'info'); this.bump(); }
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
    if (sel.length < 4) { this.say(this.T('min4'), 'warn'); this.bump(); return; }
    sel.sort(function (a, b) { return w.cells[a].r - w.cells[b].r || w.cells[a].c - w.cells[b].c; });
    // the letters of a word must touch
    var inSel = {}; sel.forEach(function (j) { inSel[j] = 1; });
    var seen = {}, stack = [sel[0]], n = 0; seen[sel[0]] = 1;
    while (stack.length) { var j = stack.pop(); n++; w.cells[j].nb.forEach(function (q) { if (q >= 0 && inSel[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }); }
    var word = sel.map(function (j) { return w.cells[j].l; }).join('');
    if (n !== sel.length) { this.say(this.T('touch'), 'warn'); this.bump(); return; }
    if (!w.dict.has(word)) { this.say(this.T('notInList', word), 'warn'); this.bump(); return; }
    var gi = w.cells[sel[0]].g, reg = w.regions[gi];
    var correct = reg.cells.length === sel.length && sel.every(function (j) { return w.cells[j].g === gi; });
    this.dirtyCells(sel, 1);
    var newId = this.addWord(sel, this.pickColour(sel), correct);
    // easy galaxies say at once when a word is not part of the solution
    var notHere = this.level === 'easy' && !correct;
    if (notHere) g.wrongMarked[newId] = 1;
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
      var gave = this.starsFor(fi);
      var mw = this.meaning(word);
      var cheers = this.T('cheers').split('|'), cheer = this.level === 'easy' ? cheers[fi % cheers.length] + ' ' : '';
      this.say((opened.length ? this.T('nowOpen', opened.join(', ')) : '') + (gave === 1 ? this.T('earned1') : this.T('earnedN', gave)) + this.T('lastWord', mw.title, mw.text), 'good', cheer + this.T('fieldSolved', f.name) + (g.used[fi] ? '' : this.T('perfectNo')));
    } else if (notHere) { this.say(this.T('notHere', word), 'warn'); }
    else { var mn = this.meaning(word); this.say(mn.text, 'good', (this.level === 'easy' ? '✓ ' : '') + mn.title); }
    this.save();
    this.quick = this.quickPos();
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
    this.say(this.T('staySelected'), 'info', this.T('removed', wd.word));
    this.save();
    this.quick = this.quickPos();
    this.paint(); this.bump();
  }

  // one pool of stars: every solved field adds as many as its difficulty (very easy 1 ... expert 5);
  // they can be used in any open field
  starsFor(fi) { var t = this.world().fields[fi].tier; return this.level === 'easy' ? t + 1 : Math.min(5, t); }
  starsLeft() {
    var w = this.world(), g = this.game, self = this, sum = 0, used = 0;
    w.fields.forEach(function (f) { if (g.state[f.i] === 'S') sum += self.starsFor(f.i); used += g.used[f.i] || 0; });
    return Math.max(0, sum - used);
  }

  doLight() {
    var w = this.world(), g = this.game, fi = this.focus, f = w.fields[fi];
    if (g.state[fi] !== 'O') { this.say(this.T('starsOpen'), 'warn'); this.bump(); return; }
    if (this.starsLeft() <= 0) { this.say(this.T('noStars'), 'warn'); this.bump(); return; }
    var have = {};
    g.hints[fi].forEach(function (h) { have[h.key] = 1; });
    // 1. a wrong word in this field
    var wrong = g.words.filter(function (wd) {
      return wd.alive && wd.f === fi && !wd.correct && !g.wrongMarked[wd.id];
    });
    var hint = null;
    if (wrong.length) {
      g.wrongMarked[wrong[0].id] = 1;
      this.dirtyCells(wrong[0].cells, 1);
      g.used[fi]++;
      this.say(this.T('starWrong', wrong[0].word), 'info');
      this.save();
      this.paint(); this.bump(); return;
    }
    // 2. walls and word starts anywhere in the field
    var open = function (j) { var x = g.cellWord[j]; return x < 0 || !g.words[x].correct; };
    var walls = [], starts = [];
    f.cells.forEach(function (j) {
      if (!open(j)) return;
      var o = w.cells[j];
      [1, 2].forEach(function (k) {
        var q = o.nb[k];
        if (q >= 0 && open(q) && w.cells[q].f === fi && w.cells[q].g !== o.g && !have['w' + j + '-' + q]) walls.push({ key: 'w' + j + '-' + q, kind: 'wall', a: j, b: q });
      });
      if (o.k === 0 && !have['s' + j]) starts.push({ key: 's' + j, kind: 'start', a: j });
    });
    var n = g.used[fi];
    var pool = (n % 3 === 2 && starts.length) ? starts : (walls.length ? walls : starts);
    if (!pool.length) { this.say(this.T('starNothing'), 'warn'); this.bump(); return; }
    hint = pool[(n * 7 + 3) % pool.length];
    g.hints[fi].push(hint);
    this.dirtyCells(hint.b != null ? [hint.a, hint.b] : [hint.a], 1);
    g.used[fi]++;
    this.save();
    this.say(hint.kind === 'wall' ? this.T('starWall') : this.T('starStart'), 'info');
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
    var left = this.starsLeft();
    var ZL = this.zoomLayout();
    var zoomBtns = [['galaxy', this.T('zGalaxy')], ['area', this.T('zArea')], ['field', this.T('zField')]].map(function (p, i) {
      return { label: p[1], x: ZL[i].x, y: ZL[i].y, w: ZL[i].w, h: ZL[i].h, pick: function () { self.flyTo(self.camFor(p[0], self.focus)); } };
    });
    var picking = g.picked >= 0 && g.words[g.picked].alive;
    return {
      canvasRef: this.canvasRef, loRef: this.loRef, zoomRef: this.zoomRef, onDown: this.onDown, onMove: this.onMove, onUp: this.onUp, onWheel: this.onWheel, onMenu: this.onMenu,
      clearSel: this.clearSel, accept: this.accept, useLight: this.useLight, cancelPick: this.cancelPick, removePick: this.removePick,
      focusName: f.name, focusPips: pips,
      focusLevel: this.T('tiers').split('|')[f.tier],
      focusProgress: g.state[fi] === 'S' ? (g.used[fi] ? this.T('solved') : '\u2605 ' + this.T('solved')) : g.state[fi] === 'L' ? this.T('locked1') : Math.round(100 * covered / f.cells.length) + '%',
      solvedCount: g.state.filter(function (s) { return s === 'S'; }).length, fieldCount: w.fields.length,
      lightLeft: left, zoomBtns: zoomBtns,
      lang: this.lang, level: this.level, newOpen: this.newOpen, switchLang: this.switchLang,
      levelBtns: ['easy', 'medium', 'hard'].map(function (lv, i) {
        var on = self.newLevel === lv;
        return { id: lv, name: self.levelName(lv), desc: self.T(['lvEasyDesc', 'lvMediumDesc', 'lvHardDesc'][i]), pips: ['●○○', '●●○', '●●●'][i], pick: self.levelPick[lv],
          on: on, bg: on ? '#2a3a6e' : 'transparent', bd: on ? '#f2c063' : '#34405c', pressed: on ? 'true' : 'false' };
      }),
      tMenu: this.T('menu'), tStarsAria: this.T('starsAria', left), tStarsTitle: this.T('starsTitle'), tAccept: this.T('accept'), tRemove: this.T('remove', picking ? g.words[g.picked].word : ''),
      tMap: this.T('map'), tMenuGalaxy: this.T('menuGalaxy', this.seed, this.levelName(this.level)), tCopyLink: this.T('copyLink'), tNewGalaxy: this.T('newGalaxy'), tAllGames: this.T('allGames'), tClose: this.T('close'),
      tOtherLang: this.T('otherLang'), tOtherLangAria: this.T('otherLangAria'),
      tNgTitle: this.T('ngTitle'), tNgLevel: this.T('ngLevel'), tNgNumber: this.T('ngNumber'), tNgRandom: this.T('ngRandom'), tNgStart: this.T('ngStart'), tNgCancel: this.T('ngCancel'),
      quickAccept: !!this.quick && this.quick.kind === 'accept', quickRemove: !!this.quick && this.quick.kind === 'remove', quickWord: picking ? g.words[g.picked].word : '',
      quickShow: !!this.quick, quickX: this.quick ? this.quick.x : 0, quickY: this.quick ? this.quick.y : 0,
      toggleMenu: this.toggleMenu, shareProgress: this.shareProgress, openNewGalaxy: this.openNewGalaxy, closeSeed: this.closeSeed, confirmYes: this.confirmYes, confirmNo: this.confirmNo,
      menuOpen: this.menuOpen, menuExpanded: this.menuOpen ? 'true' : 'false', seed: this.seed,
      confirmOpen: !!this.confirm, confirmTitle: this.confirm ? this.confirm.title : '', confirmText: this.confirm ? this.confirm.text : '',
      confirmYesLabel: this.confirm ? this.confirm.yes : '', confirmNoLabel: this.confirm ? this.confirm.no : '',
      showPick: false, showActions: !this.seedMode, seedMode: this.seedMode,
      seedText: this.seedText, onSeedInput: this.onSeedInput, buildSeed: this.buildSeed, randomSeed: this.randomSeed,
      picking: picking, notPicking: !picking, pickWord: picking ? g.words[g.picked].word : '',
      msg: g.msg, msgTitle: g.msgTitle || '', msgColor: g.msgKind === 'good' ? '#a9dc8f' : g.msgKind === 'warn' ? '#f2a27c' : '#c9d1ea'
    };
  }
}
