/* lib/breath-orb.js -- the reset's breathing visual. ONE FILE, TWO SITES.
 *
 * WHY (Ed, 2026-10-12): "The breathing apparatus here is so beautiful. Is there any
 * way we can replicate this breathing style onto our app" (tripp.com). Then, on the
 * preview: "The enhanced version is BEAUTIFUL." His calls: our phase colours, no
 * Classic option for anyone, the orb swells, and "Need to update the kiosk version
 * with this Enhanced version as well".
 *
 * WHAT IT DRAWS. The ring is a map of ONE breath: an arc per phase, its length that
 * phase's share of the cycle, the current arc bold and filling as a bead travels it,
 * so a trader can see how much of a hold is left. Inside, a glass orb whose light
 * brightens on the inhale and settles on the exhale, swelling about 10%, with sparks
 * rising on the exhale. Above it ONE word, faded out completely before the next one
 * fades in: the first preview cross-faded two words and Ed saw them bleed together.
 * finish() is the 0:00 moment: one gold ring, a slow 5.2 s glow, no word, no sparks.
 * ready() is the moment before: the first frame of start(), held still, for a page
 * whose breathing waits for a Begin button (Ed, on /zone: "Nothing should start
 * until user clicks BEGIN").
 *
 * ONE FILE, TWO SITES. The app's reset loads this as lib/breath-orb.js; maketzo.co
 * (/zone and the homepage demo) loads the identical file as assets/js/breath-orb.js.
 * The marketing site hand-copied the old ring twice and drifted both times, once into
 * a pattern the app never had and a circle on a different clock from its word. Edit
 * it HERE, then run `node scripts/sync-breath-orb.js`; scripts/test-breath-orb.js
 * fails the app build when the two copies differ. So it reads no app globals and no
 * site tokens: everything comes in through mount() and start().
 *
 * It owns no timing policy. The caller hands it phases in the app's BREATH_PATTERNS
 * shape ({k, label, sec, scale}) and it runs them on its own clock.
 *
 * analytics-exempt -- a visual inside the reset. The reset's own events measure it
 * (app_focus_reset_start / app_focus_reset_done carry visual: 'orb';
 * zone_begin_click / zone_session_complete on maketzo.co).
 */
;(function () {
  'use strict';

  // Our phase colours, Ed's pick: the reset's long-standing gold, cyan, mint and slate.
  var PHASE_RGB = { inhale: '251,191,36', hold: '56,189,248', exhale: '110,231,183', hold2: '148,163,184' };
  var DONE_RGB = '251,191,36';
  // The old word is fully gone (its fade is 280 ms) before the new one starts.
  var WORD_OUT_MS = 300;
  // How much smaller the orb is at the bottom of the exhale than at the top of the inhale.
  var SWELL = 0.10;
  // The ring is drawn in a 320-unit box whatever its rendered size.
  var CX = 160, CY = 160, RR = 141, GAP_DEG = 1.8;
  var SVGNS = 'http://www.w3.org/2000/svg';

  // ── Pure timing and geometry (scripts/test-breath-orb.js runs these) ──────
  function ease(p) { return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, p))); }

  function cycleSeconds(phases) {
    var t = 0;
    for (var i = 0; i < phases.length; i++) t += phases[i].sec;
    return t;
  }

  /* Where the breath is at `sec` seconds since start: which phase, how far through
   * it, the eased breath value b (the phase's `scale` space, 0.55 bottom to 1.0 top)
   * and the fraction of the whole cycle, which is where the bead sits. Each phase
   * eases from the previous phase's scale, so a hold holds and the cycle wraps. */
  function breathAt(phases, sec) {
    var total = cycleSeconds(phases);
    var c = ((sec % total) + total) % total, cum = 0;
    for (var i = 0; i < phases.length; i++) {
      if (c < cum + phases[i].sec || i === phases.length - 1) {
        var p = (c - cum) / phases[i].sec;
        var prev = phases[(i - 1 + phases.length) % phases.length].scale;
        return { i: i, ph: phases[i], p: p, b: prev + (phases[i].scale - prev) * ease(p),
                 frac: c / total, cycle: Math.floor(sec / total) };
      }
      cum += phases[i].sec;
    }
    return null;
  }

  /* One arc per phase, in degrees, starting at 12 o'clock and running clockwise.
   * Each arc's length is its share of the cycle, less a small gap at both ends. */
  function arcSpans(phases) {
    var total = cycleSeconds(phases), cum = 0, out = [];
    for (var i = 0; i < phases.length; i++) {
      out.push([-90 + 360 * cum / total + GAP_DEG, -90 + 360 * (cum + phases[i].sec) / total - GAP_DEG]);
      cum += phases[i].sec;
    }
    return out;
  }

  function pt(a) { var r = a * Math.PI / 180; return [CX + RR * Math.cos(r), CY + RR * Math.sin(r)]; }
  function arcD(a0, a1) {
    if (a1 - a0 < 0.05) a1 = a0 + 0.05;
    var p0 = pt(a0), p1 = pt(a1);
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + RR + ' ' + RR + ' 0 ' +
      (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }

  // ── Styles, injected once per document ──────────────────────────────────
  // Size comes from --mk-borb-size on the host, so each page sets one number.
  var CSS = [
    '.mk-borb{display:flex;flex-direction:column;align-items:center;gap:10px;}',
    '.mk-borb-label{height:calc(var(--mk-borb-size,320px)*0.082);max-width:100%;display:flex;align-items:center;justify-content:center;}',
    /* inverted-by-design: the reset room is dark in both app themes, and so is maketzo.co, so the word stays light */
    '.mk-borb-word{font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-weight:300;font-size:calc(var(--mk-borb-size,320px)*0.06);letter-spacing:0.48em;padding-left:0.48em;text-transform:uppercase;color:rgba(255,255,255,0.92);text-shadow:0 0 18px rgba(var(--mk-borb-lc,255,255,255),0.55),0 1px 6px rgba(0,0,0,0.8);white-space:nowrap;opacity:0;transition:opacity 280ms ease;}',
    '.mk-borb-word.is-on{opacity:1;transition:opacity 520ms ease;}',
    '.mk-borb-orb{position:relative;width:var(--mk-borb-size,320px);height:var(--mk-borb-size,320px);max-width:100%;}',
    '.mk-borb-canvas,.mk-borb-ring{position:absolute;inset:0;width:100%;height:100%;}',
    '.mk-borb-ring{overflow:visible;}',
    '.mk-borb-arc{fill:none;stroke-linecap:round;stroke-width:2.5;opacity:0.38;transition:stroke-width 500ms ease,opacity 600ms ease;}',
    '.mk-borb-arc.is-active{stroke-width:6;opacity:0.5;}',
    '.mk-borb-fill{fill:none;stroke-width:6;stroke-linecap:round;transition:opacity 600ms ease;}',
    /* inverted-by-design: the bead is a light ring on the dark reset room in both themes */
    '.mk-borb-bead{fill:rgba(10,10,22,0.45);stroke:#fff;stroke-width:1.8;transition:opacity 600ms ease;}',
    '.mk-borb-done{fill:none;stroke:rgb(251,191,36);stroke-width:4;opacity:0;transition:opacity 900ms ease;filter:drop-shadow(0 0 8px rgba(251,191,36,0.7));}',
    '.mk-borb.is-finished .mk-borb-arc,.mk-borb.is-finished .mk-borb-fill,.mk-borb.is-finished .mk-borb-bead{opacity:0;}',
    '.mk-borb.is-finished .mk-borb-done{opacity:1;}'
  ].join('\n');

  function injectCss(doc) {
    if (doc.getElementById('mk-borb-style')) return;
    var st = doc.createElement('style');
    st.id = 'mk-borb-style';
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  // ── The component ───────────────────────────────────────────────────────
  function mount(host, opts) {
    if (!host || !host.ownerDocument) return null;
    opts = opts || {};
    var doc = host.ownerDocument, win = doc.defaultView || window;
    injectCss(doc);

    var reduced = false;
    try { reduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    host.innerHTML =
      '<div class="mk-borb">' +
        '<div class="mk-borb-label"><span class="mk-borb-word"></span></div>' +
        '<div class="mk-borb-orb">' +
          '<canvas class="mk-borb-canvas" aria-hidden="true"></canvas>' +
          '<svg class="mk-borb-ring" viewBox="0 0 320 320" aria-hidden="true">' +
            '<circle class="mk-borb-done" cx="160" cy="160" r="141"></circle>' +
            '<g class="mk-borb-arcs"></g>' +
            '<path class="mk-borb-fill" d=""></path>' +
            '<circle class="mk-borb-bead" r="6.5" cx="160" cy="19"></circle>' +
          '</svg>' +
        '</div>' +
      '</div>';
    var root = host.firstChild;
    var word = root.querySelector('.mk-borb-word');
    var canvas = root.querySelector('.mk-borb-canvas');
    var ctx = canvas.getContext && canvas.getContext('2d');
    var arcsG = root.querySelector('.mk-borb-arcs');
    var fill = root.querySelector('.mk-borb-fill');
    var bead = root.querySelector('.mk-borb-bead');

    var st = {
      mode: 'idle', phases: null, spans: [], t0: 0, doneAt: 0, raf: 0, last: 0,
      onCycle: null, cycle: -1, phaseKey: null, word: '', wordTimer: 0,
      halo: null, swellNow: 1, sparks: [], spawnAcc: 0, size: 0, dpr: 1,
      swell: opts.swell !== false
    };

    var RAYS = [];
    for (var k = 0; k < 22; k++) {
      RAYS.push({ a: (k / 22) * Math.PI * 2 + (k % 2 ? 0.07 : -0.05), w: 0.012 + ((k * 37) % 11) / 11 * 0.03,
                  l: 0.55 + ((k * 53) % 13) / 13 * 0.45, f: 0.6 + ((k * 29) % 7) / 7 * 1.4, o: k * 1.7 });
    }

    // ONE word at a time. Fade out, swap while invisible, fade in. The spacing
    // never animates, so two words can never overlap.
    function setWord(text, rgb) {
      if (rgb) word.style.setProperty('--mk-borb-lc', rgb);
      if (text === st.word) return;
      st.word = text;
      win.clearTimeout(st.wordTimer);
      word.classList.remove('is-on');
      st.wordTimer = win.setTimeout(function () {
        word.textContent = text;
        if (text) word.classList.add('is-on');
      }, WORD_OUT_MS);
    }

    function buildArcs() {
      while (arcsG.firstChild) arcsG.removeChild(arcsG.firstChild);
      st.spans = arcSpans(st.phases);
      for (var i = 0; i < st.phases.length; i++) {
        var el = doc.createElementNS(SVGNS, 'path');
        el.setAttribute('class', 'mk-borb-arc');
        el.setAttribute('d', arcD(st.spans[i][0], st.spans[i][1]));
        el.style.stroke = 'rgb(' + (PHASE_RGB[st.phases[i].k] || DONE_RGB) + ')';
        arcsG.appendChild(el);
      }
    }

    function sizeCanvas() {
      var w = canvas.clientWidth || 0;
      var dpr = Math.min(2, win.devicePixelRatio || 1);
      if (w > 0 && (w !== st.size || dpr !== st.dpr)) {
        st.size = w; st.dpr = dpr;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr);
      }
      return st.size > 0;
    }

    function mix(cur, target, f) {
      var a = cur.split(','), b = target.split(',');
      return [0, 1, 2].map(function (j) { var x = +a[j], y = +b[j]; return (x + (y - x) * f).toFixed(1); }).join(',');
    }

    function streak(cx, cy, len, thick, ang, rgb, a) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.scale(1, thick / len);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      g.addColorStop(0.22, 'rgba(' + rgb + ',' + (a * 0.55).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, len, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // I is the breath: 0 at the bottom of the exhale, 1 at the top of the inhale.
    function drawOrb(I, target, sparkRate, sparkRGB, t, dt) {
      if (!ctx || !sizeCanvas()) return;
      st.halo = st.halo ? mix(st.halo, target, 1 - Math.exp(-dt / 0.35)) : target;
      var swellTarget = st.swell ? (1 - SWELL + SWELL * I) : 1;
      st.swellNow += (swellTarget - st.swellNow) * (1 - Math.exp(-dt / 0.12));
      var S = st.size, H = st.halo, cx = S / 2, cy = S / 2, R = S * 0.355 * st.swellNow;
      var lift = 0.35 + 0.65 * I, g;

      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'source-over';

      // The glass: a darkened volume, a tinted body, a bright rim, a highlight.
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(' + H + ',0.10)');
      g.addColorStop(0.72, 'rgba(10,10,26,0.30)');
      g.addColorStop(0.94, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(255,255,255,0.16)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1; ctx.stroke();
      g = ctx.createRadialGradient(cx - R * 0.36, cy - R * 0.46, 0, cx - R * 0.36, cy - R * 0.46, R * 0.5);
      g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // Light, added on top.
      ctx.globalCompositeOperation = 'lighter';
      g = ctx.createRadialGradient(cx, cy + R * 0.55, 0, cx, cy + R * 0.55, R * 0.7);
      g.addColorStop(0, 'rgba(' + H + ',' + (0.08 + 0.16 * I).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + H + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      var haloR = R * (0.8 + 0.5 * I);
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      g.addColorStop(0, 'rgba(' + H + ',' + (0.55 * lift).toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(' + H + ',' + (0.2 * lift).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + H + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, Math.PI * 2); ctx.fill();

      // Rays, slowly turning, each flickering on its own beat. Still under reduced motion.
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2); ctx.clip();
      var rot = reduced ? 0 : t * 0.035;
      for (var i = 0; i < RAYS.length; i++) {
        var ry = RAYS[i], ang = ry.a + rot;
        var len = R * (0.5 + 0.75 * I) * ry.l * (reduced ? 1 : (0.82 + 0.18 * Math.sin(t * ry.f + ry.o)));
        var ex = cx + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len, hw = len * ry.w;
        var px = -Math.sin(ang) * hw, py = Math.cos(ang) * hw;
        var lg = ctx.createLinearGradient(cx, cy, ex, ey);
        lg.addColorStop(0, 'rgba(255,255,255,' + (0.32 * lift).toFixed(3) + ')');
        lg.addColorStop(0.5, 'rgba(' + H + ',' + (0.14 * lift).toFixed(3) + ')');
        lg.addColorStop(1, 'rgba(' + H + ',0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex + px, ey + py); ctx.lineTo(ex - px, ey - py); ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // The star: long horizontal and vertical streaks, short diagonals.
      var sl = R * (0.7 + 0.65 * I);
      streak(cx, cy, sl, 3.2, 0, H, (0.55 * lift).toFixed(3));
      streak(cx, cy, sl * 0.82, 3.0, Math.PI / 2, H, (0.5 * lift).toFixed(3));
      streak(cx, cy, sl * 0.38, 2.4, Math.PI / 4, H, (0.32 * lift).toFixed(3));
      streak(cx, cy, sl * 0.38, 2.4, -Math.PI / 4, H, (0.32 * lift).toFixed(3));

      // The hot core.
      var coreR = R * (0.2 + 0.14 * I);
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,' + (0.55 + 0.4 * I).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + H + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();

      // Sparks rise while breathing out. Far fewer under reduced motion. Their
      // count, size and speed scale with the orb (k), or a small orb, like the
      // homepage demo's, crowds with full-size sparks.
      var k = S / 320;
      st.spawnAcc += (reduced ? sparkRate * 0.15 : sparkRate) * k * dt;
      while (st.spawnAcc >= 1 && st.sparks.length < 90) {
        st.spawnAcc -= 1;
        st.sparks.push({ x: cx + (Math.random() - 0.5) * R * 1.15, y: cy + R * (0.15 + Math.random() * 0.6),
                         vx: (Math.random() - 0.5) * 16 * k, vy: -(14 + Math.random() * 30) * k, life: 0,
                         max: 1.4 + Math.random() * 1.4, r: (0.7 + Math.random() * 1.5) * Math.max(0.6, k) });
      }
      if (st.spawnAcc > 1) st.spawnAcc = 0;
      for (var s = st.sparks.length - 1; s >= 0; s--) {
        var q = st.sparks[s];
        q.life += dt;
        if (q.life >= q.max) { st.sparks.splice(s, 1); continue; }
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy *= (1 - 0.25 * dt);
        var a = Math.sin(Math.PI * q.life / q.max);
        ctx.fillStyle = 'rgba(' + sparkRGB + ',' + (0.85 * a).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * a).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawBreath(sec, dt) {
      var br = breathAt(st.phases, sec);
      if (!br) return;
      var rgb = PHASE_RGB[br.ph.k] || DONE_RGB;
      if (st.phaseKey !== br.i) {
        st.phaseKey = br.i;
        var arcs = arcsG.childNodes;
        for (var i = 0; i < arcs.length; i++) arcs[i].classList.toggle('is-active', i === br.i);
        fill.style.stroke = 'rgb(' + rgb + ')';
        fill.style.filter = 'drop-shadow(0 0 6px rgba(' + rgb + ',0.85))';
        bead.style.filter = 'drop-shadow(0 0 5px rgba(' + rgb + ',0.9))';
        setWord(br.ph.label || '', rgb);
      }
      var ang = -90 + 360 * br.frac, span = st.spans[br.i];
      fill.setAttribute('d', arcD(span[0], Math.max(span[0], Math.min(span[1], ang))));
      var b = pt(ang);
      bead.setAttribute('cx', b[0].toFixed(2)); bead.setAttribute('cy', b[1].toFixed(2));
      var rate = br.ph.k === 'exhale' ? 26 : (br.ph.k === 'hold2' ? 3 : 0);
      drawOrb((br.b - 0.55) / 0.45, rgb, rate, PHASE_RGB.exhale, sec, dt);
    }

    function frame(now) {
      st.raf = win.requestAnimationFrame(frame);
      var dt = Math.min(0.1, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      if (st.mode === 'breath') {
        var sec = (now - st.t0) / 1000;
        // The cycle hook runs whether or not the orb is on screen: the app's
        // Meditation Zone advances its floating rule on it.
        var n = Math.floor(sec / cycleSeconds(st.phases));
        if (n !== st.cycle) { st.cycle = n; if (st.onCycle) { try { st.onCycle(n); } catch (e) {} } }
        if (!host.getClientRects().length) return;      // hidden: keep time, skip the drawing
        drawBreath(sec, dt);
      } else if (st.mode === 'done') {
        if (!host.getClientRects().length) return;
        var t = (now - st.doneAt) / 1000;
        drawOrb(0.45 + 0.15 * Math.sin(2 * Math.PI * t / 5.2), DONE_RGB, 0, DONE_RGB, t, dt);
      } else if (st.mode === 'ready') {
        // One still frame, the one start() opens on, then the loop ends.
        if (!host.getClientRects().length) return;
        var b0 = breathAt(st.phases, 0), I0 = (b0.b - 0.55) / 0.45, rgb0 = PHASE_RGB[b0.ph.k] || DONE_RGB;
        st.halo = rgb0;
        st.swellNow = st.swell ? (1 - SWELL + SWELL * I0) : 1;
        drawOrb(I0, rgb0, 0, rgb0, 0, 0);
        if (st.size > 0) { win.cancelAnimationFrame(st.raf); st.raf = 0; }
      }
    }

    function run() {
      if (st.raf) return;
      st.last = win.performance.now();
      st.raf = win.requestAnimationFrame(frame);
    }

    function stop() {
      if (st.raf) { win.cancelAnimationFrame(st.raf); st.raf = 0; }
      win.clearTimeout(st.wordTimer);
      st.mode = 'idle';
    }

    // Start breathing `phases` from the top of a cycle. onCycle(n) fires at the
    // start of every cycle, including the first, as the app's old engine did.
    function start(phases, o) {
      if (!Array.isArray(phases) || !phases.length) return;
      stop();
      st.phases = phases;
      st.onCycle = (o && o.onCycle) || null;
      st.mode = 'breath';
      st.t0 = win.performance.now();
      st.cycle = 0;
      st.phaseKey = null;
      st.sparks.length = 0;
      root.classList.remove('is-finished');
      buildArcs();
      if (st.onCycle) { try { st.onCycle(0); } catch (e) {} }
      run();
    }

    // Before Begin: the ring map, the bead parked at 12 o'clock, no word, nothing
    // moving. start() then opens on exactly this frame, so Begin does not jump.
    function ready(phases) {
      if (!Array.isArray(phases) || !phases.length) return;
      stop();
      st.phases = phases;
      st.mode = 'ready';
      st.phaseKey = null;
      st.sparks.length = 0;
      root.classList.remove('is-finished');
      buildArcs();
      fill.setAttribute('d', '');
      bead.setAttribute('cx', CX); bead.setAttribute('cy', CY - RR);
      setWord('', null);
      run();
    }

    // The 0:00 moment.
    function finish() {
      st.mode = 'done';
      st.doneAt = win.performance.now();
      st.sparks.length = 0;
      root.classList.add('is-finished');
      setWord('', null);
      run();
    }

    function destroy() { stop(); host.innerHTML = ''; }

    return { ready: ready, start: start, stop: stop, finish: finish, destroy: destroy,
             setSwell: function (on) { st.swell = !!on; } };
  }

  var API = {
    mount: mount,
    PHASE_RGB: PHASE_RGB,
    _t: { breathAt: breathAt, arcSpans: arcSpans, cycleSeconds: cycleSeconds, WORD_OUT_MS: WORD_OUT_MS, SWELL: SWELL, CSS: CSS }
  };
  if (typeof window !== 'undefined') window.MaketzoBreathOrb = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
