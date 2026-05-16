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
