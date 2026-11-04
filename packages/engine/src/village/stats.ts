import type { Content } from "../content/load.js";
import { curveAt, curveSum } from "../content/curves.js";
import type { BuildingDef, FactionDef } from "../content/schema.js";
import type { GameState, Player, Resources, Troops, Village } from "../core/types.js";
import { familyMods } from "../social/family.js";

// ---------------------------------------------------------------------------
// Derived village numbers. Everything here is a pure read of the state and the
// content: rates are per hour at speed 1 (the timeline multiplies by speed),
// capacities and levels are exact.
// ---------------------------------------------------------------------------

export function ownerOf(state: GameState, v: Village): Player {
  const p = state.players[v.ownerId];
  if (!p) throw new Error(`village ${v.id} has no owner ${v.ownerId}`);
  return p;
}

export function factionOf(state: GameState, content: Content, v: Village): FactionDef {
  const f = content.factions[ownerOf(state, v).factionId];
  if (!f) throw new Error(`unknown faction for village ${v.id}`);
  return f;
}

export function buildingLevel(v: Village, id: string): number {
  let best = 0;
  for (const b of v.buildings) if (b && b.id === id && b.level > best) best = b.level;
  return best;
}

export function buildingCount(v: Village, id: string): number {
  let n = 0;
  for (const b of v.buildings) if (b && b.id === id) n++;
  return n;
}

export function maxFieldLevel(v: Village, resource: string): number {
  let best = 0;
  for (const f of v.fields) if (f.resource === resource && f.level > best) best = f.level;
  return best;
}

function eachBuilding(content: Content, v: Village, fn: (def: BuildingDef, level: number) => void) {
  for (const b of v.buildings) {
    if (!b || b.level <= 0) continue;
    const def = content.buildings[b.id];
    if (def) fn(def, b.level);
  }
}

export function population(content: Content, v: Village): number {
  let pop = 0;
  for (const f of v.fields) {
    const def = content.fields[f.resource];
    if (def) pop += curveSum(def.pop, f.level);
  }
  eachBuilding(content, v, (def, level) => (pop += curveSum(def.pop, level)));
  return pop;
}

// Culture points per day at speed 1.
export function culturePerDay(content: Content, v: Village): number {
  if (v.kind !== "player") return 0;
  let cp = 0;
  for (const f of v.fields) {
    const def = content.fields[f.resource];
    if (def && f.level > 0) cp += curveAt(def.culture, f.level);
  }
  eachBuilding(content, v, (def, level) => (cp += curveAt(def.culture, level)));
  return cp;
}

export function capacity(content: Content, v: Village): Resources {
  const out: Resources = {};
  for (const r of content.resourceIds) out[r] = 0;
  eachBuilding(content, v, (def, level) => {
    const s = def.effects.storage;
    if (!s) return;
    const cap = curveAt(s.capacity, level);
    for (const r of s.resources) out[r] = (out[r] ?? 0) + cap;
  });
  for (const r of content.resourceIds) out[r] = Math.max(content.world.village.baseStorage, out[r] ?? 0);
  return out;
}

// Amount of every resource raiders cannot reach.
export function hidden(state: GameState, content: Content, v: Village): number {
  let hide = 0;
  eachBuilding(content, v, (def, level) => {
    if (def.effects.hide) hide += curveAt(def.effects.hide, level);
  });
  return hide * factionOf(state, content, v).cacheMultiplier;
}

export function fieldProduction(content: Content, v: Village): Resources {
  const out: Resources = {};
  for (const r of content.resourceIds) out[r] = 0;
  for (const f of v.fields) {
    const def = content.fields[f.resource];
    if (def) out[f.resource] = (out[f.resource] ?? 0) + curveAt(def.production, f.level);
  }
  return out;
}

export function oasisBonus(state: GameState, content: Content, v: Village): Resources {
  const out: Resources = {};
  for (const tile of v.oases) {
    const o = state.oases[tile];
    const type = o ? content.oasisTypes[o.typeId] : undefined;
    if (!type) continue;
    for (const [r, b] of Object.entries(type.bonus)) out[r] = (out[r] ?? 0) + b;
  }
  return out;
}

export function productionBonus(state: GameState, content: Content, v: Village): Resources {
  const out: Resources = {};
  for (const r of content.resourceIds) out[r] = 0;
  eachBuilding(content, v, (def, level) => {
    for (const p of def.effects.production ?? []) out[p.resource] = (out[p.resource] ?? 0) + curveAt(p.bonus, level);
  });
  for (const [r, b] of Object.entries(oasisBonus(state, content, v))) out[r] = (out[r] ?? 0) + b;
  const owner = state.players[v.ownerId];
  if (owner && content.kingdoms.enabled && isGovernor(state, owner)) {
    for (const r of content.resourceIds) out[r] = (out[r] ?? 0) + content.kingdoms.memberProductionBonus;
  }
  return out;
}

export function isGovernor(state: GameState, p: Player): boolean {
  if (!p.kingdomId) return false;
  const k = state.kingdoms[p.kingdomId];
  return !!k && k.kingId !== p.id;
}

export function heroProduction(state: GameState, content: Content, v: Village): Resources {
  const out: Resources = {};
  const hero = state.players[v.ownerId]?.hero;
  if (!content.hero.enabled || !hero || hero.homeVillageId !== v.id) return out;
  if (hero.status === "dead" || hero.status === "reviving") return out;
  const pts = hero.points.production;
  if (pts <= 0) return out;
  if (hero.productionResource === "all") {
    for (const r of content.resourceIds) out[r] = pts * content.hero.production.allPerPoint;
  } else {
    out[hero.productionResource] = pts * content.hero.production.singlePerPoint;
  }
  return out;
}

export function troopUpkeep(content: Content, troops: Troops): number {
  let n = 0;
  for (const [u, count] of Object.entries(troops)) n += (content.units[u]?.upkeep ?? 0) * count;
  return n;
}

// Food-upkeep of this village's own troops on the march (they eat from home).
export function transitUpkeep(state: GameState, content: Content, villageId: string): number {
  let n = 0;
  for (const m of Object.values(state.movements)) {
    if (m.homeVillageId !== villageId) continue;
    if (m.kind === "trade" || m.kind === "tradeReturn") continue;
    n += troopUpkeep(content, m.troops);
  }
  return n;
}

export interface VillageRates {
  production: Resources; // gross per hour into the village (after tribute)
  tribute: Resources; // per hour diverted to the kingdom pot
  upkeep: number; // food per hour: population and troops
  net: Resources; // production minus upkeep (food) — what the stock moves by
  capacity: Resources;
  culturePerDay: number;
  loyaltyPerHour: number;
  population: number;
}

export function villageRates(state: GameState, content: Content, v: Village, transit?: number): VillageRates {
  const base = fieldProduction(content, v);
  const bonus = productionBonus(state, content, v);
  const hero = heroProduction(state, content, v);
  const production: Resources = {};
  const tribute: Resources = {};
  const owner = state.players[v.ownerId];
  const share = owner && content.kingdoms.enabled && isGovernor(state, owner) ? content.kingdoms.tribute.share : 0;
  for (const r of content.resourceIds) {
    const gross = (base[r] ?? 0) * (1 + (bonus[r] ?? 0)) + (hero[r] ?? 0);
    tribute[r] = gross * share;
    production[r] = gross - tribute[r]!;
  }
  const pop = population(content, v);
  let upkeep = 0;
  if (v.kind === "player") {
    upkeep += pop * content.world.village.popUpkeep;
    upkeep += troopUpkeep(content, v.troops);
    for (const s of v.stationed) upkeep += troopUpkeep(content, s.troops);
    for (const tile of v.oases) {
      const o = state.oases[tile];
      if (o) for (const s of o.stationed) upkeep += troopUpkeep(content, s.troops);
    }
    upkeep += transit ?? transitUpkeep(state, content, v.id);
  }
  const net: Resources = { ...production };
  net[content.food] = (net[content.food] ?? 0) - upkeep;
  let loyalty = content.world.village.baseLoyaltyRegen;
  eachBuilding(content, v, (def, level) => {
    if (def.effects.loyaltyRegen) loyalty += curveAt(def.effects.loyaltyRegen, level);
  });
  return {
    production,
    tribute,
    upkeep,
    net,
    capacity: capacity(content, v),
    culturePerDay: culturePerDay(content, v) * (owner?.hero?.homeVillageId === v.id ? 1 + familyMods(state, content, owner, v.updatedAt).cultureBonus : 1),
    loyaltyPerHour: loyalty,
    population: pop,
  };
}

export function buildTimeFactor(content: Content, v: Village): number {
  let factor = 1;
  let found = false;
  for (const def of content.buildingList) {
    if (!def.effects.buildTime) continue;
    found = true;
    factor *= curveAt(def.effects.buildTime, buildingLevel(v, def.id));
  }
  return found ? factor : 1;
}

export function effectFactor(content: Content, v: Village, buildingId: string, effect: "trainTime" | "researchTime" | "upgradeTime" | "festivalTime" | "heroRevive"): number {
  const def = content.buildings[buildingId];
  const curve = def?.effects[effect];
  if (!curve) return 1;
  return curveAt(curve, buildingLevel(v, buildingId));
}

export function firstBuildingWith(content: Content, v: Village, test: (def: BuildingDef) => boolean): { def: BuildingDef; level: number } | null {
  let best: { def: BuildingDef; level: number } | null = null;
  for (const b of v.buildings) {
    if (!b || b.level <= 0) continue;
    const def = content.buildings[b.id];
    if (def && test(def) && (!best || b.level > best.level)) best = { def, level: b.level };
  }
  return best;
}

export function wallLevel(content: Content, v: Village): number {
  return firstBuildingWith(content, v, (d) => !!d.effects.wall)?.level ?? 0;
}

export function rallyPoint(content: Content, v: Village): { level: number; chooseTargetFrom: number; twoTargetsFrom: number } | null {
  const rp = firstBuildingWith(content, v, (d) => !!d.effects.rallyPoint?.sendsTroops);
  if (!rp) return null;
  return { level: rp.level, ...rp.def.effects.rallyPoint! };
}

export function merchantsTotal(content: Content, v: Village): number {
  let n = 0;
  eachBuilding(content, v, (def, level) => {
    if (def.effects.merchants) n += Math.floor(curveAt(def.effects.merchants, level));
  });
  return n;
}

export function merchantsBusy(state: GameState, v: Village): number {
  let n = 0;
  for (const m of Object.values(state.movements)) {
    if (m.homeVillageId === v.id && (m.kind === "trade" || m.kind === "tradeReturn")) n += m.merchants;
  }
  return n;
}

export function merchantCapacity(state: GameState, content: Content, v: Village): number {
  let bonus = 0;
  eachBuilding(content, v, (def, level) => {
    if (def.effects.merchantCapacity) bonus += curveAt(def.effects.merchantCapacity, level);
  });
  return factionOf(state, content, v).merchant.capacity * (1 + bonus);
}

export function troopSpeedBonus(content: Content, v: Village): { beyond: number; bonus: number } {
  let beyond = Infinity;
  let bonus = 0;
  eachBuilding(content, v, (def, level) => {
    const t = def.effects.troopSpeed;
    if (!t) return;
    beyond = Math.min(beyond, t.beyond);
    bonus += curveAt(t.bonus, level);
  });
  return { beyond: Number.isFinite(beyond) ? beyond : 0, bonus };
}

export function expansionSlots(content: Content, v: Village): number {
  let slots = 0;
  eachBuilding(content, v, (def, level) => {
    for (const at of def.effects.expansionSlots ?? []) if (level >= at) slots++;
  });
  return slots;
}

export function oasisSlots(content: Content, v: Village): number {
  let slots = 0;
  eachBuilding(content, v, (def, level) => {
    for (const at of def.effects.oasisSlots ?? []) if (level >= at) slots++;
  });
  return slots;
}

export function treasureCapacity(content: Content, v: Village): number {
  let cap = 0;
  eachBuilding(content, v, (def, level) => {
    if (def.effects.treasures) cap += curveAt(def.effects.treasures, level);
  });
  return Math.floor(cap);
}

export function blocksConquest(content: Content, v: Village): boolean {
  return v.buildings.some((b) => b && b.level > 0 && content.buildings[b.id]?.effects.blocksConquest);
}

// Culture points needed to own `count` villages (count ≥ 2; one is free).
export function cultureForVillages(content: Content, count: number): number {
  if (count <= 1) return 0;
  const c = content.world.culture.villageCost;
  return Math.round((c.base * (count - 1) ** c.exponent) / c.round) * c.round;
}

export function playerCulture(state: GameState, p: Player): number {
  let cp = p.cultureBank;
  for (const id of p.villageIds) cp += state.villages[id]?.culture ?? 0;
  return cp;
}

export function playerPopulation(state: GameState, content: Content, p: Player): number {
  let pop = 0;
  for (const id of p.villageIds) {
    const v = state.villages[id];
    if (v) pop += population(content, v);
  }
  return pop;
}
