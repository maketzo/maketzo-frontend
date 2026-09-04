/* ═══════════════════════════════════════════════════════════════════════════
   IMAGE LIGHTBOX  ·  assets/js/lightbox.js
   Tap a blog image, see the whole thing full-screen, pinch or scroll to zoom.

   THE PROBLEM IT SOLVES. Blog figures render inside a fixed frame with
   object-fit:cover plus a radial gradient that feathers the photo edges into
   the page background. Part of every photo is therefore cropped away or washed
   out, and on a phone there was no way to reach it. Rotating helps only on the
   full-width layouts; the floated ones cap at 400px and get SMALLER in
   landscape.

   THE ONE RULE. The overlay renders the same source with object-fit:contain
   and no feather, so what opens is the real, uncropped photo. Showing a bigger
   copy of the same crop would make this feature theatre.

   Reuses the already-cached source rather than requesting a larger one, so the
   overlay opens with zero network on an image the reader has already seen.

   Pairs with assets/css/lightbox.css.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Scoped to blog figures only. Author avatars, the brand lockup and the
  // share icons are images too and must never become zoomable.
  // .blog-hero-figure is the legacy class still carried by 15 published posts.
  var FIG_SELECTOR = '.blog-fig, .blog-embed, .blog-hero-figure';
  var MIN_SCALE = 1;
  var MAX_SCALE = 6;
  var TAP_SCALE = 2.5;      // where a double tap lands
  var TAP_SLOP = 10;        // px of movement still counted as a tap, not a drag
  var TAP_MS = 250;
  var DBL_MS = 320;
  var DBL_SLOP = 34;
  var DISMISS_PX = 90;      // swipe-down distance that closes at fit scale

  var ICON_EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  var box = null, boxImg = null, boxClose = null;   // built on first open
  var lastFocus = null;
  var openedAt = 0, peakScale = 1, openMeta = null;

  // Transform state: translate(tx, ty) scale(k), origin at the element centre.
  var k = 1, tx = 0, ty = 0;
  var baseW = 0, baseH = 0;

  // Gesture state
  var pts = {}, ptCount = 0;
  var g = null;                 // active gesture snapshot
  var lastTapAt = 0, lastTapX = 0, lastTapY = 0;
  var downX = 0, downY = 0;     // page-side tap-vs-scroll guard

  // ── helpers ───────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function vw() { return window.innerWidth; }
  function vh() { return window.innerHeight; }

  function track(name, props) {
    try { if (window.MKT && window.MKT.trackEvent) window.MKT.trackEvent(name, props || {}); } catch (e) {}
  }

  function slug() {
    try {
      var m = String(location.pathname).split('/').pop().replace(/\.html$/, '');
      return m || 'index';
    } catch (e) { return 'unknown'; }
  }

  function layoutOf(fig) {
    if (!fig || !fig.className) return 'unknown';
    var c = ' ' + fig.className + ' ';
    if (c.indexOf(' blog-hero-figure ') > -1) return 'legacy-hero';
    if (c.indexOf('-full') > -1) return 'full';
    if (c.indexOf('-left') > -1) return 'left';
    if (c.indexOf('-right') > -1) return 'right';
    return 'unknown';
  }

  // ── the overlay ───────────────────────────────────────────────────────────
  function build() {
    box = document.createElement('div');
    box.className = 'mk-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.hidden = true;

    boxImg = document.createElement('img');
    boxImg.className = 'mk-lightbox__img';
    boxImg.alt = '';
    box.appendChild(boxImg);

    boxClose = document.createElement('button');
    boxClose.type = 'button';
    boxClose.className = 'mk-lightbox__close';
    boxClose.setAttribute('aria-label', 'Close');
    boxClose.innerHTML = ICON_CLOSE;
    box.appendChild(boxClose);

    document.body.appendChild(box);

    boxClose.addEventListener('click', function (e) { e.stopPropagation(); close(); });
    boxImg.addEventListener('load', measure);
    box.addEventListener('pointerdown', onDown);
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerup', onUp);
    box.addEventListener('pointercancel', onUp);
    box.addEventListener('wheel', onWheel, { passive: false });
    box.addEventListener('contextmenu', function (e) { if (k > 1) e.preventDefault(); });
    window.addEventListener('resize', function () { if (box && !box.hidden) { measure(); apply(); } });
    document.addEventListener('keydown', function (e) {
      if (!box || box.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
  }

  function measure() {
    baseW = boxImg.offsetWidth || 0;
    baseH = boxImg.offsetHeight || 0;
    clampPan();
  }

  function clampPan() {
    var mx = Math.max(0, (k * baseW - vw()) / 2);
    var my = Math.max(0, (k * baseH - vh()) / 2);
    tx = clamp(tx, -mx, mx);
    ty = clamp(ty, -my, my);
  }

  function apply() {
    boxImg.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + k.toFixed(4) + ')';
    if (k > 1.001) box.classList.add('is-zoomed'); else box.classList.remove('is-zoomed');
    if (k > peakScale) peakScale = k;
  }

  // Zoom to k2 keeping the content point currently under (px, py) in place.
  // With the origin at the element centre: p = c + t + k * d, so holding d
  // fixed gives t2 = p - c - k2 * (p - c - t) / k.
  function zoomAt(k2, px, py) {
    k2 = clamp(k2, MIN_SCALE, MAX_SCALE);
    var cx = vw() / 2, cy = vh() / 2;
    tx = px - cx - k2 * (px - cx - tx) / k;
    ty = py - cy - k2 * (py - cy - ty) / k;
    k = k2;
    if (k <= MIN_SCALE + 0.001) { k = MIN_SCALE; tx = 0; ty = 0; }
    clampPan();
    apply();
  }

  function open(img, fig, index) {
    if (!box) build();
    k = 1; tx = 0; ty = 0; peakScale = 1;
    boxImg.style.transform = '';
    box.style.opacity = '';
    boxImg.alt = img.getAttribute('alt') || '';
    boxImg.src = img.currentSrc || img.src;
    box.setAttribute('aria-label', boxImg.alt || 'Full image');
    box.hidden = false;
    document.documentElement.classList.add('mk-lightbox-lock');
    // Next frame so the opacity transition has a starting value to run from.
    requestAnimationFrame(function () { box.classList.add('is-open'); });
    measure();

    lastFocus = document.activeElement;
    try { boxClose.focus({ preventScroll: true }); } catch (e) { boxClose.focus(); }

    openedAt = Date.now();
    openMeta = { slug: slug(), layout: layoutOf(fig), idx: index };
    track('image_zoom_open', openMeta);
  }

  function close() {
    if (!box || box.hidden) return;
    box.classList.remove('is-open', 'is-zoomed', 'is-panning');
    document.documentElement.classList.remove('mk-lightbox-lock');
    setTimeout(function () {
      box.hidden = true;
      boxImg.removeAttribute('src');
      boxImg.style.transform = '';
      box.style.opacity = '';
    }, 190);

    track('image_zoom_close', {
      slug: openMeta ? openMeta.slug : slug(),
      layout: openMeta ? openMeta.layout : 'unknown',
      zoomed: peakScale > 1.05,
      peak: Math.round(peakScale * 10) / 10,
      dwell_s: Math.min(600, Math.round((Date.now() - openedAt) / 1000))
    });

    pts = {}; ptCount = 0; g = null;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    lastFocus = null;
  }

  // ── gestures inside the overlay ───────────────────────────────────────────
  function mid() {
    var xs = 0, ys = 0, n = 0, id;
    for (id in pts) { if (pts.hasOwnProperty(id)) { xs += pts[id].x; ys += pts[id].y; n++; } }
    if (!n) return { x: 0, y: 0, n: 0 };
    return { x: xs / n, y: ys / n, n: n };
  }

  function spread() {
    var a = null, b = null, id;
    for (id in pts) {
      if (!pts.hasOwnProperty(id)) continue;
      if (!a) a = pts[id]; else if (!b) b = pts[id];
    }
    if (!a || !b) return 0;
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }

  function snapshot() {
    var m = mid();
    g = { k: k, tx: tx, ty: ty, mx: m.x, my: m.y, d: spread(), n: m.n, moved: 0, t: Date.now() };
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    ptCount++;
    try { box.setPointerCapture(e.pointerId); } catch (err) {}
    snapshot();
    if (k > 1) box.classList.add('is-panning');
  }

  function onMove(e) {
    if (!pts[e.pointerId]) return;
    e.preventDefault();
    pts[e.pointerId].x = e.clientX;
    pts[e.pointerId].y = e.clientY;
    if (!g) return;

    var m = mid();
    g.moved = Math.max(g.moved, Math.abs(m.x - g.mx) + Math.abs(m.y - g.my));

    if (m.n >= 2 && g.d > 0) {
      // Pinch. Anchors the content point that sat under the original midpoint,
      // which makes two-finger zoom and two-finger pan one continuous motion.
      var k2 = clamp(g.k * (spread() / g.d), MIN_SCALE, MAX_SCALE);
      var cx = vw() / 2, cy = vh() / 2;
      tx = m.x - cx - k2 * (g.mx - cx - g.tx) / g.k;
      ty = m.y - cy - k2 * (g.my - cy - g.ty) / g.k;
      k = k2;
      clampPan();
      apply();
      return;
    }

    if (k > 1) {                                  // one finger, zoomed: pan
      tx = g.tx + (m.x - g.mx);
      ty = g.ty + (m.y - g.my);
      clampPan();
      apply();
      return;
    }

    // One finger at fit scale: drag down to dismiss, with live feedback so the
    // gesture reads as a gesture rather than a dead drag.
    var dy = m.y - g.my;
    if (dy > 0 && Math.abs(dy) > Math.abs(m.x - g.mx)) {
      boxImg.style.transform = 'translate(0px,' + dy.toFixed(1) + 'px) scale(1)';
      box.style.opacity = String(Math.max(0.25, 1 - dy / (DISMISS_PX * 3)));
    }
  }

  function onUp(e) {
    if (!pts[e.pointerId]) return;
    var p = pts[e.pointerId];
    delete pts[e.pointerId];
    ptCount = Math.max(0, ptCount - 1);
    box.classList.remove('is-panning');

    var wasSingle = !!g && g.n === 1;
    var quick = !!g && (Date.now() - g.t) < TAP_MS;
    var still = !!g && g.moved < TAP_SLOP;

    // Swipe-down dismiss, only at fit scale.
    if (wasSingle && k === 1 && (p.y - g.my) > DISMISS_PX && !still) {
      box.style.opacity = '';
      close();
      g = null;
      return;
    }
    if (k === 1) { boxImg.style.transform = ''; box.style.opacity = ''; }

    if (wasSingle && quick && still) {
      var now = Date.now();
      var isDouble = (now - lastTapAt) < DBL_MS &&
                     Math.abs(p.x - lastTapX) < DBL_SLOP &&
                     Math.abs(p.y - lastTapY) < DBL_SLOP;
      lastTapAt = now; lastTapX = p.x; lastTapY = p.y;

      if (isDouble) {
        lastTapAt = 0;
        zoomAt(k > 1.05 ? MIN_SCALE : TAP_SCALE, p.x, p.y);
      } else if (e.target === box) {
        // A tap on the backdrop closes. A tap on the photo does not, so the
        // first half of a double tap never dismisses what you meant to zoom.
        close();
      }
    }

    if (ptCount === 0) g = null; else snapshot();
  }

  function onWheel(e) {
    e.preventDefault();
    var factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    zoomAt(k * factor, e.clientX, e.clientY);
  }

  // ── wiring the page images ────────────────────────────────────────────────
  function decorate() {
    var figs = Array.prototype.slice.call(document.querySelectorAll(FIG_SELECTOR));
    figs.forEach(function (fig, i) {
      var img = fig.querySelector('img');
      if (!img || img.classList.contains('mk-zoomable')) return;
      img.classList.add('mk-zoomable');
      fig.setAttribute('data-mk-fig-index', String(i));

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mk-zoom-badge';
      btn.setAttribute('aria-label', 'View full image');
      btn.innerHTML = ICON_EXPAND;
      fig.appendChild(btn);
    });
  }

  // Tap-vs-scroll guard. A touch that turns into a scroll usually cancels the
  // click on its own, but a mouse drag does not, so movement is measured.
  document.addEventListener('pointerdown', function (e) {
    downX = e.clientX; downY = e.clientY;
  }, true);

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var fig = t.closest(FIG_SELECTOR);
    if (!fig) return;
    var onImage = t.tagName === 'IMG';
    var onBadge = !!t.closest('.mk-zoom-badge');
    if (!onImage && !onBadge) return;
    if (Math.abs(e.clientX - downX) > TAP_SLOP || Math.abs(e.clientY - downY) > TAP_SLOP) return;

    var img = fig.querySelector('img');
    if (!img) return;
    e.preventDefault();
    open(img, fig, parseInt(fig.getAttribute('data-mk-fig-index') || '0', 10));
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorate);
  } else {
    decorate();
  }
})();
