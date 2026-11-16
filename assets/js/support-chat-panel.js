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
 *   - The email is asked only when the visitor wants a person, with the reason. The newsletter box starts ticked,
 *     except in the EU, where it must start empty (Ed, 2026-11-16; the offer tab's rule).
 *   - Email Me This Chat: after the email path, and whenever a chat ends (End Chat, or the rep ending it), so the
 *     visitor can keep the whole thread (Ed, 2026-11-16).
 *   - A visitor the team blocked (Ed's pick A, 2026-11-16) reads "This chat has ended." and keeps the help library;
 *     no person, no Email Us, no rating. The browser remembers the blocked chat (mkc_blk) until the server says the
 *     block is over.
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
    placeholder: 'Ask a question',
    question: 'Your question',
    send: 'Send',
    close: 'Close chat',
    stillWithTeam: 'Your question is still with our team. The reply comes by email within one trading day.',
    dialog: 'Support chat',
    footLeft: 'Answers from our help library',
    emailUs: 'Email Us',
    from: 'From our help library',
    searching: 'Searching our help library',
    greet: 'Hi there. Ask your question in a few words, or pick one below.',
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
    thanks: 'Thanks for rating this chat.',
    thanksNote: 'Thanks. Your note was sent to the team.',
    opening: 'Opening your chat',
    ratedYes: 'You said our reply answered your question',
    ratedNo: 'You said our reply missed',
    rateYesNote: 'Thanks for telling us. Ask anything else below.',
    rateNoTitle: 'Sorry our reply missed.',
    rateNoPh: 'What do you still need? (optional)',
    moreAsk: 'Tell us what you still need. We will reply by email within one trading day.',
    noteLabel: 'Your note',
    // live chat (phase B)
    lineOn: 'Usually replies in a few minutes',
    lineWait: 'Finding someone for you',
    lineRep: 'MAKETZO team',
    subOn: 'Answers come from our help library. A person is one tap away.',
    talk: 'Talk to a Person',
    noneBodyOn: 'A person can. Most chats get a reply in a few minutes.',
    personAsk: 'Leave your email so we can reply if you step away.',
    goOn: 'Continue',
    waitNote: 'Finding someone for you. Usually under 2 minutes.',
    waitOther: 'Finding someone else for you.',
    waitPh: 'Add anything while you wait',
    messagePh: 'Message {name}',
    joined: '{name} from MAKETZO joined',
    handed: '{from} handed you to {name}',
    otherLink: 'Talk to Someone Else',
    otherAlone: 'Nobody else is free right now. Keep chatting here, or email the team instead.',
    endChat: 'End Chat',
    endedRep: '{name} ended the chat',
    // A visitor the team blocked (Ed's pick A, 2026-11-16): no name, no rating, no person or Email Us after it.
    endedBlocked: 'This chat has ended.',
    notReally: 'Not Really',
    endedYou: 'You ended the chat',
    missed: 'Nobody is free right now. We will email you within one trading day.',
    missedAsk: 'Where should we send the answer?',
    typing: '{name} is typing',
    seen: 'Seen',
    newReply: 'New reply',
    soundOff: 'Turn sound off',
    soundOn: 'Turn sound on',
    chatLabel: 'Chat with us',
    unreadLabel: 'Chat with us, {n} new',
    error: 'Something went wrong. Try again in a minute.',
    offline: 'We could not reach the chat. Check your connection and try again.'
  };

  var IC = {
    snd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4V10h3Zm0 0 4-7a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7"/></svg>',
    dn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 14V3h3v11h-3Zm0 0-4 7a2 2 0 0 1-3-2l1-4H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17"/></svg>'
  };

  var KEY = 'mkc_v1', OPEN_KEY = 'mkc_open';
  // The shortest time the search line shows before an answer (see send).
  var THINK_MS = 900;
  // A greeting on its own, in the ways people type one.
  var GREETING = /^(hi+|hello+|hey+|hiya|howdy|yo|sup|greetings|good (morning|afternoon|evening))( there| team| all| everyone)?[\s!.?,:)]*$/i;
  function greet() {
    add(el('p', 'mkc-sub')).textContent = COPY.greet;
    if (S.chips && S.chips.length) fillChips(add(el('div', 'mkc-chips')));
    input.focus();
  }
  // The suggested questions this browser was offered or tapped, never anything typed, so the next chat suggests
  // others (Ed, 2026-11-16: "rotate each time they start a new chat"). A convenience only: empty means the most asked.
  var SEEN_KEY = 'mkc_seen';
  function seenList() { try { var l = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function remember(list) {
    var out = seenList();
    (list || []).forEach(function (q) { if (typeof q !== 'string' || !q) return; var i = out.indexOf(q); if (i >= 0) out.splice(i, 1); out.push(q.slice(0, 300)); });
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(out.slice(-30))); } catch (e) {}
  }
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
    key: randomKey(),
    // live chat: who is answering, the chat's version (the held request waits on it), the last message seq this panel
    // has, whether a person ever joined (the rating), unread replies while closed, and a miss (email from then on)
    rep: null, v: null, lastSeq: 0, everLive: false, unread: 0, missedOnce: false, typedAt: 0
  };
  var panel, log, art, input, sendBtn, footR, footL, footO, muteBtn, endBtn;

  // -- small helpers --
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function button(cls, text, fn) { var b = el('button', cls); b.type = 'button'; b.textContent = text; if (fn) b.addEventListener('click', fn); return b; }
  function add(node) { log.appendChild(node); toEnd(); return node; }
  // The thread stays on its newest line while the reader is at the bottom: anything added later under it (Seen, the
  // typing dots, a late layout) or a resize (a phone keyboard) keeps it in view. Scrolled up to reread, it stays put.
  // Ed, 2026-11-16: "Cursor position is off while I chat" -- his last message sat half under the box after Seen landed.
  var stick = true;
  function toEnd() { log.scrollTop = log.scrollHeight; stick = true; }
  // A help-library answer reads from the question down (Ed's pick, 2026-11-16: "the cursor was on the bottom, so I had
  // to scroll up"): the visitor's question sits at the top of the thread and the cards run below it. An answer that
  // fits moves nothing. Live chat with a person still follows the newest line (stick, above).
  function toQuestion(node) {
    if (!node || !node.parentNode) return toEnd();
    var top = node.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - 8;
    if (log.scrollHeight - top <= log.clientHeight + 1) return toEnd();
    stick = false;
    log.scrollTop = Math.max(0, top);
  }
  function pinLog() {
    log.addEventListener('scroll', function () { stick = log.scrollHeight - log.scrollTop - log.clientHeight < 48; }, { passive: true });
    var keep = function () { if (stick) log.scrollTop = log.scrollHeight; };
    if (window.MutationObserver) new MutationObserver(keep).observe(log, { childList: true, subtree: true, characterData: true });
    if (window.ResizeObserver) new ResizeObserver(keep).observe(log);
  }
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
  // Blocked by the team: this browser remembers the chat it was blocked in and sends it with every request (blk), so a
  // fresh chat stays blocked; the server decides, and a lifted or expired block clears it (sayHello).
  var BLK_KEY = 'mkc_blk';
  function blkId() { try { return localStorage.getItem(BLK_KEY) || ''; } catch (e) { return ''; } }
  function setBlocked() {
    if (S.blocked) return;
    S.blocked = true; S.live = false;
    track('blocked', {});
    try { if (!blkId() && S.conv) localStorage.setItem(BLK_KEY, S.conv.c); } catch (e) {}
    // Nothing left on screen offers what the block takes away.
    log.querySelectorAll('form.mkc-form, .mkc-waitbox, .mkc-reach').forEach(function (n) { n.remove(); });
    log.querySelectorAll('.mkc-no:not(:disabled)').forEach(function (n) { n.textContent = COPY.notReally; });
    head();
  }

  // -- the server: text/plain JSON, one round trip, no cookie --
  function apiBase() {
    if (window.MKT && MKT.apiBase) return MKT.apiBase;
    var h = location.hostname;
    if (h === 'localhost' || h.indexOf('127.') === 0 || /^dev[.-]/.test(h)) return 'https://dev-api.maketzo.co';
    if (/^staging[.-]/.test(h)) return 'https://staging-api.maketzo.co';
    return 'https://api.maketzo.co';
  }
  // A visitor signed in to MAKETZO: the sign-in's readable cookie (mkt_csrf, the one the nav reads before first paint)
  // is on the page. Only then does the chat send the session with its requests, so the server attaches their account
  // and never asks for an email (the plan's default). Everyone else's requests carry no cookies, as before.
  function signedIn() { try { return /(?:^|;\s*)mkt_csrf=/.test(document.cookie); } catch (e) { return false; } }
  // The chat has somewhere to reply: an email given, or the account of a signed-in visitor (hello said so).
  function hasEmail() { return !!(S.emailGiven || S.account); }
  // keep: the request outlives the page (a tap on an answer's link leaves it at once).
  function post(path, body, keep) {
    body = body || {};
    var blk = blkId(); if (blk && body.blk === undefined) body.blk = blk;
    return fetch(apiBase() + '/support/' + path, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), credentials: signedIn() ? 'include' : 'omit', mode: 'cors', keepalive: !!keep
    }).then(function (r) {
      if (r.status === 204) return {};
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (j && j.blocked && S.built) setBlocked();
        if (r.ok) return j;
        var e = new Error(j.error || COPY.error); e.status = r.status; e.ended = !!j.ended; e.state = j.state; e.blocked = !!j.blocked; throw e;
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
      + '<div class="mkc-who"><div class="mkc-top"><b class="mkc-name">' + esc(COPY.name) + '</b>'
      + '<button type="button" class="mkc-end" data-act="end" hidden>' + esc(COPY.endChat) + '</button></div>'
      + '<div class="mkc-status"><span class="mkc-dot"></span><span class="mkc-line">' + esc(COPY.lineOff) + '</span></div></div>'
      + '<button type="button" class="mkc-icon" data-act="mute" hidden></button>'
      + '<button type="button" class="mkc-icon" data-act="close" aria-label="' + esc(COPY.close) + '">' + IC.down + '</button></header>'
      + '<div class="mkc-body"><div class="mkc-log" role="log" aria-live="polite"></div><div class="mkc-art" hidden></div></div>'
      + '<form class="mkc-compose" autocomplete="off" novalidate><label class="mkc-sr" for="mkcIn">' + esc(COPY.question) + '</label>'
      + '<input class="mkc-in" id="mkcIn" name="q" placeholder="' + esc(COPY.placeholder) + '" maxlength="300" enterkeyhint="send">'
      + '<button class="mkc-send" type="submit" aria-label="' + esc(COPY.send) + '">' + IC.send + '</button></form>'
      + '<div class="mkc-foot"><span>' + esc(COPY.footLeft) + '</span></div>';
    root.appendChild(panel);
    log = panel.querySelector('.mkc-log');
    pinLog();
    art = panel.querySelector('.mkc-art');
    input = panel.querySelector('.mkc-in');
    sendBtn = panel.querySelector('.mkc-send');
    footL = panel.querySelector('.mkc-foot span');
    footO = button('mkc-link', COPY.otherLink, other);
    footO.hidden = true;
    panel.querySelector('.mkc-foot').insertBefore(footO, footL);
    footR = button('mkc-link', COPY.emailUs, footAction);
    panel.querySelector('.mkc-foot').appendChild(footR);
    muteBtn = panel.querySelector('[data-act="mute"]');
    muteBtn.addEventListener('click', function () { setMute(!muted()); });
    endBtn = panel.querySelector('[data-act="end"]');
    endBtn.addEventListener('click', endChat);
    paintMute();
    panel.querySelector('[data-act="close"]').addEventListener('click', function () { setOpen(false); });
    panel.querySelector('.mkc-compose').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim();
      var withPerson = S.state === 'waiting' || S.state === 'live';
      if (v.length < (withPerson ? 1 : 2)) { input.focus(); return; }
      input.value = '';
      if (withPerson) sayIt(v); else ask(v, false);
    });
    // The visitor typing to a person: a dot signal, at most every 3 seconds. Never the words.
    input.addEventListener('input', function () {
      if ((S.state === 'waiting' || S.state === 'live') && input.value && Date.now() - S.typedAt > 3000) { S.typedAt = Date.now(); post('typing', withConv({})).catch(function () {}); }
    });
    // The browser plays the chime only after the visitor has touched the page.
    panel.addEventListener('pointerdown', unlockAudio, { passive: true });
    panel.addEventListener('keydown', unlockAudio);
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
      S.unread = 0; badge(); stopFlash();
      if (!S.said) { S.said = true; firstView(from); } else loop();
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
    sayHello();
    restore(saved);
  }
  // Is a person on, and the suggested questions for this page.
  function sayHello() {
    post('hello', firstFacts({ seen: seenList() })).then(function (j) {
      // The server's word on a block: lifted or over, and this browser forgets it.
      if (!j.blocked && S.blocked) S.blocked = false;
      if (!j.blocked) { try { localStorage.removeItem(BLK_KEY); } catch (e) {} }
      if (!(S.state === 'waiting' || S.state === 'live')) S.live = !!j.live;
      if (Array.isArray(j.chips)) S.chips = j.chips;
      // Signed in: their account's email is used, so no form asks for one.
      S.account = !!j.account;
      var ch = log.querySelector('.mkc-chips');
      if (ch && S.chips) fillChips(ch);
      var sub = log.querySelector('.mkc-sub');
      if (sub) sub.textContent = S.live ? COPY.subOn : COPY.sub;
      head();
    }).catch(function () {});
  }
  // End Chat: a labelled button in the chat's header whenever there is a chat (Ed's picks, 2026-11-16: the header
  // button, then "a way to log out of the chat so it resets and then prompted for feedback"). The thread is kept across
  // visits on purpose; this ends it, starts the panel fresh, and asks how the chat was. A chat still waiting on the
  // team's emailed reply is not closed (the reply arrives by email with its link back) and is not rated yet.
  function endChat() {
    var was = S.state, ended = S.conv, known = hasEmail(), pending = withTeam(), asked = S.rated || !!log.querySelector('.mkc-rate');
    if (!ended) return;
    if (!pending) post('close', withConv({})).catch(function () {});
    track('end', { by: 'visitor', from: was });
    clearTimeout(loopT);
    forget();
    S.replied = false; S.missedOnce = false; S.everLive = false; S.rated = false; S.rep = null; S.v = null; S.lastSeq = 0; S.unread = 0; S.waitStart = 0;
    endWait(); dropDots(); closeArticle(); badge();
    log.innerHTML = '';
    add(el('div', 'mkc-sys')).textContent = COPY.endedYou;
    if (!S.blocked) transcriptLink(ended, known);
    if (pending) add(el('div', 'mkc-note')).textContent = COPY.stillWithTeam;
    else if (!asked && !S.blocked) rate(null, ended);
    // The new chat suggests questions other than the ones just offered (none show until the server picks them).
    remember(S.chips); S.chips = null;
    hello(); head(); sayHello();
    input.value = '';
    log.scrollTop = 0; stick = false;
  }
  // The chat so far for this browser, or the welcome. Also how a page with a live chat picks it up in the background.
  function restore(saved) {
    if (!saved) { hello(); head(); return; }
    S.conv = { c: saved.c, t: saved.t };
    S.state = saved.st;
    var wait = add(el('div', 'mkc-wait', esc(COPY.loading)));
    post('sync', withConv({ after: 0 })).then(function (j) {
      wait.remove();
      thread(j);
      // Keep checking while the panel is open (every 10 seconds without a person), so a person coming online or a
      // reply from the team shows without a reload.
      loop();
    }).catch(function (e) {
      wait.remove();
      if (e.ended) forget();
      hello(); head();
    });
  }

  function hello() {
    add(el('div', '', '<p class="mkc-hello">' + esc(COPY.hello) + '<br>' + esc(COPY.hello2) + '</p><p class="mkc-sub">' + esc(S.live ? COPY.subOn : COPY.sub) + '</p>'));
    fillChips(add(el('div', 'mkc-chips')));
  }
  // The suggested questions come only from the server, which offers only ones the chat can answer right now (Ed,
  // 2026-11-16: a suggested question that found nothing). Until it answers, or when it has none, there are none.
  function fillChips(box) {
    box.innerHTML = '';
    (S.chips || []).forEach(function (q) {
      box.appendChild(button('mkc-chip', q, function () { ask(q, true); }));
    });
    box.hidden = !box.childNodes.length;
  }

  // -- the chat so far (another page, a reload, or the reply email's link) --
  function thread(j) {
    S.state = j.state || S.state;
    S.emailGiven = !!j.emailGiven;
    S.live = !!j.live;
    liveFacts(j);
    saveConv();
    var msgs = j.messages || [];
    if (!msgs.length) { hello(); head(); return; }
    msgs.forEach(function (m) {
      S.lastSeq = Math.max(S.lastSeq, Number(m.seq) || 0);
      if (m.kind === 'visitor') { var b = add(el('div', 'mkc-me')); b.textContent = m.body || ''; b.setAttribute('data-seq', m.seq); }
      else if (m.kind === 'results') results(m.results || [], m.qid, false);
      else if (m.kind === 'rep') { S.replied = true; repLine(m); }
      else if (m.kind === 'system') systemLine(m);
    });
    if (S.state === 'email' && !S.replied) alreadyNote();
    if (S.state === 'waiting') waitBox();
    if (S.replied && !j.rated && S.state !== 'live' && S.state !== 'waiting') rate();
    head();
    paintLiveBits(j);
    loop();
  }
  function repLine(m) {
    var who = m.alias || 'MAKETZO';
    add(el('div', 'mkc-rep', '<span class="mkc-mark" aria-hidden="true">' + esc(who.charAt(0).toUpperCase()) + '</span>'
      + '<div><p class="mkc-meta">' + esc(who) + ' &middot; ' + esc(clock(m.at)) + '</p><div class="mkc-bub"></div></div>'))
      .querySelector('.mkc-bub').textContent = m.body || '';
  }
  function systemLine(m) {
    if (m.code === 'note') { add(el('div', 'mkc-me')).textContent = m.body || ''; return; }
    var name = m.alias || 'MAKETZO';
    if (m.code === 'joined' || m.code === 'handed') S.everLive = true;
    var text = {
      emailed: COPY.sent, 'rated-yes': COPY.ratedYes, 'rated-no': COPY.ratedNo,
      joined: COPY.joined.replace('{name}', name),
      handed: COPY.handed.replace('{from}', m.from || 'MAKETZO').replace('{name}', name),
      ended: m.blocked ? COPY.endedBlocked : m.by === 'visitor' ? COPY.endedYou : COPY.endedRep.replace('{name}', name)
    }[m.code];
    if (text) add(el('div', 'mkc-sys')).textContent = text;
    if (m.code === 'missed') { S.missedOnce = true; add(el('div', 'mkc-note')).textContent = COPY.missed; }
  }

  // -- a question --
  function ask(q, chip) {
    if (S.busy) return;
    var ch = log.querySelector('.mkc-chips'); if (ch) ch.remove();
    closeArticle();
    S.asked = add(el('div', 'mkc-me'));
    S.asked.textContent = q;
    // "Hello" is not a question: it gets a hello back and the suggested questions, not "nothing answers that".
    // Nothing is sent or stored for it.
    if (!chip && GREETING.test(q)) return greet();
    // Only a suggested question is remembered, never what the visitor typed.
    if (chip) remember([q]);
    send(q, chip, true);
  }
  // then / failed: the email path asks a first question before it sends; they run after the answer, or after an error.
  function send(q, chip, retry, then, failed) {
    S.busy = true; sendBtn.disabled = true;
    // The search line with its dots shows for at least THINK_MS (Ed, 2026-11-16: the answer "came back too fast, I'd
    // prefer a slight delay with the thinking animation"). It says what is happening, a search of the help library,
    // so the pause is never passed off as a person typing.
    var started = Date.now(), slow = null;
    var wait = add(el('div', 'mkc-wait mkc-think', '<span class="mkc-dots" data-motion-keep aria-hidden="true"><i></i><i></i><i></i></span><span>' + esc(COPY.searching) + '</span>'));
    var body = withConv({ q: q });
    // ms feeds the server's too-fast rule (a first question under 0.8 s after opening is treated as a bot). A tapped
    // suggestion is left out of it: a quick tap is a person, and the rule answered one with "Nothing in our help
    // library answers that" (the harness hit it 2026-11-16; Ed's earlier "Major bug" was the same miss for a chip).
    if (!S.conv) { firstFacts(body); if (!chip) body.ms = S.shownAt ? Date.now() - S.shownAt : 0; }
    post('ask', body).then(function (j) {
      return new Promise(function (ok) { setTimeout(function () { ok(j); }, Math.max(0, THINK_MS - (Date.now() - started))); });
    }).then(function (j) {
      clearTimeout(slow); if (wait) wait.remove();
      S.busy = false; sendBtn.disabled = false;
      if (j.c && j.t) S.conv = { c: j.c, t: j.t };
      // The question as sent, strong words hidden: the newest line that reads exactly what was typed.
      if (j.said) {
        var mine = log.querySelectorAll('.mkc-me');
        for (var i = mine.length - 1; i >= 0; i--) { if (mine[i].textContent === q) { mine[i].textContent = j.said; break; } }
      }
      S.emailGiven = !!j.emailGiven;
      if (typeof j.live === 'boolean') S.live = j.live;
      if (S.state === 'closed') S.state = 'bot';
      saveConv();
      head();
      track('ask', { matched: j.matched ? 'yes' : 'no', results: (j.results || []).length, top: j.results && j.results[0] ? j.results[0].kind : 'none', chip: chip ? 'yes' : 'no' });
      results(j.results || [], j.qid, !then);
      if (!then) toQuestion(S.asked);
      loop();
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
      var person = live && personOffered();
      // Blocked: the miss is said plainly, with no promise of a reply.
      add(el('div', 'mkc-card', '<b class="mkc-title">' + esc(COPY.noneTitle) + '</b>' + (S.blocked ? '' : '<p>' + esc(person ? COPY.noneBodyOn : COPY.noneBody) + '</p>')));
      if (live && !S.blocked && (person || S.state !== 'email')) add(el('div', 'mkc-row mkc-reach')).appendChild(button('mkc-b mkc-b--gold', person ? COPY.talk : COPY.emailUs, function () { reach(); }));
      return;
    }
    list.forEach(function (x) { add(x.kind === 'answer' ? answerCard(x, qid) : articleCard(x, qid)); });
    if (!live) return;
    var box = add(el('div', 'mkc-ask', '<p>' + esc(COPY.didIt) + '</p>'));
    var row = box.appendChild(el('div', 'mkc-row'));
    var yes = row.appendChild(button('mkc-b', COPY.helped));
    var no = row.appendChild(button('mkc-b mkc-no', S.blocked ? COPY.notReally : personOffered() ? COPY.talk : COPY.emailUs));
    function pick(b, helpful) {
      b.setAttribute('aria-pressed', 'true'); yes.disabled = no.disabled = true;
      track('helpful', { helpful: helpful ? 'yes' : 'no' });
      post('feedback', withConv({ qid: qid, helpful: helpful ? 1 : 0 })).catch(function () {});
      if (helpful) add(el('div', 'mkc-note')).textContent = COPY.glad;
      else if (!S.blocked) reach();
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
      a.addEventListener('click', function (ev) {
        opened(qid, x.link.path, 'answer', true);
        // Already on that page (Ed, 2026-11-16, on /system: "I clicked See How it Works and nothing happened"): a reload
        // only reopened the chat over the same page. Close the chat and show the page from its top instead.
        if (x.link.path.indexOf('#') < 0 && samePage(x.link.path)) {
          ev.preventDefault();
          setOpen(false);
          window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
        }
      });
    }
    return c;
  }
  // "/system", "/system.html" and "/system/" are one page; the query string does not make another.
  function samePage(p) {
    var norm = function (s) { return (String(s).split('?')[0].replace(/\.html$/, '').replace(/\/+$/, '') || '/').toLowerCase(); };
    return norm(p) === norm(location.pathname);
  }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
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

  // -- a person: live when someone is online (personForm), otherwise an email to the team (emailForm) --
  // A chat already sent to the team by email can still reach a person once someone is online (Ed, 2026-11-16: "There's
  // no way to get to a live agent"; his test chat had gone to email before live chat was on, and the panel used to
  // rule a person out for good from then on). The server takes a person request from bot, email, missed or closed.
  function personOffered() { return S.live && !S.missedOnce && !S.blocked; }
  // Sent to the team by email and not yet answered: anything typed here is added to it.
  function withTeam() { return S.state === 'email' && S.emailGiven && !S.replied; }
  // Said once: asking again moves the note to the bottom instead of stacking copies (Ed, 2026-11-16: "Trying to click
  // Email us and keep getting the same message").
  function alreadyNote() {
    Array.prototype.forEach.call(log.querySelectorAll('.mkc-note.is-already'), function (n) { n.remove(); });
    add(el('div', 'mkc-note is-already')).textContent = COPY.already;
  }
  function reach() {
    if (S.blocked) return;
    if (personOffered() && (S.state === 'bot' || S.state === 'closed' || S.state === 'missed' || S.state === 'email')) return personForm();
    return emailForm();
  }
  function emailForm(title) {
    if (S.blocked) return;
    build();
    if (!S.open) setOpen(true);
    closeArticle();
    var open = log.querySelector('form.mkc-form[data-k="email"]');
    if (open) { (open.querySelector('input:not(.mkc-hp), textarea')).focus(); return; }
    // Already sent and not yet answered: the team has it. After a reply, they can write again without retyping.
    if (withTeam()) { alreadyNote(); input.focus(); return; }
    var needQ = !S.conv, askEmail = !hasEmail();
    var f = add(el('form', 'mkc-form'));
    f.setAttribute('data-k', 'email');
    f.noValidate = true;
    f.innerHTML = '<p><b>' + esc(title || (askEmail ? COPY.emailAsk : COPY.moreAsk)) + '</b></p>'
      + (askEmail ? '<label class="mkc-sr" for="mkcEm">' + esc(COPY.emailLabel) + '</label>'
        + '<input class="mkc-in" id="mkcEm" type="email" autocomplete="email" inputmode="email" placeholder="' + esc(COPY.emailPh) + '" maxlength="160" required>' : '')
      + '<label class="mkc-sr" for="mkcNote">' + esc(needQ ? COPY.question : COPY.noteLabel) + '</label>'
      + '<textarea class="mkc-in" id="mkcNote" maxlength="1000" placeholder="' + esc(needQ ? COPY.questionPh : COPY.notePh) + '"></textarea>'
      + (askEmail ? newsBox() : '')
      + '<input class="mkc-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<div class="mkc-row"><button class="mkc-b mkc-b--gold" type="submit">' + esc(COPY.send) + '</button></div>'
      + '<p class="mkc-note is-error" hidden></p>';
    tickNews(f);
    var em = f.querySelector('#mkcEm'), note = f.querySelector('#mkcNote'), nl = f.querySelector('input[type=checkbox]');
    var hp = f.querySelector('.mkc-hp'), go = f.querySelector('button[type=submit]'), err = f.querySelector('.is-error');
    function problem(text) { err.textContent = text; err.hidden = !text; }
    function back() { f.hidden = false; go.disabled = false; log.appendChild(f); toEnd(); }
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
          S.state = 'email'; S.emailGiven = true; S.replied = false; saveConv(); endWait(); head();
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

  // -- the newsletter box: ticked, except in the EU, where it must start empty. It starts empty here and is ticked once
  // the visitor is known not to be in the EU, so a failed lookup leaves it empty; a box they already touched is theirs. --
  function newsBox() { return '<label class="mkc-check"><input type="checkbox" data-nl> ' + esc(COPY.newsletter) + '</label>'; }
  function tickNews(f) {
    var nl = f.querySelector('input[data-nl]');
    if (!nl) return;
    nl.addEventListener('change', function () { nl.setAttribute('data-touched', ''); });
    function set(on) { if (!nl.hasAttribute('data-touched')) nl.checked = on; }
    try {
      if (window.MKT && MKT.isEuVisitor) MKT.isEuVisitor().then(function (eu) { set(!eu); }).catch(function () {});
      else set(true);
    } catch (e) {}
  }

  // -- "Email Me This Chat": the whole thread to the visitor's inbox. conv: a chat the panel has already moved on from
  // (End Chat), with known saying whether that chat has their email. --
  function transcriptLink(conv, known) {
    if (known === undefined) known = hasEmail();
    var row = add(el('div', 'mkc-row mkc-tr'));
    var b = row.appendChild(button('mkc-link', COPY.transcript));
    b.addEventListener('click', function () {
      if (known) return sendTranscript(b, {}, conv);
      b.remove();
      var f = row.appendChild(el('form', 'mkc-form'));
      f.noValidate = true;
      f.innerHTML = '<p><b>' + esc(COPY.transcriptAsk) + '</b></p><label class="mkc-sr" for="mkcTr">' + esc(COPY.emailLabel) + '</label>'
        + '<input class="mkc-in" id="mkcTr" type="email" autocomplete="email" inputmode="email" placeholder="' + esc(COPY.emailPh) + '" maxlength="160">'
        + newsBox()
        + '<div class="mkc-row"><button class="mkc-b mkc-b--gold" type="submit">' + esc(COPY.send) + '</button></div><p class="mkc-note is-error" hidden></p>';
      tickNews(f);
      var em = f.querySelector('#mkcTr'), err = f.querySelector('.is-error');
      em.focus();
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!EMAIL_RE.test(em.value.trim())) { err.textContent = COPY.badEmail; err.hidden = false; return; }
        var done = row.appendChild(button('mkc-link', COPY.transcript));
        f.remove();
        known = true;
        sendTranscript(done, { email: em.value.trim(), newsletter: f.querySelector('input[data-nl]').checked ? 1 : 0 }, conv);
      });
    });
  }
  function sendTranscript(b, extra, conv) {
    b.disabled = true;
    var body = conv ? Object.assign({ c: conv.c, t: conv.t }, extra) : withConv(extra);
    post('transcript', body).then(function () {
      b.textContent = COPY.transcriptSent;
      // The email belongs to the chat it was given for, not to a fresh one started since End Chat.
      if (extra.email && !conv) S.emailGiven = true;
      track('transcript', { from: conv ? 'ended' : 'chat' });
    }).catch(function (e) { b.disabled = false; add(el('div', 'mkc-note is-error')).textContent = e.message; });
  }

  // -- at the end of a chat: one rating, with a comment box only after a tap. conv: the chat being rated, when the panel
  // has already moved on from it (End Chat) --
  function rate(preset, conv) {
    var withIt = function (b) { if (conv) { b.c = conv.c; b.t = conv.t; return b; } return withConv(b); };
    var box = add(el('div', 'mkc-rate', '<p><b>' + esc(COPY.rateAsk) + '</b></p>'));
    var th = box.appendChild(el('div', 'mkc-thumbs'));
    var up = th.appendChild(el('button', 'mkc-thumb', IC.up)), dn = th.appendChild(el('button', 'mkc-thumb', IC.dn));
    up.type = dn.type = 'button';
    up.setAttribute('aria-label', COPY.good); dn.setAttribute('aria-label', COPY.bad);
    up.setAttribute('aria-pressed', 'false'); dn.setAttribute('aria-pressed', 'false');
    function pick(b) {
      var rating = b === up ? 'up' : 'down';
      up.setAttribute('aria-pressed', b === up ? 'true' : 'false'); dn.setAttribute('aria-pressed', b === dn ? 'true' : 'false');
      post('rate', withIt({ rating: rating })).catch(function () {});
      track('rate', { rating: rating, via: 'chat' });
      if (box.querySelector('form')) return;
      comment(box, rating, COPY.better, withIt);
    }
    up.addEventListener('click', function () { pick(up); });
    dn.addEventListener('click', function () { pick(dn); });
    if (preset) pick(preset === 'up' ? up : dn);
  }
  function comment(box, rating, prompt, withIt) {
    withIt = withIt || withConv;
    var f = box.appendChild(el('form', ''));
    f.innerHTML = '<label class="mkc-sr" for="mkcRc">' + esc(prompt) + '</label><textarea class="mkc-in" id="mkcRc" maxlength="1000" placeholder="' + esc(prompt) + '"></textarea>'
      + '<div class="mkc-row"><button class="mkc-b mkc-b--gold" type="submit">' + esc(COPY.send) + '</button></div>';
    f.querySelector('.mkc-row').appendChild(button('mkc-b', COPY.skip, function () { box.innerHTML = '<p><b>' + esc(COPY.thanks) + '</b></p>'; }));
    toEnd();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = f.querySelector('textarea').value.trim();
      if (text) post('rate', withIt({ rating: rating, comment: text })).catch(function () {});
      // Ed, 2026-11-16, on "Thanks. We read every one.": "Doesn't make sense". Say what happened to what they gave.
      box.innerHTML = '<p><b>' + esc(text ? COPY.thanksNote : COPY.thanks) + '</b></p>';
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

  // -- live chat (phase B, 2026-11-16) --
  // A person, when someone is online. The panel holds one request open while the chat waits or is live (POST
  // /support/sync with hold), so a join, a reply or a typing signal shows within a second; hidden, it checks every 15
  // seconds. Typing dots show only while a real rep is typing, and stop on their own. The chime plays only when the
  // panel is closed or the tab is hidden, never before the visitor has touched the page, and can be muted.
  function liveFacts(j) {
    if (!j) return;
    if (j.rep !== undefined) S.rep = j.rep;
    if (j.v) S.v = j.v;
    if (j.waited != null) S.waitStart = Date.now() - j.waited * 1000;
    if (j.state === 'live') S.everLive = true;
    if (j.rated) S.rated = true;
  }
  function head() {
    if (!S.built) return;
    var name = panel.querySelector('.mkc-name'), line = panel.querySelector('.mkc-line'), dot = panel.querySelector('.mkc-dot'), mark = panel.querySelector('.mkc-head .mkc-mark');
    var st = S.state, withPerson = st === 'live' || st === 'waiting';
    if (st === 'live' && S.rep) {
      mark.className = 'mkc-mark is-rep'; mark.textContent = S.rep.charAt(0).toUpperCase(); name.textContent = S.rep; line.textContent = COPY.lineRep; dot.className = 'mkc-dot is-on';
    } else {
      mark.className = 'mkc-mark'; mark.textContent = 'M'; name.textContent = COPY.name;
      if (st === 'waiting') { dot.className = 'mkc-dot is-wait'; line.textContent = COPY.lineWait; }
      else if (personOffered()) { dot.className = 'mkc-dot is-on'; line.textContent = COPY.lineOn; }
      else { dot.className = 'mkc-dot'; line.textContent = S.blocked ? COPY.footLeft : COPY.lineOff; }
    }
    muteBtn.hidden = !withPerson;
    endBtn.hidden = !S.conv;
    footO.hidden = st !== 'live';
    footL.hidden = st === 'live';
    footR.textContent = st === 'live' ? COPY.endChat : st === 'waiting' ? COPY.emailUs : (personOffered() ? COPY.talk : COPY.emailUs);
    // Already with the team by email and nobody online: there is nothing for Email Us to do.
    footR.hidden = st === 'live' || S.blocked || (withTeam() && !personOffered());
    // The reply box says the person's first name only (Ed, 2026-11-16: "Message John Hanshe... Maybe Message John").
    input.placeholder = st === 'live' ? COPY.messagePh.replace('{name}', (S.rep || 'MAKETZO').split(' ')[0]) : st === 'waiting' ? COPY.waitPh : COPY.placeholder;
    input.maxLength = withPerson ? 1000 : 300;
  }
  function footAction() {
    if (S.state === 'live') return endChat();
    if (S.state === 'waiting') return emailForm();
    reach();
  }

  // "Talk to a Person": the email first, with the reason, and skippable; the question too when none was asked yet.
  function personForm() {
    if (S.blocked) return;
    build();
    if (!S.open) setOpen(true);
    closeArticle();
    var open = log.querySelector('form.mkc-form[data-k="person"]');
    if (open) { open.querySelector('input:not(.mkc-hp), textarea').focus(); return; }
    var needQ = !S.conv, known = hasEmail();
    if (known && !needQ) return askPerson({});
    var f = add(el('form', 'mkc-form'));
    f.setAttribute('data-k', 'person');
    f.noValidate = true;
    f.innerHTML = (needQ ? '<p><b>' + esc(COPY.hello2) + '</b></p><label class="mkc-sr" for="mkcPq">' + esc(COPY.question) + '</label>'
        + '<textarea class="mkc-in" id="mkcPq" maxlength="300" placeholder="' + esc(COPY.questionPh) + '"></textarea>' : '')
      + (known ? '' : '<p>' + (needQ ? esc(COPY.personAsk) : '<b>' + esc(COPY.personAsk) + '</b>') + '</p><label class="mkc-sr" for="mkcPe">' + esc(COPY.emailLabel) + '</label>'
        + '<input class="mkc-in" id="mkcPe" type="email" autocomplete="email" inputmode="email" placeholder="' + esc(COPY.emailPh) + '" maxlength="160">'
        + newsBox())
      + '<input class="mkc-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<div class="mkc-row"><button class="mkc-b mkc-b--gold" type="submit">' + esc(COPY.goOn) + '</button>'
      + (known ? '' : '<button class="mkc-b" type="button" data-skip>' + esc(COPY.skip) + '</button>') + '</div>'
      + '<p class="mkc-note is-error" hidden></p>';
    tickNews(f);
    var q = f.querySelector('#mkcPq'), em = f.querySelector('#mkcPe'), nl = f.querySelector('input[data-nl]'), hp = f.querySelector('.mkc-hp'), err = f.querySelector('.is-error');
    function problem(t) { err.textContent = t; err.hidden = !t; }
    function go(withEmail) {
      var email = withEmail && em ? em.value.trim() : '';
      if (email && !EMAIL_RE.test(email)) { problem(COPY.badEmail); em.focus(); return; }
      var text = q ? q.value.trim() : '';
      if (q && !S.conv && text.length < 2) { problem(COPY.needQuestion); q.focus(); return; }
      problem('');
      var extra = { email: email || undefined, newsletter: email && nl && nl.checked ? 1 : 0, hp: hp.value };
      f.remove();
      if (q && !S.conv) {
        add(el('div', 'mkc-me')).textContent = text;
        send(text, false, true, function () { askPerson(extra); }, function () { log.appendChild(f); });
      } else askPerson(extra);
    }
    f.addEventListener('submit', function (e) { e.preventDefault(); go(true); });
    var skip = f.querySelector('[data-skip]');
    if (skip) skip.addEventListener('click', function () { go(false); });
    (q || em).focus();
  }
  function askPerson(extra) {
    track('reach', { live: 'yes', email: extra && extra.email ? 'yes' : 'no' });
    post('person', withConv(extra || {})).then(function (j) {
      if (j.next === 'email') { S.live = false; head(); return emailForm(); }
      if (extra && extra.email) S.emailGiven = true;
      var was = S.state;
      S.state = j.state || S.state;
      S.emailGiven = S.emailGiven || !!j.emailGiven;
      liveFacts(j);
      saveConv();
      if (S.state === 'waiting' && was !== 'waiting') { track('wait', {}); waitBox(COPY.waitNote); }
      head(); paintLiveBits(j); loop();
    }).catch(function (e) { add(el('div', 'mkc-note is-error')).textContent = e.message; });
  }

  // Waiting: what is happening, and for how long (on the server's clock). Never a queue position.
  var waitEl = null, waitT = null;
  function waitBox(text) {
    endWait(true);
    waitEl = add(el('div', 'mkc-waitbox', '<span></span><time></time>'));
    waitEl.querySelector('span').textContent = text || COPY.waitNote;
    if (!S.waitStart) S.waitStart = Date.now();
    var tick = function () {
      if (!waitEl || S.state !== 'waiting') { clearInterval(waitT); return; }
      var s = Math.max(0, Math.floor((Date.now() - S.waitStart) / 1000));
      waitEl.querySelector('time').textContent = Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
    };
    tick();
    waitT = setInterval(tick, 1000);
  }
  function endWait(keepClock) { clearInterval(waitT); if (waitEl) waitEl.remove(); waitEl = null; if (!keepClock) S.waitStart = 0; }

  // The held request. Visible and with a person: held until something changes. Hidden: every 15 seconds. An answers
  // chat with the panel open: every 10 seconds, so an admin who enters the chat at will is seen.
  var loopT = null, looping = false;
  function wantLoop() { return !!S.conv && (S.state === 'waiting' || S.state === 'live' || (S.open && !document.hidden)); }
  function loop() {
    clearTimeout(loopT);
    if (!wantLoop() || looping) return;
    looping = true;
    var withPerson = S.state === 'waiting' || S.state === 'live';
    var hold = withPerson && !document.hidden;
    var body = withConv({ after: S.lastSeq, hold: hold ? 1 : 0 });
    if (hold && S.v) body.v = S.v;
    if (S.open && !document.hidden) body.read = S.lastSeq;
    var t0 = Date.now(), ok = true, v0 = S.v, n0 = S.lastSeq, c0 = S.conv;
    // A reply for a chat the visitor has since left (New Chat) is dropped.
    post('sync', body).then(function (j) { if (S.conv === c0) apply(j); }).catch(function (e) {
      ok = false;
      if (e.ended && S.conv === c0) { S.state = 'closed'; endWait(); dropDots(); saveConv(); head(); }
    }).then(function () {
      looping = false;
      if (!wantLoop()) return;
      var p = S.state === 'waiting' || S.state === 'live';
      // A quick answer with nothing new waits a moment (never a hot loop); one that brought something goes again at
      // once, which also tells the server the visitor now has it on screen (Seen).
      var changed = S.v !== v0 || S.lastSeq !== n0;
      var ms = !ok ? 5000 : !p ? 10000 : document.hidden ? 15000 : (!changed && Date.now() - t0 < 400 ? 1500 : 0);
      loopT = setTimeout(loop, ms);
    });
  }
  // What came back: new replies and system lines (the visitor's own lines are already on screen), the state, the dots.
  function apply(j) {
    var was = S.state;
    S.state = j.state || S.state;
    S.emailGiven = S.emailGiven || !!j.emailGiven;
    if (typeof j.live === 'boolean' && S.state !== 'waiting' && S.state !== 'live') S.live = j.live;
    liveFacts(j);
    var fresh = 0, arrived = false;
    (j.messages || []).forEach(function (m) {
      if (Number(m.seq) <= S.lastSeq) return;
      S.lastSeq = Number(m.seq);
      if (m.kind === 'rep') { S.replied = true; dropDots(); repLine(m); fresh++; }
      else if (m.kind === 'system' && (m.code === 'joined' || m.code === 'handed' || m.code === 'missed' || (m.code === 'ended' && m.by !== 'visitor'))) {
        systemLine(m);
        if (m.code === 'joined' || m.code === 'handed') arrived = true;
      }
    });
    if (was !== S.state) {
      if (S.state === 'live') { if (was === 'waiting') track('joined', { waited_s: S.waitStart ? Math.round((Date.now() - S.waitStart) / 1000) : 0 }); endWait(); }
      else if (S.state === 'waiting' && was === 'live') waitBox(COPY.waitOther);
      else if (S.state === 'missed') { endWait(); track('missed', {}); if (!hasEmail()) emailForm(COPY.missedAsk); }
      else if (S.state === 'closed') {
        endWait(); dropDots();
        if (S.everLive && !S.blocked && !log.querySelector('.mkc-tr')) transcriptLink();
        if (S.everLive && !S.blocked && !j.rated && !log.querySelector('.mkc-rate')) rate();
      }
    }
    if (fresh || arrived) newReply(fresh);
    saveConv();
    head();
    paintLiveBits(j);
  }
  // The rep typing (dots, redrawn on each signal so the three-beat animation restarts and never loops on its own), and
  // Seen under the visitor's last message once the rep has read it.
  var dotsEl = null;
  function dropDots() { if (dotsEl) { dotsEl.remove(); dotsEl = null; } }
  function paintLiveBits(j) {
    if (!S.built) return;
    dropDots();
    if (S.state === 'live' && j && j.repTyping) {
      var who = S.rep || 'MAKETZO';
      dotsEl = add(el('div', 'mkc-rep mkc-typing', '<span class="mkc-mark" aria-hidden="true">' + esc(who.charAt(0).toUpperCase()) + '</span>'
        + '<div><div class="mkc-bub"><span class="mkc-dots" data-motion-keep role="img" aria-label="' + esc(COPY.typing.replace('{name}', who)) + '"><i></i><i></i><i></i></span></div></div>'));
    }
    var seen = log.querySelector('.mkc-seen'); if (seen) seen.remove();
    var mine = log.querySelectorAll('.mkc-me[data-seq]');
    var last = mine.length ? mine[mine.length - 1] : null;
    if (last && j && S.state === 'live' && Number(j.repRead) >= Number(last.getAttribute('data-seq'))) last.insertAdjacentElement('afterend', el('div', 'mkc-seen', esc(COPY.seen)));
  }
  function sayIt(text) {
    var b = add(el('div', 'mkc-me'));
    b.textContent = text;
    // Strong words come back hidden (Ed, 2026-11-16, "Hide the words"): the line shows as the team sees it.
    post('say', withConv({ text: text })).then(function (j) { b.setAttribute('data-seq', j.seq); if (j.said) b.textContent = j.said; loop(); })
      .catch(function (e) {
        if (e.status === 409) { S.state = e.state || 'bot'; saveConv(); head(); }
        add(el('div', 'mkc-note is-error')).textContent = e.message;
      });
  }
  // "Talk to Someone Else": a real handoff to another admin who is online; with nobody else, the same person stays.
  function other() {
    post('other', withConv({})).then(function (j) {
      track('other', { alone: j.alone ? 'yes' : 'no' });
      if (j.next === 'email') {
        add(el('div', 'mkc-note')).textContent = COPY.otherAlone;
        add(el('div', 'mkc-row mkc-reach')).appendChild(button('mkc-b', COPY.emailUs, function () { emailForm(); }));
        return;
      }
      S.state = 'waiting'; liveFacts(j); S.waitStart = Date.now(); saveConv();
      waitBox(COPY.waitOther); head(); loop();
    }).catch(function (e) { add(el('div', 'mkc-note is-error')).textContent = e.message; });
  }
  // Sound, the unread count on the button, the tab title.
  var actx = null, flashT = null, baseTitle = document.title;
  function muted() { try { return localStorage.getItem('mkc_mute') === '1'; } catch (e) { return false; } }
  function setMute(m) { try { localStorage.setItem('mkc_mute', m ? '1' : '0'); } catch (e) {} paintMute(); track('mute', { on: m ? 'yes' : 'no' }); }
  function paintMute() {
    if (!muteBtn) return;
    var m = muted();
    muteBtn.innerHTML = m ? IC.mute : IC.snd;
    muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
    muteBtn.setAttribute('aria-label', m ? COPY.soundOn : COPY.soundOff);
  }
  function unlockAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }
  function chime() {
    if (muted() || !actx || actx.state !== 'running') return;
    var t = actx.currentTime;
    [[740, 0], [988, 0.11]].forEach(function (n) {
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = n[0];
      g.gain.setValueAtTime(0, t + n[1]); g.gain.linearRampToValueAtTime(0.11, t + n[1] + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.42);
      o.connect(g); g.connect(actx.destination); o.start(t + n[1]); o.stop(t + n[1] + 0.45);
    });
  }
  function badge() {
    var b = btn.querySelector('.mkc-badge');
    if (S.unread && !S.open) {
      if (!b) { b = el('span', 'mkc-badge'); btn.appendChild(b); }
      b.textContent = S.unread;
      btn.setAttribute('aria-label', COPY.unreadLabel.replace('{n}', S.unread));
    } else { if (b) b.remove(); btn.setAttribute('aria-label', COPY.chatLabel); }
  }
  // A sound on every reply from a person, and when one joins (Ed's spec: "a sound on answers"; 2026-11-16 "Sound works
  // in the admin - but not on the website": it used to ring only with the chat closed or the tab hidden). The speaker
  // button in the header mutes it; a browser plays it only after the visitor has touched the chat.
  function newReply(n) {
    chime();
    if (!n) return;
    if (!S.open) { S.unread += n; badge(); }
    if (document.hidden && !flashT) {
      var on = true;
      baseTitle = document.title;
      flashT = setInterval(function () { on = !on; document.title = on ? '(' + Math.max(1, S.unread || n) + ') ' + COPY.newReply : baseTitle; }, 1500);
    }
  }
  function stopFlash() { if (flashT) { clearInterval(flashT); flashT = null; document.title = baseTitle; } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { stopFlash(); if (S.conv) loop(); } });

  // A page opened while a chat waits for, or is with, a person: pick it up without opening the panel, so a reply
  // still rings and counts on the button.
  function watch() {
    build();
    if (S.said) return;
    var saved = loadConv();
    if (!saved || (saved.st !== 'waiting' && saved.st !== 'live')) return;
    S.said = true;
    restore(saved);
  }

  window.MKChat = {
    open: function (from) { setOpen(true, from); },
    close: function () { setOpen(false); },
    toggle: function (from) { setOpen(!S.open, from); },
    fromEmail: fromEmail,
    watch: watch
  };
})();
