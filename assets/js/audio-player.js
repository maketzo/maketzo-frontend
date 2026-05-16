/*!
 * MAKETZO Audio Player
 * Vanilla JS HTML5 audio player with single-track and multi-track variants.
 * Init: include this script and add .mk-audio-player elements with the
 * expected DOM structure. Tracks for multi-track variant come from <li>
 * data-* attributes on .mk-audio-player__item children.
 */
(function () {
  "use strict";

  var activePlayer = null;

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" + s : s);
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
    var items = root.querySelectorAll(".mk-audio-player__item");

    if (!audio || !playBtn || !bar) return;

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

    playBtn.addEventListener("click", function () {
      if (audio.paused) {
        pauseOthers();
        audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", function () { root.classList.add("is-playing"); });
    audio.addEventListener("pause", function () { root.classList.remove("is-playing"); });
    audio.addEventListener("ended", function () {
      root.classList.remove("is-playing");
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
      li.addEventListener("click", function () {
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
  }

  function init() {
    var players = document.querySelectorAll(".mk-audio-player");
    players.forEach(initPlayer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/*!
 * MAKETZO Share Widget
 * Hybrid: navigator.share() on mobile (when available), explicit platform
 * dropdown on desktop. Platforms: Email, X, WhatsApp, Telegram, Facebook,
 * Copy link. No external dependencies.
 */
(function () {
  "use strict";

  var SHARE_PAYLOAD = {
    title: "Earn the Right — MAKETZO",
    text: "There's a trading album now. 'Earn the Right' by MAKETZO — songs for the bell, the wait, the win, and the loss. Each one too accurate.",
    url: "https://maketzo.co/soundtrack"
  };

  var PLATFORM_URLS = {
    email:    function (t, u) { return "mailto:?subject=" + encodeURIComponent("There's a trading album. Yes, really.") + "&body=" + encodeURIComponent(t + "\n\n" + u); },
    sms:      function (t, u) { return "sms:?&body=" + encodeURIComponent(t + " " + u); },
    twitter:  function (t, u) { return "https://twitter.com/intent/tweet?text=" + encodeURIComponent(t) + "&url=" + encodeURIComponent(u); },
    whatsapp: function (t, u) { return "https://wa.me/?text=" + encodeURIComponent(t + " " + u); },
    telegram: function (t, u) { return "https://t.me/share/url?url=" + encodeURIComponent(u) + "&text=" + encodeURIComponent(t); },
    facebook: function (t, u) { return "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(u); }
  };

  var openWidget = null;
  var MENU_WIDTH = 240;
  var MENU_GAP = 10;
  var VIEWPORT_PAD = 12;

  function positionMenu(trigger, menu) {
    var rect = trigger.getBoundingClientRect();
    var menuRect = menu.getBoundingClientRect();
    var menuHeight = menuRect.height || 280;
    var left = rect.left + rect.width / 2 - MENU_WIDTH / 2;
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_PAD));
    var top = rect.bottom + MENU_GAP;
    if (top + menuHeight > window.innerHeight - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, rect.top - menuHeight - MENU_GAP);
    }
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function closeAll() {
    if (!openWidget) return;
    var trigger = openWidget.querySelector(".mk-share__trigger");
    var menu = openWidget._mkMenu;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (menu) menu.hidden = true;
    openWidget = null;
  }

  function showToast(root) {
    var toast = root.querySelector(".mk-share-toast");
    if (!toast) return;
    toast.hidden = false;
    toast.classList.add("is-visible");
    setTimeout(function () {
      toast.classList.remove("is-visible");
      setTimeout(function () { toast.hidden = true; }, 300);
    }, 1800);
  }

  function handlePlatform(platform, root) {
    if (platform === "copy") {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(SHARE_PAYLOAD.url).then(function () { showToast(root); });
      } else {
        var ta = document.createElement("textarea");
        ta.value = SHARE_PAYLOAD.url;
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
      var url = builder(SHARE_PAYLOAD.text, SHARE_PAYLOAD.url);
      if (platform === "email" || platform === "sms") {
        window.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  }

  function initShareWidget(root) {
    var trigger = root.querySelector(".mk-share__trigger");
    var menu = root.querySelector(".mk-share__menu");
    if (!trigger || !menu) return;

    // Portal the menu out to document.body so no ancestor with transform/filter
    // can act as the containing block for position:fixed (a well-known CSS gotcha
    // that overrides viewport-relative positioning).
    document.body.appendChild(menu);
    root._mkMenu = menu;

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = trigger.getAttribute("aria-expanded") === "true";
      closeAll();
      if (!isOpen) {
        trigger.setAttribute("aria-expanded", "true");
        menu.hidden = false;
        positionMenu(trigger, menu);
        openWidget = root;
      }
    });

    menu.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-platform]");
      if (!btn) return;
      e.stopPropagation();
      handlePlatform(btn.getAttribute("data-platform"), root);
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
