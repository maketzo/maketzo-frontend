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
 *   identifyUser(userId, set, once) THE person join. PostHog distinctId is the
 *                                   integer user id, never the email.
 *   setPerson(props)                tag the still-anonymous person (no account yet)
 *   linkSession(email)               anon_id -> email HASH in our own DB only
 *   identify(email)                 legacy shim: linkSession + setPerson, and
 *                                   deliberately NO email to PostHog
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
 *   - LIVE since commit d290ce0. One real project token, shared by all four
 *     tiers (filter by host in dashboards). It is a write-only token and is
 *     safe to embed client-side per PostHog's docs.
 *   - This block previously described the keys as empty and pending a manual
 *     paste. True at PR2, false from d290ce0 onward, and on 2026-08-25 that
 *     stale note cost an investigation: it pointed straight at a missing-key
 *     theory while the real defect was that nothing emitted `$pageview`.
 *     A comment describing a setup step is a claim with an expiry date.
 *
 * PAGEVIEWS — read this before changing the init options below:
 *   PostHog's entire Web Analytics product (pageviews, unique visitors,
 *   sessions, bounce, referrers) keys EXCLUSIVELY off the reserved `$pageview`
 *   event. A custom event named `page_view` is, to PostHog, an unrelated event:
 *   it lands in Activity and is invisible to every built-in metric. This file
 *   sent only `page_view` for months, so the Web Analytics tab was structurally
 *   empty the entire time while ingestion was perfectly healthy.
 */
/* MK-PII-GATE:BEGIN v1 */
/*
 * The client-side PII gate. Byte-identical in maketzo-app/lib/app-analytics.js
 * and maketzo-frontend/assets/js/mkt-analytics.js. Do not edit one copy.
 *
 * WHY THIS HAS TO EXIST, given the backend already gates.
 *
 * lib/analytics-props.js runs on the SERVER, at POST /analytics/event. It has
 * always protected track_events. It has never protected PostHog: track() fans
 * out to both sinks from the same raw bag, so the identical object that gets
 * bucketed and stripped on its way into Postgres was reaching PostHog Cloud
 * completely ungated. That was survivable while ~85 hand-written events passed
 * hand-picked scalars. It stops being survivable the moment autocapture is on
 * and the number of call sites multiplies.
 *
 * PostHog has no backend of ours to catch anything. For PostHog, this is the
 * only gate there is.
 *
 * A client gate is bypassable by anyone with devtools, and that is fine: the
 * server gate remains the authority for anything we persist. This one exists to
 * stop OUR OWN code shipping a caption, a journal line or a raw P&L to a third
 * party by accident, which is the realistic failure, not a malicious user
 * editing their own analytics.
 *
 * WHY IT IS NOT A STRAIGHT PORT OF THE SERVER RULES. Four of them are actively
 * wrong in a browser, and each would break something silently:
 *
 *   MAX_KEYS = 24        a $pageview carries 40-60 properties. Capping the bag
 *                        would drop $session_id and quietly end sessions.
 *   MAX_SERIALIZED       would truncate $elements_chain mid-string.
 *   deniedKey substring  $initial_utm_content contains "content", so real
 *                        attribution data would be thrown away.
 *   objects dropped      $set and $set_once ARE objects, so identify() would
 *                        stop attaching person properties entirely.
 *
 * So: PostHog reserved keys ($-prefixed) pass through, with named exceptions;
 * everything we author ourselves gets the full server rule set.
 */
(function () {
  "use strict";
  if (window.MaketzoAnalyticsProps) return;

  // Verbatim from maketzo-backend/lib/analytics-props.js. The browser gate is
  // never allowed to be weaker than the server gate, and a test asserts it.
  var DENY_KEY = [
    "email", "password", "passwd", "secret", "token", "apikey", "api_key", "auth",
    "cookie", "session_token", "csrf", "ssn", "phone", "address", "postcode",
    "zip", "dob", "birth", "card", "iban", "account_number", "routing",
    "note", "notetext", "caption", "comment", "feedback", "message", "body",
    "lesson", "mistake", "observation", "prose", "content", "text",
    "dataurl", "data_url", "blob", "base64", "image", "screenshot", "file"
  ];
  var MONEY_KEY = /(^|_)(pnl|profit|loss|balance|equity|amount|revenue|cents|dollars|price|mrr|arr)(_|$)/i;
  var EMAIL_LIKE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  var PROSE_LIKE = /^\S+(\s+\S+){5,}/;
  var MAX_CUSTOM_KEYS = 24;
  var MAX_STR_LEN = 120;
  var MAX_ARRAY = 10;

  // $-prefixed keys pass by default. These are the exceptions: PostHog's own
  // properties that carry the text a user wrote or read on screen.
  var RESERVED_DENY = { $el_text: 1, $selected_content: 1 };

  // Per-element keys inside $elements that can hold user-authored strings.
  var ELEMENT_DENY = ["text", "$el_text", "attr__value", "attr__title",
    "attr__placeholder", "attr__alt", "attr__aria-label"];

  function deniedKey(key) {
    var k = String(key).toLowerCase().replace(/[^a-z0-9_]/g, "");
    for (var i = 0; i < DENY_KEY.length; i++) {
      if (k.indexOf(DENY_KEY[i]) >= 0) return true;
    }
    return false;
  }

  // Sign-preserving bands. Negative money uses a leading minus, never
  // accounting parentheses, matching the app-wide display rule.
  function bucketMoney(n) {
    if (!isFinite(n)) return null;
    var neg = n < 0, a = Math.abs(n), band;
    if (a === 0) return "flat";
    else if (a < 100) band = "0-100";
    else if (a < 500) band = "100-500";
    else if (a < 1000) band = "500-1k";
    else if (a < 5000) band = "1k-5k";
    else if (a < 10000) band = "5k-10k";
    else band = "10k+";
    return (neg ? "-" : "+") + band;
  }

  function cleanValue(key, v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return v;

    if (typeof v === "number") {
      if (!isFinite(v)) return null;
      return MONEY_KEY.test(key) ? bucketMoney(v) : v;
    }

    if (typeof v === "string") {
      var s = v.trim();
      if (!s) return null;
      // Money that arrived as a STRING. data-mk-* attributes are ALWAYS
      // strings, because that is how dataset works, so data-mk-pnl="-450"
      // used to sail past a bucketing rule that only ran for typeof number.
      // The server had the identical hole and is fixed in the same commit.
      if (MONEY_KEY.test(key) && /^-?\d+(\.\d+)?$/.test(s)) return bucketMoney(Number(s));
      if (EMAIL_LIKE.test(s)) return null;
      if (PROSE_LIKE.test(s)) return null;
      return s.length > MAX_STR_LEN ? s.slice(0, MAX_STR_LEN) : s;
    }

    if (Object.prototype.toString.call(v) === "[object Array]") {
      var out = [];
      for (var i = 0; i < v.length && out.length < MAX_ARRAY; i++) {
        var c = cleanValue(key, v[i]);
        if (c !== null) out.push(c);
      }
      return out.length ? out : null;
    }

    return null;
  }

  // Autocapture ships a DOM chain. mask_all_text already suppresses element
  // text, but this is the belt to that suspender: if a masking option is ever
  // dropped from the config, or a PostHog build honours one of them
  // differently, the text still never leaves.
  function scrubElements(list) {
    if (Object.prototype.toString.call(list) !== "[object Array]") return list;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!el || typeof el !== "object") { out.push(el); continue; }
      var copy = {};
      for (var k in el) {
        if (!Object.prototype.hasOwnProperty.call(el, k)) continue;
        if (ELEMENT_DENY.indexOf(k) >= 0) continue;
        var val = el[k];
        if (typeof val === "string" && (EMAIL_LIKE.test(val) || PROSE_LIKE.test(val))) continue;
        copy[k] = val;
      }
      out.push(copy);
    }
    return out;
  }

  function sanitizeProperties(props, eventName) {
    try {
      if (!props || typeof props !== "object") return props;
      var out = {}, custom = 0, k;
      for (k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        var v = props[k];

        if (k.charAt(0) === "$") {
          if (RESERVED_DENY[k]) continue;
          if (k === "$elements") { out[k] = scrubElements(v); continue; }
          if (k === "$elements_chain") {
            if (typeof v === "string" && EMAIL_LIKE.test(v)) continue;
            out[k] = v;
            continue;
          }
          // Person properties. Recurse rather than drop: these are objects, and
          // dropping them would silently stop identify() attaching plan, tier
          // and subscription status.
          if ((k === "$set" || k === "$set_once") && v && typeof v === "object") {
            out[k] = sanitizeProperties(v, eventName);
            continue;
          }
          out[k] = v;
          continue;
        }

        if (deniedKey(k)) continue;
        if (custom >= MAX_CUSTOM_KEYS) continue;
        var cleaned = cleanValue(k, v);
        if (cleaned === null) continue;
        out[k] = cleaned;
        custom++;
      }
      return out;
    } catch (e) {
      // Fail CLOSED for anything we authored, OPEN for PostHog's own reserved
      // properties. A gate must never throw into the SDK, and it must never
      // fail into "send everything".
      try {
        var safe = { pii_gate_error: 1 };
        for (var kk in props) {
          if (kk.charAt(0) === "$" && !RESERVED_DENY[kk]) safe[kk] = props[kk];
        }
        return safe;
      } catch (e2) {
        return { pii_gate_error: 1 };
      }
    }
  }

  window.MaketzoAnalyticsProps = { sanitizeProperties: sanitizeProperties };
})();
/* MK-PII-GATE:END */
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
  var MKT_TIERS = {
    "maketzo.co": "prod",
    "staging.maketzo.co": "staging",
    "dev.maketzo.co": "dev"
  };

  var ANON_KEY    = "mkt_aid";
  var SESSION_KEY = "mkt_sid";
  var CONSENT_KEY = "mkt_consent";

  // Events that ALSO go to the backend (business-critical, need DB JOIN).
  // Everything else is PostHog-only (page_view, scroll_depth, form_start,
  // outbound_click).
  //
  // The map below is CLOSED and stays that way — those names predate the prefix
  // and renaming them would orphan their history. Everything NEW uses the open
  // `mkt_` prefix instead, mirroring the app's `app_` namespace: a new marketing
  // surface ships instrumentation without editing this file OR redeploying the
  // backend. That per-event deploy tax is exactly what let instrumentation rot
  // (2026-08-15 audit). The backend applies the same prefix rule, and the 32-char
  // eventType column cap plus the props gate remain the safety envelope.
  var MKT_PREFIX = /^mkt_[a-z0-9_]{1,26}$/;

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
      utm_campaign: utm.utm_campaign,
      // The property bag (migration 108). Marketing events are still gated by the
      // ANALYTICS_EVENTS whitelist server-side, but their PROPERTIES are now kept
      // instead of discarded — so a cta_click can finally say WHICH cta, and a
      // form_submit WHICH form, in SQL rather than PostHog alone.
      //
      // Sent raw, sanitised server-side by lib/analytics-props.js. A client-side
      // gate would be advisory: this file runs on an anonymous marketing page
      // where anything can be edited, so the PII rule is enforced where it cannot.
      props: props || null
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
      // TRUE, and it must stay true. PostHog owns the pageview lifecycle: it
      // stamps $session_id, derives sessions and bounce rate, and handles
      // history navigation. A hand-rolled posthog.capture('$pageview') gets
      // none of that right. Our own dimensions ride along via register()
      // below, which is what the old manual send was really trying to do.
      capture_pageview: true,
      // Marketing pages are public copy, so element-level capture costs us no
      // privacy. NOTE the app deliberately does the OPPOSITE — see the comment
      // in maketzo-app/lib/app-analytics.js before "fixing" the inconsistency.
      autocapture: true,
      disable_session_recording: true,
      // 'always', so anonymous visitors get person records and the unique /
      // returning visitor counts are real. Under the previous
      // 'identified_only' only newsletter, contact and signup submitters ever
      // became people, so unique visitors was near-zero BY DESIGN and looked
      // exactly like a broken pipeline. Ed's call, 2026-08-25; this is a
      // billing dial (PostHog charges partly on person profiles) and reverting
      // it is a one-word change.
      // Runs INSIDE the SDK, so it covers autocapture, $pageview, $pageleave
      // and $identify -- every event posthog-js generates that our own code
      // never sees. A wrapper around track() could only ever cover our own.
      sanitize_properties: function (props, eventName) {
        var g = window.MaketzoAnalyticsProps;
        return g ? g.sanitizeProperties(props, eventName) : props;
      },
      // Session duration and bounce rate. Set explicitly rather than relying
      // on the 'if_capture_pageview' default, so it cannot be lost as a side
      // effect of someone touching capture_pageview.
      capture_pageleave: true,
      person_profiles: 'always',
      loaded: function () {
        posthogReady = true;
        registerSuperProps();
        drainQueue();
      }
    });
  }

  // Dimensions that must ride on EVERY event, including PostHog's own
  // automatic $pageview. Registered rather than passed per-call, because the
  // $pageview we now rely on is fired by the SDK and we never see it.
  function registerSuperProps() {
    try {
      var utm = getUtm();
      // First touch, written ONCE. These are the properties that make a funnel
      // answer "which campaign produced a paying trader", and they only mean
      // anything if the FIRST value is the one that survives.
      try {
        if (window.posthog.setPersonPropertiesForFlags || window.posthog.setPersonProperties) {
          window.posthog.setPersonProperties({}, {
            first_utm_source: utm.utm_source || "direct",
            first_utm_campaign: utm.utm_campaign || null,
            first_landing_path: window.location.pathname,
            first_referrer_host: (function () {
              try { return document.referrer ? new URL(document.referrer).hostname : "none"; }
              catch (e) { return "none"; }
            })()
          });
        }
      } catch (e) {}
      window.posthog.register({
        $anon_id: getAnonId(),
        // tier + surface are the CROSS-SURFACE pair: the app registers the
        // same two, so one filter separates prod from dev on both at once.
        // All four tiers share one PostHog project token, so without this
        // every dashboard silently mixes prod with dev, staging and local.
        tier: MKT_TIERS[window.location.hostname.replace(/^www\./, "")] || "local",
        surface: "marketing",
        // KEPT. Any insight already built on mkt_tier stays working; tier is
        // additive, not a rename.
        mkt_tier: window.location.hostname,
        utm_source: utm.utm_source || null,
        utm_campaign: utm.utm_campaign || null
      });
    } catch (e) {}
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
    if (DUAL_FIRE_EVENTS[eventType] || MKT_PREFIX.test(eventType)) sendToBackend(eventType, props);
    sendToPostHog(eventType, props);
  }

  // The initial pageview is fired by PostHog itself (capture_pageview: true),
  // so this is NOT called on load any more — calling it there would double
  // count. It stays on the public API for explicit SPA-style re-navigation.
  //
  // It emits the RESERVED `$pageview`, not a custom `page_view`. Every property
  // the old custom version attached is captured natively by PostHog already:
  // path/referrer as $current_url and $referrer, viewport as $viewport_width /
  // $viewport_height, and utm_* parsed straight off the URL. The rest ride
  // along as super-properties from registerSuperProps().
  function trackPage() {
    if (posthogReady && window.posthog) {
      try { window.posthog.capture("$pageview"); } catch (e) {}
    }
  }

  // ── Identity ─────────────────────────────────────────────────────────
  // THE RULE: the PostHog person is the integer user id. Never the email.
  //
  // Until 2026-08-25 this function called posthog.identify(EMAIL), while the
  // app and the backend both identified on String(userId). Nothing joined the
  // two, so one human was two PostHog people: an email-keyed person holding
  // every pre-signup pageview, UTM source and CTA click, and a userId-keyed
  // person holding all in-app behaviour, neither aware of the other. No funnel
  // could span signup to activation. docs/analytics-setup.md claimed an
  // "identify() + alias() in parallel" chain stitched them; posthog.alias() has
  // never appeared anywhere in this codebase.
  //
  // The join needs no alias() and no email. PostHog merges the CURRENT
  // anonymous person into whatever id you identify as, and the anon id is
  // already shared across *.maketzo.co because both surfaces persist with
  // "localStorage+cookie". So identifying by user id at signup and at login is
  // the whole fix.

  // Writes a SessionLink row (anon_id -> email HASH) in our own database. That
  // is what the Stripe webhook backfill resolves against. It is a binding
  // table, not a person store, and no raw email reaches PostHog through it.
  function linkSession(email) {
    if (!email || typeof email !== "string") return;
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
  }

  // A newsletter or contact submitter has NO account yet, so there is no id to
  // identify by. Do not invent one: tag the still-anonymous person instead.
  // When they later sign up, the merge carries these properties across.
  function setPerson(props) {
    if (!props || typeof props !== "object") return;
    if (posthogReady && window.posthog && window.posthog.setPersonProperties) {
      try { window.posthog.setPersonProperties(props); } catch (e) {}
    }
  }

  // Called at signup and at login, the two moments a browser on maketzo.co
  // learns who it is. Merges the anonymous marketing history into the person.
  function identifyUser(userId, props, onceProps) {
    if (userId === null || userId === undefined || userId === "") return;
    if (posthogReady && window.posthog) {
      try {
        window.posthog.identify(String(userId), props || {}, onceProps || {});
      } catch (e) {}
    }
  }

  // Kept for callers that still hand us an email. It links the session in our
  // own database and tags the anonymous person, and DELIBERATELY does not pass
  // the address, or any caller-supplied name, to PostHog.
  function identify(email, props) {
    if (!email || typeof email !== "string") return;
    linkSession(email);
    var flags = {};
    if (props && props.person_kind) flags[props.person_kind] = true;
    setPerson(flags);
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
        // Any OTHER data-cta-* attribute becomes a property, so a button can
        // carry its own tier/interval without checkout.js firing a second
        // event to add them. That duplicate echo was producing two cta_click
        // rows per click on every sourced button.
        var props = { source: src, target: tgt, label: label };
        if (t.dataset) {
          Object.keys(t.dataset).forEach(function (k) {
            if (k === "ctaSource" || k === "ctaTarget") return;
            if (k.indexOf("cta") !== 0) return;
            var key = k.slice(3);
            key = key.charAt(0).toLowerCase() + key.slice(1);
            if (key) props[key] = t.dataset[k];
          });
        }
        trackEvent("cta_click", props);
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

  // Percentage depth. No markup, no selector, works on all 92 pages including
  // every blog post, and it is the only thing that answers "do people read
  // this". Deduped per pageload, throttled to a frame.
  function initScrollPercent() {
    var marks = [25, 50, 75, 100];
    var hit = {};
    var ticking = false;
    function measure() {
      ticking = false;
      var doc = document.documentElement;
      var body = document.body;
      var height = Math.max(doc.scrollHeight, body ? body.scrollHeight : 0);
      var viewport = window.innerHeight || doc.clientHeight || 0;
      var scrollable = height - viewport;
      if (scrollable <= 0) return;              // page fits, nothing to scroll
      var y = window.pageYOffset || doc.scrollTop || 0;
      var pct = Math.round((y / scrollable) * 100);
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (pct >= m && !hit[m]) {
          hit[m] = true;
          sendToPostHog("scroll_depth", { depth: m, path: window.location.pathname });
        }
      }
    }
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      (window.requestAnimationFrame || function (fn) { setTimeout(fn, 100); })(measure);
    }, { passive: true });
    measure();
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
  // ── Referral capture ──────────────────────────────────────────────────
  // If the landing URL carries ?ref=CODE, persist it for a 30-day attribution
  // window — as a cookie on the .maketzo.co PARENT domain (so app.maketzo.co's
  // signup form AND the api.maketzo.co OAuth callback can read it) plus a
  // localStorage mirror — and fire the top-of-funnel referral_link_clicked
  // event. signup.html reads MKT.getRef() to attach it to the signup request.
  var REF_KEY = "mkt_ref";
  var REF_TTL_DAYS = 30;
  function refCookieDomain() {
    // Share across the maketzo.co apex + subdomains in prod. On dev-*/localhost
    // there's no shared apex, so scope to the current host (omit Domain).
    var h = window.location.hostname;
    if (h === "maketzo.co" || h.slice(-12) === ".maketzo.co") return "; domain=.maketzo.co";
    return "";
  }
  function setRefCookie(code) {
    try {
      var exp = new Date(Date.now() + REF_TTL_DAYS * 864e5).toUTCString();
      document.cookie = REF_KEY + "=" + encodeURIComponent(code) +
        "; expires=" + exp + "; path=/" + refCookieDomain() + "; SameSite=Lax";
    } catch (e) {}
  }
  function readRefCookie() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)mkt_ref=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function getRef() {
    return readRefCookie() || safeLocal("get", REF_KEY) || null;
  }
  function captureReferral() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var raw = params.get("ref");
      if (!raw) return;
      var code = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
      if (!code) return;
      setRefCookie(code);
      try { safeLocal("set", REF_KEY, code); } catch (e) {}
      trackEvent("referral_link_clicked", { code: code }); // queues until PostHog loads
    } catch (e) {}
  }

  function boot() {
    // Eager IDs — first thing so any subsequent code sees them.
    getAnonId(); getSessionId();
    captureReferral();

    // Defer PostHog load until consent decision (or auto-decide non-EU).
    isEuVisitor().then(function (isEu) {
      if (!isEu) {
        // Non-EU: treat as 'all'.
        if (!getConsent()) safeLocal("set", CONSENT_KEY, "all");
      }
      loadPostHog();
      // NO trackPage() here. PostHog fires its own $pageview on init now
      // (capture_pageview: true), so calling ours as well would count every
      // visit twice. This line used to send the custom `page_view` that Web
      // Analytics could never see.
    });

    initCtaTracking();
    initFormStart();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initScrollDepth);
    } else {
      initScrollDepth();
    initScrollPercent();
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
    identifyUser: identifyUser,
    setPerson: setPerson,
    linkSession: linkSession,
    getAnonId: getAnonId,
    getSessionId: getSessionId,
    isEuVisitor: isEuVisitor,
    getRef: getRef
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
