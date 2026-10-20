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

   On a phone it plays full screen, held either way up (Ed, 2026-10-19: "in
   both portrait and landscape mode, the video plays full screen. Currently
   it's in browser mode"), through assets/js/phone-fullscreen.js. Android takes
   this whole player full screen, its controls and the real trial button
   included. An iPhone can put only a video full screen, in its own player, and
   only once the video has read its header, so on an iPhone the player is built
   at load with the header fetched (78 KB, it sits at the front of the file),
   and the video comes back to this player when the end card arrives, so the
   trial button on the card is the real one. Leaving full screen (Done, or the
   back gesture) closes the video.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // v7 (2026-10-20, Ed: "Re-shoot at full 4k"): the same cut recorded at 4K, in two files. A screen with 2560 or more
  // device pixels across that is not a phone gets 2160p; everything else gets 1080p, cut from the same 4K master.
  // The files live on the CDN (Cloudflare R2, the bucket the music plays from), never in this repo (Ed: "Shouldn't
  // this be there for scalability"). v6 is there too (video/maketzo-see-how-it-works.mp4), so going back is one line.
  var CDN = 'https://pub-aedb1c7ff17d48a496393b71ec4b91ee.r2.dev/video/';
  var SRC_1080 = CDN + 'maketzo-see-how-it-works-v7-1080.mp4';
  var SRC_2160 = CDN + 'maketzo-see-how-it-works-v7-2160.mp4';
  var CARD_LEAD = 5.7;   // the end card is the last 5.8s of the cut, dissolving in over 0.8s
  var POSTER = 'assets/see-it-work/maketzo-see-how-it-works-poster.jpg?v=1';
  var MUTE_KEY = 'mk_shiw_muted';
  var ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>';
  var ICON_X ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  var FULL = window.MKPhoneFull || null;
  var PRIME = !!(FULL && FULL.primeVideo);
  var BIG = !(FULL && FULL.phone) && Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) >= 2560;
  var SRC = BIG ? SRC_2160 : SRC_1080;

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
        '<video class="shiw-video" data-mk-full playsinline preload="' + (PRIME ? 'metadata' : 'none') + '" poster="' + POSTER + '"></video>' +
        '<div class="shiw-paused" aria-hidden="true"><span>' + ICON_PAUSE + '</span></div>' +
        '<button type="button" class="shiw-btn shiw-mute"></button>' +
        '<button type="button" class="shiw-btn shiw-close" aria-label="Close the video">' + ICON_X + '</button>' +
        '<div class="shiw-card">' +
          '<button type="button" class="btn-primary" data-shiw-trial tabindex="-1">Start 7-Day Free Trial &rarr;</button>' +
          '<p class="shiw-fine">No charge until day 8. Cancel anytime.</p>' +
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
      endBox.hidden = true; showCard(false); video.currentTime = 0; video.play().catch(function () {}); goFull(); track('see_how_it_works_replay', {});
    });
    // The iPhone's own player has its own mute: keep this button's word true, and remember the choice the same way.
    video.addEventListener('volumechange', function () { paintMute(); if (FULL && FULL.state(null, video) === 'video') saveMuted(video.muted); });
    // Leaving full screen closes the video, except when the iPhone player hands back at the end card.
    if (FULL) FULL.watch(root, video, function (now, before) {
      root.classList.toggle('is-full', now === 'page');
      if (!now && !root.hidden && !(before === 'video' && root.classList.contains('is-card'))) close();
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
    if (on && FULL && FULL.state(root, video) === 'video') FULL.exit(root, video);   // the iPhone player cannot show the real button
  }

  // From a tap. Says how it went, for the open event: 'page', 'video', or 'none' (not a phone, or an iPhone tapped
  // before the header arrived, so it stays in the page).
  function goFull() { return FULL ? FULL.enter(root, video) : 'none'; }

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
    var full = goFull();
    muteBtn.focus();
    track('see_how_it_works_open', { muted: video.muted, fullscreen: full, cut: BIG ? '2160' : '1080' });
  }

  function close() {
    if (!root || root.hidden) return;
    track('see_how_it_works_close', { at_s: Math.round(video.currentTime), ended: !endBox.hidden });
    root.hidden = true; video.pause(); video.currentTime = 0;
    root.classList.remove('is-open', 'is-paused', 'is-full'); document.documentElement.style.overflow = '';
    if (FULL) FULL.exit(root, video);
    if (opener && opener.focus) opener.focus();
  }

  if (PRIME) { build(); video.setAttribute('src', SRC); }   // iPhone: read the header now, so the tap can go full screen

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-shiw]');
    if (t) open(e);
  });
})();
