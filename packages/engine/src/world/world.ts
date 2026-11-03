import type { Content } from "../content/load.js";
import type { LayoutDef } from "../content/schema.js";
import { newId, nextSeq } from "../core/ids.js";
import { hash01, nextRandom, weightedChoice } from "../core/rng.js";
import { HOUR } from "../core/time.js";
import type { GameState, Hero, Ms, Player, PlayerKind, Resources, Troops, Village, VillageKind } from "../core/types.js";
import { distance, tileIndex, tileKind, tileLayout, tilesAround, tileXY } from "./map.js";
import { capacity } from "../village/stats.js";
import { scheduleBot } from "../ai/bot.js";

export interface WorldOptions {
  seed?: number;
  name?: string;
  speed?: number;
  troopSpeed?: number;
  startedAt: Ms;
  npcCamps?: number;
  npcRaids?: boolean;
  npcTowns?: boolean;
}

export function createWorld(content: Content, opts: WorldOptions): GameState {
  const d = content.world.defaults;
  const speed = opts.speed ?? d.speed;
  const seed = (opts.seed ?? 20260301) >>> 0;
  const protectionHours = Math.max(content.world.protection.minHours, content.world.protection.hours / speed);
  const state: GameState = {
    schema: 1,
    settings: {
      name: opts.name ?? d.name,
      seed,
      speed,
      troopSpeed: opts.troopSpeed ?? speed,
      startedAt: opts.startedAt,
      npcCamps: opts.npcCamps ?? d.npcCamps,
      npcRaids: opts.npcRaids ?? content.world.npc.camps.raids.enabled,
      protectionMs: Math.round(protectionHours * HOUR),
    },
    time: opts.startedAt,
    rng: seed ^ 0x9e3779b9,
    nextId: 1,
    players: {},
    villages: {},
    occupancy: {},
    oases: {},
    movements: {},
    reports: {},
    kingdoms: {},
    scheduled: [],
    npc: { campsPlayerId: null, townsPlayerId: null },
  };
  if (opts.npcTowns !== false) placeTowns(state, content);
  placeCamps(state, content, state.settings.npcCamps);
  if (state.settings.npcRaids && state.npc.campsPlayerId) {
    const interval = (content.world.npc.camps.raids.intervalHours * HOUR) / speed;
    state.scheduled.push({ id: newId(state, "e"), seq: nextSeq(state), at: Math.round(opts.startedAt + interval), kind: "npcRaids" });
  }
  return state;
}

function npcPlayer(state: GameState, content: Content, which: "camps" | "towns"): Player {
  const key = which === "camps" ? "campsPlayerId" : "townsPlayerId";
  const existing = state.npc[key];
  if (existing && state.players[existing]) return state.players[existing]!;
  const cfg = content.world.npc[which];
  const p = makePlayer(state, cfg.playerName, cfg.factionId, "npc", state.settings.startedAt);
  p.protectedUntil = 0;
  state.npc[key] = p.id;
  return p;
}

function makePlayer(state: GameState, name: string, factionId: string, kind: PlayerKind, at: Ms): Player {
  const p: Player = {
    id: newId(state, "p"),
    name,
    factionId,
    kind,
    createdAt: at,
    protectedUntil: at + state.settings.protectionMs,
    capitalId: null,
    villageIds: [],
    cultureBank: 0,
    offense: 0,
    defense: 0,
    looted: 0,
    hero: null,
    kingdomId: null,
    meta: {},
  };
  state.players[p.id] = p;
  return p;
}

// Field order around the village: resources interleaved, so the ring of
// fields reads as a mixed landscape rather than four blocks.
export function fieldsFor(content: Content, layout: LayoutDef, level = 0) {
  const left: Record<string, number> = { ...layout.fields };
  const out: { resource: string; level: number }[] = [];
  while (out.length < content.world.village.fieldCount) {
    let placed = false;
    for (const r of content.resourceIds) {
      if ((left[r] ?? 0) > 0 && out.length < content.world.village.fieldCount) {
        out.push({ resource: r, level });
        left[r]! -= 1;
        placed = true;
      }
    }
    if (!placed) break;
  }
  return out;
}

export interface NewVillage {
  ownerId: string;
  tile: number;
  name: string;
  kind: VillageKind;
  layout: LayoutDef;
  isCapital: boolean;
  at: Ms;
  resources?: Resources;
  fieldLevel?: number;
}

export function createVillage(state: GameState, content: Content, nv: NewVillage): Village {
  const { x, y } = tileXY(content, nv.tile);
  const buildings: Village["buildings"] = Array.from({ length: content.world.village.slots }, () => null);
  if (nv.kind === "player") {
    for (const s of content.world.village.start.buildings) buildings[s.slot] = { id: s.id, level: s.level };
  }
  const v: Village = {
    id: newId(state, "v"),
    ownerId: nv.ownerId,
    name: nv.name,
    x,
    y,
    kind: nv.kind,
    layoutId: nv.layout.id,
    isCapital: nv.isCapital,
    foundedAt: nv.at,
    updatedAt: nv.at,
    resources: { ...(nv.resources ?? content.world.village.start.resources) },
    culture: 0,
    loyalty: 100,
    fields: fieldsFor(content, nv.layout, nv.fieldLevel ?? 0),
    buildings,
    buildQueue: [],
    training: [],
    research: { done: [], job: null },
    armory: { levels: {}, job: null },
    festival: null,
    troops: {},
    stationed: [],
    children: [],
    oases: [],
    treasures: 0,
    tribute: {},
    npc: null,
  };
  for (const r of content.resourceIds) v.resources[r] ??= 0;
  state.villages[v.id] = v;
  state.occupancy[nv.tile] = v.id;
  const owner = state.players[nv.ownerId];
  if (owner) {
    owner.villageIds.push(v.id);
    if (nv.isCapital) owner.capitalId = v.id;
  }
  return v;
}

function startLayout(content: Content): LayoutDef {
  return content.world.mapgen.layouts.find((l) => l.start) ?? content.world.mapgen.layouts[0]!;
}

function nearVillage(state: GameState, content: Content, tile: number, spacing: number): boolean {
  const { x, y } = tileXY(content, tile);
  const r = Math.ceil(spacing);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (Math.hypot(dx, dy) > spacing) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= content.map.width || yy >= content.map.height) continue;
      if (state.occupancy[tileIndex(content, xx, yy)]) return true;
    }
  return false;
}

export function isFreeValley(state: GameState, content: Content, tile: number): boolean {
  return tileKind(content, state.settings.seed, tile) === "valley" && !state.occupancy[tile];
}

export interface AddPlayerOptions {
  name: string;
  factionId: string;
  kind?: PlayerKind;
  at: Ms;
  nearTile?: number; // start near this tile instead of the faction's home town
  villageName?: string;
}

export function addPlayer(state: GameState, content: Content, opts: AddPlayerOptions): { player: Player; village: Village } {
  const faction = content.factions[opts.factionId];
  if (!faction || !faction.playable) throw new Error(`faction ${opts.factionId} is not playable`);
  const player = makePlayer(state, opts.name, faction.id, opts.kind ?? "human", opts.at);
  const tile = findStartTile(state, content, faction.id, opts.nearTile);
  const village = createVillage(state, content, {
    ownerId: player.id,
    tile,
    name: opts.villageName ?? `${opts.name}'s Town`,
    kind: "player",
    layout: tileLayout(content, state.settings.seed, tile) ?? startLayout(content),
    isCapital: true,
    at: opts.at,
  });
  if (content.hero.enabled) player.hero = newHero(content, `${opts.name}`, village.id, opts.at);
  if (player.kind === "ai") scheduleBot(state, player.id, opts.at);
  return { player, village };
}

export function newHero(content: Content, name: string, homeVillageId: string, at: Ms): Hero {
  return {
    name,
    homeVillageId,
    level: 0,
    xp: 0,
    health: 100,
    healthAt: at,
    status: "home",
    where: null,
    reviveAt: null,
    points: { strength: 0, offense: 0, defense: 0, production: 0 },
    unspent: content.hero.startPoints,
    productionResource: "all",
  };
}

function findStartTile(state: GameState, content: Content, factionId: string, nearTile?: number): number {
  const faction = content.factions[factionId]!;
  const town = faction.start ? content.towns[faction.start.town] : undefined;
  const center =
    nearTile ??
    (town ? tileIndex(content, town.x, town.y) : tileIndex(content, Math.floor(content.map.width / 2), Math.floor(content.map.height / 2)));
  const sameFaction = Object.values(state.players).filter((p) => p.factionId === factionId && p.kind !== "npc").length - 1;
  const { base, perPlayer } = content.world.mapgen.startArea;
  const ring = base + perPlayer * Math.sqrt(Math.max(0, sameFaction));
  const spacing = Math.max(content.world.mapgen.minSpacing, 1);
  const start = startLayout(content);
  for (const maxR of [ring + 8, ring + 20, Math.max(content.map.width, content.map.height)]) {
    const candidates = tilesAround(content, state.settings.seed + sameFaction, center, maxR).filter(
      (t) =>
        isFreeValley(state, content, t) &&
        tileLayout(content, state.settings.seed, t)?.id === start.id &&
        !nearVillage(state, content, t, spacing),
    );
    const outward = candidates.find((t) => distance(content, t, center) >= ring);
    const pick = outward ?? candidates[0];
    if (pick !== undefined) return pick;
  }
  throw new Error("no free start tile left on the map");
}

// --- NPC places --------------------------------------------------------------

function storageBuildings(content: Content, level: number, wallLevel: number): Village["buildings"] {
  const b: Village["buildings"] = Array.from({ length: content.world.village.slots }, () => null);
  let slot = 0;
  for (const def of content.buildingList) {
    if (def.effects.storage && level > 0 && slot < content.world.village.slots - 2) {
      b[slot++] = { id: def.id, level: Math.min(def.maxLevel, level) };
    }
  }
  const wall = content.buildingList.find((d) => d.effects.wall);
  if (wall && wallLevel > 0) b[wall.fixedSlot ?? content.world.village.slots - 1] = { id: wall.id, level: Math.min(wall.maxLevel, wallLevel) };
  return b;
}

function fillStock(content: Content, v: Village, share: number) {
  const cap = capacity(content, v);
  for (const r of content.resourceIds) v.resources[r] = Math.floor((cap[r] ?? 0) * share);
}

function placeTowns(state: GameState, content: Content) {
  const cfg = content.world.npc.towns;
  const owner = npcPlayer(state, content, "towns");
  const layout = startLayout(content);
  for (const town of content.map.towns) {
    const tile = tileIndex(content, town.x, town.y);
    const tenK = town.population / 10000;
    const fieldLevel = Math.min(cfg.fieldLevel.max, Math.round(cfg.fieldLevel.base + cfg.fieldLevel.per10000 * tenK));
    const storeLevel = Math.min(cfg.storageLevel.max, Math.round(cfg.storageLevel.base + cfg.storageLevel.per10000 * tenK));
    const v = createVillage(state, content, {
      ownerId: owner.id,
      tile,
      name: town.name,
      kind: "town",
      layout,
      isCapital: false,
      at: state.settings.startedAt,
      fieldLevel: Math.min(fieldLevel, content.fields[content.food]?.maxLevel ?? fieldLevel),
    });
    v.buildings = storageBuildings(content, storeLevel, Math.round(town.walls * cfg.wallsPerStat));
    const garrison: Troops = {};
    for (const [unit, per] of Object.entries(cfg.garrisonPer1000)) {
      const n = Math.round((town.population / 1000) * per);
      if (n > 0) garrison[unit] = n;
    }
    v.troops = { ...garrison };
    v.treasures = Math.floor(tenK * cfg.treasuresPer10000);
    v.npc = { tier: 0, label: town.name, townId: town.id, garrison, regenMs: (cfg.regenHours * HOUR) / state.settings.speed, carry: {} };
    fillStock(content, v, 0.6);
  }
}

function placeCamps(state: GameState, content: Content, count: number) {
  if (count <= 0) return;
  const cfg = content.world.npc.camps;
  const owner = npcPlayer(state, content, "camps");
  const n = content.map.width * content.map.height;
  const seed = state.settings.seed;
  const valleys: number[] = [];
  for (let t = 0; t < n; t++) if (tileKind(content, seed, t) === "valley") valleys.push(t);
  // Stable shuffle by hash, then take the first that keep their distance.
  valleys.sort((a, b) => hash01(seed, a, 501) - hash01(seed, b, 501));
  let placed = 0;
  for (const tile of valleys) {
    if (placed >= count) break;
    if (state.occupancy[tile] || nearVillage(state, content, tile, 3)) continue;
    const tier = weightedChoice(cfg.tiers, (t) => t.weight, nextRandom(state))!;
    const v = createVillage(state, content, {
      ownerId: owner.id,
      tile,
      name: tier.name,
      kind: "camp",
      layout: tileLayout(content, seed, tile) ?? startLayout(content),
      isCapital: false,
      at: state.settings.startedAt,
      fieldLevel: tier.fieldLevel,
    });
    v.buildings = storageBuildings(content, tier.storageLevel, tier.walls);
    v.troops = { ...tier.troops };
    v.treasures = tier.treasures;
    v.npc = {
      tier: tier.tier,
      label: tier.name,
      townId: null,
      garrison: { ...tier.troops },
      regenMs: (cfg.regenHours * HOUR) / state.settings.speed,
      carry: {},
    };
    fillStock(content, v, 0.5);
    placed++;
  }
}
