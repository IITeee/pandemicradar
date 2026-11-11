/* Original pixel art for Pandemicradar. Nothing here is traced from another game.
   Sprites are painted once into cached canvases. The world is drawn at 2x. */
(function (root) {
  "use strict";

  var S = 2;
  var OUT = "#241820";
  var cache = {};

  function canvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function shade(hex, delta) {
    if (!hex || hex.charAt(0) !== "#") return hex || "#888";
    var n = parseInt(hex.slice(1), 16);
    function ch(v) { return Math.max(0, Math.min(255, v + delta)); }
    var r = ch((n >> 16) & 255);
    var g = ch((n >> 8) & 255);
    var b = ch(n & 255);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function hash(name) {
    var n = 0;
    var text = name || "Traveler";
    for (var i = 0; i < text.length; i++) n = (n * 33 + text.charCodeAt(i)) >>> 0;
    return n;
  }

  var LOOKS = [
    { hair: "#4a2e28", coat: "#1f8f78", scarf: "#f0b429", pants: "#2c3a62", eyes: "#2f6a4e" },
    { hair: "#1b2438", coat: "#3d6ea6", scarf: "#f6d7b0", pants: "#2a3144", eyes: "#3a5a98" },
    { hair: "#a24a38", coat: "#c45448", scarf: "#f3d59a", pants: "#3a2844", eyes: "#6a4038" },
    { hair: "#e2c56a", coat: "#6a4a8a", scarf: "#fff6ea", pants: "#322848", eyes: "#5a4870" },
    { hair: "#6a3470", coat: "#d0883a", scarf: "#fff", pants: "#3a2c24", eyes: "#703058" },
    { hair: "#1e4a44", coat: "#3d7a4a", scarf: "#e7fff4", pants: "#243044", eyes: "#2a6858" }
  ];

  function lookFor(name) {
    var n = hash(name);
    var base = LOOKS[n % LOOKS.length];
    return {
      hair: base.hair,
      hairHi: shade(base.hair, 48),
      coat: base.coat,
      coatShade: shade(base.coat, -34),
      trim: shade(base.coat, 48),
      scarf: base.scarf,
      pants: base.pants,
      eyes: base.eyes,
      style: (n >> 3) % 6,
      skin: "#f6c7ad",
      skinShade: "#e39a7c",
      mask: false
    };
  }

  function withCoat(look, coat) {
    if (!coat) return look;
    return {
      hair: look.hair, hairHi: look.hairHi, coat: coat, coatShade: shade(coat, -36),
      trim: shade(coat, 42), scarf: look.scarf, pants: look.pants, eyes: look.eyes,
      style: look.style, skin: look.skin, skinShade: look.skinShade, mask: look.mask
    };
  }

  function ball(g, cx, cy, r, fill, hi, outline) {
    var R = r + 1;
    for (var y = -R; y <= R; y++) {
      for (var x = -R; x <= R; x++) {
        var d = x * x + y * y;
        if (d > (r + 1) * (r + 1)) continue;
        g.fillStyle = d > r * r ? outline : (hi && x > r * 0.2 ? hi : fill);
        g.fillRect((cx + x) | 0, (cy + y) | 0, 1, 1);
      }
    }
  }

  function box(g, x, y, w, h, fill, hi, outline) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    if (w < 3 || h < 3) {
      g.fillStyle = fill;
      g.fillRect(x, y, w, h);
      return;
    }
    g.fillStyle = outline;
    g.fillRect(x + 1, y, w - 2, 1);
    g.fillRect(x + 1, y + h - 1, w - 2, 1);
    g.fillRect(x, y + 1, 1, h - 2);
    g.fillRect(x + w - 1, y + 1, 1, h - 2);
    g.fillStyle = fill;
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
    if (hi) {
      g.fillStyle = hi;
      g.fillRect(x + (w * 0.55 | 0), y + 2, (w * 0.4 | 0), h - 4);
    }
  }

  function line(g, x0, y0, x1, y1, rad, fill, hi, outline) {
    var steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (var i = 0; i <= steps; i += 2) {
      ball(g, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, rad, fill, hi, outline);
    }
  }

  var POSE = {
    idle: { y: 0, l: 0, r: 0, af: 0.35, ab: 0.2 },
    idle2: { y: -1, l: 0, r: 0, af: 0.25, ab: 0.3, blink: true },
    walk0: { y: 0, l: 6, r: 0, af: 0.9, ab: -0.4 },
    walk1: { y: -2, l: 3, r: 1, af: 0.4, ab: -0.1 },
    walk2: { y: 0, l: 0, r: 6, af: -0.35, ab: 0.85 },
    walk3: { y: -2, l: 1, r: 3, af: -0.05, ab: 0.4 },
    jump: { y: -4, l: 7, r: 7, af: -1.1, ab: -0.9, tuck: true },
    climb: { y: 0, l: 2, r: 0, af: -2.2, ab: -2.0 },
    climb2: { y: 1, l: 0, r: 2, af: -1.8, ab: -2.3 },
    atk0: { y: 0, l: 1, r: 0, af: -0.4, ab: 0.2, swing: 0 },
    atk1: { y: -1, l: 2, r: 0, af: 0.7, ab: -0.2, swing: 1 },
    atk2: { y: 0, l: 3, r: 1, af: 1.25, ab: -0.3, swing: 2 },
    hit: { y: 2, l: 1, r: 2, af: 0.1, ab: 0.5, hurt: true },
    dead: { y: 10, l: 2, r: 4, af: 1.2, ab: 0.8, dead: true }
  };

  function paintEye(g, x, y, iris, pose, wide) {
    var w = wide ? 9 : 7;
    var h = 7;
    if (pose.dead) {
      g.fillStyle = OUT;
      g.fillRect(x, y + 2, w, 1);
      g.fillRect(x + 1, y + 1, 1, 1);
      g.fillRect(x + w - 2, y + 3, 1, 1);
      g.fillRect(x + 1, y + 3, 1, 1);
      g.fillRect(x + w - 2, y + 1, 1, 1);
      return;
    }
    if (pose.blink) {
      g.fillStyle = OUT;
      g.fillRect(x, y + 3, w, 2);
      return;
    }
    g.fillStyle = "#fffef8";
    g.fillRect(x, y, w, h);
    g.fillStyle = OUT;
    g.fillRect(x, y, w, 1);
    g.fillRect(x, y + h - 1, w, 1);
    g.fillRect(x, y, 1, h);
    g.fillRect(x + w - 1, y, 1, h);
    g.fillStyle = pose.hurt ? "#c45048" : iris;
    g.fillRect(x + 2, y + 1, w - 4, h - 2);
    g.fillStyle = OUT;
    g.fillRect(x + (wide ? 4 : 3), y + 2, 2, 3);
    g.fillStyle = "#fff";
    g.fillRect(x + 2, y + 1, 2, 2);
    if (pose.hurt) {
      g.fillStyle = OUT;
      g.fillRect(x, y, w, 1);
      g.fillRect(x + 1, y + 1, w - 2, 1);
    }
  }

  function paintHair(g, cx, cy, look, pose) {
    var hi = look.hairHi;
    var hair = look.hair;
    var y = pose.y || 0;
    cy += y;
    ball(g, cx, cy - 2, 18, hair, shade(hair, -20), OUT);
    if (look.style === 0) {
      box(g, cx - 16, cy - 4, 32, 8, hair, hi, OUT);
      box(g, cx - 8, cy - 16, 10, 6, hi, null, OUT);
    } else if (look.style === 1) {
      box(g, cx - 14, cy - 20, 6, 10, hair, hi, OUT);
      box(g, cx - 4, cy - 22, 6, 8, hair, hi, OUT);
      box(g, cx + 6, cy - 18, 6, 8, hair, hi, OUT);
    } else if (look.style === 2) {
      ball(g, cx + 16, cy + 6, 7, hair, hi, OUT);
      box(g, cx + 8, cy - 2, 8, 12, hair, hi, OUT);
    } else if (look.style === 3) {
      box(g, cx - 18, cy + 2, 8, 22, hair, hi, OUT);
      box(g, cx - 16, cy + 20, 6, 8, shade(hair, -15), null, OUT);
    } else if (look.style === 4) {
      ball(g, cx - 12, cy - 8, 8, hair, hi, OUT);
      ball(g, cx + 10, cy - 6, 8, hair, hi, OUT);
      ball(g, cx, cy - 14, 7, hi, shade(hi, 20), OUT);
    } else {
      box(g, cx - 18, cy + 4, 6, 16, hair, hi, OUT);
      ball(g, cx - 16, cy + 20, 4, shade(hair, -10), null, OUT);
      g.fillStyle = look.scarf;
      g.fillRect(cx - 18, cy + 8, 6, 2);
    }
    g.fillStyle = hi;
    g.fillRect(cx - 6, cy - 14, 4, 2);
  }

  function paintHead(g, cx, cy, look, pose) {
    var y = pose.y || 0;
    paintHair(g, cx, cy, look, pose);
    ball(g, cx, cy + y, 15, look.skin, look.skinShade, OUT);
    box(g, cx - 17, cy + y - 2, 5, 7, look.skin, look.skinShade, OUT);
    box(g, cx + 12, cy + y - 1, 5, 6, look.skin, look.skinShade, OUT);
    g.fillStyle = shade(look.skin, -18);
    g.fillRect(cx + 13, cy + y, 2, 4);
    paintEye(g, cx - 12, cy + y - 3, look.eyes, pose, false);
    paintEye(g, cx + 2, cy + y - 4, look.eyes, pose, true);
    g.fillStyle = shade(look.hair, 10);
    g.fillRect(cx - 11, cy + y - 6, 6, 2);
    g.fillRect(cx + 3, cy + y - 7, 7, 2);
    if (!pose.dead) {
      g.fillStyle = "#e09090";
      g.fillRect(cx - 13, cy + y + 5, 4, 2);
      g.fillRect(cx + 9, cy + y + 5, 4, 2);
      g.fillStyle = "#c46a62";
      if (pose.hurt) g.fillRect(cx - 2, cy + y + 7, 5, 3);
      else {
        g.fillRect(cx - 2, cy + y + 7, 5, 1);
        g.fillRect(cx - 1, cy + y + 8, 3, 1);
      }
    }
    if (look.mask) {
      box(g, cx - 13, cy + y + 4, 26, 9, "#f7fffb", "#d5eee4", OUT);
      g.fillStyle = "#9fd8cc";
      g.fillRect(cx - 4, cy + y + 7, 8, 2);
    }
    g.fillStyle = look.trim;
    g.fillRect(cx + 13, cy + y + 1, 2, 2);
  }

  function paintHero(poseName, look) {
    var pose = POSE[poseName] || POSE.idle;
    var c = canvas(78, 96);
    var g = c.getContext("2d");
    var y = pose.y || 0;
    g.fillStyle = "rgba(20,14,24,0.28)";
    g.fillRect(22, 91, 34, 3);
    g.fillRect(26, 93, 26, 2);
    if (look.style >= 3) {
      box(g, 18, 50 + y, 40, 26, shade(look.coat, -18), shade(look.coat, -40), OUT);
    }
    var abx = 22;
    var aby = 58 + y;
    line(g, abx, aby, abx + Math.sin(pose.ab) * 14, aby + Math.cos(pose.ab) * 16, 3, look.coatShade, shade(look.coatShade, -20), OUT);
    var lx = 28;
    var rx = 42;
    box(g, lx, 64 + y - pose.l, 9, 16, look.pants, shade(look.pants, -28), OUT);
    box(g, lx - 1, 76 + y - pose.l, 11, 7, "#3a2822", "#6a4a38", OUT);
    g.fillStyle = "#e2b56a";
    g.fillRect(lx, 77 + y - pose.l, 8, 1);
    box(g, rx, 64 + y - pose.r, 9, 16, look.pants, shade(look.pants, -28), OUT);
    box(g, rx - 1, 76 + y - pose.r, 11, 7, "#3a2822", "#6a4a38", OUT);
    g.fillStyle = "#e2b56a";
    g.fillRect(rx, 77 + y - pose.r, 8, 1);
    box(g, 26, 48 + y, 26, 24, look.coat, look.coatShade, OUT);
    g.fillStyle = look.trim;
    g.fillRect(27, 50 + y, 24, 2);
    g.fillStyle = "#fff6ea";
    g.fillRect(37, 56 + y, 2, 2);
    g.fillRect(37, 62 + y, 2, 2);
    box(g, 28, 46 + y, 22, 7, look.scarf, shade(look.scarf, -20), OUT);
    g.fillStyle = look.scarf;
    g.fillRect(22, 50 + y, 6, 12);
    g.fillStyle = shade(look.scarf, -25);
    g.fillRect(23, 54 + y, 3, 6);
    if (look.style % 2 === 0) {
      box(g, 16, 54 + y, 10, 12, "#6b4428", "#c4894a", OUT);
      g.fillStyle = "#e2b56a";
      g.fillRect(18, 56 + y, 6, 2);
    }
    paintHead(g, 38, 30, look, pose);
    var hx = 48;
    var hy = 56 + y;
    var fx = hx + Math.sin(pose.af) * 16;
    var fy = hy + Math.cos(pose.af) * 16;
    line(g, hx, hy, fx, fy, 3, look.coat, look.coatShade, OUT);
    ball(g, fx, fy, 3, look.skin, look.skinShade, OUT);
    if (pose.swing === undefined) {
      box(g, fx - 2, fy - 6, 6, 9, "#e7fff8", "#8fd0c0", OUT);
      g.fillStyle = "#3dba78";
      g.fillRect(fx, fy - 3, 2, 4);
    } else {
      box(g, fx, fy - 8, 7, 12, "#e7fff8", "#7ec8b4", OUT);
      g.fillStyle = "#2f9a62";
      g.fillRect(fx + 2, fy - 4, 3, 6);
      g.fillStyle = "#e2b15a";
      g.fillRect(fx + 7, fy - 6, 7, 3);
      if (pose.swing >= 1) {
        g.fillStyle = "#d8fff4";
        g.fillRect(fx + 14, fy - 12, 3, 3);
        g.fillRect(fx + 18, fy - 8, 4, 2);
        g.fillRect(fx + 16, fy - 2, 3, 3);
        g.fillStyle = "#fff";
        g.fillRect(fx + 20, fy - 14, 2, 2);
      }
      if (pose.swing >= 2) {
        g.fillStyle = "#b8fff0";
        g.fillRect(fx + 22, fy - 16, 4, 3);
        g.fillRect(fx + 24, fy - 6, 5, 2);
        g.fillRect(fx + 20, fy + 2, 3, 3);
      }
    }
    return c;
  }

  function actor(pose, facing, look) {
    var key = pose + "|" + look.hair + "|" + look.coat + "|" + look.style + "|" + (look.mask ? 1 : 0) + "|" + (facing < 0 ? "L" : "R");
    if (cache[key]) return cache[key];
    var right = paintHero(pose, look);
    cache[key] = facing < 0 ? mirror(right) : right;
    if (facing < 0) cache[pose + "|" + look.hair + "|" + look.coat + "|" + look.style + "|" + (look.mask ? 1 : 0) + "|R"] = right;
    else cache[key.slice(0, -1) + "L"] = mirror(right);
    return cache[key];
  }

  function mirror(src) {
    var c = canvas(src.width, src.height);
    var g = c.getContext("2d");
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  function poseName(anim, frame) {
    var f = frame | 0;
    if (anim === "walk") return "walk" + (Math.abs(f) % 4);
    if (anim === "attack") return "atk" + Math.max(0, Math.min(2, f));
    if (anim === "climb") return (f % 2) ? "climb2" : "climb";
    if (anim === "jump") return "jump";
    if (anim === "hit") return "hit";
    if (anim === "dead") return "dead";
    return (f % 5 === 4) ? "idle2" : "idle";
  }

  function paintSpore(pose) {
    var c = canvas(64, 56);
    var g = c.getContext("2d");
    var y = pose === "bob" ? -2 : pose === "hit" ? 2 : pose === "dead" ? 8 : 0;
    g.fillStyle = "rgba(20,14,24,0.25)";
    g.fillRect(16, 50, 30, 3);
    ball(g, 32, 30 + y, 16, "#f3e2ff", "#d2b0ea", OUT);
    ball(g, 32, 18 + y, 18, "#7a3cb0", "#b678e4", OUT);
    g.fillStyle = "#f6e6ff";
    g.fillRect(22, 12 + y, 5, 4);
    g.fillRect(34, 16 + y, 4, 3);
    g.fillRect(26, 20 + y, 3, 3);
    if (pose === "dead") {
      g.fillStyle = OUT;
      g.fillRect(24, 30, 6, 2);
      g.fillRect(36, 30, 6, 2);
    } else {
      paintEye(g, 22, 28 + y, "#5a2878", pose === "hit" ? { hurt: true } : {}, false);
      paintEye(g, 34, 28 + y, "#5a2878", pose === "hit" ? { hurt: true } : {}, false);
      g.fillStyle = "#c46a9a";
      g.fillRect(30, 38 + y, 4, 2);
    }
    box(g, 22, 42 + y, 7, 6, "#f6d2b4", "#e0a888", OUT);
    box(g, 36, 42 + y, 7, 6, "#f6d2b4", "#e0a888", OUT);
    if (pose !== "dead") {
      ball(g, 10, 16 + y, 3, "#e6d0ff", "#fff", OUT);
      ball(g, 54, 20 + y, 2, "#d8c0ff", "#fff", OUT);
    }
    return c;
  }

  function paintMite(pose) {
    var c = canvas(60, 48);
    var g = c.getContext("2d");
    var y = pose === "bob" ? -3 : pose === "dead" ? 6 : 0;
    g.fillStyle = "rgba(80,50,10,0.25)";
    g.fillRect(14, 42, 30, 3);
    if (pose !== "dead") {
      g.fillStyle = "rgba(255,236,180,0.85)";
      g.fillRect(8, 16 + y, 10, 6);
      g.fillRect(42, 14 + y, 10, 6);
      g.fillStyle = "#fff6d4";
      g.fillRect(10, 17 + y, 4, 2);
    }
    ball(g, 30, 26 + y, 14, "#f0b84a", "#ffe6a4", OUT);
    ball(g, 30, 30 + y, 8, "#fff1c4", "#fff", OUT);
    g.fillStyle = "#e09030";
    g.fillRect(18, 16 + y, 24, 3);
    if (pose === "dead") {
      g.fillStyle = OUT;
      g.fillRect(22, 26, 5, 2);
      g.fillRect(33, 26, 5, 2);
    } else {
      paintEye(g, 20, 22 + y, "#8a4a10", pose === "hit" ? { hurt: true } : {}, false);
      paintEye(g, 32, 22 + y, "#8a4a10", pose === "hit" ? { hurt: true } : {}, false);
      g.fillStyle = "#a86828";
      g.fillRect(28, 32 + y, 4, 2);
    }
    g.fillStyle = OUT;
    g.fillRect(16, 36 + y, 3, 5);
    g.fillRect(40, 36 + y, 3, 5);
    return c;
  }

  function paintRusher(pose, frame) {
    var look = {
      hair: "#3a1820", hairHi: "#6a3030", coat: pose === "hit" ? "#fff1ea" : "#c45048",
      coatShade: "#8a3030", trim: "#ffd0c4", scarf: "#f0d0a8", pants: "#3a2430",
      eyes: "#6a3038", style: 1, skin: "#f3c2b0", skinShade: "#e09888", mask: false
    };
    var name = pose === "walk" ? "walk" + (frame % 4) : pose === "bob" ? "idle2" : pose === "hit" ? "hit" : pose === "dead" ? "dead" : "idle";
    var hero = paintHero(name, look);
    var c = canvas(hero.width, hero.height);
    var g = c.getContext("2d");
    g.drawImage(hero, 0, 0);
    if (pose === "walk") {
      g.fillStyle = "rgba(255,220,200,0.8)";
      g.fillRect(6, 40, 8, 2);
      g.fillRect(4, 48, 6, 2);
    }
    return c;
  }

  function monster(kind, pose, frame) {
    var key = "mob|" + kind + "|" + pose + "|" + (frame | 0);
    if (cache[key]) return cache[key];
    var img = kind === "sporeling" ? paintSpore(pose) : kind === "mite" ? paintMite(pose) : paintRusher(pose, frame || 0);
    cache[key] = img;
    return img;
  }

  function icon(kind) {
    var key = "icon|" + kind;
    if (cache[key]) return cache[key];
    var c = canvas(22, 22);
    var g = c.getContext("2d");
    if (kind === "tonic") {
      box(g, 8, 4, 6, 4, "#e2b15a", "#fff", OUT);
      box(g, 6, 8, 10, 12, "#d8fff4", "#7ec8b4", OUT);
      g.fillStyle = "#3dba78";
      g.fillRect(8, 12, 6, 6);
    } else if (kind === "sac") {
      ball(g, 11, 12, 8, "#b06adf", "#f3e2ff", OUT);
      g.fillStyle = "#fff";
      g.fillRect(8, 8, 3, 3);
    } else if (kind === "spray") {
      box(g, 4, 6, 8, 12, "#e7fff8", "#8fd0c0", OUT);
      g.fillStyle = "#3dba78";
      g.fillRect(6, 10, 4, 5);
      g.fillStyle = "#e2b15a";
      g.fillRect(12, 8, 6, 3);
    } else {
      box(g, 4, 5, 14, 12, "#f0d48a", "#fff6d0", OUT);
      g.fillStyle = "#c4963a";
      g.fillRect(6, 8, 10, 1);
      g.fillRect(6, 11, 8, 1);
    }
    cache[key] = c;
    return c;
  }

  function flashOf(img, key) {
    var k = key + "|flash";
    if (cache[k]) return cache[k];
    var c = canvas(img.width, img.height);
    var g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fillRect(0, 0, img.width, img.height);
    cache[k] = c;
    return c;
  }

  function X(x, cam) { return Math.round((x - cam) * S); }
  function Y(y, cam) { return Math.round((y - cam) * S); }

  function blitFeet(ctx, img, feetX, feetY, camX, camY) {
    ctx.drawImage(img, X(feetX, camX) - (img.width / 2 | 0), Y(feetY, camY) - img.height + 8);
  }

  var THEME = {
    ashfen: { sky: ["#8ecff0", "#e5f8ff"], sun: "#fff6c4", hill: "#7eae78", hill2: "#9ecf8a", far: "#6a98b0", grass: "#4ea84a", grassHi: "#d8f5a4", dirt: "#8d5b3c", dirtDk: "#5a3a28", leaf: "#2f8a44", fog: 0 },
    woods: { sky: ["#163044", "#6a9a78"], sun: "#f0e4b8", hill: "#143028", hill2: "#1f4636", far: "#1a3040", grass: "#2f7a40", grassHi: "#b6e07a", dirt: "#4a3426", dirtDk: "#2a1c14", leaf: "#1e6b34", fog: 0.28 },
    glassport: { sky: ["#24344c", "#9eb4cc"], sun: "#f4e6c4", hill: "#2a3a4e", hill2: "#3d5168", far: "#1c2838", grass: "#8b97a4", grassHi: "#e4ecf2", dirt: "#4e5966", dirtDk: "#2e3640", leaf: "#5a7a72", fog: 0.12, city: true },
    cordon: { sky: ["#4a3a28", "#d2ae78"], sun: "#f0d090", hill: "#3a3428", hill2: "#6a5a40", far: "#3a3028", grass: "#6a6248", grassHi: "#f0d56a", dirt: "#4a4032", dirtDk: "#2c261c", leaf: "#6a6840", fog: 0.34, hazard: true },
    haven: { sky: ["#b7e8f6", "#f4fff8"], sun: "#fff8d2", hill: "#8ed4a4", hill2: "#c8f0cc", far: "#9fd8ea", grass: "#7ed06a", grassHi: "#f4ffd0", dirt: "#edd9aa", dirtDk: "#d2b888", leaf: "#3aaa68", fog: 0 }
  };

  function theme(id) { return THEME[id] || THEME.ashfen; }

  function cloudSprite() {
    if (cache.cloud) return cache.cloud;
    var c = canvas(70, 28);
    var g = c.getContext("2d");
    ball(g, 18, 16, 10, "#fff", "#f4f7ff", "rgba(180,200,220,0.0)");
    ball(g, 34, 12, 12, "#fff", "#f7fbff", "rgba(0,0,0,0)");
    ball(g, 50, 16, 9, "#fff", "#eef4ff", "rgba(0,0,0,0)");
    cache.cloud = c;
    return c;
  }

  function birdSprite() {
    if (cache.bird) return cache.bird;
    var c = canvas(12, 8);
    var g = c.getContext("2d");
    g.fillStyle = OUT;
    g.fillRect(0, 4, 3, 1);
    g.fillRect(2, 2, 2, 2);
    g.fillRect(5, 3, 2, 1);
    g.fillRect(7, 2, 2, 2);
    g.fillRect(9, 4, 3, 1);
    cache.bird = c;
    return c;
  }

  function backdrop(ctx, map, camX, camY, view, time) {
    var t = theme(map.id);
    var vw = view.w * S;
    var vh = view.h * S;
    var sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, t.sky[0]);
    sky.addColorStop(1, t.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, vw, vh);
    var sunX = 70 - camX * 0.02;
    var sunY = map.id === "woods" || map.id === "cordon" ? 36 : 22;
    ball(ctx, sunX, sunY, 12, t.sun, "#fff", t.sun);
    if (map.id === "ashfen" || map.id === "haven") {
      ctx.fillStyle = "rgba(255,244,200,0.18)";
      ctx.fillRect(sunX - 8, sunY + 10, 18, vh);
      ctx.fillRect(sunX + 20, sunY + 16, 10, vh);
    }
    var far = (camX * 0.12) | 0;
    ctx.fillStyle = t.far;
    for (var i = -1; i < 8; i++) {
      var hx = i * 160 - (far % 160);
      ctx.fillRect(hx + 20, vh - 120, 90, 70);
      ctx.fillRect(hx + 40, vh - 150, 50, 40);
    }
    var mid = (camX * 0.28) | 0;
    ctx.fillStyle = t.hill;
    for (var j = -1; j < 8; j++) {
      var bx = j * 140 - (mid % 140);
      ctx.fillRect(bx + 10, vh - 100 - camY * 0.04, 100, 60);
      ctx.fillStyle = t.hill2;
      ctx.fillRect(bx + 24, vh - 124 - camY * 0.04, 60, 30);
      ctx.fillStyle = t.hill;
    }
    if (t.city) {
      ctx.fillStyle = "#1b2836";
      var city = (camX * 0.4) | 0;
      for (var k = -1; k < 10; k++) {
        var cx = k * 70 - (city % 70);
        var ch = 50 + (k * 17 % 40);
        ctx.fillRect(cx, vh - 80 - ch, 28, ch + 40);
        ctx.fillStyle = "rgba(240,200,120,0.45)";
        ctx.fillRect(cx + 6, vh - 70 - ch, 4, 6);
        ctx.fillRect(cx + 14, vh - 54 - ch, 4, 6);
        ctx.fillStyle = "#1b2836";
      }
    }
    var cloud = cloudSprite();
    for (var c = 0; c < 4; c++) {
      var cx2 = ((c * 220 + time * 14 - camX * 0.05) % (vw + 120) + vw + 120) % (vw + 120) - 60;
      ctx.drawImage(cloud, cx2, 18 + c * 16);
    }
    var bird = birdSprite();
    for (var b = 0; b < 3; b++) {
      var bx2 = ((time * 28 + b * 180 - camX * 0.1) % (vw + 40) + vw + 40) % (vw + 40) - 20;
      var by = 40 + b * 14 + Math.sin(time * 3 + b) * 3;
      ctx.drawImage(bird, bx2, by);
    }
    if (t.fog) {
      ctx.fillStyle = "rgba(232,220,190," + t.fog + ")";
      ctx.fillRect(0, vh - 90, vw, 50);
      ctx.fillRect(((-time * 20 - camX * 0.2) % 80), vh - 110, 40, 16);
    }
  }

  function groundTile(style) {
    var key = "tile|" + style;
    if (cache[key]) return cache[key];
    var c = canvas(32, 32);
    var g = c.getContext("2d");
    var pal = {
      grass: ["#6d4632", "#8d5b3c", "#3e9a40", "#b6e86a", "#e8ffb4"],
      moss: ["#2a3a28", "#3d5a34", "#2f7a40", "#8fce6a", "#d8f0a8"],
      stone: ["#3e4752", "#6a7582", "#9aa6b2", "#e6eef4", "#c5d0da"],
      hazard: ["#3a3428", "#5a5040", "#6a6248", "#f0d56a", "#fff1b0"],
      haven: ["#d7c49a", "#edd9aa", "#6ec45e", "#e8ffc0", "#ffffff"],
      wood: ["#6b4428", "#a56b3c", "#e2b56a", "#f0d09a", "#4a2e18"]
    }[style] || ["#6d4632", "#8d5b3c", "#3e9a40", "#b6e86a", "#e8ffb4"];
    g.fillStyle = pal[0];
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = pal[1];
    g.fillRect(0, 10, 32, 22);
    if (style === "wood") {
      g.fillStyle = pal[2];
      g.fillRect(0, 0, 32, 8);
      g.fillStyle = pal[3];
      g.fillRect(0, 0, 32, 3);
      g.fillStyle = pal[4];
      g.fillRect(0, 14, 32, 2);
      g.fillRect(0, 24, 32, 2);
      g.fillStyle = pal[3];
      g.fillRect(6, 10, 2, 6);
      g.fillRect(20, 18, 2, 5);
    } else {
      g.fillStyle = pal[2];
      g.fillRect(0, 4, 32, 10);
      g.fillStyle = pal[3];
      g.fillRect(0, 0, 32, 6);
      g.fillStyle = pal[4];
      g.fillRect(3, 1, 2, 3);
      g.fillRect(14, 0, 2, 2);
      g.fillRect(24, 1, 3, 2);
      g.fillStyle = pal[0];
      g.fillRect(8, 16, 3, 2);
      g.fillRect(20, 22, 4, 2);
      if (style === "hazard") {
        g.fillStyle = "#e2b15a";
        for (var i = 0; i < 32; i += 8) g.fillRect(i, 0, 4, 4);
      }
      if (style === "stone") {
        g.fillStyle = "#2c343e";
        g.fillRect(0, 8, 32, 1);
        g.fillRect(15, 8, 1, 24);
      }
    }
    cache[key] = c;
    return c;
  }

  function groundStyle(id, oneWay) {
    if (oneWay) return "wood";
    if (id === "woods") return "moss";
    if (id === "glassport") return "stone";
    if (id === "cordon") return "hazard";
    if (id === "haven") return "haven";
    return "grass";
  }

  function solid(ctx, map, s, camX, camY, time) {
    var style = groundStyle(map.id, s.oneWay);
    var tile = groundTile(style);
    var x = X(s.x, camX);
    var y = Y(s.y, camY);
    var w = Math.round(s.w * S);
    var h = Math.round(s.h * S);
    var t = theme(map.id);
    if (!s.oneWay && h > 20) {
      ctx.fillStyle = t.dirtDk;
      ctx.fillRect(x, y + 16, w, h - 16);
    }
    var stampH = Math.min(tile.height, h);
    for (var ix = 0; ix < w; ix += 32) {
      var slice = Math.min(32, w - ix);
      ctx.drawImage(tile, 0, 0, slice, stampH, x + ix, y, slice, stampH);
    }
    ctx.fillStyle = style === "wood" ? "#4a2e18" : t.dirt;
    ctx.fillRect(x, y + 8, w, 3);
    if (s.w < map.width - 4) {
      ctx.fillStyle = style === "wood" ? "#f0d09a" : t.grassHi;
      ctx.fillRect(x - 4, y + 2, 6, 6);
      ctx.fillRect(x + w - 2, y + 2, 6, 6);
      ctx.fillStyle = OUT;
      ctx.fillRect(x - 4, y + 8, 6, 2);
      ctx.fillRect(x + w - 2, y + 8, 6, 2);
    }
    if (style !== "wood" && style !== "stone") {
      ctx.fillStyle = t.grassHi;
      for (var gx = 4; gx < w; gx += 16) {
        var sway = Math.round(Math.sin(time * 2.4 + (s.x + gx) * 0.07) * 2);
        ctx.fillRect(x + gx + sway, y - 6, 2, 7);
        ctx.fillRect(x + gx + 5 - sway, y - 4, 2, 5);
      }
    }
  }

  function ladder(ctx, ladder, camX, camY) {
    var x = X(ladder.x, camX);
    var y = Y(ladder.y, camY);
    var h = Math.round(ladder.h * S);
    if (ladder.rope) {
      ctx.fillStyle = "#6b4428";
      ctx.fillRect(x + 6, y, 6, h);
      ctx.fillStyle = "#e2c07a";
      ctx.fillRect(x + 8, y, 2, h);
      for (var i = 0; i < h; i += 14) {
        ctx.fillStyle = "#8a5a30";
        ctx.fillRect(x + 4, y + i, 10, 3);
        ctx.fillStyle = "#f0d09a";
        ctx.fillRect(x + 5, y + i, 8, 1);
      }
      return;
    }
    ctx.fillStyle = OUT;
    ctx.fillRect(x, y, 6, h);
    ctx.fillRect(x + 16, y, 6, h);
    ctx.fillStyle = "#a56b3c";
    ctx.fillRect(x + 1, y, 4, h);
    ctx.fillRect(x + 17, y, 4, h);
    ctx.fillStyle = "#e2b56a";
    ctx.fillRect(x + 1, y, 1, h);
    for (var r = 4; r < h; r += 12) {
      ctx.fillStyle = "#6b4428";
      ctx.fillRect(x, y + r, 22, 4);
      ctx.fillStyle = "#f0d09a";
      ctx.fillRect(x + 1, y + r, 20, 2);
    }
  }

  function buildingCanvas(piece, mapId) {
    var key = "b|" + mapId + "|" + piece.kind + "|" + piece.w + "|" + piece.h;
    if (cache[key]) return cache[key];
    var w = Math.round(piece.w * S) + 16;
    var h = Math.round(piece.h * S) + 20;
    var c = canvas(w, h);
    var g = c.getContext("2d");
    var city = mapId === "glassport" || piece.kind === "tower";
    var wall = city ? "#4a596c" : mapId === "haven" ? "#f4e2c4" : "#8a5048";
    var wallHi = city ? "#6a7a8c" : mapId === "haven" ? "#fff6e4" : "#b86a58";
    var roof = city ? "#2a3444" : "#8a3a32";
    g.fillStyle = OUT;
    g.fillRect(6, 16, w - 14, h - 18);
    g.fillStyle = wall;
    g.fillRect(8, 18, w - 18, h - 22);
    g.fillStyle = wallHi;
    g.fillRect(8, 18, 8, h - 22);
    g.fillStyle = shade(wall, -24);
    g.fillRect(w - 22, 18, 10, h - 22);
    g.fillStyle = roof;
    g.fillRect(2, 10, w - 6, 14);
    g.fillStyle = shade(roof, 30);
    g.fillRect(2, 10, w - 6, 4);
    g.fillStyle = "#6a6248";
    g.fillRect(w - 36, 0, 10, 16);
    g.fillStyle = "rgba(80,80,80,0.35)";
    g.fillRect(w - 30, 2, 6, 4);
    var win = city ? "#f0d090" : "#fff1c8";
    for (var wy = 36; wy < h - 48; wy += 28) {
      for (var wx = 18; wx < w - 36; wx += 26) {
        g.fillStyle = OUT;
        g.fillRect(wx, wy, 16, 18);
        g.fillStyle = win;
        g.fillRect(wx + 2, wy + 2, 12, 14);
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.fillRect(wx + 2, wy + 2, 4, 5);
        g.fillStyle = shade(wall, -10);
        g.fillRect(wx + 7, wy + 2, 2, 14);
        g.fillRect(wx + 2, wy + 8, 12, 2);
      }
    }
    g.fillStyle = "#4a3028";
    g.fillRect((w / 2 | 0) - 12, h - 46, 22, 28);
    g.fillStyle = "#e2b15a";
    g.fillRect((w / 2 | 0) + 4, h - 32, 3, 3);
    g.fillStyle = "#6b4428";
    g.fillRect(16, h - 58, 28, 10);
    g.fillStyle = "#e07070";
    g.fillRect(20, h - 64, 4, 8);
    g.fillStyle = "#f0d060";
    g.fillRect(28, h - 66, 4, 8);
    g.fillStyle = "#7ec8ea";
    g.fillRect(36, h - 62, 4, 6);
    if (piece.w > 160) {
      g.fillStyle = "#f4e2c0";
      g.fillRect(18, 28, 46, 14);
      g.fillStyle = OUT;
      g.fillRect(22, 31, 36, 8);
      g.fillStyle = "#f0b429";
      g.fillRect(24, 33, 14, 4);
    }
    cache[key] = c;
    return c;
  }

  function treeCanvas(height, mapId) {
    var key = "tree|" + mapId + "|" + height;
    if (cache[key]) return cache[key];
    var h = Math.max(40, Math.round(height * S));
    var c = canvas(96, h);
    var g = c.getContext("2d");
    var t = theme(mapId);
    g.fillStyle = "#4a3020";
    g.fillRect(42, 36, 14, h - 36);
    g.fillStyle = "#8a6240";
    g.fillRect(44, 36, 4, h - 36);
    ball(g, 48, 36, 28, t.leaf, shade(t.leaf, -24), OUT);
    ball(g, 28, 48, 16, shade(t.leaf, 12), t.leaf, OUT);
    ball(g, 68, 46, 16, shade(t.leaf, -8), shade(t.leaf, 16), OUT);
    g.fillStyle = shade(t.leaf, 50);
    g.fillRect(36, 24, 6, 4);
    g.fillRect(52, 32, 4, 3);
    g.fillStyle = "#f0d060";
    g.fillRect(24, 44, 3, 3);
    g.fillStyle = "#e07070";
    g.fillRect(64, 40, 3, 3);
    cache[key] = c;
    return c;
  }

  function scenery(ctx, map, piece, camX, camY, time) {
    var sway = Math.round(Math.sin(time * 1.6 + piece.x * 0.01) * 2);
    if (piece.kind === "house" || piece.kind === "tower") {
      var img = buildingCanvas(piece, map.id);
      ctx.drawImage(img, X(piece.x, camX) - 8, Y(piece.y, camY) - 16);
      return;
    }
    if (piece.kind === "tree") {
      var th = Math.max(48, (map.ground || piece.y + 80) - piece.y);
      var tree = treeCanvas(th, map.id);
      ctx.drawImage(tree, X(piece.x, camX) - 48 + sway, Y(piece.y, camY));
      return;
    }
    if (piece.kind === "lamp") {
      var x = X(piece.x, camX);
      var y = Y(piece.y, camY);
      ctx.fillStyle = OUT;
      ctx.fillRect(x, y, 6, 72);
      ctx.fillStyle = "#6b4428";
      ctx.fillRect(x + 1, y, 3, 72);
      var glow = 0.55 + Math.sin(time * 10 + piece.x) * 0.2;
      ctx.fillStyle = "rgba(255,210,120," + glow + ")";
      ctx.fillRect(x - 10, y - 8, 26, 18);
      ctx.fillStyle = "#f0b429";
      ctx.fillRect(x - 6, y - 4, 16, 10);
      ctx.fillStyle = "#fff6d0";
      ctx.fillRect(x - 2, y - 2, 6, 6);
      return;
    }
    if (piece.kind === "scaffold") {
      var sx = X(piece.x, camX);
      var sy = Y(piece.y, camY);
      var sh = Math.round((piece.h || 80) * S);
      ctx.fillStyle = "#3a3020";
      ctx.fillRect(sx, sy, 10, sh);
      ctx.fillStyle = "#c4a46c";
      ctx.fillRect(sx + 2, sy, 3, sh);
      for (var i = 0; i < sh; i += 22) {
        ctx.fillStyle = "#e2c07a";
        ctx.fillRect(sx - 16, sy + i, 42, 5);
        ctx.fillStyle = OUT;
        ctx.fillRect(sx - 16, sy + i + 5, 42, 2);
      }
      return;
    }
    if (piece.kind === "banner") {
      var bx = X(piece.x, camX);
      var by = Y(piece.y, camY);
      ctx.fillStyle = "#f7f1e4";
      ctx.fillRect(bx, by, 5, 90);
      ctx.fillStyle = "#1f8f78";
      ctx.fillRect(bx + 5, by + 6 + sway, 28, 22);
      ctx.fillStyle = "#f0b429";
      ctx.fillRect(bx + 12, by + 12 + sway, 12, 8);
      ctx.fillStyle = "#147a68";
      ctx.fillRect(bx + 5, by + 28 + sway, 22, 8);
    }
  }

  function flowerCanvas(n) {
    var key = "flower" + n;
    if (cache[key]) return cache[key];
    var colors = ["#e07070", "#f0d060", "#f4f0e4", "#c58af0", "#7ec8ea", "#f0b429"];
    var c = canvas(16, 24);
    var g = c.getContext("2d");
    g.fillStyle = "#2f6a34";
    g.fillRect(7, 10, 2, 14);
    ball(g, 8, 8, 5, colors[n % colors.length], "#fff", OUT);
    g.fillStyle = "#f0d060";
    g.fillRect(7, 7, 2, 2);
    cache[key] = c;
    return c;
  }

  function dressing(ctx, map, camX, camY, time, front) {
    var t = theme(map.id);
    var ground = map.ground || 196;
    for (var x = 12; x < map.width; x += 28) {
      var n = (x * 13 + map.id.length * 9) % 8;
      var isFront = n === 0 || n === 5;
      if (isFront !== front) continue;
      if (n === 7 && (map.id === "ashfen" || map.id === "haven")) {
        var fx = X(x, camX);
        var fy = Y(ground, camY);
        ctx.fillStyle = "#f4f0e4";
        ctx.fillRect(fx, fy - 18, 3, 18);
        ctx.fillRect(fx + 18, fy - 18, 3, 18);
        ctx.fillRect(fx, fy - 16, 21, 3);
        ctx.fillRect(fx, fy - 10, 21, 2);
        continue;
      }
      if (n === 6) continue;
      var flower = flowerCanvas(n + map.id.length);
      var sway = Math.round(Math.sin(time * 2 + x) * 1);
      var scale = isFront ? 2 : 1;
      ctx.drawImage(flower, X(x, camX) + sway, Y(ground, camY) - flower.height * scale, flower.width * scale, flower.height * scale);
    }
    if (front && map.id === "woods") {
      ctx.fillStyle = t.grassHi;
      for (var gx = 0; gx < map.width; gx += 22) {
        var gs = Math.round(Math.sin(time * 2.2 + gx * 0.05) * 2);
        ctx.fillRect(X(gx, camX) + gs, Y(ground, camY) - 8, 2, 8);
      }
    }
  }

  function zone(ctx, zone, camX, camY, time) {
    var x = X(zone.x, camX);
    var y = Y(zone.y, camY);
    var w = Math.round(zone.w * S);
    var h = Math.round(zone.h * S);
    ctx.fillStyle = zone.kind === "amber" ? "rgba(226,176,80,0.28)" : "rgba(160,90,210,0.28)";
    ctx.fillRect(x, y, w, h);
    var bob = (time * 18) | 0;
    ctx.fillStyle = zone.kind === "amber" ? "rgba(255,236,180,0.7)" : "rgba(236,210,255,0.7)";
    for (var i = 0; i < w; i += 14) ctx.fillRect(x + i, y + ((i + bob) % Math.max(4, h - 2)), 3, 3);
  }

  function portal(ctx, portal, camX, camY, time) {
    var x = X(portal.x, camX);
    var y = Y(portal.y, camY);
    var w = Math.round(portal.w * S);
    var h = Math.round(portal.h * S);
    ctx.fillStyle = "#f7f1e4";
    ctx.fillRect(x, y, 10, h);
    ctx.fillRect(x + w - 10, y, 10, h);
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = "#c8bba6";
    ctx.fillRect(x + 3, y + 3, 4, h - 6);
    ctx.fillRect(x + w - 7, y + 3, 4, h - 6);
    var cx = x + w / 2;
    var cy = y + h / 2 + 4;
    for (var i = 0; i < 12; i++) {
      var a = time * 3.2 + i * 0.55;
      var rad = 6 + (i % 4) * 5;
      ctx.fillStyle = i % 2 ? "#e8fff8" : "#3ddec8";
      ctx.fillRect(cx + Math.cos(a) * rad - 2, cy + Math.sin(a) * rad * 1.15 - 2, 4, 4);
    }
    ctx.fillStyle = "rgba(180,255,236,0.35)";
    ctx.fillRect(x + 12, y + 14, w - 24, h - 20);
    ctx.font = "bold 16px Trebuchet MS, Segoe UI, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUT;
    ctx.strokeText(portal.label, x, y - 8);
    ctx.fillStyle = "#fff6d0";
    ctx.fillText(portal.label, x, y - 8);
  }

  function questMark(ctx, x, y, time) {
    var bob = Math.round(Math.sin(time * 6) * 4);
    ctx.fillStyle = OUT;
    ctx.fillRect(x - 8, y - 22 + bob, 16, 16);
    ctx.fillStyle = "#f0b429";
    ctx.fillRect(x - 6, y - 20 + bob, 12, 12);
    ctx.fillStyle = OUT;
    ctx.fillRect(x - 1, y - 18 + bob, 3, 6);
    ctx.fillRect(x - 1, y - 11 + bob, 3, 2);
  }

  function paintPortrait(canvasEl, npc) {
    if (!canvasEl || !npc) return;
    var look = withCoat(lookFor(npc.name), npc.coat);
    var g = canvasEl.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#243446";
    g.fillRect(0, 0, canvasEl.width, canvasEl.height);
    g.fillStyle = look.coat;
    g.fillRect(0, 58, canvasEl.width, 26);
    var img = actor("idle", 1, look);
    g.drawImage(img, 16, 2, 48, 54, 4, 2, 76, 80);
  }

  function paintTitle(canvasEl) {
    if (!canvasEl) return;
    var g = canvasEl.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvasEl.width, canvasEl.height);
    var names = ["Otto", "Kit", "Quin"];
    for (var i = 0; i < names.length; i++) {
      var img = actor(i === 1 ? "walk1" : "idle", 1, lookFor(names[i]));
      g.drawImage(img, 8 + i * 70, 4);
    }
  }

  function paintIcon(canvasEl, kind) {
    if (!canvasEl) return;
    var g = canvasEl.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvasEl.width, canvasEl.height);
    g.drawImage(icon(kind), 3, 3);
  }

  root.PRArt = {
    SCALE: S,
    lookFor: lookFor,
    withCoat: withCoat,
    poseName: poseName,
    actor: actor,
    monster: monster,
    icon: icon,
    flashOf: flashOf,
    blitFeet: blitFeet,
    theme: theme,
    backdrop: backdrop,
    solid: solid,
    ladder: ladder,
    scenery: scenery,
    dressing: dressing,
    zone: zone,
    portal: portal,
    questMark: questMark,
    paintPortrait: paintPortrait,
    paintTitle: paintTitle,
    paintIcon: paintIcon,
    X: X,
    Y: Y
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
