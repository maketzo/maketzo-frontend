/*!
 * MAKETZO Analytics Wrapper — v1
 *
 * Single front-of-house for ALL marketing-page telemetry. Replaces the
 * direct fetch in audio-player.js's MaketzoAnalytics module; that module
 * still exists as a thin shim so existing call sites (track_play, share,
 * etc.) keep working without edit.
 *
 * Three sinks, one dispatcher:
 *   1. Backend POST /analytics/event   — business-critical events that need
 *                                        JOIN against User + Stripe tables.
 *   2. PostHog Cloud (free tier)       — funnel/cohort/retention dashboards.
 *   3. localStorage (anon_id, consent) — identity-stitching persistence.
 *
 * Public API on window.MKT:
 *   trackEvent(name, props)         dual-fire when business-critical, else PostHog only
 *   trackPage()                     fired automatically on load; exposed for SPA-style nav
 *   identify(email)                 server-side via /analytics/identify + posthog.identify
 *   getAnonId() / getSessionId()    UUID accessors (read-only)
 *   isEuVisitor()                   resolves to bool once /geoinfo returns
 *   onReady(fn)                     fn fires after consent + ids resolved
 *
 * Consent contract with mkt-consent.js:
 *   - localStorage.mkt_consent ∈ {'all', 'essential', null}.
 *   - Non-EU visitors are treated as 'all' (no banner shown).
 *   - 'essential' → no anon_id persistence, PostHog runs in `persistence: 'memory'`.
 *   - The consent module sets the value and dispatches `window.dispatchEvent(new Event('mkt:consent-changed'))`.
 *
 * PostHog project key:
 *   - This file ships with empty keys per host. Ed fills them in (one per
 *     tier) after signing up at us.posthog.com. While empty, PostHog is
 *     skipped silently; backend analytics still fire. See PR2 setup notes.
 */
(function () {
  "use strict";

  // ── Configuration ────────────────────────────────────────────────────
  // Tier-aware API base — same derivation as checkout.js / audio-player.js.
  // Chrome hides "www." in the URL bar but window.location.hostname returns
  // it. Strip leading www. so the apex and www variants resolve identically.
  var API_BASE = (function () {
    var h0 = window.location.hostname;
    var h = h0.indexOf("www.") === 0 ? h0.slice(4) : h0;
    if (h === "localhost" || h.indexOf("127.") === 0) return "http://localhost:3000";
    if (h === "maketzo.co") return "https://api.maketzo.co";
    var parts = h.split(".");
    if (parts.length >= 3) return "https://" + parts[0] + "-api." + parts.slice(1).join(".");
    return "https://api." + h;
  })();

  // Single PostHog project for all tiers (filter by host in dashboards if
  // dev/staging noise becomes a problem). Project token is write-only and
  // safe to embed client-side per PostHog's docs.
  var POSTHOG_KEYS = {
    "maketzo.co":         "phc_t4DFgxhUSgonk6g6FHBWaixHzMCnTeqTSKhZXW2rW65Q",
    "staging.maketzo.co": "phc_t4DFgxhUSgonk6g6FHBWaixHzMCnTeqTSKhZXW2rW65Q",
    "dev.maketzo.co":     "phc_t4DFgxhUSgonk6g6FHBWaixHzMCnTeqTSKhZXW2rW65Q",
    "localhost":          "phc_t4DFgxhUSgonk6g6FHBWaixHzMCnTeqTSKhZXW2rW65Q"
  };
  var POSTHOG_HOST = "https://us.i.posthog.com";

  var ANON_KEY    = "mkt_aid";
  var SESSION_KEY = "mkt_sid";
  var CONSENT_KEY = "mkt_consent";

  // Events that ALSO go to the backend (business-critical, need DB JOIN).
  // Everything else is PostHog-only (page_view, scroll_depth, form_start,
  // outbound_click).
  var DUAL_FIRE_EVENTS = {
    cta_click: true,
    form_submit: true,
    newsletter_subscribe: true,
    trial_started: true,
    share_open: true,
    share_action: true,
    track_play: true,
    track_25: true,
    track_50: true,
    track_75: true,
    track_complete: true,
    deep_link_arrival: true
  };

  // ── Utilities ────────────────────────────────────────────────────────
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
  }

  function safeLocal(op, key, value) {
    try {
      if (op === "get") return localStorage.getItem(key);
      if (op === "set") { localStorage.setItem(key, value); return value; }
      if (op === "del") { localStorage.removeItem(key); return null; }
    } catch (e) { return null; }
    return null;
  }

  function safeSession(op, key, value) {
    try {
      if (op === "get") return sessionStorage.getItem(key);
      if (op === "set") { sessionStorage.setItem(key, value); return value; }
    } catch (e) { return null; }
    return null;
  }

  function getConsent() {
    var c = safeLocal("get", CONSENT_KEY);
    return c === "all" || c === "essential" ? c : null;
  }

  function consentAllowsPersistence() {
    // No decision yet → behave like 'all' on non-EU (consent.js sets it
    // explicitly for EU), or hold off if we know we're EU and unresolved.
    var c = getConsent();
    if (c === "essential") return false;
    return true;
  }

  function getAnonId() {
    if (!consentAllowsPersistence()) {
      // Memory-only: one volatile ID per page load.
      if (!window.__mktVolatileAid) window.__mktVolatileAid = uuid();
      return window.__mktVolatileAid;
    }
    var existing = safeLocal("get", ANON_KEY);
    if (existing) return existing;
    return safeLocal("set", ANON_KEY, uuid());
  }

  function getSessionId() {
    var existing = safeSession("get", SESSION_KEY);
    if (existing) return existing;
    return safeSession("set", SESSION_KEY, uuid());
  }

  function getUtm() {
    var out = { utm_source: null, utm_campaign: null };
    try {
      var p = new URLSearchParams(window.location.search);
      out.utm_source = p.get("utm_source") || null;
      out.utm_campaign = p.get("utm_campaign") || null;
    } catch (e) {}
    return out;
  }

  // ── Backend dispatch ─────────────────────────────────────────────────
  function sendToBackend(eventType, props) {
    var utm = getUtm();
    var body = {
      event_type: eventType,
      session_id: getSessionId(),
      anon_id: getAnonId(),
      track_id: props.track_id || null,
      timestamp_sec: (typeof props.timestamp_sec === "number" && isFinite(props.timestamp_sec))
        ? Math.floor(props.timestamp_sec) : null,
      platform: props.platform || null,
      target: props.target || null,
      page: window.location.pathname,
      referrer: document.referrer || null,
      utm_source: utm.utm_source,
      utm_campaign: utm.utm_campaign
    };
    try {
      fetch(API_BASE + "/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: "omit",
        mode: "cors"
      }).catch(function () {});
    } catch (e) {}
  }

  // ── PostHog loader ───────────────────────────────────────────────────
  // Standard PostHog snippet — patched to be no-op when key is empty.
  // The snippet exposes window.posthog with a buffered queue, then loads
  // the full SDK script asynchronously. We call posthog.init() ourselves
  // to control persistence based on consent.
  var posthogReady = false;
  var posthogQueue = [];

  function loadPostHog() {
    var host = window.location.hostname;
    var key = POSTHOG_KEYS[host] || POSTHOG_KEYS["maketzo.co"];
    if (!key) return; // Disabled tier — silent no-op.

    if (window.posthog && window.posthog.__loaded) {
      posthogReady = true;
      drainQueue();
      return;
    }

    // Inline PostHog snippet (https://posthog.com/docs/libraries/js).
    // Buffered until the SDK loads; we then call posthog.init().
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    var persistence = consentAllowsPersistence() ? "localStorage+cookie" : "memory";
    window.posthog.init(key, {
      api_host: POSTHOG_HOST,
      persistence: persistence,
      capture_pageview: false,   // We fire page_view manually with our anon_id.
      autocapture: false,         // We instrument explicitly via data-cta-*.
      disable_session_recording: true,
      // Only create PostHog "person" records after MKT.identify(email). Anon
      // visitors still fire events but don't burn through the free-tier
      // person quota until they convert. Matches PostHog's privacy-first
      // recommendation in their HTML snippet template.
      person_profiles: 'identified_only',
      loaded: function () { posthogReady = true; drainQueue(); }
    });
  }

  function drainQueue() {
    while (posthogQueue.length) {
      var item = posthogQueue.shift();
      try { window.posthog.capture(item.name, item.props); } catch (e) {}
    }
  }

  function sendToPostHog(eventType, props) {
    var host = window.location.hostname;
    var key = POSTHOG_KEYS[host] || POSTHOG_KEYS["maketzo.co"];
    if (!key) return; // PostHog disabled for this tier.

    var enriched = Object.assign({
      $anon_id: getAnonId(),
      page: window.location.pathname
    }, props || {});

    if (posthogReady && window.posthog) {
      try { window.posthog.capture(eventType, enriched); } catch (e) {}
    } else {
      posthogQueue.push({ name: eventType, props: enriched });
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  function trackEvent(eventType, props) {
    props = props || {};
    if (DUAL_FIRE_EVENTS[eventType]) sendToBackend(eventType, props);
    sendToPostHog(eventType, props);
  }

  function trackPage() {
    sendToPostHog("page_view", {
      path: window.location.pathname,
      referrer: document.referrer || null,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      utm_source: getUtm().utm_source,
      utm_campaign: getUtm().utm_campaign
    });
  }

  function identify(email) {
    if (!email || typeof email !== "string") return;
    // 1. Server-side: writes a SessionLink row (anon_id ↔ email_hash).
    try {
      fetch(API_BASE + "/analytics/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anon_id: getAnonId(), email: email }),
        keepalive: true,
        credentials: "omit",
        mode: "cors"
      }).catch(function () {});
    } catch (e) {}
    // 2. PostHog: link anon → known user going forward.
    if (posthogReady && window.posthog) {
      try { window.posthog.identify(email, { anon_id: getAnonId() }); } catch (e) {}
    }
  }

  // EU detection — server resolves country via cf-ipcountry header. Cached
  // for the session so we don't ping /geoinfo on every page nav.
  var EU_COUNTRIES = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","IS","LI","NO","GB","CH"];
  var euResolved = null;
  var euResolvers = [];
  function isEuVisitor() {
    return new Promise(function (resolve) {
      if (euResolved !== null) return resolve(euResolved);
      euResolvers.push(resolve);
      if (euResolvers.length > 1) return; // Already in-flight.
      var cached = safeSession("get", "mkt_geo");
      if (cached) {
        euResolved = EU_COUNTRIES.indexOf(cached) >= 0;
        flushEuResolvers();
        return;
      }
      try {
        fetch(API_BASE + "/geoinfo", { credentials: "omit", mode: "cors" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var country = (data && data.country) ? data.country.toUpperCase() : null;
            if (country) safeSession("set", "mkt_geo", country);
            euResolved = country ? EU_COUNTRIES.indexOf(country) >= 0 : tzFallback();
            flushEuResolvers();
          })
          .catch(function () {
            euResolved = tzFallback();
            flushEuResolvers();
          });
      } catch (e) {
        euResolved = tzFallback();
        flushEuResolvers();
      }
    });
  }

  function flushEuResolvers() {
    while (euResolvers.length) euResolvers.shift()(euResolved);
  }

  function tzFallback() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      return tz.indexOf("Europe/") === 0;
    } catch (e) { return false; }
  }

  // ── CTA + scroll-depth + outbound auto-instrumentation ───────────────
  function initCtaTracking() {
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("[data-cta-source], [data-cta-target]");
      if (t) {
        var src = t.getAttribute("data-cta-source") || null;
        var tgt = t.getAttribute("data-cta-target") || null;
        var label = (t.textContent || "").trim().slice(0, 64) || null;
        trackEvent("cta_click", { source: src, target: tgt, label: label });
        return;
      }
      // Back-compat: legacy /pricing anchors without data-cta-*.
      var a = e.target && e.target.closest && e.target.closest("a[href]");
      if (a) {
        var href = a.getAttribute("href") || "";
        if (/(^|\/)pricing(\.html)?($|\?|#)/.test(href) && !a.hasAttribute("data-cta-source")) {
          trackEvent("cta_click", { target: "pricing", source: "legacy-link" });
        }
        // Outbound (different host) click — PostHog-only.
        if (/^https?:\/\//.test(href)) {
          try {
            var u = new URL(href, window.location.origin);
            if (u.hostname && u.hostname !== window.location.hostname) {
              sendToPostHog("outbound_click", { href: href, host: u.hostname });
            }
          } catch (e2) {}
        }
      }
    }, true);
  }

  function initScrollDepth() {
    if (!("IntersectionObserver" in window)) return;
    var fired = {};
    // Sections + reveals + key milestones.
    var nodes = Array.prototype.slice.call(
      document.querySelectorAll("section[id], .reveal[data-depth-id]")
    );
    if (!nodes.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var node = entry.target;
        var id = node.id || node.getAttribute("data-depth-id");
        if (!id || fired[id]) return;
        fired[id] = true;
        sendToPostHog("scroll_depth", {
          section_id: id,
          path: window.location.pathname
        });
      });
    }, { threshold: 0.5 });
    nodes.forEach(function (n) { obs.observe(n); });
  }

  function initFormStart() {
    document.addEventListener("focusin", function (e) {
      var f = e.target && e.target.closest && e.target.closest("form[data-form-id]");
      if (!f || f._mktFormStarted) return;
      f._mktFormStarted = true;
      sendToPostHog("form_start", { form: f.getAttribute("data-form-id") });
    }, true);
  }

  // ── MaketzoAnalytics shim ─────────────────────────────────────────────
  // The existing audio-player.js calls window.MaketzoAnalytics.send(...).
  // We keep that surface and route through trackEvent for dual-fire +
  // PostHog. session_id continues to be derived from the same key, so
  // events tagged with our anon_id ALSO carry the audio-player session.
  function legacySend(eventType, payload) {
    payload = payload || {};
    trackEvent(eventType, payload);
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  function boot() {
    // Eager IDs — first thing so any subsequent code sees them.
    getAnonId(); getSessionId();

    // Defer PostHog load until consent decision (or auto-decide non-EU).
    isEuVisitor().then(function (isEu) {
      if (!isEu) {
        // Non-EU: treat as 'all'.
        if (!getConsent()) safeLocal("set", CONSENT_KEY, "all");
      }
      loadPostHog();
      trackPage();
    });

    initCtaTracking();
    initFormStart();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initScrollDepth);
    } else {
      initScrollDepth();
    }
  }

  // React to consent banner choice — reload PostHog with the right
  // persistence mode if it changes.
  window.addEventListener("mkt:consent-changed", function () {
    var host = window.location.hostname;
    var key = POSTHOG_KEYS[host] || POSTHOG_KEYS["maketzo.co"];
    if (!key) return;
    if (window.posthog && window.posthog.set_config) {
      var persistence = consentAllowsPersistence() ? "localStorage+cookie" : "memory";
      try { window.posthog.set_config({ persistence: persistence }); } catch (e) {}
    }
  });

  window.MKT = {
    trackEvent: trackEvent,
    trackPage: trackPage,
    identify: identify,
    getAnonId: getAnonId,
    getSessionId: getSessionId,
    isEuVisitor: isEuVisitor
  };

  // Compat shim — audio-player.js still calls MaketzoAnalytics.send().
  window.MaketzoAnalytics = window.MaketzoAnalytics || {};
  window.MaketzoAnalytics.send = legacySend;
  window.MaketzoAnalytics.getSessionId = getSessionId;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
