/*
 * badge-vault.js — the badge COLLECTION. localStorage only.
 *
 * Separate from badge-engine.js on purpose: the engine is PURE (a session in, a verdict
 * out, no I/O). Persistence is a different concern and must not contaminate it, or the
 * engine stops being node-testable and stops being a clean copy into maketzo-app/lib/.
 *
 * WHY THIS EXISTS (Ed, 2026-07-15): the engine hands back 36 possible badges and a run
 * earns about four. Without persistence you see them once and they evaporate, which
 * makes 36 badges wallpaper. Ed's ask was badges people can "hang their hat on, laugh,
 * and compare with each other" — collect + compare is the whole point, and a one-shot
 * card cannot do either. This is the cheapest thing that turns a novelty into a reason
 * to run the tape again.
 *
 * NO BACKEND, NO LOGIN. The sim's entire pitch is "free, no login" and that is the
 * funnel. A collection worth an account is exactly the trade we are NOT making here:
 * the account is what MAKETZO sells, and the vault is what makes you want one.
 *
 * Storage is best-effort by design. Private mode, a full quota, a wiped browser: all
 * degrade to "you have no collection yet", never to a broken card. Every entry point
 * is wrapped, because localStorage THROWS on access (not just on write) in some
 * privacy modes, so even reading has to be guarded.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaketzoVault = api;
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var KEY = 'mkt_tt_vault_v1';

  function store() {
    // Touching localStorage can THROW outright (Safari private mode, blocked cookies),
    // so the guard has to wrap the access itself, not just the read.
    try {
      var s = (typeof localStorage !== 'undefined') ? localStorage : null;
      if (!s) return null;
      s.setItem('__mkt_t', '1'); s.removeItem('__mkt_t');   // prove it is writable
      return s;
    } catch (e) { return null; }
  }

  function read() {
    var s = store(); if (!s) return null;
    try {
      var raw = s.getItem(KEY); if (!raw) return blank();
      var v = JSON.parse(raw);
      if (!v || typeof v !== 'object' || !v.badges || typeof v.badges !== 'object') return blank();
      v.runs = v.runs || 0;
      return v;
    } catch (e) { return blank(); }   // corrupt JSON is a fresh vault, never a crash
  }

  function blank() { return { badges: {}, runs: 0, best: null }; }

  function write(v) {
    var s = store(); if (!s) return false;
    try { s.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  /**
   * Record a finished run. Returns what the card needs to render the collection line:
   *   { earned, total, fresh, runs, supported }
   * `fresh` = the badge ids earned for the FIRST time in this run. That is the moment
   * worth celebrating, and the only reason to single a badge out on the card.
   */
  function record(result, catalogSize) {
    var out = { earned: 0, total: catalogSize || 0, fresh: [], runs: 0, supported: false };
    if (!result || !result.headline) return out;

    var v = read();
    if (!v) return out;                       // storage unavailable: card renders without it
    out.supported = true;

    var ids = [result.headline.id];
    for (var i = 0; i < (result.shelf || []).length; i++) ids.push(result.shelf[i].id);

    for (i = 0; i < ids.length; i++) {
      if (!v.badges[ids[i]]) { v.badges[ids[i]] = 1; out.fresh.push(ids[i]); }
      else v.badges[ids[i]]++;
    }
    v.runs++;
    // Best run = highest net. Kept for a future "your best" line; harmless if unused.
    if (!v.best || (result.signals && result.signals.net > v.best.net)) {
      v.best = { net: result.signals ? Math.round(result.signals.net) : 0, grade: result.grade, id: result.headline.id };
    }
    write(v);   // a failed write still returns honest counts for THIS run

    out.earned = countKeys(v.badges);
    out.runs = v.runs;
    return out;
  }

  function countKeys(o) { var n = 0; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n++; return n; }

  function stats(catalogSize) {
    var v = read();
    if (!v) return { earned: 0, total: catalogSize || 0, runs: 0, supported: false, badges: {} };
    return { earned: countKeys(v.badges), total: catalogSize || 0, runs: v.runs, supported: true, badges: v.badges, best: v.best };
  }

  function has(id) { var v = read(); return !!(v && v.badges[id]); }
  function reset() { var s = store(); if (s) { try { s.removeItem(KEY); } catch (e) {} } }

  return { record: record, stats: stats, has: has, reset: reset, _KEY: KEY };
});
