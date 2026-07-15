/*
 * MAKETZO — "Can You Trade?" / "What Kind of Trader Are You?". v36
 *
 * A free, no-login, HARD live trading sim at /trader-type. A live candlestick
 * tape (9/20 EMA + VWAP + a resistance level) you trade two-sided (BUY = long,
 * SELL = short, add to average down, blow up). Live blotter on the right. The
 * tape runs one of several SMALL-CAP SCENARIOS chosen at random — pump & dump,
 * short squeeze, slow bleeder, chop, runner — with a catalyst event (offering
 * rug / squeeze) that fires at a RANDOM time, so it never plays the same way and
 * you can't just "keep shorting because it only goes down."
 *
 * Your archetype AND grade are read from PROCESS, not P&L, direction-aware: a clean
 * winning short run is The Sniper; a green run built on averaging down and overtrading
 * is a Bag Holder who got bailed out by variance, not an A+. The net only caps the
 * grade in both directions. Most people lose money, and HOW they lost it is the lesson.
 *
 * RISK-POSTURE: the sim never tells you to size up; it just LETS you, then the
 * diagnosis punishes it. Not financial advice (a behavioral sim).
 *
 * NOTE: difficulty/feel is tuned live on dev with Ed. Numbers here are a start.
 */
(function () {
  'use strict';

  var C_UP = '#7ed957', C_DOWN = '#ff6b6b', C_GOLD = '#d4af37', C_GOLD_HI = '#e5c572', C_DIM = '#7d8794';
  var SYMBOLS = ['NVAX', 'SOND', 'MARA', 'RIOT', 'PLUG', 'FFIE', 'TLRY', 'BBAI', 'HOLO', 'GNS', 'CENN', 'MULN', 'AITX', 'PHUN', 'DPRO'];

  var DURATION = 120000;      // 120-second session
  var START_BAL = 10000;
  var NOTIONAL = 4000;        // each fill deploys ~this much; tap same side to add a lot
  var MAXLOTS = 6;            // up to ~$24k exposure — enough to truly blow up
  var FEE_BPS = 0.0015;       // slippage/fee per fill (each side)
  var CANDLE_MS = 700;
  var WINDOW = 40;            // visible candles
  var K9 = 2 / (9 + 1), K20 = 2 / (20 + 1); // EMA smoothing constants

  function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function rnd(a, b) { return Math.random() * (b - a) + a; }
  function pick(a) { return a[ri(0, a.length - 1)]; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function money(v) { v = Math.round(v); if (!isFinite(v)) v = 0; return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US'); }
  function px(v) { if (!isFinite(v)) v = 0; return '$' + v.toFixed(2); }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function makeAudio() {
    var ctx = null;
    function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } return ctx; }
    function tone(f, d, type, g, when) { var a = ac(); if (!a) return; var o = a.createOscillator(), gn = a.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = g; o.connect(gn); gn.connect(a.destination); o.start(a.currentTime + when); o.stop(a.currentTime + when + d); }
    return {
      unlock: function () { ac(); },
      warm: function () { tone(440, 0.02, 'sine', 0.0001, 0); },
      buy: function () { tone(520, 0.06, 'triangle', 0.05, 0); tone(720, 0.07, 'triangle', 0.04, 0.05); },
      sellWin: function () { tone(660, 0.08, 'triangle', 0.05, 0); tone(990, 0.10, 'triangle', 0.04, 0.07); },
      sellLoss: function () { tone(300, 0.10, 'sine', 0.05, 0); tone(200, 0.16, 'sine', 0.04, 0.08); },
      rug: function () { tone(200, 0.10, 'sawtooth', 0.035, 0); tone(130, 0.16, 'sawtooth', 0.03, 0.07); tone(90, 0.20, 'sine', 0.026, 0.14); },
      squeeze: function () { tone(300, 0.10, 'sawtooth', 0.04, 0); tone(560, 0.14, 'sawtooth', 0.04, 0.08); tone(880, 0.20, 'sine', 0.03, 0.18); },
      news: function () { tone(440, 0.05, 'triangle', 0.03, 0); tone(620, 0.06, 'triangle', 0.025, 0.05); },
      tick: function () { tone(140, 0.008, 'square', 0.006, 0); },
      cdTick: function () { tone(680, 0.07, 'sine', 0.05, 0); },
      cdGo: function () { tone(540, 0.09, 'triangle', 0.05, 0); tone(840, 0.16, 'triangle', 0.05, 0.07); },
      // Whole 3-2-1-GO beep sequence scheduled in one call against the audio clock, so
      // a cold-context warmup shifts it as a unit instead of rushing the first beat.
      cdSequence: function (stepSec) { for (var k = 0; k < 3; k++) tone(680, 0.07, 'sine', 0.05, k * stepSec); tone(540, 0.09, 'triangle', 0.05, 3 * stepSec); tone(840, 0.16, 'triangle', 0.05, 3 * stepSec + 0.07); },
      verdict: function () { tone(330, 0.10, 'triangle', 0.05, 0); tone(495, 0.12, 'triangle', 0.05, 0.10); tone(660, 0.20, 'triangle', 0.045, 0.22); }
    };
  }

  // ── Scoring lives in badge-engine.js ───────────────────────────────────────
  // The archetype table + selection logic used to be inlined right here. It moved to
  // assets/js/badge-engine.js (a pure module) for two reasons: the sim is not the only
  // consumer (the app gets this next, and it must NOT land in the app.js monolith),
  // and the old 8-archetype table was structurally incapable of being right. Seven
  // sins and one saint meant every imperfect run had to wear an accusation, so the
  // engine's job became "find this trader's worst quality and make it his name".
  // See the header of badge-engine.js for the two rules that replaced it.

  // ── Tape regimes. drift = frac/sec, vol = frac/sqrt(sec). ──────────────────
  var REG = {
    grind:   { drift: 0.011,  vol: 0.024, min: 2200, max: 4200 },
    rip:     { drift: 0.075,  vol: 0.045, min: 1300, max: 2400 },
    pump:    { drift: 0.16,   vol: 0.060, min: 600,  max: 1200 },
    dump:    { drift: -0.075, vol: 0.050, min: 1600, max: 3000 },
    bleed:   { drift: -0.030, vol: 0.040, min: 3000, max: 6000 },
    rug:     { drift: -0.30,  vol: 0.075, min: 700,  max: 1300 },
    squeeze: { drift: 0.30,   vol: 0.075, min: 800,  max: 1500 },
    deadcat: { drift: 0.05,   vol: 0.045, min: 1000, max: 2000 },
    chop:    { drift: 0.0,    vol: 0.085, min: 2600, max: 4600 }
  };

  // Phase tables. LURE = comfort (trends up, dips bought). DISTRIB = it turns.
  // BEAR = down with no recovery. BULL = uptrend / squeeze. CHOP = rangebound.
  var NEXT_EARLY = {
    grind:   [['rip', .35], ['grind', .3], ['chop', .2], ['dump', .15]],
    rip:     [['pump', .3], ['grind', .3], ['chop', .2], ['dump', .2]],
    pump:    [['dump', .55], ['chop', .3], ['grind', .15]],
    dump:    [['grind', .45], ['chop', .3], ['rip', .15], ['bleed', .1]],
    bleed:   [['grind', .4], ['chop', .35], ['dump', .25]],
    rug:     [['deadcat', .5], ['bleed', .3], ['grind', .2]],
    deadcat: [['grind', .45], ['rip', .3], ['chop', .25]],
    chop:    [['rip', .35], ['grind', .3], ['dump', .25], ['pump', .1]]
  };
  var NEXT_MID = {
    grind:   [['rip', .25], ['chop', .3], ['dump', .25], ['bleed', .2]],
    rip:     [['pump', .3], ['dump', .4], ['chop', .2], ['bleed', .1]],
    pump:    [['dump', .55], ['rug', .2], ['chop', .25]],
    dump:    [['bleed', .35], ['chop', .3], ['deadcat', .2], ['grind', .15]],
    bleed:   [['bleed', .3], ['dump', .3], ['deadcat', .2], ['chop', .2]],
    rug:     [['bleed', .5], ['deadcat', .3], ['dump', .2]],
    deadcat: [['dump', .45], ['bleed', .3], ['chop', .15], ['rip', .1]],
    chop:    [['dump', .35], ['bleed', .25], ['rip', .2], ['grind', .2]]
  };
  var NEXT_LATE = {
    grind:   [['dump', .35], ['bleed', .3], ['rip', .2], ['rug', .15]],
    rip:     [['dump', .4], ['rug', .3], ['pump', .2], ['chop', .1]],
    pump:    [['rug', .45], ['dump', .4], ['chop', .15]],
    dump:    [['bleed', .4], ['rug', .3], ['deadcat', .15], ['chop', .15]],
    bleed:   [['bleed', .4], ['dump', .3], ['rug', .3]],
    rug:     [['bleed', .55], ['deadcat', .25], ['dump', .2]],
    deadcat: [['dump', .45], ['bleed', .35], ['rug', .2]],
    chop:    [['dump', .4], ['bleed', .35], ['rug', .25]]
  };
  var NEXT_BULL = {
    grind:   [['rip', .35], ['grind', .35], ['dump', .15], ['pump', .15]],
    rip:     [['pump', .3], ['grind', .35], ['dump', .2], ['chop', .15]],
    pump:    [['dump', .4], ['grind', .35], ['chop', .25]],
    dump:    [['grind', .5], ['rip', .25], ['chop', .15], ['bleed', .1]],
    bleed:   [['grind', .45], ['rip', .25], ['chop', .3]],
    rug:     [['deadcat', .4], ['grind', .4], ['bleed', .2]],
    deadcat: [['grind', .45], ['rip', .35], ['chop', .2]],
    chop:    [['rip', .4], ['grind', .35], ['dump', .25]],
    squeeze: [['rip', .4], ['dump', .3], ['chop', .3]]
  };
  var NEXT_CHOP = {
    grind:   [['chop', .4], ['dump', .3], ['rip', .3]],
    rip:     [['dump', .45], ['chop', .35], ['pump', .2]],
    pump:    [['dump', .6], ['chop', .4]],
    dump:    [['rip', .4], ['chop', .35], ['grind', .25]],
    bleed:   [['chop', .4], ['rip', .3], ['dump', .3]],
    rug:     [['deadcat', .5], ['chop', .3], ['bleed', .2]],
    deadcat: [['dump', .45], ['chop', .35], ['rip', .2]],
    chop:    [['rip', .3], ['dump', .3], ['chop', .25], ['grind', .15]],
    squeeze: [['dump', .5], ['chop', .3], ['rip', .2]]
  };

  // Each session runs one randomly-chosen scenario. The climactic catalyst
  // (rug or squeeze) fires at a RANDOM time, not always at the end.
  var SCENARIOS = [
    { id: 'pumpdump', w: 0.26, event: 'rug',     at: [0.58, 0.9] },
    { id: 'squeeze',  w: 0.22, event: 'squeeze', at: [0.48, 0.86] },
    { id: 'bleeder',  w: 0.16, event: 'rug',     at: [0.5, 0.88], evChance: 0.5 },
    { id: 'chop',     w: 0.18, event: null },
    { id: 'runner',   w: 0.18, event: null }
  ];
  function pickScenario() { var r = Math.random(), acc = 0; for (var i = 0; i < SCENARIOS.length; i++) { acc += SCENARIOS[i].w; if (r <= acc) return SCENARIOS[i]; } return SCENARIOS[0]; }
  function regimeTable(prog) {
    var s = scenario.id;
    if (s === 'squeeze') return prog < 0.45 ? NEXT_EARLY : prog < 0.7 ? NEXT_MID : NEXT_BULL;
    if (s === 'bleeder') return prog < 0.3 ? NEXT_MID : NEXT_LATE;
    if (s === 'chop') return NEXT_CHOP;
    if (s === 'runner') return prog < 0.25 ? NEXT_EARLY : NEXT_BULL;
    return prog < 0.4 ? NEXT_EARLY : prog < 0.72 ? NEXT_MID : NEXT_LATE; // pumpdump
  }
  function nextRegime(cur, prog) { var tbl = regimeTable(prog), w = tbl[cur] || tbl.grind, r = Math.random(), acc = 0; for (var i = 0; i < w.length; i++) { acc += w[i][1]; if (r <= acc) return w[i][0]; } return w[w.length - 1][0]; }

  // The fundamental "reason" for the climactic move — a big banner + a loud alarm,
  // because a jarring move should always have a visible cause. Kept tight + real.
  // Format: a SCANNABLE headline, then the plain reason. The first two words carry the
  // signal so it reads at a glance. Simplicity + instant clarity over cleverness (Ed).
  var RUG_NEWS = ['Dilution event - Company issued press release of an offering', 'Offering priced - New shares hitting the market', 'Insiders filed to sell - Supply flooding the tape'];
  var SQUEEZE_NEWS = ['Halt opened - Shorts getting squeezed', 'Bids rising fast - Shorts getting trapped', 'No shares left to short - Shorts getting called in'];

  // ── Order book + Time & Sales config (the live tape) ───────────────────────
  // Walls telegraph a strong move ~LEAD_MS early; SPOOF_P of them are fakes that
  // pull and reverse (the small-cap spoof). Reading the tape is an edge, not armor.
  var SPOOF_P = 0.28, LEAD_MS = 1500, WALL_COOLDOWN = 5200, WALL_LIFE = 3500;
  var BOOK_MS = 220, L2_LEVELS = 5;
  // DAS-style montage: market-maker IDs per book slot (the DEFAULT view; a price
  // ladder is the simpler toggle). Real ECN/exchange tags so it reads like a DAS book.
  var MMIDS = ['NSDQ', 'ARCA', 'EDGX', 'BATS', 'MEMX', 'MIAX', 'IEX', 'NYSE', 'EDGA', 'CBOE', 'PHLX', 'BYX', 'ARCX', 'AMEX'];

  // ── State ──────────────────────────────────────────────────────────────────
  var root, audio, raf, timers, sym, price, candles, regime, regimeEnd, t0, lastCandle, lastTick;
  var balance, pos, trades, buyCount, recentHigh, lastLossAt;
  var ema9, ema20, vwap, vwapPV, vwapVol, resistance;
  var scenario, eventProg, eventAt, eventFired, running, paused, pauseStart;
  var book, wall, pending, printSkew, lastBookAt, lastPrintAt, lastWallAt;
  // Session trackers read by badge-engine.js. All session-relative (ms from t0) or
  // plain running extremes, so they survive pause (resumeGame shifts t0) and mean the
  // same thing to the engine as openAt/closeAt do.
  var peakEquity, troughEquity, sessionHigh, sessionLow, catalystAt, catalystDir, wallsRead, wallsSpoofed;
  var bookView = 'montage', mmBids, mmAsks, spreadTicks, lastSpreadAt;
  var cv, ctx, els;

  function reset() {
    raf = 0; timers = []; sym = pick(SYMBOLS);
    var p = rnd(3.2, 6.8); candles = [];
    for (var i = 0; i < WINDOW; i++) { var o = p; p = Math.max(0.5, p * (1 + rnd(-0.022, 0.024))); var c = p; candles.push({ o: o, c: c, h: Math.max(o, c) * (1 + rnd(0, 0.012)), l: Math.min(o, c) * (1 - rnd(0, 0.012)), vol: 500 + Math.random() * 800 }); }
    price = p; regime = 'grind'; regimeEnd = 0;
    balance = START_BAL; pos = null; trades = []; buyCount = 0; recentHigh = price; lastLossAt = -9999;
    peakEquity = 0; troughEquity = 0; sessionHigh = price; sessionLow = price;
    catalystAt = null; catalystDir = null; wallsRead = 0; wallsSpoofed = 0;
    ema9 = candles[0].c; ema20 = candles[0].c;
    for (var j = 0; j < candles.length; j++) { var cl = candles[j].c; ema9 += K9 * (cl - ema9); ema20 += K20 * (cl - ema20); candles[j].e9 = ema9; candles[j].e20 = ema20; }
    vwap = NaN; vwapPV = 0; vwapVol = 0;
    var sh = 0; for (j = 0; j < candles.length; j++) if (candles[j].h > sh) sh = candles[j].h;
    resistance = Math.max(sh, price) * rnd(1.04, 1.10);
    // scenario + a randomly-timed catalyst
    scenario = pickScenario(); eventFired = false; running = false; paused = false;
    book = null; wall = null; pending = null; printSkew = 0.5; lastBookAt = 0; lastPrintAt = 0; lastWallAt = -9999;
    spreadTicks = pickSpread('grind'); lastSpreadAt = 0;
    mmBids = pickMMs(L2_LEVELS); mmAsks = pickMMs(L2_LEVELS);
    eventProg = scenario.event ? rnd(scenario.at[0], scenario.at[1]) : 2;
    if (scenario.event && scenario.evChance && Math.random() > scenario.evChance) eventProg = 2;
  }
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearAll() { if (raf) cancelAnimationFrame(raf); raf = 0; if (timers) for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }
  function track(ev, data) { try { if (window.MKT && window.MKT.trackEvent) window.MKT.trackEvent(ev, data || {}); } catch (e) {} }

  function boot() { root = document.getElementById('diag-root'); if (!root) return; audio = makeAudio(); renderIntro(); }

  function renderIntro() {
    root.innerHTML =
      '<div class="diag-intro">' +
        '<div class="diag-eyebrow">The two-minute tape test</div>' +
        '<h1 class="diag-h1">Can you trade,<br><em>or do you just think so?</em></h1>' +
        '<p class="diag-lede">Two minutes on a <b>simulated</b> small-cap tape that fights back. Go <b>long</b> or <b>short</b> and watch the P&L move on every fill. It never plays the same way twice. The money is fake. What it shows about how you trade is not.</p>' +
        '<button class="diag-start" type="button" data-start>Prove it →</button>' +
        '<div class="diag-intro-note">Free · 2 minutes · a simulation, not real trading</div>' +
        '<div class="diag-intro-disc">Play money on a simulated tape, for practice and entertainment only. Not a real brokerage, no live market data, and nothing here is financial advice.</div>' +
      '</div>';
    root.querySelector('[data-start]').addEventListener('click', start);
  }

  function start() {
    clearAll(); audio.unlock(); audio.warm(); reset(); track('diagnostic_start', { scenario: scenario.id });
    root.innerHTML =
      '<div class="diag-term">' +
        '<div class="diag-main">' +
          '<div class="diag-term-top">' +
            '<div class="diag-term-sym">' + sym + ' <span class="diag-term-px" data-px>' + px(price) + '</span></div>' +
            '<div class="diag-term-topright">' +
              '<div class="diag-term-clock" data-clock>2:00</div>' +
              '<div class="diag-share-game" data-share-game></div>' +
              '<button class="diag-term-exit" type="button" data-exit aria-label="Exit to start">✕</button>' +
            '</div>' +
          '</div>' +
          '<canvas class="diag-chart" data-chart></canvas>' +
          '<div class="diag-cd diag-hidden" data-countdown><div class="diag-cd-num" data-cdnum>3</div></div>' +
          '<div class="diag-pause-over diag-hidden" data-pauseover><div class="diag-pause-title">Paused</div></div>' +
          '<div class="diag-legend">' +
            '<span class="diag-leg"><i class="diag-sw diag-sw-e9"></i>9 EMA</span>' +
            '<span class="diag-leg"><i class="diag-sw diag-sw-e20"></i>20 EMA</span>' +
            '<span class="diag-leg"><i class="diag-sw diag-sw-vwap"></i>VWAP</span>' +
            '<span class="diag-leg"><i class="diag-sw diag-sw-res"></i>Resistance</span>' +
            '<span class="diag-leg"><i class="diag-sw diag-sw-vol"></i>Volume</span>' +
          '</div>' +
          '<div class="diag-term-bottom"><div class="diag-bal">Equity <b data-equity>' + money(START_BAL) + '</b></div></div>' +
          '<div class="diag-actions">' +
            '<div class="diag-pos" data-pos><span class="diag-pos-state" data-pstate>FLAT</span><span class="diag-pos-pnl" data-upnl></span></div>' +
            '<div class="diag-trade-btns">' +
              '<button class="diag-trade-btn buy" data-buy disabled>BUY</button>' +
              '<button class="diag-trade-btn sell" data-sell disabled>SHORT</button>' +
            '</div>' +
            '<button class="diag-pause-toggle" type="button" data-pausetoggle>❚❚ Pause</button>' +
          '</div>' +
          '<div class="diag-term-hint">BUY goes long, SELL goes short. Tap the same side to add, the other to close.</div>' +
        '</div>' +
        '<div class="diag-side">' +
          '<div class="diag-l2-wrap">' +
            '<div class="diag-side-h">Level 2 <span class="diag-side-sub" data-bookmode>· montage</span>' +
              '<button class="diag-l2-toggle" type="button" data-l2toggle>Ladder</button></div>' +
            '<div class="diag-l1" data-l1></div>' +
            '<div class="diag-l2" data-l2></div>' +
          '</div>' +
          '<div class="diag-tape-wrap">' +
            '<div class="diag-side-h">Time &amp; Sales</div>' +
            '<div class="diag-tape" data-tape></div>' +
          '</div>' +
          '<div class="diag-blotter">' +
            '<div class="diag-blotter-top">' +
              '<div class="diag-blotter-h">Blotter</div>' +
              '<div class="diag-blotter-pnl" data-bpnl>$0</div>' +
              '<div class="diag-blotter-rec" data-brec>0W · 0L</div>' +
            '</div>' +
            '<div class="diag-blotter-list" data-blist><div class="diag-brow-empty">No trades yet</div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    cv = root.querySelector('[data-chart]'); ctx = cv.getContext('2d');
    els = {
      px: root.querySelector('[data-px]'), clock: root.querySelector('[data-clock]'),
      pstate: root.querySelector('[data-pstate]'), upnl: root.querySelector('[data-upnl]'),
      equity: root.querySelector('[data-equity]'), buy: root.querySelector('[data-buy]'),
      sell: root.querySelector('[data-sell]'), pos: root.querySelector('[data-pos]'),
      blist: root.querySelector('[data-blist]'), bpnl: root.querySelector('[data-bpnl]'), brec: root.querySelector('[data-brec]'),
      l2: root.querySelector('[data-l2]'), tape: root.querySelector('[data-tape]'),
      l1: root.querySelector('[data-l1]'), l2toggle: root.querySelector('[data-l2toggle]'), bookmode: root.querySelector('[data-bookmode]'),
      countdown: root.querySelector('[data-countdown]'), cdnum: root.querySelector('[data-cdnum]'),
      pauseover: root.querySelector('[data-pauseover]'), pauseToggle: root.querySelector('[data-pausetoggle]'), exitBtn: root.querySelector('[data-exit]')
    };
    sizeChart(); drawChart(); updateButtons(); applyBookView(); for (var sp = 0; sp < 24; sp++) emitPrint();
    els.buy.addEventListener('click', buySide);
    els.sell.addEventListener('click', sellSide);
    els.pauseToggle.addEventListener('click', togglePause);
    els.exitBtn.addEventListener('click', exitGame);
    els.l2toggle.addEventListener('click', toggleBookView);
    buildShare(root.querySelector('[data-share-game]'), 'https://maketzo.co/trader-type', 'Two minutes on a simulated small-cap tape that fights back. Can you trade, or do you just think so?', 'ingame', pauseGame);
    window.addEventListener('resize', sizeChart);
    runCountdown(beginGame);
  }

  // A 3-2-1-GO countdown precedes the tape. Driven by a requestAnimationFrame clock
  // anchored to performance.now(), so each number shows based on REAL elapsed time —
  // setTimeout callbacks can bunch when the main thread is busy (cold load / audio
  // init), which read as a "rushed" cadence. This is dead-steady regardless of jitter.
  function runCountdown(done) {
    var STEP = 900, labels = ['3', '2', '1', 'GO'], shown = -1, t0 = performance.now();
    els.countdown.classList.remove('diag-hidden');
    // Beeps scheduled once against the audio clock (immune to cold-context warmup);
    // the rAF clock below drives ONLY the visual numbers, anchored to real elapsed time.
    try { audio.cdSequence(STEP / 1000); } catch (e) {}
    (function frame(now) {
      var i = Math.floor((now - t0) / STEP);
      if (i >= labels.length) { els.countdown.classList.add('diag-hidden'); done(); return; }
      if (i !== shown) {
        shown = i; var v = labels[i];
        els.cdnum.textContent = v; els.cdnum.className = 'diag-cd-num' + (v === 'GO' ? ' go' : '');
        void els.cdnum.offsetWidth; els.cdnum.classList.add('tick');
      }
      raf = requestAnimationFrame(frame);
    })(t0);
  }

  function beginGame() {
    t0 = performance.now(); lastCandle = t0; lastTick = t0;
    regimeEnd = t0 + ri(REG.grind.min, REG.grind.max);
    eventAt = t0 + DURATION * eventProg;
    lastBookAt = t0; lastPrintAt = t0; lastWallAt = t0 - WALL_COOLDOWN; lastSpreadAt = t0;
    running = true; updateButtons();
    raf = requestAnimationFrame(loop);
  }

  // One simple toggle: click pauses, click again plays. Exit drops back to intro.
  function togglePause() { if (paused) resumeGame(); else pauseGame(); }
  function exitGame() { clearAll(); running = false; paused = false; pos = null; window.removeEventListener('resize', sizeChart); renderIntro(); }
  function pauseGame() {
    if (!running || paused) return;
    paused = true; running = false; pauseStart = performance.now();
    if (raf) cancelAnimationFrame(raf); raf = 0;
    els.pauseover.classList.remove('diag-hidden'); els.pauseToggle.textContent = '▶ Resume'; updateButtons();
  }
  function resumeGame() {
    if (!paused) return;
    var delta = performance.now() - pauseStart;
    t0 += delta; lastCandle += delta; regimeEnd += delta; eventAt += delta; lastLossAt += delta;
    lastBookAt += delta; lastPrintAt += delta; lastWallAt += delta; lastSpreadAt += delta; if (wall && wall.bornAt) wall.bornAt += delta;
    if (pos) pos.openAt += delta;
    lastTick = performance.now();
    paused = false; running = true;
    els.pauseover.classList.add('diag-hidden'); els.pauseToggle.textContent = '❚❚ Pause'; updateButtons();
    raf = requestAnimationFrame(loop);
  }

  function sizeChart() { if (!cv) return; var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv._w = Math.max(220, r.width); cv._h = r.height || 220; cv.width = cv._w * dpr; cv.height = cv._h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (candles) drawChart(); }

  function loop(now) {
    var elapsed = now - t0;
    if (elapsed >= DURATION) { endGame(); return; }
    raf = requestAnimationFrame(loop);
    var dt = (now - lastTick) / 1000; lastTick = now;
    if (!isFinite(dt) || dt <= 0) dt = 0.016; if (dt > 0.05) dt = 0.05;

    // randomly-timed catalyst — the fundamental "reason" (offering / squeeze). Loud.
    if (scenario.event && !eventFired && now >= eventAt) {
      eventFired = true; regime = scenario.event; pending = null; wall = null;
      var RE = REG[regime]; regimeEnd = now + ri(RE.min, RE.max);
      // Session-relative, to match the trades' openAt/closeAt. This is what lets the
      // engine ask "did you touch the button in the four seconds after the news hit?"
      catalystAt = now - t0;
      if (regime === 'rug') { catalystDir = 'rug'; price = Math.max(0.4, price * rnd(0.85, 0.93)); audio.rug(); showCatalyst('rug'); }
      else { catalystDir = 'squeeze'; price = price * rnd(1.06, 1.16); audio.squeeze(); showCatalyst('squeeze'); }
    }
    // telegraph an upcoming STRONG move through the book ~LEAD_MS early; a slice of
    // these are spoofs that pull and reverse (revealed at the turn). Reading the
    // tape is an edge, not armor — a wall that holds pays, a wall that pulls traps.
    if (running && !pending && now >= regimeEnd - LEAD_MS && now < regimeEnd) {
      var nr = nextRegime(regime, elapsed / DURATION);
      pending = { reg: nr, dir: dirOf(nr), side: null, spoof: false };
      var sd = strongDir(nr);
      if (sd && now - lastWallAt > WALL_COOLDOWN) {
        var spoof = Math.random() < SPOOF_P;
        var side = spoof ? (sd === 'bull' ? 'ask' : 'bid') : (sd === 'bull' ? 'bid' : 'ask');
        spawnWall(side, spoof, now); pending.side = side; pending.spoof = spoof; lastWallAt = now;
        tapeCallout(side, false);
      }
    }
    // regime timer — consume the telegraphed transition; reveal spoofs on the turn
    if (now >= regimeEnd) {
      regime = pending ? pending.reg : nextRegime(regime, elapsed / DURATION);
      var R0 = REG[regime]; regimeEnd = now + ri(R0.min, R0.max);
      if (pending && pending.side && pending.spoof) { pullWall(); tapeCallout(pending.side, true); }
      // organic regime changes are SILENT — the loud alarm is reserved for the catalyst.
      if (regime === 'rug') { price = Math.max(0.4, price * rnd(0.90, 0.965)); }
      else if (regime === 'pump') { price = price * rnd(1.0, 1.035); }
      pending = null;
    }
    if (wall && !wall.spoof && now > wall.bornAt + WALL_LIFE) wall = null;
    var R = REG[regime] || REG.grind;
    var drift = price * R.drift * dt;
    // fat-tailed noise: ~3% of ticks get an outsized spike (stop-runs / sweeps that
    // mostly snap back), and down-tape prints a touch sharper than up ("elevator down").
    var isSpike = Math.random() < 0.03, spike = isSpike ? rnd(2.2, 3.6) : 1, sharp = R.drift < 0 ? 1.15 : 1;
    var noise = price * R.vol * (Math.random() * 2 - 1) * Math.sqrt(dt) * 2 * spike * sharp;
    var np = price + drift + noise;
    price = isFinite(np) ? Math.max(0.4, np) : price;
    recentHigh = Math.max(recentHigh * 0.997, price);

    var c = candles[candles.length - 1]; c.c = price; if (price > c.h) c.h = price; if (price < c.l) c.l = price;
    // `t` = session ms, stamped at creation. The review chart maps your fills onto the
    // tape by TIME (trades carry openAt/closeAt in the same units), which is exact and
    // survives the closeCandle cadence drifting. Seed candles have no `t`: they are
    // pre-session scenery and must never be part of the review.
    //
    // CAP: was 90, which is ~63s of a 120s session — by the buzzer the FIRST HALF of the
    // tape had already been shifted out, so a review chart literally could not show the
    // trades you took early. 260 holds the 40 seed candles plus a full session with room
    // to spare, and it is 260 small objects, which is nothing. drawChart only ever slices
    // the last WINDOW, so nothing downstream cares that the array is longer.
    if (now - lastCandle >= CANDLE_MS) { lastCandle = now; closeCandle(c, now); candles.push({ o: price, h: price, l: price, c: price, e9: ema9, e20: ema20, vwap: vwap, t: now - t0 }); if (candles.length > 260) candles.shift(); }

    // skip spike ticks for max-favorable/adverse: a 1-tick sweep is an untradeable wick,
    // so it must not masquerade as a level the player "gave back" or "got caught" at.
    if (pos && !isSpike) { var u = pos.dir * pos.shares * (price - pos.entry); if (u < pos.maxAdverse) pos.maxAdverse = u; if (u > pos.maxFav) pos.maxFav = u; }

    // Session extremes, on the SAME spike guard and for the same reason. A fat-tail
    // sweep is a 1-tick wick nobody could trade, so it must never become "the high you
    // bought" (Exit Liquidity) or "the $4,000 you were up" (The Roundtripper). Letting a
    // wick set these is exactly the v19 maxFav bug, one level up.
    if (!isSpike) {
      if (price > sessionHigh) sessionHigh = price;
      if (price < sessionLow) sessionLow = price;
      var eq = balance - START_BAL + (pos ? pos.dir * pos.shares * (price - pos.entry) : 0);
      if (eq > peakEquity) peakEquity = eq;
      if (eq < troughEquity) troughEquity = eq;
    }

    // live tape — order book refresh (eased toward the regime, or the telegraphed
    // move during a lead window) + a Time & Sales print on a volatility-scaled cadence
    if (now - lastBookAt >= BOOK_MS) {
      lastBookAt = now;
      var tReg = pending && pending.dir ? (pending.dir === 'bull' ? 'rip' : 'dump') : regime;
      printSkew += (printTarget(tReg) - printSkew) * 0.08;
      if (now - lastSpreadAt >= 2800) { lastSpreadAt = now; spreadTicks = pickSpread(regime); }
      refreshBook();
    }
    if (now - lastPrintAt >= printGapFor(regime)) { lastPrintAt = now; emitPrint(); }

    if (Math.random() < 0.2) audio.tick();
    drawChart();
    renderTerminal(elapsed);
  }

  function renderTerminal(elapsed) {
    els.px.textContent = px(price);
    var rem = Math.max(0, DURATION - elapsed), s = Math.ceil(rem / 1000), mm = Math.floor(s / 60), ss = s % 60;
    els.clock.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss; els.clock.classList.toggle('low', rem <= 15000);
    var u = pos ? pos.dir * pos.shares * (price - pos.entry) : 0;
    els.equity.textContent = money(balance + u);
    if (pos) {
      els.pos.className = 'diag-pos open ' + (u >= 0 ? 'up' : 'down');
      els.pstate.textContent = (pos.dir === 1 ? 'LONG ' : 'SHORT ') + pos.shares + (pos.lots > 1 ? ' · ' + pos.lots + 'x' : '') + ' @ ' + px(pos.entry);
      els.upnl.textContent = (u > 0 ? '+' : '') + money(u);
    } else { els.pos.className = 'diag-pos'; els.pstate.textContent = 'FLAT'; els.upnl.textContent = ''; }
  }

  function closeCandle(c, now) {
    ema9 += K9 * (c.c - ema9); ema20 += K20 * (c.c - ema20); c.e9 = ema9; c.e20 = ema20;
    var rangePct = Math.abs(c.c - c.o) / (c.o || 1);
    // Volume reflects CONVICTION: heavy on real pushes (pump/rug/squeeze), light on the
    // traps (dead-cat bounce + chop fade), so volume confirms a move or exposes a fake.
    var volMult = (regime === 'pump' || regime === 'rug' || regime === 'squeeze') ? 2.6 : (regime === 'rip' || regime === 'dump') ? 1.6 : (regime === 'deadcat' || regime === 'chop') ? 0.55 : 1;
    var vol = (800 + Math.random() * 600) * volMult * (1 + rangePct * 8);
    c.vol = vol;
    var tp = (c.h + c.l + c.c) / 3;
    vwapPV += tp * vol; vwapVol += vol; vwap = vwapVol > 0 ? vwapPV / vwapVol : c.c; c.vwap = vwap;
    if (price > resistance * 1.015) { resistance = price * rnd(1.05, 1.09); }
    else if (price > resistance * 0.99 && (regime === 'rip' || regime === 'pump') && Math.random() < 0.45) { regime = 'dump'; regimeEnd = now + ri(REG.dump.min, REG.dump.max); }
    else if (price < resistance * 0.85) { var rh = 0, vl = candles.slice(-20); for (var z = 0; z < vl.length; z++) if (vl[z].h > rh) rh = vl[z].h; resistance = Math.max(rh, price * 1.03) * rnd(1.0, 1.02); }
  }

  // ── The live tape: order book + Time & Sales, driven by the regime engine ───
  function tickOf(p) { return p < 2 ? 0.005 : p < 10 ? 0.01 : p < 25 ? 0.02 : 0.05; }
  function fmtSize(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 9500 ? 0 : 1) + 'K' : '' + Math.round(n); }
  function strongDir(reg) { return (reg === 'rip' || reg === 'pump' || reg === 'squeeze') ? 'bull' : (reg === 'dump' || reg === 'rug') ? 'bear' : null; }
  function dirOf(reg) { return (reg === 'rip' || reg === 'pump' || reg === 'squeeze' || reg === 'deadcat') ? 'bull' : (reg === 'dump' || reg === 'rug' || reg === 'bleed') ? 'bear' : null; }
  function printTarget(reg) { var d = REG[reg] ? REG[reg].drift : 0; return clamp(0.5 + d * 1.6, 0.12, 0.9); }
  function printGapFor(reg) { var Rg = REG[reg] || REG.grind; return clamp(420 - (Math.abs(Rg.drift) + Rg.vol) * 700, 90, 460); }

  // Inside spread varies (1 inside-tick tight to a few wide), wider when the tape is
  // moving — re-rolled every few seconds so the L1 spread actually updates like a real book.
  function pickSpread(reg) {
    var v = REG[reg] ? REG[reg].vol : 0.03;
    var base = v > 0.06 ? rnd(1.6, 4.6) : v > 0.04 ? rnd(1.1, 3.1) : rnd(1, 2.1);
    return Math.max(1, Math.round(base));
  }
  // A wall is the leading tell. Real ones get tested and hold; spoofs pull first.
  function spawnWall(side, spoof, now) {
    var tick = tickOf(price), innerAsk = Math.ceil(price / tick) * tick, innerBid = innerAsk - spreadTicks * tick;
    var p0 = side === 'ask' ? innerAsk + tick * ri(1, 3) : innerBid - tick * ri(1, 3);
    wall = { side: side, px: p0, size: ri(6000, 22000), spoof: spoof, bornAt: now };
  }
  function pullWall() { wall = null; }

  function baseSize(level, lean) {
    var base = (300 + Math.random() * 1400) * (1 - level * 0.12) * (1 + clamp(lean, -0.5, 0.5) * 1.1);
    return Math.max(100, Math.round(base / 100) * 100);
  }
  function pickMMs(n) {
    var pool = MMIDS.slice(), out = [];
    for (var i = 0; i < n; i++) out.push(pool.length ? pool.splice(ri(0, pool.length - 1), 1)[0] : pick(MMIDS));
    return out;
  }
  function mmidFor(side, idx) { var arr = side === 'bid' ? mmBids : mmAsks; return (arr && arr[idx]) || pick(MMIDS); }
  function refreshBook() {
    if (!els || !els.l2) return;
    var tick = tickOf(price), innerAsk = Math.ceil(price / tick) * tick, innerBid = innerAsk - spreadTicks * tick, lean = printSkew - 0.5;
    var asks = [], bids = [], mx = 1, i;
    for (i = 0; i < L2_LEVELS; i++) {
      asks.push({ px: innerAsk + i * tick, size: baseSize(i, -lean) });
      bids.push({ px: innerBid - i * tick, size: baseSize(i, lean) });
    }
    if (wall) {
      var arr = wall.side === 'ask' ? asks : bids, best = 0, bd = 1e9;
      for (i = 0; i < arr.length; i++) { var d = Math.abs(arr[i].px - wall.px); if (d < bd) { bd = d; best = i; } }
      if (bd <= tick * 1.5) { arr[best].size = wall.size; arr[best].wall = true; }
    }
    for (i = 0; i < L2_LEVELS; i++) { if (asks[i].size > mx) mx = asks[i].size; if (bids[i].size > mx) mx = bids[i].size; }
    book = { asks: asks, bids: bids };
    if (els.l1) els.l1.innerHTML =
      '<span class="diag-l1-cell bid">' + bids[0].px.toFixed(2) + '</span>' +
      '<span class="diag-l1-spr">spr ' + (asks[0].px - bids[0].px).toFixed(2) + '</span>' +
      '<span class="diag-l1-cell ask">' + asks[0].px.toFixed(2) + '</span>';
    if (bookView === 'ladder') renderLadder(asks, bids, mx);
    else renderMontage(asks, bids);
    if (Math.random() < 0.18) { var sa = Math.random() < 0.5 ? mmBids : mmAsks; if (sa) sa[ri(0, sa.length - 1)] = pick(MMIDS); }
  }
  // The DAS-style default: two columns (bids left, asks right) of MMID · price · size,
  // banded by price level. A wall is a fat size at one MM; a spoof is that MM vanishing.
  function renderMontage(asks, bids) {
    var h = '<div class="diag-mont"><div class="diag-mont-col">', i;
    for (i = 0; i < L2_LEVELS; i++) h += montRow(bids[i], 'bid', i);
    h += '</div><div class="diag-mont-col">';
    for (i = 0; i < L2_LEVELS; i++) h += montRow(asks[i], 'ask', i);
    h += '</div></div>';
    els.l2.innerHTML = h;
  }
  function montRow(lv, side, idx) {
    var lots = Math.max(0, Math.round(lv.size / 100));
    return '<div class="diag-mont-row ' + side + ' lvl' + Math.min(idx, 5) + (lv.wall ? ' wall' : '') + '">' +
      '<span class="diag-mm">' + mmidFor(side, idx) + '</span>' +
      '<span class="diag-mp">' + lv.px.toFixed(2) + '</span>' +
      '<span class="diag-ml">' + lots + '</span></div>';
  }
  // The simpler alt: a single-axis price ladder with depth bars (pressure at a glance).
  function renderLadder(asks, bids, mx) {
    var h = '', i;
    for (i = L2_LEVELS - 1; i >= 0; i--) h += l2Row(asks[i], 'ask', mx);
    h += '<div class="diag-l2-spread">' + px(price) + '</div>';
    for (i = 0; i < L2_LEVELS; i++) h += l2Row(bids[i], 'bid', mx);
    els.l2.innerHTML = h;
  }
  function l2Row(lv, side, mx) {
    var w = Math.max(4, Math.round(lv.size / mx * 100));
    return '<div class="diag-l2-row ' + side + (lv.wall ? ' wall' : '') + '">' +
      '<span class="diag-l2-bar" style="width:' + w + '%"></span>' +
      '<span class="diag-l2-px">' + lv.px.toFixed(2) + '</span>' +
      '<span class="diag-l2-sz">' + fmtSize(lv.size) + '</span></div>';
  }
  // The book view (montage vs ladder) PERSISTS across replays — bookView is never
  // reset, so apply syncs the toggle label + sub-label + re-renders to whatever it is.
  function applyBookView() {
    if (els.l2toggle) els.l2toggle.textContent = bookView === 'montage' ? 'Ladder' : 'Montage';
    if (els.bookmode) els.bookmode.textContent = bookView === 'montage' ? '· montage' : '· ladder';
    refreshBook();
  }
  function toggleBookView() {
    bookView = bookView === 'montage' ? 'ladder' : 'montage';
    try { audio.tick(); } catch (e) {}
    applyBookView();
  }
  function emitPrint() {
    if (!els || !els.tape) return;
    var tick = tickOf(price), green = Math.random() < printSkew;
    var pr = price + (green ? rnd(0, tick) : -rnd(0, tick));
    var block = Math.random() < 0.12, size = block ? ri(2000, 9000) : ri(100, 900);
    var row = document.createElement('div');
    row.className = 'diag-print ' + (green ? 'buy' : 'sell') + (block ? ' block' : '');
    row.innerHTML = '<span class="diag-print-px">' + pr.toFixed(2) + '</span><span class="diag-print-sz">' + fmtSize(size) + '</span>';
    els.tape.insertBefore(row, els.tape.firstChild);
    while (els.tape.childNodes.length > 24) els.tape.removeChild(els.tape.lastChild);
  }
  // The plain-words callout naming what the book just did — quiet, distinct from the
  // loud catalyst. Spawn = "buyers stacking the bid"; pull = the spoof getting revealed.
  function tapeCallout(side, pulled) {
    if (pulled) {
      if (side === 'bid') showCatalyst('rug', 'Big bid pulled. Support was a spoof');
      else showCatalyst('squeeze', 'Big offer pulled. Resistance wall was a spoof');
      audio.news();
    } else {
      showCatalyst('tape', side === 'bid' ? 'Buyers stacking the bid' : 'Sellers stacking the ask');
      audio.tick();
    }
  }
  function showCatalyst(kind, text) {
    var host = root.querySelector('.diag-main'); if (!host) return;
    var prev = host.querySelectorAll('.diag-event'); for (var k = 0; k < prev.length; k++) prev[k].parentNode.removeChild(prev[k]);
    var cls = kind === 'rug' ? 'rug' : kind === 'squeeze' ? 'squeeze' : kind === 'tape' ? 'tape' : 'news';
    var b = document.createElement('div'); b.className = 'diag-event ' + cls;
    b.textContent = text || pick(kind === 'rug' ? RUG_NEWS : SQUEEZE_NEWS);
    host.appendChild(b);
    // The loud catalyst (no explicit text → picks from NEWS) is the key teaching moment and
    // the longest line, so it stays up longer; the frequent tape callouts clear faster.
    later(function () { if (b.parentNode) b.parentNode.removeChild(b); }, text ? 2600 : 4200);
  }

  function drawChart() {
    var w = cv._w, h = cv._h, pad = 8, vis = candles.slice(-WINDOW);
    ctx.clearRect(0, 0, w, h);
    var lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < vis.length; i++) { if (vis[i].l < lo) lo = vis[i].l; if (vis[i].h > hi) hi = vis[i].h; }
    if (pos) { lo = Math.min(lo, pos.entry); hi = Math.max(hi, pos.entry); }
    if (!isFinite(lo) || !isFinite(hi)) return;
    var resVis = isFinite(resistance) && resistance < hi * 1.22;
    if (resVis) hi = Math.max(hi, resistance);
    var rng = (hi - lo) || 1; lo -= rng * 0.08; hi += rng * 0.08; rng = hi - lo;
    function Y(p) { return pad + (h - 2 * pad) * (1 - (p - lo) / rng); }
    var cw = (w - 2 * pad) / WINDOW, bw = Math.max(2, cw * 0.62);
    // volume overlay — translucent bars along the bottom; conviction behind each candle
    var volMax = 1; for (i = 0; i < vis.length; i++) { if ((vis[i].vol || 0) > volMax) volMax = vis[i].vol; }
    var volH = (h - 2 * pad) * 0.22, volBase = h - pad;
    for (i = 0; i < vis.length; i++) {
      var vc = vis[i]; if (!vc.vol) continue;
      var vx = pad + cw * i + cw / 2, vbh = volH * (vc.vol / volMax);
      ctx.fillStyle = (vc.c >= vc.o) ? 'rgba(126,217,87,.20)' : 'rgba(255,107,107,.20)';
      ctx.fillRect(vx - bw / 2, volBase - vbh, bw, vbh);
    }
    ctx.fillStyle = 'rgba(170,182,195,.8)'; ctx.font = '9px "DM Mono", monospace'; ctx.fillText('VOL', 5, volBase - 3);
    function poly(key, color, dash) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(dash || []);
      ctx.beginPath(); var started = false;
      for (var j = 0; j < vis.length; j++) { var v = vis[j][key]; if (v == null || !isFinite(v)) continue; var x = pad + cw * j + cw / 2, y = Y(v); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (pos) { var ey = Y(pos.entry); ctx.strokeStyle = 'rgba(212,175,55,.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, ey); ctx.lineTo(w, ey); ctx.stroke(); ctx.setLineDash([]); }
    for (i = 0; i < vis.length; i++) {
      var c = vis[i], x = pad + cw * i + cw / 2, up = c.c >= c.o, col = up ? C_UP : C_DOWN;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
      var yo = Y(c.o), yc = Y(c.c), top = Math.min(yo, yc), hgt = Math.max(1.5, Math.abs(yc - yo));
      ctx.fillStyle = col; ctx.fillRect(x - bw / 2, top, bw, hgt);
    }
    poly('vwap', 'rgba(255,159,67,.95)', [2, 3]);
    poly('e20', 'rgba(127,180,255,.9)');
    poly('e9', 'rgba(255,255,255,.92)');
    if (resVis && resistance >= lo) { var ry = Y(resistance); ctx.strokeStyle = 'rgba(255,122,176,.7)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(w, ry); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,122,176,.95)'; ctx.font = '9px "DM Mono", monospace'; ctx.fillText('RES', 5, ry - 4); }
    var py = Y(price); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); ctx.setLineDash([]);
  }

  // ── Orders (two-sided) ─────────────────────────────────────────────────────
  function buySide() { if (!running) return; if (!pos) openPos(1); else if (pos.dir === 1) addLot(); else flatten(); }
  function sellSide() { if (!running) return; if (!pos) openPos(-1); else if (pos.dir === -1) addLot(); else flatten(); }

  function openPos(dir) {
    audio.buy();
    // Did you trade OFF the wall that was showing? A bid wall reads as support (implies
    // long); an ask wall reads as resistance (implies short). Entering in the direction
    // the wall advertises is "trading the book". Whether that was a read or a trap is
    // decided by wall.spoof, which the trader cannot see: real walls and spoofs render
    // identically on purpose, and spoofs are planted on the side OPPOSITE the coming
    // move (see spawnWall). So this counts the honest thing: you believed the book, and
    // the book either told the truth or lied. Only the opening entry counts, and only
    // while the wall is still displayed (pullWall nulls it the moment a spoof yanks).
    if (wall && dir === (wall.side === 'bid' ? 1 : -1)) {
      if (wall.spoof) wallsSpoofed++; else wallsRead++;
    }
    var addShares = Math.max(1, Math.floor(NOTIONAL / price));
    balance -= addShares * price * FEE_BPS; buyCount++;
    var ext = dir === 1 ? (price / (recentLow() || price)) - 1 : ((recentHigh || price) / price) - 1;
    pos = { dir: dir, entry: price, shares: addShares, lots: 1, openAt: performance.now(), maxAdverse: 0, maxFav: 0, regimeAtEntry: regime, extAtEntry: ext, addsAgainst: 0 };
    flash(dir === 1 ? els.buy : els.sell, 'buy'); updateButtons();
  }
  function addLot() {
    if (pos.lots >= MAXLOTS) { flash(pos.dir === 1 ? els.buy : els.sell, 'buy'); return; }
    audio.buy();
    var addShares = Math.max(1, Math.floor(NOTIONAL / price));
    balance -= addShares * price * FEE_BPS; buyCount++;
    if (pos.dir === 1 ? (price < pos.entry) : (price > pos.entry)) pos.addsAgainst++;
    var tot = pos.shares + addShares;
    pos.entry = (pos.shares * pos.entry + addShares * price) / tot;
    pos.shares = tot; pos.lots++;
    flash(pos.dir === 1 ? els.buy : els.sell, 'buy'); updateButtons();
  }
  function flatten() {
    var held = performance.now() - pos.openAt;
    var pnl = pos.dir * pos.shares * (price - pos.entry);
    balance += pnl - pos.shares * price * FEE_BPS;
    var since = performance.now() - lastLossAt;
    // openAt/closeAt are ms from the start of the session (t0), NOT raw performance.now().
    // The badge engine reads them for the timing badges (The Closer, The Patient, Ice
    // Water, Rug Rider), so they must be session-relative to mean anything.
    var rec = { dir: pos.dir, avgEntry: pos.entry, exit: price, shares: pos.shares, lots: pos.lots, pnl: pnl, heldMs: held, regimeAtEntry: pos.regimeAtEntry, extAtEntry: pos.extAtEntry, maxAdverse: pos.maxAdverse, maxFav: pos.maxFav, addsAgainst: pos.addsAgainst, revenge: since < 2000, win: pnl > 0, openAt: pos.openAt - t0, closeAt: performance.now() - t0 };
    trades.push(rec);
    if (pnl < 0) { lastLossAt = performance.now(); audio.sellLoss(); } else audio.sellWin();
    flash(pos.dir === 1 ? els.sell : els.buy, pnl >= 0 ? 'win' : 'loss');
    addBlotterRow(rec); pos = null; updateButtons(); updateBlotterSummary();
  }
  function recentLow() { var lo = Infinity, v = candles.slice(-14); for (var i = 0; i < v.length; i++) if (v[i].l < lo) lo = v[i].l; return lo === Infinity ? price : lo; }
  function flash(btn, kind) { btn.classList.add('flash-' + kind); later(function () { btn.classList.remove('flash-' + kind); }, 220); }

  function updateButtons() {
    if (!els) return;
    if (!pos) { els.buy.textContent = 'BUY'; els.sell.textContent = 'SHORT'; }
    else if (pos.dir === 1) { els.buy.textContent = 'ADD'; els.sell.textContent = 'SELL'; }
    else { els.buy.textContent = 'COVER'; els.sell.textContent = 'ADD'; }
    if (!running) { els.buy.disabled = true; els.sell.disabled = true; return; }
    if (!pos) { els.buy.disabled = false; els.sell.disabled = false; }
    else if (pos.dir === 1) { els.buy.disabled = pos.lots >= MAXLOTS; els.sell.disabled = false; }
    else { els.buy.disabled = false; els.sell.disabled = pos.lots >= MAXLOTS; }
  }

  // ── Blotter — a live tally that is itself a behavioral trap (watching realized
  // P&L tick makes you snatch winners and revenge-trade reds). ─────────────────
  function addBlotterRow(rec) {
    if (!els || !els.blist) return;
    var empty = els.blist.querySelector('.diag-brow-empty'); if (empty) empty.parentNode.removeChild(empty);
    var row = document.createElement('div');
    row.className = 'diag-brow ' + (rec.pnl >= 0 ? 'win' : 'loss');
    row.innerHTML = '<span class="diag-brow-dir">' + (rec.dir === 1 ? 'LONG' : 'SHORT') + (rec.lots > 1 ? ' ' + rec.lots + 'x' : '') + '</span><span class="diag-brow-pnl">' + (rec.pnl > 0 ? '+' : '') + money(rec.pnl) + '</span>';
    els.blist.insertBefore(row, els.blist.firstChild);
  }
  function updateBlotterSummary() {
    if (!els) return;
    var real = 0, wk = 0, lk = 0;
    for (var i = 0; i < trades.length; i++) { real += trades[i].pnl; if (trades[i].pnl >= 0) wk++; else lk++; }
    if (els.bpnl) { els.bpnl.textContent = (real > 0 ? '+' : '') + money(real); els.bpnl.className = 'diag-blotter-pnl ' + (real > 0 ? 'up' : real < 0 ? 'down' : ''); }
    if (els.brec) els.brec.textContent = wk + 'W · ' + lk + 'L';
  }

  // ── End + scoring ──────────────────────────────────────────────────────────
  function endGame() {
    clearAll(); window.removeEventListener('resize', sizeChart); running = false;
    if (pos) flatten();
    var net = balance - START_BAL;
    var an = analyze(net);
    // `archetype` keeps its name so the existing PostHog funnels/insights keep working;
    // it is now the HEADLINE badge id. `shelf` is new: it is how we learn which badges
    // actually get earned, which is the input to making rarity real later.
    track('diagnostic_complete', {
      archetype: an.headline.id, tier: an.headline.tier,
      shelf: an.shelf.map(function (b) { return b.id; }).join(','),
      grade: an.grade, disc: an.disc,
      net: Math.round(net), trades: trades.length, buys: buyCount, scenario: scenario.id
    });
    renderResult(an, net);
  }

  // Scoring is delegated to badge-engine.js (pure module, no DOM, node-testable).
  // This function's only job is to hand the engine the session it needs. The engine
  // decides the grade (the verdict) and the badges (the fingerprint) separately, and
  // no badge can fire without printing a true receipt. Do NOT reintroduce scoring
  // logic here: it needs to run unchanged inside the app, and the app must not grow
  // another monolith. See badge-engine.js for the rules and the incident history.
  function analyze(net) {
    return window.MaketzoBadges.evaluate({
      trades: trades,
      net: net,
      buyCount: buyCount,
      durationMs: DURATION,
      peakEquity: peakEquity, troughEquity: troughEquity,
      sessionHigh: sessionHigh, sessionLow: sessionLow,
      catalystAt: catalystAt, catalystDir: catalystDir,
      wallsRead: wallsRead, wallsSpoofed: wallsSpoofed
    });
  }
  // REMOVED 2026-07-15: pctDidBetter(disc) — "N% did better than you". It was a hardcoded
  // lookup on the player's OWN discipline score. It measured nobody. It was a claim about
  // a population that did not exist, printed on a product whose entire pitch is honesty,
  // and it is the same fabricated-leaderboard idea already ruled out once (the sim
  // deliberately has no fake leaderboard). Its slot now shows the badge collection, which
  // is a fact about you. If a real percentile is wanted, the backend /diagnostic/result
  // counter has to exist first — `diagnostic_complete` now logs tier/shelf/disc, so the
  // data starts accruing from today.

  function renderResult(an, net) {
    var h = an.headline, st = an.stats;
    var discCls = an.disc >= 70 ? 'up' : (an.disc < 45 ? 'down' : '');
    var verdictHtml = an.verdict ? '<div class="diag-verdict">' + an.verdict + '</div>' : '';
    // Record the run + read the collection. Never let a storage fault break the card.
    var vault = { earned: 0, total: 0, fresh: [], runs: 0, supported: false };
    try { vault = window.MaketzoVault.record(an, window.MaketzoBadges.CATALOG.length); } catch (e) {}
    // On run 1 EVERYTHING is new, so the marker differentiates nothing and just adds
    // four badges of noise to a first impression. It earns its place from run 2 on.
    var isFresh = {};
    if (vault.runs > 1) for (var vi = 0; vi < vault.fresh.length; vi++) isFresh[vault.fresh[vi]] = 1;
    // The receipt IS the roast. There is no separate roast table any more: the sentence
    // the engine had to be able to print in order to earn the badge is the sentence the
    // card shows. That is what makes the card undisputable instead of infuriating.
    var roast = h.receipt;
    var tag = h.tagline;
    // The shelf. The headline is the punch; these carry the nuance and the collection.
    // Pills are the SHELF only. The headline is already the biggest thing on the card,
    // so repeating it as a pill directly beneath itself is noise, and its receipt is
    // already the roast. A first-time headline is marked on the headline instead.
    var shelfHtml = an.shelf.length
      ? '<div class="diag-shelf">' + an.shelf.map(function (b) {
          return '<div class="diag-shelf-badge diag-bt-' + b.tier + (isFresh[b.id] ? ' is-new' : '') +
            '" title="' + escAttr(b.receipt) + '">' + b.name +
            (isFresh[b.id] ? '<span class="diag-new">new</span>' : '') + '</div>';
        }).join('') + '</div>'
      : '';
    var headNewHtml = isFresh[h.id] ? '<span class="diag-new diag-new--head">new</span>' : '';
    var shelfWhyHtml = an.shelf.length
      ? '<div class="diag-shelf-why">' + an.shelf.map(function (b) {
          return '<div class="diag-shelf-line"><span class="diag-shelf-name">' + b.name + '</span> ' + b.receipt + '</div>';
        }).join('') + '</div>'
      : '';
    var tellsHtml = an.tells.length
      ? '<div class="diag-tells"><div class="diag-tells-h">Your tells</div>' + an.tells.map(function (t) { return '<div class="diag-tell">' + t + '</div>'; }).join('') + '</div>'
      : '<div class="diag-tells"><div class="diag-tells-h">Your tells</div><div class="diag-tell">Nothing to confess. You took the right side, cut your losers, and walked. Rare.</div></div>';
    var url = SHARE_URL;
    var shareText = buildShareBlock(an, net, st);

    root.innerHTML =
      '<div class="diag-result diag-tier-' + h.tier + '">' +
        '<div class="diag-result-head">' +
          '<div class="diag-result-eyebrow">Two minutes later…</div>' +
          '<div class="diag-share-top" data-share></div>' +
        '</div>' +
        '<div class="diag-card slam" data-card>' +
          '<div class="diag-card-grade">' + an.grade + '</div>' +
          '<div class="diag-card-name">' + h.name + headNewHtml + '</div>' +
          '<div class="diag-card-tag">' + tag + '</div>' +
          '<div class="diag-card-roast">' + roast + '</div>' +
          shelfHtml +
          '<div class="diag-card-meta">' +
            '<div class="diag-meta-box"><span class="diag-meta-num ' + (net >= 0 ? 'up' : 'down') + '">' + money(net) + '</span><span class="diag-meta-cap">2-min P&L</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num">' + st.winRate + '%</span><span class="diag-meta-cap">win rate</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num ' + discCls + '">' + an.disc + '<span class="diag-meta-den">/100</span></span><span class="diag-meta-cap">discipline</span></div>' +
            (vault.supported
              ? '<div class="diag-meta-box"><span class="diag-meta-num gold">' + vault.earned + '<span class="diag-meta-den">/' + vault.total + '</span></span><span class="diag-meta-cap">badges collected</span></div>'
              : '<div class="diag-meta-box"><span class="diag-meta-num">' + st.n + '</span><span class="diag-meta-cap">trades</span></div>') +
          '</div>' +
          '<div class="diag-card-stats">' + st.n + ' trades · ' + st.wins + 'W ' + st.losses + 'L · avg win +' + money(st.avgWin) + ' · avg loss ' + money(-st.avgLoss) + ' · worst heat held ' + money(st.worstHeat) + '</div>' +
          '<div class="diag-card-wm">MAKETZO · protect your capital · maketzo.co</div>' +
        '</div>' +
        verdictHtml +
        (st.n ? '<div class="diag-review" data-review hidden>' +
          '<div class="diag-review-h">Your trades</div>' +
          '<canvas class="diag-review-cv" data-reviewcv></canvas>' +
          '<div class="diag-review-key">' +
            '<span><i class="diag-k diag-k-entry"></i>entry</span>' +
            '<span><i class="diag-k diag-k-win"></i>exit, green</span>' +
            '<span><i class="diag-k diag-k-loss"></i>exit, red</span>' +
            '<span>shaded = how long you held it</span>' +
          '</div>' +
          '<div class="diag-review-note">Look left of every entry, not right. What was on the chart before you clicked is what you actually had to work with.</div>' +
        '</div>' : '') +
        shelfWhyHtml +
        tellsHtml +
        '<div class="diag-funnel">' +
          '<p class="diag-funnel-line">' + h.pitch + '</p>' +
          '<a class="diag-cta" href="/app" data-cta>Train it free →</a>' +
          '<div class="diag-funnel-sub">7 days free · no charge until day 8 · cancel in one click</div>' +
        '</div>' +
        '<div class="diag-endbar">' +
          (st.n ? '<button class="diag-copy diag-seetrades" type="button" data-seetrades>See your trades</button>' : '') +
          '<button class="diag-copy" type="button" data-copyresult>Copy your result</button>' +
          '<button class="diag-again" type="button" data-again>↺ Run the tape again</button>' +
        '</div>' +
        (vault.supported && vault.total - vault.earned > 0
          ? '<div class="diag-vault-line">' + (vault.total - vault.earned) + ' badges you have not seen yet.</div>'
          : '') +
      '</div>';
    buildShare(root.querySelector('[data-share]'), url, shareText, h.id);
    root.querySelector('[data-again]').addEventListener('click', function () { start(); });
    root.querySelector('[data-cta]').addEventListener('click', function () { track('diagnostic_cta', { archetype: h.id }); });
    wireCopyResult(root.querySelector('[data-copyresult]'), shareText, h.id);
    wireSeeTrades(root, h.id);
    audio.verdict();
  }

  // ── "See your trades" — the review chart ────────────────────────────────────
  // The whole session on one chart with your fills marked. This is the most instructive
  // thing on the result and it is also a live demo of what MAKETZO actually sells:
  // looking at your own fills once the emotion has drained out. The sim spends two
  // minutes proving you have a habit; this is the surface where you SEE it.
  //
  // Draws from candles[] where t != null (session candles only; seeds are scenery), and
  // maps trades on by openAt/closeAt in the same session-ms units.
  function drawReview(canvas) {
    var sess = [], i;
    for (i = 0; i < candles.length; i++) if (candles[i].t != null) sess.push(candles[i]);
    if (!sess.length) return false;

    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    var padL = 6, padR = 44, padT = 10, padB = 16;
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < sess.length; i++) { if (sess[i].l < lo) lo = sess[i].l; if (sess[i].h > hi) hi = sess[i].h; }
    // The fills must be inside the frame even if a fill sat outside the candle range.
    for (i = 0; i < trades.length; i++) {
      lo = Math.min(lo, trades[i].avgEntry, trades[i].exit);
      hi = Math.max(hi, trades[i].avgEntry, trades[i].exit);
    }
    if (!isFinite(lo) || !isFinite(hi)) return false;
    // Pad the frame, but a share price is never negative. A tape that rugs toward zero
    // pushed the axis under 0 and printed "$-0.02" on the scale, which is nonsense.
    var rng = (hi - lo) || 1;
    lo = Math.max(0, lo - rng * 0.10); hi += rng * 0.10; rng = (hi - lo) || 1;

    var t0s = sess[0].t, t1s = sess[sess.length - 1].t || 1;
    var span = (t1s - t0s) || 1;
    function X(ms) { return padL + (w - padL - padR) * ((ms - t0s) / span); }
    function Y(p) { return padT + (h - padT - padB) * (1 - (p - lo) / rng); }

    // candles
    var cw = Math.max(1.2, (w - padL - padR) / sess.length * 0.62);
    for (i = 0; i < sess.length; i++) {
      var c = sess[i], x = X(c.t), up = c.c >= c.o, col = up ? 'rgba(126,217,87,.55)' : 'rgba(255,107,107,.55)';
      g.strokeStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Y(c.h)); g.lineTo(x, Y(c.l)); g.stroke();
      var yo = Y(c.o), yc = Y(c.c);
      g.fillStyle = col; g.fillRect(x - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
    }

    // hold bands — the shaded time you were exposed, green if it paid, red if it did not.
    for (i = 0; i < trades.length; i++) {
      var t = trades[i];
      if (t.openAt == null || t.closeAt == null) continue;
      var x0 = X(t.openAt), x1 = X(t.closeAt), ye = Y(t.avgEntry), yx = Y(t.exit);
      g.fillStyle = t.pnl >= 0 ? 'rgba(126,217,87,.11)' : 'rgba(255,107,107,.11)';
      g.fillRect(x0, Math.min(ye, yx), Math.max(1.5, x1 - x0), Math.max(1.5, Math.abs(yx - ye)));
      // entry -> exit connector
      g.strokeStyle = t.pnl >= 0 ? 'rgba(126,217,87,.85)' : 'rgba(255,107,107,.85)';
      g.lineWidth = 1.25; g.setLineDash([3, 2]);
      g.beginPath(); g.moveTo(x0, ye); g.lineTo(x1, yx); g.stroke(); g.setLineDash([]);
      // entry marker: triangle pointing the way you bet.
      g.fillStyle = '#e5c572';
      g.beginPath();
      if (t.dir === 1) { g.moveTo(x0, ye - 5.5); g.lineTo(x0 - 4.5, ye + 3); g.lineTo(x0 + 4.5, ye + 3); }
      else { g.moveTo(x0, ye + 5.5); g.lineTo(x0 - 4.5, ye - 3); g.lineTo(x0 + 4.5, ye - 3); }
      g.closePath(); g.fill();
      // exit marker
      g.fillStyle = t.pnl >= 0 ? '#7ed957' : '#ff6b6b';
      g.beginPath(); g.arc(x1, yx, 3, 0, Math.PI * 2); g.fill();
    }

    // the catalyst, if one fired — the moment the tape changed under you.
    if (catalystAt != null) {
      var cx = X(catalystAt);
      g.strokeStyle = 'rgba(212,175,55,.5)'; g.lineWidth = 1; g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(cx, padT); g.lineTo(cx, h - padB); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(212,175,55,.9)'; g.font = '8px "DM Mono", monospace';
      g.fillText('NEWS', cx + 3, padT + 8);
    }

    // right-edge price scale, so the moves have a size
    g.fillStyle = 'rgba(154,166,179,.75)'; g.font = '9px "DM Mono", monospace'; g.textAlign = 'left';
    for (i = 0; i <= 3; i++) {
      var p = lo + rng * (i / 3);
      g.fillText('$' + p.toFixed(2), w - padR + 5, Y(p) + 3);
    }
    g.textAlign = 'start';
    return true;
  }

  // ── The shareable block (the Wordle mechanic) ───────────────────────────────
  // Wordle spread on a plain-text grid, not an image: it pastes into any text field,
  // needs no OG pipeline, renders identically everywhere, and reads as a flex rather
  // than an ad. The squares are the trader's ACTUAL trade sequence, green per winner
  // and red per loser, so the block is a real artifact of the run and not decoration.
  //
  // The badge is deliberately NOT hidden the way Wordle hides its answer: the badge IS
  // the flex, and hiding it removes the reason to post. What stays unspoiled is the
  // tape, which is randomised per run anyway, so nobody can be spoiled.
  //
  // The user's own first-person share may challenge a peer; that is settled and is NOT
  // the protect-not-taunt rule, which governs MAKETZO's own voice at a result
  // (memory/feedback-outcome-voice-protective-not-taunting).
  var SQ_MAX = 14, SHARE_URL = 'https://maketzo.co/trader-type';
  function buildShareBlock(an, net, st) {
    var sq = '', i;
    for (i = 0; i < trades.length && i < SQ_MAX; i++) sq += (trades[i].pnl >= 0 ? '🟩' : '🟥');
    if (trades.length > SQ_MAX) sq += '+' + (trades.length - SQ_MAX);
    if (!trades.length) sq = '·  never clicked';
    return 'MAKETZO · trader-type\n' +
      an.headline.name.toUpperCase() + ' · ' + an.grade + '\n' +
      sq + '\n' +
      st.n + (st.n === 1 ? ' trade · ' : ' trades · ') + (net >= 0 ? '+' : '') + money(net) + ' · 2:00\n' +
      SHARE_URL;
  }

  function wireSeeTrades(scope, aid) {
    var btn = scope.querySelector('[data-seetrades]'), panel = scope.querySelector('[data-review]');
    if (!btn || !panel) return;
    var open = false, drawn = false;
    function redraw() { var cv2 = panel.querySelector('[data-reviewcv]'); if (cv2 && open) drawReview(cv2); }
    btn.addEventListener('click', function () {
      open = !open;
      panel.hidden = !open;
      btn.textContent = open ? 'Hide your trades' : 'See your trades';
      btn.classList.toggle('is-done', open);
      if (open) {
        // The canvas has no layout until it is unhidden, so clientWidth is 0 on the
        // first paint. Draw on the next frame, once it has a box to measure.
        requestAnimationFrame(function () {
          var cv2 = panel.querySelector('[data-reviewcv]');
          if (cv2 && drawReview(cv2)) { drawn = true; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
          if (!drawn) { panel.hidden = true; open = false; btn.textContent = 'See your trades'; btn.classList.remove('is-done'); }
        });
        track('diagnostic_see_trades', { archetype: aid });
      }
    });
    // Canvas is raster: a resize needs a redraw or the chart goes blurry/stretched.
    window.addEventListener('resize', redraw);
  }

  // Copy the block to the clipboard. This is NOT a duplicate of the .mk-share widget
  // (which shares a LINK to a platform, and whose "Copy link" copies the URL alone).
  // Wordle's actual mechanic is copy-a-text-block and paste it wherever you already
  // talk, which is a different job and needs its own button.
  function wireCopyResult(btn, text, aid) {
    if (!btn) return;
    btn.addEventListener('click', function () {
      function done(okFlag) {
        btn.textContent = okFlag ? 'Copied' : 'Press Ctrl+C';
        btn.classList.toggle('is-done', !!okFlag);
        later(function () { btn.textContent = 'Copy your result'; btn.classList.remove('is-done'); }, 2200);
        track('diagnostic_copy_result', { archetype: aid, ok: !!okFlag });
      }
      // navigator.clipboard needs a secure context AND permission; it rejects silently
      // in plenty of real browsers, so the execCommand path is a real fallback, not
      // ceremony. If both fail, select the text so the user can copy it themselves.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { legacyCopy(text, done); });
      } else legacyCopy(text, done);
    });
  }
  function legacyCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'diag-copy-sink';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, text.length);
      var okFlag = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      done(!!okFlag);
    } catch (e) { done(false); }
  }

  // ── Share — reuse the site-wide .mk-share component (audio-player.js engine) ─
  var SHARE_MENU_ITEMS =
    '<button class="mk-share__item" type="button" data-platform="email" role="menuitem"><svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg><span>Email</span></button>' +
    '<button class="mk-share__item" type="button" data-platform="sms" role="menuitem"><svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 11H7V9h2v2zm4 0h-2V9h2v2zm4 0h-2V9h2v2z"/></svg><span>Text</span></button>' +
    '<button class="mk-share__item" type="button" data-platform="twitter" role="menuitem"><svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg><span>X</span></button>' +
    '<button class="mk-share__item" type="button" data-platform="whatsapp" role="menuitem"><svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg><span>WhatsApp</span></button>' +
    '<button class="mk-share__item" type="button" data-platform="telegram" role="menuitem"><svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg><span>Telegram</span></button>' +
    '<button class="mk-share__item" type="button" data-platform="facebook" role="menuitem"><svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg><span>Facebook</span></button>' +
    '<button class="mk-share__item mk-share__item--wide" type="button" data-platform="copy" role="menuitem"><svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg><span>Copy link</span></button>';
  var SHARE_ICON = '<svg class="mk-share__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>';

  function buildShare(host, url, text, aid, onTrigger) {
    if (!host) return;
    var wrap = document.createElement('div');
    wrap.className = 'mk-share diag-share-mk';
    wrap.innerHTML =
      '<button class="mk-share__trigger diag-share-icon" type="button" data-share-source="diagnostic" data-tooltip="Share to a trader" aria-label="Share to a trader" ' +
        'data-share-title="' + escAttr('Can you trade, or do you just think so?') + '" data-share-text="' + escAttr(text) + '" data-share-url="' + escAttr(url) + '" data-share-subject="' + escAttr('Can you trade?') + '" ' +
        'aria-haspopup="true" aria-expanded="false">' + SHARE_ICON + '</button>' +
      '<div class="mk-share__menu" role="menu" hidden>' + SHARE_MENU_ITEMS + '</div>';
    host.appendChild(wrap);
    if (!document.querySelector('.mk-share-toast')) { var ts = document.createElement('div'); ts.className = 'mk-share-toast'; ts.setAttribute('role', 'status'); ts.setAttribute('aria-live', 'polite'); ts.hidden = true; ts.textContent = 'Link copied'; document.body.appendChild(ts); }
    // In-game share pauses the live run on open so a share sheet can't burn the clock.
    if (onTrigger) wrap.querySelector('.mk-share__trigger').addEventListener('click', onTrigger);
    var menuEl = wrap.querySelector('.mk-share__menu');
    menuEl.addEventListener('click', function (e) { var b = e.target.closest('[data-platform]'); if (b) track('diagnostic_share', { archetype: aid, via: b.getAttribute('data-platform') }); });
    if (window.__mkInitShareWidgetsIn) window.__mkInitShareWidgetsIn(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
