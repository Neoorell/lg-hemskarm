// "Alla appar": rutnät med alla appar på TV:n, öppnas från rutan sist i appraden.
// Pilarna väljer, OK öppnar appen, gula knappen lägger till eller tar bort appen från raden,
// BACK stänger. Bara gammal JavaScript (Chromium 53).
var AllaAppar = (function() {
  var COLS = 6, TILE_H = 214; // .g-app: ruta 132 + namn och marginal
  var HIDDEN = ["se.minhemskarm.launcher", "com.webos.app.home"];
  var open = false, items = [], cur = 0;

  function $(id) { return document.getElementById(id); }

  function onRow(id) {
    return chosenApps(window.TV_APPS).some(function(a) { return a.id === id; });
  }

  function build() {
    var list = (window.TV_APPS || []).filter(function(a) { return HIDDEN.indexOf(a.id) === -1; });
    list.sort(function(a, b) { return (a.title || "").localeCompare(b.title || "", "sv"); });
    var grid = $("g-grid");
    grid.innerHTML = "";
    items = list.map(function(a) {
      var icon = iconUrl(a);
      var t = makeAppTile({ namn: a.title || a.id, text: a.title || a.id, id: a.id, icon: icon,
                            iconBg: icon && a.iconColor ? a.iconColor : null,
                            bg: "linear-gradient(135deg,#2b2f3d,#4a5068)" });
      t.el.className += " g-app";
      var mark = document.createElement("div");
      mark.className = "g-mark";
      mark.textContent = "På raden";
      t.el.appendChild(mark);
      grid.appendChild(t.el);
      return { el: t.el, mark: mark, app: a };
    });
    items.forEach(function(it, i) {
      it.mark.style.display = onRow(it.app.id) ? "block" : "none";
      it.el.addEventListener("mouseover", function() { focus(i); });
      it.el.addEventListener("click", function() { focus(i); activate(); });
    });
  }

  function focus(n) {
    if (!items.length) return;
    cur = Math.max(0, Math.min(items.length - 1, n));
    items.forEach(function(it, i) {
      it.el.className = it.el.className.replace(/ focused/g, "") + (i === cur ? " focused" : "");
    });
    var box = $("g-grid"), y = Math.floor(cur / COLS) * TILE_H;
    if (y < box.scrollTop) box.scrollTop = y;
    else if (y + TILE_H > box.scrollTop + box.clientHeight) box.scrollTop = y + TILE_H - box.clientHeight;
  }

  function activate() {
    var it = items[cur];
    if (!it) return;
    hide();
    launch({ id: it.app.id, namn: it.app.title });
  }

  // Gula knappen: lägg till sist på raden, eller ta bort från raden.
  function toggleRow() {
    var it = items[cur];
    if (!it) return;
    var ids = chosenApps(window.TV_APPS).filter(function(a) { return a.id; }).map(function(a) { return a.id; });
    var i = ids.indexOf(it.app.id), adding = i === -1;
    if (adding) ids.push(it.app.id); else ids.splice(i, 1);
    saveInst({ appar: ids }, function(ok) {
      if (!ok) return toast("Kunde inte spara");
      it.mark.style.display = adding ? "block" : "none";
      toast((it.app.title || it.app.id) + (adding ? " finns nu på raden" : " är borttagen från raden"));
      render(window.TV_APPS);
    });
  }

  function hide() {
    open = false;
    $("allaappar").className = "fill";
  }

  return {
    isOpen: function() { return open; },
    open: function() {
      if (open) return;
      build();
      open = true;
      cur = 0;
      $("allaappar").className = "fill show";
      $("g-grid").scrollTop = 0;
      focus(0);
    },
    close: hide,
    key: function(k) {
      if (k === 37) focus(cur - 1);
      else if (k === 39) focus(cur + 1);
      else if (k === 38) focus(cur - COLS);
      else if (k === 40) focus(Math.min(items.length - 1, cur + COLS));
      else if (k === 13) activate();
      else if (k === 405) toggleRow();
      else if (k === 461) hide();
      else return false;
      return true;
    }
  };
})();
