/* Ghost Screener v1 — static, client-side only. No keys, no wallets, no payments. */
(function () {
  'use strict';

  var CFG = {
    FEATURED: 'G95bm7QTxj5EeTiZWjDUM4WHjHoQ9XQWTCtQokqv5R8g',
    FEATURED_POOL: '4NdDn1tFTvNj6mEN2Vrf2DtbLmajSEWzrS4wsC1Yv5Gp',
    REFRESH_MS: 60000,
    GT: 'https://api.geckoterminal.com/api/v2',
    DS: 'https://api.dexscreener.com',
    TRENDING_PAGES: 1
  };

  // ---------- helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) {
    try { var x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; } catch (e) { return ''; }
  }
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  var isMint = function (s) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || ''); };
  var SUB = '₀₁₂₃₄₅₆₇₈₉';
  function fmtPrice(p) {
    if (p == null) return '—';
    if (p === 0) return '$0';
    if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1) return '$' + p.toFixed(p >= 100 ? 2 : 3);
    if (p >= 0.001) return '$' + p.toPrecision(4).replace(/0+$/, '');
    var s = p.toFixed(20).split('.')[1];
    var z = s.match(/^0*/)[0].length;
    var digits = s.slice(z, z + 4).replace(/0+$/, '') || '0';
    var zs = String(z).split('').map(function (d) { return SUB[+d]; }).join('');
    return '$0.0' + zs + digits;
  }
  function fmtUsd(n) {
    if (n == null) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }
  function fmtPct(n) {
    if (n == null) return '<span class="mut">—</span>';
    var c = n > 0 ? 'up' : n < 0 ? 'dn' : 'mut';
    var t = Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(Math.abs(n) >= 100 ? 0 : 1);
    return '<span class="' + c + '">' + (n > 0 ? '+' : '') + t + '%</span>';
  }
  function fmtAge(ms) {
    if (!ms) return '—';
    var m = (Date.now() - ms) / 60000;
    if (m < 0) return '—';
    if (m < 60) return Math.max(1, Math.floor(m)) + 'm';
    var h = m / 60; if (h < 48) return Math.floor(h) + 'h';
    var d = h / 24; if (d < 60) return Math.floor(d) + 'd';
    var mo = d / 30.44; if (mo < 24) return Math.floor(mo) + 'mo';
    return Math.floor(d / 365) + 'y';
  }
  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-5) : ''; }
  function timeStr(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function isPump(addr, dex) { return /pump$/.test(addr || '') || /pump/i.test(dex || '') || addr === CFG.FEATURED; }
  function initials(s) { return esc((s || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?'); }
  function iconHtml(src, sym) {
    var u = safeUrl(src);
    if (!u || /missing/.test(u)) return '<span class="ini">' + initials(sym) + '</span>';
    return '<img src="' + esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer" data-ini="' + initials(sym) + '">';
  }
  // swap broken icons for initials
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.dataset && t.dataset.ini) {
      var s = document.createElement('span'); s.className = 'ini'; s.textContent = t.dataset.ini; t.replaceWith(s);
    }
  }, true);

  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); setTimeout(function () { t.classList.remove('on'); }, 1600); }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast('Address copied ✓'); });
    else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Address copied ✓'); } catch (e) {} ta.remove(); }
  }

  function getJSON(url) {
    var ctl = new AbortController(); var to = setTimeout(function () { ctl.abort(); }, 15000);
    return fetch(url, { signal: ctl.signal, cache: 'no-store', headers: { Accept: 'application/json' } }).then(function (r) {
      clearTimeout(to);
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }, function (e) { clearTimeout(to); throw e; });
  }

  var lastGood = null;
  function setOffline(on) {
    document.body.classList.toggle('is-offline', on);
    var o = $('offline');
    if (on) { o.textContent = (navigator.onLine ? 'Can\u2019t reach the price APIs right now \u2014 prices are NOT live.' : 'You\u2019re offline \u2014 prices are NOT live.') + (lastGood ? ' Figures shown are from ' + timeStr(lastGood) + '.' : '') + ' They\u2019ll refresh when you reconnect.'; o.hidden = false; }
    else o.hidden = true;
  }
  function setLive(ok, txt) {
    var l = $('live'); l.className = 'live ' + (ok ? 'ok' : 'err'); $('liveTxt').textContent = txt;
    if (ok) { lastGood = new Date(); setOffline(false); }
    else { if (!navigator.onLine) $('liveTxt').textContent = 'offline'; setOffline(true); }
  }

  // ---------- normalizers ----------
  function fromGtPools(json) {
    var inc = {};
    (json.included || []).forEach(function (x) { inc[x.id] = x; });
    var seen = {}, out = [];
    (json.data || []).forEach(function (p) {
      var a = p.attributes || {}, rel = p.relationships || {};
      var bt = inc[rel.base_token && rel.base_token.data && rel.base_token.data.id];
      var ta = (bt && bt.attributes) || {};
      var addr = ta.address || ((rel.base_token && rel.base_token.data && rel.base_token.data.id) || '').replace(/^solana_/, '');
      if (!addr || seen[addr]) return; seen[addr] = 1;
      var pc = a.price_change_percentage || {}, mcap = num(a.market_cap_usd), fdv = num(a.fdv_usd);
      var dex = rel.dex && rel.dex.data && rel.dex.data.id;
      var nm = (a.name || '').split(' / ');
      out.push({
        addr: addr, name: ta.name || nm[0] || '?', sym: ta.symbol || nm[0] || '?', quote: nm[1] || '',
        icon: ta.image_url, price: num(a.base_token_price_usd),
        m5: num(pc.m5), h1: num(pc.h1), h6: num(pc.h6), h24: num(pc.h24),
        vol: num(a.volume_usd && a.volume_usd.h24), liq: num(a.reserve_in_usd),
        mcap: mcap != null ? mcap : fdv, isFdv: mcap == null && fdv != null, fdv: fdv,
        created: a.pool_created_at ? Date.parse(a.pool_created_at) : null,
        dex: dex, pool: a.address, src: 'gt',
        txb: a.transactions && a.transactions.h24 && a.transactions.h24.buys,
        txs: a.transactions && a.transactions.h24 && a.transactions.h24.sells
      });
    });
    return out;
  }
  function fromDsPair(p, extra) {
    extra = extra || {};
    var pc = p.priceChange || {}, v = p.volume || {}, tx = (p.txns && p.txns.h24) || {};
    var mcap = num(p.marketCap), fdv = num(p.fdv);
    return {
      addr: p.baseToken.address, name: p.baseToken.name, sym: p.baseToken.symbol, quote: p.quoteToken && p.quoteToken.symbol,
      icon: extra.icon || (p.info && p.info.imageUrl), price: num(p.priceUsd),
      m5: num(pc.m5), h1: num(pc.h1), h6: num(pc.h6), h24: num(pc.h24), vol: num(v.h24),
      liq: num(p.liquidity && p.liquidity.usd), mcap: mcap != null ? mcap : fdv, isFdv: mcap == null && fdv != null, fdv: fdv,
      created: p.pairCreatedAt || null, dex: p.dexId, pool: p.pairAddress, src: 'ds', dsUrl: p.url,
      txb: tx.buys, txs: tx.sells, info: p.info
    };
  }
  function bestPair(pairs, addr) {
    var c = (pairs || []).filter(function (p) { return p.chainId === 'solana' && p.baseToken && p.baseToken.address === addr; });
    if (!c.length) c = pairs || [];
    c.sort(function (a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0) || ((b.volume && b.volume.h24) || 0) - ((a.volume && a.volume.h24) || 0); });
    return c[0];
  }

  // ---------- loaders ----------
  function loadTrending() {
    var pages = [];
    for (var i = 1; i <= CFG.TRENDING_PAGES; i++) pages.push(i);
    return pages.reduce(function (pr, pg) {
      return pr.then(function (acc) {
        return getJSON(CFG.GT + '/networks/solana/trending_pools?include=base_token,dex&page=' + pg)
          .then(function (j) { return acc.concat(fromGtPools(j)); }, function (e) { if (!acc.length) throw e; return acc; });
      });
    }, Promise.resolve([])).then(function (rows) {
      var seen = {}; return rows.filter(function (r) { if (seen[r.addr]) return false; seen[r.addr] = 1; return true; });
    });
  }
  function loadFresh() {
    return getJSON(CFG.DS + '/token-profiles/latest/v1').then(function (profiles) {
      var sol = [], icons = {}, seen = {};
      (profiles || []).forEach(function (p) {
        if (p.chainId === 'solana' && isMint(p.tokenAddress) && !seen[p.tokenAddress] && sol.length < 30) {
          seen[p.tokenAddress] = 1; sol.push(p.tokenAddress); icons[p.tokenAddress] = p.icon;
        }
      });
      if (!sol.length) return [];
      return getJSON(CFG.DS + '/tokens/v1/solana/' + sol.join(',')).then(function (pairs) {
        var by = {};
        (pairs || []).forEach(function (p) { var a = p.baseToken && p.baseToken.address; (by[a] = by[a] || []).push(p); });
        return sol.filter(function (a) { return by[a]; }).map(function (a) { return fromDsPair(bestPair(by[a], a), { icon: icons[a] }); });
      });
    });
  }
  function searchRemote(q) {
    return getJSON(CFG.GT + '/search/pools?network=solana&include=base_token,dex&query=' + encodeURIComponent(q)).then(fromGtPools);
  }

  // ---------- table ----------
  var state = { tab: 'trending', rows: [], sort: { k: 'rank', asc: true }, filter: '', last: null, searchQ: '' };
  var SRC_LABEL = {
    trending: 'Source: GeckoTerminal · Solana trending pools',
    fresh: 'Source: DexScreener API · latest token profiles (Solana) + pair data',
    search: 'Source: GeckoTerminal · pool search'
  };

  function linksHtml(r) {
    var h = '';
    if (r.src === 'gt' && r.pool) h += '<a href="https://www.geckoterminal.com/solana/pools/' + esc(r.pool) + '" target="_blank" rel="noopener">GeckoTerminal ↗</a>';
    if (r.src === 'ds') h += '<a href="' + esc(safeUrl(r.dsUrl) || ('https://dexscreener.com/solana/' + r.pool)) + '" target="_blank" rel="noopener">DexScreener ↗</a>';
    if (isPump(r.addr, r.dex)) h += '<a href="https://pump.fun/coin/' + esc(r.addr) + '" target="_blank" rel="noopener">pump.fun ↗</a>';
    return h;
  }
  function renderRows() {
    var f = state.filter.toLowerCase();
    var rows = state.rows.filter(function (r) {
      return !f || (r.name || '').toLowerCase().indexOf(f) >= 0 || (r.sym || '').toLowerCase().indexOf(f) >= 0 || (r.addr || '').toLowerCase() === f;
    });
    var k = state.sort.k, asc = state.sort.asc;
    rows.sort(function (a, b) {
      var x, y;
      if (k === 'name') { x = (a.sym || '').toLowerCase(); y = (b.sym || '').toLowerCase(); return asc ? x.localeCompare(y) : y.localeCompare(x); }
      if (k === 'age') { x = a.created; y = b.created; } else { x = a[k]; y = b[k]; }
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      if (k === 'age') return asc ? y - x : x - y; // asc = youngest first
      return asc ? x - y : y - x;
    });
    document.querySelectorAll('#tbl th[data-k]').forEach(function (th) {
      th.classList.toggle('sorted', th.dataset.k === k); th.classList.toggle('asc', th.dataset.k === k && asc);
    });
    var tb = $('rows');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="11" class="loading">' + (state.rows.length ? 'No matches. Press Enter to search all Solana pools.' : 'No data yet.') + '</td></tr>'; return; }
    tb.innerHTML = rows.map(function (r) {
      return '<tr data-a="' + esc(r.addr) + '"' + (r.addr === CFG.FEATURED ? ' class="me"' : '') + '>' +
        '<td class="num rank hm">' + r.rank + '</td>' +
        '<td class="tl"><div class="tok">' + iconHtml(r.icon, r.sym) + '<div class="nm"><b>' + esc(r.sym) + '</b>' + (r.quote ? '<span class="mut q">/' + esc(r.quote) + '</span>' : '') + '<small>' + esc(r.name) + '</small></div></div></td>' +
        '<td class="num">' + fmtPrice(r.price) + '</td>' +
        '<td class="num hm">' + fmtPct(r.m5) + '</td>' +
        '<td class="num hm">' + fmtPct(r.h1) + '</td>' +
        '<td class="num">' + fmtPct(r.h24) + '</td>' +
        '<td class="num hm">' + fmtUsd(r.vol) + '</td>' +
        '<td class="num hm">' + fmtUsd(r.liq) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap) + (r.isFdv ? '<span class="tag">fdv</span>' : '') + '</td>' +
        '<td class="num hm">' + fmtAge(r.created) + '</td>' +
        '<td class="tl lk hm">' + linksHtml(r) + '</td></tr>';
    }).join('');
  }
  function loadList(silent) {
    var tab = state.tab;
    if (!silent) $('rows').innerHTML = '<tr><td colspan="11" class="loading">Summoning live data…</td></tr>';
    var p = tab === 'trending' ? loadTrending() : tab === 'fresh' ? loadFresh() : searchRemote(state.searchQ);
    return p.then(function (rows) {
      if (state.tab !== tab) return;
      rows.forEach(function (r, i) { r.rank = i + 1; });
      state.rows = rows; state.last = new Date();
      $('listSrc').textContent = SRC_LABEL[tab] + (tab === 'search' ? ' · “' + state.searchQ + '”' : '');
      $('upd').textContent = 'Updated ' + timeStr(state.last) + (tab === 'search' ? '' : ' · auto-refresh 60s');
      setLive(true, 'live · ' + timeStr(state.last));
      renderRows();
    }).catch(function (e) {
      setLive(false, e.status === 429 ? 'rate limited' : 'API error');
      if (!state.rows.length || !silent) $('rows').innerHTML = '<tr><td colspan="11" class="loading">Couldn’t load data (' + esc(e.message || 'network') + '). Retrying on next refresh.</td></tr>';
    });
  }

  // ---------- featured ----------
  function setTxt(id, v) { $(id).innerHTML = v; }
  function loadFeatured() {
    var M = CFG.FEATURED;
    return Promise.allSettled([
      getJSON(CFG.DS + '/tokens/v1/solana/' + M),
      getJSON(CFG.GT + '/networks/solana/tokens/' + M + '?include=top_pools')
    ]).then(function (res) {
      var ds = res[0].status === 'fulfilled' ? bestPair(res[0].value, M) : null;
      var gt = res[1].status === 'fulfilled' ? res[1].value : null;
      var gtTok = gt && gt.data && gt.data.attributes;
      var gtPool = gt && gt.included && gt.included[0] ? fromGtPools({ data: [gt.included[0]], included: [] })[0] : null;
      var d = ds ? fromDsPair(ds) : gtPool;
      if (!d) { $('featSrc').textContent = 'Live data unavailable right now'; setLive(false, 'API error'); return; }
      setTxt('fPrice', fmtPrice(d.price));
      setTxt('fChg', fmtPct(d.h24));
      setTxt('fMcap', fmtUsd(d.mcap) + (d.isFdv ? ' <span class="tag">fdv</span>' : ''));
      setTxt('fVol', fmtUsd(d.vol));
      setTxt('fH1', fmtPct(d.h1));
      setTxt('fTx', (d.txb != null ? d.txb + ' / ' + d.txs : '—'));
      if (d.liq != null) { $('fLiqLbl').textContent = 'Liquidity'; setTxt('fLiq', fmtUsd(d.liq)); }
      else if (gtPool && gtPool.liq != null) { $('fLiqLbl').textContent = 'Reserve (curve)'; setTxt('fLiq', fmtUsd(gtPool.liq)); }
      else setTxt('fLiq', '—');
      var lp = gtTok && gtTok.launchpad_details;
      if (lp && lp.completed) setTxt('fCurve', '<span class="up">graduated</span>');
      else if (lp && lp.graduation_percentage != null) setTxt('fCurve', Number(lp.graduation_percentage).toFixed(1) + '%');
      else setTxt('fCurve', '—');
      var srcs = [ds ? 'DexScreener API' : null, gt ? 'GeckoTerminal' : null].filter(Boolean).join(' + ');
      $('featSrc').textContent = 'Live · ' + srcs + ' · ' + timeStr(new Date());
      var pool = (gtPool && gtPool.pool) || (d && d.pool) || CFG.FEATURED_POOL;
      if (!$('featFrame').querySelector('iframe')) mountChart($('featFrame'), 'gt', pool, M, '$GHOSTDEV chart');
      if (!state.last) setLive(true, 'live · ' + timeStr(new Date()));
    });
  }

  function chartUrl(kind, pool, addr) {
    if (kind === 'ds') return 'https://dexscreener.com/solana/' + encodeURIComponent(pool || addr) + '?embed=1&theme=dark&info=0&trades=0';
    return 'https://www.geckoterminal.com/solana/pools/' + encodeURIComponent(pool) + '?embed=1&info=0&swaps=0&light_chart=0';
  }
  function mountChart(el, kind, pool, addr, title) {
    el.innerHTML = '<iframe loading="lazy" title="' + esc(title) + ' (' + (kind === 'ds' ? 'DexScreener' : 'GeckoTerminal') + ' widget)" src="' + esc(chartUrl(kind, pool, addr)) + '" allow="clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  }

  // ---------- token detail ----------
  var detailAddr = null;
  function loadDetail(addr, first) {
    var body = $('dBody');
    if (!isMint(addr)) { body.innerHTML = '<div class="panel warn">That doesn’t look like a Solana token address.</div>'; return Promise.resolve(); }
    if (first) body.innerHTML = '<div class="loading">Loading token…</div>';
    return Promise.allSettled([
      getJSON(CFG.GT + '/networks/solana/tokens/' + addr + '?include=top_pools'),
      getJSON(CFG.DS + '/tokens/v1/solana/' + addr)
    ]).then(function (res) {
      if (detailAddr !== addr) return;
      var gt = res[0].status === 'fulfilled' ? res[0].value : null;
      var dsPairs = res[1].status === 'fulfilled' ? res[1].value : [];
      var ds = bestPair(dsPairs, addr);
      var tok = (gt && gt.data && gt.data.attributes) || {};
      var pools = gt && gt.included ? fromGtPools({ data: gt.included.filter(function (x) { return x.type === 'pool'; }), included: [] }) : [];
      var g = pools[0] || null;
      var dd = ds ? fromDsPair(ds) : null;
      var r = g || dd;
      if (!gt && !dsPairs.length && !navigator.onLine) { setLive(false, 'offline'); if (first) body.innerHTML = '<div class="panel warn">You\u2019re offline. Token data needs a connection.</div>'; return; }
      if (!r && !tok.address) { body.innerHTML = '<div class="panel warn">No market data found for <span class="addr">' + esc(addr) + '</span> from the public APIs.</div>'; return; }
      r = r || {};
      var name = tok.name || r.name || '?', sym = tok.symbol || r.sym || '?';
      var icon = tok.image_url && !/missing/.test(tok.image_url) ? tok.image_url : (dd && dd.icon);
      // prefer GT for pool stats; fill gaps from DS
      function pick(k) { return (g && g[k] != null) ? g[k] : (dd && dd[k] != null ? dd[k] : null); }
      var mcap = num(tok.market_cap_usd); if (mcap == null && dd && !dd.isFdv) mcap = dd.mcap;
      var fdv = num(tok.fdv_usd); if (fdv == null) fdv = pick('fdv');
      var lp = tok.launchpad_details;
      var info = (dd && dd.info) || {};
      var extLinks = '';
      (info.websites || []).forEach(function (w) { var u = safeUrl(w.url); if (u) extLinks += '<a href="' + esc(u) + '" target="_blank" rel="noopener nofollow">' + esc(w.label || 'Website') + ' ↗</a>'; });
      (info.socials || []).forEach(function (s) { var u = safeUrl(s.url); if (u) extLinks += '<a href="' + esc(u) + '" target="_blank" rel="noopener nofollow">' + esc(s.type || s.platform || 'Social') + ' ↗</a>'; });
      var pool = (g && g.pool) || (dd && dd.pool);
      var hasChartFrame = document.querySelector('#dChartFrame iframe');
      var statsHtml =
        '<div class="panel"><h3>Price</h3><div class="big">' + fmtPrice(pick('price')) + '</div>' +
        '<div class="chgRow mt"><div><small>5m</small>' + fmtPct(pick('m5')) + '</div><div><small>1h</small>' + fmtPct(pick('h1')) + '</div><div><small>6h</small>' + fmtPct(pick('h6')) + '</div><div><small>24h</small>' + fmtPct(pick('h24')) + '</div></div></div>' +
        '<div class="panel"><h3>Market</h3><div class="kv">' +
          '<span>Market cap</span><span>' + fmtUsd(mcap) + '</span>' +
          '<span>FDV</span><span>' + fmtUsd(fdv) + '</span>' +
          '<span>Volume 24h</span><span>' + fmtUsd(pick('vol')) + '</span>' +
          '<span>Liquidity' + (lp && !lp.completed ? ' (curve reserve)' : '') + '</span><span>' + fmtUsd(pick('liq')) + '</span>' +
          '<span>Txns 24h</span><span>' + (pick('txb') != null ? pick('txb') + ' / ' + pick('txs') : '—') + '</span>' +
          '<span>Pair age</span><span>' + fmtAge(pick('created')) + '</span>' +
          '<span>DEX</span><span>' + esc(pick('dex') || '—') + '</span>' +
          (lp ? '<span>Bonding curve</span><span>' + (lp.completed ? 'graduated' : (lp.graduation_percentage != null ? Number(lp.graduation_percentage).toFixed(1) + '%' : '—')) + '</span>' : '') +
        '</div><p class="mut xs mt0">Stats: ' + [g ? 'GeckoTerminal (top pool)' : null, dd ? 'DexScreener API' : null].filter(Boolean).join(' + ') + ' · updated ' + timeStr(new Date()) + '</p></div>' +
        '<div class="panel"><h3>Addresses</h3><div class="addr">Token: ' + esc(addr) + '</div>' + (pool ? '<div class="addr">Pair: ' + esc(pool) + '</div>' : '') +
        '<div class="lk mt">' +
          (isPump(addr, pick('dex')) ? '<a href="https://pump.fun/coin/' + esc(addr) + '" target="_blank" rel="noopener">pump.fun ↗</a>' : '') +
          (g ? '<a href="https://www.geckoterminal.com/solana/pools/' + esc(g.pool) + '" target="_blank" rel="noopener">GeckoTerminal ↗</a>' : '') +
          '<a href="https://dexscreener.com/solana/' + esc(addr) + '" target="_blank" rel="noopener">DexScreener ↗</a>' +
          '<a href="https://solscan.io/token/' + esc(addr) + '" target="_blank" rel="noopener">Solscan ↗</a>' + extLinks +
        '</div></div>' +
        '<div class="panel warn">Shown as reported by public APIs. No rating, audit, or safety check is implied. Not financial advice.</div>';
      if (hasChartFrame && $('dStats')) { $('dStats').innerHTML = statsHtml; return; }
      body.innerHTML =
        '<div class="dHead">' + iconHtml(icon, sym) + '<div><h1>' + esc(name) + ' <span class="sym">$' + esc(sym) + '</span></h1>' +
        '<button class="ca" type="button" id="dCa"><code>' + esc(short(addr)) + '</code><span>copy</span></button>' +
        (addr === CFG.FEATURED ? ' <span class="pill">★ FEATURED</span>' : '') + '</div></div>' +
        '<div class="dGrid"><div class="dChart"><div class="srcSw" id="srcSw">' +
          (pool ? '<button data-k="gt" class="on">Chart: GeckoTerminal</button>' : '') +
          '<button data-k="ds"' + (pool ? '' : ' class="on"') + '>Chart: DexScreener</button></div>' +
          '<div class="frame" id="dChartFrame"></div><p class="mut xs" id="dChartSrc"></p></div>' +
        '<div class="dSide" id="dStats">' + statsHtml + '</div></div>';
      $('dCa').addEventListener('click', function () { copy(addr); });
      function show(kind) {
        mountChart($('dChartFrame'), kind, kind === 'ds' ? ((dd && dd.pool) || addr) : pool, addr, '$' + sym + ' chart');
        $('dChartSrc').textContent = 'Embedded chart widget from ' + (kind === 'ds' ? 'DexScreener' : 'GeckoTerminal') + '.';
        document.querySelectorAll('#srcSw button').forEach(function (b) { b.classList.toggle('on', b.dataset.k === kind); });
      }
      $('srcSw').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show(b.dataset.k); });
      show(pool ? 'gt' : 'ds');
    });
  }

  // ---------- router ----------
  function route() {
    var h = location.hash || '#/';
    var m = h.match(/^#\/token\/([^/?#]+)/);
    if (m) {
      $('viewHome').hidden = true; $('viewToken').hidden = false;
      var a = decodeURIComponent(m[1]);
      if (detailAddr !== a) { detailAddr = a; loadDetail(a, true); }
      window.scrollTo(0, 0);
      document.title = 'Token ' + short(a) + ' · Ghost Screener';
    } else {
      detailAddr = null;
      $('viewToken').hidden = true; $('viewHome').hidden = false;
      document.title = 'Ghost Screener · trending Solana memecoins, live';
      if (state.last && Date.now() - state.last.getTime() > CFG.REFRESH_MS) tick(true);
      if (h === '#/featured') setTimeout(function () { $('getFeatured').scrollIntoView({ behavior: 'smooth' }); }, 30);
    }
  }

  // ---------- refresh loop ----------
  var lastTick = 0;
  function tick(force) {
    if (document.hidden && !force) return;
    lastTick = Date.now();
    if (detailAddr) { loadDetail(detailAddr, false); return; }
    loadFeatured();
    if (state.tab !== 'search') loadList(true);
  }
  setInterval(tick, CFG.REFRESH_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - lastTick > CFG.REFRESH_MS) tick(true); });

  // ---------- events ----------
  document.querySelectorAll('#tbl th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.k;
      if (state.sort.k === k) state.sort.asc = !state.sort.asc;
      else state.sort = { k: k, asc: k === 'rank' || k === 'name' || k === 'age' };
      renderRows();
    });
  });
  $('rows').addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var tr = e.target.closest('tr[data-a]'); if (tr) location.hash = '#/token/' + tr.dataset.a;
  });
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('on', x === b); });
      state.tab = b.dataset.tab; state.rows = []; state.filter = ''; $('q').value = ''; state.sort = { k: 'rank', asc: true };
      loadList(false);
    });
  });
  $('q').addEventListener('input', function () { state.filter = this.value.trim(); renderRows(); });
  $('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('q').value.trim(); if (q.length < 2) return;
    if (isMint(q)) { location.hash = '#/token/' + q; return; }
    state.tab = 'search'; state.searchQ = q; state.filter = ''; state.rows = []; state.sort = { k: 'rank', asc: true };
    document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('on'); });
    loadList(false);
  });
  $('featCa').addEventListener('click', function () { copy(CFG.FEATURED); });
  window.addEventListener('hashchange', route);

  window.addEventListener('offline', function () { setLive(false, 'offline'); });
  window.addEventListener('online', function () { tick(true); });

  // ---------- PWA: service worker + install hint ----------
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {}); });
  }
  (function installHint() {
    var KEY = 'gs_install_dismissed';
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    var dismissed = false; try { dismissed = localStorage.getItem(KEY) === '1'; } catch (e) {}
    if (standalone || dismissed) return;
    var box = $('install'), txt = $('installTxt'), btn = $('installBtn'), deferred = null;
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    function hide(remember) { box.hidden = true; if (remember) { try { localStorage.setItem(KEY, '1'); } catch (e) {} } }
    $('installX').addEventListener('click', function () { hide(true); });
    if (isIOS) {
      txt.innerHTML = '<b>Install Ghost Screener:</b> tap <svg class="shr" viewBox="0 0 24 24" fill="none" stroke="#3ee08f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg> <b>Share</b>, then <b>Add to Home Screen</b>.';
      box.hidden = false;
      return;
    }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferred = e;
      txt.innerHTML = '<b>Install Ghost Screener</b> for quick access from your home screen.';
      btn.hidden = false; box.hidden = false;
    });
    btn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; hide(false); });
    });
    window.addEventListener('appinstalled', function () { hide(true); });
  })();

  // ---------- boot ----------
  route();
  lastTick = Date.now();
  if (!detailAddr) { loadFeatured(); loadList(false); }
  else { loadFeatured(); loadList(true); }
})();
