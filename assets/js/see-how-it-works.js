/* ═══════════════════════════════════════════════════════════════════════════
   SEE HOW IT WORKS PLAYER  ·  assets/js/see-how-it-works.js
   Any link or button with data-shiw opens the product video full screen. The
   video carries Ed's own soundtrack ("Rising Pulse"), and the click that opens
   it is the user gesture browsers require, so it starts WITH sound. A Mute
   control sits on the frame the whole time (Ed, 2026-10-16: "Make sure there's
   an easy way to mute it"), and the choice is remembered for the next visit.

   The trigger stays a plain link to #see-it-work, so with no script the button
   still does what it did before: scroll to the section.

   A click on the picture pauses it, and a pause sign sits in the middle of the
   frame until the next click plays it again (Ed, 2026-10-16: "If i click the
   center it pauses, but should show the pause sign"; no separate button).

   Closes on the X, Escape, or a click outside the frame; closing pauses and
   rewinds. The last card's trial button is real (Ed, 2026-10-17: the painted
   one "is NOT clickable"): the video paints the card with that spot empty, and
   the real button and the line under it arrive on it with the card, CARD_LEAD
   seconds from the end. While the card is up a click on the picture does not
   pause it. Watch Again joins when the video ends. Pairs with
   assets/css/see-how-it-works.css.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SRC = 'assets/see-it-work/maketzo-see-how-it-works.mp4?v=4';
  var CARD_LEAD = 5.7;   // the end card is the last 5.8s of the cut, dissolving in over 0.8s
  var POSTER = 'assets/see-it-work/maketzo-see-how-it-works-poster.jpg?v=1';
  var MUTE_KEY = 'mk_shiw_muted';
  var ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>';
  var ICON_X ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  var root = null, video = null, muteBtn = null, endBox = null, bar = null, opener = null;

  function track(name, props) { try { if (window.MKT && window.MKT.trackEvent) window.MKT.trackEvent(name, props || {}); } catch (e) {} }
  function savedMuted() { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; } }
  function saveMuted(v) { try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (e) {} }

  function paintMute() {
    var m = video.muted;
    muteBtn.innerHTML = (m ? ICON_OFF : ICON_ON) + '<span>' + (m ? 'Unmute' : 'Mute') + '</span>';
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.setAttribute('aria-label', m ? 'Unmute the video' : 'Mute the video');
  }

  function build() {
    root = document.createElement('div');
    root.className = 'shiw'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'See How It Works video');
    root.innerHTML =
      '<div class="shiw-frame">' +
        '<video class="shiw-video" playsinline preload="none" poster="' + POSTER + '"></video>' +
        '<div class="shiw-paused" aria-hidden="true"><span>' + ICON_PAUSE + '</span></div>' +
        '<button type="button" class="shiw-btn shiw-mute"></button>' +
        '<button type="button" class="shiw-btn shiw-close" aria-label="Close the video">' + ICON_X + '</button>' +
        '<div class="shiw-card">' +
          '<button type="button" class="btn-primary" data-shiw-trial tabindex="-1">Start 7-Day Free Trial &rarr;</button>' +
          '<p class="shiw-fine">No charge until day 8. Cancel in one click.</p>' +
        '</div>' +
        '<div class="shiw-end" hidden>' +
          '<button type="button" class="btn-secondary" data-shiw-again>Watch Again</button>' +
        '</div>' +
        '<div class="shiw-bar"><i></i></div>' +
      '</div>';
    document.body.appendChild(root);
    video = root.querySelector('.shiw-video'); muteBtn = root.querySelector('.shiw-mute');
    endBox = root.querySelector('.shiw-end'); bar = root.querySelector('.shiw-bar i');

    muteBtn.addEventListener('click', function () {
      video.muted = !video.muted; saveMuted(video.muted); paintMute();
      track('see_how_it_works_mute', { muted: video.muted, at_s: Math.round(video.currentTime) });
    });
    root.querySelector('.shiw-close').addEventListener('click', close);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    video.addEventListener('click', function () {
      if (root.classList.contains('is-card')) return;   // the end card is up: its button is the thing to press
      if (video.paused) video.play().catch(function () {}); else video.pause();
      track('see_how_it_works_pause', { paused: video.paused, at_s: Math.round(video.currentTime) });
    });
    // The pause sign shows only for a pause the viewer chose: not at the end (the end card takes over) and not on close.
    video.addEventListener('pause', function () { if (!video.ended && !root.hidden) root.classList.add('is-paused'); });
    video.addEventListener('play', function () { root.classList.remove('is-paused'); endBox.hidden = true; });
    video.addEventListener('timeupdate', function () {
      if (!video.duration) return;
      bar.style.width = (100 * video.currentTime / video.duration) + '%';
      showCard(video.duration - video.currentTime <= CARD_LEAD);
    });
    video.addEventListener('ended', function () { showCard(true); endBox.hidden = false; track('see_how_it_works_complete', {}); });
    root.querySelector('[data-shiw-again]').addEventListener('click', function () {
      endBox.hidden = true; showCard(false); video.currentTime = 0; video.play().catch(function () {}); track('see_how_it_works_replay', {});
    });
    root.querySelector('[data-shiw-trial]').addEventListener('click', function (e) {
      track('see_how_it_works_trial_click', { ended: video.ended });
      close();
      if (typeof window.handleCheckout === 'function') window.handleCheckout('pro', e);
    });
    document.addEventListener('keydown', function (e) { if (!root.hidden && e.key === 'Escape') close(); });
  }

  // the end card's real button and line: on with the card, off again if the video goes back before it
  function showCard(on) {
    if (root.classList.contains('is-card') === on) return;
    root.classList.toggle('is-card', on);
    root.querySelector('[data-shiw-trial]').tabIndex = on ? 0 : -1;
    if (on) root.classList.remove('is-paused');
  }

  function open(e) {
    if (e) e.preventDefault();
    if (!root) build();
    opener = document.activeElement;
    if (!video.getAttribute('src')) video.setAttribute('src', SRC);
    video.muted = savedMuted(); paintMute();
    endBox.hidden = true; showCard(false); video.currentTime = 0; bar.style.width = '0'; root.classList.remove('is-paused');
    root.hidden = false; document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { root.classList.add('is-open'); });
    // Opened by a click, so sound is allowed; if the browser still refuses, start muted rather than not at all.
    video.play().catch(function () { video.muted = true; paintMute(); video.play().catch(function () {}); });
    muteBtn.focus();
    track('see_how_it_works_open', { muted: video.muted });
  }

  function close() {
    if (!root || root.hidden) return;
    track('see_how_it_works_close', { at_s: Math.round(video.currentTime), ended: !endBox.hidden });
    root.hidden = true; video.pause(); video.currentTime = 0;
    root.classList.remove('is-open', 'is-paused'); document.documentElement.style.overflow = '';
    if (opener && opener.focus) opener.focus();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-shiw]');
    if (t) open(e);
  });
})();
