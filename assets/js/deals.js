/**
 * maketzo.co/deals' script (deals.html). The page ships with the deals that showed when it was last published
 * (maketzo-backend lib/deals-publish.js writes them between the DEALS markers, so Google reads real text). This asks
 * GET /deals/live for the current truth and swaps it in, so a deal leaves the moment it ends even while a deploy is
 * on its way. It also runs Copy Code and the countdowns, which tick in the browser and never ask the server again.
 */
(function () {
  'use strict';
  function apiBase() {
    var h = window.location.hostname.replace(/^www\./, '');
    if (h === 'localhost' || h.indexOf('127.') === 0) return 'http://localhost:3000';
    if (h === 'maketzo.co') return 'https://api.maketzo.co';
    var p = h.split('.');
    return p.length >= 3 ? 'https://' + p[0] + '-api.' + p.slice(1).join('.') : 'https://api.' + h;
  }
  var live = document.getElementById('dealsLive');
  var terms = document.getElementById('dealsTerms');
  if (!live) return;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function left(ms) {
    if (ms <= 0) return '';
    var d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    if (d > 0) return d + (d === 1 ? ' day, ' : ' days, ') + h + (h === 1 ? ' hour left' : ' hours left');
    if (h > 0) return h + (h === 1 ? ' hour, ' : ' hours, ') + m + (m === 1 ? ' minute left' : ' minutes left');
    return m < 1 ? 'Less than a minute left' : m + (m === 1 ? ' minute left' : ' minutes left');
  }
  var timer = null;
  function tick() {
    var now = Date.now(), ended = false;
    live.querySelectorAll('.dl-left[data-ends]').forEach(function (el) {
      var ms = Date.parse(el.getAttribute('data-ends')) - now;
      if (ms <= 0) ended = true;
      el.textContent = left(ms);
    });
    live.querySelectorAll('.dl-clock[data-ends]').forEach(function (el) {
      var ms = Math.max(0, Date.parse(el.getAttribute('data-ends')) - now);
      if (ms <= 0) ended = true;
      var set = function (u, v) { var n = el.querySelector('[data-unit="' + u + '"]'); if (n) n.textContent = pad(v); };
      set('d', Math.floor(ms / 864e5)); set('h', Math.floor(ms % 864e5 / 36e5)); set('m', Math.floor(ms % 36e5 / 6e4));
    });
    if (ended) { clearInterval(timer); timer = null; refresh(); }
  }
  function start() { tick(); if (!timer && live.querySelector('[data-ends]')) timer = setInterval(tick, 15000); }

  function refresh() {
    fetch(apiBase() + '/deals/live', { credentials: 'omit', mode: 'cors', cache: 'no-store' }).then(function (r) {
      return r.status === 200 ? r.json() : null;
    }).then(function (j) {
      if (!j || typeof j.html !== 'string') return;
      if (live.innerHTML.trim() !== j.html.trim()) live.innerHTML = j.html;
      if (terms && typeof j.terms === 'string' && terms.innerHTML.trim() !== j.terms.trim()) terms.innerHTML = j.terms;
      start();
    }).catch(function () {});
  }

  live.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.dl-copy');
    if (!b) return;
    var code = b.getAttribute('data-code') || '';
    var label = b.classList.contains('dl-code-inline') ? code : 'Copy Code';
    var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = label; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function () {});
    else {
      var t = document.createElement('textarea'); t.value = code; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(t);
    }
  });

  start();
  refresh();
})();
