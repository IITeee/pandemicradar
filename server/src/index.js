/* Pandemicradar game server.
   One process, one port: HTTP /health for the host, WebSocket on the same port for the game.
   Monster health and positions are owned here. Player progress stays in the browser.
*/
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var { WebSocketServer } = require("ws");
var sim = require(resolveFirst([
  path.join(__dirname, "sim.js"),
  path.join(__dirname, "../../site/assets/sim.js"),
  "/app/sim.js"
]));

var content = JSON.parse(fs.readFileSync(resolveFirst([
  path.join(__dirname, "content.json"),
  path.join(__dirname, "../../site/assets/content.json"),
  "/app/content.json"
]), "utf8"));

var maps = {};
content.maps.forEach(function (map) {
  maps[map.id] = {
    def: map,
    monsters: sim.makeMonsters(map, content)
  };
});

var players = new Map();
var nextId = 1;
var nextParty = 1;
var parties = new Map();
var PORT = Number(process.env.PORT) || 8080;
var PLAYER = content.player;

function resolveFirst(list) {
  for (var i = 0; i < list.length; i++) {
    if (fs.existsSync(list[i])) return list[i];
  }
  throw new Error("Missing file. Looked in " + list.join(", "));
}

function mapDef(id) {
  return maps[id] && maps[id].def;
}

function send(player, msg) {
  if (!player.ws || player.ws.readyState !== 1) return;
  try { player.ws.send(JSON.stringify(msg)); } catch (err) { /* socket closing */ }
}

function sys(player, text) {
  send(player, { t: "sys", text: text });
}

function validName(name) {
  if (typeof name !== "string") return "";
  var trimmed = name.replace(/\s+/g, " ").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,11}$/.test(trimmed)) return "";
  if (trimmed.length < 2) return "";
  return trimmed;
}

function nameTaken(name, exceptId) {
  var lower = name.toLowerCase();
  for (var player of players.values()) {
    if (player.id !== exceptId && player.name.toLowerCase() === lower) return true;
  }
  return false;
}

function findByName(name) {
  var lower = String(name || "").trim().toLowerCase();
  for (var player of players.values()) {
    if (player.name.toLowerCase() === lower) return player;
  }
  return null;
}

function nearPortal(map, x, y) {
  var portals = map.portals || [];
  for (var i = 0; i < portals.length; i++) {
    var portal = portals[i];
    var body = { x: x, y: y, w: PLAYER.w, h: PLAYER.h };
    var door = { x: portal.x - 24, y: portal.y - 16, w: portal.w + 48, h: portal.h + 32 };
    if (sim.overlap(body, door)) return portal;
  }
  return null;
}

function partyMembers(player) {
  if (!player.partyId || !parties.has(player.partyId)) return [player];
  var list = [];
  parties.get(player.partyId).forEach(function (id) {
    var member = players.get(id);
    if (member) list.push(member);
  });
  return list.length ? list : [player];
}

function leaveParty(player, quiet) {
  if (!player.partyId || !parties.has(player.partyId)) {
    player.partyId = null;
    return;
  }
  var set = parties.get(player.partyId);
  set.delete(player.id);
  var pid = player.partyId;
  player.partyId = null;
  if (set.size === 0) parties.delete(pid);
  else if (!quiet) tellParty(pid, player.name + " left the party.");
}

function tellParty(pid, text) {
  var set = parties.get(pid);
  if (!set) return;
  set.forEach(function (id) {
    var member = players.get(id);
    if (member) sys(member, text);
  });
}

function broadcastMap(mapId, msg, exceptId) {
  for (var player of players.values()) {
    if (player.map === mapId && player.id !== exceptId) send(player, msg);
  }
}

function snapshotFor(player) {
  var room = maps[player.map];
  var list = [];
  for (var other of players.values()) {
    if (other.map !== player.map) continue;
    list.push({
      id: other.id,
      name: other.name,
      x: round(other.x),
      y: round(other.y),
      facing: other.facing,
      anim: other.anim,
      level: other.level,
      attacking: other.attackUntil > Date.now()
    });
  }
  var monsters = room.monsters.filter(function (m) { return m.alive; }).map(function (m) {
    return {
      id: m.id,
      kind: m.kind,
      x: round(m.x),
      y: round(m.y),
      hp: m.hp,
      maxHp: m.maxHp,
      facing: m.vx < 0 ? -1 : 1
    };
  });
  var party = partyMembers(player).map(function (member) {
    return { id: member.id, name: member.name, map: member.map, level: member.level };
  });
  return { t: "snap", self: player.id, players: list, monsters: monsters, party: party };
}

function round(n) {
  return Math.round(n * 10) / 10;
}

function acceptMove(player, msg) {
  var now = Date.now();
  var mapChanged = msg.map && msg.map !== player.map;
  if (mapChanged) {
    if (!maps[msg.map]) return;
    var door = nearPortal(mapDef(player.map), player.x, player.y);
    if (!door || door.to !== msg.map) return;
    player.map = msg.map;
    player.x = Number(msg.x) || 0;
    player.y = Number(msg.y) || 0;
    player.lastMove = now;
    return;
  }
  var x = Number(msg.x);
  var y = Number(msg.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  var map = mapDef(player.map);
  if (x < -20 || y < -40 || x > map.width || y > map.height + 40) return;
  var dt = Math.max(0.03, (now - player.lastMove) / 1000);
  var dist = Math.hypot(x - player.x, y - player.y);
  var allowance = 240 * dt + 140;
  if (dist > allowance && dt < 1.2) return;
  player.x = x;
  player.y = y;
  player.facing = msg.facing < 0 ? -1 : 1;
  player.vx = Number(msg.vx) || 0;
  player.vy = Number(msg.vy) || 0;
  player.anim = typeof msg.anim === "string" ? msg.anim.slice(0, 12) : "idle";
  player.lastMove = now;
}

function onAttack(player) {
  var now = Date.now();
  if (now < player.nextAttack) return;
  player.nextAttack = now + 420;
  player.attackUntil = now + 180;
  var room = maps[player.map];
  var hits = sim.applyAttack(room.monsters, {
    map: player.map,
    x: player.x,
    y: player.y,
    w: PLAYER.w,
    h: PLAYER.h,
    facing: player.facing,
    level: player.level
  }, now, content);
  hits.forEach(function (hit) {
    var fx = {
      t: "fx",
      type: "mdmg",
      id: hit.id,
      kind: hit.kind,
      amount: hit.amount,
      hp: hit.hp,
      x: hit.x,
      y: hit.y,
      killed: hit.killed,
      who: player.id
    };
    broadcastMap(player.map, fx);
    if (hit.killed) grantKill(player, hit.kind);
  });
}

function grantKill(player, kindName) {
  var kind = content.kinds[kindName];
  var members = partyMembers(player).filter(function (member) { return member.map === player.map; });
  if (members.length <= 1) {
    send(player, { t: "fx", type: "reward", who: player.id, exp: kind.exp, notes: kind.notes, kind: kindName });
    return;
  }
  var killerExp = Math.max(1, Math.ceil(kind.exp * 0.7));
  var share = Math.max(1, Math.ceil((kind.exp * 0.3) / (members.length - 1)));
  members.forEach(function (member) {
    if (member.id === player.id) {
      send(member, { t: "fx", type: "reward", who: member.id, exp: killerExp, notes: kind.notes, kind: kindName });
    } else {
      send(member, { t: "fx", type: "reward", who: member.id, exp: share, notes: 0, kind: kindName, shared: true });
    }
  });
}

function onInvite(player, rawName) {
  var name = validName(rawName) || String(rawName || "").trim();
  var target = findByName(name);
  if (!target) return sys(player, "No traveler named " + name + " is online.");
  if (target.id === player.id) return sys(player, "You are already in your own party of one.");
  target.inviteFrom = player.id;
  send(target, { t: "invite", from: player.name, fromId: player.id });
  sys(player, "Invited " + target.name + ".");
}

function onAccept(player) {
  var host = players.get(player.inviteFrom);
  player.inviteFrom = null;
  if (!host) return sys(player, "That invite expired.");
  leaveParty(player, true);
  var pid = host.partyId;
  if (!pid || !parties.has(pid)) {
    pid = nextParty++;
    host.partyId = pid;
    parties.set(pid, new Set([host.id]));
  }
  player.partyId = pid;
  parties.get(pid).add(player.id);
  tellParty(pid, player.name + " joined the party.");
}

function onChat(player, text) {
  var now = Date.now();
  if (now < player.nextChat) return;
  player.nextChat = now + 350;
  var clean = String(text || "").replace(/[\u0000-\u001f]/g, "").trim();
  if (!clean) return;
  if (clean.length > 140) clean = clean.slice(0, 140);
  if (clean.charAt(0) === "/") {
    var parts = clean.slice(1).split(/\s+/);
    var cmd = (parts[0] || "").toLowerCase();
    if (cmd === "party" || cmd === "invite") onInvite(player, parts.slice(1).join(" "));
    else if (cmd === "leave") {
      var pid = player.partyId;
      leaveParty(player, false);
      if (!pid) sys(player, "You were not in a party.");
    } else sys(player, "Commands: /party Name, /leave");
    return;
  }
  var msg = { t: "chat", name: player.name, text: clean, map: player.map };
  broadcastMap(player.map, msg);
  send(player, msg);
}

function addPlayer(ws, msg) {
  var name = validName(msg.name);
  if (!name) {
    ws.send(JSON.stringify({ t: "reject", reason: "Pick 2–12 letters or numbers." }));
    return null;
  }
  if (nameTaken(name)) {
    ws.send(JSON.stringify({ t: "reject", reason: "That name is already on the road. Pick another." }));
    return null;
  }
  var mapId = maps[msg.map] ? msg.map : "ashfen";
  var spawn = mapDef(mapId).spawn;
  var player = {
    id: nextId++,
    name: name,
    ws: ws,
    map: mapId,
    x: Number.isFinite(Number(msg.x)) ? Number(msg.x) : spawn.x,
    y: Number.isFinite(Number(msg.y)) ? Number(msg.y) : spawn.y,
    facing: 1,
    vx: 0,
    vy: 0,
    anim: "idle",
    level: clamp(Number(msg.level) || 1, 1, 50),
    attackUntil: 0,
    nextAttack: 0,
    nextChat: 0,
    lastMove: Date.now(),
    partyId: null,
    inviteFrom: null
  };
  players.set(player.id, player);
  ws.playerId = player.id;
  send(player, { t: "welcome", id: player.id, name: player.name });
  broadcastMap(player.map, { t: "sys", text: player.name + " stepped onto " + mapDef(player.map).name + "." }, player.id);
  return player;
}

function removePlayer(player) {
  if (!player) return;
  leaveParty(player, false);
  players.delete(player.id);
  broadcastMap(player.map, { t: "sys", text: player.name + " left." });
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

var tickCount = 0;

function tick() {
  tickCount += 1;
  var now = Date.now();
  var dt = 0.05;
  var byMap = {};
  for (var player of players.values()) {
    if (!byMap[player.map]) byMap[player.map] = [];
    byMap[player.map].push({
      id: player.id,
      map: player.map,
      x: player.x,
      y: player.y,
      w: PLAYER.w,
      h: PLAYER.h
    });
  }
  Object.keys(maps).forEach(function (id) {
    var hurts = sim.stepMonsters(maps[id].monsters, byMap[id] || [], dt, now, content);
    hurts.forEach(function (hurt) {
      var who = players.get(hurt.playerId);
      if (!who) return;
      broadcastMap(who.map, {
        t: "fx",
        type: "pdmg",
        who: who.id,
        amount: hurt.amount,
        infection: hurt.infection,
        x: hurt.x,
        y: hurt.y
      });
    });
  });
  if (tickCount % 2 === 0) {
    for (var viewer of players.values()) send(viewer, snapshotFor(viewer));
  }
}

function handle(player, msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "state") acceptMove(player, msg);
  else if (msg.t === "attack") onAttack(player);
  else if (msg.t === "chat") onChat(player, msg.text);
  else if (msg.t === "invite") onInvite(player, msg.name);
  else if (msg.t === "accept") onAccept(player);
  else if (msg.t === "decline") player.inviteFrom = null;
  else if (msg.t === "leave") leaveParty(player, false);
  else if (msg.t === "progress") {
    var level = clamp(Number(msg.level) || player.level, 1, 50);
    player.level = level;
  }
}

function start(port) {
  var server = http.createServer(function (req, res) {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, players: players.size, maps: Object.keys(maps).length }));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  var wss = new WebSocketServer({ server: server, maxPayload: 4096, perMessageDeflate: false });
  var timer = setInterval(tick, 50);
  server.on("close", function () { clearInterval(timer); });
  wss.on("connection", function (ws) {
    ws.on("message", function (buf) {
      var text = String(buf);
      if (text.length > 4000) return;
      var msg;
      try { msg = JSON.parse(text); } catch (err) { return; }
      if (!ws.playerId) {
        if (msg.t === "join") addPlayer(ws, msg);
        return;
      }
      var player = players.get(ws.playerId);
      if (player) handle(player, msg);
    });
    ws.on("close", function () {
      removePlayer(players.get(ws.playerId));
    });
  });
  server.listen(port);
  return server;
}

if (require.main === module) {
  start(PORT);
  console.log("Pandemicradar server on :" + PORT);
}

module.exports = { start: start };
