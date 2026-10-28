
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
    this.menuOpen = false;
    this.confirm = null;
    this.newOpen = false; this.newLevel = this.level;
    if (saved && asked != null && (saved.seed !== asked || this.cleanLevel(saved.level) !== askedLevel) && this.saveHasProgress(saved)) {
      this.seed = saved.seed; this.level = this.cleanLevel(saved.level);
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
    // test mode: open the game once with ?cheat=1 (and ?cheat=0 to stop); the menu then can solve the shown field
    this.cheat = false;
    try {
      var cq = (typeof location !== 'undefined' && location.search) || '';
      if (/[?&]cheat=1/.test(cq)) localStorage.setItem('wordgalaxy:cheat', '1');
      if (/[?&]cheat=0/.test(cq)) localStorage.removeItem('wordgalaxy:cheat');
      this.cheat = localStorage.getItem('wordgalaxy:cheat') === '1';
    } catch (e) {}
    this.cheatSolve = function () { self.menuOpen = false; self.doCheat(); };
    this.redoField = function () { self.menuOpen = false; self.askRedo(self.focus); };
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
    this.ovRef = function (el) { self.setupOv(el); };
    this.zoomRef = function (el) { self.setupZoom(el); };
    this.onDown = function (e) { self.down(e); };
    this.onMove = function (e) { self.move(e); };
    this.onUp = function (e) { self.up(e); };
    this.onWheel = function (e) { self.wheel(e); };
    this.onMenu = function (e) { if (e.preventDefault) e.preventDefault(); };
    this.clearSel = function () { self.dirtyCells(Object.keys(self.game.sel).map(Number), 1); self.game.sel = {}; self.game.selN = 0; self.draw(); self.refreshQuick(); };
    this.accept = function () { self.doAccept(); };
    this.useLight = function () { self.doLight(); };
    this.starNo = function () { self.starCancel(); };
    this.starYes = function () { self.starConfirm(); };
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
        linkBad: 'This progress link does not work ({0}).', linkOld: 'it is from an older version of the game', shareTitle: 'Word Galaxy progress',
        loadTitle: 'Load progress from the link?', loadText: 'The link has {0}. This browser has {1}. Loading replaces the progress in this browser.', loadYes: 'Load progress', loadNo: 'Keep this progress',
        galaxyDesc: 'galaxy {0} ({1}) with {2}', fields1: '1 solved field', fieldsN: '{0} solved fields',
        welcome: 'Welcome back. Your galaxy is as you left it.',
        newTitle: 'Start a new galaxy?', newText: 'This removes all progress in galaxy {0}. You can not undo this.', newYes: 'Start new galaxy', keepPlaying: 'Keep playing',
        bigSolved: '{0} solved', perfect: 'Perfect',
        holdToRemove: 'Hold the word to remove it.', backAgain: 'You are still in the game. Go back again to leave it.',
        isSolved: '{0} is solved.', howTo: 'Swipe over letters to select a word, then tap the ✓ button.',
        solvedOther: '{0} is solved. Tap a field with a blue outline.', tapAgain: 'Tap {0} again to go there.', min4: 'Select at least 4 letters first.', touch: 'The letters of a word must touch each other.', notInList: '{0} is not in the word list.',
        nowOpen: 'Now open: {0}. ', earned1: 'You earned 1 star. ', earnedN: 'You earned {0} stars. ', lastWord: 'Last word {0} {1}', fieldSolved: '{0} solved!', perfectNo: ' Perfect, no stars used.',
        coreOpen: '{0} fields next to the core are solved: the core is open!', coreGate: 'The core opens when {0} fields next to it are solved. Solved now: {1}.',
        coreOpenAll: 'All {0} fields next to the core are solved: the core is open!', coreGateAll: 'The core opens when all {0} fields next to it are solved. Solved now: {1}.',
        finaleTitle: 'Core reached!', finaleSub: 'GALAXY {0}', stFields: 'fields', stWords: 'words', stStars: 'stars used', stPerfect: 'perfect',
        coreDone: 'You solved the Galactic Core! {0} of {1} fields of this galaxy are solved.',
        allTitle: 'Galaxy complete!', allDone: 'You solved all {0} fields of this galaxy. Start a new galaxy in the menu.',
        cheers: 'Great!|Well done!|Super!|Fantastic!|You did it!', notHere: '{0} is a word, but not the one we look for here. Try again!',
        removed: '{0} removed.', staySelected: 'The letters stay selected. Swipe to change them, then tap the ✓ button.',
        starsOpen: 'Stars work only in an open field.', noStars: 'No stars left. Solve fields to earn stars: harder fields give more.',
        starWrong: 'A star shows the words that are not part of the solution: {0}.', starNothing: 'A star has nothing more to show in this field.',
        starWord: 'A star shows the shape of a word with {0} letters. Swipe its letters.',
        noStarsHere: 'A star costs {0} here: each star in the same field costs 1 more than the one before. You have {1}.',
        starAskWord: 'The star shows the shape of a word.', starAskWrong: 'The star marks the wrong words.', starAskNo: 'Keep the star', starAskYes: 'Use the star for {0}', starMissing: '{0} ★ · {1} missing', nextCost: 'The next star in this field costs {0}.',
        ratings: 'Perfect|Great|Good|Solved', rated1: ' {0}: 1 star used.', ratedN: ' {0}: {1} stars used.', scoreFields: '{0} of {1} fields · {2}%',
        deadEnd: 'No word can use these free letters any more: {0}. A word needs at least 4 touching letters. Remove a word, or use a star.', deadEndTitle: '{0}: dead end',
        starBlock: 'A star shows the words that cause the dead end: {0}. Remove them.', starStillRed: 'The red words still cause the dead end. Remove them first.',
        tiers: '|Very easy|Easy|Medium|Hard|Expert|Master', solved: 'Solved', locked1: 'Locked',
        lvEasy: 'Easy', lvMedium: 'Medium', lvHard: 'Hard',
        lvEasyDesc: 'Short, well known words and small fields. Good for children.', lvMediumDesc: 'Words up to 9 letters. Medium fields.', lvHardDesc: 'Many words up to 10 letters. Big fields.',
        redoBtn: '↺ Play {0} again…', redoTitle: 'Play {0} again?', redoYes: 'Play {0} again', redoNo: 'Keep my words',
        redoText: 'This removes all your words in {0}. Then you solve it again, and its rating can be Perfect again. Stars that you used stay used.',
        redoSolved: ' Until you solve {0} again, the {1} ★ that it gave do not count.', redone: '{0} starts again. Solve it without a star for Perfect.',
        menu: 'Menu', starsAria: 'Use one star for a hint ({0} left, a star costs {1} in this field)', starsTitle: 'Use a star for a hint', accept: 'Accept the selected word',
        zGalaxy: 'Show the whole galaxy ({0}% done)', zArea: 'Show the area around this field', zField: 'Show this field',
        map: 'Galaxy map. Swipe over letters to select a word. Drag elsewhere to move around. Pinch or scroll to zoom.',
        menuGalaxy: 'Galaxy {0} · {1}', copyLink: 'Copy progress link', cheat: '🪄 Solve this field (test)', newGalaxy: 'New galaxy…', allGames: 'All games', close: 'Close', otherLang: 'Deutsch', otherLangAria: 'Auf Deutsch spielen',
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
        linkBad: 'Dieser Fortschritts-Link funktioniert nicht ({0}).', linkOld: 'er ist von einer älteren Version des Spiels', shareTitle: 'Word Galaxy – Fortschritt',
        loadTitle: 'Fortschritt aus dem Link laden?', loadText: 'Der Link hat {0}. Dieser Browser hat {1}. Beim Laden wird der Fortschritt in diesem Browser ersetzt.', loadYes: 'Fortschritt laden', loadNo: 'Diesen Fortschritt behalten',
        galaxyDesc: 'Galaxie {0} ({1}) mit {2}', fields1: '1 gelösten Feld', fieldsN: '{0} gelösten Feldern',
        welcome: 'Willkommen zurück. Deine Galaxie ist so, wie du sie verlassen hast.',
        newTitle: 'Neue Galaxie starten?', newText: 'Damit ist der ganze Fortschritt in Galaxie {0} weg. Das kann man nicht rückgängig machen.', newYes: 'Neue Galaxie starten', keepPlaying: 'Weiterspielen',
        bigSolved: '{0} gelöst', perfect: 'Perfekt',
        holdToRemove: 'Halte das Wort gedrückt, um es zu entfernen.', backAgain: 'Du bist noch im Spiel. Gehe noch einmal zurück, um es zu verlassen.',
        isSolved: '{0} ist gelöst.', howTo: 'Wische über Buchstaben, um ein Wort zu wählen, dann tippe auf ✓.',
        solvedOther: '{0} ist gelöst. Tippe auf ein Feld mit blauem Rand.', tapAgain: 'Tippe noch einmal auf {0}, um dorthin zu gehen.', min4: 'Wähle zuerst mindestens 4 Buchstaben.', touch: 'Die Buchstaben eines Wortes müssen sich berühren.', notInList: '{0} ist nicht in der Wortliste.',
        nowOpen: 'Jetzt offen: {0}. ', earned1: 'Du bekommst 1 Stern. ', earnedN: 'Du bekommst {0} Sterne. ', lastWord: 'Letztes Wort {0} {1}', fieldSolved: '{0} gelöst!', perfectNo: ' Perfekt, ohne Sterne.',
        coreOpen: '{0} Felder neben dem Kern sind gelöst: Der Kern ist offen!', coreGate: 'Der Kern öffnet sich, wenn {0} Felder daneben gelöst sind. Jetzt gelöst: {1}.',
        coreOpenAll: 'Alle {0} Felder neben dem Kern sind gelöst: Der Kern ist offen!', coreGateAll: 'Der Kern öffnet sich, wenn alle {0} Felder daneben gelöst sind. Jetzt gelöst: {1}.',
        finaleTitle: 'Kern erreicht!', finaleSub: 'GALAXIE {0}', stFields: 'Felder', stWords: 'Wörter', stStars: 'Sterne genutzt', stPerfect: 'perfekt',
        coreDone: 'Du hast den Galaktischen Kern gelöst! {0} von {1} Feldern dieser Galaxie sind gelöst.',
        allTitle: 'Galaxie geschafft!', allDone: 'Du hast alle {0} Felder dieser Galaxie gelöst. Eine neue Galaxie startest du im Menü.',
        cheers: 'Super!|Toll gemacht!|Klasse!|Spitze!|Geschafft!', notHere: '{0} ist ein Wort, aber nicht das gesuchte. Versuch es noch einmal!',
        removed: '{0} entfernt.', staySelected: 'Die Buchstaben bleiben gewählt. Wische, um sie zu ändern, dann tippe auf ✓.',
        starsOpen: 'Sterne helfen nur in einem offenen Feld.', noStars: 'Keine Sterne mehr. Löse Felder, um Sterne zu bekommen: schwerere Felder geben mehr.',
        starWrong: 'Ein Stern zeigt die Wörter, die nicht zur Lösung gehören: {0}.', starNothing: 'Ein Stern kann in diesem Feld nichts mehr zeigen.',
        starWord: 'Ein Stern zeigt die Form eines Worts mit {0} Buchstaben. Wische über seine Buchstaben.',
        noStarsHere: 'Ein Stern kostet hier {0}: Jeder Stern im selben Feld kostet 1 mehr als der vorige. Du hast {1}.',
        starAskWord: 'Der Stern zeigt die Form eines Worts.', starAskWrong: 'Der Stern markiert die falschen Wörter.', starAskNo: 'Stern behalten', starAskYes: 'Stern für {0} nutzen', starMissing: '{0} ★ · {1} fehlen', nextCost: 'Der nächste Stern in diesem Feld kostet {0}.',
        ratings: 'Perfekt|Sehr gut|Gut|Gelöst', rated1: ' {0}: 1 Stern genutzt.', ratedN: ' {0}: {1} Sterne genutzt.', scoreFields: '{0} von {1} Feldern · {2} %',
        deadEnd: 'Kein Wort kann diese freien Buchstaben mehr nutzen: {0}. Ein Wort braucht mindestens 4 Buchstaben, die sich berühren. Entferne ein Wort oder nutze einen Stern.', deadEndTitle: '{0}: Sackgasse',
        starBlock: 'Ein Stern zeigt die Wörter, die die Sackgasse verursachen: {0}. Entferne sie.', starStillRed: 'Die roten Wörter verursachen die Sackgasse noch. Entferne sie zuerst.',
        tiers: '|Sehr leicht|Leicht|Mittel|Schwer|Experte|Meister', solved: 'Gelöst', locked1: 'Gesperrt',
        lvEasy: 'Leicht', lvMedium: 'Mittel', lvHard: 'Schwer',
        lvEasyDesc: 'Kurze, bekannte Wörter und kleine Felder. Gut für Kinder.', lvMediumDesc: 'Wörter bis 9 Buchstaben. Mittlere Felder.', lvHardDesc: 'Viele Wörter bis 10 Buchstaben. Große Felder.',
        redoBtn: '↺ {0} neu spielen …', redoTitle: '{0} neu spielen?', redoYes: '{0} neu spielen', redoNo: 'Meine Wörter behalten',
        redoText: 'Damit sind alle deine Wörter in {0} weg. Dann löst du das Feld noch einmal, und seine Bewertung kann wieder Perfekt sein. Genutzte Sterne bleiben genutzt.',
        redoSolved: ' Bis du {0} wieder löst, zählen die {1} ★ nicht, die das Feld gegeben hat.', redone: '{0} beginnt von vorn. Löse es ohne Stern für Perfekt.',
        menu: 'Menü', starsAria: 'Einen Stern als Hilfe nutzen ({0} übrig, ein Stern kostet {1} in diesem Feld)', starsTitle: 'Einen Stern als Hilfe nutzen', accept: 'Gewähltes Wort annehmen',
        zGalaxy: 'Die ganze Galaxie zeigen ({0}% geschafft)', zArea: 'Die Gegend um dieses Feld zeigen', zField: 'Dieses Feld zeigen',
        map: 'Karte der Galaxie. Wische über Buchstaben, um ein Wort zu wählen. Ziehe woanders, um dich zu bewegen. Mit zwei Fingern oder dem Mausrad zoomen.',
        menuGalaxy: 'Galaxie {0} · {1}', copyLink: 'Fortschritts-Link kopieren', cheat: '🪄 Feld lösen (Test)', newGalaxy: 'Neue Galaxie …', allGames: 'Alle Spiele', close: 'Schließen', otherLang: 'English', otherLangAria: 'Play in English',
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
    // the core is round, with its own finer grid of smaller letters
    var core = DATA.core, coreIdx = core ? new Int32Array(core.n * core.n).fill(-1) : null;
    var fields = DATA.fields.map(function (f, i) {
      return { i: i, name: i === 0 ? self.T('core') : f.name, mods: f.mods, tier: f.tier, state0: f.state, goal: !!f.goal, words: f.words, len: f.len, shape: f.shape,
        cells: [], regions: [], nb: {}, minR: 1e9, maxR: -1, minC: 1e9, maxC: -1, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    });
    var regions = DATA.regions.map(function (g, i) { return { i: i, f: g[0], found0: !!g[1], colour0: g[2], cells: [] }; });
    var owner = new Int32Array(N * N).fill(-1);
    var cells = DATA.cells.map(function (c, i) {
      var o;
      if (c[7] === 1) {
        // a letter of the round core: position on the core's own grid, size k of a normal letter
        o = { i: i, sr: c[0], sc: c[1], r: core.r0 + c[0] * core.k, c: core.c0 + c[1] * core.k, l: c[2], f: c[3], g: c[4], k: c[5], flags: c[6], sub: true,
          x: M + (core.c0 + c[1] * core.k) * P, y: M + (core.r0 + c[0] * core.k) * P, p: P * core.k };
        coreIdx[c[0] * core.n + c[1]] = i;
      } else {
        o = { i: i, r: c[0], c: c[1], l: c[2], f: c[3], g: c[4], k: c[5], flags: c[6], x: M + c[1] * P, y: M + c[0] * P, p: P };
        owner[o.r * N + o.c] = i;
      }
      var f = fields[o.f];
      f.cells.push(i);
      if (o.r < f.minR) f.minR = o.r; if (o.r > f.maxR) f.maxR = o.r;
      if (o.c < f.minC) f.minC = o.c; if (o.c > f.maxC) f.maxC = o.c;
      if (o.x < f.x0) f.x0 = o.x; if (o.x + o.p > f.x1) f.x1 = o.x + o.p;
      if (o.y < f.y0) f.y0 = o.y; if (o.y + o.p > f.y1) f.y1 = o.y + o.p;
      regions[o.g].cells[o.k] = i;
      return o;
    });
    regions.forEach(function (g) { fields[g.f].regions.push(g.i); });
    function at(r, c) { return r < 0 || c < 0 || r >= N || c >= N ? -1 : owner[r * N + c]; }
    function coreAt(r, c) { return r < 0 || c < 0 || r >= core.n || c >= core.n ? -1 : coreIdx[r * core.n + c]; }
    cells.forEach(function (o) {
      if (o.sub) {
        o.nb = [coreAt(o.sr - 1, o.sc), coreAt(o.sr, o.sc + 1), coreAt(o.sr + 1, o.sc), coreAt(o.sr, o.sc - 1)];
        o.nd = [coreAt(o.sr - 1, o.sc - 1), coreAt(o.sr - 1, o.sc + 1), coreAt(o.sr + 1, o.sc + 1), coreAt(o.sr + 1, o.sc - 1)];
        return;
      }
      o.nb = [at(o.r - 1, o.c), at(o.r, o.c + 1), at(o.r + 1, o.c), at(o.r, o.c - 1)];
      o.nd = [at(o.r - 1, o.c - 1), at(o.r - 1, o.c + 1), at(o.r + 1, o.c + 1), at(o.r + 1, o.c - 1)];
      for (var s = 1; s <= 2; s++) {
        var j = o.nb[s];
        if (j >= 0 && cells[j] && cells[j].f !== o.f) { fields[o.f].nb[cells[j].f] = 1; fields[cells[j].f].nb[o.f] = 1; }
      }
    });
    cells.forEach(function (o) {
      if (o.sub) return;
      for (var s = 1; s <= 2; s++) {
        var j = o.nb[s];
        if (j >= 0 && cells[j].f !== o.f) { fields[o.f].nb[cells[j].f] = 1; fields[cells[j].f].nb[o.f] = 1; }
      }
    });
    if (core) {
      // the round core sits in a square of normal cells: every field touching that square is its neighbour
      var sq0 = core.sq0, side = core.sq;
      cells.forEach(function (o) {
        if (o.sub) return;
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
          var rr = o.r + d[0], cc = o.c + d[1];
          var inCore = rr >= sq0 && rr < sq0 + side && cc >= sq0 && cc < sq0 + side;
          if (inCore) {
            // the free space is round
            var hdy = Math.max(0, Math.abs(rr + 0.5 - core.mid) - 0.5), hdx = Math.max(0, Math.abs(cc + 0.5 - core.mid) - 0.5);
            inCore = hdx * hdx + hdy * hdy < core.hole * core.hole;
          }
          if (inCore) { fields[o.f].nb[0] = 1; fields[0].nb[o.f] = 1; }
        });
      });
      var f0 = fields[0], disc = core.n * core.k;
      f0.round = { cx: M + (core.c0 + disc / 2) * P, cy: M + (core.r0 + disc / 2) * P, R: disc * P / 2 };
      // the round core's area is the whole square, so the camera and the tiles see its glow and ring
      f0.x0 = M + sq0 * P; f0.y0 = M + sq0 * P; f0.x1 = f0.x0 + side * P; f0.y1 = f0.y0 + side * P;
    }
    function mix(a, b, t) {
      var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); });
      var pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
      return '#' + pa.map(function (v, i) { var x = Math.round(v + (pb[i] - v) * t); return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    }
    fields.forEach(function (f) {
      f.nbList = Object.keys(f.nb).map(Number);
      var fcx = (f.x0 + f.x1) / 2, fcy = (f.y0 + f.y1) / 2, gc = M + N * P / 2;
      var t = Math.min(1, Math.hypot(fcx - gc, fcy - gc) / P / (N / 2));
      f.lockBg = mix('#5a3f86', '#1b2552', t);
      // the closer to the core, the warmer: fields near the core turn a little gold
      var warm = Math.max(0, Math.min(1, 1 - (Math.hypot(fcx - gc, fcy - gc) / P - 6) / 26));
      f.warm = warm * warm;
      f.lockBg = mix(f.lockBg, '#8a6620', 0.75 * f.warm);
      f.lockFg = mix(f.lockBg, '#c0c6e8', 0.45);
      f.openBg = mix('#f4efe4', '#f3d27e', 0.75 * f.warm);
      // open fields are darker only a little: the border of the field being played is clear, and they still stand out
      f.dimOpen = f.warm > 0.25 ? 'rgba(30,20,4,0.34)' : 'rgba(6,9,19,0.36)';
    });
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var stars = [];
    for (var i = 0; i < 420; i++) stars.push([rnd() * W, rnd() * W, 0.6 + rnd() * 1.4, 0.2 + rnd() * 0.7]);
    // accepted words: the common ones, and every word of this galaxy's solution
    var dict = new Set(this.words().accept);
    regions.forEach(function (g) { dict.add(g.cells.map(function (j) { return cells[j].l; }).join('')); });
    this._w = { fields: fields, regions: regions, cells: cells, owner: owner, at: at, core: core, coreAt: core ? coreAt : null, stars: stars, dict: dict, current: DATA.current, N: N, P: P, M: M, W: W };
    return this._w;
  }

  // ---------- word data (built once) ----------
  static get GEN() { return 13; }
  // all beginnings of accepted words, to stop searching early
  // accepted words of 4 to 6 letters as numbers (5 bits per letter), for fast checks while building a galaxy
  static letterCode(ch) { var c = ch.charCodeAt(0); return c >= 65 && c <= 90 ? c - 64 : ch === 'Ä' ? 27 : ch === 'Ö' ? 28 : ch === 'Ü' ? 29 : 31; }
  acceptCodes() {
    var W = this.words();
    if (!W.acceptCodes) {
      var set = new Set();
      W.accept.forEach(function (w) {
        if (w.length < 4 || w.length > 6) return;
        var code = 0;
        for (var i = 0; i < w.length; i++) code = code * 32 + Component.letterCode(w[i]);
        set.add(code);
      });
      W.acceptCodes = set;
    }
    return W.acceptCodes;
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
    // rude words: never part of a galaxy, never accepted
    var bad = new Set((WD.bad || '').split(' '));
    // pools by frequency level; only words with a meaning, so learners can always look them up
    function pool(test) {
      var byLen = {};
      for (var i = 0; i < list.length; i++) {
        if (!test(lv.charCodeAt(i) - 48) || !defs.has(list[i]) || bad.has(list[i])) continue;
        var L = list[i].length;
        (byLen[L] || (byLen[L] = [])).push(list[i]);
      }
      return byLen;
    }
    function byLen(words) {
      var out = {};
      words.forEach(function (w) { if (w && !bad.has(w)) (out[w.length] || (out[w.length] = [])).push(w); });
      return out;
    }
    function kid(text) { return byLen((text || '').split(' ').filter(function (w) { return defs.has(w); })); }
    // accepted when selected: common words only (rare words make dead ends nobody thinks of)
    var accept = new Set();
    for (var ai = 0; ai < list.length; ai++) {
      var av = lv.charCodeAt(ai) - 48;
      if ((lang === 'de' ? av !== 9 : av <= 3) && !bad.has(list[ai])) accept.add(list[ai]);
    }
    WD.space.split(' ').forEach(function (w) { if (w) accept.add(w); });
    this._wordsBy[lang] = {
      dict: dict, defs: defs, N: WD.N, lang: lang, accept: accept,
      pools: {
        easy: pool(function (l) { return l === 1; }),
        mid: pool(function (l) { return l <= 2; }),
        hard: pool(function (l) { return l >= 2 && l <= 4; }),
        space: byLen(WD.space.split(' ')),
        // for children: only everyday words of an 8-year-old (A), then known ones (B); German: checked by hand
        kidSpace: byLen((WD.kidspace || '').split(' ')),
        kidA: kid(WD.kidA || WD.kid),
        kidB: kid(WD.kidB),
        all: pool(function (l) { return l !== 7; })
      }
    };
    return this._wordsBy[lang];
  }

  // ---------- the galaxy generator: the same seed always gives the same galaxy ----------
  // Only integer maths, Math.sqrt and stable sorts with fixed comparators, so every browser agrees.
  generate(seedIn) {
    var WDS = this.words();
    // overall difficulty
    var LV = this.level === 'easy' || this.level === 'medium' ? this.level : 'hard', HARD = LV === 'hard';
    var KIDS = LV === 'easy', self = this;
    var seed = ((Math.floor(Math.abs(seedIn)) % 2147483646) + 1), seed0 = seed;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    function K(r, c) { return r * 1000 + c; }
    var N = WDS.N, MID = N / 2;
    var POOL = WDS.pools;
    var KP = [POOL.kidA, POOL.kidB];
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
    // the word lists for a word of a field; long words in hard galaxies come only from common words
    function poolsFor(f, len) {
      if (!HARD || len < 8) return f.pools;
      return f.pools.filter(function (p) { return p !== POOL.hard; }).concat(f.pools.indexOf(POOL.mid) < 0 ? [POOL.mid] : []);
    }
    // distance from the middle; DS makes the outermost cell of every galaxy shape 6.4 away, so all shapes get the same levels
    var DS = 1;
    function distOf(r, c) { var dx = (c + 0.5) / N * 13 - 6.5, dy = (r + 0.5) / N * 13 - 6.5; return Math.sqrt(dx * dx + dy * dy) * DS; }

    // The shape of the galaxy comes from the seed: a spiral with 2 to 4 arms, a barred spiral, a ring or a cloud.
    // It has its own random numbers, so the rest of the galaxy does not depend on it.
    function galaxyShape(seed, N) {
      var s = ((Math.floor(Math.abs(seed)) * 48271 + 12345) % 2147483646) + 1;
      function rnd() { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }
      // exact maths: only + - * / and sqrt, so every browser gets the same shape
      function ln(x) {
        var k = 0;
        while (x > 1.5) { x /= 2; k++; }
        while (x < 0.75) { x *= 2; k--; }
        var t = (x - 1) / (x + 1), t2 = t * t, sum = 0, p = t;
        for (var i = 1; i < 16; i += 2) { sum += p / i; p *= t2; }
        return 2 * sum + k * 0.6931471805599453;
      }
      function atan2(y, x) {
        var ax = Math.abs(x), ay = Math.abs(y);
        if (ax === 0 && ay === 0) return 0;
        var a = Math.min(ax, ay) / Math.max(ax, ay), q = a * a;
        var r = ((((-0.0134804 * q + 0.0574773) * q - 0.1212391) * q + 0.1956359) * q - 0.3329946) * q * a + a;
        if (ay > ax) r = 1.5707963267948966 - r;
        if (x < 0) r = 3.141592653589793 - r;
        return y < 0 ? -r : r;
      }
      var TAU = 6.283185307179586;
      function wrap(d) { d = d % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
      // smooth noise around the circle and along the radius: ragged edges
      var NA = 12, NR = 8, grid = [];
      for (var i = 0; i < NA * NR; i++) grid.push(rnd() * 2 - 1);
      function noise(rad, ang) {
        var u = (ang / TAU + 0.5) * NA, v = rad / 6.5 * (NR - 1);
        var i0 = Math.floor(u), j0 = Math.min(NR - 2, Math.floor(v)), fu = u - i0, fv = Math.min(1, v - j0);
        fu = fu * fu * (3 - 2 * fu); fv = fv * fv * (3 - 2 * fv);
        var g = function (i, j) { return grid[((i % NA) + NA) % NA + j * NA]; };
        var a0 = g(i0, j0) + (g(i0 + 1, j0) - g(i0, j0)) * fu, a1 = g(i0, j0 + 1) + (g(i0 + 1, j0 + 1) - g(i0, j0 + 1)) * fu;
        return a0 + (a1 - a0) * fv;
      }
      var KINDS = ['spiral', 'spiral', 'barred', 'ring', 'cloud'], kind = KINDS[Math.floor(rnd() * KINDS.length)];
      var arms = kind === 'barred' ? 2 : 2 + Math.floor(rnd() * 3), pitch = 1.7 + rnd() * 1.4, turn = rnd() < 0.5 ? 1 : -1;
      var rot = rnd() * TAU, rough = 0.15 + rnd() * 0.25, fill = 0.42 + rnd() * 0.18;
      // the bar: a random direction (as a unit vector, without sin and cos), half length 2.2 to 3.2
      var vx = rnd() * 2 - 1, vy = rnd() * 2 - 1, vl = Math.sqrt(vx * vx + vy * vy) || 1; vx /= vl; vy /= vl;
      var barL = 2.2 + rnd() * 1.0, barA = atan2(vy, vx);
      var squash = 0.7 + rnd() * 0.3, spokes = 2 + Math.floor(rnd() * 3);
      function inside(dx, dy, w) {
        var rad = Math.sqrt(dx * dx + dy * dy);
        if (rad < 1.75) return true;
        if (rad > 6.4) return false;
        var ang = atan2(dy, dx), n = noise(rad, ang) * rough;
        if (kind === 'cloud') {
          // an irregular, a little flat cloud
          var ex = dx * vx + dy * vy, ey = (dy * vx - dx * vy) / squash, er = Math.sqrt(ex * ex + ey * ey);
          return er < w * 2.2 * (1 + 1.4 * n) && rad < 6.4;
        }
        if (kind === 'ring') {
          // a core disc, a ring, and spokes between them
          if (rad < 2.4 + n * 2) return true;
          var mid = 4.9, half = w * 0.55 * (1 + n);
          if (Math.abs(rad - mid) < half) return true;
          for (var k = 0; k < spokes; k++) if (rad < mid && Math.abs(wrap(ang - rot - k * TAU / spokes)) * rad < w * 0.45) return true;
          return false;
        }
        var reach = w;
        if (rad > reach * (1 + 0.3 * n)) return false;
        var start = 0.9, off = rot;
        if (kind === 'barred') {
          // the bar, then two arms from its ends
          var along = dx * vx + dy * vy, across = dy * vx - dx * vy;
          if (Math.abs(along) < barL && Math.abs(across) < 0.75 * (1 + n)) return true;
          start = barL; off = barA;
        }
        if (rad < start) return false;
        var t = turn * pitch * ln(rad / start);
        // the arms get thinner towards their ends
        var q = rad / reach, q2 = q * q, taper = 1 - 0.6 * q2 * q2 * q2;
        for (var a = 0; a < arms; a++) {
          var d = wrap(ang - t - off - a * TAU / arms);
          if (Math.abs(d) < Math.PI / arms * fill * (1 + n) * taper + 0.3 / rad) return true;
        }
        return false;
      }
      function build(w) {
        var m = [], cnt = 0;
        for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) m.push(inside((c + 0.5) / N * 13 - 6.5, (r + 0.5) / N * 13 - 6.5, w));
        // no thin parts: only what a square of 5 x 5 cells can cover stays
        var core = new Uint8Array(N * N), r2, c2;
        for (r = 2; r < N - 2; r++) for (c = 2; c < N - 2; c++) {
          var all = true;
          for (r2 = -2; r2 <= 2 && all; r2++) for (c2 = -2; c2 <= 2; c2++) if (!m[(r + r2) * N + c + c2]) { all = false; break; }
          if (all) core[r * N + c] = 1;
        }
        var m2 = [];
        for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
          var on = false;
          for (r2 = -2; r2 <= 2 && !on; r2++) for (c2 = -2; c2 <= 2; c2++) { var rr = r + r2, cc = c + c2; if (rr >= 0 && cc >= 0 && rr < N && cc < N && core[rr * N + cc]) { on = true; break; } }
          m2.push(on); if (on) cnt++;
        }
        return { m: m2, n: cnt };
      }
      // the same number of letters as before (about 6000): find the width
      // spirals: the size changes (the arms keep their width); rings and clouds: the width changes
      var spiral = kind === 'spiral' || kind === 'barred', lo = spiral ? 3.5 : 0.3, hi = spiral ? 6.3 : 4, best = null;
      for (var it = 0; it < 14; it++) {
        var mid = (lo + hi) / 2, b = build(mid);
        best = b;
        if (b.n < 6000) lo = mid; else hi = mid;
      }
      // only the part that is joined to the middle
      var m = best.m, keep = new Uint8Array(N * N), st = [(N / 2) * N + N / 2]; keep[st[0]] = 1;
      while (st.length) {
        var p = st.pop(), pr = Math.floor(p / N), pc = p % N;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var r2 = pr + d[0], c2 = pc + d[1], q = r2 * N + c2;
          if (r2 >= 0 && c2 >= 0 && r2 < N && c2 < N && m[q] && !keep[q]) { keep[q] = 1; st.push(q); }
        });
      }
      var out = [], n = 0;
      for (var r = 0; r < N; r++) { out.push([]); for (var c = 0; c < N; c++) { out[r].push(!!keep[r * N + c]); if (keep[r * N + c]) n++; } }
      return { mask: out, kind: kind, arms: arms, n: n };
    }
    var mask = galaxyShape(seedIn, N).mask, owner = [], r, c;
    for (r = 0; r < N; r++) { owner.push([]); for (c = 0; c < N; c++) owner[r].push(-1); }
    var far = 0;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) if (mask[r][c]) far = Math.max(far, distOf(r, c));
    DS = 6.4 / far;
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
    // the round core, with room for its ring and stars; the free space around it is round too,
    // so the fields around it form a circle
    var DISC = HARD ? 12 : LV === 'medium' ? 10 : 8, CORE = DISC + 4, HOLE = DISC / 2 + 1.25;
    var hc = [], h0 = MID - CORE / 2;
    for (r = h0; r < h0 + CORE; r++) for (c = h0; c < h0 + CORE; c++) {
      var hdy = Math.max(0, Math.abs(r + 0.5 - MID) - 0.5), hdx = Math.max(0, Math.abs(c + 0.5 - MID) - 0.5);
      if (hdx * hdx + hdy * hdy < HOLE * HOLE) { owner[r][c] = 0; hc.push([r, c]); }
    }
    fields.push({ id: 0, cells: hc });
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

    // Irregular fields: cells at the border go to the field next to them, cells at the outer edge go away.
    // The bays and bumps limit where a word can go: the field is easier to solve, and it looks more interesting.
    // A field loses or gains at most 15% of its cells, and stays thick enough for words.
    var ROUGH = 0.2, fixed = new Set(), size0 = fields.map(function (f) { return f.cells.length; }), steps = 0;
    fields.forEach(function (f) { if (f.id) steps += Math.round(f.cells.length * ROUGH); });
    // A word must go through a cell that is the only way into a part with fewer than 4 cells.
    // Two such parts at the same cell can never both become words: the field could not be split.
    function splittable(cells) {
      var set = new Set(cells.map(function (x) { return K(x[0], x[1]); }));
      for (var i = 0; i < cells.length; i++) {
        var cut = K(cells[i][0], cells[i][1]), seen = new Set([cut]), small = 0;
        for (var j = 0; j < cells.length; j++) {
          var k0 = K(cells[j][0], cells[j][1]);
          if (seen.has(k0)) continue;
          var n = 0, st = [k0]; seen.add(k0);
          while (st.length) {
            var k = st.pop(); n++;
            for (var d = 0; d < 4; d++) { var kk = k + D4[d][0] * 1000 + D4[d][1]; if (set.has(kk) && !seen.has(kk)) { seen.add(kk); st.push(kk); } }
          }
          if (n < 4 && ++small > 1) return false;
        }
      }
      return true;
    }
    function ownNb(rr, cc, id) { var n = 0; for (var d = 0; d < 4; d++) if (own(rr + D4[d][0], cc + D4[d][1]) === id) n++; return n; }
    for (var st = 0; st < steps; st++) {
      var fr = fields[1 + Math.floor(rnd() * (fields.length - 1))];
      if (fr.cells.length <= 0.85 * size0[fr.id]) continue;
      var x = pick(fr.cells), to = [], edge = false, nearCore = false;
      if (fixed.has(K(x[0], x[1]))) continue;
      for (q = 0; q < 4; q++) {
        var o = own(x[0] + D4[q][0], x[1] + D4[q][1]);
        if (o === undefined || o < 0) edge = true;
        else if (o === 0) nearCore = true;
        else if (o !== fr.id && fields[o].cells.length < 1.15 * size0[o]) to.push(o);
      }
      // the fields around the core keep their round edge
      if (nearCore || (!to.length && !edge)) continue;
      owner[x[0]][x[1]] = -2;
      // no cell of the field may be left with only one neighbour in it
      var thin = false;
      for (q = 0; q < 4; q++) { var y0 = x[0] + D4[q][0], y1 = x[1] + D4[q][1]; if (own(y0, y1) === fr.id && ownNb(y0, y1, fr.id) < 2) thin = true; }
      var rest = fr.cells.filter(function (y) { return y !== x; });
      if (thin || !connected(rest) || !splittable(rest)) { owner[x[0]][x[1]] = fr.id; continue; }
      var gt = to.length && (!edge || rnd() < 0.6) ? fields[pick(to)] : null;
      if (gt && !splittable(gt.cells.concat([x]))) { owner[x[0]][x[1]] = fr.id; continue; }
      fr.cells = rest; fixed.add(K(x[0], x[1]));
      if (gt) { owner[x[0]][x[1]] = gt.id; gt.cells.push(x); }
      else { owner[x[0]][x[1]] = -1; mask[x[0]][x[1]] = false; }
    }

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
      if (i === 0) { f.tier = 6; f.len = [6, 10]; f.pools = [POOL.space, POOL.hard]; f.mods.push('THEME'); return; }
      var n = f.cells.length;
      f.tier = Math.max(tierAt(f.dist), n >= 46 ? 2 : 1, n >= 56 ? 3 : 1, n >= 80 ? 4 : 1, n >= 110 ? 5 : 1);
      rnd();
      if (f.tier === 1) { f.len = [4, 5]; f.pools = [POOL.easy]; if (rnd() < 0.6) f.mods.push('GIFT'); }
      if (f.tier === 2) { f.len = [4, 6]; f.pools = [POOL.easy, POOL.mid]; if (rnd() < 0.4) f.mods.push('GIFT'); }
      if (f.tier === 3) { f.len = [4, 7]; f.pools = [POOL.easy, POOL.mid]; if (rnd() < 0.2) f.mods.push('GIFT'); }
      if (f.tier === 4) { f.len = [4, 9]; f.pools = [POOL.mid, POOL.hard]; if (rnd() < 0.3) f.mods.push('STAR'); }
      if (f.tier === 5) { f.len = [5, 10]; f.pools = [POOL.hard, POOL.mid]; if (rnd() < 0.3) f.mods.push('STAR'); }
      if (f.tier >= 4 && rnd() < 0.12) { f.mods.push('THEME'); f.pools = [POOL.space].concat(f.pools); }
    });

    function levelField(f, i) {
      var n = f.cells.length;
      if (LV === 'easy') {
        if (i === 0) { f.tier = 3; f.len = [4, 6]; f.pools = [POOL.kidSpace].concat(KP); f.mods.push('THEME'); return; }
        f.tier = Math.min(3, Math.max(tierAt(f.dist), n >= 40 ? 2 : 1, n >= 60 ? 3 : 1));
        f.len = f.tier < 3 ? [4, 5] : [4, 6];
        // only words for children; a word may come twice rather than a harder word
        f.pools = KP;
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

    // the core is round, with smaller letters (more of them) on its own finer grid
    var f0 = fields[0], nSub = LV === 'easy' ? 11 : LV === 'medium' ? 18 : 24, kSub = DISC / nSub;
    var ccx = (nSub - 1) / 2, rad2 = (nSub / 2 - 0.15) * (nSub / 2 - 0.15), disc = [];
    for (var sr = 0; sr < nSub; sr++) for (var sc = 0; sc < nSub; sc++) { var ddr = sr - ccx, ddc = sc - ccx; if (ddr * ddr + ddc * ddc <= rad2) disc.push([sr, sc]); }
    var coreSub = { r0: MID - DISC / 2, c0: MID - DISC / 2, k: kSub, n: nSub, sq0: MID - CORE / 2, sq: CORE, hole: HOLE, mid: MID };
    f0.sub = coreSub; f0.cells = disc;
    f0.len = LV === 'easy' ? [4, 6] : LV === 'medium' ? [5, 10] : [6, 10];

    // cut each field into word shapes
    function partition(f, lo, hi, steps) {
      var order = f.cells.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      var free = new Set(order.map(function (x) { return K(x[0], x[1]); }));
      var out = [], budget = steps || 4000;
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
        // long words in hard galaxies: a shape without branches, so there are fewer other ways to read the letters
        var style = KIDS ? pick(['line', 'line', 'line', 'snake']) : HARD && L >= 8 ? pick(['snake', 'line']) : pick(['spread', 'spread', 'snake', 'compact']);
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
        // favour longer words most of the time (keys drawn first, so the sort itself never calls rnd);
        // hard galaxies favour words of about 6 letters: a very long word is hard to guess
        var keyed = lens.map(function (L) { return [L, HARD ? Math.abs(L - 6) + rnd() * 4 : rnd() < 0.6 ? -L : L]; });
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
    var cacheKey = [WDS.lang, LV, seedIn, Component.GEN, WDS.accept.size].join(':'), trapCache = HARD ? null : self.loadTrapCache(cacheKey), newCache = {};
    fields.forEach(function (f) {
      var regs = null, a;
      for (a = 0; a < 6 && !regs; a++) regs = partition(f, f.len[0], f.len[1]);
      if (!regs && f.len[0] > 4) { f.len[0] = 4; for (a = 0; a < 6 && !regs; a++) regs = partition(f, 4, f.len[1]); }
      // one letter longer words at most first: children know few long words
      for (var more = 1; more <= 2 && !regs; more++) { f.len[1]++; for (a = 0; a < 6 && !regs; a++) regs = partition(f, 4, f.len[1]); }
      // the last chance: many more steps (slow, but rare)
      for (a = 0; a < 12 && !regs; a++) regs = partition(f, 4, f.len[1], 60000);
      if (!regs) throw new Error('could not split field ' + f.id);
      var mn = 99, mx = 0;
      f.regions = regs.map(function (reg) {
        var ord = reg.slice().sort(function (a2, b2) { return a2[0] - b2[0] || a2[1] - b2[1]; });
        if (ord.length < mn) mn = ord.length; if (ord.length > mx) mx = ord.length;
        return { cells: ord, word: word(ord.length, poolsFor(f, ord.length)) };
      });
      f.len = [mn, mx];
      if (LV === 'easy') avoidLookalikes(f);
      if (!HARD) {
        // the swaps take a while: their result is kept in this browser and reused on the next visit
        var hit = trapCache && trapCache[f.id], added = [];
        if (hit && hit.w && hit.w.length === f.regions.length) {
          f.regions.forEach(function (reg, i) { if (hit.w[i].length === reg.cells.length) reg.word = hit.w[i]; });
          hit.u.forEach(function (w) { used.add(w); });
          added = hit.u; f.traps = hit.t;
        } else {
          added = reduceTraps(f, true).concat(polish(f));
          reduceTraps(f, false);
          // the core of an easy galaxy has no traps: polish can bring some back, so remove them again
          for (var again = 0; again < 10 && KIDS && f.id === 0 && f.traps > 0; again++) {
            added = added.concat(reduceTraps(f, true), polish(f));
            reduceTraps(f, false);
          }
        }
        newCache[f.id] = { w: f.regions.map(function (reg) { return reg.word; }), u: added, t: f.traps };
      } else { polish(f); reduceTraps(f, false); }
    });
    if (!HARD) self.saveTrapCache(cacheKey, newCache);

    // every connected group of 4 to 6 cells that is not a solution word, listed once (the shapes do not depend on the letters)
    function trapShapes(f) {
      var cells = f.cells.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), n = cells.length;
      var idx = {}; cells.forEach(function (x, i) { idx[K(x[0], x[1])] = i; });
      var nb = cells.map(function (x) {
        var out = [];
        for (var d = 0; d < 4; d++) { var q = idx[K(x[0] + D4[d][0], x[1] + D4[d][1])]; if (q !== undefined) out.push(q); }
        return out;
      });
      var R = f.regions.length, regOf = new Int32Array(n), regPos = new Int32Array(n);
      f.regions.forEach(function (reg, ri) { reg.cells.forEach(function (x, i) { var q = idx[K(x[0], x[1])]; regOf[q] = ri; regPos[q] = i; }); });
      var S = 6, shapes = [], touch = []; for (var r0 = 0; r0 < R; r0++) touch.push([]);
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
      return { n: n, regOf: regOf, regPos: regPos, list: shapes, touch: touch };
    }

    // A trap is a word the player can select that is not a word of the solution: a dead end.
    // Easy and medium galaxies swap words until a field has few traps left (swap true).
    // The number of traps that are left is in f.traps: it tells how difficult the field is.
    function reduceTraps(f, swap) {
      var acc = self.acceptCodes();
      if (!f.shapes) f.shapes = trapShapes(f);
      var n = f.shapes.n, regOf = f.shapes.regOf, regPos = f.shapes.regPos, shapes = f.shapes.list, touch = f.shapes.touch, R = f.regions.length;
      var L = new Int32Array(n), trap = new Uint8Array(shapes.length), total = 0;
      function letters() { for (var q = 0; q < n; q++) L[q] = Component.letterCode(f.regions[regOf[q]].word[regPos[q]]); }
      function isTrap(id) { var sh = shapes[id], code = 0; for (var a = 0; a < sh.length; a++) code = code * 32 + L[sh[a]]; return acc.has(code) ? 1 : 0; }
      letters();
      for (var id0 = 0; id0 < shapes.length; id0++) { trap[id0] = isTrap(id0); total += trap[id0]; }
      f.traps = total;
      if (!swap) return [];
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
      // the core of an easy galaxy is the last field for a child: it gets much more work, and words of all its pools
      var kidCore = KIDS && f.id === 0, rounds = kidCore ? 12 * R : 2 * R, tries = kidCore ? 60 : 3;
      // (a word of another field may come again here, but never a word that is in the core already)
      if (kidCore) fresh = function (len) {
        var all = [], mine = {};
        f.regions.forEach(function (reg) { mine[reg.word] = 1; });
        f.pools.forEach(function (pl) { (pl[len] || []).forEach(function (w) { if (!mine[w]) all.push(w); }); });
        return all.length ? all[Math.floor(lrnd() * all.length)] : null;
      };
      var target = LV === 'easy' ? 0 : Math.floor(R * 0.8), stuck = {}, added = [];
      for (var round = 0; round < rounds && total > target; round++) {
        var worst = -1, wc = 0;
        for (var r = 0; r < R; r++) { if (stuck[r]) continue; var c = perRegion(r); if (c > wc) { wc = c; worst = r; } }
        if (worst < 0) break;
        var len = f.regions[worst].cells.length, best = total, bestWord = null;
        for (var t2 = 0; t2 < tries; t2++) {
          var cand = fresh(len, f.pools);
          if (!cand) break;
          var tt = tryWord(worst, cand);
          if (tt < best) { best = tt; bestWord = cand; }
        }
        if (bestWord) { setWord(worst, bestWord); used.add(bestWord); added.push(bestWord); } else stuck[worst] = 1;
      }
      f.traps = total;
      return added;
    }

    // No word twice in a field, and no solution word that one or two more letters
    // make into a longer word the player can select (the player tries the longer word first).
    function polish(f) {
      var acc = WDS.accept, added = [];
      function trapsNow() { reduceTraps(f, false); return f.traps; }
      var ls = ((seed0 * 17 + f.id * 104729) % 2147483646) + 1;
      function prnd() { ls = (ls * 16807) % 2147483647; return (ls - 1) / 2147483646; }
      var at = {};
      function place(reg, w) { reg.cells.forEach(function (x, i) { at[K(x[0], x[1])] = w[i]; }); }
      f.regions.forEach(function (reg) { place(reg, reg.word); });
      function read(cells) { return cells.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (x) { return at[K(x[0], x[1])]; }).join(''); }
      function around(cells, not) {
        var out = [], seen = {};
        cells.forEach(function (x) {
          for (var d = 0; d < 4; d++) {
            var y = x[0] + D4[d][0], c2 = x[1] + D4[d][1], kk = K(y, c2);
            if (at[kk] === undefined || not[kk] || seen[kk]) continue;
            seen[kk] = 1; out.push([y, c2]);
          }
        });
        return out;
      }
      function longer(reg) {
        var not = {};
        reg.cells.forEach(function (x) { not[K(x[0], x[1])] = 1; });
        var one = around(reg.cells, not);
        for (var a = 0; a < one.length; a++) {
          var c1 = reg.cells.concat([one[a]]);
          if (acc.has(read(c1))) return true;
          not[K(one[a][0], one[a][1])] = 1;
          var two = around(c1, not);
          for (var b = 0; b < two.length; b++) if (acc.has(read(c1.concat([two[b]])))) { delete not[K(one[a][0], one[a][1])]; return true; }
          delete not[K(one[a][0], one[a][1])];
        }
        return false;
      }
      function counts() { var n = {}; f.regions.forEach(function (reg) { n[reg.word] = (n[reg.word] || 0) + 1; }); return n; }
      function candidates(len, n) {
        var fresh = [], old = [];
        poolsFor(f, len).forEach(function (pl) { (pl[len] || []).forEach(function (w) { if (n[w]) return; (used.has(w) ? old : fresh).push(w); }); });
        if (!fresh.length && !old.length && !HARD) (POOL.all[len] || []).forEach(function (w) { if (!n[w]) old.push(w); });
        return [fresh, old];
      }
      for (var round = 0; round < 10; round++) {
        var n = counts(), seen = {}, bad = [];
        f.regions.forEach(function (reg) {
          var twice = seen[reg.word]; seen[reg.word] = 1;
          if (twice || longer(reg)) bad.push(reg);
        });
        if (!bad.length) break;
        bad.forEach(function (reg) {
          var len = reg.cells.length, cs = candidates(len, counts()), keep = reg.word, best = null;
          // the core of an easy galaxy: a new word must not bring more traps
          var kidCore = KIDS && f.id === 0, base = kidCore ? trapsNow() : 0;
          for (var t = 0; t < (kidCore ? 24 : 6); t++) {
            var list = cs[0].length && (t < 4 || !cs[1].length) ? cs[0] : cs[1];
            if (!list.length) break;
            var w = list[Math.floor(prnd() * list.length)];
            place(reg, w); reg.word = w;
            if (!longer(reg) && !(kidCore && trapsNow() > base)) { best = w; break; }
            if (!best) best = w;
          }
          if (!best) { reg.word = keep; place(reg, keep); return; }
          // a word that is still twice is worse than a longer match: then keep the first new word
          reg.word = best; place(reg, best);
          if (!used.has(best)) { used.add(best); added.push(best); }
        });
      }
      return added;
    }

    // A word is confusing when one letter more or one letter less also makes a word,
    // e.g. GEHÖR next to a T (GEHÖRT). For children, pick other words until nothing like that is left.
    function avoidLookalikes(f) {
      var dict = WDS.dict;
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
    // start fields: easy fields in the outer parts (first the outermost ones, then a little further in)
    var NS = LV === 'easy' ? 4 : 2, minT = 9, startCands = [];
    fields.forEach(function (f) { if (f.id) minT = Math.min(minT, f.tier); });
    for (var most = 2; most <= 6 && startCands.length < 2 * NS; most++) for (var tl = minT; tl <= minT + 2 && startCands.length < 2 * NS; tl++) {
      startCands = fields.filter(function (f) { return f.id && f.tier <= tl && difficulty(f) <= most; });
    }
    function low(f) { return f.r > MID ? 1 : 0; }
    startCands.sort(function (a, b) { return (difficulty(a) - difficulty(b)) || (isTall(b) - isTall(a)) || (low(b) - low(a)) || (isRect(b) - isRect(a)) || (b.dist - a.dist) || (a.id - b.id); });
    var current = startCands[0].id;
    // more starting points, as far from each other as possible (no random numbers, so the galaxy itself stays the same)
    var starts = [startCands[0]];
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
      var isStart = LV === 'easy' ? startIds.indexOf(f.id) >= 0 : f.id === current;
      var gift = isStart && (f.mods.indexOf('GIFT') >= 0 || LV === 'easy') ? pick(f.regions) : null;
      if (f.mods.indexOf('STAR') >= 0) { var sc0 = pick(pick(f.regions).cells); f.star = K(sc0[0], sc0[1]); }
      f.regions.forEach(function (reg) {
        var gi = regions.length;
        regions.push([f.id, reg === gift ? 1 : 0, -1]);
        // the round core has its own grid: its letters are added below, not by position in the galaxy
        if (f.sub) { reg.gi = gi; return; }
        reg.cells.forEach(function (x, i) { cellReg[K(x[0], x[1])] = [gi, i, reg.word[i]]; });
      });
    });
    var cells = [];
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      var o3 = owner[r][c]; if (o3 <= 0) continue;
      var fl = 0;
      var dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
      for (var bit = 0; bit < 4; bit++) { if (own(r + dirs[bit][0], c + dirs[bit][1]) !== o3) fl |= 1 << bit; }
      if (fields[o3].star === K(r, c)) fl |= 16;
      var cr = cellReg[K(r, c)];
      cells.push([r, c, cr[2], o3, cr[0], cr[1], fl]);
    }
    // the letters of the round core, on its own grid
    var inCore = {};
    fields[0].cells.forEach(function (x) { inCore[K(x[0], x[1])] = 1; });
    fields[0].regions.forEach(function (reg) {
      reg.cells.forEach(function (x, i) {
        var fl2 = 0, dd = [[-1, 0], [0, 1], [1, 0], [0, -1]];
        for (var b2 = 0; b2 < 4; b2++) if (!inCore[K(x[0] + dd[b2][0], x[1] + dd[b2][1])]) fl2 |= 1 << b2;
        cells.push([x[0], x[1], reg.word[i], 0, reg.gi, i, fl2, 1]);
      });
    });
    // The difficulty that the player sees comes from the finished field, not from its place in the galaxy:
    // each word is work, and each trap (a word that is not part of the solution) is a dead end to try.
    // Many short words make many traps, a few long words make few.
    function difficulty(f) {
      var score = f.regions.length + 2 * f.traps;
      return score <= 10 ? 1 : score <= 20 ? 2 : score <= 40 ? 3 : score <= 80 ? 4 : score <= 160 ? 5 : 6;
    }
    return {
      N: N, current: current, cells: cells, regions: regions, core: coreSub,
      fields: fields.map(function (f) {
        return { name: f.name, mods: f.mods, tier: difficulty(f), state: startIds.indexOf(f.id) >= 0 ? 'O' : 'L', goal: f.id === 0 ? 1 : 0, words: f.regions.length, len: f.len, shape: '' };
      })
    };
  }

  reseed(n, level) {
    var self = this;
    this.seedText = String(n);
    this.say(this.T('building', n), 'info');
    this.bump();
    setTimeout(function () {
      var old = { w: self._w, seed: self.seed, level: self.level, game: self.game, focus: self.focus };
      try {
        self.seed = n; self._w = null; self._grp = null; self.fx = null;
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
        self._w = old.w; self.seed = old.seed; self.level = old.level; self.game = old.game; self.focus = old.focus;
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
      // a galaxy from another generator version is different now: its save is not used
      return sv && sv.v === 1 && typeof sv.seed === 'number' && sv.gen === Component.GEN ? sv : null;
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
    return { v: 1, seed: this.seed, level: this.level, lang: this.lang, gen: Component.GEN, focus: this.focus, state: g.state, words: alive, used: g.used, paid: g.paid, hints: g.hints, wrong: wrong };
  }

  // ---------- moving progress to another device: the whole save in a link ----------
  // The code is the save as JSON, with word cells as differences (small numbers), deflated, in base64url.
  exportCode() {
    var sv = this.saveData();
    var c = { v: 1, seed: sv.seed, level: sv.level, lang: sv.lang, gen: sv.gen, focus: sv.focus, state: sv.state.join(''), used: sv.used, paid: sv.paid, hints: sv.hints, wrong: sv.wrong,
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
    var self = this, kind = code.charAt(0), s = code.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var done = function (text) {
      var c = JSON.parse(text);
      if (!c || c.v !== 1 || typeof c.seed !== 'number') throw new Error('not a Word Galaxy progress link');
      if (c.gen !== Component.GEN) throw new Error(self.T('linkOld'));
      return { v: 1, seed: c.seed, level: c.level || 'hard', lang: c.lang === 'de' ? 'de' : 'en', gen: c.gen, focus: c.focus, state: c.state.split(''), used: c.used, paid: c.paid, hints: c.hints, wrong: c.wrong,
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
    // the core opens sooner now than in older versions of the game
    if (w.fields[0].round && g.state[0] === 'L' && this.coreReady()) g.state[0] = 'O';
    if (sv.used && sv.used.length === w.fields.length) g.used = sv.used.slice();
    if (sv.paid > 0) g.paid = sv.paid;
    if (sv.hints && sv.hints.length === w.fields.length) g.hints = sv.hints;
    (sv.wrong || []).forEach(function (i) { if (ids[i] >= 0) g.wrongMarked[ids[i]] = 1; });
    if (sv.focus >= 0 && sv.focus < w.fields.length) this.focus = sv.focus;
    this.recalcLit();
    // older saves can show a locked field (not discovered yet, or a next field): show an open field instead
    if (this.vis[this.focus] < 2) { var open = g.state.indexOf('O'); this.focus = open >= 0 ? open : w.current; }
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
    this.seed = sv ? sv.seed : 23; this.level = sv ? this.cleanLevel(sv.level) : 'medium';
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
      sel: {}, selN: 0,
      used: w.fields.map(function () { return 0; }),
      paid: 0,
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
  galaxyScale() { return this.camFor('galaxy').s; }
  // the box around the given fields, in world units
  fieldsBox(ids) {
    var w = this.world(), b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    ids.forEach(function (i) { var f = w.fields[i]; b.x0 = Math.min(b.x0, f.x0); b.y0 = Math.min(b.y0, f.y0); b.x1 = Math.max(b.x1, f.x1); b.y1 = Math.max(b.y1, f.y1); });
    return b;
  }
  // the box around all fields of the galaxy
  galaxyBox() {
    var w = this.world();
    return w.box || (w.box = this.fieldsBox(w.fields.map(function (f) { return f.i; })));
  }
  camFor(kind, fi) {
    var w = this.world(), VW = this.VW, VH = this.VH;
    if (kind === 'galaxy') {
      // the whole shape of the galaxy, in the middle of the space above the score card (see renderScore)
      // (on a very short screen, the score card gets at most a third of the height)
      var b = this.galaxyBox(), below = Math.min(Component.SCORE_H + 12, VH / 3);
      var sg = Math.min((VW - 16) / (b.x1 - b.x0), Math.max(8, VH - below - 16) / (b.y1 - b.y0));
      return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 + below / 2 / sg, s: sg };
    }
    var f = w.fields[fi], cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    if (kind === 'area') return { x: cx, y: cy, s: 9 / w.P };
    if (f.round) {
      // the round core: the whole circle with its ring when its letters are big enough to tap,
      // else letters of 24 px, starting at the top of the circle
      var cr = w.core, lp = w.P * cr.k, D = 2 * f.round.R + 2.2 * w.P;
      var sf = Math.min((VW - 20) / D, (VH - 20) / D, 2.4);
      if (sf * lp >= 22) return { x: f.round.cx, y: f.round.cy, s: sf };
      var s0 = 24 / lp, y0 = f.round.cy - f.round.R - 0.5 * w.P + VH / 2 / s0;
      return { x: f.round.cx, y: Math.min(f.round.cy, y0), s: s0 };
    }
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
  // the whole field and the fields in 'more', centred, even if letters get smaller than usual
  camFit(fi, more) {
    var b = this.fieldsBox([fi].concat(more || []));
    var s = Math.min((this.VW - 36) / (b.x1 - b.x0), (this.VH - 36) / (b.y1 - b.y0), 2.4);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, s: s };
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
  // the overlay: hints tied to the screen (edge arrows, mini map, badges, celebration) on their own transparent
  // canvas above the map, so they stay in place while the map picture moves
  setupOv(el) {
    if (!el || el === this._ov) return;
    this._ov = el;
    var d = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    var W = Math.round(this.VW * d), H = Math.round(this.VH * d);
    if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
    this.ovDpr = d;
    this.ovCtx = el.getContext('2d');
  }
  drawOverlay() {
    var c = this.cam, s = c.s, ox = this.VW / 2 - c.x * s, oy = this.VH / 2 - c.y * s;
    var ctx = this.ovCtx, d = this.ovDpr;
    if (!ctx) { ctx = this.ctx; d = this.dpr; }
    else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this._ov.width, this._ov.height); }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    this.dctx = ctx;
    this.renderOverlay(ox, oy, s);
    if (this.zoomLevel() === 0) this.renderScore();
    if (this.fx) this.renderFx(ox, oy, s);
    this.dctx = null;
  }
  // the selected letters as a word, read left to right, then top to bottom: it shows in the message bar
  selWord() {
    var w = this.world(), g = this.game;
    var sel = Object.keys(g.sel).map(Number).filter(function (j) { return g.cellWord[j] < 0; });
    sel.sort(function (a, b) { return w.cells[a].r - w.cells[b].r || w.cells[a].c - w.cells[b].c; });
    return sel.map(function (j) { return w.cells[j].l; }).join('');
  }
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
    if (g.state[this.focus] !== 'O') return null;
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
    var g = this.game, w = this.world(), kind = 'accept';
    var sel = this.validSelection();
    if (!sel) return null;
    // next to the last letter: the one the finger stopped on, else the last one in reading order
    var j = g.sel[this.lastCell] && sel.indexOf(this.lastCell) >= 0 ? this.lastCell : sel[sel.length - 1];
    var c = this.cam, s = c.s, B = 44;
    var o = w.cells[j], P = o.p;
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
      // flights between fields zoom out and back: there the motion layer alone looks calmer
      if (!M || this._anim || this.mainVer !== this._ver || km > 2.2 || km < 0.45) cv.style.opacity = '0';
      else {
        cv.style.transform = 'translate(' + ((M.x - c.x) * c.s).toFixed(2) + 'px,' + ((M.y - c.y) * c.s).toFixed(2) + 'px) scale(' + km.toFixed(5) + ')';
        cv.style.opacity = '1';
      }
    }
    this.drawOverlay();
    if (this.loMissing) this.paint();
  }

  // the core opens when 3 fields next to it are solved; in hard galaxies, when all of them are solved
  coreNeed() { var n = this.world().fields[0].nbList.length; return this.coreAll() ? n : Math.min(3, n); }
  coreAll() { return this.level === 'hard'; }
  coreSolvedNext() { var g = this.game; return this.world().fields[0].nbList.filter(function (j) { return g.state[j] === 'S'; }).length; }
  coreReady() { return this.coreSolvedNext() >= this.coreNeed(); }
  // the message for a tap on the locked core (other locked fields can not be tapped)
  coreGateMsg() { return this.T(this.coreAll() ? 'coreGateAll' : 'coreGate', this.coreNeed(), this.coreSolvedNext()); }

  // What the player sees of each field: 2 all (open, solved, and the core), 1 only the cells and the outline
  // (a locked field next to an open or solved one), 0 nothing (the rest of the galaxy is not discovered yet)
  recalcVis() {
    var w = this.world(), g = this.game;
    this.vis = new Uint8Array(w.fields.map(function (f) {
      if (g.state[f.i] !== 'L' || f.round) return 2;
      return f.nbList.some(function (j) { return g.state[j] !== 'L'; }) ? 1 : 0;
    }));
  }

  recalcLit() {
    var w = this.world(), g = this.game, lit = new Uint8Array(w.cells.length);
    this.recalcVis();
    w.fields.forEach(function (f) {
      if (g.state[f.i] !== 'O') return;
      f.cells.forEach(function (j) {
        var o = w.cells[j];
        if (o.sub) return;
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
    // the view of the whole galaxy is level 0, also on a big screen where it is close to the area view
    if (s <= this.galaxyScale() * 1.1) return 0;
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
    // the whole galaxy: how much of it is done, as a bar and a number at the bottom of the first picture
    var gp = this.galaxyProgress(), b0 = L[0], bh = 4;
    ctx.fillStyle = 'rgba(6,9,19,0.75)'; ctx.fillRect(b0.x + 1, b0.y + b0.h - bh - 1, b0.w - 2, bh);
    ctx.fillStyle = '#f2c063'; ctx.fillRect(b0.x + 1, b0.y + b0.h - bh - 1, (b0.w - 2) * gp, bh);
    var gt = this.percent(gp) + '%';
    ctx.font = '800 11px Archivo, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    var gw = ctx.measureText(gt).width + 8;
    ctx.fillStyle = 'rgba(6,9,19,0.8)'; ctx.fillRect(b0.x + 3, b0.y + b0.h - bh - 17, gw, 14);
    ctx.fillStyle = '#f2c063'; ctx.fillText(gt, b0.x + 7, b0.y + b0.h - bh - 4);
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
    var g = this.game, key = [this.seed, this.focus, this.zoomLevel(), g.words.length, g.state.join(''), this.galaxyProgress(), this.VW].join('|');
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
    this.drawOverlay();
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
    var f = this.world().fields[fi], m = f && f.round ? 4 * this.world().P : 34;
    if (f) this.dirtyRect(f.x0 - m, f.y0 - m, f.x1 + m, f.y1 + m);
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
    var lit = this.lit, fontTile = tile;
    var core0 = w.fields[0].round ? w.fields[0] : null;
    if (core0 && fine) this.drawCoreBack(ctx, core0, s, ox, oy, px);
    for (i = 0; i < w.cells.length; i++) {
      var o = w.cells[i];
      // letters of the round core are smaller
      tile = o.p * s; tileCss = tile / px; fine = tileCss >= 6; text = tileCss >= 10;
      if (text && tile !== fontTile) { ctx.font = '800 ' + (tile * 0.5).toFixed(1) + 'px Archivo, system-ui, sans-serif'; fontTile = tile; }
      var x = o.x * s + ox, y = o.y * s + oy;
      if (x > VW || y > VH || x + tile < 0 || y + tile < 0) continue;
      var f = w.fields[o.f], fst = g.state[o.f], wid = g.cellWord[i], sel = !!g.sel[i], vis = this.vis ? this.vis[o.f] : 2;
      // not discovered yet: nothing shows
      if (vis === 0) continue;
      var bg, fg = '#1d2433';
      if (wid >= 0) bg = COLORS[g.words[wid].colour % COLORS.length];
      else if (sel) { bg = '#2563ff'; fg = '#ffffff'; }
      else if (fst === 'O') bg = f.openBg || '#f4efe4';
      else if (f.goal) { bg = '#f2c063'; fg = '#3a2806'; }
      else { bg = f.lockBg; fg = f.lockFg; }
      ctx.fillStyle = bg;
      // the other fields are darker, so the border of the field being played is clear; solved fields more than open ones.
      // A solved field is brighter and has the tint of its rating: perfect is bright gold, then darker for each lower rating.
      var dimIt = o.f !== this.focus && fst !== 'L', dimCol = fst === 'S' ? Component.RATING_SHADES[this.rating(o.f)] : [f.dimOpen];
      if (!fine) { ctx.fillRect(x, y, tile + 0.3, tile + 0.3); if (dimIt) dimCol.forEach(function (c) { ctx.fillStyle = c; ctx.fillRect(x, y, tile + 0.3, tile + 0.3); }); continue; }
      var me = grp[i], fl = o.flags;
      var sT = me !== 0 && o.nb[0] >= 0 && grp[o.nb[0]] === me;
      var sR = me !== 0 && o.nb[1] >= 0 && grp[o.nb[1]] === me;
      var sB = me !== 0 && o.nb[2] >= 0 && grp[o.nb[2]] === me;
      var sL = me !== 0 && o.nb[3] >= 0 && grp[o.nb[3]] === me;
      // one even gap around every letter box (no steps where a word runs along the field border)
      var I = 1.5 * s, ov = 0.6 * px;
      var xl = sL ? x - ov : x + I, xr = sR ? x + tile + ov : x + tile - I;
      var yt = sT ? y - ov : y + I, yb = sB ? y + tile + ov : y + tile - I;
      if (!(ctx.roundRect && tileCss >= 12)) {
        ctx.fillRect(xl, yt, xr - xl, yb - yt);
      } else {
        // the box as one outline: round outer corners; inner corners of a word are cut out with a small curve
        var r = Math.min(5 * s, tile * 0.2), rf = Math.min(r, I);
        var dg = function (k) { var q = o.nd[k]; return q >= 0 && grp[q] === me; };
        var nTL = sT && sL && !dg(0), nTR = sT && sR && !dg(1), nBR = sB && sR && !dg(2), nBL = sB && sL && !dg(3);
        var X0 = x + I, X1 = x + tile - I, Y0 = y + I, Y1 = y + tile - I;
        ctx.beginPath();
        if (!sT && !sL) { ctx.moveTo(xl, yt + r); ctx.arcTo(xl, yt, xl + r, yt, r); }
        else if (nTL) { ctx.moveTo(xl, Y0); ctx.lineTo(X0 - rf, Y0); ctx.arcTo(X0, Y0, X0, Y0 - rf, rf); ctx.lineTo(X0, yt); }
        else ctx.moveTo(xl, yt);
        if (!sT && !sR) { ctx.lineTo(xr - r, yt); ctx.arcTo(xr, yt, xr, yt + r, r); }
        else if (nTR) { ctx.lineTo(X1, yt); ctx.lineTo(X1, Y0 - rf); ctx.arcTo(X1, Y0, X1 + rf, Y0, rf); ctx.lineTo(xr, Y0); }
        else ctx.lineTo(xr, yt);
        if (!sB && !sR) { ctx.lineTo(xr, yb - r); ctx.arcTo(xr, yb, xr - r, yb, r); }
        else if (nBR) { ctx.lineTo(xr, Y1); ctx.lineTo(X1 + rf, Y1); ctx.arcTo(X1, Y1, X1, Y1 + rf, rf); ctx.lineTo(X1, yb); }
        else ctx.lineTo(xr, yb);
        if (!sB && !sL) { ctx.lineTo(xl + r, yb); ctx.arcTo(xl, yb, xl, yb - r, r); }
        else if (nBL) { ctx.lineTo(X0, yb); ctx.lineTo(X0, Y1 + rf); ctx.arcTo(X0, Y1, X0 - rf, Y1, rf); ctx.lineTo(xl, Y1); }
        else ctx.lineTo(xl, yb);
        ctx.closePath();
        ctx.fill();
      }
      var rx = xl, ry = yt, rw = xr - xl, rh = yb - yt;
      // (flag 16 marks an old 'star cell' idea that has no meaning in the game; it is not drawn)
      // the next fields show no letters yet
      if (text && vis === 2) {
        ctx.fillStyle = fg;
        ctx.fillText(o.l, x + tile / 2, y + tile / 2 + tile * 0.03);
      }
      // other fields are darker, so the field being played stands out
      for (var dk = 0; dimIt && dk < dimCol.length; dk++) { ctx.fillStyle = dimCol[dk]; if (ctx.roundRect && tileCss >= 12) ctx.fill(); else ctx.fillRect(rx, ry, rw, rh); }
    }
    tile = P * s; tileCss = tile / px; fine = tileCss >= 6; text = tileCss >= 10;
    if (core0 && fine) this.drawCoreFront(ctx, core0, s, ox, oy, px);
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
    // outlines: focused field gold, other open fields bright blue with a glow, solved fields green
    var self = this;
    // lines are thinner when the letters are small (zoomed out), so they do not cover the fields
    var lineK = Math.max(0.4, Math.min(1, P * s / px / 40));
    function outline(fi, colour, dashed, width, glow) {
      var f = w.fields[fi];
      var fx0 = f.x0 * s + ox, fy0 = f.y0 * s + oy;
      if (f.x1 * s + ox < 0 || f.y1 * s + oy < 0 || fx0 > VW || fy0 > VH) return;
      ctx.beginPath();
      if (f.round) { ctx.arc(f.round.cx * s + ox, f.round.cy * s + oy, (f.round.R + 3) * s, 0, Math.PI * 2); }
      else f.cells.forEach(function (j) {
        var o = w.cells[j], x = o.x * s + ox, y = o.y * s + oy, fl = o.flags, tile = o.p * s;
        if (fl & 1) { ctx.moveTo(x, y); ctx.lineTo(x + tile, y); }
        if (fl & 4) { ctx.moveTo(x, y + tile); ctx.lineTo(x + tile, y + tile); }
        if (fl & 8) { ctx.moveTo(x, y); ctx.lineTo(x, y + tile); }
        if (fl & 2) { ctx.moveTo(x + tile, y); ctx.lineTo(x + tile, y + tile); }
      });
      ctx.strokeStyle = colour; ctx.lineWidth = width * px * lineK;
      ctx.setLineDash(dashed ? [6 * px, 5 * px] : []);
      if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10 * px * lineK; }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    }
    w.fields.forEach(function (f) { if (g.state[f.i] === 'O' && f.i !== self.focus) outline(f.i, '#8fbcff', false, 3.5, 'rgba(110,170,255,0.95)'); });
    w.fields.forEach(function (f) { if (g.state[f.i] === 'S' && f.i !== self.focus) outline(f.i, '#7fd17a', false, 2.5); });
    // the next fields: a thin dashed line, so the player can plan a way to the core
    w.fields.forEach(function (f) { if (self.vis && self.vis[f.i] === 1 && f.i !== self.focus) outline(f.i, 'rgba(176,186,236,0.7)', true, 2); });
    // the field being played: a dark band and a thick gold line with a glow, so its border is easy to see
    if (!w.fields[this.focus].round) outline(this.focus, 'rgba(6,9,19,0.9)', false, 9);
    outline(this.focus, '#ffcc5c', false, 4.5, 'rgba(255,200,95,0.95)');
    // word outlines: marked wrong (red dashed)
    function wordOutline(wd, colour, dashed) {
      ctx.beginPath();
      wd.cells.forEach(function (j) {
        var o = w.cells[j], x = o.x * s + ox, y = o.y * s + oy, tile = o.p * s;
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
    // the selected letters: a white line around them with round outer corners, so they are easy to see on every background
    var selList = Object.keys(g.sel).map(Number);
    if (selList.length) {
      ctx.beginPath();
      selList.forEach(function (j) {
        var o = w.cells[j], x = o.x * s + ox, y = o.y * s + oy, t = o.p * s, r = t * 0.3;
        var open = [0, 1, 2, 3].map(function (k) { var n = o.nb[k]; return !(n >= 0 && g.sel[n]); });
        var T = open[0], R = open[1], B = open[2], L = open[3];
        // the straight parts of the open sides, shorter where a corner is round
        if (T) { ctx.moveTo(L ? x + r : x, y); ctx.lineTo(R ? x + t - r : x + t, y); }
        if (B) { ctx.moveTo(L ? x + r : x, y + t); ctx.lineTo(R ? x + t - r : x + t, y + t); }
        if (L) { ctx.moveTo(x, T ? y + r : y); ctx.lineTo(x, B ? y + t - r : y + t); }
        if (R) { ctx.moveTo(x + t, T ? y + r : y); ctx.lineTo(x + t, B ? y + t - r : y + t); }
        // the round outer corners
        if (T && L) { ctx.moveTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); }
        if (T && R) { ctx.moveTo(x + t - r, y); ctx.arcTo(x + t, y, x + t, y + r, r); }
        if (B && R) { ctx.moveTo(x + t, y + t - r); ctx.arcTo(x + t, y + t, x + t - r, y + t, r); }
        if (B && L) { ctx.moveTo(x + r, y + t); ctx.arcTo(x, y + t, x, y + t - r, r); }
      });
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5 * px, 2.5 * s); ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(37,99,255,0.9)'; ctx.shadowBlur = 6 * px;
      ctx.stroke(); ctx.shadowBlur = 0; ctx.lineCap = 'butt';
    }
    // starlight marks: the shape of a word that a star showed, until the word is found
    g.hints.forEach(function (list) {
      list.forEach(function (h) {
        var hc = self.hintCells(h), x = g.cellWord[hc[0]], inH = {};
        // found: one word has exactly these letters
        if (x >= 0 && g.words[x].cells.length === hc.length && hc.every(function (j) { return g.cellWord[j] === x; })) return;
        hc.forEach(function (j) { inH[j] = 1; });
        ctx.beginPath();
        hc.forEach(function (j) {
          var o = w.cells[j], x0 = o.x * s + ox, y0 = o.y * s + oy, tile = o.p * s;
          ctx.fillStyle = 'rgba(242,160,40,0.3)'; ctx.fillRect(x0, y0, tile, tile);
          for (var k = 0; k < 4; k++) {
            var n = o.nb[k];
            if (n >= 0 && inH[n]) continue;
            if (k === 0) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + tile, y0); }
            if (k === 2) { ctx.moveTo(x0, y0 + tile); ctx.lineTo(x0 + tile, y0 + tile); }
            if (k === 3) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + tile); }
            if (k === 1) { ctx.moveTo(x0 + tile, y0); ctx.lineTo(x0 + tile, y0 + tile); }
          }
        });
        ctx.strokeStyle = '#c4700c'; ctx.lineWidth = Math.max(1.5 * px, 3.5 * s * w.cells[hc[0]].p / P); ctx.lineCap = 'round'; ctx.stroke();
      });
    });
  }

  // the round core: warm glow and slow rays behind the letters
  drawCoreBack(ctx, f, s, ox, oy, px) {
    var w = this.world(), g = this.game, P = w.P, cx = f.round.cx * s + ox, cy = f.round.cy * s + oy, R = f.round.R * s;
    var prog = this.coreProgress(), open = g.state[0] !== 'L';
    var gr = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 2.1);
    gr.addColorStop(0, 'rgba(242,192,99,' + (0.22 + 0.3 * prog) + ')'); gr.addColorStop(1, 'rgba(242,192,99,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * 2.1, 0, Math.PI * 2); ctx.fill();
    // threads of light from each solved field around the core to its star (behind the letters)
    var RR = R + 0.85 * P * s;
    f.nbList.forEach(function (j) {
      if (g.state[j] !== 'S') return;
      var n = w.fields[j], ncx = (n.x0 + n.x1) / 2 * s + ox, ncy = (n.y0 + n.y1) / 2 * s + oy, a = Math.atan2(ncy - cy, ncx - cx);
      ctx.strokeStyle = 'rgba(255,214,120,0.85)'; ctx.lineWidth = Math.max(px, 0.12 * P * s); ctx.shadowColor = 'rgba(255,200,95,0.9)'; ctx.shadowBlur = 10 * px;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * RR, cy + Math.sin(a) * RR); ctx.lineTo(ncx, ncy); ctx.stroke();
      ctx.shadowBlur = 0;
    });
    ctx.fillStyle = 'rgba(255,214,120,' + (open ? 0.1 + 0.12 * prog : 0.06) + ')';
    for (var i = 0; i < 24; i++) {
      var a = i / 24 * Math.PI * 2, a1 = a - 0.035, a2 = a + 0.035, r0 = R + 1.3 * P * s, r1 = R + (i % 2 ? 2.4 : 3.4) * P * s;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a2) * r0, cy + Math.sin(a2) * r0); ctx.fill();
    }
  }
  // ring that fills with every word, a star for each field around the core, the lock while it is closed
  drawCoreFront(ctx, f, s, ox, oy, px) {
    var w = this.world(), g = this.game, P = w.P, cx = f.round.cx * s + ox, cy = f.round.cy * s + oy, R = f.round.R * s;
    var prog = this.coreProgress(), RR = R + 0.85 * P * s;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(242,192,99,0.22)'; ctx.lineWidth = Math.max(2 * px, 0.22 * P * s);
    ctx.beginPath(); ctx.arc(cx, cy, RR, 0, Math.PI * 2); ctx.stroke();
    if (prog > 0) {
      ctx.strokeStyle = '#f2c063'; ctx.shadowColor = 'rgba(255,200,95,0.9)'; ctx.shadowBlur = 10 * px;
      ctx.beginPath(); ctx.arc(cx, cy, RR, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    var self = this, done = 0;
    f.nbList.forEach(function (j) {
      var n = w.fields[j], a = Math.atan2((n.y0 + n.y1) / 2 - f.round.cy, (n.x0 + n.x1) / 2 - f.round.cx), lit = g.state[j] === 'S';
      if (lit) done++;
      var sx = cx + Math.cos(a) * RR, sy = cy + Math.sin(a) * RR;
      self.drawStar(ctx, sx, sy, (lit ? 0.42 : 0.3) * P * s, lit ? '#ffe39a' : '#3b3f5c', lit ? 8 * px : 0);
    });
    if (g.state[0] === 'L') {
      // closed: dark veil, and how many of the fields that it needs are solved
      ctx.fillStyle = 'rgba(6,9,19,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, R + 2, 0, Math.PI * 2); ctx.fill();
      if (R > 30 * px) {
        ctx.fillStyle = '#f2c063'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 ' + (R * 0.32).toFixed(1) + 'px Archivo, system-ui, sans-serif';
        ctx.shadowColor = 'rgba(242,192,99,0.8)'; ctx.shadowBlur = 12 * px;
        ctx.fillText(Math.min(done, self.coreNeed()) + ' / ' + self.coreNeed(), cx, cy);
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }
  drawStar(ctx, x, y, r, col, blur) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = i * Math.PI / 5 - Math.PI / 2, q = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
    ctx.closePath(); if (blur) { ctx.shadowColor = 'rgba(255,200,95,0.9)'; ctx.shadowBlur = blur; }
    ctx.fillStyle = col; ctx.fill(); ctx.restore();
  }
  coreProgress() {
    var w = this.world(), g = this.game, f = w.fields[0], n = 0;
    f.cells.forEach(function (j) { if (g.cellWord[j] >= 0) n++; });
    return f.cells.length ? n / f.cells.length : 0;
  }
  // the finale: the core flares, a wave of light runs out over every solved field, then the galaxy's numbers
  // the core is solved (all false), or every field of the galaxy is solved (all true): then fireworks too
  finale(all) {
    var g = this.game, w = this.world(), bursts = [];
    if (all) {
      // fireworks over the solved fields, one after the other from the core outwards
      var COL = ['#fff4c2', '#f2c063', '#9cc9ea', '#f29b9b', '#bfe08f', '#dcb0e6', '#7fd1c1', '#ffffff'];
      var order = w.fields.slice(1).sort(function (a, b) { return Math.hypot((a.x0 + a.x1) / 2 - w.W / 2, (a.y0 + a.y1) / 2 - w.W / 2) - Math.hypot((b.x0 + b.x1) / 2 - w.W / 2, (b.y0 + b.y1) / 2 - w.W / 2); });
      for (var i = 0; i < 46; i++) {
        var f = order[Math.floor((i + Math.random()) / 46 * order.length)], parts = [];
        var col = COL[i % COL.length], col2 = COL[(i * 3 + 1) % COL.length];
        for (var k = 0; k < 44; k++) { var a = k / 44 * Math.PI * 2 + Math.random() * 0.2, sp = 0.6 + Math.random() * 0.5; parts.push({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, col: k % 3 ? col : col2 }); }
        bursts.push({ x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, t: 0.8 + i * 0.22 + Math.random() * 0.2, parts: parts });
      }
    }
    this.fx = { kind: 'finale', all: !!all, bursts: bursts, fi: 0, t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      stats: [[g.state.filter(function (x) { return x === 'S'; }).length + ' / ' + g.state.length, this.T('stFields')],
        [g.words.filter(function (x) { return x.alive && !x.gift; }).length, this.T('stWords')],
        [this.starsSpent(), this.T('stStars')],
        [this.pct(this.ratingCounts().by[0], g.state.length) + '%', this.T('stPerfect')]] };
    this.paint();
  }
  renderFinale(ox, oy, s) {
    var ctx = this.dctx || this.ctx, w = this.world(), g = this.game, fx = this.fx, VW = this.VW, VH = this.VH, f0 = w.fields[0];
    var T = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - fx.t0) / 1000, END = fx.all ? 16 : 10;
    if (T > END) { this.fx = null; return; }
    var cx = f0.round.cx * s + ox, cy = f0.round.cy * s + oy, fade = T > END - 1 ? END - T : 1;
    ctx.save(); ctx.globalAlpha = fade;
    if (fx.all) {
      // a slow wheel of light turns around the core
      var arm = Math.max(VW, VH);
      for (var ai = 0; ai < 3; ai++) {
        var ang = T * 0.9 + ai * Math.PI * 2 / 3;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
        var lg = ctx.createLinearGradient(0, 0, arm, 0);
        lg.addColorStop(0, 'rgba(255,236,180,' + (0.35 * Math.min(1, T / 1.5)) + ')'); lg.addColorStop(1, 'rgba(255,236,180,0)');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(arm, -arm * 0.18); ctx.lineTo(arm, arm * 0.18); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // fireworks: each burst flies out, falls a little and fades
      fx.bursts.forEach(function (b) {
        var age = T - b.t;
        if (age < 0 || age > 1.8) return;
        var bx = b.x * s + ox, by = b.y * s + oy, k = 1 - Math.pow(1 - Math.min(1, age / 1.1), 3), a = age < 1.1 ? 1 : 1 - (age - 1.1) / 0.7;
        if (age < 0.25) { var fl = ctx.createRadialGradient(bx, by, 0, bx, by, 30); fl.addColorStop(0, 'rgba(255,255,255,' + (1 - age / 0.25) + ')'); fl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(bx, by, 30, 0, Math.PI * 2); ctx.fill(); }
        b.parts.forEach(function (q) {
          ctx.globalAlpha = fade * a;
          var R2 = 115 * k, px2 = bx + q.vx * R2, py2 = by + q.vy * R2 + 22 * age * age;
          // a short trail behind each spark
          ctx.strokeStyle = q.col; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(bx + q.vx * R2 * 0.86, by + q.vy * R2 * 0.86 + 22 * age * age); ctx.lineTo(px2, py2); ctx.stroke();
          ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(px2, py2, 3.4 * (1 - age / 2.4), 0, Math.PI * 2); ctx.fill();
        });
      });
      ctx.globalAlpha = fade;
    }
    // 1. the core flares
    var flare = Math.min(1, T / 1.2), rad = (40 + 140 * flare) * Math.max(0.6, Math.min(1.6, VW / 390));
    var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, 'rgba(255,248,225,' + (0.3 + 0.6 * flare) + ')'); gr.addColorStop(0.4, 'rgba(242,192,99,' + (0.25 + 0.35 * flare) + ')'); gr.addColorStop(1, 'rgba(242,192,99,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    // 2. a shock ring
    if (T > 0.3 && T < 2.8) { var k = (T - 0.3) / 2.5; ctx.strokeStyle = 'rgba(255,230,160,' + (1 - k) + ')'; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(cx, cy, 30 + k * Math.max(VW, VH) * 0.7, 0, Math.PI * 2); ctx.stroke(); }
    // 3. a wave of light over every solved field, from the core outwards
    var maxD = 1;
    w.fields.forEach(function (f) { maxD = Math.max(maxD, Math.hypot((f.x0 + f.x1) / 2 - f0.round.cx, (f.y0 + f.y1) / 2 - f0.round.cy)); });
    w.fields.forEach(function (f) {
      if (g.state[f.i] !== 'S' || f.i === 0) return;
      var fcx = (f.x0 + f.x1) / 2, fcy = (f.y0 + f.y1) / 2, u = Math.hypot(fcx - f0.round.cx, fcy - f0.round.cy) / maxD;
      var age = T - 0.9 - u * 2.6;
      if (age < 0) return;
      var a = age < 0.35 ? age / 0.35 : Math.max(0.25, 1 - (age - 0.35) / 1.2);
      var x = fcx * s + ox, y = fcy * s + oy, rr = Math.max(4, (f.x1 - f.x0) * s * 0.6);
      var g2 = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g2.addColorStop(0, 'rgba(255,240,200,' + (0.85 * a) + ')'); g2.addColorStop(1, 'rgba(242,192,99,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
    });
    // 4. title and numbers
    var txt = Math.max(0, Math.min(1, (T - 3.2) / 0.8));
    if (txt > 0) {
      ctx.globalAlpha = txt * fade;
      var by = VH - 150;
      ctx.fillStyle = 'rgba(4,6,13,0.78)'; ctx.fillRect(0, by - 46, VW, 160);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f2c063'; ctx.font = '800 12px Archivo, system-ui, sans-serif'; ctx.fillText(this.T('finaleSub', this.seed).split('').join(' '), VW / 2, by - 24);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 30px Archivo, system-ui, sans-serif'; ctx.shadowColor = 'rgba(242,192,99,0.8)'; ctx.shadowBlur = 16;
      ctx.fillText(this.T(fx.all ? 'allTitle' : 'finaleTitle'), VW / 2, by + 10); ctx.shadowBlur = 0;
      var n = fx.stats.length, cw = Math.min(100, VW / n);
      fx.stats.forEach(function (st, i) {
        var x = VW / 2 + (i - (n - 1) / 2) * cw;
        ctx.fillStyle = '#eef0f7'; ctx.font = '800 20px Archivo, system-ui, sans-serif'; ctx.fillText(String(st[0]), x, by + 58);
        ctx.fillStyle = '#a3abc6'; ctx.font = '600 12px Archivo, system-ui, sans-serif'; ctx.fillText(st[1], x, by + 80);
      });
    }
    ctx.restore();
    this.paint();
  }

  celebrate(fi, opened, rating) {
    var w = this.world(), f = w.fields[fi], parts = [];
    var COL = ['#fff4c2', '#f2c063', '#ffffff', '#9cc9ea', '#f29b9b', '#bfe08f'];
    var cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    for (var i = 0; i < 110; i++) {
      var o = w.cells[f.cells[Math.floor(Math.random() * f.cells.length)]];
      var x = o.x + 14, y = o.y + 14, a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 1.2;
      var sp = 60 + Math.random() * 240;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.9 + Math.random() * 0.9, size: 2 + Math.random() * 5, col: COL[i % COL.length], spin: Math.random() * 6 });
    }
    this.fx = { fi: fi, t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()), parts: parts, opened: opened, rating: rating, name: f.name };
    this.paint();
  }

  renderFx(ox, oy, s) {
    if (this.fx.kind === 'finale') { this.renderFinale(ox, oy, s); return; }
    var ctx = this.dctx || this.ctx, w = this.world(), fx = this.fx, f = w.fields[fx.fi], VW = this.VW, VH = this.VH, P = w.P;
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
      ctx.fillRect(o.x * s + ox + s, o.y * s + oy + s, o.p * s - 2 * s, o.p * s - 2 * s);
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
    // 4. newly opened neighbours pulse in the blue of open fields (by number: names can come twice in a galaxy)
    var pulse = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - 0.6) / 1.8)) * Math.PI * 3));
    if (t > 0.6 && fx.opened.length) {
      fx.opened.forEach(function (ni) {
        var nf = w.fields[ni];
        ctx.beginPath();
        nf.cells.forEach(function (j) {
          var o = w.cells[j], x = o.x * s + ox, y = o.y * s + oy, fl = o.flags;
          if (fl & 1) { ctx.moveTo(x, y); ctx.lineTo(x + tile, y); }
          if (fl & 4) { ctx.moveTo(x, y + tile); ctx.lineTo(x + tile, y + tile); }
          if (fl & 8) { ctx.moveTo(x, y); ctx.lineTo(x, y + tile); }
          if (fl & 2) { ctx.moveTo(x + tile, y); ctx.lineTo(x + tile, y + tile); }
        });
        ctx.strokeStyle = 'rgba(143,188,255,' + (0.9 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 3 + 5 * pulse; ctx.shadowColor = 'rgba(110,170,255,0.95)'; ctx.shadowBlur = 16 * pulse;
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
    // the rating in its colour, then the stars that the field gave
    var gotStars = this.starsFor(fx.fi), rName = this.ratingName(fx.rating || 0), rest = '  ·  +' + gotStars + ' ★';
    var wN = ctx.measureText(rName).width, wR = ctx.measureText(rest).width;
    ctx.textAlign = 'left';
    ctx.fillStyle = Component.RATING_COLORS[fx.rating || 0]; ctx.fillText(rName, -(wN + wR) / 2, 34);
    ctx.fillStyle = '#f2c063'; ctx.fillText(rest, -(wN + wR) / 2 + wN, 34);
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
  // a share as percent: one decimal below 10%, so the first fields show progress too; never 100 before the end
  percent(x) { return x >= 1 ? '100' : x < 0.1 ? String(Math.floor(x * 1000) / 10) : String(Math.floor(x * 100)); }
  // the part of the whole galaxy that is done: letters in correct words
  galaxyProgress() {
    var w = this.world(), g = this.game, done = 0;
    for (var j = 0; j < w.cells.length; j++) { var x = g.cellWord[j]; if (x >= 0 && g.words[x].correct) done++; }
    return done / w.cells.length;
  }
  // zoomed out: the difficulty and the percent done on open fields
  renderBadges(ox, oy, s) {
    var w = this.world(), g = this.game, prog = this.fieldProgress(), self = this;
    // open fields: their difficulty in its colour, and how much of the field is done.
    // When the field is too small for that, only how much is done.
    w.fields.forEach(function (f) {
      if (g.state[f.i] !== 'O' || f.round) return;
      var fw = (f.x1 - f.x0) * s, fh = (f.y1 - f.y0) * s, done = prog[f.i] > 0 ? Math.round(prog[f.i] * 100) + '%' : '';
      if (fw >= 44 && fh >= 22) self.fieldLabel(f.i, self.tierName(f.tier) + (done ? ' · ' + done : ''), Component.TIER_COLORS[f.tier] || '#b0baec', ox, oy, s);
      else if (done && fw >= 14 && fh >= 14) self.fieldLabel(f.i, done, 'rgba(17,26,51,0.92)', ox, oy, s, '#eef0f7', '#7fb2ff');
    });
  }

  tierName(t) { return this.T('tiers').split('|')[t] || ''; }
  // one colour for each difficulty, from green (very easy) to violet (master)
  static get TIER_COLORS() { return ['', '#7fd17a', '#b9dc63', '#f2c063', '#f39a4b', '#ee6262', '#c584ff']; }

  // the height of the score card
  static get SCORE_H() { return 92; }
  // The score card, at the bottom of the view of the whole galaxy, so a screenshot shows it:
  // the galaxy, the share of solved fields, and the share of all fields with each rating (best: 100% perfect).
  renderScore() {
    var ctx = this.dctx || this.ctx, VW = this.VW, VH = this.VH, rc = this.ratingCounts(), self = this;
    var W = Math.min(VW - 24, 380), H = Component.SCORE_H, x0 = (VW - W) / 2, y0 = VH - H - 12, pad = 14;
    ctx.save();
    ctx.fillStyle = 'rgba(12,18,40,0.9)'; ctx.strokeStyle = 'rgba(242,192,99,0.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, W, H, 14); else ctx.rect(x0, y0, W, H); ctx.fill(); ctx.stroke();
    ctx.textBaseline = 'middle';
    // line 1: the galaxy, and the solved fields
    ctx.font = '800 13px Archivo, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#eef0f7';
    ctx.fillText(this.T('menuGalaxy', this.seed, this.levelName(this.level)), x0 + pad, y0 + 18);
    ctx.textAlign = 'right'; ctx.fillStyle = '#f2c063';
    ctx.fillText(this.T('scoreFields', rc.done, rc.all, this.pct(rc.done, rc.all)), x0 + W - pad, y0 + 18);
    // line 2: one bar for all fields, a part for each rating
    var bx = x0 + pad, bw = W - 2 * pad, by = y0 + 34, bh = 10, at = bx;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 5); else ctx.rect(bx, by, bw, bh); ctx.fill();
    ctx.save(); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 5); else ctx.rect(bx, by, bw, bh); ctx.clip();
    rc.by.forEach(function (n, r) { var ww = bw * n / rc.all; ctx.fillStyle = Component.RATING_COLORS[r]; ctx.fillRect(at, by, ww, bh); at += ww; });
    ctx.restore();
    // line 3: each rating with its share of all fields
    ctx.font = '700 12px Archivo, system-ui, sans-serif'; ctx.textAlign = 'left';
    var cw = bw / 4;
    rc.by.forEach(function (n, r) {
      var cx = bx + r * cw, cy = y0 + 70;
      ctx.beginPath(); ctx.arc(cx + 5, cy, 5, 0, Math.PI * 2); ctx.fillStyle = Component.RATING_COLORS[r]; ctx.fill();
      ctx.fillStyle = '#dfe3f6'; ctx.fillText(self.ratingName(r), cx + 14, cy - 8);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 13px Archivo, system-ui, sans-serif'; ctx.fillText(self.pct(n, rc.all) + '%', cx + 14, cy + 8);
      ctx.font = '700 12px Archivo, system-ui, sans-serif';
    });
    ctx.restore();
  }

  // the middle of the cells of a field, in world units
  fieldMiddle(fi) {
    var w = this.world(), f = w.fields[fi], cache = w.mids || (w.mids = {});
    if (cache[fi]) return cache[fi];
    var sx = 0, sy = 0;
    f.cells.forEach(function (j) { var o = w.cells[j]; sx += o.x + o.p / 2; sy += o.y + o.p / 2; });
    return (cache[fi] = { x: sx / f.cells.length, y: sy / f.cells.length });
  }
  // a label on a pill in the middle of the cells of a field (the box of an irregular field can have its middle outside the field).
  // Without ink and edge: dark text on the colour with a dark edge.
  fieldLabel(fi, txt, colour, ox, oy, s, ink, edge) {
    var ctx = this.dctx || this.ctx, m = this.fieldMiddle(fi), VW = this.VW, VH = this.VH;
    var cx = m.x * s + ox, cy = m.y * s + oy;
    if (cx < -60 || cy < -20 || cx > VW + 60 || cy > VH + 20) return;
    ctx.font = '800 11px Archivo, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var tw = Math.max(30, ctx.measureText(txt).width + 14), th = 19;
    ctx.fillStyle = colour; ctx.strokeStyle = edge || 'rgba(6,9,19,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, th / 2); else ctx.rect(cx - tw / 2, cy - th / 2, tw, th);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink || '#141a2e'; ctx.fillText(txt, cx, cy + 0.5);
  }

  renderOverlay(ox, oy, s) {
    var ctx = this.dctx || this.ctx, w = this.world(), g = this.game, f = w.fields[this.focus], VW = this.VW, VH = this.VH;
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
    var cols = (f.x1 - f.x0) / w.P, rows = (f.y1 - f.y0) / w.P;
    var u = Math.max(2, Math.floor(Math.min(84 / cols, 96 / rows)));
    var mw = cols * u, mh = rows * u, mx = VW - mw - 12, my = 12;
    ctx.fillStyle = 'rgba(6,9,19,0.82)';
    ctx.fillRect(mx - 5, my - 5, mw + 10, mh + 10);
    var COLORS = ['#9cc9ea', '#f4b26b', '#bfe08f', '#dcb0e6', '#f29b9b', '#7fd1c1'];
    f.cells.forEach(function (j) {
      var o = w.cells[j], wid = g.cellWord[j];
      ctx.fillStyle = wid >= 0 ? COLORS[g.words[wid].colour % 6] : g.sel[j] ? '#2563ff' : '#8f8a80';
      var uu = u * o.p / w.P;
      ctx.fillRect(mx + (o.x - f.x0) / w.P * u, my + (o.y - f.y0) / w.P * u, uu - (uu > 3 ? 1 : 0), uu - (uu > 3 ? 1 : 0));
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
    // measure against the fixed area around the canvas: the canvas itself is moved while the view moves
    var box = this._cv.parentNode || this._cv, r = box.getBoundingClientRect();
    return { x: (e.clientX - r.left) * this.VW / r.width, y: (e.clientY - r.top) * this.VH / r.height };
  }
  cellAtPt(p, strict) {
    var w = this.world(), q = this.toWorld(p.x, p.y);
    var cc = Math.floor((q.x - w.M) / w.P), rr = Math.floor((q.y - w.M) / w.P);
    var j = w.at(rr, cc), cr = w.core;
    if (cr) {
      var side = cr.sq, sq0 = cr.sq0;
      // the corners of that square belong to the fields around the core
      if (j < 0 && rr >= sq0 && rr < sq0 + side && cc >= sq0 && cc < sq0 + side) {
        var kp = w.P * cr.k;
        var qr = (q.y - w.M - cr.r0 * w.P) / kp, qc = (q.x - w.M - cr.c0 * w.P) / kp;
        j = qr < 0 || qc < 0 ? -1 : w.coreAt(Math.floor(qr), Math.floor(qc));
      }
    }
    if (j < 0) return null;
    if (strict) {
      var o = w.cells[j], dx = q.x - (o.x + o.p / 2), dy = q.y - (o.y + o.p / 2);
      if (Math.abs(dx) > o.p * 0.4 || Math.abs(dy) > o.p * 0.4) return null;
    }
    return w.cells[j];
  }
  canPaint() { return this.game.state[this.focus] === 'O' && this.cam.s >= this.fieldScale(this.focus) * 0.6; }

  down(e) {
    if (!this._cv) return;
    if (this._anim) { cancelAnimationFrame(this._anim); this._anim = 0; }
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    var p = this.pt(e);
    // a touch on the map closes the star bubble
    if (this.starAsk) { this.starAsk = null; this.bump(); }
    // a new first finger: forget fingers whose 'lifted' event never arrived (they would turn a touch into a pinch)
    if (e.isPrimary) { this.ptrs = {}; if (this.drag && this.drag.mode === 'pinch') this.drag = null; }
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
    // a touch just outside the field, close to one of its letters, is a touch on that letter
    if (o && o.f !== this.focus && !o.sub && this.canPaint()) {
      var w = this.world(), q = this.toWorld(p.x, p.y), near = null, nd = 0.45 * o.p;
      o.nb.concat(o.nd).forEach(function (j) {
        if (j < 0 || w.cells[j].f !== this.focus) return;
        var c = w.cells[j], dx = Math.max(c.x - q.x, 0, q.x - c.x - c.p), dy = Math.max(c.y - q.y, 0, q.y - c.y - c.p), d = Math.hypot(dx, dy);
        if (d < nd) { nd = d; near = c; }
      }, this);
      if (near) o = near;
    }
    // a field that is locked (not discovered yet, or a next field) can not be played: a touch there is a touch on empty space
    if (o && this.vis && this.vis[o.f] < 2) o = null;
    if (!mouseRight && o && o.f === this.focus && this.canPaint()) {
      if (g.cellWord[o.i] >= 0) {
        var self = this, wid = g.cellWord[o.i];
        this.drag = { mode: 'press', start: p, last: p, moved: false, cellI: o.i };
        // a long press removes the word at once; its letters stay selected
        this.drag.timer = setTimeout(function () {
          if (!self.drag || self.drag.moved) return;
          self.drag.mode = 'held';
          self.lastCell = self.drag.cellI;
          self.doRemove(wid);
        }, 550);
        return;
      }
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
    if (d.add && !g.sel[o.i]) { g.sel[o.i] = 1; g.selN++; d.changed.push(o.i); this.dirtyCells([o.i], 1); this.lastCell = o.i; this.bump(); }
    else if (!d.add && g.sel[o.i]) { delete g.sel[o.i]; g.selN--; d.changed.push(o.i); this.dirtyCells([o.i], 1); this.bump(); }
  }
  undoStroke() {
    var g = this.game, d = this.drag;
    d.changed.forEach(function (j) { if (d.add) { delete g.sel[j]; g.selN--; } else { g.sel[j] = 1; g.selN++; } });
    this.dirtyCells(d.changed, 1);
    // the word in the message bar shows the selection too
    this.bump();
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
      var steps = Math.max(1, Math.ceil(Math.hypot(p.x - d.last.x, p.y - d.last.y) / (this.world().P * 0.6 * this.cam.s * 0.25)));
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
    if (d.mode === 'pinch') {
      var rest = Object.keys(this.ptrs);
      // one finger stays down: it keeps moving the map
      if (rest.length === 1) { var q = this.ptrs[rest[0]]; this.drag = { mode: 'pan', start: q, last: q, moved: true, cell: null }; }
      else if (rest.length === 0) { this.drag = null; this.bump(); }
      return;
    }
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
      // while a field is played, a single tap on another field does not leave it: a tap next to the field happens easily
      if (o.f !== this.focus && g.state[this.focus] === 'O' && this.cam.s >= this.fieldScale(this.focus) * 0.6) {
        var now = Date.now(), ask = this.goAsk;
        this.goAsk = { f: o.f, t: now };
        if (!ask || ask.f !== o.f || now - ask.t > 3000) { this.say(this.T('tapAgain', f.name), 'info'); this.bump(); return; }
      }
      this.goAsk = null;
      this.dirtyField(this.focus); this.dirtyField(o.f);
      this.focus = o.f;
      this.save();
      g.sel = {}; g.selN = 0;
      var st = g.state[o.f];
      this.say(st === 'L' ? this.coreGateMsg() : st === 'S' ? this.T('isSolved', f.name) : this.T('howTo'), st === 'L' ? 'warn' : 'info');
      this.flyTo(this.camFor('field', o.f));
      this.bump();
      return;
    }
    if (g.cellWord[o.i] >= 0) { var mn = this.meaning(g.words[g.cellWord[o.i]].word); this.say(mn.text, 'info', mn.title); this.bump(); }
    else if (g.state[o.f] === 'L') { this.say(this.coreGateMsg(), 'warn'); this.bump(); }
    else if (g.state[o.f] === 'S') { this.say(this.T('solvedOther', f.name), 'info'); this.bump(); }
  }

  wheel(e) {
    if (!this._cv) return;
    if (this._anim) { cancelAnimationFrame(this._anim); this._anim = 0; }
    var p = this.pt(e), c = this.cam;
    // wheel amounts can come in lines or pages (Firefox mouse wheel): make them pixels
    var unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 600 : 1;
    var dx = (e.deltaX || 0) * unit, dy = (e.deltaY || 0) * unit;
    var now = Date.now();
    // a touchpad sends many small steps, often sideways too: two fingers move the map, a pinch (ctrl) zooms.
    // A mouse wheel sends big steps straight up or down: it zooms.
    var pad = !e.ctrlKey && e.deltaMode === 0 && (dx !== 0 || Math.abs(dy) < 40 || now - (this._padT || 0) < 300);
    if (pad) {
      this._padT = now;
      this.cam = { s: c.s, x: c.x + dx / c.s, y: c.y + dy / c.s };
      this.clampCam(); this.moved();
      return;
    }
    var q = this.toWorld(p.x, p.y);
    var s = c.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
    this.cam = { s: s, x: q.x - (p.x - this.VW / 2) / s, y: q.y - (p.y - this.VH / 2) / s };
    this.clampCam(); this.moved();
  }

  // ---------- rules ----------
  doAccept() {
    var w = this.world(), g = this.game;
    this.starAsk = null;
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
    if (notHere) {
      // easy galaxies: show the wrong word in red for a moment, then take it away again (it is never saved)
      var selfW = this;
      this.say(this.T('notHere', word), 'warn');
      this.quick = this.quickPos();
      this.paint(); this.bump();
      setTimeout(function () {
        var wd = g.words[newId];
        if (!wd || !wd.alive || selfW.game !== g) return;
        selfW.dirtyCells(wd.cells, 1);
        wd.alive = false;
        wd.cells.forEach(function (j) { g.cellWord[j] = -1; });
        delete g.wrongMarked[newId];
        selfW.quick = selfW.quickPos();
        selfW.paint(); selfW.bump();
      }, 1100);
      return;
    }
    var full = f.cells.every(function (j) { return g.cellWord[j] >= 0; });
    if (full) {
      g.state[fi] = 'S';
      var opened = [], openedIds = [];
      var core0 = w.fields[0].round ? w.fields[0] : null, coreOpened = false, selfC = this;
      f.nbList.forEach(function (nb) {
        if (g.state[nb] !== 'L') return;
        if (core0 && nb === 0) {
          // the round core waits until some fields next to it are solved
          if (!selfC.coreReady()) return;
          coreOpened = true;
        }
        g.state[nb] = 'O'; opened.push(w.fields[nb].name); openedIds.push(nb);
      });
      if (core0 && (fi === 0 || core0.nb[fi])) this.dirtyField(0);
      this.recalcLit();
      var selfA = this, ratingA = this.rating(fi);
      var allSolved = g.state.every(function (x) { return x === 'S'; });
      // all solved: no field is darker any more
      if (allSolved) { this.dirtyAll(); this.flyTo(this.camFor('galaxy', fi), function () { selfA.finale(true); }); }
      else if (core0 && fi === 0) this.flyTo(this.camFor('galaxy', fi), function () { selfA.finale(); });
      // zoom out: the solved field and all fields that it opened are on the screen
      else this.flyTo(this.camFit(fi, openedIds), function () { selfA.celebrate(fi, openedIds, ratingA); });
      var gave = this.starsFor(fi);
      var mw = this.meaning(word);
      var cheers = this.T('cheers').split('|'), cheer = this.level === 'easy' ? cheers[fi % cheers.length] + ' ' : '';
      this.say((opened.length ? this.T('nowOpen', opened.join(', ')) : '') + (gave === 1 ? this.T('earned1') : this.T('earnedN', gave)) + this.T('lastWord', mw.title, mw.text), 'good', cheer + this.T('fieldSolved', f.name) + this.ratedText(fi));
      if (coreOpened) this.say(this.T(this.coreAll() ? 'coreOpenAll' : 'coreOpen', this.coreNeed()), 'good', cheer + this.T('fieldSolved', f.name));
      if (allSolved) this.say(this.T('allDone', g.state.length), 'good', this.T('allTitle'));
      else if (core0 && fi === 0) { var nS = g.state.filter(function (x) { return x === 'S'; }).length; this.say(this.T('coreDone', nS, g.state.length), 'good', this.T('finaleTitle')); }
    } else {
      var mn = this.meaning(word);
      // medium and hard galaxies say at once when the free letters can not be split into words any more
      // medium and hard galaxies: say when free letters are cut off (a careful player sees this too).
      // Other dead ends are for the player to find, or for a star.
      var cut = this.level !== 'easy' ? this.cutOff(fi) : [];
      if (cut.length) this.say(this.T('deadEnd', cut.map(function (grp) { return grp.map(function (j) { return w.cells[j].l; }).join(''); }).join(', ')), 'warn', this.T('deadEndTitle', word));
      else this.say(mn.text, 'good', (this.level === 'easy' ? '✓ ' : '') + mn.title);
      if (fi === 0 && w.fields[0].round) this.dirtyField(0);
    }
    this.save();
    this.quick = this.quickPos();
    this.paint(); this.bump();
  }

  pickColour(cells) {
    var w = this.world(), g = this.game, taken = {};
    cells.forEach(function (j) {
      var o = w.cells[j];
      o.nb.concat(o.nd).forEach(function (q) { if (q >= 0 && g.cellWord[q] >= 0) taken[g.words[g.cellWord[q]].colour] = 1; });
    });
    var c = 0; while (taken[c]) c++;
    return c;
  }

  // test mode: put the correct words into the shown field, one by one, as if the player found them
  doCheat() {
    var w = this.world(), g = this.game, fi = this.focus, f = w.fields[fi], self = this;
    if (g.state[fi] !== 'O') { this.say(g.state[fi] === 'S' ? this.T('isSolved', f.name) : this.coreGateMsg(), 'warn'); this.bump(); return; }
    f.regions.slice().forEach(function (gi) {
      if (g.state[fi] !== 'O') return;
      var reg = w.regions[gi], cw = g.cellWord[reg.cells[0]];
      if (cw >= 0 && g.words[cw].alive && g.words[cw].correct) return;
      // words in the way are taken away first
      reg.cells.forEach(function (j) {
        var k = g.cellWord[j];
        if (k < 0) return;
        var wd = g.words[k];
        self.dirtyCells(wd.cells, 1);
        wd.alive = false; wd.cells.forEach(function (q) { g.cellWord[q] = -1; });
        delete g.wrongMarked[wd.id];
      });
      g.sel = {}; g.selN = reg.cells.length;
      reg.cells.forEach(function (j) { g.sel[j] = 1; });
      self.doAccept();
    });
    g.sel = {}; g.selN = 0;
    this.save(); this.paint(); this.bump();
  }

  // removes a word; its letters stay selected, so the player can change the selection
  doRemove(wid) {
    var g = this.game, wd = g.words[wid];
    this.starAsk = null;
    if (!wd || !wd.alive) return;
    this.dirtyCells(Object.keys(g.sel).map(Number), 1);
    this.dirtyCells(wd.cells, 1);
    wd.alive = false;
    g.sel = {}; g.selN = 0;
    wd.cells.forEach(function (j) { g.cellWord[j] = -1; g.sel[j] = 1; g.selN++; });
    delete g.wrongMarked[wd.id];
    this.say(this.T('staySelected'), 'info', this.T('removed', wd.word));
    this.save();
    this.quick = this.quickPos();
    this.paint(); this.bump();
  }

  // ---------- play a field again ----------
  // An open or solved field can start again, for a new chance at a better rating.
  canRedo(fi) {
    var g = this.game;
    if (g.state[fi] === 'L') return false;
    return g.state[fi] === 'S' || g.used[fi] > 0 || g.hints[fi].length > 0 || g.words.some(function (wd) { return wd.alive && wd.f === fi && !wd.gift; });
  }
  askRedo(fi) {
    var self = this, f = this.world().fields[fi];
    if (!this.canRedo(fi)) { this.bump(); return; }
    var text = this.T('redoText', f.name) + (this.game.state[fi] === 'S' ? this.T('redoSolved', f.name, this.starsFor(fi)) : '');
    this.confirm = { title: this.T('redoTitle', f.name), text: text, yes: this.T('redoYes', f.name), no: this.T('redoNo'), action: function () { self.doRedo(fi); } };
    this.bump();
  }
  // Removes all words, star hints and red marks of the field, and its count of stars. A solved field is open again.
  // The stars used in it stay used (g.paid): else a redo would give them back.
  // Fields that it opened stay open. The gift words of the field come back.
  doRedo(fi) {
    var w = this.world(), g = this.game, f = w.fields[fi], self = this;
    if (!this.canRedo(fi)) return;
    var k = g.used[fi] || 0;
    g.paid = (g.paid || 0) + k * (k + 1) / 2;
    g.used[fi] = 0; g.hints[fi] = [];
    g.words.forEach(function (wd) {
      if (!wd.alive || wd.f !== fi) return;
      wd.alive = false;
      wd.cells.forEach(function (j) { g.cellWord[j] = -1; });
      delete g.wrongMarked[wd.id];
    });
    f.regions.forEach(function (gi) {
      var r = w.regions[gi];
      if (r.found0) { var id = self.addWord(r.cells.slice(), r.colour0 >= 0 ? r.colour0 : self.pickColour(r.cells), true); g.words[id].gift = true; }
    });
    if (g.state[fi] === 'S') g.state[fi] = 'O';
    g.sel = {}; g.selN = 0;
    this.starAsk = null; this.fx = null; this.quick = null;
    this.recalcLit();
    this.say(this.T('redone', f.name), 'info');
    this.save();
    this.flyTo(this.camFor('field', fi));
    this.paint(); this.bump();
  }

  // one pool of stars: every solved field adds as many as its difficulty (very easy 1 ... expert 5);
  // they can be used in any open field
  starsFor(fi) { var t = this.world().fields[fi].tier; return this.level === 'easy' ? t + 1 : Math.min(5, t); }
  // Each star in the same field costs 1 more than the one before (1, 2, 3, ...): a few stars when stuck stay cheap,
  // but many stars in one field are expensive. g.used counts the stars used in each field.
  // g.paid counts the stars used in fields that the player started again (doRedo).
  starCost(fi) { return (this.game.used[fi] || 0) + 1; }
  starsSpent() { return this.game.used.reduce(function (a, k) { return a + k * (k + 1) / 2; }, this.game.paid || 0); }
  starsLeft() {
    var w = this.world(), g = this.game, self = this, sum = 0;
    w.fields.forEach(function (f) { if (g.state[f.i] === 'S') sum += self.starsFor(f.i); });
    return Math.max(0, sum - this.starsSpent());
  }
  // a star was used in the field: its message also says what the next star costs
  sayStar(fi, text) {
    this.game.used[fi]++;
    this.say(text + ' ' + this.T('nextCost', this.starCost(fi)), 'info');
  }

  // the rating of a solved field, from the stars used in it: 0 perfect (none), 1 great (1), 2 good (2), 3 solved (more)
  static get RATING_COLORS() { return ['#f2c063', '#d9dfee', '#d8915a', '#7fd17a']; }
  // the two layers over a solved field for each rating (see drawWorld): a tint in the colour of the rating,
  // then a dark layer. Perfect is the brightest, each lower rating is darker.
  static get RATING_SHADES() {
    return [['rgba(255,200,80,0.42)', 'rgba(6,9,19,0)'], ['rgba(205,218,245,0.4)', 'rgba(6,9,19,0.22)'],
      ['rgba(214,120,50,0.5)', 'rgba(6,9,19,0.4)'], ['rgba(90,200,110,0.45)', 'rgba(6,9,19,0.58)']];
  }
  rating(fi) { return Math.min(3, this.game.used[fi] || 0); }
  ratingName(r) { return this.T('ratings').split('|')[r]; }
  ratedText(fi) {
    var n = this.game.used[fi] || 0, name = this.ratingName(this.rating(fi));
    return n === 0 ? this.T('perfectNo') : n === 1 ? this.T('rated1', name) : this.T('ratedN', name, n);
  }
  // a share of all fields in whole percent: 100 only when all, at least 1 when any
  pct(n, all) { return n === all ? 100 : n === 0 ? 0 : Math.max(1, Math.min(99, Math.round(100 * n / all))); }
  // how many fields have each rating (index 0 to 3), and the solved fields
  ratingCounts() {
    var g = this.game, self = this, out = [0, 0, 0, 0], done = 0;
    g.state.forEach(function (st, i) { if (st === 'S') { out[self.rating(i)]++; done++; } });
    return { by: out, done: done, all: g.state.length };
  }

  // ---------- dead ends ----------
  // A field is solved when every letter is in a word. So the words of the player can differ from the words of the generator.
  // A dead end is a field whose free letters can not be split into words any more.

  // all accepted words of 4 or more letters as a tree of letters; max is the longest word below a node
  wordTree() {
    var w = this.world();
    if (w.tree) return w.tree;
    var root = { k: {}, end: false, max: 0 };
    w.dict.forEach(function (word) {
      if (word.length < 4) return;
      var n = root;
      if (word.length > n.max) n.max = word.length;
      for (var i = 0; i < word.length; i++) {
        n = n.k[word[i]] || (n.k[word[i]] = { k: {}, end: false, max: 0 });
        if (word.length > n.max) n.max = word.length;
      }
      n.end = true;
    });
    return (w.tree = root);
  }

  // the free letters of a field (cells that are in no word)
  freeCells(fi) {
    var g = this.game;
    return this.world().fields[fi].cells.filter(function (j) { return g.cellWord[j] < 0; });
  }

  // Looks for words that use each of the given cells exactly once.
  // prefer: word shapes (lists of cells) to try first. steps: the most work the search may do.
  // Returns the words (lists of cells in reading order), false when there is no split,
  // or null when the search used all its steps (then the answer is not known).
  splitFree(cells, prefer, steps) {
    var w = this.world(), tree = this.wordTree();
    var ord = cells.slice().sort(function (a, b) { return w.cells[a].r - w.cells[b].r || w.cells[a].c - w.cells[b].c; });
    var n = ord.length, loc = {};
    ord.forEach(function (j, i) { loc[j] = i; });
    // local numbers: neighbours (up, right, down, left; -1 when not a given cell), row and letter of each cell
    var nb = ord.map(function (j) { return w.cells[j].nb.map(function (q) { return q in loc ? loc[q] : -1; }); });
    var row = ord.map(function (j) { var o = w.cells[j]; return o.sub ? o.sr : o.r; });
    var lt = ord.map(function (j) { return w.cells[j].l; });
    var free = new Uint8Array(n).fill(1), inW = new Uint8Array(n), budget = steps || 150000, failed = new Set(), OUT = {};
    // preferred shapes, by their first cell
    var pref = {};
    (prefer || []).forEach(function (sh) {
      if (!sh.every(function (j) { return j in loc; })) return;
      var p = sh.map(function (j) { return loc[j]; }).sort(function (a, b) { return a - b; });
      (pref[p[0]] || (pref[p[0]] = [])).push(p);
    });
    // the groups of touching cells in list (a group: list of cells); ok(x) tells which cells count
    function groups(list, ok) {
      var seen = {}, out = [];
      list.forEach(function (s) {
        if (seen[s]) return;
        var grp = [s], st = [s]; seen[s] = 1;
        while (st.length) {
          var x = st.pop();
          for (var d = 0; d < 4; d++) { var y = nb[x][d]; if (y >= 0 && !seen[y] && ok(y)) { seen[y] = 1; grp.push(y); st.push(y); } }
        }
        out.push(grp);
      });
      return out;
    }
    // all words that start at cell s, the longest first. In reading order, s is the first letter of its word.
    function wordsAt(s) {
      var out = [], S = [s];
      inW[s] = 1;
      function grow(node, last) {
        if (--budget < 0) throw OUT;
        if (S.length >= 4 && node.end) {
          var gs = groups(S, function (y) { return inW[y]; });
          if (gs.length === 1) out.push(S.slice());
        }
        if (node.max <= S.length) return;
        for (var k = last + 1; k < n; k++) {
          // a word has a letter in each row between its first and last row
          if (row[k] > row[last] + 1) break;
          if (!free[k]) continue;
          var next = node.k[lt[k]];
          if (!next) continue;
          S.push(k); inW[k] = 1;
          // a group of the word that can get no more letters must be the whole word
          var gs = groups(S, function (y) { return inW[y]; }), dead = false;
          if (gs.length > 1) {
            if (S.length + gs.length - 1 > next.max) dead = true;
            for (var a = 0; a < gs.length && !dead; a++) {
              dead = gs[a].every(function (x) {
                var r = nb[x][1], d = nb[x][2];
                return !(r > k && free[r]) && !(d > k && free[d]);
              });
            }
          }
          if (!dead) grow(next, k);
          S.pop(); inW[k] = 0;
        }
      }
      try { grow(tree.k[lt[s]] || { k: {}, end: false, max: 0 }, s); } finally { inW[s] = 0; }
      var first = (pref[s] || []).filter(function (p) { return p.every(function (x) { return free[x]; }); });
      var key = function (p) { return p.join('.'); }, firstKeys = {};
      first.forEach(function (p) { firstKeys[key(p)] = 1; });
      out = out.filter(function (p) { return !firstKeys[key(p)]; });
      out.sort(function (a, b) { return b.length - a.length; });
      return first.concat(out);
    }
    // splits one group of touching free cells; returns a list of words or false
    function solve(grp) {
      if (grp.length < 4) return false;
      grp.sort(function (a, b) { return a - b; });
      var id = grp.join('.');
      if (failed.has(id)) return false;
      var ws = wordsAt(grp[0]);
      for (var i = 0; i < ws.length; i++) {
        var wd = ws[i], res = [wd], ok = true;
        budget -= grp.length;
        if (budget < 0) throw OUT;
        wd.forEach(function (x) { free[x] = 0; });
        var rest = grp.filter(function (x) { return free[x]; });
        var parts = groups(rest, function (y) { return free[y]; });
        for (var p = 0; p < parts.length && ok; p++) {
          var sub = solve(parts[p]);
          if (sub) res = res.concat(sub); else ok = false;
        }
        wd.forEach(function (x) { free[x] = 1; });
        if (ok) return res;
      }
      failed.add(id);
      return false;
    }
    try {
      var all = [], parts = groups(ord.map(function (j, i) { return i; }), function (y) { return free[y]; });
      for (var p = 0; p < parts.length; p++) {
        var sub = solve(parts[p]);
        if (!sub) return false;
        all = all.concat(sub);
      }
      return all.map(function (wd) { return wd.map(function (x) { return ord[x]; }); });
    } catch (e) {
      if (e === OUT) return null;
      throw e;
    }
  }

  // word shapes the search tries first: the shapes that stars showed, then the words of the generator
  preferIn(fi) {
    var w = this.world(), self = this;
    return this.game.hints[fi].map(function (h) { return self.hintCells(h); })
      .concat(w.fields[fi].regions.map(function (gi) { return w.regions[gi].cells; }));
  }
  hintCells(h) { return h.cells || this.world().regions[h.g].cells; }

  // groups of touching free letters with fewer than 4 letters: no word can use them (each group in reading order)
  cutOff(fi) {
    var w = this.world(), free = this.freeCells(fi), inF = {}, seen = {}, out = [];
    free.forEach(function (j) { inF[j] = 1; });
    free.forEach(function (j0) {
      if (seen[j0]) return;
      var grp = [j0], st = [j0]; seen[j0] = 1;
      while (st.length) {
        w.cells[st.pop()].nb.forEach(function (q) { if (q >= 0 && inF[q] && !seen[q]) { seen[q] = 1; grp.push(q); st.push(q); } });
      }
      if (grp.length < 4) out.push(grp.sort(function (a, b) { return w.cells[a].r - w.cells[b].r || w.cells[a].c - w.cells[b].c; }));
    });
    return out;
  }

  // true when the free letters of the field can not be split into words (false also when the search ran out of steps)
  isDeadEnd(fi) {
    var free = this.freeCells(fi);
    return free.length > 0 && this.splitFree(free, this.preferIn(fi), 60000) === false;
  }

  // The words of the player that make the dead end: without them, the free letters can be split into words.
  // Without all words that differ from the generator's words there is no dead end, so the search starts there.
  // Then it gives back one word after the other, as long as there is still no dead end.
  // Words that are not marked red yet are given back first, longer words before shorter ones.
  blockingWords(fi) {
    var g = this.game, self = this;
    var cand = g.words.filter(function (wd) { return wd.alive && wd.f === fi && !wd.correct && !wd.gift; });
    cand.sort(function (a, b) { return (g.wrongMarked[a.id] ? 1 : 0) - (g.wrongMarked[b.id] ? 1 : 0) || b.cells.length - a.cells.length; });
    var out = cand.slice(), free = this.freeCells(fi), prefer = this.preferIn(fi), until = Date.now() + 400;
    cand.forEach(function (wd) {
      // no time left: the other words stay in the list
      if (Date.now() > until) return;
      var rest = out.filter(function (x) { return x !== wd; });
      var cells = free.slice();
      rest.forEach(function (x) { cells = cells.concat(x.cells); });
      if (self.splitFree(cells, prefer, 40000)) out = rest;
    });
    return out;
  }

  // A tap on the star button opens a bubble: what the star will do, its price, and the rating of the field after it.
  // Only the ✓ in the bubble spends the star (starConfirm); ✕, a second tap on the star button or a touch on the map closes it.
  doLight() {
    var g = this.game, fi = this.focus;
    if (this.starAsk) { this.starCancel(); return; }
    if (g.state[fi] !== 'O') { this.say(this.T('starsOpen'), 'warn'); this.bump(); return; }
    if (this.starsLeft() <= 0) { this.say(this.T('noStars'), 'warn'); this.bump(); return; }
    var plan = this.starPlan(fi);
    if (plan.kind === 'stillRed') { this.say(this.T('starStillRed'), 'warn'); this.bump(); return; }
    if (plan.kind === 'nothing') { this.say(this.T('starNothing'), 'warn'); this.bump(); return; }
    this.starAsk = { fi: fi, plan: plan };
    // too few stars: the bubble shows the price in red, and its ✓ is off
    if (this.starsLeft() < this.starCost(fi)) this.say(this.T('noStarsHere', this.starCost(fi), this.starsLeft()), 'warn');
    this.bump();
  }
  starCancel() {
    if (!this.starAsk) return;
    this.starAsk = null;
    this.bump();
  }
  starConfirm() {
    var a = this.starAsk, g = this.game;
    this.starAsk = null;
    if (!a || a.fi !== this.focus || g.state[a.fi] !== 'O' || this.starsLeft() < this.starCost(a.fi)) { this.bump(); return; }
    this.applyStar(a.fi, a.plan);
  }

  // What a star would do now in the field:
  // { kind: 'wrong', words, dead } marks words in red (dead: they make a dead end),
  // { kind: 'word', hint } shows the shape of a word, { kind: 'stillRed' } or { kind: 'nothing' }: it can not help.
  starPlan(fi) {
    var w = this.world(), g = this.game, f = w.fields[fi], have = {};
    g.hints[fi].forEach(function (h) { have[h.key] = 1; });
    var pick = function (list) { return list.length ? list[Math.floor(Math.random() * list.length)] : null; };
    if (this.level === 'easy') {
      // easy galaxies: wrong words go away by themselves, so the words of the player are the words of the generator
      var wrong = g.words.filter(function (wd) { return wd.alive && wd.f === fi && !wd.correct && !g.wrongMarked[wd.id]; });
      if (wrong.length) return { kind: 'wrong', words: wrong, dead: false };
      var gi = pick(f.regions.filter(function (x) {
        var c = g.cellWord[w.regions[x].cells[0]];
        return !have['r' + x] && !(c >= 0 && g.words[c].correct);
      }));
      return gi == null ? { kind: 'nothing' } : { kind: 'word', hint: { key: 'r' + gi, kind: 'word', g: gi } };
    }
    // medium and hard galaxies: the words of the player can differ from the words of the generator.
    // At a dead end, the words that make it; else the shape of a word that fits the words of the player.
    var split = this.splitFree(this.freeCells(fi), this.preferIn(fi));
    if (!split) {
      var block = this.blockingWords(fi).filter(function (wd) { return !g.wrongMarked[wd.id]; });
      if (block.length) return { kind: 'wrong', words: block, dead: split === false };
      if (split === false) return { kind: 'stillRed' };
      // the search ran out of steps: show a word of the generator
      split = f.regions.map(function (x) { return w.regions[x].cells; }).filter(function (cs) { return cs.every(function (j) { return g.cellWord[j] < 0; }); });
    }
    var cs = pick(split.filter(function (c) { return !have['c' + c.join('.')]; }));
    return cs ? { kind: 'word', hint: { key: 'c' + cs.join('.'), kind: 'word', cells: cs } } : { kind: 'nothing' };
  }
  applyStar(fi, plan) {
    var g = this.game, self = this;
    if (plan.kind === 'wrong') {
      plan.words.forEach(function (wd) { g.wrongMarked[wd.id] = 1; self.dirtyCells(wd.cells, 1); });
      var list = plan.words.map(function (wd) { return wd.word; }).join(', ');
      this.sayStar(fi, plan.dead ? this.T('starBlock', list) : this.T('starWrong', list));
    } else {
      var cs = this.hintCells(plan.hint);
      g.hints[fi].push(plan.hint);
      this.dirtyCells(cs, 1);
      this.sayStar(fi, this.T('starWord', cs.length));
    }
    this.save();
    this.paint(); this.bump();
  }

  // the values of the star bubble, or null when it is closed
  starAskVals() {
    var a = this.starAsk, g = this.game;
    if (!a || a.fi !== this.focus || g.state[a.fi] !== 'O') return null;
    var fi = a.fi, cost = this.starCost(fi), have = this.starsLeft(), used = g.used[fi] || 0;
    var from = Math.min(3, used), to = Math.min(3, used + 1), RC = Component.RATING_COLORS;
    return {
      kind: a.plan.kind, cost: cost, have: have, ok: have >= cost, changes: from !== to,
      fromName: this.ratingName(from), toName: this.ratingName(to), fromColor: RC[from], toColor: RC[to],
      tAfter: have >= cost ? have + ' → ' + (have - cost) : this.T('starMissing', have, cost - have),
      tKind: this.T(a.plan.kind === 'wrong' ? 'starAskWrong' : 'starAskWord'), tNo: this.T('starAskNo'), tYes: this.T('starAskYes', cost)
    };
  }

  // ---------- markup values ----------
  renderVals() {
    var self = this, w = this.world(), g = this.game, fi = this.focus, f = w.fields[fi];
    var MODS = { FOG: 'fog', GIFT: 'gift word', STAR: 'star cell', THEME: 'theme: space' };
    var STATE = { S: 'solved', O: 'open', L: 'locked' };
    // a locked field does not show its difficulty yet
    var pips = '', locked = g.state[fi] === 'L';
    if (!locked) for (var q = 0; q < 6; q++) pips += q < f.tier ? '●' : '○';
    var meta = f.shape + ' · ' + f.words + ' words · ' + f.len[0] + '–' + f.len[1] + ' letters';
    if (f.mods.length) meta += ' · ' + f.mods.map(function (m) { return MODS[m]; }).join(', ');
    var covered = f.cells.filter(function (j) { return g.cellWord[j] >= 0; }).length;
    var left = this.starsLeft();
    var ZL = this.zoomLayout();
    var zoomBtns = [['galaxy', this.T('zGalaxy', this.percent(this.galaxyProgress()))], ['area', this.T('zArea')], ['field', this.T('zField')]].map(function (p, i) {
      return { label: p[1], x: ZL[i].x, y: ZL[i].y, w: ZL[i].w, h: ZL[i].h, pick: function () { self.flyTo(self.camFor(p[0], self.focus)); } };
    });
    return {
      canvasRef: this.canvasRef, loRef: this.loRef, ovRef: this.ovRef, zoomRef: this.zoomRef, onDown: this.onDown, onMove: this.onMove, onUp: this.onUp, onWheel: this.onWheel, onMenu: this.onMenu,
      clearSel: this.clearSel, accept: this.accept, useLight: this.useLight, starNo: this.starNo, starYes: this.starYes, starAsk: this.starAskVals(),
      focusName: f.name, focusPips: pips,
      focusLevel: locked ? '?' : this.tierName(f.tier), focusLevelColor: locked ? '#9aa3c4' : Component.TIER_COLORS[f.tier] || '',
      focusProgress: g.state[fi] === 'S' ? this.ratingName(this.rating(fi)) : locked ? this.T('locked1') : Math.round(100 * covered / f.cells.length) + '%',
      focusProgressColor: g.state[fi] === 'S' ? Component.RATING_COLORS[this.rating(fi)] : '',
      solvedCount: g.state.filter(function (s) { return s === 'S'; }).length, fieldCount: w.fields.length,
      lightLeft: left, zoomBtns: zoomBtns,
      lang: this.lang, level: this.level, newOpen: this.newOpen, switchLang: this.switchLang,
      levelBtns: ['easy', 'medium', 'hard'].map(function (lv, i) {
        var on = self.newLevel === lv;
        return { id: lv, name: self.levelName(lv), desc: self.T(['lvEasyDesc', 'lvMediumDesc', 'lvHardDesc'][i]), pips: ['●○○', '●●○', '●●●'][i], pick: self.levelPick[lv],
          on: on, bg: on ? '#2a3a6e' : 'transparent', bd: on ? '#f2c063' : '#34405c', pressed: on ? 'true' : 'false' };
      }),
      tMenu: this.T('menu'), tStarsAria: this.T('starsAria', left, this.starCost(fi)), tStarsTitle: this.T('starsTitle'), tAccept: this.T('accept'),
      tMap: this.T('map'), tMenuGalaxy: this.T('menuGalaxy', this.seed, this.levelName(this.level)), tCopyLink: this.T('copyLink'), tCheat: this.T('cheat'), cheat: this.cheat, cheatSolve: this.cheatSolve,
      canRedo: this.canRedo(fi), tRedo: this.T('redoBtn', f.name), redoField: this.redoField, tNewGalaxy: this.T('newGalaxy'), tAllGames: this.T('allGames'), tClose: this.T('close'),
      tOtherLang: this.T('otherLang'), tOtherLangAria: this.T('otherLangAria'),
      tNgTitle: this.T('ngTitle'), tNgLevel: this.T('ngLevel'), tNgNumber: this.T('ngNumber'), tNgRandom: this.T('ngRandom'), tNgStart: this.T('ngStart'), tNgCancel: this.T('ngCancel'),
      quickAccept: !!this.quick,
      quickShow: !!this.quick, quickX: this.quick ? this.quick.x : 0, quickY: this.quick ? this.quick.y : 0,
      toggleMenu: this.toggleMenu, shareProgress: this.shareProgress, openNewGalaxy: this.openNewGalaxy, closeSeed: this.closeSeed, confirmYes: this.confirmYes, confirmNo: this.confirmNo,
      menuOpen: this.menuOpen, menuExpanded: this.menuOpen ? 'true' : 'false', seed: this.seed,
      confirmOpen: !!this.confirm, confirmTitle: this.confirm ? this.confirm.title : '', confirmText: this.confirm ? this.confirm.text : '',
      confirmYesLabel: this.confirm ? this.confirm.yes : '', confirmNoLabel: this.confirm ? this.confirm.no : '',
      showActions: !this.seedMode, seedMode: this.seedMode,
      seedText: this.seedText, onSeedInput: this.onSeedInput, buildSeed: this.buildSeed, randomSeed: this.randomSeed,
      msg: g.msg, msgTitle: g.msgTitle || '', selWord: g.state[fi] === 'O' ? this.selWord() : '', msgColor: g.msgKind === 'good' ? '#a9dc8f' : g.msgKind === 'warn' ? '#f2a27c' : '#c9d1ea'
    };
  }
}
