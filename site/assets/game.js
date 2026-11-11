/* Pandemicradar client: side-view platformer, online when the server answers, offline otherwise. */
(function () {
  "use strict";

  var SAVE_KEY = "pandemicradar.mmo.v1";
  var canvas = document.getElementById("view");
  var ctx = canvas.getContext("2d", { alpha: false });
  var content = null;
  var save = null;
  var map = null;
  var player = null;
  var playing = false;
  var mode = "offline";
  var ws = null;
  var myId = null;
  var connectTimer = 0;
  var remotes = {};
  var netMonsters = [];
  var particles = [];
  var bubbles = {};
  var ghosts = [];
  var seenMobs = {};
  var levelGlow = 0;
  var cam = { x: 0, y: 0, id: "" };
  var rooms = {};
  var party = [];
  var people = [];
  var peopleSig = "";
  var partySig = "";
  var keys = {};
  var edges = {};
  var taps = {};
  var pad = {};
  var animTime = 0;
  var portalLock = 0;
  var attackLock = 0;
  var sendAcc = 0;
  var floaters = [];
  var toasts = [];
  var dialog = null;
  var uiLock = false;
  var loopLast = 0;

  function $(id) { return document.getElementById(id); }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function serverUrl() {
    var query = new URLSearchParams(location.search).get("server");
    if (query) return query;
    return (window.PR_CONFIG && window.PR_CONFIG.serverUrl) || "";
  }

  function mapById(id) {
    for (var i = 0; i < content.maps.length; i++) {
      if (content.maps[i].id === id) return content.maps[i];
    }
    return content.maps[0];
  }

  function maxHp() { return PRSim.maxHpFor(content, save.level); }

  function fresh(name) {
    var start = mapById("ashfen").spawn;
    return {
      v: 1,
      name: name,
      level: 1,
      exp: 0,
      hp: content.hpBase,
      infection: 0,
      notes: 0,
      mask: false,
      tonics: 1,
      kills: { sporeling: 0, rusher: 0, mite: 0 },
      quests: {},
      haven: false,
      map: "ashfen",
      x: start.x,
      y: start.y
    };
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.v !== 1 || !data.name) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  function persist() {
    if (!save) return;
    save.map = map.id;
    save.x = player.x;
    save.y = player.y;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (err) { /* private mode */ }
  }

  function toast(text) {
    toasts.push({ text: text, t: 2.2 });
  }

  function log(htmlClass, text) {
    var row = document.createElement("p");
    row.className = htmlClass || "";
    row.textContent = text;
    var box = $("log");
    box.appendChild(row);
    while (box.children.length > 40) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  function validName(name) {
    var trimmed = String(name || "").replace(/\s+/g, " ").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,11}$/.test(trimmed) || trimmed.length < 2) return "";
    return trimmed;
  }

  function makePlayer(x, y) {
    return {
      x: x, y: y, w: content.player.w, h: content.player.h,
      vx: 0, vy: 0, facing: 1, onGround: true, climb: null,
      drop: 0, coyote: 0, jumpBuf: 0, attack: 0, hurt: 0, frame: 0
    };
  }

  function placeOn(mapId, x, y) {
    map = mapById(mapId);
    player.x = x;
    player.y = y;
    player.vx = 0;
    player.vy = 0;
    player.climb = null;
    save.map = map.id;
    save.x = x;
    save.y = y;
  }

  function online() { return mode === "online" && ws && ws.readyState === 1; }

  function send(msg) {
    if (!online()) return;
    try { ws.send(JSON.stringify(msg)); } catch (err) { /* closed */ }
  }

  function sendState() {
    if (!online() || !player) return;
    send({
      t: "state",
      map: map.id,
      x: player.x,
      y: player.y,
      facing: player.facing,
      vx: player.vx,
      vy: player.vy,
      anim: animName()
    });
  }

  function animName() {
    if (player.attack > 0) return "attack";
    if (player.climb) return "climb";
    if (!player.onGround) return "jump";
    if (Math.abs(player.vx) > 1) return "walk";
    return "idle";
  }

  function failConnect(reason) {
    if (ws) {
      ws.onclose = null;
      try { ws.close(); } catch (err) { /* already closed */ }
    }
    ws = null;
    mode = "offline";
    $("connect").hidden = true;
    if (!playing) begin(false);
    toast(reason || "Playing offline.");
    log("sys", reason || "Offline.");
    syncHud();
  }

  function connect(name) {
    var url = serverUrl();
    if (!url) {
      begin(false);
      toast("No server is configured. Walking offline.");
      log("sys", "Set serverUrl in assets/config.js to play with other people.");
      return;
    }
    mode = "connecting";
    $("connect").hidden = false;
    $("connect-text").textContent = "Waking the server…";
    $("title").hidden = true;
    try { ws = new WebSocket(url); }
    catch (err) {
      failConnect("That server address could not be opened.");
      return;
    }
    connectTimer = window.setTimeout(function () {
      failConnect("The server did not answer. Walking offline.");
    }, 20000);
    ws.onopen = function () {
      ws.send(JSON.stringify({
        t: "join",
        name: name,
        map: save.map,
        x: player.x,
        y: player.y,
        level: save.level
      }));
    };
    ws.onmessage = function (ev) { onNet(ev.data); };
    ws.onerror = function () { /* close follows */ };
    ws.onclose = function () {
      if (mode === "connecting") failConnect("Could not reach the server. Walking offline.");
      else if (mode === "online") {
        mode = "offline";
        myId = null;
        remotes = {};
        netMonsters = [];
        party = [];
        people = [];
        toast("Connection lost. You are offline.");
        log("sys", "Connection lost. Monsters nearby are yours alone now.");
        syncHud();
      }
    };
  }

  function onNet(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (err) { return; }
    if (msg.t === "reject") {
      window.clearTimeout(connectTimer);
      mode = "offline";
      $("connect").hidden = true;
      $("title").hidden = false;
      if (ws) { ws.onclose = null; ws.close(); }
      toast(msg.reason);
      return;
    }
    if (msg.t === "welcome") {
      window.clearTimeout(connectTimer);
      mode = "online";
      myId = msg.id;
      $("connect").hidden = true;
      if (!playing) begin(true);
      log("sys", "Linked. Other travelers on this map can see you.");
      toast("Online.");
      syncHud();
      return;
    }
    if (msg.t === "snap") applySnap(msg);
    else if (msg.t === "fx") applyFx(msg);
    else if (msg.t === "chat") {
      log(msg.name === save.name ? "me" : "", msg.name + ": " + msg.text);
      bubbles[msg.name] = { text: String(msg.text).slice(0, 48), t: 3.4 };
    }
    else if (msg.t === "sys") log("sys", msg.text);
    else if (msg.t === "invite") {
      $("invite").hidden = false;
      $("invite-text").textContent = msg.from + " offers a party.";
      $("invite").dataset.from = msg.fromId;
    }
  }

  function applySnap(msg) {
    var next = {};
    people = [];
    (msg.players || []).forEach(function (p) {
      if (p.id === myId) return;
      people.push(p);
      var prev = remotes[p.id];
      if (!prev) {
        remotes[p.id] = { id: p.id, name: p.name, x: p.x, y: p.y, tx: p.x, ty: p.y, facing: p.facing, anim: p.anim, level: p.level, attacking: p.attacking };
      } else {
        prev.tx = p.x;
        prev.ty = p.y;
        if (document.hidden) { prev.x = p.x; prev.y = p.y; }
        prev.facing = p.facing;
        prev.anim = p.anim;
        prev.level = p.level;
        prev.attacking = p.attacking;
        prev.name = p.name;
        next[p.id] = prev;
      }
      if (!prev) next[p.id] = remotes[p.id];
    });
    Object.keys(remotes).forEach(function (id) {
      if (!next[id]) delete remotes[id];
    });
    var incoming = msg.monsters || [];
    var ids = {};
    incoming.forEach(function (m) {
      ids[m.id] = 1;
      var old = seenMobs[m.id];
      if (old && m.hp < old.hp) {
        m.hitUntil = animTime + 0.16;
        spark(m.x + 8, m.y, "#fff6d0", 5);
      } else if (old) m.hitUntil = old.hitUntil;
      seenMobs[m.id] = m;
    });
    Object.keys(seenMobs).forEach(function (id) {
      if (!ids[id]) {
        ghosts.push({ kind: seenMobs[id].kind, x: seenMobs[id].x, y: seenMobs[id].y, t: 0.5 });
        spark(seenMobs[id].x, seenMobs[id].y, "#f4f0e4", 7);
        delete seenMobs[id];
      }
    });
    netMonsters = incoming;
    party = msg.party || [];
    renderLists();
  }

  function applyFx(msg) {
    if (msg.type === "mdmg") {
      floaters.push({ x: msg.x, y: msg.y - 8, text: String(msg.amount), t: 0.7, color: "#fff6d0" });
      spark(msg.x, msg.y, "#fff6d0", 4);
      if (msg.killed && msg.who === myId) { /* reward message follows */ }
    } else if (msg.type === "pdmg" && msg.who === myId) {
      save.hp = Math.max(0, save.hp - msg.amount);
      save.infection = clamp(save.infection + (msg.infection || 0), 0, 100);
      player.vy = -120;
      player.hurt = 0.6;
      floaters.push({ x: player.x, y: player.y - 10, text: String(msg.amount), t: 0.7, color: "#ffb0b4" });
      spark(player.x, player.y, "#ffb0b4", 5);
      if (save.hp <= 0) collapse();
    } else if (msg.type === "reward" && msg.who === myId) {
      save.notes += msg.notes || 0;
      if (!msg.shared) {
        save.kills[msg.kind] = (save.kills[msg.kind] || 0) + 1;
        noteKill(msg.kind);
      }
      addExp(msg.exp || 0);
      if (msg.notes) toast("+" + msg.notes + " notes");
      persist();
    }
  }

  function addExp(amount) {
    save.exp += amount;
    var leveled = false;
    var need = PRSim.expToNext(content, save.level);
    while (save.exp >= need && save.level < 50) {
      save.exp -= need;
      save.level += 1;
      save.hp = maxHp();
      need = PRSim.expToNext(content, save.level);
      leveled = true;
    }
    if (leveled) {
      toast("Level " + save.level);
      levelGlow = 1.15;
      spark(player.x, player.y - 20, "#ffe08a", 14);
      blip(660, 0.12);
      if (online()) send({ t: "progress", level: save.level });
    }
  }

  function collapse() {
    var spawn = map.spawn;
    save.hp = Math.max(1, Math.round(maxHp() * 0.55));
    save.infection = 15;
    placeOn(map.id, spawn.x, spawn.y);
    toast("You collapsed and woke by the arch.");
    persist();
  }

  function begin(isOnline) {
    playing = true;
    $("title").hidden = true;
    $("connect").hidden = true;
    mode = isOnline ? "online" : "offline";
    canvas.focus();
    syncHud();
  }

  function held(name) {
    return !!(keys[name] || pad[name]);
  }

  function pressed(name) {
    var down = held(name);
    if (down && !edges[name]) {
      edges[name] = true;
      return true;
    }
    if (!down) edges[name] = false;
    return false;
  }

  function consume(name) {
    if (taps[name]) {
      taps[name] = false;
      edges[name] = true;
      return true;
    }
    return pressed(name);
  }

  function bodyOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function zoneBox(z) {
    if (!z.drift) return z;
    return {
      x: z.x + Math.sin(animTime * z.drift + (z.phase || 0)) * (z.amp || 0),
      y: z.y,
      w: z.w,
      h: z.h
    };
  }

  function ladderHere() {
    var cx = player.x + player.w / 2;
    var list = map.ladders || [];
    for (var i = 0; i < list.length; i++) {
      var ladder = list[i];
      if (cx >= ladder.x - 4 && cx <= ladder.x + ladder.w + 4 && player.y < ladder.y + ladder.h && player.y + player.h > ladder.y - 4) {
        return ladder;
      }
    }
    return null;
  }

  function nearNpc() {
    var best = null;
    var bestD = 42;
    (map.npcs || []).forEach(function (npc) {
      var dx = (npc.x + 8) - (player.x + player.w / 2);
      var dy = (npc.y + 10) - (player.y + player.h / 2);
      var dist = Math.hypot(dx, dy);
      if (dist < bestD) { bestD = dist; best = npc; }
    });
    return best;
  }

  function stepPlayer(dt) {
    var phys = content.physics;
    if (player.drop > 0) player.drop -= dt;
    if (player.attack > 0) player.attack -= dt;
    if (player.hurt > 0) player.hurt -= dt;
    if (portalLock > 0) portalLock -= dt;
    var jumpEdge = consume("jump");
    var upEdge = consume("up");
    var ladder = ladderHere();

    if (!uiLock && upEdge && player.onGround) {
      var npc = nearNpc();
      if (npc) { openDialog(npc); return; }
    }

    if (player.climb) {
      if (!ladder) player.climb = null;
      else if (!uiLock && (held("left") || held("right") || jumpEdge)) {
        player.facing = held("left") ? -1 : 1;
        player.climb = null;
        player.vx = (held("left") ? -1 : held("right") ? 1 : player.facing) * phys.speed;
        player.vy = jumpEdge ? phys.jump * 0.72 : 0;
      } else {
        player.vx = 0;
        player.vy = 0;
        player.x = ladder.x + ladder.w / 2 - player.w / 2;
        if (!uiLock && held("up")) player.vy = -phys.climb;
        else if (!uiLock && held("down")) player.vy = phys.climb;
        if (player.y + player.h <= ladder.deck + 16) {
          player.climb = null;
          player.y = ladder.deck - player.h;
          player.vy = 0;
          player.onGround = true;
        }
      }
    } else if (!uiLock && ladder && held("up")) {
      player.climb = ladder;
      player.x = ladder.x + ladder.w / 2 - player.w / 2;
      player.vx = 0;
      player.vy = -phys.climb;
    } else if (!uiLock && ladder && held("down") && player.onGround && player.y + player.h <= ladder.y + 8) {
      player.climb = ladder;
      player.drop = 0.2;
      player.y += 4;
      player.vx = 0;
    }

    if (!player.climb && !uiLock) {
      if (held("left")) { player.vx = -phys.speed; player.facing = -1; }
      else if (held("right")) { player.vx = phys.speed; player.facing = 1; }
      else player.vx = 0;
      if (player.onGround) player.coyote = 0.1;
      else player.coyote -= dt;
      if (jumpEdge) player.jumpBuf = 0.12;
      else player.jumpBuf -= dt;
      if (player.jumpBuf > 0 && player.coyote > 0) {
        if (held("down")) {
          player.drop = 0.22;
          player.vy = 60;
        } else player.vy = phys.jump;
        player.jumpBuf = 0;
        player.coyote = 0;
        player.onGround = false;
      }
      player.vy = Math.min(phys.fall, player.vy + phys.gravity * dt);
    }

    var prevFeet = player.y + player.h;
    player.x += player.vx * dt;
    resolveWalls();
    player.y += player.vy * dt;
    player.onGround = false;
    resolveGround(prevFeet);
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > map.width) player.x = map.width - player.w;
    if (player.y > map.height + 30) collapse();
    if (Math.abs(player.vx) > 1 && player.onGround) player.frame += dt * 8;
    tryPortal();
  }

  function resolveWalls() {
    var solids = map.solids || [];
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.oneWay) continue;
      if (player.y + player.h <= s.y + 8) continue;
      if (!bodyOverlap(player, s)) continue;
      if (player.vx > 0) player.x = s.x - player.w;
      else if (player.vx < 0) player.x = s.x + s.w;
      else if (player.x + player.w / 2 < s.x + s.w / 2) player.x = s.x - player.w;
      else player.x = s.x + s.w;
      player.vx = 0;
    }
  }

  function resolveGround(prevFeet) {
    var solids = map.solids || [];
    var feet = player.y + player.h;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var overlapX = player.x + 2 < s.x + s.w && player.x + player.w - 2 > s.x;
      if (!overlapX) continue;
      if (s.oneWay) {
        if (player.drop > 0 || player.vy < 0 || player.climb) continue;
        if (prevFeet <= s.y + 3 && feet >= s.y && feet <= s.y + 18) {
          player.y = s.y - player.h;
          player.vy = 0;
          player.onGround = true;
        }
      } else if (player.vy >= 0 && player.y < s.y && feet >= s.y && prevFeet <= s.y + 6) {
        player.y = s.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }

  function tryPortal() {
    if (portalLock > 0 || uiLock) return;
    var portals = map.portals || [];
    for (var i = 0; i < portals.length; i++) {
      var portal = portals[i];
      if (!bodyOverlap(player, portal)) continue;
      portalLock = 0.75;
      placeOn(portal.to, portal.toX, portal.toY);
      toast(map.name);
      persist();
      sendState();
      return;
    }
  }

  function monsters() {
    return online() ? netMonsters : (rooms[map.id] || (rooms[map.id] = PRSim.makeMonsters(map, content)));
  }

  function stepOffline(dt) {
    if (online() || uiLock) return;
    var list = monsters();
    var hurts = PRSim.stepMonsters(list, [{
      id: "local",
      map: map.id,
      x: player.x,
      y: player.y,
      w: player.w,
      h: player.h
    }], dt, animTime * 1000, content);
    if (player.hurt > 0) return;
    hurts.forEach(function (hurt) {
      player.hurt = 0.7;
      player.vy = -120;
      save.hp = Math.max(0, save.hp - hurt.amount);
      save.infection = clamp(save.infection + hurt.infection, 0, 100);
      floaters.push({ x: player.x, y: player.y - 8, text: String(hurt.amount), t: 0.7, color: "#e15d6a" });
      if (save.hp <= 0) collapse();
    });
  }

  function stepZones(dt) {
    var rate = 0;
    (map.zones || []).forEach(function (zone) {
      if (bodyOverlap(player, zoneBox(zone))) rate += zone.dps || 8;
    });
    if (save.mask && rate > 0) rate *= 0.5;
    if (rate > 0) save.infection = clamp(save.infection + rate * dt, 0, 100);
    else save.infection = Math.max(0, save.infection - 5 * dt);
    if (save.infection >= 100) {
      save.hp = Math.max(0, save.hp - 8 * dt);
      if (save.hp <= 0) collapse();
    }
  }

  function tryAttack() {
    if (uiLock || player.attack > 0 || attackLock > 0) return;
    player.attack = 0.18;
    attackLock = 0.42;
    blip(210, 0.05);
    if (online()) {
      sendState();
      send({ t: "attack" });
      return;
    }
    var hits = PRSim.applyAttack(monsters(), {
      map: map.id,
      x: player.x,
      y: player.y,
      w: player.w,
      h: player.h,
      facing: player.facing,
      level: save.level
    }, animTime * 1000, content);
    hits.forEach(function (hit) {
      var struck = monsters().filter(function (m) { return m.id === hit.id; })[0];
      if (struck) struck.hitUntil = animTime + 0.16;
      floaters.push({ x: hit.x, y: hit.y - 6, text: String(hit.amount), t: 0.7, color: "#fff6d0" });
      spark(hit.x, hit.y, "#fff6d0", 4);
      if (hit.killed) {
        var kind = content.kinds[hit.kind];
        save.kills[hit.kind] = (save.kills[hit.kind] || 0) + 1;
        save.notes += kind.notes;
        addExp(kind.exp);
        toast(hit.kind + " down. +" + kind.notes + " notes");
        noteKill(hit.kind);
        persist();
      }
    });
  }

  function useTonic() {
    if (uiLock) return;
    if (save.tonics <= 0) { toast("No Field Tonic."); return; }
    if (save.hp >= maxHp() && save.infection <= 0) { toast("You don't need a tonic."); return; }
    save.tonics -= 1;
    save.hp = Math.min(maxHp(), save.hp + 30);
    save.infection = Math.max(0, save.infection - 25);
    toast("The tonic burns the fever down.");
    blip(640, 0.08);
    persist();
  }

  function useBandage() {
    if (save.hp >= maxHp()) { toast("You are not hurt."); return false; }
    save.hp = Math.min(maxHp(), save.hp + 22);
    toast("Bandage.");
    persist();
    return true;
  }

  function questReady(id) {
    if (!save || !save.quests || save.quests[id] === "done") return false;
    if (id === "sol") return !!save.mask;
    var quest = content.quests[id];
    if (!quest || !quest.need) return false;
    return Object.keys(quest.need).every(function (key) {
      return (save.kills[key] || 0) >= quest.need[key];
    });
  }

  function completeQuest(id) {
    var quest = content.quests[id];
    if (!quest || save.quests[id] === "done") return;
    save.quests[id] = "done";
    var reward = quest.reward || {};
    if (reward.mask) save.mask = true;
    if (reward.notes) save.notes += reward.notes;
    if (reward.tonics) save.tonics += reward.tonics;
    if (reward.exp) addExp(reward.exp);
    if (id === "sol") save.haven = true;
    toast(quest.title + " complete.");
    persist();
  }

  function noteKill(kind) {
    var questId = kind === "sporeling" ? "lumen" : kind === "mite" ? "ilya" : "";
    if (!questId || save.quests[questId] === "done") return;
    var need = content.quests[questId].need[kind];
    if ((save.kills[kind] || 0) === need) toast(content.quests[questId].title + " is ready to turn in.");
  }

  function tracker() {
    if (questReady("lumen") || save.quests.lumen !== "done") {
      var need = content.quests.lumen.need.sporeling;
      if (save.quests.lumen === "done") {
        if (save.quests.ilya !== "done") {
          var mites = content.quests.ilya.need.mite;
          return "Amber mites " + Math.min(mites, save.kills.mite || 0) + "/" + mites;
        }
        if (!save.haven) return "Reach Safe Haven";
        return "The air is clean";
      }
      return "Sporelings " + Math.min(need, save.kills.sporeling || 0) + "/" + need;
    }
    return "The air is clean";
  }

  function openDialog(npc) {
    var lines = npc.lines.slice();
    if (npc.quest && questReady(npc.quest)) {
      lines = (npc.ready || npc.lines).slice();
      completeQuest(npc.quest);
    } else if (npc.quest && (save.quests[npc.quest] === "done" || (npc.quest === "sol" && save.haven))) {
      lines = (npc.done || npc.lines).slice();
    }
    dialog = { npc: npc, lines: lines, i: 0 };
    uiLock = true;
    $("dialog").hidden = false;
    $("dlg-shop").hidden = !npc.shop;
    showDialogLine();
  }

  function showDialogLine() {
    if (!dialog) return;
    $("dlg-name").textContent = dialog.npc.name;
    $("dlg-line").textContent = dialog.lines[dialog.i] || "";
    $("dlg-next").textContent = dialog.i < dialog.lines.length - 1 ? "Next" : "Close";
  }

  function closeDialog() {
    dialog = null;
    uiLock = false;
    $("dialog").hidden = true;
    canvas.focus();
  }

  function openShop() {
    closeDialog();
    uiLock = true;
    $("shop").hidden = false;
    renderShop();
  }

  function closeShop() {
    uiLock = false;
    $("shop").hidden = true;
    canvas.focus();
  }

  function renderShop() {
    $("shop-notes").textContent = save.notes + " notes · tonics " + save.tonics + (save.mask ? " · mask on" : "");
    var list = $("shop-list");
    list.textContent = "";
    content.shop.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "shop-row";
      var copy = document.createElement("p");
      copy.textContent = item.name + " — " + item.cost + " notes. " + item.blurb;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Buy";
      btn.addEventListener("click", function () { buy(item); });
      row.appendChild(copy);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function buy(item) {
    if (save.notes < item.cost) { toast("Not enough notes."); return; }
    if (item.id === "tonic" && save.tonics >= 12) { toast("Your pockets are full of tonics."); return; }
    save.notes -= item.cost;
    if (item.id === "tonic") save.tonics += 1;
    if (item.id === "bandage") {
      if (!useBandage()) {
        save.notes += item.cost;
        return;
      }
    }
    toast("Bought " + item.name + ".");
    persist();
    renderShop();
    syncHud();
  }

  function renderLists() {
    var pSig = party.map(function (m) { return m.id + ":" + m.map; }).join("|");
    if (pSig !== partySig) {
      partySig = pSig;
      var ul = $("party-list");
      ul.textContent = "";
      if (!party.length) {
        var empty = document.createElement("li");
        empty.textContent = online() ? "Just you" : "Offline";
        ul.appendChild(empty);
      }
      party.forEach(function (member) {
        var li = document.createElement("li");
        li.textContent = member.name + (member.id === myId ? " (you)" : "") + " · " + member.map;
        ul.appendChild(li);
      });
    }
    var oSig = people.map(function (p) { return p.id; }).join("|");
    if (oSig !== peopleSig) {
      peopleSig = oSig;
      var box = $("people");
      box.textContent = "";
      if (!people.length) {
        var none = document.createElement("li");
        none.textContent = "No one else";
        box.appendChild(none);
      }
      people.forEach(function (p) {
        var li = document.createElement("li");
        li.textContent = p.name + " ";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Invite";
        btn.dataset.name = p.name;
        li.appendChild(btn);
        box.appendChild(li);
      });
    }
  }

  function syncHud() {
    if (!save || !map) return;
    $("area").textContent = map.name;
    $("who").textContent = save.name + (save.mask ? " · mask" : "") + " · tonic " + save.tonics;
    $("hp-n").textContent = String(Math.ceil(save.hp));
    $("inf-n").textContent = String(Math.ceil(save.infection));
    $("lv-n").textContent = "Lv " + save.level;
    var need = PRSim.expToNext(content, save.level);
    $("exp-n").textContent = save.exp + "/" + need;
    $("hp-bar").style.width = clamp(save.hp / maxHp() * 100, 0, 100) + "%";
    $("inf-bar").style.width = clamp(save.infection, 0, 100) + "%";
    $("exp-bar").style.width = clamp(save.exp / need * 100, 0, 100) + "%";
    $("notes").textContent = save.notes + " notes";
    $("quest").textContent = tracker();
    var pill = $("mode-pill");
    pill.textContent = mode === "online" ? "Online" : "Offline";
    pill.classList.toggle("online", mode === "online");
    if (toasts.length) {
      $("toast").hidden = false;
      $("toast").textContent = toasts[0].text;
    } else $("toast").hidden = true;
  }

  function spark(x, y, color, n) {
    var count = n || 6;
    if (particles.length > 70) particles.splice(0, count);
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 36,
        vy: -16 - Math.random() * 28,
        t: 0.35 + Math.random() * 0.3,
        color: color,
        s: 2
      });
    }
  }

  function draw() {
    var view = content.view;
    var shown = playing ? map : mapById("ashfen");
    var focusX = player && playing ? player.x + player.w / 2 : shown.spawn.x + 80;
    var focusY = player && playing ? player.y + player.h / 2 : shown.ground - 40;
    var tx = shown.width > view.w ? clamp(focusX - view.w / 2, 0, shown.width - view.w) : 0;
    var ty = shown.height > view.h ? clamp(focusY - view.h / 2 + 8, 0, shown.height - view.h) : 0;
    if (cam.id !== shown.id) {
      cam.x = tx;
      cam.y = ty;
      cam.id = shown.id;
    } else {
      cam.x += (tx - cam.x) * 0.16;
      cam.y += (ty - cam.y) * 0.16;
    }
    var camX = Math.round(cam.x);
    var camY = Math.round(cam.y);
    ctx.imageSmoothingEnabled = false;
    PRArt.backdrop(ctx, shown, camX, camY, view);
    drawScenery(shown, camX, camY);
    (shown.solids || []).forEach(function (s) { drawSolid(shown, s, camX, camY); });
    (shown.ladders || []).forEach(function (ladder) { drawLadder(ladder, camX, camY); });
    (shown.zones || []).forEach(function (zone) { drawZone(zoneBox(zone), camX, camY); });
    (shown.portals || []).forEach(function (portal) { drawPortal(portal, camX, camY); });
    (shown.npcs || []).forEach(function (npc) { drawNpc(npc, camX, camY); });
    var mobs = playing && shown.id === map.id ? monsters() : [];
    mobs.forEach(function (mob) { drawMonster(mob, camX, camY); });
    for (var g = ghosts.length - 1; g >= 0; g--) drawGhost(ghosts[g], camX, camY);
    drawParticles(camX, camY);
    if (playing) {
      Object.keys(remotes).forEach(function (id) {
        var remote = remotes[id];
        remote.x += (remote.tx - remote.x) * 0.4;
        remote.y += (remote.ty - remote.y) * 0.4;
        var look = PRArt.lookFor(remote.name);
        drawActor(remote.x + content.player.w / 2, remote.y + content.player.h, {
          facing: remote.facing,
          anim: remote.attacking ? "attack" : remote.anim,
          frame: animTime * 8,
          hair: look.hair,
          coat: look.coat
        }, camX, camY);
        nameplate(remote.name, remote.x + 7, remote.y + content.player.h, camX, camY, look.coat);
        drawBubble(remote.name, remote.x + 7, remote.y + content.player.h, camX, camY);
      });
      var mine = PRArt.lookFor(save.name);
      if (levelGlow > 0) {
        ctx.fillStyle = "rgba(255, 214, 120, " + Math.min(0.55, levelGlow * 0.4) + ")";
        ctx.fillRect(player.x + player.w / 2 - camX - 14, player.y - camY - 8, 28, 30);
      }
      if (player.hurt <= 0 || ((animTime * 16) | 0) % 2 === 0) {
        drawActor(player.x + player.w / 2, player.y + player.h, {
          facing: player.facing,
          anim: animName(),
          frame: player.frame,
          hair: mine.hair,
          coat: save.mask ? "#e7fff6" : mine.coat
        }, camX, camY);
      }
      nameplate(save.name, player.x + 7, player.y + player.h, camX, camY, "#fff6d0");
      drawBubble(save.name, player.x + 7, player.y + player.h, camX, camY);
    }
    for (var i = floaters.length - 1; i >= 0; i--) drawFloater(floaters[i], camX, camY);
  }

  function nameplate(text, cx, feet, camX, camY, color) {
    ctx.font = "bold 10px ui-monospace, monospace";
    var w = Math.ceil(ctx.measureText(text).width);
    var x = Math.round(cx - camX - w / 2);
    var y = Math.round(feet - camY - 34);
    ctx.fillStyle = "rgba(20, 14, 24, 0.82)";
    ctx.fillRect(x - 4, y - 9, w + 8, 12);
    ctx.fillStyle = "#f0b429";
    ctx.fillRect(x - 4, y - 9, w + 8, 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawBubble(name, cx, feet, camX, camY) {
    var bubble = bubbles[name];
    if (!bubble || bubble.t <= 0) return;
    ctx.font = "10px ui-monospace, monospace";
    var w = Math.min(120, Math.ceil(ctx.measureText(bubble.text).width));
    var x = Math.round(cx - camX - w / 2);
    var y = Math.round(feet - camY - 50);
    ctx.fillStyle = "rgba(255, 248, 236, 0.94)";
    ctx.fillRect(x - 4, y - 11, w + 8, 14);
    ctx.fillStyle = "#1a1422";
    ctx.fillRect(x + 6, y + 3, 4, 3);
    ctx.fillText(bubble.text, x, y);
  }

  function drawFloater(floater, camX, camY) {
    var x = Math.round(floater.x - camX);
    var y = Math.round(floater.y - camY - (0.75 - floater.t) * 26);
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#1a1422";
    ctx.strokeText(floater.text, x, y);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, x, y);
  }

  function drawParticles(camX, camY) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.t / 0.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawGhost(ghost, camX, camY) {
    ctx.globalAlpha = Math.max(0, ghost.t / 0.5);
    if (ghost.kind === "mite") ctx.drawImage(PRArt.mite(false), ghost.x - camX, ghost.y - camY);
    else if (ghost.kind === "sporeling") ctx.drawImage(PRArt.spore(false), ghost.x - camX, ghost.y - camY);
    else {
      var img = PRArt.hero("jump", 1, "#3a1820", "#f4f0e4");
      ctx.drawImage(img, ghost.x - camX, ghost.y - camY);
    }
    ctx.globalAlpha = 1;
  }

  function drawScenery(shown, camX, camY) {
    (shown.scenery || []).forEach(function (piece) {
      var x = piece.x - camX;
      var y = piece.y - camY;
      if (piece.kind === "house" || piece.kind === "tower") {
        ctx.fillStyle = "#1a1422";
        ctx.fillRect(x - 1, y - 1, piece.w + 2, piece.h + 2);
        ctx.fillStyle = piece.kind === "tower" ? "#3a4658" : "#6a4038";
        ctx.fillRect(x, y, piece.w, piece.h);
        ctx.fillStyle = piece.kind === "tower" ? "#2a3444" : "#4a2c28";
        ctx.fillRect(x + piece.w - 8, y, 8, piece.h);
        ctx.fillStyle = "#8a4030";
        ctx.fillRect(x - 4, y, piece.w + 8, 6);
        ctx.fillStyle = "#c46a48";
        ctx.fillRect(x - 2, y + 2, piece.w + 4, 2);
        ctx.fillStyle = "#f0d090";
        for (var wy = 18; wy < piece.h - 24; wy += 18) {
          for (var wx = 10; wx < piece.w - 14; wx += 18) {
            ctx.fillStyle = "#1a1422";
            ctx.fillRect(x + wx - 1, y + wy - 1, 8, 10);
            ctx.fillStyle = "#fff1c4";
            ctx.fillRect(x + wx, y + wy, 6, 8);
            ctx.fillStyle = "rgba(255,255,255,0.65)";
            ctx.fillRect(x + wx, y + wy, 2, 3);
          }
        }
        ctx.fillStyle = "#3a2418";
        ctx.fillRect(x + piece.w / 2 - 6, y + piece.h - 16, 12, 16);
      } else if (piece.kind === "tree") {
        ctx.fillStyle = "#3a2418";
        ctx.fillRect(x + 10, y + 26, 8, 42);
        ctx.fillStyle = "#6b4428";
        ctx.fillRect(x + 12, y + 26, 3, 42);
        ctx.fillStyle = "#1a1422";
        ctx.fillRect(x - 2, y - 2, 32, 32);
        ctx.fillStyle = "#1e6b34";
        ctx.fillRect(x, y, 28, 28);
        ctx.fillStyle = "#3d9a48";
        ctx.fillRect(x + 4, y + 4, 14, 10);
        ctx.fillStyle = "#d8f0a0";
        ctx.fillRect(x + 6, y + 6, 4, 3);
      } else if (piece.kind === "lamp") {
        ctx.fillStyle = "#1a1422";
        ctx.fillRect(x, y, 4, 38);
        ctx.fillStyle = "#6b4428";
        ctx.fillRect(x + 1, y, 2, 38);
        ctx.fillStyle = "#f0b429";
        ctx.fillRect(x - 3, y - 6, 10, 8);
        ctx.fillStyle = "#fff6d0";
        ctx.fillRect(x - 1, y - 4, 4, 4);
      } else if (piece.kind === "scaffold") {
        ctx.fillStyle = "#3a3020";
        ctx.fillRect(x, y, 8, piece.h);
        ctx.fillStyle = "#a88448";
        ctx.fillRect(x + 2, y, 2, piece.h);
        for (var sy = 0; sy < piece.h; sy += 14) {
          ctx.fillStyle = "#e2c14a";
          ctx.fillRect(x - 10, y + sy, 28, 3);
          ctx.fillStyle = "#1a1422";
          ctx.fillRect(x - 10, y + sy + 3, 28, 2);
        }
      } else if (piece.kind === "banner") {
        ctx.fillStyle = "#f4f0e4";
        ctx.fillRect(x, y, 4, 54);
        ctx.fillStyle = "#1f8f78";
        ctx.fillRect(x + 4, y + 4, 18, 14);
        ctx.fillStyle = "#f0b429";
        ctx.fillRect(x + 8, y + 8, 8, 4);
      }
    });
  }

  function drawSolid(shown, solid, camX, camY) {
    var theme = PRArt.theme(shown.id);
    var img = PRArt.tile(solid.oneWay ? "wood" : theme.grass);
    var x0 = solid.x - camX;
    var y0 = solid.y - camY;
    if (!solid.oneWay) {
      ctx.fillStyle = shown.id === "haven" ? "#e6d2a4" : shown.id === "glassport" ? "#4a5560" : "#4a3424";
      ctx.fillRect(x0, y0 + 10, solid.w, Math.max(0, solid.h - 10));
    }
    var span = solid.oneWay ? solid.h : 16;
    for (var x = 0; x < solid.w; x += 16) {
      var slice = Math.min(16, solid.w - x);
      ctx.drawImage(img, 0, 0, slice, span, x0 + x, y0, slice, span);
    }
  }

  function drawLadder(ladder, camX, camY) {
    var img = PRArt.tile(ladder.rope ? "rope" : "ladder");
    var x = ladder.x - camX;
    for (var y = 0; y < ladder.h; y += 16) {
      ctx.drawImage(img, x, ladder.y - camY + y);
    }
  }

  function drawZone(zone, camX, camY) {
    var x = zone.x - camX;
    var y = zone.y - camY;
    ctx.fillStyle = zone.kind === "amber" ? "rgba(226, 176, 70, 0.28)" : "rgba(150, 80, 200, 0.28)";
    ctx.fillRect(x, y, zone.w, zone.h);
    ctx.fillStyle = zone.kind === "amber" ? "rgba(255, 236, 180, 0.45)" : "rgba(230, 200, 255, 0.4)";
    var bob = (animTime * 10) | 0;
    for (var i = 0; i < zone.w; i += 10) {
      ctx.fillRect(x + i, y + ((i + bob) % 5), 3, 3);
    }
  }

  function drawPortal(portal, camX, camY) {
    var x = portal.x - camX;
    var y = portal.y - camY;
    var pulse = 0.55 + Math.sin(animTime * 4) * 0.2;
    ctx.fillStyle = "#f4f0e4";
    ctx.fillRect(x, y, 5, portal.h);
    ctx.fillRect(x + portal.w - 5, y, 5, portal.h);
    ctx.fillRect(x, y, portal.w, 5);
    ctx.fillStyle = "#1a1422";
    ctx.fillRect(x + 2, y + 2, 2, portal.h - 4);
    ctx.fillRect(x + portal.w - 4, y + 2, 2, portal.h - 4);
    ctx.fillStyle = "rgba(120, 230, 210, " + pulse + ")";
    ctx.fillRect(x + 7, y + 7, portal.w - 14, portal.h - 12);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 10, y + 10, 3, portal.h - 20);
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "#1a1422";
    ctx.fillText(portal.label, x + 1, y - 3);
    ctx.fillStyle = "#fff6d0";
    ctx.fillText(portal.label, x, y - 4);
  }

  function drawNpc(npc, camX, camY) {
    var look = PRArt.lookFor(npc.name);
    drawActor(npc.x + 8, npc.y + content.player.h, {
      facing: 1,
      anim: "idle",
      frame: animTime * 2,
      hair: look.hair,
      coat: npc.coat || look.coat
    }, camX, camY);
    nameplate(npc.name, npc.x + 8, npc.y + content.player.h, camX, camY, "#ffe08a");
    if (npc.quest && questReady(npc.quest)) {
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(npc.x - camX + 4, npc.y - camY - 8, 4, 4);
      ctx.fillRect(npc.x - camX + 5, npc.y - camY - 3, 2, 2);
    }
  }

  function drawMonster(mob, camX, camY) {
    if (mob.alive === false || mob.hp <= 0) {
      var age = mob.respawnAt ? (animTime * 1000 - (mob.respawnAt - (content.respawnMs || 12000))) : 999;
      if (age > 480) return;
      ctx.globalAlpha = 1 - age / 480;
      drawMonsterBody(mob, camX, camY, true);
      ctx.globalAlpha = 1;
      return;
    }
    drawMonsterBody(mob, camX, camY, mob.hitUntil && animTime < mob.hitUntil);
    if (mob.maxHp && mob.hp < mob.maxHp) {
      var cx = mob.x + mob.w / 2 - camX;
      var top = mob.y - camY - 6;
      ctx.fillStyle = "#1a1422";
      ctx.fillRect(cx - 9, top, 18, 4);
      ctx.fillStyle = "#ffb0b4";
      ctx.fillRect(cx - 8, top + 1, Math.max(0, 16 * mob.hp / mob.maxHp), 2);
    }
  }

  function drawMonsterBody(mob, camX, camY, flash) {
    var hop = ((animTime * 6) | 0) % 2 === 1;
    var img = mob.kind === "sporeling" ? PRArt.spore(hop) : mob.kind === "mite" ? PRArt.mite(hop) : null;
    if (img) {
      ctx.drawImage(img, Math.round(mob.x - camX), Math.round(mob.y - camY - (hop ? 1 : 0)));
    } else {
      drawActor(mob.x + mob.w / 2, mob.y + mob.h, {
        facing: mob.facing || (mob.vx < 0 ? -1 : 1),
        anim: "walk",
        frame: animTime * 8,
        hair: "#3a1820",
        coat: flash ? "#fff6d0" : "#c45048"
      }, camX, camY);
    }
    if (flash && img) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(mob.x - camX, mob.y - camY, img.width, img.height);
    }
  }

  function drawActor(cx, feet, opt, camX, camY) {
    var anim = opt.anim || "idle";
    if (anim === "walk") anim = ((opt.frame | 0) % 2) ? "walk2" : "walk1";
    var img = PRArt.hero(anim, opt.facing || 1, opt.hair || "#3a2a24", opt.coat || "#1f8f78");
    ctx.drawImage(img, Math.round(cx - camX - img.width / 2), Math.round(feet - camY - img.height + 2));
  }

  function blip(freq, dur) {
    try {
      var ac = blip.ac || (blip.ac = new (window.AudioContext || window.webkitAudioContext)());
      if (ac.state === "suspended") ac.resume();
      var o = ac.createOscillator();
      var g = ac.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.value = 0.03;
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.stop(ac.currentTime + dur + 0.02);
    } catch (err) { /* sound is optional */ }
  }

  function loop(now) {
    try { frame(now); } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - loopLast) / 1000 || 0);
    loopLast = now;
    if (document.hidden) dt = 0;
    animTime += dt;
    if (toasts.length) {
      toasts[0].t -= dt;
      if (toasts[0].t <= 0) toasts.shift();
    }
    for (var i = floaters.length - 1; i >= 0; i--) {
      floaters[i].t -= dt;
      if (floaters[i].t <= 0) floaters.splice(i, 1);
    }
    for (var p = particles.length - 1; p >= 0; p--) {
      particles[p].t -= dt;
      particles[p].x += particles[p].vx * dt;
      particles[p].y += particles[p].vy * dt;
      particles[p].vy += 20 * dt;
      if (particles[p].t <= 0) particles.splice(p, 1);
    }
    Object.keys(bubbles).forEach(function (name) {
      bubbles[name].t -= dt;
      if (bubbles[name].t <= 0) delete bubbles[name];
    });
    for (var g = ghosts.length - 1; g >= 0; g--) {
      ghosts[g].t -= dt;
      if (ghosts[g].t <= 0) ghosts.splice(g, 1);
    }
    if (levelGlow > 0) levelGlow -= dt;
    if (playing && particles.length < 60 && map.zones && Math.random() < 0.55) {
      var zone = map.zones[(Math.random() * map.zones.length) | 0];
      var box = zoneBox(zone);
      particles.push({
        x: box.x + Math.random() * box.w,
        y: box.y + Math.random() * box.h,
        vx: (Math.random() - 0.5) * 10,
        vy: -12 - Math.random() * 10,
        t: 0.8,
        color: zone.kind === "amber" ? "#ffe6a8" : "#efd0ff",
        s: 2
      });
    }
    if (playing && !uiLock) {
      stepPlayer(dt);
      stepOffline(dt);
      stepZones(dt);
      if (consume("attack")) tryAttack();
      if (consume("tonic")) useTonic();
      if (attackLock > 0) attackLock -= dt;
      sendAcc += dt;
      if (online() && sendAcc > 0.08) {
        sendAcc = 0;
        sendState();
      }
    } else if (playing) {
      player.vx = 0;
      consume("attack");
      consume("tonic");
      consume("jump");
      consume("up");
    }
    if (content) draw();
    if (playing) syncHud();
  }

  function bootSave(name) {
    var existing = loadSave();
    if (existing && existing.name.toLowerCase() === name.toLowerCase()) save = existing;
    else if (existing && !name) save = existing;
    else {
      save = fresh(name);
      if (existing && existing.name.toLowerCase() === name.toLowerCase()) save = existing;
    }
    if (!save.kills) save.kills = { sporeling: 0, rusher: 0, mite: 0 };
    map = mapById(save.map || "ashfen");
    player = makePlayer(save.x || map.spawn.x, save.y || map.spawn.y);
    save.hp = clamp(save.hp || maxHp(), 1, maxHp());
  }

  function startNamed(name, wantOnline) {
    bootSave(name);
    persist();
    if (wantOnline) connect(name);
    else begin(false);
  }

  function bind() {
    document.addEventListener("keydown", function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      var act = mapKey(e.key);
      if (!act) return;
      if (e.key === " " || e.key.indexOf("Arrow") === 0) e.preventDefault();
      keys[act] = true;
      if (act === "attack" || act === "tonic" || act === "jump" || act === "up") taps[act] = true;
      if (e.key === "Enter" && playing && !uiLock) $("chat-input").focus();
      if (e.key === "Escape") {
        if (!$("shop").hidden) closeShop();
        else if (!$("dialog").hidden) closeDialog();
      }
    });
    document.addEventListener("keyup", function (e) {
      var act = mapKey(e.key);
      if (act) keys[act] = false;
    });
    window.addEventListener("blur", function () { keys = {}; });
    document.querySelectorAll("#touch button").forEach(function (btn) {
      btn.addEventListener("pointerdown", function (ev) {
        ev.preventDefault();
        if (btn.dataset.hold) pad[btn.dataset.hold] = true;
        if (btn.dataset.tap === "jump") { keys.jump = true; taps.jump = true; }
        if (btn.dataset.tap === "attack") tryAttack();
        if (btn.dataset.tap === "tonic") useTonic();
      });
      function release() {
        if (btn.dataset.hold) pad[btn.dataset.hold] = false;
        if (btn.dataset.tap === "jump") keys.jump = false;
      }
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    });
    $("login").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = validName($("name").value);
      if (!name) { toast("Use 2–12 letters or numbers."); return; }
      $("name").value = name;
      startNamed(name, true);
    });
    $("play-offline").addEventListener("click", function () {
      var name = validName($("name").value) || "Traveler";
      $("name").value = name;
      startNamed(name, false);
    });
    $("give-up").addEventListener("click", function () { failConnect("Walking offline."); });
    $("chat-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var text = $("chat-input").value;
      $("chat-input").value = "";
      $("chat-input").blur();
      canvas.focus();
      if (!text.trim()) return;
      if (online()) send({ t: "chat", text: text });
      else if (text.trim().charAt(0) === "/") log("sys", "Parties need the server.");
      else {
        log("me", save.name + ": " + text.trim() + " (only you)");
        bubbles[save.name] = { text: text.trim().slice(0, 48), t: 3.4 };
      }
    });
    $("people").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button");
      if (!btn || !online()) return;
      send({ t: "invite", name: btn.dataset.name });
    });
    $("invite-yes").addEventListener("click", function () {
      send({ t: "accept" });
      $("invite").hidden = true;
    });
    $("invite-no").addEventListener("click", function () {
      send({ t: "decline" });
      $("invite").hidden = true;
    });
    $("dlg-next").addEventListener("click", function () {
      if (!dialog) return;
      if (dialog.i < dialog.lines.length - 1) {
        dialog.i += 1;
        showDialogLine();
      } else closeDialog();
    });
    $("dlg-close").addEventListener("click", closeDialog);
    $("dlg-shop").addEventListener("click", openShop);
    $("shop-close").addEventListener("click", closeShop);
    if (navigator.maxTouchPoints > 0) document.body.classList.add("touch");
  }

  function mapKey(key) {
    var table = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      a: "left", d: "right", w: "jump", s: "down",
      A: "left", D: "right", W: "jump", S: "down",
      " ": "jump",
      z: "attack", Z: "attack", j: "attack", J: "attack", Control: "attack",
      x: "tonic", X: "tonic", k: "tonic", K: "tonic"
    };
    return table[key] || null;
  }

  function boot() {
    bind();
    fetch("assets/content.json").then(function (res) {
      if (!res.ok) throw new Error("content");
      return res.json();
    }).then(function (data) {
      content = data;
      map = mapById("ashfen");
      var existing = loadSave();
      if (existing) $("name").value = existing.name;
      var hint = serverUrl()
        ? "Online server: " + serverUrl()
        : "No server URL yet. Play offline, or set serverUrl in assets/config.js.";
      $("server-hint").textContent = hint;
      globalThis.__rpg = {
        snap: function () {
          return {
            mode: mode,
            playing: playing,
            map: map && map.id,
            x: player ? Math.round(player.x) : 0,
            y: player ? Math.round(player.y) : 0,
            onGround: player ? player.onGround : false,
            hp: save && save.hp,
            level: save && save.level,
            notes: save && save.notes,
            infection: save && Math.round(save.infection),
            mask: save && save.mask,
            tonics: save && save.tonics,
            kills: save && Object.assign({}, save.kills),
            quests: save && Object.assign({}, save.quests),
            haven: save && save.haven,
            myId: myId,
            others: Object.keys(remotes).map(function (id) {
              var r = remotes[id];
              return { id: r.id, name: r.name, x: Math.round(r.tx), y: Math.round(r.ty) };
            }),
            monsters: monsters().filter(function (m) { return m.alive !== false && m.hp > 0; }).map(function (m) {
              return { id: m.id, kind: m.kind, hp: m.hp, x: Math.round(m.x) };
            }),
            party: party.map(function (p) { return p.name; }),
            log: Array.prototype.map.call($("log").children, function (node) { return node.textContent; })
          };
        }
      };
      requestAnimationFrame(loop);
    }).catch(function () {
      $("boot-error").hidden = false;
      $("boot-error").textContent = "The valley data did not load.";
    });
  }

  boot();
})();
