/* The 10:42 duel (#the-moment.duel): the homepage's slot 01 since 2026-11-13, moved out of journal.html unchanged.
   /journal's slot under the hero became Three People, One Seat the same day, so only index.html loads this now. */
/* Only MAKETZO plays (Ed, 2026-10-16, on the first version that animated both cards: "ANY OTHER JOURNAL should be
   boring, bland, no animations. Maketzo should be more beautiful with animations. The compare and contrast should be
   easily understood"). The other journal is never touched. Once the MAKETZO card is well in view: it lights, its
   P&L counts to -$380.00, the second strike lands, and the COACH SAYS warning types out live (the untyped rest holds
   its place, so the card never reflows); then the verdict. Every value ends exactly as written in the markup. Reduce
   motion gets the gentle version in moment.css; without IntersectionObserver nothing is armed. */
(function () {
  var us = document.querySelector('#the-moment .moment-card--us');
  if (!us || !('IntersectionObserver' in window)) return;
  var pnl = us.querySelector('.moment-pnl-val'), say = us.querySelector('.moment-coach p');
  if (!pnl || !say) return;
  var finalPnl = pnl.textContent, line = say.textContent;
  function money(v) { return (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2); }
  function tween(ms, fn, done) {
    var t0 = null;
    function step(now) {
      if (t0 === null) t0 = now;
      var u = Math.min(1, (now - t0) / ms);
      fn(1 - Math.pow(1 - u, 3));
      if (u < 1) requestAnimationFrame(step); else if (done) done();
    }
    requestAnimationFrame(step);
  }
  var typed = document.createElement('span'), rest = document.createElement('span');
  typed.className = 'mj-typed'; rest.className = 'mj-rest'; rest.textContent = line;
  say.textContent = ''; say.appendChild(typed); say.appendChild(rest);
  pnl.textContent = money(0);
  us.classList.add('mj-armed');

  function play() {
    us.classList.add('is-on');
    setTimeout(function () { tween(900, function (e) { pnl.textContent = money(-380 * e); }, function () { pnl.textContent = finalPnl; }); }, 400);
    setTimeout(function () {
      typed.classList.add('is-typing');
      var n = 0;
      (function next() {
        n++; typed.textContent = line.slice(0, n); rest.textContent = line.slice(n);
        if (n < line.length) { setTimeout(next, 24); return; }
        typed.classList.remove('is-typing');
        say.textContent = line;
        setTimeout(function () { us.classList.add('is-done'); }, 250);
      })();
    }, 2100);
  }
  var o = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { o.disconnect(); play(); } }, { threshold: 0.45 });
  o.observe(us);
})();
