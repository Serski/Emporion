import type { Content } from "./content/load.js";
import type { BuildingDef } from "./content/schema.js";
import { floorResources } from "./core/resources.js";
import type { GameState, HeroPoints, Movement, Ms, OasisState, Player, Resources, Village } from "./core/types.js";
import { constructionBlocker, planBuild, type BuildPlan } from "./economy/construction.js";
import { heroAlive, heroHealth, reviveCost, reviveMs, xpForLevel } from "./social/hero.js";
import { effectiveTreasures, kingdomAtTile } from "./social/kingdoms.js";
import {
  cultureForVillages,
  culturePerDay,
  expansionSlots,
  hidden,
  merchantCapacity,
  merchantsBusy,
  merchantsTotal,
  oasisSlots,
  playerCulture,
  playerPopulation,
  treasureCapacity,
  villageRates,
  wallLevel,
} from "./village/stats.js";
import { distance, tileIndex, tileInfo, type TileInfo } from "./world/map.js";

// ---------------------------------------------------------------------------
// Read models: what a client renders. Rates here are per hour at the world's
// speed (what the player actually sees accrue). Call advance()/settle() first.
// ---------------------------------------------------------------------------

export interface VillageSummary {
  id: string;
  name: string;
  x: number;
  y: number;
  tile: number;
  isCapital: boolean;
  population: number;
  loyalty: number;
  culture: number;
  culturePerDay: number;
  resources: Resources;
  capacity: Resources;
  production: Resources;
  upkeep: number;
  net: Resources;
  hidden: number;
  merchants: { total: number; busy: number; capacity: number };
  expansion: { slots: number; used: number };
  oases: { slots: number; used: number };
  wallLevel: number;
  treasures: { stored: number; counted: number; capacity: number };
}

export function villageSummary(state: GameState, content: Content, v: Village): VillageSummary {
  const r = villageRates(state, content, v);
  const speed = state.settings.speed;
  const scale = (res: Resources) => Object.fromEntries(Object.entries(res).map(([k, n]) => [k, n * speed]));
  return {
    id: v.id,
    name: v.name,
    x: v.x,
    y: v.y,
    tile: tileIndex(content, v.x, v.y),
    isCapital: v.isCapital,
    population: r.population,
    loyalty: v.loyalty,
    culture: v.culture,
    culturePerDay: culturePerDay(content, v) * speed,
    resources: floorResources(v.resources),
    capacity: r.capacity,
    production: scale(r.production),
    upkeep: r.upkeep * speed,
    net: scale(r.net),
    hidden: v.kind === "player" ? hidden(state, content, v) : 0,
    merchants: { total: merchantsTotal(content, v), busy: merchantsBusy(state, v), capacity: v.kind === "player" ? merchantCapacity(state, content, v) : 0 },
    expansion: { slots: expansionSlots(content, v), used: v.children.length },
    oases: { slots: oasisSlots(content, v), used: v.oases.length },
    wallLevel: wallLevel(content, v),
    treasures: { stored: v.treasures, counted: effectiveTreasures(content, v), capacity: treasureCapacity(content, v) },
  };
}

export interface SlotView {
  slot: number;
  building: { def: BuildingDef; level: number } | null;
  reservedFor: BuildingDef | null; // a fixed site's building, when empty
  queued: number; // jobs waiting on this site
  plan: BuildPlan | null; // the next upgrade (null on an empty site)
}

export function slotViews(state: GameState, content: Content, v: Village): SlotView[] {
  return v.buildings.map((b, slot) => {
    const queuedJobs = v.buildQueue.filter((j) => j.kind === "building" && j.index === slot);
    const def = b ? content.buildings[b.id] ?? null : null;
    const pendingDef = !b && queuedJobs[0] ? content.buildings[queuedJobs[0].buildingId] ?? null : null;
    const shown = def ?? pendingDef;
    return {
      slot,
      building: b && def ? { def, level: b.level } : pendingDef ? { def: pendingDef, level: 0 } : null,
      reservedFor: content.buildingList.find((d) => d.fixedSlot === slot) ?? null,
      queued: queuedJobs.length,
      plan: shown ? planBuild(state, content, v, { kind: "building", slot, buildingId: shown.id }) : null,
    };
  });
}

export interface ConstructionOption {
  def: BuildingDef;
  available: boolean; // requirements met and the site fits
  reason: string | null;
  plan: BuildPlan;
}

// Everything that could go on an empty site, buildable ones first.
export function constructionOptions(state: GameState, content: Content, v: Village, slot: number): ConstructionOption[] {
  const out: ConstructionOption[] = [];
  for (const def of content.buildingList) {
    const fixedHere = content.buildingList.find((d) => d.fixedSlot === slot);
    if (fixedHere && fixedHere.id !== def.id) continue;
    if (!fixedHere && def.fixedSlot !== undefined) continue;
    const blocker = constructionBlocker(state, content, v, slot, def);
    // Hide what can never stand here (one per town and already built, capital-only elsewhere).
    if (blocker && blocker.code === "requirements" && (def.capitalOnly && !v.isCapital)) continue;
    const plan = planBuild(state, content, v, { kind: "building", slot, buildingId: def.id });
    out.push({ def, available: !blocker, reason: blocker?.message ?? null, plan });
  }
  out.sort((a, b) => Number(b.available) - Number(a.available));
  return out;
}

export function fieldPlans(state: GameState, content: Content, v: Village): BuildPlan[] {
  return v.fields.map((_, index) => planBuild(state, content, v, { kind: "field", index }));
}

export interface HeroView {
  name: string;
  level: number;
  xp: number;
  xpNext: number;
  health: number;
  status: string;
  alive: boolean;
  homeVillageId: string;
  points: HeroPoints;
  unspent: number;
  productionResource: string;
  reviveAt: Ms | null;
  reviveCost: Resources;
  reviveMs: Ms;
}

export function heroView(state: GameState, content: Content, p: Player, now: Ms): HeroView | null {
  const h = p.hero;
  if (!h) return null;
  return {
    name: h.name,
    level: h.level,
    xp: h.xp,
    xpNext: xpForLevel(content, h.level + 1),
    health: Math.floor(heroHealth(state, content, h, now)),
    status: h.status,
    alive: heroAlive(h),
    homeVillageId: h.homeVillageId,
    points: h.points,
    unspent: h.unspent,
    productionResource: h.productionResource,
    reviveAt: h.reviveAt,
    reviveCost: reviveCost(content, h),
    reviveMs: reviveMs(state, content, h),
  };
}

export interface PlayerSummary {
  id: string;
  name: string;
  factionId: string;
  culture: number;
  culturePerDay: number;
  cultureNext: number;
  population: number;
  protectedUntil: Ms;
  villages: string[];
  capitalId: string | null;
  kingdomId: string | null;
  offense: number;
  defense: number;
}

export function playerSummary(state: GameState, content: Content, p: Player): PlayerSummary {
  let cpd = 0;
  for (const id of p.villageIds) {
    const v = state.villages[id];
    if (v) cpd += culturePerDay(content, v) * state.settings.speed;
  }
  return {
    id: p.id,
    name: p.name,
    factionId: p.factionId,
    culture: playerCulture(state, p),
    culturePerDay: cpd,
    cultureNext: cultureForVillages(content, p.villageIds.length + 1),
    population: playerPopulation(state, content, p),
    protectedUntil: p.protectedUntil,
    villages: p.villageIds,
    capitalId: p.capitalId,
    kingdomId: p.kingdomId,
    offense: p.offense,
    defense: p.defense,
  };
}

export interface MovementView {
  movement: Movement;
  direction: "out" | "in" | "home";
  hostile: boolean;
  fromName: string;
  toName: string;
}

// A player's own marches, plus everything arriving at their towns and oases.
// Incoming hostile marches show their timing, not their troops.
export function movementsFor(state: GameState, content: Content, playerId: string): MovementView[] {
  const p = state.players[playerId];
  if (!p) return [];
  const ownTiles = new Set<number>();
  for (const id of p.villageIds) {
    const v = state.villages[id];
    if (!v) continue;
    ownTiles.add(tileIndex(content, v.x, v.y));
    for (const t of v.oases) ownTiles.add(t);
  }
  const name = (tile: number) => {
    const vid = state.occupancy[tile];
    if (vid) return state.villages[vid]?.name ?? "?";
    const info = tileInfo(content, state.settings.seed, tile);
    return info.oasis ? info.oasis.name : `(${info.x}|${info.y})`;
  };
  const out: MovementView[] = [];
  for (const m of Object.values(state.movements)) {
    if (m.ownerId === playerId) {
      out.push({ movement: m, direction: m.kind === "return" || m.kind === "tradeReturn" ? "home" : "out", hostile: false, fromName: name(m.fromTile), toName: name(m.toTile) });
    } else if (ownTiles.has(m.toTile) && m.kind !== "return" && m.kind !== "tradeReturn") {
      const hostile = m.kind === "attack" || m.kind === "raid" || m.kind === "scout";
      out.push({ movement: hostile ? { ...m, troops: {} } : m, direction: "in", hostile, fromName: name(m.fromTile), toName: name(m.toTile) });
    }
  }
  out.sort((a, b) => a.movement.arriveAt - b.movement.arriveAt);
  return out;
}

export interface TileDetails {
  info: TileInfo;
  village: {
    id: string;
    name: string;
    ownerId: string;
    ownerName: string;
    ownerKind: string;
    factionId: string;
    kind: Village["kind"];
    population: number;
    label: string | null;
    isCapital: boolean;
  } | null;
  oasis: { state: OasisState | null; ownerName: string | null; ownerVillageName: string | null } | null;
  kingdomId: string | null;
}

export function tileDetails(state: GameState, content: Content, tile: number): TileDetails {
  const info = tileInfo(content, state.settings.seed, tile);
  const vid = state.occupancy[tile];
  const v = vid ? state.villages[vid] : undefined;
  let village: TileDetails["village"] = null;
  if (v) {
    const owner = state.players[v.ownerId];
    village = {
      id: v.id,
      name: v.name,
      ownerId: v.ownerId,
      ownerName: owner?.name ?? "?",
      ownerKind: owner?.kind ?? "npc",
      factionId: owner?.factionId ?? "",
      kind: v.kind,
      population: villageRates(state, content, v).population,
      label: v.npc?.label ?? null,
      isCapital: v.isCapital,
    };
  }
  let oasis: TileDetails["oasis"] = null;
  if (info.kind === "oasis") {
    const o = state.oases[tile] ?? null;
    const ov = o?.ownerVillageId ? state.villages[o.ownerVillageId] : undefined;
    oasis = { state: o, ownerName: ov ? state.players[ov.ownerId]?.name ?? null : null, ownerVillageName: ov?.name ?? null };
  }
  return { info, village, oasis, kingdomId: kingdomAtTile(state, content, tile) };
}

export interface RankingRow {
  playerId: string;
  name: string;
  factionId: string;
  kind: string;
  villages: number;
  population: number;
  offense: number;
  defense: number;
  looted: number;
}

export function rankings(state: GameState, content: Content): RankingRow[] {
  return Object.values(state.players)
    .filter((p) => p.kind !== "npc")
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      factionId: p.factionId,
      kind: p.kind,
      villages: p.villageIds.length,
      population: playerPopulation(state, content, p),
      offense: p.offense,
      defense: p.defense,
      looted: p.looted,
    }))
    .sort((a, b) => b.population - a.population);
}

export function distanceBetween(content: Content, a: number, b: number): number {
  return distance(content, a, b);
}
