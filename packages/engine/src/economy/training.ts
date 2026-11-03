import type { Content } from "../content/load.js";
import { roundTo } from "../content/curves.js";
import type { FestivalDef, UnitDef } from "../content/schema.js";
import { newId } from "../core/ids.js";
import { canAfford, pay, scaleResources } from "../core/resources.js";
import { fail, ok, type Result } from "../core/result.js";
import { scaledMs } from "../core/time.js";
import type { ArmoryJob, FestivalJob, GameState, Ms, Resources, TrainBatch, Village } from "../core/types.js";
import { touch } from "../village/timeline.js";
import { buildingLevel, effectFactor, expansionSlots, factionOf, firstBuildingWith } from "../village/stats.js";
import { ownVillage, requirementMet, requirementText } from "./construction.js";

// ---------------------------------------------------------------------------
// Training, research, armory upgrades and festivals. Training is paid up front
// and units leave the building one by one on the village timeline; each
// training building runs its own queue. Research and upgrades run one at a
// time per village.
// ---------------------------------------------------------------------------

export interface TrainOption {
  unit: UnitDef;
  buildingId: string | null; // where it would train; null when no such building stands
  researched: boolean;
  unitMs: Ms;
  maxCount: number; // affordable and allowed right now
  check: Result;
}

function trainingBuilding(v: Village, unit: UnitDef): string | null {
  let best: { id: string; level: number } | null = null;
  for (const id of unit.building) {
    const level = buildingLevel(v, id);
    if (level > 0 && (!best || level > best.level)) best = { id, level };
  }
  return best?.id ?? null;
}

export function isResearched(v: Village, unit: UnitDef): boolean {
  return !unit.research || v.research.done.includes(unit.id);
}

// Settlers and chiefs are limited by the expansion slots still free here.
function expansionAllowance(state: GameState, content: Content, v: Village, unit: UnitDef): number {
  if (unit.role !== "settler" && unit.role !== "chief") return Infinity;
  const perSlot = unit.role === "settler" ? content.world.expansion.settlersPerSlot : content.world.expansion.chiefsPerSlot;
  const free = Math.max(0, expansionSlots(content, v) - v.children.length);
  const sameRole = (id: string) => content.units[id]?.role === unit.role;
  let existing = 0;
  for (const [id, n] of Object.entries(v.troops)) if (sameRole(id)) existing += n;
  for (const b of v.training) if (sameRole(b.unitId)) existing += b.count - b.done;
  for (const m of Object.values(state.movements)) {
    if (m.homeVillageId !== v.id) continue;
    for (const [id, n] of Object.entries(m.troops)) if (sameRole(id)) existing += n;
  }
  for (const other of Object.values(state.villages)) {
    for (const s of other.stationed) {
      if (s.homeVillageId !== v.id) continue;
      for (const [id, n] of Object.entries(s.troops)) if (sameRole(id)) existing += n;
    }
  }
  return Math.max(0, perSlot * free - existing);
}

export function trainOptions(state: GameState, content: Content, v: Village): TrainOption[] {
  const faction = factionOf(state, content, v);
  return faction.units
    .filter((u) => u.building.length > 0)
    .map((unit) => {
      const buildingId = trainingBuilding(v, unit);
      const researched = isResearched(v, unit);
      const factor = buildingId ? effectFactor(content, v, buildingId, "trainTime") : 1;
      const unitMs = scaledMs(state, unit.trainTime * factor * faction.trainTimeMultiplier);
      let affordable = Infinity;
      for (const [r, c] of Object.entries(unit.cost)) if (c > 0) affordable = Math.min(affordable, Math.floor((v.resources[r] ?? 0) / c + 1e-9));
      const allowance = expansionAllowance(state, content, v, unit);
      const maxCount = Math.max(0, Math.min(affordable, allowance, 100000));
      let check: Result = ok({});
      if (!buildingId) check = fail("requirements", `Needs a ${unit.building.map((b) => content.buildings[b]?.name ?? b).join(" or ")}.`);
      else if (!researched) check = fail("requirements", `Research ${unit.name} first.`);
      else if (allowance <= 0) check = fail("no_slot", "No free expansion slot for more of these. Raise your Oikist's House or Acropolis.");
      else if (maxCount <= 0) check = fail("insufficient", "Not enough resources.");
      return { unit, buildingId, researched, unitMs, maxCount, check };
    });
}

export function train(state: GameState, content: Content, playerId: string, villageId: string, unitId: string, count: number, now: Ms): Result<{ batch: TrainBatch }> {
  const own = ownVillage(state, playerId, villageId);
  if (!own.ok) return own;
  const v = own.v;
  touch(state, content, v, now);
  if (!Number.isInteger(count) || count < 1) return fail("invalid", "Train at least one unit.");
  const opt = trainOptions(state, content, v).find((o) => o.unit.id === unitId);
  if (!opt) return fail("invalid", "Your people cannot train that unit.");
  if (!opt.check.ok) return opt.check;
  if (count > opt.maxCount) {
    const allowance = expansionAllowance(state, content, v, opt.unit);
    if (count > allowance) return fail("no_slot", `You can train at most ${allowance} more of these here.`);
    return fail("insufficient", `You can afford at most ${opt.maxCount}.`);
  }
  const cost = scaleResources(opt.unit.cost, count);
  if (!canAfford(v.resources, cost)) return fail("insufficient", "Not enough resources.");
  pay(v.resources, cost);
  const queueEnd = v.training
    .filter((b) => b.buildingId === opt.buildingId)
    .reduce((m, b) => Math.max(m, b.startAt + b.count * b.unitMs), now);
  const batch: TrainBatch = { id: newId(state, "t"), buildingId: opt.buildingId!, unitId, count, done: 0, unitMs: opt.unitMs, startAt: queueEnd };
  v.training.push(batch);
  return ok({ batch });
}

// --- research ---------------------------------------------------------------

export function researchBuilding(content: Content, v: Village) {
  return firstBuildingWith(content, v, (d) => !!d.effects.research);
}

export function researchCheck(state: GameState, content: Content, v: Village, unit: UnitDef): Result<{ cost: Resources; durationMs: Ms }> {
  if (!unit.research) return fail("invalid", `${unit.name} needs no research.`);
  const cost = unit.research.cost;
  const lab = researchBuilding(content, v);
  const factor = lab ? effectFactor(content, v, lab.def.id, "researchTime") : 1;
  const durationMs = scaledMs(state, unit.research.time * factor);
  if (v.research.done.includes(unit.id)) return fail("invalid", `${unit.name} is already researched.`);
  if (!lab) return fail("requirements", "Build a Gymnasion to research units.");
  const missing = unit.research.requires.filter((r) => !requirementMet(v, r));
  if (missing.length) return fail("requirements", `Needs ${missing.map((r) => requirementText(content, r)).join(", ")}.`);
  if (v.research.job) return fail("busy", "Research is already under way.");
  if (!canAfford(v.resources, cost)) return fail("insufficient", "Not enough resources.");
  return ok({ cost, durationMs });
}

export function research(state: GameState, content: Content, playerId: string, villageId: string, unitId: string, now: Ms): Result {
  const own = ownVillage(state, playerId, villageId);
  if (!own.ok) return own;
  const v = own.v;
  touch(state, content, v, now);
  const unit = content.units[unitId];
  if (!unit || content.unitFaction[unitId] !== factionOf(state, content, v).id) return fail("invalid", "Your people do not know that unit.");
  const check = researchCheck(state, content, v, unit);
  if (!check.ok) return check;
  pay(v.resources, check.cost);
  v.research.job = { unitId, startAt: now, endAt: now + check.durationMs };
  return ok({});
}

// --- armory -----------------------------------------------------------------

export function armoryUpgradeCost(content: Content, unit: UnitDef, level: number): Resources {
  const a = content.world.armory;
  const out: Resources = {};
  for (const [r, c] of Object.entries(unit.cost)) out[r] = roundTo(c * a.costMultiplier * a.costGrowth ** (level - 1), 5);
  return out;
}

export function armoryCheck(state: GameState, content: Content, v: Village, unit: UnitDef): Result<{ level: number; cost: Resources; durationMs: Ms }> {
  const forge = firstBuildingWith(content, v, (d) => !!d.effects.armory);
  const level = (v.armory.levels[unit.id] ?? 0) + 1;
  const a = content.world.armory;
  const cost = armoryUpgradeCost(content, unit, level);
  const factor = forge ? effectFactor(content, v, forge.def.id, "upgradeTime") : 1;
  const durationMs = scaledMs(state, a.timeBase * a.timeGrowth ** (level - 1) * factor);
  if (!forge) return fail("requirements", "Build an Armory to improve units.");
  if (!isResearched(v, unit)) return fail("requirements", `Research ${unit.name} first.`);
  if (level > a.maxLevel) return fail("max_level", `${unit.name} is fully improved.`);
  if (level > forge.level) return fail("requirements", `Raise the ${forge.def.name} to level ${level}.`);
  if (v.armory.job) return fail("busy", "The smiths are already at work.");
  if (!canAfford(v.resources, cost)) return fail("insufficient", "Not enough resources.");
  return ok({ level, cost, durationMs });
}

export function upgradeUnit(state: GameState, content: Content, playerId: string, villageId: string, unitId: string, now: Ms): Result<{ job: ArmoryJob }> {
  const own = ownVillage(state, playerId, villageId);
  if (!own.ok) return own;
  const v = own.v;
  touch(state, content, v, now);
  const unit = content.units[unitId];
  if (!unit || content.unitFaction[unitId] !== factionOf(state, content, v).id) return fail("invalid", "Your people do not know that unit.");
  const check = armoryCheck(state, content, v, unit);
  if (!check.ok) return check;
  pay(v.resources, check.cost);
  const job: ArmoryJob = { unitId, level: check.level, startAt: now, endAt: now + check.durationMs };
  v.armory.job = job;
  return ok({ job });
}

// --- festivals ----------------------------------------------------------------

export function festivalOptions(state: GameState, content: Content, v: Village) {
  const out: { buildingId: string; festival: FestivalDef; durationMs: Ms; check: Result }[] = [];
  for (const def of content.buildingList) {
    for (const fest of def.effects.festivals ?? []) {
      const level = buildingLevel(v, def.id);
      const durationMs = scaledMs(state, fest.time * effectFactor(content, v, def.id, "festivalTime"));
      let check: Result = ok({});
      if (level < fest.minLevel) check = fail("requirements", `Needs ${def.name} level ${fest.minLevel}.`);
      else if (v.festival) check = fail("busy", "A festival is already under way.");
      else if (!canAfford(v.resources, fest.cost)) check = fail("insufficient", "Not enough resources.");
      out.push({ buildingId: def.id, festival: fest, durationMs, check });
    }
  }
  return out;
}

export function holdFestival(state: GameState, content: Content, playerId: string, villageId: string, festivalId: string, now: Ms): Result<{ job: FestivalJob }> {
  const own = ownVillage(state, playerId, villageId);
  if (!own.ok) return own;
  const v = own.v;
  touch(state, content, v, now);
  const opt = festivalOptions(state, content, v).find((o) => o.festival.id === festivalId);
  if (!opt) return fail("not_found", "No such festival.");
  if (!opt.check.ok) return opt.check;
  pay(v.resources, opt.festival.cost);
  const job: FestivalJob = { festivalId, culture: opt.festival.culture, startAt: now, endAt: now + opt.durationMs };
  v.festival = job;
  return ok({ job });
}
