/* ═══════════════════════════════════════════════════════════════════════════
   PHONE FULL SCREEN  ·  assets/js/phone-fullscreen.js
   Every video a visitor opens plays full screen on a phone, held either way up
   (Ed, 2026-10-19: "can you make sure all videos moving forward will always do
   this"). This is the one place that knows how; a player calls it from the tap.

   Android (and any phone with page full screen) takes the player's own box full
   screen, so its controls stay. An iPhone can put only a <video> full screen, in
   its own player, and refuses unless the video has read its header before the
   tap: so where primeVideo is true, give the video its src with
   preload="metadata" at load, not on the tap. A refusal returns 'none' and the
   player stays in the page.

   The check: maketzo-app/scripts/check-video-fullscreen.js fails the push when
   a <video> has neither data-mk-full (opened through this) nor a
   video-inline-ok comment saying why it stays in the page. The app carries the
   same helper as lib/phone-fullscreen.js; change both together.

   Used by: assets/js/see-how-it-works.js.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var phone = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) && Math.min(screen.width, screen.height) < 600;
  var pageFull = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);   // false on an iPhone

  function pageElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  // The box may be a function that returns the live element, for a panel that re-renders.
  function el(box) { return typeof box === 'function' ? box() : box; }

  // 'page' when the box is full screen, 'video' when the video is in the phone's own player, '' otherwise.
  function state(box, video) {
    box = el(box);
    if (box && pageElement() === box) return 'page';
    if (video && video.webkitDisplayingFullscreen) return 'video';
    return '';
  }

  // From a tap. The box where the page can go full screen, else the video in the phone's own player.
  function enter(box, video) {
    box = el(box);
    if (!phone) return 'none';
    try {
      if (pageFull && box) {
        if (pageElement() !== box) {
          var p = (box.requestFullscreen || box.webkitRequestFullscreen).call(box);
          if (p && p.catch) p.catch(function () {});
        }
        return 'page';
      }
      if (video && video.webkitEnterFullscreen) {
        if (!video.webkitDisplayingFullscreen) video.webkitEnterFullscreen();
        return 'video';
      }
    } catch (e) {}
    return 'none';
  }

  function exit(box, video) {
    var s = state(box, video);
    if (s === 'page') {
      var p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      if (p && p.catch) p.catch(function () {});
    } else if (s === 'video') {
      video.webkitExitFullscreen();
    }
  }

  // fn(now, before) whenever this box or video goes in or out of full screen; each is 'page', 'video' or ''.
  function watch(box, video, fn) {
    var before = '';
    function report(now) { if (now !== before) { var was = before; before = now; fn(now, was); } }
    document.addEventListener('onfullscreenchange' in document ? 'fullscreenchange' : 'webkitfullscreenchange', function () { report(state(box, video)); });
    if (video) {
      // The phone player's own events are the news; they do not wait on webkitDisplayingFullscreen.
      video.addEventListener('webkitbeginfullscreen', function () { report('video'); });
      video.addEventListener('webkitendfullscreen', function () { var now = state(box, null); before = now; fn(now, 'video'); });   // it was full screen, whatever was seen
    }
  }

  window.MKPhoneFull = { phone: phone, primeVideo: phone && !pageFull, enter: enter, exit: exit, state: state, watch: watch };
})();
