// Hemskärmens inställningsmeny. Öppnas med kugghjulet sist bland ingångarna eller med gula knappen.
// Ändringarna sparas när menyn stängs: tjänsten skriver installningar.js (via Homebrew Channels
// exec och "hem spara") och sidan laddas om. Bara gammal JavaScript, som i index.html (Chromium 53).
var Meny = (function() {
  var STADER = [
    ["Stockholm", 59.33, 18.07], ["Göteborg", 57.71, 11.97], ["Malmö", 55.60, 13.00], ["Uppsala", 59.86, 17.64],
    ["Västerås", 59.61, 16.55], ["Örebro", 59.27, 15.21], ["Linköping", 58.41, 15.62], ["Helsingborg", 56.05, 12.69],
    ["Jönköping", 57.78, 14.16], ["Norrköping", 58.59, 16.19], ["Lund", 55.70, 13.19], ["Umeå", 63.83, 20.26],
    ["Gävle", 60.67, 17.14], ["Borås", 57.72, 12.94], ["Eskilstuna", 59.37, 16.51], ["Halmstad", 56.67, 12.86],
    ["Växjö", 56.88, 14.81], ["Karlstad", 59.40, 13.50], ["Sundsvall", 62.39, 17.31], ["Luleå", 65.58, 22.15],
    ["Östersund", 63.18, 14.64], ["Falun", 60.61, 15.63], ["Kalmar", 56.66, 16.36], ["Kristianstad", 56.03, 14.16],
    ["Visby", 57.64, 18.30], ["Kiruna", 67.86, 20.23]
  ];
  var SELF_ID = "se.minhemskarm.launcher";
  var ROW_H = 82; // .m-row: höjd 76 + marginal 6

  var open = false, busy = false, stack = [], rows = [], cur = 0, editing = null;
  var state = null, dirty = {}, changed = false, upd = null, keep = {};

  function $(id) { return document.getElementById(id); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function mark(field) { dirty[field] = true; changed = true; }

  // Ingångarna i menyn: de sparade (eller INGANGAR) plus de i INGANGAR som saknas där.
  function inputsForMenu() {
    var list = copy(allInputs()), ids = list.map(function(i) { return i.id; });
    INGANGAR.forEach(function(i) {
      if (ids.indexOf(i.id) === -1) list.push({ id: i.id, namn: i.namn, dold: true });
    });
    return list.map(function(i) { return { id: i.id, namn: i.namn, dold: !!i.dold }; });
  }
  function defaultInputName(id) {
    for (var i = 0; i < INGANGAR.length; i++) if (INGANGAR[i].id === id) return INGANGAR[i].namn;
    var m = /hdmi(\d+)$/.exec(id);
    return m ? "HDMI " + m[1] : id;
  }
  function tvApps() {
    return (window.TV_APPS || []).filter(function(a) { return a.id !== SELF_ID; });
  }
  function tvApp(id) {
    var list = window.TV_APPS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function bgName(id) {
    if (id === "egen") return "Egen bild";
    for (var i = 0; i < BAKGRUNDER.length; i++) if (BAKGRUNDER[i].id === id) return BAKGRUNDER[i].namn;
    return BAKGRUNDER[0].namn;
  }
  function ortNamn() {
    if (state.ort) return state.ort.namn;
    return (window.TV_WEATHER && window.TV_WEATHER.ort) || "Stockholm";
  }

  // PalmServiceBridge måste finnas kvar så länge svar kommer, annars tappas prenumerationer.
  function luna(uri, params, cb) {
    try {
      var b = new PalmServiceBridge();
      keep[uri] = b;
      b.onservicecallback = function(msg) {
        var r = null;
        try { r = JSON.parse(msg); } catch (e) {}
        cb(r);
      };
      b.call(uri, JSON.stringify(params));
    } catch (e) {
      cb(null);
    }
  }

  function exec(command, cb) {
    luna("luna://org.webosbrew.hbchannel.service/exec", { command: command }, function(r) {
      cb(r && r.returnValue ? r.stdoutString || "" : null);
    });
  }

  // ---- TV:ns egna inställningar ----
  // Ljudutgången läses och byts med luna-send via Homebrew Channels exec (sidan får inte själv);
  // bild, ljud och nätverk öppnar LG:s inställningsapp direkt på rätt sida (params.target).
  var LJUD_UT = [
    ["tv_speaker", "TV-högtalare"], ["external_arc", "Soundbar (HDMI ARC)"],
    ["external_optical", "Optisk"], ["bt_soundbar", "Bluetooth"]
  ];
  var soundOut = null;
  function soundName(id) {
    for (var i = 0; i < LJUD_UT.length; i++) if (LJUD_UT[i][0] === id) return LJUD_UT[i][1];
    return id;
  }
  function readSoundOut() {
    exec("luna-send -n 1 luna://com.webos.service.apiadapter/audio/getSoundOutput '{}'", function(out) {
      var m = /"soundOutput"\s*:\s*"([a-z_]+)"/.exec(out || "");
      if (!m) return;
      soundOut = m[1];
      var fn = open && top().fn;
      if (fn === pageMain || fn === pageSound) refresh(rows[cur] && rows[cur].key);
    });
  }
  function setSoundOut(id) {
    $("m-sub").textContent = "Byter till " + soundName(id) + "…";
    exec("luna-send -n 1 luna://com.webos.service.apiadapter/audio/changeSoundOutput '{\"output\":\"" + id + "\"}'", function(out) {
      if (/"returnValue"\s*:\s*true/.test(out || "")) soundOut = id;
      else toast("Kunde inte byta ljudutgång");
      if (open && top().fn === pageSound) refresh(id);
    });
  }
  function pageSound() {
    return {
      title: "Ljud ut",
      sub: "Var ljudet ska komma ut. Fler val (t.ex. hörlurar) finns i TV:ns ljudinställningar.",
      hint: "<b>OK</b> välj · <b>BACK</b> tillbaka",
      rows: LJUD_UT.map(function(o) {
        return { key: o[0], label: o[1], value: o[0] === soundOut ? "Vald" : "", on: o[0] === soundOut,
                 ok: function() { if (o[0] !== soundOut) setSoundOut(o[0]); } };
      }).concat([{ key: "fler", label: "Fler ljudval i TV:ns inställningar", value: "TV:ns meny",
                   ok: function() { openTv("sound"); } }])
    };
  }
  function openTv(target) {
    luna("luna://com.webos.applicationManager/launch", { id: "com.palm.app.settings", params: { target: target } }, function(r) {
      if (r && r.returnValue === false) toast("Kunde inte öppna TV:ns inställningar");
    });
    close();
  }

  // ---- sidor ----

  function pageMain() {
    var visible = state.ingangar.filter(function(i) { return !i.dold; }).map(function(i) { return i.namn; });
    return {
      title: "Inställningar",
      sub: APP_VERSION ? "Hemskärm " + APP_VERSION : "",
      hint: "<b>OK</b> välj · <b>BACK</b> " + (changed ? "spara och stäng" : "stäng"),
      rows: [
        { key: "appar", label: "Appar på raden", value: state.appar.length + " appar", ok: function() { go(pageApps); } },
        { key: "ing", label: "Ingångar", value: visible.join(", ") || "Inga", ok: function() { go(pageInputs); } },
        { key: "bg", label: "Bakgrund", value: bgName(state.bakgrund), ok: function() { go(pageBg); } },
        { key: "ort", label: "Väder", value: ortNamn(), ok: function() { go(pageWeather); } },
        { key: "snabb", label: "Snabbstart",
          value: state.snabbstart.map(function(id) { var a = tvApp(id); return a ? a.title : null; })
            .filter(Boolean).join(", ") || "Av",
          ok: function() { go(pageQuick); } },
        { key: "ljudut", label: "Ljud ut", value: soundOut ? soundName(soundOut) : "", ok: function() { go(pageSound); } },
        { key: "tvbild", label: "Bildinställningar", value: "TV:ns meny", ok: function() { openTv("picture"); } },
        { key: "tvljud", label: "Ljudinställningar", value: "TV:ns meny", ok: function() { openTv("sound"); } },
        { key: "tvnat", label: "Nätverk och wifi", value: "TV:ns meny", ok: function() { openTv("network"); } },
        { key: "tvallm", label: "Allmänna TV-inställningar", value: "TV:ns meny", ok: function() { openTv("general"); } },
        { key: "upd", label: "Uppdateringar", value: UPPDATERING ? "Version " + UPPDATERING.version + " finns" : "",
          on: !!UPPDATERING, ok: function() { go(pageUpdates); } },
        { key: "stang", label: changed ? "Spara och stäng" : "Stäng", ok: close }
      ]
    };
  }

  function pageApps() {
    var chosen = state.appar.filter(function(id) { return tvApp(id); });
    var others = tvApps().filter(function(a) { return chosen.indexOf(a.id) === -1; });
    others.sort(function(a, b) { return (a.title || "").localeCompare(b.title || "", "sv"); });
    function row(a) {
      var pos = chosen.indexOf(a.id);
      var r = {
        key: a.id, label: a.title || a.id, thumb: a,
        value: pos === -1 ? "Lägg till" : "Nr " + (pos + 1), on: pos !== -1,
        ok: function() {
          var i = state.appar.indexOf(a.id);
          if (i === -1) state.appar.push(a.id); else state.appar.splice(i, 1);
          mark("appar");
          refresh(a.id);
        }
      };
      if (pos !== -1) {
        r.left = function() { move(a.id, -1); };
        r.right = function() { move(a.id, 1); };
      }
      return r;
    }
    var list = chosen.map(tvApp).concat(others).map(row);
    if (!list.length) list = [{ key: "tom", label: "Hittar inga appar på TV:n", dim: true }];
    return {
      title: "Appar på raden",
      sub: "Appar med nummer visas på hemskärmen, i den ordningen.",
      hint: "<b>OK</b> lägg till eller ta bort · <b>◀ ▶</b> flytta · <b>BACK</b> tillbaka",
      rows: list
    };
  }
  function move(id, step) {
    state.appar = state.appar.filter(function(x) { return tvApp(x); });
    var i = state.appar.indexOf(id), j = i + step;
    if (i === -1 || j < 0 || j >= state.appar.length) return;
    state.appar[i] = state.appar[j];
    state.appar[j] = id;
    mark("appar");
    refresh(id);
  }

  // Appar som förladdas i bakgrunden så att de öppnas direkt. Varje förladdad app tar minne,
  // och TV:n har bara 1 GB, så högst två.
  function pageQuick() {
    var list = state.appar.map(tvApp).filter(Boolean);
    return {
      title: "Snabbstart",
      sub: "Valda appar förladdas och öppnas direkt. Varje app tar 50–100 MB minne, så välj högst två.",
      hint: "<b>OK</b> på eller av · <b>BACK</b> tillbaka",
      rows: list.map(function(a) {
        var on = state.snabbstart.indexOf(a.id) !== -1;
        return { key: a.id, label: a.title || a.id, thumb: a, value: on ? "På" : "Av", on: on,
                 ok: function() {
                   var i = state.snabbstart.indexOf(a.id);
                   if (i !== -1) state.snabbstart.splice(i, 1);
                   else if (state.snabbstart.length < 2) state.snabbstart.push(a.id);
                   else { toast("Högst två appar – stäng av en först"); return; }
                   mark("snabbstart");
                   refresh(a.id);
                 } };
      })
    };
  }

  function pageInputs() {
    return {
      title: "Ingångar",
      sub: "Välj vilka ingångar som visas och vad de heter.",
      hint: "<b>OK</b> ändra · <b>BACK</b> tillbaka",
      rows: [{ key: "tomma", label: "Dölj ingångar utan något anslutet", value: state.doljTomma ? "På" : "Av",
               on: state.doljTomma,
               ok: function() { state.doljTomma = !state.doljTomma; mark("doljTomma"); refresh("tomma"); } }]
        .concat(state.ingangar.map(function(inp, n) {
          var empty = !inputConnected(inp.id);
          return { key: inp.id, label: inp.namn,
                   value: inp.dold ? "Dold" : (empty ? "Inget anslutet" : "Visas"), on: !inp.dold && !empty,
                   ok: function() { go(pageInput(n)); } };
        }))
    };
  }
  function pageInput(n) {
    return function() {
      var inp = state.ingangar[n];
      return {
        title: inp.namn,
        sub: defaultInputName(inp.id),
        hint: "<b>OK</b> ändra · <b>BACK</b> tillbaka",
        rows: [
          { key: "vis", label: "Visa på hemskärmen", value: inp.dold ? "Nej" : "Ja", on: !inp.dold,
            ok: function() { inp.dold = !inp.dold; mark("ingangar"); refresh("vis"); } },
          { key: "namn", label: "Namn", value: inp.namn,
            input: { value: inp.namn, done: function(v) {
              v = v.replace(/^\s+|\s+$/g, "").slice(0, 30);
              if (v && v !== inp.namn) { inp.namn = v; mark("ingangar"); }
            } } },
          { key: "reset", label: "Återställ namnet", value: defaultInputName(inp.id),
            ok: function() { inp.namn = defaultInputName(inp.id); mark("ingangar"); refresh("reset"); } }
        ]
      };
    };
  }

  function pageBg() {
    var list = (window.TV_BAKGRUND ? [{ id: "egen", namn: "Egen bild" }] : []).concat(BAKGRUNDER);
    return {
      title: "Bakgrund",
      sub: "Välj en bild, låt den växla, eller ladda upp en egen från mobilen.",
      hint: "<b>OK</b> välj – bakgrunden byts direkt · <b>BACK</b> tillbaka",
      rows: [{ key: "ladda", label: "Ladda upp från mobilen", value: "QR-kod", ok: function() { go(pageUpload, stopUpload); } },
             { key: "vaxla", label: "Växla bakgrund var 15:e minut", value: state.vaxlaBakgrund ? "På" : "Av",
               on: state.vaxlaBakgrund,
               ok: function() {
                 state.vaxlaBakgrund = !state.vaxlaBakgrund;
                 mark("vaxlaBakgrund");
                 setBackground(state.vaxlaBakgrund ? rotatingId() : state.bakgrund);
                 refresh("vaxla");
               } }].concat(list.map(function(b) {
        var chosen = !state.vaxlaBakgrund && b.id === state.bakgrund;
        return { key: b.id, label: b.namn, value: chosen ? "Vald" : "", on: chosen,
                 ok: function() {
                   state.bakgrund = b.id;
                   mark("bakgrund");
                   if (state.vaxlaBakgrund) { state.vaxlaBakgrund = false; mark("vaxlaBakgrund"); }
                   setBackground(b.id);
                   refresh(b.id);
                 } };
      }))
    };
  }

  // Bakgrund från mobilen: tjänsten startar en tillfällig uppladdningssida ("hem uppladdning"),
  // TV:n visar adressen som QR-kod och följer förloppet i uppladdning.js.
  var upload = null;
  var UPLOAD_TEXT = {
    vantar: "Väntar på en bild från mobilen…", "tar emot": "Tar emot bilden…",
    fel: "Bilden kunde inte tas emot. Försök igen.", stangd: "Tiden gick ut. Öppna sidan igen."
  };
  function pageUpload() {
    return {
      title: "Ladda upp från mobilen",
      sub: "Skanna koden med mobilens kamera. Mobilen ska vara på samma wifi som TV:n.",
      hint: "<b>BACK</b> avbryt",
      rows: [],
      custom: function(list) {
        var box = document.createElement("div");
        box.className = "m-upload";
        box.innerHTML = '<canvas width="320" height="320"></canvas>' +
          '<div class="m-upload-text"><div class="m-upload-url">Startar…</div><div class="m-upload-status"></div></div>';
        list.appendChild(box);
        startUpload(box);
      }
    };
  }
  function drawQr(canvas, text) {
    var m = qrMatrix(text);
    if (!m) return;
    var c = canvas.getContext("2d"), n = m.length, cell = Math.floor(canvas.width / (n + 6));
    var off = Math.floor((canvas.width - cell * n) / 2);
    c.fillStyle = "#fff";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = "#000";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) c.fillRect(off + x * cell, off + y * cell, cell, cell);
  }
  function startUpload(box) {
    var started = Date.now(), my = upload = { done: false, timer: null };
    function setStatus(t) { box.querySelector(".m-upload-status").textContent = t; }
    exec("sh /media/developer/custom_home/hem uppladdning", function(out) {
      if (upload !== my) return;
      var info = null;
      try { info = JSON.parse((out || "").slice((out || "").indexOf("{"))); } catch (e) {}
      if (!info || !info.url) { box.querySelector(".m-upload-url").textContent = (info && info.fel) || "Kunde inte starta uppladdningen."; return; }
      drawQr(box.querySelector("canvas"), info.url);
      box.querySelector(".m-upload-url").textContent = info.url.replace(/^http:\/\//, "");
      setStatus(UPLOAD_TEXT.vantar);
      my.timer = setInterval(function() {
        var sc = document.createElement("script");
        sc.onload = sc.onerror = function() {
          document.head.removeChild(sc);
          var st = window.TV_UPPLADDNING;
          if (upload !== my || !st || st.tid < started) return;
          if (st.status !== "klar") return setStatus(UPLOAD_TEXT[st.status] || "");
          my.done = true;
          clearInterval(my.timer);
          setStatus("Klart! Bilden är sparad.");
          state.bakgrund = "egen";
          mark("bakgrund");
          if (state.vaxlaBakgrund) { state.vaxlaBakgrund = false; mark("vaxlaBakgrund"); }
          setTimeout(close, 1200); // sparar och laddar om, så att den nya bilden visas
        };
        sc.src = "file:///media/developer/custom_home/uppladdning.js?t=" + Date.now();
        document.head.appendChild(sc);
      }, 1500);
    });
  }
  function stopUpload() {
    var my = upload;
    upload = null;
    if (!my) return;
    clearInterval(my.timer);
    if (!my.done) exec("sh /media/developer/custom_home/hem uppladdning stopp", function() {});
  }

  function setOrt(namn, lat, lon) {
    state.ort = { namn: namn, lat: lat, lon: lon };
    mark("ort");
    stack = stack.slice(0, 1);
    draw("ort");
  }
  function pageWeather() {
    var now = ortNamn();
    return {
      title: "Väder",
      sub: "Välj ort, eller sök efter en annan.",
      hint: "<b>OK</b> välj · <b>BACK</b> tillbaka",
      rows: [{ key: "sok", label: "Sök ort", value: "Skriv namnet",
               input: { value: "", done: search } }].concat(STADER.map(function(s) {
        return { key: s[0], label: s[0], value: s[0] === now ? "Vald" : "", on: s[0] === now,
                 ok: function() { setOrt(s[0], s[1], s[2]); } };
      }))
    };
  }
  function search(q) {
    q = q.replace(/^\s+|\s+$/g, "");
    if (!q) return;
    $("m-sub").textContent = "Söker efter " + q + "…";
    var x = new XMLHttpRequest();
    x.onload = function() {
      var res = [];
      try { res = JSON.parse(x.responseText).results || []; } catch (e) {}
      go(function() {
        return {
          title: "Sök: " + q,
          sub: res.length ? "Välj rätt ort." : "Hittade ingen ort som heter så.",
          hint: "<b>OK</b> välj · <b>BACK</b> tillbaka",
          rows: res.map(function(r, n) {
            return { key: "r" + n, label: r.name, value: [r.admin1, r.country].filter(Boolean).join(", "),
                     ok: function() { setOrt(r.name, Math.round(r.latitude * 100) / 100, Math.round(r.longitude * 100) / 100); } };
          })
        };
      });
    };
    x.onerror = function() { $("m-sub").textContent = "Kunde inte söka – är TV:n ansluten till internet?"; };
    x.open("GET", "https://geocoding-api.open-meteo.com/v1/search?count=10&language=sv&format=json&name=" + encodeURIComponent(q));
    x.send();
  }

  function pageUpdates() {
    if (!upd) {
      upd = { status: "Kollar…" };
      checkUpdate(function(latest) {
        upd = { status: latest ? latest : "Kunde inte kolla" };
        if (open && stack[stack.length - 1].fn === pageUpdates) refresh();
      });
    }
    var rows = [
      { key: "inst", label: "Installerad version", value: APP_VERSION || "Okänd" },
      { key: "senaste", label: "Senaste version", value: upd.status, on: !!UPPDATERING }
    ];
    if (UPPDATERING) {
      rows.push({ key: "go", label: "Installera version " + UPPDATERING.version, ok: install });
    } else {
      rows.push({ key: "igen", label: "Sök efter uppdatering igen", ok: function() { upd = null; refresh("igen"); } });
    }
    return {
      title: "Uppdateringar",
      sub: UPPDATERING ? "En ny version finns." : (upd.status === "Kollar…" ? "" : "Du har den senaste versionen."),
      hint: "<b>OK</b> välj · <b>BACK</b> tillbaka",
      rows: rows
    };
  }
  function install() {
    var u = UPPDATERING;
    if (busy || !u || !u.ipkUrl || !u.sha) return;
    busy = true;
    function start() {
      $("m-sub").textContent = "Hämtar version " + u.version + "…";
      luna("luna://org.webosbrew.hbchannel.service/install",
        { id: SELF_ID, ipkUrl: u.ipkUrl, ipkHash: u.sha, subscribe: true }, function(r) {
          if (!r) { busy = false; $("m-sub").textContent = "Kunde inte nå Homebrew Channel."; return; }
          if (r.returnValue === false) { busy = false; $("m-sub").textContent = "Fel: " + (r.errorText || "okänt"); return; }
          var p = typeof r.progress === "number" ? " " + Math.round(r.progress) + " %" : "";
          $("m-sub").textContent = (r.statusText || "Installerar") + p +
            " – hemskärmen startar om. Tryck HOME om en minut om den inte kommer tillbaka.";
        });
    }
    if (changed) save(start); else start();
  }

  // ---- ritning och navigering ----

  function top() { return stack[stack.length - 1]; }
  function go(fn, leave) {
    top().cur = cur;
    stack.push({ fn: fn, cur: 0, leave: leave });
    draw();
  }
  function refresh(key) { draw(key); }

  function draw(key) {
    editing = null;
    var p = top().fn();
    rows = p.rows;
    $("m-title").textContent = p.title;
    $("m-sub").textContent = p.sub || "";
    $("m-hint").innerHTML = p.hint;
    var list = $("m-list");
    list.innerHTML = "";
    if (p.custom) { p.custom(list); return; }
    rows.forEach(function(r, n) {
      var el = document.createElement("div");
      el.className = "m-row" + (r.dim ? " dim" : "");
      if (r.thumb) {
        var t = document.createElement("div");
        t.className = "m-thumb";
        t.style.background = r.thumb.iconColor || "#2b2f3d";
        var src = iconUrl(r.thumb);
        if (src) {
          var img = document.createElement("img");
          img.onerror = function() { t.removeChild(img); };
          img.src = src;
          t.appendChild(img);
        }
        el.appendChild(t);
      }
      var l = document.createElement("div");
      l.className = "m-label";
      l.textContent = r.label;
      el.appendChild(l);
      var v = document.createElement("div");
      v.className = "m-value" + (r.on ? " on" : "");
      v.textContent = r.value || "";
      el.appendChild(v);
      el.addEventListener("mouseover", function() { if (!editing) focus(n); });
      el.addEventListener("click", function() { if (!editing) { focus(n); activate(); } });
      r.el = el;
      r.valueEl = v;
      list.appendChild(el);
    });
    var idx = -1;
    if (key !== undefined) for (var i = 0; i < rows.length; i++) if (rows[i].key === key) idx = i;
    focus(idx === -1 ? top().cur : idx);
  }

  function focus(n) {
    if (!rows.length) return;
    cur = Math.max(0, Math.min(rows.length - 1, n));
    rows.forEach(function(r, i) { r.el.className = "m-row" + (r.dim ? " dim" : "") + (i === cur ? " focused" : ""); });
    var list = $("m-list"), y = cur * ROW_H;
    if (y < list.scrollTop) list.scrollTop = y;
    else if (y + ROW_H > list.scrollTop + list.clientHeight) list.scrollTop = y + ROW_H - list.clientHeight;
  }

  function activate() {
    var r = rows[cur];
    if (!r) return;
    if (r.input) startEdit(r);
    else if (r.ok) r.ok();
  }

  // Textfält: TV:ns skärmtangentbord öppnas när fältet får fokus, OK/Enter sparar, BACK ångrar.
  function startEdit(r) {
    var inp = document.createElement("input");
    inp.type = "text";
    inp.value = r.input.value;
    r.valueEl.textContent = "";
    r.valueEl.appendChild(inp);
    editing = { row: r, el: inp };
    inp.focus();
  }
  function endEdit(save) {
    var e = editing;
    editing = null;
    e.el.blur();
    if (save) e.row.input.done(e.el.value);
    if (stack.length && open) {
      // search() kan redan ha bytt sida; rita bara om samma sida finns kvar
      if (top().fn && rows.indexOf(e.row) !== -1) refresh(e.row.key);
    }
  }

  function back() {
    if (stack.length > 1) {
      if (top().leave) top().leave();
      stack.pop();
      draw();
    } else {
      close();
    }
  }

  function close() {
    open = false;
    $("meny").className = "fill";
    stack.forEach(function(s) { if (s.leave) s.leave(); });
    if (changed) save(function() { location.reload(); });
  }

  // Sparar via tjänsten: "hem spara <base64>" körs som root av Homebrew Channels exec.
  function save(then) {
    busy = true;
    var changes = {};
    if (dirty.appar) changes.appar = state.appar.filter(function(id) { return tvApp(id); });
    ["ingangar", "bakgrund", "ort", "snabbstart", "doljTomma", "vaxlaBakgrund"].forEach(function(k) {
      if (dirty[k]) changes[k] = state[k];
    });
    toast("Sparar…");
    saveInst(changes, function(ok) {
      busy = false;
      if (!ok) return toast("Kunde inte spara inställningarna");
      changed = false;
      dirty = {};
      then();
    });
  }

  return {
    isOpen: function() { return open; },
    open: function() {
      if (open || busy) return;
      state = {
        appar: chosenApps(window.TV_APPS && window.TV_APPS.length ? window.TV_APPS : null)
          .filter(function(a) { return a.id && !a.missing; }).map(function(a) { return a.id; }),
        ingangar: inputsForMenu(),
        bakgrund: bakgrundId(),
        ort: null,
        snabbstart: (INST.snabbstart instanceof Array ? INST.snabbstart : ["com.telia.tv4"]).slice(),
        doljTomma: INST.doljTomma !== false,
        vaxlaBakgrund: INST.vaxlaBakgrund === true
      };
      dirty = {};
      changed = false;
      upd = null;
      readSoundOut();
      stack = [{ fn: pageMain, cur: 0 }];
      open = true;
      $("meny").className = "fill show";
      draw();
    },
    // Returnerar true om tangenten hanterades (då ska webbläsaren inte göra något mer).
    key: function(k) {
      if (editing) {
        if (k === 13) { endEdit(true); return true; }
        if (k === 461) { endEdit(false); return true; }
        return false;
      }
      if (k === 38) focus(cur - 1);
      else if (k === 40) focus(cur + 1);
      else if (k === 37) { if (rows[cur] && rows[cur].left) rows[cur].left(); }
      else if (k === 39) { if (rows[cur] && rows[cur].right) rows[cur].right(); }
      else if (k === 13) activate();
      else if (k === 461) back();
      else if (k === 405) close();
      else return false;
      return true;
    }
  };
})();
