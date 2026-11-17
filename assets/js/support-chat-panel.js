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
 *
 * ONE CHAT, TWO PLACES (Ed, 2026-11-17: "STOP BUILDING STUFF FROM SCRATCH", "Questions are different - but the
 * mechanisms should be similar"). maketzo-app runs this file as it is (a byte-identical copy, checked by the app's
 * build) with window.MKChatConfig set before it loads; the site sets none, so nothing here changes for it:
 *   src 'app'          every request says so; the server makes it the trader's App chat (their session, the app's
 *                      questions, no email asked or stored)
 *   apiBase, signedIn  where the server is, and that the session goes with every request
 *   track(name, props) the app's analytics instead of the site's
 *   page()             the app screen the trader is on, for the questions and the team
 *   copy               words that differ in the app (replies come here, not by email)
 *   article(slug)      a Promise of a Knowledge Center article with its full text (signed in, nothing is gated)
 *   hello()            the welcome's first line (the trader's first name)
 *   dismissSaw(key), checkinGood(key)   what the app records for those two taps
 * The app's own pieces show only when the server sends them: what we saw, the check-in and the team starts by the
 * trader's stage (hello), and an import's read handed over by MKChat.open('import', { read }). Each goes with the
 * trader's next message, straight to the team.
 */
(function () {
  'use strict';
  if (window.MKChat) return;
  var CFG = window.MKChatConfig || {};

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
    // after the team's emailed reply (Ed, 2026-11-17): the reply says it went to their inbox, and what they type next
    // goes to that person, not the help library
    emailedYou: 'Emailed to you',
    replyPh: 'Reply to {name}',
    footReply: '{name} replies by email',
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
    offline: 'We could not reach the chat. Check your connection and try again.',
    // Shown only when the server sends the app's pieces (see the header); the app words them through its config.
    sending: 'Sending to our team',
    teamNote: 'Our team has it and will reply within one trading day.',
    sawK: 'WHAT WE SAW',
    sawYesQ: 'Yes, look into it.',
    orStart: 'Or start with one of these.',
    teamLabel: 'Or tell our team',
    checkinGood: 'Glad to hear it. If anything gets in your way, tell us here.',
    ciOff: 'What looks off?',
    ciImport: 'What happened when you imported?',
    ciQuestion: 'What is your question?',
    // Ed, 2026-11-17: the copy must be easy to understand and put zero burden on the trader. "How the import read it"
    // was the engine's words; the trader's are "import details".
    readK: 'IMPORT DETAILS',
    readChip: 'Import details',
    readAsk: 'What looks wrong with this import?',
    readIn: '{n} trades in',
    readOut: '{n} rows left out',
    readNone: 'No trades found in {rows} rows',
    removeRead: 'Remove the import details',
    // Files (only where the page allows them: CFG.files, the app)
    attach: 'Attach a file',
    removeFile: 'Remove {name}',
    consent: 'We use this file to fix your import and to improve how MAKETZO reads files from your broker.',
    // A file waits for Send, so the trader can check what was hidden first (Ed, 2026-11-17: "Didn't receive the CSV
    // upload - where does it go?"; it read as already sent).
    sentK: 'READY TO SEND',
    sentDone: 'SENT',
    filesPh: 'Add a note, or press Send',
    hidCols: 'We hid {n}: {names}.',
    hidCol1: 'We hid 1 column: {names}.',
    hidLines: '{n} lines above the header are hidden.',
    hidLine1: '1 line above the header is hidden.',
    hidCells: '{n} other values that looked like an email, phone or card number are hidden.',
    hidCell1: '1 other value that looked like an email, phone or card number is hidden.',
    hidRest: 'Our team sees the rest of the file unchanged.',
    hidNone: 'Nothing private found, so our team sees the file unchanged.',
    shotHelp: 'Drag a box over anything private. It is removed from the picture before sending.',
    clearBoxes: 'Clear Boxes',
    fullBlack: 'BLACK OUT ANYTHING PRIVATE',
    tileBlack: 'Black Out',
    tileView: 'View',
    tileRemove: 'Remove',
    tileOpenPic: 'Open {name} to black out',
    tileOpenCsv: 'Open {name}',
    tileCols: '{n} columns hidden: {names}',
    tileCol1: '1 column hidden: {names}',
    tileNone: 'Nothing private found',
    tileBox0: 'Nothing blacked out yet',
    fullDone: 'Done',
    undoBox: 'Undo Last Box',
    fullRows: '{n} rows',
    fullFirst: 'The first {n} of {total} rows.',
    shotSent: 'Sent with {n} areas blacked out.',
    shotSent1: 'Sent with 1 area blacked out.',
    shotSent0: 'Sent with nothing blacked out.',
    chipBoxes: '{n} areas blacked out',
    chipBox1: '1 area blacked out',
    fileBig: '{name} is over 5 MB. Send a smaller file, or only the rows that matter.',
    fileMax: 'Attach up to 3 files at a time.',
    fileType: '{name} can’t be read here. Attach a CSV or text file, or a PNG or JPG picture.',
    fileExcel: 'We can’t read Excel files here yet. Save {name} as CSV and attach that.',
    filePic: 'We couldn’t open {name}. Take a screenshot (PNG or JPG) and attach that.',
    fileFailed: 'We couldn’t send {name}. Attach it again.',
    filesSent: 'Attached'
  };
  if (CFG.copy) Object.keys(CFG.copy).forEach(function (k) { if (typeof CFG.copy[k] === 'string') COPY[k] = CFG.copy[k]; });

  var IC = {
    snd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    clip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5 12 20a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
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
    open: false, built: false, busy: false, conv: null, state: 'bot', emailGiven: false, replied: false, live: false, repName: null,
    shownAt: 0, chips: null, said: false, artFrom: null,
    key: randomKey(),
    // live chat: who is answering, the chat's version (the held request waits on it), the last message seq this panel
    // has, whether a person ever joined (the rating), unread replies while closed, and a miss (email from then on)
    rep: null, v: null, lastSeq: 0, everLive: false, unread: 0, missedOnce: false, typedAt: 0,
    // files the trader attached for the next message (CFG.files only)
    files: []
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
  // The welcome reads from its top: the greeting first, however much arrives under it a moment later (the suggested
  // questions, and in the app what we saw and the team starts). Until anything is added under it.
  var welcomeTop = false;
  function toEnd() { log.scrollTop = log.scrollHeight; stick = true; welcomeTop = false; }
  function toWelcome() { log.scrollTop = 0; stick = false; welcomeTop = true; }
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
    log.addEventListener('scroll', function () { stick = !welcomeTop && log.scrollHeight - log.scrollTop - log.clientHeight < 48; }, { passive: true });
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
  function track(name, props) {
    try {
      if (CFG.track) return CFG.track(name, props || {});
      if (window.MKT && MKT.trackEvent) MKT.trackEvent('mkt_chat_' + name, props || {});
    } catch (e) {}
  }
  // The page as the server and the team see it: the site's path, or the app screen (CFG.page).
  function page() { try { if (CFG.page) return String(CFG.page() || '/'); } catch (e) {} return location.pathname; }
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
  function forget() { S.conv = null; S.state = 'bot'; S.emailGiven = false; S.repName = null; saveConv(); }
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
    if (CFG.apiBase) return CFG.apiBase;
    if (window.MKT && MKT.apiBase) return MKT.apiBase;
    var h = location.hostname;
    if (h === 'localhost' || h.indexOf('127.') === 0 || /^dev[.-]/.test(h)) return 'https://dev-api.maketzo.co';
    if (/^staging[.-]/.test(h)) return 'https://staging-api.maketzo.co';
    return 'https://api.maketzo.co';
  }
  // A visitor signed in to MAKETZO: the sign-in's readable cookie (mkt_csrf, the one the nav reads before first paint)
  // is on the page. Only then does the chat send the session with its requests, so the server attaches their account
  // and never asks for an email (the plan's default). Everyone else's requests carry no cookies, as before.
  function signedIn() { if (CFG.signedIn) return true; try { return /(?:^|;\s*)mkt_csrf=/.test(document.cookie); } catch (e) { return false; } }
  // The chat has somewhere to reply: an email given, or the account of a signed-in visitor (hello said so).
  function hasEmail() { return !!(S.emailGiven || S.account); }
  // keep: the request outlives the page (a tap on an answer's link leaves it at once).
  function post(path, body, keep) {
    body = body || {};
    if (CFG.src) body.src = CFG.src;
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
    b.p = page();
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
      + '<div class="mkc-att" hidden></div>'
      + '<form class="mkc-compose" autocomplete="off" novalidate>'
      + (CFG.files ? '<button type="button" class="mkc-clip" data-act="clip" aria-label="' + esc(COPY.attach) + '" title="' + esc(COPY.attach) + '">' + IC.clip + '</button>'
        + '<input type="file" class="mkc-sr" data-act="file" tabindex="-1" aria-hidden="true" multiple accept=".csv,.txt,.tsv,.xls,.xlsx,text/csv,text/plain,image/png,image/jpeg,image/heic,image/webp">' : '')
      + '<label class="mkc-sr" for="mkcIn">' + esc(COPY.question) + '</label>'
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
      // Files can go on their own; words otherwise need two letters (one to a person).
      if (!filesReady() && v.length < (withPerson ? 1 : 2)) { input.focus(); return; }
      if (S.files.some(function (f) { return f.busy; })) return;
      input.value = '';
      if (withPerson) sayIt(v); else if (replyMode() && !teamBound()) writeBack(v); else ask(v, false);
    });
    if (CFG.files) {
      var picker = panel.querySelector('[data-act="file"]');
      panel.querySelector('[data-act="clip"]').addEventListener('click', function () { picker.value = ''; picker.click(); });
      picker.addEventListener('change', function () { attach([].slice.call(picker.files || [])); });
    }
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
      // The app's opener: what we saw, or the one check-in (the server sends at most one).
      S.opener = j.saw || j.checkin ? { saw: j.saw || null, checkin: j.checkin || null } : null;
      if (Array.isArray(j.starts)) S.starts = j.starts;
      paintOpener(); paintStarts();
      var ch = log.querySelector('.mkc-chips:not(.mkc-ci)');
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
    S.extra = null; S.prompt = null; S.read = null; S.opener = null; paintRead(); dropFiles();
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
    toWelcome();
  }
  // The chat so far for this browser, or the welcome. Also how a page with a live chat picks it up in the background.
  function restore(saved) {
    if (!saved) { hello(); head(); return; }
    S.conv = { c: saved.c, t: saved.t };
    S.state = saved.st;
    S.restoring = true;
    var wait = add(el('div', 'mkc-wait', esc(COPY.loading)));
    post('sync', withConv({ after: 0 })).then(function (j) {
      wait.remove();
      thread(j);
      // Keep checking while the panel is open (every 10 seconds without a person), so a person coming online or a
      // reply from the team shows without a reload.
      loop();
      S.restoring = false; flushSend();
    }).catch(function (e) {
      wait.remove();
      if (e.ended) forget();
      hello(); head();
      S.restoring = false; flushSend();
    });
  }
  // ONE TAP SENDS IT (the app, Ed 2026-11-17: help must "place zero burden on the user"): a message the app wrote for
  // the trader, with what it knew attached, goes as soon as the chat is ready, after the chat so far has loaded so it
  // lands in order.
  function sendNow(text) { S.queued = text; flushSend(); }
  function flushSend() {
    if (!S.queued || S.restoring) return;
    if (S.busy) { setTimeout(flushSend, 300); return; }
    var q = S.queued; S.queued = null;
    ask(q);
  }

  function hello() {
    var hi = COPY.hello;
    try { if (CFG.hello) hi = CFG.hello() || hi; } catch (e) {}
    add(el('div', '', '<p class="mkc-hello">' + esc(hi) + '<br>' + esc(S.read && !S.queued ? COPY.readAsk : COPY.hello2) + '</p><p class="mkc-sub">' + esc(S.live ? COPY.subOn : COPY.sub) + '</p>'));
    add(el('div', 'mkc-opener')).hidden = true;
    paintOpener();
    fillChips(add(el('div', 'mkc-chips')));
    add(el('div', 'mkc-fb')).hidden = true;
    paintStarts();
    toWelcome();
  }

  // -- the app's own pieces (see the header); none of them shows on the site --
  // A line in MAKETZO's name (what we saw, the check-in): our words, never passed off as a person.
  function mLine(text) {
    var d = el('div', 'mkc-rep', '<span class="mkc-mark" aria-hidden="true">M</span><div><p class="mkc-meta">MAKETZO</p><div class="mkc-bub"></div></div>');
    d.querySelector('.mkc-bub').textContent = text || '';
    return d;
  }
  // One start picked at a time, marked until the message goes.
  function pickIn(box, b) {
    Array.prototype.forEach.call(root.querySelectorAll('.mkc-chip.is-on'), function (n) { n.classList.remove('is-on'); n.setAttribute('aria-pressed', 'false'); });
    if (b) { b.classList.add('is-on'); b.setAttribute('aria-pressed', 'true'); }
  }
  // What we saw (Yes, Look Into It goes straight to the team), or the check-in and its answers. On the welcome only.
  function paintOpener() {
    var box = log && log.querySelector('.mkc-opener');
    if (!box) return;
    box.innerHTML = '';
    var o = S.opener;
    box.hidden = !o || !!S.read;
    if (box.hidden) return;
    if (o.saw) {
      var saw = o.saw;
      var c = box.appendChild(el('div', 'mkc-card', '<span class="mkc-k">' + esc(COPY.sawK) + '</span><b class="mkc-title">' + esc(saw.text) + '</b>' + (saw.sub ? '<p>' + esc(saw.sub) + '</p>' : '')));
      var row = c.appendChild(el('div', 'mkc-row'));
      row.appendChild(button('mkc-b mkc-b--gold', saw.yes, function () {
        track('saw', { action: 'yes', kind: saw.kind || '' });
        S.opener = null; S.extra = { saw: saw.key, kind: 'problem', lead: saw.text };
        ask(COPY.sawYesQ, false);
      }));
      row.appendChild(button('mkc-b', saw.no, function () {
        track('saw', { action: 'no', kind: saw.kind || '' });
        try { if (CFG.dismissSaw) CFG.dismissSaw(saw.key); } catch (e) {}
        S.opener = null; paintOpener();
      }));
    } else if (o.checkin) {
      var ci = o.checkin;
      box.appendChild(mLine(ci.text));
      var chips = box.appendChild(el('div', 'mkc-chips mkc-ci'));
      (ci.chips || []).forEach(function (pair) {
        var b = chips.appendChild(button('mkc-chip', pair[1], function () {
          track('checkin', { answer: pair[0], key: ci.key || '' });
          if (pair[0] === 'good') {
            try { if (CFG.checkinGood) CFG.checkinGood(ci.key); } catch (e) {}
            if (S.extra && S.extra.checkin) { S.extra = null; S.prompt = null; }
            S.opener = null; paintOpener(); add(mLine(COPY.checkinGood)); head();
            return;
          }
          pickIn(chips, b);
          S.extra = { checkin: pair[0], kind: pair[0] === 'question' ? 'howto' : 'problem', lead: ci.text };
          S.prompt = pair[0] === 'off' ? COPY.ciOff : pair[0] === 'import' ? COPY.ciImport : COPY.ciQuestion;
          head(); input.focus();
        }));
        b.setAttribute('aria-pressed', 'false');
      });
    }
    box.appendChild(el('p', 'mkc-sub')).textContent = COPY.orStart;
  }
  // Straight-to-the-team starts, by the trader's stage (hello's starts: a problem, a need, an idea). A second tap takes
  // the pick back.
  function paintStarts() {
    var box = log && log.querySelector('.mkc-fb');
    if (!box) return;
    box.innerHTML = '';
    var list = S.starts || [];
    box.hidden = !list.length;
    if (!list.length) return;
    box.appendChild(el('p', 'mkc-sub')).textContent = COPY.teamLabel;
    var chips = box.appendChild(el('div', 'mkc-chips mkc-ci'));
    list.forEach(function (f) {
      var b = chips.appendChild(button('mkc-chip', f.label, function () {
        var on = !(S.extra && S.extra.team && S.extra.kind === f.kind);
        pickIn(chips, on ? b : null);
        S.extra = on ? { team: 1, kind: f.kind } : null;
        S.prompt = on ? f.prompt : null;
        track('start', { kind: f.kind, on: on ? 'yes' : 'no' });
        head(); input.focus();
      }));
      b.setAttribute('aria-pressed', 'false');
    });
  }
  // How an import read the trader's file (counts and reasons, never the file): a chip above the box until it goes
  // with the next message, and a card in the thread after.
  function readLine(r) {
    r = r || {};
    if (r.empty) return COPY.readNone.replace('{rows}', r.rows || 0);
    return COPY.readIn.replace('{n}', r.trades || 0) + (r.skipped ? ', ' + COPY.readOut.replace('{n}', r.skipped) : '');
  }
  function readCard(r) { return el('div', 'mkc-card mkc-readc', '<span class="mkc-k">' + esc(COPY.readK) + '</span><p>' + esc(readLine(r)) + '</p>'); }
  function setRead(r) {
    S.read = r || null;
    S.prompt = S.read ? COPY.readAsk : null;
    if (S.extra && !S.extra.team) S.extra = null;
    paintRead(); paintOpener(); head();
  }
  function paintRead() {
    if (!S.built) return;
    var bar = panel.querySelector('.mkc-att');
    Array.prototype.forEach.call(bar.querySelectorAll('.mkc-attc[data-read]'), function (n) { n.remove(); });
    bar.hidden = !S.read && !S.files.length;
    if (!S.read) return;
    var c = bar.insertBefore(el('span', 'mkc-attc', '<em>' + esc(COPY.readChip) + '</em> &middot; ' + esc(readLine(S.read))), bar.firstChild);
    c.setAttribute('data-read', '1');
    var x = c.appendChild(button('mkc-attx', '✕', function () { track('read_removed', {}); setRead(null); input.focus(); }));
    x.setAttribute('aria-label', COPY.removeRead);
  }
  // The trader's next message goes straight to the team: an answer to what we saw or the check-in, a team start, or
  // an import's read.
  function teamBound() { return !!(S.read || filesReady() || (S.extra && (S.extra.team || S.extra.saw || S.extra.checkin))); }

  // -- files (only where the page allows them, CFG.files: the app). Never asked for; the trader chooses to attach. --
  // Each file is cleaned in the browser first (support-chat-files.js, loaded on the first attach): a CSV shows What Is
  // Sent with what was hidden, a picture shows the black-out box. The message goes first, listing the files; then each
  // file goes on its own, tied to that message.
  var filesLib = null;
  function loadFilesLib() {
    if (window.MKChatFiles) return Promise.resolve(window.MKChatFiles);
    if (filesLib) return filesLib;
    var tag = document.querySelector('script[data-mkc-files]');
    var src = (tag && tag.getAttribute('data-mkc-files')) || CFG.filesSrc;
    if (!src) return Promise.reject(new Error('files'));
    filesLib = new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { window.MKChatFiles ? ok(window.MKChatFiles) : fail(new Error('files')); };
      s.onerror = function () { filesLib = null; fail(new Error('files')); };
      document.head.appendChild(s);
    });
    return filesLib;
  }
  function filesReady() { return S.files.some(function (f) { return f.item; }); }
  function fileNote(text) { add(el('div', 'mkc-note is-error')).textContent = text; }
  function attach(list) {
    if (!list.length) return;
    if (S.blocked) return;
    var room = 3 - S.files.length;
    if (list.length > room) { fileNote(COPY.fileMax); list = list.slice(0, Math.max(0, room)); }
    if (!list.length) return;
    loadFilesLib().then(function (lib) {
      list.forEach(function (file) {
        var f = { name: file.name, busy: true, item: null, card: null };
        S.files.push(f); paintFiles();
        lib.prepare(file).then(function (item) {
          f.item = item; f.busy = false; f.name = item.name;
          f.card = fileTile(item, f);
          track('attach', { kind: item.kind, hidden: item.kind === 'csv' ? String(item.masked.cols.length) : '0' });
          paintFiles(); head();
          // A picture opens big at once, ready to black out (Ed's pick A, 2026-11-17, "Black Out First").
          if (item.kind === 'image') reviewNext();
        }, function (e) {
          S.files.splice(S.files.indexOf(f), 1); paintFiles(); head();
          var name = e.fileName || file.name;
          fileNote((e.code === 'big' ? COPY.fileBig : e.code === 'excel' ? COPY.fileExcel : e.code === 'picture' ? COPY.filePic : COPY.fileType).replace('{name}', name));
          track('attach_refused', { why: e.code || 'error' });
        });
      });
    }, function () { fileNote(COPY.error); });
  }
  // Attached files sit in the chat as slim tiles under one READY TO SEND (then SENT) label (Ed's pick A, 2026-11-17,
  // after an F: the old card grew past the chat on a long file name, and a pill above the box repeated it). A tile is a
  // thumbnail, the name cut to fit, what was hidden, and two small buttons: Black Out (a CSV: View) and Remove.
  function attGroup() {
    if (S.attGroup && S.attGroup.isConnected) return S.attGroup;
    var g = add(el('div', 'mkc-atts'));
    g.appendChild(el('span', 'mkc-k')).textContent = COPY.sentK;
    S.attGroup = g;
    return g;
  }
  function fileTile(item, f) {
    item.file = f;
    var pic = item.kind === 'image', g = attGroup(), t = g.appendChild(el('div', 'mkc-tile'));
    var th = t.appendChild(el('button', 'mkc-thumb' + (pic ? '' : ' is-csv')));
    th.type = 'button';
    th.setAttribute('aria-label', (pic ? COPY.tileOpenPic : COPY.tileOpenCsv).replace('{name}', item.name));
    var cv = pic ? th.appendChild(el('canvas')) : null;
    if (!pic) th.textContent = 'CSV';
    var nm = t.appendChild(el('div', 'mkc-tnm'));
    var b = nm.appendChild(el('b')); b.textContent = item.name; b.title = item.name;
    var st = nm.appendChild(el('span'));
    var acts = t.appendChild(el('div', 'mkc-tacts'));
    var open = acts.appendChild(el('button', 'mkc-ib mkc-topen', pic ? IC.pencil : IC.expand));
    open.type = 'button'; open.title = pic ? COPY.tileBlack : COPY.tileView; open.setAttribute('aria-label', open.title + ': ' + item.name);
    var rm = acts.appendChild(el('button', 'mkc-ib mkc-trm', IC.x));
    rm.type = 'button'; rm.title = COPY.tileRemove; rm.setAttribute('aria-label', COPY.removeFile.replace('{name}', item.name));
    var go = function () { openFull(item, open); };
    th.addEventListener('click', go); open.addEventListener('click', go);
    rm.addEventListener('click', function () { removeFile(f); track('attach_removed', {}); });
    if (!pic) {
      // What the CSV's tile says, and the line above the full table.
      var m = item.masked, said = [], names = listOf(m.cols.map(function (x) { return x.name; }));
      if (m.cols.length) said.push((m.cols.length === 1 ? COPY.hidCol1 : COPY.hidCols).replace('{n}', m.cols.length + ' columns').replace('{names}', names));
      if (m.lines) said.push((m.lines === 1 ? COPY.hidLine1 : COPY.hidLines).replace('{n}', m.lines));
      if (m.cells) said.push((m.cells === 1 ? COPY.hidCell1 : COPY.hidCells).replace('{n}', m.cells));
      item.said = said.length ? said.join(' ') + ' ' + COPY.hidRest : COPY.hidNone;
      st.textContent = m.cols.length ? (m.cols.length === 1 ? COPY.tileCol1 : COPY.tileCols.replace('{n}', m.cols.length)).replace('{names}', names) : COPY.tileNone;
      st.classList.toggle('is-on', !!(m.cols.length || m.lines || m.cells));
    }
    // A picture's thumbnail (the middle of it, square) and its line follow the boxes drawn in the big view.
    item.sync = function () {
      if (pic) {
        var tmp = document.createElement('canvas'); item.draw(tmp);
        var s = Math.min(item.w, item.h);
        cv.width = 112; cv.height = 112;
        cv.getContext('2d').drawImage(tmp, (item.w - s) / 2, (item.h - s) / 2, s, s, 0, 0, 112, 112);
        var n = item.boxes.length;
        st.textContent = n ? (n === 1 ? COPY.chipBox1 : COPY.chipBoxes.replace('{n}', n)) : COPY.tileBox0;
        st.classList.toggle('is-on', n > 0);
      }
      head();
    };
    item.sync();
    return t;
  }
  function removeFile(f) {
    var i = S.files.indexOf(f); if (i >= 0) S.files.splice(i, 1);
    var g = f.card && f.card.parentNode;
    if (f.card) f.card.remove();
    if (g && !g.querySelector('.mkc-tile')) { g.remove(); if (S.attGroup === g) S.attGroup = null; }
    paintFiles(); head();
  }
  // Pictures not yet looked at open one after another, each when the last is put away.
  function reviewNext() {
    if (root.querySelector('.mkc-full')) return;
    var f = S.files.filter(function (x) { return x.item && x.item.kind === 'image' && !x.reviewed && !x.sent; })[0];
    if (!f) return;
    f.reviewed = true;
    openFull(f.item, f.card && f.card.querySelector('.mkc-topen'), reviewNext);
  }
  // The header and the first n rows as they go, hidden cells marked; numbered in the bigger view.
  function csvTable(m, n, numbered) {
    var row = function (cells, tag, num) {
      return '<tr>' + (numbered ? '<' + tag + ' class="mkc-rn">' + num + '</' + tag + '>' : '') + cells.map(function (x) { return '<' + tag + (x.hid ? ' class="is-hid"' : '') + '>' + esc(String(x.t == null ? '' : x.t).slice(0, numbered ? 80 : 40)) + '</' + tag + '>'; }).join('') + '</tr>';
    };
    return '<table><thead>' + row(m.header, 'th', '#') + '</thead><tbody>' + m.sample.slice(0, n).map(function (r, i) { return row(r, 'td', i + 1); }).join('') + '</tbody></table>';
  }
  function listOf(names) { return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]; }
  // Drag to add a black box. Boxes are fractions of the picture, so they land in the same place at any size.
  function boxDrawing(cv, item, moved, done) {
    var start = null, live = null;
    var at = function (ev) { var r = cv.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) }; };
    cv.addEventListener('pointerdown', function (ev) { if (item.file && item.file.sent) return; ev.preventDefault(); start = at(ev); live = { x: start.x, y: start.y, w: 0, h: 0 }; item.boxes.push(live); try { cv.setPointerCapture(ev.pointerId); } catch (x) {} });
    cv.addEventListener('pointermove', function (ev) {
      if (!start) return;
      var p = at(ev);
      live.x = Math.min(start.x, p.x); live.y = Math.min(start.y, p.y); live.w = Math.abs(p.x - start.x); live.h = Math.abs(p.y - start.y);
      moved();
    });
    var end = function () {
      if (!start) return;
      if (live.w < 0.01 || live.h < 0.01) item.boxes.pop();
      start = live = null; done();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }
  // The bigger view (Ed's pick A, 2026-11-17): the file over the whole window. A picture as big as it fits, to black
  // out with Undo Last Box and Clear Boxes; a CSV with every column and up to 200 rows. Done, Esc or a click outside
  // puts it back in the chat, with any boxes drawn here.
  function openFull(item, from, then) {
    if (root.querySelector('.mkc-full')) return;
    var pic = item.kind === 'image', f = item.file, locked = pic && f && f.sent;
    var v = el('div', 'mkc-full');
    var sh = v.appendChild(el('div', 'mkc-sheet'));
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', item.name);
    var top = sh.appendChild(el('div', 'mkc-shd'));
    var nm = top.appendChild(el('div', 'mkc-snm'));
    nm.appendChild(el('span', '', esc(f && f.sent ? COPY.sentDone : pic ? COPY.fullBlack : COPY.sentK)));
    nm.appendChild(el('b', '', esc(item.name.toUpperCase())));
    var done = top.appendChild(button('mkc-done', COPY.fullDone, function () { shut(); }));
    var tools = sh.appendChild(el('div', 'mkc-tools'));
    var body = sh.appendChild(el('div', 'mkc-sbody'));
    var big, undo, clear;
    if (pic) {
      tools.appendChild(el('p', '')).textContent = locked ? (item.boxes.length ? (item.boxes.length === 1 ? COPY.shotSent1 : COPY.shotSent.replace('{n}', item.boxes.length)) : COPY.shotSent0) : COPY.shotHelp;
      if (!locked) {
        undo = tools.appendChild(button('mkc-link', COPY.undoBox, function () { item.boxes.pop(); paint(); }));
        clear = tools.appendChild(button('mkc-link', COPY.clearBoxes, function () { item.boxes = []; paint(); }));
      }
      big = body.appendChild(el('canvas', 'mkc-big'));
      if (locked) big.classList.add('is-sent');
    } else {
      var m = item.masked, shown = Math.min(m.sample.length, 200);
      tools.appendChild(el('p', '')).textContent = item.said || '';
      tools.appendChild(el('span', 'mkc-cnt')).textContent = m.rows > shown ? COPY.fullFirst.replace('{n}', shown).replace('{total}', m.rows) : COPY.fullRows.replace('{n}', m.rows);
      body.classList.add('is-table');
      body.appendChild(el('div', 'mkc-tbl', csvTable(m, 200, true)));
    }
    // What a file is used for, once, quietly, while it can still be changed or removed.
    if (!(f && f.sent)) tools.appendChild(el('p', 'mkc-use')).textContent = COPY.consent;
    function fit() {
      if (!big) return;
      var W = body.clientWidth - 2, H = body.clientHeight - 2, k = Math.min(W / item.w, H / item.h);
      big.style.width = Math.max(1, Math.floor(item.w * k)) + 'px'; big.style.height = Math.max(1, Math.floor(item.h * k)) + 'px';
    }
    function paint() {
      item.draw(big);
      if (undo) undo.disabled = !item.boxes.length;
      if (clear) clear.disabled = !item.boxes.length;
      if (item.sync) item.sync();
    }
    function key(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); shut(); return; }
      if (e.key !== 'Tab') return;
      var list = Array.prototype.filter.call(sh.querySelectorAll('button'), function (b) { return !b.disabled; });
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function shut() {
      window.removeEventListener('resize', fit);
      v.remove();
      if (item.sync) item.sync();
      if (from && from.focus && from.isConnected) from.focus();
      if (then) then();
    }
    v.addEventListener('keydown', key);
    v.addEventListener('click', function (e) { if (e.target === v) shut(); });
    window.addEventListener('resize', fit);
    root.appendChild(v);
    if (big) { paint(); fit(); boxDrawing(big, item, function () { item.draw(big); }, paint); }
    done.focus();
    track('file_expand', { kind: item.kind });
  }
  // The bar above the box carries only an import's read now; files are tiles in the chat (no pill repeating them, Ed:
  // "The pill underneath the image is extremely ugly"). The footer says what a file is used for while any is attached.
  function paintFiles() {
    if (!S.built || !CFG.files) return;
    var bar = panel.querySelector('.mkc-att');
    bar.hidden = !S.read;
  }
  function dropFiles() { S.files.slice().forEach(removeFile); S.files = []; S.attGroup = null; paintFiles(); }
  // What the message says about its files (the server keeps it with the message, and the team sees it).
  function filesMeta() {
    return S.files.filter(function (f) { return f.item; }).map(function (f) {
      var m = f.item.meta();
      return { kind: f.item.kind, name: f.name, hidden: f.item.kind === 'csv' ? m.cols.length + m.lines + m.cells : m.boxes, meta: m };
    });
  }
  // After the message is stored (seq), each file goes on its own request: one line of JSON, then the bytes in base64.
  function sendFiles(seq, list) {
    var chain = Promise.resolve(), failed = [];
    // These tiles belong to this message now; a file attached next starts a new READY TO SEND.
    S.attGroup = null;
    list.forEach(function (f, i) {
      chain = chain.then(function () { return f.item.blob(); }).then(function (blob) {
        return new Promise(function (ok, fail) {
          var rd = new FileReader();
          rd.onload = function () { ok(String(rd.result).replace(/^data:[^,]*,/, '')); };
          rd.onerror = function () { fail(new Error('read')); };
          rd.readAsDataURL(blob);
        });
      }).then(function (b64) {
        var head = withConv({ seq: seq, i: i });
        if (CFG.src) head.src = CFG.src;
        return fetch(apiBase() + '/support/file', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(head) + '\n' + b64,
          credentials: signedIn() ? 'include' : 'omit', mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('upload ' + r.status); });
      }).then(function () { sentCard(f); track('file_sent', { kind: f.item.kind }); }, function () { failed.push(f.name); track('file_failed', { kind: f.item.kind }); });
    });
    return chain.then(function () { failed.forEach(function (n) { fileNote(COPY.fileFailed.replace('{name}', n)); }); });
  }
  // Once sent, a tile loses Remove, a picture's pencil becomes View (it opens locked), and when every tile in the group
  // has gone the label reads SENT.
  function sentCard(f) {
    f.sent = true;
    if (!f.card) return;
    f.card.classList.add('is-sent');
    var rm = f.card.querySelector('.mkc-trm'); if (rm) rm.remove();
    var op = f.card.querySelector('.mkc-topen');
    if (op && f.item.kind === 'image') { op.innerHTML = IC.expand; op.title = COPY.tileView; op.setAttribute('aria-label', COPY.tileView + ': ' + f.name); }
    var g = f.card.parentNode, k = g && g.querySelector('.mkc-k');
    if (k && !g.querySelector('.mkc-tile:not(.is-sent)')) k.textContent = COPY.sentDone;
  }
  // The trader's line shows its files under the words, on screen now and on any reload.
  function fileLine(node, files) {
    if (!files || !files.length) return;
    var d = node.appendChild(el('div', 'mkc-mefiles'));
    files.forEach(function (f) { d.appendChild(el('span', '', esc(f.name))); });
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
    // Whose line is last: after the visitor wrote back, the chat waits on the team, so it does not ask for a rating yet.
    var lastWho = null;
    msgs.forEach(function (m) {
      S.lastSeq = Math.max(S.lastSeq, Number(m.seq) || 0);
      if (m.kind === 'visitor') { var b = add(el('div', 'mkc-me')); b.textContent = m.body || ''; fileLine(b, m.files); b.setAttribute('data-seq', m.seq); lastWho = 'visitor'; }
      else if (m.kind === 'results') results(m.results || [], m.qid, false);
      else if (m.kind === 'rep') { S.replied = true; repLine(m); lastWho = 'rep'; }
      else if (m.kind === 'system') { systemLine(m); if (m.code === 'note') lastWho = 'visitor'; }
    });
    if (S.state === 'email' && !S.replied) alreadyNote();
    if (S.state === 'waiting') waitBox();
    var owedByEmail = (S.state === 'email' || S.state === 'missed') && lastWho === 'visitor';
    if (S.replied && !owedByEmail && !j.rated && S.state !== 'live' && S.state !== 'waiting') rate();
    head();
    paintLiveBits(j);
    loop();
  }
  function repLine(m) {
    var who = m.alias || 'MAKETZO';
    S.repName = who;
    add(el('div', 'mkc-rep', '<span class="mkc-mark" aria-hidden="true">' + esc(who.charAt(0).toUpperCase()) + '</span>'
      + '<div><p class="mkc-meta">' + esc(who) + ' &middot; ' + esc(clock(m.at)) + '</p><div class="mkc-bub"></div>'
      + (m.emailed ? '<p class="mkc-emailed">' + esc(COPY.emailedYou) + '</p>' : '') + '</div>'))
      .querySelector('.mkc-bub').textContent = m.body || '';
  }
  function systemLine(m) {
    if (m.code === 'note') { add(el('div', 'mkc-me')).textContent = m.body || ''; return; }
    // The app's context lines, as the trader saw them: what we saw or the check-in, and how an import read the file.
    if (m.code === 'saw' || m.code === 'checkin') { add(mLine(m.body)); return; }
    if (m.code === 'import-read') { add(readCard(m.read)); return; }
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
    // The welcome's starts go (the suggested questions and, in the app, the opener and the team starts).
    Array.prototype.forEach.call(log.querySelectorAll('.mkc-chips, .mkc-opener, .mkc-fb'), function (n) { n.remove(); });
    closeArticle();
    // In the app, what the message answers goes above it, as the team reads it: what we saw or the check-in, or how
    // the import read the file.
    if (S.extra && S.extra.lead) add(mLine(S.extra.lead));
    if (S.read) add(readCard(S.read));
    S.asked = add(el('div', 'mkc-me'));
    S.asked.textContent = q;
    if (filesReady()) fileLine(S.asked, filesMeta());
    // "Hello" is not a question: it gets a hello back and the suggested questions, not "nothing answers that".
    // Nothing is sent or stored for it.
    if (!chip && !teamBound() && GREETING.test(q)) return greet();
    // Only a suggested question is remembered, never what the visitor typed.
    if (chip) remember([q]);
    send(q, chip, true);
  }
  // then / failed: the email path asks a first question before it sends; they run after the answer, or after an error.
  function send(q, chip, retry, then, failed) {
    S.busy = true; sendBtn.disabled = true;
    // In the app, a message with something the app knew (see teamBound) goes straight to the team, and says so.
    var team = !then && teamBound(), wasWithTeam = withTeam();
    // The search line with its dots shows for at least THINK_MS (Ed, 2026-11-16: the answer "came back too fast, I'd
    // prefer a slight delay with the thinking animation"). It says what is happening, a search of the help library,
    // so the pause is never passed off as a person typing.
    var started = Date.now(), slow = null;
    var wait = add(el('div', 'mkc-wait mkc-think', '<span class="mkc-dots" data-motion-keep aria-hidden="true"><i></i><i></i><i></i></span><span>' + esc(team ? COPY.sending : COPY.searching) + '</span>'));
    var body = withConv({ q: q });
    var sending = team ? S.files.filter(function (f) { return f.item; }) : [];
    if (team) {
      if (S.extra) Object.keys(S.extra).forEach(function (k) { if (k !== 'lead') body[k] = S.extra[k]; });
      if (S.read) { body.read = S.read; if (!body.kind) body.kind = 'problem'; }
      if (sending.length) { body.files = filesMeta(); if (!body.kind) body.kind = 'problem'; }
      body.p = page();
    }
    // ms feeds the server's too-fast rule (a first question under 0.8 s after opening is treated as a bot). A tapped
    // suggestion is left out of it: a quick tap is a person, and the rule answered one with "Nothing in our help
    // library answers that" (the harness hit it 2026-11-16; Ed's earlier "Major bug" was the same miss for a chip).
    if (!S.conv) { firstFacts(body); if (!chip && !team) body.ms = S.shownAt ? Date.now() - S.shownAt : 0; }
    post('ask', body).then(function (j) {
      return new Promise(function (ok) { setTimeout(function () { ok(j); }, Math.max(0, THINK_MS - (Date.now() - started))); });
    }).then(function (j) {
      clearTimeout(slow); if (wait) wait.remove();
      S.busy = false; sendBtn.disabled = false;
      if (j.c && j.t) S.conv = { c: j.c, t: j.t };
      // The question as sent, strong words hidden: the newest line that reads exactly what was typed.
      if (j.said) {
        var mine = log.querySelectorAll('.mkc-me');
        for (var i = mine.length - 1; i >= 0; i--) {
          var words = mine[i].firstChild;
          if (words && words.nodeType === 3 && words.nodeValue === q) { words.nodeValue = j.said; break; }
        }
      }
      if (j.sent) {
        // The files go now, each tied to the message just stored; their cards stay in the thread as the record.
        if (sending.length && j.mseq) {
          sendFiles(j.mseq, sending);
          S.files = S.files.filter(function (f) { return sending.indexOf(f) < 0; });
          paintFiles();
        }
        return sentToTeam(j, wasWithTeam);
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
    // Signed in to the app, the article comes whole from the app's Knowledge Center (CFG.article); on the site, the
    // public copy, where a gated guide shows its opening and the trial.
    (CFG.article ? Promise.resolve().then(function () { return CFG.article(x.slug); })
      : fetch(apiBase() + '/kb/public/' + encodeURIComponent(x.slug), { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }))
      .then(null, function () { return null; })
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
  // A person has replied by email and nobody is live: what they type next is a reply to that person, so it goes to the
  // team (Needs You lights) and never to the help library (Ed, 2026-11-17).
  function replyMode() { return !!S.repName && S.replied && S.emailGiven && !S.blocked && (S.state === 'email' || S.state === 'missed'); }
  function firstName() { return String(S.repName || 'MAKETZO').split(' ')[0]; }
  function writeBack(text) {
    if (S.busy) return;
    var ch = log.querySelector('.mkc-chips'); if (ch) ch.remove();
    // An unanswered "How was this chat?" goes: they are still talking, so the chat is not over.
    Array.prototype.forEach.call(log.querySelectorAll('.mkc-rate'), function (r) { if (!r.querySelector('[aria-pressed="true"]')) r.remove(); });
    closeArticle();
    var mine = add(el('div', 'mkc-me'));
    mine.textContent = text;
    S.busy = true; sendBtn.disabled = true;
    // No email field: the server uses the one this chat already has, and says whether this round was already sent.
    post('email', withConv({ note: text })).then(function (j) {
      S.busy = false; sendBtn.disabled = false;
      S.state = 'email'; S.emailGiven = true; saveConv(); head();
      track('contact', { newsletter: 'no', asked_first: 'yes', again: 'reply' });
      if (!j.again) {
        add(el('div', 'mkc-sys')).textContent = COPY.sent;
        add(el('div', 'mkc-note', esc(COPY.gotIt).replace('{email}', '<b>' + esc(j.email || '') + '</b>')));
      }
    }).catch(function (e) {
      S.busy = false; sendBtn.disabled = false;
      if (e.ended) forget();
      mine.remove();
      if (!input.value) input.value = text;
      add(el('div', 'mkc-note is-error')).textContent = e.message;
    });
  }
  // In the app: a message that went straight to the team (see send). A person now when one is online; otherwise the
  // reply comes later, and "Sent to our team" is said once per round, as on the email path.
  function sentToTeam(j, wasWithTeam) {
    var props = { kind: (S.extra && S.extra.kind) || 'none', with_read: S.read ? 'yes' : 'no', with_saw: S.extra && S.extra.saw ? 'yes' : 'no', with_checkin: S.extra && S.extra.checkin ? 'yes' : 'no' };
    S.extra = null; S.prompt = null; S.read = null;
    paintRead(); pickIn(null, null);
    var was = S.state;
    S.state = j.state || 'email';
    S.emailGiven = true;
    if (typeof j.live === 'boolean') S.live = j.live;
    liveFacts(j);
    saveConv();
    props.to = S.state;
    track('team', props);
    if (S.state === 'waiting' && was !== 'waiting') { track('wait', {}); waitBox(COPY.waitNote); }
    else if (S.state !== 'waiting' && S.state !== 'live') {
      if (wasWithTeam) alreadyNote();
      else { add(el('div', 'mkc-sys')).textContent = COPY.sent; add(el('div', 'mkc-note')).textContent = COPY.teamNote; }
    }
    head(); paintLiveBits(j); loop();
  }
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
    var replying = replyMode();
    footL.textContent = replying ? COPY.footReply.replace('{name}', firstName()) : COPY.footLeft;
    footR.textContent = st === 'live' ? COPY.endChat : st === 'waiting' ? COPY.emailUs : (personOffered() ? COPY.talk : COPY.emailUs);
    // Already with the team by email and nobody online: there is nothing for Email Us to do. After a reply, typing IS
    // the email, so it goes too.
    footR.hidden = st === 'live' || S.blocked || ((withTeam() || replying) && !personOffered());
    // The reply box says the person's first name only (Ed, 2026-11-16: "Message John Hanshe... Maybe Message John").
    input.placeholder = filesReady() ? COPY.filesPh : st === 'live' ? COPY.messagePh.replace('{name}', (S.rep || 'MAKETZO').split(' ')[0]) : st === 'waiting' ? COPY.waitPh
      : S.prompt ? S.prompt : replying ? COPY.replyPh.replace('{name}', firstName()) : COPY.placeholder;
    input.maxLength = (withPerson || replying || teamBound()) ? 1000 : 300;
    // A file attached: Send sends it, so the footer's other ways out step aside. What a file is used for is said in the
    // big view, where the trader decides what to share (Ed's pick, 2026-11-17: "No need to state how we use this file"
    // under the box), and on privacy.html.
    if (S.files.length) { footR.hidden = true; footO.hidden = true; }
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
    // Files attached while with a person go with this line, the same way (sendFiles).
    var sending = S.files.filter(function (f) { return f.item; }), body = { text: text };
    if (sending.length) { body.files = filesMeta(); fileLine(b, body.files); }
    // Strong words come back hidden (Ed, 2026-11-16, "Hide the words"): the line shows as the team sees it.
    post('say', withConv(body)).then(function (j) {
      b.setAttribute('data-seq', j.seq);
      if (j.said && b.firstChild && b.firstChild.nodeType === 3) b.firstChild.nodeValue = j.said;
      if (sending.length && j.seq) { sendFiles(j.seq, sending); S.files = S.files.filter(function (f) { return sending.indexOf(f) < 0; }); paintFiles(); head(); }
      loop();
    })
      .catch(function (e) {
        if (e.status === 409) { S.state = e.state || 'bot'; saveConv(); head(); }
        add(el('div', 'mkc-note is-error')).textContent = e.message;
      });
  }
  // "Talk to Someone Else": a real handoff to another admin who is online; with nobody else, the same person stays.
  // The click shows at once (Ed, 2026-11-17: "When I click on Talk to Someone Else nothing happens"): the search line
  // with its dots while the server looks, then the answer in its place. One request at a time.
  function other() {
    if (footO.disabled) return;
    footO.disabled = true;
    track('other_click', {});
    var looking = add(el('div', 'mkc-wait mkc-think', '<span class="mkc-dots" data-motion-keep aria-hidden="true"><i></i><i></i><i></i></span><span>' + esc(COPY.waitOther) + '</span>'));
    var started = Date.now();
    post('other', withConv({})).then(function (j) {
      return new Promise(function (ok) { setTimeout(function () { ok(j); }, Math.max(0, THINK_MS - (Date.now() - started))); });
    }).then(function (j) {
      looking.remove(); footO.disabled = false;
      track('other', { alone: j.alone ? 'yes' : 'no' });
      if (j.next === 'email') {
        add(el('div', 'mkc-note')).textContent = COPY.otherAlone;
        add(el('div', 'mkc-row mkc-reach')).appendChild(button('mkc-b', COPY.emailUs, function () { emailForm(); }));
        return;
      }
      S.state = 'waiting'; liveFacts(j); S.waitStart = Date.now(); saveConv();
      waitBox(COPY.waitOther); head(); loop();
    }).catch(function (e) { looking.remove(); footO.disabled = false; add(el('div', 'mkc-note is-error')).textContent = e.message; });
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
    // o.read (the app): an import's details (counts and reasons, never the file), to go with the next message.
    // o.team: the next message goes straight to the team. o.send: that message, sent at once, written by the app for
    // the trader, so nothing is left for them to type (the app's error nudge and Send to Support on an import card).
    open: function (from, o) {
      build();
      if (o && o.read) setRead(o.read);
      if (o && o.team) S.extra = { team: 1, kind: 'problem' };
      // Queued before the panel opens, so the welcome does not ask a question the message is about to answer.
      if (o && o.send) { S.queued = String(o.send); S.prompt = null; }
      setOpen(true, from);
      flushSend();
    },
    close: function () { setOpen(false); },
    toggle: function (from) { setOpen(!S.open, from); },
    fromEmail: fromEmail,
    watch: watch
  };
})();
