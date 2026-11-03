import type { Content } from "../content/load.js";
import { newId, nextSeq } from "../core/ids.js";
import { troopCount } from "../core/resources.js";
import { nextRandom } from "../core/rng.js";
import { HOUR } from "../core/time.js";
import type { GameState, Movement, Ms, Troops, Village } from "../core/types.js";
import { slowestSpeed } from "../military/combat.js";
import { isProtected, marchMs, villageTile } from "../military/movements.js";
import { touch } from "../village/timeline.js";
import { distance } from "./map.js";

// Outlaw raid waves. Every intervalHours (scaled by speed) each camp that has
// regrown at least minStrength of its garrison may, with `chance`, send `share`
// of its men against the nearest unprotected player town within `radius`.
// They loot like any raid and carry the plunder back to the camp.

export function runNpcRaids(state: GameState, content: Content, at: Ms): void {
  const cfg = content.world.npc.camps.raids;
  const campsId = state.npc.campsPlayerId;
  if (state.settings.npcRaids && campsId) {
    const towns = Object.values(state.villages).filter((v) => {
      const p = state.players[v.ownerId];
      return v.kind === "player" && p && p.kind !== "npc" && !isProtected(state, p.id, at);
    });
    for (const camp of Object.values(state.villages)) {
      if (camp.kind !== "camp" || camp.ownerId !== campsId || !camp.npc) continue;
      touch(state, content, camp, at);
      const full = troopCount(camp.npc.garrison);
      if (full <= 0 || troopCount(camp.troops) < full * cfg.minStrength) continue;
      if (nextRandom(state) > cfg.chance) continue;
      const target = nearest(content, camp, towns, cfg.radius);
      if (!target) continue;
      const troops: Troops = {};
      for (const [u, n] of Object.entries(camp.troops)) {
        const k = Math.floor(n * cfg.share);
        if (k > 0) troops[u] = k;
      }
      if (troopCount(troops) === 0) continue;
      for (const [u, n] of Object.entries(troops)) camp.troops[u] = (camp.troops[u] ?? 0) - n;
      const from = villageTile(content, camp);
      const to = villageTile(content, target);
      const m: Movement = {
        id: newId(state, "m"),
        seq: nextSeq(state),
        kind: "raid",
        ownerId: campsId,
        homeVillageId: camp.id,
        fromTile: from,
        toTile: to,
        targetVillageId: target.id,
        targetOwnerId: target.ownerId,
        troops,
        hero: false,
        armory: {},
        factionId: content.world.npc.camps.factionId,
        carry: {},
        treasures: 0,
        merchants: 0,
        targets: [],
        departAt: at,
        arriveAt: at + marchMs(state, content, null, from, to, slowestSpeed(content, troops, null)),
        mission: "raid",
      };
      state.movements[m.id] = m;
    }
  }
  if (state.settings.npcRaids) {
    state.scheduled.push({
      id: newId(state, "e"),
      seq: nextSeq(state),
      at: Math.round(at + (cfg.intervalHours * HOUR) / state.settings.speed),
      kind: "npcRaids",
    });
  }
}

function nearest(content: Content, camp: Village, towns: Village[], radius: number): Village | null {
  const from = villageTile(content, camp);
  let best: Village | null = null;
  let bestD = Infinity;
  for (const t of towns) {
    const d = distance(content, from, villageTile(content, t));
    if (d <= radius && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}
