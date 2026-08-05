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
    complet:   { name: 'الطبق الكامل',  sizes: [['زوجي', 50], ['عائلي', 100]] },
    babbouche: { name: 'باك الببوش',    sizes: [['وسط', 37], ['عائلي', 50]] },
    hummus:    { name: 'باك الحمص',     sizes: [['وسط', 20], ['عائلي', 35]] },
    marqa:     { name: 'مرقة زيادة',    sizes: [['', 6]] },
    batata:    { name: 'بطاطا مسلوقة',  sizes: [['', 10]] }
  };

  /* The Meta Cloud API number. Orders land here; the VPS concierge bot auto-acks the
     customer and forwards the order to Saif's personal phone (212677710579).
     Flipped 2026-08-03 after the relay was verified end to end.
     Rollback: set this to '212677710579' to send orders straight to Saif again. */
  var WA_NUMBER = '212647351006';
  var STORE_KEY = 'br-cart-v2';  /* v2 2026-08-04: menu repriced + complet resized —
                                    a v1 cart's size indexes would silently map onto
                                    the NEW prices, so old carts must not restore. */
  var OPEN_HOUR = 18;    /* 18:00 inclusive */
  var CLOSE_HOUR = 0;    /* closes 00:30 the next day */
  var CLOSE_MIN = 30;    /* 00:30 exclusive */
  var TZ = 'Africa/Casablanca';
  var DIV = '─────────────';
  var MIN_ORDER = 34;         /* dh product floor — silent until a send is actually
                                 blocked by it. Add-ons (and a lone 20 dh حمص) can
                                 never carry a delivery run. */
  var FREE_DELIVERY_AT = 40;  /* subtotal >= this -> delivery free. Below it a fee
                                 applies — framed as a gift threshold, not a rule
                                 (decided 2026-08-04, replaced the hard 40 minimum). */
  var DELIVERY_FEE = 10;      /* dh, charged only under the threshold */

  /* Traceability: invisible, no UI, fire-and-forget. If the VPS is down or slow NOTHING here
     changes — every call is inside try/catch, nothing is awaited, no response is read. */
  var TRACK_URL = 'https://suivipatient.duckdns.org/barachid/track';
  var VID_KEY = 'br-vid';
  /* No 0/O/1/I/L — the code gets read aloud on the phone and written on a lid. */
  var CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /* Leaflet is self-hosted and lazy: nothing below loads until the map button */
  var LEAFLET_CSS = 'vendor/leaflet/leaflet.css';
  var LEAFLET_JS = 'vendor/leaflet/leaflet.js';
  var LEAFLET_IMG = 'vendor/leaflet/images/';
  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_ATTR = '© OpenStreetMap';
  var TANGIER = [35.7595, -5.8340];

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
    var geo = (gpsResult && gpsResult.ok)
      ? 'https://maps.google.com/?q=' + Number(gpsResult.lat).toFixed(6) + ',' + Number(gpsResult.lng).toFixed(6)
      : 'بلا GPS';
    lines.push('📍 ' + geo);
    /* An ARGUMENT, not generated here: keeps this function pure and testable, and lets
       bot/tracking.py parse_order be tested against a fixed string. */
    if (code) lines.push('🔖 كود: #' + code);
    lines.push('💰 كاش عند الباب');
    return lines.join('\n');
  }
  window.buildOrderMessage = buildOrderMessage;

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
     State
     ------------------------------------------------------------------------- */
  var state = {
    cart: [],                                        /* [{k, id, si, qty}] */
    sel: { complet: 1, babbouche: 0, hummus: 0 },    /* mock defaults */
    flash: {},
    open: false,
    geo: null,        /* { ok: true, lat, lng } — auto fix or hand-placed pin */
    pinned: false,    /* true once the user moved the marker themselves */
    minShown: false
  };
  var flashTimers = {};
  var lastFocus = null;

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
    if (data.sel && typeof data.sel === 'object') {
      ['complet', 'babbouche', 'hummus'].forEach(function (id) {
        var v = data.sel[id];
        if (typeof v === 'number' && v >= 0 && v < CATALOG[id].sizes.length) state.sel[id] = v;
      });
    }
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
  var elMapCenterBtn = $('#map-center-btn');
  var elMapHint = $('#map-hint');
  var elMap = $('#map');
  var elMinNotice = $('#min-notice');
  var elDelivery = $('#delivery-text');
  var elGrandRow = $('#grand-row');
  var elGrandText = $('#grand-text');
  var elNudge = $('#free-nudge');
  var elWa = $('#wa-btn');
  var elMenu = $('#menu');

  var LOC_TEXT = {
    idle: '📍 كنجيبو الموقع ديالك...',
    ok: '📍 الموقع تسجل ✔',
    pin: '📍 الموقع تحدد ✔',
    fail: '📍 ما قدرناش ناخدو الموقع — عمر العنوان ولا حدد فالخريطة'
  };
  var LOC_CLASS = { idle: 'is-idle', ok: 'is-ok', pin: 'is-ok', fail: 'is-fail' };

  function setLoc(kind) {
    elLoc.className = 'locchip ' + LOC_CLASS[kind];
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

    /* add buttons (flash state) */
    $$('[data-add]').forEach(function (btn) {
      var id = btn.getAttribute('data-add');
      var on = !!state.flash[id];
      btn.classList.toggle('is-flash', on);
      btn.querySelector('.add-lbl').textContent = on ? 'تزاد ✔' : '+';
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
    elTotal.textContent = total + ' درهم';

    /* delivery: free at the threshold, a fee under it — sold as a gift to unlock,
       never as a penalty. The nudge does the upsell the old hard minimum used to. */
    var fee = deliveryFee(total);
    if (count > 0 && fee > 0) {
      elDelivery.textContent = fee + ' درهم';
      elDelivery.classList.remove('is-free');
      elGrandRow.hidden = false;
      elGrandText.textContent = (total + fee) + ' درهم';
      elNudge.hidden = false;
      elNudge.textContent = 'زيد ' + (FREE_DELIVERY_AT - total) + ' درهم وولي التوصيل فابور 🎁';
    } else {
      elDelivery.textContent = 'فابور 🎁';
      elDelivery.classList.add('is-free');
      elGrandRow.hidden = true;
      elNudge.hidden = true;
    }

    /* the send button must track the cart on EVERY change — it starts disabled on an
       empty cart, and a first-time visitor who adds items would otherwise be left with
       a dead button (init() only syncs once, at load). */
    syncWaEnabled();

    /* the minimum-order notice disappears the moment the cart clears the bar */
    if (state.minShown && total >= MIN_ORDER) hideMinNotice();

    /* empty cart auto-closes the sheet */
    if (count === 0 && state.open) closeSheet();
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
      dec.textContent = '−';
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
      inc.textContent = '+';
      inc.setAttribute('aria-label', 'زيد من ' + it.name);
      inc.setAttribute('data-step-k', it.k);
      inc.setAttribute('data-step-d', '1');
      inc.addEventListener('click', function () { step(it.k, 1); });

      stepper.appendChild(dec);
      stepper.appendChild(qty);
      stepper.appendChild(inc);

      var tot = document.createElement('div');
      tot.className = 'line-total';
      tot.textContent = it.total + ' درهم';

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
  function addItem(id) {
    var si = state.sel[id] || 0;
    var k = key(id, si);
    var i = -1;
    for (var n = 0; n < state.cart.length; n++) { if (state.cart[n].k === k) { i = n; break; } }
    if (i >= 0) state.cart[i].qty += 1;
    else state.cart.push({ k: k, id: id, si: si, qty: 1 });

    track('add', { id: id, size: CATALOG[id].sizes[si][0], price: CATALOG[id].sizes[si][1] });

    state.flash[id] = true;
    clearTimeout(flashTimers[id]);
    flashTimers[id] = setTimeout(function () {
      state.flash[id] = false;
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
    elSheetClose.focus();
    track('sheet', {});
    requestGeo(); /* ask on open, not at send time — gives the user time to fix it */
  }

  function closeSheet() {
    if (!state.open) return;
    state.open = false;
    elSheet.classList.remove('is-open');
    elScrim.classList.remove('is-open');
    elSheet.setAttribute('inert', '');
    elSheet.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    hideMinNotice(); /* never greet a reopened sheet with a warning they didn't trigger */

    /* never leave focus stranded inside the now-inert sheet */
    var target = (lastFocus && lastFocus.focus && lastFocus !== document.body && document.contains(lastFocus))
      ? lastFocus
      : (elCartBtn.hidden ? null : elCartBtn);
    var act = document.activeElement;
    if (act && act !== document.body && elSheet.contains(act) && act.blur) act.blur();
    if (target) target.focus();
    lastFocus = null;
  }

  function trapTab(e) {
    if (e.key !== 'Tab' || !state.open) return;
    var items = Array.prototype.slice.call(elSheet.querySelectorAll(FOCUSABLE))
      .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------------------------------------------------------------------
     Hours gate — real Africa/Casablanca clock, window crosses midnight
     (18:00 → 00:30 the next day)
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
    return t.h >= OPEN_HOUR || (t.h === CLOSE_HOUR && t.m < CLOSE_MIN);
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
      if (!navigator.geolocation) { resolve({ ok: false }); return; }
      var done = false;
      /* The geolocation `timeout` option only starts counting AFTER the user answers
         the permission prompt. If they dismiss/ignore the prompt, neither callback
         ever fires and the promise would hang forever — so we enforce our own hard
         deadline. Without this, the send button could stay frozen in loading state. */
      setTimeout(function () {
        if (done) return; done = true;
        resolve({ ok: false });
      }, 12000);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (done) return; done = true;
          resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        function () {
          if (done) return; done = true;
          resolve({ ok: false });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  function requestGeo() {
    if (state.geo && state.geo.ok) return geoPromise;   /* already located or pinned */
    if (geoPromise && !geoSettled) return geoPromise;    /* one request in flight */

    geoSettled = false;
    setLoc('idle');
    geoPromise = getPosition().then(function (gps) {
      geoSettled = true;
      if (state.pinned) {                 /* the user beat us to it on the map */
        elMapBtn.hidden = false;
        return state.geo;
      }
      if (gps.ok) { state.geo = { ok: true, lat: gps.lat, lng: gps.lng }; setLoc('ok'); }
      else { state.geo = null; setLoc('fail'); }
      elMapBtn.hidden = false;            /* pin path is offered either way */
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
     Leaflet — self-hosted, injected once, only on demand
     ------------------------------------------------------------------------- */
  var leafletState = 'none'; /* none | loading | ready | error */
  var leafletCbs = [];
  var map = null;
  var marker = null;

  function flushLeafletCbs(ok) {
    var cbs = leafletCbs;
    leafletCbs = [];
    cbs.forEach(function (cb) { cb(ok); });
  }

  function loadLeaflet(cb) {
    if (leafletState === 'ready') { cb(true); return; }
    leafletCbs.push(cb);
    if (leafletState === 'loading') return;
    leafletState = 'loading';

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    var s = document.createElement('script');
    s.src = LEAFLET_JS;
    s.async = true;
    s.onload = function () { leafletState = 'ready'; flushLeafletCbs(true); };
    s.onerror = function () { leafletState = 'error'; flushLeafletCbs(false); };
    document.head.appendChild(s);
  }

  function initMap() {
    if (map) return;
    L.Icon.Default.imagePath = LEAFLET_IMG;

    var hasFix = !!(state.geo && state.geo.ok);
    var center = hasFix ? [state.geo.lat, state.geo.lng] : TANGIER;

    map = L.map(elMap, { zoomControl: true }).setView(center, hasFix ? 16 : 13);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);

    marker = L.marker(center, { draggable: true, autoPan: true, keyboard: true }).addTo(map);
    marker.on('dragend', function () { setCoords(marker.getLatLng()); });
    map.on('click', function (e) { marker.setLatLng(e.latlng); setCoords(e.latlng); });
  }

  function showMap() {
    elMapBtn.disabled = true;
    loadLeaflet(function (ok) {
      elMapBtn.disabled = false;
      if (!ok) {
        elMapHint.hidden = false;
        elMapHint.textContent = 'ما قدرناش نحلو الخريطة — عمر العنوان عافاك';
        return;
      }
      elMap.hidden = false;
      elMapHint.hidden = false;
      elMapCenterBtn.hidden = false;
      /* no fix → the pin IS the location; with a fix → the pin is just correctable */
      elMapHint.textContent = (state.geo && state.geo.ok)
        ? 'جر العلامة إلا بغيتي تصحح البلاصة'
        : 'جر العلامة للبلاصة ديالك';
      initMap();
      setTimeout(function () { if (map) map.invalidateSize(); }, 60);
      elMap.focus();
    });
  }

  /* ---------------------------------------------------------------------------
     Minimum order + WhatsApp handoff
     ------------------------------------------------------------------------- */
  var WA_LABEL = 'صيفط الطلب فالواتساب ✅';
  var WA_LOADING = '⏳ كنجيبو الموقع...';

  function deliveryFee(subtotal) {
    return subtotal >= FREE_DELIVERY_AT ? 0 : DELIVERY_FEE;
  }

  function showMinNotice() {
    state.minShown = true;
    elMinNotice.hidden = false;
    elMinNotice.classList.remove('is-shake');
    void elMinNotice.offsetWidth; /* force reflow so the animation re-triggers */
    elMinNotice.classList.add('is-shake');
  }

  function hideMinNotice() {
    state.minShown = false;
    elMinNotice.hidden = true;
    elMinNotice.classList.remove('is-shake');
  }

  function sendOrder() {
    if (elWa.disabled || cartCount() === 0) return;
    if (cartTotal() < MIN_ORDER) { showMinNotice(); return; }
    hideMinNotice();

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
       total = the GRAND total (with any delivery fee) — it must equal the cash at the door. */
    track('send', {
      code: code,
      total: total + fee,
      hasGps: !!(state.geo && state.geo.ok),
      items: lines.map(function (l) { return { id: l.id, size: l.size, qty: l.qty }; })
    });

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

    $$('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () { addItem(btn.getAttribute('data-add')); });
    });

    elCtaOpen.addEventListener('click', goMenu);
    $('#cta-closed-btn').addEventListener('click', goMenu);

    elCartBtn.addEventListener('click', openSheet);
    elSheetClose.addEventListener('click', closeSheet);
    elScrim.addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) { e.preventDefault(); closeSheet(); }
      trapTab(e);
    });

    elMapBtn.addEventListener('click', showMap);
    elMapCenterBtn.addEventListener('click', function () {
      /* keyboard path: the map pans with the arrow keys, this drops the pin */
      if (!map || !marker) return;
      var c = map.getCenter();
      marker.setLatLng(c);
      setCoords(c);
    });
    elWa.addEventListener('click', sendOrder);

    /* closed by default */
    elSheet.setAttribute('inert', '');
    elSheet.setAttribute('aria-hidden', 'true');

    setLoc('idle');
    syncWaEnabled();
    applyHours();
    lastCount = cartCount(); /* no badge bump for a restored cart */
    render();
    initSnail();

    track('visit', {});   /* once per page load, last so a failure cannot delay the UI */

    setInterval(applyHours, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) applyHours();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
