// assets/js/not-found.js: the one event the 404 page sends, so the analytics portal can list broken links.
//
// 404.html loads this with defer, AFTER mkt-analytics.js. .htaccess serves 404.html for every missing URL
// (ErrorDocument 404 /404.html) as an internal redirect, so location.pathname is still the path that was missing.
//
// mkt_404 matches the open mkt_ prefix, so mkt-analytics.js sends it to the backend (track_events) as well as PostHog,
// with no backend deploy. Properties stay short: the path without its query string, and the referring HOST only, never
// a full URL. An empty referrer_host (a typed URL, a bookmark, an app that strips the referrer) is dropped by the props
// gate, so "no referrer" reads as the property being absent.
(function () {
  'use strict';

  function referrerHost() {
    try { return document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { return ''; }
  }

  function send() {
    var mkt = window.MKT;
    if (!mkt || typeof mkt.trackEvent !== 'function') return;
    mkt.trackEvent('mkt_404', {
      missing_path: String(window.location.pathname || '/').slice(0, 120),
      referrer_host: referrerHost()
    });
  }

  // Deferred scripts run in document order, so mkt-analytics.js has run (and booted: ids, referral and newsletter
  // tagging) before this file. If this file is ever loaded without defer, wait for the DOM, where mkt-analytics.js
  // registered its boot first. PostHog loads later; mkt-analytics.js queues the event until it is ready.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', send);
  else send();
})();
