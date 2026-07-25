// assets/js/trade-replay-kiosk.js — PUBLIC kiosk version of Trade Replay.
//
// Self-contained: no auth, no app globals, touches no shared marketing JS. It PORTS
// the tested pure compute() engine from the in-app tool (maketzo-app/lib/trade-replay.js
// is the source of truth for the math) and wraps a standalone in-page UI, a free-replay
// meter + signup gate, and guarded PostHog events (window.MKT.trackEvent). Vanilla, no deps.
//
// Free model: FREE_REPLAYS replays, a replay = one New Replay cycle. A replay is consumed
// when its first valid fill is entered. The trader gets to finish their last free replay;
// the gate appears when they come back for another (New Replay, or a fresh page load once
// the allotment is spent). Client-side by design — a conversion nudge, not access control.
(function(){
  'use strict';

  var LS_KEY = 'maketzo_replay_kiosk';
  var FREE_REPLAYS = 10;             // free replays before the signup gate (one constant, tunable)
  var DEFAULT_PER_SHARE = 0.004;     // commission + ECN estimate (no Settings to pull from publicly)
  var DEFAULT_ADD_PCT = 20;

  function r2(n){ return Math.round(n * 100) / 100; }
  function sgn(n){ return n > 0 ? 1 : (n < 0 ? -1 : 0); }
  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  function track(name, props){ try { if (window.MKT && window.MKT.trackEvent) window.MKT.trackEvent(name, props || {}); } catch(e){} }

  // ── Pure engine — ported verbatim from the in-app tool ──────────────────────────
  // fills = [{ buy, sell, shares }] in order. opts = { commissionPerShare }.
  function compute(fills, opts){
    fills = Array.isArray(fills) ? fills : [];
    var perShare = num(opts && opts.commissionPerShare);
    if (!(perShare >= 0)) perShare = 0;

    var pos = 0, avgCost = 0, cumNet = 0, cumGross = 0, tradeIdx = 0, cur = null, xfer = 0, sharesBought = 0, sharesSold = 0;
    var rows = [], trades = [], series = { avgCost: [], equity: [] };

    function newTrade(direction){
      tradeIdx++;
      cur = { index: tradeIdx, direction: direction, realized: 0, commission: 0,
              peakCapital: 0, maxSize: 0, adds: 0, trims: 0, fills: 0,
              closed: false, openShares: 0, avgCost: 0 };
      trades.push(cur);
      return cur;
    }
    function trackPeak(){
      if (!cur) return;
      var cap = Math.abs(pos) * avgCost;
      if (cap > cur.peakCapital) cur.peakCapital = cap;
      if (Math.abs(pos) > cur.maxSize) cur.maxSize = Math.abs(pos);
    }

    for (var i = 0; i < fills.length; i++){
      var f = fills[i] || {};
      var buy = num(f.buy), sell = num(f.sell), shares = num(f.shares);
      var haveBuy = buy > 0, haveSell = sell > 0;
      var row = { seq: i, side: '', action: '', price: 0, shares: shares,
                  posBefore: pos, posAfter: pos, avgCostAfter: avgCost,
                  realizedThisFill: 0, commissionThisFill: 0,
                  tradeIndex: (cur && !cur.closed) ? cur.index : null,
                  capped: false, cappedTo: 0, invalid: false, blank: false };

      if (buy <= 0 && sell <= 0 && shares <= 0){ row.blank = true; rows.push(row); continue; }
      if ((haveBuy === haveSell) || !(shares > 0)){ row.invalid = true; rows.push(row); continue; }

      var side = haveBuy ? 'BUY' : 'SELL';
      var price = haveBuy ? buy : sell;
      var delta = haveBuy ? shares : -shares;
      row.side = side; row.price = price;

      if (pos === 0){
        newTrade(haveBuy ? 'long' : 'short');
        pos = delta; avgCost = price;
        row.action = haveBuy ? 'OPEN_LONG' : 'OPEN_SHORT';
        cur.fills++;
        var f0 = r2(shares * perShare);
        cur.commission = r2(cur.commission + f0); cumNet = r2(cumNet - f0);
        row.commissionThisFill = f0; row.tradeIndex = cur.index;
      } else if (sgn(delta) === sgn(pos)){
        var absPos = Math.abs(pos), newQty = absPos + shares;
        avgCost = (absPos * avgCost + shares * price) / newQty;
        pos += delta;
        row.action = 'ADD'; cur.adds++; cur.fills++;
        var fa = r2(shares * perShare);
        cur.commission = r2(cur.commission + fa); cumNet = r2(cumNet - fa);
        row.commissionThisFill = fa; row.tradeIndex = cur.index;
      } else {
        var held = Math.abs(pos), closeQty = Math.min(shares, held);
        if (shares > held){ row.capped = true; row.cappedTo = held; }
        var realized = pos > 0 ? r2((price - avgCost) * closeQty)
                               : r2((avgCost - price) * closeQty);
        cur.realized = r2(cur.realized + realized); cur.fills++;
        pos = pos + sgn(delta) * closeQty;
        var fc = r2(closeQty * perShare);
        cur.commission = r2(cur.commission + fc);
        cumGross = r2(cumGross + realized);
        cumNet = r2(cumNet + realized - fc);
        row.realizedThisFill = realized; row.commissionThisFill = fc;
        row.tradeIndex = cur.index;
        if (pos === 0){ row.action = 'CLOSE'; cur.closed = true; avgCost = 0; }
        else { row.action = 'TRIM'; cur.trims++; }
      }

      var _tx = row.capped ? row.cappedTo : shares;
      if (row.side === 'BUY') sharesBought += _tx; else sharesSold += _tx;

      trackPeak();
      row.posAfter = pos; row.avgCostAfter = avgCost;
      rows.push(row);
      xfer++;
      series.avgCost.push({ n: xfer, price: price, avgCost: avgCost, side: side, pos: pos });
      series.equity.push({ n: xfer, cumNet: r2(cumNet), cumGross: r2(cumGross) });
    }

    if (cur && !cur.closed){ cur.openShares = Math.abs(pos); cur.avgCost = avgCost; }

    var wins = 0, losses = 0, grossRealized = 0, totalCommission = 0, peakCapital = 0, maxSizeAcross = 0, closedCount = 0;
    for (var j = 0; j < trades.length; j++){
      var tr = trades[j];
      tr.netRealized = r2(tr.realized - tr.commission);
      tr.returnPct = tr.peakCapital > 0 ? r2(tr.netRealized / tr.peakCapital * 100) : 0;
      grossRealized = r2(grossRealized + tr.realized);
      totalCommission = r2(totalCommission + tr.commission);
      if (tr.peakCapital > peakCapital) peakCapital = tr.peakCapital;
      if (tr.maxSize > maxSizeAcross) maxSizeAcross = tr.maxSize;
      if (tr.closed){ closedCount++; if (tr.netRealized > 0) wins++; else if (tr.netRealized < 0) losses++; }
    }
    var netRealized = r2(grossRealized - totalCommission);
    var session = {
      grossRealized: grossRealized, totalCommission: totalCommission, netRealized: netRealized,
      tradeCount: trades.length, closedCount: closedCount, wins: wins, losses: losses,
      peakCapital: peakCapital, maxSize: maxSizeAcross,
      returnPct: peakCapital > 0 ? r2(netRealized / peakCapital * 100) : 0,
      openShares: (cur && !cur.closed) ? Math.abs(pos) : 0,
      openAvgCost: (cur && !cur.closed) ? avgCost : 0,
      openDirection: (cur && !cur.closed) ? cur.direction : null,
      sharesBought: sharesBought, sharesSold: sharesSold,
      perShare: perShare, transacted: xfer
    };
    return { rows: rows, trades: trades, session: session, series: series };
  }

  // ── formatting (self-contained; losses render as minus, NEVER accounting parens) ──
  function money(v){
    var n = (typeof v === 'number' && isFinite(v)) ? v : 0;
    var neg = n < 0;
    var s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '−$' : '$') + s;   // U+2212 minus, not a hyphen
  }
  function pctStr(v){ return (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v).toFixed(1) + '%'; }
  function intStr(n){ try { return Math.abs(n).toLocaleString('en-US'); } catch(e){ return String(Math.abs(n)); } }
  function signedShares(n){ if (!n) return '0'; return (n < 0 ? '−' : '') + intStr(n); }
  function parseField(v){ var s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); if (s === '' || s === '-' || s === '.') return ''; var n = parseFloat(s); return isFinite(n) ? n : ''; }
  function esc(t){ return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function actionLabel(row){
    switch (row.action){
      case 'OPEN_LONG':  return 'Open';
      case 'OPEN_SHORT': return 'Short';
      case 'ADD':        return 'Add';
      case 'TRIM':       return row.side === 'BUY' ? 'Cover' : 'Trim';
      case 'CLOSE':      return 'Close';
      default:           return '';
    }
  }

  // ── Big labeled charts for the enlarge view ─────────────────────────────────────
  function niceTicks(min, max, count){
    if (min === max){ min -= 1; max += 1; }
    var out = [], step = (max - min) / (count - 1);
    for (var i = 0; i < count; i++) out.push(min + step * i);
    return out;
  }
  function bigAvgChart(pts){
    if (!pts || !pts.length) return '';
    var W = 640, H = 320, padL = 64, padR = 18, padT = 16, padB = 32;
    var vals = pts.map(function(p){ return p.price; }).concat(pts.map(function(p){ return p.avgCost; }));
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    if (mn === mx){ mn -= 0.5; mx += 0.5; }
    var gap = (mx - mn) * 0.08; mn -= gap; mx += gap;
    var pW = W - padL - padR, pH = H - padT - padB;
    var X = function(n){ return pts.length <= 1 ? padL + pW / 2 : padL + (n - 1) / (pts.length - 1) * pW; };
    var Y = function(v){ return padT + (1 - (v - mn) / (mx - mn)) * pH; };
    var s = '', ticks = niceTicks(mn, mx, 5);
    for (var i = 0; i < ticks.length; i++){
      var ty = Y(ticks[i]);
      s += '<line x1="' + padL + '" y1="' + ty.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + ty.toFixed(1) + '" stroke="#d3d8e1" stroke-width="1"/>';
      s += '<text x="' + (padL - 8) + '" y="' + (ty + 3.6).toFixed(1) + '" text-anchor="end" font-size="11" fill="#6f7787" font-family="ui-monospace,monospace">' + esc(money(ticks[i])) + '</text>';
    }
    var line = '';
    for (var j = 0; j < pts.length; j++){ line += (j ? ' L' : 'M') + X(pts[j].n).toFixed(1) + ' ' + Y(pts[j].avgCost).toFixed(1); }
    s += '<path d="' + line + '" fill="none" stroke="#b8860b" stroke-width="2.2" stroke-linejoin="round"/>';
    for (var k = 0; k < pts.length; k++){
      var col = pts[k].side === 'BUY' ? '#128a3e' : '#c62f26';
      s += '<circle cx="' + X(pts[k].n).toFixed(1) + '" cy="' + Y(pts[k].price).toFixed(1) + '" r="4" fill="' + col + '"/>';
    }
    s += '<text x="' + (padL + pW / 2).toFixed(0) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="#6f7787" font-family="ui-monospace,monospace">Your fills, left to right in order</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;height:auto">' + s + '</svg>';
  }
  function bigPnlChart(pts, showNet){
    if (!pts || !pts.length) return '';
    var W = 640, H = 320, padL = 74, padR = 18, padT = 16, padB = 32;
    var vals = pts.map(function(p){ return showNet === false ? p.cumGross : p.cumNet; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    mn = Math.min(mn, 0); mx = Math.max(mx, 0);
    if (mn === mx){ mn -= 1; mx += 1; }
    var gap = (mx - mn) * 0.08; mn -= gap; mx += gap;
    var pW = W - padL - padR, pH = H - padT - padB;
    var X = function(n){ return pts.length <= 1 ? padL + pW / 2 : padL + (n - 1) / (pts.length - 1) * pW; };
    var Y = function(v){ return padT + (1 - (v - mn) / (mx - mn)) * pH; };
    var s = '', ticks = niceTicks(mn, mx, 5);
    for (var i = 0; i < ticks.length; i++){
      var ty = Y(ticks[i]);
      s += '<line x1="' + padL + '" y1="' + ty.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + ty.toFixed(1) + '" stroke="#d3d8e1" stroke-width="1"/>';
      s += '<text x="' + (padL - 8) + '" y="' + (ty + 3.6).toFixed(1) + '" text-anchor="end" font-size="11" fill="#6f7787" font-family="ui-monospace,monospace">' + esc(money(ticks[i])) + '</text>';
    }
    var zy = Y(0);
    s += '<line x1="' + padL + '" y1="' + zy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + zy.toFixed(1) + '" stroke="#8a92a0" stroke-width="1.5"/>';
    var last = vals[vals.length - 1], col = last > 0 ? '#128a3e' : (last < 0 ? '#c62f26' : '#8a92a0');
    var line = '';
    for (var j = 0; j < pts.length; j++){ line += (j ? ' L' : 'M') + X(pts[j].n).toFixed(1) + ' ' + Y(vals[j]).toFixed(1); }
    var x0 = X(pts[0].n), xN = X(pts[pts.length - 1].n);
    var area = 'M' + x0.toFixed(1) + ' ' + zy.toFixed(1) + ' ' + line.replace(/^M/, 'L') + ' L' + xN.toFixed(1) + ' ' + zy.toFixed(1) + ' Z';
    s += '<path d="' + area + '" fill="' + col + '" fill-opacity="0.12"/>';
    s += '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linejoin="round"/>';
    s += '<text x="' + (padL + pW / 2).toFixed(0) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="#6f7787" font-family="ui-monospace,monospace">Your fills, left to right in order</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;height:auto">' + s + '</svg>';
  }
  var CHART_EXPLAIN = {
    avg: 'Every dot is one fill, placed left to right in the order you made it, at the price you got. Green is a buy, red is a sell. The gold line is your average cost: it moves only when you buy, sliding toward each new buy price, and holds flat when you sell. The gap between a red sell dot and the gold line at that point is your profit per share on that exit. Watching the gold line climb as you add higher is the real cost of averaging up, since every add raises the price the trade has to beat just to break even.',
    pnl: 'This is your realized profit adding up fill by fill across the whole session. It changes only when you sell; a buy just builds the position. It starts at zero on the left. Above the zero line is money made, below it is money given back. The last point on the right is your session result, the same number shown at the top.'
  };

  // ── UI ──────────────────────────────────────────────────────────────────────────
  function init(){
    var tool = document.getElementById('mkrTool');
    if (!tool) return;

    var tbody    = document.getElementById('mkrRows');
    var emptyEl  = document.getElementById('mkrEmpty');
    var netEl    = document.getElementById('mkrNet');
    var netLabel = document.getElementById('mkrNetLabel');
    var retEl    = document.getElementById('mkrReturn');
    var tradesEl = document.getElementById('mkrTrades');
    var wlEl     = document.getElementById('mkrWL');
    var feeEl    = document.getElementById('mkrFeeNote');
    var feeInput = document.getElementById('mkrFee');
    var sumEl    = document.getElementById('mkrTradeList');
    var avgSvg   = document.getElementById('mkrAvgChart');
    var eqSvg    = document.getElementById('mkrEqChart');
    var vizWrap  = document.getElementById('mkrViz');
    var addPct   = document.getElementById('mkrAddPct');
    var addSize  = document.getElementById('mkrAddSize');
    var btnClear = document.getElementById('mkrClear');
    var footRow  = document.getElementById('mkrFoot');
    var footShares = document.getElementById('mkrFootShares');
    var footPos  = document.getElementById('mkrFootPos');
    var footAvg  = document.getElementById('mkrFootAvg');
    var footFees = document.getElementById('mkrFootFees');
    var footPl   = document.getElementById('mkrFootPl');
    var tgls     = tool.querySelectorAll('.mkr-tgl');
    var avgRange = document.getElementById('mkrAvgRange');
    var eqRange  = document.getElementById('mkrEqRange');
    var avgCard  = document.getElementById('mkrAvgCard');
    var eqCard   = document.getElementById('mkrEqCard');
    var eqLabel  = eqCard ? eqCard.querySelector('.mkr-chartlabel') : null;
    var cModal   = document.getElementById('mkrChartModal');
    var cTitle   = document.getElementById('mkrCmTitle');
    var cChart   = document.getElementById('mkrCmChart');
    var cLegend  = document.getElementById('mkrCmLegend');
    var cExplain = document.getElementById('mkrCmExplain');
    var cClose   = document.getElementById('mkrCmClose');
    var meterEl  = document.getElementById('mkrMeter');
    var gateEl   = document.getElementById('mkrGate');
    var gateCta  = document.getElementById('mkrGateCta');

    var st = load();
    var fills = st.fills;
    var mode = st.mode;
    var used = st.used;              // replays the trader has COMPLETED (ticks up on New Replay)
    var perShare = st.fee;
    ensureTrailingBlank();
    var rowEls = [], lastRes = null;

    if (feeInput) feeInput.value = perShare;

    function readLS(){ try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch(e){ return {}; } }
    function load(){
      var o = readLS();
      var f = (o && Array.isArray(o.fills)) ? o.fills.map(function(x){ return { buy: x.buy, sell: x.sell, shares: x.shares }; }) : [];
      var fee = num(o.fee); if (!(fee >= 0) || o.fee == null) fee = DEFAULT_PER_SHARE;
      return { fills: f, mode: o.mode === 'gross' ? 'gross' : 'net',
               used: Math.max(0, num(o.used) | 0), fee: fee };
    }
    function save(){
      try {
        var keep = fills.filter(function(f){ return f.buy !== '' || f.sell !== '' || f.shares !== ''; });
        localStorage.setItem(LS_KEY, JSON.stringify({ fills: keep, mode: mode, used: used, fee: perShare }));
      } catch(e){}
    }
    function isBlank(f){ return f.buy === '' && f.sell === '' && f.shares === ''; }
    function hasAnyFill(){ for (var i = 0; i < fills.length; i++){ if (!isBlank(fills[i])) return true; } return false; }
    function ensureTrailingBlank(){
      if (!fills.length || !isBlank(fills[fills.length - 1])) fills.push({ buy: '', sell: '', shares: '' });
    }

    // ── free-replay meter + gate ──
    function remaining(){ return Math.max(0, FREE_REPLAYS - used); }
    function renderMeter(){
      if (!meterEl) return;
      var left = remaining();
      var cls = 'mkr-meter' + (left <= 2 ? ' is-low' : '') + (left <= 0 ? ' is-out' : '');
      meterEl.className = cls;
      if (left <= 0)      meterEl.innerHTML = '<strong>No free replays left</strong>';
      else if (left === 1) meterEl.innerHTML = '<strong>Last free replay</strong>';
      else                 meterEl.innerHTML = '<strong>' + left + '</strong> free replays left';
    }
    function showGate(){
      if (!gateEl) return;
      gateEl.hidden = false;
      tool.classList.add('is-gated');
      track('replay_kiosk_gate', { used: used });
    }
    function makeInput(cls, aria){
      var inp = document.createElement('input');
      inp.type = 'text'; inp.className = cls; inp.placeholder = '';
      inp.setAttribute('inputmode', 'decimal'); inp.autocomplete = 'off';
      inp.setAttribute('autocorrect', 'off'); inp.spellcheck = false;
      if (aria) inp.setAttribute('aria-label', aria);
      return inp;
    }
    // Wrap a money input with a fixed left "$" the trader never types.
    function moneyWrap(inp){
      var w = document.createElement('span'); w.className = 'mkr-inwrap';
      var s = document.createElement('span'); s.className = 'mkr-insign'; s.setAttribute('aria-hidden', 'true'); s.textContent = '$';
      w.appendChild(s); w.appendChild(inp);
      return w;
    }

    function buildRow(i){
      var tr = document.createElement('tr');
      tr.className = 'mkr-row';
      var f = fills[i];

      var cNum = document.createElement('td'); cNum.className = 'mkr-c mkr-c--num';
      var cBuy = document.createElement('td'); cBuy.className = 'mkr-c mkr-c--in';
      var cSell = document.createElement('td'); cSell.className = 'mkr-c mkr-c--in';
      var cSh = document.createElement('td'); cSh.className = 'mkr-c mkr-c--in';
      var cAct = document.createElement('td'); cAct.className = 'mkr-c mkr-c--act';
      var cPos = document.createElement('td'); cPos.className = 'mkr-c mkr-c--n';
      var cAvg = document.createElement('td'); cAvg.className = 'mkr-c mkr-c--n';
      var cFee = document.createElement('td'); cFee.className = 'mkr-c mkr-c--n mkr-c--fee';
      var cPl = document.createElement('td'); cPl.className = 'mkr-c mkr-c--n mkr-c--pl';
      var cDel = document.createElement('td'); cDel.className = 'mkr-c mkr-c--del';

      var inBuy = makeInput('mkr-input mkr-input--buy', 'Buy price');
      var inSell = makeInput('mkr-input mkr-input--sell', 'Sell price');
      var inSh = makeInput('mkr-input mkr-input--sh', 'Shares');
      // Money fields render with two decimals (Ed: "3 reads as $3.00"); Shares is a plain count.
      inBuy.value = (f.buy === '' ? '' : Number(f.buy).toFixed(2));
      inSell.value = (f.sell === '' ? '' : Number(f.sell).toFixed(2));
      inSh.value = (f.shares === '' ? '' : f.shares);
      cBuy.appendChild(moneyWrap(inBuy)); cSell.appendChild(moneyWrap(inSell)); cSh.appendChild(inSh);

      var del = document.createElement('button');
      del.type = 'button'; del.className = 'mkr-del'; del.setAttribute('aria-label', 'Delete fill'); del.textContent = '×';
      cDel.appendChild(del);

      tr.appendChild(cNum); tr.appendChild(cBuy); tr.appendChild(cSell); tr.appendChild(cSh);
      tr.appendChild(cAct); tr.appendChild(cPos); tr.appendChild(cAvg); tr.appendChild(cFee); tr.appendChild(cPl); tr.appendChild(cDel);

      var refs = { tr: tr, num: cNum, act: cAct, pos: cPos, avg: cAvg, fee: cFee, pl: cPl,
                   buy: inBuy, sell: inSell, sh: inSh, del: del };

      inBuy.addEventListener('input', function(){
        fills[i].buy = parseField(inBuy.value);
        if (fills[i].buy !== '' && inSell.value !== ''){ inSell.value = ''; fills[i].sell = ''; }
        onEdit();
      });
      inSell.addEventListener('input', function(){
        fills[i].sell = parseField(inSell.value);
        if (fills[i].sell !== '' && inBuy.value !== ''){ inBuy.value = ''; fills[i].buy = ''; }
        onEdit();
      });
      inSh.addEventListener('input', function(){ fills[i].shares = parseField(inSh.value); onEdit(); });
      // On blur, snap the money field to two decimals so the ledger reads as accounting.
      inBuy.addEventListener('blur', function(){ var v = parseField(inBuy.value); inBuy.value = (v === '' ? '' : Number(v).toFixed(2)); });
      inSell.addEventListener('blur', function(){ var v = parseField(inSell.value); inSell.value = (v === '' ? '' : Number(v).toFixed(2)); });
      del.addEventListener('click', function(){ removeRow(refs); });

      return refs;
    }

    function renderRows(){
      tbody.innerHTML = ''; rowEls = [];
      for (var i = 0; i < fills.length; i++){
        var refs = buildRow(i); rowEls.push(refs); tbody.appendChild(refs.tr);
      }
    }
    function onEdit(){
      if (!isBlank(fills[fills.length - 1])){
        fills.push({ buy: '', sell: '', shares: '' });
        var refs = buildRow(fills.length - 1); rowEls.push(refs); tbody.appendChild(refs.tr);
      }
      save(); syncDerived(); refreshScaleInState();   // a new fill can open/close a position,
                                                      // so re-check the scale-in enabled state
                                                      // every edit (was stuck stale-disabled)
    }
    function removeRow(refs){
      var idx = rowEls.indexOf(refs);
      if (idx < 0) return;
      if (idx === fills.length - 1 && isBlank(fills[idx])) return;
      fills.splice(idx, 1); ensureTrailingBlank();
      renderRows(); save(); syncDerived(); refreshScaleInState();
    }

    function setDerivedCell(refs, row, tradeStart){
      refs.tr.classList.toggle('is-trade-start', !!tradeStart);
      refs.tr.classList.toggle('is-invalid', !!row.invalid);
      refs.tr.classList.toggle('is-blank', !!row.blank);
      refs.num.textContent = (row.blank || row.invalid) ? '' : String(row.seqNo || '');
      if (row.blank){ refs.act.textContent = ''; refs.pos.textContent = ''; refs.avg.textContent = ''; refs.fee.textContent = ''; refs.pl.textContent = ''; refs.pl.className = 'mkr-c mkr-c--n mkr-c--pl'; return; }
      if (row.invalid){ refs.act.textContent = 'check entry'; refs.pos.textContent = ''; refs.avg.textContent = ''; refs.fee.textContent = ''; refs.pl.textContent = ''; refs.pl.className = 'mkr-c mkr-c--n mkr-c--pl'; return; }
      var lbl = actionLabel(row);
      if (row.capped) lbl += ' · capped to ' + intStr(row.cappedTo);
      refs.act.textContent = lbl;
      refs.pos.textContent = row.posAfter === 0 ? 'flat' : signedShares(row.posAfter);
      refs.pos.classList.toggle('is-short', row.posAfter < 0);
      refs.avg.textContent = row.posAfter === 0 ? '—' : money(row.avgCostAfter);
      // Fees: every fill costs a commission (buys and sells alike), shown as a minus cost.
      refs.fee.textContent = row.commissionThisFill > 0 ? money(-row.commissionThisFill) : '—';
      // P/L is realized on exits only, and follows the Gross/Net toggle: in Net mode each
      // exit nets its OWN fee (net-per-exit); entry fees show in the Fees column + the total.
      var booked = (row.action === 'TRIM' || row.action === 'CLOSE');
      var pl = booked ? ((mode !== 'gross') ? r2(row.realizedThisFill - row.commissionThisFill) : row.realizedThisFill) : 0;
      refs.pl.textContent = booked ? money(pl) : '—';
      refs.pl.className = 'mkr-c mkr-c--n mkr-c--pl' + (booked ? (pl > 0 ? ' is-up' : (pl < 0 ? ' is-down' : '')) : '');
    }

    function syncDerived(){
      var res = compute(fills.map(function(f){ return { buy: f.buy, sell: f.sell, shares: f.shares }; }), { commissionPerShare: perShare });
      var rows = res.rows, s = res.session;

      var seqN = 0;
      for (var k = 0; k < rows.length; k++){
        var rr = rows[k];
        if (rr.blank || rr.invalid){ rr.seqNo = ''; continue; }
        seqN++; rr.seqNo = seqN;
      }
      var prevTrade = null;
      for (var i = 0; i < rowEls.length && i < rows.length; i++){
        var row = rows[i];
        var start = (!row.blank && !row.invalid && row.tradeIndex && row.tradeIndex !== prevTrade);
        setDerivedCell(rowEls[i], row, start);
        if (!row.blank && !row.invalid && row.tradeIndex) prevTrade = row.tradeIndex;
      }

      var hasData = s.transacted > 0;
      if (emptyEl) emptyEl.hidden = hasData;
      if (vizWrap) vizWrap.hidden = !hasData;

      var showNet = (mode !== 'gross');
      var headline = showNet ? s.netRealized : s.grossRealized;
      var ret = !hasData ? 0 : (showNet ? s.returnPct : (s.peakCapital > 0 ? r2(s.grossRealized / s.peakCapital * 100) : 0));
      if (netLabel) netLabel.textContent = showNet ? 'NET RESULT' : 'GROSS RESULT';
      if (netEl){ netEl.textContent = money(headline); netEl.className = 'mkr-net' + (headline > 0 ? ' is-up' : (headline < 0 ? ' is-down' : '')); }
      if (retEl) retEl.textContent = hasData ? pctStr(ret) : '';
      if (tradesEl) tradesEl.textContent = String(s.closedCount) + (s.openShares ? ' + 1 open' : '');
      if (wlEl) wlEl.textContent = s.wins + 'W  ' + s.losses + 'L';
      if (feeEl){
        if (s.totalCommission > 0) feeEl.textContent = 'Estimated fees: ' + money(s.totalCommission) + ' total at $' + (+s.perShare.toFixed(4)) + '/share (commission + ECN). Adjust the rate if yours differ.';
        else feeEl.textContent = 'Net subtracts an estimated $' + (+perShare.toFixed(4)) + '/share (commission + ECN). Adjust the rate if yours differ.';
      }

      if (footRow){
        footRow.hidden = !hasData;
        if (hasData){
          if (footShares) footShares.textContent = intStr(s.sharesBought);
          if (footPos) footPos.textContent = s.openShares ? signedShares(s.openDirection === 'short' ? -s.openShares : s.openShares) : 'flat';
          if (footAvg) footAvg.textContent = s.openShares ? money(s.openAvgCost) : '—';
          if (footFees) footFees.textContent = s.totalCommission > 0 ? money(-s.totalCommission) : '—';
          if (footPl){ footPl.textContent = money(headline); footPl.className = 'mkr-fc mkr-fc--pl' + (headline > 0 ? ' is-up' : (headline < 0 ? ' is-down' : '')); }
        }
      }

      renderTradeList(res.trades, showNet);
      if (eqLabel) eqLabel.textContent = 'RUNNING ' + (showNet ? 'NET' : 'GROSS') + ' P&L';
      if (hasData){ renderAvgChart(res.series.avgCost); renderEquity(res.series.equity, showNet); }
      lastRes = res;
    }

    function renderTradeList(trades, showNet){
      if (!sumEl) return;
      var body = '';
      for (var i = 0; i < trades.length; i++){
        var t = trades[i];
        var dir = t.direction === 'short' ? 'Short' : 'Long';
        if (t.closed){
          var val = showNet ? t.netRealized : t.realized;
          var pct = showNet ? t.returnPct : (t.peakCapital > 0 ? r2(t.realized / t.peakCapital * 100) : 0);
          var cls = val > 0 ? 'is-up' : (val < 0 ? 'is-down' : '');
          body += '<tr>' +
            '<td class="mkr-ts-trade">Trade ' + t.index + '</td>' +
            '<td class="mkr-ts-dir">' + dir + '</td>' +
            '<td class="mkr-ts-size">' + intStr(t.maxSize) + ' sh</td>' +
            '<td class="mkr-ts-pl ' + cls + '">' + money(val) + '</td>' +
            '<td class="mkr-ts-pct ' + cls + '">' + pctStr(pct) + '</td>' +
          '</tr>';
        } else if (t.openShares){
          body += '<tr class="is-open">' +
            '<td class="mkr-ts-trade">Trade ' + t.index + '</td>' +
            '<td class="mkr-ts-dir">' + dir + '</td>' +
            '<td class="mkr-ts-size">' + intStr(t.openShares) + ' sh</td>' +
            '<td class="mkr-ts-open" colspan="2">still open at ' + money(t.avgCost) + '</td>' +
          '</tr>';
        }
      }
      sumEl.innerHTML = body ? '<table class="mkr-tsum"><tbody>' + body + '</tbody></table>' : '';
    }

    function scale(vals, lo, hi, pad){
      var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
      if (lo != null) mn = Math.min(mn, lo);
      if (hi != null) mx = Math.max(mx, hi);
      if (mn === mx){ mn -= 1; mx += 1; }
      var span = mx - mn;
      return function(v){ return pad + (1 - (v - mn) / span) * (100 - 2 * pad); };
    }
    function xat(n, count, pad){ if (count <= 1) return 50; return pad + (n - 1) / (count - 1) * (100 - 2 * pad); }

    function renderAvgChart(pts){
      if (!avgSvg) return;
      if (!pts.length){ avgSvg.innerHTML = ''; return; }
      var count = pts.length, padX = 4, padY = 10;
      var prices = pts.map(function(p){ return p.price; }).concat(pts.map(function(p){ return p.avgCost; }));
      var y = scale(prices, null, null, padY);
      var line = '', dots = '';
      for (var i = 0; i < pts.length; i++){
        var px = xat(pts[i].n, count, padX), py = y(pts[i].avgCost);
        line += (i ? ' L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
        var dy = y(pts[i].price), col = pts[i].side === 'BUY' ? '#128a3e' : '#c62f26';
        dots += '<circle cx="' + px.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="2.1" fill="' + col + '"/>';
      }
      avgSvg.innerHTML = '<path d="' + line + '" fill="none" stroke="#b8860b" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' + dots;
      if (avgRange){ var pmn = Math.min.apply(null, prices), pmx = Math.max.apply(null, prices); avgRange.textContent = money(pmn) + ' to ' + money(pmx); }
    }
    function renderEquity(pts, showNet){
      if (!eqSvg) return;
      if (!pts.length){ eqSvg.innerHTML = ''; return; }
      var count = pts.length, padX = 4, padY = 8;
      var vals = pts.map(function(p){ return showNet ? p.cumNet : p.cumGross; });
      var y = scale(vals, 0, 0, padY);
      var zeroY = y(0);
      var last = vals[vals.length - 1];
      var col = last > 0 ? '#128a3e' : (last < 0 ? '#c62f26' : '#8a92a0');
      var line = '';
      for (var i = 0; i < pts.length; i++){
        var px = xat(pts[i].n, count, padX), py = y(vals[i]);
        line += (i ? ' L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
      }
      var x0 = xat(pts[0].n, count, padX), xN = xat(pts[count - 1].n, count, padX);
      var area = 'M' + x0.toFixed(1) + ' ' + zeroY.toFixed(1) + ' ' + line.replace(/^M/, 'L') + ' L' + xN.toFixed(1) + ' ' + zeroY.toFixed(1) + ' Z';
      eqSvg.innerHTML =
        '<line x1="' + x0.toFixed(1) + '" y1="' + zeroY.toFixed(1) + '" x2="' + xN.toFixed(1) + '" y2="' + zeroY.toFixed(1) + '" stroke="#a9b1bd" stroke-width="0.8" vector-effect="non-scaling-stroke"/>' +
        '<path d="' + area + '" fill="' + col + '" fill-opacity="0.12"/>' +
        '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
      if (eqRange){ var vmn = Math.min.apply(null, vals.concat([0])), vmx = Math.max.apply(null, vals.concat([0])); eqRange.textContent = money(vmn) + ' to ' + money(vmx); }
    }

    // scale-in helper
    function currentPosSize(){
      var res = compute(fills.map(function(f){ return { buy: f.buy, sell: f.sell, shares: f.shares }; }), { commissionPerShare: 0 });
      return Math.abs(res.session.openShares);
    }
    function doScaleIn(){
      var held = currentPosSize();
      if (!held) return;
      var pct = parseField(addPct && addPct.value);
      if (pct === '' || pct <= 0) pct = DEFAULT_ADD_PCT;
      var add = Math.round(held * pct / 100);
      if (!add) return;
      var last = rowEls[rowEls.length - 1];
      if (!last) return;
      fills[fills.length - 1].shares = add;
      last.sh.value = add;
      onEdit();
      try { last.buy.focus(); } catch(e){}
    }
    function refreshScaleInState(){
      if (!addSize) return;
      var held = currentPosSize();
      addSize.disabled = !held;
      addSize.classList.toggle('is-off', !held);
    }
    if (addSize) addSize.addEventListener('click', doScaleIn);

    // fee input
    if (feeInput) feeInput.addEventListener('input', function(){
      var v = parseField(feeInput.value);
      perShare = (v === '' || v < 0) ? 0 : v;
      save(); syncDerived();
    });

    // gross / net toggle
    function syncModeButtons(){ for (var i = 0; i < tgls.length; i++){ tgls[i].classList.toggle('is-active', tgls[i].getAttribute('data-mode') === mode); } }
    function setMode(m){ mode = (m === 'gross') ? 'gross' : 'net'; syncModeButtons(); save(); syncDerived(); }
    for (var mi = 0; mi < tgls.length; mi++){ (function(b){ b.addEventListener('click', function(){ setMode(b.getAttribute('data-mode')); }); })(tgls[mi]); }

    // New Replay — completing a filled replay ticks the meter; the one after the last gates.
    if (btnClear) btnClear.addEventListener('click', function(){
      if (used >= FREE_REPLAYS){ showGate(); return; }
      if (hasAnyFill()){ used++; save(); track('replay_kiosk_consumed', { count: used }); }
      if (used >= FREE_REPLAYS){ renderMeter(); showGate(); return; }
      fills = []; ensureTrailingBlank();
      save(); renderRows(); syncDerived(); refreshScaleInState(); renderMeter();
      var first = rowEls[0]; if (first) try { first.buy.focus(); } catch(e){}
    });

    // chart enlarge modal
    function openChartModal(which){
      if (!cModal || !lastRes) return;
      var series = lastRes.series || { avgCost: [], equity: [] };
      if (which === 'pnl'){
        var showNet = (mode !== 'gross');
        if (cTitle)   cTitle.textContent = 'Running P&L (' + (showNet ? 'Net' : 'Gross') + ')';
        if (cChart)   cChart.innerHTML = bigPnlChart(series.equity, showNet);
        if (cLegend)  cLegend.innerHTML = '<span class="mkr-leg"><i class="mkr-linekey mkr-linekey--pnl"></i>Realized P&amp;L ' + (showNet ? 'after fees' : 'before fees') + '</span>';
        if (cExplain) cExplain.textContent = CHART_EXPLAIN.pnl;
      } else {
        if (cTitle)   cTitle.textContent = 'Fills & Average Cost';
        if (cChart)   cChart.innerHTML = bigAvgChart(series.avgCost);
        if (cLegend)  cLegend.innerHTML = '<span class="mkr-leg"><i class="mkr-dot mkr-dot--buy"></i>Buy</span><span class="mkr-leg"><i class="mkr-dot mkr-dot--sell"></i>Sell</span><span class="mkr-leg"><i class="mkr-linekey"></i>Avg cost</span>';
        if (cExplain) cExplain.textContent = CHART_EXPLAIN.avg;
      }
      cModal.hidden = false;
    }
    function closeChartModal(){ if (cModal) cModal.hidden = true; }
    function bindCard(card, which){
      if (!card) return;
      card.addEventListener('click', function(){ openChartModal(which); });
      card.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openChartModal(which); } });
    }
    bindCard(avgCard, 'avg'); bindCard(eqCard, 'pnl');
    if (cClose) cClose.addEventListener('click', closeChartModal);
    if (cModal) cModal.addEventListener('click', function(e){ if (e.target === cModal) closeChartModal(); });
    document.addEventListener('keydown', function(e){ if ((e.key === 'Escape' || e.key === 'Esc') && cModal && !cModal.hidden) closeChartModal(); });

    if (gateCta) gateCta.addEventListener('click', function(){ track('replay_kiosk_cta', { used: used }); });

    // boot
    renderRows(); syncModeButtons(); syncDerived(); refreshScaleInState(); renderMeter();
    track('replay_kiosk_open', { used: used });
    // Already completed the free allotment on a previous visit → gate on arrival.
    if (used >= FREE_REPLAYS) showGate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
