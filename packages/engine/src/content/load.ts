import {
  contentBundleSchema,
  type BuildingDef,
  type ContentBundle,
  type FamilyDef,
  type FamilyTraitDef,
  type FactionDef,
  type FieldDef,
  type GoodDef,
  type HeroDef,
  type KingdomsDef,
  type LadderDef,
  type LayoutDef,
  type MapDef,
  type MassaliaDef,
  type OasisTypeDef,
  type ParsedBundle,
  type PersonTypeDef,
  type ProfileTraitDef,
  type QueueDef,
  type RecipeDef,
  type Requirement,
  type ResourceDef,
  type RoutineDef,
  type ShipDef,
  type TownDef,
  type UnitDef,
  type WorldDef,
} from "./schema.js";

// The parsed, cross-checked rules plus the lookup tables every module uses.
export interface Content {
  bundle: ParsedBundle;
  world: WorldDef;
  resources: ResourceDef[];
  resourceIds: string[];
  food: string;
  fields: Record<string, FieldDef>;
  buildings: Record<string, BuildingDef>;
  buildingList: BuildingDef[];
  factions: Record<string, FactionDef>;
  factionList: FactionDef[];
  units: Record<string, UnitDef>;
  unitFaction: Record<string, string>;
  layouts: Record<string, LayoutDef>;
  oasisTypes: Record<string, OasisTypeDef>;
  hero: HeroDef;
  kingdoms: KingdomsDef;
  family: FamilyDef;
  familyTraits: Record<string, FamilyTraitDef>;
  map: MapDef;
  mapRegion: Int32Array; // region index per tile (-1 none)
  towns: Record<string, TownDef>;
  townAtTile: Map<number, TownDef>;
  // The MASSALIA pack and its lookups.
  massalia: MassaliaDef;
  goods: Record<string, GoodDef>;
  goodIds: string[];
  people: Record<string, PersonTypeDef>;
  peopleIds: string[];
  routines: Record<string, RoutineDef>;
  profileTraits: Record<string, ProfileTraitDef>;
  ladders: Record<string, LadderDef>;
  recipes: Record<string, RecipeDef>;
  ships: Record<string, ShipDef>;
}

export class ContentError extends Error {
  constructor(public readonly problems: string[]) {
    super(`content is invalid:\n  - ${problems.join("\n  - ")}`);
    this.name = "ContentError";
  }
}

export function parseContent(raw: ContentBundle): Content {
  const bundle = contentBundleSchema.parse(raw);
  const problems: string[] = [];
  const fail = (msg: string) => problems.push(msg);

  const { world, hero, kingdoms, family, map } = bundle;
  const resources = bundle.resources.resources;
  const resourceIds = resources.map((r) => r.id);
  const resourceSet = new Set(resourceIds);
  const foods = resources.filter((r) => r.food);
  if (foods.length !== 1) fail(`exactly one resource must be food, found ${foods.length}`);
  const food = foods[0]?.id ?? resourceIds[0]!;
  unique(resourceIds, "resource", fail);

  const checkRes = (map: Record<string, number>, where: string) => {
    for (const key of Object.keys(map)) if (!resourceSet.has(key)) fail(`${where}: unknown resource "${key}"`);
  };

  const fields: Record<string, FieldDef> = {};
  for (const f of bundle.resources.fields) {
    if (!resourceSet.has(f.resource)) fail(`field ${f.name}: unknown resource ${f.resource}`);
    if (fields[f.resource]) fail(`two fields produce ${f.resource}`);
    fields[f.resource] = f;
    checkRes(f.cost.base, `field ${f.resource} cost`);
  }
  for (const r of resourceIds) if (!fields[r]) fail(`no field produces ${r}`);

  const buildings: Record<string, BuildingDef> = {};
  for (const b of bundle.buildings.buildings) {
    if (buildings[b.id]) fail(`duplicate building ${b.id}`);
    buildings[b.id] = b;
  }
  const checkReqs = (reqs: Requirement[], where: string) => {
    for (const r of reqs) {
      if ("building" in r && !buildings[r.building]) fail(`${where}: requires unknown building ${r.building}`);
      if ("field" in r && !resourceSet.has(r.field)) fail(`${where}: requires unknown field ${r.field}`);
    }
  };
  for (const b of bundle.buildings.buildings) {
    checkRes(b.cost.base, `building ${b.id} cost`);
    checkReqs(b.requires, `building ${b.id}`);
    for (const other of b.exclusiveWith ?? []) if (!buildings[other]) fail(`building ${b.id}: exclusiveWith unknown ${other}`);
    for (const r of b.effects.storage?.resources ?? []) if (!resourceSet.has(r)) fail(`building ${b.id}: stores unknown ${r}`);
    for (const p of b.effects.production ?? []) if (!resourceSet.has(p.resource)) fail(`building ${b.id}: boosts unknown ${p.resource}`);
    for (const fest of b.effects.festivals ?? []) checkRes(fest.cost, `festival ${fest.id}`);
    if (b.fixedSlot !== undefined && b.fixedSlot >= world.village.slots) fail(`building ${b.id}: fixedSlot out of range`);
  }
  for (const s of world.village.start.buildings) {
    if (!buildings[s.id]) fail(`start building ${s.id} unknown`);
    if (s.slot >= world.village.slots) fail(`start building ${s.id}: slot out of range`);
  }
  checkRes(world.village.start.resources, "start resources");
  checkRes(world.expansion.foundingCost, "founding cost");

  const factions: Record<string, FactionDef> = {};
  const units: Record<string, UnitDef> = {};
  const unitFaction: Record<string, string> = {};
  for (const f of bundle.factions) {
    if (factions[f.id]) fail(`duplicate faction ${f.id}`);
    factions[f.id] = f;
    for (const u of f.units) {
      if (units[u.id]) fail(`duplicate unit id ${u.id} (unit ids are global)`);
      units[u.id] = u;
      unitFaction[u.id] = f.id;
      checkRes(u.cost, `unit ${u.id} cost`);
      for (const b of u.building) if (!buildings[b]) fail(`unit ${u.id}: trained in unknown building ${b}`);
      if (u.research) {
        checkReqs(u.research.requires, `unit ${u.id} research`);
        checkRes(u.research.cost, `unit ${u.id} research cost`);
      }
      if (u.role === "scout" && !u.scouting) fail(`scout ${u.id} needs scouting stats`);
      if ((u.role === "ram" || u.role === "catapult") && !u.siege) fail(`siege unit ${u.id} needs siege damage`);
      if (u.role === "chief" && !u.loyalty) fail(`chief ${u.id} needs a loyalty range`);
    }
    if (f.playable) {
      const roles = new Set(f.units.map((u) => u.role));
      if (!roles.has("settler")) fail(`playable faction ${f.id} has no settler`);
    }
  }
  if (!bundle.factions.some((f) => f.playable)) fail("no playable faction");

  const layouts: Record<string, LayoutDef> = {};
  for (const l of world.mapgen.layouts) {
    layouts[l.id] = l;
    checkRes(l.fields, `layout ${l.id}`);
    const n = Object.values(l.fields).reduce((a, b) => a + b, 0);
    if (n !== world.village.fieldCount) fail(`layout ${l.id} has ${n} fields, villages have ${world.village.fieldCount}`);
  }
  if (!world.mapgen.layouts.some((l) => l.start)) fail("no layout is marked start");

  const oasisTypes: Record<string, OasisTypeDef> = {};
  for (const o of world.mapgen.oases) {
    oasisTypes[o.id] = o;
    checkRes(o.bonus, `oasis ${o.id} bonus`);
    for (const a of Object.keys(o.animals)) if (!units[a]) fail(`oasis ${o.id}: unknown animal ${a}`);
  }

  const npcFactionCheck = (factionId: string, troops: Record<string, number>, where: string) => {
    const f = factions[factionId];
    if (!f) return fail(`${where}: unknown faction ${factionId}`);
    for (const u of Object.keys(troops)) if (unitFaction[u] !== factionId) fail(`${where}: unit ${u} is not in ${factionId}`);
  };
  for (const tier of world.npc.camps.tiers) npcFactionCheck(world.npc.camps.factionId, tier.troops, `camp tier ${tier.tier}`);
  npcFactionCheck(world.npc.towns.factionId, world.npc.towns.garrisonPer1000, "town garrison");

  // Map: decode the run-length region layer and index the towns.
  const tiles = map.width * map.height;
  if (map.terrain.length !== tiles) fail(`map terrain has ${map.terrain.length} tiles, expected ${tiles}`);
  const mapRegion = new Int32Array(tiles).fill(-1);
  let cursor = 0;
  for (let i = 0; i + 1 < map.regions.length; i += 2) {
    const index = map.regions[i]!;
    const run = map.regions[i + 1]!;
    if (index >= map.regionList.length) fail(`map region index ${index} out of range`);
    mapRegion.fill(index, cursor, Math.min(tiles, cursor + run));
    cursor += run;
  }
  if (cursor !== tiles) fail(`map regions cover ${cursor} tiles, expected ${tiles}`);
  const towns: Record<string, TownDef> = {};
  const townAtTile = new Map<number, TownDef>();
  for (const t of map.towns) {
    if (t.x >= map.width || t.y >= map.height) fail(`town ${t.id} is off the map`);
    const tile = t.y * map.width + t.x;
    if (!"PHM".includes(map.terrain[tile] ?? "")) fail(`town ${t.id} is not on land`);
    if (townAtTile.has(tile)) fail(`towns ${t.id} and ${townAtTile.get(tile)!.id} share a tile`);
    towns[t.id] = t;
    townAtTile.set(tile, t);
  }
  for (const f of bundle.factions) {
    if (f.start && !towns[f.start.town]) fail(`faction ${f.id}: start town ${f.start.town} is not on the map`);
  }

  const familyTraits: Record<string, FamilyTraitDef> = {};
  for (const t of family.traits) {
    if (familyTraits[t.id]) fail(`duplicate family trait ${t.id}`);
    familyTraits[t.id] = t;
    if (t.dowry) checkRes(t.dowry, `family trait ${t.id} dowry`);
  }
  if (family.enabled) {
    for (const f of bundle.factions) if (f.playable && !family.names[f.id]) fail(`family: no name pool for faction ${f.id}`);
  }
  if (world.calendar.seasons.length === 0) fail("calendar needs at least one season");

  // --- the MASSALIA pack ---
  const { massalia } = bundle;
  const { market, people: peopleFile, profile, crafting, ships: shipsFile, intrigue } = massalia;
  const goods: Record<string, GoodDef> = {};
  for (const g of market.goods) {
    if (goods[g.id]) fail(`market: duplicate good ${g.id}`);
    if (resourceSet.has(g.id)) fail(`market: good ${g.id} is also a town resource`);
    goods[g.id] = g;
    if (g.sell < g.buy) fail(`market: the agora would pay more for ${g.id} than it charges`);
  }
  const goodIds = market.goods.map((g) => g.id);
  const isGood = (id: string) => !!goods[id];
  for (const r of resourceIds) if (!market.resources[r]) fail(`market: no price band for resource ${r}`);
  for (const [r, band] of Object.entries(market.resources)) {
    if (!resourceSet.has(r)) fail(`market: unknown resource ${r}`);
    if (band.sell < band.buy) fail(`market: the agora would pay more for ${r} than it charges`);
  }
  const seasonCount = world.calendar.seasons.length;
  for (const [cat, coeffs] of Object.entries(market.seasonal)) {
    if (coeffs.length !== seasonCount) fail(`market: ${cat} prices need ${seasonCount} seasonal coefficients`);
  }
  if (!buildings[market.building]) fail(`market: unknown building ${market.building}`);
  if (!buildings[peopleFile.building]) fail(`people: unknown building ${peopleFile.building}`);

  const people: Record<string, PersonTypeDef> = {};
  for (const p of peopleFile.people) {
    if (people[p.id]) fail(`people: duplicate ${p.id}`);
    people[p.id] = p;
    if (p.production) checkRes(p.production, `people ${p.id} production`);
  }
  const peopleIds = peopleFile.people.map((p) => p.id);

  const statIds = new Set(profile.stats.map((x) => x.id));
  const profileTraits: Record<string, ProfileTraitDef> = {};
  for (const t of profile.traits) {
    if (profileTraits[t.id]) fail(`profile: duplicate trait ${t.id}`);
    profileTraits[t.id] = t;
    for (const k of Object.keys(t.stats)) if (!statIds.has(k)) fail(`profile trait ${t.id}: unknown stat ${k}`);
  }
  if (!profileTraits["poisoned"]) fail(`profile: the poisoned trait is missing`);
  const ladders: Record<string, LadderDef> = {};
  for (const l of profile.ladders) {
    ladders[l.id] = l;
    if (!statIds.has(l.stat)) fail(`ladder ${l.id}: unknown stat ${l.stat}`);
    for (const t of l.tiers) if (!profileTraits[t.trait]) fail(`ladder ${l.id}: unknown trait ${t.trait}`);
  }
  for (const [fid, bonus] of Object.entries(profile.start)) {
    if (!factions[fid]) fail(`profile start: unknown faction ${fid}`);
    for (const k of Object.keys(bonus)) if (!statIds.has(k)) fail(`profile start ${fid}: unknown stat ${k}`);
  }
  for (const d of profile.decay) for (const k of Object.keys(d)) if (k !== "fromAge" && !statIds.has(k)) fail(`profile decay: unknown stat ${k}`);
  const routines: Record<string, RoutineDef> = {};
  for (const r of profile.routines) {
    if (routines[r.id]) fail(`routine: duplicate ${r.id}`);
    routines[r.id] = r;
    if (!(r.pool in profile.pools)) fail(`routine ${r.id}: unknown pool ${r.pool}`);
    for (const k of Object.keys(r.effects)) if (!statIds.has(k) && k !== "composure" && k !== "drachmae") fail(`routine ${r.id}: unknown effect ${k}`);
    if (r.ladder && !ladders[r.ladder]) fail(`routine ${r.id}: unknown ladder ${r.ladder}`);
    if (r.needs && !isGood(r.needs.good)) fail(`routine ${r.id}: unknown good ${r.needs.good}`);
    if (r.waivedBy && !buildings[r.waivedBy]) fail(`routine ${r.id}: unknown building ${r.waivedBy}`);
    for (const k of Object.keys(r.boostedBy ?? {})) if (!people[k]) fail(`routine ${r.id}: unknown person ${k}`);
  }
  for (const [pool, who] of Object.entries(profile.pools)) if (who && !people[who]) fail(`routine pool ${pool}: unknown person ${who}`);

  const recipes: Record<string, RecipeDef> = {};
  for (const r of crafting.recipes) {
    if (recipes[r.id]) fail(`craft: duplicate recipe ${r.id}`);
    recipes[r.id] = r;
    for (const g of [...Object.keys(r.output), ...Object.keys(r.goods)]) if (!isGood(g)) fail(`craft ${r.id}: unknown good ${g}`);
    checkRes(r.resources, `craft ${r.id}`);
    if (r.building && !buildings[r.building]) fail(`craft ${r.id}: unknown building ${r.building}`);
    for (const k of Object.keys(r.people)) if (!people[k]) fail(`craft ${r.id}: unknown person ${k}`);
  }
  if (!buildings[crafting.altar.building]) fail(`altar: unknown building ${crafting.altar.building}`);
  for (const o of crafting.altar.offerings) if (!isGood(o.good)) fail(`altar: unknown good ${o.good}`);

  const ships: Record<string, ShipDef> = {};
  for (const sh of shipsFile.ships) {
    ships[sh.id] = sh;
    if (!isGood(sh.id)) fail(`ship ${sh.id} is not a market good`);
  }
  if (!isGood(shipsFile.supplyGood)) fail(`ships: supply good ${shipsFile.supplyGood} is not a market good`);
  for (const id of Object.values(shipsFile.townFleet)) if (!ships[id]) fail(`ships: town fleet names unknown ship ${id}`);
  for (const u of Object.keys(shipsFile.unitSpace)) if (!units[u]) fail(`ships: unknown unit ${u}`);
  if (!isGood(intrigue.poison.good)) fail(`intrigue: unknown good ${intrigue.poison.good}`);
  if (!isGood(intrigue.cure.good)) fail(`intrigue: unknown good ${intrigue.cure.good}`);
  if (!people[intrigue.cure.needs]) fail(`intrigue: unknown person ${intrigue.cure.needs}`);

  if (problems.length) throw new ContentError(problems);

  return {
    bundle,
    world,
    resources,
    resourceIds,
    food,
    fields,
    buildings,
    buildingList: bundle.buildings.buildings,
    factions,
    factionList: bundle.factions,
    units,
    unitFaction,
    layouts,
    oasisTypes,
    hero,
    kingdoms,
    family,
    familyTraits,
    map,
    mapRegion,
    towns,
    townAtTile,
    massalia,
    goods,
    goodIds,
    people,
    peopleIds,
    routines,
    profileTraits,
    ladders,
    recipes,
    ships,
  };
}

export function queuesFor(content: Content, factionId: string): QueueDef[] {
  return content.factions[factionId]?.buildQueues ?? content.world.buildQueues;
}

function unique(ids: string[], what: string, fail: (m: string) => void) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(`duplicate ${what} ${id}`);
    seen.add(id);
  }
}
