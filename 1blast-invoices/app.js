(function () {
  var LS_SETTINGS = "blast-invoice.v4.settings";
  var LS_DRAFT = "blast-invoice.v2.draft";
  var LS_SAVED = "blast-invoice.v2.saved";
  var SNAP_KEYS = ["bizName", "bizTagline", "bizPhone", "bizEmail", "bizWebsite", "bizAddr", "bizRegNo", "bizVatNo", "bankName", "bankSort", "bankAcc", "payDays", "quoteDays", "currency", "taxRate", "taxLabel", "notes"];

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { storageProblem(); return false; } }
  // Tell the person once in a while (not on every keystroke) when the phone won't save
  var storeWarned = 0;
  function storageProblem() {
    if (Date.now() - storeWarned < 15000) return;
    storeWarned = Date.now();
    setTimeout(function () { toast("Couldn't save on this phone: its storage is full or blocked. Turn on online saving, or make a backup now.", null, null, 7000); }, 0);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function uid() { return "inv-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }
  function lid() { return "l" + Math.random().toString(36).slice(2, 9); }
  var $ = function (id) { return document.getElementById(id); };

  var APP_NAME = "Time Well Billed";
  // The three charges the first version had, kept so older saved setups carry over
  var LEGACY_SERVICES = [
    { id: "gen", name: "General time", desc: "Bushing pressing, paint stripping and bolt removal", type: "hourly", rate: "40", hrs: "", amt: "" },
    { id: "blast", name: "Sandblasting", desc: "Sandblasting", type: "hourly", rate: "65", hrs: "", amt: "" },
    { id: "abt", name: "After blast treatment", desc: "After blast treatment", type: "fixed", rate: "", hrs: "", amt: "45" }
  ];
  var defaultSettings = {
    bizName: "", bizTagline: "", bizPhone: "", bizEmail: "", bizWebsite: "", bizAddr: "",
    bizRegNo: "", bizVatNo: "", bankName: "", bankSort: "", bankAcc: "", payDays: "14",
    currency: "GBP", taxRate: "0", taxLabel: "VAT",
    notes: "Thank you for your business.",
    signName: "",
    msgTemplate: "Hi {customer}, here's invoice {number} from {business} for {total}. {due}Thanks!",
    quoteDays: "30",
    quoteTemplate: "Hi {customer}, here's your quote {number} from {business} for {total}. {valid}Let me know if you'd like to go ahead. Thanks!",
    rcptTemplate: "Hi {customer}, thanks for paying invoice {number} ({total}). Your receipt is attached. Thanks, {business}",
    remTemplate: "Hi {customer}, just a friendly reminder that invoice {number} for {total} from {business} hasn't been paid yet. {due}Thanks!",
    lastMethod: "Bank transfer",
    timeRound: "15", vatStagger: "1", vatBasis: "invoice",
    theme: "auto", appColours: "brand", fontPair: "workshop", invDesign: "classic",
    docWord: "", quoteWord: "", billToLabel: "", termsText: "", numStyle: "plain", numStart: "",
    showJob: true, showHours: true, showVat: true, showPay: true, showNotes: true, showLegal: true, paidStamp: true,
    homeOrder: ["stats", "chase", "bill", "quotes", "chart", "vat"], homeOff: [],
    timerStyle: "clock", swipe: true, quickPanel: true, emailCard: true,
    logo: "", logoW: 0, logoH: 0,
    brandColor: "#16323a", accentColor: "#f4a62a", setupDone: false,
    services: [
      { id: "labour", name: "Labour", desc: "Labour", type: "hourly", rate: "", hrs: "", amt: "" },
      { id: "materials", name: "Materials", desc: "Materials", type: "each", rate: "", hrs: "", amt: "" },
      { id: "callout", name: "Call-out charge", desc: "Call-out charge", type: "fixed", rate: "", hrs: "", amt: "" }
    ]
  };
  // A business set up for a particular web address starts with its own details (its own link, e.g. 1blast.netlify.app)
  var PRESETS = {
    "1blast": {
      bizName: "1 Blast", bizTagline: "Pressurised Blasting Services", bizPhone: "07846 727348", bizEmail: "1blastsandblasting@gmail.com",
      brandColor: "#062402", accentColor: "#ffbb1c", logoUrl: "brands/1blast-logo.jpg", services: LEGACY_SERVICES
    }
  };
  function hostPreset() { var p = PRESETS[String(location.hostname || "").split(".")[0]]; return p ? clone(p) : null; }
  function is1Blast(st) { return st.bizName === "1 Blast" || st.bizEmail === "1blastsandblasting@gmail.com"; }
  // Setups saved before colours existed: mark them set up, and give 1 Blast back its own look
  function upgradeSettings(raw, st) {
    if (raw && !raw.brandColor) {
      st.setupDone = true;
      if (is1Blast(st)) { st.brandColor = "#062402"; st.accentColor = "#ffbb1c"; if (!st.logo) st.logoUrl = "brands/1blast-logo.jpg"; }
    }
    return st;
  }
  // First time on this phone: use the address's preset, or the details on invoices already saved here
  function startingSettings() {
    var base = hostPreset() || {};
    var saved = lsGet(LS_SAVED) || {};
    var docs = Object.keys(saved).map(function (k) { return saved[k]; }).filter(function (x) { return x && x.snap; })
      .sort(function (x, y) { return (y.updatedAt || 0) - (x.updatedAt || 0); });
    if (docs.length) {
      SNAP_KEYS.forEach(function (k) { if (docs[0].snap[k] != null && docs[0].snap[k] !== "") base[k] = docs[0].snap[k]; });
      base.setupDone = true;
      if (is1Blast(base)) { base.brandColor = base.brandColor || "#062402"; base.accentColor = base.accentColor || "#ffbb1c"; base.logoUrl = "brands/1blast-logo.jpg"; base.services = base.services || LEGACY_SERVICES; }
    }
    return base;
  }
  function sid() { return "s" + Math.random().toString(36).slice(2, 9); }
  // Earlier versions had three fixed charges; turn whatever was typed there into services
  function servicesFromPresets(p) {
    var d = LEGACY_SERVICES;
    function get(k, f, i) { return p && p[k] && p[k][f] != null ? p[k][f] : d[i][f === "amt" ? "amt" : f]; }
    return [
      Object.assign({}, d[0], { desc: get("gen", "desc", 0), rate: get("gen", "rate", 0) }),
      Object.assign({}, d[1], { desc: get("blast", "desc", 1), rate: get("blast", "rate", 1) }),
      Object.assign({}, d[2], { desc: get("abt", "desc", 2), amt: get("abt", "amt", 2) })
    ];
  }
  function mergeSettings(s) {
    var out = Object.assign(clone(defaultSettings), s || {});
    if (!(s && Array.isArray(s.services))) out.services = s && s.presets ? servicesFromPresets(s.presets) : clone(defaultSettings.services);
    out.services = out.services.filter(function (x) { return x && typeof x === "object"; }).map(function (x) {
      return Object.assign({ id: sid(), name: "", desc: "", type: "hourly", rate: "", hrs: "", amt: "" }, x);
    });
    delete out.presets;
    return out;
  }
  // Carry over details typed into the previous version
  function fromV3(old) {
    if (!old) return null;
    if (old.notes === "Payment due within 14 days. Thank you for your business.") old.notes = "Thank you for your business.";
    return old;
  }
  var rawSettings = lsGet(LS_SETTINGS) || fromV3(lsGet("blast-invoice.v3.settings"));
  var settings = upgradeSettings(rawSettings, mergeSettings(rawSettings || startingSettings()));

  function exampleInvoice() {
    var hrs = ["2.5", "3", "1"];
    return {
      id: uid(), isExample: true, no: "0001", date: todayIso(),
      custName: "Example customer", custContact: "", job: is1Blast(settings) ? "Front subframe and suspension arms" : "Describe the job here",
      items: settings.services.slice(0, 3).map(function (sv, i) {
        var it = itemFromService(sv);
        if (it.type === "hourly" && !num(it.hrs)) it.hrs = hrs[i];
        return it;
      }),
      paid: false, snap: null
    };
  }
  function itemFromService(sv) {
    return sv.type === "fixed"
      ? { id: lid(), type: "fixed", desc: sv.desc || sv.name, hrs: "", rate: "", amt: sv.amt || "" }
      : { id: lid(), type: sv.type === "each" ? "each" : "hourly", desc: sv.desc || sv.name, hrs: sv.hrs || "", rate: sv.rate || "", amt: "" };
  }
  function blankInvoice(no) {
    return { id: uid(), isExample: false, no: no, date: todayIso(), custName: "", custContact: "", job: "", items: [], paid: false, snap: null };
  }
  var inv = lsGet(LS_DRAFT);
  if (!inv || !inv.id || !Array.isArray(inv.items)) inv = exampleInvoice();

  // Saved invoices are kept on this phone
  var savedLocal = lsGet(LS_SAVED) || {};
  // Customers and time entries, one map keyed by id ("cus-…" and "tim-…")
  var LS_RECORDS = "twb.records";
  var records = lsGet(LS_RECORDS) || {};

  // Invoices, customers and time live in the phone's database storage (IndexedDB), which has far more room
  // than the 5 MB browser store they started in. Anything still in the old store is moved across at start-up.
  // If the database can't be used (some private windows), the old store carries on as before.
  var useIdb = false, dataDbP = null;
  function dataDb() {
    if (!dataDbP) dataDbP = new Promise(function (res, rej) {
      var r;
      try { r = indexedDB.open("twb-data", 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dataDbP;
  }
  function kvGet(key) {
    return dataDb().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction("kv", "readonly").objectStore("kv").get(key);
        q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
      });
    });
  }
  function kvPut(key, val) {
    return dataDb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(val, key);
        tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  function persistKey(key) {
    var val = key === "saved" ? savedLocal : records, lsKey = key === "saved" ? LS_SAVED : LS_RECORDS;
    if (!useIdb) {
      try { localStorage.setItem(lsKey, JSON.stringify(val)); return Promise.resolve(); }
      catch (e) { storageProblem(); return Promise.reject(e); }
    }
    return kvPut(key, val).catch(function (e) { storageProblem(); throw e; });
  }
  function saveSaved() { persistKey("saved").catch(function () {}); }
  // Newer copies win, so nothing in the old store is lost when it's merged in
  function mergeInto(base, extra) {
    Object.keys(extra || {}).forEach(function (k) {
      var a = base[k], b = extra[k];
      if (b && (!a || (b.updatedAt || 0) > (a.updatedAt || 0))) base[k] = b;
    });
  }
  function bootStores() {
    if (!window.indexedDB) return Promise.resolve();
    var gaveUp = false;
    var load = Promise.all([kvGet("saved"), kvGet("records")]).then(function (v) {
      if (gaveUp) return;
      var s0 = v[0] && typeof v[0] === "object" ? v[0] : {}, r0 = v[1] && typeof v[1] === "object" ? v[1] : {};
      mergeInto(s0, savedLocal); mergeInto(r0, records);
      return Promise.all([kvPut("saved", s0), kvPut("records", r0)]).then(function () {
        if (gaveUp) return;
        savedLocal = s0; records = r0; useIdb = true;
        try { localStorage.removeItem(LS_SAVED); localStorage.removeItem(LS_RECORDS); } catch (e) {}
      });
    });
    // A database that never answers (it happens on some older iPhones) mustn't stop the app opening
    var wait = new Promise(function (res) { setTimeout(function () { gaveUp = true; res(); }, 3000); });
    return Promise.race([load, wait]).catch(function () {});
  }
  function savedMap() { return savedLocal; }
  var lastSavedJson = savedMap()[inv.id] ? stable(stripForCompare(savedMap()[inv.id])) : null;
  var saveState = "idle";      // idle | saving | saved | error

  // ---------- Money ----------
  function eff() { return inv.snap || settings; }
  function num(v) {
    var n = parseFloat(String(v == null ? "" : v).replace(",", ".").replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : 0;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function fmtMoney(n, cur) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || eff().currency || "GBP" }).format(n); }
    catch (e) { return n.toFixed(2); }
  }
  function curSymbol() {
    try {
      var parts = new Intl.NumberFormat(undefined, { style: "currency", currency: eff().currency || "GBP" }).formatToParts(0);
      var p = parts.find(function (x) { return x.type === "currency"; });
      return p ? p.value : "";
    } catch (e) { return ""; }
  }
  function fmtHrs(h) { return String(round2(h)) + (h === 1 ? " hr" : " hrs"); }
  function fmtDate(v) {
    if (!v) return "";
    var d = new Date(v + "T12:00:00");
    if (isNaN(d)) return v;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }
  // hourly: hours x rate; each: quantity x price each (quantity kept in hrs); fixed: one price
  function isQty(it) { return it.type === "hourly" || it.type === "each"; }
  function fmtQty(n) { return String(round2(n)); }
  function itemAmount(it) { return isQty(it) ? round2(num(it.hrs) * num(it.rate)) : round2(num(it.amt)); }
  function compute(i) {
    i = i || inv;
    var s = i.snap || settings;
    var sub = round2(i.items.reduce(function (t, it) { return t + itemAmount(it); }, 0));
    var taxable = round2(i.items.reduce(function (t, it) { return t + (it.noTax ? 0 : itemAmount(it)); }, 0));
    var rate = num(s.taxRate);
    var tax = round2(taxable * rate / 100);
    return { sub: sub, rate: rate, tax: tax, total: round2(sub + tax) };
  }
  function billable() {
    var taxOn = num(eff().taxRate) > 0, noTaxWords = "no " + (eff().taxLabel || "tax").trim();
    return inv.items.filter(function (it) { return itemAmount(it) !== 0; }).map(function (it) {
      var q = it.type === "hourly" ? fmtHrs(num(it.hrs)) + " × " + fmtMoney(num(it.rate)) + "/hr"
        : it.type === "each" ? fmtQty(num(it.hrs)) + " × " + fmtMoney(num(it.rate)) + " each" : "";
      if (taxOn && it.noTax) q = q ? q + " · " + noTaxWords : noTaxWords;
      return {
        d: it.desc || (it.type === "hourly" ? "Labour" : "Charge"),
        noTax: taxOn && !!it.noTax, noTaxWords: noTaxWords,
        q: q,
        hrs: it.type === "hourly" ? fmtHrs(num(it.hrs)) : it.type === "each" ? fmtQty(num(it.hrs)) : "",
        rate: it.type === "hourly" ? fmtMoney(num(it.rate)) + "/hr" : it.type === "each" ? fmtMoney(num(it.rate)) + " each" : "Fixed",
        a: itemAmount(it)
      };
    });
  }
  function docTitle(q) { return (String((q ? settings.quoteWord : settings.docWord) || "").trim() || (q ? "QUOTE" : "INVOICE")).toUpperCase(); }
  function billToWord(q) { return String(settings.billToLabel || "").trim() || (q ? "Quote for" : "Bill to"); }
  function payDaysOf(s) { var n = parseInt(s.payDays, 10); return n > 0 ? n : 0; }
  function isQuote(doc) { return (doc || inv).docType === "quote"; }
  // When payment is due: the invoice's own choice, or the usual number of days from the Company tab
  function dueInfo(doc) {
    doc = doc || inv;
    var t = String(doc.terms || ""), s = doc.snap || settings;
    if (t === "receipt") return { iso: doc.date || "", words: "on receipt" };
    if (t === "collection") return { iso: "", words: "on collection" };
    if (t === "date") return { iso: doc.dueDate || "", words: "" };
    var n = /^\d+$/.test(t) ? parseInt(t, 10) : payDaysOf(s);
    return { iso: n && doc.date ? isoAddDays(doc.date, n) : "", words: "", days: n };
  }
  function dueText() { var d = dueInfo(inv); return d.iso ? fmtDate(d.iso) : ""; }
  function dueLabel() { var d = dueInfo(inv); return d.words ? "Due " + d.words : d.iso ? "Due " + fmtDate(d.iso) : ""; }
  function quoteDaysOf(doc) { var n = parseInt((doc.snap || settings).quoteDays, 10); return n > 0 ? n : 30; }
  function validIso(doc) { return doc.date ? isoAddDays(doc.date, quoteDaysOf(doc)) : ""; }
  function quoteStatusOf(doc) {
    if (doc.quoteStatus === "accepted") return "accepted";
    if (doc.quoteStatus === "declined") return "declined";
    var v = validIso(doc);
    return v && v < todayIso() ? "expired" : "quote";
  }
  // Payments: deposits and part payments, plus older invoices simply marked paid
  function paymentsOf(doc) { return Array.isArray(doc.payments) ? doc.payments : []; }
  function paidSoFar(doc) {
    if (doc.paid && !paymentsOf(doc).length) return compute(doc).total;
    return round2(paymentsOf(doc).reduce(function (t, x) { return t + num(x.amount); }, 0));
  }
  function balanceOf(doc) { return doc.paid ? 0 : round2(compute(doc).total - paidSoFar(doc)); }
  function receivedIn(doc, from, to) {
    if (isQuote(doc)) return 0;
    var ps = paymentsOf(doc);
    if (!ps.length) return doc.paid && doc.paidDate >= from && doc.paidDate < to ? compute(doc).total : 0;
    return round2(ps.reduce(function (t, x) { return t + (x.date >= from && x.date < to ? num(x.amount) : 0); }, 0));
  }
  var STATUS_WORDS = { paid: "Paid", overdue: "Overdue", part: "Part paid", unpaid: "Unpaid", quote: "Quote", accepted: "Accepted", declined: "Declined", expired: "Expired" };
  function isoAddDays(iso, n) {
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d)) return "";
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dueIsoOf(doc) { return dueInfo(doc).iso; }
  // invoices: paid | overdue | part | unpaid; quotes: quote | accepted | declined | expired
  function statusOf(doc) {
    if (isQuote(doc)) return quoteStatusOf(doc);
    if (doc.paid) return "paid";
    var due = dueIsoOf(doc);
    if (due && due < todayIso()) return "overdue";
    return paidSoFar(doc) > 0 ? "part" : "unpaid";
  }
  function fmtShort(iso) {
    var d = new Date(iso + "T12:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  function termsText() {
    if (inv.paid || isQuote(inv)) return "";
    var d = dueInfo(inv);
    if (d.words) return "Please pay " + d.words + ".";
    if (d.days) return "Please pay within " + d.days + (d.days === 1 ? " day" : " days") + (d.iso ? ", by " + fmtDate(d.iso) : "") + ".";
    return d.iso ? "Please pay by " + fmtDate(d.iso) + "." : "";
  }
  function payLines(s) {
    if (isQuote(inv)) return [];
    var l = [s.bankName && "Account name: " + s.bankName, s.bankSort && "Sort code: " + s.bankSort, s.bankAcc && "Account number: " + s.bankAcc].filter(Boolean);
    if (l.length && inv.no) l.push("Reference: Invoice " + inv.no);
    return l;
  }
  function legalText(s) {
    return [s.bizRegNo && "Company no. " + s.bizRegNo, s.bizVatNo && "VAT no. " + s.bizVatNo].filter(Boolean).join(" · ");
  }
  function taxLabelText() { return (eff().taxLabel || "Tax").trim() + " (" + round2(compute().rate) + "%)"; }

  // ---------- Forms ----------
  function fillForms() {
    document.querySelectorAll("[data-i]").forEach(function (el) { el.value = inv[el.getAttribute("data-i")] || ""; });
    var rs = rateService ? rateService() : null;
    if (document.activeElement !== $("su-rate")) $("su-rate").value = rs ? rs.rate || "" : "";
    document.querySelectorAll("[data-s]").forEach(function (el) {
      var k = el.getAttribute("data-s"), v = settings[k];
      el.value = v == null ? "" : v;
    });
    $("vat-opts").hidden = !(num(settings.taxRate) > 0);
    document.querySelectorAll("[data-c]").forEach(function (el) { el.checked = settings[el.getAttribute("data-c")] !== false; });
    renderNumPreview();
  }
  document.querySelectorAll("[data-i]").forEach(function (el) {
    el.addEventListener("input", function () {
      inv[el.getAttribute("data-i")] = el.value;
      changed();
    });
  });
  document.querySelectorAll("[data-s]").forEach(function (el) {
    el.addEventListener("input", function () {
      var k = el.getAttribute("data-s");
      settings[k] = el.value;
      if (inv.snap && SNAP_KEYS.indexOf(k) >= 0) inv.snap[k] = el.value;
      settingsChanged();
      if (k === "currency") { renderServices(); renderAddButtons(); }
      if (k === "brandColor" || k === "accentColor") { applyBrand(); scheduleIcon(); }
      if (k === "bizName") renderLogo();
      if (k === "taxRate" || k === "taxLabel") renderLines();
      if (k === "taxRate") $("vat-opts").hidden = !(num(settings.taxRate) > 0);
      if (k === "theme" || k === "appColours") applyBrand();
      if (k === "numStyle" || k === "numStart") renderNumPreview();
      if (k === "timerStyle") renderTimer();
      if (inv.isExample) { renderTotals(); renderPaper(); } else changed();
    });
  });

  document.querySelectorAll("[data-c]").forEach(function (el) {
    el.addEventListener("change", function () {
      settings[el.getAttribute("data-c")] = el.checked;
      settingsChanged(); renderTotals(); renderPaper(); renderSavedList(); renderOverview();
    });
  });

  // ---------- Charge cards ----------
  function renderLines() {
    var box = $("lines");
    box.innerHTML = "";
    if (!inv.items.length) {
      var e = document.createElement("div");
      e.className = "empty-lines";
      e.textContent = "No charges on this invoice yet. Add one below.";
      box.append(e);
      return;
    }
    var sym = curSymbol();
    inv.items.forEach(function (it, idx) {
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="card-head"><p class="eyebrow"></p><div class="line-tools">' +
        '<div class="seg" role="group" aria-label="How this is charged"><button type="button" data-t="hourly">Per hour</button><button type="button" data-t="each">Each</button><button type="button" data-t="fixed">Fixed</button></div>' +
        '<button type="button" class="mini" data-up>Move up</button><button type="button" class="x">Remove</button></div></div>' +
        '<label class="f"><span>Wording</span><textarea rows="2" data-f="desc"></textarea></label>' +
        (it.type === "hourly"
          ? '<div class="row"><label class="f"><span>Hours</span><input class="num" inputmode="decimal" placeholder="0" data-f="hrs"></label>' +
            '<label class="f"><span>Rate per hour</span><span class="money"><span class="cur"></span><input class="num" inputmode="decimal" placeholder="0.00" data-f="rate"></span></label></div>'
          : it.type === "each"
          ? '<div class="row"><label class="f"><span>How many</span><input class="num" inputmode="decimal" placeholder="0" data-f="hrs"></label>' +
            '<label class="f"><span>Price each</span><span class="money"><span class="cur"></span><input class="num" inputmode="decimal" placeholder="0.00" data-f="rate"></span></label></div>'
          : '<label class="f"><span>Price</span><span class="money"><span class="cur"></span><input class="num" inputmode="decimal" placeholder="0.00" data-f="amt"></span></label>') +
        '<label class="chk" data-vat><input type="checkbox"><span></span></label>' +
        '<div class="line-total"></div>' +
        '<button type="button" class="linkbtn" data-save-svc>Save as a service for next time</button>';
      card.querySelector(".eyebrow").textContent = "Charge " + (idx + 1);
      var vat = card.querySelector("[data-vat]"), taxRate = num(eff().taxRate);
      vat.hidden = !(taxRate > 0);
      vat.querySelector("span").textContent = "Add " + (eff().taxLabel || "tax").trim() + " (" + round2(taxRate) + "%) to this charge";
      vat.querySelector("input").checked = !it.noTax;
      vat.querySelector("input").addEventListener("change", function () { it.noTax = !this.checked; changed(); });
      var up = card.querySelector("[data-up]");
      up.hidden = idx === 0;
      up.addEventListener("click", function () {
        var at = inv.items.indexOf(it);
        if (at > 0) { inv.items.splice(at, 1); inv.items.splice(at - 1, 0, it); renderLines(); changed(); }
      });
      card.querySelector("[data-save-svc]").addEventListener("click", function () {
        var name = String(it.desc || "").split("\n")[0].trim();
        if (name.length > 32) name = name.slice(0, 30).trim() + "…";
        settings.services.push({ id: sid(), name: name || "New service", desc: it.desc || "", type: it.type,
          rate: isQty(it) ? it.rate || "" : "", hrs: isQty(it) ? it.hrs || "" : "", amt: it.type === "fixed" ? it.amt || "" : "" });
        settingsChanged(); renderAddButtons(); renderServices();
        toast("Saved as a service. Rename it under Settings.");
      });
      card.querySelectorAll(".cur").forEach(function (c) { c.textContent = sym; });
      card.querySelectorAll("[data-t]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-t") === it.type));
        b.addEventListener("click", function () {
          var t = b.getAttribute("data-t");
          if (t === it.type) return;
          if (t === "fixed" && !num(it.amt) && itemAmount(it)) it.amt = String(itemAmount(it));
          if (t !== "fixed" && it.type === "fixed" && !num(it.rate) && num(it.amt)) { it.rate = it.amt; if (!num(it.hrs)) it.hrs = "1"; }
          it.type = t;
          renderLines();
          changed();
        });
      });
      card.querySelectorAll("[data-f]").forEach(function (inp) {
        var f = inp.getAttribute("data-f");
        inp.id = it.id + "-" + f;
        inp.value = it[f] || "";
        inp.addEventListener("input", function () { it[f] = inp.value; changed(); });
      });
      card.querySelector(".x").addEventListener("click", function () {
        var at = inv.items.indexOf(it);
        inv.items.splice(at, 1);
        renderLines();
        changed();
        toast("Charge removed", "Undo", function () {
          inv.items.splice(Math.min(at, inv.items.length), 0, it);
          renderLines();
          changed();
        });
      });
      it._total = card.querySelector(".line-total");
      box.append(card);
    });
    renderLineTotals();
  }
  function renderLineTotals() {
    inv.items.forEach(function (it) {
      var el = it._total;
      if (!el) return;
      el.textContent = fmtMoney(itemAmount(it));
      var s = document.createElement("small");
      s.textContent = it.type === "hourly" ? fmtHrs(num(it.hrs)) + " × " + fmtMoney(num(it.rate))
        : it.type === "each" ? fmtQty(num(it.hrs)) + " × " + fmtMoney(num(it.rate)) + " each" : "Fixed price";
      el.append(s);
    });
  }
  function serviceSub(sv) {
    if (sv.type === "fixed") return fmtMoney(num(sv.amt)) + " fixed";
    if (sv.type === "each") return fmtMoney(num(sv.rate)) + " each" + (num(sv.hrs) ? " · " + fmtQty(num(sv.hrs)) : "");
    return fmtMoney(num(sv.rate)) + "/hr" + (num(sv.hrs) ? " · " + fmtHrs(num(sv.hrs)) : "");
  }
  function addCharge(it, focusField) {
    inv.items.push(it);
    renderLines();
    changed();
    var focusEl = $(it.id + "-" + focusField);
    if (focusEl) { focusEl.scrollIntoView({ block: "center" }); focusEl.focus(); }
  }
  function renderAddButtons() {
    var grid = $("add-grid");
    grid.innerHTML = "";
    settings.services.forEach(function (sv) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = sv.name || sv.desc || "Service";
      var sm = document.createElement("small"); sm.textContent = serviceSub(sv); b.append(sm);
      b.addEventListener("click", function () {
        var it = itemFromService(sv);
        addCharge(it, isQty(it) ? (num(it.hrs) ? "desc" : "hrs") : "amt");
      });
      grid.append(b);
    });
    var o = document.createElement("button");
    o.type = "button"; o.textContent = "Other charge";
    var osm = document.createElement("small"); osm.textContent = "your own wording"; o.append(osm);
    o.addEventListener("click", function () { addCharge({ id: lid(), type: "fixed", desc: "", hrs: "", rate: "", amt: "" }, "desc"); });
    grid.append(o);
  }

  function renderServices() {
    var box = $("svc-list"), sym = curSymbol();
    box.innerHTML = "";
    if (!settings.services.length) {
      var e = document.createElement("div");
      e.className = "empty-lines";
      e.textContent = "No services yet. Tap Add a service to make your first one.";
      box.append(e);
    }
    settings.services.forEach(function (sv, i) {
      var c = document.createElement("div");
      c.className = "svc";
      c.innerHTML =
        '<div class="svc-head"><p class="eyebrow"></p><div class="line-tools">' +
        '<button type="button" class="mini" data-up>Move up</button><button type="button" class="x" data-del>Delete</button></div></div>' +
        '<label class="f"><span>Name (the button)</span><input data-k="name" placeholder="e.g. Call-out charge"></label>' +
        '<label class="f"><span>Wording on the invoice</span><textarea rows="2" data-k="desc" placeholder="What the customer sees"></textarea></label>' +
        '<div class="seg" role="group" aria-label="How this is charged"><button type="button" data-t="hourly">Per hour</button><button type="button" data-t="each">Each</button><button type="button" data-t="fixed">Fixed price</button></div>' +
        (sv.type === "fixed"
          ? '<label class="f"><span>Price</span><span class="money"><span class="cur"></span><input class="num" inputmode="decimal" placeholder="0.00" data-k="amt"></span></label>'
          : sv.type === "each"
          ? '<div class="row"><label class="f"><span>Price each</span><span class="money"><span class="cur"></span><input class="num" inputmode="decimal" placeholder="0.00" data-k="rate"></span></label>' +
            '<label class="f"><span>Usual number</span><input class="num" inputmode="decimal" placeholder="optional" data-k="hrs"></label></div>'
          : '<div class="row"><label class="f"><span>Rate per hour</span><span class="money"><span class="cur"></span><input class="num" inputmode="decimal" placeholder="0.00" data-k="rate"></span></label>' +
            '<label class="f"><span>Usual hours</span><input class="num" inputmode="decimal" placeholder="optional" data-k="hrs"></label></div>');
      c.querySelector(".eyebrow").textContent = sv.name || "Service " + (i + 1);
      c.querySelectorAll(".cur").forEach(function (x) { x.textContent = sym; });
      c.querySelector("[data-up]").hidden = i === 0;
      c.querySelectorAll("[data-k]").forEach(function (inp) {
        var k = inp.getAttribute("data-k");
        inp.id = sv.id + "-svc-" + k;
        inp.value = sv[k] || "";
        inp.addEventListener("input", function () {
          sv[k] = inp.value;
          if (k === "name") c.querySelector(".eyebrow").textContent = inp.value || "Service " + (i + 1);
          settingsChanged(); renderAddButtons();
        });
      });
      c.querySelectorAll("[data-t]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-t") === sv.type));
        b.addEventListener("click", function () {
          var t = b.getAttribute("data-t");
          if (t === sv.type) return;
          if (t === "fixed" && !num(sv.amt) && num(sv.rate) && num(sv.hrs)) sv.amt = String(round2(num(sv.rate) * num(sv.hrs)));
          if (t !== "fixed" && sv.type === "fixed" && !num(sv.rate) && num(sv.amt)) sv.rate = sv.amt;
          sv.type = t;
          settingsChanged(); renderServices(); renderAddButtons();
        });
      });
      c.querySelector("[data-up]").addEventListener("click", function () {
        var at = settings.services.indexOf(sv);
        if (at > 0) { settings.services.splice(at, 1); settings.services.splice(at - 1, 0, sv); }
        settingsChanged(); renderServices(); renderAddButtons();
      });
      c.querySelector("[data-del]").addEventListener("click", function () {
        var at = settings.services.indexOf(sv);
        settings.services.splice(at, 1);
        settingsChanged(); renderServices(); renderAddButtons();
        toast((sv.name || "Service") + " deleted", "Undo", function () {
          settings.services.splice(Math.min(at, settings.services.length), 0, sv);
          settingsChanged(); renderServices(); renderAddButtons();
        });
      });
      box.append(c);
    });
  }
  $("svc-add").addEventListener("click", function () {
    var sv = { id: sid(), name: "", desc: "", type: "hourly", rate: "", hrs: "", amt: "" };
    settings.services.push(sv);
    settingsChanged(); renderServices(); renderAddButtons();
    var el = $(sv.id + "-svc-name");
    if (el) { el.scrollIntoView({ block: "center" }); el.focus(); }
  });
  $("edit-services").addEventListener("click", function () {
    show("company");
    setTimeout(function () { $("services-card").scrollIntoView({ block: "start" }); }, 0);
  });

  // ---------- Render ----------
  function setText(id, t) { $(id).textContent = t; }
  function renderTotals() {
    var c = compute();
    document.querySelectorAll("[data-cur]").forEach(function (s) { s.textContent = curSymbol(); });
    renderLineTotals();
    setText("t-sub", fmtMoney(c.sub));
    setText("t-tax-label", taxLabelText());
    setText("t-tax", fmtMoney(c.tax));
    $("t-tax-row").hidden = !(c.rate > 0);
    setText("t-total", fmtMoney(c.total));
    setText("hdr-total", fmtMoney(c.total));
    var word = isQuote(inv) ? "Quote" : "Invoice";
    setText("hdr-name", inv.no ? word + " #" + inv.no : word);
    $("example-note").hidden = !inv.isExample;
    $("paid-note").hidden = !inv.paid || isQuote(inv);
    var taken = noTaken(inv.no);
    $("no-warn").hidden = !taken;
    if (taken) setText("no-warn", word + " number " + inv.no + " is already used. The next free one is " + nextNo(inv.docType) + ".");
    document.querySelectorAll("[data-doc]").forEach(function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-doc") === "quote") === isQuote(inv))); });
    setText("no-label", word + " no.");
    setText("job-label", isQuote(inv) ? "What the job is (shown on the quote)" : "What was done (shown on invoice)");
    setText("go-invoice", isQuote(inv) ? "View quote" : "View invoice");
    setText("dup-inv", "Copy to a new " + word.toLowerCase());
    setText("tab-edit-label", word);
    renderUnbilledCard();
    renderDel();
    $("terms-row").hidden = isQuote(inv);
    $("due-date-wrap").hidden = inv.terms !== "date";
    var n = payDaysOf(eff());
    $("terms-usual").textContent = "Usual (" + (n ? "within " + n + (n === 1 ? " day" : " days") : "no due date") + ")";
  }
  function renderPaper() {
    var s = eff(), c = compute();
    $("p-logo").alt = s.bizName || "Logo";
    setText("p-bizname", s.bizName || "Your business");
    setText("p-tag", s.bizTagline || "");
    $("p-tag").hidden = !s.bizTagline;
    setText("p-biz-info", [s.bizPhone, s.bizEmail, s.bizWebsite, s.bizAddr].filter(Boolean).join("\n"));
    var q = isQuote(inv), stampOn = settings.paidStamp !== false && !!inv.paid && !q;
    $("paper").className = "paper d-" + (settings.invDesign || "classic");
    setText("p-word", docTitle(q));
    setText("p-billto-k", billToWord(q));
    var stamp = $("p-stamp");
    stamp.hidden = !stampOn;
    setText("p-stamp-date", inv.paidDate ? fmtDate(inv.paidDate) : "");
    if (stampOn && stampAnim) { stamp.classList.remove("stamp-in"); void stamp.offsetWidth; stamp.classList.add("stamp-in"); }
    stampAnim = false;
    setText("p-due", q ? (validIso(inv) ? "Valid until " + fmtDate(validIso(inv)) : "")
      : inv.paid ? (inv.paidDate ? "Paid " + fmtDate(inv.paidDate) : "") : dueLabel());
    $("p-due").hidden = !$("p-due").textContent;
    setText("p-no", inv.no ? "No. " + inv.no : "");
    setText("p-date", fmtDate(inv.date));
    $("p-paid").hidden = !inv.paid || q || stampOn;
    setText("p-cust", [inv.custName, inv.custContact].filter(Boolean).join("\n") || "—");
    setText("p-job", inv.job || "—");
    $("p-job").parentNode.hidden = settings.showJob === false;
    var box = $("p-items");
    box.innerHTML = "";
    var ls = billable();
    if (!ls.length) {
      var empty = document.createElement("div");
      empty.className = "p-item";
      var qe = document.createElement("div"); qe.className = "q"; qe.textContent = "No charges yet. Add one on the Edit tab.";
      empty.append(qe); box.append(empty);
    }
    ls.forEach(function (l) {
      var row = document.createElement("div"); row.className = "p-item";
      var d = document.createElement("div"); d.className = "d"; d.textContent = l.d;
      var am = document.createElement("div"); am.className = "a"; am.textContent = fmtMoney(l.a);
      row.append(d, am);
      if (l.q && settings.showHours !== false) { var q2 = document.createElement("div"); q2.className = "q"; q2.textContent = l.q; row.append(q2); }
      box.append(row);
    });
    setText("p-sub", fmtMoney(c.sub));
    setText("p-tax-label", taxLabelText());
    setText("p-tax", fmtMoney(c.tax));
    $("p-tax-row").hidden = !(c.rate > 0) || settings.showVat === false;
    $("p-sub").parentNode.hidden = settings.showVat === false;
    var part = !q && !inv.paid && paidSoFar(inv) > 0;
    $("p-tot-row").hidden = !part; $("p-paid-row").hidden = !part;
    setText("p-tot", fmtMoney(c.total));
    setText("p-paidsofar", "−" + fmtMoney(paidSoFar(inv)));
    setText("p-grand-k", part ? "Balance due" : q || inv.paid ? "Total" : "Total due");
    setText("p-total", fmtMoney(part ? balanceOf(inv) : c.total));
    var notes = settings.showNotes === false ? "" : s.notes || "", print = String(settings.termsText || "").trim();
    setText("p-notes", notes);
    $("p-notes").hidden = !notes;
    setText("p-print", print); $("p-print").hidden = !print;
    var payOn = settings.showPay !== false;
    var pay = payOn ? payLines(s) : [], terms = payOn ? termsText() : "", legal = settings.showLegal === false ? "" : legalText(s);
    setText("p-pay", pay.join("\n")); $("p-pay").hidden = !pay.length;
    setText("p-terms", terms); $("p-terms").hidden = !terms;
    $("p-pay-wrap").hidden = !(pay.length || terms);
    setText("p-legal", legal); $("p-legal").hidden = !legal;
    $("p-foot").hidden = !(pay.length || terms || notes || legal || print);
    renderPaperPhotos();
    renderShare();
    renderPayCard();
    setText("send-email-sub", q ? "Quote PDF attached" : inv.paid ? "Receipt PDF attached" : "PDF attached");
    renderQuoteCard();
  }
  function renderStatus() {
    var el = $("hdr-status");
    el.className = "status";
    if (inv.isExample) { el.textContent = "Example, not saved"; return; }
    if (!worthSaving()) { el.textContent = "Not saved yet"; return; }
    if (saveState === "saving" || isDirty()) { el.textContent = "Saving…"; return; }
    if (saveState === "error") { el.textContent = "Not saved, phone storage is full or blocked"; return; }
    el.className = "status ok";
    var st = statusOf(inv);
    el.textContent = st === "unpaid" || st === "quote" ? "Saved" : "Saved · " + STATUS_WORDS[st];
  }
  function renderAll() {
    applyBrand(); fillForms(); renderLogo(); renderLines(); renderAddButtons(); renderServices(); renderPhotos(); renderTotals(); renderPaper(); renderStatus(); renderSaved();
  }

  // ---------- Saving ----------
  function stripForCompare(o) {
    var c = clone(o);
    delete c.kind; delete c.updatedAt; delete c.total; delete c.subtotal;
    if (!c.docType) c.docType = "invoice";
    (c.items || []).forEach(function (it) { delete it._total; });
    return c;
  }
  function invBody() {
    var body = clone(Object.assign({}, inv, { items: inv.items.map(function (it) { var x = Object.assign({}, it); delete x._total; return x; }) }));
    delete body.isExample;
    if (!body.snap) body.snap = pick(settings);
    var c = compute();
    body.kind = "invoice"; body.docType = isQuote(inv) ? "quote" : "invoice";
    body.subtotal = c.sub; body.total = c.total; body.updatedAt = Date.now();
    return body;
  }
  function pick(s) { var o = {}; SNAP_KEYS.forEach(function (k) { o[k] = s[k]; }); return o; }
  function worthSaving() {
    return !inv.isExample && !!(String(inv.custName || "").trim() || String(inv.job || "").trim() || inv.items.some(function (it) { return itemAmount(it) !== 0; }));
  }
  function isDirty() {
    var b = invBody(); return stable(stripForCompare(b)) !== lastSavedJson;
  }

  var saveTimer = null, saving = false, again = false;
  function changed() {
    if (inv.isExample) inv.isExample = false;
    lsSet(LS_DRAFT, draftBody());
    renderTotals(); renderPaper(); renderStatus();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 1200);
  }
  function draftBody() { var b = clone(Object.assign({}, inv, { items: inv.items.map(function (it) { var x = Object.assign({}, it); delete x._total; return x; }) })); return b; }

  async function putInvoice(body) {
    savedLocal[body.id] = body;
    markDirty(body.id);
    await persistKey("saved");
    renderSaved();
  }
  async function flush() {
    clearTimeout(saveTimer);
    if (!worthSaving() || !isDirty()) { renderStatus(); return; }
    if (saving) { again = true; return; }
    saving = true; saveState = "saving"; renderStatus();
    var body = invBody();
    if (!inv.snap) inv.snap = clone(body.snap);
    try {
      await putInvoice(body);
      lastSavedJson = stable(stripForCompare(body));
      saveState = "saved";
    } catch (e) {
      saveState = "error";
    }
    saving = false;
    renderStatus();
    if (again) { again = false; flush(); }
  }

  function settingsChanged() { settings.updatedAt = Date.now(); lsSet(LS_SETTINGS, settings); markSettingsDirty(); scheduleSig(); }

  // ---------- Saved list ----------
  var savedFilter = "all", savedQuery = "";
  document.querySelectorAll("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      savedFilter = b.getAttribute("data-filter");
      document.querySelectorAll("[data-filter]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      renderSaved();
    });
  });
  $("saved-search").addEventListener("input", function () { savedQuery = this.value; renderSaved(); });

  // Known customers: suggest names, and fill in their contact details
  $("cust-name").addEventListener("input", function () {
    var c = findCustomer(this.value.trim()), did = false;
    if (!c) return;
    if (c.contact && !String(inv.custContact || "").trim()) { inv.custContact = c.contact; $("cust-contact").value = c.contact; did = true; }
    if (c.terms && !inv.terms && !isQuote(inv)) { inv.terms = c.terms; $("inv-terms").value = c.terms; did = true; }
    if (did) changed();
  });

  function sortedSaved() {
    var m = savedMap();
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) {
      if ((b.date || "") !== (a.date || "")) return (b.date || "") < (a.date || "") ? -1 : 1;
      return (parseInt(b.no, 10) || 0) - (parseInt(a.no, 10) || 0);
    });
  }
  // Numbers in the business's chosen style; the year styles start again at 1 each year
  function numFor(type, n) {
    var y = todayIso().slice(0, 4), q = type === "quote", st = settings.numStyle || "plain";
    if (st === "inv") return (q ? "QUO-" : "INV-") + String(n).padStart(4, "0");
    if (st === "invyear") return (q ? "QUO-" : "INV-") + y + "-" + String(n).padStart(3, "0");
    if (st === "year") return (q ? "Q" : "") + y + "-" + String(n).padStart(3, "0");
    return (q ? "Q" : "") + String(n).padStart(4, "0");
  }
  function nextNo(type) {
    var wantQuote = type === "quote";
    var nums = sortedSaved().filter(function (x) { return isQuote(x) === wantQuote; }).map(function (x) { return x.no; })
      .concat(!inv.isExample && isQuote(inv) === wantQuote ? [inv.no] : []);
    var start = wantQuote ? 0 : parseInt(settings.numStart, 10) || 0;
    if ((settings.numStyle || "plain") !== "plain") {
      var sample = numFor(type, 9999999), pre = sample.slice(0, sample.indexOf("9999999"));
      var re = new RegExp("^" + pre.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&") + "(\\d+)$"), hi = 0;
      nums.forEach(function (n) { var m = String(n || "").trim().match(re); if (m) hi = Math.max(hi, parseInt(m[1], 10)); });
      return numFor(type, Math.max(hi + 1, start || 1));
    }
    var best = null;
    nums.forEach(function (n) {
      var m = String(n || "").trim().match(/^(.*?)(\d+)$/);
      if (!m) return;
      var v = parseInt(m[2], 10);
      if (!best || v > best.v) best = { v: v, pre: m[1], w: m[2].length };
    });
    if (!best) return numFor(type, Math.max(start, 1));
    return best.pre + String(Math.max(best.v + 1, start)).padStart(best.w, "0");
  }
  function renderNumPreview() {
    var y = todayIso().slice(0, 4), sel = $("set-numstyle");
    sel.options[2].textContent = "INV-" + y + "-001"; sel.options[3].textContent = y + "-001";
    setText("num-preview", "Your next invoice will be " + nextNo("invoice") + " and your next quote " + nextNo("quote") + ".");
  }
  function noTaken(no) {
    no = String(no || "").trim();
    return !!no && sortedSaved().some(function (x) { return x.id !== inv.id && isQuote(x) === isQuote(inv) && String(x.no || "").trim() === no; });
  }
  function renderSaved() { renderSavedList(); renderOverview(); }
  function renderSavedList() {
    $("store-note").textContent = cloudUser
      ? "Saved on this phone and online" + (cloud.lastSync ? " (last synced " + ago(cloud.lastSync) + ")" : "") + "."
      : "Saved on this phone only. Turn on online saving in Settings, or make a backup now and then (bottom of this page).";

    var all = sortedSaved(), invs = all.filter(function (x) { return !isQuote(x); });
    function owedSum(arr) { return round2(arr.reduce(function (t, x) { return t + balanceOf(x); }, 0)); }
    function count(n) { return n + (n === 1 ? " invoice" : " invoices"); }
    function received(from, to) {
      var amt = 0, n = 0;
      invs.forEach(function (x) { var r = receivedIn(x, from, to); if (r) { amt += r; n++; } });
      return { amt: round2(amt), n: n };
    }
    var unpaid = invs.filter(function (x) { return !x.paid; });
    var overdue = invs.filter(function (x) { return statusOf(x) === "overdue"; });
    setText("s-owed", fmtMoney(owedSum(unpaid), settings.currency)); setText("s-owed-n", count(unpaid.length));
    setText("s-overdue", fmtMoney(owedSum(overdue), settings.currency)); setText("s-overdue-n", count(overdue.length));
    $("s-overdue").classList.toggle("warn", overdue.length > 0);
    var t = todayIso(), month = t.slice(0, 7) + "-01", nextMonth = isoAddDays(t.slice(0, 7) + "-28", 7).slice(0, 7) + "-01";
    var rm = received(month, nextMonth);
    setText("s-month", fmtMoney(rm.amt, settings.currency)); setText("s-month-n", count(rm.n));
    var y = parseInt(t.slice(0, 4), 10), ty = t >= y + "-04-06" ? y : y - 1;
    var ry = received(ty + "-04-06", (ty + 1) + "-04-06");
    var quotes = all.length - invs.length;
    setText("s-year", fmtMoney(ry.amt, settings.currency));
    setText("s-year-n", ty + "/" + String(ty + 1).slice(2) + " (from 6 April) · " + invs.length + " invoices" + (quotes ? ", " + quotes + " quotes" : ""));
    renderBackupNag(all.length);

    var q = savedQuery.trim().toLowerCase();
    var list = all.filter(function (x) {
      if (savedFilter !== "all") {
        var st = statusOf(x);
        if (savedFilter === "quotes") { if (!isQuote(x)) return false; }
        else if (isQuote(x)) return false;
        else if (savedFilter === "unpaid" ? st === "paid" : st !== savedFilter) return false;
      }
      if (!q) return true;
      return [x.no, x.custName, x.custContact, x.job].join(" ").toLowerCase().indexOf(q) >= 0;
    });

    var box = $("saved-list");
    box.innerHTML = "";
    if (!list.length) {
      var e = document.createElement("div");
      e.className = "empty-lines";
      e.textContent = all.length ? "No invoices match. Try All, or clear the search."
        : "No saved invoices yet. Once you fill in a customer or a charge, the invoice saves here by itself.";
      box.append(e);
      return;
    }
    list.forEach(function (s) {
      var card = document.createElement("div");
      card.className = "saved" + (s.id === inv.id ? " current" : "");
      card.innerHTML =
        '<div class="s-top"><div><div class="s-title"></div><div class="s-sub"></div></div><div class="s-amt"></div></div>' +
        '<div class="s-status"><span class="chip"></span><span class="s-when"></span></div>' +
        '<div class="s-actions"><button type="button" class="pill"></button><button type="button" data-a="open">Open</button>' +
        '<button type="button" data-a="pdf">Send PDF</button><button type="button" data-a="remind">Send reminder</button><button type="button" data-a="convert">Turn into invoice</button>' +
        '<button type="button" data-a="copy">Copy to new</button><button type="button" class="del" data-a="del">Delete</button></div>' +
        '<div class="confirm" hidden><p></p><div class="row"><button type="button" class="btn" data-a="cancel">Cancel</button><button type="button" class="btn primary" data-a="yes">Delete</button></div></div>';
      var title = card.querySelector(".s-title");
      title.textContent = (isQuote(s) ? "Quote " : "") + "#" + (s.no || "—") + " · " + (s.custName || "No customer");
      if (s.id === inv.id) { var t = document.createElement("span"); t.className = "tag-now"; t.textContent = "OPEN"; title.append(t); }
      card.querySelector(".s-sub").textContent = [fmtDate(s.date), (s.job || "").replace(/\n+/g, " ")].filter(Boolean).join(" · ");
      card.querySelector(".s-amt").textContent = fmtMoney(s.total || 0, s.snap && s.snap.currency);
      var st = statusOf(s), due = dueIsoOf(s), chip = card.querySelector(".chip"), qt = isQuote(s);
      chip.className = "chip " + st;
      chip.textContent = STATUS_WORDS[st];
      var when = "";
      if (qt) when = st === "accepted" ? (s.convertedTo ? "Became invoice #" + s.convertedTo : "Accepted")
        : st === "declined" ? "Customer said no" : validIso(s) ? (st === "expired" ? "Ran out " : "Valid until ") + fmtShort(validIso(s)) : "";
      else if (st === "paid") when = (s.paidDate ? "Paid " + fmtShort(s.paidDate) : "") + (s.paidMethod ? " by " + s.paidMethod.toLowerCase() : "");
      else {
        var dw = dueInfo(s).words;
        when = [paidSoFar(s) > 0 ? fmtMoney(balanceOf(s), s.snap && s.snap.currency) + " left to pay" : "",
          dw ? "Due " + dw : due ? (st === "overdue" ? "Was due " : "Due ") + fmtShort(due) : ""].filter(Boolean).join(" · ");
      }
      card.querySelector(".s-when").textContent = when;
      var pill = card.querySelector(".pill");
      pill.textContent = s.paid ? "Mark unpaid" : "Mark paid";
      if (!s.paid) pill.classList.add("unpaid");
      pill.hidden = qt;
      card.querySelector('[data-a="remind"]').hidden = !!s.paid || qt;
      card.querySelector('[data-a="convert"]').hidden = !qt || st === "accepted";
      card.querySelector('[data-a="convert"]').addEventListener("click", function () { convertQuote(s); });
      card.querySelector('[data-a="remind"]').addEventListener("click", function () { sendPdfFor(s, "reminder"); });
      pill.addEventListener("click", function () { togglePaid(s); });
      var acts = card.querySelector(".s-actions"), conf = card.querySelector(".confirm");
      card.querySelector('[data-a="open"]').addEventListener("click", function () { openInvoice(s, false); });
      card.querySelector('[data-a="copy"]').addEventListener("click", function () { openInvoice(s, true); });
      card.querySelector('[data-a="pdf"]').addEventListener("click", function () { sendPdfFor(s); });
      card.querySelector('[data-a="del"]').addEventListener("click", function () {
        conf.querySelector("p").textContent = "Delete " + (isQuote(s) ? "quote" : "invoice") + " #" + (s.no || "") + " for good?";
        conf.hidden = false; acts.hidden = true;
      });
      card.querySelector('[data-a="cancel"]').addEventListener("click", function () { conf.hidden = true; acts.hidden = false; });
      card.querySelector('[data-a="yes"]').addEventListener("click", function () { deleteInvoice(s); });
      attachSwipe(card, { right: qt ? null : function () { togglePaid(s); }, left: function () { card.querySelector('[data-a="del"]').click(); } });
      box.append(card);
    });
  }
  // Change payment details on both the open invoice and its saved copy
  function payMutate(id, fn) {
    if (savedLocal[id]) {
      fn(savedLocal[id]);
      savedLocal[id].updatedAt = Date.now();
      saveSaved();
      markDirty(id);
    }
    if (id === inv.id) { fn(inv); changed(); }
    renderSaved();
  }
  function docById(id) { return id === inv.id ? inv : savedLocal[id]; }
  function paySnap(d) { return clone({ paid: !!d.paid, paidDate: d.paidDate || "", paidMethod: d.paidMethod || "", payments: paymentsOf(d) }); }
  function rememberMethod(m) { settings.lastMethod = m; lsSet(LS_SETTINGS, settings); }
  function payInFull(id, date, method) {
    date = date || todayIso(); method = method || settings.lastMethod || "Bank transfer";
    rememberMethod(method);
    var bal = balanceOf(docById(id)), p = bal > 0 ? { id: lid(), date: date, amount: String(bal), method: method } : null;
    payMutate(id, function (d) {
      d.payments = paymentsOf(d).concat(p ? [clone(p)] : []);
      d.paid = true; d.paidDate = date; d.paidMethod = method;
    });
  }
  function recordPayment(id, amount, date, method) {
    rememberMethod(method);
    var p = { id: lid(), date: date || todayIso(), amount: String(round2(amount)), method: method };
    payMutate(id, function (d) {
      d.payments = paymentsOf(d).concat([clone(p)]);
      if (round2(compute(d).total - paidSoFar(d)) <= 0) { d.paid = true; d.paidDate = p.date; d.paidMethod = p.method; }
    });
  }
  function removePayment(id, pid) {
    payMutate(id, function (d) {
      d.payments = paymentsOf(d).filter(function (x) { return x.id !== pid; });
      d.paid = false;
      if (d.payments.length && round2(compute(d).total - paidSoFar(d)) <= 0) d.paid = true;
      else { d.paidDate = ""; d.paidMethod = ""; }
    });
  }
  function unpay(id) { payMutate(id, function (d) { d.payments = []; d.paid = false; d.paidDate = ""; d.paidMethod = ""; }); }
  function restorePay(id, snap) { payMutate(id, function (d) { Object.assign(d, clone(snap)); }); }
  function togglePaid(s) {
    var before = paySnap(s);
    if (s.paid) unpay(s.id); else payInFull(s.id);
    toast("#" + s.no + (s.paid ? " marked as paid" : " marked as unpaid"), "Undo", function () { restorePay(s.id, before); });
  }
  function renderPayCard() {
    $("pay-card").hidden = isQuote(inv);
    if (isQuote(inv)) return;
    var st = statusOf(inv), chip = $("pay-status"), due = dueText(), c = compute();
    chip.className = "chip " + st;
    chip.textContent = st === "unpaid" ? "Not paid yet" : STATUS_WORDS[st];
    setText("pay-total", fmtMoney(c.total));
    var list = $("pay-list"), ps = paymentsOf(inv);
    list.innerHTML = "";
    ps.forEach(function (x) {
      var row = document.createElement("div"); row.className = "pay-row";
      var l = document.createElement("span"); l.textContent = fmtShort(x.date) + " · " + x.method;
      var a = document.createElement("span"); a.className = "amt"; a.textContent = fmtMoney(num(x.amount));
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "mini"; rm.textContent = "Remove";
      rm.addEventListener("click", function () {
        var before = paySnap(inv), id = inv.id;
        removePayment(id, x.id);
        toast("Payment removed", "Undo", function () { restorePay(id, before); });
      });
      row.append(l, a, rm); list.append(row);
    });
    list.hidden = !ps.length;
    $("pay-bal-row").hidden = !ps.length || inv.paid;
    setText("pay-bal", fmtMoney(balanceOf(inv)));
    $("pay-unpaid").hidden = !!inv.paid;
    $("pay-paid").hidden = !inv.paid;
    if (inv.paid) {
      setText("paid-line", "Paid in full" + (inv.paidDate ? " on " + fmtDate(inv.paidDate) : "") + (inv.paidMethod ? " by " + inv.paidMethod.toLowerCase() : "") + ".");
    } else {
      if (!$("paid-date").value) $("paid-date").value = todayIso();
      if (!$("paid-method").dataset.touched) $("paid-method").value = settings.lastMethod || "Bank transfer";
      if (!$("pay-amt").dataset.touched || document.activeElement !== $("pay-amt")) { $("pay-amt").value = balanceOf(inv) > 0 ? balanceOf(inv).toFixed(2) : ""; delete $("pay-amt").dataset.touched; }
    }
    $("mark-paid").textContent = (ps.length ? "Paid the rest" : "Paid in full") + (st === "overdue" && due ? " (was due " + due + ")" : "");
  }
  $("paid-method").addEventListener("change", function () { this.dataset.touched = "1"; });
  $("pay-amt").addEventListener("input", function () { this.dataset.touched = "1"; });
  var stampAnim = false;
  $("mark-paid").addEventListener("click", function () {
    stampAnim = true;
    payInFull(inv.id, $("paid-date").value || todayIso(), $("paid-method").value);
    delete $("paid-method").dataset.touched;
    toast("Invoice #" + inv.no + " marked as paid");
  });
  $("pay-part").addEventListener("click", function () {
    var amt = num($("pay-amt").value);
    if (!(amt > 0)) { toast("Put in how much they paid first."); $("pay-amt").focus(); return; }
    var before = paySnap(inv), id = inv.id;
    recordPayment(id, amt, $("paid-date").value || todayIso(), $("paid-method").value);
    delete $("pay-amt").dataset.touched;
    toast(fmtMoney(amt) + " recorded" + (inv.paid ? ". Now paid in full." : ". " + fmtMoney(balanceOf(inv)) + " left to pay."), "Undo", function () { restorePay(id, before); });
  });
  $("mark-unpaid").addEventListener("click", function () {
    var before = paySnap(inv), id = inv.id;
    unpay(id);
    toast("Marked as unpaid", "Undo", function () { restorePay(id, before); });
  });

  // ---------- Quotes ----------
  function renderQuoteCard() {
    $("quote-card").hidden = !isQuote(inv);
    if (!isQuote(inv)) return;
    var st = quoteStatusOf(inv), chip = $("quote-status"), v = validIso(inv);
    chip.className = "chip " + st;
    chip.textContent = STATUS_WORDS[st];
    setText("quote-line", st === "accepted" ? "The customer said yes" + (inv.convertedTo ? " and it became invoice #" + inv.convertedTo : "") + "."
      : st === "declined" ? "The customer said no."
      : st === "expired" ? "This quote ran out on " + fmtDate(v) + ". You can still turn it into an invoice."
      : v ? "Valid until " + fmtDate(v) + "." : "");
    $("quote-accept").hidden = st === "accepted";
    $("quote-decline").hidden = st === "declined" || st === "accepted";
    $("quote-reopen").hidden = st !== "declined";
  }
  async function convertQuote(q) {
    await flush();
    var quote = clone(q), qid = quote.id;
    var keep = inv;
    var next = clone(quote);
    next.id = uid(); next.docType = "invoice"; next.date = todayIso(); next.snap = null;
    next.paid = false; next.paidDate = ""; next.paidMethod = ""; next.payments = [];
    delete next.quoteStatus; delete next.convertedTo; delete next.kind; delete next.total; delete next.subtotal; delete next.updatedAt;
    next.fromQuote = quote.no;
    next.items.forEach(function (it) { it.id = lid(); });
    next.no = ""; inv = next; next.no = nextNo("invoice"); inv = keep;
    if (savedLocal[qid]) { savedLocal[qid].quoteStatus = "accepted"; savedLocal[qid].convertedTo = next.no; savedLocal[qid].updatedAt = Date.now(); saveSaved(); markDirty(qid); }
    inv = next; inv.isExample = false; lastSavedJson = null;
    lsSet(LS_DRAFT, draftBody());
    renderAll(); show("edit");
    changed();
    toast("Quote #" + quote.no + " is now invoice #" + inv.no);
  }
  $("quote-accept").addEventListener("click", function () { convertQuote(invBody()); });
  $("quote-decline").addEventListener("click", function () { inv.quoteStatus = "declined"; changed(); });
  $("quote-reopen").addEventListener("click", function () { inv.quoteStatus = ""; changed(); });
  document.querySelectorAll("[data-doc]").forEach(function (b) {
    b.addEventListener("click", function () {
      var want = b.getAttribute("data-doc");
      if ((want === "quote") === isQuote(inv)) return;
      inv.docType = want;
      inv.no = "";
      inv.no = nextNo(want);
      if (want === "quote") { inv.paid = false; inv.paidDate = ""; inv.paidMethod = ""; inv.payments = []; }
      $("inv-no").value = inv.no;
      changed(); renderLines();
      toast("Now a " + want + ", numbered " + inv.no);
    });
  });
  async function deleteInvoice(s) {
    var copy = clone(s), wasOpen = s.id === inv.id;
    try {
      delete savedLocal[s.id]; saveSaved(); markDeleted(s.id);
      if (wasOpen) { inv = blankInvoice(nextNo("invoice")); lastSavedJson = null; lsSet(LS_DRAFT, draftBody()); renderAll(); }
      else renderSaved();
      toast((isQuote(s) ? "Quote #" : "Invoice #") + (s.no || "") + " deleted", "Undo", function () {
        copy.updatedAt = Date.now(); savedLocal[copy.id] = copy; saveSaved(); markDirty(copy.id);
        if (wasOpen && !worthSaving()) openInvoice(copy, false); else renderSaved();
      });
    } catch (e) { toast("Couldn't delete that invoice."); }
  }
  async function openInvoice(s, asCopy) {
    await flush();
    if (asCopy) {
      inv = clone(s);
      inv.id = uid(); inv.no = nextNo(inv.docType); inv.date = todayIso(); inv.paid = false; inv.snap = null;
      inv.paidDate = ""; inv.paidMethod = ""; inv.payments = []; inv.photos = [];
      delete inv.quoteStatus; delete inv.convertedTo; delete inv.fromQuote;
      if (inv.terms === "date") { inv.terms = ""; inv.dueDate = ""; }
      inv.items.forEach(function (it) { it.id = lid(); });
      lastSavedJson = null;
    } else {
      inv = clone(s);
      lastSavedJson = stable(stripForCompare(s));
    }
    delete inv.kind; delete inv.total; delete inv.subtotal; delete inv.updatedAt;
    inv.isExample = false;
    lsSet(LS_DRAFT, draftBody());
    renderAll();
    show("edit");
    toast((asCopy ? "Copied to new " : "Opened ") + (isQuote(inv) ? "quote" : "invoice") + " #" + inv.no);
    if (asCopy) changed();
  }

  // Delete the invoice or quote that's open, after asking (with Undo afterwards as well)
  function delWords() {
    var word = isQuote(inv) ? "quote" : "invoice";
    var t = "Delete " + word + (inv.no ? " #" + inv.no : "") + (String(inv.custName || "").trim() ? " for " + inv.custName.trim() : "") +
      " (" + fmtMoney(compute().total) + ") for good? It's removed from Saved" + (cloudUser ? " and from your online copy" : "") + ".";
    if (inv.items.some(function (it) { return it.timeId; })) t += " Its time goes back to Not billed on the timesheet.";
    if (!isQuote(inv) && paidSoFar(inv) > 0) t += " It has payments recorded against it, so your paid totals will drop.";
    return t;
  }
  function canDelete() { return !inv.isExample && (worthSaving() || !!savedLocal[inv.id]); }
  function renderDel() {
    var word = isQuote(inv) ? "quote" : "invoice";
    $("del-inv").textContent = "Delete this " + word;
    $("del-inv").hidden = !canDelete();
    document.querySelectorAll("[data-del-confirm]").forEach(function (c) { if (!c.hidden) c.querySelector("[data-del-text]").textContent = delWords(); });
  }
  document.querySelectorAll("[data-del-open]").forEach(function (b) {
    var box = b.closest(".actions, .card"), conf = box.querySelector("[data-del-confirm]");
    b.addEventListener("click", function () {
      conf.querySelector("[data-del-text]").textContent = delWords();
      conf.hidden = false; b.hidden = true;
      conf.querySelector("[data-del-no]").focus();
    });
    conf.querySelector("[data-del-no]").addEventListener("click", function () { conf.hidden = true; b.hidden = false; });
    conf.querySelector("[data-del-yes]").addEventListener("click", function () {
      conf.hidden = true; b.hidden = false;
      clearTimeout(saveTimer);
      var doc = savedLocal[inv.id] ? Object.assign(invBody(), { updatedAt: Date.now() }) : invBody();
      deleteInvoice(doc);
      show("home");
    });
  });

  async function startNew() {
    await flush();
    inv = blankInvoice(nextNo("invoice"));
    lastSavedJson = null;
    lsSet(LS_DRAFT, draftBody());
    renderAll();
    show("edit");
    toast("New invoice #" + inv.no + " started. Tap Quote at the top to make it a quote.");
  }

  // ---------- Customers and timesheet ----------
  // Kept like invoices: on this phone first, and in the "records" table online when signed in.
  function rid(p) { return p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }
  function isoOf(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addMonths(iso, n) { var d = new Date(iso.slice(0, 7) + "-01T12:00:00"); d.setMonth(d.getMonth() + n); return isoOf(d).slice(0, 7) + "-01"; }
  function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5); }
  function monthName(iso, long) { var d = new Date(iso + "T12:00:00"); return d.toLocaleDateString(undefined, long ? { month: "long", year: "numeric" } : { month: "short" }); }
  function money(n) { return fmtMoney(n, settings.currency); }
  function shortMoney(n) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: settings.currency || "GBP", notation: "compact", maximumFractionDigits: 1 }).format(n); }
    catch (e) { return money(n); }
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }
  function setIfIdle(id, v) { var el = $(id); if (document.activeElement !== el) el.value = v == null ? "" : v; }
  function normName(n) { return String(n || "").trim().replace(/\s+/g, " ").toLowerCase(); }

  function saveRecords() {
    persistKey("records").catch(function () {});
  }
  function putRecord(r) { r.updatedAt = Date.now(); records[r.id] = r; saveRecords(); markRecDirty(r.id); }
  function dropRecord(id) { delete records[id]; saveRecords(); markRecDeleted(id); }
  function recsOf(kind) { return Object.keys(records).map(function (k) { return records[k]; }).filter(function (r) { return r && r.kind === kind; }); }

  // Time entries: hours at a rate, for a customer, billed once an invoice has a line made from them
  function timeAmount(e) { return round2(num(e.hrs) * num(e.rate)); }
  function runningTimer() {
    return recsOf("time").filter(function (e) { return e.running; }).sort(function (a, b) { return (b.start || 0) - (a.start || 0); })[0] || null;
  }
  function doneTime() {
    return recsOf("time").filter(function (e) { return !e.running; }).sort(function (a, b) {
      if ((b.date || "") !== (a.date || "")) return (b.date || "") < (a.date || "") ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }
  // Worked out from the invoices themselves, so deleting an invoice (or its line) frees the time again
  function billedMap() {
    var m = {};
    function scan(d) {
      if (!d || isQuote(d) || !Array.isArray(d.items)) return;
      d.items.forEach(function (it) { if (it.timeId && !m[it.timeId]) m[it.timeId] = { id: d.id, no: d.no }; });
    }
    if (!inv.isExample) scan(inv);
    Object.keys(savedLocal).forEach(function (k) { if (k !== inv.id) scan(savedLocal[k]); });
    return m;
  }
  function unbilledOf(list, bm) { return list.filter(function (e) { return !e.running && !bm[e.id] && num(e.hrs) > 0; }); }
  function byDate(a, b) { return (a.date || "") < (b.date || "") ? -1 : (a.date || "") > (b.date || "") ? 1 : 0; }
  function sumHrs(list) { return round2(list.reduce(function (t, e) { return t + num(e.hrs); }, 0)); }
  function sumAmt(list) { return round2(list.reduce(function (t, e) { return t + timeAmount(e); }, 0)); }
  function timeItem(e) {
    return { id: lid(), type: "hourly", desc: (String(e.desc || "").trim() || "Time") + " (" + fmtShort(e.date) + ")",
      hrs: String(e.hrs), rate: String(e.rate || ""), amt: "", timeId: e.id };
  }

  // Customers: the ones saved here, plus everyone named on an invoice or a time entry
  function customerList() {
    var byKey = {}, out = [];
    function entry(name, rec) {
      var c = { key: normName(name), name: String(name).trim().replace(/\s+/g, " "), rec: rec || null,
        contact: rec ? rec.contact || "" : "", notes: rec ? rec.notes || "" : "", rate: rec ? rec.rate || "" : "", terms: rec ? rec.terms || "" : "",
        docs: [], time: [], last: rec ? rec.createdOn || "" : "" };
      out.push(c);
      return c;
    }
    recsOf("customer").sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).forEach(function (r) {
      if (!normName(r.name) || byKey[normName(r.name)]) return;
      var c = entry(r.name, r);
      [r.name].concat(r.aka || []).forEach(function (n) { var k = normName(n); if (k && !byKey[k]) byKey[k] = c; });
    });
    sortedSaved().forEach(function (d) {
      var k = normName(d.custName);
      if (!k) return;
      var c = byKey[k] || (byKey[k] = entry(d.custName));
      c.docs.push(d);
      if (!c.contact && d.custContact) c.contact = d.custContact;
      if ((d.date || "") > c.last) c.last = d.date || "";
    });
    recsOf("time").forEach(function (e) {
      var k = normName(e.custName);
      if (!k) return;
      var c = byKey[k] || (byKey[k] = entry(e.custName));
      c.time.push(e);
      if ((e.date || "") > c.last) c.last = e.date || "";
    });
    out.sort(function (a, b) { return a.last !== b.last ? (b.last > a.last ? 1 : -1) : a.name.localeCompare(b.name); });
    return { list: out, byKey: byKey };
  }
  function findCustomer(name) { return normName(name) ? customerList().byKey[normName(name)] || null : null; }
  function ensureCustomerRecord(c) {
    if (c.rec) return c.rec;
    var r = { id: rid("cus"), kind: "customer", name: c.name, contact: c.contact || "", notes: "", rate: "", aka: [], createdOn: todayIso() };
    putRecord(r);
    c.rec = r;
    return r;
  }
  function defaultRate(name) {
    var c = findCustomer(name);
    if (c && num(c.rate)) return c.rate;
    var sv = rateService();
    return sv ? sv.rate || "" : "";
  }
  function custStats(c, bm) {
    var invs = c.docs.filter(function (d) { return !isQuote(d); });
    var o = { invN: invs.length, billed: 0, owed: 0, owedN: 0, paid: 0, overdueN: 0 };
    invs.forEach(function (d) {
      o.billed += compute(d).total; o.paid += paidSoFar(d);
      if (!d.paid && balanceOf(d) > 0) { o.owed += balanceOf(d); o.owedN++; }
      if (statusOf(d) === "overdue") o.overdueN++;
    });
    o.billed = round2(o.billed); o.paid = round2(o.paid); o.owed = round2(o.owed);
    o.un = unbilledOf(c.time, bm); o.unHrs = sumHrs(o.un); o.unAmt = sumAmt(o.un);
    return o;
  }
  function billGroups(bm) {
    return customerList().list.map(function (c) { var l = unbilledOf(c.time, bm); return { c: c, list: l, hrs: sumHrs(l), amt: sumAmt(l) }; })
      .filter(function (g) { return g.list.length; })
      .sort(function (a, b) { return b.amt - a.amt || b.hrs - a.hrs; });
  }

  // New invoices and quotes, for a customer or from their unbilled time
  async function startFor(c, type) {
    await flush();
    var no = nextNo(type);
    inv = blankInvoice(no);
    if (type === "quote") inv.docType = "quote";
    if (c) { inv.custName = c.name; inv.custContact = c.contact || ""; if (c.terms) inv.terms = c.terms; }
    lastSavedJson = null;
    lsSet(LS_DRAFT, draftBody());
    renderAll(); show("edit");
    toast("New " + type + " #" + inv.no + (c ? " for " + c.name : "") + " started");
  }
  async function billTime(c) {
    var list = unbilledOf(c.time, billedMap()).sort(byDate);
    if (!list.length) { toast("No time to bill for " + c.name + "."); return; }
    await flush();
    inv = blankInvoice(nextNo("invoice"));
    inv.custName = c.name; inv.custContact = c.contact || "";
    if (c.terms) inv.terms = c.terms;
    var descs = {};
    list.forEach(function (e) { var d = String(e.desc || "").trim(); if (d) descs[d.toLowerCase()] = d; });
    var dk = Object.keys(descs), d0 = list[0].date, d1 = list[list.length - 1].date;
    inv.job = dk.length === 1 ? descs[dk[0]] : d0 === d1 ? "Work on " + fmtDate(d0) : "Work from " + fmtShort(d0) + " to " + fmtShort(d1);
    inv.items = list.map(timeItem);
    lastSavedJson = null;
    lsSet(LS_DRAFT, draftBody());
    renderAll(); show("edit");
    changed();
    toast("Invoice #" + inv.no + " made from " + plural(list.length, "time entry", "time entries") + ". Check it, then send.", null, null, 4000);
  }
  function renderUnbilledCard() {
    var c = !inv.isExample && !isQuote(inv) ? findCustomer(inv.custName) : null;
    var list = c ? unbilledOf(c.time, billedMap()) : [];
    $("unbilled-card").hidden = !list.length;
    if (list.length) setText("unbilled-text", c.name + " has " + fmtHrs(sumHrs(list)) + " of time not billed yet (" +
      plural(list.length, "entry", "entries") + (sumAmt(list) ? ", " + money(sumAmt(list)) : "") + ").");
  }
  $("unbilled-add").addEventListener("click", function () {
    var c = findCustomer(inv.custName);
    if (!c) return;
    var list = unbilledOf(c.time, billedMap()).sort(byDate);
    list.forEach(function (e) { inv.items.push(timeItem(e)); });
    renderLines(); changed();
    toast("Added " + fmtHrs(sumHrs(list)) + " to this invoice");
  });

  // Rows used on Home, the timesheet and a customer's page
  function dashRow(title, sub, amt, warn, tag) {
    var row = document.createElement(tag || "div");
    row.className = "dash-row";
    row.innerHTML = '<div class="dash-top"><div><div class="s-title"></div><div class="s-sub"></div></div><div class="s-amt"></div></div><div class="dash-btns"></div>';
    row.querySelector(".s-title").textContent = title;
    row.querySelector(".s-sub").textContent = sub || "";
    var a = row.querySelector(".s-amt");
    a.textContent = amt || "";
    if (warn) a.classList.add("warn");
    return row;
  }
  function rowBtn(row, label, fn, go) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "mini" + (go ? " go" : ""); b.textContent = label;
    b.addEventListener("click", fn);
    row.querySelector(".dash-btns").append(b);
  }
  function addChip(el, cls, text) { var c = document.createElement("span"); c.className = "chip " + cls; c.textContent = text; el.append(c); return c; }
  function moreLink(box, label, fn) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "linkbtn"; b.textContent = label; b.style.marginTop = "6px";
    b.addEventListener("click", fn);
    box.append(b);
  }
  function emptyLine(box, text) { var p = document.createElement("p"); p.className = "dash-empty"; p.textContent = text; box.append(p); }
  function renderBillRows(box, groups, limit) {
    box.innerHTML = "";
    groups.slice(0, limit || groups.length).forEach(function (g) {
      var first = g.list.slice().sort(byDate)[0].date;
      var row = dashRow(g.c.name, fmtHrs(g.hrs) + " · " + plural(g.list.length, "entry", "entries") + " since " + fmtShort(first), g.amt ? money(g.amt) : "");
      rowBtn(row, "Bill these hours", function () { billTime(g.c); }, true);
      rowBtn(row, "See customer", function () { openCustomer(g.c.key); });
      box.append(row);
    });
  }
  function showSaved(filter) {
    savedFilter = filter;
    document.querySelectorAll("[data-filter]").forEach(function (o) { o.setAttribute("aria-pressed", String(o.getAttribute("data-filter") === filter)); });
    show("saved");
    renderSavedList();
  }

  // ---------- Home ----------
  function receivedSum(invs, from, to) { return round2(invs.reduce(function (t, x) { return t + receivedIn(x, from, to); }, 0)); }
  // The VAT quarter today falls in, for the business's stagger (which months its quarters end in)
  function vatQuarter(t) {
    var st = parseInt(settings.vatStagger, 10) || 1, cm = parseInt(t.slice(5, 7), 10), y = parseInt(t.slice(0, 4), 10);
    for (var k = 0; k < 3; k++) {
      var m = ((cm - 1 + k) % 12) + 1;
      if (((m - st) % 3 + 3) % 3 === 2) {
        var endFirst = (y + (cm - 1 + k >= 12 ? 1 : 0)) + "-" + String(m).padStart(2, "0") + "-01";
        return { from: addMonths(endFirst, -2), to: addMonths(endFirst, 1) };
      }
    }
  }
  var HOME_CARDS = [["stats", "h-stats", "Money summary (owed, overdue, paid, unbilled)"], ["chase", "h-chase", "Needs chasing"],
    ["bill", "h-bill", "Ready to bill"], ["quotes", "h-quotes", "Quotes waiting for an answer"], ["chart", "h-chart-card", "Money paid in chart"],
    ["vat", "h-vat", "VAT this quarter"]];
  function homeOrder() {
    var known = HOME_CARDS.map(function (h) { return h[0]; });
    var o = (Array.isArray(settings.homeOrder) ? settings.homeOrder : []).filter(function (k) { return known.indexOf(k) >= 0; });
    known.forEach(function (k) { if (o.indexOf(k) < 0) o.push(k); });
    return o;
  }
  function homeOff(k) { return Array.isArray(settings.homeOff) && settings.homeOff.indexOf(k) >= 0; }
  function cardEl(k) { return $(HOME_CARDS.filter(function (h) { return h[0] === k; })[0][1]); }
  function renderHomeSet() {
    var box = $("home-set"), order = homeOrder();
    box.innerHTML = "";
    order.forEach(function (k, i) {
      var label = HOME_CARDS.filter(function (h) { return h[0] === k; })[0][2];
      var row = document.createElement("div");
      row.className = "hs-row";
      row.innerHTML = '<label class="chk"><input type="checkbox"><span></span></label><button type="button" class="mini" data-up>Up</button><button type="button" class="mini" data-down>Down</button>';
      row.querySelector("span").textContent = label;
      var cb = row.querySelector("input");
      cb.checked = !homeOff(k);
      cb.setAttribute("aria-label", "Show " + label);
      cb.addEventListener("change", function () {
        var off = (settings.homeOff || []).filter(function (x) { return x !== k; });
        if (!cb.checked) off.push(k);
        settings.homeOff = off; settingsChanged();
      });
      function move(by) {
        var o = homeOrder(), at = o.indexOf(k), to = at + by;
        if (to < 0 || to >= o.length) return;
        o.splice(at, 1); o.splice(to, 0, k);
        settings.homeOrder = o; settingsChanged(); renderHomeSet();
        var again = $("home-set").children[to].querySelector(by < 0 ? "[data-up]" : "[data-down]");
        if (again && !again.disabled) again.focus();
      }
      var up = row.querySelector("[data-up]"), down = row.querySelector("[data-down]");
      up.disabled = i === 0; down.disabled = i === order.length - 1;
      up.setAttribute("aria-label", "Move " + label + " up"); down.setAttribute("aria-label", "Move " + label + " down");
      up.addEventListener("click", function () { move(-1); });
      down.addEventListener("click", function () { move(1); });
      box.append(row);
    });
  }
  var LS_NUDGE = "twb.nudge";
  function renderNudges() {
    var later = parseInt(localStorage.getItem(LS_NUDGE) || "0", 10) || 0;
    var hasData = Object.keys(savedLocal).length > 0 || Object.keys(records).length > 0;
    $("h-cloud").hidden = !(sb && !cloudUser && hasData && Date.now() > later);
    $("h-moved").hidden = !/github\.io$/.test(location.hostname);
  }
  $("h-cloud-later").addEventListener("click", function () {
    try { localStorage.setItem(LS_NUDGE, String(Date.now() + 7 * 864e5)); } catch (e) {}
    renderNudges();
  });
  $("h-cloud-go").addEventListener("click", function () {
    show("settings");
    setTimeout(function () { $("cloud-card").scrollIntoView({ block: "start" }); $("cloud-email").focus(); }, 0);
  });
  var barPick = 5;
  function renderHome() {
    renderNudges();
    var home = $("view-home");
    homeOrder().forEach(function (k) { home.append(cardEl(k)); });
    home.append($("h-clear"));
    var all = sortedSaved(), invs = all.filter(function (x) { return !isQuote(x); }), bm = billedMap(), t = todayIso();
    var cur = !inv.isExample && worthSaving();
    $("h-current").hidden = !cur;
    if (cur) {
      var cst = statusOf(inv), chip = $("h-current-chip");
      chip.className = "chip " + cst; chip.textContent = STATUS_WORDS[cst];
      setText("h-current-line", (isQuote(inv) ? "Quote #" : "Invoice #") + (inv.no || "—") + " · " +
        (String(inv.custName || "").trim() || "No customer yet") + " · " + fmtMoney(compute().total));
    }
    function owed(arr) { return round2(arr.reduce(function (s2, x) { return s2 + balanceOf(x); }, 0)); }
    var unpaid = invs.filter(function (x) { return !x.paid && balanceOf(x) > 0; });
    var overdue = invs.filter(function (x) { return statusOf(x) === "overdue"; }).sort(function (a, b) { return dueIsoOf(a) < dueIsoOf(b) ? -1 : 1; });
    setText("h-owed", money(owed(unpaid))); setText("h-owed-n", unpaid.length ? plural(unpaid.length, "invoice") : "Nothing owed");
    setText("h-overdue", money(owed(overdue))); setText("h-overdue-n", overdue.length ? plural(overdue.length, "invoice") : "Nothing late");
    $("h-overdue").classList.toggle("warn", overdue.length > 0);
    var m0 = t.slice(0, 7) + "-01";
    setText("h-month", money(receivedSum(invs, m0, addMonths(m0, 1))));
    setText("h-month-n", money(receivedSum(invs, addMonths(m0, -1), m0)) + " last month");
    var unAll = unbilledOf(recsOf("time"), bm);
    setText("h-unbilled", money(sumAmt(unAll))); setText("h-unbilled-n", unAll.length ? fmtHrs(sumHrs(unAll)) : "All billed");

    var chase = $("h-chase-list");
    chase.innerHTML = "";
    overdue.slice(0, 5).forEach(function (x) {
      var late = daysBetween(dueIsoOf(x), t);
      var row = dashRow("#" + (x.no || "—") + " · " + (x.custName || "No customer"),
        plural(late, "day") + " late · was due " + fmtShort(dueIsoOf(x)), fmtMoney(balanceOf(x), x.snap && x.snap.currency), true);
      rowBtn(row, "Send reminder", function () { sendPdfFor(x, "reminder"); }, true);
      rowBtn(row, "Mark paid", function () { togglePaid(x); });
      rowBtn(row, "Open", function () { openInvoice(x, false); });
      chase.append(row);
    });
    if (overdue.length > 5) moreLink(chase, "See all " + overdue.length + " overdue", function () { showSaved("overdue"); });
    $("h-chase").hidden = !overdue.length;

    var groups = billGroups(bm);
    renderBillRows($("h-bill-list"), groups, 5);
    if (groups.length > 5) moreLink($("h-bill-list"), "See them all on the timesheet", function () { show("time"); });
    $("h-bill").hidden = !groups.length;

    var waiting = all.filter(function (x) { return isQuote(x) && quoteStatusOf(x) === "quote"; });
    var qb = $("h-quotes-list");
    qb.innerHTML = "";
    waiting.slice(0, 5).forEach(function (x) {
      var row = dashRow("Quote #" + (x.no || "—") + " · " + (x.custName || "No customer"),
        "Made " + fmtShort(x.date) + (validIso(x) ? " · valid until " + fmtShort(validIso(x)) : ""), fmtMoney(x.total || 0, x.snap && x.snap.currency));
      rowBtn(row, "They said yes", function () { convertQuote(x); }, true);
      rowBtn(row, "Open", function () { openInvoice(x, false); });
      qb.append(row);
    });
    if (waiting.length > 5) moreLink(qb, "See all " + waiting.length + " quotes", function () { showSaved("quotes"); });
    $("h-quotes").hidden = !waiting.length;

    var nothing = !overdue.length && !groups.length && !waiting.length;
    $("h-clear").hidden = !nothing;
    if (nothing) {
      var fresh = !all.length && !recsOf("time").length;
      setText("h-clear-k", fresh ? "Welcome" : "All caught up");
      setText("h-clear-text", fresh
        ? "Make your first invoice or quote, or start the timer when you begin a job. Money owed, time to bill and quotes waiting will all show up here."
        : "Nothing is late, no time is waiting to be billed and no quotes are waiting for an answer." +
          (unpaid.length ? " " + money(owed(unpaid)) + " is still to come in, not due yet." : ""));
    }

    // Money paid in over the last six months
    var anyPaid = invs.some(function (x) { return paidSoFar(x) > 0; });
    $("h-chart-card").hidden = !anyPaid;
    if (anyPaid) {
      var months = [];
      for (var i = 5; i >= 0; i--) {
        var from = addMonths(m0, -i), to = addMonths(from, 1);
        months.push({ from: from, amt: receivedSum(invs, from, to), n: invs.filter(function (x) { return receivedIn(x, from, to) > 0; }).length });
      }
      var max = Math.max.apply(null, months.map(function (mo) { return mo.amt; })) || 1;
      var bars = $("h-bars");
      bars.innerHTML = "";
      months.forEach(function (mo, idx) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "bar-col"; b.setAttribute("aria-pressed", String(idx === barPick));
        b.setAttribute("aria-label", monthName(mo.from, true) + ": " + money(mo.amt));
        b.title = monthName(mo.from, true) + ": " + money(mo.amt);
        b.innerHTML = '<span class="bar-val"></span><span class="bar-track"><span class="bar"></span></span><span class="bar-k"></span>';
        b.querySelector(".bar-val").textContent = idx === barPick ? shortMoney(mo.amt) : "";
        b.querySelector(".bar").style.height = (mo.amt > 0 ? Math.max(3, mo.amt / max * 100) : 0) + "%";
        b.querySelector(".bar-k").textContent = monthName(mo.from, false);
        b.addEventListener("click", function () { barPick = idx; renderHome(); });
        bars.append(b);
      });
      var pk = months[barPick];
      setText("h-bar-detail", monthName(pk.from, true) + ": " + money(pk.amt) + " paid in" + (pk.n ? " on " + plural(pk.n, "invoice") : ""));
    }

    // VAT on this quarter's invoices, for VAT-registered businesses
    var rate = num(settings.taxRate);
    $("h-vat").hidden = !(rate > 0);
    if (rate > 0) {
      var q = vatQuarter(t), cash = settings.vatBasis === "cash", vat = 0, net = 0, n = 0, label = (settings.taxLabel || "VAT").trim();
      invs.forEach(function (x) {
        var c = compute(x);
        if (cash) {
          var r = receivedIn(x, q.from, q.to);
          if (r > 0 && c.total > 0) { vat += c.tax * r / c.total; net += c.sub * r / c.total; n++; }
        } else if (x.date >= q.from && x.date < q.to) { vat += c.tax; net += c.sub; n++; }
      });
      setText("h-vat-k", label + " this quarter");
      setText("h-vat-range", fmtShort(q.from) + " – " + fmtShort(isoAddDays(q.to, -1)));
      setText("h-vat-net", money(round2(net)));
      setText("h-vat-label", label + " charged");
      setText("h-vat-amt", money(round2(vat)));
      setText("h-vat-note", (cash ? "Counted when you're paid (cash accounting)" : "Counted by invoice date") + ", from " + plural(n, "invoice") +
        ". The return and payment are due by " + fmtDate(isoAddDays(addMonths(q.to, 1), 6)) + ". Change how it's counted in Settings, under Money and VAT.");
    }
    $("h-stats").hidden = homeOff("stats");
    HOME_CARDS.forEach(function (h) { if (homeOff(h[0])) $(h[1]).hidden = true; });
  }
  $("h-new-inv").addEventListener("click", function () { startFor(null, "invoice"); });
  $("h-new-quote").addEventListener("click", function () { startFor(null, "quote"); });
  $("h-log-time").addEventListener("click", function () { openLogSheet(""); });
  $("h-current-go").addEventListener("click", function () { show("edit"); });
  $("h-st-owed").addEventListener("click", function () { showSaved("unpaid"); });
  $("h-st-overdue").addEventListener("click", function () { showSaved("overdue"); });
  $("h-st-month").addEventListener("click", function () { showSaved("paid"); });
  $("h-st-unbilled").addEventListener("click", function () { show("time"); });
  $("h-timer-open").addEventListener("click", function () { show("time"); });
  $("h-timer-stop").addEventListener("click", function () { stopTimer(); });

  // ---------- Timer ----------
  var tickTimer = null, tmSaveTimer = null, FACE_C = 2 * Math.PI * 92;
  (function buildTicks() {
    var out = "";
    for (var i = 0; i < 60; i++) {
      var a = i * Math.PI / 30, major = i % 5 === 0, r1 = major ? 70 : 75, r2 = 80;
      out += '<line class="tk' + (major ? " major" : "") + '" x1="' + (110 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (110 - r1 * Math.cos(a)).toFixed(1) +
        '" x2="' + (110 + r2 * Math.sin(a)).toFixed(1) + '" y2="' + (110 - r2 * Math.cos(a)).toFixed(1) + '"></line>';
    }
    $("tm-ticks").innerHTML = out;
  })();
  // The ring fills once an hour, like the hand going round a clock; the middle shows hours and minutes
  function updateFace(ms) {
    var mins = Math.max(0, ms) / 60000, pr = $("tm-prog");
    pr.style.strokeDasharray = FACE_C;
    pr.style.strokeDashoffset = FACE_C * (1 - (mins % 60) / 60);
    $("tm-face-h").textContent = Math.floor(mins / 60) + ":" + String(Math.floor(mins % 60)).padStart(2, "0");
  }
  function fmtClock(ms) {
    var sec = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(sec / 3600) + ":" + String(Math.floor(sec / 60) % 60).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }
  function tick() {
    var r = runningTimer();
    if (!r) { renderTimer(); return; }
    var txt = fmtClock(Date.now() - r.start);
    $("tm-clock").textContent = txt; $("h-timer-clock").textContent = txt; $("ls-clock").textContent = txt;
    updateFace(Date.now() - r.start);
  }
  function renderTimer() {
    var r = runningTimer();
    $("tm-clock").textContent = r ? fmtClock(Date.now() - r.start) : "0:00:00";
    $("tm-face").toggleAttribute("hidden", settings.timerStyle === "digits");
    updateFace(r ? Date.now() - r.start : 0);
    renderSheet();
    $("tm-chip").hidden = !r;
    $("tm-start").hidden = !!r;
    $("tm-running").hidden = !r;
    if (r) { setIfIdle("tm-cust", r.custName); setIfIdle("tm-desc", r.desc); }
    $("h-timer").hidden = !r;
    if (r) {
      setText("h-timer-text", (r.custName || "No customer") + (r.desc ? " · " + r.desc : "") + " · started " +
        new Date(r.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
      $("h-timer-clock").textContent = fmtClock(Date.now() - r.start);
    }
    if (r && !tickTimer) tickTimer = setInterval(tick, 1000);
    if (!r && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }
  function timerFields() {
    var r = runningTimer();
    if (!r) return;
    r.custName = $("tm-cust").value.trim(); r.desc = $("tm-desc").value.trim();
    clearTimeout(tmSaveTimer);
    tmSaveTimer = setTimeout(function () { r.rate = defaultRate(r.custName); putRecord(r); }, 800);
  }
  $("tm-cust").addEventListener("input", timerFields);
  $("tm-desc").addEventListener("input", timerFields);
  function startTimer(name, desc) {
    if (runningTimer()) return;
    putRecord({ id: rid("tim"), kind: "time", running: true, start: Date.now(), date: todayIso(), custName: name, desc: desc, rate: defaultRate(name) });
    renderOverview();
    toast("Timer started" + (name ? " for " + name : ""));
  }
  $("tm-start").addEventListener("click", function () { startTimer($("tm-cust").value.trim(), $("tm-desc").value.trim()); });

  // ---------- Quick log-time panel ----------
  function openLogSheet(name) {
    if (settings.quickPanel === false) {
      show("time");
      if (name) { $("at-cust").value = name; if (!runningTimer()) $("tm-cust").value = name; if (!$("at-rate").dataset.touched) $("at-rate").value = defaultRate(name); }
      return;
    }
    $("ls-cust").value = name || ""; $("ls-desc").value = ""; $("ls-hrs").value = ""; $("ls-date").value = todayIso();
    sheetOpener = document.activeElement;
    $("sheet-bg").hidden = false; $("log-sheet").hidden = false;
    renderSheet();
    $("ls-close").focus();
  }
  var sheetOpener = null;
  function closeLogSheet() {
    $("sheet-bg").hidden = true; $("log-sheet").hidden = true;
    if (sheetOpener && sheetOpener.focus) sheetOpener.focus();
    sheetOpener = null;
  }
  function renderSheet() {
    if ($("log-sheet").hidden) return;
    var r = runningTimer();
    $("ls-running").hidden = !r; $("ls-start").hidden = !!r;
    if (r) { setText("ls-run-text", "Timer running for " + (r.custName || "no customer") + (r.desc ? " · " + r.desc : "") + "."); $("ls-clock").textContent = fmtClock(Date.now() - r.start); }
  }
  $("ls-close").addEventListener("click", closeLogSheet);
  $("sheet-bg").addEventListener("click", closeLogSheet);
  document.addEventListener("keydown", function (e) {
    if ($("log-sheet").hidden) return;
    if (e.key === "Escape") { closeLogSheet(); return; }
    if (e.key !== "Tab") return;
    var f = Array.prototype.filter.call($("log-sheet").querySelectorAll("button, input"), function (el) { return !el.disabled && el.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  $("ls-start").addEventListener("click", function () { startTimer($("ls-cust").value.trim(), $("ls-desc").value.trim()); closeLogSheet(); });
  $("ls-stop").addEventListener("click", function () { stopTimer(); closeLogSheet(); });
  $("ls-full").addEventListener("click", function () { closeLogSheet(); show("time"); });
  $("ls-add").addEventListener("click", function () {
    var hrs = num($("ls-hrs").value), name = $("ls-cust").value.trim();
    if (!(hrs > 0)) { toast("Put in how many hours, for example 2.5."); $("ls-hrs").focus(); return; }
    var e = { id: rid("tim"), kind: "time", date: $("ls-date").value || todayIso(), hrs: String(round2(hrs)), custName: name, desc: $("ls-desc").value.trim(), rate: defaultRate(name) };
    putRecord(e);
    closeLogSheet(); renderOverview();
    toast("Added " + fmtHrs(hrs) + (name ? " for " + name : ""), "Undo", function () { dropRecord(e.id); renderOverview(); });
  });
  function stopTimer() {
    var r = runningTimer();
    if (!r) return;
    clearTimeout(tmSaveTimer);
    if (!$("view-time").hidden) { r.custName = $("tm-cust").value.trim(); r.desc = $("tm-desc").value.trim(); }
    var ms = Date.now() - r.start, before = clone(r);
    $("tm-cust").value = ""; $("tm-desc").value = "";
    if (ms < 30000) {
      dropRecord(r.id); renderOverview();
      toast("Stopped. That was under a minute, so nothing was saved.");
      return;
    }
    // Round up to the chosen step (a tiny allowance so exactly 15:00 stays 15 minutes)
    var step = parseInt(settings.timeRound, 10) || 1, mins = ms / 60000;
    mins = step > 1 ? Math.ceil(mins / step - 1e-6) * step : Math.max(1, Math.round(mins));
    r.running = false; r.end = Date.now(); r.date = isoOf(new Date(r.start)); r.hrs = String(round2(mins / 60));
    r.rate = r.rate || defaultRate(r.custName);
    putRecord(r);
    renderOverview();
    toast("Saved " + fmtHrs(num(r.hrs)) + (r.custName ? " for " + r.custName : ""), "Undo", function () { putRecord(before); renderOverview(); });
  }
  $("tm-stop").addEventListener("click", stopTimer);
  $("tm-cancel").addEventListener("click", function () {
    var r = runningTimer();
    if (!r) return;
    var copy = clone(r);
    dropRecord(r.id);
    $("tm-cust").value = ""; $("tm-desc").value = "";
    renderOverview();
    toast("Timer thrown away", "Undo", function () { putRecord(copy); renderOverview(); });
  });

  // ---------- Timesheet ----------
  var timeFilter = "unbilled", editTimeId = null, timeDraft = null, timeShown = 40;
  document.querySelectorAll("[data-tfilter]").forEach(function (b) {
    b.addEventListener("click", function () {
      timeFilter = b.getAttribute("data-tfilter"); timeShown = 40;
      document.querySelectorAll("[data-tfilter]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      renderTime();
    });
  });
  function renderTime() {
    var bm = billedMap(), all = doneTime(), t = todayIso();
    var wk0 = isoAddDays(t, -((new Date(t + "T12:00:00").getDay() + 6) % 7)), wk1 = isoAddDays(wk0, 7);
    var week = all.filter(function (e) { return e.date >= wk0 && e.date < wk1; });
    setText("ts-week", fmtHrs(sumHrs(week))); setText("ts-week-n", money(sumAmt(week)) + " of work since Monday");
    var un = unbilledOf(all, bm);
    setText("ts-un", money(sumAmt(un))); setText("ts-un-n", un.length ? fmtHrs(sumHrs(un)) + " · " + plural(un.length, "entry", "entries") : "All billed");
    var groups = billGroups(bm);
    renderBillRows($("ts-bill-list"), groups);
    $("ts-bill").hidden = !groups.length;
    if (!$("at-date").value) $("at-date").value = t;
    if (!$("at-rate").dataset.touched) setIfIdle("at-rate", defaultRate($("at-cust").value));

    var list = all.filter(function (e) { return timeFilter === "all" || (timeFilter === "billed") === !!bm[e.id]; });
    var box = $("time-list");
    box.innerHTML = "";
    if (!list.length) {
      var em = document.createElement("div");
      em.className = "empty-lines";
      em.textContent = !all.length ? "No time logged yet. Start the timer, or add time by hand above."
        : timeFilter === "unbilled" ? "Everything's billed." : "Nothing billed yet.";
      box.append(em);
      return;
    }
    list.slice(0, timeShown).forEach(function (e) { box.append(editTimeId === e.id ? timeEditor(e, bm[e.id]) : timeCard(e, bm[e.id])); });
    if (list.length > timeShown) moreLink(box, "Show more", function () { timeShown += 40; renderTime(); });
  }
  function timeCard(e, b) {
    var card = document.createElement("div");
    card.className = "saved";
    card.innerHTML = '<div class="s-top"><div><div class="s-title"></div><div class="s-sub"></div></div><div class="s-amt"></div></div>' +
      '<div class="s-status"><span class="chip"></span><span class="s-when"></span></div>' +
      '<div class="s-actions"><button type="button" data-a="edit">Change</button><button type="button" data-a="inv">Open invoice</button><button type="button" class="del" data-a="del">Delete</button></div>';
    card.querySelector(".s-title").textContent = fmtHrs(num(e.hrs)) + " · " + (String(e.custName || "").trim() || "No customer");
    card.querySelector(".s-sub").textContent = [fmtDate(e.date), e.desc].filter(Boolean).join(" · ");
    card.querySelector(".s-amt").textContent = num(e.rate) ? money(timeAmount(e)) : "";
    var chip = card.querySelector(".chip");
    chip.className = "chip " + (b ? "billed" : "unbilled");
    chip.textContent = b ? "On invoice #" + (b.no || "—") : "Not billed";
    card.querySelector(".s-when").textContent = num(e.rate) ? "at " + money(num(e.rate)) + "/hr" : "No rate set";
    var ib = card.querySelector('[data-a="inv"]');
    ib.hidden = !b;
    ib.addEventListener("click", function () { if (b.id === inv.id) show("edit"); else if (savedLocal[b.id]) openInvoice(savedLocal[b.id], false); });
    card.querySelector('[data-a="edit"]').addEventListener("click", function () {
      editTimeId = e.id;
      timeDraft = { date: e.date || "", hrs: e.hrs || "", custName: e.custName || "", desc: e.desc || "", rate: e.rate || "" };
      renderTime();
    });
    card.querySelector('[data-a="del"]').addEventListener("click", function () {
      var copy = clone(e);
      dropRecord(e.id); renderOverview();
      toast("Time entry deleted", "Undo", function () { putRecord(copy); renderOverview(); });
    });
    attachSwipe(card, { left: function () { card.querySelector('[data-a="del"]').click(); } });
    return card;
  }
  function timeEditor(e, b) {
    var card = document.createElement("div");
    card.className = "saved time-edit";
    card.innerHTML = '<p class="eyebrow">Change time entry</p>' +
      '<div class="row"><label class="f"><span>Date</span><input type="date" data-k="date"></label><label class="f"><span>Hours</span><input class="num" inputmode="decimal" data-k="hrs"></label></div>' +
      '<label class="f"><span>Customer</span><input data-k="custName" list="cust-list" autocomplete="off"></label>' +
      '<label class="f"><span>What was done</span><input data-k="desc" autocomplete="off"></label>' +
      '<label class="f"><span>Rate per hour</span><span class="money"><span class="cur"></span><input class="num" inputmode="decimal" placeholder="0.00" data-k="rate"></span></label>' +
      '<p class="hint" data-billed hidden></p>' +
      '<div class="row"><button type="button" class="btn" data-a="cancel">Cancel</button><button type="button" class="btn primary" data-a="save">Save</button></div>';
    card.querySelector(".cur").textContent = curSymbol();
    card.querySelectorAll("[data-k]").forEach(function (el) {
      var k = el.getAttribute("data-k");
      el.value = timeDraft[k] || "";
      el.addEventListener("input", function () { timeDraft[k] = el.value; });
    });
    if (b) { var h = card.querySelector("[data-billed]"); h.hidden = false; h.textContent = "This is already on invoice #" + (b.no || "—") + ". Changing it here doesn't change the invoice."; }
    card.querySelector('[data-a="cancel"]').addEventListener("click", function () { editTimeId = null; timeDraft = null; renderTime(); });
    card.querySelector('[data-a="save"]').addEventListener("click", function () {
      if (!(num(timeDraft.hrs) > 0)) { toast("Put in the hours first."); return; }
      e.date = timeDraft.date || todayIso(); e.hrs = String(round2(num(timeDraft.hrs)));
      e.custName = String(timeDraft.custName || "").trim(); e.desc = String(timeDraft.desc || "").trim(); e.rate = String(timeDraft.rate || "").trim();
      putRecord(e);
      editTimeId = null; timeDraft = null;
      renderOverview();
      toast("Time entry saved");
    });
    return card;
  }
  $("at-cust").addEventListener("input", function () { if (!$("at-rate").dataset.touched) $("at-rate").value = defaultRate(this.value); });
  $("at-rate").addEventListener("input", function () { this.dataset.touched = "1"; });
  $("at-add").addEventListener("click", function () {
    var hrs = num($("at-hrs").value), err = $("at-err");
    if (!(hrs > 0)) { err.textContent = "Put in how many hours, for example 2.5."; err.hidden = false; $("at-hrs").focus(); return; }
    err.hidden = true;
    var e = { id: rid("tim"), kind: "time", date: $("at-date").value || todayIso(), hrs: String(round2(hrs)),
      custName: $("at-cust").value.trim(), desc: $("at-desc").value.trim(), rate: $("at-rate").value.trim() };
    putRecord(e);
    $("at-hrs").value = ""; $("at-desc").value = "";
    renderOverview();
    toast("Added " + fmtHrs(hrs) + (e.custName ? " for " + e.custName : ""), "Undo", function () { dropRecord(e.id); renderOverview(); });
  });
  $("time-csv").addEventListener("click", function () {
    var list = doneTime(), bm = billedMap();
    if (!list.length) { toast("No time logged yet."); return; }
    var rows = [["Date", "Customer", "What was done", "Hours", "Rate per hour", "Amount", "Invoice"]];
    list.forEach(function (e) {
      rows.push([e.date, e.custName, e.desc, round2(num(e.hrs)), num(e.rate) ? num(e.rate).toFixed(2) : "", timeAmount(e).toFixed(2), bm[e.id] ? bm[e.id].no : ""]);
    });
    var csv = "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    shareOrDownload(new Blob([csv], { type: "text/csv" }), (settings.bizName || APP_NAME) + " timesheet " + todayIso() + ".csv", "text/csv");
  });

  // ---------- Customers ----------
  var custQuery = "", openCustKey = "";
  function renderCustDatalist() {
    var dl = $("cust-list");
    dl.innerHTML = "";
    customerList().list.forEach(function (c) { var o = document.createElement("option"); o.value = c.name; dl.append(o); });
  }
  $("cust-search").addEventListener("input", function () { custQuery = this.value; renderCustomersView(); });
  function renderCustomersView() {
    var cl = customerList(), bm = billedMap(), q = normName(custQuery), box = $("cust-box");
    box.innerHTML = "";
    var list = cl.list.filter(function (c) { return !q || (c.name + " " + c.contact).toLowerCase().indexOf(q) >= 0; });
    if (!list.length) {
      var em = document.createElement("div");
      em.className = "empty-lines";
      em.textContent = cl.list.length ? "No customers match that search." : "No customers yet. Make an invoice, log some time or tap Add a customer, and they'll show up here.";
      box.append(em);
      return;
    }
    list.forEach(function (c) {
      var st = custStats(c, bm);
      var b = document.createElement("button");
      b.type = "button"; b.className = "saved cust-row";
      b.innerHTML = '<div class="s-top"><div><div class="s-title"></div><div class="s-sub"></div></div><div class="s-amt"></div></div><div class="s-status"></div>';
      b.querySelector(".s-title").textContent = c.name;
      var sub = String(c.contact || "").split("\n")[0].trim();
      b.querySelector(".s-sub").textContent = sub;
      b.querySelector(".s-sub").hidden = !sub;
      var amt = b.querySelector(".s-amt");
      amt.textContent = st.owed > 0 ? money(st.owed) : "";
      if (st.overdueN) amt.classList.add("warn");
      var sts = b.querySelector(".s-status");
      if (st.overdueN) addChip(sts, "overdue", st.overdueN + " overdue");
      else if (st.owed > 0) addChip(sts, "unpaid", "Owes you");
      if (st.un.length) addChip(sts, "unbilled", fmtHrs(st.unHrs) + " not billed");
      var w = document.createElement("span");
      w.textContent = [st.invN ? plural(st.invN, "invoice") + ", " + money(st.billed) : "", c.last ? "last " + fmtShort(c.last) : ""].filter(Boolean).join(" · ");
      sts.append(w);
      b.addEventListener("click", function () { openCustomer(c.key); });
      box.append(b);
    });
  }
  function openCustomer(key) { openCustKey = key; show("customer"); }
  function openCust() { return customerList().byKey[openCustKey] || null; }
  function renderCustomerDetail() {
    var c = openCust();
    if (!c) { show("customers"); return; }
    var bm = billedMap(), st = custStats(c, bm);
    setText("cd-title", c.name);
    setIfIdle("cd-name", c.name); setIfIdle("cd-contact", c.contact); setIfIdle("cd-rate", c.rate); setIfIdle("cd-notes", c.notes); setIfIdle("cd-terms", c.terms);
    setText("cd-owed", money(st.owed));
    setText("cd-owed-n", st.overdueN ? st.overdueN + " overdue" : st.owedN ? plural(st.owedN, "invoice") : "Nothing owed");
    $("cd-owed").classList.toggle("warn", st.overdueN > 0);
    setText("cd-billed", money(st.billed)); setText("cd-billed-n", plural(st.invN, "invoice"));
    setText("cd-paid", money(st.paid)); setText("cd-paid-n", st.billed ? Math.round(st.paid / st.billed * 100) + "% of what's billed" : "");
    setText("cd-un", money(st.unAmt)); setText("cd-un-n", st.un.length ? fmtHrs(st.unHrs) : "All billed");
    $("cd-bill-box").hidden = !st.un.length;
    if (st.un.length) setText("cd-bill-text", fmtHrs(st.unHrs) + " of time hasn't been billed yet" + (st.unAmt ? " (" + money(st.unAmt) + ")" : "") + ".");

    var box = $("cd-docs");
    box.innerHTML = "";
    if (!c.docs.length) emptyLine(box, "No invoices or quotes yet.");
    c.docs.forEach(function (d) {
      var row = dashRow((isQuote(d) ? "Quote #" : "Invoice #") + (d.no || "—"),
        [fmtDate(d.date), String(d.job || "").replace(/\n+/g, " ")].filter(Boolean).join(" · "), fmtMoney(d.total || 0, d.snap && d.snap.currency), false, "button");
      row.type = "button"; row.classList.add("link");
      var stt = statusOf(d);
      addChip(row.querySelector(".dash-btns"), stt, STATUS_WORDS[stt]);
      row.addEventListener("click", function () { if (d.id === inv.id) show("edit"); else openInvoice(d, false); });
      box.append(row);
    });

    var tb = $("cd-time"), times = c.time.filter(function (e) { return !e.running; }).sort(byDate).reverse();
    tb.innerHTML = "";
    if (!times.length) emptyLine(tb, "No time logged for " + c.name + " yet.");
    times.slice(0, 10).forEach(function (e) {
      var row = dashRow(fmtHrs(num(e.hrs)) + " · " + fmtDate(e.date), e.desc || "", num(e.rate) ? money(timeAmount(e)) : "");
      var b = bm[e.id];
      addChip(row.querySelector(".dash-btns"), b ? "billed" : "unbilled", b ? "On invoice #" + (b.no || "—") : "Not billed");
      tb.append(row);
    });
    if (times.length > 10) moreLink(tb, "See all " + times.length + " on the timesheet", function () { show("time"); });

    var canDel = !!c.rec && !c.docs.length && !c.time.length;
    $("cd-del").hidden = !canDel;
    $("cd-del-note").hidden = canDel;
  }
  function custField(k, el) {
    el.addEventListener("input", function () {
      var c = openCust();
      if (!c) return;
      var r = ensureCustomerRecord(c);
      r[k] = el.value;
      putRecord(r);
    });
  }
  custField("contact", $("cd-contact")); custField("rate", $("cd-rate")); custField("notes", $("cd-notes")); custField("terms", $("cd-terms"));
  $("cd-name").addEventListener("change", function () {
    var c = openCust();
    if (!c) return;
    var name = this.value.trim().replace(/\s+/g, " "), k = normName(name);
    if (!name) { this.value = c.name; return; }
    var other = customerList().byKey[k];
    if (other && other !== c && other.key !== c.key) { this.value = c.name; toast("There's already a customer called " + other.name + "."); return; }
    var r = ensureCustomerRecord(c), renamed = k !== c.key;
    if (renamed) r.aka = (r.aka || []).concat([c.name]);
    r.name = name;
    putRecord(r);
    openCustKey = k;
    renderCustomerDetail();
    toast(renamed ? "Renamed. Their earlier invoices still show here." : "Saved");
  });
  $("cd-back").addEventListener("click", function () { show("customers"); });
  $("cd-new-inv").addEventListener("click", function () { var c = openCust(); if (c) startFor(c, "invoice"); });
  $("cd-new-quote").addEventListener("click", function () { var c = openCust(); if (c) startFor(c, "quote"); });
  $("cd-bill").addEventListener("click", function () { var c = openCust(); if (c) billTime(c); });
  $("cd-log").addEventListener("click", function () { var c = openCust(); if (c) openLogSheet(c.name); });
  $("cd-del").addEventListener("click", function () {
    var c = openCust();
    if (!c || !c.rec) return;
    var copy = clone(c.rec);
    dropRecord(c.rec.id);
    show("customers");
    toast(c.name + " deleted", "Undo", function () { putRecord(copy); openCustomer(normName(copy.name)); });
  });
  $("cust-add").addEventListener("click", function () { $("cust-new").hidden = false; $("cust-add").hidden = true; $("cn-err").hidden = true; $("cn-name").focus(); });
  $("cn-cancel").addEventListener("click", function () { $("cust-new").hidden = true; $("cust-add").hidden = false; $("cn-name").value = ""; $("cn-contact").value = ""; });
  $("cn-save").addEventListener("click", function () {
    var name = $("cn-name").value.trim().replace(/\s+/g, " "), err = $("cn-err");
    if (!name) { err.textContent = "Put in their name first."; err.hidden = false; $("cn-name").focus(); return; }
    if (findCustomer(name)) { err.textContent = "There's already a customer called " + findCustomer(name).name + "."; err.hidden = false; return; }
    putRecord({ id: rid("cus"), kind: "customer", name: name, contact: $("cn-contact").value.trim(), notes: "", rate: "", aka: [], createdOn: todayIso() });
    $("cust-new").hidden = true; $("cust-add").hidden = false; $("cn-name").value = ""; $("cn-contact").value = "";
    openCustomer(normName(name));
    toast(name + " added");
  });

  // Re-draw whichever of these screens is showing
  function renderOverview() {
    renderTimer();
    renderCustDatalist();
    if (!$("view-home").hidden) renderHome();
    if (!$("view-time").hidden) renderTime();
    if (!$("view-customers").hidden) renderCustomersView();
    if (!$("view-customer").hidden) renderCustomerDetail();
  }

  // ---------- Swipe a row: right for the main action, left to delete ----------
  function attachSwipe(el, o) {
    if (settings.swipe === false || !("ontouchstart" in window)) return;
    var x0 = 0, y0 = 0, dx = 0, mode = null;
    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = null;
    }, { passive: true });
    el.addEventListener("touchmove", function (e) {
      var t = e.touches[0], mx = t.clientX - x0, my = t.clientY - y0;
      if (mode === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) mode = Math.abs(mx) > Math.abs(my) * 1.6 ? "x" : "y";
      if (mode !== "x") return;
      dx = mx;
      if ((dx > 0 && !o.right) || (dx < 0 && !o.left)) dx = dx / 5;
      el.style.transition = "none";
      el.style.transform = "translateX(" + Math.max(-120, Math.min(120, dx)) + "px)";
      el.dataset.swipe = dx > 70 && o.right ? "right" : dx < -70 && o.left ? "left" : "";
    }, { passive: true });
    el.addEventListener("touchend", function () {
      var dir = el.dataset.swipe;
      el.style.transition = ""; el.style.transform = ""; el.dataset.swipe = "";
      if (mode === "x" && dir === "right") o.right();
      if (mode === "x" && dir === "left") o.left();
      mode = null;
    });
  }

  // ---------- Toast ----------
  var toastTimer;
  function toast(msg, actLabel, act, ms) {
    var t = $("toast"), b = $("toast-act");
    setText("toast-msg", msg);
    b.hidden = !act;
    b.onclick = act ? function () { t.hidden = true; act(); } : null;
    if (act) b.textContent = actLabel;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || (act ? 5000 : 2400));
  }

  // ---------- Tabs ----------
  var VIEWS = ["setup", "home", "edit", "inv", "time", "customers", "customer", "saved", "company", "settings"];
  var TAB_OF = { home: "tab-home", edit: "tab-edit", inv: "tab-edit", time: "tab-time", customers: "tab-cust", customer: "tab-cust", saved: "tab-saved" };
  var currentView = "home", viewBeforeCompany = "home";
  function show(which) {
    var inSettings = which === "company" || which === "settings";
    if (inSettings && currentView !== "company" && currentView !== "settings") viewBeforeCompany = currentView === "setup" ? "home" : currentView;
    VIEWS.forEach(function (v) { $("view-" + v).hidden = v !== which; });
    ["tab-home", "tab-edit", "tab-time", "tab-cust", "tab-saved"].forEach(function (id) {
      if (TAB_OF[which] === id) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
    });
    var invView = which === "edit" || which === "inv";
    $("tabs").hidden = which === "setup";
    $("hdr-total").hidden = !invView;
    document.querySelector(".brand-sub").hidden = !invView;
    $("hdr-company").hidden = which === "setup";
    $("hdr-company").setAttribute("aria-pressed", String(inSettings));
    document.querySelectorAll("[data-go]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-go") === which)); });
    if (which !== "edit") flush();
    if (which === "inv") schedulePrep();
    if (which === "settings") { renderHomeSet(); renderNumPreview(); }
    document.querySelectorAll("[data-del-confirm]").forEach(function (c) { c.hidden = true; });
    document.querySelectorAll("[data-del-open]").forEach(function (b) { b.hidden = b.id === "del-inv" ? !canDelete() : false; });
    currentView = which;
    renderOverview();
    window.scrollTo(0, 0);
  }
  $("tab-home").addEventListener("click", function () { show("home"); });
  $("tab-edit").addEventListener("click", function () { show(currentView === "inv" ? "inv" : "edit"); });
  $("tab-time").addEventListener("click", function () { show("time"); });
  $("tab-cust").addEventListener("click", function () { show("customers"); });
  $("tab-saved").addEventListener("click", function () { show("saved"); });
  document.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-go")); }); });
  $("hdr-company").addEventListener("click", function () { show(currentView === "company" || currentView === "settings" ? viewBeforeCompany : "company"); });
  $("go-company").addEventListener("click", function () { show("company"); });
  document.querySelectorAll("[data-jump]").forEach(function (b) {
    b.addEventListener("click", function () { var t = $(b.getAttribute("data-jump")); if (t) t.scrollIntoView({ block: "start", behavior: "smooth" }); });
  });
  $("company-done").addEventListener("click", function () { show(viewBeforeCompany); toast("Saved"); });
  $("settings-done").addEventListener("click", function () { show(viewBeforeCompany); toast("Saved"); });
  $("go-invoice").addEventListener("click", function () { show("inv"); });
  $("back-edit").addEventListener("click", function () { show("edit"); });

  $("new-inv").addEventListener("click", function () { $("new-confirm").hidden = false; $("new-inv").hidden = true; });
  $("new-cancel").addEventListener("click", function () { $("new-confirm").hidden = true; $("new-inv").hidden = false; });
  $("new-yes").addEventListener("click", function () { $("new-confirm").hidden = true; $("new-inv").hidden = false; startNew(); });
  $("new-from-saved").addEventListener("click", startNew);

  // ---------- First-time setup ----------
  function rateService() {
    return settings.services.filter(function (x) { return x.id === "labour"; })[0] || settings.services.filter(function (x) { return x.type === "hourly"; })[0] || null;
  }
  $("su-rate").addEventListener("input", function () {
    var sv = rateService();
    if (!sv) { sv = { id: "labour", name: "Labour", desc: "Labour", type: "hourly", rate: "", hrs: "", amt: "" }; settings.services.unshift(sv); }
    sv.rate = this.value;
    settingsChanged(); renderAddButtons(); renderServices();
  });
  function finishSetup() {
    settings.setupDone = true;
    settingsChanged();
    if (inv.isExample) inv = exampleInvoice();
    renderAll(); show("edit");
  }
  $("su-done").addEventListener("click", function () {
    if (!String(settings.bizName || "").trim()) {
      var e = $("su-err"); e.textContent = "Put in your business name first. It goes at the top of every invoice."; e.hidden = false;
      $("su-name").focus(); return;
    }
    $("su-err").hidden = true;
    finishSetup();
    toast("All set. Here's an example invoice to try.");
  });
  $("su-skip").addEventListener("click", function () { finishSetup(); toast("You can fill in your details any time under Settings."); });
  $("setup-signin").addEventListener("click", function () {
    show("settings");
    setTimeout(function () { $("cloud-card").scrollIntoView({ block: "start" }); $("cloud-email").focus(); }, 0);
  });

  // ---------- Copy as text ----------
  function asText() {
    var c = compute(), s = eff(), out = [];
    out.push((s.bizName || "Invoice").toUpperCase() + (s.bizTagline ? " · " + s.bizTagline : ""));
    out.push((isQuote(inv) ? "Quote " : "Invoice ") + (inv.no ? "#" + inv.no : "") + (inv.date ? " · " + fmtDate(inv.date) : "") + (inv.paid && !isQuote(inv) ? " · PAID" : ""));
    if (isQuote(inv) && validIso(inv)) out.push("Valid until " + fmtDate(validIso(inv)));
    if (inv.custName) out.push("Bill to: " + inv.custName);
    if (inv.job) out.push("Job: " + inv.job.replace(/\n+/g, " "));
    out.push("");
    billable().forEach(function (l) {
      out.push(l.d.replace(/\n+/g, " ") + (l.q ? "" : ": " + fmtMoney(l.a)));
      if (l.q) out.push("  " + l.q + " = " + fmtMoney(l.a));
    });
    out.push("");
    if (c.rate > 0) {
      out.push("Subtotal: " + fmtMoney(c.sub));
      out.push(taxLabelText() + ": " + fmtMoney(c.tax));
    }
    if (!isQuote(inv) && !inv.paid && paidSoFar(inv) > 0) {
      out.push("Total: " + fmtMoney(c.total));
      out.push("Paid so far: " + fmtMoney(paidSoFar(inv)));
      out.push("BALANCE DUE: " + fmtMoney(balanceOf(inv)));
    } else out.push((isQuote(inv) || inv.paid ? "TOTAL: " : "TOTAL DUE: ") + fmtMoney(c.total));
    var pay = payLines(s), terms = termsText();
    if (terms || pay.length) { out.push(""); if (terms) out.push(terms); pay.forEach(function (l) { out.push(l); }); }
    if (s.notes) { out.push(""); out.push(s.notes); }
    var contact = [s.bizPhone, s.bizEmail, s.bizWebsite].filter(Boolean).join(" · ");
    if (contact) out.push(contact);
    if (legalText(s)) out.push(legalText(s));
    return out.join("\n");
  }
  function copyToClipboard(text, msg) {
    function legacy() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.top = "0"; ta.style.opacity = "0";
      document.body.append(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      toast(ok ? msg : "Couldn't copy. Try again.");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(msg); }, legacy);
    else legacy();
  }
  // Run fn as if another saved invoice were open (used to send or copy from the Saved list)
  function withInvoice(doc, fn) {
    var keep = inv;
    inv = clone(doc);
    try { return fn(); } finally { inv = keep; }
  }
  function messageText(kind) {
    var s = eff(), c = compute(), di = dueInfo(inv), due = dueText(), late = statusOf(inv) === "overdue", q = isQuote(inv);
    var tpl = q ? settings.quoteTemplate : kind === "reminder" ? settings.remTemplate : inv.paid ? settings.rcptTemplate : settings.msgTemplate;
    var dueWords = q || inv.paid ? "" : di.words ? (kind === "reminder" ? "It's due " : "Payment is due ") + di.words + ". "
      : due ? (kind === "reminder" ? (late ? "It was due on " : "It's due by ") : "Payment is due by ") + due + ". " : "";
    var amount = !q && !inv.paid && paidSoFar(inv) > 0 ? balanceOf(inv) : c.total;
    return (tpl || "")
      .replace(/\{customer\}/g, String(inv.custName || "").trim() || "there")
      .replace(/\{number\}/g, inv.no ? "#" + inv.no : "")
      .replace(/\{total\}/g, fmtMoney(amount))
      .replace(/\{valid\}/g, q && validIso(inv) ? "It's valid until " + fmtDate(validIso(inv)) + ". " : "")
      .replace(/\{due\}/g, dueWords)
      .replace(/\{business\}/g, s.bizName || "us")
      .replace(/[ \t]+/g, " ").trim();
  }
  function fileBase() {
    return ((isQuote(inv) ? "Quote " : "Invoice ") + (inv.no || "") + (inv.custName ? " - " + inv.custName : "")).replace(/[\\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function contactBits() {
    var c = String(inv.custContact || "");
    var em = c.match(/[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/);
    var ph = c.replace(em ? em[0] : "", "").match(/\+?\d[\d\s-]{7,}\d/);
    return { email: em ? em[0] : "", phone: ph ? ph[0].replace(/[\s-]/g, "") : "" };
  }
  function emailSubject(kind) {
    return (kind === "reminder" && !isQuote(inv) && !inv.paid ? "Payment reminder: invoice " : isQuote(inv) ? "Quote " : inv.paid ? "Receipt for invoice " : "Invoice ") + (inv.no ? inv.no + " " : "") + "from " + (eff().bizName || "us") +
      (inv.job && !inv.paid ? " - " + String(inv.job).split("\n")[0].slice(0, 60) : "");
  }
  // Bank details as short lines for WhatsApp and texts
  function bankText() {
    if (isQuote(inv) || inv.paid) return "";
    var pay = payLines(eff());
    return pay.length ? "\n\nTo pay by bank transfer:\n" + pay.join("\n") : "";
  }
  // A properly written email, worded for invoices, part-paid invoices, receipts, quotes and reminders.
  // The key facts sit in a short summary so they're easy to find at a glance.
  function emailBody(kind) {
    var s = eff(), c = compute(), q = isQuote(inv), di = dueInfo(inv), due = dueText(), st = statusOf(inv);
    var name = String(inv.custName || "").trim(), biz = s.bizName || "us";
    var job = String(inv.job || "").replace(/\s*\n+\s*/g, ", ").trim();
    var vat = num0(c.tax) ? " (including " + (s.taxLabel || "tax").trim() + ")" : "";
    var paidAmt = paidSoFar(inv), bal = balanceOf(inv);
    var dueLine = di.words ? "On " + di.words.replace(/^on /, "") : due;
    var open, summary = [], after = [];
    function line(k, v) { if (v) summary.push(k + ": " + v); }
    if (q) {
      open = "Thank you for your enquiry. Please find our quote attached.";
      line("Quote", inv.no); line("Job", job); line("Total", fmtMoney(c.total) + vat);
      line("Valid until", validIso(inv) ? fmtDate(validIso(inv)) : "");
      after.push("If you'd like to go ahead, just reply to this email" + (s.bizPhone ? " or give me a call on " + s.bizPhone : "") + " and we'll get it booked in.");
    } else if (inv.paid) {
      open = "Thank you for your payment. Your receipt is attached for your records.";
      line("Invoice", inv.no); line("Job", job); line("Amount paid", fmtMoney(c.total) + vat);
      line("Paid on", inv.paidDate ? fmtDate(inv.paidDate) : "");
      after.push("It was a pleasure working with you, and I hope to see you again.");
    } else if (kind === "reminder") {
      open = "I hope you're well. This is a friendly reminder that the invoice below " +
        (st === "overdue" ? "is now overdue" : "is still waiting to be paid") + ". I've attached a copy for you.";
      line("Invoice", inv.no); line("Job", job); line("Dated", fmtDate(inv.date));
      line("Amount outstanding", fmtMoney(bal));
      line(st === "overdue" ? "Was due" : "Due", dueLine);
      after.push("If you've already paid, please ignore this email, and thank you.");
    } else {
      open = "Thank you for choosing " + biz + ". Please find your invoice attached.";
      line("Invoice", inv.no); line("Job", job);
      if (paidAmt > 0) { line("Total", fmtMoney(c.total) + vat); line("Paid so far", fmtMoney(paidAmt)); line("Balance due", fmtMoney(bal)); }
      else line("Amount due", fmtMoney(c.total) + vat);
      line("Due", dueLine);
      after.push("If you have any questions, please don't hesitate to get in touch.");
    }
    var pay = q || inv.paid ? [] : payLines(s);
    var parts = [(name ? "Dear " + name + "," : "Hello,"), open, summary.join("\n")];
    if (pay.length) parts.push("To pay by bank transfer:\n" + pay.join("\n"));
    parts = parts.concat(after);
    var sign = (sigWanted() ? ["Kind regards,", "", settings.signName, biz] : ["Kind regards,", "", settings.signName, biz, s.bizTagline, s.bizPhone, s.bizEmail, s.bizWebsite])
      .filter(function (x, i) { return i === 1 || x; });
    parts.push(sign.join("\n"));
    return parts.filter(Boolean).join("\n\n");
  }
  function num0(n) { return Math.abs(n) > 0.004; }
  function renderShare() {
    setText("msg-preview", emailBody());
    var needBank = !isQuote(inv) && !inv.paid && !payLines(eff()).length;
    $("bank-missing").hidden = !needBank;
    setText("send-hint", "Pick Mail or Outlook for Email: the PDF and message are already in." +
      (contactBits().email ? " The customer's address is copied, so tap To and Paste." : "") +
      " Pick WhatsApp or Messages for the other two.");
    resetPic();
  }
  $("send-email").addEventListener("click", function () {
    flush();
    var em = contactBits().email;
    if (em && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(em).catch(function () {});
    sendPdfFor(invBody());
  });
  $("send-msg").addEventListener("click", function () {
    flush();
    var body = messageText() + bankText() + "\n\n" + asText();
    if (navigator.share) {
      navigator.share({ text: body }).catch(function (e) { if (!e || e.name !== "AbortError") copyToClipboard(body, "Copied. Paste it into a message."); });
    } else copyToClipboard(body, "Copied. Paste it into a message.");
  });

  $("dup-inv").addEventListener("click", function () { openInvoice(invBody(), true); });
  $("bank-fix").addEventListener("click", function () {
    show("company");
    setTimeout(function () { $("bank-card").scrollIntoView({ block: "start" }); $("bank-name").focus(); }, 0);
  });

  // ---------- PDF ----------
  function pdfSafe(s) {
    return String(s || "").replace(/[   ]/g, " ").replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/×/g, "x").replace(/…/g, "...");
  }
  function logoSrc() { return settings.logo || ""; }
  function logoDims() { return settings.logo && settings.logoW ? [settings.logoW, settings.logoH] : [500, 396]; }
  function renderLogo() {
    var has = !!settings.logo;
    [["p-logo", null], ["c-logo", "c-logo-none"], ["su-logo", "su-logo-none"], ["hdr-logo", null]].forEach(function (pair) {
      var im = $(pair[0]);
      im.hidden = !has;
      if (has && im.getAttribute("src") !== settings.logo) im.src = settings.logo;
      if (pair[1]) $(pair[1]).hidden = has;
    });
    setText("p-bizname", eff().bizName || "Your business");
    $("p-bizname").hidden = has;
    setText("hdr-biz", settings.bizName || APP_NAME);
    $("hdr-biz").hidden = has;
    $("logo-reset").hidden = !has;
    $("su-logo-btn").textContent = has ? "Change logo" : "Add your logo";
    scheduleIcon(); scheduleSig();
  }
  $("logo-change").addEventListener("click", function () { $("logo-file").click(); });
  $("su-logo-btn").addEventListener("click", function () { $("logo-file").click(); });
  $("logo-file").addEventListener("change", function () {
    var f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      var sc = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.max(1, Math.round(img.naturalWidth * sc)), h = Math.max(1, Math.round(img.naturalHeight * sc));
      var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      var cx = cv.getContext("2d");
      cx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      // Keep see-through logos see-through (PNG); everything else is a smaller JPEG
      var clear = false;
      try { var px = cx.getImageData(0, 0, w, h).data; for (var i = 3; i < px.length; i += 16) { if (px[i] < 250) { clear = true; break; } } } catch (e) {}
      var prev = [settings.logo, settings.logoW, settings.logoH];
      settings.logo = clear ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.88);
      settings.logoW = w; settings.logoH = h; settings.logoGone = false; delete settings.logoUrl;
      try { settings.updatedAt = Date.now(); localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); markSettingsDirty(); toast("Logo updated"); }
      catch (e) { settings.logo = prev[0]; settings.logoW = prev[1]; settings.logoH = prev[2]; toast("Couldn't store that picture. Try a smaller one."); }
      renderLogo(); renderPaper();
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast("Couldn't open that picture. Try a JPG or PNG."); };
    img.src = url;
  });
  $("logo-reset").addEventListener("click", function () {
    settings.logo = ""; settings.logoW = 0; settings.logoH = 0; settings.logoGone = true; delete settings.logoUrl;
    settingsChanged(); renderLogo(); renderPaper(); toast("Logo removed");
  });
  // A preset or older 1 Blast setup fetches its logo from the website once. It doesn't count as an edit,
  // so it never overwrites the details saved online.
  function fetchPresetLogo() {
    var u = settings.logoUrl;
    if (!u || settings.logo || settings.logoGone) return;
    fetch(u).then(function (r) { if (!r.ok) throw new Error("logo"); return r.blob(); }).then(blobToDataUrl).then(function (d) {
      if (!d || settings.logo) return;
      var im = new Image();
      im.onload = function () {
        settings.logo = d; settings.logoW = im.naturalWidth; settings.logoH = im.naturalHeight; delete settings.logoUrl;
        lsSet(LS_SETTINGS, settings); renderLogo(); renderPaper();
      };
      im.src = d;
    }).catch(function () {});
  }

  // Colours: work out readable text and lighter/darker shades from the two the account picked
  function hexRgb(h) {
    h = String(h || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    var n = parseInt(h, 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbHex(c) { return "#" + c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }).join(""); }
  function mix(a, b, t) { return a.map(function (v, i) { return v + (b[i] - v) * t; }); }
  function lum(c) {
    var f = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  }
  function contrastOf(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function brandColours(bandHex, accHex) {
    var W = [255, 255, 255], K = [0, 0, 0], DARK = [26, 31, 36];
    var band = hexRgb(bandHex || settings.brandColor) || [22, 50, 58], acc = hexRgb(accHex || settings.accentColor) || [244, 166, 42];
    var bandDark = lum(band) < 0.3;
    var bandInk = bandDark ? [244, 246, 246] : [20, 26, 30];
    var accText = acc.slice(), accTextD = acc.slice(), i;
    for (i = 0; i < 14 && contrastOf(accText, W) < 4.5; i++) accText = mix(accText, K, 0.15);
    for (i = 0; i < 14 && contrastOf(accTextD, DARK) < 4.5; i++) accTextD = mix(accTextD, W, 0.15);
    return {
      band: band, bandInk: bandInk,
      bandMuted: bandDark ? mix(band, W, 0.62) : mix(band, K, 0.55),
      bandTab: bandDark ? mix(band, W, 0.14) : mix(band, K, 0.08),
      acc: acc,
      accInk: contrastOf(acc, [17, 17, 17]) >= contrastOf(acc, W) ? [17, 17, 17] : W,
      accOnBand: contrastOf(acc, band) >= 2.2 ? acc : bandInk,
      accText: accText, accTextD: accTextD,
      accSoftL: mix(acc, W, 0.82), accSoftD: mix(acc, DARK, 0.8)
    };
  }
  // The app itself can wear the business's colours or plain ones; invoices always wear the business's
  function applyBrand() {
    var c = brandColours(), ui = settings.appColours === "neutral" ? brandColours("#16323a", "#f4a62a") : c, st = document.documentElement.style;
    [["--u-band", ui.band], ["--u-band-ink", ui.bandInk], ["--u-band-muted", ui.bandMuted], ["--u-band-tab", ui.bandTab],
     ["--u-accent", ui.acc], ["--u-accent-ink", ui.accInk], ["--u-acc-on-band", ui.accOnBand],
     ["--u-accent-text-l", ui.accText], ["--u-accent-text-d", ui.accTextD], ["--u-accent-soft-l", ui.accSoftL], ["--u-accent-soft-d", ui.accSoftD],
     ["--paper-band", c.band], ["--paper-band-ink", c.bandMuted], ["--paper-gold", c.accOnBand], ["--paper-tag", c.accOnBand],
     ["--paper-total", c.acc], ["--paper-total-ink", c.accInk], ["--paper-acc-text", c.accText]]
      .forEach(function (pair) { st.setProperty(pair[0], rgbHex(pair[1])); });
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute("content", rgbHex(ui.band));
    applyLook();
    renderSwatches();
  }
  var FONT_PAIRS = {
    workshop: { name: "Workshop", note: "Bold and condensed, like stencilled kit", display: '"Barlow Condensed", "Arial Narrow", sans-serif', body: '"Barlow", -apple-system, "Helvetica Neue", Arial, sans-serif', css: "", pdf: "helvetica", sample: "font-style:italic;font-weight:700;text-transform:uppercase" },
    classic: { name: "Classic", note: "A traditional serif, like a printed letterhead", display: '"Libre Baskerville", Georgia, "Times New Roman", serif', body: '"Source Sans 3", -apple-system, "Helvetica Neue", Arial, sans-serif', css: "family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;500;600;700", pdf: "times", sample: "font-weight:700" },
    modern: { name: "Modern", note: "Clean and rounded, like a modern app", display: '"Outfit", -apple-system, "Helvetica Neue", Arial, sans-serif', body: '"Outfit", -apple-system, "Helvetica Neue", Arial, sans-serif', css: "family=Outfit:wght@400;500;600;700", pdf: "helvetica", sample: "font-weight:700" }
  };
  var DESIGNS = {
    classic: { name: "Classic", note: "Your colours in a band across the top" },
    minimal: { name: "Minimal", note: "White, with a line in your colour" },
    bold: { name: "Bold", note: "A big logo and a full-width total" }
  };
  function applyLook() {
    var root = document.documentElement, t = settings.theme;
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t); else root.removeAttribute("data-theme");
    var key = FONT_PAIRS[settings.fontPair] ? settings.fontPair : "workshop", fp = FONT_PAIRS[key];
    Object.keys(FONT_PAIRS).forEach(function (k) { root.classList.toggle("fp-" + k, k === key); });
    root.style.setProperty("--f-display", fp.display);
    root.style.setProperty("--f-body", fp.body);
    if (fp.css && !$("font-" + key)) {
      var l = document.createElement("link");
      l.rel = "stylesheet"; l.id = "font-" + key; l.href = "https://fonts.googleapis.com/css2?" + fp.css + "&display=swap";
      document.head.append(l);
    }
    renderPickers();
  }
  function renderPickers() {
    var fb = $("font-opts"), db = $("design-opts");
    fb.innerHTML = "";
    Object.keys(FONT_PAIRS).forEach(function (k) {
      var fp = FONT_PAIRS[k], b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-pressed", String((settings.fontPair || "workshop") === k));
      b.innerHTML = '<span class="fp-sample"></span><span class="nm"></span><small></small>';
      var smp = b.querySelector(".fp-sample");
      smp.textContent = "Aa 0042"; smp.style.cssText = "font-family:" + fp.display + ";" + fp.sample;
      b.querySelector(".nm").textContent = fp.name; b.querySelector("small").textContent = fp.note;
      b.addEventListener("click", function () { settings.fontPair = k; settingsChanged(); applyLook(); renderPaper(); resetPic(); });
      fb.append(b);
    });
    db.innerHTML = "";
    Object.keys(DESIGNS).forEach(function (k) {
      var dz = DESIGNS[k], b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-pressed", String((settings.invDesign || "classic") === k));
      b.innerHTML = '<span class="mp ' + k + '"><i class="b"></i><i class="l"></i><i class="l"></i><i class="t"></i></span><span class="nm"></span><small></small>';
      b.querySelector(".nm").textContent = dz.name; b.querySelector("small").textContent = dz.note;
      b.addEventListener("click", function () { settings.invDesign = k; settingsChanged(); renderPickers(); renderPaper(); resetPic(); toast(dz.name + " design. See it on the invoice preview."); });
      db.append(b);
    });
  }
  var SWATCHES = [
    ["#16323a", "#f4a62a", "Workshop"], ["#062402", "#ffbb1c", "Forest & Gold"], ["#13294b", "#ff8a1f", "Navy & Tangerine"],
    ["#5a1a2a", "#f2c14e", "Mulberry & Mustard"], ["#1d3f8f", "#ffd23f", "Royal & Sunflower"], ["#161616", "#e53935", "Carbon & Red"],
    ["#0f4c5c", "#ff7a59", "Petrol & Coral"], ["#2f3b2a", "#c9a227", "Olive & Brass"], ["#263238", "#c6e03b", "Slate & Lime"],
    ["#3d1f3d", "#f28fad", "Plum & Rose"], ["#00474f", "#5ee6b8", "Teal & Mint"], ["#2b2b2b", "#ffb300", "Charcoal & Amber"],
    ["#0b1d3a", "#4fc3f7", "Midnight & Sky"], ["#7a2e1f", "#f3d9a4", "Brick & Cream"], ["#3b4a1e", "#f4b400", "Moss & Saffron"],
    ["#33373d", "#ff6d00", "Graphite & Orange"], ["#0e3b5c", "#e9c46a", "Ocean & Sand"], ["#4a1020", "#ffb38a", "Wine & Peach"],
    ["#1b3b2f", "#d98a4e", "Pine & Copper"], ["#3a4a5a", "#ffd600", "Steel & Yellow"], ["#0d0d0d", "#d4af37", "Black & Gold"],
    ["#ffffff", "#1f5fbf", "Clean Blue"], ["#ffffff", "#2e7d32", "Clean Green"], ["#f4efe6", "#b5651d", "Linen & Copper"],
    ["#ece9e2", "#1f3a5f", "Stone & Navy"]
  ];
  function renderSwatches() {
    document.querySelectorAll("[data-swatches]").forEach(function (box) {
      box.innerHTML = "";
      SWATCHES.forEach(function (pair) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "sw";
        b.setAttribute("aria-label", pair[2] + " colours");
        b.setAttribute("aria-pressed", String(String(settings.brandColor).toLowerCase() === pair[0] && String(settings.accentColor).toLowerCase() === pair[1]));
        var bar = document.createElement("span"); bar.className = "bar";
        var x = document.createElement("span"); x.style.background = pair[0];
        var y = document.createElement("span"); y.style.background = pair[1];
        if (pair[0] === "#ffffff") x.style.boxShadow = "inset 0 0 0 1px #d9ddd8";
        bar.append(x, y);
        var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = pair[2];
        b.append(bar, nm);
        b.addEventListener("click", function () {
          settings.brandColor = pair[0]; settings.accentColor = pair[1];
          document.querySelectorAll('[data-s="brandColor"]').forEach(function (el) { el.value = pair[0]; });
          document.querySelectorAll('[data-s="accentColor"]').forEach(function (el) { el.value = pair[1]; });
          settingsChanged(); applyBrand(); scheduleIcon(); renderPaper();
        });
        box.append(b);
      });
    });
    var now = SWATCHES.filter(function (pair) { return String(settings.brandColor).toLowerCase() === pair[0] && String(settings.accentColor).toLowerCase() === pair[1]; })[0];
    if ($("sw-now")) setText("sw-now", now ? "Your colours: " + now[2] : "Your colours: your own mix");
  }
  // Home-screen icon and name follow the business: its logo (or first letter) on its header colour
  var iconTimer = null;
  function scheduleIcon() { clearTimeout(iconTimer); iconTimer = setTimeout(makeIcon, 400); }
  function makeIcon() {
    var c = brandColours(), S = 180, cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    var cx = cv.getContext("2d");
    cx.fillStyle = rgbHex(c.band); cx.fillRect(0, 0, S, S);
    function done() {
      var u = cv.toDataURL("image/png");
      $("app-icon").setAttribute("href", u); $("app-favicon").setAttribute("href", u);
    }
    var name = String(settings.bizName || "").trim();
    $("app-title-meta").setAttribute("content", name || APP_NAME);
    document.title = name ? name + " · " + APP_NAME : APP_NAME;
    if (settings.logo) {
      var im = new Image();
      im.onload = function () {
        var pad = 16, sc = Math.min((S - pad * 2) / im.naturalWidth, (S - pad * 2) / im.naturalHeight);
        var w = im.naturalWidth * sc, h = im.naturalHeight * sc;
        cx.drawImage(im, (S - w) / 2, (S - h) / 2, w, h); done();
      };
      im.onerror = done;
      im.src = settings.logo;
      return;
    }
    if (!name) { drawMark(cx, S, rgbHex(c.accOnBand)); done(); return; }
    cx.fillStyle = rgbHex(c.accOnBand); cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.font = "bold 112px Barlow, Arial, sans-serif";
    cx.fillText(name.charAt(0).toUpperCase(), S / 2, S / 2 + 6);
    done();
  }
  // The app's own mark: a clock whose hands make a tick
  function drawMark(cx, S, col) {
    var x = S / 2, y = S / 2, r = S * 0.33;
    cx.strokeStyle = col; cx.lineCap = "round"; cx.lineJoin = "round";
    cx.lineWidth = S * 0.065;
    cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.stroke();
    cx.lineWidth = S * 0.04;
    for (var i = 0; i < 4; i++) {
      var dx = Math.sin(i * Math.PI / 2), dy = -Math.cos(i * Math.PI / 2);
      cx.beginPath(); cx.moveTo(x + dx * r * 0.70, y + dy * r * 0.70); cx.lineTo(x + dx * r * 0.86, y + dy * r * 0.86); cx.stroke();
    }
    cx.lineWidth = S * 0.075;
    cx.beginPath();
    cx.moveTo(x - r * 0.40, y - r * 0.10);
    cx.lineTo(x, y + r * 0.22);
    cx.lineTo(x + r * 0.50, y - r * 0.52);
    cx.stroke();
  }
  // ---------- Photos (kept in the phone's IndexedDB; invoices hold their ids) ----------
  var photoCache = {}, idbP = null;
  function idb() {
    if (!idbP) idbP = new Promise(function (res, rej) {
      var r;
      try { r = indexedDB.open("blast-invoice-photos", 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = function () { r.result.createObjectStore("photos"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return idbP;
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("photos", mode), req = fn(tx.objectStore("photos"));
        tx.oncomplete = function () { res(req ? req.result : undefined); };
        tx.onerror = tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  function photoPut(id, data) { return idbDo("readwrite", function (st) { return st.put(data, id); }); }
  function photoGet(id) { return idbDo("readonly", function (st) { return st.get(id); }); }
  function photoDel(id) { return idbDo("readwrite", function (st) { return st.delete(id); }); }
  function photoKeys() { return idbDo("readonly", function (st) { return st.getAllKeys(); }); }
  function ensurePhotos(ids) {
    ids = ids.filter(function (id) { return !(id in photoCache); });
    if (!ids.length) return Promise.resolve();
    return Promise.all(ids.map(function (id) {
      return photoGet(id).then(function (v) {
        if (v || !sb || !cloudUser) { photoCache[id] = v || null; return; }
        return cloudPhoto(id).then(function (d) {
          photoCache[id] = d || null;
          if (d) { photoPut(id, d).catch(function () {}); cloud.uploaded[id] = 1; cloudSave(); }
        });
      }, function () { photoCache[id] = null; });
    }));
  }
  function usedPhotoIds() {
    var used = {};
    Object.keys(savedLocal).map(function (k) { return savedLocal[k]; }).concat([inv]).forEach(function (d) {
      (d.photos || []).forEach(function (ph) { used[ph.id] = 1; });
    });
    return Object.keys(used);
  }
  function photoList() { return Array.isArray(inv.photos) ? inv.photos : []; }
  function shownPhotos() { return inv.hidePhotos ? [] : photoList().filter(function (ph) { return photoCache[ph.id]; }); }
  function dataUrlToBlob(u) {
    var parts = u.split(","), bin = atob(parts[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: (parts[0].match(/:(.*?);/) || [])[1] || "image/jpeg" });
  }
  var gridSig = "", paperSig = "";
  function renderPhotos() {
    var ps = photoList();
    $("photo-show").checked = !inv.hidePhotos;
    setText("photo-count", ps.length ? ps.length + (ps.length === 1 ? " photo" : " photos") : "");
    $("send-photos").hidden = !ps.length;
    var missing = ps.map(function (ph) { return ph.id; }).filter(function (id) { return !(id in photoCache); });
    if (missing.length) ensurePhotos(missing).then(function () { renderPhotos(); renderPaperPhotos(); });
    var sig = ps.map(function (ph) { return ph.id + (photoCache[ph.id] ? "+" : "-"); }).join(",");
    if (sig === gridSig) return;
    gridSig = sig;
    var grid = $("photo-grid");
    grid.innerHTML = "";
    ps.forEach(function (ph, i) {
      var box = document.createElement("div"); box.className = "photo";
      if (photoCache[ph.id]) { var im = document.createElement("img"); im.src = photoCache[ph.id]; im.alt = "Job photo " + (i + 1); box.append(im); }
      var rm = document.createElement("button"); rm.type = "button"; rm.textContent = "Remove";
      rm.addEventListener("click", function () {
        var at = photoList().indexOf(ph);
        inv.photos = photoList().filter(function (x) { return x !== ph; });
        changed(); renderPhotos();
        toast("Photo removed", "Undo", function () {
          var l = photoList().slice(); l.splice(Math.min(at, l.length), 0, ph); inv.photos = l;
          changed(); renderPhotos();
        });
      });
      box.append(rm); grid.append(box);
    });
  }
  function renderPaperPhotos() {
    var ps = shownPhotos();
    $("p-photos-wrap").hidden = !ps.length;
    var sig = ps.map(function (ph) { return ph.id; }).join(",");
    if (sig === paperSig) return;
    paperSig = sig;
    var box = $("p-photos");
    box.innerHTML = "";
    ps.forEach(function (ph, i) { var im = document.createElement("img"); im.src = photoCache[ph.id]; im.alt = "Job photo " + (i + 1); box.append(im); });
  }
  function shrinkPhoto(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var sc = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.max(1, Math.round(img.naturalWidth * sc)), h = Math.max(1, Math.round(img.naturalHeight * sc));
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        var cx = cv.getContext("2d"); cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        res({ data: cv.toDataURL("image/jpeg", 0.72), w: w, h: h });
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("image")); };
      img.src = url;
    });
  }
  $("photo-add").addEventListener("click", function () { $("photo-file").click(); });
  $("photo-show").addEventListener("change", function () { inv.hidePhotos = !this.checked; changed(); });
  $("photo-file").addEventListener("change", function () {
    var files = Array.prototype.slice.call(this.files || []);
    this.value = "";
    if (!files.length) return;
    var target = inv, added = 0, failed = 0;
    toast("Adding " + files.length + (files.length === 1 ? " photo…" : " photos…"));
    files.reduce(function (chain, f) {
      return chain.then(function () {
        return shrinkPhoto(f).then(function (r) {
          var id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          return photoPut(id, r.data).then(function () {
            photoCache[id] = r.data;
            target.photos = (Array.isArray(target.photos) ? target.photos : []).concat([{ id: id, w: r.w, h: r.h }]);
            added++;
          });
        }).catch(function () { failed++; });
      });
    }, Promise.resolve()).then(function () {
      if (target === inv) { changed(); renderPhotos(); }
      toast(added ? added + (added === 1 ? " photo added" : " photos added") + (failed ? ", " + failed + " couldn't be added" : "")
        : "Couldn't add those photos. The phone may be out of space.");
    });
  });
  $("send-photos").addEventListener("click", function () {
    var ps = photoList().filter(function (ph) { return photoCache[ph.id]; });
    if (!ps.length) return;
    var files = ps.map(function (ph, i) { return new File([dataUrlToBlob(photoCache[ph.id])], fileBase() + " photo " + (i + 1) + ".jpg", { type: "image/jpeg" }); });
    if (navigator.canShare && navigator.canShare({ files: files })) {
      navigator.share({ files: files, text: messageText() }).catch(function (e) { if (!e || e.name !== "AbortError") files.forEach(function (f) { download(f, f.name); }); });
    } else files.forEach(function (f) { download(f, f.name); });
  });

  function buildPdf(lib) {
    var s = eff(), c = compute(), d = new lib.jsPDF({ unit: "mm", format: "a4" });
    var W = 210, M = 18, R = W - M, y = 24;
    var design = settings.invDesign || "classic", PF = (FONT_PAIRS[settings.fontPair] || FONT_PAIRS.workshop).pdf;
    function show(k) { return settings[k] !== false; }
    function ink() { d.setTextColor(11, 22, 56); }
    function grey() { d.setTextColor(93, 102, 112); }
    function pageCheck(h) { if (y + h > 280) { d.addPage(); y = 22; } }

    // Green letterhead with the logo, gold rule underneath
    var contact = [s.bizPhone, s.bizEmail, s.bizWebsite].concat(d.splitTextToSize(pdfSafe(s.bizAddr || "").replace(/\n+/g, ", "), 80)).filter(Boolean);
    var LW = design === "bold" ? 62 : 40, LH = design === "bold" ? 46 : 34;
    var dim = logoDims(), lw = LW, lh = LW * dim[1] / dim[0];
    if (lh > LH) { lh = LH; lw = LH * dim[0] / dim[1]; }
    d.setFont("times", "bolditalic"); d.setFontSize(11);
    var tag = s.bizTagline ? d.splitTextToSize(pdfSafe(s.bizTagline), 70) : [];
    var q = isQuote(inv), dl0 = q ? (validIso(inv) ? "Valid until " + fmtDate(validIso(inv)) : "") : dueLabel();
    var bandH = Math.max(50, 41 + contact.length * 4.6 + 4, 6 + lh + (tag.length ? tag.length * 4.6 + 5 : 4));
    var bc = brandColours();
    function fill(c) { d.setFillColor(Math.round(c[0]), Math.round(c[1]), Math.round(c[2])); }
    function tcol(c) { d.setTextColor(Math.round(c[0]), Math.round(c[1]), Math.round(c[2])); }
    // Minimal is white with a coloured rule; Classic and Bold sit on the band colour
    var HC = design === "minimal" ? { ink: [11, 22, 56], acc: bc.accText, muted: [93, 102, 112] } : { ink: bc.bandInk, acc: bc.accOnBand, muted: bc.bandMuted };
    if (design !== "minimal") { fill(bc.band); d.rect(0, 0, W, bandH, "F"); }
    fill(bc.acc); d.rect(0, bandH, W, design === "bold" ? 2.6 : 1.6, "F");
    if (settings.logo) d.addImage(settings.logo, /^data:image\/png/.test(settings.logo) ? "PNG" : "JPEG", M, 6, lw, lh, "logo", "FAST");
    else {
      d.setFont(PF, "bolditalic"); d.setFontSize(20); tcol(HC.acc);
      var bn = d.splitTextToSize(pdfSafe(s.bizName || "Your business").toUpperCase(), 100);
      d.text(bn, M, 16); lh = bn.length * 8;
    }
    d.setFont("times", "bolditalic"); d.setFontSize(11);
    if (tag.length) { tcol(HC.acc); d.text(tag, M, 6 + lh + 5); }
    d.setFont(PF, "bolditalic"); d.setFontSize(24); tcol(HC.acc);
    d.text(pdfSafe(docTitle(q)), R, 18, { align: "right" });
    d.setFont(PF, "normal"); d.setFontSize(10); tcol(HC.ink);
    if (inv.no) d.text("No. " + pdfSafe(inv.no), R, 25, { align: "right" });
    if (inv.date) d.text(pdfSafe(fmtDate(inv.date)), R, 30.5, { align: "right" });
    var stampOn = inv.paid && !q && show("paidStamp");
    if (inv.paid && !q && !stampOn) { d.setFont(PF, "bold"); d.setTextColor(143, 220, 171); d.text("PAID" + (inv.paidDate ? " " + pdfSafe(fmtDate(inv.paidDate)) : ""), R, 36, { align: "right" }); }
    else if (stampOn) { if (inv.paidDate) d.text(pdfSafe("Paid " + fmtDate(inv.paidDate)), R, 36, { align: "right" }); }
    else if (dl0) d.text(pdfSafe(dl0), R, 36, { align: "right" });
    d.setFont(PF, "normal"); d.setFontSize(9); tcol(HC.muted);
    contact.forEach(function (line, i) { d.text(pdfSafe(line), R, 43 + i * 4.6, { align: "right" }); });
    y = bandH + 12;

    d.setFont(PF, "bold"); d.setFontSize(8); grey();
    d.text(pdfSafe(billToWord(q)).toUpperCase(), M, y); if (show("showJob")) d.text("JOB", M + 90, y); y += 5;
    d.setFont(PF, "normal"); d.setFontSize(10.5); ink();
    var cl = d.splitTextToSize(pdfSafe([inv.custName, inv.custContact].filter(Boolean).join("\n") || "-"), show("showJob") ? 84 : R - M);
    var jl = show("showJob") ? d.splitTextToSize(pdfSafe(inv.job || "-"), 84) : [];
    d.text(cl, M, y); if (jl.length) d.text(jl, M + 90, y);
    y += Math.max(cl.length, jl.length) * 5 + 7;

    var X_QTY = 128, X_RATE = 160;
    d.setFillColor(242, 244, 239); d.rect(M, y - 5, R - M, 8, "F");
    d.setFont(PF, "bold"); d.setFontSize(8); grey();
    d.text("DESCRIPTION", M + 2, y);
    if (show("showHours")) { d.text("QTY / HOURS", X_QTY, y, { align: "right" }); d.text("RATE", X_RATE, y, { align: "right" }); }
    d.text("AMOUNT", R - 2, y, { align: "right" });
    y += 9;

    d.setFontSize(10);
    var rows = billable();
    if (!rows.length) { d.setFont(PF, "normal"); grey(); d.text("No charges", M + 2, y); y += 8; }
    rows.forEach(function (l) {
      d.setFont(PF, "normal");
      var dl = d.splitTextToSize(pdfSafe(l.d + (l.noTax ? " (" + l.noTaxWords + ")" : "")), show("showHours") ? 82 : 140);
      var h = dl.length * 4.8 + 4;
      pageCheck(h);
      ink(); d.text(dl, M + 2, y);
      if (show("showHours")) { grey(); d.text(pdfSafe(l.hrs || "-"), X_QTY, y, { align: "right" }); d.text(pdfSafe(l.rate), X_RATE, y, { align: "right" }); }
      ink(); d.text(pdfSafe(fmtMoney(l.a)), R - 2, y, { align: "right" });
      y += h - 3;
      d.setDrawColor(221, 227, 229); d.setLineWidth(0.3); d.line(M, y, R, y);
      y += 6;
    });

    pageCheck(30);
    y += 2;
    var LX = 128, totY = y, totPage = d.getNumberOfPages();
    d.setFont(PF, "normal"); d.setFontSize(10);
    if (show("showVat")) { grey(); d.text("Subtotal", LX, y); ink(); d.text(pdfSafe(fmtMoney(c.sub)), R - 2, y, { align: "right" }); y += 6; }
    if (c.rate > 0 && show("showVat")) { grey(); d.text(pdfSafe(taxLabelText()), LX, y); ink(); d.text(pdfSafe(fmtMoney(c.tax)), R - 2, y, { align: "right" }); y += 6; }
    var part = !q && !inv.paid && paidSoFar(inv) > 0;
    if (part) {
      grey(); d.text("Total", LX, y); ink(); d.text(pdfSafe(fmtMoney(c.total)), R - 2, y, { align: "right" }); y += 6;
      grey(); d.text("Paid so far", LX, y); ink(); d.text(pdfSafe("-" + fmtMoney(paidSoFar(inv))), R - 2, y, { align: "right" }); y += 6;
    }
    y += 1;
    var BX = design === "bold" ? M : LX - 3;
    fill(bc.acc); d.rect(BX, y - 5, R - BX, design === "bold" ? 11 : 9.5, "F");
    d.setFont(PF, "bold"); d.setFontSize(design === "bold" ? 15 : 13); tcol(bc.accInk);
    d.text(part ? "BALANCE DUE" : q || inv.paid ? "TOTAL" : "TOTAL DUE", design === "bold" ? M + 3 : LX, y + 1.5);
    d.text(pdfSafe(fmtMoney(part ? balanceOf(inv) : c.total)), R - 2, y + 1.5, { align: "right" });
    y += 4;
    y += 14;

    var pay = show("showPay") ? payLines(s) : [], terms = show("showPay") ? termsText() : "", legal = show("showLegal") ? legalText(s) : "";
    var notes = show("showNotes") ? s.notes || "" : "", print = String(settings.termsText || "").trim();
    if (pay.length || terms || notes || legal || print) {
      pageCheck(12);
      d.setDrawColor(221, 227, 229); d.setLineWidth(0.3); d.line(M, y - 5, R, y - 5);
    }
    if (pay.length || terms) {
      pageCheck(8 + pay.length * 5 + (terms ? 6 : 0));
      d.setFillColor(244, 246, 241); d.rect(M - 3, y - 5, R - M + 6, 8 + pay.length * 5 + (terms ? 6 : 0), "F");
      d.setFont(PF, "bold"); d.setFontSize(8); grey(); d.text("PAYMENT DETAILS", M, y); y += 5;
      d.setFont(PF, "normal"); d.setFontSize(10); ink();
      pay.forEach(function (l) { d.text(pdfSafe(l), M, y); y += 5; });
      if (terms) { d.setFontSize(9.5); grey(); d.text(pdfSafe(terms), M, y + 0.5); y += 6; }
      y += 4;
    }
    if (notes) {
      d.setFont(PF, "normal"); d.setFontSize(9); grey();
      var nl = d.splitTextToSize(pdfSafe(notes), R - M);
      pageCheck(nl.length * 4.2 + 4);
      d.text(nl, M, y); y += nl.length * 4.2 + 4;
    }
    if (legal) {
      d.setFont(PF, "normal"); d.setFontSize(8); grey();
      pageCheck(6);
      d.text(pdfSafe(legal), M, y); y += 6;
    }
    if (print) {
      d.setFont(PF, "normal"); d.setFontSize(7.5); grey();
      var pl = d.splitTextToSize(pdfSafe(print), R - M);
      pageCheck(pl.length * 3.4 + 4);
      d.text(pl, M, y); y += pl.length * 3.4 + 4;
    }
    // The PAID stamp sits in the space to the left of the totals
    if (stampOn) {
      var last = d.getNumberOfPages();
      d.setPage(totPage);
      d.setTextColor(31, 122, 69); d.setFont(PF, "bold"); d.setFontSize(36);
      d.text("PAID", M + 6, totY + 12, { angle: 12 });
      if (inv.paidDate) { d.setFontSize(9.5); d.text(pdfSafe(fmtDate(inv.paidDate)), M + 9, totY + 18, { angle: 12 }); }
      d.setPage(last);
    }
    var phs = shownPhotos();
    if (phs.length) {
      d.addPage(); y = 20;
      d.setFont(PF, "bold"); d.setFontSize(12); ink();
      d.text("Photos" + (inv.no ? " - " + (q ? "Quote " : "Invoice ") + pdfSafe(inv.no) : ""), M, y); y += 8;
      var colW = (R - M - 6) / 2, col = 0, rowH = 0;
      phs.forEach(function (ph) {
        var w = colW, h = w * ph.h / ph.w;
        if (h > 110) { h = 110; w = h * ph.w / ph.h; }
        if (col === 0 && y + 110 > 285) { d.addPage(); y = 20; }
        d.addImage(photoCache[ph.id], "JPEG", M + col * (colW + 6), y, w, h);
        rowH = Math.max(rowH, h);
        col++;
        if (col === 2) { col = 0; y += rowH + 6; rowH = 0; }
      });
    }
    return d.output("blob");
  }
  // Hand a file to the phone's share sheet (send or save to Files); fall back to a plain download
  function shareOrDownload(blob, name, type, text, onBlocked, title, extra) {
    var file = null;
    try { file = new File([blob], name, { type: type }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      var files = extra && extra.length && navigator.canShare({ files: extra.concat([file]) }) ? extra.concat([file]) : [file];
      var data = { files: files, title: title || name };
      if (text) data.text = text;
      return navigator.share(data).catch(function (e) {
        if (e && e.name === "AbortError") return "cancelled";
        if (e && e.name === "NotAllowedError" && onBlocked) return onBlocked();
        download(blob, name);
      });
    }
    download(blob, name);
    return Promise.resolve();
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  // The PDF is built inside the tap, so the phone lets the share menu open
  function sendPdfFor(doc, kind) {
    if (!window.jspdf) { toast("The PDF maker didn't load. Connect to the internet and reopen the app."); return; }
    var need = doc.hidePhotos ? [] : (doc.photos || []).map(function (ph) { return ph.id; }).filter(function (id) { return !(id in photoCache); });
    if (need.length) {
      toast("Getting the photos ready…");
      ensurePhotos(need).then(function () {
        var o;
        try { o = withInvoice(doc, function () { return { blob: buildPdf(window.jspdf), name: fileBase() + ".pdf", text: emailBody(kind), title: emailSubject(kind) }; }); }
        catch (e) { toast("Couldn't make the PDF."); return; }
        sharePdf(o);
      });
      return;
    }
    var out;
    try {
      out = withInvoice(doc, function () { return { blob: buildPdf(window.jspdf), name: fileBase() + ".pdf", text: emailBody(kind), title: emailSubject(kind) }; });
    } catch (e) { toast("Couldn't make the PDF."); return; }
    sharePdf(out);
  }
  function sharePdf(o) {
    var extra = sigFiles();
    shareOrDownload(o.blob, o.name, "application/pdf", o.text, function () {
      toast("PDF ready", "Send", function () { shareOrDownload(o.blob, o.name, "application/pdf", o.text, null, o.title, extra); }, 15000);
    }, o.title, extra);
  }

  // ---------- Logo card under the email sign-off ----------
  // Apps can only hand Mail plain text, so the logo goes in as a small picture, which iPhone Mail shows
  // under the sign-off. It's drawn ahead of time because the share menu has to open straight from the tap.
  var sigCard = null, sigKey = "", sigTimer = null, sigUrl = "";
  function sigWanted() { return settings.emailCard !== false && !!settings.logo; }
  function sigFiles() {
    if (!sigWanted() || !sigCard) return [];
    try { return [new File([sigCard], (String(settings.bizName || "").trim() || "Logo").replace(/[\\/:*?"<>|]+/g, "") + ".jpg", { type: "image/jpeg" })]; }
    catch (e) { return []; }
  }
  function scheduleSig() { clearTimeout(sigTimer); sigTimer = setTimeout(makeSig, 500); }
  function fitText(cx, text, style, size, family, maxW) {
    for (; size > 14; size -= 2) { cx.font = style + " " + size + "px " + family; if (cx.measureText(text).width <= maxW) break; }
    return size;
  }
  function makeSig() {
    if (!sigWanted()) { sigCard = null; sigKey = ""; renderSigPreview(); return; }
    var st = settings, key = [st.logo.length, st.logo.slice(-48), st.bizName, st.bizTagline, st.bizPhone, st.bizEmail, st.bizWebsite, st.brandColor, st.accentColor].join("|");
    if (sigCard && key === sigKey) return;
    var im = new Image();
    im.onload = function () {
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
        var c = brandColours(), W = 1200, H = 300, cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        var cx = cv.getContext("2d");
        cx.fillStyle = rgbHex(c.band); cx.fillRect(0, 0, W, H);
        cx.fillStyle = rgbHex(c.acc); cx.fillRect(0, H - 10, W, 10);
        var bw = 380, bh = 200, sc = Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
        var w = im.naturalWidth * sc, h = im.naturalHeight * sc;
        cx.drawImage(im, 50, (H - 10 - h) / 2, w, h);
        var x = 50 + w + 56, maxW = W - x - 50;
        cx.fillStyle = rgbHex(c.bandMuted); cx.fillRect(x - 28, 60, 3, H - 130);
        var lines = [];
        if (st.bizName) lines.push({ t: String(st.bizName).toUpperCase(), style: "italic 700", size: 52, fam: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", col: c.accOnBand, gap: 10 });
        if (st.bizTagline) lines.push({ t: st.bizTagline, style: "500", size: 28, fam: "Barlow, Arial, sans-serif", col: c.bandMuted, gap: 16 });
        [st.bizPhone, st.bizEmail, st.bizWebsite].filter(Boolean).forEach(function (t) {
          lines.push({ t: t, style: "500", size: 30, fam: "Barlow, Arial, sans-serif", col: c.bandInk, gap: 6 });
        });
        lines.forEach(function (l) { l.size = fitText(cx, l.t, l.style, l.size, l.fam, maxW); });
        var total = lines.reduce(function (t, l, i) { return t + l.size + (i < lines.length - 1 ? l.gap : 0); }, 0);
        var y = (H - 10 - total) / 2;
        cx.textBaseline = "top";
        lines.forEach(function (l) {
          cx.font = l.style + " " + l.size + "px " + l.fam; cx.fillStyle = rgbHex(l.col);
          cx.fillText(l.t, x, y); y += l.size + l.gap;
        });
        sigCard = dataUrlToBlob(cv.toDataURL("image/jpeg", 0.92)); sigKey = key;
        renderSigPreview();
      });
    };
    im.onerror = function () { sigCard = null; renderSigPreview(); };
    im.src = st.logo;
  }
  function renderSigPreview() {
    var img = $("sig-preview"), on = sigWanted() && !!sigCard;
    if (sigUrl) { URL.revokeObjectURL(sigUrl); sigUrl = ""; }
    if (on) { sigUrl = URL.createObjectURL(sigCard); img.src = sigUrl; }
    img.hidden = !on;
    $("email-card").checked = settings.emailCard !== false;
    setText("email-card-hint", !settings.logo ? "Add your logo under Your business first."
      : "It's a picture of your logo with your details, on your colours. iPhone Mail shows it under the sign-off. Some other email apps show it as an attachment instead.");
  }
  $("email-card").addEventListener("change", function () {
    settings.emailCard = this.checked;
    settingsChanged(); makeSig(); renderShare(); renderSigPreview();
  });

  // Picture of the invoice sheet (PNG), good for WhatsApp and texts
  var picToken = 0, pic = null, picBusy = false, picWanted = false, prepTimer = null;
  function picLabel(t, sub, cls) {
    var b = $("send-pic");
    b.className = "send-opt" + (cls ? " " + cls : "");
    b.querySelector(".t").textContent = t;
    b.querySelector("small").textContent = sub;
  }
  function resetPic() {
    picToken++; pic = null; picBusy = false; picWanted = false;
    $("send-pic").disabled = false; picLabel("Picture", "For WhatsApp");
    schedulePrep();
  }
  function schedulePrep() {
    clearTimeout(prepTimer);
    prepTimer = setTimeout(function () { if (!$("view-inv").hidden && !pic && !picBusy) makePic(); }, 800);
  }
  var h2cP = null;
  function loadH2C() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (h2cP) return h2cP;
    h2cP = new Promise(function (res, rej) {
      var sc = document.createElement("script");
      sc.src = "vendor/html2canvas.min.js";
      sc.onload = function () { res(window.html2canvas); };
      sc.onerror = function () { h2cP = null; rej(new Error("load")); };
      document.head.appendChild(sc);
    });
    return h2cP;
  }
  function sharePic() {
    var p = pic;
    shareOrDownload(p.blob, p.name, "image/png", p.text, function () { picLabel("Picture ready", "Tap to send", "ready"); }, emailSubject());
  }
  function makePic() {
    picBusy = true;
    var token = picToken, b = $("send-pic");
    var text = messageText() + bankText(), name = fileBase() + ".png";
    loadH2C().then(function (h2c) {
      return h2c($("paper"), { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false });
    }).then(function (canvas) {
      return new Promise(function (res) { canvas.toBlob(res, "image/png"); });
    }).then(function (blob) {
      if (token !== picToken) return;
      picBusy = false; b.disabled = false;
      if (!blob) throw new Error("blob");
      pic = { blob: blob, name: name, text: text };
      if (picWanted) { picWanted = false; picLabel("Picture", "For WhatsApp"); sharePic(); }
    }).catch(function () {
      if (token !== picToken) return;
      picBusy = false; b.disabled = false;
      if (picWanted) {
        picWanted = false; picLabel("Picture", "For WhatsApp");
        toast("Couldn't make the picture. Check your internet and try again, or use Email.");
      }
    });
  }
  $("send-pic").addEventListener("click", function () {
    if (pic) { sharePic(); return; }
    flush();
    picWanted = true;
    $("send-pic").disabled = true; picLabel("Picture", "Getting it ready…");
    if (!picBusy) makePic();
  });

  // ---------- Spreadsheet of all invoices ----------
  function csvCell(v) {
    v = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) v = "'" + v;
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  $("export-csv").addEventListener("click", function () {
    flush();
    var list = sortedSaved();
    if (!list.length) { toast("No saved invoices yet."); return; }
    var rows = [["Type", "Number", "Date", "Customer", "Customer contact", "Job", "Subtotal", "Tax", "Total", "Paid so far", "Left to pay", "Status", "Due date", "Paid on", "Paid by"]];
    list.forEach(function (doc) {
      rows.push(withInvoice(doc, function () {
        var c = compute(), s = eff();
        var st = statusOf(inv);
        var qt = isQuote(inv);
        return [qt ? "Quote" : "Invoice", inv.no, inv.date, inv.custName, inv.custContact, inv.job, c.sub.toFixed(2), c.tax.toFixed(2), c.total.toFixed(2),
          qt ? "" : paidSoFar(inv).toFixed(2), qt ? "" : balanceOf(inv).toFixed(2), STATUS_WORDS[st],
          qt ? validIso(inv) : dueIsoOf(inv) || dueInfo(inv).words, inv.paidDate || "", inv.paidMethod || ""];
      }));
    });
    var csv = "\ufeff" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    var name = (settings.bizName || "Invoices") + " invoices " + todayIso() + ".csv";
    shareOrDownload(new Blob([csv], { type: "text/csv" }), name, "text/csv");
  });

  // ---------- Backup ----------
  function makeBackup() {
    flush();
    var ids = usedPhotoIds();
    ensurePhotos(ids).then(function () {
      var photos = {};
      ids.forEach(function (id) { if (photoCache[id]) photos[id] = photoCache[id]; });
      var data = { app: "blast-invoice", version: 4, exportedAt: new Date().toISOString(), settings: settings, invoices: savedLocal, records: records, photos: photos };
      var blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      var name = APP_NAME + " backup " + todayIso() + ".json";
      function done(r) { if (r === "cancelled") return; settings.lastBackup = todayIso(); settingsChanged(); renderSaved(); }
      shareOrDownload(blob, name, "application/json", null, function () {
        toast("Backup ready", "Save", function () { shareOrDownload(blob, name, "application/json").then(done); }, 15000);
        return "cancelled";
      }).then(done);
    });
  }
  function renderBackupNag(count) {
    var last = settings.lastBackup, days = last ? Math.round((new Date(todayIso() + "T12:00:00") - new Date(last + "T12:00:00")) / 864e5) : null;
    setText("backup-last", last ? "Last backup: " + fmtDate(last) + "." : "No backup made yet.");
    var nag = count > 0 && (days === null || days > 30) && !(cloudUser && cloud.lastSync && Date.now() - cloud.lastSync < 7 * 864e5);
    $("backup-nag").hidden = !nag;
    if (nag) setText("backup-nag-text", days === null
      ? "You haven't made a backup yet. If this phone is lost or reset, your invoices go with it."
      : "Your last backup was " + days + " days ago. Make a fresh one so new invoices are safe too.");
  }
  $("backup").addEventListener("click", makeBackup);
  $("backup-now").addEventListener("click", makeBackup);
  $("restore").addEventListener("click", function () { $("restore-file").click(); });
  $("restore-file").addEventListener("change", function () {
    var f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (!data || data.app !== "blast-invoice" || typeof data.invoices !== "object") throw new Error("bad");
        var added = 0;
        Object.keys(data.invoices).forEach(function (k) {
          var b = data.invoices[k];
          if (!b || !b.id || !Array.isArray(b.items)) return;
          if (!savedLocal[k] || (b.updatedAt || 0) > (savedLocal[k].updatedAt || 0)) { savedLocal[k] = b; added++; markDirty(k); }
        });
        if (data.settings) { settings = upgradeSettings(data.settings, mergeSettings(data.settings)); settingsChanged(); fetchPresetLogo(); }
        var rAdded = 0, recs = data.records && typeof data.records === "object" ? data.records : {};
        Object.keys(recs).forEach(function (k) {
          var rr = recs[k];
          if (!rr || !rr.id || !rr.kind) return;
          if (!records[k] || (rr.updatedAt || 0) > (records[k].updatedAt || 0)) { records[k] = rr; markRecDirty(k); rAdded++; }
        });
        if (rAdded) saveRecords();
        saveSaved();
        var photos = data.photos && typeof data.photos === "object" ? data.photos : {};
        Promise.all(Object.keys(photos).map(function (id) {
          return photoPut(id, photos[id]).then(function () { photoCache[id] = photos[id]; }, function () {});
        })).then(function () { gridSig = paperSig = ""; renderAll(); });
        renderAll();
        toast(added ? "Restored " + added + " invoice" + (added === 1 ? "" : "s") : "Backup restored. Nothing new in it.");
      } catch (e) { toast("That file isn't an invoice backup from this app."); }
    };
    r.readAsText(f);
  });

  // ---------- Online saving (Supabase) ----------
  // The phone stays the working copy; changes are queued and sent up, and other devices' changes come down.
  var SB_URL = "https://pafvrzfbcyphmnnevrwi.supabase.co";
  var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhZnZyemZiY3lwaG1ubmV2cndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5OTY4OTEsImV4cCI6MjEwODU3Mjg5MX0.iz85bOZ8tFsrIcq1E2rnIfWaDiXp3Pucj1g-gtMHzc4";
  var LS_CLOUD = "blast-invoice.cloud";
  var sb = null, cloudUser = null, cloudState = "", cloudErr = "", syncing = false, syncAgain = false, syncTimer = null;
  // Links from our emails come back here; read them before the sign-in library tidies the address bar
  var linkType = (function () {
    var h = new URLSearchParams(String(location.hash || "").replace(/^#/, "")), q = new URLSearchParams(location.search);
    if (h.get("error_code") || q.get("error_code")) return "error";
    return h.get("type") || "";
  })();
  var needPassword = linkType === "invite" || linkType === "recovery" || linkType === "signup" ? linkType : "";
  var cloud = lsGet(LS_CLOUD) || {};
  function fixCloud() {
    cloud.dirty = cloud.dirty && typeof cloud.dirty === "object" ? cloud.dirty : {};
    cloud.uploaded = cloud.uploaded && typeof cloud.uploaded === "object" ? cloud.uploaded : {};
    cloud.rdirty = cloud.rdirty && typeof cloud.rdirty === "object" ? cloud.rdirty : {};
  }
  fixCloud();
  function cloudSave() { lsSet(LS_CLOUD, cloud); }
  // Rows saved by another device at the same moment as the last check can carry a slightly earlier time,
  // so each check looks back two minutes; anything already here is simply skipped
  function lookBack(ts) { var t = Date.parse(ts); return isNaN(t) ? ts : new Date(t - 120000).toISOString(); }
  function scheduleSync(ms) { if (!cloudUser) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms || 2500); }
  function markDirty(id) { cloud.dirty[id] = 1; cloudSave(); scheduleSync(); }
  function markDeleted(id) { cloud.dirty[id] = Date.now(); cloudSave(); scheduleSync(); }
  function markSettingsDirty() { cloud.settingsDirty = true; cloudSave(); scheduleSync(); }
  function markRecDirty(id) { cloud.rdirty[id] = 1; cloudSave(); scheduleSync(); }
  function markRecDeleted(id) { cloud.rdirty[id] = Date.now(); cloudSave(); scheduleSync(); }
  function ago(ms) {
    var m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    if (m < 1440) return Math.round(m / 60) + " hr ago";
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  function blobToDataUrl(b) {
    return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(null); }; r.readAsDataURL(b); });
  }
  function cloudPhoto(id) {
    return sb.storage.from("photos").download(cloudUser.id + "/" + id + ".jpg").then(function (r) {
      return r.error || !r.data ? null : blobToDataUrl(r.data);
    }).catch(function () { return null; });
  }
  function photoIdsOf(ids) {
    var out = {};
    ids.forEach(function (id) { var d = savedLocal[id]; (d && d.photos || []).forEach(function (ph) { out[ph.id] = 1; }); });
    return Object.keys(out);
  }
  function openDocFrom(doc) {
    inv = clone(doc);
    delete inv.kind; delete inv.total; delete inv.subtotal;
    inv.isExample = false;
    lastSavedJson = stable(stripForCompare(doc));
    lsSet(LS_DRAFT, draftBody());
  }
  async function syncNow(manual) {
    if (!sb || !cloudUser) return;
    if (!navigator.onLine) { if (manual) toast("No internet right now. It'll sync when you're back online."); return; }
    if (syncing) { syncAgain = true; return; }
    syncing = true; cloudState = "syncing"; renderCloud();
    var uid = cloudUser.id, changedLocal = false;
    try {
      await flush();
      // 1. Bring down anything changed on another device
      var q = sb.from("invoices").select("id, doc, deleted, updated_at").order("updated_at", { ascending: true });
      if (cloud.lastPull) q = q.gt("updated_at", lookBack(cloud.lastPull));
      var res = await q;
      if (res.error) throw res.error;
      var maxTs = cloud.lastPull || "";
      (res.data || []).forEach(function (row) {
        if (row.updated_at > maxTs) maxTs = row.updated_at;
        var local = savedLocal[row.id], rdoc = row.doc || {};
        var rTime = rdoc.updatedAt || 0, lTime = local ? local.updatedAt || 0 : 0;
        if (!local && cloud.dirty[row.id] > 1 && rTime <= cloud.dirty[row.id]) return;   // deleted here, not sent yet
        if (row.deleted) {
          if (local && rTime >= lTime) {
            delete savedLocal[row.id]; delete cloud.dirty[row.id]; changedLocal = true;
            if (row.id === inv.id && !isDirty()) { inv = blankInvoice(nextNo("invoice")); lastSavedJson = null; lsSet(LS_DRAFT, draftBody()); }
          }
          return;
        }
        if (!Array.isArray(rdoc.items)) return;   // not something this app saved
        if (!local || rTime > lTime) {
          savedLocal[row.id] = rdoc; delete cloud.dirty[row.id]; changedLocal = true;
          if (row.id === inv.id && !isDirty()) openDocFrom(rdoc);
        }
      });
      if (maxTs) cloud.lastPull = maxTs;
      if (changedLocal) saveSaved();
      var sres = await sb.from("app_settings").select("settings").maybeSingle();
      if (sres.error) throw sres.error;
      if (sres.data && sres.data.settings && (!settings.updatedAt || (sres.data.settings.updatedAt || 0) > settings.updatedAt)) {
        settings = upgradeSettings(sres.data.settings, mergeSettings(sres.data.settings)); lsSet(LS_SETTINGS, settings); cloud.settingsDirty = false; changedLocal = true;
        fetchPresetLogo();
      } else if (!sres.data) cloud.settingsDirty = true;
      // Customers and time entries changed on another device
      var rq = sb.from("records").select("id, kind, doc, deleted, updated_at").order("updated_at", { ascending: true });
      if (cloud.lastPullR) rq = rq.gt("updated_at", lookBack(cloud.lastPullR));
      var rres = await rq;
      if (rres.error) throw rres.error;
      var maxR = cloud.lastPullR || "", recChanged = false;
      (rres.data || []).forEach(function (row) {
        if (row.updated_at > maxR) maxR = row.updated_at;
        var local = records[row.id], rdoc = row.doc || {};
        var rTime = rdoc.updatedAt || 0, lTime = local ? local.updatedAt || 0 : 0;
        if (!local && cloud.rdirty[row.id] > 1 && rTime <= cloud.rdirty[row.id]) return;   // deleted here, not sent yet
        if (row.deleted) {
          if (local && rTime >= lTime) { delete records[row.id]; delete cloud.rdirty[row.id]; recChanged = true; }
          return;
        }
        if (!rdoc.kind) return;
        if (!local || rTime > lTime) { records[row.id] = rdoc; delete cloud.rdirty[row.id]; recChanged = true; }
      });
      if (maxR) cloud.lastPullR = maxR;
      if (recChanged) { saveRecords(); changedLocal = true; }
      // 2. Send up photos for invoices about to be sent
      var dirtyIds = Object.keys(cloud.dirty);
      var needUp = photoIdsOf(dirtyIds).filter(function (id) { return !cloud.uploaded[id]; });
      if (needUp.length) await ensurePhotos(needUp);
      for (var i = 0; i < needUp.length; i++) {
        var pid = needUp[i];
        if (!photoCache[pid]) continue;
        var up = await sb.storage.from("photos").upload(uid + "/" + pid + ".jpg", dataUrlToBlob(photoCache[pid]), { upsert: true, contentType: "image/jpeg" });
        if (!up.error) cloud.uploaded[pid] = 1;
      }
      // 3. Send up changed and deleted invoices
      if (dirtyIds.length) {
        var rows = dirtyIds.map(function (id) {
          return savedLocal[id] ? { user_id: uid, id: id, doc: savedLocal[id], deleted: false }
            : { user_id: uid, id: id, doc: { id: id, updatedAt: cloud.dirty[id] > 1 ? cloud.dirty[id] : Date.now() }, deleted: true };
        });
        var pres = await sb.from("invoices").upsert(rows, { onConflict: "user_id,id" });
        if (pres.error) throw pres.error;
        dirtyIds.forEach(function (id) { delete cloud.dirty[id]; });
      }
      // 4. Customers and time entries (a record changed while sending stays queued)
      var rIds = Object.keys(cloud.rdirty), sent = {};
      if (rIds.length) {
        var rrows = rIds.map(function (id) {
          var r = records[id];
          sent[id] = r ? r.updatedAt : "gone";
          return r ? { user_id: uid, id: id, kind: r.kind, doc: r, deleted: false }
            : { user_id: uid, id: id, kind: id.indexOf("cus-") === 0 ? "customer" : "time", doc: { id: id, updatedAt: cloud.rdirty[id] > 1 ? cloud.rdirty[id] : Date.now() }, deleted: true };
        });
        var rp = await sb.from("records").upsert(rrows, { onConflict: "user_id,id" });
        if (rp.error) throw rp.error;
        rIds.forEach(function (id) { if ((records[id] ? records[id].updatedAt : "gone") === sent[id]) delete cloud.rdirty[id]; });
      }
      // 5. Settings
      if (cloud.settingsDirty) {
        var set = await sb.from("app_settings").upsert({ user_id: uid, settings: settings }, { onConflict: "user_id" });
        if (set.error) throw set.error;
        cloud.settingsDirty = false;
      }
      cloud.lastSync = Date.now(); cloudState = "ok"; cloudErr = "";
    } catch (e) {
      cloudState = "error";
      cloudErr = navigator.onLine ? "Couldn't sync just now. It'll try again shortly." : "No internet. It'll sync when you're back online.";
      clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 60000);
    }
    cloudSave();
    syncing = false;
    if (changedLocal && settings.setupDone && !$("view-setup").hidden) show("home");
    if (changedLocal) {
      Object.keys(photoCache).forEach(function (k) { if (photoCache[k] === null) delete photoCache[k]; });
      gridSig = paperSig = "";
      renderAll();
    } else renderSaved();
    renderCloud();
    if (manual && cloudState === "ok") toast("All synced");
    if (syncAgain) { syncAgain = false; scheduleSync(500); }
  }
  function signedIn(user) {
    cloudUser = user;
    if (cloud.userId !== user.id) {
      // First time this account is used on this phone: send everything already here
      cloud = { userId: user.id, dirty: {}, rdirty: {}, uploaded: {}, settingsDirty: true, lastPull: null, lastPullR: null, lastSync: 0 };
      Object.keys(savedLocal).forEach(function (id) { cloud.dirty[id] = 1; });
      Object.keys(records).forEach(function (id) { cloud.rdirty[id] = 1; });
      cloudSave();
    }
    renderCloud(); renderSaved();
    syncNow();
  }
  function cloudError(msg) { var el = $("cloud-err"); el.textContent = msg; el.hidden = !msg; if (msg) $("cloud-check").hidden = true; }
  var checkEmail = "";
  function showCheckEmail(em, msg) { checkEmail = em; cloudError(""); setText("cloud-check-text", msg); $("cloud-check").hidden = false; }
  $("cloud-resend").addEventListener("click", async function () {
    if (!checkEmail) return;
    var btn = this; btn.disabled = true;
    var r = await sb.auth.resend({ type: "signup", email: checkEmail, options: { emailRedirectTo: location.origin + location.pathname } });
    btn.disabled = false;
    toast(r.error ? (r.error.status === 429 ? "Wait a minute before asking for another link." : "Couldn't send it. Check your internet and try again.") : "Sent. Check your email.");
  });
  function cloudBusy(on) { $("cloud-signin").disabled = on; $("cloud-signup").disabled = on; }
  function renderCloud() {
    var chip = $("cloud-chip");
    $("cloud-unavail").hidden = !!sb;
    $("cloud-out").hidden = !sb || !!cloudUser;
    $("cloud-in").hidden = !cloudUser;
    $("cloud-setpw").hidden = !(cloudUser && needPassword);
    if (cloudUser && needPassword) setText("setpw-title", needPassword === "invite"
      ? "Welcome! Choose a password so you can sign in on any phone, tablet or computer."
      : needPassword === "signup" ? "Email confirmed. To finish, choose the password you'll sign in with."
      : "Choose a new password for " + cloudUser.email + ".");
    if (!cloudUser) { chip.className = "chip declined"; chip.textContent = "Off"; return; }
    chip.className = "chip " + (cloudState === "error" ? "overdue" : "paid");
    chip.textContent = cloudState === "syncing" ? "Syncing…" : cloudState === "error" ? "Not synced" : "On";
    setText("cloud-line", "Signed in as " + cloudUser.email + ". " + (cloudState === "error" ? cloudErr
      : cloud.lastSync ? "Last synced " + ago(cloud.lastSync) + "." : "Syncing for the first time…"));
  }
  function initCloud() {
    try {
      if (window.supabase && window.supabase.createClient) {
        sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "blast-invoice-auth" } });
      }
    } catch (e) { sb = null; }
    renderCloud();
    if (!sb) return;
    sb.auth.getSession().then(function (r) {
      var u = r.data && r.data.session ? r.data.session.user : null;
      if (u) signedIn(u); else renderOverview();
      if (linkType) { try { history.replaceState(null, "", location.pathname); } catch (e) {} }
      if (linkType === "error") toast("That link has run out or was already used. Ask for a new one.", null, null, 6000);
      else if (u && needPassword) askForPassword();
      else if (u && linkType === "email_change") toast("Email confirmed. You're signed in.");
    });
    sb.auth.onAuthStateChange(function (ev, session) {
      if (ev === "SIGNED_OUT") { cloudUser = null; renderCloud(); renderSaved(); }
      if (ev === "SIGNED_IN") renderOverview();
      if (ev === "PASSWORD_RECOVERY" && session) { needPassword = "recovery"; if (cloudUser) askForPassword(); }
    });
  }
  $("cloud-signin").addEventListener("click", async function () {
    var em = $("cloud-email").value.trim(), pw = $("cloud-pass").value;
    if (!em || !pw) { cloudError("Put in your email and password."); return; }
    cloudError(""); cloudBusy(true);
    var r = await sb.auth.signInWithPassword({ email: em, password: pw });
    cloudBusy(false);
    if (r.error) {
      if (r.error.code === "email_not_confirmed") { showCheckEmail(em, "Confirm your email first. Tap the link in the email we sent to " + em + ", then sign in. Check Junk if it's not there."); return; }
      cloudError(/invalid/i.test(r.error.message || "") ? "That email and password don't match. Check them, or tap Create account if you haven't made one yet."
        : "Couldn't sign in. Check your internet and try again.");
      return;
    }
    $("cloud-pass").value = "";
    signedIn(r.data.user);
    toast("Signed in. Saving your invoices online…");
  });
  $("cloud-signup").addEventListener("click", async function () {
    var em = $("cloud-email").value.trim(), pw = $("cloud-pass").value;
    if (!em || !pw) { cloudError("Put in your email and choose a password."); return; }
    if (pw.length < 8) { cloudError("Make the password at least 8 characters."); return; }
    cloudError(""); cloudBusy(true);
    var r = await sb.functions.invoke("create-account", { body: { email: em, password: pw, redirectTo: location.origin + location.pathname } });
    if (r.error) {
      var code = "";
      try { code = (await r.error.context.json()).error; } catch (e) {}
      cloudBusy(false);
      cloudError(code === "not_allowed" ? "This email can't make an account here. Ask whoever set up the app to add it."
        : code === "exists" ? "There's already an account for this email. Tap Sign in instead."
        : code === "weak_password" ? "Make the password at least 8 characters."
        : code === "bad_email" ? "That doesn't look like an email address."
        : code === "busy" ? "Too many emails sent just now. Try again in a little while."
        : "Couldn't make the account. Check your internet and try again.");
      return;
    }
    var made = r.data || {};
    if (!made.confirmed) {
      cloudBusy(false);
      $("cloud-pass").value = "";
      showCheckEmail(em, "Nearly done. We've sent a link to " + em + ". Open it on this phone to confirm your email and finish making your account. It can take a minute; check Junk if it's not there.");
      return;
    }
    var s2 = await sb.auth.signInWithPassword({ email: em, password: pw });
    cloudBusy(false);
    if (s2.error) { cloudError("Account made, but signing in failed. Tap Sign in."); return; }
    $("cloud-pass").value = "";
    signedIn(s2.data.user);
    toast("Account made. Saving your invoices online…");
  });
  function askForPassword() {
    renderCloud(); show("settings");
    setTimeout(function () { $("cloud-card").scrollIntoView({ block: "start" }); $("setpw-pass").focus(); }, 0);
  }
  $("setpw-save").addEventListener("click", async function () {
    var pw = $("setpw-pass").value, err = $("setpw-err"), btn = this;
    if (pw.length < 8) { err.textContent = "Make the password at least 8 characters."; err.hidden = false; return; }
    err.hidden = true; btn.disabled = true;
    var r = await sb.auth.updateUser({ password: pw });
    btn.disabled = false;
    // Just after signing up, typing the same password again is exactly what we want
    if (r.error && r.error.code === "same_password" && needPassword === "signup") r = { error: null };
    if (r.error) {
      err.textContent = r.error.code === "same_password" ? "That's the password you have now. Choose a different one."
        : r.error.code === "weak_password" ? "That password is too easy to guess. Try a longer one."
        : "Couldn't save the password. Check your internet and try again.";
      err.hidden = false;
      return;
    }
    $("setpw-pass").value = ""; needPassword = ""; renderCloud();
    toast("Password saved");
    show(settings.setupDone ? "home" : "setup");
  });
  $("cloud-forgot").addEventListener("click", async function () {
    var em = $("cloud-email").value.trim();
    if (!em) { cloudError("Put in your email above first, then tap Forgot your password."); $("cloud-email").focus(); return; }
    cloudError(""); cloudBusy(true);
    var r = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
    cloudBusy(false);
    if (r.error) {
      cloudError(r.error.status === 429 ? "Too many emails sent just now. Try again in a little while."
        : r.error.code === "email_address_not_authorized" ? "Password emails aren't switched on yet. Ask whoever set up the app."
        : r.error.code === "email_address_invalid" ? "That doesn't look like an email address that can get mail."
        : "Couldn't send the email. Check your internet and try again.");
      return;
    }
    toast("Check your email for a link to choose a new password. Open it on this phone.", null, null, 6000);
  });
  $("cloud-sync").addEventListener("click", function () { syncNow(true); });
  $("cloud-signout").addEventListener("click", async function () {
    await flush();
    await sb.auth.signOut();
    cloudUser = null; renderCloud(); renderSaved();
    toast("Signed out. Your invoices are still on this phone.");
  });
  window.addEventListener("online", function () { scheduleSync(500); });

  // ---------- Start (once invoices, customers and time have loaded) ----------
  bootStores().then(function () {
    if (savedLocal[inv.id]) lastSavedJson = stable(stripForCompare(savedLocal[inv.id]));
    renderAll();
    setTimeout(function () {
      photoKeys().then(function (keys) {
        var used = {};
        usedPhotoIds().forEach(function (id) { used[id] = 1; });
        (keys || []).forEach(function (k) { if (!used[k]) photoDel(k); });
      }).catch(function () {});
    }, 4000);
    // Keep a copy of the app and its PDF and picture makers so it opens with no signal
    try {
      if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
    } catch (e) {}
    // Ask Safari to keep this app's storage (not guaranteed, harmless if refused)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    window.addEventListener("pagehide", function () { flush(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) flush(); else scheduleSync(500); });
    initCloud();
    fetchPresetLogo();
    show(settings.setupDone ? "home" : "setup");
  });
})();
