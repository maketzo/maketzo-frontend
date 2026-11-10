/* assets/js/motion-rest.js: the site's endless decorative loops rest while the visitor is still.
 *
 * Ed, 2026-11-10: "fans whir... particularly on secondary pages". Measured on prod /journal at his 3440x1440: an
 * endless CSS animation on screen keeps Chrome drawing new frames at the screen's full rate even when it animates only
 * opacity or position, so the page sat at 28% CPU (GPU + renderer) while nothing moved, against 1% with its three loops
 * paused. Making a loop cheaper could not reach his standing rule (anything continuous idles near zero; a burst that
 * ends is fine), so he picked "Rest when still": loops move exactly as before while the visitor scrolls, moves the
 * mouse, touches or types, and hold where they are 5 seconds after the last of those, until the next one.
 *
 * Only ENDLESS animations rest. Finite ones (reveals, one-time moments, a countdown) always run to their end. A loop
 * that does a job while the visitor is still (the /focus breathing guide, the soundtrack player's playing meter) sits
 * under data-motion-keep and is never paused. JS-driven motion (requestAnimationFrame, canvas) is not touched here.
 * Guarded by C:/dev/tools/check-site-heat.js: a page that runs an endless animation must load this file.
 */
(function () {
  'use strict';
  if (!document.getAnimations || window.__mkMotionRest) return;
  window.__mkMotionRest = true;
  var REST_MS = 5000;
  var timer = 0, resting = false, held = [], lastWake = 0;

  function endless(a) {
    try {
      if (a.playState !== 'running') return false;
      if (a.effect.getComputedTiming().iterations !== Infinity) return false;
    } catch (e) { return false; }
    var t = a.effect && a.effect.target;
    return !(t && t.closest && t.closest('[data-motion-keep]'));
  }

  function rest() {
    resting = true;
    var now = document.getAnimations().filter(endless);
    now.forEach(function (a) { a.pause(); });
    held = held.concat(now);
    // A loop that starts while the page rests (a class added by a script) is caught by the next check.
    timer = setTimeout(rest, REST_MS);
  }

  function wake() {
    var t = Date.now();
    if (!resting && t - lastWake < 250) return;   // a pointermove burst resets the clock a few times a second, no more
    lastWake = t;
    if (resting) {
      resting = false;
      held.forEach(function (a) { try { a.play(); } catch (e) {} });
      held = [];
    }
    clearTimeout(timer);
    timer = setTimeout(rest, REST_MS);
  }

  ['scroll', 'wheel', 'pointermove', 'pointerdown', 'keydown', 'touchstart', 'resize', 'focusin'].forEach(function (ev) {
    window.addEventListener(ev, wake, { passive: true, capture: true });
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
  wake();
})();
