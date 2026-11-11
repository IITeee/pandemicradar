/* Shared monster rules for the browser client and the Node server. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PRSim = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function expToNext(content, level) {
    return content.expBase + Math.max(0, level - 1) * content.expStep;
  }

  function maxHpFor(content, level) {
    return content.hpBase + Math.max(0, level - 1) * content.hpStep;
  }

  function damageFor(content, level) {
    return content.dmgBase + Math.max(0, level - 1) * content.dmgStep;
  }

  function makeMonsters(map, content) {
    return (map.monsters || []).map(function (spawn, index) {
      var kind = content.kinds[spawn.kind];
      return {
        id: map.id + ":" + index,
        kind: spawn.kind,
        map: map.id,
        x: spawn.x,
        y: spawn.y,
        spawnX: spawn.x,
        baseY: spawn.y,
        w: kind.w,
        h: kind.h,
        hp: kind.hp,
        maxHp: kind.hp,
        homeL: spawn.homeL,
        homeR: spawn.homeR,
        vx: kind.speed,
        hover: !!kind.hover,
        phase: index * 1.7,
        alive: true,
        respawnAt: 0,
        touch: {}
      };
    });
  }

  function attackRect(player) {
    var reach = 22;
    var x = player.facing < 0 ? player.x - reach : player.x + player.w;
    return { x: x, y: player.y + 4, w: reach, h: 20 };
  }

  function stepMonsters(monsters, players, dt, now, content) {
    var hurts = [];
    for (var i = 0; i < monsters.length; i++) {
      var m = monsters[i];
      var kind = content.kinds[m.kind];
      if (!m.alive) {
        if (now >= m.respawnAt) {
          m.alive = true;
          m.hp = m.maxHp;
          m.x = m.spawnX;
          m.y = m.baseY;
          m.vx = kind.speed;
        }
        continue;
      }
      var target = null;
      var best = kind.aggro;
      for (var p = 0; p < players.length; p++) {
        var pl = players[p];
        if (pl.map && pl.map !== m.map) continue;
        var dx = (pl.x + pl.w / 2) - (m.x + m.w / 2);
        var dy = (pl.y + pl.h / 2) - (m.y + m.h / 2);
        var dist = Math.hypot(dx, dy);
        if (dist < best) {
          best = dist;
          target = { dx: dx, dy: dy, dist: dist, player: pl };
        }
      }
      var speed = kind.speed;
      if (target && kind.burst && target.dist < kind.aggro * 0.7) speed = kind.burst;
      if (target) m.vx = target.dx < 0 ? -speed : speed;
      if (m.x < m.homeL) {
        m.x = m.homeL;
        m.vx = Math.abs(speed);
      } else if (m.x > m.homeR) {
        m.x = m.homeR;
        m.vx = -Math.abs(speed);
      }
      m.x += m.vx * dt;
      if (m.x < m.homeL) m.x = m.homeL;
      if (m.x > m.homeR) m.x = m.homeR;
      if (m.hover) m.y = m.baseY + Math.sin(now / 280 + m.phase) * 12;
      else m.y = m.baseY;
      for (var q = 0; q < players.length; q++) {
        var who = players[q];
        if (who.map && who.map !== m.map) continue;
        var ready = !m.touch[who.id] || now >= m.touch[who.id];
        if (ready && overlap(m, who)) {
          m.touch[who.id] = now + 800;
          hurts.push({
            playerId: who.id,
            amount: kind.touch,
            infection: kind.infection || 0,
            x: who.x,
            y: who.y,
            monsterId: m.id
          });
        }
      }
    }
    return hurts;
  }

  function applyAttack(monsters, attacker, now, content) {
    var rect = attackRect(attacker);
    var hits = [];
    for (var i = 0; i < monsters.length; i++) {
      var m = monsters[i];
      if (!m.alive) continue;
      if (m.map && attacker.map && m.map !== attacker.map) continue;
      if (!overlap(rect, m)) continue;
      var amount = damageFor(content, attacker.level || 1);
      m.hp -= amount;
      var killed = m.hp <= 0;
      if (killed) {
        m.hp = 0;
        m.alive = false;
        m.respawnAt = now + (content.respawnMs || 12000);
      }
      hits.push({
        id: m.id,
        kind: m.kind,
        amount: amount,
        hp: m.hp,
        maxHp: m.maxHp,
        x: m.x,
        y: m.y,
        killed: killed
      });
    }
    return hits;
  }

  return {
    overlap: overlap,
    expToNext: expToNext,
    maxHpFor: maxHpFor,
    damageFor: damageFor,
    makeMonsters: makeMonsters,
    attackRect: attackRect,
    stepMonsters: stepMonsters,
    applyAttack: applyAttack
  };
});
