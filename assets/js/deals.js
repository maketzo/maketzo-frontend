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
      // A visitor who just signed up keeps "You're on the list" until a deal actually starts.
      if (signedUp && !(j.deals && j.deals.length)) return start();
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

  // ── Deal alerts (maketzo-backend lib/deal-alerts.js): their own list, never the newsletter ──
  // The box in the empty state sends the address to POST /deals/alerts and says "You're on the list" in its place,
  // the same words for a new address and one already on the list.
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var signedUp = false;
  function visit(body) {
    if (window.MKT) {
      try { body.anon_id = window.MKT.getAnonId(); } catch (e) {}
      try { body.session_id = window.MKT.getSessionId(); } catch (e) {}
    }
    return body;
  }
  function post(path, body) {
    return fetch(apiBase() + path, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  live.addEventListener('submit', function (ev) {
    var form = ev.target.closest && ev.target.closest('form[data-dl-alerts]');
    if (!form) return;
    ev.preventDefault();
    var input = form.querySelector('input[name="email"]'), err = form.querySelector('.dl-alerts-error'), btn = form.querySelector('button[type="submit"]');
    var email = ((input && input.value) || '').trim();
    var say = function (msg) {
      if (err) { err.textContent = msg; err.hidden = !msg; }
      if (input) input.classList.toggle('invalid', !!msg);
    };
    if (!EMAIL_RE.test(email) || email.length < 5 || email.length > 200) { say('Enter a full email address, like you@example.com.'); if (input) input.focus(); return; }
    say('');
    if (btn) btn.disabled = true;
    post('/deals/alerts', visit({ email: email, source_path: location.pathname || null })).then(function (r) {
      if (!r.ok) throw new Error('status ' + r.status);
      signedUp = true;
      var done = document.createElement('p');
      done.className = 'dl-alerts-done';
      done.setAttribute('role', 'status');
      done.textContent = "You're on the list. We'll email you the day the next deal starts.";
      form.parentNode.replaceChild(done, form);
      if (window.MKT) {
        try { window.MKT.trackEvent('deal_alert_subscribe', { source: 'deals' }); } catch (e) {}
        try { window.MKT.linkSession(email); } catch (e) {}
        try { window.MKT.setPerson({ deal_alerts: true }); } catch (e) {}
      }
    }).catch(function () {
      if (btn) btn.disabled = false;
      say('That did not go through. Try again in a minute.');
    });
  });

  // The stop link in every deal alert opens /deals#stop=<token>. Only a real click stops it, so a mail scanner that
  // opens the link changes nothing, and the token stays out of every server log (a hash is never sent).
  var stopTok = /^#stop=([a-f0-9]{64})$/i.exec(window.location.hash || '');
  if (stopTok && live.parentNode) {
    var box = document.createElement('section');
    box.className = 'dl-stop';
    box.setAttribute('aria-label', 'Stop deal alerts');
    box.innerHTML = '<h2 class="dl-stop-head">Stop Deal Alerts?</h2>' +
      '<p class="dl-stop-sub">You won\'t get another deal email from MAKETZO. The newsletter is separate and stays as it is.</p>' +
      '<div class="dl-stop-actions"><button type="button" class="dl-alerts-btn" data-stop="go">Stop Deal Alerts</button>' +
      '<button type="button" class="dl-stop-keep" data-stop="keep">Keep Them</button></div>' +
      '<p class="dl-alerts-error" role="alert" hidden></p>';
    live.parentNode.insertBefore(box, live);
    var clearHash = function () { try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {} };
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-stop]');
      if (!b) return;
      if (b.getAttribute('data-stop') === 'keep') { clearHash(); box.parentNode.removeChild(box); return; }
      b.disabled = true;
      var err = box.querySelector('.dl-alerts-error');
      post('/deals/alerts/stop', { token: stopTok[1].toLowerCase() }).then(function (r) {
        if (r.status === 404) throw new Error('bad link');
        if (!r.ok) throw new Error('retry');
        clearHash();
        box.innerHTML = '<h2 class="dl-stop-head">Deal Alerts Are Off</h2><p class="dl-stop-sub" role="status">You won\'t get another deal email from MAKETZO.</p>';
        if (window.MKT) { try { window.MKT.trackEvent('deal_alert_stop', { source: 'deals' }); } catch (e) {} }
      }).catch(function (e) {
        b.disabled = false;
        if (err) {
          err.textContent = e && e.message === 'bad link'
            ? "That stop link did not work. Reply to any deal email and we'll take you off the list."
            : 'That did not go through. Try again in a minute.';
          err.hidden = false;
        }
      });
    });
  }

  start();
  refresh();
})();
