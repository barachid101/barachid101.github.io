/* =============================================================================
   BaRachid — app.js
   Vanilla ES2019, no modules, no dependencies, no external requests.
   Ported from the design-canvas component logic (CATALOG + cart + sheet).
   ============================================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------------
     Catalog — prices in Western digits, exactly as the mock
     ------------------------------------------------------------------------- */
  var CATALOG = {
    /* عائلي 100 → 89 (2026-08-09): «عرض الانطلاقة» launch price — the card shows
       the struck-through 100 next to it. Raise back by editing BOTH here and the
       static best-solo/menu chips in index.html (grep: best-price). */
    complet:   { name: 'الطبق الكامل',  sizes: [['زوجي', 50], ['عائلي', 89]] },
    fardi:     { name: 'الطبق الفردي',  sizes: [['', 27]] },
    babbouche: { name: 'باك الببوش',    sizes: [['زوجي', 37], ['عائلي', 50]] },
    hummus:    { name: 'باك الحمص',     sizes: [['زوجي', 20], ['عائلي', 35]] },
    marqa:     { name: 'شوربة الببوش زيادة', sizes: [['', 6]] },
    batata:    { name: 'بطاطا مسلوقة',  sizes: [['', 6]] }
  };

  /* 2026-09-01: brand line 0705968617 is BLOCKED pending WhatsApp verification
     (second line lost this way — 0630070149 on 08-22). All WhatsApp traffic goes
     to Saif's personal 0677710579 until a warmed-up brand line exists. No bot in
     the money path: no auto-ack, dashboard rows stay sent_click (phone/received-
     merge lost). The send beacon still logs everything.
     Bot mode again: set this back to '212647351006' (the Meta Cloud API number). */
  var WA_NUMBER = '212677710579';
  /* The hero's «كومندي فالواتساب» button goes to the same WhatsApp line; the call
     button stays Saif's personal number. They are the escape hatch for visitors
     who will not use a cart. No source tag in the text (Saif's call 2026-08-08) —
     ask «منين عرفتونا؟» in chat. These orders never get a code and never reach the
     dashboard's order table — only the wa_direct / call beacons prove they happened. */
  var WA_DIRECT = '212677710579';
  var WA_DIRECT_TEXT = 'السلام 👋 بغيت نطلب ببوش من با رشيد';
  var STORE_KEY = 'br-cart-v4';  /* v4 2026-08-24: وسط→زوجي rename, batata 10→6,
                                    fardi added — a v3 cart would silently restore
                                    stale labels/prices, so it must not restore. */
  var OPEN_HOUR = 20;    /* 20:00 inclusive (permanent hours since 2026-08-09) */
  var CLOSE_HOUR = 1;    /* closes 01:00 the next day (exclusive) — Saif closes at 1 (10-20;
                            was 04:00 since the 08-11 pivot). Matches the
                            landing pill. */
  var TZ = 'Africa/Casablanca';
  var DIV = '─────────────';
  /* Delivery model (Saif's call 2026-08-10, mid-run-4): NO product floor anymore —
     run-4's live feed showed small baskets (مرقة+بطاطا = 16 dh) dying against the old
     34 dh block. Any order sends now; below FREE_FROM it carries a DELIVERY_FEE that
     keeps a tiny basket from riding the bike for free. At/above FREE_FROM delivery
     stays «فابور». (History: 40/10 model 2026-08-04 → free-on-every-order + 34
     floor 2026-08-08 → this.) */
  var FREE_FROM = 34;         /* dh — delivery free from here up */
  var DELIVERY_FEE = 12;      /* dh — charged below FREE_FROM */

  function deliveryFee(subtotal) {
    return subtotal >= FREE_FROM ? 0 : DELIVERY_FEE;
  }

  /* Traceability: invisible, no UI, fire-and-forget. If the VPS is down or slow NOTHING here
     changes — every call is inside try/catch, nothing is awaited, no response is read. */
  var TRACK_URL = 'https://suivipatient.duckdns.org/barachid/track';
  var VID_KEY = 'br-vid';
  /* No 0/O/1/I/L — the code gets read aloud on the phone and written on a lid. */
  var CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /* Location picker (2026-10-08, replaces Leaflet): MapLibre GL is self-hosted and lazy —
     nothing below loads until the customer taps «زيد الموقع». Vector tiles come from
     OpenFreeMap (free, no key, no usage limit, commercial use allowed). The RTL plugin
     shapes the Arabic street names; it is fetched only when a label needs it. */
  var MAPLIBRE_CSS = 'vendor/maplibre/maplibre-gl.css';
  var MAPLIBRE_JS = 'vendor/maplibre/maplibre-gl.js';
  var MAPLIBRE_RTL = 'vendor/maplibre/mapbox-gl-rtl-text.js';
  var MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  var TANGIER = [-5.8340, 35.7595];   /* [lng, lat] — MapLibre's order */
  /* Place search (2026-10-08): Photon — free, no key, OpenStreetMap data, built for
     search-as-you-type. Only what the customer TYPES is sent, only after 3 letters,
     boxed to greater Tangier. Arabic script finds nothing there, so the common
     neighbourhood names are translated first (GEO_ALIASES). */
  var GEO_URL = 'https://photon.komoot.io/api/';
  var GEO_BBOX = '-5.98,35.66,-5.68,35.84';   /* lon,lat,lon,lat — greater Tangier */
  var GEO_ALIASES = [
    ['مسنانه', 'Mesnana'], ['ملابطا', 'Malabata'], ['ملاباطا', 'Malabata'], ['ايبيريا', 'Iberia'],
    ['ايبريا', 'Iberia'], ['مرشان', 'Marshan'], ['بوخالف', 'Boukhalef'], ['البرانص', 'Branes'],
    ['برانص', 'Branes'], ['الدرادب', 'Dradeb'], ['درادب', 'Dradeb'], ['كاسابراطا', 'Casabarata'],
    ['بني مكاده', 'Beni Makada'], ['السواني', 'Souani'], ['سواني', 'Souani'], ['مغوغه', 'Mghogha'],
    ['اشقار', 'Achakar'], ['فال فلوري', 'Val Fleuri'], ['كاليفورنيا', 'California'],
    ['المدينه القديمه', 'Médina'], ['السوق الداخل', 'Petit Socco'], ['السوق دبرا', 'Grand Socco'],
    ['شارع محمد الخامس', 'Boulevard Mohamed V'], ['شارع محمد السادس', 'Avenue Mohammed VI'],
    ['مولاي يوسف', 'Moulay Youssef'], ['مولاي رشيد', 'Moulay Rachid'], ['المرس', 'Merss'],
    ['حومه الشوك', 'Houmat Chouk'], ['العوامه', 'Aouama'], ['مسترخوش', 'Mstakhouch'],
    ['الزياتن', 'Ziaten'], ['زياتن', 'Ziaten'], ['بير الشيفا', 'Bir Chifa'], ['المصلى', 'Msalla'],
    ['ابن بطوطه', 'Ibn Batouta'], ['الملعب الكبير', 'Grand Stade de Tanger'], ['المحطه', 'Gare']
  ];

  /* ---------------------------------------------------------------------------
     Pure message builder — exported for testing
     cartLines : [{ name, size, qty, total }]
     addr      : { res, apt, rue } — every field optional
     gpsResult : { ok: true, lat, lng } | { ok: false }
     ------------------------------------------------------------------------- */
  function addrLines(addr) {
    var a = (typeof addr === 'string') ? { res: addr } : (addr || {});
    var clean = function (v) { return String(v == null ? '' : v).trim(); };
    var out = [];
    var res = clean(a.res);
    var apt = clean(a.apt);
    var rue = clean(a.rue);
    if (res) out.push('🏠 الإقامة: ' + res);
    if (apt) out.push('🚪 الطابق/الشقة: ' + apt);
    if (rue) out.push('🛣 الزنقة/علامة: ' + rue);
    if (!out.length) out.push('🏠 —');
    return out;
  }

  function buildOrderMessage(cartLines, total, delivery, addr, gpsResult, code) {
    var lines = ['🛵 طلب جديد — با رشيد', DIV];
    for (var i = 0; i < cartLines.length; i++) {
      var it = cartLines[i];
      var sizePart = it.size ? ' (' + it.size + ')' : '';
      lines.push('• ' + it.name + sizePart + ' ×' + it.qty + ' — ' + it.total + ' درهم');
    }
    lines.push(DIV);
    /* «المجموع:» must stay the GRAND total (cash at the door) — it is the line
       bot/tracking.py::parse_order reads, and the dashboard's revenue with it. */
    if (delivery > 0) {
      lines.push('التوصيل: ' + delivery + ' درهم');
      lines.push('المجموع: ' + (total + delivery) + ' درهم (مع التوصيل)');
    } else {
      lines.push('المجموع: ' + total + ' درهم — التوصيل فابور');
    }
    lines.push.apply(lines, addrLines(addr));
    /* No fix is the NORMAL case since GPS went opt-in (2026-08-10) — the line promises
       the confirmation call instead of announcing a failure («بلا GPS»). */
    var geo = (gpsResult && gpsResult.ok)
      ? 'https://maps.google.com/?q=' + Number(gpsResult.lat).toFixed(6) + ',' + Number(gpsResult.lng).toFixed(6)
      : 'نأكدو البلاصة فالتيليفون';
    lines.push('📍 ' + geo);
    /* An ARGUMENT, not generated here: keeps this function pure and testable, and lets
       bot/tracking.py parse_order be tested against a fixed string. */
    if (code) lines.push('🔖 كود: #' + code);
    lines.push('💰 كاش عند الباب');
    return lines.join('\n');
  }
  window.buildOrderMessage = buildOrderMessage;

  /* 2026-10-19 — the green WhatsApp button carries the cart. Night 3 (10-18): 13 adders,
     1 cart send, 4 orders — all plain «السلام» chats, some from visitors who had a full cart
     and tapped the green button instead. So meet them there: same greeting, plus what they
     picked and the cash-at-the-door total. No address, no form. Empty cart → the plain
     greeting exactly as before. «المجموع:» is the GRAND total, same rule as the cart. */
  function buildDirectMessage(cartLines, total, delivery, code) {
    var lines;
    if (!cartLines || !cartLines.length) {
      lines = [WA_DIRECT_TEXT];
    } else {
      lines = ['السلام 👋 بغيت نطلب من با رشيد:'];
      for (var i = 0; i < cartLines.length; i++) {
        var it = cartLines[i];
        lines.push('• ' + it.name + (it.size ? ' (' + it.size + ')' : '') + ' ×' + it.qty + ' — ' + it.total + ' درهم');
      }
      if (delivery > 0) {
        lines.push('التوصيل: ' + delivery + ' درهم');
        lines.push('المجموع: ' + (total + delivery) + ' درهم (مع التوصيل)');
      } else {
        lines.push('المجموع: ' + total + ' درهم — التوصيل فابور');
      }
    }
    if (code) lines.push('🔖 كود: #' + code);
    return lines.join('\n');
  }
  window.buildDirectMessage = buildDirectMessage;

  /* ---------------------------------------------------------------------------
     Traceability — order code, visitor id, beacons. All fire-and-forget.
     ------------------------------------------------------------------------- */
  function orderCode() {
    var bytes = null;
    try {
      if (window.crypto && crypto.getRandomValues) {
        bytes = new Uint8Array(4);
        crypto.getRandomValues(bytes);
      }
    } catch (e) { bytes = null; }
    var out = '';
    for (var i = 0; i < 4; i++) {
      /* 256 is an exact multiple of 32, so the modulo is unbiased. */
      var n = bytes ? bytes[i] : Math.floor(Math.random() * 256);
      out += CODE_ABC.charAt(n % CODE_ABC.length);
    }
    return out;
  }

  function visitorId() {
    var v = null;
    try { v = localStorage.getItem(VID_KEY); } catch (e) { return 'anon'; }
    if (v && /^v[a-z0-9-]{6,38}$/.test(v)) return v;
    v = 'v' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(VID_KEY, v); } catch (e) { /* private mode — stays per-load */ }
    return v;
  }

  /* Meta pixel events — the pixel can NEVER affect ordering. The loader in
     index.html defines window.fbq; if it failed to load, calls queue harmlessly. */
  function px(event, data) {
    try { if (window.fbq) window.fbq('track', event, data || {}); } catch (e) { /* never breaks ordering */ }
  }

  function track(event, data) {
    try {
      var body = JSON.stringify({ vid: visitorId(), event: event, ts: Date.now(), data: data || {} });
      /* text/plain keeps this a CORS "simple request" — no preflight, nothing to block. */
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(TRACK_URL, blob)) return;
      }
      if (window.fetch) {
        fetch(TRACK_URL, {
          method: 'POST', body: body, keepalive: true, mode: 'cors',
          credentials: 'omit', headers: { 'Content-Type': 'text/plain' }
        }).catch(function () { /* server down: the order is unaffected */ });
      }
    } catch (e) { /* tracking NEVER affects ordering */ }
  }

  /* ---------------------------------------------------------------------------
     Monitoring v2 (2026-10-12): which ad earned the order, Meta's matching keys, one
     code per direct contact, Clarity hooks. Same rule as everything above: fire-and-
     forget, try/catch, and a page without localStorage / cookies / Clarity works the same.
     ------------------------------------------------------------------------- */
  var TOUCH_KEY = 'br-touch';
  var TOUCH_DAYS = 7;
  var CCODE_KEY = 'br-ccode';
  var CCODE_MIN = 30;

  function pxc(event, data) {
    try { if (window.fbq) window.fbq('trackCustom', event, data || {}); } catch (e) { /* never breaks ordering */ }
  }

  function clarityEvent(name) {
    try { if (window.clarity) window.clarity('event', name); } catch (e) { /* idem */ }
  }

  /* LAST TOUCH: the ?s= / ?c= of the visit that brought them, kept 7 days, so an order
     placed on a later visit (through the bio, a typed URL…) still counts for the ad
     that earned it. */
  function saveTouch(s, c) {
    try { localStorage.setItem(TOUCH_KEY, JSON.stringify({ s: s, c: c || '', at: Date.now() })); } catch (e) { /* private mode */ }
  }

  function readTouch() {
    try {
      var t = JSON.parse(localStorage.getItem(TOUCH_KEY) || 'null');
      if (t && t.s && Date.now() - t.at < TOUCH_DAYS * 864e5) {
        var out = { s: String(t.s) };
        if (t.c) out.c = String(t.c);
        return out;
      }
    } catch (e) { /* corrupt or blocked storage = untagged */ }
    return {};
  }

  /* the pixel's own first-party cookies: what lets the server's «Purchase» (sent when Saif
     marks an order delivered) be matched back to the ad click */
  function metaCookies() {
    var out = {};
    try {
      document.cookie.split(';').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i < 0) return;
        var k = kv.slice(0, i).trim();
        if (k === '_fbp' || k === '_fbc') out[k.slice(1)] = decodeURIComponent(kv.slice(i + 1).trim());
      });
    } catch (e) { /* no cookies = no matching keys, nothing else changes */ }
    return out;
  }

  function withAttribution(data) {
    var t = readTouch(), m = metaCookies(), k;
    for (k in t) data[k] = t[k];
    for (k in m) data[k] = m[k];
    return data;
  }

  /* One code per visitor per 30 min for the direct WhatsApp / call taps: the same code is
     in the WhatsApp message and on the dashboard row (a chat matches its row by eye), and
     three hesitant taps stay ONE lead. */
  function contactCode() {
    try {
      var c = JSON.parse(localStorage.getItem(CCODE_KEY) || 'null');
      if (c && c.code && Date.now() - c.at < CCODE_MIN * 6e4) return c.code;
    } catch (e) { /* fall through to a fresh code */ }
    var code = orderCode();
    try { localStorage.setItem(CCODE_KEY, JSON.stringify({ code: code, at: Date.now() })); } catch (e) { /* per-load */ }
    return code;
  }

  function directWaUrl(code) {
    var total = cartTotal();
    return 'https://wa.me/' + WA_DIRECT + '?text=' +
      encodeURIComponent(buildDirectMessage(cartLines(), total, deliveryFee(total), code));
  }

  /* kind 'wa' | 'call', from the link's own click handler. For WhatsApp it re-points the
     href first (a handler runs before the navigation), so the message carries the code. */
  function contact(kind, link) {
    var code = contactCode();
    if (kind === 'wa' && link) { try { link.href = directWaUrl(code); } catch (e) { /* plain href stays */ } }
    track(kind === 'wa' ? 'wa_direct' : 'call', withAttribution({ code: code }));
    px('Contact', {});
    clarityEvent(kind === 'wa' ? 'wa_direct' : 'call');
  }

  /* the landing's inline script (fixed action bar, flip cards, video carousel) reuses these */
  window.BR = { track: track, px: px, pxc: pxc, contact: contact, clarityEvent: clarityEvent };

  /* ---------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------- */
  var state = {
    cart: [],                                        /* [{k, id, si, qty}] */
    sel: { complet: 1, babbouche: 0, hummus: 0 },    /* mock defaults */
    flash: {},
    open: false,
    geo: null,        /* { ok: true, lat, lng } — auto fix or hand-placed pin */
    pinned: false     /* true once the customer confirmed a spot on the map */
  };
  var flashTimers = {};
  var lastFocus = null;
  var sheetPushed = false;

  function key(id, si) { return id + ':' + si; }

  /* ---------------------------------------------------------------------------
     Persistence
     ------------------------------------------------------------------------- */
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ cart: state.cart, sel: state.sel }));
    } catch (e) { /* private mode / quota — cart just won't persist */ }
  }

  function restore() {
    var raw;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || typeof data !== 'object') return;

    if (Object.prototype.toString.call(data.cart) === '[object Array]') {
      var clean = [];
      for (var i = 0; i < data.cart.length; i++) {
        var c = data.cart[i];
        if (!c || !CATALOG[c.id]) continue;
        var si = c.si | 0;
        if (si < 0 || si >= CATALOG[c.id].sizes.length) continue;
        var qty = c.qty | 0;
        if (qty < 1 || qty > 99) continue;
        clean.push({ k: key(c.id, si), id: c.id, si: si, qty: qty });
      }
      state.cart = clean;
    }
    /* Size chips deliberately NOT restored (2026-08-08): the cards must always
       greet a visitor with زوجي 50 / وسط selected — a returning tester who once
       tapped عائلي was seeing 100 pre-chosen and reading it as the default. */
  }

  /* ---------------------------------------------------------------------------
     Derived values
     ------------------------------------------------------------------------- */
  function cartLines() {
    return state.cart.map(function (c) {
      var cat = CATALOG[c.id];
      var sizeName = cat.sizes[c.si][0];
      var unit = cat.sizes[c.si][1];
      return {
        k: c.k,
        id: c.id,
        name: cat.name,
        size: sizeName,
        qty: c.qty,
        unit: unit,
        sub: (sizeName ? sizeName + ' · ' : '') + unit + ' درهم',
        total: unit * c.qty
      };
    });
  }

  function qtyOf(id, si) {
    for (var i = 0; i < state.cart.length; i++) {
      if (state.cart[i].id === id && state.cart[i].si === si) return state.cart[i].qty;
    }
    return 0;
  }

  function cartCount() {
    return state.cart.reduce(function (a, c) { return a + c.qty; }, 0);
  }

  function cartTotal() {
    return state.cart.reduce(function (a, c) { return a + c.qty * CATALOG[c.id].sizes[c.si][1]; }, 0);
  }

  /* ---------------------------------------------------------------------------
     DOM refs
     ------------------------------------------------------------------------- */
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var elCtaOpen = $('#cta-open');
  var elCtaClosed = $('#cta-closed');
  var elCartBtn = $('#cart-btn');
  var elCartEmpty = $('#cart-empty');
  var elCartCount = $('#cart-count');
  var elCartText = $('#cart-text');
  var elLines = $('#lines');
  var elTotal = $('#total-text');
  var elSheet = $('#sheet');
  var elScrim = $('#scrim');
  var elSheetClose = $('#sheet-close');
  var elAddrRes = $('#addr-res');
  var elAddrApt = $('#addr-apt');
  var elAddrRue = $('#addr-rue');
  var elLoc = $('#loc-chip');
  var elMapBtn = $('#map-btn');
  var elMapHint = $('#map-hint');
  var elMap = $('#map');
  var elMv = $('#mapview');
  var elMvClose = $('#mv-close');
  var elMvLocate = $('#mv-locate');
  var elMvConfirm = $('#mv-confirm');
  var elMvMsg = $('#mv-msg');
  var elMvQ = $('#mv-q');
  var elMvQx = $('#mv-q-x');
  var elMvRes = $('#mv-results');
  var elDelivery = $('#delivery-text');
  var elGrandRow = $('#grand-row');
  var elGrandText = $('#grand-text');
  var elNudge = $('#free-nudge');
  /* #send-btn since 2026-08-24: the cart now lives ON the landing, whose green
     chat button already owns the id #wa-btn — the sheet's send button got its own. */
  var elWa = $('#send-btn');
  var elMenu = $('#menu');

  var LOC_TEXT = {
    ok: 'الموقع تسجل',
    pin: 'الموقع تحدد'
  };

  function setLoc(kind) {
    /* Only the green success states ever render (2026-08-10). idle/fail keep the chip
       hidden — the sheet never talks about locating the customer unless they opted in
       via the map button and it worked. */
    var lbl = document.getElementById('map-btn-lbl');
    if (!LOC_TEXT[kind]) { elLoc.hidden = true; if (lbl) lbl.textContent = 'زيد الموقع فالخريطة'; return; }
    if (lbl) lbl.textContent = 'بدل الموقع فالخريطة';
    elLoc.hidden = false;
    elLoc.className = 'locchip is-ok';
    elLoc.textContent = LOC_TEXT[kind];
  }

  function readAddr() {
    return {
      res: elAddrRes.value.trim(),
      apt: elAddrApt.value.trim(),
      rue: elAddrRue.value.trim()
    };
  }

  /* ---------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------- */
  var lastCount = -1;
  var sheetSent = false;   /* the open sheet ended in a WhatsApp hand-off (not an abandon) */

  function render() {
    /* size chips + prices */
    $$('[data-pick]').forEach(function (btn) {
      var id = btn.getAttribute('data-pick');
      var si = parseInt(btn.getAttribute('data-si'), 10);
      var on = (state.sel[id] || 0) === si;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('[data-price]').forEach(function (el) {
      var id = el.getAttribute('data-price');
      el.textContent = String(CATALOG[id].sizes[state.sel[id] || 0][1]);
    });

    /* add buttons (flash state) — keyed by id:size, so the زوجي button never
       flashes when its عائلي sibling was the one tapped (bug found 2026-08-24) */
    $$('[data-add]').forEach(function (btn) {
      var id = btn.getAttribute('data-add');
      var fixed = btn.getAttribute('data-add-si');
      var si = fixed === null ? (state.sel[id] || 0) : parseInt(fixed, 10);
      btn.classList.toggle('is-flash', !!state.flash[key(id, si)]);
      /* 2026-10-08: each size row is a «زيد +» pill that turns into a − n + stepper
         once that exact size is in the cart (the + stays this same button) */
      var n = qtyOf(id, si);
      btn.classList.toggle('is-in-cart', n > 0);
      var box = btn.parentNode;
      if (box && box.classList.contains('qty')) {
        box.classList.toggle('is-in', n > 0);
        var qn = box.querySelector('.qn');
        if (qn) qn.textContent = String(n);
      }
    });
    $$('.ocard').forEach(function (card) {
      card.classList.toggle('is-in-cart', !!card.querySelector('[data-add].is-in-cart'));
    });

    /* cart bar */
    var count = cartCount();
    var total = cartTotal();
    elCartBtn.hidden = count === 0;
    elCartEmpty.hidden = count > 0;
    if (count > 0) {
      elCartCount.textContent = String(count);
      elCartText.textContent = count + ' ' + (count === 1 ? 'باك' : 'باكات') + ' — ' + total + ' درهم';
      if (count !== lastCount) bump();
    }
    lastCount = count;

    /* sheet lines */
    renderLines(cartLines());
    money(elTotal, total);

    /* delivery: free from FREE_FROM up; below it the fee is shown as its own row
       plus the grand total — the customer must never discover the fee in WhatsApp */
    var fee = deliveryFee(total);
    if (fee > 0 && count > 0) {
      money(elDelivery, fee);
      elDelivery.classList.remove('is-free');
      money(elGrandText, total + fee);
      elGrandRow.hidden = false;
      /* the honest upsell: what's missing for the fee to disappear */
      elNudge.textContent = 'زيد ' + (FREE_FROM - total) + ' درهم وولي التوصيل فابور';
      elNudge.hidden = false;
    } else {
      elDelivery.textContent = 'فابور';
      elDelivery.classList.add('is-free');
      elGrandRow.hidden = true;
      elNudge.hidden = true;
    }

    /* the send button must track the cart on EVERY change — it starts disabled on an
       empty cart, and a first-time visitor who adds items would otherwise be left with
       a dead button (init() only syncs once, at load). */
    syncWaEnabled();

    /* empty cart auto-closes the sheet */
    if (count === 0 && state.open) closeSheet();
  }

  /* «77 درهم» with the unit as a small label (CSS: .total-val small) — built with
     DOM nodes, so the text still reads «77 درهم» to tests and screen readers */
  function money(el, n) {
    el.textContent = n + ' ';
    var u = document.createElement('small');
    u.textContent = 'درهم';
    el.appendChild(u);
  }

  function bump() {
    elCartCount.classList.remove('is-bump');
    void elCartCount.offsetWidth; /* force reflow so the animation re-triggers */
    elCartCount.classList.add('is-bump');
  }

  function renderLines(lines) {
    /* remember which stepper had focus so re-rendering doesn't drop the caret */
    var act = document.activeElement;
    var focusK = act && act.getAttribute ? act.getAttribute('data-step-k') : null;
    var focusD = act && act.getAttribute ? act.getAttribute('data-step-d') : null;

    elLines.textContent = '';
    var frag = document.createDocumentFragment();
    lines.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'line';

      var txt = document.createElement('div');
      txt.className = 'line-txt';
      var nm = document.createElement('div');
      nm.className = 'line-name';
      nm.textContent = it.name;
      var sb = document.createElement('div');
      sb.className = 'line-sub';
      sb.textContent = it.sub;
      txt.appendChild(nm);
      txt.appendChild(sb);

      var stepper = document.createElement('div');
      stepper.className = 'stepper';

      var dec = document.createElement('button');
      dec.type = 'button';
      dec.className = 'step-btn step-dec';
      dec.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-minus"/></svg>';
      dec.setAttribute('aria-label', 'نقص من ' + it.name);
      dec.setAttribute('data-step-k', it.k);
      dec.setAttribute('data-step-d', '-1');
      dec.addEventListener('click', function () { step(it.k, -1); });

      var qty = document.createElement('span');
      qty.className = 'line-qty';
      qty.textContent = String(it.qty);

      var inc = document.createElement('button');
      inc.type = 'button';
      inc.className = 'step-btn step-inc';
      inc.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg>';
      inc.setAttribute('aria-label', 'زيد من ' + it.name);
      inc.setAttribute('data-step-k', it.k);
      inc.setAttribute('data-step-d', '1');
      inc.addEventListener('click', function () { step(it.k, 1); });

      stepper.appendChild(dec);
      stepper.appendChild(qty);
      stepper.appendChild(inc);

      var tot = document.createElement('div');
      tot.className = 'line-total';
      money(tot, it.total);

      row.appendChild(txt);
      row.appendChild(stepper);
      row.appendChild(tot);
      frag.appendChild(row);
    });
    elLines.appendChild(frag);

    if (focusK) {
      var back = elLines.querySelector('[data-step-k="' + focusK + '"][data-step-d="' + focusD + '"]');
      if (back) back.focus();
      else if (state.open) elSheetClose.focus();
    }
  }

  /* ---------------------------------------------------------------------------
     Cart actions
     ------------------------------------------------------------------------- */
  function addItem(id, forceSi) {
    /* forceSi (2026-08-08): the hero best-seller cards print a fixed price, so their +
       must add exactly that size — never the menu card's currently selected chip. */
    var si = (typeof forceSi === 'number') ? forceSi : (state.sel[id] || 0);
    var k = key(id, si);
    var i = -1;
    for (var n = 0; n < state.cart.length; n++) { if (state.cart[n].k === k) { i = n; break; } }
    if (i >= 0) state.cart[i].qty += 1;
    else state.cart.push({ k: k, id: id, si: si, qty: 1 });

    track('add', { id: id, size: CATALOG[id].sizes[si][0], price: CATALOG[id].sizes[si][1] });
    px('AddToCart', { content_name: CATALOG[id].name, value: CATALOG[id].sizes[si][1], currency: 'MAD' });

    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* no haptics: fine */ }

    state.flash[k] = true;
    clearTimeout(flashTimers[k]);
    flashTimers[k] = setTimeout(function () {
      state.flash[k] = false;
      render();
    }, 1100);

    save();
    render();
  }

  function step(k, d) {
    var next = [];
    for (var i = 0; i < state.cart.length; i++) {
      var c = state.cart[i];
      var qty = c.k === k ? c.qty + d : c.qty;
      if (qty > 0) next.push({ k: c.k, id: c.id, si: c.si, qty: qty });
    }
    state.cart = next;
    save();
    render();
  }

  function pick(id, si) {
    state.sel[id] = si;
    save();
    render();
  }

  /* ---------------------------------------------------------------------------
     Sheet (dialog semantics: focus move + restore, Escape, scrim, inert)
     ------------------------------------------------------------------------- */
  var FOCUSABLE = 'button:not([disabled]), [href], textarea, input, select, [tabindex]:not([tabindex="-1"])';

  function openSheet() {
    if (state.open || cartCount() === 0) return;
    state.open = true;
    lastFocus = document.activeElement;
    elSheet.classList.add('is-open');
    elScrim.classList.add('is-open');
    elSheet.removeAttribute('inert');
    elSheet.removeAttribute('aria-hidden');
    document.body.style.overflow = 'hidden';
    /* Android back button closes the sheet instead of leaving the site */
    try { history.pushState({ br: 'sheet' }, ''); sheetPushed = true; } catch (e) { sheetPushed = false; }
    elSheetClose.focus();
    sheetSent = false;
    track('sheet', {});
    px('InitiateCheckout', { value: cartTotal(), currency: 'MAD' });
    /* NO geolocation request here (2026-08-10): the OS permission popup on sheet-open
       scared customers off — two nights of data showed ~2/3 of sheet-openers bailing
       and every real order arriving GPS-less anyway. Location is opt-in via the map
       button; otherwise the confirmation call settles the address. */
  }

  /* where a checkout was abandoned: nothing done / address typed / spot pinned / both */
  function sheetStep() {
    var a = readAddr();
    var hasAddr = !!(a.res || a.apt || a.rue);
    if (state.pinned && hasAddr) return 'ready';
    if (state.pinned) return 'pin';
    return hasAddr ? 'addr' : 'cart';
  }

  function closeSheet() {
    if (!state.open) return;
    state.open = false;
    if (!sheetSent) track('sheet_close', { step: sheetStep() });
    elSheet.classList.remove('is-drag');
    elSheet.style.transform = '';
    /* closed from the page (X, scrim, swipe, Escape): pop our own history entry so the
       next back press leaves the site normally */
    if (sheetPushed) { sheetPushed = false; popOwnEntry(); }
    elSheet.classList.remove('is-open');
    elScrim.classList.remove('is-open');
    elSheet.setAttribute('inert', '');
    elSheet.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    /* never leave focus stranded inside the now-inert sheet */
    var target = (lastFocus && lastFocus.focus && lastFocus !== document.body && document.contains(lastFocus))
      ? lastFocus
      : (elCartBtn.hidden ? null : elCartBtn);
    var act = document.activeElement;
    if (act && act !== document.body && elSheet.contains(act) && act.blur) act.blur();
    if (target) target.focus();
    lastFocus = null;
  }

  /* swipe the sheet down by its handle or title row to close it, like a native sheet */
  function initSheetDrag() {
    var grips = [elSheet.querySelector('.sheet-grab'), elSheet.querySelector('.sheet-head')];
    var y0 = null, dy = 0, t0 = 0;
    function start(e) {
      if (!state.open || !e.touches || e.touches.length !== 1) return;
      if (e.target.closest && e.target.closest('button')) return;   /* the X stays a tap */
      y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
      elSheet.classList.add('is-drag');
    }
    function move(e) {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      elSheet.style.transform = 'translateY(' + dy + 'px)';
    }
    function end() {
      if (y0 === null) return;
      y0 = null;
      elSheet.classList.remove('is-drag');
      elSheet.style.transform = '';
      var fast = dy > 40 && (Date.now() - t0) < 250;
      if (dy > 110 || fast) closeSheet();
    }
    grips.forEach(function (g) {
      if (!g) return;
      g.addEventListener('touchstart', start, { passive: true });
      g.addEventListener('touchmove', move, { passive: true });
      g.addEventListener('touchend', end);
      g.addEventListener('touchcancel', end);
    });
  }

  /* history.back() for an entry WE pushed — the popstate it fires must not be read as
     the customer pressing back (it would close the sheet under a closing map) */
  var ownPops = 0;
  function popOwnEntry() {
    ownPops++;
    try { history.back(); } catch (e) { ownPops--; }
  }

  function trapTab(e) {
    if (e.key !== 'Tab' || !(state.open || mvOpen)) return;
    var box = mvOpen ? elMv : elSheet;
    var items = Array.prototype.slice.call(box.querySelectorAll(FOCUSABLE))
      .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------------------------------------------------------------------
     Hours gate — real Africa/Casablanca clock, window crosses midnight
     (20:00 → 01:00 the next day)
     ------------------------------------------------------------------------- */
  function casablancaTime() {
    var now = new Date();
    try {
      var s = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: false
      }).format(now);
      var parts = s.split(':');
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return { h: now.getHours(), m: now.getMinutes() };
      return { h: h % 24, m: m }; /* some engines emit "24" for midnight */
    } catch (e) {
      return { h: now.getHours(), m: now.getMinutes() };
    }
  }

  function isOpenNow() {
    var t = casablancaTime();
    return t.h >= OPEN_HOUR || t.h < CLOSE_HOUR;
  }

  function applyHours() {
    var open = isOpenNow();
    elCtaOpen.hidden = !open;
    elCtaClosed.hidden = open;
    /* NOTE: ordering stays enabled when closed — the banner promises
       confirmation as soon as we open. */
  }

  /* ---------------------------------------------------------------------------
     Geolocation — fired when the sheet opens
     ------------------------------------------------------------------------- */
  var geoPromise = null;
  var geoSettled = false;

  function getPosition() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve({ ok: false, why: 'unavailable' }); return; }
      if (window.isSecureContext === false) { resolve({ ok: false, why: 'insecure' }); return; }
      var done = false;
      /* The geolocation `timeout` option only starts counting AFTER the user answers
         the permission prompt. If they dismiss/ignore the prompt, neither callback
         ever fires and the promise would hang forever — so we enforce our own hard
         deadline. Without this, the send button could stay frozen in loading state. */
      setTimeout(function () {
        if (done) return; done = true;
        resolve({ ok: false, why: 'timeout' });
      }, 12000);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (done) return; done = true;
          resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        function (err) {
          if (done) return; done = true;
          var code = err && err.code;
          resolve({ ok: false, why: code === 1 ? 'denied' : code === 3 ? 'timeout' : code === 2 ? 'unavailable' : 'other' });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  var geoFailSent = false;
  function geoFail(why) {
    if (geoFailSent) return;   /* once per page load: the reason, not the retries */
    geoFailSent = true;
    track('geo_fail', { why: why || 'other' });
  }

  function requestGeo() {
    if (state.geo && state.geo.ok) return geoPromise;   /* already located or pinned */
    if (geoPromise && !geoSettled) return geoPromise;    /* one request in flight */

    geoSettled = false;
    geoPromise = getPosition().then(function (gps) {
      geoSettled = true;
      if (gps.ok) lastFix = { lat: gps.lat, lng: gps.lng };
      if (state.pinned) return state.geo; /* the customer already confirmed a spot */
      if (gps.ok) {
        state.geo = { ok: true, lat: gps.lat, lng: gps.lng };
        setLoc('ok');
        /* the map is usually open (geo only fires from its button) — glide it onto the
           real fix, unless the customer is already steering it by hand */
        if (map && !userMoved) flyToFix();
        elMvConfirm.disabled = false;
      }
      /* refused / GPS off / plain-http page: say so on the open map, so the customer
         knows to steer it by hand instead of staring at the middle of Tangier */
      else if (mvOpen && !userMoved) mvMessage(MV_NOFIX);
      if (!gps.ok) geoFail(gps.why);
      /* denied / no fix: no red chip, no scare — the customer moves the map by hand,
         and the confirmation call covers everything else */
      return state.geo;
    });
    return geoPromise;
  }

  function setCoords(latlng) {
    state.geo = { ok: true, lat: latlng.lat, lng: latlng.lng };
    state.pinned = true;
    setLoc('pin');
  }

  /* ---------------------------------------------------------------------------
     Location picker — full screen, Glovo-style: the pin is fixed at the centre and
     the customer moves the MAP under it, then confirms. MapLibre loads on demand.
     ------------------------------------------------------------------------- */
  var libState = 'none'; /* none | loading | ready | error */
  var libCbs = [];
  var map = null;
  var mvOpen = false;
  var mvPushed = false;
  var userMoved = false;   /* the customer dragged / zoomed the map themselves */
  var lastFix = null;      /* the latest GPS fix, kept even after a hand-placed spot */
  var flyTarget = null;    /* where a programmatic glide is heading (GPS / search) */
  var searchSpot = null;   /* a picked search result, kept for when the map engine is down */

  var MV_HINT = 'حرك الخريطة حتى تجي العلامة فوق الدار ديالك';
  var MV_FAIL = 'ما قدرناش نحلو الخريطة — كتب العنوان فالخانات، ونأكدو معاك فالتيليفون';
  var MV_NOFIX = 'ما لقيناش موقعك — حرك الخريطة بيدك';

  function loadLib(cb) {
    if (libState === 'ready') { cb(true); return; }
    if (libState === 'error') { cb(false); return; }
    libCbs.push(cb);
    if (libState === 'loading') return;
    libState = 'loading';
    var done = function (ok) {
      libState = ok ? 'ready' : 'error';
      var cbs = libCbs; libCbs = [];
      cbs.forEach(function (f) { f(ok); });
    };
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = MAPLIBRE_CSS;
    document.head.appendChild(link);
    var sc = document.createElement('script');
    sc.src = MAPLIBRE_JS;
    sc.async = true;
    sc.onload = function () { done(!!window.maplibregl); };
    sc.onerror = function () { done(false); };
    document.head.appendChild(sc);
  }

  function mvMessage(text) {
    elMvMsg.textContent = text || '';
    elMvMsg.hidden = !text;
  }

  function flyTo(lat, lng, zoom) {
    if (!map) return;
    flyTarget = { lat: lat, lng: lng };
    map.flyTo({ center: [lng, lat], zoom: zoom || 17, speed: 1.6 });
  }

  function flyToFix() {
    if (lastFix) flyTo(lastFix.lat, lastFix.lng, 17);
  }

  function initMap() {
    if (map) { map.resize(); return; }
    var has = !!(state.geo && state.geo.ok);
    var start = has ? [state.geo.lng, state.geo.lat] : TANGIER;
    try {
      var gl = window.maplibregl;
      try {
        if (gl.getRTLTextPluginStatus && gl.getRTLTextPluginStatus() === 'unavailable') {
          var pr = gl.setRTLTextPlugin(MAPLIBRE_RTL, true);
          if (pr && pr.catch) pr.catch(function () { /* labels fall back to unshaped */ });
        }
      } catch (e) { /* no RTL shaping: the map still works */ }
      map = new gl.Map({
        container: elMap, style: MAP_STYLE, center: start,
        zoom: has ? 17 : 13, minZoom: 10, maxZoom: 19,
        dragRotate: false, pitchWithRotate: false, touchPitch: false,
        attributionControl: { compact: true }
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.on('movestart', function (e) {
        elMv.classList.add('is-moving');
        if (e && e.originalEvent) {
          userMoved = true; flyTarget = null; mvMessage('');
          hideResults(); if (document.activeElement === elMvQ) elMvQ.blur();
        }
      });
      map.on('moveend', function () {
        elMv.classList.remove('is-moving');
        if (userMoved) elMvConfirm.disabled = false;
      });
      /* a tile or style that fails to load leaves a plain, still-draggable map —
         never a broken screen; only a dead engine shows the failure note */
      map.on('error', function () {});
    } catch (e) {
      map = null;
      mvMessage(MV_FAIL);
    }
  }

  function openMapView() {
    if (mvOpen) return;
    mvOpen = true;
    elMv.classList.add('is-open');
    elMv.removeAttribute('inert');
    elMv.removeAttribute('aria-hidden');
    try { history.pushState({ br: 'map' }, ''); mvPushed = true; } catch (e) { mvPushed = false; }
    elMapHint.textContent = MV_HINT;
    elMvConfirm.disabled = !(state.geo && state.geo.ok);
    mvMessage('');
    elMvClose.focus();
    track('map_open', {});
    loadLib(function (ok) {
      if (!ok) { mvMessage(MV_FAIL); return; }
      if (mvOpen) initMap();
    });
  }

  function closeMapView(fromBack) {
    if (!mvOpen) return;
    mvOpen = false;
    elMv.classList.remove('is-open', 'is-moving');
    elMv.setAttribute('inert', '');
    elMv.setAttribute('aria-hidden', 'true');
    if (mvPushed) { mvPushed = false; if (!fromBack) popOwnEntry(); }
    elMapBtn.focus();
  }

  function confirmSpot() {
    /* how the spot was chosen: a searched place (even nudged after), the map steered by
       hand, or the GPS fix left as it was */
    var how = searchSpot ? 'search' : (userMoved ? 'drag' : 'gps');
    if (map) {
      /* mid-glide (GPS / search) = where the glide is going, never a point on the way */
      var c = (flyTarget && map.isMoving()) ? flyTarget : map.getCenter();
      setCoords({ lat: c.lat, lng: c.lng });
    } else if (searchSpot) {
      setCoords(searchSpot);
    } else if (!(state.geo && state.geo.ok)) {
      return;   /* nothing to confirm: no map and no fix */
    }
    track('map_pick', { how: how });
    pxc('MapPick', { how: how });
    clarityEvent('map_pick');
    closeMapView(false);
  }

  /* ---- place search ------------------------------------------------------ */
  var qTimer = null;
  var qSeq = 0;
  var qResults = [];

  function normAr(t) {
    return t.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u0652\u0640]/g, '');
  }

  function geoQuery(raw) {
    var q = normAr(raw.trim());
    for (var i = 0; i < GEO_ALIASES.length; i++) {
      if (q.indexOf(GEO_ALIASES[i][0]) !== -1) q = q.replace(GEO_ALIASES[i][0], GEO_ALIASES[i][1]);
    }
    return q;
  }

  function hideResults() {
    elMvRes.hidden = true;
    elMvRes.textContent = '';
    elMvQ.setAttribute('aria-expanded', 'false');
  }

  function resultsNote(text) {
    elMvRes.textContent = '';
    var li = document.createElement('li');
    li.className = 'mv-res-note';
    li.textContent = text;
    elMvRes.appendChild(li);
    elMvRes.hidden = false;
    elMvQ.setAttribute('aria-expanded', 'true');
  }

  function placeLabel(pr) {
    var name = pr.name || [pr.street, pr.housenumber].filter(Boolean).join(' ');
    var sub = [pr.name ? pr.street : null, pr.district || pr.locality, pr.city]
      .filter(function (v, i, a) { return v && v !== name && a.indexOf(v) === i; });
    /* city names come trilingual from OSM («Tanger ⵟⴰⵏⵊⴰ طنجة») — keep the first word */
    sub = sub.map(function (v) { return String(v).split(/\s(?=[\u2D30-\u2D7F\u0600-\u06FF])/)[0]; });
    /* \u00ABarrondissement de Tanger-Medina\u00BB -> \u00ABTanger-Medina\u00BB: the admin prefix is noise */
    sub = sub.map(function (v) { return v.replace(/^arrondissement (de |d\u2019|d')/i, ''); });
    return { name: name || '—', sub: sub.join('، ') };
  }

  function renderResults(features) {
    qResults = [];
    var seen = {};
    features.forEach(function (f) {
      if (!f || !f.geometry || !f.geometry.coordinates) return;
      var lab = placeLabel(f.properties || {});
      var k = lab.name + '|' + lab.sub;
      if (seen[k] || qResults.length >= 5) return;
      seen[k] = true;
      qResults.push({ lab: lab, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
                      wide: /^(suburb|neighbourhood|quarter|city_district|village|town|city)$/.test((f.properties || {}).osm_value || '') });
    });
    if (!qResults.length) { track('map_search', { hit: false }); resultsNote('ما لقينا والو — جرب اسم الحي ولا بلاصة قريبة (مثلا: Malabata, Iberia)'); return; }
    elMvRes.textContent = '';
    qResults.forEach(function (r, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mv-res';
      b.setAttribute('role', 'option');
      b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg>';
      var t = document.createElement('span');
      t.className = 'mv-res-txt';
      var n = document.createElement('span'); n.className = 'mv-res-name'; n.textContent = r.lab.name;
      var sb = document.createElement('span'); sb.className = 'mv-res-sub'; sb.textContent = r.lab.sub;
      t.appendChild(n); if (r.lab.sub) t.appendChild(sb);
      b.appendChild(t);
      b.addEventListener('click', function () { pickResult(i); });
      li.appendChild(b);
      elMvRes.appendChild(li);
    });
    elMvRes.hidden = false;
    elMvQ.setAttribute('aria-expanded', 'true');
  }

  function runSearch(raw) {
    var seq = ++qSeq;
    var q = geoQuery(raw);
    resultsNote('كنقلبو...');
    var url = GEO_URL + '?q=' + encodeURIComponent(q) + '&limit=8&lang=fr&bbox=' + GEO_BBOX +
      '&lat=' + TANGIER[1] + '&lon=' + TANGIER[0];
    var done = function (features) { if (seq === qSeq) renderResults(features); };
    var fail = function () { if (seq === qSeq) resultsNote('البحث ما خدامش دابا — حرك الخريطة بيدك'); };
    try {
      fetch(url, { credentials: 'omit' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { done((d && d.features) || []); })
        .catch(fail);
    } catch (e) { fail(); }
  }

  function onQueryInput() {
    var raw = elMvQ.value;
    elMvQx.hidden = !raw;
    clearTimeout(qTimer);
    if (raw.trim().length < 3) { qSeq++; hideResults(); return; }
    qTimer = setTimeout(function () { runSearch(raw); }, 350);
  }

  function pickResult(i) {
    var r = qResults[i];
    if (!r) return;
    userMoved = true;      /* a searched place outranks a late GPS fix */
    searchSpot = { lat: r.lat, lng: r.lng };
    elMvQ.value = r.lab.name;
    track('map_search', { hit: true });
    elMvQx.hidden = false;
    hideResults();
    elMvQ.blur();          /* drop the keyboard so the map is visible */
    mvMessage('');
    elMapHint.textContent = 'حرك الخريطة شوية حتى تجي العلامة فوق الباب بالضبط';
    flyTo(r.lat, r.lng, r.wide ? 15 : 17);
    elMvConfirm.disabled = false;
  }

  function locateMe() {
    if (lastFix) { userMoved = false; flyToFix(); return; }
    elMvLocate.classList.add('is-busy');
    getPosition().then(function (gps) {
      elMvLocate.classList.remove('is-busy');
      if (!gps.ok) { mvMessage(MV_NOFIX); geoFail(gps.why); return; }
      lastFix = { lat: gps.lat, lng: gps.lng };
      if (!state.pinned) { state.geo = { ok: true, lat: gps.lat, lng: gps.lng }; setLoc('ok'); }
      userMoved = false;
      flyToFix();
      elMvConfirm.disabled = false;
    });
  }

  /* ---------------------------------------------------------------------------
     WhatsApp handoff (no minimum since 2026-08-10 — a small basket pays the
     DELIVERY_FEE instead of being blocked)
     ------------------------------------------------------------------------- */
  var WA_LABEL = 'صيفط الطلب فالواتساب';
  var WA_LOADING = 'كنجيبو الموقع...';

  function sendOrder() {
    if (elWa.disabled || cartCount() === 0) return;

    /* coords are usually already in hand — only wait if the fix is still pending.
       The wait is HARD-CAPPED at 4s: a customer who ignored the GPS permission
       prompt must never end up with a dead send button. No fix by then -> the
       order simply goes out «بلا GPS» (address fields + the delivery call cover it). */
    if (geoPromise && !geoSettled) {
      elWa.disabled = true;
      elWa.setAttribute('aria-disabled', 'true');
      elWa.classList.add('is-loading');
      elWa.textContent = WA_LOADING;
      var handedOff = false;
      var proceed = function () {
        if (handedOff) return; handedOff = true;
        elWa.classList.remove('is-loading');
        elWa.textContent = WA_LABEL;
        syncWaEnabled();
        handoff();
      };
      geoPromise.then(proceed);
      setTimeout(proceed, 4000);
      return;
    }
    handoff();
  }

  function handoff() {
    var lines = cartLines();
    var total = cartTotal();
    var fee = deliveryFee(total);
    var code = orderCode();
    var msg = buildOrderMessage(lines, total, fee, readAddr(), state.geo, code);

    /* BEFORE the hand-off: this tab may navigate away a millisecond later and sendBeacon is
       what survives that. Same code as the message carries, so the server can merge the two.
       total = the cash at the door (subtotal + delivery fee when one applies) — it must
       match the message's «المجموع:» line or the dashboard revenue drifts from reality. */
    sheetSent = true;
    track('send', withAttribution({
      code: code,
      total: total + fee,
      hasGps: !!(state.geo && state.geo.ok),
      items: lines.map(function (l) { return { id: l.id, size: l.size, qty: l.qty }; })
    }));
    clarityEvent('send');
    /* Lead = the conversion this business optimizes ads on (an order sent to WhatsApp) */
    px('Lead', { value: total + fee, currency: 'MAD' });

    var url = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
    var win = null;
    try { win = window.open(url, '_blank'); } catch (e) { win = null; }
    if (!win) window.location.href = url; /* popup blocked */
  }

  function syncWaEnabled() {
    /* while sendOrder() holds the button in its ≤4s GPS-wait state, a re-render
       (e.g. a stepper tap) must not re-enable it mid-wait */
    if (elWa.classList.contains('is-loading')) return;
    /* the address is optional now — only a non-empty cart gates the button */
    var ok = cartCount() > 0;
    elWa.disabled = !ok;
    elWa.setAttribute('aria-disabled', ok ? 'false' : 'true');
  }

  /* ---------------------------------------------------------------------------
     Snail animation fallback (when scroll-driven animations are unsupported)
     ------------------------------------------------------------------------- */
  function initSnail() {
    var snail = document.querySelector('.snail');
    if (!snail) return;
    var hasTimeline = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()'));
    if (hasTimeline || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          snail.classList.add('is-in');
          io.disconnect();
        }
      });
    }, { threshold: .35 });
    io.observe(document.getElementById('snail-slot'));
  }

  /* ---------------------------------------------------------------------------
     Wiring
     ------------------------------------------------------------------------- */
  function goMenu() {
    if (!elMenu) return;
    window.scrollTo({
      top: elMenu.getBoundingClientRect().top + window.pageYOffset - 8,
      behavior: 'smooth'
    });
  }

  function init() {
    restore();

    $$('[data-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pick(btn.getAttribute('data-pick'), parseInt(btn.getAttribute('data-si'), 10));
      });
    });

    $$('[data-dec]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var had = document.activeElement === btn;
        step(key(btn.getAttribute('data-dec'), parseInt(btn.getAttribute('data-dec-si'), 10)), -1);
        /* at zero the − hides: keep keyboard focus on that row's «زيد» instead of losing it */
        if (had && !btn.offsetParent) {
          var addBtn = btn.parentNode.querySelector('[data-add]');
          if (addBtn) addBtn.focus();
        }
      });
    });

    $$('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var fixed = btn.getAttribute('data-add-si');   /* hero cards pin their size */
        addItem(btn.getAttribute('data-add'), fixed === null ? undefined : parseInt(fixed, 10));
      });
    });

    elCtaOpen.addEventListener('click', goMenu);
    $('#cta-closed-btn').addEventListener('click', goMenu);

    /* Hero actions. The wa.me href is built here so the Darija text is encoded by the
       browser, never by hand; the plain href in the HTML stays as the no-JS fallback. */
    var elCtaTop = $('#cta-top');
    var elWaDirect = $('#wa-direct');
    var elCallDirect = $('#call-direct');

    if (elCtaTop) elCtaTop.addEventListener('click', goMenu);

    if (elWaDirect) {
      elWaDirect.href = directWaUrl('');
      /* Fire-and-forget, exactly like every other beacon: the tab may navigate away a
         millisecond later, so nothing is awaited and a dead tracker changes nothing. */
      elWaDirect.addEventListener('click', function () { contact('wa', elWaDirect); });
    }

    if (elCallDirect) {
      elCallDirect.addEventListener('click', function () { contact('call', null); });
    }

    elCartBtn.addEventListener('click', openSheet);
    elSheetClose.addEventListener('click', closeSheet);
    elScrim.addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mvOpen) { e.preventDefault(); closeMapView(false); }
      else if (e.key === 'Escape' && state.open) { e.preventDefault(); closeSheet(); }
      trapTab(e);
    });

    /* opt-in location (2026-08-10): tapping the map button is the ONLY thing that
       triggers the OS permission popup — and the map opens under it either way */
    elMapBtn.addEventListener('click', function () { requestGeo(); openMapView(); });

    /* one-tap cart (2026-10-18): the address + map live behind an optional fold so the
       first screen is items, total, send. Typed text and a pin survive folding. */
    var elAddrToggle = $('#addr-toggle');
    var elAddrBox = $('#addr-box');
    if (elAddrToggle && elAddrBox) {
      elAddrToggle.addEventListener('click', function () {
        var open = elAddrBox.hidden;
        elAddrBox.hidden = !open;
        elAddrToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) elAddrRes.focus();
      });
    }
    elMvClose.addEventListener('click', function () { closeMapView(false); });
    elMvConfirm.addEventListener('click', confirmSpot);
    elMvLocate.addEventListener('click', locateMe);
    elMvQ.addEventListener('input', onQueryInput);
    elMvQ.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (qResults.length && !elMvRes.hidden && elMvRes.querySelector('.mv-res')) { pickResult(0); return; }
      if (elMvQ.value.trim().length >= 2) { clearTimeout(qTimer); runSearch(elMvQ.value); }
    });
    elMvQx.addEventListener('click', function () {
      elMvQ.value = ''; elMvQx.hidden = true; qSeq++; hideResults(); elMvQ.focus();
    });
    elWa.addEventListener('click', sendOrder);
    initSheetDrag();
    /* the phone's back button closes the top layer only: map first, then the sheet */
    window.addEventListener('popstate', function () {
      if (ownPops > 0) { ownPops--; return; }
      if (mvOpen) { mvPushed = false; closeMapView(true); return; }
      if (state.open) { sheetPushed = false; closeSheet(); }
    });

    /* closed by default */
    elSheet.setAttribute('inert', '');
    elSheet.setAttribute('aria-hidden', 'true');

    setLoc('idle');
    syncWaEnabled();
    applyHours();
    lastCount = cartCount(); /* no badge bump for a restored cart */
    render();
    initSnail();

    /* ?s= source tag (2026-08-10): ?s=bio on the Instagram link, ?s=ad on campaign
       URLs — the only way to tell paid, bio and word-of-mouth traffic apart. */
    var src = null, camp = null;
    try {
      var sm = /[?&]s=([a-z0-9_-]{1,16})(?:&|$)/i.exec(location.search);
      if (sm) src = sm[1].toLowerCase();
      /* ?c= the ad's own name — the ad's URL parameters carry c={{ad.name}} (2026-10-12) */
      var cm = /[?&]c=([a-z0-9_-]{1,32})(?:&|$)/i.exec(location.search);
      if (cm && src) camp = cm[1].toLowerCase();
    } catch (e) { src = null; camp = null; }
    if (src) saveTouch(src, camp);
    var visit = {};
    if (src) visit.s = src;
    if (camp) visit.c = camp;
    try {
      if (window.clarity) {
        window.clarity('identify', visitorId());
        window.clarity('set', 'src', src || 'direct');
        if (camp) window.clarity('set', 'ad', camp);
      }
    } catch (e) { /* Clarity is optional */ }
    track('visit', visit);   /* once per page load, last so a failure cannot delay the UI */
    initScrollMarks();

    setInterval(applyHours, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) applyHours();
    });
  }

  /* How far down people get, once per mark per page load: the gallery (25), the video
     (50), the order section (75), the last line of the page (100). */
  function initScrollMarks() {
    if (!('IntersectionObserver' in window)) return;
    var marks = [['#gallery', 25], ['#vidbox', 50], ['#order', 75], ['.note', 100]];
    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          track('scroll', { depth: Number(en.target.getAttribute('data-depth')) });
        });
      }, { threshold: 0.35 });
      marks.forEach(function (m) {
        var el = document.querySelector(m[0]);
        if (!el) return;
        el.setAttribute('data-depth', String(m[1]));
        io.observe(el);
      });
    } catch (e) { /* no marks, nothing else changes */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
