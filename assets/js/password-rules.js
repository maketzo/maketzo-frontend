// password-rules.js: what makes a MAKETZO password acceptable, and the live
// checklist that shows it. ONE FILE, THREE HOMES, byte-identical:
//   maketzo-backend/lib/password-rules.js       enforces it (validatePassword)
//   maketzo-app/lib/password-rules.js           Account > Security checklist
//   maketzo-frontend/assets/js/password-rules.js  signup and reset pages
// maketzo-backend/scripts/test-password-policy.js fails if the copies differ,
// so the rule a trader sees is always the rule the server applies.
//
// Ed, 2026-10-06: "should prompt the user to include special characters and
// numbers and capitalization too. As user types, the requirements will show
// whether they are on track." Plus the breach check, which lives server-side
// in lib/password-policy.js because the password must never leave the server
// in any form but a 5-character hash prefix.
//
// Works as a browser global (window.MaketzoPasswordRules) and as a CommonJS
// module. No dependencies.
//
// analytics-exempt: a shared rule file. The forms that host the checklist
// (Account > Security, signup, reset) carry their own events; a tick turning
// green as someone types is not one.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MaketzoPasswordRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN = 12;
  var MAX = 128;

  // Order is the order the checklist shows. `label` is the checklist line,
  // `error` is what the server says when that one check fails.
  var RULES = [
    { key: 'length', label: 'At least 12 characters', error: 'Password must be at least 12 characters', test: function (p) { return p.length >= MIN; } },
    { key: 'upper',  label: 'An upper-case letter',   error: 'Add an upper-case letter',               test: function (p) { return /[A-Z]/.test(p); } },
    { key: 'lower',  label: 'A lower-case letter',    error: 'Add a lower-case letter',                test: function (p) { return /[a-z]/.test(p); } },
    { key: 'number', label: 'A number',               error: 'Add a number',                           test: function (p) { return /[0-9]/.test(p); } },
    { key: 'symbol', label: 'A symbol, like ! or #',  error: 'Add a symbol, like ! or #',              test: function (p) { return /[^A-Za-z0-9\s]/.test(p); } }
  ];

  function containsEmail(password, email) {
    if (!email) return false;
    var e = String(email).toLowerCase().trim();
    var local = e.split('@')[0];
    var p = password.toLowerCase();
    if (p.indexOf(e) !== -1) return true;
    return local.length >= 4 && p.indexOf(local) !== -1;
  }

  // { length: true, upper: false, ..., notEmail: true, ok: false }
  function check(password, email) {
    var p = typeof password === 'string' ? password : '';
    var out = { ok: true };
    RULES.forEach(function (r) { out[r.key] = r.test(p); if (!out[r.key]) out.ok = false; });
    out.notEmail = !containsEmail(p, email);
    out.tooLong = p.length > MAX;
    if (!out.notEmail || out.tooLong) out.ok = false;
    return out;
  }

  // The first thing wrong, in the words the server answers with, or null.
  function firstError(password, email) {
    if (typeof password !== 'string') return 'Password is required';
    if (password.length > MAX) return 'Password is too long';
    for (var i = 0; i < RULES.length; i++) if (!RULES[i].test(password)) return RULES[i].error;
    if (containsEmail(password, email)) return 'Password cannot contain your email';
    return null;
  }

  // The live checklist. Renders a <ul class="mk-pw-checks"> after `input`,
  // ticks each line as the trader types, and keeps `submit` disabled until
  // every check passes. `email()` is read at check time so a signup form that
  // has the email typed later still catches it. Returns { update, isOk }.
  function attach(input, opts) {
    opts = opts || {};
    if (!input || typeof document === 'undefined') return null;
    var list = document.createElement('ul');
    list.className = 'mk-pw-checks';
    list.setAttribute('aria-live', 'polite');
    list.innerHTML = RULES.map(function (r) {
      return '<li class="mk-pw-check" data-check="' + r.key + '"><span class="mk-pw-check-mark" aria-hidden="true"></span>' + r.label + '</li>';
    }).join('') + '<li class="mk-pw-check mk-pw-check--only-when-failing" data-check="notEmail" hidden><span class="mk-pw-check-mark" aria-hidden="true"></span>Not your email address</li>';
    input.insertAdjacentElement('afterend', list);
    var submit = opts.submit || null;
    var state = check('', opts.email ? opts.email() : '');

    function update() {
      var email = typeof opts.email === 'function' ? opts.email() : '';
      state = check(input.value, email);
      var touched = input.value.length > 0;
      list.classList.toggle('is-touched', touched);
      Array.prototype.forEach.call(list.querySelectorAll('[data-check]'), function (li) {
        var key = li.getAttribute('data-check');
        var pass = !!state[key];
        li.classList.toggle('is-pass', touched && pass);
        li.classList.toggle('is-fail', touched && !pass);
        if (key === 'notEmail') li.hidden = !touched || pass;
      });
      if (submit) submit.disabled = !state.ok;
      return state;
    }

    input.addEventListener('input', update);
    update();
    return { update: update, isOk: function () { return state.ok; } };
  }

  return { MIN: MIN, MAX: MAX, RULES: RULES, check: check, firstError: firstError, attach: attach };
});
