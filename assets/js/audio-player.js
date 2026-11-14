/*!
 * MAKETZO Audio Player + Share, v10
 * Vanilla JS, no deps. Three coordinated modules in one file:
 *   1. Player           single-track and multi-track HTML5 audio player,
 *                       deep-link parser (?track=slug&t=42), track lifecycle
 *                       analytics events.
 *   2. Share            every Share button on maketzo.co (the blog, the search
 *                       pages, the songs, Trade Replay, Trading OS) opens the
 *                       app's share engine; the payload is read at the tap from
 *                       the button's data-share-* attributes (v10, 2026-11-13).
 *   3. API bootstrap    — for players with data-tracks-from="api" + a
 *                         data-surface attribute (e.g. "soundtrack-page"),
 *                         fetches the track list from /soundtrack?surface=...
 *                         and injects <li> items into the existing <ol>.
 *                         Replaces the prior hardcoded TRACK_COPY + per-page
 *                         <li> source-of-truth with the admin DB.
 *
 * Analytics dual-fires to PostHog + backend /analytics/event via
 * window.MaketzoAnalytics (from mkt-analytics.js, must load first).
 */

// Single shared SVG keeps every share button visually identical.
var MK_SHARE_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>';

// ═════════════════════════════════════════════════════════════════════════
// 1. Player — multi-track HTML5 audio + deep-link + per-row share synth
// ═════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var activePlayer = null;
  var deepLinkedPlayer = null;

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" + s : s);
  }

  function trackIdFromLi(li) { return li.getAttribute("data-track-id") || null; }

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
    if (root._mkInitialized) return;
    root._mkInitialized = true;

    var audio = root.querySelector("audio");
    var playBtn = root.querySelector(".mk-audio-player__play");
    var bar = root.querySelector(".mk-audio-player__bar");
    var progress = root.querySelector(".mk-audio-player__progress");
    var timeCur = root.querySelector(".mk-audio-player__time-cur");
    var timeDur = root.querySelector(".mk-audio-player__time-dur");
    var titleEl = root.querySelector(".mk-audio-player__title");
    var eyebrowEl = root.querySelector(".mk-audio-player__eyebrow");
    var styleEl = root.querySelector(".mk-audio-player__style");
    var items = Array.prototype.slice.call(root.querySelectorAll(".mk-audio-player__item"));

    if (!audio || !playBtn || !bar) return;

    var fired = {};
    function firedKey(slug, k) { return slug + ":" + k; }
    function markFired(slug, k) { fired[firedKey(slug, k)] = true; }
    function alreadyFired(slug, k) { return !!fired[firedKey(slug, k)]; }

    function loadTrack(li) {
      var src = li.getAttribute("data-src");
      var title = li.getAttribute("data-title");
      var eyebrow = li.getAttribute("data-eyebrow");
      if (src) audio.src = src;
      // Opt-in: a player with a style line shows the song and its style apart (/focus, 2026-10-16). The line stays
      // in place when a track has no style, so the player never changes size between tracks.
      if (styleEl) {
        title = li.getAttribute("data-name") || title;
        styleEl.textContent = li.getAttribute("data-style") || "";
      }
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

    root._maketzoPlayer = {
      getActiveSlug: getActiveSlug,
      getCurrentTime: function () { return audio.currentTime || 0; },
      isPlaying: function () { return !audio.paused; }
    };

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

    // Previous / next, opt-in: only a player that carries the buttons gets them (the homepage soundtrack card,
    // 2026-10-15). Previous restarts the track past its first 3 seconds, the way every music app does.
    var prevBtn = root.querySelector(".mk-audio-player__prev");
    var nextBtn = root.querySelector(".mk-audio-player__next");
    function step(d) {
      if (!items.length) return;
      var i = items.indexOf(getActiveLi());
      loadTrack(items[(i + d + items.length) % items.length]);
      pauseOthers();
      audio.play();
    }
    if (prevBtn) prevBtn.addEventListener("click", function () {
      if (audio.currentTime > 3) { audio.currentTime = 0; return; }
      step(-1);
    });
    if (nextBtn) nextBtn.addEventListener("click", function () { step(1); });

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
        if (e.target && e.target.closest(".mk-audio-player__share-trigger")) return;
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

    var hasSlugs = items.some(function (li) { return !!trackIdFromLi(li); });
    if (hasSlugs && !deepLinkedPlayer) {
      var dl = readDeepLink();
      if (dl) {
        var target = null;
        for (var i = 0; i < items.length; i++) {
          if (trackIdFromLi(items[i]) === dl.slug) { target = items[i]; break; }
        }
        if (target) {
          deepLinkedPlayer = root;
          loadTrack(target);
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
          root.classList.add("is-deeplinked");
          setTimeout(function () { root.classList.remove("is-deeplinked"); }, 4000);
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

  // Static players get initialized at DOMContentLoaded. API-driven players
  // (data-tracks-from="api") are skipped here — the bootstrap module below
  // initializes them after the /soundtrack fetch resolves.
  function initAllPlayers() {
    var players = document.querySelectorAll(".mk-audio-player");
    players.forEach(function (p) {
      if (p.getAttribute("data-tracks-from") === "api") return;
      initPlayer(p);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllPlayers);
  } else {
    initAllPlayers();
  }

  // Public — the bootstrap below needs to call initPlayer after API injection.
  window.__mkInitPlayer = initPlayer;
})();


// ═════════════════════════════════════════════════════════════════════════
// 2. Share. Every Share button on maketzo.co opens the app's share engine
//   (maketzo-app lib/share-menu.js, window.MaketzoShare): the same grouped menu,
//   channels and wording as every share in the app and on the game pages.
//   Ed, 2026-11-13: "Yesterday's work tract on the app revamped the Share to a
//   Trader Friend functionality. It was supposed to carry over to the .co
//   website. It hasn't." Until then a 7-button menu of its own lived here and in
//   the markup of all 132 pages that have a Share button.
//
//   The engine comes from the matching app tier through share-embed.js, loaded
//   once the page is idle or a Share button is touched. Each button carries its
//   own copy in data-share-* attributes (the blog, the search pages, Trade
//   Replay, Trading OS) or gets it from the soundtrack API (each song); a button
//   with none shares the album. His picks the same day: Email opens the
//   visitor's own mail app (a public page never makes MAKETZO send mail); a
//   signed-in member's link carries their Refer & Earn code (?ref=, which
//   mkt-analytics.js credits on whatever page the friend lands); a song that is
//   playing offers "Share at 1:23". If the engine cannot be reached, Share
//   copies the link and says so.
// ═════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  // The album, for a Share button with no copy of its own (/soundtrack, /focus).
  var ALBUM = {
    title: "Earn the Right by MAKETZO",
    text: "There's a trading album now: Earn the Right by MAKETZO. Songs for the bell, the wait, the win and the loss.",
    url: "https://maketzo.co/soundtrack",
    subject: "There's a trading album. Yes, really."
  };
  var TRIGGERS = ".mk-share__trigger, .mk-audio-player__share-trigger";

  function track(event, props) {
    try { if (window.MaketzoAnalytics && window.MaketzoAnalytics.send) window.MaketzoAnalytics.send(event, props); } catch (e) {}
  }

  // The app tier that matches this page (dev.maketzo.co -> dev-app.maketzo.co).
  function appBase() {
    var h = (window.location.hostname || "").replace(/^www\./, "");
    if (h.indexOf("dev.") === 0) return "https://dev-app.maketzo.co";
    if (h.indexOf("staging.") === 0) return "https://staging-app.maketzo.co";
    return "https://app.maketzo.co";
  }

  // ── The engine: loaded once, then a member's referral code is fetched. ──
  var state = "idle", waiting = null, waitTimer = null, refCode = "";
  function member() { return document.documentElement.classList.contains("mkt-auth"); }
  function settle(s) {
    if (state === "ready" || state === "failed") return;
    state = s;
    if (s === "ready" && member() && window.MaketzoShare.base) {
      window.MaketzoShare.base().then(function (b) { refCode = (b && b.code) || ""; }, function () {});
    }
    var w = waiting;
    waiting = null;
    clearTimeout(waitTimer);
    if (w) w();
  }
  function load() {
    if (window.MaketzoShare) { settle("ready"); return; }
    if (state !== "idle") return;
    state = "loading";
    document.addEventListener("mk:share-ready", function () { settle(window.MaketzoShare ? "ready" : "failed"); });
    document.addEventListener("mk:share-failed", function () { settle("failed"); });
    var s = document.createElement("script");
    s.src = appBase() + "/share-embed.js";
    s.async = true;
    s.onerror = function () { settle("failed"); };
    document.head.appendChild(s);
  }

  // ── What a button shares, built at the tap. ──
  function withParam(url, key, value) {
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + key + "=" + encodeURIComponent(value);
  }
  function playingAt(trigger) {
    // The seconds into this song when it is the one playing, past the first second; otherwise null.
    var slug = trigger.getAttribute("data-track-id");
    var player = trigger.closest && trigger.closest(".mk-audio-player");
    var p = player && player._maketzoPlayer;
    if (!slug || !p || p.getActiveSlug() !== slug) return null;
    var t = Math.floor(p.getCurrentTime() || 0);
    return t >= 1 ? t : null;
  }
  function payloadFor(trigger) {
    function a(k) { return trigger.getAttribute("data-share-" + k) || ""; }
    var source = a("source"), slug = trigger.getAttribute("data-track-id") || null;
    var own = !!(a("title") || a("url") || a("text"));
    var title = own ? (a("title") || ALBUM.title) : ALBUM.title;
    var url = own ? (a("url") || ALBUM.url) : ALBUM.url;
    if (refCode) url = withParam(url, "ref", refCode);
    var at = null;
    var p = {
      title: title,
      subject: own ? (a("subject") || title) : ALBUM.subject,
      text: own ? (a("text") || title) : ALBUM.text,
      url: url,
      page: true,
      campaign: source === "track" ? "song" : (source.indexOf("blog-") === 0 ? "blog" : (source || "site")),
      count: false,
      onShare: function (ch) { track("share_action", { track_id: slug, platform: ch, timestamp_sec: at }); }
    };
    var t = source === "track" ? playingAt(trigger) : null;
    if (t != null) {
      p.option = {
        label: "Share at " + Math.floor(t / 60) + ":" + (t % 60 < 10 ? "0" : "") + (t % 60),
        apply: function (q) {
          at = t;
          var r = {};
          for (var k in q) r[k] = q[k];
          r.url = withParam(q.url, "t", t);
          return r;
        }
      };
    }
    return p;
  }

  function openFor(trigger) {
    track("share_open", { track_id: trigger.getAttribute("data-track-id") || null, timestamp_sec: playingAt(trigger) });
    window.MaketzoShare.open(payloadFor(trigger), trigger);
  }

  // ── No engine: copy the link, and say what happened. ──
  function toast(msg) {
    var t = document.querySelector(".mk-share-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "mk-share-toast";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    t.classList.add("is-visible");
    clearTimeout(t._mkHide);
    t._mkHide = setTimeout(function () {
      t.classList.remove("is-visible");
      setTimeout(function () { t.hidden = true; }, 300);
    }, 2200);
  }
  function fallback(trigger) {
    var url = payloadFor(trigger).url;
    var failed = function () { toast("Sharing is not available right now. Try again in a moment."); };
    try {
      navigator.clipboard.writeText(url).then(function () { toast("Link copied"); }, failed);
    } catch (e) { failed(); }
    track("share_action", { track_id: trigger.getAttribute("data-track-id") || null, platform: "copy-fallback", timestamp_sec: null });
  }

  // ── One listener for every Share button, including the songs the API adds later. ──
  document.addEventListener("click", function (e) {
    var trigger = e.target && e.target.closest && e.target.closest(TRIGGERS);
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();
    if (window.MaketzoShare) { settle("ready"); openFor(trigger); return; }
    if (state === "failed") { fallback(trigger); return; }
    load();
    waiting = function () { if (window.MaketzoShare) openFor(trigger); else fallback(trigger); };
    clearTimeout(waitTimer);
    waitTimer = setTimeout(function () { if (waiting) { waiting = null; fallback(trigger); } }, 6000);
  });
  // A finger or pointer on its way to a Share button starts the load early.
  ["pointerover", "touchstart", "focusin"].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (state === "idle" && e.target && e.target.closest && e.target.closest(TRIGGERS)) load();
    }, { passive: true });
  });
  function boot() {
    if (!document.querySelector(TRIGGERS + ', .mk-audio-player[data-tracks-from="api"]')) return;
    var later = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1500); };
    later(function () { load(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();


// ═════════════════════════════════════════════════════════════════════════
// 3. API bootstrap — for players with data-tracks-from="api" + data-surface.
//   Fetches /soundtrack?surface=<surface>, builds <li> items into the
//   existing <ol class="mk-audio-player__list">, then initializes the
//   player + share widgets. Replaces the prior hardcoded li source-of-truth.
//   Marketing share copy comes from the per-track marketingShare* fields.
//   On fetch failure, falls back to a <noscript> sibling if present so the
//   page still functions (search-engine + JS-disabled fallback continues
//   to work as a happy side-effect of the same noscript block).
// ═════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  function deriveApiBase() {
    var h0 = window.location.hostname;
    var h = h0.indexOf("www.") === 0 ? h0.slice(4) : h0;
    if (h === "localhost" || h.indexOf("127.") === 0) return "http://localhost:3000";
    if (h === "maketzo.co") return "https://api.maketzo.co";
    var parts = h.split(".");
    if (parts.length >= 3) return "https://" + parts[0] + "-api." + parts.slice(1).join(".");
    return "https://api." + h;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  // Build one <li> row from an API track object. Marketing surfaces use the
  // marketingShare* fields verbatim. Each share trigger gets the full copy
  // payload as data-share-* attributes so the share widget never needs to
  // look up anything from a client-side map.
  function buildItemHtml(t, idx, fallbackEyebrow) {
    var num = String(idx + 1);
    if (num.length < 2) num = "0" + num;
    var isActive = idx === 0;
    var slug = t.slug || "";
    var name = t.name || "";
    // Display name carries the style (variantTag) so the player shows "Song · Style"
    // — the names themselves are now the pure song title (admin DB is normalized).
    var displayName = name + (t.variantTag ? " · " + t.variantTag : "");
    var eyebrow = fallbackEyebrow || "MAKETZO · Earn the Right";
    var shareUrl = window.location.origin + "/soundtrack?track=" + encodeURIComponent(slug);
    var shareTitle = t.marketingShareTitle || (displayName + " by MAKETZO");
    var shareText = t.marketingShareText || shareTitle;
    var shareSubject = t.marketingShareSubject || ("Listen: " + displayName);

    return ''
      + '<li class="mk-audio-player__item' + (isActive ? ' is-active' : '') + '" '
      +     'data-track-id="' + escapeAttr(slug) + '" '
      +     'data-src="' + escapeAttr(t.src || '') + '" '
      +     'data-title="' + escapeAttr(displayName) + '" '
      +     'data-name="' + escapeAttr(name) + '" '
      +     'data-style="' + escapeAttr(t.variantTag || '') + '" '
      +     'data-eyebrow="' + escapeAttr(eyebrow) + '">'
      +   '<span class="mk-audio-player__item-num">' + num + '</span>'
      +   '<span class="mk-audio-player__item-titlewrap">'
      +     '<span class="mk-audio-player__item-title">' + escapeHtml(displayName) + '</span>'
      +     (t.hasExplicitLyrics
              ? '<span class="mk-audio-player__explicit" role="img" aria-label="Explicit lyrics" title="Explicit lyrics">E</span>'
              : '')
      +   '</span>'
      +   '<span class="mk-audio-player__item-dur"></span>'
      +   '<button class="mk-audio-player__share-trigger" type="button" '
      +           'data-share-source="track" '
      +           'data-track-id="' + escapeAttr(slug) + '" '
      +           'data-share-title="' + escapeAttr(shareTitle) + '" '
      +           'data-share-text="' + escapeAttr(shareText) + '" '
      +           'data-share-subject="' + escapeAttr(shareSubject) + '" '
      +           'data-share-url="' + escapeAttr(shareUrl) + '" '
      +           'data-tooltip="Share to friend" '
      +           'aria-label="Share ' + escapeAttr(name) + '" '
      +           'aria-haspopup="dialog">'
      +     MK_SHARE_ICON_SVG
      +   '</button>'
      + '</li>';
  }

  function bootstrapPlayer(player) {
    var surface = player.getAttribute("data-surface") || "soundtrack-page";
    var listEl = player.querySelector(".mk-audio-player__list");
    if (!listEl) return;

    // The hardcoded <li> items in the source HTML are the canonical fallback
    // (SEO-visible, JS-disabled-friendly, fetch-failure-safe). Save them now
    // so we can restore on failure. Hide them with a loading placeholder
    // during the in-flight fetch — usually <500ms on prod.
    var fallbackHtml = listEl.innerHTML;
    listEl.innerHTML = '<li class="mk-audio-player__item mk-audio-player__item--loading"><span class="mk-audio-player__item-num">--</span><span class="mk-audio-player__item-title">Loading tracks&hellip;</span></li>';

    var apiBase = deriveApiBase();
    var url = apiBase + "/soundtrack?surface=" + encodeURIComponent(surface);

    // Shared-song arrival: if the visitor came via a share link (?track=<slug>),
    // ask the API to include that one track even when it isn't in the curated
    // set, so the shared song is present in the DOM for the deep-link logic
    // (initPlayer, via __mkInitPlayer below) to highlight + cue it.
    var sharedSlug = null;
    try { sharedSlug = new URLSearchParams(window.location.search).get("track"); } catch (e) {}
    if (sharedSlug) url += "&track=" + encodeURIComponent(sharedSlug);

    fetch(url, { credentials: "omit" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var tracks = (data && data.tracks) || [];
        if (!tracks.length) {
          // Empty API response — restore the hardcoded fallback rather than
          // showing an empty list. Acceptable degradation when the admin has
          // accidentally unpublished all tracks for this surface.
          listEl.innerHTML = fallbackHtml;
          return;
        }
        var eyebrow = player.getAttribute("data-eyebrow") || "MAKETZO · Earn the Right";
        listEl.innerHTML = tracks.map(function (t, i) {
          return buildItemHtml(t, i, eyebrow);
        }).join("");

        // Sync the audio + title + eyebrow elements with the first track so
        // the player isn't briefly showing stale hero copy before a click.
        var audio = player.querySelector("audio");
        var titleEl = player.querySelector(".mk-audio-player__title");
        var eyebrowEl = player.querySelector(".mk-audio-player__eyebrow");
        if (audio && tracks[0].src) audio.src = tracks[0].src;
        if (titleEl && tracks[0].name) titleEl.textContent = tracks[0].name;
        var styleEl = player.querySelector(".mk-audio-player__style");
        if (styleEl) styleEl.textContent = tracks[0].variantTag || "";
        // Content advisory for the track the player is cued to. Class toggle rather
        // than markup injection: titleEl is written with textContent everywhere else,
        // and mixing the two is how a title ends up escaping or double-rendering.
        player.classList.toggle("is-explicit", !!tracks[0].hasExplicitLyrics);
        if (eyebrowEl) eyebrowEl.textContent = eyebrow;

        // Shared-song arrival reframe: when the backend honored ?track=<slug> and
        // prepended it (tracks[0]), explain why the visitor is here and nudge the
        // trial. Only renders for share arrivals; organic visitors never see it.
        if (sharedSlug && tracks[0] && tracks[0].slug === sharedSlug
            && player.parentNode && !player.parentNode.querySelector(".mk-audio-player__shared-banner")) {
          var banner = document.createElement("div");
          banner.className = "mk-audio-player__shared-banner";
          banner.innerHTML = 'A trader sent you this track. Press play, then '
            + '<button type="button" class="mk-audio-player__shared-cta">start your free trial</button> '
            + 'to unlock the full library inside.';
          player.parentNode.insertBefore(banner, player);
          var cta = banner.querySelector(".mk-audio-player__shared-cta");
          if (cta) cta.addEventListener("click", function (e) {
            if (typeof window.handleCheckout === "function") window.handleCheckout("pro", e);
            else window.location.href = "/pricing";
          });
        }
      })
      .catch(function (err) {
        if (window.console) console.warn("[audio-player] /soundtrack fetch failed", err);
        listEl.innerHTML = fallbackHtml;
      })
      .then(function () {
        // Wire up the now-populated DOM. Its Share buttons need nothing: one
        // listener in section 2 answers every Share button on the page.
        if (window.__mkInitPlayer) window.__mkInitPlayer(player);
      });
  }

  function bootstrapAll() {
    var players = document.querySelectorAll('.mk-audio-player[data-tracks-from="api"]');
    players.forEach(bootstrapPlayer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapAll);
  } else {
    bootstrapAll();
  }
})();
