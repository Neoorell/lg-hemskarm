// Bakgrundstjänst för den egna hemskärmen. Skriven för TV:ns egen node (0.12 på webOS 4),
// så bara gammal JavaScript: var, function, inga pilar eller mallsträngar.
//
//   node customhome.js run     bevakar Home-knappen och påslag, hämtar väder (körs från init.d)
//   node customhome.js learn   tryck Home några gånger för att lära in fjärrkontrollens knappkod
//   node customhome.js apps    läser in TV:ns app-lista till tvapps.js
//   node customhome.js weather hämtar vädret till weather.js
//
// Knapp- och påslagsbevakningen bygger på watchers från github.com/NaveenDA/lg-webos-custom-home (MIT).

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");

var APP_ID = "se.minhemskarm.launcher";
var HOME_DIR = process.env.CUSTOMHOME_DIR || "/media/developer/custom_home";
var CONF = path.join(HOME_DIR, "homekey.conf");
var PLATS = path.join(HOME_DIR, "plats.conf");
var APPS_JS = path.join(HOME_DIR, "tvapps.js");
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
    luna("luna://com.webos.applicationManager/launch", { id: APP_ID }, 5000);
  });
}

// ---- app-listan ----

function refreshApps(cb) {
  luna("luna://com.webos.applicationManager/listApps", {}, 15000, function(err, out) {
    var data = parseJson(out);
    var apps = [];
    if (data && data.apps) {
      data.apps.forEach(function(a) {
        if (a.visible === false) return;
        var o = {};
        ["id", "title", "icon", "largeIcon", "folderPath"].forEach(function(k) { if (a[k]) o[k] = a[k]; });
        apps.push(o);
      });
    }
    if (apps.length) writeAtomic(APPS_JS, "window.TV_APPS = " + JSON.stringify(apps) + ";\n");
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
  return setInterval(scan, 10000);
}

function homekeyWatcher() {
  log("bevakar Home-knappen, kod(er): " + readCodes().join(","));
  watchKeys(function(file, code) {
    if (readCodes().indexOf(code) !== -1) launchHome("Home-knappen");
  });
}

// ---- påslag ----

function uptime() {
  try { return parseFloat(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]); } catch (e) { return 9999; }
}

var powerProc = null;

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
        // Kallstart: vänta tills webOS själv startat färdigt, annars hamnar vi under live-TV.
        setTimeout(function() { refreshApps(); launchHome("uppstart"); }, 8000);
      } else if (state === "Active" && prev !== null && NOT_OFF_STATES.indexOf(prev) === -1) {
        refreshApps();
        launchHome("TV:n slogs på");
      }
      prev = state;
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
  } else if (cmd === "run") {
    log("startar (node " + process.version + ")");
    homekeyWatcher();
    powerWatcher();
    refreshApps();
    refreshWeather();
    setInterval(refreshWeather, 30 * 60 * 1000);
    watchSelf();
  } else {
    console.log("Användning: node customhome.js run|learn|apps|weather");
    process.exit(2);
  }
}

main();
