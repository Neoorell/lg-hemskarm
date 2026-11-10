// Bakgrundstjänst för den egna hemskärmen. Skriven för TV:ns egen node (0.12 på webOS 4),
// så bara gammal JavaScript: var, function, inga pilar eller mallsträngar.
//
//   node customhome.js run     bevakar Home-knappen och påslag, hämtar väder (körs från init.d)
//   node customhome.js learn   tryck Home några gånger för att lära in fjärrkontrollens knappkod
//   node customhome.js apps    läser in TV:ns app-lista till tvapps.js
//   node customhome.js weather hämtar vädret till weather.js
//   node customhome.js spara B64 sparar hemskärmens inställningar (base64-kodad JSON) till installningar.js
//   node customhome.js uppladdning [stopp]  startar (eller stoppar) uppladdningssidan för bakgrund från mobilen
//
// Knapp- och påslagsbevakningen bygger på watchers från github.com/NaveenDA/lg-webos-custom-home (MIT).

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");

// Vid uppstart (Homebrew Channels init.d) saknas PATH helt; då hittas bara /bin och /usr/bin,
// inte t.ex. /sbin/initctl.
process.env.PATH = (process.env.PATH ? process.env.PATH + ":" : "") + "/usr/sbin:/usr/bin:/sbin:/bin";

var APP_ID = "se.minhemskarm.launcher";
var HOME_DIR = process.env.CUSTOMHOME_DIR || "/media/developer/custom_home";
var CONF = path.join(HOME_DIR, "homekey.conf");
var PLATS = path.join(HOME_DIR, "plats.conf");
var APPS_JS = path.join(HOME_DIR, "tvapps.js");
var SETTINGS_JS = path.join(HOME_DIR, "installningar.js");
var WEATHER_JS = path.join(HOME_DIR, "weather.js");
var INPUT_DIR = process.env.CUSTOMHOME_INPUT || "/dev/input";
var DEFAULT_CODES = [773]; // LG-fjärrkontrollens Home på många modeller; lär in din egen med "learn"

// struct input_event: 16 byte på 32-bitars system (TV:n), 24 byte på 64-bitars
var IS_64 = process.arch === "x64" || process.arch === "arm64";
var EVENT_SIZE = IS_64 ? 24 : 16;
var TYPE_OFFSET = IS_64 ? 16 : 8;
var NOT_OFF_STATES = ["Active", "Screen Off", "Screen Saver"];

function log(msg) {
  var d = new Date();
  function p(n) { return n < 10 ? "0" + n : "" + n; }
  console.log(d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + " " + msg);
}

function ensureDir() {
  if (!fs.existsSync(HOME_DIR)) fs.mkdirSync(HOME_DIR);
}

function writeAtomic(file, text) {
  ensureDir();
  fs.writeFileSync(file + ".tmp", text);
  fs.renameSync(file + ".tmp", file);
}

function run(cmd, args, timeoutMs, cb) {
  childProcess.execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, function(err, stdout) {
    if (cb) cb(err, stdout ? stdout.toString() : "");
  });
}

function luna(uri, params, timeoutMs, cb) {
  run("luna-send", ["-n", "1", "-f", uri, JSON.stringify(params)], timeoutMs || 5000, cb);
}

function parseJson(text) {
  var i = text.indexOf("{");
  if (i === -1) return null;
  try { return JSON.parse(text.slice(i)); } catch (e) { return null; }
}

// ---- starta hemskärmen ----

var lastLaunch = 0;
function launchHome(reason) {
  var now = Date.now();
  if (now - lastLaunch < 1500) return;
  lastLaunch = now;
  log("startar hemskärmen (" + reason + ")");
  // En app som redan körs visas bara igen utan att laddas om, så stäng den först.
  luna("luna://com.webos.applicationManager/closeByAppId", { id: APP_ID }, 3000, function() {
    luna("luna://com.webos.applicationManager/launch", { id: APP_ID, params: { hem: true } }, 5000);
  });
}

function foregroundApp(cb) {
  luna("luna://com.webos.applicationManager/getForegroundAppInfo", {}, 3000, function(err, out) {
    var data = parseJson(out);
    cb(data ? data.appId || "" : null);
  });
}

// ---- vad som visas vid påslag ----
// Standard är Hemskärm. I menyn ("Vid påslag") kan en HDMI-ingång väljas i stället.
var INPUT_ID = /^com\.webos\.app\.hdmi[1-9]$/;
var START_CEC_WAIT = 5000; // en konsol som väcker TV:n (HDMI-CEC) hinner byta ingång inom den här tiden
var startTimer = null;

function launchInput(id, reason) {
  log("byter till " + id + " (" + reason + ")");
  // Fönsterhanteraren startar om föregående app efter en appstart, och då kan Hemskärm lägga sig över
  // ingången. Stäng den först; HOME startar den igen.
  luna("luna://com.webos.applicationManager/closeByAppId", { id: APP_ID }, 3000, function() {
    luna("luna://com.webos.applicationManager/launch", { id: id }, 5000);
  });
}

function showStartScreen(reason) {
  var target = readSettings().startIngang;
  clearTimeout(startTimer);
  if (typeof target !== "string" || !INPUT_ID.test(target)) return launchHome(reason);
  startTimer = setTimeout(function() {
    if (powerState !== "Active") return;
    foregroundApp(function(fg) {
      if (fg === target) return log("står redan på " + target + " (" + reason + ")");
      // En annan ingång är framme: en konsol väckte TV:n, eller så var den ingången öppen sist. Stör inte.
      if (fg && INPUT_ID.test(fg)) return log("stannar på " + fg + " (" + reason + ")");
      launchInput(target, reason);
    });
  }, START_CEC_WAIT);
}

// ---- LG:s hemrad och bakgrundsfunktioner ----
// Allt här är tillfälligt: bind mounts och stoppade tjänster försvinner vid omstart, så
// systemfilerna ändras aldrig. Tjänsten gör om det vid varje start (init.d).

var LG_HOME_QML = "/usr/palm/applications/com.webos.app.home/qml/main.qml";
var LG_HOME_SNAPSHOTS = ["/mnt/lg/cmn_data/checkpoint/com.webos.app.home", "/tmp/checkpoint/com.webos.app.home"];
var PATCH_DIR = path.join(HOME_DIR, "lghome");
var lgHomePatched = false;

function mounted(target) {
  try { return fs.readFileSync("/proc/mounts", "utf8").indexOf(" " + target + " ") !== -1; } catch (e) { return false; }
}

// LG:s hemrad (QML) får några rader: när den startas av HOME startar den Hemskärm via sin egen
// launchApp, som också döljer LG:s rad. LG:s fil kopieras inte till repot; ändringen görs här.
// Ser filen inte ut som väntat (t.ex. efter en firmwareuppdatering) lämnas LG:s hemrad orörd.
function patchLgHomeQml(orig) {
  var start = "        function start(mode) {\n";
  var root = "    id: rootWindow\n";
  if (orig.split(start).length !== 2 || orig.split(root).length !== 2 ||
      orig.indexOf("property alias interfaces: interfaceLayer.interfaces") === -1 ||
      orig.indexOf("se.minhemskarm") !== -1) return null;
  var props = [
    "",
    "    // Hemskärm (" + APP_ID + "): HOME öppnar den egna hemskärmen i stället för LG:s rad.",
    "    property bool hemskarmPending: false",
    "    Timer {",
    "        interval: 50; repeat: true; running: rootWindow.hemskarmPending",
    "        onTriggered: {",
    "            var app = rootWindow.interfaces ? rootWindow.interfaces.application : null;",
    "            if (!app || !app.launchApp) return;",
    "            rootWindow.hemskarmPending = false;",
    // Starta utan LG:s hideApp(): när hemraden döljer sig själv tar fönsterhanteraren fram den förra
    // appen igen, och den och Hemskärm knuffar då undan varandra. Hemraden döljs ändå när Hemskärm visas.
    "            if (app.services && app.services.launchApp)",
    "                app.services.launchApp({ id: \"" + APP_ID + "\", params: { hem: true }, reason: \"launcher\" }, function() {});",
    "            else",
    "                app.launchApp(\"" + APP_ID + "\", \"\", { hem: true }, \"launcher\");",
    "        }",
    "    }",
    ""
  ].join("\n");
  var hook = "            if (mode === \"home\" || mode === \"main\") rootWindow.hemskarmPending = true;\n";
  return orig.replace(root, root + props + "\n").replace(start, start + hook);
}

function sh(args, cb) { run(args[0], args.slice(1), 10000, function(err) { if (cb) cb(!err); }); }

function patchLgHome(done) {
  if (mounted(LG_HOME_QML)) { lgHomePatched = true; return done(true); }
  var patched = null;
  try { patched = patchLgHomeQml(fs.readFileSync(LG_HOME_QML, "utf8")); } catch (e) {}
  if (!patched) { log("LG:s hemrad ser inte ut som väntat - lämnas orörd"); return done(false); }
  try {
    if (!fs.existsSync(PATCH_DIR)) fs.mkdirSync(PATCH_DIR);
    if (!fs.existsSync(path.join(PATCH_DIR, "tom"))) fs.mkdirSync(path.join(PATCH_DIR, "tom"));
    writeAtomic(path.join(PATCH_DIR, "main.qml"), patched);
  } catch (e) { log("kunde inte skriva LG-hemradens fil: " + e.message); return done(false); }
  sh(["mount", "-o", "bind", path.join(PATCH_DIR, "main.qml"), LG_HOME_QML], function(ok) {
    if (!ok) { log("kunde inte ersätta LG:s hemrad"); return done(false); }
    // LG:s hemrad startar från en färdig minnesbild (CRIU) med originalet i; göm den.
    LG_HOME_SNAPSHOTS.forEach(function(dir) {
      if (fs.existsSync(dir) && !mounted(dir)) {
        sh(["mount", "-o", "bind", path.join(PATCH_DIR, "tom"), dir], function() {
          sh(["mount", "-o", "remount,bind,ro", dir]);
        });
      }
    });
    // Stoppa den körande hemraden; nästa HOME startar den ändrade.
    sh(["sh", "-c", "for p in $(pidof com.webos.app.home); do kill -9 $p; done"], function() {
      lgHomePatched = true;
      log("LG:s hemrad ersatt - HOME öppnar Hemskärm direkt");
      done(true);
    });
  });
}

// LG:s reklam- och spårningsservrar pekas om till TV:n själv. /etc/hosts byts med en
// bind mount (som Homebrew Channel gör när uppdateringar blockeras).
var HOSTS_MARK = "# Hemskärm: LG:s reklam- och spårningsservrar";
var BLOCKED_HOSTS = [
  "ad.lgsmartad.com", "us.ad.lgsmartad.com", "eu.ad.lgsmartad.com",
  "info.lgsmartad.com", "us.info.lgsmartad.com", "eu.info.lgsmartad.com",
  "ngfts.lge.com", "aic-ngfts.lge.com", "eic-ngfts.lge.com", "qt2-ngfts.lge.com",
  "us.ibs.lgappstv.com", "eu.ibs.lgappstv.com", "lgad.cjpowercast.com"
];
function blockAdServers() {
  var hosts = "";
  try { hosts = fs.readFileSync("/etc/hosts", "utf8"); } catch (e) { return; }
  if (hosts.indexOf(HOSTS_MARK) !== -1) return;
  var lines = [HOSTS_MARK];
  BLOCKED_HOSTS.forEach(function(h) { lines.push("127.0.0.1 " + h); });
  try { writeAtomic(path.join(HOME_DIR, "hosts"), hosts.replace(/\n*$/, "\n\n") + lines.join("\n") + "\n"); } catch (e) { return; }
  sh(["mount", "-o", "bind", path.join(HOME_DIR, "hosts"), "/etc/hosts"], function(ok) {
    log(ok ? "LG:s reklamservrar blockerade" : "kunde inte blockera LG:s reklamservrar");
  });
}

// LG:s rekommendations- och statistiktjänster (upstart-jobb). De startar igen vid omstart,
// och vissa (nudge) först en stund efter uppstarten, så stoppet görs om med jämna mellanrum.
// (upstart-jobbet admanager skapar bara en cachemapp vid uppstart; själva reklamtjänsten startas vid
// behov av systemet och kan inte stoppas så. LG:s reklam blockeras i stället via /etc/hosts.)
var LG_JOBS = ["contentminer", "nudge", "uploadd", "rdxd"];
function stopLgJobs() {
  var stopped = [], left = LG_JOBS.length;
  LG_JOBS.forEach(function(job) {
    sh(["initctl", "stop", job], function(ok) {
      if (ok) stopped.push(job);
      if (!--left && stopped.length) log("stoppade LG-tjänster: " + stopped.join(", "));
    });
  });
}

// ---- förladdade appar ----
// LG förladdar appar i bakgrunden. De som inte används stängs så fort de dyker upp, och
// apparna under "Snabbstart" i menyn förladdas i stället, så att de öppnas direkt.
// En app som har synts (som du har öppnat) rörs aldrig.
var UNWANTED_PRELOADS = ["youtube.leanback.v4", "com.webos.app.browser"];
var DEFAULT_QUICKSTART = ["com.telia.tv4"];
var seenApps = {}, lastPreload = {}, powerState = null;

function readSettings() {
  try {
    var t = fs.readFileSync(SETTINGS_JS, "utf8");
    return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  } catch (e) { return {}; }
}
// Appar som stängts i hemskärmens applista (setup/appar.sh) förladdas inte igen på en halvtimme.
function closedByUser(id) {
  var lines = [];
  try { lines = fs.readFileSync("/tmp/hemskarm-stangda", "utf8").split("\n"); } catch (e) {}
  var now = Date.now() / 1000;
  return lines.some(function(l) {
    var p = l.split(" ");
    return p[0] === id && now - (+p[1]) < 30 * 60;
  });
}
function memAvailableMb() {
  var m = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync("/proc/meminfo", "utf8"));
  return m ? Math.round(m[1] / 1024) : 0;
}

function checkApps() {
  foregroundApp(function(fg) {
    if (fg === null) return;
    luna("luna://com.webos.applicationManager/running", {}, 5000, function(err, out) {
      var data = parseJson(out);
      if (!data || !data.running) return;
      var running = data.running.map(function(a) { return a.id; });
      Object.keys(seenApps).forEach(function(id) { if (running.indexOf(id) === -1) delete seenApps[id]; });
      if (fg) seenApps[fg] = true;
      UNWANTED_PRELOADS.forEach(function(id) {
        if (running.indexOf(id) !== -1 && !seenApps[id]) {
          luna("luna://com.webos.applicationManager/closeByAppId", { id: id }, 5000);
          log("stängde förladdad app: " + id);
        }
      });
      var s = readSettings(), quick = s.snabbstart instanceof Array ? s.snabbstart : DEFAULT_QUICKSTART;
      if (powerState !== "Active" || uptime() < 120) return;
      quick.forEach(function(id) {
        if (running.indexOf(id) !== -1 || Date.now() - (lastPreload[id] || 0) < 10 * 60 * 1000) return;
        if (closedByUser(id)) return;
        if (memAvailableMb() < 150) return;
        lastPreload[id] = Date.now();
        luna("luna://com.webos.applicationManager/launch", { id: id, preload: "full" }, 10000, function(e, o) {
          var r = parseJson(o);
          if (r && r.returnValue) log("förladdade " + id + " (snabbstart)");
        });
      });
    });
  });
}

// Applistan på hemskärmen (BACK två gånger) läser korande.js, så att den visas direkt.
// Den skrivs om varje gång en app startar eller stängs.
var RUNNING_JS = path.join(HOME_DIR, "korande.js");
function processKb(pid) {
  try { return +(/VmRSS:\s+(\d+)/.exec(fs.readFileSync("/proc/" + pid + "/status", "utf8"))[1]); } catch (e) { return 0; }
}
function writeRunning() {
  luna("luna://com.webos.applicationManager/running", {}, 5000, function(err, out) {
    var data = parseJson(out);
    if (!data || !data.running) return;
    var apps = data.running.map(function(a) {
      return { id: a.id, kb: processKb(a.processid) || processKb(a.webprocessid) };
    });
    try {
      writeAtomic(RUNNING_JS, "window.TV_KORANDE = " +
        JSON.stringify({ tid: Date.now(), appar: apps, ledigtMb: memAvailableMb() }) + ";\n");
    } catch (e) {}
  });
}

// Listan över körande appar ändras: skriv applistan direkt, och kolla förladdningarna några
// sekunder senare, när det står klart vilken app som syns.
var checkTimer = null, runningTimer = null;
function appsChanged() {
  clearTimeout(runningTimer);
  runningTimer = setTimeout(writeRunning, 1000);
  clearTimeout(checkTimer);
  checkTimer = setTimeout(checkApps, 6000);
}
// Prenumerera på en luna-tjänst och kör onChange när något ändras (startar om om anslutningen tappas).
function subscribe(uri, onChange) {
  var p = childProcess.spawn("luna-send", ["-i", "-n", "0", uri, '{"subscribe":true}']);
  p.stdout.on("data", onChange);
  p.on("error", function() {});
  p.on("exit", function() {
    var i = extraProcs.indexOf(p);
    if (i !== -1) extraProcs.splice(i, 1);
    setTimeout(function() { subscribe(uri, onChange); }, 5000);
  });
  extraProcs.push(p);
}
function runningWatcher() {
  subscribe("luna://com.webos.applicationManager/running", appsChanged);
}

// ---- ingångarna ----
// Vilka HDMI-ingångar som har något anslutet, så att hemskärmen kan dölja tomma ingångar.
var INPUTS_JS = path.join(HOME_DIR, "ingangar.js");
function writeInputs() {
  luna("luna://com.webos.service.eim/getAllInputStatus", {}, 5000, function(err, out) {
    var data = parseJson(out);
    if (!data || !data.devices) return;
    var list = [];
    data.devices.forEach(function(d) {
      var m = /^HDMI_(\d+)$/.exec(d.id || "");
      if (m) list.push({ id: "com.webos.app.hdmi" + m[1], namn: d.label || "HDMI " + m[1], ansluten: d.connected === true });
    });
    try { writeAtomic(INPUTS_JS, "window.TV_INGANGAR = " + JSON.stringify(list) + ";\n"); } catch (e) {}
  });
}
var inputsTimer = null;
function inputsWatcher() {
  writeInputs();
  subscribe("luna://com.webos.service.eim/getAllInputStatus", function() {
    clearTimeout(inputsTimer);
    inputsTimer = setTimeout(writeInputs, 1000);
  });
}

function setupLg() {
  patchLgHome(function() {});
  blockAdServers();
  stopLgJobs();
  runningWatcher();
  writeRunning();
  setTimeout(function() { stopLgJobs(); checkApps(); }, 60000);
  setTimeout(function() { stopLgJobs(); checkApps(); }, 3 * 60 * 1000);
  setInterval(function() { stopLgJobs(); checkApps(); }, 10 * 60 * 1000);
  setInterval(writeRunning, 2 * 60 * 1000);
}

// ---- app-listan ----

// Hemskärmen får ladda skript men inte bilder utanför appens egen mapp, så bilderna
// skrivs som data-URL:er i skriptfiler (ikoner.js, bakgrund.js) bredvid tvapps.js.
var ICONS_JS = path.join(HOME_DIR, "ikoner.js");
var BG_JPG = path.join(HOME_DIR, "bakgrund.jpg");
var BG_JS = path.join(HOME_DIR, "bakgrund.js");

function dataUrl(file) {
  var ext = path.extname(file).toLowerCase();
  var type = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/" + ext.slice(1);
  return "data:" + type + ";base64," + fs.readFileSync(file).toString("base64");
}

// Samma val som LG:s hemrad (com.webos.app.home, AppTile.qml), så att ikonerna ser likadana ut.
function iconData(a) {
  var p = a.mediumLargeIcon || a.largeIcon || a.icon;
  if (!p || p.indexOf("://") !== -1) return null;
  if (p.charAt(0) !== "/") p = path.join(a.folderPath || "", p);
  try { return dataUrl(p); } catch (e) { return null; }
}

var bgStamp = null;
function refreshBackground() {
  var st = null;
  try { st = fs.statSync(BG_JPG); } catch (e) {}
  var stamp = st ? st.size + ":" + st.mtime.getTime() : "";
  if (stamp === bgStamp) return;
  bgStamp = stamp;
  if (st) {
    try {
      writeAtomic(BG_JS, "window.TV_BAKGRUND = " + JSON.stringify(dataUrl(BG_JPG)) + ";\n");
      log("bakgrundsbilden inläst");
    } catch (e) {
      log("kunde inte läsa bakgrundsbilden: " + e.message);
    }
  } else {
    try { fs.unlinkSync(BG_JS); } catch (e) {}
  }
}

function refreshApps(cb) {
  luna("luna://com.webos.applicationManager/listApps", {}, 15000, function(err, out) {
    var data = parseJson(out);
    var apps = [], icons = {};
    if (data && data.apps) {
      data.apps.forEach(function(a) {
        if (a.visible === false) return;
        var o = {};
        ["id", "title", "icon", "largeIcon", "folderPath", "iconColor", "version"].forEach(function(k) { if (a[k]) o[k] = a[k]; });
        var ikon = iconData(a);
        if (ikon) icons[a.id] = ikon;
        apps.push(o);
      });
    }
    if (apps.length) {
      writeAtomic(ICONS_JS, "window.TV_IKONER = " + JSON.stringify(icons) + ";\n");
      writeAtomic(APPS_JS, "window.TV_APPS = " + JSON.stringify(apps) + ";\n");
    }
    if (cb) cb(apps.length);
  });
}

// ---- väder (Open-Meteo, inget konto eller nyckel) ----

function readConf(file) {
  var out = {};
  try {
    fs.readFileSync(file, "utf8").split("\n").forEach(function(line) {
      var m = /^\s*([A-Z]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) out[m[1]] = m[2];
    });
  } catch (e) {}
  return out;
}

function refreshWeather(cb) {
  var plats = readConf(PLATS);
  var lat = plats.LAT || "59.33", lon = plats.LON || "18.07", ort = plats.ORT || "Stockholm";
  var url = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(lat) +
    "&longitude=" + encodeURIComponent(lon) + "&current=temperature_2m,weather_code,is_day&timezone=auto";
  run("curl", ["-fsS", "-m", "20", url], 25000, function(err, out) {
    var data = parseJson(out);
    var cur = data && data.current;
    if (!cur || typeof cur.temperature_2m !== "number") {
      log("kunde inte hämta vädret" + (err ? ": " + err.message : ""));
      if (cb) cb(false);
      return;
    }
    var w = { ort: ort, temp: cur.temperature_2m, kod: cur.weather_code, dag: cur.is_day === 1, tid: Date.now() };
    writeAtomic(WEATHER_JS, "window.TV_WEATHER = " + JSON.stringify(w) + ";\n");
    if (cb) cb(true, w);
  });
}

// ---- fjärrkontrollen ----

function readCodes() {
  var codes = [];
  var c = readConf(CONF).CODE;
  if (c) c.split(",").forEach(function(s) { var n = parseInt(s, 10); if (!isNaN(n)) codes.push(n); });
  return codes.length ? codes : DEFAULT_CODES;
}

// Läser knapptryck från alla indataenheter utan att låsa dem, så TV:n fungerar som vanligt.
// Nya enheter (t.ex. en Magic Remote som återansluter efter standby) plockas upp löpande.
// Varje enhet läses av en egen cat-process. fs.read på en indataenhet håller en tråd i
// libuv:s trådpool (bara 4 trådar i node 0.12, UV_THREADPOOL_SIZE går inte att höja inifrån)
// och fryser hela node vid nästa spawn så länge en sådan läsning väntar.
var keyProcs = {};

function watchKeys(onKey) {
  function watch(file, p) {
    var rest = new Buffer(0);
    p.stdout.on("data", function(chunk) {
      var buf = Buffer.concat([rest, chunk]);
      var off = 0;
      for (; off + EVENT_SIZE <= buf.length; off += EVENT_SIZE) {
        var type = buf.readUInt16LE(off + TYPE_OFFSET);
        var code = buf.readUInt16LE(off + TYPE_OFFSET + 2);
        var value = buf.readInt32LE(off + TYPE_OFFSET + 4);
        if (type === 1 && value === 1) onKey(file, code);
      }
      rest = buf.slice(off);
    });
    p.on("error", function() {});
    p.on("exit", function() { if (keyProcs[file] === p) delete keyProcs[file]; });
  }

  function scan() {
    var names = [];
    try { names = fs.readdirSync(INPUT_DIR); } catch (e) {}
    names.forEach(function(name) {
      if (!/^event\d+$/.test(name)) return;
      var file = path.join(INPUT_DIR, name);
      if (keyProcs[file]) return;
      // Många eventN saknar enhet bakom sig; starta bara cat för de som går att öppna.
      try { fs.closeSync(fs.openSync(file, "r")); } catch (e) { return; }
      var p = keyProcs[file] = childProcess.spawn("cat", [file], { stdio: ["ignore", "pipe", "ignore"] });
      watch(file, p);
    });
  }

  scan();
  return setInterval(scan, 3000);
}

function homekeyWatcher() {
  log("bevakar Home-knappen, kod(er): " + readCodes().join(","));
  watchKeys(function(file, code) {
    if (readCodes().indexOf(code) === -1) return;
    clearTimeout(startTimer); // HOME direkt efter påslag: låt inte ett väntande ingångsbyte ta över
    if (!lgHomePatched) return launchHome("Home-knappen");
    // Den ändrade LG-hemraden startar Hemskärm själv; kliv bara in om ingen app syns. Det händer ibland
    // när Hemskärm redan var framme: LG:s rad döljs men fokus kommer inte tillbaka. Ta då bara fram
    // Hemskärm igen (utan att stänga den), så att inga knapptryck försvinner medan sidan laddar om.
    setTimeout(function() {
      foregroundApp(function(fg) {
        if (fg !== "" && fg !== "com.webos.app.home") return;
        log("tar fram hemskärmen (Home-knappen, reserv)");
        luna("luna://com.webos.applicationManager/launch", { id: APP_ID, params: { hem: true } }, 5000);
      });
    }, 1800);
  });
}

// ---- påslag ----

function uptime() {
  try { return parseFloat(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]); } catch (e) { return 9999; }
}

var powerProc = null, extraProcs = [];

function powerWatcher() {
  var prev = null;
  var p = powerProc = childProcess.spawn("luna-send",
    ["-i", "-n", "0", "luna://com.webos.service.tvpower/power/getPowerState", '{"subscribe":true}']);
  var pending = "";
  p.stdout.on("data", function(chunk) {
    pending += chunk.toString();
    var re = /"state"\s*:\s*"([^"]+)"/g, m, last = 0;
    while ((m = re.exec(pending))) {
      last = re.lastIndex;
      var state = m[1];
      if (state !== prev) log("strömläge: " + state);
      if (state === "Active" && prev === null && uptime() < 240) {
        // Kallstart: webOS är klart ungefär 35 s efter strömpåslaget; startar vi före det hamnar vi
        // under live-TV. Homebrew Channel startar oss först runt 40 s, så oftast blir det 2 s.
        var wait = Math.max(2, 35 - uptime());
        setTimeout(function() { refreshApps(); showStartScreen("uppstart"); }, wait * 1000);
      } else if (state === "Active" && prev !== null && NOT_OFF_STATES.indexOf(prev) === -1) {
        refreshApps();
        showStartScreen("TV:n slogs på");
      }
      prev = powerState = state;
    }
    pending = pending.slice(last);
  });
  p.on("error", function() {});
  p.on("exit", function() {
    // Tjänsten tappade anslutningen, t.ex. under uppstart - försök igen.
    setTimeout(powerWatcher, 3000);
  });
}

// ---- kommandon ----

// Stäng cat-processerna och luna-send innan node avslutas, så att de inte blir kvar på TV:n.
function hardExit() {
  Object.keys(keyProcs).forEach(function(file) { keyProcs[file].kill(); });
  extraProcs.forEach(function(p) { p.kill(); });
  if (powerProc) powerProc.kill();
  process.exit(0);
}
process.on("SIGTERM", hardExit);
process.on("SIGINT", hardExit);

function learn() {
  var seconds = 20;
  console.log("Tryck på Home-knappen på fjärrkontrollen 3 gånger nu (inga andra knappar).");
  console.log("Väntar i " + seconds + " sekunder...");
  var counts = {};
  watchKeys(function(file, code) {
    counts[code] = (counts[code] || 0) + 1;
    console.log("  tryck: knappkod " + code + " (" + file + ")");
  });
  setTimeout(function() {
    var best = null;
    // Vid lika många tryck vinner LG:s vanliga Home-kod, ifall någon annan knapp råkade tryckas.
    Object.keys(counts).forEach(function(c) {
      if (best === null || counts[c] > counts[best] ||
          (counts[c] === counts[best] && DEFAULT_CODES.indexOf(+c) !== -1)) best = c;
    });
    if (best === null) {
      console.log("Inga knapptryck upptäcktes. Standardkoden " + DEFAULT_CODES.join(",") + " används.");
      hardExit();
    }
    if (counts[best] < 2) {
      console.log("För få tryck på samma knapp - kör om och tryck Home 3 gånger.");
      hardExit();
    }
    writeAtomic(CONF, "CODE=" + best + "\n");
    console.log("Klart! Home-knappen har kod " + best + " (sparat i " + CONF + ").");
    hardExit();
  }, seconds * 1000);
}

// ---- inställningar från hemskärmens meny ----

// Hemskärmen anropar "hem spara <base64>" via Homebrew Channels exec, så allt som kommer in
// kontrolleras och bara kända fält med rimliga värden sparas.
function cleanText(s, max) {
  return typeof s === "string" ? s.replace(/[\u0000-\u001f<>]/g, "").slice(0, max) : "";
}

function cleanSettings(s) {
  var out = {};
  if (s.appar instanceof Array) {
    out.appar = s.appar.filter(function(id) {
      return typeof id === "string" && /^[\w.\-]{1,100}$/.test(id);
    }).slice(0, 30);
  }
  if (s.ingangar instanceof Array) {
    out.ingangar = s.ingangar.filter(function(i) {
      return i && typeof i.id === "string" && /^com\.webos\.app\.[\w.]{1,40}$/.test(i.id);
    }).slice(0, 8).map(function(i) {
      return { id: i.id, namn: cleanText(i.namn, 30) || i.id, dold: i.dold === true };
    });
  }
  if (typeof s.bakgrund === "string" && /^[a-z0-9\-]{1,20}$/.test(s.bakgrund)) out.bakgrund = s.bakgrund;
  if (typeof s.doljTomma === "boolean") out.doljTomma = s.doljTomma;
  if (typeof s.vaxlaBakgrund === "boolean") out.vaxlaBakgrund = s.vaxlaBakgrund;
  if (typeof s.startIngang === "string" && INPUT_ID.test(s.startIngang)) out.startIngang = s.startIngang;
  if (s.snabbstart instanceof Array) {
    out.snabbstart = s.snabbstart.filter(function(id) {
      return typeof id === "string" && /^[\w.\-]{1,100}$/.test(id);
    }).slice(0, 2);
  }
  if (s.ort && typeof s.ort.lat === "number" && typeof s.ort.lon === "number" &&
      Math.abs(s.ort.lat) <= 90 && Math.abs(s.ort.lon) <= 180) {
    out.ort = { namn: cleanText(s.ort.namn, 40) || "Okänd ort", lat: s.ort.lat, lon: s.ort.lon };
  }
  return out;
}

function saveSettings(b64) {
  var s;
  try { s = cleanSettings(JSON.parse(new Buffer(b64 || "", "base64").toString("utf8"))); } catch (e) {
    console.log("FEL: kunde inte läsa inställningarna");
    process.exit(1);
  }
  var ort = s.ort;
  delete s.ort;
  writeAtomic(SETTINGS_JS, "window.TV_INSTALLNINGAR = " + JSON.stringify(s) + ";\n");
  if (!ort) {
    console.log("OK");
    process.exit(0);
  }
  writeAtomic(PLATS, "LAT=" + ort.lat + "\nLON=" + ort.lon + "\nORT=" + ort.namn + "\n");
  refreshWeather(function(ok) {
    console.log(ok ? "OK" : "OK, men vädret kunde inte hämtas");
    process.exit(0);
  });
}

// ---- bakgrund från mobilen ----
// Menyn (Bakgrund → Ladda upp från mobilen) kör "hem uppladdning" via Homebrew Channels exec. Det startar
// en egen liten webbserver i bakgrunden med en slumpad, hemlig adress som visas som QR-kod på TV:n.
// Servern tar emot en enda JPEG (beskuren på mobilen), sparar den som bakgrund.jpg och slutar sedan,
// eller efter 10 minuter. Hemskärmen följer förloppet i uppladdning.js.
var UPLOAD_PORT = 8899;
var UPLOAD_JS = path.join(HOME_DIR, "uppladdning.js");
var UPLOAD_PID = "/tmp/hemskarm-uppladdning.pid";

function stopUploadServer() {
  try { process.kill(+fs.readFileSync(UPLOAD_PID, "utf8"), "SIGTERM"); } catch (e) {}
  try { fs.unlinkSync(UPLOAD_PID); } catch (e) {}
}
function tvAddress() {
  var nets = require("os").networkInterfaces(), ip = null;
  Object.keys(nets).forEach(function(name) {
    nets[name].forEach(function(a) { if (!ip && a.family === "IPv4" && !a.internal) ip = a.address; });
  });
  return ip;
}
function startUpload() {
  stopUploadServer();
  var ip = tvAddress();
  if (!ip) { console.log(JSON.stringify({ fel: "TV:n har ingen nätverksadress" })); process.exit(1); }
  var token = require("crypto").randomBytes(6).toString("hex");
  childProcess.spawn(process.execPath, [__filename, "uppladdningsserver", token],
    { detached: true, stdio: ["ignore", "ignore", "ignore"] }).unref();
  console.log(JSON.stringify({ url: "http://" + ip + ":" + UPLOAD_PORT + "/" + token }));
  process.exit(0);
}
function uploadServer(token) {
  var http = require("http"), base = "/" + token;
  function status(s) { try { writeAtomic(UPLOAD_JS, "window.TV_UPPLADDNING = " + JSON.stringify({ status: s, tid: Date.now() }) + ";\n"); } catch (e) {} }
  function quit() { try { fs.unlinkSync(UPLOAD_PID); } catch (e) {} process.exit(0); }
  fs.writeFileSync(UPLOAD_PID, String(process.pid));
  process.on("SIGTERM", quit);
  var server = http.createServer(function(req, res) {
    if (req.method === "GET" && (req.url === base || req.url === base + "/")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(__dirname, "uppladdning.html")));
    }
    if (req.method !== "POST" || req.url !== base + "/bild") { res.writeHead(404); return res.end(); }
    var chunks = [], size = 0, tooBig = false;
    status("tar emot");
    req.on("data", function(c) {
      size += c.length;
      if (size > 15 * 1024 * 1024) { tooBig = true; req.destroy(); } else chunks.push(c);
    });
    req.on("end", function() {
      var img = Buffer.concat(chunks);
      if (tooBig || img.length < 1000 || img[0] !== 0xff || img[1] !== 0xd8) {
        status("fel");
        res.writeHead(400);
        return res.end("Bilden måste vara en JPEG under 15 MB");
      }
      writeAtomic(BG_JPG, img);
      writeAtomic(BG_JS, "window.TV_BAKGRUND = " + JSON.stringify(dataUrl(BG_JPG)) + ";\n");
      status("klar");
      res.end("OK");
      setTimeout(quit, 3000);
    });
  });
  server.on("error", function() { status("fel"); quit(); });
  server.listen(UPLOAD_PORT, function() { status("vantar"); });
  setTimeout(function() { status("stangd"); quit(); }, 10 * 60 * 1000);
}

// En uppdatering via Homebrew Channel byter ut den här filen. Starta då om tjänsten
// med den nya versionen, så att ingen behöver köra setup.sh igen.
function watchSelf() {
  var started;
  try { started = fs.statSync(__filename).mtime.getTime(); } catch (e) { return; }
  setInterval(function() {
    var now;
    try { now = fs.statSync(__filename).mtime.getTime(); } catch (e) { return; } // mitt i en installation
    if (now === started) return;
    log("ny version av tjänsten installerad - startar om");
    var out = fs.openSync("/tmp/customhome.log", "a");
    childProcess.spawn(process.execPath, [__filename, "run"], { detached: true, stdio: ["ignore", out, out] }).unref();
    hardExit();
  }, 60000);
}

function main() {
  var cmd = process.argv[2] || "run";
  if (cmd === "learn") {
    learn();
  } else if (cmd === "apps") {
    refreshApps(function(n) {
      console.log(n ? "Läste in " + n + " appar till " + APPS_JS : "Kunde inte läsa app-listan från TV:n");
      process.exit(n ? 0 : 1);
    });
  } else if (cmd === "weather") {
    refreshWeather(function(ok, w) {
      console.log(ok ? "Väder för " + w.ort + ": " + w.temp + "°" : "Kunde inte hämta vädret");
      process.exit(ok ? 0 : 1);
    });
  } else if (cmd === "uppladdning") {
    if (process.argv[3] === "stopp") { stopUploadServer(); console.log("OK"); process.exit(0); }
    startUpload();
  } else if (cmd === "uppladdningsserver") {
    uploadServer(process.argv[3]);
  } else if (cmd === "spara") {
    saveSettings(process.argv[3]);
  } else if (cmd === "run") {
    log("startar (node " + process.version + ")");
    homekeyWatcher();
    powerWatcher();
    refreshApps();
    refreshWeather();
    refreshBackground();
    inputsWatcher();
    if (!process.env.CUSTOMHOME_DIR) setupLg();
    setInterval(refreshWeather, 30 * 60 * 1000);
    setInterval(refreshBackground, 15000);
    watchSelf();
  } else {
    console.log("Användning: node customhome.js run|learn|apps|weather|spara|uppladdning");
    process.exit(2);
  }
}

main();
