/**
 * The deal bar: one line above the top nav on every marketing page while a deal shows (maketzo-backend lib/deals.js,
 * Ed's mockup pick 2026-11-18). Loaded by assets/js/mkt-analytics.js only when GET /deals/live has a deal, so a page
 * with no deal running never downloads it. Close hides it on this page only: a refresh or the next page shows it
 * again (Ed, 2026-11-18: "It should come back on the next visit or if I refresh the page"; it used to stay hidden
 * for the whole tab). No blur and no endless animation (the heat
 * check: a full-width fixed bar must not repaint the page).
 */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show(d, count) {
    if (!d || !d.code || document.getElementById('mkDealBar')) return;
    var bar = document.createElement('div');
    bar.id = 'mkDealBar';
    bar.className = 'mk-dealbar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Deal');
    // Arrived through Claim (/pricing?code=X): say the code is already on, so nobody goes looking for a box to type it.
    var applied = false;
    try { applied = sessionStorage.getItem('mkt_deal_code') === d.code; } catch (e) {}
    // Ed's words, 2026-11-18: "!" after the offer, a double space after it ("Add a space after year! (double space)"),
    // and a caret after See Deals. The double space is a no-break space plus a space, since HTML folds two into one.
    bar.innerHTML = '<a class="mk-dealbar-link" href="/deals" data-cta-source="deal-bar" data-cta-target="deals">' +
      '<span class="mk-dealbar-name">' + esc(String(d.name || '').toUpperCase()) + '</span>' +
      (applied
        ? '<span class="mk-dealbar-text">' + esc(d.headline) + '!&nbsp; Code <span class="mk-dealbar-code">' + esc(d.code) + '</span> is applied at checkout on ' + esc(d.plansLabel) + (d.billing === 'year' ? ', billed yearly' : d.billing === 'month' ? ', billed monthly' : '') + '</span>'
        : '<span class="mk-dealbar-text">' + esc(d.headline) + '!&nbsp; Use code <span class="mk-dealbar-code">' + esc(d.code) + '</span></span>') +
      '<span class="mk-dealbar-ends">Ends ' + esc(d.endsShort) + '</span>' +
      // The phone's one-line version ("BLACK FRIDAY  40% off!  See Deals"): the full sentence wrapped to three lines
      // there and pushed each page's trial button down by 71px (WebKit check on staging, 2026-11-18).
      '<span class="mk-dealbar-short">' + esc(String(d.headline || '').replace(/ off .*$/, ' off')) + (applied ? ' applied!' : '!') + '</span>' +
      // The hover underline sits on the words only, never the caret (Ed, 2026-11-18: "the carat is underlined").
      '<span class="mk-dealbar-go"><span class="mk-dealbar-go-text">' + (count > 1 ? 'See All Deals' : 'See Deals') + '</span><span class="mk-dealbar-caret" aria-hidden="true">&rsaquo;</span></span></a>' +
      '<button type="button" class="mk-dealbar-x" aria-label="Hide the deal bar">&times;</button>' +
      // Gold Sweep (Ed's pick A, 2026-11-18): the bar slides down, one band of light crosses it, the caret nudges twice.
      // About 2 seconds once per page, then still: nothing loops (memory feedback-no-sustained-heat-only-temporary-load).
      '<span class="mk-dealbar-sweep" aria-hidden="true"></span>';
    bar.classList.add('is-arriving');
    document.body.insertBefore(bar, document.body.firstChild);
    var root = document.documentElement;
    function fit() { root.style.setProperty('--mk-dealbar-h', bar.offsetHeight + 'px'); }
    root.classList.add('has-deal-bar');
    fit();
    // The Gold Sweep is over by 2.6 seconds; after that the bar carries no animation at all.
    setTimeout(function () { bar.classList.remove('is-arriving'); }, 3000);
    window.addEventListener('resize', fit);
    // The console's Deals report: who saw the deal, and that the bar is where they met it if they click through.
    var M = window.MKT;
    if (M && M.dealSeen) M.dealSeen(d.code, 'deal-bar');
    bar.querySelector('.mk-dealbar-link').addEventListener('click', function () { if (M && M.dealSource) M.dealSource('bar'); });
    bar.querySelector('.mk-dealbar-x').addEventListener('click', function () {
      root.classList.remove('has-deal-bar');
      root.style.removeProperty('--mk-dealbar-h');
      bar.parentNode.removeChild(bar);
    });
    // The bar leaves the moment the deal ends, without a reload.
    var ends = Date.parse(d.endsAt);
    if (ends) setTimeout(function () { var x = bar.querySelector('.mk-dealbar-x'); if (x) x.click(); }, Math.max(0, Math.min(ends - Date.now(), 2147483000)));
  }
  window.MKDealBar = { show: show };
})();
