// Applistan: tryck BACK två gånger på hemskärmen för att se apparna som körs i bakgrunden och
// stänga dem. Samma panel som inställningsmenyn: ▲ ▼ väljer, OK stänger appen, ▶ öppnar den,
// och sista raden "Stäng alla" stänger allihop.
// Sidan får inte själv anropa applicationManager/running eller closeByAppId. Listan läses därför från
// korande.js, som tjänsten skriver om när appar startar och stängs, och stängningen går via
// setup/appar.sh och Homebrew Channels exec (som tar ett par sekunder; raden försvinner direkt ändå).
// Bara gammal JavaScript (Chromium 53).
var Vaxlare = (function() {
  var SCRIPT = "sh /media/developer/apps/usr/palm/applications/se.minhemskarm.launcher/setup/appar.sh";
  var RUNNING_JS = "file:///media/developer/custom_home/korande.js";
  var HIDDEN = ["se.minhemskarm.launcher", "com.webos.app.home"];
  var ROW_H = 82; // .m-row: höjd 76 + marginal 6

  var open = false, rows = [], cur = 0, keep = null, model = null, closed = {};

  function $(id) { return document.getElementById(id); }

  function exec(command, cb) {
    try {
      var b = keep = new PalmServiceBridge();
      b.onservicecallback = function(msg) {
        var r = null;
        try { r = JSON.parse(msg); } catch (e) {}
        cb(r && r.returnValue ? r.stdoutString || "" : null);
      };
      b.call("luna://org.webosbrew.hbchannel.service/exec", JSON.stringify({ command: command }));
    } catch (e) {
      cb(null);
    }
  }

  function tvApp(id) {
    var list = window.TV_APPS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function quickstart() {
    return INST.snabbstart instanceof Array ? INST.snabbstart : ["com.telia.tv4"];
  }

  // Bara appar med en ruta på TV:n (inte hemskärmarna, ingångarna eller dolda systemappar).
  function toModel(list, freeMb) {
    var apps = [];
    list.forEach(function(r) {
      var tv = tvApp(r.id);
      if (!tv || HIDDEN.indexOf(r.id) !== -1 || /^com\.webos\.app\.hdmi/.test(r.id)) return;
      apps.push({ id: r.id, title: tv.title || r.id, tv: tv, kb: r.kb || 0 });
    });
    return { apps: apps, freeMb: freeMb };
  }

  // Reserv om korande.js saknas: appar.sh skriver svaret från running på första raden,
  // sedan "MEM <pid> <kB>" och "LEDIGT <kB>".
  function parseScript(out) {
    var lines = out.split("\n"), mem = {}, free = 0, running = [];
    try { running = JSON.parse(lines[0]).running || []; } catch (e) {}
    lines.forEach(function(l) {
      var m = /^MEM (\d+) (\d+)/.exec(l);
      if (m) mem[m[1]] = +m[2];
      m = /^LEDIGT (\d+)/.exec(l);
      if (m) free = +m[1];
    });
    return toModel(running.map(function(r) {
      return { id: r.id, kb: mem[r.processid] || mem[r.webprocessid] || 0 };
    }), Math.round(free / 1024));
  }

  function mb(kb) { return Math.round(kb / 1024) + " MB"; }

  function draw() {
    var now = Date.now();
    var apps = model.apps.filter(function(a) { return !(closed[a.id] && now - closed[a.id] < 20000); });
    $("v-sub").textContent = "Ledigt minne: " + model.freeMb + " MB";
    var list = $("v-list");
    list.innerHTML = "";
    rows = apps.map(function(a) {
      var el = document.createElement("div");
      var t = document.createElement("div");
      t.className = "m-thumb";
      t.style.background = a.tv.iconColor || "#2b2f3d";
      var src = iconUrl(a.tv);
      if (src) {
        var img = document.createElement("img");
        img.src = src;
        t.appendChild(img);
      }
      el.appendChild(t);
      var l = document.createElement("div");
      l.className = "m-label";
      l.textContent = a.title;
      el.appendChild(l);
      var v = document.createElement("div");
      v.className = "m-value";
      v.textContent = (a.kb ? mb(a.kb) : "") + (quickstart().indexOf(a.id) !== -1 ? " · snabbstart" : "");
      el.appendChild(v);
      return { el: el, app: a };
    });
    if (rows.length) {
      var all = document.createElement("div");
      all.innerHTML = '<div class="m-label">Stäng alla</div>';
      rows.push({ el: all, all: true });
    }
    rows.forEach(function(r, i) {
      r.el.addEventListener("mouseover", function() { focus(i); });
      r.el.addEventListener("click", function() { focus(i); closeSelected(); });
      list.appendChild(r.el);
    });
    $("v-empty").style.display = rows.length ? "none" : "block";
    $("v-hint").innerHTML = rows.length
      ? "<b>OK</b> stäng appen · <b>▶</b> öppna · <b>BACK</b> tillbaka"
      : "<b>BACK</b> tillbaka";
    focus(cur);
  }

  function rowClass(r, focused) {
    return "m-row" + (r.all ? " danger" : "") + (focused ? " focused" : "") + (r.gone ? " gone" : "");
  }

  function focus(n) {
    if (!rows.length) return;
    cur = Math.max(0, Math.min(rows.length - 1, n));
    rows.forEach(function(r, i) { r.el.className = rowClass(r, i === cur); });
    var list = $("v-list"), y = cur * ROW_H;
    if (y < list.scrollTop) list.scrollTop = y;
    else if (y + ROW_H > list.scrollTop + list.clientHeight) list.scrollTop = y + ROW_H - list.clientHeight;
  }

  function loadScript() {
    exec(SCRIPT, function(out) {
      if (!open) return;
      if (out === null) { $("v-sub").textContent = "Kunde inte läsa apparna (Homebrew Channel svarar inte)."; return; }
      model = parseScript(out);
      draw();
    });
  }

  // korande.js läses in på nytt varje gång (frågetecknet hindrar att en gammal kopia används).
  function load() {
    var s = document.createElement("script");
    s.onload = function() {
      document.head.removeChild(s);
      var k = window.TV_KORANDE;
      if (!open) return;
      if (!k || !k.appar) return loadScript();
      model = toModel(k.appar, k.ledigtMb);
      draw();
    };
    s.onerror = function() { document.head.removeChild(s); if (open) loadScript(); };
    s.src = RUNNING_JS + "?t=" + Date.now();
    document.head.appendChild(s);
  }

  // Raden glider åt sidan och tonar bort direkt; stängningen sker i bakgrunden.
  function closeApps(list) {
    rows.forEach(function(r) { if (r.all ? list.length > 1 : list.indexOf(r.app.id) !== -1) r.gone = true; });
    focus(cur);
    list.forEach(function(id) { closed[id] = Date.now(); });
    exec(SCRIPT + " stang " + list.join(" "), function() {
      // Tjänsten skriver om korande.js när apparna har stängts; läs in det nya minnet.
      setTimeout(function() { if (open) load(); }, 1500);
    });
    setTimeout(function() { if (open) draw(); }, 320);
  }

  function closeAll() {
    var ids = rows.filter(function(r) { return !r.all; }).map(function(r) { return r.app.id; });
    if (ids.length) closeApps(ids);
  }

  function closeSelected() {
    var r = rows[cur];
    if (!r) return;
    if (r.all) closeAll();
    else closeApps([r.app.id]);
  }

  function openSelected() {
    var r = rows[cur];
    if (!r || r.all) return;
    hide();
    launch({ id: r.app.id, namn: r.app.title });
  }

  function hide() {
    open = false;
    $("vaxlare").className = "fill";
  }

  return {
    isOpen: function() { return open; },
    open: function() {
      if (open) return;
      open = true;
      cur = 0;
      rows = [];
      $("v-list").innerHTML = "";
      $("v-empty").style.display = "none";
      $("v-sub").textContent = "Hämtar…";
      $("v-hint").innerHTML = "<b>BACK</b> tillbaka";
      $("vaxlare").className = "fill show";
      load();
    },
    close: hide,
    // Returnerar true om tangenten hanterades.
    key: function(k) {
      if (k === 38) focus(cur - 1);
      else if (k === 40) focus(cur + 1);
      else if (k === 13) closeSelected();
      else if (k === 39) openSelected();
      else if (k === 37) { /* ingenting */ }
      else if (k === 461 || k === 405) hide();
      else return false;
      return true;
    }
  };
})();
