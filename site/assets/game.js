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
  var drops = [];
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
      if (msg.killed) spawnDrop(msg.x, msg.y, msg.kind);
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
    if (!z || !z.drift) return z || { x: 0, y: 0, w: 0, h: 0 };
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
    player.attack = 0.32;
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
      if (hit.killed) spawnDrop(hit.x, hit.y, hit.kind);
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
    if (globalThis.PRArt) PRArt.paintPortrait($("portrait"), dialog.npc);
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
    $("lv-n").textContent = String(save.level);
    var need = PRSim.expToNext(content, save.level);
    $("exp-n").textContent = save.exp + "/" + need;
    $("hp-bar").style.width = clamp(save.hp / maxHp() * 100, 0, 100) + "%";
    $("inf-bar").style.width = clamp(save.infection, 0, 100) + "%";
    $("exp-bar").style.width = clamp(save.exp / need * 100, 0, 100) + "%";
    $("notes").textContent = save.notes + " notes";
    var slot = $("slot-tonic");
    if (slot) slot.textContent = "×" + save.tonics;
    $("quest").textContent = tracker();
    var pill = $("mode-pill");
    pill.textContent = mode === "online" ? "Online" : "Offline";
    pill.classList.toggle("online", mode === "online");
    if (toasts.length) {
      $("toast").hidden = false;
      $("toast").textContent = toasts[0].text;
    } else $("toast").hidden = true;
  }

  function spawnDrop(x, y, kind) {
    var icon = kind === "mite" ? "tonic" : kind === "rusher" ? "notes" : "sac";
    if (drops.length > 24) drops.shift();
    drops.push({ x: x, y: y, vy: -48, t: 1.2, kind: icon });
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
    if (canvas.width !== view.w * 2) {
      canvas.width = view.w * 2;
      canvas.height = view.h * 2;
    }
    var shown = playing ? map : mapById("ashfen");
    var focusX = player && playing ? player.x + player.w / 2 : shown.spawn.x + 90;
    var focusY = player && playing ? player.y + player.h / 2 : shown.ground - 36;
    var tx = shown.width > view.w ? clamp(focusX - view.w / 2, 0, shown.width - view.w) : 0;
    var ty = shown.height > view.h ? clamp(focusY - view.h / 2 + 6, 0, shown.height - view.h) : 0;
    if (cam.id !== shown.id) {
      cam.x = tx;
      cam.y = ty;
      cam.id = shown.id;
    } else {
      cam.x += (tx - cam.x) * 0.14;
      cam.y += (ty - cam.y) * 0.14;
    }
    var camX = cam.x;
    var camY = cam.y;
    ctx.imageSmoothingEnabled = false;
    PRArt.backdrop(ctx, shown, camX, camY, view, animTime);
    PRArt.dressing(ctx, shown, camX, camY, animTime, false);
    (shown.scenery || []).forEach(function (piece) { PRArt.scenery(ctx, shown, piece, camX, camY, animTime); });
    (shown.solids || []).forEach(function (solid) { PRArt.solid(ctx, shown, solid, camX, camY, animTime); });
    (shown.ladders || []).forEach(function (ladder) { PRArt.ladder(ctx, ladder, camX, camY); });
    (shown.zones || []).forEach(function (zone) { PRArt.zone(ctx, zoneBox(zone), camX, camY, animTime); });
    (shown.portals || []).forEach(function (portal) { PRArt.portal(ctx, portal, camX, camY, animTime); });
    (shown.npcs || []).forEach(function (npc) { drawNpc(npc, camX, camY); });
    var mobs = playing && shown.id === map.id ? monsters() : [];
    mobs.forEach(function (mob) { drawMonster(mob, camX, camY); });
    for (var gi = ghosts.length - 1; gi >= 0; gi--) drawGhost(ghosts[gi], camX, camY);
    drops.forEach(function (drop) {
      var img = PRArt.icon(drop.kind);
      ctx.drawImage(img, PRArt.X(drop.x, camX), PRArt.Y(drop.y, camY));
    });
    if (playing) drawPeople(camX, camY);
    PRArt.dressing(ctx, shown, camX, camY, animTime, true);
    if (playing) {
      drawPeopleTags(camX, camY);
      if (levelGlow > 0) drawLevelUp(camX, camY);
    }
    drawParticles(camX, camY);
    for (var i = floaters.length - 1; i >= 0; i--) drawFloater(floaters[i], camX, camY);
    drawMini(shown);
  }

  function drawPeople(camX, camY) {
    Object.keys(remotes).forEach(function (id) {
      var remote = remotes[id];
      remote.x += (remote.tx - remote.x) * 0.4;
      remote.y += (remote.ty - remote.y) * 0.4;
      var look = PRArt.lookFor(remote.name);
      drawActor(remote.x + content.player.w / 2, remote.y + content.player.h, {
        facing: remote.facing,
        anim: remote.attacking ? "attack" : remote.anim,
        frame: remote.attacking ? ((animTime * 8) | 0) % 3 : animTime * 8,
        look: look
      }, camX, camY);
    });
    var mine = Object.assign({}, PRArt.lookFor(save.name), { mask: !!save.mask });
    if (player.hurt <= 0 || ((animTime * 16) | 0) % 2 === 0) {
      var swing = player.attack > 0 ? (player.attack > 0.2 ? 0 : player.attack > 0.1 ? 1 : 2) : 0;
      drawActor(player.x + player.w / 2, player.y + player.h, {
        facing: player.facing,
        anim: animName(),
        frame: animName() === "attack" ? swing : player.frame,
        look: mine,
        flash: player.hurt > 0.28
      }, camX, camY);
    }
  }

  function drawPeopleTags(camX, camY) {
    Object.keys(remotes).forEach(function (id) {
      var remote = remotes[id];
      var look = PRArt.lookFor(remote.name);
      nameplate(remote.name, remote.x + 7, remote.y + content.player.h, camX, camY, "#fff6d0");
      drawBubble(remote.name, remote.x + 7, remote.y + content.player.h, camX, camY);
    });
    nameplate(save.name, player.x + 7, player.y + player.h, camX, camY, "#fff6d0");
    drawBubble(save.name, player.x + 7, player.y + player.h, camX, camY);
  }

  function drawLevelUp(camX, camY) {
    var cx = PRArt.X(player.x + player.w / 2, camX);
    var cy = PRArt.Y(player.y, camY) - 20;
    ctx.fillStyle = "rgba(255,220,120," + Math.min(0.85, levelGlow) + ")";
    for (var i = 0; i < 8; i++) {
      var a = animTime * 3 + i;
      ctx.fillRect(cx + Math.cos(a) * (18 + i * 3) - 3, cy + Math.sin(a) * (16 + i * 2) - 3, 6, 6);
    }
    ctx.font = "bold 22px Trebuchet MS, Segoe UI, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#241820";
    ctx.strokeText("Level up", cx - 46, cy - 28);
    ctx.fillStyle = "#ffe08a";
    ctx.fillText("Level up", cx - 46, cy - 28);
  }

  function nameplate(text, cx, feet, camX, camY, color) {
    ctx.font = "bold 14px Trebuchet MS, Segoe UI, sans-serif";
    var w = Math.ceil(ctx.measureText(text).width);
    var x = PRArt.X(cx, camX) - (w / 2 | 0);
    var y = PRArt.Y(feet, camY) - 102;
    roundTag(x - 7, y - 14, w + 14, 18, "rgba(18,14,24,0.82)");
    ctx.fillStyle = "#f0b429";
    ctx.fillRect(x - 7, y - 14, w + 14, 2);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawBubble(name, cx, feet, camX, camY) {
    var bubble = bubbles[name];
    if (!bubble || bubble.t <= 0) return;
    ctx.font = "14px Trebuchet MS, Segoe UI, sans-serif";
    var text = bubble.text.length > 32 ? bubble.text.slice(0, 31) + "…" : bubble.text;
    var w = Math.ceil(ctx.measureText(text).width);
    var x = PRArt.X(cx, camX) - (w / 2 | 0);
    var y = PRArt.Y(feet, camY) - 128;
    roundTag(x - 8, y - 16, w + 16, 22, "rgba(255,248,236,0.96)");
    ctx.fillStyle = "#241820";
    ctx.fillRect(x + 8, y + 6, 8, 6);
    ctx.fillRect(x + 12, y + 12, 5, 4);
    ctx.fillText(text, x, y);
  }

  function roundTag(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 3, y, w - 6, h);
    ctx.fillRect(x, y + 3, w, h - 6);
  }

  function drawFloater(floater, camX, camY) {
    var x = PRArt.X(floater.x, camX);
    var y = PRArt.Y(floater.y, camY) - (0.75 - floater.t) * 36;
    ctx.font = "bold 20px Trebuchet MS, Segoe UI, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#241820";
    ctx.strokeText(floater.text, x, y);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, x, y);
  }

  function drawParticles(camX, camY) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.t / 0.55);
      ctx.fillStyle = p.color;
      ctx.fillRect(PRArt.X(p.x, camX), PRArt.Y(p.y, camY), (p.s || 2) * 2, (p.s || 2) * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawGhost(ghost, camX, camY) {
    ctx.globalAlpha = Math.max(0, ghost.t / 0.5);
    var img = PRArt.monster(ghost.kind || "sporeling", "dead", 0);
    ctx.drawImage(img, PRArt.X(ghost.x, camX), PRArt.Y(ghost.y, camY));
    ctx.globalAlpha = 1;
  }

  function drawNpc(npc, camX, camY) {
    var look = PRArt.withCoat(PRArt.lookFor(npc.name), npc.coat);
    drawActor(npc.x + 8, npc.y + content.player.h, {
      facing: 1,
      anim: "idle",
      frame: animTime * 2,
      look: look
    }, camX, camY);
    nameplate(npc.name, npc.x + 8, npc.y + content.player.h, camX, camY, "#ffe08a");
    if (npc.quest && questReady(npc.quest)) PRArt.questMark(ctx, PRArt.X(npc.x + 8, camX), PRArt.Y(npc.y, camY) - 78, animTime);
  }

  function drawMonster(mob, camX, camY) {
    var dead = mob.alive === false || mob.hp <= 0;
    var age = 0;
    if (dead) {
      age = mob.respawnAt ? (animTime * 1000 - (mob.respawnAt - (content.respawnMs || 12000))) : 999;
      if (age > 560) return;
      ctx.globalAlpha = Math.max(0, 1 - age / 560);
    }
    var hit = !dead && mob.hitUntil && animTime < mob.hitUntil;
    var pose = dead ? "dead" : hit ? "hit" : (mob.kind === "rusher" ? "walk" : (((animTime * 3) | 0) % 2 ? "bob" : "idle"));
    var frame = (animTime * 8) | 0;
    var img = PRArt.monster(mob.kind, pose, frame);
    if (hit) img = PRArt.flashOf(img, "m|" + mob.kind + "|" + pose + "|" + frame);
    var feet = mob.y + mob.h;
    PRArt.blitFeet(ctx, img, mob.x + mob.w / 2, feet, camX, camY);
    ctx.globalAlpha = 1;
    if (!dead && mob.maxHp && mob.hp < mob.maxHp) {
      var cx = PRArt.X(mob.x + mob.w / 2, camX);
      var top = PRArt.Y(mob.y, camY) - 16;
      ctx.fillStyle = "#241820";
      ctx.fillRect(cx - 16, top, 32, 6);
      ctx.fillStyle = "#ff8d98";
      ctx.fillRect(cx - 14, top + 2, Math.max(0, 28 * mob.hp / mob.maxHp), 2);
    }
  }

  function drawActor(cx, feet, opt, camX, camY) {
    var pose = opt.anim === "attack" ? PRArt.poseName("attack", opt.frame) : PRArt.poseName(opt.anim, opt.frame);
    var img = PRArt.actor(pose, opt.facing || 1, opt.look);
    if (opt.flash) img = PRArt.flashOf(img, pose + "|" + opt.look.hair + "|" + opt.look.coat + "|" + opt.look.mask + "|" + (opt.facing || 1));
    PRArt.blitFeet(ctx, img, cx, feet, camX, camY);
  }

  function drawMini(shown) {
    var mini = $("minimap");
    if (!mini || !shown) return;
    var g = mini.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#8ec8ea";
    g.fillRect(0, 0, mini.width, mini.height);
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillRect(cam.x * (mini.width / shown.width), 2, Math.max(8, content.view.w * mini.width / shown.width), 2);
    var sx = mini.width / shown.width;
    var sy = mini.height / shown.height;
    g.fillStyle = "#3f9a52";
    (shown.solids || []).forEach(function (s) {
      g.fillStyle = s.oneWay ? "#c4894a" : "#3f9a52";
      g.fillRect(s.x * sx, s.y * sy, Math.max(1, s.w * sx), Math.max(2, s.h * sy));
    });
    g.fillStyle = "#7ef0dc";
    (shown.portals || []).forEach(function (p) { g.fillRect(p.x * sx, p.y * sy, 3, 3); });
    (shown.npcs || []).forEach(function (npc) {
      g.fillStyle = "#f0b429";
      g.fillRect(npc.x * sx, npc.y * sy, 2, 2);
    });
    if (player && playing) {
      g.fillStyle = "#fff6d0";
      g.fillRect(player.x * sx - 1, player.y * sy - 1, 3, 3);
    }
    Object.keys(remotes).forEach(function (id) {
      g.fillStyle = "#7ec8ea";
      g.fillRect(remotes[id].x * sx, remotes[id].y * sy, 2, 2);
    });
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
    for (var d = drops.length - 1; d >= 0; d--) {
      drops[d].t -= dt;
      drops[d].y += drops[d].vy * dt;
      drops[d].vy += 50 * dt;
      if (drops[d].t <= 0) drops.splice(d, 1);
    }
    if (playing && particles.length < 60 && map.zones && map.zones.length && Math.random() < 0.55) {
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
      canvas.width = content.view.w * 2;
      canvas.height = content.view.h * 2;
      if (globalThis.PRArt) {
        PRArt.paintTitle($("title-hero"));
        PRArt.paintIcon($("ico-spray"), "spray");
        PRArt.paintIcon($("ico-tonic"), "tonic");
      }
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
