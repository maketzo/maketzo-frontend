/*
 * The support chat's panel (Ed, 2026-11-16). Loaded by support-chat.js on the first click; styled by
 * assets/css/support-chat.css; served by maketzo-backend routes/support.js. Phase A: approved answers and the
 * Knowledge Center, "Did this answer your question?", and email to the team. Live chat is phase B.
 *
 * What a visitor sees, and why:
 *   - Answers come from the help library and say so. No name, no typing dots, no delay that pretends someone is
 *     thinking: every word is text Ed approved, and nobody is passed off as a person.
 *   - Nothing reaches the server until the first question (the panel's opening call stores nothing). The first
 *     question returns the chat's id and token, kept in this browser so the chat survives a reload or another page.
 *   - The email is asked only when the visitor wants a person, with the reason, and the newsletter box starts empty.
 *   - The question's words never go to analytics; events carry short facts only (matched, kind, yes or no).
 *
 * Every visitor-facing string is in COPY below. CLAUDE.md section 3: no em dashes, one reading, Title Case buttons.
 */
(function () {
  'use strict';
  if (window.MKChat) return;

  var COPY = {
    name: 'MAKETZO Support',
    lineOff: 'Email replies in one trading day',
    hello: 'Hi there.',
    hello2: 'What can we help you with?',
    sub: 'Answers come from our help library. Email us any time and we reply within one trading day.',
    chips: ['Do I need a card for the free trial?', 'Can I cancel any time?', 'Do I need to connect my broker?'],
    placeholder: 'Ask a question',
    question: 'Your question',
    send: 'Send',
    close: 'Close chat',
    dialog: 'Support chat',
    footLeft: 'Answers from our help library',
    emailUs: 'Email Us',
    from: 'From our help library',
    searching: 'Searching our help library',
    answer: 'Answer',
    kc: 'Knowledge Center',
    readHere: 'Read it here',
    noneTitle: 'Nothing in our help library answers that yet.',
    noneBody: 'Leave your email and we will reply within one trading day.',
    didIt: 'Did this answer your question?',
    helped: 'That Helped',
    glad: 'Glad that helped. Ask anything else below.',
    back: 'Back to Chat',
    loading: 'Loading',
    artMissing: 'This article is not available here. Ask your question in the chat and we can help.',
    gateTitle: 'The full guide is in the app.',
    gateBody: 'Start your 7-day free trial to read the rest. No charge until day 8.',
    gateCta: 'Start 7-Day Free Trial',
    emailAsk: 'Leave your email and we will reply within one trading day.',
    emailLabel: 'Your email',
    emailPh: 'you@example.com',
    questionPh: 'Your question',
    notePh: 'Anything to add? (optional)',
    newsletter: 'Send me the MAKETZO newsletter',
    badEmail: 'Enter your email address.',
    needQuestion: 'Type your question first.',
    sent: 'Sent to our team',
    gotIt: 'Got it. We will reply to {email} within one trading day.',
    gotIt2: 'Our team can see your question and the answers you saw.',
    already: 'Our team already has this chat and will reply by email within one trading day. Anything you ask here is added to it.',
    transcript: 'Email Me This Chat',
    transcriptSent: 'Sent to Your Inbox',
    transcriptAsk: 'Where should we send this chat?',
    rateAsk: 'How was this chat?',
    good: 'Good',
    bad: 'Bad',
    better: 'Anything we could do better? (optional)',
    skip: 'Skip',
    thanks: 'Thanks. We read every one.',
    opening: 'Opening your chat',
    ratedYes: 'You said our reply answered your question',
    ratedNo: 'You said our reply missed',
    rateYesNote: 'Thanks for telling us. Ask anything else below.',
    rateNoTitle: 'Sorry our reply missed.',
    rateNoPh: 'What do you still need? (optional)',
    moreAsk: 'Tell us what you still need. We will reply by email within one trading day.',
    noteLabel: 'Your note',
    error: 'Something went wrong. Try again in a minute.',
    offline: 'We could not reach the chat. Check your connection and try again.'
  };

  var IC = {
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4V10h3Zm0 0 4-7a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7"/></svg>',
    dn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 14V3h3v11h-3Zm0 0-4 7a2 2 0 0 1-3-2l1-4H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17"/></svg>'
  };

  var KEY = 'mkc_v1', OPEN_KEY = 'mkc_open';
  var IDLE_MS = 30 * 60 * 1000;            // an answers-only chat starts over after 30 quiet minutes
  var KEEP_MS = 7 * 24 * 60 * 60 * 1000;   // one that reached the team is kept a week, for the reply
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var root = document.getElementById('mkc');
  if (!root) return;
  var btn = root.querySelector('.mkc-btn');
  var phone = window.matchMedia('(max-width: 767px)');

  var S = {
    open: false, built: false, busy: false, conv: null, state: 'bot', emailGiven: false, replied: false, live: false,
    shownAt: 0, chips: null, said: false, artFrom: null,
    key: randomKey()
  };
  var panel, log, art, input, sendBtn, footR;

  // -- small helpers --
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function button(cls, text, fn) { var b = el('button', cls); b.type = 'button'; b.textContent = text; if (fn) b.addEventListener('click', fn); return b; }
  function add(node) { log.appendChild(node); log.scrollTop = log.scrollHeight; return node; }
  function paras(text) {
    return String(text || '').split(/\n\s*\n/).map(function (p) { return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function randomKey() {
    try { var a = new Uint8Array(12); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (n) { return (n % 36).toString(36); }).join(''); }
    catch (e) { return Math.random().toString(36).slice(2, 14); }
  }
  function track(name, props) { try { if (window.MKT && MKT.trackEvent) MKT.trackEvent('mkt_chat_' + name, props || {}); } catch (e) {} }
  function clock(at) {
    var d = new Date(at); if (isNaN(d)) return '';
    var t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + t;
  }

  // -- this browser's copy of the chat: only its id, token, last activity and state --
  function loadConv() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!o || !o.c || !o.t) return null;
      var age = Date.now() - (o.at || 0);
      if ((o.st === 'bot' && age > IDLE_MS) || age > KEEP_MS) { localStorage.removeItem(KEY); return null; }
      return { c: o.c, t: o.t, st: o.st || 'bot' };
    } catch (e) { return null; }
  }
  function saveConv() {
    try {
      if (S.conv) localStorage.setItem(KEY, JSON.stringify({ c: S.conv.c, t: S.conv.t, at: Date.now(), st: S.state }));
      else localStorage.removeItem(KEY);
    } catch (e) {}
  }
  function forget() { S.conv = null; S.state = 'bot'; S.emailGiven = false; saveConv(); }

  // -- the server: text/plain JSON, one round trip, no cookie --
  function apiBase() {
    if (window.MKT && MKT.apiBase) return MKT.apiBase;
    var h = location.hostname;
    if (h === 'localhost' || h.indexOf('127.') === 0 || /^dev[.-]/.test(h)) return 'https://dev-api.maketzo.co';
    if (/^staging[.-]/.test(h)) return 'https://staging-api.maketzo.co';
    return 'https://api.maketzo.co';
  }
  // keep: the request outlives the page (a tap on an answer's link leaves it at once).
  function post(path, body, keep) {
    return fetch(apiBase() + '/support/' + path, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body || {}), credentials: 'omit', mode: 'cors', keepalive: !!keep
    }).then(function (r) {
      if (r.status === 204) return {};
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok) return j;
        var e = new Error(j.error || COPY.error); e.status = r.status; e.ended = !!j.ended; throw e;
      });
    }, function () { var e = new Error(COPY.offline); e.status = 0; throw e; });
  }
  function withConv(b) { b = b || {}; if (S.conv) { b.c = S.conv.c; b.t = S.conv.t; } return b; }
  // Who is asking, for the first question only: this page, where they came from, and the browser id only when the
  // visitor allows analytics (otherwise a random key that counts tries and is never stored).
  function firstFacts(b) {
    b.p = location.pathname;
    try { b.r = document.referrer || ''; } catch (e) {}
    var link = false;
    try { link = !!(window.MKT && MKT.canLink && MKT.canLink()); } catch (e) {}
    if (link) { b.a = MKT.getAnonId(); b.s = MKT.getSessionId(); } else b.k = S.key;
    try { if (window.MKT && MKT.isInternal && MKT.isInternal()) b.i = 1; } catch (e) {}
    try { if (navigator.webdriver) b.wd = 1; } catch (e) {}
    return b;
  }

  // -- the panel --
  function build() {
    if (S.built) return;
    S.built = true;
    panel = el('section', 'mkc-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', COPY.dialog);
    panel.hidden = true;
    panel.innerHTML =
      '<header class="mkc-head"><span class="mkc-mark" aria-hidden="true">M</span>'
      + '<div class="mkc-who"><b class="mkc-name">' + esc(COPY.name) + '</b><div class="mkc-status"><span class="mkc-dot"></span><span class="mkc-line">' + esc(COPY.lineOff) + '</span></div></div>'
      + '<button type="button" class="mkc-icon" data-act="close" aria-label="' + esc(COPY.close) + '">' + IC.down + '</button></header>'
      + '<div class="mkc-body"><div class="mkc-log" role="log" aria-live="polite"></div><div class="mkc-art" hidden></div></div>'
      + '<form class="mkc-compose" autocomplete="off" novalidate><label class="mkc-sr" for="mkcIn">' + esc(COPY.question) + '</label>'
      + '<input class="mkc-in" id="mkcIn" name="q" placeholder="' + esc(COPY.placeholder) + '" maxlength="300" enterkeyhint="send">'
      + '<button class="mkc-send" type="submit" aria-label="' + esc(COPY.send) + '">' + IC.send + '</button></form>'
      + '<div class="mkc-foot"><span>' + esc(COPY.footLeft) + '</span></div>';
    root.appendChild(panel);
    log = panel.querySelector('.mkc-log');
    art = panel.querySelector('.mkc-art');
    input = panel.querySelector('.mkc-in');
    sendBtn = panel.querySelector('.mkc-send');
    footR = button('mkc-link', COPY.emailUs, function () { reach(); });
    panel.querySelector('.mkc-foot').appendChild(footR);
    panel.querySelector('[data-act="close"]').addEventListener('click', function () { setOpen(false); });
    panel.querySelector('.mkc-compose').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (v.length < 2) { input.focus(); return; }
      input.value = '';
      ask(v, false);
    });
    panel.addEventListener('keydown', onKey);
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', fitPhone);
      visualViewport.addEventListener('scroll', fitPhone);
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); if (!art.hidden) closeArticle(); else setOpen(false); return; }
    // On a phone the panel is the whole screen, so Tab stays inside it.
    if (e.key !== 'Tab' || !phone.matches) return;
    var f = Array.prototype.filter.call(panel.querySelectorAll('button, a[href], input, textarea'), function (n) { return !n.disabled && n.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // A phone's keyboard shrinks the visible area; the panel follows it so the box is never under the keys.
  function fitPhone() {
    if (!S.open || !phone.matches || !window.visualViewport) { root.style.removeProperty('--mkc-vvh'); root.style.removeProperty('--mkc-vvt'); return; }
    root.style.setProperty('--mkc-vvh', Math.round(visualViewport.height) + 'px');
    root.style.setProperty('--mkc-vvt', Math.round(visualViewport.offsetTop) + 'px');
  }

  function setOpen(open, from) {
    build();
    if (open === S.open) { if (open) input.focus(); return; }
    S.open = open;
    root.classList.toggle('is-open', open);
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.setAttribute('aria-modal', open && phone.matches ? 'true' : 'false');
    document.documentElement.classList.toggle('mkc-lock', open && phone.matches);
    try { if (open) sessionStorage.setItem(OPEN_KEY, '1'); else sessionStorage.removeItem(OPEN_KEY); } catch (e) {}
    fitPhone();
    if (open) {
      if (!S.shownAt) S.shownAt = Date.now();
      if (!S.said) { S.said = true; firstView(from); }
      // A phone keyboard covering half the screen on open hides the answers: there focus goes to the panel's close
      // button (it is a dialog), and to the box only on a computer.
      setTimeout(function () { (phone.matches ? panel.querySelector('[data-act="close"]') : input).focus(); }, 60);
    } else {
      btn.focus();
    }
  }

  // What the panel shows the first time it opens on this page: the chat so far, or the welcome.
  function firstView(from) {
    var saved = loadConv();
    track('open', { from: from || 'button', resumed: saved ? 'yes' : 'no' });
    post('hello', firstFacts({})).then(function (j) {
      S.live = !!j.live;
      if (j.chips && j.chips.length) S.chips = j.chips;
      var ch = log.querySelector('.mkc-chips');
      if (ch && S.chips) fillChips(ch);
    }).catch(function () {});
    if (!saved) { hello(); return; }
    S.conv = { c: saved.c, t: saved.t };
    S.state = saved.st;
    var wait = add(el('div', 'mkc-wait', esc(COPY.loading)));
    post('sync', withConv({ after: 0 })).then(function (j) {
      wait.remove();
      thread(j);
    }).catch(function (e) {
      wait.remove();
      if (e.ended) forget();
      hello();
    });
  }

  function hello() {
    add(el('div', '', '<p class="mkc-hello">' + esc(COPY.hello) + '<br>' + esc(COPY.hello2) + '</p><p class="mkc-sub">' + esc(COPY.sub) + '</p>'));
    fillChips(add(el('div', 'mkc-chips')));
  }
  function fillChips(box) {
    box.innerHTML = '';
    (S.chips || COPY.chips).forEach(function (q) {
      box.appendChild(button('mkc-chip', q, function () { ask(q, true); }));
    });
  }

  // -- the chat so far (another page, a reload, or the reply email's link) --
  function thread(j) {
    S.state = j.state || S.state;
    S.emailGiven = !!j.emailGiven;
    S.live = !!j.live;
    saveConv();
    var msgs = j.messages || [];
    if (!msgs.length) { hello(); return; }
    msgs.forEach(function (m) {
      if (m.kind === 'visitor') add(el('div', 'mkc-me')).textContent = m.body || '';
      else if (m.kind === 'results') results(m.results || [], m.qid, false);
      else if (m.kind === 'rep') { S.replied = true; repLine(m); }
      else if (m.kind === 'system') systemLine(m);
    });
    if (S.state === 'email' && !S.replied) add(el('div', 'mkc-note', esc(COPY.already)));
    if (S.replied && !j.rated) rate();
  }
  function repLine(m) {
    var who = m.alias || 'MAKETZO';
    add(el('div', 'mkc-rep', '<span class="mkc-mark" aria-hidden="true">' + esc(who.charAt(0).toUpperCase()) + '</span>'
      + '<div><p class="mkc-meta">' + esc(who) + ' &middot; ' + esc(clock(m.at)) + '</p><div class="mkc-bub"></div></div>'))
      .querySelector('.mkc-bub').textContent = m.body || '';
  }
  function systemLine(m) {
    if (m.code === 'note') { add(el('div', 'mkc-me')).textContent = m.body || ''; return; }
    var text = { emailed: COPY.sent, 'rated-yes': COPY.ratedYes, 'rated-no': COPY.ratedNo }[m.code];
    if (text) add(el('div', 'mkc-sys')).textContent = text;
  }

  // -- a question --
  function ask(q, chip) {
    if (S.busy) return;
    var ch = log.querySelector('.mkc-chips'); if (ch) ch.remove();
    closeArticle();
    add(el('div', 'mkc-me')).textContent = q;
    send(q, chip, true);
  }
  // then / failed: the email path asks a first question before it sends; they run after the answer, or after an error.
  function send(q, chip, retry, then, failed) {
    S.busy = true; sendBtn.disabled = true;
    var wait = null, slow = setTimeout(function () { wait = add(el('div', 'mkc-wait', esc(COPY.searching))); }, 300);
    var body = withConv({ q: q });
    if (!S.conv) { firstFacts(body); body.ms = S.shownAt ? Date.now() - S.shownAt : 0; }
    post('ask', body).then(function (j) {
      clearTimeout(slow); if (wait) wait.remove();
      S.busy = false; sendBtn.disabled = false;
      if (j.c && j.t) S.conv = { c: j.c, t: j.t };
      S.emailGiven = !!j.emailGiven;
      if (S.state === 'closed') S.state = 'bot';
      saveConv();
      track('ask', { matched: j.matched ? 'yes' : 'no', results: (j.results || []).length, top: j.results && j.results[0] ? j.results[0].kind : 'none', chip: chip ? 'yes' : 'no' });
      results(j.results || [], j.qid, !then);
      if (then) then(j);
    }).catch(function (e) {
      clearTimeout(slow); if (wait) wait.remove();
      S.busy = false; sendBtn.disabled = false;
      // The chat ended on the server (closed and cleared): start a new one with the same question, once.
      if (e.ended && retry) { forget(); return send(q, chip, false, then, failed); }
      add(el('div', 'mkc-note is-error')).textContent = e.message;
      if (failed) failed(); else if (!input.value) input.value = q;
    });
  }

  // The answers for one question. live: true when it was just asked, so the visitor is asked if it helped.
  function results(list, qid, live) {
    add(el('div', 'mkc-label')).textContent = COPY.from;
    if (!list.length) {
      add(el('div', 'mkc-card', '<b class="mkc-title">' + esc(COPY.noneTitle) + '</b><p>' + esc(COPY.noneBody) + '</p>'));
      if (live && S.state !== 'email') add(el('div', 'mkc-row')).appendChild(button('mkc-b mkc-b--gold', COPY.emailUs, function () { reach(); }));
      return;
    }
    list.forEach(function (x) { add(x.kind === 'answer' ? answerCard(x, qid) : articleCard(x, qid)); });
    if (!live) return;
    var box = add(el('div', 'mkc-ask', '<p>' + esc(COPY.didIt) + '</p>'));
    var row = box.appendChild(el('div', 'mkc-row'));
    var yes = row.appendChild(button('mkc-b', COPY.helped));
    var no = row.appendChild(button('mkc-b', COPY.emailUs));
    function pick(b, helpful) {
      b.setAttribute('aria-pressed', 'true'); yes.disabled = no.disabled = true;
      track('helpful', { helpful: helpful ? 'yes' : 'no' });
      post('feedback', withConv({ qid: qid, helpful: helpful ? 1 : 0 })).catch(function () {});
      if (helpful) add(el('div', 'mkc-note')).textContent = COPY.glad;
      else reach();
    }
    yes.addEventListener('click', function () { pick(yes, true); });
    no.addEventListener('click', function () { pick(no, false); });
  }
  function answerCard(x, qid) {
    var c = el('div', 'mkc-card', '<span class="mkc-k">' + esc(COPY.answer) + '</span><b class="mkc-title">' + esc(x.title) + '</b>' + paras(x.body));
    if (x.link && x.link.path && /^\/[A-Za-z0-9/_#?=&.-]*$/.test(x.link.path)) {
      var a = c.appendChild(el('a', 'mkc-link'));
      a.href = x.link.path;
      a.textContent = (x.link.label || 'Read More') + ' \u2192';
      a.addEventListener('click', function () { opened(qid, x.link.path, 'answer', true); });
    }
    return c;
  }
  function articleCard(x, qid) {
    var c = el('button', 'mkc-card');
    c.type = 'button';
    c.innerHTML = '<span class="mkc-k">' + esc(x.eyebrow ? x.eyebrow + ' \u00b7 ' + COPY.kc : COPY.kc) + '</span><b class="mkc-title">' + esc(x.title) + '</b>'
      + (x.summary ? '<p>' + esc(x.summary) + '</p>' : '') + '<span class="mkc-link">' + esc(COPY.readHere) + ' \u2192</span>';
    c.addEventListener('click', function () { openArticle(x, qid, c); });
    return c;
  }
  function opened(qid, ref, kind, leaving) {
    track('result_open', { kind: kind });
    if (S.conv && qid) post('opened', withConv({ qid: qid, ref: ref }), leaving).catch(function () {});
  }

  // -- a Knowledge Center article, read inside the panel --
  function openArticle(x, qid, from) {
    S.artFrom = from;
    opened(qid, 'learn/' + x.slug, 'kb');
    art.hidden = false;
    art.scrollTop = 0;
    art.innerHTML = '';
    var back = art.appendChild(button('mkc-link', '\u2190 ' + COPY.back, closeArticle));
    var wait = art.appendChild(el('div', 'mkc-wait', esc(COPY.loading)));
    back.focus();
    fetch(apiBase() + '/kb/public/' + encodeURIComponent(x.slug), { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      .then(function (a) {
        if (art.hidden) return;
        wait.remove();
        if (!a) { art.appendChild(el('p', 'mkc-note')).textContent = COPY.artMissing; return; }
        art.appendChild(el('span', 'mkc-k')).textContent = a.eyebrow ? a.eyebrow + ' \u00b7 ' + COPY.kc : COPY.kc;
        art.appendChild(el('h3')).textContent = a.title || x.title;
        // The article's own text, from the Knowledge Center's published copy (the same HTML /learn shows).
        art.appendChild(el('div', 'mkc-prose', a.full ? (a.bodyHtml || '') : (a.teaserHtml || '')));
        if (!a.full) {
          var g = art.appendChild(el('div', 'mkc-gate', '<b class="mkc-title">' + esc(COPY.gateTitle) + '</b><p>' + esc(COPY.gateBody) + '</p>'));
          g.appendChild(el('div', 'mkc-row')).appendChild(button('mkc-b mkc-b--gold', COPY.gateCta + ' \u2192', startTrial));
        }
      });
  }
  function closeArticle() {
    if (!art || art.hidden) return;
    art.hidden = true;
    art.innerHTML = '';
    if (S.artFrom && document.body.contains(S.artFrom)) S.artFrom.focus(); else input.focus();
    S.artFrom = null;
  }
  // The same trial start as every "Start Free Trial" on the site (checkout.js), or the plans page where it is absent.
  function startTrial() {
    track('trial_click', {});
    try { if (typeof window.handleCheckout === 'function') return window.handleCheckout('pro', { preventDefault: function () {}, currentTarget: null }); } catch (e) {}
    window.location.href = '/pricing';
  }

  // -- a person: in phase A, an email to the team --
  function reach() {
    build();
    if (!S.open) setOpen(true);
    closeArticle();
    var open = log.querySelector('form.mkc-form[data-k="email"]');
    if (open) { (open.querySelector('input:not(.mkc-hp), textarea')).focus(); return; }
    // Already sent and not yet answered: the team has it. After a reply, they can write again without retyping.
    if (S.state === 'email' && S.emailGiven && !S.replied) { add(el('div', 'mkc-note')).textContent = COPY.already; return; }
    var needQ = !S.conv, askEmail = !S.emailGiven;
    var f = add(el('form', 'mkc-form'));
    f.setAttribute('data-k', 'email');
    f.noValidate = true;
    f.innerHTML = '<p><b>' + esc(askEmail ? COPY.emailAsk : COPY.moreAsk) + '</b></p>'
      + (askEmail ? '<label class="mkc-sr" for="mkcEm">' + esc(COPY.emailLabel) + '</label>'
        + '<input class="mkc-in" id="mkcEm" type="email" autocomplete="email" inputmode="email" placeholder="' + esc(COPY.emailPh) + '" maxlength="160" required>' : '')
      + '<label class="mkc-sr" for="mkcNote">' + esc(needQ ? COPY.question : COPY.noteLabel) + '</label>'
      + '<textarea class="mkc-in" id="mkcNote" maxlength="1000" placeholder="' + esc(needQ ? COPY.questionPh : COPY.notePh) + '"></textarea>'
      + (askEmail ? '<label class="mkc-check"><input type="checkbox"> ' + esc(COPY.newsletter) + '</label>' : '')
      + '<input class="mkc-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<div class="mkc-row"><button class="mkc-b mkc-b--gold" type="submit">' + esc(COPY.send) + '</button></div>'
      + '<p class="mkc-note is-error" hidden></p>';
    var em = f.querySelector('#mkcEm'), note = f.querySelector('#mkcNote'), nl = f.querySelector('input[type=checkbox]');
    var hp = f.querySelector('.mkc-hp'), go = f.querySelector('button[type=submit]'), err = f.querySelector('.is-error');
    function problem(text) { err.textContent = text; err.hidden = !text; }
    function back() { f.hidden = false; go.disabled = false; log.appendChild(f); log.scrollTop = log.scrollHeight; }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = em ? em.value.trim() : '', text = note.value.trim(), news = !!(nl && nl.checked);
      if (em && !EMAIL_RE.test(email)) { problem(COPY.badEmail); em.focus(); return; }
      if (needQ && !S.conv && text.length < 2) { problem(COPY.needQuestion); note.focus(); return; }
      problem('');
      go.disabled = true;
      var asked = needQ && !S.conv;
      function finish() {
        // With no email field the server uses the one this chat already has.
        post('email', withConv({ email: email || undefined, newsletter: news ? 1 : 0, note: asked ? '' : text, hp: hp.value })).then(function (j) {
          f.remove();
          S.state = 'email'; S.emailGiven = true; S.replied = false; saveConv();
          track('contact', { newsletter: news ? 'yes' : 'no', asked_first: needQ ? 'no' : 'yes', again: askEmail ? 'no' : 'yes' });
          add(el('div', 'mkc-sys')).textContent = COPY.sent;
          add(el('div', 'mkc-note', esc(COPY.gotIt).replace('{email}', '<b>' + esc(j.email || email) + '</b>') + ' ' + esc(COPY.gotIt2)));
          transcriptLink();
        }).catch(function (e2) {
          if (e2.ended) forget();
          problem(e2.message);
          back();
        });
      }
      if (asked) {
        // No question yet: the note is the question. It is asked first (the visitor sees what the library has), then sent.
        f.hidden = true;
        add(el('div', 'mkc-me')).textContent = text;
        send(text, false, true, finish, back);
      } else finish();
    });
    (em || note).focus();
  }

  // -- "Email Me This Chat" --
  function transcriptLink() {
    var row = add(el('div', 'mkc-row'));
    var b = row.appendChild(button('mkc-link', COPY.transcript));
    b.addEventListener('click', function () {
      if (S.emailGiven) return sendTranscript(b, {});
      b.remove();
      var f = row.appendChild(el('form', 'mkc-form'));
      f.noValidate = true;
      f.innerHTML = '<p><b>' + esc(COPY.transcriptAsk) + '</b></p><label class="mkc-sr" for="mkcTr">' + esc(COPY.emailLabel) + '</label>'
        + '<input class="mkc-in" id="mkcTr" type="email" autocomplete="email" inputmode="email" placeholder="' + esc(COPY.emailPh) + '" maxlength="160">'
        + '<label class="mkc-check"><input type="checkbox"> ' + esc(COPY.newsletter) + '</label>'
        + '<div class="mkc-row"><button class="mkc-b mkc-b--gold" type="submit">' + esc(COPY.send) + '</button></div><p class="mkc-note is-error" hidden></p>';
      var em = f.querySelector('#mkcTr'), err = f.querySelector('.is-error');
      em.focus();
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!EMAIL_RE.test(em.value.trim())) { err.textContent = COPY.badEmail; err.hidden = false; return; }
        var done = row.appendChild(button('mkc-link', COPY.transcript));
        f.remove();
        sendTranscript(done, { email: em.value.trim(), newsletter: f.querySelector('input[type=checkbox]').checked ? 1 : 0 });
      });
    });
  }
  function sendTranscript(b, extra) {
    b.disabled = true;
    post('transcript', withConv(extra)).then(function () {
      b.textContent = COPY.transcriptSent;
      if (extra.email) S.emailGiven = true;
      track('transcript', {});
    }).catch(function (e) { b.disabled = false; add(el('div', 'mkc-note is-error')).textContent = e.message; });
  }

  // -- after a person replied: one rating, with a comment box only after a tap --
  function rate(preset) {
    var box = add(el('div', 'mkc-rate', '<p><b>' + esc(COPY.rateAsk) + '</b></p>'));
    var th = box.appendChild(el('div', 'mkc-thumbs'));
    var up = th.appendChild(el('button', 'mkc-thumb', IC.up)), dn = th.appendChild(el('button', 'mkc-thumb', IC.dn));
    up.type = dn.type = 'button';
    up.setAttribute('aria-label', COPY.good); dn.setAttribute('aria-label', COPY.bad);
    up.setAttribute('aria-pressed', 'false'); dn.setAttribute('aria-pressed', 'false');
    function pick(b) {
      var rating = b === up ? 'up' : 'down';
      up.setAttribute('aria-pressed', b === up ? 'true' : 'false'); dn.setAttribute('aria-pressed', b === dn ? 'true' : 'false');
      post('rate', withConv({ rating: rating })).catch(function () {});
      track('rate', { rating: rating, via: 'chat' });
      if (box.querySelector('form')) return;
      comment(box, rating, COPY.better);
    }
    up.addEventListener('click', function () { pick(up); });
    dn.addEventListener('click', function () { pick(dn); });
    if (preset) pick(preset === 'up' ? up : dn);
  }
  function comment(box, rating, prompt) {
    var f = box.appendChild(el('form', ''));
    f.innerHTML = '<label class="mkc-sr" for="mkcRc">' + esc(prompt) + '</label><textarea class="mkc-in" id="mkcRc" maxlength="1000" placeholder="' + esc(prompt) + '"></textarea>'
      + '<div class="mkc-row"><button class="mkc-b mkc-b--gold" type="submit">' + esc(COPY.send) + '</button></div>';
    f.querySelector('.mkc-row').appendChild(button('mkc-b', COPY.skip, function () { box.innerHTML = '<p><b>' + esc(COPY.thanks) + '</b></p>'; }));
    log.scrollTop = log.scrollHeight;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = f.querySelector('textarea').value.trim();
      if (text) post('rate', withConv({ rating: rating, comment: text })).catch(function () {});
      box.innerHTML = '<p><b>' + esc(COPY.thanks) + '</b></p>';
    });
  }

  // -- the reply email's link: the chat opens now; it is fetched (and a Yes or No counts) on the first real touch --
  function fromEmail(raw, rateWord) {
    build();
    S.said = true;
    setOpen(true, 'email');
    var wait = add(el('div', 'mkc-wait', esc(COPY.opening)));
    var ON = ['pointerdown', 'keydown', 'touchstart'], done = false;
    function go(ev) {
      if (done || (ev && ev.isTrusted === false)) return;
      done = true;
      ON.forEach(function (n) { document.removeEventListener(n, go, true); });
      post('resume', { r: raw, rate: rateWord || undefined }).then(function (j) {
        wait.remove();
        S.conv = { c: j.c, t: j.t };
        track('open', { from: 'email', resumed: 'yes', rate: rateWord || 'none' });
        thread(Object.assign({}, j, { rated: rateWord ? true : j.rated }));
        if (rateWord === 'yes') add(el('div', 'mkc-note')).textContent = COPY.rateYesNote;
        if (rateWord === 'no') comment(add(el('div', 'mkc-rate', '<p><b>' + esc(COPY.rateNoTitle) + '</b></p>')), 'no', COPY.rateNoPh);
        if (rateWord) track('rate', { rating: rateWord, via: 'email' });
      }).catch(function (e) {
        wait.remove();
        add(el('div', 'mkc-note')).textContent = e.message;
        hello();
      });
    }
    ON.forEach(function (n) { document.addEventListener(n, go, { capture: true, passive: true }); });
  }

  window.MKChat = {
    open: function (from) { setOpen(true, from); },
    close: function () { setOpen(false); },
    toggle: function (from) { setOpen(!S.open, from); },
    fromEmail: fromEmail
  };
})();
