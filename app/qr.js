// Liten QR-kodare för adressen till uppladdningssidan (bakgrund från mobilen).
// Bara det som behövs: byte-läge, version 3 (29×29 rutor), felrättning M, högst 42 tecken.
// Följer QR-standarden (ISO/IEC 18004). Bara gammal JavaScript (Chromium 53).
//   var m = qrMatrix("http://…");  // m[rad][kolumn] = true för mörk ruta, eller null om texten är för lång
var qrMatrix = (function() {
  var VERSION = 3, SIZE = 29, DATA = 44, EC = 26; // version 3-M: ett block, 44 data- och 26 felrättningsord

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  // Reed-Solomon: generatorpolynom av grad EC och resten efter division.
  function rsDivisor(degree) {
    var res = [], root = 1, i, j;
    for (i = 0; i < degree - 1; i++) res.push(0);
    res.push(1);
    for (i = 0; i < degree; i++) {
      for (j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 2);
    }
    return res;
  }
  function rsRemainder(data, divisor) {
    var res = divisor.map(function() { return 0; });
    data.forEach(function(b) {
      var factor = b ^ res.shift();
      res.push(0);
      divisor.forEach(function(c, i) { res[i] ^= gfMul(c, factor); });
    });
    return res;
  }

  function codewords(text) {
    var bytes = unescape(encodeURIComponent(text)), bits = [], i;
    if (bytes.length > DATA - 2) return null;
    function put(val, len) { for (var k = len - 1; k >= 0; k--) bits.push((val >>> k) & 1); }
    put(4, 4);               // byte-läge
    put(bytes.length, 8);    // antal tecken
    for (i = 0; i < bytes.length; i++) put(bytes.charCodeAt(i), 8);
    put(0, Math.min(4, DATA * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
      data.push(b);
    }
    for (var pad = 0xec; data.length < DATA; pad ^= 0xec ^ 0x11) data.push(pad);
    return data.concat(rsRemainder(data, rsDivisor(EC)));
  }

  function build(words, mask) {
    var m = [], fn = [], x, y, i;
    for (y = 0; y < SIZE; y++) { m.push([]); fn.push([]); for (x = 0; x < SIZE; x++) { m[y].push(false); fn[y].push(false); } }
    function set(x, y, dark) { m[y][x] = dark; fn[y][x] = true; }

    // sökmönster med vit kant i tre hörn
    [[3, 3], [SIZE - 4, 3], [3, SIZE - 4]].forEach(function(c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = c[0] + dx, yy = c[1] + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (xx >= 0 && xx < SIZE && yy >= 0 && yy < SIZE) set(xx, yy, d !== 2 && d !== 4);
      }
    });
    // tidsmönster
    for (i = 8; i < SIZE - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    // justeringsmönster (version 3: mitt i 22,22)
    for (y = -2; y <= 2; y++) for (x = -2; x <= 2; x++) set(22 + x, 22 + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    // reservera formatinformationen (skrivs nedan) och den alltid mörka rutan
    format(set, 0);

    // dataorden i sicksack nerifrån och upp, två kolumner i taget
    var bit = 0;
    for (var right = SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var v = 0; v < SIZE; v++) for (var j = 0; j < 2; j++) {
        x = right - j;
        y = ((right + 1) & 2) === 0 ? SIZE - 1 - v : v;
        if (!fn[y][x] && bit < words.length * 8) {
          m[y][x] = ((words[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
          bit++;
        }
      }
    }
    // mask på allt utom mönstren
    for (y = 0; y < SIZE; y++) for (x = 0; x < SIZE; x++) if (!fn[y][x] && maskBit(mask, x, y)) m[y][x] = !m[y][x];
    format(set, mask);
    return m;
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return x * y % 2 + x * y % 3 === 0;
      case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
      default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
    }
  }

  // 15 bitar formatinformation: felrättning M (00) och mask, BCH-kod, XOR 0x5412. Två kopior.
  function format(set, mask) {
    var data = mask, rem = data, i;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    function b(n) { return ((bits >>> n) & 1) === 1; }
    for (i = 0; i <= 5; i++) set(8, i, b(i));
    set(8, 7, b(6));
    set(8, 8, b(7));
    set(7, 8, b(8));
    for (i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (i = 0; i < 8; i++) set(SIZE - 1 - i, 8, b(i));
    for (i = 8; i < 15; i++) set(8, SIZE - 15 + i, b(i));
    set(8, SIZE - 8, true);
  }

  // Straffpoäng enligt standarden; masken med lägst poäng blir lättast att läsa.
  function penalty(m) {
    var p = 0, x, y, dark = 0;
    function runs(get) {
      for (var a = 0; a < SIZE; a++) {
        var len = 1, line = "";
        for (var b = 0; b < SIZE; b++) {
          line += get(a, b) ? "1" : "0";
          if (b > 0) {
            if (get(a, b) === get(a, b - 1)) { len++; if (len === 5) p += 3; else if (len > 5) p++; }
            else len = 1;
          }
        }
        var re = /1011101/g, hit;
        while ((hit = re.exec(line))) {
          var before = line.slice(Math.max(0, hit.index - 4), hit.index), after = line.slice(hit.index + 7, hit.index + 11);
          if (/^0000$/.test(before) || /^0000$/.test(after)) p += 40;
          re.lastIndex = hit.index + 1;
        }
      }
    }
    runs(function(a, b) { return m[a][b]; });
    runs(function(a, b) { return m[b][a]; });
    for (y = 0; y < SIZE - 1; y++) for (x = 0; x < SIZE - 1; x++) {
      var c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
    for (y = 0; y < SIZE; y++) for (x = 0; x < SIZE; x++) if (m[y][x]) dark++;
    p += Math.floor(Math.abs(dark * 100 / (SIZE * SIZE) - 50) / 5) * 10;
    return p;
  }

  return function(text) {
    var words = codewords(text);
    if (!words) return null;
    var best = null, bestP = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var m = build(words, mask), p = penalty(m);
      if (p < bestP) { best = m; bestP = p; }
    }
    return best;
  };
})();

if (typeof module === "object") module.exports = qrMatrix;
