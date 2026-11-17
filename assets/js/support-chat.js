/*
 * The support chat's button, on every page of maketzo.co (Ed, 2026-11-16). It draws only the button; the panel
 * (support-chat-panel.js, beside it) loads on the first click, so a page pays a few KB and the chat's server is never
 * called before someone asks. The look and placement are in assets/css/support-chat.css; the server is
 * maketzo-backend routes/support.js.
 *
 * Also here, because they must work before the panel exists:
 *   - The link in a reply email (?chat=<token>, maybe &rate=yes|no) opens the chat on that page. It counts (and a
 *     Yes or No is recorded) only on the visitor's first tap, click or keypress: Outlook's link scanner opens the page
 *     and runs it, and never touches it (offer.html, 2026-11-10).
 *   - On a computer, a panel left open reopens on the next page, so following an answer's link keeps the chat.
 *   - The button sits above the page's pinned email bar: its height goes into --mkc-lift.
 *
 * maketzo-app runs this file too, as a byte-identical copy (see support-chat-panel.js, ONE CHAT, TWO PLACES). There
 * window.MKChatConfig.css is false (the app links its own copy of the stylesheet), the script tag names the app's
 * copy of the panel (data-mkc-panel), and the app's own ways in open it through window.MKChatLoad.
 */
(function () {
  'use strict';
  if (window.__mkcBoot) return;
  window.__mkcBoot = true;
  try { if (window.top !== window.self) return; } catch (e) { return; }
  var CFG = window.MKChatConfig || {};

  var me = document.currentScript;
  var src = (me && me.src) || '/assets/js/support-chat.js';
  var ver = (src.match(/\?.*$/) || [''])[0];
  var base = src.replace(/js\/support-chat\.js(\?.*)?$/, '');
  // The panel sits beside this file on the site; the app names its own (content-hashed) copy on the script tag. The
  // attribute carries the chat's prefix: the app's own data-panel names its screens, and its rail code reads that one.
  var panelSrc = (me && me.getAttribute('data-mkc-panel')) || base + 'js/support-chat-panel.js' + ver;
  var root, btn, loading = null;

  function css() {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = base + 'css/support-chat.css' + ver;
    document.head.appendChild(l);
    return l;
  }

  function panel() {
    if (window.MKChat) return Promise.resolve(window.MKChat);
    if (loading) return loading;
    btn.setAttribute('aria-busy', 'true');
    loading = new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = panelSrc;
      s.onload = function () { btn.removeAttribute('aria-busy'); window.MKChat ? ok(window.MKChat) : fail(new Error('panel')); };
      s.onerror = function () { btn.removeAttribute('aria-busy'); loading = null; fail(new Error('panel')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  // The panel for a page's own way in (the app's More row and its import card): loaded on first use, like the button.
  window.MKChatLoad = function () { return btn ? panel() : Promise.reject(new Error('panel')); };

  // The pinned email bar's height, so the button never sits on it. On a phone the bar is a card 10px above the tab bar.
  var lift = -1;
  function measure() {
    var bar = document.querySelector('.sticky-bar.visible');
    var h = bar && bar.offsetHeight ? bar.offsetHeight + (document.documentElement.classList.contains('mkpb-on') ? 10 : 0) : 0;
    if (h !== lift) { lift = h; root.style.setProperty('--mkc-lift', h + 'px'); }
  }

  // The reply email's link: taken off the address at once, acted on at the first real touch.
  function emailLink() {
    var raw = null, rate = null;
    try {
      var u = new URL(window.location.href);
      raw = u.searchParams.get('chat');
      if (raw === null) return null;
      rate = u.searchParams.get('rate');
      u.searchParams.delete('chat'); u.searchParams.delete('rate');
      if (window.history && window.history.replaceState) window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    } catch (e) { return null; }
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(raw)) return null;
    return { raw: raw, rate: rate === 'yes' || rate === 'no' ? rate : null };
  }

  function start() {
    if (document.getElementById('mkc')) return;
    if (CFG.css !== false) css();
    root = document.createElement('div');
    root.className = 'mkc';
    root.id = 'mkc';
    root.innerHTML = '<button type="button" class="mkc-btn" aria-label="Chat with us" aria-haspopup="dialog" aria-expanded="false">'
      + '<svg class="mkc-i-chat" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 4.75h11.6a2.7 2.7 0 0 1 2.7 2.7v6.6a2.7 2.7 0 0 1-2.7 2.7h-5.4l-4.1 3.35c-.4.33-1 .04-1-.48v-2.87h-1.1a2.7 2.7 0 0 1-2.7-2.7v-6.6a2.7 2.7 0 0 1 2.7-2.7Z"/><path d="M8.6 9.6h6.8M8.6 12.6h4.2"/></svg>'
      + '<svg class="mkc-i-close" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
      + '</button>';
    document.body.appendChild(root);
    btn = root.firstChild;
    btn.addEventListener('click', function () {
      panel().then(function (c) { c.toggle('button'); }).catch(function () {});
    });

    measure();
    try {
      var mo = new MutationObserver(measure);
      Array.prototype.forEach.call(document.querySelectorAll('.sticky-bar'), function (b) { mo.observe(b, { attributes: true, attributeFilter: ['class', 'style'] }); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
    window.addEventListener('resize', measure, { passive: true });

    var link = emailLink();
    if (link) {
      panel().then(function (c) { c.fromEmail(link.raw, link.rate); }).catch(function () {});
      return;
    }
    var reopen = false, st = null;
    try { reopen = sessionStorage.getItem('mkc_open') === '1' && window.matchMedia('(min-width: 768px)').matches; } catch (e) {}
    try { st = (JSON.parse(localStorage.getItem('mkc_v1') || 'null') || {}).st; } catch (e) {}
    if (reopen) panel().then(function (c) { c.open('page'); }).catch(function () {});
    // A chat waiting for, or with, a person carries on here: the panel loads closed, so a reply rings and counts.
    else if (st === 'waiting' || st === 'live') panel().then(function (c) { c.watch(); }).catch(function () {});
  }

  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
