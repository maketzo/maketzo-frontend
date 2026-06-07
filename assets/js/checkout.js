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
  // users. Coordinated changes on signed-in detection:
  //   1. "Log In" -> "LAUNCH" with href /app.
  //   2. Treatment swap (via injected CSS scoped to .nav-signedin):
  //      LAUNCH adopts gold; "Start Free Trial" drops to outlined.
  //      Principle: gold = "the user's primary action right now."
  //      Gold migrates with meaning; only one filled gold button exists.
  //   3. DOM reorder: LAUNCH's <li> moves AFTER the trial button's <li>
  //      so the gold-rightmost eye anchor is preserved across auth states.
  //
  // The injected CSS approach replaces an earlier failed attempt that
  // swapped class names (nav-login-btn <-> nav-cta). That broke because:
  //   (a) `.nav-links > li > a:not(.nav-login-btn)` clobbered LAUNCH's
  //       text color when nav-login-btn was removed;
  //   (b) `.nav-login-btn` was authored assuming the `<a>` element;
  //       applied to the `<button>` element, browser-default styles
  //       leaked through.
  // Keeping the original classes and overriding via a marker scope is
  // symmetric for both element types and high-specificity-safe.
  //
  // See memory/feedback-checkout-must-disambiguate-logged-in-user.md.
  const NAV_SIGNEDIN_CSS =
    '.nav-links.nav-signedin > li > a.nav-login-btn{' +
      'background:var(--mk-gold-gradient);color:var(--mk-text-on-gold);' +
      'border:1px solid rgba(0,0,0,.18);justify-content:center;' +
      'white-space:nowrap;text-decoration:none;' +
    '}' +
    '.nav-links.nav-signedin > li > a.nav-login-btn:hover{' +
      'background:var(--mk-gold-gradient);color:var(--mk-text-on-gold);' +
      'border-color:rgba(0,0,0,.18);transform:translateY(-1px);' +
      'box-shadow:var(--mk-glow-gold-sm);' +
    '}' +
    '.nav-links.nav-signedin > li > button.nav-cta{' +
      'background:transparent;color:var(--mk-text-secondary);' +
      'border:1px solid var(--mk-smoke-700);box-shadow:none;transform:none;' +
    '}' +
    '.nav-links.nav-signedin > li > button.nav-cta:hover{' +
      'background:rgba(255,255,255,.03);color:var(--mk-text-primary);' +
      'border-color:var(--mk-smoke-600);transform:none;box-shadow:none;' +
    '}';

  let _navCssInjected = false;
  function ensureNavCss() {
    if (_navCssInjected) return;
    _navCssInjected = true;
    const s = document.createElement('style');
    s.id = 'mkt-nav-signedin';
    s.textContent = NAV_SIGNEDIN_CSS;
    document.head.appendChild(s);
  }

  function syncNav() {
    getMe().then(function (me) {
      if (!me) return;
      ensureNavCss();
      const launches = document.querySelectorAll('a.nav-login-btn');
      for (let i = 0; i < launches.length; i++) {
        const launchA = launches[i];
        // Source-uppercased per CLAUDE.md §3 (CSS text-transform:uppercase
        // applies, so source matches visual).
        launchA.textContent = 'LAUNCH';
        launchA.setAttribute('href', '/app');

        // Find the sibling Start Free Trial button inside the same <ul>
        // so the swap is scoped to this nav instance.
        const launchLi = launchA.parentElement;
        const ul = launchLi && launchLi.parentElement;
        const trialBtn = ul ? ul.querySelector('button.nav-cta') : null;
        if (!ul || !trialBtn) continue;
        const trialLi = trialBtn.parentElement;

        // Mark the nav as signed-in so the injected CSS applies (color/treatment
        // only — no layout change).
        ul.classList.add('nav-signedin');

        // NOTE: we deliberately do NOT reorder the <li>s here. The earlier
        // `insertBefore` swap moved LAUNCH past the trial button AFTER the async
        // auth check resolved, which reflowed the nav a beat after paint and read
        // as the right-side buttons "violently" jumping on every page load
        // (Ed flagged 2026-06-07). Treatment swap alone (gold ↔ outline) signals
        // the primary action without any layout shift. `trialLi` retained for
        // clarity / future use.
        void trialLi;
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
          '<button type="button" data-act="signout" style="appearance:none;cursor:pointer;background:transparent;color:var(--mk-text-primary,#e8eaee);border:1px solid var(--mk-border,rgba(255,255,255,0.14));font-weight:600;font-size:14px;padding:12px 16px;border-radius:8px;font-family:inherit;">Sign out &amp; sign up as new</button>' +
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

  // ── Plan resolution ──────────────────────────────────────────────────
  // Stripe-LIVE decoupling: CTAs name a TIER (+ optional interval); the backend
  // resolves the real, mode-specific Stripe price from its per-tier env. The page
  // never hardcodes a price ID, so the LIVE flip is a backend-only change. A raw
  // priceId is still accepted (legacy CTAs) and forwarded as-is for back-compat.
  const TIERS = ['journal', 'pro', 'elite', 'indicators'];
  function isTier(s) { return typeof s === 'string' && TIERS.indexOf(s) !== -1; }
  function isPriceId(s) { return typeof s === 'string' && s.indexOf('price_') === 0; }
  function isEventLike(o) { return o && typeof o === 'object' && ('currentTarget' in o || typeof o.preventDefault === 'function'); }

  // handleCheckout accepts: (event) | (tier, event) | (tier, fakeEvent) | (priceId, event) [legacy].
  async function handleCheckout(a, b) {
    // Normalize args. If the first arg is the event itself, there's no hint.
    let hint, e;
    if (isEventLike(a) && b === undefined) { hint = null; e = a; }
    else { hint = a; e = b; }
    if (e && e.preventDefault) e.preventDefault();

    const btn = e && e.currentTarget ? e.currentTarget : null;
    const ds = (btn && btn.dataset) ? btn.dataset : {};

    // Resolve tier+interval (preferred) or a legacy priceId.
    const tier = ds.tier || (isTier(hint) ? hint : null);
    const interval = (ds.interval || 'month');
    const priceId = tier ? null : (ds.priceId || (isPriceId(hint) ? hint : null));
    if (!tier && !priceId) { console.error('[checkout] missing tier/priceId'); return; }

    // Build the create-checkout payload + the signup routing param once.
    const planBody = tier ? { tier: tier, interval: interval } : { priceId: priceId };
    const signupQuery = tier
      ? ('tier=' + encodeURIComponent(tier) + '&interval=' + encodeURIComponent(interval))
      : ('plan=' + encodeURIComponent(priceId));

    // Analytics — fire BEFORE the network/redirect. If the button already has
    // data-cta-source the wrapper will have fired cta_click on the same click;
    // we still want a plan-aware echo here so the analytics row carries the plan
    // even on unsourced CTAs (mobile drawer, nav buttons, etc).
    if (window.MKT && window.MKT.trackEvent) {
      window.MKT.trackEvent('cta_click', {
        source: btn && btn.dataset ? (btn.dataset.ctaSource || 'unsourced') : 'unsourced',
        target: 'checkout',
        tier: tier || null,
        interval: tier ? interval : null,
        priceId: priceId || null,
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
        window.location.href = '/signup.html?' + signupQuery;
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
        window.location.href = '/signup.html?' + signupQuery;
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
        body: JSON.stringify(Object.assign({}, planBody, {
          mkt_anon_id: anonId,
          mkt_session_id: sessionId,
          mkt_source_path: window.location.pathname
        }))
      });
      const data = await checkoutRes.json().catch(function () { return {}; });
      if (data.url) {
        // trial_started fires after the Stripe URL is in hand — most accurate
        // signal short of the conversion webhook itself.
        if (window.MKT && window.MKT.trackEvent) {
          window.MKT.trackEvent('trial_started', Object.assign({
            source_path: window.location.pathname
          }, planBody));
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
