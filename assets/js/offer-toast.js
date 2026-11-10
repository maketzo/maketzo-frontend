/*!
 * The $9.95 Journal offer toast (Ed, 2026-11-10; boards 1 and "1 on a Phone" on the offer canvas).
 *
 * Ed sends it to one visitor from the admin Live page. The Live beacon in mkt-analytics.js carries it back, loads
 * this file, and calls MKOffer.receive(code). The card sits over the nav's Start Free Trial on a computer and rises
 * as a sheet from the bottom on a phone. Closing it brings the button back.
 *
 * THE CLOCK. 24 hours from the moment it first appears, set by the server when this file reports it shown
 * (POST /offers/:code/shown) and never reset. The button counts down to it every quarter second off the wall clock,
 * corrected by the server's own time, so a slow tick never drifts it. The end time is also named in words.
 *
 * IT FOLLOWS THE VISITOR. The offer is kept in localStorage (mkt_offer) until they claim it, say No thanks, or it
 * ends, so a visitor who reads it and opens another page still has it. The entrance plays once, on the first page.
 *
 * OUT OF THE WAY, NOT GONE (Ed's pick, 2026-11-10, "Minimize to a tab"). The X, and Escape, fold the card into a small
 * gold tab at the bottom right with the clock still running, so Start Free Trial is uncovered and the offer is one tap
 * from coming back. The tab follows them page to page. Only No thanks, or the tab's own small x, ends it for good
 * (POST /offers/:code/dismiss). Once they have asked for the link, the X just closes it: the link is in their inbox.
 *
 * WHAT IT NEVER DOES: say it saw the visitor, name a page they read, or show to a signed-in browser.
 * The site is dark only, so there is no light-mode variant. Glass on a solid base, never a backdrop blur, so the
 * button it covers never shows through (Ed: "If the Start Free Trial can be seen through... That's a bad experience").
 */
(function () {
  "use strict";
  if (window.MKOffer) return;
  var KEY = "mkt_offer";
  var M = window.MKT || {};
  var API = M.apiBase || "";
  var st = null, root = null, tab = null, tick = null, receiving = null, tabLift = -1;

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function save(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} }
  function anon() { try { return M.getAnonId ? M.getAnonId() : ""; } catch (e) { return ""; } }
  function track(name, props) { try { if (M.trackEvent) M.trackEvent(name, props || {}); } catch (e) {} }
  function signedIn() { return document.documentElement.classList.contains("mkt-auth"); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function post(path, body) {
    return fetch(API + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
      credentials: "omit", mode: "cors"
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "Something went wrong. Try again in a minute."); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function left() { return st ? st.endsAt - (Date.now() + (st.skew || 0)) : 0; }
  function clock(msLeft) {
    var s = Math.max(0, Math.floor(msLeft / 1000));
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor((s % 3600) / 60)) + ":" + p(s % 60);
  }

  var X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var CLOCK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  function html() {
    var ends = esc(st.endsLabel || "");
    return '<span class="mk-offer__sweep" aria-hidden="true"></span>'
      + '<span class="mk-offer__grab" aria-hidden="true"></span>'
      + '<div class="mk-offer__top"><span class="mk-offer__eyebrow">24-HOUR OFFER</span>'
      + '<button type="button" class="mk-offer__x" data-act="close" aria-label="' + (st.stage === "sent" ? "Close" : "Minimize") + '">' + X + '</button></div>'
      + '<div class="mk-offer__body" data-stage="form"' + (st.stage === "sent" ? " hidden" : "") + '>'
      + '<h2 class="mk-offer__title" id="mkOfferTitle">Journal at Half Price</h2>'
      + '<div class="mk-offer__price"><span class="mk-offer__old">$19.95</span><span class="mk-offer__new">$9.95</span><span class="mk-offer__per">a month</span></div>'
      + '<p class="mk-offer__lead">Every month, for as long as you keep the monthly Journal plan.</p>'
      + '<div class="mk-offer__ends">' + CLOCK + '<span>Ends ' + ends + '</span></div>'
      + '<form class="mk-offer__form" novalidate>'
      + '<label class="mk-offer__label" for="mkOfferEmail">Email address</label>'
      + '<input class="mk-offer__input" id="mkOfferEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" maxlength="200" required>'
      + '<label class="mk-offer__check"><input type="checkbox" id="mkOfferNl"><span>Also send me the newsletter</span></label>'
      + '<p class="mk-offer__err" role="alert" hidden></p>'
      + '<button type="submit" class="mk-offer__cta"><span class="mk-offer__cta-txt">Claim Half Price · <span class="mk-offer__clock">' + clock(left()) + '</span> left</span></button>'
      + '</form>'
      + '<div class="mk-offer__foot"><span>We email your link. Nothing is charged until you start.</span>'
      + '<button type="button" class="mk-offer__no" data-act="no">No thanks</button></div>'
      + '</div>'
      + '<div class="mk-offer__body" data-stage="sent"' + (st.stage === "sent" ? "" : " hidden") + '>'
      + '<h2 class="mk-offer__title">Check Your Inbox</h2>'
      + '<p class="mk-offer__lead mk-offer__lead--quiet">Your half-price link is on its way to <b class="mk-offer__to">' + esc(st.email || "") + '</b>.</p>'
      + '<div class="mk-offer__left"><span class="mk-offer__clock mk-offer__clock--big">' + clock(left()) + '</span><span>left to start at $9.95</span></div>'
      + '<div class="mk-offer__ends">' + CLOCK + '<span>Ends ' + ends + '</span></div>'
      + '<button type="button" class="mk-offer__close" data-act="hide">Close</button>'
      + '</div>';
  }

  // The tab: the offer folded out of the way. Tapping it opens the card again; its small x is No thanks.
  function tabHtml() {
    return '<button type="button" class="mk-offer-tab__open" data-act="open" aria-label="Show the $9.95 Journal offer">'
      + CLOCK + '<span class="mk-offer-tab__name">$9.95 Journal</span>'
      + '<span class="mk-offer-tab__time"><span class="mk-offer__clock">' + clock(left()) + '</span> left</span></button>'
      + '<button type="button" class="mk-offer-tab__x" data-act="no" aria-label="No thanks" title="No thanks">' + X + '</button>';
  }

  function remove() {
    if (tick) { clearInterval(tick); tick = null; }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (tab && tab.parentNode) tab.parentNode.removeChild(tab);
    root = null; tab = null; tabLift = -1;
    document.documentElement.classList.remove("mk-offer-open");
  }

  function renderTab(animate) {
    tab = document.createElement("div");
    tab.className = "mk-offer-tab" + (animate ? " mk-offer-tab--enter" : "");
    tab.setAttribute("role", "region");
    tab.setAttribute("aria-label", "$9.95 Journal offer");
    tab.innerHTML = tabHtml();
    document.body.appendChild(tab);
    tab.addEventListener("click", onClick);
    tick = setInterval(update, 250);
    update();
  }

  // how: "enter" (first time, the full entrance), "back" (reopened from the tab), or nothing (a page load).
  function render(how) {
    remove();
    if (!st || left() <= 0 || signedIn()) { if (st && left() <= 0) save(null); st = null; return; }
    if (st.min) return renderTab(how === "min");
    root = document.createElement("div");
    root.className = "mk-offer" + (how === "enter" ? " mk-offer--enter" : how === "back" ? " mk-offer--back" : "");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "false");
    root.setAttribute("aria-labelledby", "mkOfferTitle");
    root.innerHTML = html();
    document.body.appendChild(root);
    document.documentElement.classList.add("mk-offer-open");
    var nl = root.querySelector("#mkOfferNl");
    // Ticked by default, except in the EU, where a newsletter box must start unticked (Ed's pick).
    if (nl && M.isEuVisitor) M.isEuVisitor().then(function (eu) { nl.checked = !eu; }).catch(function () {});
    else if (nl) nl.checked = true;
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.preventDefault(); close(); } });
    var form = root.querySelector(".mk-offer__form");
    if (form) form.addEventListener("submit", onSubmit);
    tick = setInterval(update, 250);
    update();
  }

  function update() {
    if ((!root && !tab) || !st) return;
    var ms = left();
    if (ms <= 0) { save(null); st = null; remove(); return; }
    var t = clock(ms);
    var els = document.querySelectorAll(".mk-offer__clock");
    for (var i = 0; i < els.length; i++) if (els[i].textContent !== t) els[i].textContent = t;
    // Many pages pin an email bar to the bottom of the screen; the tab sits just above it, never on top of it.
    if (tab) {
      var bar = document.querySelector(".sticky-bar.visible");
      var lift = bar ? bar.offsetHeight : 0;
      if (lift !== tabLift) { tabLift = lift; tab.style.setProperty("--mk-offer-lift", lift + "px"); }
    }
  }

  function onClick(ev) {
    var b = ev.target.closest && ev.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "close") close();
    else if (act === "no") dismiss(tab ? "tab" : "card");
    else if (act === "open") reopen(ev.detail === 0);
    else if (act === "hide") hide();
  }

  // The X or Escape. Before they ask for the link it folds into the tab; after, the link is in their inbox, so it closes.
  function close() {
    if (!st) return remove();
    if (st.stage === "sent") return hide();
    minimize();
  }

  function minimize() {
    st.min = true;
    save(st);
    track("mkt_offer_minimized", {});
    render("min");
    var open = tab && tab.querySelector(".mk-offer-tab__open");
    if (open) open.focus();
  }

  function reopen(byKeyboard) {
    if (!st) return;
    st.min = false;
    save(st);
    track("mkt_offer_reopened", {});
    render("back");
    // A keyboard lands in the email box; a tap does not, so a phone's keyboard never jumps up uninvited.
    var input = byKeyboard && root && root.querySelector("#mkOfferEmail");
    if (input) input.focus();
  }

  function hide() { save(null); st = null; remove(); }

  // No thanks, on the card or the tab's small x: this offer ends for good (Ed can still Send Again from LIVE).
  function dismiss(from) {
    if (!st) return remove();
    var code = st.code;
    track("mkt_offer_dismissed", { from: from || "card" });
    post("/offers/" + encodeURIComponent(code) + "/dismiss", { a: anon() }).catch(function () {});
    hide();
  }

  function showErr(msg) {
    var e = root && root.querySelector(".mk-offer__err");
    if (!e) return;
    e.textContent = msg || "";
    e.hidden = !msg;
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (!st || !root) return;
    var input = root.querySelector("#mkOfferEmail");
    var nl = root.querySelector("#mkOfferNl");
    var btn = root.querySelector(".mk-offer__cta");
    var email = String(input.value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showErr("Enter your full email address, like you@example.com.");
      input.focus();
      return;
    }
    showErr("");
    btn.disabled = true;
    var code = st.code;
    post("/offers/" + encodeURIComponent(code) + "/claim", { a: anon(), email: email, newsletter: !!(nl && nl.checked) })
      .then(function () {
        if (!st || st.code !== code) return;
        st.stage = "sent"; st.email = email;
        save(st);
        track("mkt_offer_claimed", { newsletter: nl && nl.checked ? "yes" : "no" });
        var to = root.querySelector(".mk-offer__to");
        if (to) to.textContent = email;
        root.querySelector('[data-stage="form"]').hidden = true;
        root.querySelector('[data-stage="sent"]').hidden = false;
        var x = root.querySelector(".mk-offer__x");
        if (x) x.setAttribute("aria-label", "Close");
        var close = root.querySelector(".mk-offer__close");
        if (close) close.focus();
      })
      .catch(function (e) {
        btn.disabled = false;
        showErr(e.message);
        // Closed, claimed elsewhere or ended: it cannot be claimed here any more.
        if (e.status === 410) setTimeout(hide, 5000);
      });
  }

  function receive(code) {
    if (!code || signedIn()) return;
    var held = load();
    if (held && held.code === code) return resume();
    // The wait and the beat can both bring the same offer at once; it is shown once.
    if (receiving === code) return;
    receiving = code;
    var go = function () {
      post("/offers/" + encodeURIComponent(code) + "/shown", { a: anon() }).then(function (j) {
        st = { code: code, endsAt: Date.parse(j.endsAt), skew: Date.parse(j.now) - Date.now(), endsLabel: j.endsLabel, stage: "form" };
        save(st);
        track("mkt_offer_shown", {});
        render("enter");
      }).catch(function () { receiving = null; });
    };
    // It is shown on a tab the visitor is looking at, never one in the background.
    if (!document.hidden) return go();
    var onVis = function () { if (!document.hidden) { document.removeEventListener("visibilitychange", onVis); go(); } };
    document.addEventListener("visibilitychange", onVis);
  }

  function resume() {
    var held = load();
    if (!held || !held.code || !held.endsAt) return save(null);
    st = held;
    if (st.stage !== "form" || left() <= 0) {
      // A claimed offer lives in their inbox now, and an ended one is gone: neither follows them to the next page.
      save(null);
      st = null;
      return;
    }
    render();
  }

  // Another tab of the site minimized it, reopened it, or ended it: this tab follows, so the two never disagree.
  window.addEventListener("storage", function (ev) {
    if (ev.key !== KEY) return;
    var s = load();
    if (!s || s.stage !== "form") { if (st && st.stage === "form") { st = null; remove(); } return; }
    if (st && st.code === s.code && !!st.min === !!s.min) return;
    st = s;
    render();
  });

  window.MKOffer = { receive: receive, resume: resume };
})();
