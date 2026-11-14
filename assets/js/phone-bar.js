/*!
 * The phone bar for maketzo.co (the CSS beside it, assets/css/phone-bar.css, says what Ed picked and why).
 *
 * One script tag per page: it loads its own stylesheet from beside itself, then builds the bar and the More sheet,
 * so every page (and every blog post, which loads it from maketzo.co) gets the same bar from one file. Below 768px
 * only; above that the page's own nav stays exactly as it is, and with no script the menu button stays.
 *
 * Tabs: Journal, The System, Free Trial (gold, the middle), Pricing, More. A member (html.mkt-auth, set by
 * mkt-analytics.js) sees Launch in the middle instead, and Launch the App in More. More is the whole site as tiles,
 * Log In, and the newsletter. The bar hides while the visitor scrolls down to read and comes back when they scroll
 * up, reach the end of the page, or are near the top; it steps aside while a text field has focus (the keyboard).
 * The newsletter bar on the page rises above the tab bar as a card. Closed, it stays away for the rest of that visit
 * and comes back on the next one (sessionStorage); once the visitor subscribes, here or in More, it stays away for
 * good (localStorage). Both are per-visitor conveniences: if storage is blocked it simply shows again (Ed's picks,
 * 2026-11-13). The signup in More loads assets/js/newsletter.js itself on the pages that do not carry it.
 *
 * Analytics: every tab and tile tap is one mkt_nav_tap {from: tabbar|more, to}; opening More is to: "more". The
 * Free Trial key carries data-cta-source="tabbar", so mkt-analytics.js records its cta_click (never a second event).
 */
(function () {
  'use strict';
  if (window.__mkPbar) return;
  window.__mkPbar = true;

  var me = document.currentScript;
  var src = (me && me.src) || '';
  var BASE = src.replace(/assets\/js\/phone-bar\.js.*$/, '');
  var LIVE = /(^|\.)maketzo\.co$/.test(location.hostname);
  function url(page) {                       // clean URLs on the site, files anywhere else (a preview, a file)
    if (page === 'blog') return LIVE ? BASE + 'blog' : 'https://maketzo.co/blog';
    if (page === 'app') return LIVE ? BASE + 'app' : 'https://maketzo.co/app';
    return BASE + page + (LIVE ? '' : '.html');
  }
  function here() {
    var path = location.pathname;
    if (/\/blog(\/|$)/.test(path)) return 'blog';
    if (/\/$/.test(path)) return 'index';                           // maketzo.co/ is the homepage
    return path.split('/').pop().replace(/\.html$/, '') || 'index';  // /journal, journal.html, index.html
  }
  var HERE = here();

  var I = {
    journal: '<path d="M3.5 5.5c2.7-1 5.6-.9 8.5.9 2.9-1.8 5.8-1.9 8.5-.9v13c-2.7-1-5.6-.9-8.5.9-2.9-1.8-5.8-1.9-8.5-.9z"/><path d="M12 6.4v13"/>',
    system: '<path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z"/><path d="M8.8 12l2.3 2.3 4.3-4.6"/>',
    trial: '<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>',
    pricing: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8" cy="8" r="1.3"/>',
    more: '<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>',
    focus: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    tools: '<rect x="3.5" y="7" width="17" height="10" rx="5"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11" r=".6"/><circle cx="17" cy="13" r=".6"/>',
    blog: '<path d="M5 4.5h10l4 4v11H5z"/><path d="M15 4.5v4h4M8.5 12.5h7M8.5 16h5"/>',
    why: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5"/><path d="M12 16.6v.2"/>',
    contact: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
    login: '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M4.5 12H15"/><path d="M11 8l4 4-4 4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[name] + '</svg>'; }

  // The whole site, in the nav's order; the first three are also tabs.
  var PAGES = [
    { id: 'journal', name: 'Journal', use: 'Log every trade and see the patterns' },
    { id: 'system', name: 'The System', use: 'Live rules and strikes while you trade' },
    { id: 'focus', name: 'Focus Room', use: 'Lock-In, warm-ups, resets and the soundtrack' },
    { id: 'tools', name: 'Free Tools', use: 'Free trading games and stock checks' },
    { id: 'pricing', name: 'Pricing', use: 'Journal, Pro and Elite, side by side' },
    { id: 'blog', name: 'Blog', use: 'Notes on trading discipline' },
    { id: 'why', name: 'Why MAKETZO', use: 'Why a journal alone isn’t enough' },
    { id: 'contact', name: 'Contact', use: 'We answer every email' }
  ];

  function track(from, to) {
    try { if (window.MKT && window.MKT.trackEvent) window.MKT.trackEvent('mkt_nav_tap', { from: from, to: to, page: HERE }); } catch (e) {}
  }

  var phone = window.matchMedia('(max-width: 767px)');
  var root = document.documentElement;
  var built = false, bar, sheet, scrim, moreBtn, lastFocus = null;

  function tab(id, label) {
    var a = document.createElement('a');
    a.className = 'mk-ptab';
    a.href = url(id);
    a.innerHTML = svg(id) + '<span>' + label + '</span>';
    if (HERE === id) a.setAttribute('aria-current', 'page');
    a.addEventListener('click', function () { track('tabbar', id); });
    return a;
  }

  function build() {
    if (built) return;
    built = true;
    var wrap = document.createElement('div');
    wrap.className = 'mk-pbar-root';

    bar = document.createElement('nav');
    bar.className = 'mk-pbar';
    bar.setAttribute('aria-label', 'Site');
    bar.appendChild(tab('journal', 'Journal'));
    bar.appendChild(tab('system', 'The System'));

    var trial = document.createElement('a');
    trial.className = 'mk-ptab mk-ptab--trial';
    trial.href = url('pricing');
    trial.setAttribute('data-cta-source', 'tabbar');
    trial.innerHTML = '<span class="mk-pkey">' + svg('trial') + '<span class="mk-p-out">Free Trial</span><span class="mk-p-in">Launch</span></span>';
    trial.addEventListener('click', function (e) {
      if (root.classList.contains('mkt-auth')) { e.preventDefault(); location.href = url('app'); return; }
      if (typeof window.handleCheckout === 'function') { window.handleCheckout('pro', e); }
      // with no checkout on this page (a blog post), the link itself opens Pricing
    });
    bar.appendChild(trial);

    bar.appendChild(tab('pricing', 'Pricing'));

    moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'mk-ptab';
    moreBtn.setAttribute('aria-haspopup', 'dialog');
    moreBtn.setAttribute('aria-expanded', 'false');
    moreBtn.innerHTML = svg('more') + '<span>More</span>';
    if (['journal', 'system', 'pricing', 'index', ''].indexOf(HERE) < 0) moreBtn.classList.add('is-here');
    moreBtn.addEventListener('click', function () { openSheet(); track('tabbar', 'more'); });
    bar.appendChild(moreBtn);

    scrim = document.createElement('div');
    scrim.className = 'mk-psheet-scrim';
    scrim.addEventListener('click', closeSheet);

    sheet = document.createElement('div');
    sheet.className = 'mk-psheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'mkPsheetTitle');
    var tiles = PAGES.map(function (p) {
      return '<li><a class="mk-ptile' + (HERE === p.id ? ' is-here' : '') + '" href="' + url(p.id) + '" data-to="' + p.id + '"' + (HERE === p.id ? ' aria-current="page"' : '') + '>' +
        '<span class="mk-ptile-top"><span class="mk-ptile-ico">' + svg(p.id) + '</span><span class="mk-ptile-name">' + p.name + '</span></span>' +
        '<span class="mk-ptile-use">' + p.use + '</span></a></li>';
    }).join('');
    sheet.innerHTML =
      '<div class="mk-psheet-grab" aria-hidden="true"></div>' +
      '<div class="mk-psheet-head"><p class="mk-psheet-title" id="mkPsheetTitle" tabindex="-1">EVERY PAGE</p>' +
      '<button type="button" class="mk-psheet-x" aria-label="Close">' + svg('x') + '</button></div>' +
      '<ul class="mk-ptiles">' + tiles + '</ul>' +
      '<a class="mk-plogin" href="' + url('app') + '" data-to="app">' + svg('login') + '<span class="mk-p-out">Log In</span><span class="mk-p-in">Launch the App</span></a>' +
      '<div class="mk-pnews"><p><strong>Stay Sharp.</strong> Bi-weekly trading discipline insights.</p>' +
      '<form novalidate><input type="email" name="email" placeholder="you@email.com" autocomplete="email" aria-label="Email address">' +
      '<button type="submit">Subscribe</button><p class="newsletter-error" role="alert" hidden></p></form></div>';
    sheet.querySelector('.mk-psheet-x').addEventListener('click', closeSheet);
    Array.prototype.forEach.call(sheet.querySelectorAll('[data-to]'), function (a) {
      a.addEventListener('click', function () { track('more', a.getAttribute('data-to')); });
    });
    var form = sheet.querySelector('form');
    // A few pages (contact, the legal pages, 404, learn, soundtrack, unsubscribed) carry no newsletter script.
    if (!window.MKTNewsletter) {
      var ns = document.createElement('script');
      ns.src = BASE + 'assets/js/newsletter.js?v=5';
      document.head.appendChild(ns);
    }
    form.addEventListener('submit', function (e) {
      if (window.MKTNewsletter && window.MKTNewsletter.handleForm) return window.MKTNewsletter.handleForm(e, 'tabbar-more');
      e.preventDefault();                                   // its script never arrived: say so, never fail silently
      var err = form.querySelector('.newsletter-error');
      err.textContent = 'Something went wrong. Please try again.';
      err.hidden = false;
      return false;
    });

    wrap.appendChild(bar);
    wrap.appendChild(scrim);
    wrap.appendChild(sheet);
    document.body.appendChild(wrap);
  }

  function openSheet() {
    lastFocus = document.activeElement;
    root.classList.add('mkpb-sheet');
    moreBtn.setAttribute('aria-expanded', 'true');
    var t = sheet.querySelector('.mk-psheet-title');
    try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
  }
  function closeSheet() {
    if (!root.classList.contains('mkpb-sheet')) return;
    root.classList.remove('mkpb-sheet');
    moreBtn.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  // Reading down hides it; scrolling up, the top of the page, or its end brings it back.
  var lastY = window.scrollY || 0, ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY || 0;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var atEnd = y >= max - 48, nearTop = y < 140;
      if (atEnd || nearTop) { root.classList.remove('mkpb-down'); lastY = y; return; }
      var d = y - lastY;
      if (Math.abs(d) < 10) return;
      root.classList.toggle('mkpb-down', d > 0);
      lastY = y;
    });
  }

  // The keyboard: a text field with focus pushes the bar away until it lets go.
  function isField(el) { return el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range|reset)$/i.test(el.type))); }
  document.addEventListener('focusin', function (e) { if (isField(e.target) && !sheet.contains(e.target)) root.classList.add('mkpb-kb'); });
  document.addEventListener('focusout', function (e) { if (isField(e.target)) root.classList.remove('mkpb-kb'); });

  // The newsletter bar: closed, it stays away for the rest of this visit; subscribed, for good.
  var CLOSED_KEY = 'mk_news_bar_closed', SUBSCRIBED_KEY = 'mk_news_subscribed';
  try { localStorage.removeItem('mk_news_bar_done'); } catch (e) {}   // the first release kept a close forever
  try {
    if (localStorage.getItem(SUBSCRIBED_KEY) === '1' || sessionStorage.getItem(CLOSED_KEY) === '1') root.classList.add('mkpb-news-done');
  } catch (e) {}
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.sticky-bar-close')) { try { sessionStorage.setItem(CLOSED_KEY, '1'); } catch (err) {} }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.closest || !f.closest('.sticky-bar, .mk-pnews')) return;
    var input = f.querySelector('input[type="email"]');
    if (input && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) { try { localStorage.setItem(SUBSCRIBED_KEY, '1'); } catch (err) {} }
  }, true);

  function apply() {
    if (phone.matches) {
      build();
      root.classList.add('mkpb-on');
      window.addEventListener('scroll', onScroll, { passive: true });
    } else {
      root.classList.remove('mkpb-on', 'mkpb-down', 'mkpb-kb');
      closeSheetQuiet();
      window.removeEventListener('scroll', onScroll);
    }
  }
  function closeSheetQuiet() { if (sheet) { root.classList.remove('mkpb-sheet'); moreBtn.setAttribute('aria-expanded', 'false'); } }

  // Its stylesheet first, so the bar never appears unstyled.
  function start() {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = src.replace(/js\/phone-bar\.js(\?.*)?$/, 'css/phone-bar.css$1');
    link.onload = function () {
      apply();
      if (phone.addEventListener) phone.addEventListener('change', apply); else if (phone.addListener) phone.addListener(apply);
    };
    document.head.appendChild(link);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
