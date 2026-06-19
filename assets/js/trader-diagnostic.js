/*
 * MAKETZO — "What Kind of Trader Are You?" diagnostic. v1
 *
 * A free, no-login, ~60-second playable gauntlet that diagnoses your trading
 * psychology and hands you a savage, shareable archetype. Built from the Cut It
 * / Sit on Your Hands DNA but self-contained (vanilla, no app deps).
 *
 * You ACT under pressure across 8 live moments; each choice scores a "sin" axis
 * (fomo / holding / paper / overtrade / tilt / freeze / press) and moves a
 * running session P&L for stakes. The dominant sin picks your archetype; clean
 * across the board earns The Sniper. Result = archetype + discipline grade +
 * roast + your 3 tells + rarity. Funnels into the app.
 *
 * Honest comparison (Ed, 2026-06-18): rarity is a designed baseline and the
 * percentile is a transparent MODEL estimate, never fabricated people. A real
 * "N diagnosed" counter is a backend fast-follow.
 *
 * RISK-POSTURE: the game never rewards sizing up / pressing — that path leads to
 * the Degenerate roast.
 */
(function () {
  'use strict';

  var C_GOLD = '#d4af37', C_GOLD_HI = '#e5c572', C_UP = '#7ed957', C_DOWN = '#ff6b6b', C_DIM = '#8a93a3';

  // ── Audio (same tiny WebAudio synth as the in-app games) ──────────────────
  function makeAudio() {
    var ctx = null;
    function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } return ctx; }
    function tone(f, d, type, g, when) { var a = ac(); if (!a) return; var o = a.createOscillator(), gn = a.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = g; o.connect(gn); gn.connect(a.destination); o.start(a.currentTime + when); o.stop(a.currentTime + when + d); }
    return {
      unlock: function () { ac(); },
      good: function () { tone(660, 0.08, 'triangle', 0.05, 0); tone(880, 0.10, 'triangle', 0.04, 0.07); },
      bad: function () { tone(220, 0.16, 'sine', 0.05, 0); tone(150, 0.20, 'sine', 0.04, 0.10); },
      tap: function () { tone(420, 0.05, 'square', 0.03, 0); },
      tick: function () { tone(150, 0.012, 'square', 0.012, 0); },
      verdict: function () { tone(330, 0.10, 'triangle', 0.05, 0); tone(495, 0.12, 'triangle', 0.05, 0.10); tone(660, 0.18, 'triangle', 0.045, 0.22); }
    };
  }

  function ri(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function pick(arr) { return arr[ri(0, arr.length - 1)]; }
  function money(v) { v = Math.round(v); return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US'); }
  var SYMBOLS = ['NVAX', 'SOND', 'MARA', 'RIOT', 'PLUG', 'FFIE', 'TLRY', 'BBAI', 'HOLO', 'GNS', 'CENN', 'MULN', 'AITX', 'PHUN', 'DPRO', 'XELA'];

  // ── Archetypes. `rarity` is a designed baseline distribution (honest model). ──
  var ARCH = {
    sniper: { name: 'The Sniper', tier: 'a', color: C_UP, rarity: 6,
      roast: 'Patient, selective, fast to cut and slow to sell a winner. Annoyingly disciplined. The market hates you.',
      tag: 'You wait. You strike. You’re gone.' },
    revenge: { name: 'The Revenge Trader', tier: 'f', color: C_DOWN, rarity: 14,
      roast: 'You don’t trade setups, you trade your feelings. Every red candle is a personal insult you have to answer.',
      tag: 'The market took your money. Now it owns your emotions.' },
    bagholder: { name: 'The Bag Holder', tier: 'd', color: C_DOWN, rarity: 17,
      roast: 'Hope is not a stop loss. Your account is a museum of “it’ll come back,” and the gift shop is closed.',
      tag: 'Down 60% and still calling it a long-term hold.' },
    chaser: { name: 'The Chaser', tier: 'd', color: C_DOWN, rarity: 16,
      roast: 'You show up to every party right as it’s ending. Green candle, must own. Top tick, every time.',
      tag: 'Buying the exact moment the smart money sells to you.' },
    paperhands: { name: 'The Paper Hands', tier: 'c', color: C_GOLD_HI, rarity: 15,
      roast: 'You cut winners like the IRS is at the door. The ten-bagger left without you, at +8%.',
      tag: 'Green for one second, sold in half a second.' },
    masher: { name: 'The Button Masher', tier: 'd', color: C_DOWN, rarity: 13,
      roast: 'Sitting still is the one setup you’ve never taken. You don’t trade the market, you trade your boredom.',
      tag: 'Forty trades, zero edge, one tired mouse.' },
    freezer: { name: 'The Freezer', tier: 'c', color: C_GOLD_HI, rarity: 11,
      roast: 'By the time you decided, the move was gone. Twice. You’ve got a watchlist of “would’ve beens.”',
      tag: 'Perfect read. Pulled the trigger ten minutes too late.' },
    degenerate: { name: 'The Degenerate', tier: 'f', color: C_DOWN, rarity: 8,
      roast: 'This isn’t trading. It’s a casino with a charting package, and you’re the guy they comp the buffet.',
      tag: 'Max size, no stop, full send. See you in the discord.' }
  };
  var SIN_TO_ARCH = { fomo: 'chaser', holding: 'bagholder', paper: 'paperhands', overtrade: 'masher', tilt: 'revenge', freeze: 'freezer', press: 'degenerate' };
  // Tie-break priority (most damaging first) so a result is deterministic.
  var SIN_PRIORITY = ['press', 'tilt', 'holding', 'fomo', 'overtrade', 'paper', 'freeze'];

  // ── The 8 moments. Each choice scores axes, marks disciplined or the sin it
  //    reveals (for the "3 tells"), and moves the session P&L. `tell` is the
  //    one-liner shown back if you picked it. `kind` drives the visual. ───────
  var MOMENTS = [
    { id: 'open', kind: 'duo', prompt: 'The open. 9:31.',
      sub: 'A clean pullback to the EMA sits right next to a stock already up 40% and ripping. Where do you click?',
      choices: [
        { label: 'Take the pullback', sub: 'Back at support, room to run', disc: true, pnl: 220, tell: '', tone: 'good' },
        { label: 'Chase the +40% runner', sub: 'It’s moving without you', axis: { fomo: 2 }, pnl: -180, tell: 'Chased a stock already up 40% on the open.', tone: 'bad' },
        { label: 'Buy them both, why pick', sub: 'Can’t miss either', axis: { fomo: 1, overtrade: 1 }, pnl: -90, tell: 'Couldn’t pick one, so you forced both.', tone: 'bad' }
      ] },
    { id: 'bleeder', kind: 'tape-down', prompt: 'You’re long. It’s red.',
      sub: 'The tape is bleeding against you and picking up speed. You’re down −$180 and it’s still dropping.',
      choices: [
        { label: 'Cut it now', sub: 'Take the loss, move on', disc: true, pnl: -180, tell: '', tone: 'good' },
        { label: 'Hold for the bounce', sub: 'It has to come back', axis: { holding: 2 }, pnl: -460, tell: 'Held a bleeder hoping for a bounce that never came.', tone: 'bad' },
        { label: 'Average down', sub: 'Lower the cost basis', axis: { holding: 2, press: 1 }, pnl: -740, tell: 'Averaged down into a loser and doubled the damage.', tone: 'bad' }
      ] },
    { id: 'winner', kind: 'tape-up', prompt: 'You’re up +$300.',
      sub: 'The trade is working and it’s still climbing. Momentum is clean. What now?',
      choices: [
        { label: 'Let it run', sub: 'Trail it, give it room', disc: true, pnl: 520, tell: '', tone: 'good' },
        { label: 'Take the money now', sub: 'A bird in the hand', axis: { paper: 2 }, pnl: 90, tell: 'Snatched +$90 and killed a trade that ran to +$520.', tone: 'meh' },
        { label: 'Add up here', sub: 'Press the winner', axis: { press: 2 }, pnl: -120, tell: 'Pressed a winner at the top and gave it all back.', tone: 'bad' }
      ] },
    { id: 'dead', kind: 'flat', prompt: '10:45. Crickets.',
      sub: 'The tape is dead. Chop, no volume, nothing setting up. Your finger is hovering over the button.',
      choices: [
        { label: 'Sit on your hands', sub: 'No setup, no trade', disc: true, pnl: 0, tell: '', tone: 'good' },
        { label: 'Force one to stay busy', sub: 'Something’s gotta move', axis: { overtrade: 2 }, pnl: -160, tell: 'Forced a trade out of boredom on a dead tape.', tone: 'bad' },
        { label: 'Scalp the chop', sub: 'Small size, quick in-out', axis: { overtrade: 1, paper: 1 }, pnl: -70, tell: 'Scalped the chop for fees and a headache.', tone: 'bad' }
      ] },
    { id: 'revenge', kind: 'tape-down', prompt: 'Just stopped for −$400.',
      sub: 'That one stung. A mediocre setup pops up right after. The voice says: make it back, right now.',
      choices: [
        { label: 'Pass and reset', sub: 'B-setup, walk it off', disc: true, pnl: 0, tell: '', tone: 'good' },
        { label: 'Take it bigger to recover', sub: 'Size up, get it back', axis: { tilt: 2, press: 1 }, pnl: -520, tell: 'Sized up on tilt to “make back” a loss. It got worse.', tone: 'bad' },
        { label: 'Take it, normal size', sub: 'Just get back in', axis: { tilt: 1 }, pnl: -120, tell: 'Jumped into a B-setup to soothe a loss.', tone: 'bad' }
      ] },
    { id: 'trigger', kind: 'trigger', prompt: 'A real breakout. Now.',
      sub: 'Clean level, volume confirms, it’s going. The window is open for a heartbeat.',
      choices: [
        { label: 'Hit it', sub: 'Decisive, in at the break', disc: true, pnl: 380, tell: '', tone: 'good', fast: true },
        { label: 'Wait for it to confirm more', sub: 'Just one more candle', axis: { freeze: 2 }, pnl: 40, tell: 'Waited for “one more candle” and got a worse fill.', tone: 'meh' },
        { label: 'Talk yourself out of it', sub: 'What if it fails', axis: { freeze: 2 }, pnl: 0, tell: 'Talked yourself out of a clean breakout. It ran without you.', tone: 'bad' }
      ] },
    { id: 'press', kind: 'tape-up', prompt: 'Up +$1,200 on the day.',
      sub: 'Great morning. You’re sharp, you’re hot, and a little voice says: this is the day, go bigger.',
      choices: [
        { label: 'Bank it, keep your size', sub: 'Protect the morning', disc: true, pnl: 120, tell: '', tone: 'good' },
        { label: 'Press, double your size', sub: 'Strike while hot', axis: { press: 2 }, pnl: -680, tell: 'Doubled size on a hot streak and gave the morning back.', tone: 'bad' },
        { label: 'Keep going, one more', sub: 'Don’t stop now', axis: { overtrade: 1, press: 1 }, pnl: -240, tell: 'Couldn’t stop while you were ahead.', tone: 'bad' }
      ] },
    { id: 'close', kind: 'flat', prompt: '3:55pm. You’re green.',
      sub: 'Five minutes to the bell. The day was good. The screen is still on.',
      choices: [
        { label: 'Walk away green', sub: 'End clean, log it, done', disc: true, pnl: 60, tell: '', tone: 'good' },
        { label: 'One more to round up', sub: 'Make it a round number', axis: { overtrade: 1, tilt: 1 }, pnl: -300, tell: 'Took “one more” at the close and dented a green day.', tone: 'bad' },
        { label: 'Hold overnight on a hunch', sub: 'Gut says gap up', axis: { press: 1, holding: 1 }, pnl: -420, tell: 'Held overnight on a hunch and ate the gap down.', tone: 'bad' }
      ] }
  ];

  var TOTAL = MOMENTS.length;

  // ── Engine state ───────────────────────────────────────────────────────────
  var root, audio, scores, tells, discCount, idx, pnl, started;

  function reset() {
    scores = { fomo: 0, holding: 0, paper: 0, overtrade: 0, tilt: 0, freeze: 0, press: 0 };
    tells = []; discCount = 0; idx = 0; pnl = 0; started = false;
  }

  function track(ev, data) {
    try { if (window.MKT && window.MKT.trackEvent) window.MKT.trackEvent(ev, data || {}); } catch (e) {}
  }

  // ── Intro ──────────────────────────────────────────────────────────────────
  function renderIntro() {
    root.innerHTML =
      '<div class="diag-intro">' +
        '<div class="diag-eyebrow">The 60-second tape test</div>' +
        '<h1 class="diag-h1">What kind of trader<br>are you, <em>really?</em></h1>' +
        '<p class="diag-lede">Eight live moments. You act, the tape answers. No login, no signup, no mercy. The result will sting, because it’s true.</p>' +
        '<button class="diag-start" type="button" data-start>Find out →</button>' +
        '<div class="diag-intro-note">Free · about 60 seconds · not financial advice</div>' +
      '</div>';
    root.querySelector('[data-start]').addEventListener('click', start);
  }

  function start() {
    audio.unlock(); audio.tap();
    reset(); started = true;
    track('diagnostic_start', {});
    renderMoment();
  }

  // ── A moment ───────────────────────────────────────────────────────────────
  function renderMoment() {
    var m = MOMENTS[idx];
    var prog = '';
    for (var i = 0; i < TOTAL; i++) prog += '<span class="diag-pip' + (i < idx ? ' done' : i === idx ? ' on' : '') + '"></span>';
    var choices = m.choices.map(function (c, ci) {
      return '<button class="diag-choice" type="button" data-ci="' + ci + '">' +
        '<span class="diag-choice-label">' + c.label + '</span>' +
        '<span class="diag-choice-sub">' + c.sub + '</span>' +
      '</button>';
    }).join('');
    root.innerHTML =
      '<div class="diag-stage">' +
        '<div class="diag-top">' +
          '<div class="diag-pips">' + prog + '</div>' +
          '<div class="diag-pnl ' + (pnl > 0 ? 'up' : pnl < 0 ? 'down' : '') + '">P&L <b>' + money(pnl) + '</b></div>' +
        '</div>' +
        '<div class="diag-scene diag-scene--' + m.kind + '">' + sceneVisual(m.kind) + '</div>' +
        '<div class="diag-prompt">' + m.prompt + '</div>' +
        '<div class="diag-sub">' + m.sub + '</div>' +
        '<div class="diag-choices">' + choices + '</div>' +
        '<div class="diag-react" data-react>&nbsp;</div>' +
      '</div>';

    var btns = root.querySelectorAll('[data-ci]');
    for (var b = 0; b < btns.length; b++) {
      (function (btn) { btn.addEventListener('click', function () { choose(parseInt(btn.getAttribute('data-ci'), 10)); }); })(btns[b]);
    }
    animateScene(m.kind);
    audio.tick();
  }

  // Lightweight per-moment SVG scene (cohesive, no heavy canvas).
  function sceneVisual(kind) {
    var sym = pick(SYMBOLS);
    var tag = '<div class="diag-scene-sym">' + sym + '</div>';
    if (kind === 'duo') {
      return tag + '<svg class="diag-spark" viewBox="0 0 120 44" preserveAspectRatio="none">' +
        '<polyline class="dp-a" points="2,40 22,30 40,34 60,18 80,22 100,8 118,4"/>' +
        '<polyline class="dp-b" points="2,42 30,38 55,40 75,30 95,12 110,6 118,2"/></svg>';
    }
    if (kind === 'tape-down') return tag + '<svg class="diag-spark down" viewBox="0 0 120 44" preserveAspectRatio="none"><polyline class="dp-x" points="2,8 24,12 44,10 64,20 84,30 104,38 118,42"/></svg>';
    if (kind === 'tape-up') return tag + '<svg class="diag-spark up" viewBox="0 0 120 44" preserveAspectRatio="none"><polyline class="dp-x" points="2,40 24,34 44,32 64,22 84,16 104,8 118,3"/></svg>';
    if (kind === 'flat') return tag + '<svg class="diag-spark flat" viewBox="0 0 120 44" preserveAspectRatio="none"><polyline class="dp-x" points="2,24 18,21 34,26 50,22 66,25 82,21 98,26 118,23"/></svg>';
    if (kind === 'trigger') return tag + '<svg class="diag-spark trig" viewBox="0 0 120 44" preserveAspectRatio="none"><polyline class="dp-x" points="2,30 30,29 55,31 75,30 90,12 105,5 118,3"/></svg>';
    return tag;
  }
  function animateScene(kind) {
    var p = root.querySelector('.dp-x');
    if (p && p.getTotalLength) { var L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; void p.getBoundingClientRect(); p.style.transition = 'stroke-dashoffset .7s ease'; p.style.strokeDashoffset = '0'; }
  }

  function choose(ci) {
    var m = MOMENTS[idx], c = m.choices[ci];
    audio.tap();
    // score
    if (c.axis) { for (var k in c.axis) scores[k] += c.axis[k]; }
    if (c.disc) discCount++;
    if (c.tell) tells.push({ id: m.id, text: c.tell });
    pnl += (c.pnl || 0);

    // lock buttons, mark the pick, show the reaction, advance
    var btns = root.querySelectorAll('[data-ci]');
    for (var b = 0; b < btns.length; b++) { btns[b].disabled = true; if (parseInt(btns[b].getAttribute('data-ci'), 10) === ci) btns[b].classList.add('picked', c.tone === 'good' ? 'good' : c.tone === 'meh' ? 'meh' : 'bad'); }
    var pnlEl = root.querySelector('.diag-pnl'); if (pnlEl) { pnlEl.className = 'diag-pnl ' + (pnl > 0 ? 'up' : pnl < 0 ? 'down' : ''); pnlEl.innerHTML = 'P&L <b>' + money(pnl) + '</b>'; }
    var react = root.querySelector('[data-react]');
    if (react) { react.className = 'diag-react show ' + (c.tone === 'good' ? 'good' : 'bad'); react.textContent = reactLine(c); }
    if (c.tone === 'good') audio.good(); else audio.bad();

    setTimeout(function () {
      idx++;
      if (idx >= TOTAL) renderResult(); else renderMoment();
    }, 1050);
  }
  function reactLine(c) {
    if (c.tone === 'good') return '✓ ' + (c.pnl > 0 ? 'Clean. ' + money(c.pnl) : c.pnl < 0 ? 'Right call. ' + money(c.pnl) : 'Disciplined. Nothing forced.');
    if (c.tone === 'meh') return '• ' + money(c.pnl) + '. Left money on the table.';
    return '✗ ' + money(c.pnl) + '. That’s the leak.';
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  function computeArchetype() {
    var domSin = null, domVal = 0;
    for (var i = 0; i < SIN_PRIORITY.length; i++) { var s = SIN_PRIORITY[i]; if (scores[s] > domVal) { domVal = scores[s]; domSin = s; } }
    // Disciplined across the board → Sniper. Needs a clean run AND no real sin.
    if (discCount >= 6 && domVal <= 1) return 'sniper';
    if (!domSin) return 'sniper';
    return SIN_TO_ARCH[domSin];
  }
  function gradeFor() {
    // disciplined choices out of 8, nudged by P&L survival
    var d = discCount;
    if (d >= 8) return 'A+'; if (d >= 7) return 'A'; if (d >= 6) return 'B+'; if (d >= 5) return 'B';
    if (d >= 4) return 'C'; if (d >= 3) return 'D+'; if (d >= 2) return 'D'; if (d >= 1) return 'D−'; return 'F';
  }
  // Honest MODEL percentile: maps disciplined-choice count to an expected
  // distribution (most real traders land mid). Not fabricated people.
  function percentile() {
    var table = [4, 9, 18, 31, 47, 64, 79, 91, 98];
    return table[Math.max(0, Math.min(8, discCount))];
  }

  function renderResult() {
    var aid = computeArchetype(), a = ARCH[aid], grade = gradeFor(), pct = percentile();
    track('diagnostic_complete', { archetype: aid, grade: grade, discipline: discCount, pnl: pnl });

    var top3 = tells.slice(0, 3);
    var tellsHtml = top3.length
      ? '<div class="diag-tells"><div class="diag-tells-h">Your tells</div>' + top3.map(function (t) { return '<div class="diag-tell">' + t.text + '</div>'; }).join('') + '</div>'
      : '<div class="diag-tells"><div class="diag-tells-h">Your tells</div><div class="diag-tell">Nothing to confess. You did the boring, profitable thing every time.</div></div>';

    // v1 shares the generic page (archetype is in the share text). Per-archetype
    // share URLs (/t/<aid>) with their own OG cards are the next follow-up.
    var resultUrl = 'https://maketzo.co/what-trader';
    var shareText = 'I’m ' + a.name + ' on MAKETZO’s trader test (' + grade + '). What are you?';

    root.innerHTML =
      '<div class="diag-result diag-tier-' + a.tier + '">' +
        '<div class="diag-result-eyebrow">The tape says you’re…</div>' +
        '<div class="diag-card" data-card>' +
          '<div class="diag-card-grade">' + grade + '</div>' +
          '<div class="diag-card-name">' + a.name + '</div>' +
          '<div class="diag-card-tag">' + a.tag + '</div>' +
          '<div class="diag-card-roast">' + a.roast + '</div>' +
          '<div class="diag-card-meta">' +
            '<div class="diag-meta-box"><span class="diag-meta-num">' + a.rarity + '%</span><span class="diag-meta-cap">get this result</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num">' + pct + '%</span><span class="diag-meta-cap">less disciplined than you</span></div>' +
            '<div class="diag-meta-box"><span class="diag-meta-num ' + (pnl >= 0 ? 'up' : 'down') + '">' + money(pnl) + '</span><span class="diag-meta-cap">your session P&L</span></div>' +
          '</div>' +
          '<div class="diag-card-wm">MAKETZO · what kind of trader are you · maketzo.co</div>' +
        '</div>' +
        tellsHtml +
        '<div class="diag-share" data-share></div>' +
        '<div class="diag-funnel">' +
          '<p class="diag-funnel-line">This is the trader the market is betting against. <strong>MAKETZO is the gym that fixes it.</strong></p>' +
          '<a class="diag-cta" href="/app" data-cta>Train it free →</a>' +
          '<div class="diag-funnel-sub">7 days free · no charge until day 8 · cancel in one click</div>' +
        '</div>' +
        '<button class="diag-again" type="button" data-again>↺ Play again</button>' +
      '</div>';

    buildShare(root.querySelector('[data-share]'), resultUrl, shareText, aid);
    root.querySelector('[data-again]').addEventListener('click', function () { audio.tap(); start(); });
    root.querySelector('[data-cta]').addEventListener('click', function () { track('diagnostic_cta', { archetype: aid }); });
    audio.verdict();
    // slam-in
    var card = root.querySelector('[data-card]'); if (card) { card.classList.add('slam'); }
  }

  // ── Share (mirrors the .mk-share channels; shares the per-archetype URL) ────
  function buildShare(host, url, text, aid) {
    if (!host) return;
    var enc = encodeURIComponent, U = enc(url), T = enc(text);
    var links = {
      x: 'https://twitter.com/intent/tweet?text=' + T + '&url=' + U,
      whatsapp: 'https://wa.me/?text=' + enc(text + ' ' + url),
      telegram: 'https://t.me/share/url?url=' + U + '&text=' + T,
      facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + U,
      sms: 'sms:?&body=' + enc(text + ' ' + url),
      email: 'mailto:?subject=' + enc('What kind of trader are you?') + '&body=' + enc(text + '\n\n' + url)
    };
    host.innerHTML =
      '<div class="diag-share-h">Drag a trader friend into this</div>' +
      '<div class="diag-share-row">' +
        sbtn('x', 'X', links.x) + sbtn('whatsapp', 'WhatsApp', links.whatsapp) + sbtn('telegram', 'Telegram', links.telegram) +
        sbtn('facebook', 'Facebook', links.facebook) + sbtn('sms', 'Text', links.sms) + sbtn('email', 'Email', links.email) +
        '<button class="diag-sbtn diag-sbtn--copy" type="button" data-copy>Copy link</button>' +
      '</div>' +
      '<div class="diag-share-toast" data-toast hidden>Link copied</div>';
    var copy = host.querySelector('[data-copy]'), toast = host.querySelector('[data-toast]');
    copy.addEventListener('click', function () {
      track('diagnostic_share', { archetype: aid, via: 'copy' });
      var done = function () { toast.hidden = false; setTimeout(function () { toast.hidden = true; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done); else done();
    });
    var aTags = host.querySelectorAll('a.diag-sbtn');
    for (var i = 0; i < aTags.length; i++) { (function (el) { el.addEventListener('click', function () { track('diagnostic_share', { archetype: aid, via: el.getAttribute('data-via') }); }); })(aTags[i]); }
    // Native share first on mobile, if available.
    if (navigator.share) {
      var row = host.querySelector('.diag-share-row');
      var nb = document.createElement('button'); nb.className = 'diag-sbtn diag-sbtn--native'; nb.type = 'button'; nb.textContent = 'Share';
      nb.addEventListener('click', function () { track('diagnostic_share', { archetype: aid, via: 'native' }); navigator.share({ title: 'What kind of trader are you?', text: text, url: url }).catch(function () {}); });
      row.insertBefore(nb, row.firstChild);
    }
  }
  function sbtn(via, label, href) { return '<a class="diag-sbtn" data-via="' + via + '" href="' + href + '" target="_blank" rel="noopener">' + label + '</a>'; }

  // ── Boot ───────────────────────────────────────────────────────────────────
  function boot() {
    root = document.getElementById('diag-root');
    if (!root) return;
    audio = makeAudio();
    reset();
    renderIntro();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
