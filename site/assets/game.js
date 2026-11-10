/* Pandemicradar — original top-down field action RPG. No external assets. */
(function () {
  "use strict";

  var TILE = 16;
  var VW = 256;
  var VH = 176;
  var SAVE_KEY = "pandemicradar.rpg.v1";
  var SOUND_KEY = "pandemicradar.rpg.sound";

  var world = globalThis.PRWorld;
  var art = globalThis.PRArt;
  var canvas = document.getElementById("view");
  var ctx = canvas.getContext("2d", { alpha: false });
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var THEME = {
    town: { grass: ["#6f776c", "#626960", "#7c8476"], dirt: ["#6f776c", "#626960", "#7c8476"], brick: "#8b9186", brick2: "#6d7468", mortar: "#4a5148", path: "#c6a36a", pathDark: "#8d6840", wood: "#a36b42" },
    woods: { grass: ["#1f5a32", "#184828", "#2a7040"], dirt: ["#5c4a34", "#4a3c2a", "#6e5a40"], brick: "#3e4a38", brick2: "#2c3628", mortar: "#1a2418", path: "#c6a36a", pathDark: "#8d6840", wood: "#8d8680" },
    mill: { grass: ["#6a543c", "#5a4632", "#7a6248"], dirt: ["#6a543c", "#5a4632", "#7a6248"], brick: "#6a5040", brick2: "#4e3c30", mortar: "#2a2018", path: "#c6a36a", pathDark: "#8d6840", wood: "#b07848" },
    road: { grass: ["#246338", "#1c4e2c", "#2e7844"], dirt: ["#6a543c", "#5a4632", "#7a6248"], brick: "#4a5644", brick2: "#364232", mortar: "#1e281c", path: "#c6a36a", pathDark: "#8d6840", wood: "#a36b42" },
    city: { grass: ["#5c656e", "#505860", "#6a737c"], dirt: ["#5c656e", "#505860", "#6a737c"], brick: "#6e7a88", brick2: "#556270", mortar: "#343c48", path: "#b08960", pathDark: "#7a5a38", wood: "#d4cfc2" },
    cordon: { grass: ["#4a4638", "#3c382c", "#5a5442"], dirt: ["#4a4638", "#3c382c", "#5a5442"], brick: "#5c5848", brick2: "#403c30", mortar: "#221e18", path: "#b08960", pathDark: "#7a5a38", wood: "#8a7048" },
    lab: { grass: ["#c5d0cc", "#b4c2be", "#d5e0dc"], dirt: ["#c5d0cc", "#b4c2be", "#d5e0dc"], brick: "#8aa0a4", brick2: "#6a8488", mortar: "#3a5054", path: "#b7c4c0", pathDark: "#8aa098", wood: "#d5e0dc" },
    haven: { grass: ["#3c8e4e", "#2e743c", "#4ea45e"], dirt: ["#6a543c", "#5a4632", "#7a6248"], brick: "#d9d4c6", brick2: "#b8b2a4", mortar: "#7a7468", path: "#ecd7a4", pathDark: "#c4a46c", wood: "#d9d4c6" }
  };

  var mode = "title";
  var notesReturn = "title";
  var state = null;
  var fade = null;
  var animTime = 0;
  var particles = [];
  var toasts = [];
  var keyHeld = {};
  var padHeld = {};
  var wantDash = false;
  var soundOn = true;
  var audioCtx = null;
  var gfx = {};
  var tileCache = {};
  var lastSync = "";

  function $(id) { return document.getElementById(id); }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function hash(x, y) {
    var n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
    n = (n ^ (n >>> 13)) >>> 0;
    return n;
  }

  function current() { return world.maps[state.mapId]; }

  function tileOrigin(tx, ty) {
    return { x: tx * TILE + 3, y: ty * TILE + 6 };
  }

  function npcBox(n) {
    return { x: n.tx * TILE + 3, y: n.ty * TILE + 6, w: 10, h: 8 };
  }

  function gateRect(g) {
    return { x: g.tx * TILE, y: g.ty * TILE, w: g.tw * TILE, h: g.th * TILE };
  }

  function exitRect(e) {
    return { x: e.tx * TILE, y: e.ty * TILE, w: e.tw * TILE, h: e.th * TILE };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function makeState() {
    return {
      mapId: world.START.map,
      player: { x: 0, y: 0, w: 10, h: 8, dir: "down", moving: false, anim: 0, dashT: 0, dashCd: 0, dashDir: "down", iframes: 0, vx: 0, vy: 0 },
      hp: 100,
      inf: 0,
      time: 0,
      mask: false,
      tonics: 0,
      rations: 0,
      rust: false,
      cord: false,
      seal: false,
      opened: {},
      picked: {},
      talked: {},
      seen: {},
      spores: null,
      won: false,
      talk: null,
      exitLock: 0,
      hintT: 0,
      shake: 0,
      exposed: "",
      overMsg: "",
      enemies: []
    };
  }

  function initSpores() {
    var spores = {};
    Object.keys(world.maps).forEach(function (id) {
      var map = world.maps[id];
      if (!map.spore) return;
      var field = {
        acc: 0,
        max: map.spore.max,
        interval: map.spore.interval,
        cells: map.spore.seeds.map(function (s) { return [s[0], s[1]]; }),
        idx: {}
      };
      indexSpores(field);
      spores[id] = field;
    });
    return spores;
  }

  function indexSpores(field) {
    field.idx = {};
    field.cells.forEach(function (c) { field.idx[c[0] + "," + c[1]] = 1; });
  }

  function placeAtStart() {
    var s = world.START;
    var p = tileOrigin(s.tx, s.ty);
    state.mapId = s.map;
    state.player.x = p.x;
    state.player.y = p.y;
    state.spores = initSpores();
    spawnEnemies();
  }

  function spawnEnemies() {
    var map = current();
    state.enemies = (map.enemies || []).map(function (def) {
      var p = tileOrigin(def.tx, def.ty);
      return {
        id: def.id,
        x: p.x - 1,
        y: p.y,
        w: 12,
        h: 8,
        dir: "down",
        mode: "patrol",
        timer: 0,
        wp: 0,
        moving: false,
        vx: 0,
        vy: 0,
        route: def.route.map(function (pt) {
          return { x: pt[0] * TILE + 8, y: pt[1] * TILE + 10 };
        })
      };
    });
  }

  function paint(rows, palette) {
    var h = rows.length;
    var w = rows[0].length;
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var g = c.getContext("2d");
    for (var y = 0; y < h; y++) {
      if (rows[y].length !== w) throw new Error("sprite row " + y);
      for (var x = 0; x < w; x++) {
        var ch = rows[y][x];
        if (ch === ".") continue;
        var col = palette[ch];
        if (!col) throw new Error("no color for '" + ch + "'");
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function mirror(src) {
    var c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    var g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.translate(c.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  function makeTree(variant) {
    var c = document.createElement("canvas");
    c.width = 16;
    c.height = 20;
    var g = c.getContext("2d");
    var greens = ["#1b5c30", "#2f8a44", "#143f22", "#8fd06a"];
    var cx = 8;
    var cy = 7;
    var rad = 6 + (variant % 2);
    for (var y = 0; y < 15; y++) {
      for (var x = 0; x < 16; x++) {
        var dx = x - cx;
        var dy = y - cy;
        if (dx * dx + dy * dy * 1.15 < rad * rad) {
          var shade = (x * 3 + y + variant) % 7 === 0 ? greens[3] : ((x + y) % 3 === 0 ? greens[1] : greens[(x + variant) % 2]);
          g.fillStyle = shade;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    g.fillStyle = "#5a3a22";
    g.fillRect(7, 12, 3, 8);
    g.fillStyle = "#3a2416";
    g.fillRect(7, 12, 1, 8);
    return c;
  }

  function makeSpore(frame) {
    var c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    var g = c.getContext("2d");
    var spots = [[2, 3], [6, 8], [4, 12], [11, 5], [12, 11], [8, 2], [9, 13]];
    for (var i = 0; i < spots.length; i++) {
      if ((i + frame) % 4 === 0) continue;
      g.fillStyle = i % 2 ? "#b06adf" : "#6c2f90";
      g.fillRect(spots[i][0], spots[i][1], 2, 2);
      g.fillStyle = "#f3e2ff";
      g.fillRect(spots[i][0], spots[i][1], 1, 1);
    }
    return c;
  }

  function makeHaze() {
    var c = document.createElement("canvas");
    c.width = 32;
    c.height = 20;
    var g = c.getContext("2d");
    for (var y = 0; y < 20; y++) {
      for (var x = 0; x < 32; x++) {
        var dx = (x - 16) / 15;
        var dy = (y - 10) / 9;
        var d = dx * dx + dy * dy;
        if (d > 1) continue;
        g.fillStyle = d < 0.35 ? "rgba(255, 236, 170, 0.95)" : "rgba(226, 170, 60, 0.8)";
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function blankTile() {
    var c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    return c;
  }

  function paintTile(themeName, kind, variant, frame) {
    var c = blankTile();
    var g = c.getContext("2d");
    var t = THEME[themeName] || THEME.town;
    function rect(x, y, w, h, color) {
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    }
    if (kind === "grass" || kind === "flower") {
      rect(0, 0, 16, 16, t.grass[variant % 3]);
      rect((variant * 3) % 14, (variant * 5) % 12, 1, 2, "#14381c");
      rect((variant * 7 + 4) % 14, (variant * 2 + 6) % 12, 1, 2, "#8fd06a");
      if (kind === "flower") {
        rect(4, 8, 2, 2, "#e07a9a");
        rect(10, 5, 2, 2, "#f0b429");
        rect(7, 12, 1, 1, "#f7f4ee");
      }
    } else if (kind === "cobble") {
      rect(0, 0, 16, 16, t.mortar);
      for (var y = 0; y < 16; y += 5) {
        var off = ((y / 5) | 0) % 2 ? 3 : 0;
        for (var x = -4; x < 16; x += 6) {
          rect(x + off, y, 5, 4, t.grass[(x + y + variant) & 1 ? 0 : 1]);
        }
      }
    } else if (kind === "dirt") {
      rect(0, 0, 16, 16, t.dirt[variant % 3]);
      rect((variant * 4) % 12, (variant * 3) % 12, 2, 1, "#3a2c20");
      rect((variant * 5 + 6) % 13, (variant + 8) % 13, 1, 1, "#c6a36a");
    } else if (kind === "path") {
      rect(0, 0, 16, 16, t.path);
      rect(0, 0, 16, 1, t.pathDark);
      rect((variant * 5) % 12, 4 + (variant % 3) * 3, 2, 1, t.pathDark);
      rect((variant * 3 + 7) % 13, 8, 1, 1, "#efe0b8");
    } else if (kind === "wood") {
      rect(0, 0, 16, 16, "#a36b42");
      rect(0, 0, 16, 1, "#6e4528");
      rect(0, 4, 16, 1, "#6e4528");
      rect(0, 8, 16, 1, "#6e4528");
      rect(0, 12, 16, 1, "#6e4528");
      rect(2 + variant, 1, 1, 3, "#c48454");
      rect(10, 9, 1, 3, "#c48454");
    } else if (kind === "stone") {
      rect(0, 0, 16, 16, "#8a8680");
      rect(0, 0, 16, 1, "#5e5a56");
      rect(0, 8, 16, 1, "#5e5a56");
      rect(variant % 8, 3, 3, 1, "#b8b2aa");
    } else if (kind === "plaster") {
      rect(0, 0, 16, 16, "#d9d3c6");
      rect(0, 15, 16, 1, "#b2ab9e");
      rect(4 + variant, 6, 2, 1, "#c4beb0");
    } else if (kind === "tile") {
      rect(0, 0, 16, 16, "#d7e2de");
      rect(0, 0, 16, 1, "#a8bab6");
      rect(0, 8, 16, 1, "#a8bab6");
      rect(0, 0, 1, 16, "#a8bab6");
      rect(8, 0, 1, 16, "#a8bab6");
    } else if (kind === "wall") {
      rect(0, 0, 16, 16, t.mortar);
      for (var wy = 0; wy < 16; wy += 5) {
        var woff = ((wy / 5) | 0) % 2 ? 4 : 0;
        for (var wx = -8; wx < 16; wx += 8) {
          rect(wx + woff, wy + 1, 7, 3, ((wx + wy + variant) & 2) ? t.brick : t.brick2);
        }
      }
    } else if (kind === "water") {
      rect(0, 0, 16, 16, frame % 2 ? "#164e72" : "#1a587f");
      rect((frame * 3) % 16, 3, 6, 1, "#3d92c0");
      rect((frame * 5 + 4) % 16, 8, 5, 1, "#8fd0ea");
      rect((frame * 3 + 8) % 16, 12, 6, 1, "#3d92c0");
    } else if (kind === "fence") {
      rect(1, 2, 2, 12, "#6b4a2c");
      rect(13, 2, 2, 12, "#6b4a2c");
      rect(1, 5, 14, 2, "#c4924e");
      rect(1, 9, 14, 2, "#a56b3c");
    } else if (kind === "crate") {
      rect(2, 3, 12, 11, "#8a5a32");
      rect(3, 4, 10, 2, "#c48454");
      rect(2, 8, 12, 1, "#5a3a22");
      rect(7, 3, 1, 11, "#5a3a22");
      rect(2, 3, 12, 1, "#14181c");
      rect(2, 13, 12, 1, "#14181c");
    } else if (kind === "bench") {
      rect(0, 5, 16, 7, "#8a9098");
      rect(0, 5, 16, 2, "#d8dce2");
      rect(0, 5, 16, 1, "#14181c");
      rect(0, 11, 16, 1, "#14181c");
    } else if (kind === "barricade") {
      for (var by = 0; by < 16; by++) {
        for (var bx = 0; bx < 16; bx++) {
          rect(bx, by, 1, 1, (((bx + by) / 4) | 0) % 2 ? "#e2c14a" : "#14181c");
        }
      }
    } else if (kind === "lamp") {
      rect(7, 6, 2, 10, "#3a342c");
      rect(5, 3, 6, 4, "#14181c");
      rect(6, 4, 4, 2, frame % 2 ? "#fff1c4" : "#f0b429");
    } else if (kind === "door") {
      rect(0, 0, 16, 16, "#3a2418");
      rect(1, 1, 14, 14, "#c4924e");
      rect(1, 1, 14, 2, "#e2b56a");
      rect(7, 6, 2, 3, "#f0b429");
      rect(0, 0, 16, 1, "#14181c");
      rect(0, 15, 16, 1, "#14181c");
    } else if (kind === "block") {
      rect(0, 0, 16, 16, "#d5d0c4");
      rect(0, 0, 16, 2, "#f4f0e6");
      rect(0, 14, 16, 2, "#8e887c");
      rect(0, 0, 2, 16, "#f4f0e6");
      rect(14, 0, 2, 16, "#8e887c");
    }
    return c;
  }

  function getTile(theme, kind, variant, frame) {
    var key = theme + "|" + kind + "|" + variant + "|" + (frame || 0);
    if (!tileCache[key]) tileCache[key] = paintTile(theme, kind, variant, frame || 0);
    return tileCache[key];
  }

  function buildGfx() {
    if (!art || !art.sprites) throw new Error("Sprite data did not load.");
    var pal = art.palettes.hero;
    gfx.hero = {
      down: [paint(art.sprites["hero-down-0"], pal), paint(art.sprites["hero-down-1"], pal)],
      up: [paint(art.sprites["hero-up-0"], pal), paint(art.sprites["hero-up-1"], pal)],
      right: [paint(art.sprites["hero-side-0"], pal), paint(art.sprites["hero-side-1"], pal)]
    };
    gfx.hero.left = [mirror(gfx.hero.right[0]), mirror(gfx.hero.right[1])];
    gfx.sign = paint(art.sprites.sign, art.palettes.sign);
    gfx.door = paint(art.sprites.door, art.palettes.door);
    gfx.items = {
      mask: paint(art.sprites.mask, art.palettes.mask),
      tonic: paint(art.sprites.tonic, art.palettes.tonic),
      ration: paint(art.sprites.ration, art.palettes.ration),
      rust: paint(art.sprites.key, { o: "#d2653a" }),
      cord: paint(art.sprites.key, { o: "#3ec8c0" }),
      seal: paint(art.sprites.seal, art.palettes.seal)
    };
    gfx.npc = {};
    Object.keys(art.npc).forEach(function (id) {
      if (id === "enemy") return;
      gfx.npc[id] = [
        paint(art.sprites["person-0"], art.npc[id]),
        paint(art.sprites["person-1"], art.npc[id])
      ];
    });
    var ep = art.npc.enemy;
    gfx.enemy = {
      down: [paint(art.sprites["enemy-down-0"], ep), paint(art.sprites["enemy-down-1"], ep)],
      up: [paint(art.sprites["enemy-up-0"], ep), paint(art.sprites["enemy-up-0"], ep)],
      right: [paint(art.sprites["enemy-side-0"], ep), paint(art.sprites["enemy-side-0"], ep)]
    };
    gfx.enemy.left = [mirror(gfx.enemy.right[0]), mirror(gfx.enemy.right[1])];
    gfx.trees = [makeTree(0), makeTree(1), makeTree(2)];
    gfx.spore = [makeSpore(0), makeSpore(1), makeSpore(2), makeSpore(3)];
    gfx.haze = makeHaze();
  }

  function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function unlockAudio() {
    if (!soundOn) return;
    try { ac(); } catch (e) { /* autoplay can wait */ }
  }

  function tone(freq, dur, type, vol, slide) {
    if (!soundOn) return;
    try {
      var actx = ac();
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, actx.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(1, slide), actx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.03, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g);
      g.connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur + 0.02);
    } catch (e) { /* sound is optional */ }
  }

  function tonePickup() {
    tone(660, 0.07, "square", 0.03);
    setTimeout(function () { tone(880, 0.09, "square", 0.03); }, 70);
  }

  function fanfare() {
    [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.18, "square", 0.035); }, i * 140);
    });
  }

  function toast(msg) {
    toasts.push({ msg: msg, t: 2.15 });
  }

  function burst(x, y) {
    var colors = ["#f0b429", "#f4f1ea", "#2fbfa4", "#b06adf"];
    for (var i = 0; i < 8; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 46,
        vy: (Math.random() - 0.85) * 40,
        t: 0.45,
        c: colors[i % colors.length]
      });
    }
  }

  function markSeen(id, msg) {
    if (state.seen[id]) return;
    state.seen[id] = 1;
    toast(msg);
  }

  function checkpoint() {
    if (!state || state.hp <= 0 || state.inf >= 100) return false;
    var data = {
      v: 1,
      mapId: state.mapId,
      x: state.player.x,
      y: state.player.y,
      dir: state.player.dir,
      hp: state.hp,
      inf: state.inf,
      time: state.time,
      mask: state.mask,
      tonics: state.tonics,
      rations: state.rations,
      rust: state.rust,
      cord: state.cord,
      seal: state.seal,
      opened: state.opened,
      picked: state.picked,
      talked: state.talked,
      seen: state.seen,
      won: state.won,
      spores: {}
    };
    Object.keys(state.spores || {}).forEach(function (id) {
      var field = state.spores[id];
      data.spores[id] = { acc: field.acc, max: field.max, interval: field.interval, cells: field.cells };
    });
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function readSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.v !== 1 || !world.maps[data.mapId]) return null;
      if (typeof data.x !== "number" || typeof data.y !== "number") return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function applySave(data) {
    state = makeState();
    state.mapId = data.mapId;
    state.player.x = data.x;
    state.player.y = data.y;
    state.player.dir = data.dir || "down";
    state.hp = clamp(data.hp, 1, 100);
    state.inf = clamp(data.inf, 0, 99);
    state.time = data.time || 0;
    state.mask = !!data.mask;
    state.tonics = data.tonics | 0;
    state.rations = data.rations | 0;
    state.rust = !!data.rust;
    state.cord = !!data.cord;
    state.seal = !!data.seal;
    state.opened = data.opened || {};
    state.picked = data.picked || {};
    state.talked = data.talked || {};
    state.seen = data.seen || {};
    state.won = !!data.won;
    state.spores = initSpores();
    Object.keys(data.spores || {}).forEach(function (id) {
      if (!state.spores[id] || !data.spores[id].cells) return;
      state.spores[id].cells = data.spores[id].cells.map(function (c) { return [c[0], c[1]]; });
      state.spores[id].acc = data.spores[id].acc || 0;
      indexSpores(state.spores[id]);
    });
    state.exitLock = 0.35;
    spawnEnemies();
  }

  function grant(kind, name) {
    if (kind === "mask") {
      if (!state.mask) { state.mask = true; toast("Cloth mask"); tonePickup(); }
    } else if (kind === "tonic") {
      state.tonics += 1;
      toast(name || "Field Tonic");
      tonePickup();
    } else if (kind === "ration") {
      state.rations += 1;
      toast(name || "Supplies");
      tonePickup();
    } else if (kind === "rust" || kind === "cord" || kind === "seal") {
      if (!state[kind]) {
        state[kind] = true;
        toast(name || kind);
        tonePickup();
      }
    }
    checkpoint();
  }

  function hits(body, map, withNpcs) {
    var x0 = Math.floor(body.x / TILE);
    var y0 = Math.floor(body.y / TILE);
    var x1 = Math.floor((body.x + body.w - 0.001) / TILE);
    var y1 = Math.floor((body.y + body.h - 0.001) / TILE);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (y < 0 || x < 0 || y >= map.h || x >= map.w) return true;
        if (world.SOLID[map.rows[y][x]]) return true;
      }
    }
    var gates = map.gates || [];
    for (var i = 0; i < gates.length; i++) {
      if (state.opened[gates[i].id]) continue;
      if (overlap(body, gateRect(gates[i]))) return true;
    }
    if (withNpcs) {
      for (var n = 0; n < map.npcs.length; n++) {
        if (overlap(body, npcBox(map.npcs[n]))) return true;
      }
    }
    return false;
  }

function tryMove(body, dx, dy, map, withNpcs) {
  if (!dx && !dy) return true;
  body.x += dx;
  body.y += dy;
  if (hits(body, map, withNpcs)) {
    body.x -= dx;
    body.y -= dy;
    return false;
  }
  return true;
}

function nudgeThrough(body, dx, dy, map, withNpcs) {
  var steps = [1, -1, 2, -2, 3, -3, 5, -5];
  for (var i = 0; i < steps.length; i++) {
    var sx = dx ? 0 : steps[i];
    var sy = dy ? 0 : steps[i];
    if (!tryMove(body, sx, sy, map, withNpcs)) continue;
    if (tryMove(body, dx, dy, map, withNpcs)) return;
    body.x -= sx;
    body.y -= sy;
  }
}

function slide(body, dx, dy, map, withNpcs) {
  if (dx && !tryMove(body, dx, 0, map, withNpcs)) nudgeThrough(body, dx, 0, map, withNpcs);
  if (dy && !tryMove(body, 0, dy, map, withNpcs)) nudgeThrough(body, 0, dy, map, withNpcs);
}

  function solidAt(map, x, y) {
    var tx = Math.floor(x / TILE);
    var ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
    if (world.SOLID[map.rows[ty][tx]]) return true;
    var gates = map.gates || [];
    for (var i = 0; i < gates.length; i++) {
      if (state.opened[gates[i].id]) continue;
      var r = gateRect(gates[i]);
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
    }
    return false;
  }

  function los(x0, y0, x1, y1, map) {
    var dist = Math.hypot(x1 - x0, y1 - y0);
    var steps = Math.ceil(dist / 7);
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      if (solidAt(map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  function dirFrom(vx, vy, prev) {
    if (Math.abs(vx) < 1 && Math.abs(vy) < 1) return prev;
    if (Math.abs(vy) > Math.abs(vx)) return vy < 0 ? "up" : "down";
    return vx < 0 ? "left" : "right";
  }

  function moveToward(body, cx, cy, speed, dt, map) {
    var bx = body.x + body.w / 2;
    var by = body.y + body.h / 2;
    var dx = cx - bx;
    var dy = cy - by;
    var dist = Math.hypot(dx, dy) || 1;
    var step = Math.min(speed * dt, dist);
    var mx = (dx / dist) * step;
    var my = (dy / dist) * step;
    slide(body, mx, my, map, false);
    body.vx = mx / dt;
    body.vy = my / dt;
  }

  function updatePlayer(dt, map) {
    var p = state.player;
    if (p.dashT > 0) p.dashT -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.iframes > 0) p.iframes -= dt;
    if (wantDash) {
      wantDash = false;
      if (p.dashCd <= 0 && p.dashT <= 0) {
        p.dashT = 0.16;
        p.dashCd = 0.72;
        p.dashDir = p.dir;
        p.iframes = Math.max(p.iframes, 0.16);
        tone(220, 0.07, "square", 0.025, 90);
      }
    }
    var mx = 0;
    var my = 0;
    if (down("up")) my -= 1;
    if (down("down")) my += 1;
    if (down("left")) mx -= 1;
    if (down("right")) mx += 1;
    var len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }
    var speed = 78;
    if (state.inf > 72) speed *= 0.84;
    var vx = mx * speed;
    var vy = my * speed;
    if (p.dashT > 0) {
      var d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dashDir];
      vx = d[0] * 176;
      vy = d[1] * 176;
      p.dir = p.dashDir;
    } else if (mx || my) {
      p.dir = dirFrom(vx, vy, p.dir);
    }
    p.moving = p.dashT > 0 || !!(mx || my);
    if (p.moving) p.anim += dt * 8;
    slide(p, vx * dt, vy * dt, map, true);
    p.vx = vx;
    p.vy = vy;
  }

  function updateEnemies(dt, map) {
    var p = state.player;
    var pcx = p.x + p.w / 2;
    var pcy = p.y + p.h / 2;
    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      var ecx = e.x + e.w / 2;
      var ecy = e.y + e.h / 2;
      var dist = Math.hypot(pcx - ecx, pcy - ecy);
      var see = dist < 96 && los(ecx, ecy, pcx, pcy, map);
      if (e.mode === "patrol") {
        var wp = e.route[e.wp];
        if (Math.hypot(wp.x - ecx, wp.y - ecy) < 8) e.wp = (e.wp + 1) % e.route.length;
        else moveToward(e, wp.x, wp.y, 32, dt, map);
        if (see) { e.mode = "burst"; e.timer = 1.02; }
      } else if (e.mode === "burst") {
        e.timer -= dt;
        moveToward(e, pcx, pcy, 104, dt, map);
        if (e.timer <= 0) { e.mode = "rest"; e.timer = 1.2; e.vx = 0; e.vy = 0; }
      } else {
        e.timer -= dt;
        e.vx = 0;
        e.vy = 0;
        if (e.timer <= 0) e.mode = "patrol";
      }
      e.moving = e.mode !== "rest";
      e.dir = dirFrom(e.vx, e.vy, e.dir);
      if (overlap(p, e) && p.iframes <= 0) {
        var kx = p.x - e.x;
        var ky = p.y - e.y;
        var kd = Math.hypot(kx, ky) || 1;
        slide(p, (kx / kd) * 12, (ky / kd) * 12, map, true);
        state.hp = Math.max(0, state.hp - 16);
        state.inf = Math.min(100, state.inf + 24);
        p.iframes = 0.85;
        state.shake = reduceMotion ? 0 : 0.18;
        tone(110, 0.16, "sawtooth", 0.04, 50);
        markSeen("rush", "Rushfever. They sprint, then they have to stop.");
        if (state.hp <= 0) {
          gameOver("You collapsed.");
          return;
        }
        if (state.inf >= 100) {
          gameOver("The infection meter filled.");
          return;
        }
      }
    }
  }

  function growSpore(field, map) {
    if (field.cells.length >= field.max || !field.cells.length) return;
    var allow = { ".": 1, ",": 1, "*": 1 };
    for (var n = 0; n < 12; n++) {
      var c = field.cells[(Math.random() * field.cells.length) | 0];
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      var d = dirs[(Math.random() * 4) | 0];
      var nx = c[0] + d[0];
      var ny = c[1] + d[1];
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      if (!allow[map.rows[ny][nx]]) continue;
      var key = nx + "," + ny;
      if (field.idx[key]) continue;
      field.cells.push([nx, ny]);
      field.idx[key] = 1;
      return;
    }
  }

  function updateSpores(dt) {
    var field = state.spores[state.mapId];
    var map = current();
    if (!field || !map.spore) return;
    field.acc += dt;
    while (field.acc >= field.interval && field.cells.length < field.max) {
      field.acc -= field.interval;
      growSpore(field, map);
    }
  }

  function hazeBox(h) {
    var span;
    var period;
    var u;
    var pos;
    if (h.axis === "x") {
      span = (h.maxTx - h.minTx) * TILE;
      period = Math.max(1, span * 2);
      u = ((state.time + h.phase) * h.speed) % period;
      if (u < 0) u += period;
      if (u > span) u = period - u;
      pos = h.minTx * TILE + u;
      return { x: pos, y: h.ty * TILE, w: h.tw * TILE, h: h.th * TILE };
    }
    span = (h.maxTy - h.minTy) * TILE;
    period = Math.max(1, span * 2);
    u = ((state.time + h.phase) * h.speed) % period;
    if (u < 0) u += period;
    if (u > span) u = period - u;
    pos = h.minTy * TILE + u;
    return { x: h.tx * TILE, y: pos, w: h.tw * TILE, h: h.th * TILE };
  }

  function updateExposure(dt, map) {
    var body = state.player;
    var rate = 0;
    var labels = [];
    var field = state.spores[map.id];
    if (field) {
      var x0 = Math.floor(body.x / TILE);
      var y0 = Math.floor(body.y / TILE);
      var x1 = Math.floor((body.x + body.w - 0.001) / TILE);
      var y1 = Math.floor((body.y + body.h - 0.001) / TILE);
      var on = false;
      for (var y = y0; y <= y1 && !on; y++) {
        for (var x = x0; x <= x1; x++) {
          if (field.idx[x + "," + y]) { on = true; break; }
        }
      }
      if (on) { rate += 12; labels.push("Sporeveil"); markSeen("spore", "Sporeveil is in the soil. Don't stand in it."); }
    }
    var hazes = map.hazes || [];
    for (var i = 0; i < hazes.length; i++) {
      if (overlap(body, hazeBox(hazes[i]))) {
        rate += 20;
        labels.push("Amberhaze");
        markSeen("haze", "Amberhaze. It keeps a route. You can outrun a route.");
        break;
      }
    }
    state.exposed = labels.join(" + ");
    if (rate > 0 && state.mask) rate *= 0.5;
    if (rate > 0) state.inf = Math.min(100, state.inf + rate * dt);
    else state.inf = Math.max(0, state.inf - (map.safe ? 14 : 5) * dt);
  }

  function checkItems(map) {
    var pcx = state.player.x + state.player.w / 2;
    var pcy = state.player.y + state.player.h / 2;
    for (var i = 0; i < map.items.length; i++) {
      var it = map.items[i];
      if (state.picked[it.id]) continue;
      var ix = it.tx * TILE + 8;
      var iy = it.ty * TILE + 10;
      if (Math.hypot(pcx - ix, pcy - iy) < 13) {
        state.picked[it.id] = true;
        burst(ix, iy);
        grant(it.kind, it.name);
      }
    }
  }

  function tryOpenGate(gate) {
    if (state.opened[gate.id]) return;
    if (!state[gate.need]) {
      if (state.hintT <= 0) {
        toast(gate.locked);
        state.hintT = 1.5;
      }
      return;
    }
    state.opened[gate.id] = true;
    toast(gate.open);
    tone(180, 0.08, "square", 0.03);
    setTimeout(function () { tone(360, 0.1, "square", 0.03); }, 80);
    checkpoint();
    if (gate.to) beginTravel(gate.to, gate.sx, gate.sy);
  }

  function touchGates(map) {
    var pad = { x: state.player.x - 2, y: state.player.y - 2, w: state.player.w + 4, h: state.player.h + 4 };
    var gates = map.gates || [];
    for (var i = 0; i < gates.length; i++) {
      if (state.opened[gates[i].id]) continue;
      if (overlap(pad, gateRect(gates[i]))) {
        tryOpenGate(gates[i]);
        return;
      }
    }
  }

  function beginTravel(id, tx, ty) {
    if (fade || !world.maps[id]) return;
    fade = { t: 0, mid: false, id: id, tx: tx, ty: ty };
  }

  function arrive(id, tx, ty) {
    state.mapId = id;
    var p = tileOrigin(tx, ty);
    state.player.x = p.x;
    state.player.y = p.y;
    state.player.vx = 0;
    state.player.vy = 0;
    state.exitLock = 0.45;
    state.talk = null;
    spawnEnemies();
    checkpoint();
  }

  function checkTransitions(map) {
    if (fade || state.exitLock > 0) return;
    var body = state.player;
    for (var i = 0; i < map.exits.length; i++) {
      if (overlap(body, exitRect(map.exits[i]))) {
        beginTravel(map.exits[i].to, map.exits[i].sx, map.exits[i].sy);
        return;
      }
    }
    var gates = map.gates || [];
    for (var g = 0; g < gates.length; g++) {
      if (!state.opened[gates[g].id] || !gates[g].to) continue;
      if (overlap(body, gateRect(gates[g]))) {
        beginTravel(gates[g].to, gates[g].sx, gates[g].sy);
        return;
      }
    }
  }

  function checkWin(map) {
    if (!map.win || state.won || fade) return;
    var pad = { x: map.win.tx * TILE, y: map.win.ty * TILE, w: map.win.tw * TILE, h: map.win.th * TILE };
    if (overlap(state.player, pad)) {
      state.won = true;
      checkpoint();
      mode = "win";
      fanfare();
    }
  }

  function gameOver(msg) {
    if (mode === "over" || mode === "win") return;
    mode = "over";
    state.overMsg = msg;
    tone(200, 0.25, "sawtooth", 0.04, 60);
    setTimeout(function () { tone(90, 0.35, "triangle", 0.04); }, 180);
  }

  function doAction() {
    if (fade || mode !== "play") return;
    if (state.talk) { advanceTalk(); return; }
    var map = current();
    var pcx = state.player.x + state.player.w / 2;
    var pcy = state.player.y + state.player.h / 2;
    var best = null;
    var bestD = 42;
    for (var i = 0; i < map.npcs.length; i++) {
      var b = npcBox(map.npcs[i]);
      var d = Math.hypot(pcx - (b.x + b.w / 2), pcy - (b.y + b.h / 2));
      if (d < bestD) { bestD = d; best = map.npcs[i]; }
    }
    if (best) { startTalk(best); return; }
    var gates = map.gates || [];
    for (var g = 0; g < gates.length; g++) {
      var r = gateRect(gates[g]);
      var cx = Math.max(r.x, Math.min(pcx, r.x + r.w));
      var cy = Math.max(r.y, Math.min(pcy, r.y + r.h));
      if (Math.hypot(pcx - cx, pcy - cy) < 24 && !state.opened[gates[g].id]) {
        tryOpenGate(gates[g]);
        return;
      }
    }
  }

  function startTalk(n) {
    var lines = state.talked[n.id] ? n.again : n.lines;
    state.talk = {
      id: n.id,
      name: n.name,
      lines: lines,
      i: 0,
      grant: state.talked[n.id] ? null : n.grant
    };
    var b = npcBox(n);
    var dx = (b.x + b.w / 2) - (state.player.x + 5);
    var dy = (b.y + b.h / 2) - (state.player.y + 4);
    state.player.dir = dirFrom(dx, dy, state.player.dir);
    tone(520, 0.05, "triangle", 0.03);
  }

  function advanceTalk() {
    if (!state.talk) return;
    state.talk.i += 1;
    tone(460, 0.04, "triangle", 0.025);
    if (state.talk.i >= state.talk.lines.length) {
      var kind = state.talk.grant;
      var id = state.talk.id;
      state.talk = null;
      state.talked[id] = true;
      if (kind) grant(kind);
      else checkpoint();
      blurFocus();
    }
  }

  function useTonic() {
    if (mode !== "play" || state.talk || fade) return;
    if (state.tonics <= 0) { toast("No Field Tonic."); return; }
    if (state.inf <= 0) { toast("No infection to clear."); return; }
    state.tonics -= 1;
    state.inf = Math.max(0, state.inf - 42);
    toast("The tonic burns the fever down.");
    tone(640, 0.12, "triangle", 0.035, 980);
    checkpoint();
  }

  function useRation() {
    if (mode !== "play" || state.talk || fade) return;
    if (state.rations <= 0) { toast("No supplies."); return; }
    if (state.hp >= 100) { toast("You are not hurt."); return; }
    state.rations -= 1;
    state.hp = Math.min(100, state.hp + 36);
    toast("Supplies. You can stand straighter.");
    tone(420, 0.1, "triangle", 0.03, 560);
    checkpoint();
  }

  function questText() {
    if (state.hp < 30) return "You can barely stand. Use supplies, I or the Supply button.";
    if (state.inf > 78) return "Infection is critical. Drink a Field Tonic or find clean ground.";
    if (!state.mask) return "Find Dr. Lumen in the west clinic.";
    if (!state.rust) return "Whisperwood, north of Ashfen, hides the Rust Key. Don't linger in Sporeveil.";
    if (!state.opened["mill-door"]) return "The Rust Key opens the Old Mill storeroom, west of Ashfen.";
    if (!state.cord) return "Glassport's north clinic holds the Cord Key. Rushfever rests between sprints.";
    if (!state.seal) return "The Field Lab, east of the cordon, holds the Haven Seal. Mind the Amberhaze.";
    if (!state.opened["haven-gate"]) return "Fit the Haven Seal to the south gate of the cordon.";
    if (!state.won) return "Step onto the pale stone in Safe Haven.";
    return "The haven air is clean.";
  }

  function fmt(t) {
    var s = Math.max(0, t | 0);
    var m = (s / 60) | 0;
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function down(name) { return !!(keyHeld[name] || padHeld[name]); }

function groundKind(theme, ch) {
  if (ch === "d") return "door";
  if (ch === ",") return "path";
  if (ch === "i") {
      if (theme === "lab") return "tile";
      if (theme === "woods") return "stone";
      if (theme === "city") return "plaster";
      return "wood";
    }
    if (theme === "town" || theme === "city") return "cobble";
    if (theme === "mill" || theme === "cordon") return "dirt";
    if (theme === "lab") return "tile";
    return "grass";
  }

  function propKind(ch) {
    if (ch === "#") return "wall";
    if (ch === "w") return "water";
    if (ch === "t") return "tree";
    if (ch === "f") return "fence";
    if (ch === "c") return "crate";
    if (ch === "b") return "bench";
    if (ch === "=") return "barricade";
    if (ch === "l") return "lamp";
    if (ch === "o") return "block";
    return null;
  }

function needsFloor(ch) {
  return ch === "t" || ch === "f" || ch === "c" || ch === "b" || ch === "l" || ch === "*" || ch === "." || ch === "," || ch === "i" || ch === "d";
}

  function render() {
    var map = current();
    var theme = map.theme;
    var px = state.player.x + state.player.w / 2;
    var py = state.player.y + state.player.h / 2;
    var camX = px - VW / 2;
    var camY = py - VH / 2;
    var mw = map.w * TILE;
    var mh = map.h * TILE;
    camX = mw > VW ? clamp(camX, 0, mw - VW) : (mw - VW) / 2;
    camY = mh > VH ? clamp(camY, 0, mh - VH) : (mh - VH) / 2;
    if (state.shake > 0 && !reduceMotion) {
      var mag = state.shake * 20;
      camX += (Math.random() - 0.5) * mag;
      camY += (Math.random() - 0.5) * mag;
    }
    camX = Math.round(camX);
    camY = Math.round(camY);
    var waterFrame = ((animTime * 3) | 0) % 4;
    var sporeFrame = ((animTime * 5) | 0) % 4;
    var lampFrame = ((animTime * 4) | 0) % 2;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#102018";
    ctx.fillRect(0, 0, VW, VH);
    var x0 = Math.max(0, Math.floor(camX / TILE) - 1);
    var y0 = Math.max(0, Math.floor(camY / TILE) - 1);
    var x1 = Math.min(map.w - 1, Math.floor((camX + VW) / TILE) + 1);
    var y1 = Math.min(map.h - 1, Math.floor((camY + VH) / TILE) + 1);
    var field = state.spores[map.id];
    var queue = [];
    for (var y = y0; y <= y1; y++) {
      var row = map.rows[y];
      for (var x = x0; x <= x1; x++) {
        var ch = row[x];
        var sx = x * TILE - camX;
        var sy = y * TILE - camY;
        if (needsFloor(ch)) {
          var gk = ch === "*" ? "flower" : groundKind(theme, ch);
          ctx.drawImage(getTile(theme, gk, hash(x, y) % 3, 0), sx, sy);
        }
        if (field && field.idx[x + "," + y]) ctx.drawImage(gfx.spore[sporeFrame], sx, sy);
        var pk = propKind(ch);
        if (!pk) continue;
        (function (px0, py0, kind, vx, vy) {
          queue.push({
            y: (vy + 1) * TILE,
            z: 0,
            draw: function () {
              if (kind === "tree") ctx.drawImage(gfx.trees[hash(vx, vy) % 3], px0, py0 - 4);
              else if (kind === "water") ctx.drawImage(getTile(theme, "water", 0, waterFrame), px0, py0);
              else if (kind === "lamp") ctx.drawImage(getTile(theme, "lamp", 0, lampFrame), px0, py0);
              else ctx.drawImage(getTile(theme, kind, hash(vx, vy) % 3, 0), px0, py0);
            }
          });
        })(sx, sy, pk, x, y);
      }
    }
    (map.gates || []).forEach(function (g) {
      if (state.opened[g.id]) return;
      for (var gy = 0; gy < g.th; gy++) {
        for (var gx = 0; gx < g.tw; gx++) {
          (function (dx, dy, odd) {
            queue.push({
              y: (g.ty + dy + 1) * TILE,
              z: 0,
              draw: function () {
                var img = gfx.door;
                if (odd) {
                  ctx.save();
                  ctx.translate((g.tx + dx) * TILE - camX + TILE, (g.ty + dy) * TILE - camY);
                  ctx.scale(-1, 1);
                  ctx.drawImage(img, 0, 0);
                  ctx.restore();
                } else {
                  ctx.drawImage(img, (g.tx + dx) * TILE - camX, (g.ty + dy) * TILE - camY);
                }
              }
            });
          })(gx, gy, gx % 2 === 1);
        }
      }
    });
    map.npcs.forEach(function (n) {
      var b = npcBox(n);
      queue.push({
        y: b.y + b.h,
        z: 1,
        draw: function () {
          var img = n.kind === "sign" ? gfx.sign : gfx.npc[n.id][reduceMotion ? 0 : ((animTime * 2) | 0) % 2];
          var dx = b.x - 3 - camX;
          var dy = b.y - 8 - camY;
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(b.x - camX, b.y + b.h - 2 - camY, b.w, 2);
          ctx.drawImage(img, dx, dy);
          if (!state.talked[n.id]) {
            ctx.fillStyle = "#f0b429";
            ctx.fillRect(dx + 7, dy - 4, 2, 2);
            ctx.fillRect(dx + 7, dy - 1, 2, 1);
          }
        }
      });
    });
    map.items.forEach(function (it) {
      if (state.picked[it.id]) return;
      var bob = reduceMotion ? 0 : (((Math.sin(animTime * 3 + it.tx) + 1) * 1.2) | 0);
      queue.push({
        y: it.ty * TILE + 16,
        z: 1,
        draw: function () {
          ctx.drawImage(gfx.items[it.kind] || gfx.items.ration, it.tx * TILE - camX, it.ty * TILE - 2 - bob - camY);
        }
      });
    });
    state.enemies.forEach(function (e) {
      queue.push({
        y: e.y + e.h,
        z: 1,
        draw: function () {
          var set = gfx.enemy[e.dir] || gfx.enemy.down;
          var frame = e.moving ? ((animTime * 8) | 0) % 2 : 0;
          var lean = e.mode === "burst" ? (e.dir === "left" ? -1 : e.dir === "right" ? 1 : 0) : 0;
          var leanY = e.mode === "burst" ? (e.dir === "up" ? -1 : e.dir === "down" ? 1 : 0) : 0;
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(e.x - camX, e.y + e.h - 2 - camY, e.w, 2);
          if (e.mode === "rest") ctx.globalAlpha = 0.78;
          ctx.drawImage(set[frame], e.x - 2 + lean - camX, e.y - 8 + leanY - camY);
          ctx.globalAlpha = 1;
        }
      });
    });
    var blink = state.player.iframes > 0 && (((animTime * 18) | 0) % 2 === 0);
    if (!blink) {
      queue.push({
        y: state.player.y + state.player.h,
        z: 2,
        draw: function () {
          var set = gfx.hero[state.player.dir] || gfx.hero.down;
          var frame = state.player.moving ? (state.player.anim | 0) % 2 : 0;
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(state.player.x - camX, state.player.y + state.player.h - 2 - camY, state.player.w, 2);
          ctx.drawImage(set[frame], state.player.x - 3 - camX, state.player.y - 8 - camY);
        }
      });
    }
    queue.sort(function (a, b) { return a.y - b.y || a.z - b.z; });
    for (var q = 0; q < queue.length; q++) queue[q].draw();
    var hazes = map.hazes || [];
    for (var h = 0; h < hazes.length; h++) {
      var box = hazeBox(hazes[h]);
      ctx.globalAlpha = 0.72;
      ctx.drawImage(gfx.haze, box.x - camX, box.y - camY, box.w, box.h);
      ctx.globalAlpha = 1;
    }
    for (var pi = 0; pi < particles.length; pi++) {
      var part = particles[pi];
      ctx.fillStyle = part.c;
      ctx.fillRect(Math.round(part.x - camX), Math.round(part.y - camY), 2, 2);
    }
    if (state.inf > 45) {
      var a = Math.min(0.5, (state.inf - 45) / 130);
      ctx.fillStyle = "rgba(110, 36, 160, " + a + ")";
      ctx.fillRect(0, 0, 12, VH);
      ctx.fillRect(VW - 12, 0, 12, VH);
      ctx.fillRect(0, 0, VW, 8);
      ctx.fillRect(0, VH - 8, VW, 8);
    }
    if (state.hp < 30) {
      ctx.fillStyle = "rgba(180, 32, 48, 0.28)";
      ctx.fillRect(0, 0, 6, VH);
      ctx.fillRect(VW - 6, 0, 6, VH);
    }
    if (fade) {
      var ft = fade.t < 0.5 ? fade.t * 2 : Math.max(0, (1 - fade.t) * 2);
      ctx.fillStyle = "rgba(6, 8, 7, " + ft + ")";
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  function sync() {
    var map = current();
    $("area").textContent = map.name;
    $("hp-n").textContent = String(Math.ceil(state.hp));
    $("inf-n").textContent = String(Math.ceil(state.inf));
    $("hp-bar").style.width = clamp(state.hp, 0, 100) + "%";
    $("inf-bar").style.width = clamp(state.inf, 0, 100) + "%";
    $("exposed").textContent = state.exposed || "";
    var hot = state.inf > 72;
    $("inf-bar").parentElement.parentElement.classList.toggle("hot", hot);
    $("tonic-n").textContent = String(state.tonics);
    $("ration-n").textContent = String(state.rations);
    $("use-tonic").disabled = state.tonics <= 0;
    $("use-ration").disabled = state.rations <= 0;
    var bits = [];
    if (state.mask) bits.push("Mask");
    if (state.rust) bits.push("Rust");
    if (state.cord) bits.push("Cord");
    if (state.seal) bits.push("Seal");
    $("keys").textContent = bits.length ? bits.join(" · ") : "No keys";
    $("dash-state").textContent = state.player.dashCd <= 0 ? "Dash ready" : "Dash";
    if (state.talk) {
      $("speaker").hidden = false;
      $("speaker").textContent = state.talk.name;
      $("line").textContent = state.talk.lines[state.talk.i] || "";
      $("next").hidden = false;
    } else {
      $("speaker").hidden = true;
      $("speaker").textContent = "";
      $("line").textContent = mode === "play" || mode === "pause" ? questText() : "Three fictional plagues. Reach Safe Haven before the meter fills.";
      $("next").hidden = true;
    }
    if (toasts.length) {
      $("toast").hidden = false;
      $("toast").textContent = toasts[0].msg;
    } else {
      $("toast").hidden = true;
    }
    $("title").hidden = mode !== "title";
    $("pause").hidden = mode !== "pause";
    $("notes").hidden = mode !== "notes";
    $("over").hidden = mode !== "over";
    $("win").hidden = mode !== "win";
    $("pause-time").textContent = "On the road " + fmt(state.time) + ".";
    $("win-time").textContent = "You took " + fmt(state.time) + ".";
    $("over-msg").textContent = state.overMsg || "";
    var saved = !!readSave();
    $("btn-continue").disabled = !saved;
    $("btn-load").hidden = !saved;
    var soundLabel = "Sound: " + (soundOn ? "on" : "off");
    $("btn-sound").textContent = soundLabel;
    $("btn-sound").setAttribute("aria-pressed", soundOn ? "true" : "false");
    $("btn-pause-sound").textContent = soundLabel;
    document.body.dataset.mode = mode;
    lastSync = mode;
  }

  function blurFocus() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function setMode(next) {
    mode = next;
    sync();
  }

  function newGame() {
    particles = [];
    toasts = [];
    fade = null;
    state = makeState();
    placeAtStart();
    state.exitLock = 0.2;
    checkpoint();
    setMode("play");
    blurFocus();
    toast("Ashfen. The clinic is the west building.");
  }

  function continueGame() {
    var data = readSave();
    if (!data) return;
    particles = [];
    fade = null;
    applySave(data);
    setMode("play");
    blurFocus();
    toast("Road restored.");
  }

  function toggleSound() {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (e) { /* ignore */ }
    if (soundOn) tone(660, 0.06, "square", 0.03);
    sync();
  }

  function openNotes(from) {
    notesReturn = from;
    setMode("notes");
  }

  function togglePause() {
    if (mode === "notes") { setMode(notesReturn); return; }
    if (mode === "pause") { setMode("play"); blurFocus(); return; }
    if (mode === "play") setMode("pause");
  }

  function onTap(name) {
    unlockAudio();
    if (name === "pause") { togglePause(); return; }
    if (name === "tonic") { useTonic(); return; }
    if (name === "ration") { useRation(); return; }
    if (name === "dash") { if (mode === "play" && state && !state.talk) wantDash = true; return; }
    if (name === "act") { doAction(); return; }
  }

  function bind() {
    document.addEventListener("keydown", function (e) {
      var act = mapKey(e.key);
      if (!act) return;
      var typing = e.target && e.target.closest && e.target.closest("button, input, textarea, a");
      if (typing && (e.key === " " || e.key === "Enter")) return;
      if (e.key === " " || e.key.indexOf("Arrow") === 0) e.preventDefault();
      if (e.repeat) return;
      keyHeld[act] = true;
      if (act === "act" || act === "dash" || act === "pause" || act === "tonic" || act === "ration") onTap(act);
    });
    document.addEventListener("keyup", function (e) {
      var act = mapKey(e.key);
      if (act) keyHeld[act] = false;
    });
    window.addEventListener("blur", function () { keyHeld = {}; });
    document.querySelectorAll("#touch button").forEach(function (btn) {
      btn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        unlockAudio();
        if (btn.dataset.hold) padHeld[btn.dataset.hold] = true;
        if (btn.dataset.tap) onTap(btn.dataset.tap);
      });
      function release() { if (btn.dataset.hold) padHeld[btn.dataset.hold] = false; }
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("lostpointercapture", release);
      btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
    $("btn-new").addEventListener("click", function () {
      unlockAudio();
      if (readSave()) $("confirm").hidden = false;
      else newGame();
    });
    $("btn-new-yes").addEventListener("click", function () { $("confirm").hidden = true; newGame(); });
    $("btn-new-no").addEventListener("click", function () { $("confirm").hidden = true; });
    $("btn-continue").addEventListener("click", continueGame);
    $("btn-notes").addEventListener("click", function () { openNotes("title"); });
    $("btn-sound").addEventListener("click", toggleSound);
    $("btn-resume").addEventListener("click", function () { setMode("play"); blurFocus(); });
    $("btn-save").addEventListener("click", function () {
      if (checkpoint()) toast("Saved.");
      else toast("This browser would not store the save.");
    });
    $("btn-pause-notes").addEventListener("click", function () { openNotes("pause"); });
    $("btn-pause-sound").addEventListener("click", toggleSound);
    $("btn-title").addEventListener("click", function () { setMode("title"); });
    $("btn-close-notes").addEventListener("click", function () { setMode(notesReturn); });
    $("btn-load").addEventListener("click", continueGame);
    $("btn-over-new").addEventListener("click", newGame);
    $("btn-over-title").addEventListener("click", function () { setMode("title"); });
    $("btn-win-walk").addEventListener("click", function () { setMode("play"); blurFocus(); });
    $("btn-win-title").addEventListener("click", function () { setMode("title"); });
    $("btn-win-new").addEventListener("click", newGame);
    $("next").addEventListener("click", function () { unlockAudio(); doAction(); });
    $("use-tonic").addEventListener("click", function () { unlockAudio(); useTonic(); });
    $("use-ration").addEventListener("click", function () { unlockAudio(); useRation(); });
    if (navigator.maxTouchPoints > 0) document.body.classList.add("touch");
  }

  function mapKey(key) {
    var table = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", a: "left", s: "down", d: "right",
      W: "up", A: "left", S: "down", D: "right",
      e: "act", E: "act", " ": "act", Enter: "act",
      Shift: "dash", k: "dash", K: "dash",
      p: "pause", P: "pause", Escape: "pause",
      u: "tonic", U: "tonic",
      i: "ration", I: "ration"
    };
    return table[key] || null;
  }

  function updateToasts(dt) {
    if (!toasts.length) return;
    toasts[0].t -= dt;
    if (toasts[0].t <= 0) toasts.shift();
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 30 * dt;
      if (p.t <= 0) particles.splice(i, 1);
    }
  }

  function loop(now) {
    var dt = Math.min(0.05, (now - loop.last) / 1000 || 0);
    loop.last = now;
    if (document.hidden) dt = 0;
    animTime += dt;
    updateToasts(dt);
    if (mode === "play") updateParticles(dt);
    if (state.shake > 0) state.shake -= dt;
    if (fade) {
      fade.t += dt / (reduceMotion ? 0.12 : 0.34);
      if (!fade.mid && fade.t >= 0.5) {
        fade.mid = true;
        arrive(fade.id, fade.tx, fade.ty);
      }
      if (fade.t >= 1) fade = null;
    } else if (mode === "play" && !state.talk && dt > 0) {
      state.time += dt;
      if (state.exitLock > 0) state.exitLock -= dt;
      if (state.hintT > 0) state.hintT -= dt;
      var map = current();
      updatePlayer(dt, map);
      if (mode === "play") updateEnemies(dt, map);
      if (mode === "play") {
        updateSpores(dt);
        checkItems(map);
        if (!fade) touchGates(map);
        if (!fade && mode === "play") checkTransitions(map);
        if (mode === "play") updateExposure(dt, map);
        if (mode === "play" && state.hp <= 0) gameOver("You collapsed.");
        else if (mode === "play" && state.inf >= 100) gameOver("The infection meter filled.");
        if (mode === "play") checkWin(map);
      }
    }
    render();
    sync();
    requestAnimationFrame(loop);
  }
  loop.last = 0;

  function boot() {
    if (!world || !world.maps) throw new Error("Map data did not load.");
    try {
      soundOn = localStorage.getItem(SOUND_KEY) !== "off";
    } catch (e) { soundOn = true; }
    bind();
    buildGfx();
    state = makeState();
    placeAtStart();
    setMode("title");
    globalThis.__rpg = {
      snap: function () {
        return {
          mode: mode,
          map: state.mapId,
          x: Math.round(state.player.x),
          y: Math.round(state.player.y),
          tx: Math.floor((state.player.x + 5) / TILE),
          ty: Math.floor((state.player.y + 4) / TILE),
          hp: state.hp,
          inf: state.inf,
          mask: state.mask,
          tonics: state.tonics,
          rations: state.rations,
          rust: state.rust,
          cord: state.cord,
          seal: state.seal,
          opened: Object.assign({}, state.opened),
          picked: Object.assign({}, state.picked),
          talked: Object.assign({}, state.talked),
          won: state.won,
          talk: state.talk ? state.talk.name + ":" + state.talk.i : "",
          quest: questText(),
          exposed: state.exposed,
          enemies: state.enemies.map(function (e) { return { id: e.id, x: Math.round(e.x), y: Math.round(e.y), mode: e.mode }; }),
          spores: state.spores[state.mapId] ? state.spores[state.mapId].cells.length : 0,
          player: { x: state.player.x, y: state.player.y, w: state.player.w, h: state.player.h },
          hazes: (current().hazes || []).map(hazeBox)
        };
      },
      goto: function (id, tx, ty) {
        fade = null;
        arrive(id, tx, ty);
        setMode("play");
      },
      give: function (kind) { grant(kind, kind); },
      setMeters: function (hp, inf) { state.hp = hp; state.inf = inf; },
      act: function () { doAction(); },
      newGame: newGame
    };
    requestAnimationFrame(loop);
  }

  window.addEventListener("error", function (e) {
    var el = $("boot-error");
    if (!el) return;
    el.hidden = false;
    el.textContent = (e && e.message) || "The game failed to start.";
  });

  try {
    boot();
  } catch (err) {
    var el = $("boot-error");
    if (el) {
      el.hidden = false;
      el.textContent = err && err.message ? err.message : "The game failed to start.";
    }
    throw err;
  }
})();
