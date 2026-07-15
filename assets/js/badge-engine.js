/*
 * badge-engine.js — MAKETZO trader badge engine.
 *
 * PURE MODULE. No DOM, no fetch, no timers, no app state, no globals but the export.
 * Takes a finished session (trade log + session facts), returns a verdict:
 * a grade, a headline badge, a shelf of secondary badges, and the tells.
 *
 * WHY IT IS ITS OWN FILE (Ed, 2026-07-15): this ships on maketzo.co/trader-type today
 * and goes into the app later. It must NOT be buried in trader-diagnostic.js and must
 * NOT be bolted onto the app.js monolith when it moves. Being pure + dependency-free
 * means the app port is a copy into maketzo-app/lib/badge-engine.js plus a build.mjs
 * JS_FILES entry and an index.html <script> tag. Zero rewrite.
 *
 * ── THE TWO RULES THAT DEFINE THIS ENGINE ────────────────────────────────────
 *
 * 1. THE BADGE IS NOT THE VERDICT. The GRADE carries the judgment (process, never
 *    P&L). The BADGE carries the fingerprint: what you actually did. That split is
 *    deliberate. A verdict that jokes is a taunt and a verdict that is wrong is
 *    infuriating; a fingerprint can be neutral, funny, or flattering without lying.
 *    Ed, 2026-07-15: "The game is excellent. The scoring is terrible... the resultant
 *    title is infuriating at points."
 *
 * 2. NO BADGE WITHOUT A RECEIPT. Every badge's check() returns the exact sentence it
 *    is claiming, or null. The card prints that sentence. Producing the evidence and
 *    firing the badge are THE SAME ACT, so a badge cannot fire without a true claim.
 *    This is an invariant, not a threshold. Threshold tuning failed seven times on
 *    this surface (v23, v25, v28, v29, v31, v36, and the bigLosses>=2 → Bag Holder
 *    defect this replaces). An invariant fails closed instead of failing insulting.
 *
 * Corollaries, learned the hard way (see memory/feedback-grade-reads-process-not-outcome):
 *   - A one-off is a TELL. The headline identity needs a PATTERN.
 *   - Every sin must exclude the SKILLED version of the same action. Buying extended
 *     and winning is breakout trading, not chasing. Cutting small after deep heat is
 *     good discipline, not bag-holding.
 *   - Separate the axes. ENTRY (timing, heat taken) is not EXIT (did you cut, how big
 *     was the realized loss) is not SIZING (did you average down). Measuring one by
 *     another's signal is what produced the wrong cards.
 *   - The flex tier is celebration only. No backhanded jabs on a card the trader earned.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // node tests
  if (root) root.MaketzoBadges = api;                                       // browser
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  // Negative money is a MINUS, never accounting parentheses (CLAUDE.md §3).
  // U+2212 to match the rest of the sim.
  function money(v) {
    v = Math.round(v); if (!isFinite(v)) v = 0;
    return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US');
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // ── Tiers ───────────────────────────────────────────────────────────────────
  // weight orders the headline. Legends outrank everything (they are the rare,
  // collectible story). Sins outrank flex because a receipted PATTERN is real
  // evidence. Style is the floor: it is what you get when there is nothing to
  // accuse you of and nothing to crown you for, which is most runs, and which is
  // exactly what the old 7-sins-and-a-saint taxonomy had no way to say.
  var TIERS = {
    legend: { weight: 100, label: 'Legendary' },
    sin:    { weight: 60,  label: 'Sin' },
    flex:   { weight: 55,  label: 'Earned' },
    style:  { weight: 10,  label: 'Style' }
  };

  // ── Signals ─────────────────────────────────────────────────────────────────
  // Derive every fact ONCE, with the axes kept apart on purpose.
  function signals(session) {
    var trades = session.trades || [];
    var net = session.net || 0;
    var buyCount = session.buyCount || 0;
    var n = trades.length;

    var s = {
      trades: trades, n: n, net: net, buyCount: buyCount,
      durationMs: session.durationMs || 120000,
      // optional session trackers. Badges guard on null, so the catalog is complete
      // and the tracker-dependent badges stay dormant until the signal lands.
      peakEquity: session.peakEquity, troughEquity: session.troughEquity,
      sessionHigh: session.sessionHigh, sessionLow: session.sessionLow,
      catalystAt: session.catalystAt, catalystDir: session.catalystDir,
      wallsRead: session.wallsRead, wallsSpoofed: session.wallsSpoofed,

      wins: 0, losses: 0,
      longs: 0, shorts: 0,
      // ENTRY axis — was the entry a bad spot?
      chases: [],      // entered extended AND ate a real reversal
      bailouts: [],    // deep heat that SURVIVED. a bad entry you got bailed out of.
      breakouts: [],   // entered extended and WON. this is skill, not a sin.
      // EXIT axis — did you cut?
      bigLosses: [],   // a big REALIZED loss. never measured by heat.
      cutFast: 0,
      snatches: [],    // paper-handed a winner
      ranWinners: 0,
      // SIZING axis — did you average down?
      bags: [],        // ACTUALLY averaged down into a loser
      addsAgainstTotal: 0,
      degen: [],       // max lots, no stop, blow-up
      // tilt
      revenges: [],
      maxLotsUsed: 0, worstHeat: 0, worstBail: null,
      grossWin: 0, grossLoss: 0, best: 0, worst: 0,
      medianHeldMs: 0, firstEntryAt: null, lastCloseAt: null, lateNet: 0
    };

    // Pre-pass: the trader's OWN average win, which sets the bar for what counts as
    // a "big" loss below. Two passes so the threshold is self-normalizing.
    var pw = 0, pwN = 0;
    for (var q = 0; q < n; q++) if (trades[q].win) { pw += trades[q].pnl; pwN++; }
    var avgWinPre = pwN ? pw / pwN : 0;
    // A loss is a LEAK when it is big relative to YOUR OWN winners, not against a flat
    // dollar figure. Ed's run, 2026-07-15: two −$600 losses against +$873 average wins
    // cost 40 discipline points and dropped a genuinely good run out of the flex. A
    // $600 loss is not a leak when your winners are bigger than your losers; that is
    // just variance. An absolute threshold punishes SIZE instead of sloppiness, which
    // is the same category error that produced the misattribution bugs. Floor $500 so
    // a scalper with tiny wins is still held to a real bar; ceiling $1,500 so one
    // monster win cannot license a genuinely uncut loss.
    s.bigLossBar = Math.max(500, Math.min(avgWinPre * 1.5, 1500));

    var held = [];
    for (var i = 0; i < n; i++) {
      var t = trades[i];
      var extended = t.extAtEntry > 0.13;

      // A chase = entered EXTENDED and ate a REAL reversal. Winners and quick managed
      // cuts NEVER count: buying the top and winning is breakout trading.
      if (extended && t.pnl <= -300) s.chases.push(t);
      else if (extended && t.win) s.breakouts.push(t);

      // A bag = you ACTUALLY averaged down into a loser. Not "you took a big loss".
      if (t.addsAgainst >= 1 && t.pnl < 0) s.bags.push(t);
      s.addsAgainstTotal += t.addsAgainst || 0;
      if (t.lots >= 4 && t.pnl <= -900) s.degen.push(t);
      if (t.revenge) s.revenges.push(t);
      if (t.lots > s.maxLotsUsed) s.maxLotsUsed = t.lots;

      if (t.win) {
        s.wins++; s.grossWin += t.pnl;
        if (t.pnl >= 250 && t.pnl >= t.maxFav * 0.6) s.ranWinners++;
        if (t.pnl < 120 && t.heldMs < 2200 && t.maxFav > t.pnl + 220) s.snatches.push(t);
      } else {
        s.losses++; s.grossLoss += -t.pnl;
        // CUT DISCIPLINE is the REALIZED loss, never the heat. Cutting small after a
        // scary drawdown is GOOD. Only a big realized loss is the "did not cut" leak.
        if (t.pnl >= -250) s.cutFast++;
        else if (t.pnl <= -s.bigLossBar) s.bigLosses.push(t);
      }
      // Deep heat that SURVIVED = a bad ENTRY you got bailed out of. An entry signal,
      // NOT bag-holding. Kept on its own axis so it can never elect The Bag Holder.
      if (t.maxAdverse <= -600 && t.pnl >= -250) {
        s.bailouts.push(t);
        if (!s.worstBail || t.maxAdverse < s.worstBail.maxAdverse) s.worstBail = t;
      }
      if (t.dir === 1) s.longs++; else s.shorts++;
      if (t.pnl > s.best) s.best = t.pnl;
      if (t.pnl < s.worst) s.worst = t.pnl;
      if (t.maxAdverse < s.worstHeat) s.worstHeat = t.maxAdverse;
      held.push(t.heldMs);

      if (t.openAt != null) {
        if (s.firstEntryAt == null || t.openAt < s.firstEntryAt) s.firstEntryAt = t.openAt;
      }
      if (t.closeAt != null) {
        if (s.lastCloseAt == null || t.closeAt > s.lastCloseAt) s.lastCloseAt = t.closeAt;
        if (t.closeAt >= s.durationMs - 30000) s.lateNet += t.pnl;
      }
    }

    held.sort(function (a, b) { return a - b; });
    s.medianHeldMs = held.length ? held[Math.floor(held.length / 2)] : 0;
    s.winRate = n ? Math.round(s.wins / n * 100) : 0;
    s.avgWin = s.wins ? s.grossWin / s.wins : 0;
    s.avgLoss = s.losses ? s.grossLoss / s.losses : 0;
    s.badEntries = s.chases.length + s.bailouts.length;
    s.bagsHadAdds = s.bags.length > 0;
    // A hard sin is a SIZING or TILT failure, the two that actually blow accounts.
    s.hardSin = s.degen.length >= 1 || s.addsAgainstTotal >= 2 || s.bagsHadAdds || s.revenges.length >= 2;
    s.disc = discipline(s);
    return s;
  }

  // ── Discipline (0–100) — PROCESS only. The spine of the grade. Never P&L. ────
  function discipline(s) {
    var pen = 0;
    pen += s.addsAgainstTotal * 16;               // averaging down, the cardinal sin
    pen += s.bags.length * 22;                    // fed a loser
    pen += s.degen.length * 30;                   // full-send blow-up
    pen += s.chases.length * 12;                  // chased and got caught
    pen += s.revenges.length * 16;                // re-entered on tilt
    pen += s.snatches.length * 9;                 // paper-handed a winner
    // ONE big realized loss is a slip. A PATTERN of not cutting is a leak.
    var bigN = Math.max(0, s.bigLosses.length - s.bags.length);
    pen += bigN > 0 ? 12 + (bigN - 1) * 28 : 0;
    // ...but a slip that is a MULTIPLE of your own bar is not a slip. A flat 12 points
    // meant "bought the offering, lost $2,400 against $300 average wins" still graded B,
    // which is the reward-garbage-behavior complaint all over again. Scale by severity
    // so the size of the hole matters, capped so one bad trade cannot alone bottom you out.
    if (bigN > 0) {
      var worstBig = 0;
      for (var w = 0; w < s.bigLosses.length; w++) if (s.bigLosses[w].pnl < worstBig) worstBig = s.bigLosses[w].pnl;
      pen += Math.min(24, Math.max(0, ((-worstBig / s.bigLossBar) - 1) * 10));
    }
    pen += s.bailouts.length * 7;                 // bad entry, bailed out. risky, not a read.
    if (s.buyCount >= 14) pen += 12;              // genuine overtrading (12-13 is just active)
    if (s.buyCount >= 20) pen += 8;
    if (s.n === 0) pen += 52;                     // never pulled the trigger
    var cred = Math.min(12, s.ranWinners * 4 + s.cutFast * 2);
    return Math.max(0, Math.min(100, 100 - pen + cred));
  }

  // ── Grade — the verdict, and the ONLY verdict. ───────────────────────────────
  // Discipline sets it. P&L and behavior only CAP it, in both directions. P&L never
  // buys a good one: a green run built on averaging down is not an A.
  function gradeFor(s) {
    var d = s.disc, net = s.net;
    var g = d >= 92 ? 'A+' : d >= 82 ? 'A' : d >= 70 ? 'B' : d >= 55 ? 'C' : d >= 38 ? 'D' : d >= 22 ? 'D−' : 'F';
    var order = ['F', 'D−', 'D', 'C', 'B', 'A', 'A+'];
    function cap(maxG) { if (order.indexOf(g) > order.indexOf(maxG)) g = maxG; }

    // A+ has to be EARNED, not merely un-sinned. Discipline starts at 100 and only
    // falls, so a thin run where nothing bad happened scores 100 by default: a 4-trade
    // net −$170 coin flip was grading A+. Avoiding sin is not the same as showing edge,
    // and a free A+ makes the flex worthless (Ed's original rejection: "anyone could
    // get 91%... not shareable"). A clean red run can still be an A. It cannot be the top.
    if (net <= 0) cap('A');
    if (s.hardSin) cap('C');                      // sizing/tilt failure. P&L can't buy it back.
    else if (s.bigLosses.length >= 1 || s.bailouts.length >= 2) cap('B');
    else if (s.bailouts.length >= 1) cap('A');    // one hot ride only costs the A+
    if (net <= -3000) cap('C');                   // a real blow-up carries a lesson
    return g;
  }

  // ── The catalog ─────────────────────────────────────────────────────────────
  // check(s) returns THE RECEIPT (the sentence being claimed) or null. If it cannot
  // print a true sentence, the badge cannot fire. Read every check as: "what would
  // I have to be able to say out loud to call this trader that?"
  //
  // `reads` documents which session tracker a badge depends on beyond the trade log.
  // All of them are wired in trader-diagnostic.js. The null-guards in those checks
  // STAY: they are what lets a host that cannot supply a tracker (the app port, a
  // future mode) drop the badge silently instead of firing it on undefined.
  var CATALOG = [

    // ══ LEGEND — rare, collectible, "how did you even" ═══════════════════════
    {
      id: 'perfect-game', name: 'Perfect Game', tier: 'legend', weight: 30,
      tagline: 'Not one red print. Not one scare.',
      check: function (s) {
        if (s.n < 3 || s.losses > 0 || s.worstHeat < -200) return null;
        return plural(s.n, 'trade', 'trades') + ', ' + plural(s.n, 'winner', 'winners') +
          ', and the worst heat you took all session was ' + money(s.worstHeat) + '.';
      }
    },
    {
      id: 'the-nuke', name: 'The Nuke', tier: 'legend', weight: 28, accuses: true,
      tagline: 'Two minutes. Gone.',
      pitch: 'That was fake money. MAKETZO exists so the real version never happens.',
      check: function (s) {
        if (s.net > -8000) return null;
        return 'You lost ' + money(-s.net) + ' in two minutes. That is most of the account.';
      }
    },
    {
      id: 'the-comeback', name: 'The Comeback', tier: 'legend', weight: 26,
      tagline: 'Down and out, then not.',
      reads: 'troughEquity',
      check: function (s) {
        if (s.troughEquity == null || s.net <= 0) return null;
        if (s.troughEquity > -3000) return null;
        // negate: troughEquity is negative, and "down −$3,600" is a double negative.
        return 'You were down ' + money(-s.troughEquity) + ' and finished ' + money(s.net) + ' green.';
      }
    },
    {
      id: 'bought-the-offering', name: 'Bought the Offering', tier: 'legend', weight: 25, accuses: true,
      tagline: 'They rang the bell. You raised your hand.',
      pitch: 'News hits and the hand moves before the brain does. MAKETZO trains the pause.',
      reads: 'catalystAt',
      check: function (s) {
        if (s.catalystAt == null || s.catalystDir !== 'rug') return null;
        for (var i = 0; i < s.n; i++) {
          var t = s.trades[i];
          if (t.openAt == null || t.dir !== 1) continue;
          if (t.openAt >= s.catalystAt - 1500 && t.openAt <= s.catalystAt + 2500 && t.pnl < 0) {
            return 'The offering hit and you bought it. That trade cost you ' + money(-t.pnl) + '.';
          }
        }
        return null;
      }
    },
    {
      id: 'diamond-hands', name: 'Diamond Hands', tier: 'legend', weight: 22,
      tagline: 'One position. The whole tape. No flinch.',
      check: function (s) {
        if (s.n !== 1) return null;
        var t = s.trades[0];
        if (t.heldMs < s.durationMs * 0.8) return null;
        return 'One trade, held ' + Math.round(t.heldMs / 1000) + ' seconds, start to finish, for ' +
          (t.pnl >= 0 ? '+' : '') + money(t.pnl) + '.';
      }
    },
    {
      id: 'untouched', name: 'Untouched', tier: 'legend', weight: 20,
      tagline: 'Never underwater. Not once.',
      check: function (s) {
        if (s.n < 3 || s.worstHeat < -50) return null;
        return plural(s.n, 'trade', 'trades') + ' and you never went underwater on a single one.';
      }
    },

    // ══ SIN — savage, earned, receipt mandatory ══════════════════════════════
    // Every one of these needs a PATTERN plus evidence. This is where the seven
    // misattribution bugs lived. Read the receipts as the spec.
    {
      id: 'degenerate', name: 'The Degenerate', tier: 'sin', weight: 20,
      tagline: 'Max size, no stop, until it is gone.',
      pitch: 'No plan, no stop, full send. MAKETZO makes you name the plan before the open, not during the trade.',
      check: function (s) {
        if (!s.degen.length) return null;
        var d = s.degen[0];
        return 'You loaded ' + plural(d.lots, 'time', 'times') + ' into one trade and it went ' +
          money(d.pnl) + '. No plan, full send.';
      }
    },
    {
      id: 'bagholder', name: 'The Bag Holder', tier: 'sin', weight: 19,
      tagline: 'Underwater and still calling it conviction.',
      pitch: 'Averaging down is the habit that ends accounts. MAKETZO flags the second entry, before the bag gets heavy.',
      // THE FIX. This is the badge that has misfired more than any other. It now
      // requires what its NAME means: you averaged down into a loser and it cost you.
      // Two cut losses can no longer elect it. One big loss cannot elect it. The old
      // `bigLosses.length >= 2` door is gone, and so is the roast that told a trader
      // who cut at −$31 that he "held, and held, waiting for green".
      check: function (s) {
        var worst = null;
        for (var i = 0; i < s.bags.length; i++) {
          var b = s.bags[i];
          if (b.addsAgainst >= 2 || (b.addsAgainst >= 1 && b.pnl <= -500)) {
            if (!worst || b.pnl < worst.pnl) worst = b;
          }
        }
        if (!worst) return null;
        return 'You averaged down ' + worst.addsAgainst + 'x into a loser and rode it to ' +
          money(worst.pnl) + '. Hope is not a stop loss.';
      }
    },
    {
      id: 'revenge', name: 'The Revenge Trader', tier: 'sin', weight: 18,
      tagline: 'You do not trade setups, you trade your feelings.',
      pitch: 'The trade after a loss is the one that costs the most. MAKETZO puts a hand on your shoulder there.',
      check: function (s) {
        if (s.revenges.length < 2) return null;   // one fast re-entry is a tell, not an identity
        return 'You re-entered within two seconds of a loss ' + plural(s.revenges.length, 'time', 'times') +
          '. That is tilt picking your trades, not you.';
      }
    },
    {
      id: 'martingale', name: 'The Martingale', tier: 'sin', weight: 17,
      tagline: 'Double it. That always works.',
      pitch: 'Sizing up after a loss is the fastest way to a bad week. MAKETZO catches the pattern early.',
      check: function (s) {
        var ups = 0;
        for (var i = 1; i < s.n; i++) {
          if (!s.trades[i - 1].win && s.trades[i].lots > s.trades[i - 1].lots) ups++;
        }
        if (ups < 2) return null;
        return 'You sized UP after a loss ' + plural(ups, 'time', 'times') + '. That is not a system, that is a casino.';
      }
    },
    {
      id: 'roundtripper', name: 'The Roundtripper', tier: 'sin', weight: 16,
      tagline: 'You had it. You gave it back.',
      pitch: 'Giving back a green day is a habit, not luck. MAKETZO sees the giveback starting and says so.',
      reads: 'peakEquity',
      check: function (s) {
        if (s.peakEquity == null || s.peakEquity < 1500) return null;
        if (s.net > s.peakEquity * 0.35) return null;
        return 'You were up ' + money(s.peakEquity) + ' and finished at ' +
          (s.net >= 0 ? '+' : '') + money(s.net) + '. You gave back ' + money(s.peakEquity - s.net) + '.';
      }
    },
    {
      id: 'chaser', name: 'The Chaser', tier: 'sin', weight: 15,
      tagline: 'Green candle, must own. Top tick, every time.',
      pitch: 'Your entries are the leak, not your reads. MAKETZO shows you the setups you chased, the morning after, when you can see them straight.',
      // Needs a PATTERN of extended entries that ate REAL reversals. A won breakout is
      // never counted (that is The Breakout Trader). One slip is a tell.
      check: function (s) {
        if (s.chases.length < 2) return null;
        var longs = 0; for (var i = 0; i < s.chases.length; i++) if (s.chases[i].dir === 1) longs++;
        var isLong = longs >= s.chases.length / 2;
        var cost = 0; for (i = 0; i < s.chases.length; i++) cost += -s.chases[i].pnl;
        return (isLong ? 'You bought into an extended move ' : 'You shorted into an extended move ') +
          plural(s.chases.length, 'time', 'times') + ' and ate the reversal every time. It cost you ' +
          money(cost) + '.';
      }
    },
    {
      id: 'exit-liquidity', name: 'Exit Liquidity', tier: 'sin', weight: 14,
      tagline: 'The runners were waiting for you.',
      pitch: 'Buying the top is a timing habit you can actually fix. MAKETZO shows you where you clicked, once the emotion has drained out.',
      reads: 'sessionHigh',
      check: function (s) {
        if (s.sessionHigh == null) return null;
        for (var i = 0; i < s.n; i++) {
          var t = s.trades[i];
          if (t.dir !== 1 || t.pnl >= 0) continue;
          if (t.avgEntry >= s.sessionHigh * 0.995) {
            return 'You bought within a hair of the high of the session. It cost you ' + money(-t.pnl) + '.';
          }
        }
        return null;
      }
    },
    {
      id: 'the-hero', name: 'The Hero', tier: 'sin', weight: 13,
      tagline: 'Shorting a squeeze is not a thesis.',
      pitch: 'Fighting a move and adding to it is how accounts end. MAKETZO flags the add, not the opinion.',
      check: function (s) {
        for (var i = 0; i < s.n; i++) {
          var t = s.trades[i];
          if (t.dir === -1 && t.addsAgainst >= 1 && t.pnl <= -400) {
            return 'You shorted a move that was going up, then added to it. It cost you ' + money(-t.pnl) + '.';
          }
        }
        return null;
      }
    },
    {
      id: 'the-spoofed', name: 'The Spoofed', tier: 'sin', weight: 12,
      tagline: 'The wall was never there.',
      pitch: 'The book lies. Reading it well takes reps, and reps are what MAKETZO is for.',
      reads: 'wallsSpoofed',
      check: function (s) {
        if (!s.wallsSpoofed) return null;
        return 'You traded off a wall that pulled ' + plural(s.wallsSpoofed, 'time', 'times') +
          '. Size on the book is an advertisement, not a promise.';
      }
    },
    {
      id: 'masher', name: 'The Button Masher', tier: 'sin', weight: 11,
      tagline: 'You do not trade the market, you trade your boredom.',
      pitch: 'Most of those fills were boredom, not edge. MAKETZO counts them, and counting is what makes you stop.',
      check: function (s) {
        if (s.buyCount < 14 || s.net > 400) return null;   // busy AND it did not work
        return 'You fired ' + plural(s.buyCount, 'order', 'orders') + ' in two minutes to finish ' +
          (s.net >= 0 ? '+' : '') + money(s.net) + '. Most of that was fees.';
      }
    },
    {
      id: 'paperhands', name: 'The Paper Hands', tier: 'sin', weight: 10,
      tagline: 'Green for one second, sold in half a second.',
      pitch: 'Tiny wins cannot survive real losses. MAKETZO tracks what you left on the table, so the pattern stops being invisible.',
      check: function (s) {
        if (s.snatches.length < 2) return null;
        var left = 0; for (var i = 0; i < s.snatches.length; i++) left += s.snatches[i].maxFav - s.snatches[i].pnl;
        return 'You snatched ' + plural(s.snatches.length, 'winner', 'winners') + ' early and left about ' +
          money(left) + ' on the table.';
      }
    },
    {
      id: 'the-donor', name: 'The Donor', tier: 'sin', weight: 9,
      tagline: 'No survivors.',
      pitch: 'Every trade red is a process problem, not a luck problem. MAKETZO finds which part.',
      check: function (s) {
        if (s.n < 3 || s.wins > 0) return null;
        return plural(s.n, 'trade', 'trades') + ', ' + plural(s.n, 'loss', 'losses') +
          '. The tape took every single one.';
      }
    },

    // ══ FLEX — earned. Celebration only, never a backhanded jab. ═════════════
    // Only evaluated when NO sin fired. The flex is reserved for clean process.
    //
    // WEIGHTS ARE DELIBERATELY INVERTED vs what you would first write: The Sniper is
    // the LOWEST-weighted flex, not the highest. It is the fallback for "traded well
    // but did nothing you could tell a story about". The specific, rare badges outrank
    // it, because "you were already short when the floor fell out" is the card you hang
    // your hat on and The Sniper is the participation trophy of good runs. Written the
    // obvious way round, The Sniper headlined every single good card and buried Rug
    // Rider, Ice Water and The Closer on the shelf. Same rule as the style floor:
    // SPECIFIC BEATS GENERIC.
    {
      id: 'sniper', name: 'The Sniper', tier: 'flex', weight: 6,
      tagline: 'You wait. You strike. You are gone.',
      check: function (s) {
        if (s.n < 1 || s.disc < 78 || s.net < 0) return null;
        if (s.bigLosses.length > 1 || s.badEntries > 2) return null;
        return 'You took the right side, cut the losers fast and let the winners run, for ' +
          money(s.net) + '. Most traders never run it this clean.';
      }
    },
    {
      id: 'the-surgeon', name: 'The Surgeon', tier: 'flex', weight: 13,
      tagline: 'Nothing bled.',
      check: function (s) {
        if (s.losses < 2 || s.bigLosses.length || s.disc < 70) return null;
        if (s.avgLoss > 250) return null;
        return 'You took ' + plural(s.losses, 'loss', 'losses') + ' and your average one was ' +
          money(-s.avgLoss) + '. That is the whole skill.';
      }
    },
    {
      id: 'small-ball', name: 'Small Ball', tier: 'flex', weight: 12,
      tagline: 'Base hits. All day.',
      check: function (s) {
        if (s.n < 4 || s.net <= 0 || s.disc < 72) return null;
        if (s.avgWin > 600 || s.maxLotsUsed > 2) return null;
        return plural(s.n, 'trade', 'trades') + ', none of them heroic, ' + money(s.net) + ' green. ' +
          'That is the boring way, and the boring way compounds.';
      }
    },
    {
      id: 'one-shot', name: 'One Shot, One Kill', tier: 'flex', weight: 15,
      tagline: 'You only needed the one.',
      check: function (s) {
        if (s.n !== 1) return null;
        var t = s.trades[0];
        if (!t.win || t.pnl < 400) return null;
        return 'One trade. ' + money(t.pnl) + '. Then you stopped, which is the hard part.';
      }
    },
    {
      id: 'the-closer', name: 'The Closer', tier: 'flex', weight: 17,
      tagline: 'You showed up when it counted.',
      reads: 'closeAt',
      check: function (s) {
        if (s.lastCloseAt == null || s.net <= 0 || s.lateNet < 500) return null;
        if (s.lateNet < s.net * 0.6) return null;
        return money(s.lateNet) + ' of your money came in the last 30 seconds, when the tape was at its worst.';
      }
    },
    {
      id: 'the-patient', name: 'The Patient', tier: 'flex', weight: 16,
      tagline: 'You let the lure go by.',
      reads: 'openAt',
      check: function (s) {
        if (s.firstEntryAt == null || s.firstEntryAt < 60000 || s.net <= 0) return null;
        return 'You did not touch it for the first ' + Math.round(s.firstEntryAt / 1000) +
          ' seconds, then took ' + money(s.net) + '. Sitting on your hands is a position.';
      }
    },
    {
      id: 'ice-water', name: 'Ice Water', tier: 'flex', weight: 19,
      tagline: 'The alarm went off. You did not.',
      reads: 'catalystAt',
      check: function (s) {
        if (s.catalystAt == null || s.n < 2) return null;
        if (s.revenges.length || s.disc < 70) return null;
        for (var i = 0; i < s.n; i++) {
          var t = s.trades[i];
          if (t.openAt != null && t.openAt >= s.catalystAt && t.openAt <= s.catalystAt + 4000) return null;
        }
        return 'The news hit and you did not touch the button for four seconds. Everyone else did.';
      }
    },
    {
      id: 'rug-rider', name: 'Rug Rider', tier: 'flex', weight: 20,
      tagline: 'You were on the right side of the floor falling out.',
      reads: 'catalystAt',
      check: function (s) {
        if (s.catalystAt == null || s.catalystDir !== 'rug') return null;
        for (var i = 0; i < s.n; i++) {
          var t = s.trades[i];
          if (t.dir !== -1 || t.openAt == null || t.closeAt == null) continue;
          if (t.openAt < s.catalystAt && t.closeAt > s.catalystAt && t.pnl > 300) {
            return 'You were already short when the floor fell out, and it paid ' + money(t.pnl) + '.';
          }
        }
        return null;
      }
    },
    {
      id: 'the-reader', name: 'The Reader', tier: 'flex', weight: 18,
      tagline: 'You read the book, not the candles.',
      reads: 'wallsRead',
      check: function (s) {
        if (!s.wallsRead || s.wallsSpoofed || s.net <= 0) return null;
        return 'You traded off ' + plural(s.wallsRead, 'wall', 'walls') +
          ' that actually held, and never touched a spoof.';
      }
    },

    // ══ STYLE — no judgment. This is just how you traded. ════════════════════
    // The tier that did not exist, and the reason every card felt "off". Most runs
    // are neither sin nor sainthood, they are a STYLE. One of the direction badges
    // ALWAYS fires when n >= 1, so there is always a true headline to fall back on.
    {
      id: 'the-statue', name: 'The Statue', tier: 'style', weight: 9,
      tagline: 'The whole move happened without you.',
      // Fires on ANY zero-trade session so the style floor has no hole. The sim
      // flattens at the buzzer (endGame → flatten), so buyCount > 0 with no closed
      // trade cannot happen there; the second receipt is for the app port, where the
      // caller may not force-close.
      check: function (s) {
        if (s.n !== 0) return null;
        if (s.buyCount === 0) return 'Two minutes, zero clicks. You never put a dollar at risk, and you never found out.';
        return 'You put ' + plural(s.buyCount, 'order', 'orders') + ' in and never closed a single trade.';
      }
    },
    {
      id: 'breakout-trader', name: 'The Breakout Trader', tier: 'style', weight: 8,
      tagline: 'You buy strength. On purpose.',
      // The v25 lesson promoted to an identity: buying extended and WINNING is a
      // style, not a sin. This badge exists so the engine has something true to say
      // about a trader the old taxonomy could only call The Chaser.
      check: function (s) {
        if (s.breakouts.length < 2 || s.breakouts.length <= s.chases.length) return null;
        var made = 0; for (var i = 0; i < s.breakouts.length; i++) made += s.breakouts[i].pnl;
        return 'You bought into strength ' + plural(s.breakouts.length, 'time', 'times') +
          ' and it worked, for ' + money(made) + '. That is not chasing, that is a breakout trader.';
      }
    },
    {
      id: 'the-scalper', name: 'The Scalper', tier: 'style', weight: 7,
      tagline: 'In, out, next.',
      check: function (s) {
        if (s.n < 5 || s.medianHeldMs > 5000) return null;
        return plural(s.n, 'trade', 'trades') + ', typically held about ' +
          (s.medianHeldMs / 1000).toFixed(1) + ' seconds. You are not investing, you are scalping.';
      }
    },
    {
      id: 'the-sizer', name: 'The Sizer', tier: 'style', weight: 6,
      tagline: 'You brought the whole account.',
      check: function (s) {
        if (s.maxLotsUsed < 4 || s.degen.length) return null;
        return 'You went up to ' + plural(s.maxLotsUsed, 'lot', 'lots') + ' on a single trade and still managed it.';
      }
    },
    {
      id: 'the-tourist', name: 'The Tourist', tier: 'style', weight: 5,
      tagline: 'You came, you clicked, you left.',
      // The |net| gate is not decoration. Without it this fired on EVERY thin run and
      // sat on the shelf next to "One Shot, One Kill: one trade, $2,900, then you
      // stopped, which is the hard part" saying "you watched more than you traded" —
      // mocking the exact trade the headline just praised. If the run was decisive,
      // you are not a tourist. Two quiet trades is a tourist.
      check: function (s) {
        if (s.n < 1 || s.n > 2 || Math.abs(s.net) > 800) return null;
        // NET is not enough: a $3,600 round trip that lands back at +$300 is not tourism.
        // Without this, The Tourist sat on The Roundtripper's own shelf saying "you
        // watched more than you traded" about a run that swung the whole account.
        if (s.peakEquity != null && (s.peakEquity > 800 || s.troughEquity < -800)) return null;
        return plural(s.n, 'trade', 'trades') + ' in two minutes for ' + (s.net >= 0 ? '+' : '') +
          money(s.net) + '. You watched more than you traded.';
      }
    },
    {
      id: 'the-grinder', name: 'The Grinder', tier: 'style', weight: 4,
      tagline: 'A lot of work for not a lot of money.',
      check: function (s) {
        if (s.n < 6 || Math.abs(s.net) > 700) return null;
        return plural(s.n, 'trade', 'trades') + ', ' + s.wins + 'W ' + s.losses + 'L, and it all came to ' +
          (s.net >= 0 ? '+' : '') + money(s.net) + '.';
      }
    },
    // ── The floor. One of these three always fires when you traded at all. ────
    {
      id: 'the-bull', name: 'The Bull', tier: 'style', weight: 2,
      tagline: 'You only know one direction.',
      // n === 1 needs its own line: "Every one of your 1 trades was long" is broken
      // grammar, and "you never considered the other side" is not a claim you can make
      // about a single trade anyway. This is the style FLOOR, so it must stay reachable
      // at n === 1 rather than gate itself off.
      check: function (s) {
        if (s.n < 1 || s.shorts > 0) return null;
        if (s.n === 1) return 'Your one and only trade was a long.';
        return 'Every one of your ' + s.n + ' trades was long. You never once considered the other side.';
      }
    },
    {
      id: 'the-bear', name: 'The Bear', tier: 'style', weight: 2,
      tagline: 'Everything is going to zero.',
      check: function (s) {
        if (s.n < 1 || s.longs > 0) return null;
        if (s.n === 1) return 'Your one and only trade was a short.';
        return 'Every one of your ' + s.n + ' trades was short. You never once considered the other side.';
      }
    },
    {
      id: 'switch-hitter', name: 'Switch Hitter', tier: 'style', weight: 2,
      tagline: 'No allegiance. Just the tape.',
      check: function (s) {
        if (s.n < 2 || !s.longs || !s.shorts) return null;
        return 'You took ' + s.longs + ' long and ' + s.shorts + ' short. You have no side, which is the point.';
      }
    }
  ];

  // ── Tells — the one-offs. A slip is a TELL, never your name. ─────────────────
  function buildTells(s, headlineId) {
    var tells = [];
    var isFlex = headlineId && byId(headlineId).tier === 'flex';

    if (s.bags.length) {
      var b = s.bags[0];
      tells.push({ w: 5, t: 'You averaged down ' + b.addsAgainst + 'x to save a loser. It still cost you ' + money(-b.pnl) + '.' });
    }
    if (s.bigLosses.length) {
      var bl = s.bigLosses[0];
      tells.push({ w: 4, t: 'You let one loser run to ' + money(bl.pnl) + ' instead of cutting it small. That is the trade that erases a good day.' });
    }
    if (s.losses && s.wins && s.avgLoss > s.avgWin * 1.3) {
      tells.push({ w: 4, t: 'Your losers run bigger than your winners. Avg loss ' + money(-s.avgLoss) + ' vs avg win +' + money(s.avgWin) + '. One red erases the green.' });
    }
    if (s.revenges.length === 1) {
      tells.push({ w: 3, t: 'You re-entered within two seconds of a loss. Once is a flinch. Watch that it does not become a habit.' });
    }
    // A bail-out is an ENTRY tell. Suppressed on a flex card: a great run gets the
    // reward line, not a scold for the one trade that worked. Heat still shows in
    // the stat line, so the card stays honest.
    if (s.worstBail && !isFlex) {
      tells.push({ w: 3, t: 'You were down ' + money(s.worstBail.maxAdverse) + ' before getting out at ' + (s.worstBail.pnl >= 0 ? '+' : '') + money(s.worstBail.pnl) + '. You got bailed out of a bad spot, not a read.' });
    }
    if (s.chases.length === 1) {
      var c = s.chases[0];
      tells.push({ w: 2, t: (c.dir === 1 ? 'You bought one extended move and ate the reversal for ' : 'You shorted one extended move and got squeezed for ') + money(c.pnl) + '. Once is a slip.' });
    }
    if (s.snatches.length === 1 && !isFlex) {
      var sn = s.snatches[0];
      tells.push({ w: 2, t: 'You snatched a winner early. It booked ' + money(sn.pnl) + ' with ' + money(sn.maxFav) + ' on the table.' });
    }
    if (s.buyCount >= 12 && !isFlex) {
      tells.push({ w: 2, t: 'You fired ' + s.buyCount + ' orders in two minutes. Most of that was fees.' });
    }
    if (s.n === 0) {
      tells.push({ w: 3, t: 'You never put a dollar at risk. The whole move happened without you.' });
    }
    tells.sort(function (a, b) { return b.w - a.w; });
    return tells.slice(0, 3).map(function (x) { return x.t; });
  }

  // ── Verdict — reconciles the grade with the P&L when they diverge. ───────────
  function buildVerdict(s, headlineId) {
    var h = headlineId ? byId(headlineId) : null;
    if (s.net <= -3000) return 'Two minutes and the account took real damage. The grade is the habit, not the unlucky tape.';
    if (h && h.tier === 'sin' && s.net > 400 && s.disc < 55) return 'You finished green, but on variance, not process. This is exactly how a good day hands it all back.';
    if (h && (h.tier === 'flex' || h.tier === 'legend') && s.net < 0) return 'Red on the day, but the process was clean. That is variance, not a flaw, and it is what prints over a month.';
    return '';
  }

  function byId(id) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i];
    return null;
  }

  // ── Pitch — the funnel line, spoken to the leak the card just proved. ────────
  // The card has, at that exact moment, more evidence about this person's trading than
  // any ad ever will, and the old line was "That's two minutes of fake money showing you
  // a real habit" for everybody. Badges with a nameable leak carry their own `pitch`;
  // the rest fall back by tier.
  //
  // RISK-POSTURE RULE (CLAUDE.md §3): not one of these prescribes a size or a posture.
  // They name a HABIT and say MAKETZO surfaces it. Never "size down", never "trade less
  // size", never a position instruction.
  function pitchFor(badge, s) {
    if (badge && badge.pitch) return badge.pitch;
    if (!badge) return 'Two minutes of fake money, and it already found a habit. MAKETZO is where you fix it.';
    if (badge.tier === 'flex') {
      return 'That is the process, on fake money, for two minutes. Running it that clean when the money is real, every day, is the actual job. MAKETZO is how you keep score.';
    }
    if (badge.tier === 'style') {
      return s && s.n === 0
        ? 'You watched the whole thing and never put a dollar at risk. Sitting out is a decision too, and MAKETZO tracks the ones you skip.'
        : 'That is your fingerprint on two minutes of fake money. MAKETZO shows you the same pattern on the money that counts.';
    }
    return 'Two minutes of fake money, and it already found a habit. MAKETZO is where you fix it.';
  }

  // ── evaluate ────────────────────────────────────────────────────────────────
  // The whole public API. Session in, verdict out.
  function evaluate(session) {
    var s = signals(session || {});
    var grade = gradeFor(s);

    // Pass 1: legends + sins. These carry receipts and real evidence.
    var fired = [], i, b, receipt;
    for (i = 0; i < CATALOG.length; i++) {
      b = CATALOG[i];
      if (b.tier !== 'legend' && b.tier !== 'sin') continue;
      receipt = b.check(s);
      if (receipt) fired.push({ badge: b, receipt: receipt });
    }
    // `accuses` catches the legends that are accusations wearing a rare hat (The Nuke,
    // Bought the Offering). Gating on tier alone let "Bought the Offering" headline a
    // card with "The Sniper: you took the right side, cut the losers fast" on the shelf.
    var anySin = fired.some(function (f) { return f.badge.tier === 'sin' || f.badge.accuses; });

    // Pass 2: flex, ONLY if nothing accused you. The flex is for clean process.
    if (!anySin) {
      for (i = 0; i < CATALOG.length; i++) {
        b = CATALOG[i];
        if (b.tier !== 'flex') continue;
        receipt = b.check(s);
        if (receipt) fired.push({ badge: b, receipt: receipt });
      }
    }

    // Pass 3: style. Always. It is the shelf filler and the guaranteed floor.
    for (i = 0; i < CATALOG.length; i++) {
      b = CATALOG[i];
      if (b.tier !== 'style') continue;
      receipt = b.check(s);
      if (receipt) fired.push({ badge: b, receipt: receipt });
    }

    fired.sort(function (a, c) {
      var d = (TIERS[c.badge.tier].weight + c.badge.weight) - (TIERS[a.badge.tier].weight + a.badge.weight);
      return d;
    });

    var head = fired[0] || null;
    var shelf = fired.slice(1, 4);
    var headlineId = head ? head.badge.id : null;

    return {
      grade: grade,
      disc: s.disc,
      headline: head ? {
        id: head.badge.id, name: head.badge.name, tier: head.badge.tier,
        tagline: head.badge.tagline, receipt: head.receipt,
        pitch: pitchFor(head.badge, s)
      } : null,
      shelf: shelf.map(function (f) {
        return { id: f.badge.id, name: f.badge.name, tier: f.badge.tier, receipt: f.receipt };
      }),
      verdict: buildVerdict(s, headlineId),
      tells: buildTells(s, headlineId),
      stats: {
        n: s.n, wins: s.wins, losses: s.losses, winRate: s.winRate,
        best: s.best, worst: s.worst, worstHeat: s.worstHeat,
        avgWin: s.avgWin, avgLoss: s.avgLoss
      },
      // Everything the engine decided from, for tests and for the app port.
      signals: s
    };
  }

  return { evaluate: evaluate, CATALOG: CATALOG, TIERS: TIERS, _money: money, _signals: signals };
});
