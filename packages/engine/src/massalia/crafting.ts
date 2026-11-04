import type { Content } from "../content/load.js";
import { HOUR } from "../core/time.js";
import { newId, nextSeq } from "../core/ids.js";
import { fail, ok, type Result } from "../core/result.js";
import type { Altar, CraftJob, GameState, Ms, Player } from "../core/types.js";
import { addReport } from "../social/reports.js";
import { buildingLevel } from "../village/stats.js";
import { touch } from "../village/timeline.js";
import { seasonMs } from "../world/calendar.js";
import { addGoods, freePeople, goodsOf } from "./house.js";
import { statOf } from "./profile.js";

// ---------------------------------------------------------------------------
// Crafts and the altar. A recipe takes goods from the house's stores and
// resources from the town that works it, keeps its people busy while it runs,
// and lays the product in the stores when it is ready (MASSALIA's slipway:
// buildings.json craft, services/buildings.ts craft). Harbor recipes share the
// Harbor's slips; household work (the physician's) has its own bench.
//
// The altar (MASSALIA's Barracks altar, battle.json): one beast burned at the
// Barracks blesses every man the house fields for a while. One blessing at a
// time; it cannot be replaced while it burns.
// ---------------------------------------------------------------------------

export function craftSlots(content: Content, p: Player, state: GameState, kind: "harbor" | "household", villageId?: string | null): number {
  const cfg = content.massalia.crafting.slots;
  if (kind === "household") return cfg.household;
  const v = villageId ? state.villages[villageId] : undefined;
  const level = v ? buildingLevel(v, "harbor") : 0;
  return cfg.harbor.filter((l) => level >= l).length;
}

function slotKind(content: Content, recipeId: string): "harbor" | "household" {
  return content.recipes[recipeId]?.building ? "harbor" : "household";
}

export function craftDurationMs(state: GameState, content: Content, recipeId: string): Ms {
  return Math.round(((content.recipes[recipeId]?.hours ?? 1) * HOUR) / state.settings.speed);
}

export function craftCheck(state: GameState, content: Content, p: Player, recipeId: string, villageId: string | null): Result {
  const r = content.recipes[recipeId];
  if (!r) return fail("not_found", "There is no such craft.");
  const kind = slotKind(content, recipeId);
  if (r.building) {
    const v = villageId ? state.villages[villageId] : undefined;
    if (!v || v.ownerId !== p.id) return fail("not_found", "That is not one of your towns.");
    const lvl = buildingLevel(v, r.building);
    const bname = content.buildings[r.building]?.name ?? r.building;
    if (lvl < (r.level ?? 1)) return fail("requirements", `${r.name} needs a ${bname} at level ${r.level ?? 1} in ${v.name}.`);
    const running = p.crafts.filter((j) => j.villageId === v.id && slotKind(content, j.recipeId) === kind).length;
    if (running >= craftSlots(content, p, state, kind, v.id)) return fail("busy", `Every slip in ${v.name} is taken. Raise the ${bname} for another.`);
    for (const [res, n] of Object.entries(r.resources)) {
      if ((v.resources[res] ?? 0) + 1e-6 < n) return fail("insufficient", `${r.name} needs ${n} ${content.resources.find((x) => x.id === res)?.name.toLowerCase() ?? res} in ${v.name}.`);
    }
  } else {
    const running = p.crafts.filter((j) => slotKind(content, j.recipeId) === kind).length;
    if (running >= craftSlots(content, p, state, kind)) return fail("busy", "Your household is already at work on a craft.");
  }
  for (const [who, n] of Object.entries(r.people)) {
    const def = content.people[who];
    if (freePeople(p, who) < n) return fail("requirements", `${r.name} needs ${n} ${n === 1 ? def?.name.toLowerCase() : def?.plural.toLowerCase()} free to work. Hire them at the Agora.`);
  }
  for (const [g, n] of Object.entries(r.goods)) {
    if (goodsOf(p, g) < n) return fail("insufficient", `${r.name} needs ${n} ${content.goods[g]?.name.toLowerCase() ?? g}; you hold ${goodsOf(p, g)}.`);
  }
  return ok({});
}

export function craft(state: GameState, content: Content, playerId: string, recipeId: string, villageId: string | null, at: Ms): Result<{ job: CraftJob }> {
  const p = state.players[playerId];
  if (!p) return fail("not_found", "No such player.");
  const r = content.recipes[recipeId];
  const v = r?.building && villageId ? state.villages[villageId] : undefined;
  if (v) touch(state, content, v, at);
  const check = craftCheck(state, content, p, recipeId, r?.building ? villageId : null);
  if (!check.ok) return check;
  if (v) for (const [res, n] of Object.entries(r!.resources)) v.resources[res] = (v.resources[res] ?? 0) - n;
  for (const [g, n] of Object.entries(r!.goods)) addGoods(p, g, -n);
  const job: CraftJob = { id: newId(state, "c"), recipeId, villageId: v ? v.id : null, people: { ...r!.people }, startAt: at, readyAt: at + craftDurationMs(state, content, recipeId) };
  p.crafts.push(job);
  state.scheduled.push({ id: newId(state, "e"), seq: nextSeq(state), at: job.readyAt, kind: "craftDone", playerId: p.id });
  return ok({ job });
}

// Lay every finished product in the stores (a scheduled event at readyAt).
export function finishCrafts(state: GameState, content: Content, playerId: string, at: Ms): void {
  const p = state.players[playerId];
  if (!p) return;
  const done = p.crafts.filter((j) => j.readyAt <= at);
  if (done.length === 0) return;
  p.crafts = p.crafts.filter((j) => j.readyAt > at);
  for (const j of done) {
    const r = content.recipes[j.recipeId];
    if (!r) continue;
    for (const [g, n] of Object.entries(r.output)) addGoods(p, g, n);
    const where = j.villageId ? state.villages[j.villageId]?.name : null;
    addReport(state, at, "market", `${r.name} is ready`, [p.id], {
      type: "simple",
      lines: [`${where ? `In ${where}, ` : ""}${r.name.toLowerCase().startsWith("a") ? "an" : "a"} ${r.name} is finished and in your stores.`],
    });
  }
}

// --- the altar ---------------------------------------------------------------------

export function altarLit(p: Player | undefined, at: Ms): Altar | null {
  const a = p?.altar;
  return a && a.from <= at && at < a.until ? a : null;
}

// The share added to every man the house fields at `at`.
export function altarBoost(p: Player | undefined, at: Ms): number {
  return altarLit(p, at)?.boost ?? 0;
}

export function altarDurationMs(state: GameState, content: Content, p: Player): Ms {
  let f = 1;
  for (const [id, n] of Object.entries(p.people)) if (n > 0) f = Math.max(f, content.people[id]?.altarDuration ?? 1);
  return Math.round(content.massalia.crafting.altar.seasons * seasonMs(state, content) * f);
}

export function sacrifice(state: GameState, content: Content, playerId: string, villageId: string, good: string, at: Ms): Result<{ altar: Altar }> {
  const p = state.players[playerId];
  if (!p) return fail("not_found", "No such player.");
  const cfg = content.massalia.crafting.altar;
  const offering = cfg.offerings.find((o) => o.good === good);
  if (!offering) return fail("invalid", `The altar takes ${cfg.offerings.map((o) => `a ${content.goods[o.good]?.name.toLowerCase()}`).join(" or ")}.`);
  const v = state.villages[villageId];
  if (!v || v.ownerId !== p.id) return fail("not_found", "That is not one of your towns.");
  if (buildingLevel(v, cfg.building) <= 0) return fail("requirements", `The altar stands in the ${content.buildings[cfg.building]?.name ?? cfg.building}. Build one in ${v.name}.`);
  if (altarLit(p, at)) return fail("busy", "The altar still smokes from the last offering.");
  if (goodsOf(p, good) < 1) return fail("insufficient", `You have no ${content.goods[good]?.name.toLowerCase()} for this. The agora sells them.`);
  addGoods(p, good, -1);
  const boost = offering.boost * (1 + statOf(content, p, "devotion") * content.massalia.profile.effects.devotionAltar);
  p.altar = { good, boost, from: at, until: at + altarDurationMs(state, content, p) };
  return ok({ altar: p.altar });
}
