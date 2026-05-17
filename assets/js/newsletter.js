/**
 * Newsletter signup — shared client helper for every marketing page.
 *
 * Replaces the seven divergent inline handlers that previously lived in
 * index.html (handleEmail + handleStickyEmail), system.html, journal.html,
 * edge.html, focus.html, pricing.html, why.html. The pre-existing sticky-bar
 * handlers all did `try { fetch(...) } catch(e){}` — error-swallowing that
 * showed "Subscribed ✓" regardless of whether the backend actually accepted
 * the email. This module fixes that:
 *
 *   - Validates email format BEFORE POSTing (same regex as backend).
 *   - Waits for the backend response and reports failure inline.
 *   - Fires MKT.trackEvent + MKT.identify on success (the old handlers
 *     never identified, so PostHog never linked the anon session to the
 *     email — that's fixed now).
 *
 * Exposes window.MKTNewsletter:
 *
 *   .subscribe(email, source)   → low-level. Returns a Promise<{ok, reason}>.
 *                                 reason ∈ "empty" | "invalid_email" |
 *                                 "server_error" | undefined (on success).
 *
 *   .handleForm(event, source)  → form onsubmit wrapper. Reads input,
 *                                 validates, calls subscribe(), updates
 *                                 DOM (error / success states). Returns
 *                                 false so the form never navigates.
 *
 * Required markup contract per form:
 *
 *   <form onsubmit="return MKTNewsletter.handleForm(event, 'main-form')">
 *     <input type="email" name="email" required>
 *     <button type="submit">Subscribe</button>
 *     <div class="newsletter-error" hidden></div>     ← error slot
 *     <div class="newsletter-success" hidden>...</div> ← success slot
 *   </form>
 *
 * `.invalid` class on the input + `aria-invalid="true"` go on/off based on
 * validity. Typing in an invalid field clears the error state (responsive,
 * not punishing).
 *
 * API base mirrors mkt-analytics.js / checkout.js (strip leading www. so
 * apex + www variants resolve identically — see
 * memory/feedback-strip-www-in-api-host-derivation.md).
 */
(function () {
  "use strict";

  // ── Configuration ─────────────────────────────────────────────────────
  var API_BASE = (function () {
    var h0 = window.location.hostname;
    var h = h0.indexOf("www.") === 0 ? h0.slice(4) : h0;
    if (h === "localhost" || h.indexOf("127.") === 0) return "http://localhost:3000";
    if (h === "maketzo.co") return "https://api.maketzo.co";
    var parts = h.split(".");
    if (parts.length >= 3) return "https://" + parts[0] + "-api." + parts.slice(1).join(".");
    return "https://api." + h;
  })();

  // Same regex backend uses (server.js NEWSLETTER_EMAIL_RE). Rejects junk
  // like "asdf", "a@b", "@x.com", "a@b@c.com" — does NOT try to be RFC5322-
  // perfect (no such thing in practice; even type=email differs by browser).
  // Defense-in-depth: identical rules on both sides.
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var MESSAGES = {
    empty:         "Please enter your email.",
    invalid_email: "Please enter a valid email address.",
    server_error:  "Something went wrong. Please try again."
  };

  // ── Validation ────────────────────────────────────────────────────────
  function validate(rawEmail) {
    var email = (rawEmail || "").trim();
    if (!email) return { ok: false, reason: "empty" };
    if (email.length < 5 || email.length > 200) return { ok: false, reason: "invalid_email" };
    if (!EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };
    return { ok: true, email: email };
  }

  // ── Network ───────────────────────────────────────────────────────────
  function subscribe(email, source) {
    var v = validate(email);
    if (!v.ok) return Promise.resolve(v);

    var payload = {
      email: v.email,
      source_path: (window.location && window.location.pathname) || null
    };
    // Stitch the anon → email identity if MKT is on the page.
    if (window.MKT) {
      try { payload.anon_id    = window.MKT.getAnonId();    } catch (e) {}
      try { payload.session_id = window.MKT.getSessionId(); } catch (e) {}
    }

    return fetch(API_BASE + "/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) return { ok: false, reason: "server_error" };
      // Backend always returns {ok:true} on 200 (anti-enumeration), so a
      // successful POST is success — we trust it.
      if (window.MKT) {
        try { window.MKT.trackEvent("newsletter_subscribe", { source: source || "unknown" }); } catch (e) {}
        try { window.MKT.identify(v.email); } catch (e) {}
      }
      return { ok: true };
    }).catch(function () {
      return { ok: false, reason: "server_error" };
    });
  }

  // ── DOM helpers ───────────────────────────────────────────────────────
  function findErrorSlot(form) {
    return form.querySelector(".newsletter-error");
  }
  function findSuccessSlot(form) {
    return form.querySelector(".newsletter-success") || document.getElementById("emailSuccess");
  }
  function findInput(form) {
    return form.querySelector('input[type="email"]')
        || form.querySelector('input[name="email"]')
        || form.querySelector("input");
  }

  function showError(form, reason) {
    var input = findInput(form);
    var slot  = findErrorSlot(form);
    var msg   = MESSAGES[reason] || MESSAGES.server_error;
    if (input) {
      input.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
    }
    if (slot) {
      slot.textContent = msg;
      slot.removeAttribute("hidden");
      if (input && slot.id) input.setAttribute("aria-describedby", slot.id);
    }
  }

  function clearError(form) {
    var input = findInput(form);
    var slot  = findErrorSlot(form);
    if (input) {
      input.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
    }
    if (slot) {
      slot.setAttribute("hidden", "");
      slot.textContent = "";
    }
  }

  function showSuccess(form) {
    var success = findSuccessSlot(form);
    if (success) {
      // Hide the form chrome; show the success slot.
      form.style.display = "none";
      success.classList.add("show");
      success.removeAttribute("hidden");
    } else {
      // Sticky-bar fallback when no .newsletter-success element exists:
      // swap the input placeholder + auto-dismiss.
      var input = findInput(form);
      if (input) { input.value = ""; input.placeholder = "Subscribed ✓"; }
      if (typeof window.closeStickyBar === "function") {
        setTimeout(window.closeStickyBar, 1500);
      }
    }
  }

  function setSubmitting(form, on) {
    var btn = form.querySelector('button[type="submit"]') || form.querySelector("button");
    if (!btn) return;
    if (on) {
      btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
      btn.innerHTML = "Sending…";
      btn.disabled = true;
    } else {
      if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
      btn.disabled = false;
    }
  }

  // ── Form wrapper ──────────────────────────────────────────────────────
  // Wires validate-on-blur + clear-on-input + submit handler in one call.
  // Returns false from the onsubmit so the page never navigates.
  function handleForm(event, source) {
    if (event && event.preventDefault) event.preventDefault();
    var form  = event.target;
    var input = findInput(form);
    if (!input) return false;

    // Lazy-bind blur + input listeners exactly once per form. Subsequent
    // submits skip this branch (data-newsletter-bound is the flag).
    if (!form.dataset.newsletterBound) {
      form.dataset.newsletterBound = "1";
      input.addEventListener("blur", function () {
        if (!input.value.trim()) return; // don't punish empty after blur
        var v = validate(input.value);
        if (!v.ok) showError(form, v.reason); else clearError(form);
      });
      input.addEventListener("input", function () {
        if (input.classList.contains("invalid")) clearError(form);
      });
    }

    var v = validate(input.value);
    if (!v.ok) { showError(form, v.reason); input.focus(); return false; }
    clearError(form);

    setSubmitting(form, true);
    subscribe(input.value, source).then(function (result) {
      setSubmitting(form, false);
      if (result.ok) showSuccess(form);
      else showError(form, result.reason || "server_error");
    });
    return false;
  }

  // ── Public surface ────────────────────────────────────────────────────
  window.MKTNewsletter = {
    subscribe:  subscribe,
    handleForm: handleForm,
    validate:   validate,
    _apiBase:   API_BASE
  };
})();
