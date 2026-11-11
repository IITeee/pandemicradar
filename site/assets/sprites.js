/* Original pixel art for Pandemicradar. Cached canvases, drawn once. */
(function (root) {
  "use strict";

  var OUT = "#1a1422";
  var cache = {};
  var tiles = {};
  var skies = {};

  function canvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function paint(rows, palette) {
    var h = rows.length;
    var w = rows[0].length;
    var c = canvas(w, h);
    var g = c.getContext("2d");
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ch = rows[y][x];
        if (!ch || ch === ".") continue;
        var col = palette[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function mirror(src) {
    var c = canvas(src.width, src.height);
    var g = c.getContext("2d");
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  /* 22 x 30 chibi, facing right. Letters: o outline, k skin, K shade, h hair, H hair shade,
     c coat, C coat shade, r scarf, p pants, b boot, e eye, y pupil, w blush, n nose */
  var HERO = {
    idle: [
      "......................",
      "......oooooooooo......",
      ".....ohhhhhhhhhho.....",
      ".....ohHHHHHHHHho.....",
      "....ohhhhhhhhhhhho....",
      "...oohhhhhhhhhhhhoo...",
      "...okkkkkkkkkkkkkko...",
      "...okkkkkkkkkkkkkko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkoyoyko...",
      "...ookkkknkkkkkkkoo...",
      "....okkkkkkkkkkkkko...",
      ".....ooooooooooooo....",
      "......orrrrrrrrrro....",
      ".....occccccccccco....",
      "....oocccccccccccco...",
      "....occccccccccccco...",
      "....occcCCCCCccccco...",
      "....occcCCCCCccccco...",
      "....occccccccccccco...",
      ".....occcccccccco.....",
      ".....oppppppppppo.....",
      ".....oppppppppppo.....",
      ".....oppo....oppo.....",
      ".....oppo....oppo.....",
      ".....obbo....obbo.....",
      ".....obbo....obbo.....",
      ".....oooo....oooo.....",
      "......................"
    ],
    walk1: [
      "......................",
      "......oooooooooo......",
      ".....ohhhhhhhhhho.....",
      ".....ohHHHHHHHHho.....",
      "....ohhhhhhhhhhhho....",
      "...oohhhhhhhhhhhhoo...",
      "...okkkkkkkkkkkkkko...",
      "...okkkkkkkkkkkkkko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkoyoyko...",
      "...ookkkknkkkkkkkoo...",
      "....okkkkkkkkkkkkko...",
      ".....ooooooooooooo....",
      "......orrrrrrrrrro....",
      ".....occccccccccco....",
      "....oocccccccccccco...",
      "....occccccccccccco...",
      "....occcCCCCCccccco...",
      "....occcCCCCCccccco...",
      "....occccccccccccco...",
      ".....occcccccccco.....",
      "....oppp..........pp..",
      "....oppp..........pp..",
      "...oppo..........ppo..",
      "...obbo..........bbo..",
      "...obbo..........bbo..",
      "...oooo..........ooo..",
      "......................",
      "......................"
    ],
    walk2: [
      "......................",
      "......oooooooooo......",
      ".....ohhhhhhhhhho.....",
      ".....ohHHHHHHHHho.....",
      "....ohhhhhhhhhhhho....",
      "...oohhhhhhhhhhhhoo...",
      "...okkkkkkkkkkkkkko...",
      "...okkkkkkkkkkkkkko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkoyoyko...",
      "...ookkkknkkkkkkkoo...",
      "....okkkkkkkkkkkkko...",
      ".....ooooooooooooo....",
      "......orrrrrrrrrro....",
      ".....occccccccccco....",
      "....oocccccccccccco...",
      "....occccccccccccco...",
      "....occcCCCCCccccco...",
      "....occcCCCCCccccco...",
      "....occccccccccccco...",
      ".....occcccccccco.....",
      "..pp..........pppo....",
      "..pp..........pppo....",
      "..opp..........oppo...",
      "..obb..........obbo...",
      "..obb..........obbo...",
      "..ooo..........oooo...",
      "......................",
      "......................"
    ],
    jump: [
      "......................",
      "......oooooooooo......",
      ".....ohhhhhhhhhho.....",
      ".....ohHHHHHHHHho.....",
      "....ohhhhhhhhhhhho....",
      "...oohhhhhhhhhhhhoo...",
      "...okkkkkkkkkkkkkko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkoyoyko...",
      "...ookkkknkkkkkkkoo...",
      "....okkkkkkkkkkkkko...",
      ".....ooooooooooooo....",
      "......orrrrrrrrrro....",
      ".....occccccccccco....",
      "....oocccccccccccco...",
      "....occcCCCCCccccco...",
      "....occccccccccccco...",
      ".....occcccccccco.....",
      "....opp........pppo...",
      "....opp........pppo...",
      "...obbo........obbo...",
      "...oooo........oooo...",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................"
    ],
    climb: [
      "..........oo..........",
      ".........oooo.........",
      ".......oohhhhho.......",
      "......ohHHHHHHHo......",
      ".....ohhhhhhhhhho.....",
      "....ookkkkkkkkkkko....",
      "...ookkwkkkkkekeko....",
      "...okkwkkkkkkekeko....",
      "...okkwkkkkkkoyoyo....",
      "...ookkkknnkkkkkko....",
      "....ookkkkkkkkkko.....",
      ".....oorrrrrrrroo.....",
      "....oocccccccccco.....",
      "...oocccCCCCCcccco....",
      "..ooccocCCCCCcoccco...",
      "..oocccccccccccccco...",
      "...oocccccccccccco....",
      "....oopppppppppoo.....",
      "....oopppppppppoo.....",
      "...oooppppppppooo.....",
      "...oobbooooobbooo.....",
      "...oooo.....oooo......",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................"
    ],
    attack: [
      "......................",
      "......oooooooooo......",
      ".....ohhhhhhhhhho.....",
      ".....ohHHHHHHHHho.....",
      "....ohhhhhhhhhhhho....",
      "...oohhhhhhhhhhhhoo...",
      "...okkkkkkkkkkkkkko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkekekko...",
      "...okkwkkkkkkoyoyko...",
      "...ookkkknkkkkkkkoo...",
      "....okkkkkkkkkkkkko...",
      ".....ooooooooooooo....",
      "......orrrrrrrrrro....",
      ".....occcccccccccccooo",
      "....ooccccccccccccccco",
      "....occcCCCCCcccccccro",
      "....occcccccccccccrro.",
      "....occccccccccccco...",
      ".....occcccccccco.....",
      ".....oppppppppppo.....",
      ".....oppo....oppo.....",
      ".....obbo....obbo.....",
      ".....oooo....oooo.....",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................"
    ]
  };

  var SPORE = {
    idle: [
      "......oooooo......",
      "....ooppppppoo....",
      "...opPPPPPPPPpo...",
      "..opPPwwPPPPPpo...",
      "..opPPwwPPeePpo...",
      "..opPPPPPPPPPpo...",
      "...oppppppppppo...",
      "....ooppppppoo....",
      "......ooyyoo......",
      ".....oooooooo.....",
      "....oo......oo....",
      "................"
    ],
    hop: [
      "................",
      "......oooooo......",
      "....ooppppppoo....",
      "...opPPPPPPPPpo...",
      "..opPPwwPPPPPpo...",
      "..opPPwwPPeePpo...",
      "..opPPPPPPPPPpo...",
      "...oppppppppppo...",
      "....ooppppppoo....",
      "......oooooo......",
      ".....oo....oo.....",
      "................"
    ]
  };

  var MITE = {
    idle: [
      "......oooo......",
      "....oogggggo....",
      "...ogGGGGGGGo...",
      "..ogGGwwGGGGo...",
      "..ogGGGGGeGGo...",
      "...ogGGGGGGGo...",
      "....oogggggo....",
      "......oooo......",
      "................",
      "................",
      "................",
      "................"
    ],
    bob: [
      "................",
      "......oooo......",
      "....oogggggo....",
      "...ogGGGGGGGo...",
      "..ogGGwwGGGGo...",
      "..ogGGGGGeGGo...",
      "...ogGGGGGGGo...",
      "....oogggggo....",
      "......oooo......",
      ".....o....o.....",
      "................",
      "................"
    ]
  };

  function fixRows(name, rows, w) {
    return rows.map(function (row, i) {
      if (row.length === w) return row;
      if (row.length < w) return row + "................".slice(0, w - row.length);
      return row.slice(0, w);
    });
  }

  function heroPalette(hair, coat) {
    return {
      ".": null,
      o: OUT,
      k: "#f6c9ad",
      n: "#e09878",
      h: hair,
      H: shade(hair, 28),
      c: coat,
      C: shade(coat, -28),
      r: "#f0b429",
      p: "#2a3550",
      b: "#3a2822",
      e: "#f7f4ee",
      y: "#1a1422",
      w: "#e08988"
    };
  }

  function shade(hex, delta) {
    var n = parseInt(hex.slice(1), 16);
    var r = clamp(((n >> 16) & 255) + delta, 0, 255);
    var g = clamp(((n >> 8) & 255) + delta, 0, 255);
    var b = clamp((n & 255) + delta, 0, 255);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  var HAIR = ["#3a2a24", "#1c2438", "#a84838", "#e2c56a", "#6a3a6a", "#1f4a44"];
  var COAT = ["#1f8f78", "#3d6ea6", "#a84848", "#c47b3a", "#6a4a8a", "#3d7a4a"];

  function hash(name) {
    var n = 0;
    var text = name || "Traveler";
    for (var i = 0; i < text.length; i++) n = (n * 33 + text.charCodeAt(i)) >>> 0;
    return n;
  }

  function lookFor(name) {
    var n = hash(name);
    return { hair: HAIR[n % HAIR.length], coat: COAT[(n >> 3) % COAT.length], scarf: "#f0b429" };
  }

  function heroCanvas(anim, hair, coat) {
    var key = anim + "|" + hair + "|" + coat;
    if (cache[key]) return cache[key];
    var rows = fixRows(anim, HERO[anim] || HERO.idle, 22);
    var right = paint(rows, heroPalette(hair, coat));
    cache[key] = right;
    cache[key + "|L"] = mirror(right);
    return right;
  }

  function hero(anim, facing, hair, coat) {
    var frame = anim === "walk" ? "walk1" : anim;
    if (anim === "walk2") frame = "walk2";
    if (!HERO[frame]) frame = "idle";
    heroCanvas(frame, hair, coat);
    var key = frame + "|" + hair + "|" + coat;
    return facing < 0 ? cache[key + "|L"] : cache[key];
  }

  function sporeCanvas(which) {
    var key = "spore-" + which;
    if (cache[key]) return cache[key];
    var pal = { ".": null, o: OUT, p: "#7a3aaa", P: "#b06adf", w: "#f4e2ff", e: "#1a1422", y: "#5a2878" };
    cache[key] = paint(fixRows(key, SPORE[which], 18), pal);
    return cache[key];
  }

  function miteCanvas(which) {
    var key = "mite-" + which;
    if (cache[key]) return cache[key];
    var pal = { ".": null, o: OUT, g: "#e2b15a", G: "#fff1c2", w: "#fff", e: "#1a1422" };
    cache[key] = paint(fixRows(key, MITE[which], 16), pal);
    return cache[key];
  }

  function makeTile(kind) {
    var c = canvas(16, 16);
    var g = c.getContext("2d");
    function px(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
    if (kind === "grass") {
      px(0, 0, 16, 16, "#6a4a32");
      px(0, 6, 16, 10, "#5a3e2a");
      px(0, 0, 16, 5, "#3f8a45");
      px(0, 0, 16, 2, "#8fd06a");
      px(2, 0, 1, 2, "#d8f0a8");
      px(6, 0, 1, 2, "#2f6a34");
      px(11, 0, 1, 2, "#d8f0a8");
      px(4, 8, 2, 2, "#4a3424");
      px(11, 11, 3, 2, "#3a2818");
    } else if (kind === "moss") {
      px(0, 0, 16, 16, "#2a4a30");
      px(0, 0, 16, 4, "#3f8a45");
      px(0, 0, 16, 2, "#6aaa58");
      px(2, 0, 2, 3, "#c6e6a0");
      px(9, 6, 3, 2, "#1e3a24");
      px(4, 10, 2, 3, "#16301c");
      px(12, 9, 2, 2, "#4a7a40");
    } else if (kind === "haven") {
      px(0, 0, 16, 16, "#d7c49a");
      px(0, 0, 16, 4, "#8fd08a");
      px(0, 0, 16, 2, "#e8f8c8");
      px(4, 0, 1, 2, "#f4ffe4");
      px(11, 7, 3, 2, "#c4a46c");
      px(2, 11, 4, 2, "#b89060");
    } else if (kind === "cordon") {
      px(0, 0, 16, 16, "#4a4638");
      px(0, 0, 16, 3, "#6a6248");
      for (var i = 0; i < 16; i += 4) px(i, 0, 2, 3, "#e2c14a");
      px(2, 8, 3, 2, "#3a3628");
      px(10, 11, 4, 2, "#2e2c22");
    } else if (kind === "city") {
      px(0, 0, 16, 16, "#5a6570");
      px(0, 0, 16, 4, "#7d8792");
      px(0, 0, 16, 1, "#c5ced6");
      px(0, 4, 16, 1, "#3e4650");
      px(7, 6, 2, 8, "#3e4650");
      px(2, 10, 3, 2, "#6a7580");
    } else if (kind === "wood") {
      px(0, 0, 16, 16, "#6b4428");
      px(0, 0, 16, 3, "#e2b56a");
      px(0, 3, 16, 2, "#a56b3c");
      px(0, 10, 16, 2, "#4a2e18");
      px(2, 5, 3, 3, "#c48454");
      px(8, 6, 4, 2, "#8a5428");
      px(13, 5, 2, 3, "#c48454");
    } else if (kind === "ladder") {
      px(0, 0, 3, 16, "#6b4428");
      px(13, 0, 3, 16, "#6b4428");
      px(1, 0, 1, 16, "#c48454");
      px(14, 0, 1, 16, "#3a2414");
      px(0, 6, 16, 3, "#a56b3c");
      px(0, 7, 16, 1, "#e2b56a");
    } else if (kind === "rope") {
      px(6, 0, 4, 16, "#8a6230");
      px(7, 0, 2, 16, "#e2c07a");
      px(5, 4, 6, 2, "#6b4428");
      px(5, 11, 6, 2, "#6b4428");
    }
    return c;
  }

  function tile(kind) {
    if (!tiles[kind]) tiles[kind] = makeTile(kind);
    return tiles[kind];
  }

  var THEME = {
    ashfen: {
      sky: ["#7ec8ea", "#d7f3ea"],
      sun: "#fff4c8",
      hill: "#6ea0c4",
      hill2: "#8fbfc8",
      mid: "#4a6a78",
      grass: "grass"
    },
    woods: {
      sky: ["#1c3a48", "#6a9a78"],
      sun: "#f0e2a8",
      hill: "#1a4030",
      hill2: "#245c40",
      mid: "#163628",
      grass: "moss"
    },
    glassport: {
      sky: ["#243044", "#8aa4c4"],
      sun: "#f2e2b0",
      hill: "#2a3848",
      hill2: "#3a4a5c",
      mid: "#1e2834",
      grass: "city"
    },
    cordon: {
      sky: ["#3a3428", "#c4a070"],
      sun: "#f0d090",
      hill: "#3a3424",
      hill2: "#5a5040",
      mid: "#2a261c",
      grass: "cordon"
    },
    haven: {
      sky: ["#9fe0ea", "#e8fff4"],
      sun: "#fff8d8",
      hill: "#7ec8a0",
      hill2: "#b8e8c8",
      mid: "#5aaa78",
      grass: "haven"
    }
  };

  function skyGradient(id, h) {
    if (skies[id]) return skies[id];
    var theme = THEME[id] || THEME.ashfen;
    var c = canvas(2, h);
    var g = c.getContext("2d");
    var grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, theme.sky[0]);
    grad.addColorStop(1, theme.sky[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, h);
    skies[id] = c;
    return c;
  }

  function roundHill(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x + 8, y, w - 16, h);
    g.fillRect(x, y + (h / 3 | 0), w, h);
    g.fillRect(x + 4, y + (h / 5 | 0), w - 8, h);
  }

  function backdrop(ctx, map, camX, camY, view) {
    var theme = THEME[map.id] || THEME.ashfen;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(skyGradient(map.id, view.h), 0, 0, view.w, view.h);
    var sunY = map.id === "woods" || map.id === "cordon" ? 28 : 18;
    ctx.fillStyle = theme.sun;
    ctx.fillRect(28 - ((camX * 0.02) | 0), sunY, 14, 14);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(31 - ((camX * 0.02) | 0), sunY + 3, 4, 4);
    var far = (camX * 0.15) | 0;
    roundHill(ctx, -40 - (far % 220), view.h - 70 - camY * 0.05, 180, 48, theme.hill);
    roundHill(ctx, 120 - (far % 220), view.h - 58 - camY * 0.05, 150, 40, theme.hill2);
    roundHill(ctx, 250 - (far % 220), view.h - 74 - camY * 0.05, 200, 54, theme.hill);
    var mid = (camX * 0.38) | 0;
    ctx.fillStyle = theme.mid;
    for (var i = -1; i < 6; i++) {
      var bx = i * 90 - (mid % 90);
      if (map.id === "woods") {
        ctx.fillRect(bx + 18, view.h - 78, 6, 28);
        ctx.fillRect(bx + 8, view.h - 108, 26, 16);
        ctx.fillRect(bx + 12, view.h - 118, 16, 12);
      } else if (map.id === "glassport" || map.id === "cordon") {
        ctx.fillRect(bx, view.h - 100, 28, 70);
        ctx.fillRect(bx + 34, view.h - 124, 18, 94);
        ctx.fillStyle = "rgba(240,180,60,0.35)";
        ctx.fillRect(bx + 6, view.h - 88, 4, 6);
        ctx.fillRect(bx + 16, view.h - 74, 4, 6);
        ctx.fillStyle = theme.mid;
      } else {
        ctx.fillRect(bx + 8, view.h - 86, 36, 28);
        ctx.beginPath();
        ctx.moveTo(bx, view.h - 86);
        ctx.lineTo(bx + 26, view.h - 108);
        ctx.lineTo(bx + 52, view.h - 86);
        ctx.fill();
      }
    }
  }

  root.PRArt = {
    hero: hero,
    lookFor: lookFor,
    spore: function (hop) { return sporeCanvas(hop ? "hop" : "idle"); },
    mite: function (bob) { return miteCanvas(bob ? "bob" : "idle"); },
    tile: tile,
    theme: function (id) { return THEME[id] || THEME.ashfen; },
    backdrop: backdrop,
    HAIR: HAIR,
    COAT: COAT
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
