import type { Content } from "../content/load.js";
import { construct, planBuild, upgradeField } from "../economy/construction.js";
import { train, trainOptions } from "../economy/training.js";
import { newId, nextSeq } from "../core/ids.js";
import { troopCount } from "../core/resources.js";
import { nextRandom } from "../core/rng.js";
import { HOUR } from "../core/time.js";
import type { GameState, Ms, Player, Village } from "../core/types.js";
import { sendTroops, villageTile } from "../military/movements.js";
import { touch } from "../village/timeline.js";
import { buildingLevel, villageRates } from "../village/stats.js";
import { distance } from "../world/map.js";

// ---------------------------------------------------------------------------
// A simple AI governor, so a local world has rivals. Every turn (scheduled in
// game time, so it replays deterministically) it keeps its builders busy —
// wheat first when food runs short, then the cheapest useful job — trains its
// basic troops with spare resources, and now and then raids the nearest
// outlaw camp. It plays by the same commands as a human.
// ---------------------------------------------------------------------------

const TURN_HOURS = 0.5;
const PRIORITY = ["storehouse", "granary", "muster_ground", "barracks", "cache", "walls", "prytaneion", "gymnasion", "agora", "armory"];
// How far a bot raises each building before it looks elsewhere.
const CAP: Record<string, number> = { cache: 5, walls: 8, agora: 5, armory: 5, gymnasion: 5 };

export function scheduleBot(state: GameState, playerId: string, at: Ms): void {
  state.scheduled.push({ id: newId(state, "e"), seq: nextSeq(state), at: Math.round(at + (TURN_HOURS * HOUR) / state.settings.speed), kind: "aiTurn", playerId });
}

export function botTurn(state: GameState, content: Content, playerId: string, at: Ms): void {
  const p = state.players[playerId];
  if (!p || p.kind !== "ai") return;
  for (const id of p.villageIds) {
    const v = state.villages[id];
    if (!v) continue;
    touch(state, content, v, at);
    recruit(state, content, p, v, at);
    build(state, content, p, v, at);
    raid(state, content, p, v, at);
  }
  scheduleBot(state, playerId, at);
}

function build(state: GameState, content: Content, p: Player, v: Village, at: Ms) {
  for (let tries = 0; tries < 2; tries++) {
    const rates = villageRates(state, content, v);
    const hungry = (rates.net[content.food] ?? 0) < Math.max(5, rates.population * 0.15);
    const candidates: { cost: number; run: () => boolean }[] = [];
    v.fields.forEach((f, index) => {
      if (hungry && f.resource !== content.food) return;
      const plan = planBuild(state, content, v, { kind: "field", index });
      if (plan.check.ok) candidates.push({ cost: total(plan.cost) * (1 + f.level * 0.05), run: () => upgradeField(state, content, p.id, v.id, index, at).ok });
    });
    if (!hungry) {
      for (const id of PRIORITY) {
        const def = content.buildings[id];
        if (!def) continue;
        const slot = v.buildings.findIndex((b) => b?.id === id);
        const target = slot >= 0 ? slot : def.fixedSlot ?? v.buildings.findIndex((b, i) => !b && !content.buildingList.some((d) => d.fixedSlot === i) && !v.buildQueue.some((j) => j.kind === "building" && j.index === i));
        if (target < 0) continue;
        if (buildingLevel(v, id) >= Math.min(def.maxLevel, CAP[id] ?? 10)) continue;
        const plan = planBuild(state, content, v, { kind: "building", slot: target, buildingId: id });
        if (plan.check.ok) candidates.push({ cost: total(plan.cost) * 0.9, run: () => construct(state, content, p.id, v.id, target, id, at).ok });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost);
    if (!candidates[0]?.run()) return;
  }
}

// Keep an army of about half the population, trained before the builders
// spend everything.
function recruit(state: GameState, content: Content, p: Player, v: Village, at: Ms) {
  if (v.training.length > 0) return;
  const rates = villageRates(state, content, v);
  if (troopCount(v.troops) >= rates.population * 0.5) return;
  const spareFood = (rates.net[content.food] ?? 0) - 3;
  if (spareFood < 1) return;
  const basic = trainOptions(state, content, v).find((o) => o.check.ok && !o.unit.role && !o.unit.research);
  if (!basic) return;
  const count = Math.min(Math.ceil(basic.maxCount * 0.5), Math.floor(spareFood / Math.max(1, basic.unit.upkeep)));
  if (count >= 1) train(state, content, p.id, v.id, basic.unit.id, count, at);
}

function raid(state: GameState, content: Content, p: Player, v: Village, at: Ms) {
  if (nextRandom(state) > 0.15) return;
  const raiders: Record<string, number> = {};
  for (const [u, n] of Object.entries(v.troops)) {
    const unit = content.units[u];
    if (unit && !unit.role && unit.carry > 0 && n >= 10) raiders[u] = Math.floor(n * 0.6);
  }
  if (troopCount(raiders) < 15) return;
  const home = villageTile(content, v);
  let best: { tile: number; d: number } | null = null;
  for (const c of Object.values(state.villages)) {
    if (c.kind !== "camp" || !c.npc || c.npc.tier > 1) continue;
    const tile = villageTile(content, c);
    const d = distance(content, home, tile);
    if (d <= 12 && (!best || d < best.d)) best = { tile, d };
  }
  if (best) sendTroops(state, content, { playerId: p.id, fromVillageId: v.id, toTile: best.tile, mission: "raid", troops: raiders }, at);
}

function total(r: Record<string, number>) {
  let n = 0;
  for (const v of Object.values(r)) n += v;
  return n;
}
