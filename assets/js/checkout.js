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

  // ── Auth state cache ──────────────────────────────────────────────────
  // /auth/me is hit on load (for nav swap) AND on CTA click (for intercept).
  // Cache the promise so we only fire one request per page load.
  let _meCache = null;
  function getMe() {
    if (!_meCache) {
      _meCache = fetch(API + '/auth/me', { credentials: 'include' })
        .then(function (r) {
          if (r.status !== 200) return null;
          return r.json().catch(function () { return null; });
        })
        .catch(function () { return null; });
    }
    return _meCache;
  }

  // ── Auth-aware nav swap ───────────────────────────────────────────────
  // Static "Log In" link in every marketing-page nav misleads logged-in
  // users (they think they're signed out). Swap it on page load.
  // See memory/feedback-checkout-must-disambiguate-logged-in-user.md.
  function syncNav() {
    getMe().then(function (me) {
      if (!me) return;
      const btns = document.querySelectorAll('a.nav-login-btn');
      for (let i = 0; i < btns.length; i++) {
        btns[i].textContent = 'Account';
        btns[i].setAttribute('href', '/app#/account');
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncNav);
  } else {
    syncNav();
  }

  // ── Cross-user signup intercept ───────────────────────────────────────
  // Renders a 2-choice modal when a logged-in user clicks a trial CTA.
  // Returns a Promise that resolves with 'upgrade' | 'signout' | 'cancel'.
  function showInterceptModal(email) {
    return new Promise(function (resolve) {
      const root = document.createElement('div');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Confirm account for trial');
      root.style.cssText =
        'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(8,10,14,0.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
        'font-family:var(--mk-font-sans,system-ui,sans-serif);padding:24px;';

      const card = document.createElement('div');
      card.style.cssText =
        'max-width:440px;width:100%;background:var(--mk-bg-elevated,#13161d);' +
        'border:1px solid var(--mk-border,rgba(255,255,255,0.08));border-radius:12px;' +
        'padding:28px;box-shadow:0 24px 60px rgba(0,0,0,0.6);color:var(--mk-text-primary,#e8eaee);';

      const emailEsc = String(email || '').replace(/[<>&"]/g, function (c) {
        return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
      });

      card.innerHTML =
        '<div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--mk-gold,#c9a961);font-weight:600;margin-bottom:10px;">Confirm Account</div>' +
        '<h2 style="margin:0 0 12px 0;font-size:20px;font-weight:600;line-height:1.3;color:var(--mk-text-primary,#e8eaee);">You’re signed in as ' + emailEsc + '.</h2>' +
        '<p style="margin:0 0 22px 0;font-size:14px;line-height:1.55;color:var(--mk-text-secondary,#9aa1ad);">Continue the trial on this account, or sign out and start a new one.</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<button type="button" data-act="upgrade" style="appearance:none;border:none;cursor:pointer;background:var(--mk-gold,#c9a961);color:#0a0c12;font-weight:600;font-size:14px;padding:12px 16px;border-radius:8px;font-family:inherit;">Continue as ' + emailEsc + '</button>' +
          '<button type="button" data-act="signout" style="appearance:none;cursor:pointer;background:transparent;color:var(--mk-text-primary,#e8eaee);border:1px solid var(--mk-border,rgba(255,255,255,0.14));font-weight:600;font-size:14px;padding:12px 16px;border-radius:8px;font-family:inherit;">Sign Out &amp; Sign Up as New</button>' +
          '<button type="button" data-act="cancel" style="appearance:none;cursor:pointer;background:transparent;color:var(--mk-text-secondary,#9aa1ad);border:none;font-size:13px;padding:8px;font-family:inherit;margin-top:4px;">Cancel</button>' +
        '</div>';

      function close(result) {
        document.removeEventListener('keydown', onKey);
        if (root.parentNode) root.parentNode.removeChild(root);
        resolve(result);
      }
      function onKey(e) { if (e.key === 'Escape') close('cancel'); }

      card.addEventListener('click', function (ev) {
        const t = ev.target;
        if (t && t.dataset && t.dataset.act) close(t.dataset.act);
      });
      root.addEventListener('click', function (ev) {
        if (ev.target === root) close('cancel');
      });
      document.addEventListener('keydown', onKey);

      root.appendChild(card);
      document.body.appendChild(root);

      const upgradeBtn = card.querySelector('[data-act="upgrade"]');
      if (upgradeBtn) upgradeBtn.focus();
    });
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

    function restoreBtn() {
      if (btn) { btn.innerHTML = orig; btn.disabled = false; }
    }

    try {
      const me = await getMe();

      if (!me) {
        // Unauthenticated → signup. The signup page will fire identify() on
        // success, which links the anon_id to the email.
        window.location.href = '/signup.html?plan=' + encodeURIComponent(finalId);
        return;
      }

      // Logged-in user clicked a marketing trial CTA. Disambiguate: are they
      // upgrading their own account, or is this a household member / shared
      // machine where the cookie belongs to someone else? Without this gate
      // Stripe locks the email field to the cookie owner — dead end for a
      // would-be new signup. See memory/feedback-checkout-must-disambiguate-logged-in-user.md.
      const choice = await showInterceptModal(me.email || 'your account');
      if (choice === 'cancel') {
        restoreBtn();
        return;
      }
      if (choice === 'signout') {
        // /auth/logout (GET) clears mkt_sess + mkt_csrf cookies on the API
        // origin. Use fetch with credentials:'include' so the cookies on the
        // api.* subdomain actually get cleared (not just on the page origin).
        // Then route to /signup with the plan so the new-user flow chains
        // back into Stripe via the one-shot pay token.
        try {
          await fetch(API + '/auth/logout', { credentials: 'include', redirect: 'manual' });
        } catch (_) { /* clear cookies regardless of network outcome */ }
        window.location.href = '/signup.html?plan=' + encodeURIComponent(finalId);
        return;
      }

      // choice === 'upgrade' → fall through to existing upgrade-checkout path.

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
      restoreBtn();
    }
  }

  // Back-compat: existing buttons use inline onclick="handleCheckout(priceId, event)".
  // Keeping the global name lets us migrate without editing every CTA button.
  window.handleCheckout = handleCheckout;
})();
