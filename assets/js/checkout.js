// MAKETZO trial-CTA checkout helper.
//
// Wired to every "Start Free Trial" / "Start 7-Day Free Trial" button across
// the public site. Behavior:
//
//   1. On click, GET /auth/me (cookie credential) to test the session.
//   2. 200 → POST /billing/create-checkout with the priceId → redirect to
//      Stripe Checkout URL returned by the server.
//   3. 401 → redirect to /signup.html?plan=<priceId>. The signup page reads
//      the plan, renders tier-aware copy, and on submit chains into Stripe
//      via the one-shot pay token returned by /auth/signup.
//
// Replaces the per-page handleCheckout() copies that hard-coded a redirect
// to /auth/google for any user without a `maketzo_token` localStorage flag.
// That flag was retired on 2026-05-14 when the session moved to the
// httpOnly mkt_sess cookie — see CLAUDE.md §4 and memory/feedback-jwt-cookie-storage.md.
(function () {
  'use strict';

  // API base URL — derived from page host so adding a new tier needs no JS change.
  //   localhost / 127.* → http://localhost:3000
  //   maketzo.co (apex) → https://api.maketzo.co
  //   <sub>.maketzo.co  → https://<sub>-api.maketzo.co   (dev → dev-api, etc.)
  const API = (function () {
    // Chrome hides "www." in the URL bar but window.location.hostname returns
    // it. Strip leading www. so the apex and www variants resolve identically.
    const h0 = window.location.hostname;
    const h = h0.indexOf('www.') === 0 ? h0.slice(4) : h0;
    if (h === 'localhost' || h.indexOf('127.') === 0) return 'http://localhost:3000';
    if (h === 'maketzo.co') return 'https://api.maketzo.co';
    const parts = h.split('.');
    if (parts.length >= 3) return 'https://' + parts[0] + '-api.' + parts.slice(1).join('.');
    return 'https://api.' + h;
  })();

  function getCsrfCookie() {
    const m = document.cookie.match(/(?:^|;\s*)mkt_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function handleCheckout(priceId, e) {
    if (e && e.preventDefault) e.preventDefault();
    const btn = e && e.currentTarget ? e.currentTarget : null;
    const finalId = (btn && btn.dataset && btn.dataset.priceId) ? btn.dataset.priceId : priceId;
    if (!finalId) { console.error('[checkout] missing priceId'); return; }

    // Analytics — fire BEFORE the network/redirect. If the button already has
    // data-cta-source the wrapper will have fired cta_click on the same click;
    // we still want a priceId-aware echo here so the analytics row carries the
    // plan even on unsourced CTAs (mobile drawer, nav buttons, etc).
    if (window.MKT && window.MKT.trackEvent) {
      window.MKT.trackEvent('cta_click', {
        source: btn && btn.dataset ? (btn.dataset.ctaSource || 'unsourced') : 'unsourced',
        target: 'checkout',
        priceId: finalId,
        label: btn ? (btn.textContent || '').trim().slice(0, 64) : null
      });
    }

    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = 'Loading...'; btn.disabled = true; }

    try {
      const meRes = await fetch(API + '/auth/me', { credentials: 'include' });

      if (meRes.status !== 200) {
        // Unauthenticated → signup. The signup page will fire identify() on
        // success, which links the anon_id to the email.
        window.location.href = '/signup.html?plan=' + encodeURIComponent(finalId);
        return;
      }

      const csrf = getCsrfCookie();
      // Thread anon_id + session_id + source_path so the Stripe webhook can
      // backfill prior anonymous events with the new user_id on conversion.
      const anonId = (window.MKT && window.MKT.getAnonId) ? window.MKT.getAnonId() : null;
      const sessionId = (window.MKT && window.MKT.getSessionId) ? window.MKT.getSessionId() : null;
      const checkoutRes = await fetch(API + '/billing/create-checkout', {
        method: 'POST',
        credentials: 'include',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          csrf ? { 'X-CSRF-Token': csrf } : {}
        ),
        body: JSON.stringify({
          priceId: finalId,
          mkt_anon_id: anonId,
          mkt_session_id: sessionId,
          mkt_source_path: window.location.pathname
        })
      });
      const data = await checkoutRes.json().catch(function () { return {}; });
      if (data.url) {
        // trial_started fires after the Stripe URL is in hand — most accurate
        // signal short of the conversion webhook itself.
        if (window.MKT && window.MKT.trackEvent) {
          window.MKT.trackEvent('trial_started', {
            priceId: finalId,
            source_path: window.location.pathname
          });
        }
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Checkout failed');
      }
    } catch (err) {
      console.error('[checkout] failed:', err);
      alert('Something went wrong. Please try again.');
      if (btn) { btn.innerHTML = orig; btn.disabled = false; }
    }
  }

  // Back-compat: existing buttons use inline onclick="handleCheckout(priceId, event)".
  // Keeping the global name lets us migrate without editing every CTA button.
  window.handleCheckout = handleCheckout;
})();
