/*
 * MAKETZO — "Can You Trade?" / "What Kind of Trader Are You?". v27
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

  // ── Archetypes (read from the trade log; direction-aware) ──────────────────
  var ARCH = {
    sniper: { name: 'The Sniper', tier: 'a', rarity: 4,
      roast: 'You took the right side, cut the losers fast and let the winners run. Annoyingly disciplined. The market hates you.',
      tag: 'You wait. You strike. You’re gone.' },
    chaser: { name: 'The Chaser', tier: 'd', rarity: 21,
      roast: 'You bought the top of every pump like it owed you money. You’re the exit liquidity the runners were waiting for.',
      roastS: 'You shorted the bottom of every flush like it owed you money. You’re the fuel every squeeze runs on.',
      tag: 'Green candle, must own. Top tick, every time.',
      tagS: 'Red candle, must short. Bottom tick, every time.' },
    bagholder: { name: 'The Bag Holder', tier: 'd', rarity: 19,
      roast: 'It went against you and you added more to fix your average. The bag only got heavier. Hope is not a stop loss.',
      tag: 'Underwater and still calling it conviction.' },
    paperhands: { name: 'The Paper Hands', tier: 'c', rarity: 16,
      roast: 'You cut winners like the IRS was at the door. The ten-bagger left without you, at +$40.',
      tag: 'Green for one second, sold in half a second.' },
    masher: { name: 'The Button Masher', tier: 'd', rarity: 13,
      roast: 'You traded the chop like it was a fire alarm. A dozen fills, zero edge, and the broker thanks you for the fees.',
      tag: 'You don’t trade the market, you trade your boredom.' },
    revenge: { name: 'Full Tilt', tier: 'f', rarity: 12,
      roast: 'One red print and the plan was gone. You re-loaded to win it back and let the last loss pick your next trade. The market owns you now.',
      tag: 'You don’t trade setups, you trade your feelings.' },
    freezer: { name: 'The Freezer', tier: 'c', rarity: 9,
      roast: 'The move came, you watched it, you admired it, and you did nothing. Your watchlist is a graveyard of would-haves.',
      tag: 'Perfect read. Pulled the trigger ten minutes too late.' },
    degenerate: { name: 'The Degenerate', tier: 'f', rarity: 6,
      roast: 'No plan, no stop, full send. You kept loading until the catalyst hit and took the whole stack with it. A casino with a charting package, and you’re the buffet.',
      tag: 'Max size, no stop. See you in the discord.' }
  };

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
  var RUG_NEWS = ['Dilution: they just priced an offering', 'Insiders just filed to sell. They are hitting every bid.', 'The float unlocked and supply is flooding the tape'];
  var SQUEEZE_NEWS = ['No borrow left. The shorts are getting called in.', 'A halt just lifted and there are no sellers left', 'Every offer is lifting. The shorts are trapped.'];

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
  var bookView = 'montage', mmBids, mmAsks, spreadTicks, lastSpreadAt;
  var cv, ctx, els;

  function reset() {
    raf = 0; timers = []; sym = pick(SYMBOLS);
    var p = rnd(3.2, 6.8); candles = [];
    for (var i = 0; i < WINDOW; i++) { var o = p; p = Math.max(0.5, p * (1 + rnd(-0.022, 0.024))); var c = p; candles.push({ o: o, c: c, h: Math.max(o, c) * (1 + rnd(0, 0.012)), l: Math.min(o, c) * (1 - rnd(0, 0.012)), vol: 500 + Math.random() * 800 }); }
    price = p; regime = 'grind'; regimeEnd = 0;
    balance = START_BAL; pos = null; trades = []; buyCount = 0; recentHigh = price; lastLossAt = -9999;
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
        '<p class="diag-lede">Two minutes on a <b>simulated</b> small-cap tape that fights back. Go <b>long</b> or <b>short</b> and watch the P&L move on every fill. It lets you get comfortable, then tries to take it all back. The money is fake. What it shows about how you trade is not.</p>' +
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
      if (regime === 'rug') { price = Math.max(0.4, price * rnd(0.85, 0.93)); audio.rug(); showCatalyst('rug'); }
      else { price = price * rnd(1.06, 1.16); audio.squeeze(); showCatalyst('squeeze'); }
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
    if (now - lastCandle >= CANDLE_MS) { lastCandle = now; closeCandle(c, now); candles.push({ o: price, h: price, l: price, c: price, e9: ema9, e20: ema20, vwap: vwap }); if (candles.length > 90) candles.shift(); }

    // skip spike ticks for max-favorable/adverse: a 1-tick sweep is an untradeable wick,
    // so it must not masquerade as a level the player "gave back" or "got caught" at.
    if (pos && !isSpike) { var u = pos.dir * pos.shares * (price - pos.entry); if (u < pos.maxAdverse) pos.maxAdverse = u; if (u > pos.maxFav) pos.maxFav = u; }

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
      if (side === 'bid') showCatalyst('rug', 'Bid pulled. That support was a spoof.');
      else showCatalyst('squeeze', 'Offer pulled. That wall was fake.');
      audio.news();
    } else {
      showCatalyst('tape', side === 'bid' ? 'Buyers stacking the bid' : 'Seller leaning on the ask');
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
    later(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 2600);
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
    var rec = { dir: pos.dir, avgEntry: pos.entry, exit: price, shares: pos.shares, lots: pos.lots, pnl: pnl, heldMs: held, regimeAtEntry: pos.regimeAtEntry, extAtEntry: pos.extAtEntry, maxAdverse: pos.maxAdverse, maxFav: pos.maxFav, addsAgainst: pos.addsAgainst, revenge: since < 2000, win: pnl > 0 };
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
    track('diagnostic_complete', { archetype: an.id, grade: an.grade, net: Math.round(net), trades: trades.length, buys: buyCount, scenario: scenario.id });
    renderResult(an, net);
  }

  // Read the trade log into flags → archetype + the 3 most damaging tells.
  // Direction-aware + outcome-aware: a clean WINNING short is not a "chase".
  // Diagnosis is read from PROCESS, not P&L. A green run built on averaging down and
  // overtrading is not a Sniper and does not grade A — it got bailed out by variance.
  // A clean run that finished red is still disciplined. The net only CAPS the grade in
  // both directions; it never buys a good one. (Ed, 2026-06-19: a bag-holding, averaging-
  // down, 13-order run was crowned Sniper A+ because it happened to finish green.)
  function analyze(net) {
    var chases = [], bags = [], snatches = [], revenges = [], degen = [], wins = 0;
    var addsAgainstTotal = 0, ranWinners = 0, cutFast = 0, letRunLosers = 0;
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      // A chase = bought EXTENDED and ate a REAL reversal (a loss, not a quick managed cut).
      // Buying the top and WINNING is breakout trading, not chasing — winners and small cuts
      // never count. (Ed, 2026-06-19: a 10W-1L, +$5,288, PF 29.7 run was branded The Chaser
      // off one extended entry, because winners with normal heat were flagged "caught".)
      var extended = t.extAtEntry > 0.13;
      if (extended && t.pnl <= -300) chases.push(t);
      if ((t.addsAgainst >= 1 && t.pnl < 0) || (t.pnl <= -400 && t.maxAdverse <= -400)) bags.push(t);
      if (t.lots >= 4 && t.pnl <= -900) degen.push(t);
      if (t.win && t.pnl < 120 && t.heldMs < 2200 && t.maxFav > t.pnl + 220) snatches.push(t);
      if (t.revenge) revenges.push(t);
      addsAgainstTotal += t.addsAgainst || 0;
      if (t.win) { wins++; if (t.pnl >= 250 && t.pnl >= t.maxFav * 0.6) ranWinners++; }       // let it run
      else { if (t.maxAdverse >= -250 && t.pnl >= -250) cutFast++; else if (t.maxAdverse <= -450) letRunLosers++; }
    }
    var n = trades.length;
    var bagsHadAdds = false; for (i = 0; i < bags.length; i++) if (bags[i].addsAgainst >= 1) bagsHadAdds = true;

    // ── Discipline score (0–100), PROCESS only — the spine of both grade and archetype.
    var pen = 0;
    pen += addsAgainstTotal * 16;                          // averaging down — the cardinal sin
    pen += bags.length * 22;                               // held / fed a loser
    pen += degen.length * 30;                              // full-send blow-up
    pen += chases.length * 12;                             // chased an extended move and got caught
    pen += revenges.length * 16;                           // re-entered on tilt
    pen += snatches.length * 9;                            // paper-handed a winner
    pen += Math.max(0, letRunLosers - bags.length) * 10;   // let a red bleed (not already a bag)
    if (buyCount >= 12) pen += 12;
    if (buyCount >= 16) pen += 8;
    if (n === 0) pen += 52;                                // never pulled the trigger
    var cred = Math.min(12, ranWinners * 4 + cutFast * 2);
    var disc = Math.max(0, Math.min(100, 100 - pen + cred));
    var hardSin = degen.length >= 1 || addsAgainstTotal >= 2 || bagsHadAdds || revenges.length >= 2;

    // ── Archetype — the dominant PATTERN, never P&L. A single slip (one failed breakout,
    // one quick-cut loss) is a TELL, not your identity; the savage labels need a real
    // pattern. Sniper is the DEFAULT for a run that traded well (high discipline, no
    // loser-holding, no chronic leak) — buying the top and winning is breakout trading.
    var counts = {
      fomo: chases.length >= 2 ? chases.length : 0,          // chasing must be a pattern, not one failed breakout
      holding: bags.length + (letRunLosers > 0 ? 1 : 0),     // holding/bleeding a loser counts even once
      paper: snatches.length >= 2 ? snatches.length : 0,
      overtrade: buyCount >= 14 ? 2 : 0,
      tilt: revenges.length >= 2 ? revenges.length : 0,
      freeze: buyCount === 0 ? 3 : (n === 1 && net <= 0 && buyCount <= 1 ? 2 : 0),
      press: degen.length
    };
    var PRIORITY = ['press', 'tilt', 'holding', 'fomo', 'overtrade', 'paper', 'freeze'];
    var dom = null, domVal = 0;
    for (var p = 0; p < PRIORITY.length; p++) { var k = PRIORITY[p]; if (counts[k] > domVal) { domVal = counts[k]; dom = k; } }

    var MAP = { fomo: 'chaser', holding: 'bagholder', paper: 'paperhands', overtrade: 'masher', tilt: 'revenge', freeze: 'freezer', press: 'degenerate' };
    // Sniper = traded well overall. A failed breakout you cut, or heavy-but-skilled activity,
    // does NOT disqualify the flex (the discipline score already accounts for it). Holding or
    // bleeding a loser DOES — a Sniper cuts. Discipline governs; one slip never defines you.
    var cleanSniper = n >= 1 && disc >= 78 && !hardSin && bags.length === 0 && letRunLosers === 0 && degen.length === 0 && snatches.length < 2;
    var id;
    if (n === 0) id = 'freezer';
    else if (degen.length) id = 'degenerate';   // a full-send blow-up IS the identity
    else if (cleanSniper) id = 'sniper';         // traded well overall → Sniper, slips become tells
    else if (dom) id = MAP[dom];
    else if (bags.length || letRunLosers) id = 'bagholder';
    else if (snatches.length) id = 'paperhands';
    else if (buyCount >= 12) id = 'masher';
    else id = 'sniper';                          // discipline dipped but no nameable leak → still a Sniper

    // The grade can never out-rank the diagnosis: a NAMED sin caps the flex at B, a HARD
    // sin (averaging down / full send) caps at C. Only a clean Sniper run reaches A/A+.
    var sinId = id !== 'sniper' && id !== 'freezer';
    var capGrade = hardSin ? 'C' : (sinId ? 'B' : null);
    var grade = gradeFor(disc, net, capGrade);

    // dominant direction of the chase trades (for the right roast/tag)
    var chaseDir = 1; if (chases.length) { var ls = 0, ss = 0; for (i = 0; i < chases.length; i++) chases[i].dir === 1 ? ls++ : ss++; chaseDir = ss > ls ? -1 : 1; }

    // summary metrics for the result card. avgWin/avgLoss = the size lesson (are your
    // winners bigger than your losers?); worstHeat = the deepest unrealized drawdown you
    // sat through (the risk you actually carried). Plain-English, no jargon — replaces PF.
    var losses = n - wins, best = 0, worst = 0, gWin = 0, gLoss = 0, worstHeat = 0;
    for (i = 0; i < trades.length; i++) { var pn = trades[i].pnl; if (pn > best) best = pn; if (pn < worst) worst = pn; if (pn >= 0) gWin += pn; else gLoss += -pn; if (trades[i].maxAdverse < worstHeat) worstHeat = trades[i].maxAdverse; }
    var stats = { n: n, wins: wins, losses: losses, winRate: n ? Math.round(wins / n * 100) : 0,
      best: best, worst: worst, worstHeat: worstHeat,
      avgWin: wins ? gWin / wins : 0, avgLoss: losses ? gLoss / losses : 0 };

    // honest one-liner that reconciles the grade with the P&L so a green-but-graded-low
    // (or red-but-graded-well) card reads as a lesson, not a bug.
    var verdict = '';
    if (net <= -3000) verdict = 'Two minutes and the account took real damage. The grade is the habit, not the unlucky tape.';
    else if (sinId && net > 400 && disc < 55) verdict = 'You finished green, but on variance, not process. This is exactly how a good day hands it all back.';
    else if (id === 'sniper' && net < -200) verdict = 'Red on the day, but the process was clean. That is variance, not a flaw, and it is what prints over a month.';

    var tells = [];
    if (bags.length) { var b = bags[0];
      if (b.addsAgainst >= 1) tells.push({ w: 5, t: 'You averaged down ' + b.addsAgainst + 'x to save a loser. It still cost you ' + money(-b.pnl) + '.' });
      else tells.push({ w: 4, t: 'You let a red bleed to ' + money(b.maxAdverse) + ' before you finally cut it at ' + money(b.pnl) + '.' });
    }
    if (degen.length) { var d = degen[0]; tells.push({ w: 5, t: 'You loaded ' + d.lots + ' times into one trade and it went ' + money(d.pnl) + '. No plan, full send.' }); }
    if (chases.length && id !== 'sniper') tells.push({ w: 3, t: (chaseDir === 1 ? 'You bought ' + sym + ' into a pump and ate the reversal' : 'You shorted ' + sym + ' into the hole and got squeezed') + (chases.length > 1 ? ' (' + chases.length + 'x)' : '') + '.' });
    if (revenges.length) tells.push({ w: 4, t: 'You re-entered within two seconds of a loss. That is tilt, not a setup.' });
    // Snatch is a Paper-Hands tell; it CONTRADICTS the Sniper ("let winners run"), so it
    // never shows on a Sniper card. A lone give-back on a clean run is not a confession.
    if (snatches.length >= 2 && id !== 'sniper') { var s = snatches[0]; tells.push({ w: 2, t: 'You snatched winners early. One booked ' + money(s.pnl) + ' with ' + money(s.maxFav) + ' on the table.' }); }
    if (buyCount >= 12 && id !== 'sniper') tells.push({ w: 2, t: 'You fired ' + buyCount + ' orders in two minutes. Most of that was fees.' });
    if (buyCount === 0) tells.push({ w: 3, t: 'You never put a dollar at risk. The whole move happened without you.' });
    tells.sort(function (a, b) { return b.w - a.w; });

    return { id: id, grade: grade, disc: disc, verdict: verdict, trades: n, wins: wins, dir: chaseDir, stats: stats, tells: tells.slice(0, 3).map(function (x) { return x.t; }) };
  }
  // Grade is the discipline score; net + behavior only CAP it (a red finish can't be the
  // A+ flex; a hard sin or a real blow-up can't grade above C, however the P&L landed).
  function gradeFor(disc, net, capGrade) {
    var g = disc >= 92 ? 'A+' : disc >= 82 ? 'A' : disc >= 70 ? 'B' : disc >= 55 ? 'C' : disc >= 38 ? 'D' : disc >= 22 ? 'D−' : 'F';
    var order = ['F', 'D−', 'D', 'C', 'B', 'A', 'A+'];
    function cap(maxG) { if (order.indexOf(g) > order.indexOf(maxG)) g = maxG; }
    if (net < -200) cap('A');     // a losing run is not the A+ flex
    if (capGrade) cap(capGrade);  // held/averaged a loser or full-send — P&L can't buy it back
    if (net <= -3000) cap('C');   // a real blow-up carries a lesson, however you got there
    return g;
  }
  // % of traders who did BETTER than you — a humbling social mirror (high = you did poorly,
  // stay humble). The curve is harsh so most undisciplined runs land high, but a genuine
  // Sniper still earns a low number, so the metric stays honest and isn't rigged to insult.
  function pctDidBetter(disc) {
    if (disc >= 95) return 3; if (disc >= 88) return 9; if (disc >= 80) return 18;
    if (disc >= 72) return 33; if (disc >= 64) return 50; if (disc >= 56) return 65;
    if (disc >= 48) return 76; if (disc >= 40) return 84; if (disc >= 30) return 90;
    if (disc >= 20) return 94; return 97;
  }

  function renderResult(an, net) {
    var a = ARCH[an.id], st = an.stats;
    var discCls = an.disc >= 70 ? 'up' : (an.disc < 45 ? 'down' : '');
    var didBetter = pctDidBetter(an.disc);
    var dbCls = didBetter >= 60 ? 'down' : (didBetter <= 25 ? 'up' : '');
    var verdictHtml = an.verdict ? '<div class="diag-verdict">' + an.verdict + '</div>' : '';
    var roast = (an.id === 'chaser' && an.dir === -1 && a.roastS) ? a.roastS : a.roast;
    var tag = (an.id === 'chaser' && an.dir === -1 && a.tagS) ? a.tagS : a.tag;
    var tellsHtml = an.tells.length
      ? '<div class="diag-tells"><div class="diag-tells-h">Your tells</div>' + an.tells.map(function (t) { return '<div class="diag-tell">' + t + '</div>'; }).join('') + '</div>'
      : '<div class="diag-tells"><div class="diag-tells-h">Your tells</div><div class="diag-tell">Nothing to confess. You took the right side, cut your losers, and walked. Rare.</div></div>';
    var url = 'https://maketzo.co/trader-type';
    var shareText = (net >= 0 ? 'I finished ' + money(net) + ' green' : 'I lost ' + money(-net)) + ' in two minutes on MAKETZO and got branded ' + a.name + ' (' + an.grade + '). Can you beat it?';

    root.innerHTML =
      '<div class="diag-result diag-tier-' + a.tier + '">' +
        '<div class="diag-result-head">' +
          '<div class="diag-result-eyebrow">Two minutes later…</div>' +
          '<div class="diag-share-top" data-share></div>' +
        '</div>' +
        '<div class="diag-card slam" data-card>' +
          '<div class="diag-card-grade">' + an.grade + '</div>' +
          '<div class="diag-card-name">' + a.name + '</div>' +
          '<div class="diag-card-tag">' + tag + '</div>' +
          '<div class="diag-card-roast">' + roast + '</div>' +
          '<div class="diag-card-meta">' +
            '<div class="diag-meta-box"><span class="diag-meta-num ' + (net >= 0 ? 'up' : 'down') + '">' + money(net) + '</span><span class="diag-meta-cap">2-min P&L</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num">' + st.winRate + '%</span><span class="diag-meta-cap">win rate</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num ' + discCls + '">' + an.disc + '<span class="diag-meta-den">/100</span></span><span class="diag-meta-cap">discipline</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num ' + dbCls + '">' + didBetter + '%</span><span class="diag-meta-cap">did better than you</span></div>' +
          '</div>' +
          '<div class="diag-card-stats">' + st.n + ' trades · ' + st.wins + 'W ' + st.losses + 'L · avg win +' + money(st.avgWin) + ' · avg loss ' + money(-st.avgLoss) + ' · worst heat held ' + money(st.worstHeat) + '</div>' +
          '<div class="diag-card-wm">MAKETZO · protect your capital · maketzo.co</div>' +
        '</div>' +
        verdictHtml +
        tellsHtml +
        '<div class="diag-funnel">' +
          '<p class="diag-funnel-line">That’s two minutes of fake money showing you a real habit. <strong>MAKETZO is the gym that fixes it.</strong></p>' +
          '<a class="diag-cta" href="/app" data-cta>Train it free →</a>' +
          '<div class="diag-funnel-sub">7 days free · no charge until day 8 · cancel in one click</div>' +
        '</div>' +
        '<button class="diag-again" type="button" data-again>↺ Run the tape again</button>' +
      '</div>';
    buildShare(root.querySelector('[data-share]'), url, shareText, an.id);
    root.querySelector('[data-again]').addEventListener('click', function () { start(); });
    root.querySelector('[data-cta]').addEventListener('click', function () { track('diagnostic_cta', { archetype: an.id }); });
    audio.verdict();
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
