/*
 * Files in the support chat (Ed, 2026-11-17: "Can't attach a file in chat", "I still can't upload anything"). Loaded
 * by support-chat-panel.js only when someone attaches a file, and only where the page allows files (the app; the site
 * never does). maketzo-app keeps a byte-identical copy (scripts/check-support-chat-twin.js).
 *
 * Nothing private leaves the trader's device (Ed: "They are sending PII though"; his pick: hide it and show what is
 * sent). A file is never asked for: "They can choose to upload it themselves".
 *   CSV / TXT  edited in the raw text at each cell, so the delimiter, quoting, encoding (UTF-8, Latin-1, UTF-16 with
 *              its BOM) and line endings stay exactly as the importer saw them. Account, owner, holder, customer,
 *              client, email, phone, address, SSN and tax id columns become stand-ins (the same value always gets the
 *              same one: Account A, Account B, so the import still tells accounts apart); a line above the header that
 *              names an account or a person is hidden; anywhere else, a cell holding an email, a phone number, an SSN, a
 *              card number or an "Account:" line is hidden. Prices, times and order ids are kept.
 *   Pictures   redrawn on a canvas as JPEG (no hidden payload survives a redraw), with any black-out box the trader
 *              drags painted into the pixels, so what is under it is gone.
 *   Excel      not yet: the trader is told to save it as CSV (the next step reads it in the browser).
 *
 * window.MKChatFiles = { prepare(file) -> Promise<item>, maskCsv(bytes) } ; module.exports the same for tests.
 */
(function (root) {
  'use strict';

  var MAX_BYTES = 5 * 1024 * 1024;
  var MAX_SIDE = 2000;   // a picture's longest side after the redraw

  // ── CSV ────────────────────────────────────────────────────────────────────────────────────────────────────────
  // The columns we hide, by what their header says. Account Type, Currency and the like stay (they say nothing about
  // who); a bare "Name" stays too, because brokers use it for the security.
  var COLS = [
    // "Account Name" is a person's name (the next rule), so it never shares the account letters.
    { as: 'Account', re: /\b(account|acct|acc)\b/, keep: /\b(type|currency|class|kind|name)\b/ },
    { as: 'Name', re: /\b(owner|holder|customer|client|first name|last name|full name|account name)\b/ },
    { as: 'Email', re: /\be ?mail\b/ },
    { as: 'Phone', re: /\b(phone|mobile|cell|telephone)\b/ },
    { as: 'Address', re: /\b(address|street|postal|zip)\b/, keep: /\bip\b/ },
    { as: 'Tax ID', re: /\b(ssn|social security|tax ?id|tin|ein)\b/ }
  ];
  var TRADE_WORD = /\b(symbol|ticker|sym|qty|quantity|shares|price|side|action|b\/s|buy\/sell|time|date|exec|fill|filled)\b/;
  var PRE_PRIVATE = /account|acct|name|owner|holder|client|customer|@|\d{5,}|ssn|tax|phone|address/i;
  var EMAIL = /[^\s@,;"']+@[^\s@,;"']+\.[a-z]{2,}/i;
  var SSN = /\b\d{3}-\d{2}-\d{4}\b/;
  var PHONE = /(\(\d{3}\)\s?\d{3}[-.\s]\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b|\+\d{1,3}[\s-]\d{3}[\s-]\d{3}[\s-]\d{4})/;
  var CARD = /\b(?:\d{4}[ -]){3}\d{4}\b/;
  var ACCT_LINE = /\baccount\s*(?:no\.?|number|#|id)?\s*[:#]\s*\S/i;
  var ID_HEAD = /\b(id|order|exec|ref|reference|no|number|seq|#)\b/;

  function luhn(d) {
    var s = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) { var n = d.charCodeAt(i) - 48; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; }
    return s % 10 === 0;
  }
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9#/]+/g, ' ').trim(); }
  function letters(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  // The file as code units: bytes for UTF-8 and single-byte files (every delimiter, quote and line break is one ASCII
  // byte, and no byte of a multi-byte character is below 0x80), 16-bit units for UTF-16. Edits happen in units.
  function unitsOf(u8) {
    if (u8.length >= 2 && ((u8[0] === 0xFF && u8[1] === 0xFE) || (u8[0] === 0xFE && u8[1] === 0xFF))) {
      var le = u8[0] === 0xFF, n = (u8.length - 2) >> 1, u = new Uint16Array(n);
      for (var i = 0; i < n; i++) u[i] = le ? u8[2 + 2 * i] | (u8[3 + 2 * i] << 8) : (u8[2 + 2 * i] << 8) | u8[3 + 2 * i];
      return { enc: le ? 'utf16le' : 'utf16be', u: u, start: 0 };
    }
    var bom = u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF;
    return { enc: 'bytes', u: u8, start: bom ? 3 : 0 };
  }
  function textOf(u, s, e) { var out = ''; for (var i = s; i < e; i++) out += String.fromCharCode(u[i]); return out; }
  // Readable text for the preview (UTF-8 when it is, else Windows-1252).
  function displayOf(src, s, e) {
    if (src.enc !== 'bytes') return textOf(src.u, s, e);
    var sub = src.u.subarray(s, e);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(sub); } catch (x) {
      try { return new TextDecoder('windows-1252').decode(sub); } catch (y) { return textOf(src.u, s, e); }
    }
  }

  // Rows of cells; a cell is { s, e } over its content (inside the quotes when quoted).
  function parse(u, start, delim) {
    var rows = [], row = [], i = start, n = u.length;
    while (i <= n) {
      if (i === n) { if (row.length) rows.push(row); break; }
      var c, cs, ce;
      if (u[i] === 34) {
        cs = i + 1; i++;
        while (i < n) { if (u[i] === 34) { if (u[i + 1] === 34) { i += 2; continue; } break; } i++; }
        ce = i; i++;
        while (i < n && u[i] !== delim && u[i] !== 10 && u[i] !== 13) i++;
      } else {
        cs = i;
        while (i < n && u[i] !== delim && u[i] !== 10 && u[i] !== 13) i++;
        ce = i;
      }
      row.push({ s: cs, e: ce });
      if (i >= n) { rows.push(row); break; }
      c = u[i];
      if (c === delim) { i++; if (i === n) { row.push({ s: i, e: i }); rows.push(row); break; } continue; }
      rows.push(row); row = [];
      i += (c === 13 && u[i + 1] === 10) ? 2 : 1;
      if (i === n) break;
    }
    return rows;
  }
  function pickDelim(u, start) {
    var counts = { 44: 0, 9: 0, 59: 0 }, lines = 0, q = false;
    for (var i = start; i < u.length && lines < 30; i++) {
      var c = u[i];
      if (c === 34) q = !q;
      else if (!q && (c === 44 || c === 9 || c === 59)) counts[c]++;
      else if (!q && c === 10) lines++;
    }
    var best = 44;
    [9, 59].forEach(function (d) { if (counts[d] > counts[best]) best = d; });
    return best;
  }

  /**
   * Hide what is private in a CSV or text export, in place. bytes: ArrayBuffer or Uint8Array.
   * Returns { bytes (Uint8Array), cols: [{ i, name, as }], lines, cells, header, sample: [[{ t, hid }]], delim }.
   */
  function maskCsv(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var src = unitsOf(u8), u = src.u;
    var delim = pickDelim(u, src.start);
    var rows = parse(u, src.start, delim);
    var cell = function (c) { return textOf(u, c.s, c.e); };
    // The header: the first row of the first 30 with two or more cells and a trading word; else the first row.
    var h = -1;
    for (var r = 0; r < Math.min(rows.length, 30) && h < 0; r++) {
      var filled = rows[r].filter(function (c) { return c.e > c.s; });
      if (filled.length >= 2 && rows[r].some(function (c) { return TRADE_WORD.test(norm(cell(c))); })) h = r;
    }
    if (h < 0) h = rows.length ? 0 : -1;
    var cols = [];
    if (h >= 0) rows[h].forEach(function (c, i) {
      var name = norm(cell(c));
      for (var k = 0; k < COLS.length; k++) {
        if (COLS[k].re.test(name) && !(COLS[k].keep && COLS[k].keep.test(name))) { cols.push({ i: i, name: displayOf(src, c.s, c.e).trim().slice(0, 40), as: COLS[k].as }); break; }
      }
    });
    var byCol = {}; cols.forEach(function (c) { byCol[c.i] = c; });
    var idCol = {};
    if (h >= 0) rows[h].forEach(function (c, i) { if (ID_HEAD.test(norm(cell(c)))) idCol[i] = true; });
    // Each edit: a cell's range and what goes there instead.
    var edits = [], seen = {}, next = {}, lines = 0, cells = 0, hid = {};
    function standIn(as, value) {
      var key = as + '|' + value.trim();
      if (!seen[key]) { next[as] = (next[as] || 0); seen[key] = as + ' ' + letters(next[as]++); }
      return seen[key];
    }
    rows.forEach(function (row, r) {
      if (r === h) return;
      if (r < h) {
        // Above the header: a line that names an account or a person goes, cell by cell, keeping its shape.
        if (row.some(function (c) { return PRE_PRIVATE.test(cell(c)); })) {
          lines++;
          row.forEach(function (c, i) { if (c.e > c.s) { edits.push({ s: c.s, e: c.e, t: 'Hidden' }); hid[r + ':' + i] = 1; } });
        }
        return;
      }
      row.forEach(function (c, i) {
        if (c.e <= c.s) return;
        var t = cell(c);
        if (byCol[i]) {
          if (!t.trim()) return;
          edits.push({ s: c.s, e: c.e, t: standIn(byCol[i].as, t) }); hid[r + ':' + i] = 1;
          return;
        }
        var digits = t.replace(/\D/g, '');
        var card = CARD.test(t) || (!idCol[i] && /^[\d -]{15,23}$/.test(t.trim()) && digits.length >= 15 && digits.length <= 16 && luhn(digits));
        if (EMAIL.test(t) || SSN.test(t) || PHONE.test(t) || card || ACCT_LINE.test(t)) {
          cells++;
          edits.push({ s: c.s, e: c.e, t: 'Hidden' }); hid[r + ':' + i] = 1;
        }
      });
    });
    // Write: every unit outside an edit is copied as it was.
    edits.sort(function (a, b) { return a.s - b.s; });
    var out = [], at = 0;
    function put(from, to) { for (var i = from; i < to; i++) out.push(u[i]); }
    edits.forEach(function (ed) { put(at, ed.s); for (var j = 0; j < ed.t.length; j++) out.push(ed.t.charCodeAt(j)); at = ed.e; });
    put(at, u.length);
    var result;
    if (src.enc === 'bytes') result = new Uint8Array(out);
    else {
      result = new Uint8Array(2 + out.length * 2);
      var le = src.enc === 'utf16le';
      result[0] = le ? 0xFF : 0xFE; result[1] = le ? 0xFE : 0xFF;
      for (var k = 0; k < out.length; k++) { result[2 + 2 * k] = le ? out[k] & 255 : out[k] >> 8; result[3 + 2 * k] = le ? out[k] >> 8 : out[k] & 255; }
    }
    // The preview: the header and the first rows under it, as sent (the chat card shows 5, the bigger view up to 200).
    var sample = [], header = [];
    if (h >= 0) {
      var shown = function (r, c, i) { return { t: hid[r + ':' + i] ? (edits.filter(function (ed) { return ed.s === c.s; })[0] || {}).t : displayOf(src, c.s, c.e), hid: !!hid[r + ':' + i] }; };
      header = rows[h].map(function (c, i) { return { t: displayOf(src, c.s, c.e), hid: !!byCol[i] }; });
      for (var rr = h + 1; rr < rows.length && sample.length < 200; rr++) {
        if (!rows[rr].some(function (c) { return c.e > c.s; })) continue;
        sample.push(rows[rr].map(function (c, i) { return shown(rr, c, i); }));
      }
    }
    return { bytes: result, cols: cols, lines: lines, cells: cells, header: header, sample: sample, rows: Math.max(0, rows.length - h - 1),
      delim: delim === 9 ? 'tab' : delim === 59 ? 'semicolon' : 'comma', enc: src.enc };
  }

  // ── Pictures ───────────────────────────────────────────────────────────────────────────────────────────────────
  function loadImage(file) {
    return new Promise(function (ok, fail) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok(img); };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error('picture')); };
      img.src = url;
    });
  }
  // A picture item: draw(canvas) paints the picture and the boxes; boxes are fractions of the picture, so they land
  // in the same place however big the canvas on screen is.
  function imageItem(file, img) {
    var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    var item = { kind: 'image', name: String(file.name || 'picture').replace(/\.[^.]+$/, '') + '.jpg', w: w, h: h, boxes: [] };
    item.draw = function (cv) {
      cv.width = w; cv.height = h;
      var g = cv.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      g.fillStyle = '#000000';
      item.boxes.forEach(function (b) { g.fillRect(Math.round(b.x * w), Math.round(b.y * h), Math.round(b.w * w), Math.round(b.h * h)); });
    };
    item.blob = function () {
      var cv = document.createElement('canvas');
      item.draw(cv);
      return new Promise(function (ok, fail) { cv.toBlob(function (b) { b ? ok(b) : fail(new Error('picture')); }, 'image/jpeg', 0.88); });
    };
    item.meta = function () { return { boxes: item.boxes.length, w: w, h: h }; };
    return item;
  }

  /**
   * One attached file, ready to show and send. Rejects with { code } for what cannot go:
   * 'big' (over 5 MB), 'excel', 'picture' (could not be opened, e.g. HEIC outside Safari), 'type'.
   */
  function prepare(file) {
    var name = String(file.name || 'file');
    var ext = (name.match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
    var fail = function (code) { var e = new Error(code); e.code = code; e.fileName = name; return Promise.reject(e); };
    if (file.size > MAX_BYTES) return fail('big');
    if (ext === 'xls' || ext === 'xlsx' || ext === 'xlsm') return fail('excel');
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv' || /^text\//.test(file.type || '')) {
      return file.arrayBuffer().then(function (buf) {
        var m = maskCsv(buf);
        var safeName = name.replace(/[^A-Za-z0-9 ._()-]/g, '_').slice(0, 120);
        var blob = new Blob([m.bytes], { type: 'text/plain' });
        return { kind: 'csv', name: safeName, masked: m, blob: function () { return Promise.resolve(blob); },
          meta: function () { return { cols: m.cols.map(function (c) { return { i: c.i, name: c.name, as: c.as }; }), lines: m.lines, cells: m.cells, rows: m.rows, delim: m.delim, enc: m.enc }; } };
      });
    }
    if (/^image\//.test(file.type || '') || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'heic' || ext === 'heif' || ext === 'webp') {
      return loadImage(file).then(function (img) { return imageItem(file, img); }, function () { return fail('picture'); });
    }
    return fail('type');
  }

  var api = { prepare: prepare, maskCsv: maskCsv, MAX_BYTES: MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MKChatFiles = api;
})(typeof window !== 'undefined' ? window : null);
