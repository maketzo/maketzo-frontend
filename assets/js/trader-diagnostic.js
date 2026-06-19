/*
 * MAKETZO — "Can You Trade?" / "What Kind of Trader Are You?". v6 (chart structure)
 *
 * A free, no-login, HARD live trading sim at /what-trader. One shared engine:
 * a live candlestick chart with a SMALL-CAP tape that lures then rugs, real BUY /
 * SELL, a real position you can ADD to (average down), live P&L, a 2-minute clock.
 * Most people lose money — that's the point, and that's what makes a score worth
 * sharing.
 *
 * The arc (Ed, 2026-06-18): the tape spends the first stretch letting you get
 * comfortable (trends up, dips get bought, false confidence), then distributes,
 * then RUGS — offering-style gap-downs that do NOT recover. Holding or averaging
 * down into the back half is how you blow up. Doing nothing no longer makes money.
 *
 * Mode 1 (this file): trade it for 120s, score = your net P&L; your archetype is
 * read from how you ACTUALLY traded (chasing pumps, holding/averaging losers,
 * snatching winners, overtrading the chop, revenge-buying, freezing, full-sending).
 * Modes 2 (gauntlet) and 3 (survival) reuse this engine.
 *
 * RISK-POSTURE: the sim never tells you to size up; it just LETS you, then the
 * diagnosis punishes it (Degenerate / Bag Holder). Not financial advice.
 *
 * NOTE: difficulty/feel is tuned live on dev with Ed. Numbers here are a start.
 */
(function () {
  'use strict';

  var C_UP = '#7ed957', C_DOWN = '#ff6b6b', C_GOLD = '#d4af37', C_GOLD_HI = '#e5c572', C_DIM = '#7d8794';
  var SYMBOLS = ['NVAX', 'SOND', 'MARA', 'RIOT', 'PLUG', 'FFIE', 'TLRY', 'BBAI', 'HOLO', 'GNS', 'CENN', 'MULN', 'AITX', 'PHUN', 'DPRO'];

  var DURATION = 120000;      // 120-second session — room for the lull, then the rug
  var START_BAL = 10000;
  var NOTIONAL = 4000;        // each BUY deploys ~this much; tap again to add a lot
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

  function makeAudio() {
    var ctx = null;
    function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } return ctx; }
    function tone(f, d, type, g, when) { var a = ac(); if (!a) return; var o = a.createOscillator(), gn = a.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = g; o.connect(gn); gn.connect(a.destination); o.start(a.currentTime + when); o.stop(a.currentTime + when + d); }
    return {
      unlock: function () { ac(); },
      buy: function () { tone(520, 0.06, 'triangle', 0.05, 0); tone(720, 0.07, 'triangle', 0.04, 0.05); },
      sellWin: function () { tone(660, 0.08, 'triangle', 0.05, 0); tone(990, 0.10, 'triangle', 0.04, 0.07); },
      sellLoss: function () { tone(300, 0.10, 'sine', 0.05, 0); tone(200, 0.16, 'sine', 0.04, 0.08); },
      rug: function () { tone(220, 0.12, 'sawtooth', 0.05, 0); tone(140, 0.22, 'sawtooth', 0.05, 0.08); tone(90, 0.30, 'sine', 0.04, 0.18); },
      tick: function () { tone(140, 0.008, 'square', 0.006, 0); },
      verdict: function () { tone(330, 0.10, 'triangle', 0.05, 0); tone(495, 0.12, 'triangle', 0.05, 0.10); tone(660, 0.20, 'triangle', 0.045, 0.22); }
    };
  }

  // ── Archetypes (read from the trade log) ───────────────────────────────────
  var ARCH = {
    sniper: { name: 'The Sniper', tier: 'a', rarity: 4,
      roast: 'You bought weakness, sold strength, cut the losers and let the winners breathe. Annoyingly disciplined. The market hates you.',
      tag: 'You wait. You strike. You’re gone.' },
    chaser: { name: 'The Chaser', tier: 'd', rarity: 21,
      roast: 'You bought the top of every pump like it owed you money. You’re the exit liquidity the runners were waiting for.',
      tag: 'Green candle, must own. Top tick, every time.' },
    bagholder: { name: 'The Bag Holder', tier: 'd', rarity: 19,
      roast: 'You watched it bleed, then bought more to “lower your average.” The bag just got heavier. Hope is not a stop loss.',
      tag: 'Down 60% and still calling it a long-term hold.' },
    paperhands: { name: 'The Paper Hands', tier: 'c', rarity: 16,
      roast: 'You cut winners like the IRS was at the door. The ten-bagger left without you, at +$40.',
      tag: 'Green for one second, sold in half a second.' },
    masher: { name: 'The Button Masher', tier: 'd', rarity: 13,
      roast: 'You traded the chop like it was a fire alarm. A dozen fills, zero edge, and the broker thanks you for the fees.',
      tag: 'You don’t trade the market, you trade your boredom.' },
    revenge: { name: 'The Revenge Trader', tier: 'f', rarity: 12,
      roast: 'You lost, and instead of breathing you re-loaded a second later to “make it back.” The market owns your emotions now.',
      tag: 'You don’t trade setups, you trade your feelings.' },
    freezer: { name: 'The Freezer', tier: 'c', rarity: 9,
      roast: 'The move came, you watched it, you admired it, and you did nothing. Your watchlist is a graveyard of would-haves.',
      tag: 'Perfect read. Pulled the trigger ten minutes too late.' },
    degenerate: { name: 'The Degenerate', tier: 'f', rarity: 6,
      roast: 'No plan, no stop, full send. You kept loading until the offering hit and took the whole stack with it. A casino with a charting package, and you’re the buffet.',
      tag: 'Max size, no stop. See you in the discord.' }
  };

  // ── Tape regimes. drift = frac/sec, vol = frac/sqrt(sec). ──────────────────
  var REG = {
    grind:   { drift: 0.011,  vol: 0.024, min: 2200, max: 4200 },
    rip:     { drift: 0.075,  vol: 0.045, min: 1300, max: 2400 },
    pump:    { drift: 0.16,   vol: 0.060, min: 600,  max: 1200 },  // parabolic, brief
    dump:    { drift: -0.075, vol: 0.050, min: 1600, max: 3000 },
    bleed:   { drift: -0.030, vol: 0.040, min: 3000, max: 6000 },  // death by a thousand cuts, no bounce
    rug:     { drift: -0.30,  vol: 0.075, min: 700,  max: 1300 },  // offering / halt-down, violent
    deadcat: { drift: 0.05,   vol: 0.045, min: 1000, max: 2000 },  // weak bounce that fades
    chop:    { drift: 0.0,    vol: 0.085, min: 2600, max: 4600 }
  };

  // Phase-weighted transitions build the arc: EARLY lures (dips bought, trends up),
  // MID distributes (rips get sold, bleed starts), LATE is the rug zone (down, no
  // recovery). Sampling stays random within each phase so no two runs feel scripted.
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
  function nextRegime(cur, prog) {
    var tbl = prog < 0.4 ? NEXT_EARLY : prog < 0.72 ? NEXT_MID : NEXT_LATE;
    var w = tbl[cur] || tbl.grind, r = Math.random(), acc = 0;
    for (var i = 0; i < w.length; i++) { acc += w[i][1]; if (r <= acc) return w[i][0]; }
    return w[w.length - 1][0];
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var root, audio, raf, timers, sym, price, candles, regime, regimeEnd, t0, lastCandle, lastTick;
  var balance, pos, trades, buyCount, recentHigh, lastLossAt;
  var ema9, ema20, vwap, vwapPV, vwapVol, resistance; // chart structure overlays
  var cv, ctx, els;

  function reset() {
    raf = 0; timers = []; sym = pick(SYMBOLS);
    // Seed a living history so the chart opens like a session already in motion.
    var p = rnd(3.2, 6.8); candles = [];
    for (var i = 0; i < WINDOW; i++) { var o = p; p = Math.max(0.5, p * (1 + rnd(-0.022, 0.024))); var c = p; candles.push({ o: o, c: c, h: Math.max(o, c) * (1 + rnd(0, 0.012)), l: Math.min(o, c) * (1 - rnd(0, 0.012)) }); }
    price = p; regime = 'grind'; regimeEnd = 0;
    balance = START_BAL; pos = null; trades = []; buyCount = 0; recentHigh = price; lastLossAt = -9999;
    // Warm the EMAs over the seed history so the lines open already established.
    ema9 = candles[0].c; ema20 = candles[0].c;
    for (var j = 0; j < candles.length; j++) { var cl = candles[j].c; ema9 += K9 * (cl - ema9); ema20 += K20 * (cl - ema20); candles[j].e9 = ema9; candles[j].e20 = ema20; }
    // Session VWAP starts at the open (no seed). Resistance = an overhead level to trade up into.
    vwap = NaN; vwapPV = 0; vwapVol = 0;
    var sh = 0; for (j = 0; j < candles.length; j++) if (candles[j].h > sh) sh = candles[j].h;
    resistance = Math.max(sh, price) * rnd(1.04, 1.10);
  }
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearAll() { if (raf) cancelAnimationFrame(raf); raf = 0; for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }
  function track(ev, data) { try { if (window.MKT && window.MKT.trackEvent) window.MKT.trackEvent(ev, data || {}); } catch (e) {} }

  function boot() { root = document.getElementById('diag-root'); if (!root) return; audio = makeAudio(); renderIntro(); }

  function renderIntro() {
    root.innerHTML =
      '<div class="diag-intro">' +
        '<div class="diag-eyebrow">The two-minute tape test</div>' +
        '<h1 class="diag-h1">Can you trade,<br><em>or do you just think so?</em></h1>' +
        '<p class="diag-lede">Two minutes on a live small-cap tape that fights back. Real chart, real <b>BUY</b> and <b>SELL</b>, real P&L. It will let you get comfortable, then it will try to take it all back. Find out what kind of trader you really are.</p>' +
        '<button class="diag-start" type="button" data-start>Take the tape →</button>' +
        '<div class="diag-intro-note">Free · 2 minutes · not financial advice</div>' +
      '</div>';
    root.querySelector('[data-start]').addEventListener('click', start);
  }

  function start() {
    audio.unlock(); audio.buy(); reset(); track('diagnostic_start', {});
    root.innerHTML =
      '<div class="diag-term">' +
        '<div class="diag-term-top">' +
          '<div class="diag-term-sym">' + sym + ' <span class="diag-term-px" data-px>' + px(price) + '</span></div>' +
          '<div class="diag-term-clock" data-clock>2:00</div>' +
        '</div>' +
        '<canvas class="diag-chart" data-chart></canvas>' +
        '<div class="diag-legend">' +
          '<span class="diag-leg"><i class="diag-sw diag-sw-e9"></i>9 EMA</span>' +
          '<span class="diag-leg"><i class="diag-sw diag-sw-e20"></i>20 EMA</span>' +
          '<span class="diag-leg"><i class="diag-sw diag-sw-vwap"></i>VWAP</span>' +
          '<span class="diag-leg"><i class="diag-sw diag-sw-res"></i>Resistance</span>' +
        '</div>' +
        '<div class="diag-pos" data-pos><span class="diag-pos-state" data-pstate>FLAT</span><span class="diag-pos-pnl" data-upnl></span></div>' +
        '<div class="diag-term-bottom">' +
          '<div class="diag-bal">Equity <b data-equity>' + money(START_BAL) + '</b></div>' +
        '</div>' +
        '<div class="diag-trade-btns">' +
          '<button class="diag-trade-btn buy" data-buy>BUY</button>' +
          '<button class="diag-trade-btn sell" data-sell disabled>SELL</button>' +
        '</div>' +
        '<div class="diag-term-hint">BUY opens or adds to your long. SELL closes the whole position.</div>' +
      '</div>';
    cv = root.querySelector('[data-chart]'); ctx = cv.getContext('2d');
    els = {
      px: root.querySelector('[data-px]'), clock: root.querySelector('[data-clock]'),
      pstate: root.querySelector('[data-pstate]'), upnl: root.querySelector('[data-upnl]'),
      equity: root.querySelector('[data-equity]'), buy: root.querySelector('[data-buy]'),
      sell: root.querySelector('[data-sell]'), pos: root.querySelector('[data-pos]')
    };
    sizeChart();
    els.buy.addEventListener('click', doBuy);
    els.sell.addEventListener('click', doSell);
    window.addEventListener('resize', sizeChart);
    t0 = performance.now(); lastCandle = t0; lastTick = t0; regimeEnd = t0 + ri(REG.grind.min, REG.grind.max);
    raf = requestAnimationFrame(loop);
  }

  function sizeChart() { if (!cv) return; var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv._w = Math.max(220, r.width); cv._h = r.height || 220; cv.width = cv._w * dpr; cv.height = cv._h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

  function loop(now) {
    var elapsed = now - t0;
    if (elapsed >= DURATION) { endGame(); return; }
    raf = requestAnimationFrame(loop);
    // Guard dt: the rAF timestamp can arrive behind our captured t0 on the first
    // frame (different time origin), which would make dt negative and sqrt(dt)
    // NaN, poisoning price and every downstream value.
    var dt = (now - lastTick) / 1000; lastTick = now;
    if (!isFinite(dt) || dt <= 0) dt = 0.016; if (dt > 0.05) dt = 0.05;

    // regime — phase-weighted by how far we are into the session
    if (now >= regimeEnd) {
      regime = nextRegime(regime, elapsed / DURATION);
      var R0 = REG[regime]; regimeEnd = now + ri(R0.min, R0.max);
      if (regime === 'rug') { price = Math.max(0.4, price * rnd(0.90, 0.965)); audio.rug(); } // offering / halt gap
      else if (regime === 'pump') { price = price * rnd(1.0, 1.035); }
    }
    var R = REG[regime] || REG.grind;
    // price tick
    var drift = price * R.drift * dt;
    var noise = price * R.vol * (Math.random() * 2 - 1) * Math.sqrt(dt) * 2;
    var np = price + drift + noise;
    price = isFinite(np) ? Math.max(0.4, np) : price;
    recentHigh = Math.max(recentHigh * 0.997, price); // decaying recent high (extension gauge)

    // candle
    var c = candles[candles.length - 1]; c.c = price; if (price > c.h) c.h = price; if (price < c.l) c.l = price;
    if (now - lastCandle >= CANDLE_MS) { lastCandle = now; closeCandle(c, now); candles.push({ o: price, h: price, l: price, c: price, e9: ema9, e20: ema20, vwap: vwap }); if (candles.length > 90) candles.shift(); }

    // track max adverse / favorable on the open position
    if (pos) { var u = pos.shares * (price - pos.entry); if (u < pos.maxAdverse) pos.maxAdverse = u; if (u > pos.maxFav) pos.maxFav = u; }

    if (Math.random() < 0.2) audio.tick();
    drawChart();
    renderTerminal(elapsed);
  }

  function renderTerminal(elapsed) {
    els.px.textContent = px(price);
    var rem = Math.max(0, DURATION - elapsed), s = Math.ceil(rem / 1000), mm = Math.floor(s / 60), ss = s % 60;
    els.clock.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss; els.clock.classList.toggle('low', rem <= 15000);
    var u = pos ? pos.shares * (price - pos.entry) : 0;
    var eq = balance + u;
    els.equity.textContent = money(eq);
    if (pos) {
      els.pos.className = 'diag-pos open ' + (u >= 0 ? 'up' : 'down');
      els.pstate.textContent = 'LONG ' + pos.shares + (pos.lots > 1 ? ' · ' + pos.lots + 'x' : '') + ' @ ' + px(pos.entry);
      els.upnl.textContent = (u >= 0 ? '+' : '') + money(u);
    } else { els.pos.className = 'diag-pos'; els.pstate.textContent = 'FLAT'; els.upnl.textContent = ''; }
  }

  // On each candle close: advance the EMAs, the session VWAP (synthetic small-cap
  // volume, heavier on pumps/rugs), and the resistance level the long trades up into.
  function closeCandle(c, now) {
    ema9 += K9 * (c.c - ema9); ema20 += K20 * (c.c - ema20); c.e9 = ema9; c.e20 = ema20;
    var rangePct = Math.abs(c.c - c.o) / (c.o || 1);
    var volMult = (regime === 'pump' || regime === 'rug') ? 2.6 : (regime === 'rip' || regime === 'dump') ? 1.6 : 1;
    var vol = (800 + Math.random() * 600) * volMult * (1 + rangePct * 8);
    var tp = (c.h + c.l + c.c) / 3;
    vwapPV += tp * vol; vwapVol += vol; vwap = vwapVol > 0 ? vwapPV / vwapVol : c.c; c.vwap = vwap;
    // A decisive close above resistance lets it run (ceiling lifts). A stall just under
    // it in strength often gets sold — that rejection is what gives the long real R/R.
    if (price > resistance * 1.015) { resistance = price * rnd(1.05, 1.09); }
    else if (price > resistance * 0.99 && (regime === 'rip' || regime === 'pump') && Math.random() < 0.45) { regime = 'dump'; regimeEnd = now + ri(REG.dump.min, REG.dump.max); }
    else if (price < resistance * 0.85) { var rh = 0, vl = candles.slice(-20); for (var z = 0; z < vl.length; z++) if (vl[z].h > rh) rh = vl[z].h; resistance = Math.max(rh, price * 1.03) * rnd(1.0, 1.02); }
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
    function poly(key, color, dash) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(dash || []);
      ctx.beginPath(); var started = false;
      for (var j = 0; j < vis.length; j++) { var v = vis[j][key]; if (v == null || !isFinite(v)) continue; var x = pad + cw * j + cw / 2, y = Y(v); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // entry line (blended average)
    if (pos) { var ey = Y(pos.entry); ctx.strokeStyle = 'rgba(212,175,55,.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, ey); ctx.lineTo(w, ey); ctx.stroke(); ctx.setLineDash([]); }
    // candles
    for (i = 0; i < vis.length; i++) {
      var c = vis[i], x = pad + cw * i + cw / 2, up = c.c >= c.o, col = up ? C_UP : C_DOWN;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
      var yo = Y(c.o), yc = Y(c.c), top = Math.min(yo, yc), hgt = Math.max(1.5, Math.abs(yc - yo));
      ctx.fillStyle = col; ctx.fillRect(x - bw / 2, top, bw, hgt);
    }
    // structure overlays: VWAP (dotted orange), 20 EMA (light blue), 9 EMA (white)
    poly('vwap', 'rgba(255,159,67,.95)', [2, 3]);
    poly('e20', 'rgba(127,180,255,.9)');
    poly('e9', 'rgba(255,255,255,.92)');
    // resistance
    if (resVis && resistance >= lo) { var ry = Y(resistance); ctx.strokeStyle = 'rgba(255,122,176,.7)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(w, ry); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,122,176,.95)'; ctx.font = '9px "DM Mono", monospace'; ctx.fillText('RES', 5, ry - 4); }
    // current price line
    var py = Y(price); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); ctx.setLineDash([]);
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  function doBuy() {
    if (pos && pos.lots >= MAXLOTS) { flash(els.buy, 'buy'); return; }
    audio.buy();
    var addShares = Math.max(1, Math.floor(NOTIONAL / price));
    balance -= addShares * price * FEE_BPS;
    buyCount++;
    if (!pos) {
      var ext = (price / (recentLow() || price)) - 1; // extension above the recent base at first entry
      pos = { entry: price, shares: addShares, lots: 1, openAt: performance.now(), maxAdverse: 0, maxFav: 0, regimeAtEntry: regime, extAtEntry: ext, addsBelow: 0 };
    } else {
      if (price < pos.entry) pos.addsBelow++; // adding under your average = averaging down (the sin)
      var tot = pos.shares + addShares;
      pos.entry = (pos.shares * pos.entry + addShares * price) / tot;
      pos.shares = tot; pos.lots++;
    }
    els.sell.disabled = false;
    els.buy.disabled = pos.lots >= MAXLOTS;
    flash(els.buy, 'buy');
  }
  function recentLow() { var lo = Infinity, v = candles.slice(-14); for (var i = 0; i < v.length; i++) if (v[i].l < lo) lo = v[i].l; return lo === Infinity ? price : lo; }

  function doSell() {
    if (!pos) return;
    var held = performance.now() - pos.openAt;
    var grossPnl = pos.shares * (price - pos.entry);
    balance += grossPnl - pos.shares * price * FEE_BPS;
    var since = performance.now() - lastLossAt;
    trades.push({
      avgEntry: pos.entry, exit: price, shares: pos.shares, lots: pos.lots, pnl: grossPnl, heldMs: held,
      regimeAtEntry: pos.regimeAtEntry, extAtEntry: pos.extAtEntry, maxAdverse: pos.maxAdverse, maxFav: pos.maxFav,
      addsBelow: pos.addsBelow, revenge: since < 2000, win: grossPnl > 0
    });
    if (grossPnl < 0) { lastLossAt = performance.now(); audio.sellLoss(); } else audio.sellWin();
    flash(els.sell, grossPnl >= 0 ? 'win' : 'loss');
    pos = null; els.buy.disabled = false; els.sell.disabled = true;
  }
  function flash(btn, kind) { btn.classList.add('flash-' + kind); later(function () { btn.classList.remove('flash-' + kind); }, 220); }

  // ── End + scoring ──────────────────────────────────────────────────────────
  function endGame() {
    clearAll(); window.removeEventListener('resize', sizeChart);
    if (pos) doSell(); // close at market; a deep-red close is its own tell
    var net = balance - START_BAL;
    var an = analyze(net);
    track('diagnostic_complete', { archetype: an.id, grade: an.grade, net: Math.round(net), trades: trades.length, buys: buyCount });
    renderResult(an, net);
  }

  // Read the trade log into flags → archetype + the 3 most damaging tells.
  function analyze(net) {
    var chases = [], bags = [], snatches = [], revenges = [], degen = [], wins = 0;
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      if (t.regimeAtEntry === 'rip' || t.regimeAtEntry === 'pump' || t.extAtEntry > 0.12) chases.push(t);
      if ((t.addsBelow >= 1 && t.pnl < 0) || (t.pnl <= -400 && t.maxAdverse <= -400)) bags.push(t);
      if (t.lots >= 4 && t.pnl <= -900) degen.push(t);
      if (t.win && t.pnl < 120 && t.heldMs < 2200 && t.maxFav > t.pnl + 220) snatches.push(t);
      if (t.revenge) revenges.push(t);
      if (t.win) wins++;
    }
    var n = trades.length;
    var counts = { fomo: chases.length, holding: bags.length, paper: snatches.length, overtrade: buyCount >= 12 ? 2 : 0, tilt: revenges.length, freeze: buyCount === 0 ? 3 : (n === 1 && net <= 0 && buyCount <= 1 ? 2 : 0), press: degen.length };
    // averaging down hard into a deep loss is the Degenerate signature even at fewer lots
    if (!degen.length) { for (var j = 0; j < bags.length; j++) { if (bags[j].addsBelow >= 2 && net <= -1500) { counts.press = Math.max(counts.press, 2); break; } } }

    var PRIORITY = ['press', 'tilt', 'holding', 'fomo', 'overtrade', 'paper', 'freeze'];
    var dom = null, domVal = 0;
    for (var p = 0; p < PRIORITY.length; p++) { var k = PRIORITY[p]; if (counts[k] > domVal) { domVal = counts[k]; dom = k; } }

    var grade = gradeFor(net);
    var clean = (net > 300) && domVal <= 1 && n >= 1 && !bags.length;
    var id = clean ? 'sniper' : dom ? ({ fomo: 'chaser', holding: 'bagholder', paper: 'paperhands', overtrade: 'masher', tilt: 'revenge', freeze: 'freezer', press: 'degenerate' })[dom] : (net > 0 ? 'sniper' : 'masher');

    // tells, worst first
    var tells = [];
    if (bags.length) { var b = bags[0];
      if (b.addsBelow >= 1) tells.push({ w: 5, t: 'You averaged down into a loser ' + b.addsBelow + 'x. The bag only got heavier.' });
      else tells.push({ w: 4, t: 'You held a loser from ' + money(b.maxAdverse) + ' and never cut it.' });
    }
    if (degen.length) { var d = degen[0]; tells.push({ w: 5, t: 'You loaded ' + d.lots + ' times into one trade and it went ' + money(d.pnl) + '. No plan, full send.' }); }
    if (chases.length) tells.push({ w: 3, t: 'You bought ' + sym + ' into a pump and ate the reversal' + (chases.length > 1 ? ' (' + chases.length + 'x)' : '') + '.' });
    if (revenges.length) tells.push({ w: 4, t: 'You re-bought within two seconds of a loss. That is tilt, not a setup.' });
    if (snatches.length) { var s = snatches[0]; tells.push({ w: 2, t: 'You snatched a winner at ' + money(s.pnl) + '. It was running to ' + money(s.maxFav) + '.' }); }
    if (buyCount >= 12) tells.push({ w: 2, t: 'You fired ' + buyCount + ' buys in two minutes. Most of that was fees.' });
    if (buyCount === 0) tells.push({ w: 3, t: 'You never put a dollar at risk. The whole move happened without you.' });
    tells.sort(function (a, b) { return b.w - a.w; });

    return { id: id, grade: grade, trades: n, wins: wins, tells: tells.slice(0, 3).map(function (x) { return x.t; }) };
  }
  function gradeFor(net) {
    if (net >= 3000) return 'A+'; if (net >= 1500) return 'A'; if (net >= 500) return 'B';
    if (net >= -400) return 'C'; if (net >= -2000) return 'D'; if (net >= -4500) return 'D−'; return 'F';
  }
  function netPercentile(net) {
    // honest model estimate: most lose. higher net = rarer.
    if (net >= 3000) return 98; if (net >= 1500) return 93; if (net >= 500) return 82;
    if (net >= -400) return 60; if (net >= -2000) return 33; if (net >= -4500) return 13; return 4;
  }

  function renderResult(an, net) {
    var a = ARCH[an.id], pct = netPercentile(net);
    var tellsHtml = an.tells.length
      ? '<div class="diag-tells"><div class="diag-tells-h">Your tells</div>' + an.tells.map(function (t) { return '<div class="diag-tell">' + t + '</div>'; }).join('') + '</div>'
      : '<div class="diag-tells"><div class="diag-tells-h">Your tells</div><div class="diag-tell">Nothing to confess. You bought weakness, sold strength, and walked. Rare.</div></div>';
    var url = 'https://maketzo.co/what-trader';
    var shareText = (net >= 0 ? 'I finished ' + money(net) + ' green' : 'I lost ' + money(-net)) + ' in two minutes on MAKETZO and got branded ' + a.name + ' (' + an.grade + '). Can you beat it?';

    root.innerHTML =
      '<div class="diag-result diag-tier-' + a.tier + '">' +
        '<div class="diag-result-eyebrow">Two minutes later…</div>' +
        '<div class="diag-card slam" data-card>' +
          '<div class="diag-card-grade">' + an.grade + '</div>' +
          '<div class="diag-card-name">' + a.name + '</div>' +
          '<div class="diag-card-tag">' + a.tag + '</div>' +
          '<div class="diag-card-roast">' + a.roast + '</div>' +
          '<div class="diag-card-meta">' +
            '<div class="diag-meta-box"><span class="diag-meta-num ' + (net >= 0 ? 'up' : 'down') + '">' + money(net) + '</span><span class="diag-meta-cap">your 2-minute P&L</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num">' + pct + '%</span><span class="diag-meta-cap">of traders did worse</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num">' + an.trades + '</span><span class="diag-meta-cap">trades · ' + an.wins + ' green</span></div>' +
          '</div>' +
          '<div class="diag-card-wm">MAKETZO · can you trade · maketzo.co</div>' +
        '</div>' +
        tellsHtml +
        '<div class="diag-share" data-share></div>' +
        '<div class="diag-funnel">' +
          '<p class="diag-funnel-line">That’s two minutes of fake money showing you a real habit. <strong>MAKETZO is the gym that fixes it.</strong></p>' +
          '<a class="diag-cta" href="/app" data-cta>Train it free →</a>' +
          '<div class="diag-funnel-sub">7 days free · no charge until day 8 · cancel in one click</div>' +
        '</div>' +
        '<button class="diag-again" type="button" data-again>↺ Run the tape again</button>' +
      '</div>';
    buildShare(root.querySelector('[data-share]'), url, shareText, an.id);
    root.querySelector('[data-again]').addEventListener('click', function () { audio.buy(); start(); });
    root.querySelector('[data-cta]').addEventListener('click', function () { track('diagnostic_cta', { archetype: an.id }); });
    audio.verdict();
  }

  // ── Share ──────────────────────────────────────────────────────────────────
  function buildShare(host, url, text, aid) {
    if (!host) return;
    var enc = encodeURIComponent, U = enc(url), T = enc(text);
    function a(via, label, href) { return '<a class="diag-sbtn" data-via="' + via + '" href="' + href + '" target="_blank" rel="noopener">' + label + '</a>'; }
    host.innerHTML =
      '<div class="diag-share-h">Drag a trader friend into this</div>' +
      '<div class="diag-share-row">' +
        a('x', 'X', 'https://twitter.com/intent/tweet?text=' + T + '&url=' + U) +
        a('whatsapp', 'WhatsApp', 'https://wa.me/?text=' + enc(text + ' ' + url)) +
        a('telegram', 'Telegram', 'https://t.me/share/url?url=' + U + '&text=' + T) +
        a('facebook', 'Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + U) +
        a('sms', 'Text', 'sms:?&body=' + enc(text + ' ' + url)) +
        a('email', 'Email', 'mailto:?subject=' + enc('Can you trade?') + '&body=' + enc(text + '\n\n' + url)) +
        '<button class="diag-sbtn diag-sbtn--copy" type="button" data-copy>Copy link</button></div>' +
      '<div class="diag-share-toast" data-toast hidden>Link copied</div>';
    var copy = host.querySelector('[data-copy]'), toast = host.querySelector('[data-toast]');
    copy.addEventListener('click', function () { track('diagnostic_share', { archetype: aid, via: 'copy' }); var d = function () { toast.hidden = false; setTimeout(function () { toast.hidden = true; }, 1600); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(d, d); else d(); });
    var aTags = host.querySelectorAll('a.diag-sbtn'); for (var i = 0; i < aTags.length; i++) { (function (el) { el.addEventListener('click', function () { track('diagnostic_share', { archetype: aid, via: el.getAttribute('data-via') }); }); })(aTags[i]); }
    if (navigator.share) { var row = host.querySelector('.diag-share-row'); var nb = document.createElement('button'); nb.className = 'diag-sbtn diag-sbtn--native'; nb.type = 'button'; nb.textContent = 'Share'; nb.addEventListener('click', function () { track('diagnostic_share', { archetype: aid, via: 'native' }); navigator.share({ title: 'Can you trade?', text: text, url: url }).catch(function () {}); }); row.insertBefore(nb, row.firstChild); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
