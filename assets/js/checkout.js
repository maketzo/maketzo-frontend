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

  const API = (function () {
    const h = window.location.hostname;
    if (h === 'dev.maketzo.co' || h === 'staging.maketzo.co') return '';
    if (h === 'maketzo.co') return 'https://api.maketzo.co';
    return 'https://api.maketzo.co';
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

    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = 'Loading...'; btn.disabled = true; }

    try {
      const meRes = await fetch(API + '/auth/me', { credentials: 'include' });

      if (meRes.status !== 200) {
        window.location.href = '/signup.html?plan=' + encodeURIComponent(finalId);
        return;
      }

      const csrf = getCsrfCookie();
      const checkoutRes = await fetch(API + '/billing/create-checkout', {
        method: 'POST',
        credentials: 'include',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          csrf ? { 'X-CSRF-Token': csrf } : {}
        ),
        body: JSON.stringify({ priceId: finalId })
      });
      const data = await checkoutRes.json().catch(function () { return {}; });
      if (data.url) {
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
