/*
 * MAKETZO — "Can You Trade?" / "What Kind of Trader Are You?". v3 (real engine)
 *
 * A free, no-login, HARD live trading sim at /what-trader. One shared engine:
 * a live candlestick chart with an ADVERSARIAL tape (blow-off tops, fakeouts,
 * flush-and-recover, chop that bleeds), real BUY / SELL, a real position and
 * P&L, a 60-second clock. Most people lose money — that's the point, and that's
 * what makes a score worth sharing.
 *
 * Mode 1 (this file): trade it for 60s, score = your net P&L; your archetype is
 * read from how you ACTUALLY traded (chasing tops, holding losers, snatching
 * winners, overtrading the chop, revenge-buying after a loss, freezing).
 * Modes 2 (gauntlet) and 3 (survival) reuse this engine.
 *
 * RISK-POSTURE: the sim never tells you to size up; reckless trading just earns
 * the Degenerate roast. Not financial advice (a behavioral sim).
 *
 * NOTE: difficulty/feel is tuned live on dev with Ed. Numbers here are a start.
 */
(function () {
  'use strict';

  var C_UP = '#7ed957', C_DOWN = '#ff6b6b', C_GOLD = '#d4af37', C_GOLD_HI = '#e5c572', C_DIM = '#7d8794';
  var SYMBOLS = ['NVAX', 'SOND', 'MARA', 'RIOT', 'PLUG', 'FFIE', 'TLRY', 'BBAI', 'HOLO', 'GNS', 'CENN', 'MULN', 'AITX', 'PHUN', 'DPRO'];

  var DURATION = 60000;       // 60-second session
  var START_BAL = 10000;
  var NOTIONAL = 4000;        // each BUY deploys ~this much
  var FEE_BPS = 0.0015;       // slippage/fee per fill (each side)
  var CANDLE_MS = 700;
  var WINDOW = 40;            // visible candles

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
      roast: 'You watched −$200 become −$900 and called it “giving it room.” Hope is not a stop loss.',
      tag: 'Down 60% and still calling it a long-term hold.' },
    paperhands: { name: 'The Paper Hands', tier: 'c', rarity: 16,
      roast: 'You cut winners like the IRS was at the door. The ten-bagger left without you, at +$40.',
      tag: 'Green for one second, sold in half a second.' },
    masher: { name: 'The Button Masher', tier: 'd', rarity: 13,
      roast: 'You traded the chop like it was a fire alarm. Forty fills, zero edge, and the broker thanks you for the fees.',
      tag: 'You don’t trade the market, you trade your boredom.' },
    revenge: { name: 'The Revenge Trader', tier: 'f', rarity: 12,
      roast: 'You lost, and instead of breathing you re-loaded a second later to “make it back.” The market owns your emotions now.',
      tag: 'You don’t trade setups, you trade your feelings.' },
    freezer: { name: 'The Freezer', tier: 'c', rarity: 9,
      roast: 'The move came, you watched it, you admired it, and you did nothing. Twice. Your watchlist is a graveyard of would-haves.',
      tag: 'Perfect read. Pulled the trigger ten minutes too late.' },
    degenerate: { name: 'The Degenerate', tier: 'f', rarity: 6,
      roast: 'No plan, no stop, full send into every candle. This isn’t trading, it’s a casino with a charting package, and you’re the buffet.',
      tag: 'Max size, no stop. See you in the discord.' }
  };

  // ── Tape regimes (the traps). drift = frac/sec, vol = frac/sqrt(sec). ──────
  var REG = {
    grind:   { drift: 0.015, vol: 0.018, min: 2600, max: 5000 },
    rip:     { drift: 0.10,  vol: 0.040, min: 1400, max: 2600 },
    blowoff: { drift: 0.22,  vol: 0.055, min: 900,  max: 1500 },
    dump:    { drift: -0.11, vol: 0.050, min: 1800, max: 3200 },
    flush:   { drift: -0.26, vol: 0.060, min: 900,  max: 1400 },
    recover: { drift: 0.11,  vol: 0.042, min: 1500, max: 2800 },
    chop:    { drift: 0.0,   vol: 0.072, min: 2800, max: 4800 }
  };
  // Transition weights are rigged to punish the naive move: chase a rip → eat a
  // blow-off + dump; panic-sell a flush → miss the recover; trade chop → bleed.
  var NEXT = {
    grind:   [['rip', .4], ['chop', .3], ['dump', .3]],
    rip:     [['blowoff', .45], ['chop', .3], ['grind', .25]],
    blowoff: [['dump', 1]],
    dump:    [['flush', .35], ['chop', .35], ['grind', .3]],
    flush:   [['recover', 1]],
    recover: [['grind', .5], ['rip', .3], ['chop', .2]],
    chop:    [['rip', .3], ['dump', .3], ['grind', .4]]
  };
  function nextRegime(cur) { var w = NEXT[cur] || NEXT.grind, r = Math.random(), acc = 0; for (var i = 0; i < w.length; i++) { acc += w[i][1]; if (r <= acc) return w[i][0]; } return w[w.length - 1][0]; }

  // ── State ──────────────────────────────────────────────────────────────────
  var root, audio, raf, timers, sym, price, candles, regime, regimeEnd, t0, lastCandle, lastTick;
  var balance, pos, trades, recentHigh, lastLossAt;
  var cv, ctx, els;

  function reset() {
    raf = 0; timers = []; sym = pick(SYMBOLS);
    // Seed a living history so the chart opens like a session already in motion.
    var p = rnd(3.2, 6.8); candles = [];
    for (var i = 0; i < WINDOW; i++) { var o = p; p = Math.max(0.5, p * (1 + rnd(-0.022, 0.024))); var c = p; candles.push({ o: o, c: c, h: Math.max(o, c) * (1 + rnd(0, 0.012)), l: Math.min(o, c) * (1 - rnd(0, 0.012)) }); }
    price = p; regime = 'grind'; regimeEnd = 0;
    balance = START_BAL; pos = null; trades = []; recentHigh = price; lastLossAt = -9999;
  }
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearAll() { if (raf) cancelAnimationFrame(raf); raf = 0; for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }
  function track(ev, data) { try { if (window.MKT && window.MKT.trackEvent) window.MKT.trackEvent(ev, data || {}); } catch (e) {} }

  function boot() { root = document.getElementById('diag-root'); if (!root) return; audio = makeAudio(); renderIntro(); }

  function renderIntro() {
    root.innerHTML =
      '<div class="diag-intro">' +
        '<div class="diag-eyebrow">The 60-second tape test</div>' +
        '<h1 class="diag-h1">Can you trade,<br><em>or do you just think so?</em></h1>' +
        '<p class="diag-lede">Sixty seconds on a live tape that fights back. Real chart, real <b>BUY</b> and <b>SELL</b>, real P&L. Most people lose money in under a minute. Find out what kind of trader you really are.</p>' +
        '<button class="diag-start" type="button" data-start>Take the tape →</button>' +
        '<div class="diag-intro-note">Free · 60 seconds · not financial advice</div>' +
      '</div>';
    root.querySelector('[data-start]').addEventListener('click', start);
  }

  function start() {
    audio.unlock(); audio.buy(); reset(); track('diagnostic_start', {});
    root.innerHTML =
      '<div class="diag-term">' +
        '<div class="diag-term-top">' +
          '<div class="diag-term-sym">' + sym + ' <span class="diag-term-px" data-px>' + px(price) + '</span></div>' +
          '<div class="diag-term-clock" data-clock>0:60</div>' +
        '</div>' +
        '<canvas class="diag-chart" data-chart></canvas>' +
        '<div class="diag-pos" data-pos><span class="diag-pos-state" data-pstate>FLAT</span><span class="diag-pos-pnl" data-upnl></span></div>' +
        '<div class="diag-term-bottom">' +
          '<div class="diag-bal">Equity <b data-equity>' + money(START_BAL) + '</b></div>' +
        '</div>' +
        '<div class="diag-trade-btns">' +
          '<button class="diag-trade-btn buy" data-buy>BUY</button>' +
          '<button class="diag-trade-btn sell" data-sell disabled>SELL</button>' +
        '</div>' +
        '<div class="diag-term-hint">Buy low, sell high. The tape will try to make you do the opposite.</div>' +
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

    // regime
    if (now >= regimeEnd) { regime = nextRegime(regime); var R0 = REG[regime]; regimeEnd = now + ri(R0.min, R0.max); }
    var R = REG[regime] || REG.grind;
    // price tick
    var drift = price * R.drift * dt;
    var noise = price * R.vol * (Math.random() * 2 - 1) * Math.sqrt(dt) * 2;
    var np = price + drift + noise;
    price = isFinite(np) ? Math.max(0.4, np) : price;
    recentHigh = Math.max(recentHigh * 0.997, price); // decaying recent high (extension gauge)

    // candle
    var c = candles[candles.length - 1]; c.c = price; if (price > c.h) c.h = price; if (price < c.l) c.l = price;
    if (now - lastCandle >= CANDLE_MS) { lastCandle = now; candles.push({ o: price, h: price, l: price, c: price }); if (candles.length > 90) candles.shift(); }

    // track max adverse on the open position
    if (pos) { var u = pos.shares * (price - pos.entry); if (u < pos.maxAdverse) pos.maxAdverse = u; if (u > pos.maxFav) pos.maxFav = u; }

    if (Math.random() < 0.2) audio.tick();
    drawChart();
    renderTerminal(elapsed);
  }

  function renderTerminal(elapsed) {
    els.px.textContent = px(price);
    var rem = Math.max(0, DURATION - elapsed), s = Math.ceil(rem / 1000);
    els.clock.textContent = '0:' + (s < 10 ? '0' : '') + s; els.clock.classList.toggle('low', rem <= 12000);
    var u = pos ? pos.shares * (price - pos.entry) : 0;
    var eq = balance + u;
    els.equity.textContent = money(eq);
    if (pos) {
      els.pos.className = 'diag-pos open ' + (u >= 0 ? 'up' : 'down');
      els.pstate.textContent = 'LONG ' + pos.shares + ' @ ' + px(pos.entry);
      els.upnl.textContent = (u >= 0 ? '+' : '') + money(u);
    } else { els.pos.className = 'diag-pos'; els.pstate.textContent = 'FLAT'; els.upnl.textContent = ''; }
  }

  function drawChart() {
    var w = cv._w, h = cv._h, pad = 8, vis = candles.slice(-WINDOW);
    ctx.clearRect(0, 0, w, h);
    var lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < vis.length; i++) { if (vis[i].l < lo) lo = vis[i].l; if (vis[i].h > hi) hi = vis[i].h; }
    if (pos) { lo = Math.min(lo, pos.entry); hi = Math.max(hi, pos.entry); }
    if (!isFinite(lo) || !isFinite(hi)) return;
    var rng = (hi - lo) || 1; lo -= rng * 0.08; hi += rng * 0.08; rng = hi - lo;
    function Y(p) { return pad + (h - 2 * pad) * (1 - (p - lo) / rng); }
    var cw = (w - 2 * pad) / WINDOW, bw = Math.max(2, cw * 0.62);
    // entry line
    if (pos) { var ey = Y(pos.entry); ctx.strokeStyle = 'rgba(212,175,55,.5)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, ey); ctx.lineTo(w, ey); ctx.stroke(); ctx.setLineDash([]); }
    // candles
    for (i = 0; i < vis.length; i++) {
      var c = vis[i], x = pad + cw * i + cw / 2, up = c.c >= c.o, col = up ? C_UP : C_DOWN;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
      var yo = Y(c.o), yc = Y(c.c), top = Math.min(yo, yc), hgt = Math.max(1.5, Math.abs(yc - yo));
      ctx.fillStyle = col; ctx.fillRect(x - bw / 2, top, bw, hgt);
    }
    // current price line
    var py = Y(price); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); ctx.setLineDash([]);
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  function doBuy() {
    if (pos) return;
    audio.buy();
    var shares = Math.max(1, Math.floor(NOTIONAL / price));
    balance -= shares * price * FEE_BPS;
    // extension gauge: how far above the recent base is price right now
    var ext = (price / (recentLow() || price)) - 1;
    pos = { entry: price, shares: shares, openAt: performance.now(), maxAdverse: 0, maxFav: 0, regimeAtEntry: regime, extAtEntry: ext };
    els.buy.disabled = true; els.sell.disabled = false;
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
      entry: pos.entry, exit: price, shares: pos.shares, pnl: grossPnl, heldMs: held,
      regimeAtEntry: pos.regimeAtEntry, extAtEntry: pos.extAtEntry, maxAdverse: pos.maxAdverse, maxFav: pos.maxFav,
      revenge: since < 1600, win: grossPnl > 0
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
    track('diagnostic_complete', { archetype: an.id, grade: an.grade, net: Math.round(net), trades: trades.length });
    renderResult(an, net);
  }

  // Read the trade log into flags → archetype + the 3 most damaging tells.
  function analyze(net) {
    var chases = [], bags = [], snatches = [], revenges = [], wins = 0;
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      if (t.regimeAtEntry === 'rip' || t.regimeAtEntry === 'blowoff' || t.extAtEntry > 0.12) chases.push(t);
      if (t.pnl <= -250 && t.maxAdverse <= -250) bags.push(t);
      if (t.win && t.pnl < 90 && t.heldMs < 1800 && t.maxFav > t.pnl + 120) snatches.push(t);
      if (t.revenge) revenges.push(t);
      if (t.win) wins++;
    }
    var n = trades.length;
    var counts = { fomo: chases.length, holding: bags.length, paper: snatches.length, overtrade: n >= 9 ? 2 : 0, tilt: revenges.length, freeze: (n <= 1) ? 2 : 0, press: 0 };
    if (chases.length >= 2 && net <= -1200) counts.press = chases.length + 1; // reckless full-send
    if (n === 0) counts.freeze = 3;

    var PRIORITY = ['press', 'tilt', 'holding', 'fomo', 'overtrade', 'paper', 'freeze'];
    var dom = null, domVal = 0;
    for (var p = 0; p < PRIORITY.length; p++) { var k = PRIORITY[p]; if (counts[k] > domVal) { domVal = counts[k]; dom = k; } }

    var grade = gradeFor(net);
    var clean = (net > 200) && domVal <= 1 && n >= 1;
    var id = clean ? 'sniper' : dom ? ({ fomo: 'chaser', holding: 'bagholder', paper: 'paperhands', overtrade: 'masher', tilt: 'revenge', freeze: 'freezer', press: 'degenerate' })[dom] : (net > 0 ? 'sniper' : 'masher');

    // tells, worst first
    var tells = [];
    if (chases.length) tells.push({ w: 3, t: 'You chased ' + sym + ' into a pump and ate the reversal' + (chases.length > 1 ? ' (' + chases.length + 'x)' : '') + '.' });
    if (bags.length) { var b = bags[0]; tells.push({ w: 4, t: 'You held a loser from ' + money(b.maxAdverse) + ' and never cut it.' }); }
    if (snatches.length) { var s = snatches[0]; tells.push({ w: 2, t: 'You sold a winner at ' + money(s.pnl) + '. It was running to ' + money(s.maxFav) + '.' }); }
    if (revenges.length) tells.push({ w: 4, t: 'You revenge-bought less than two seconds after a loss.' });
    if (n >= 9) tells.push({ w: 2, t: 'You fired ' + n + ' trades in 60 seconds. Most of that was fees.' });
    if (n === 0) tells.push({ w: 3, t: 'You never pulled the trigger. The whole move happened without you.' });
    tells.sort(function (a, b) { return b.w - a.w; });

    return { id: id, grade: grade, trades: n, wins: wins, tells: tells.slice(0, 3).map(function (x) { return x.t; }) };
  }
  function gradeFor(net) {
    if (net >= 2600) return 'A+'; if (net >= 1300) return 'A'; if (net >= 500) return 'B';
    if (net >= -150) return 'C'; if (net >= -1100) return 'D'; if (net >= -2600) return 'D−'; return 'F';
  }
  function netPercentile(net) {
    // honest model estimate: most lose. higher net = rarer.
    if (net >= 2600) return 97; if (net >= 1300) return 91; if (net >= 500) return 80;
    if (net >= -150) return 61; if (net >= -1100) return 38; if (net >= -2600) return 17; return 5;
  }

  function renderResult(an, net) {
    var a = ARCH[an.id], pct = netPercentile(net);
    var tellsHtml = an.tells.length
      ? '<div class="diag-tells"><div class="diag-tells-h">Your tells</div>' + an.tells.map(function (t) { return '<div class="diag-tell">' + t + '</div>'; }).join('') + '</div>'
      : '<div class="diag-tells"><div class="diag-tells-h">Your tells</div><div class="diag-tell">Nothing to confess. You bought weakness, sold strength, and walked. Rare.</div></div>';
    var url = 'https://maketzo.co/what-trader';
    var shareText = (net >= 0 ? 'I finished ' + money(net) + ' green' : 'I lost ' + money(-net)) + ' in 60 seconds on MAKETZO and got branded ' + a.name + ' (' + an.grade + '). Can you beat it?';

    root.innerHTML =
      '<div class="diag-result diag-tier-' + a.tier + '">' +
        '<div class="diag-result-eyebrow">60 seconds later…</div>' +
        '<div class="diag-card slam" data-card>' +
          '<div class="diag-card-grade">' + an.grade + '</div>' +
          '<div class="diag-card-name">' + a.name + '</div>' +
          '<div class="diag-card-tag">' + a.tag + '</div>' +
          '<div class="diag-card-roast">' + a.roast + '</div>' +
          '<div class="diag-card-meta">' +
            '<div class="diag-meta-box"><span class="diag-meta-num ' + (net >= 0 ? 'up' : 'down') + '">' + money(net) + '</span><span class="diag-meta-cap">your 60-second P&L</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num">' + pct + '%</span><span class="diag-meta-cap">of traders did worse</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num">' + an.trades + '</span><span class="diag-meta-cap">trades · ' + an.wins + ' green</span></div>' +
          '</div>' +
          '<div class="diag-card-wm">MAKETZO · can you trade · maketzo.co</div>' +
        '</div>' +
        tellsHtml +
        '<div class="diag-share" data-share></div>' +
        '<div class="diag-funnel">' +
          '<p class="diag-funnel-line">That’s 60 seconds of fake money showing you a real habit. <strong>MAKETZO is the gym that fixes it.</strong></p>' +
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
