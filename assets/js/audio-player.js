/*!
 * MAKETZO Audio Player + Share + Analytics — v3
 * Vanilla JS, no deps. Three coordinated modules in one file:
 *   1. MaketzoAnalytics — session-scoped event dispatcher → POST /analytics/event
 *   2. Player           — single-track and multi-track HTML5 audio player,
 *                         deep-link parser (?track=slug&t=42), per-row share
 *                         trigger synthesis on /soundtrack, track lifecycle
 *                         events for analytics.
 *   3. Share widget     — branded dropdown shared by album-level and per-track
 *                         triggers. Per-trigger payload (title/text/url) is
 *                         resolved at click time so one menu serves both.
 */

// ═════════════════════════════════════════════════════════════════════════
// 1. Analytics — session id, event dispatcher, delegated CTA tracking
// ═════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  // Tier-aware API base — mirrors assets/js/checkout.js so dev/staging
  // analytics land in their own DBs (not prod). Format:
  //   localhost / 127.*   → http://localhost:3000
  //   maketzo.co (apex)   → https://api.maketzo.co
  //   <sub>.maketzo.co    → https://<sub>-api.maketzo.co
  var API_BASE = (function () {
    var h = window.location.hostname;
    if (h === "localhost" || h.indexOf("127.") === 0) return "http://localhost:3000";
    if (h === "maketzo.co") return "https://api.maketzo.co";
    var parts = h.split(".");
    if (parts.length >= 3) return "https://" + parts[0] + "-api." + parts.slice(1).join(".");
    return "https://api." + h;
  })();
  var SESSION_KEY = "mkt_sid";

  function getSessionId() {
    try {
      var sid = sessionStorage.getItem(SESSION_KEY);
      if (!sid) {
        sid = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : ("sid_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10));
        sessionStorage.setItem(SESSION_KEY, sid);
      }
      return sid;
    } catch (e) {
      return "sid_no_storage";
    }
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

  function sendEvent(eventType, payload) {
    payload = payload || {};
    var utm = getUtm();
    var ts = payload.timestamp_sec;
    var body = {
      event_type: eventType,
      session_id: getSessionId(),
      track_id: payload.track_id || null,
      timestamp_sec: (typeof ts === "number" && isFinite(ts)) ? Math.floor(ts) : null,
      platform: payload.platform || null,
      target: payload.target || null,
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
      }).catch(function () { /* fire-and-forget; never block UX */ });
    } catch (e) { /* never throw */ }
  }

  function initCtaTracking() {
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (/(^|\/)pricing(\.html)?($|\?|#)/.test(href)) {
        sendEvent("cta_click", { target: "pricing" });
      }
    }, true);
  }

  window.MaketzoAnalytics = { send: sendEvent, getSessionId: getSessionId };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCtaTracking);
  } else {
    initCtaTracking();
  }
})();


// ═════════════════════════════════════════════════════════════════════════
// 2. Player — multi-track HTML5 audio + deep-link + per-row share synth
// ═════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var activePlayer = null;
  // Tracks which player owns the active deep-link (only one expected per page).
  var deepLinkedPlayer = null;
  // Reused share-icon SVG for per-row triggers (kept here as a single source).
  var SHARE_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>';

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" + s : s);
  }

  function trackIdFromLi(li) { return li.getAttribute("data-track-id") || null; }

  // Parses ?track=slug&t=42 once, used by the soundtrack player only.
  function readDeepLink() {
    try {
      var p = new URLSearchParams(window.location.search);
      var slug = p.get("track");
      if (!slug) return null;
      var tRaw = p.get("t");
      var t = tRaw ? parseInt(tRaw, 10) : 0;
      if (!isFinite(t) || t < 0) t = 0;
      return { slug: slug.toLowerCase(), t: t };
    } catch (e) { return null; }
  }

  function initPlayer(root) {
    var audio = root.querySelector("audio");
    var playBtn = root.querySelector(".mk-audio-player__play");
    var bar = root.querySelector(".mk-audio-player__bar");
    var progress = root.querySelector(".mk-audio-player__progress");
    var timeCur = root.querySelector(".mk-audio-player__time-cur");
    var timeDur = root.querySelector(".mk-audio-player__time-dur");
    var titleEl = root.querySelector(".mk-audio-player__title");
    var eyebrowEl = root.querySelector(".mk-audio-player__eyebrow");
    var items = Array.prototype.slice.call(root.querySelectorAll(".mk-audio-player__item"));

    if (!audio || !playBtn || !bar) return;

    // Per-(player, track) one-shot guards for analytics quartile events.
    var fired = {};
    function firedKey(slug, k) { return slug + ":" + k; }
    function markFired(slug, k) { fired[firedKey(slug, k)] = true; }
    function alreadyFired(slug, k) { return !!fired[firedKey(slug, k)]; }

    function loadTrack(li) {
      var src = li.getAttribute("data-src");
      var title = li.getAttribute("data-title");
      var eyebrow = li.getAttribute("data-eyebrow");
      if (src) audio.src = src;
      if (title && titleEl) titleEl.textContent = title;
      if (eyebrow && eyebrowEl) eyebrowEl.textContent = eyebrow;
      items.forEach(function (other) { other.classList.remove("is-active"); });
      li.classList.add("is-active");
    }

    function pauseOthers() {
      if (activePlayer && activePlayer !== root) {
        var otherAudio = activePlayer.querySelector("audio");
        if (otherAudio) otherAudio.pause();
        activePlayer.classList.remove("is-playing");
      }
      activePlayer = root;
    }

    function getActiveLi() {
      for (var i = 0; i < items.length; i++) {
        if (items[i].classList.contains("is-active")) return items[i];
      }
      return items[0] || null;
    }

    function getActiveSlug() {
      var li = getActiveLi();
      return li ? trackIdFromLi(li) : null;
    }

    // ── Public API exposed on the player for the share module to query ──
    root._maketzoPlayer = {
      getActiveSlug: getActiveSlug,
      getCurrentTime: function () { return audio.currentTime || 0; },
      isPlaying: function () { return !audio.paused; }
    };

    // ── Core controls ──────────────────────────────────────────────────
    playBtn.addEventListener("click", function () {
      if (audio.paused) {
        pauseOthers();
        audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", function () {
      root.classList.add("is-playing");
      // Drop the deep-link pulse the moment the user actually engages.
      root.classList.remove("is-deeplinked");
      var slug = getActiveSlug();
      if (slug && !alreadyFired(slug, "play")) {
        markFired(slug, "play");
        if (window.MaketzoAnalytics) {
          window.MaketzoAnalytics.send("track_play", {
            track_id: slug,
            timestamp_sec: audio.currentTime
          });
        }
      }
    });

    audio.addEventListener("pause", function () { root.classList.remove("is-playing"); });

    audio.addEventListener("ended", function () {
      root.classList.remove("is-playing");
      var slug = getActiveSlug();
      if (slug && window.MaketzoAnalytics && !alreadyFired(slug, "complete")) {
        markFired(slug, "complete");
        window.MaketzoAnalytics.send("track_complete", { track_id: slug });
      }
      if (items.length) {
        var activeIdx = -1;
        items.forEach(function (li, i) { if (li.classList.contains("is-active")) activeIdx = i; });
        if (activeIdx > -1 && activeIdx < items.length - 1) {
          loadTrack(items[activeIdx + 1]);
          pauseOthers();
          audio.play();
        }
      }
    });

    audio.addEventListener("timeupdate", function () {
      if (!audio.duration) return;
      var pct = (audio.currentTime / audio.duration) * 100;
      progress.style.width = pct + "%";
      if (timeCur) timeCur.textContent = formatTime(audio.currentTime);

      var slug = getActiveSlug();
      if (!slug || !window.MaketzoAnalytics) return;
      // Quartile events: one-shot per (slug, quartile).
      if (pct >= 25 && !alreadyFired(slug, "q25")) {
        markFired(slug, "q25");
        window.MaketzoAnalytics.send("track_25", { track_id: slug });
      }
      if (pct >= 50 && !alreadyFired(slug, "q50")) {
        markFired(slug, "q50");
        window.MaketzoAnalytics.send("track_50", { track_id: slug });
      }
      if (pct >= 75 && !alreadyFired(slug, "q75")) {
        markFired(slug, "q75");
        window.MaketzoAnalytics.send("track_75", { track_id: slug });
      }
    });

    audio.addEventListener("loadedmetadata", function () {
      if (timeDur) timeDur.textContent = formatTime(audio.duration);
    });

    bar.addEventListener("click", function (e) {
      if (!audio.duration) return;
      var rect = bar.getBoundingClientRect();
      var ratio = (e.clientX - rect.left) / rect.width;
      audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
    });

    items.forEach(function (li) {
      li.addEventListener("click", function (e) {
        // The per-row share trigger lives inside the li; let its own handler
        // own the click (and the share module's stopPropagation prevents this
        // listener from firing). Belt-and-braces guard for any descendant.
        if (e.target && e.target.closest(".mk-audio-player__share-trigger")) return;
        if (e.target && e.target.closest(".mk-share")) return;
        var wasActive = li.classList.contains("is-active");
        loadTrack(li);
        pauseOthers();
        if (!wasActive || audio.paused) audio.play();
        else audio.pause();
      });

      var src = li.getAttribute("data-src");
      var durEl = li.querySelector(".mk-audio-player__item-dur");
      if (src && durEl && !durEl.textContent.trim()) {
        var probe = new Audio();
        probe.preload = "metadata";
        probe.src = src;
        probe.addEventListener("loadedmetadata", function () {
          durEl.textContent = formatTime(probe.duration);
        });
      }
    });

    // ── Per-row share synthesis: wrap each in-row trigger in a .mk-share
    //    so the existing share widget init can bind it. We do this BEFORE
    //    the share-widget IIFE's DOMContentLoaded listener runs, so the new
    //    .mk-share elements get picked up in the same init pass.
    items.forEach(function (li) {
      var trigger = li.querySelector(".mk-audio-player__share-trigger");
      if (!trigger || trigger._mkWrapped) return;
      var slug = trackIdFromLi(li);
      if (!slug) return;

      // Move the trigger inside a freshly created .mk-share wrapper.
      var wrap = document.createElement("div");
      wrap.className = "mk-share mk-audio-player__share";
      wrap.dataset.scope = "track";
      // Carry the track slug on the wrapper too so share code can find it.
      wrap.dataset.trackId = slug;
      // The wrapper takes the trigger's slot in the grid; insert and move.
      li.insertBefore(wrap, trigger);
      wrap.appendChild(trigger);

      // Each wrapper gets its own menu (portaled to body by share init).
      // The platform buttons are identical to the album-level menu; the
      // payload is computed per-click from the trigger's data attributes.
      var menu = document.createElement("div");
      menu.className = "mk-share__menu mk-share__menu--track";
      menu.setAttribute("role", "menu");
      menu.hidden = true;
      menu.innerHTML = renderShareMenuItems();
      wrap.appendChild(menu);

      trigger._mkWrapped = true;
    });

    // ── Deep-link handling (only meaningful when tracks have slugs) ────
    var hasSlugs = items.some(function (li) { return !!trackIdFromLi(li); });
    if (hasSlugs && !deepLinkedPlayer) {
      var dl = readDeepLink();
      if (dl) {
        // Find the li whose slug matches.
        var target = null;
        for (var i = 0; i < items.length; i++) {
          if (trackIdFromLi(items[i]) === dl.slug) { target = items[i]; break; }
        }
        if (target) {
          deepLinkedPlayer = root;
          loadTrack(target);
          // Seek once metadata is loaded (currentTime needs duration to be set).
          if (dl.t > 0) {
            var onMeta = function () {
              try {
                var clamp = audio.duration ? Math.min(dl.t, Math.max(0, audio.duration - 1)) : dl.t;
                audio.currentTime = clamp;
                if (progress && audio.duration) {
                  progress.style.width = ((clamp / audio.duration) * 100) + "%";
                }
                if (timeCur) timeCur.textContent = formatTime(clamp);
              } catch (e) {}
              audio.removeEventListener("loadedmetadata", onMeta);
            };
            audio.addEventListener("loadedmetadata", onMeta);
          }
          // Visual pulse on the play button — withdraw after the animation.
          root.classList.add("is-deeplinked");
          setTimeout(function () { root.classList.remove("is-deeplinked"); }, 4000);
          // Scroll the player into view (deferred so layout has settled).
          requestAnimationFrame(function () {
            try { root.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { root.scrollIntoView(); }
          });
          if (window.MaketzoAnalytics) {
            window.MaketzoAnalytics.send("deep_link_arrival", {
              track_id: dl.slug,
              timestamp_sec: dl.t || null
            });
          }
        }
      }
    }
  }

  // Per-row share menus mirror the existing 7-platform set used on /focus
  // and the album-level share. Kept here (rather than cloned from DOM) so
  // every track always gets a complete menu even if the page omits one.
  function renderShareMenuItems() {
    return '' +
      '<button class="mk-share__item" type="button" data-platform="email" role="menuitem">' +
      '<svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>' +
      '<span>Email</span></button>' +
      '<button class="mk-share__item" type="button" data-platform="sms" role="menuitem">' +
      '<svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 11H7V9h2v2zm4 0h-2V9h2v2zm4 0h-2V9h2v2z"/></svg>' +
      '<span>Text</span></button>' +
      '<button class="mk-share__item" type="button" data-platform="twitter" role="menuitem">' +
      '<svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' +
      '<span>X</span></button>' +
      '<button class="mk-share__item" type="button" data-platform="whatsapp" role="menuitem">' +
      '<svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
      '<span>WhatsApp</span></button>' +
      '<button class="mk-share__item" type="button" data-platform="telegram" role="menuitem">' +
      '<svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>' +
      '<span>Telegram</span></button>' +
      '<button class="mk-share__item" type="button" data-platform="facebook" role="menuitem">' +
      '<svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' +
      '<span>Facebook</span></button>' +
      '<button class="mk-share__item mk-share__item--wide" type="button" data-platform="copy" role="menuitem">' +
      '<svg class="mk-share__item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>' +
      '<span>Copy link</span></button>';
  }

  function initAllPlayers() {
    var players = document.querySelectorAll(".mk-audio-player");
    players.forEach(initPlayer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllPlayers);
  } else {
    initAllPlayers();
  }
})();


// ═════════════════════════════════════════════════════════════════════════
// 3. Share widget — branded dropdown shared by album and per-track triggers.
//    Per-trigger payload (title/text/url) is resolved at click time from
//    data-share-source. Track triggers also support an optional "Share at
//    0:42" toggle when the player is currently mid-play on that same track.
// ═════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  // Album-level default — used by the page-bottom share button at
  // soundtrack.html and any other .mk-share without data-share-source="track".
  var ALBUM_PAYLOAD = {
    title: "Earn the Right — MAKETZO",
    text:  "There's a trading album now. 'Earn the Right' by MAKETZO — songs for the bell, the wait, the win, and the loss. Each one too accurate.",
    url:   "https://maketzo.co/soundtrack"
  };

  // Per-track copy lives on the client (no server roundtrip). One entry per
  // slug. Keep titles/text under ~140 chars so X doesn't trim. The three
  // "Redux" entries are the same song reinterpreted; share text leans on the
  // genre angle since the song itself is shared by the original.
  var TRACK_COPY = {
    tuition: {
      title: "I Paid Tuition to the Market — MAKETZO",
      text:  "Every trader has paid tuition to the market. This song is painfully relatable."
    },
    earn: {
      title: "Earn the Right — MAKETZO",
      text:  "The market rewards patience, discipline, and selective aggression."
    },
    bossa: {
      title: "Earn the Right (Bossa Nova Redux) — MAKETZO",
      text:  "Same lesson, bossa nova. Try not to dance through your stop loss."
    },
    goth: {
      title: "Earn the Right (Goth Redux) — MAKETZO",
      text:  "For when paying tuition feels like a funeral. Same song, darker."
    },
    hairband: {
      title: "Earn the Right (80s Hair Band Redux) — MAKETZO",
      text:  "Discipline, with a guitar solo. Stadium-rock cope for blown trades."
    },
    wait: {
      title: "Wait for Acceptance — MAKETZO",
      text:  "The hardest trade is the one you didn't take. A song about patience."
    },
    focus: {
      title: "Deep Focus Threshold — MAKETZO",
      text:  "A binaural focus track designed to help traders stay locked in during live trading."
    }
  };

  // Email-subject lines are platform-specific because mailto: lets us set one.
  var ALBUM_EMAIL_SUBJECT = "There's a trading album. Yes, really.";
  var TRACK_EMAIL_SUBJECTS = {
    tuition:  "Every trader has paid tuition",
    earn:     "Earn the right — listen",
    bossa:    "Earn the Right, but it's bossa nova",
    goth:     "Earn the Right, but it's a funeral",
    hairband: "Earn the Right, but it's a power ballad",
    wait:     "A song about waiting for the right trade",
    focus:    "Trading focus track — binaural"
  };

  var PLATFORM_URLS = {
    email:    function (t, u, subject) { return "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(t + "\n\n" + u); },
    sms:      function (t, u) { return "sms:?&body=" + encodeURIComponent(t + " " + u); },
    twitter:  function (t, u) { return "https://twitter.com/intent/tweet?text=" + encodeURIComponent(t) + "&url=" + encodeURIComponent(u); },
    whatsapp: function (t, u) { return "https://wa.me/?text=" + encodeURIComponent(t + " " + u); },
    telegram: function (t, u) { return "https://t.me/share/url?url=" + encodeURIComponent(u) + "&text=" + encodeURIComponent(t); },
    facebook: function (t, u) { return "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(u); }
  };

  var openWidget = null;
  var MENU_WIDTH = 320;
  var MENU_GAP = 10;
  var VIEWPORT_PAD = 12;

  // Origin to use when building track-share URLs. On prod this is
  // https://maketzo.co; on dev/staging it's whatever the visitor is on (basic
  // auth gates dev/staging so no risk of those leaking publicly). Using
  // location.origin keeps shared URLs accurate for screenshots / QA.
  function shareOrigin() {
    if (window.location.protocol === "file:" || !window.location.origin) {
      return "https://maketzo.co";
    }
    return window.location.origin;
  }

  function trackPayload(slug, includeTimestamp, ts) {
    var copy = TRACK_COPY[slug];
    if (!copy) {
      // Unknown slug — fall back to album payload so the share doesn't crash.
      return {
        title: ALBUM_PAYLOAD.title,
        text: ALBUM_PAYLOAD.text,
        url: ALBUM_PAYLOAD.url,
        subject: ALBUM_EMAIL_SUBJECT,
        track_id: null,
        timestamp_sec: null
      };
    }
    var url = shareOrigin() + "/soundtrack?track=" + encodeURIComponent(slug);
    if (includeTimestamp && typeof ts === "number" && ts >= 1) {
      url += "&t=" + Math.floor(ts);
    }
    return {
      title: copy.title,
      text: copy.text,
      url: url,
      subject: TRACK_EMAIL_SUBJECTS[slug] || ("Listen: " + copy.title),
      track_id: slug,
      timestamp_sec: includeTimestamp ? Math.floor(ts || 0) : null
    };
  }

  // Walks up from the trigger to find the player root, then asks the
  // player's exposed API for its current track + playhead. Returns null
  // when not applicable (album-level trigger, or trigger outside a player).
  function getPlayerStateForTrigger(trigger) {
    var player = trigger.closest && trigger.closest(".mk-audio-player");
    if (!player || !player._maketzoPlayer) return null;
    return {
      activeSlug: player._maketzoPlayer.getActiveSlug(),
      currentTime: player._maketzoPlayer.getCurrentTime()
    };
  }

  function getPayloadForTrigger(trigger, includeTimestamp) {
    var source = trigger.getAttribute("data-share-source") || "";
    if (source === "track") {
      var slug = trigger.getAttribute("data-track-id");
      var state = getPlayerStateForTrigger(trigger);
      // Timestamp is only meaningful when (a) the trigger's track IS the one
      // currently selected and (b) the playhead is non-zero. Otherwise we
      // share the bare /soundtrack?track=<slug> URL regardless of the toggle.
      var useTs = !!(includeTimestamp && state && state.activeSlug === slug && state.currentTime > 1);
      return trackPayload(slug, useTs, state ? state.currentTime : 0);
    }
    return {
      title: ALBUM_PAYLOAD.title,
      text: ALBUM_PAYLOAD.text,
      url: ALBUM_PAYLOAD.url,
      subject: ALBUM_EMAIL_SUBJECT,
      track_id: null,
      timestamp_sec: null
    };
  }

  function positionMenu(trigger, menu) {
    var rect = trigger.getBoundingClientRect();
    var menuRect = menu.getBoundingClientRect();
    var menuWidth = menuRect.width || MENU_WIDTH;
    var menuHeight = menuRect.height || 280;
    var left = rect.left + rect.width / 2 - menuWidth / 2;
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - menuWidth - VIEWPORT_PAD));
    var top = rect.bottom + MENU_GAP;
    if (top + menuHeight > window.innerHeight - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, rect.top - menuHeight - MENU_GAP);
    }
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function closeAll() {
    if (!openWidget) return;
    var trigger = openWidget.querySelector(".mk-share__trigger, .mk-audio-player__share-trigger");
    var menu = openWidget._mkMenu;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (menu) {
      menu.hidden = true;
      // Clean up any injected timestamp toggle so the next open recomputes it.
      var ts = menu.querySelector(".mk-share__timestamp");
      if (ts) ts.remove();
    }
    openWidget = null;
  }

  function showToast(root) {
    // Toast is portaled at the page level (not inside the per-row widget),
    // so we look for it on the document if the root doesn't have one.
    var toast = root.querySelector(".mk-share-toast") || document.querySelector(".mk-share-toast");
    if (!toast) return;
    toast.hidden = false;
    toast.classList.add("is-visible");
    setTimeout(function () {
      toast.classList.remove("is-visible");
      setTimeout(function () { toast.hidden = true; }, 300);
    }, 1800);
  }

  function handlePlatform(platform, root, trigger) {
    var menu = root._mkMenu;
    // If the menu has a timestamp toggle and it's checked, include the
    // current playhead in the share URL. The toggle only exists for track
    // triggers when the playhead is non-zero on that track.
    var tsBox = menu ? menu.querySelector(".mk-share__timestamp-input") : null;
    var includeTimestamp = !!(tsBox && tsBox.checked);
    var payload = getPayloadForTrigger(trigger, includeTimestamp);

    // Analytics — fire BEFORE the share opens (some platforms navigate the
    // tab and may discard pending requests; `keepalive: true` covers it).
    if (window.MaketzoAnalytics) {
      window.MaketzoAnalytics.send("share_action", {
        track_id: payload.track_id,
        platform: platform,
        timestamp_sec: payload.timestamp_sec
      });
    }

    if (platform === "copy") {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload.url).then(function () { showToast(root); });
      } else {
        var ta = document.createElement("textarea");
        ta.value = payload.url;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); showToast(root); } catch (e) {}
        document.body.removeChild(ta);
      }
      return;
    }
    var builder = PLATFORM_URLS[platform];
    if (builder) {
      var url = (platform === "email")
        ? builder(payload.text, payload.url, payload.subject)
        : builder(payload.text, payload.url);
      if (platform === "email" || platform === "sms") {
        window.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  }

  // For per-track triggers, prepend a "Share at M:SS" toggle row to the menu
  // when the trigger's track is the currently-playing one AND playhead > 1s.
  // Done at open time so the timestamp shown is fresh, and pruned at close.
  function maybeAddTimestampToggle(trigger, menu) {
    if (trigger.getAttribute("data-share-source") !== "track") return;
    var slug = trigger.getAttribute("data-track-id");
    var state = getPlayerStateForTrigger(trigger);
    if (!state || state.activeSlug !== slug) return;
    var ts = Math.floor(state.currentTime || 0);
    if (ts < 1) return;

    var m = Math.floor(ts / 60);
    var s = ts % 60;
    var label = "Share at " + m + ":" + (s < 10 ? "0" + s : s);

    var row = document.createElement("label");
    row.className = "mk-share__timestamp";
    row.innerHTML = '<input type="checkbox" class="mk-share__timestamp-input" checked>' +
                    '<span class="mk-share__timestamp-label">' + label + '</span>';
    // Stop the menu's delegated click handler from treating this as a platform pick.
    row.addEventListener("click", function (e) { e.stopPropagation(); });
    menu.insertBefore(row, menu.firstChild);
  }

  function initShareWidget(root) {
    var trigger = root.querySelector(".mk-share__trigger, .mk-audio-player__share-trigger");
    var menu = root.querySelector(".mk-share__menu");
    if (!trigger || !menu) return;

    // Portal the menu to <body> so no ancestor with transform/filter/contain
    // can act as the containing block for position:fixed. Known CSS gotcha.
    document.body.appendChild(menu);
    root._mkMenu = menu;

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = trigger.getAttribute("aria-expanded") === "true";
      closeAll();
      if (!isOpen) {
        trigger.setAttribute("aria-expanded", "true");
        menu.hidden = false;
        maybeAddTimestampToggle(trigger, menu);
        positionMenu(trigger, menu);
        openWidget = root;
        if (window.MaketzoAnalytics) {
          var slug = trigger.getAttribute("data-track-id") || null;
          window.MaketzoAnalytics.send("share_open", {
            track_id: slug,
            // Pass current playhead even on open so even un-converted opens
            // tell us how deep into the track the share intent appeared.
            timestamp_sec: (function () {
              var st = getPlayerStateForTrigger(trigger);
              return st ? st.currentTime : null;
            })()
          });
        }
      }
    });

    menu.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-platform]");
      if (!btn) return;
      e.stopPropagation();
      handlePlatform(btn.getAttribute("data-platform"), root, trigger);
      closeAll();
    });
  }

  function init() {
    var widgets = document.querySelectorAll(".mk-share");
    widgets.forEach(initShareWidget);
    document.addEventListener("click", function (e) {
      if (!openWidget) return;
      var menu = openWidget._mkMenu;
      if (!openWidget.contains(e.target) && (!menu || !menu.contains(e.target))) closeAll();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll();
    });
    window.addEventListener("scroll", function () { closeAll(); }, { passive: true });
    window.addEventListener("resize", function () { closeAll(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
