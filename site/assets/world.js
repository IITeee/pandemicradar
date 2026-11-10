/* Original map data for Pandemicradar. Tile coordinates only. No DOM. */
(function (root) {
  "use strict";

  var SOLID = { "#": 1, t: 1, w: 1, f: 1, c: 1, b: 1, o: 1, "=": 1, l: 1 };
  var KNOWN = { "#": 1, t: 1, w: 1, f: 1, c: 1, b: 1, o: 1, "=": 1, l: 1, ",": 1, ".": 1, i: 1, "*": 1, d: 1 };

  function blank(w, h, ch) {
    var rows = [];
    for (var y = 0; y < h; y++) {
      var row = new Array(w);
      for (var x = 0; x < w; x++) row[x] = ch;
      rows.push(row);
    }
    return rows;
  }

  function fill(rows, x, y, w, h, ch) {
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) rows[y + j][x + i] = ch;
    }
  }

  function border(rows, ch) {
    var h = rows.length;
    var w = rows[0].length;
    for (var x = 0; x < w; x++) {
      rows[0][x] = ch;
      rows[h - 1][x] = ch;
    }
    for (var y = 0; y < h; y++) {
      rows[y][0] = ch;
      rows[y][w - 1] = ch;
    }
  }

  function building(rows, x, y, w, h, side, floor, wall) {
    floor = floor || "i";
    wall = wall || "#";
    fill(rows, x, y, w, h, wall);
    fill(rows, x + 1, y + 1, w - 2, h - 2, floor);
    var tx;
    var ty;
    var tw = 2;
    var th = 1;
    if (side === "s" || side === "n") {
      tx = x + ((w / 2) | 0) - 1;
      ty = side === "s" ? y + h - 1 : y;
      rows[ty][tx] = "d";
      rows[ty][tx + 1] = "d";
    } else {
      ty = y + ((h / 2) | 0) - 1;
      tx = side === "e" ? x + w - 1 : x;
      tw = 1;
      th = 2;
      rows[ty][tx] = "d";
      rows[ty + 1][tx] = "d";
    }
    return { x: x, y: y, w: w, h: h, door: { tx: tx, ty: ty, tw: tw, th: th } };
  }

  function line(rows, x0, y0, x1, y1, ch) {
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1;
    var sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    while (true) {
      if (rows[y0] && rows[y0][x0] != null) rows[y0][x0] = ch;
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  function carve(rows, points, ch) {
    for (var i = 0; i < points.length - 1; i++) {
      line(rows, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], ch);
      line(rows, points[i][0] + 1, points[i][1], points[i + 1][0] + 1, points[i + 1][1], ch);
    }
  }

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function scatter(rows, chance, seed, reserved) {
    var rand = rng(seed);
    var h = rows.length;
    var w = rows[0].length;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        if (rows[y][x] !== ".") continue;
        if (reserved[x + "," + y]) continue;
        var near = false;
        for (var j = -1; j <= 1 && !near; j++) {
          for (var i = -1; i <= 1; i++) {
            var rr = rows[y + j];
            if (rr && rr[x + i] === ",") near = true;
          }
        }
        if (near) continue;
        if (rand() < chance) rows[y][x] = "t";
      }
    }
  }

  function seal(rows) {
    return rows.map(function (r) { return r.join(""); });
  }

  function npc(id, name, tx, ty, lines, again, grant) {
    return { id: id, name: name, tx: tx, ty: ty, kind: "person", lines: lines, again: again, grant: grant || null };
  }

  function sign(id, tx, ty, lines) {
    return { id: id, name: "Notice", tx: tx, ty: ty, kind: "sign", lines: lines, again: lines, grant: null };
  }

  function item(id, kind, name, tx, ty) {
    return { id: id, kind: kind, name: name, tx: tx, ty: ty };
  }

  function buildTown() {
    var w = 24;
    var h = 16;
    var rows = blank(w, h, ".");
    fill(rows, 11, 0, 2, h, ",");
    fill(rows, 0, 8, w, 3, ",");
    var clinic = building(rows, 2, 2, 8, 6, "s", "i", "#");
    var shed = building(rows, 15, 2, 7, 6, "s", "i", "#");
    rows[12][4] = "t";
    rows[12][5] = "t";
    rows[13][18] = "t";
    rows[12][19] = "t";
    rows[12][8] = "l";
    rows[12][16] = "l";
    rows[13][20] = "c";
    rows[6][16] = "c";
    border(rows, "#");
    fill(rows, 11, 0, 2, 1, ",");
    fill(rows, 11, h - 1, 2, 1, ",");
    fill(rows, 0, 8, 1, 3, ",");
    fill(rows, w - 1, 8, 1, 3, ",");
    return {
      id: "town",
      name: "Ashfen",
      theme: "town",
      safe: false,
      w: w,
      h: h,
      rows: seal(rows),
      exits: [
        { tx: 11, ty: 0, tw: 2, th: 1, to: "woods", sx: 12, sy: 17 },
        { tx: 11, ty: h - 1, tw: 2, th: 1, to: "cordon", sx: 12, sy: 2 },
        { tx: 0, ty: 8, tw: 1, th: 3, to: "mill", sx: 16, sy: 8 },
        { tx: w - 1, ty: 8, tw: 1, th: 3, to: "road", sx: 2, sy: 6 }
      ],
      gates: [],
      npcs: [
        npc(
          "lumen",
          "Dr. Lumen",
          4,
          4,
          [
            "You reached Ashfen. I am Dr. Lumen. Three plagues are loose, and none of them exist outside this valley.",
            "Sporeveil creeps across ground. Rushfever lives in people who sprint, then slump. Amberhaze is fog that keeps a route.",
            "Take this cloth mask. It slows a bloom or a fog. It will not stop a tackle. Safe Haven is south of the cordon."
          ],
          ["South of the cordon. Do not stand in violet ground, and do not let the sprinters touch you."],
          "mask"
        ),
        sign("town-sign", 9, 12, [
          "Ashfen square. Clinic to the west. The mill is further west. Woods north. Cordon south. Glassport lies east."
        ])
      ],
      items: [item("town-ration", "ration", "Supplies", 17, 4)],
      enemies: [],
      spore: null,
      hazes: [],
      win: null,
      _doors: { clinic: clinic.door, shed: shed.door }
    };
  }

  function buildWoods() {
    var w = 26;
    var h = 20;
    var rows = blank(w, h, ".");
    carve(rows, [[12, 18], [12, 14], [7, 14], [7, 9], [13, 9], [13, 6], [20, 6], [20, 7]], ",");
    fill(rows, 2, 4, 4, 3, "w");
    var shrine = building(rows, 18, 2, 6, 5, "s", "i", "b");
    border(rows, "t");
    fill(rows, 12, h - 1, 2, 1, ",");
    var reserved = { "15,16": 1, "9,11": 1, "20,4": 1, "15,12": 1, "16,12": 1, "16,13": 1 };
    scatter(rows, 0.34, 0x51a7, reserved);
    rows[15][12] = ".";
    rows[16][12] = ".";
    rows[16][13] = ".";
    rows[11][8] = ",";
    rows[16][13] = ",";
    rows[16][15] = ".";
    return {
      id: "woods",
      name: "Whisperwood",
      theme: "woods",
      safe: false,
      w: w,
      h: h,
      rows: seal(rows),
      exits: [{ tx: 12, ty: h - 1, tw: 2, th: 1, to: "town", sx: 11, sy: 2 }],
      gates: [],
      npcs: [
        npc(
          "bram",
          "Bram",
          13,
          16,
          [
            "Bram. I keep this trail. That violet carpet is Sporeveil. It grows a tile at a time while you linger.",
            "The Rust Key is in the standing-stone shrine to the northwest. Walk the pale path, and do not picnic in the bloom."
          ],
          ["Shrine's northwest. The bloom creeps. You do not have to."]
        )
      ],
      items: [
        item("woods-tonic", "tonic", "Field Tonic", 8, 11),
        item("woods-rust", "rust", "Rust Key", 20, 4)
      ],
      enemies: [],
      spore: { interval: 3.1, max: 34, seeds: [[15, 12], [16, 12], [16, 13]] },
      hazes: [],
      win: null,
      _doors: { shrine: shrine.door }
    };
  }

  function buildMill() {
    var w = 20;
    var h = 14;
    var rows = blank(w, h, ".");
    fill(rows, 1, 1, 18, 3, "w");
    var room = building(rows, 2, 5, 8, 6, "s", "i", "#");
    rows[8][14] = "c";
    rows[7][15] = "l";
    border(rows, "#");
    fill(rows, w - 1, 7, 1, 3, ",");
    return {
      id: "mill",
      name: "Old Mill",
      theme: "mill",
      safe: false,
      w: w,
      h: h,
      rows: seal(rows),
      exits: [{ tx: w - 1, ty: 7, tw: 1, th: 3, to: "town", sx: 2, sy: 8 }],
      gates: [
        {
          id: "mill-door",
          tx: room.door.tx,
          ty: room.door.ty,
          tw: room.door.tw,
          th: room.door.th,
          need: "rust",
          locked: "The storeroom lock is rusted shut. It wants the Rust Key from Whisperwood.",
          open: "The rusted lock turns."
        }
      ],
      npcs: [
        sign("mill-sign", 5, 8, [
          "Supplies for the road. Glassport's clinic keeps a Cord Key. The cordon is south of Ashfen."
        ])
      ],
      items: [
        item("mill-ration-a", "ration", "Supplies", 4, 7),
        item("mill-ration-b", "ration", "Supplies", 6, 7)
      ],
      enemies: [],
      spore: null,
      hazes: [],
      win: null
    };
  }

  function buildRoad() {
    var w = 30;
    var h = 14;
    var rows = blank(w, h, ".");
    fill(rows, 0, 5, w, 3, ",");
    fill(rows, 2, 4, 26, 1, "f");
    fill(rows, 2, 9, 26, 1, "f");
    rows[4][10] = ".";
    rows[9][18] = ".";
    rows[3][8] = "l";
    rows[3][20] = "l";
    rows[11][4] = "t";
    rows[11][5] = "t";
    rows[2][24] = "t";
    rows[2][25] = "t";
    rows[11][26] = "t";
    border(rows, "t");
    fill(rows, 0, 5, 1, 3, ",");
    fill(rows, w - 1, 5, 1, 3, ",");
    rows[10][18] = ".";
    rows[10][19] = ".";
    rows[11][20] = ".";
    rows[8][6] = ".";
    rows[10][21] = ".";
    return {
      id: "road",
      name: "Lantern Road",
      theme: "road",
      safe: false,
      w: w,
      h: h,
      rows: seal(rows),
      exits: [
        { tx: 0, ty: 5, tw: 1, th: 3, to: "town", sx: 20, sy: 8 },
        { tx: w - 1, ty: 5, tw: 1, th: 3, to: "city", sx: 2, sy: 10 }
      ],
      gates: [],
      npcs: [
        npc(
          "porter",
          "Porter Ness",
          8,
          6,
          [
            "Porter Ness. I keep these lanterns lit. Glassport is east, and Rushfever is walking its streets.",
            "They charge when they see you, then they have to rest. Corners break their view. The Cord Key is in the north clinic."
          ],
          ["Charge, then rest. Move on the rest."]
        )
      ],
      items: [item("road-ration", "ration", "Supplies", 22, 8)],
      enemies: [],
      spore: { interval: 4.4, max: 16, seeds: [[18, 10], [19, 10], [21, 10]] },
      hazes: [],
      win: null
    };
  }

  function buildCity() {
    var w = 28;
    var h = 22;
    var rows = blank(w, h, ".");
    fill(rows, 0, 9, w, 3, ",");
    fill(rows, 5, 1, 4, 20, ",");
    fill(rows, 16, 1, 4, 20, ",");
    var clinic = building(rows, 9, 1, 7, 8, "s", "i", "#");
    building(rows, 1, 1, 4, 8, "e", "i", "#");
    building(rows, 20, 1, 7, 8, "w", "i", "#");
    building(rows, 9, 13, 7, 8, "n", "i", "#");
    building(rows, 1, 13, 4, 8, "e", "i", "#");
    building(rows, 20, 13, 7, 8, "w", "i", "#");
    fill(rows, 10, 2, 4, 1, "b");
    rows[12][3] = "l";
    rows[12][22] = "l";
    border(rows, "#");
    fill(rows, 0, 9, 1, 3, ",");
    return {
      id: "city",
      name: "Glassport",
      theme: "city",
      safe: false,
      w: w,
      h: h,
      rows: seal(rows),
      exits: [{ tx: 0, ty: 9, tw: 1, th: 3, to: "road", sx: 26, sy: 6 }],
      gates: [],
      npcs: [
        npc(
          "quill",
          "Archivist Quill",
          11,
          5,
          [
            "Archivist Quill. The clinic staff left me the Cord Key and a ringing head.",
            "It is on the counter. The quarantine lab, east of the cordon, will ask for it."
          ],
          ["The Cord Key is on the counter. I am not standing on it."]
        )
      ],
      items: [
        item("city-cord", "cord", "Cord Key", 13, 3),
        item("city-tonic", "tonic", "Field Tonic", 22, 16)
      ],
      enemies: [
        { id: "city-a", tx: 14, ty: 10, route: [[10, 10], [24, 10]] },
        { id: "city-b", tx: 6, ty: 4, route: [[6, 3], [6, 18]] },
        { id: "city-c", tx: 18, ty: 16, route: [[18, 4], [18, 18]] }
      ],
      spore: null,
      hazes: [],
      win: null,
      _doors: { clinic: clinic.door }
    };
  }

  function buildCordon() {
    var w = 26;
    var h = 18;
    var rows = blank(w, h, ".");
    fill(rows, 1, 3, w - 2, 1, "=");
    fill(rows, 21, 3, 2, 1, ".");
    fill(rows, 1, 6, w - 2, 1, "=");
    fill(rows, 3, 6, 2, 1, ".");
    fill(rows, 1, 9, w - 2, 1, "=");
    fill(rows, 21, 9, 2, 1, ".");
    fill(rows, 1, 12, w - 2, 1, "=");
    fill(rows, 3, 12, 2, 1, ".");
    rows[1][8] = "l";
    rows[15][18] = "c";
    border(rows, "#");
    fill(rows, 12, 0, 2, 1, ",");
    fill(rows, 12, h - 1, 2, 1, ",");
    fill(rows, w - 1, 14, 1, 2, ",");
    return {
      id: "cordon",
      name: "The Cordon",
      theme: "cordon",
      safe: false,
      w: w,
      h: h,
      rows: seal(rows),
      exits: [{ tx: 12, ty: 0, tw: 2, th: 1, to: "town", sx: 11, sy: 12 }],
      gates: [
        {
          id: "lab-door",
          tx: w - 1,
          ty: 14,
          tw: 1,
          th: 2,
          need: "cord",
          locked: "The lab door is barred. It takes the Cord Key from Glassport.",
          open: "The Cord Key opens the field lab.",
          to: "lab",
          sx: 2,
          sy: 13
        },
        {
          id: "haven-gate",
          tx: 12,
          ty: h - 1,
          tw: 2,
          th: 1,
          need: "seal",
          locked: "The haven gate is shut. A round seal fits this lock.",
          open: "The Haven Seal seats. The gate opens.",
          to: "haven",
          sx: 9,
          sy: 2
        }
      ],
      npcs: [
        npc(
          "ilya",
          "Warden Ilya",
          4,
          1,
          [
            "Warden Ilya. Amberhaze does not hate you. It also does not stop. It walks these lanes on a loop.",
            "East door wants the Cord Key. South gate wants the Haven Seal from the lab. Wait for a gap, or dash a thin bank."
          ],
          ["The fog keeps a schedule. You are allowed to be faster than a schedule."]
        )
      ],
      items: [item("cordon-ration", "ration", "Supplies", 8, 15)],
      enemies: [{ id: "cordon-a", tx: 6, ty: 16, route: [[4, 16], [10, 16]] }],
      spore: null,
      hazes: [
        { axis: "x", tx: 1, ty: 4, tw: 7, th: 2, minTx: 1, maxTx: 17, speed: 38, phase: 0 },
        { axis: "x", tx: 8, ty: 7, tw: 7, th: 2, minTx: 1, maxTx: 17, speed: 30, phase: 2.2 },
        { axis: "x", tx: 3, ty: 10, tw: 6, th: 2, minTx: 1, maxTx: 18, speed: 44, phase: 1.1 }
      ],
      win: null
    };
  }

  function buildLab() {
    var w = 18;
    var h = 16;
    var rows = blank(w, h, "i");
    fill(rows, 1, 2, 5, 5, "b");
    fill(rows, 1, 9, 5, 4, "b");
    fill(rows, 12, 2, 5, 5, "b");
    fill(rows, 12, 9, 5, 4, "b");
    border(rows, "#");
    fill(rows, 0, 13, 1, 2, ",");
    rows[2][8] = "i";
    rows[8][3] = "i";
    return {
      id: "lab",
      name: "Field Lab",
      theme: "lab",
      safe: false,
      w: w,
      h: h,
      rows: seal(rows),
      exits: [{ tx: 0, ty: 13, tw: 1, th: 2, to: "cordon", sx: 22, sy: 14 }],
      gates: [],
      npcs: [],
      items: [
        item("lab-seal", "seal", "Haven Seal", 8, 2),
        item("lab-tonic", "tonic", "Field Tonic", 3, 8)
      ],
      enemies: [],
      spore: null,
      hazes: [{ axis: "y", tx: 6, ty: 4, tw: 5, th: 3, minTy: 4, maxTy: 10, speed: 28, phase: 0.4 }],
      win: null
    };
  }

  function buildHaven() {
    var w = 20;
    var h = 16;
    var rows = blank(w, h, ".");
    fill(rows, 9, 1, 2, 12, ",");
    for (var j = 0; j < 4; j++) {
      for (var i = 0; i < 4; i++) {
        var edge = i === 0 || j === 0 || i === 3 || j === 3;
        rows[6 + j][3 + i] = edge ? "o" : "w";
      }
    }
    rows[4][2] = "*";
    rows[4][7] = "*";
    rows[11][2] = "*";
    rows[11][7] = "*";
    rows[12][14] = "*";
    rows[13][16] = "*";
    rows[5][15] = "*";
    rows[8][14] = "l";
    rows[8][16] = "l";
    border(rows, "#");
    fill(rows, 9, 0, 2, 1, ",");
    return {
      id: "haven",
      name: "Safe Haven",
      theme: "haven",
      safe: true,
      w: w,
      h: h,
      rows: seal(rows),
      exits: [{ tx: 9, ty: 0, tw: 2, th: 1, to: "cordon", sx: 12, sy: 14 }],
      gates: [],
      npcs: [
        npc(
          "sol",
          "Keeper Sol",
          12,
          8,
          [
            "Keeper Sol. The air on this side of the gate stays still. You can breathe it on purpose.",
            "Stand on the pale stone when you want the road to count as finished."
          ],
          ["The pale stone is there whenever you want the ending."]
        )
      ],
      items: [],
      enemies: [],
      spore: null,
      hazes: [],
      win: { tx: 9, ty: 11, tw: 2, th: 2 }
    };
  }

  function buildWorld() {
    var list = [buildTown(), buildWoods(), buildMill(), buildRoad(), buildCity(), buildCordon(), buildLab(), buildHaven()];
    var maps = {};
    list.forEach(function (m) { maps[m.id] = m; });
    return {
      SOLID: SOLID,
      START: { map: "town", tx: 12, ty: 9 },
      maps: maps
    };
  }

  function inBounds(map, x, y) {
    return x >= 0 && y >= 0 && x < map.w && y < map.h;
  }

  function tile(map, x, y) {
    if (!inBounds(map, x, y)) return "#";
    return map.rows[y][x];
  }

  function isSolid(map, x, y) {
    return !!SOLID[tile(map, x, y)];
  }

  function covers(rect, x, y) {
    return x >= rect.tx && y >= rect.ty && x < rect.tx + rect.tw && y < rect.ty + rect.th;
  }

  function validate(world) {
    var maps = world.maps;
    var errors = [];
    function bad(msg) { errors.push(msg); }

    Object.keys(maps).forEach(function (id) {
      var map = maps[id];
      if (map.rows.length !== map.h) bad(id + " height " + map.rows.length + " != " + map.h);
      map.rows.forEach(function (row, y) {
        if (row.length !== map.w) bad(id + " row " + y + " width " + row.length);
        for (var x = 0; x < row.length; x++) {
          if (!KNOWN[row[x]]) bad(id + " unknown tile '" + row[x] + "' at " + x + "," + y);
        }
      });

      var walk = {};
      var q = [];
      function push(x, y) {
        var k = x + "," + y;
        if (walk[k]) return;
        if (!inBounds(map, x, y)) return;
        if (isSolid(map, x, y)) return;
        walk[k] = 1;
        q.push([x, y]);
      }
      map.exits.forEach(function (e) {
        for (var y = e.ty; y < e.ty + e.th; y++) {
          for (var x = e.tx; x < e.tx + e.tw; x++) push(x, y);
        }
      });
      if (map.exits.length === 0) push(1, 1);
      for (var i = 0; i < q.length; i++) {
        var p = q[i];
        push(p[0] + 1, p[1]);
        push(p[0] - 1, p[1]);
        push(p[0], p[1] + 1);
        push(p[0], p[1] - 1);
      }

      function reachable(x, y) {
        return !!walk[x + "," + y];
      }
      function neighborReachable(x, y) {
        return reachable(x + 1, y) || reachable(x - 1, y) || reachable(x, y + 1) || reachable(x, y - 1) || reachable(x, y);
      }

      map.exits.forEach(function (e) {
        var dest = maps[e.to];
        if (!dest) {
          bad(id + " exit to missing " + e.to);
          return;
        }
        for (var y = e.ty; y < e.ty + e.th; y++) {
          for (var x = e.tx; x < e.tx + e.tw; x++) {
            if (isSolid(map, x, y)) bad(id + " exit tile solid " + x + "," + y);
            if (!reachable(x, y)) bad(id + " exit unreachable " + x + "," + y);
          }
        }
        if (isSolid(dest, e.sx, e.sy)) bad(id + " spawn solid in " + e.to + " " + e.sx + "," + e.sy);
        dest.exits.forEach(function (back) {
          if (covers(back, e.sx, e.sy)) bad(id + " spawn sits on an exit in " + e.to);
        });
        (dest.gates || []).forEach(function (g) {
          if (Math.abs(e.sx - g.tx) <= 2 && Math.abs(e.sy - g.ty) <= 2) {
            bad(id + " spawn too close to gate " + g.id + " in " + e.to);
          }
        });
      });

      (map.gates || []).forEach(function (g) {
        for (var y = g.ty; y < g.ty + g.th; y++) {
          for (var x = g.tx; x < g.tx + g.tw; x++) {
            if (isSolid(map, x, y)) bad(id + " gate " + g.id + " on solid " + x + "," + y);
          }
        }
        if (!neighborReachable(g.tx, g.ty)) bad(id + " gate " + g.id + " unreachable");
        if (g.to && !maps[g.to]) bad(id + " gate to missing " + g.to);
      });

      map.npcs.forEach(function (n) {
        if (isSolid(map, n.tx, n.ty)) bad(id + " npc " + n.id + " on solid");
        if (!neighborReachable(n.tx, n.ty)) bad(id + " npc " + n.id + " unreachable");
      });
      map.items.forEach(function (it) {
        if (isSolid(map, it.tx, it.ty)) bad(id + " item " + it.id + " on solid");
        if (!reachable(it.tx, it.ty)) bad(id + " item " + it.id + " unreachable");
      });
      map.enemies.forEach(function (en) {
        en.route.forEach(function (pt) {
          if (isSolid(map, pt[0], pt[1])) bad(id + " enemy " + en.id + " waypoint solid " + pt);
          if (!reachable(pt[0], pt[1])) bad(id + " enemy " + en.id + " waypoint unreachable " + pt);
        });
      });
      if (map.spore) {
        map.spore.seeds.forEach(function (s) {
          var ch = tile(map, s[0], s[1]);
          if (!".,*".includes(ch) && ch !== ".") bad(id + " spore seed bad tile " + ch + " at " + s);
          if (isSolid(map, s[0], s[1])) bad(id + " spore on solid " + s);
        });
      }
      if (map.win) {
        if (isSolid(map, map.win.tx, map.win.ty)) bad(id + " win pad solid");
        if (!reachable(map.win.tx, map.win.ty)) bad(id + " win pad unreachable");
      }
    });

    var start = world.START;
    var town = maps[start.map];
    if (isSolid(town, start.tx, start.ty)) bad("start solid");
    if (errors.length) {
      var err = new Error("World validation failed:\n" + errors.join("\n"));
      err.errors = errors;
      throw err;
    }
  }

  var world = buildWorld();
  validate(world);
  root.PRWorld = world;
})(typeof globalThis !== "undefined" ? globalThis : this);
