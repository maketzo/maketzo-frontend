/*
 * daily.js — the Daily Challenge clock, seed, and gate.
 *
 * PURE-ish: date math + localStorage. No DOM, no fetch. Node-testable.
 *
 * THE POINT (Ed, 2026-07-15): one tape, the same for everyone, once a day. That is the
 * thing that made Wordle spread — not the squares, the fact that we all had the same
 * word. Until now every run generated a fresh random tape, which meant no two people
 * ever traded the same thing and the shared result compared nothing.
 *
 * ── THE DAY ROLLS AT MIDNIGHT NEW YORK (Ed's call) ──────────────────────────
 * Not UTC (rolls 8pm ET, so a US trader's "today" flips mid-evening), and NOT the
 * user's local midnight — that would hand two friends in different timezones DIFFERENT
 * tapes on the same calendar day, quietly destroying the only reason to compare.
 * A "trading day" is an ET concept and this is a US day-trading product.
 *
 * DST is handled by Intl, not by arithmetic. Never do `utcHours - 5`: that is wrong for
 * ~8 months of the year and would silently roll the day an hour early or late.
 *
 * ── THE LOCK IS SOFT, ON PURPOSE ────────────────────────────────────────────
 * localStorage only. Incognito or clearing storage bypasses it, and there is no way to
 * fix that without a login — which is exactly what this page refuses to ask for. Wordle
 * had the identical property and it never mattered: the lock is a RITUAL, not DRM. The
 * people who cheat it are not the people who were going to share it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaketzoDaily = api;
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var KEY = 'mkt_tt_daily_v1';
  var TZ = 'America/New_York';
  // Day #1. The tape for a given day is a pure function of its date, so this only names
  // the challenge; it never changes what anyone trades.
  var EPOCH = '2026-07-15';

  // ── The ET calendar day ─────────────────────────────────────────────────────
  // en-CA formats as YYYY-MM-DD, which sorts and parses cleanly. Intl does the DST work.
  function dayKey(now) {
    var d = now ? new Date(now) : new Date();
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(d);
    } catch (e) {
      // Intl or the tz database missing (ancient browser). Fall back to UTC rather than
      // to local: every fallback user still agrees with every other fallback user.
      return d.toISOString().slice(0, 10);
    }
  }

  // Days between two YYYY-MM-DD keys. Parsed as UTC midnight so DST cannot make a day
  // 23 or 25 hours long and round the wrong way.
  function daysBetween(fromKey, toKey) {
    var a = Date.parse(fromKey + 'T00:00:00Z'), b = Date.parse(toKey + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 86400000);
  }

  // Clamped at 1. A user whose system clock is set to 2019 would otherwise be greeted by
  // "Daily Challenge #-2400", and the number is a label, not a source of truth.
  function dayNumber(now) { return Math.max(1, daysBetween(EPOCH, dayKey(now)) + 1); }

  // ── The seed ────────────────────────────────────────────────────────────────
  // FNV-1a over the date string. Any stable hash works; what matters is that the same
  // date always produces the same seed on every machine, forever.
  function seedFor(key) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function seedForToday(now) { return seedFor(dayKey(now)); }

  // ── Time left on today's challenge ──────────────────────────────────────────
  // Read the ET wall clock and subtract. Good enough for a countdown; the GATE is the
  // date key, never this number, so a DST day being 23/25h long cannot let anyone in early.
  function msUntilNextDay(now) {
    var d = now ? new Date(now) : new Date();
    var h = 0, m = 0, s = 0;
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(d);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'hour') h = parseInt(parts[i].value, 10) % 24;
        else if (parts[i].type === 'minute') m = parseInt(parts[i].value, 10);
        else if (parts[i].type === 'second') s = parseInt(parts[i].value, 10);
      }
    } catch (e) { h = d.getUTCHours(); m = d.getUTCMinutes(); s = d.getUTCSeconds(); }
    var into = ((h * 60 + m) * 60 + s) * 1000;
    var left = 86400000 - into;
    return left <= 0 ? 86400000 : left;
  }

  function countdownText(now) {
    var ms = msUntilNextDay(now);
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return h + 'h ' + m + 'm';
    var s = Math.floor((ms % 60000) / 1000);
    return m + 'm ' + s + 's';
  }

  // ── Storage (best-effort, same discipline as badge-vault) ───────────────────
  function store() {
    try {
      var s = (typeof localStorage !== 'undefined') ? localStorage : null;
      if (!s) return null;
      s.setItem('__mkt_d', '1'); s.removeItem('__mkt_d');
      return s;
    } catch (e) { return null; }
  }
  function read() {
    var s = store(); if (!s) return null;
    try {
      var raw = s.getItem(KEY); if (!raw) return blank();
      var v = JSON.parse(raw);
      if (!v || typeof v !== 'object') return blank();
      v.plays = (v.plays && typeof v.plays === 'object') ? v.plays : {};
      v.streak = +v.streak || 0;
      v.best = +v.best || 0;
      return v;
    } catch (e) { return blank(); }
  }
  function blank() { return { plays: {}, streak: 0, best: 0, lastKey: null }; }
  function write(v) { var s = store(); if (!s) return false; try { s.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /** Has today's challenge already been played? Unknown storage => NOT played (fail open: never lock someone out because their browser blocks storage). */
  function playedToday(now) {
    var v = read(); if (!v) return false;
    return !!v.plays[dayKey(now)];
  }
  function resultToday(now) {
    var v = read(); if (!v) return null;
    return v.plays[dayKey(now)] || null;
  }

  /**
   * Bank a finished daily. Idempotent per day: replaying (or bypassing the gate) can
   * never overwrite the first result, so the score you share is the score you got.
   */
  function recordPlay(result, now) {
    var v = read(); if (!v) return { supported: false, streak: 0, day: dayNumber(now) };
    var k = dayKey(now);
    if (!v.plays[k]) {
      var yk = shiftKey(k, -1);
      // A streak survives only if yesterday was played. Any gap resets to 1.
      v.streak = (v.lastKey === yk) ? (v.streak + 1) : 1;
      v.lastKey = k;
      if (v.streak > v.best) v.best = v.streak;
      v.plays[k] = {
        day: dayNumber(now),
        grade: result && result.grade,
        badge: result && result.headline && result.headline.id,
        name: result && result.headline && result.headline.name,
        net: result && result.signals ? Math.round(result.signals.net) : 0,
        disc: result && result.disc
      };
      prune(v);
      write(v);
    }
    return { supported: true, streak: v.streak, best: v.best, day: v.plays[k].day };
  }

  function shiftKey(key, days) {
    var t = Date.parse(key + 'T00:00:00Z');
    if (isNaN(t)) return key;
    return new Date(t + days * 86400000).toISOString().slice(0, 10);
  }

  // Keep the last 400 days. Unbounded growth in localStorage eventually throws
  // QuotaExceeded, and a silent write failure would look like a broken streak.
  function prune(v) {
    var keys = Object.keys(v.plays).sort();
    while (keys.length > 400) { delete v.plays[keys.shift()]; }
  }

  function stats(now) {
    var v = read();
    if (!v) return { supported: false, streak: 0, best: 0, played: 0, playedToday: false, day: dayNumber(now) };
    return {
      supported: true, streak: v.streak, best: v.best,
      played: Object.keys(v.plays).length,
      playedToday: !!v.plays[dayKey(now)],
      day: dayNumber(now)
    };
  }

  function reset() { var s = store(); if (s) { try { s.removeItem(KEY); } catch (e) {} } }

  return {
    dayKey: dayKey, dayNumber: dayNumber, seedFor: seedFor, seedForToday: seedForToday,
    msUntilNextDay: msUntilNextDay, countdownText: countdownText,
    playedToday: playedToday, resultToday: resultToday, recordPlay: recordPlay,
    stats: stats, reset: reset, daysBetween: daysBetween, _KEY: KEY, _EPOCH: EPOCH, _TZ: TZ
  };
});
