/*!
 * MAKETZO EU Consent Banner — v1
 *
 * Renders ONLY for EU visitors who have not yet made a choice. Coordinates
 * with mkt-analytics.js via localStorage.mkt_consent and the
 * 'mkt:consent-changed' event.
 *
 * Two choices:
 *   "Accept all" → full tracking (anon_id persisted, PostHog with localStorage)
 *   "Essential only" → no anon_id persistence, PostHog in memory mode,
 *                      page_view still counts (anonymized, no person retention)
 *
 * Visual style mirrors .mk-share-toast: gold accent stripe, dark glass surface,
 * branded type. No third-party widget dependency.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "mkt_consent";

  function alreadyDecided() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  }

  function setChoice(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
    try { window.dispatchEvent(new Event("mkt:consent-changed")); } catch (e) {}
    if (window.MKT && window.MKT.trackEvent) {
      window.MKT.trackEvent("consent_set", { choice: value });
    }
  }

  function injectStyles() {
    if (document.getElementById("mkt-consent-styles")) return;
    var style = document.createElement("style");
    style.id = "mkt-consent-styles";
    style.textContent = [
      ".mkt-consent{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);",
      "z-index:9999;width:min(560px,calc(100% - 32px));",
      "background:rgba(15,15,18,.96);color:#f4f3ef;",
      "border:1px solid rgba(212,175,55,.42);border-radius:14px;",
      "box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4);",
      "padding:18px 20px 16px;font-family:'DM Sans',system-ui,sans-serif;",
      "font-size:14px;line-height:1.5;opacity:0;",
      "transition:opacity .3s ease,transform .3s ease;",
      "backdrop-filter:blur(12px);}",
      ".mkt-consent.is-visible{opacity:1;}",
      ".mkt-consent__title{font-family:'Bebas Neue',sans-serif;font-size:15px;",
      "letter-spacing:.12em;color:#d4af37;text-transform:uppercase;margin-bottom:6px;}",
      ".mkt-consent__body{color:rgba(244,243,239,.82);margin-bottom:14px;}",
      ".mkt-consent__body a{color:#d4af37;text-decoration:underline;}",
      ".mkt-consent__actions{display:flex;gap:10px;flex-wrap:wrap;}",
      ".mkt-consent__btn{flex:1 1 auto;min-width:130px;padding:10px 16px;",
      "border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;",
      "font-weight:600;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;",
      "transition:transform .15s ease,box-shadow .15s ease;border:0;}",
      ".mkt-consent__btn:hover{transform:translateY(-1px);}",
      ".mkt-consent__btn--primary{background:linear-gradient(135deg,#d4af37 0%,#b8941f 100%);",
      "color:#0f0f12;box-shadow:0 6px 16px rgba(212,175,55,.28);}",
      ".mkt-consent__btn--ghost{background:transparent;color:#f4f3ef;",
      "border:1px solid rgba(244,243,239,.28);}",
      ".mkt-consent__btn--ghost:hover{border-color:rgba(244,243,239,.5);}",
      "@media (max-width:520px){.mkt-consent{bottom:16px;padding:16px;}",
      ".mkt-consent__btn{flex:1 1 100%;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function renderBanner() {
    injectStyles();
    var el = document.createElement("aside");
    el.className = "mkt-consent";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Privacy preferences");
    el.innerHTML = [
      '<div class="mkt-consent__title">Privacy preferences</div>',
      '<div class="mkt-consent__body">',
      'MAKETZO uses analytics to understand which pages help traders the most. ',
      'You can accept all (helps us improve faster) or keep it to essentials only. ',
      '<a href="/privacy" target="_blank" rel="noopener">Privacy policy</a>.',
      '</div>',
      '<div class="mkt-consent__actions">',
      '<button type="button" class="mkt-consent__btn mkt-consent__btn--ghost" data-choice="essential">Essential only</button>',
      '<button type="button" class="mkt-consent__btn mkt-consent__btn--primary" data-choice="all">Accept all</button>',
      '</div>'
    ].join("");
    document.body.appendChild(el);
    // Force reflow then transition in.
    requestAnimationFrame(function () { el.classList.add("is-visible"); });

    el.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-choice]");
      if (!btn) return;
      setChoice(btn.getAttribute("data-choice"));
      el.classList.remove("is-visible");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    });
  }

  function boot() {
    if (alreadyDecided()) return;
    // Wait for MKT to resolve EU geo, then maybe render.
    var tries = 0;
    function waitForMkt() {
      if (window.MKT && window.MKT.isEuVisitor) {
        window.MKT.isEuVisitor().then(function (isEu) {
          if (isEu && !alreadyDecided()) renderBanner();
        });
        return;
      }
      if (++tries > 50) return; // ~5s max wait.
      setTimeout(waitForMkt, 100);
    }
    waitForMkt();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
