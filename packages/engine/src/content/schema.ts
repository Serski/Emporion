import { z } from "zod";

// ---------------------------------------------------------------------------
// Content schema. Every balance number in the game (costs, times, stats,
// rates, curves, map weights) lives in JSON under content/ and is validated
// here. The engine reads numbers only from the parsed Content, never from
// constants in code. A malformed file throws during parseContent, so a server
// fails at boot instead of running with bad rules.
// ---------------------------------------------------------------------------

export const idSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, "ids are lower_snake_case");
const nonNeg = z.number().nonnegative();
const pos = z.number().positive();
const int = z.number().int();
const posInt = z.number().int().positive();
export const resourceMapSchema = z.record(idSchema, nonNeg);

// A curve maps a level L to a number. L = 0 always reads `zero` (default 0).
//   { table: [v1, v2, …] }               L ≥ 1 → table[L-1] (the last value repeats)
//   { base, growth, round?, add? }       L ≥ 1 → round(base · growth^(L-1) + add)
//   { linear }                           L ≥ 1 → zero + linear · L
export const curveSchema = z.union([
  z.object({ table: z.array(z.number()).min(1), zero: z.number().optional() }).strict(),
  z
    .object({
      base: z.number(),
      growth: pos,
      round: pos.optional(),
      add: z.number().optional(),
      zero: z.number().optional(),
    })
    .strict(),
  z.object({ linear: z.number(), zero: z.number().optional() }).strict(),
]);

// A per-resource cost that grows geometrically with the level being bought:
// cost_r(L) = round(base_r · growth^(L-1)) to the nearest `round`.
export const costCurveSchema = z
  .object({ base: resourceMapSchema, growth: pos, round: pos.optional() })
  .strict();

export const requirementSchema = z.union([
  z.object({ building: idSchema, level: posInt }).strict(),
  // "any resource field of this resource at ≥ level"
  z.object({ field: idSchema, level: posInt }).strict(),
]);

export const queueSchema = z
  .object({
    id: idSchema,
    accepts: z.array(z.enum(["field", "building"])).min(1),
    // jobs the queue may hold at once: the running one plus the waiting ones
    size: posInt,
  })
  .strict();

// --- resources and fields -----------------------------------------------------

export const resourceSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    icon: z.string().optional(),
    // exactly one resource is food: population and troops eat it
    food: z.boolean().optional(),
  })
  .strict();

export const fieldSchema = z
  .object({
    resource: idSchema,
    name: z.string(),
    description: z.string().optional(),
    maxLevel: posInt,
    maxLevelCapital: posInt,
    production: curveSchema, // per hour at speed 1, level 0 included
    cost: costCurveSchema,
    time: curveSchema, // seconds at speed 1 to reach level L
    pop: curveSchema, // population added on reaching level L
    culture: curveSchema, // culture points per day while at level L
  })
  .strict();

export const resourcesFileSchema = z
  .object({ resources: z.array(resourceSchema).min(1), fields: z.array(fieldSchema).min(1) })
  .strict();

// --- buildings ----------------------------------------------------------------

export const festivalSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    minLevel: posInt,
    cost: resourceMapSchema,
    time: pos, // seconds at speed 1, before the building's festivalTime multiplier
    culture: nonNeg,
  })
  .strict();

export const effectsSchema = z
  .object({
    // storage capacity for the listed resources (several instances add up)
    storage: z.object({ resources: z.array(idSchema).min(1), capacity: curveSchema }).strict().optional(),
    buildTime: curveSchema.optional(), // multiplier on every construction in the village
    trainTime: curveSchema.optional(), // multiplier on units trained in this building
    research: z.boolean().optional(), // unit research happens here
    researchTime: curveSchema.optional(),
    armory: z.boolean().optional(), // unit upgrades up to this building's level
    upgradeTime: curveSchema.optional(),
    production: z.array(z.object({ resource: idSchema, bonus: curveSchema }).strict()).optional(),
    merchants: curveSchema.optional(),
    merchantCapacity: curveSchema.optional(), // bonus fraction on each merchant's load
    hide: curveSchema.optional(), // amount of every resource raiders cannot take
    expansionSlots: z.array(posInt).optional(), // a slot is granted at each listed level
    loyaltyRegen: curveSchema.optional(), // loyalty per hour on top of the village base
    blocksConquest: z.boolean().optional(), // loyalty cannot drop while this stands
    troopSpeed: z.object({ beyond: nonNeg, bonus: curveSchema }).strict().optional(),
    rallyPoint: z.object({ sendsTroops: z.boolean(), chooseTargetFrom: posInt, twoTargetsFrom: posInt }).strict().optional(),
    festivals: z.array(festivalSchema).optional(),
    festivalTime: curveSchema.optional(),
    oasisSlots: z.array(posInt).optional(),
    heroRevive: curveSchema.optional(), // multiplier on hero revive time
    treasures: curveSchema.optional(), // treasure capacity
    wall: z.boolean().optional(), // the village wall: the owner's faction sets its bonus
  })
  .strict();

export const buildingSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    description: z.string(),
    category: z.enum(["infrastructure", "military", "economy", "civic"]),
    maxLevel: posInt,
    fixedSlot: int.nonnegative().optional(),
    cost: costCurveSchema,
    time: curveSchema,
    pop: curveSchema,
    culture: curveSchema,
    requires: z.array(requirementSchema).default([]),
    capitalOnly: z.boolean().optional(),
    notInCapital: z.boolean().optional(),
    onePerPlayer: z.boolean().optional(),
    exclusiveWith: z.array(idSchema).optional(),
    // another copy may be started once every existing copy is at maxLevel
    multiple: z.boolean().optional(),
    catapultImmune: z.boolean().optional(),
    durability: curveSchema.optional(),
    factions: z.array(idSchema).optional(),
    effects: effectsSchema.default({}),
  })
  .strict();

export const buildingsFileSchema = z.object({ buildings: z.array(buildingSchema).min(1) }).strict();

// --- factions and units -------------------------------------------------------

export const unitSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    plural: z.string().optional(),
    description: z.string().optional(),
    class: z.enum(["infantry", "cavalry"]),
    role: z.enum(["scout", "ram", "catapult", "chief", "settler"]).optional(),
    attack: nonNeg,
    defenseInfantry: nonNeg,
    defenseCavalry: nonNeg,
    speed: pos, // fields per hour at troop speed 1
    carry: nonNeg,
    upkeep: nonNeg, // food per hour at speed 1
    cost: resourceMapSchema,
    trainTime: pos, // seconds at speed 1 in a level-1 building
    building: z.array(idSchema).default([]), // any of these may train it; empty = untrainable
    research: z
      .object({ requires: z.array(requirementSchema), cost: resourceMapSchema, time: pos })
      .strict()
      .optional(),
    scouting: z.object({ attack: nonNeg, defense: nonNeg }).strict().optional(),
    siege: pos.optional(), // damage points per surviving ram/catapult
    loyalty: z.object({ min: nonNeg, max: nonNeg }).strict().optional(), // chief: loyalty removed
  })
  .strict();

export const factionSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    description: z.string(),
    playable: z.boolean(),
    color: z.string().optional(),
    wall: z.object({ name: z.string().optional(), bonusPerLevel: nonNeg, durability: pos }).strict(),
    cacheMultiplier: pos.default(1),
    merchant: z.object({ capacity: pos, speed: pos }).strict(),
    trainTimeMultiplier: pos.default(1),
    buildQueues: z.array(queueSchema).optional(),
    conquerable: z.boolean().default(true),
    // new players of this faction start near this map town
    start: z.object({ town: z.string() }).strict().optional(),
    units: z.array(unitSchema).min(1),
  })
  .strict();

// --- hero ---------------------------------------------------------------------

export const heroSchema = z
  .object({
    enabled: z.boolean(),
    speed: pos,
    strength: z.object({ base: nonNeg, perPoint: nonNeg }).strict(),
    offensePerPoint: nonNeg, // army attack bonus fraction per point
    defensePerPoint: nonNeg,
    production: z.object({ allPerPoint: nonNeg, singlePerPoint: nonNeg }).strict(),
    pointsPerLevel: posInt,
    startPoints: int.nonnegative(),
    maxLevel: posInt,
    xpBase: pos, // xp to reach level L = xpBase · L(L+1)/2
    xpPerUpkeep: nonNeg, // xp per food-upkeep of enemy units killed
    healthRegenPerDay: nonNeg,
    damageFactor: nonNeg, // health lost = side's loss fraction · 100 · factor
    revive: z.object({ cost: costCurveSchema, time: curveSchema }).strict(),
    oasisRadius: pos, // an annexed oasis must lie within this distance of the village
    oasisLoyaltyPerAttack: pos, // loyalty a winning hero takes from an owned oasis
  })
  .strict();

// --- kingdoms -----------------------------------------------------------------

export const kingdomsSchema = z
  .object({
    enabled: z.boolean(),
    found: z.object({ minPopulation: nonNeg, treasuryLevel: int.nonnegative() }).strict(),
    influence: z
      .object({ base: nonNeg, perPopulation: nonNeg, perTreasure: nonNeg, maxRadius: pos })
      .strict(),
    tribute: z.object({ share: z.number().min(0).max(1), capHours: pos }).strict(),
    memberProductionBonus: z.number().min(0).max(1),
    victoryPoints: z.object({ perTreasure: nonNeg, perPopulation: nonNeg }).strict(),
  })
  .strict();

// --- map (generated by tools/map/build_tiles.py from MASSALIA world 2) ---------

// Terrain codes, one per tile: S sea, F fog (off the playable map), L inland
// water, and the land kinds P plain, H hills, M mountain.
export const LAND_TERRAIN = ["P", "H", "M"] as const;
export type LandTerrain = (typeof LAND_TERRAIN)[number];

export const mapSchema = z
  .object({
    version: z.literal(1),
    source: z.string(),
    tileSize: pos,
    width: posInt,
    height: posInt,
    image: z.object({ file: z.string(), width: posInt, height: posInt }).strict(),
    terrain: z.string().regex(/^[SFLPHM]+$/),
    regions: z.array(int), // run-length [regionIndex, run, …]; -1 = none
    regionList: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          type: z.enum(["land", "sea", "fog"]),
          polity: z.string().nullable().optional(),
        })
        .strict(),
    ),
    polities: z.record(
      z.string(),
      z.object({ name: z.string(), color: z.string(), culture: z.string().nullable().optional() }).strict(),
    ),
    towns: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          x: int.nonnegative(),
          y: int.nonnegative(),
          region: z.string().nullable(),
          population: nonNeg,
          walls: int.nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();

// --- world --------------------------------------------------------------------

const terrainWeightsSchema = z.record(z.enum(LAND_TERRAIN), nonNeg);

const layoutSchema = z
  .object({
    id: idSchema,
    name: z.string().optional(),
    fields: z.record(idSchema, int.nonnegative()),
    weight: nonNeg,
    terrain: terrainWeightsSchema.optional(), // weight multiplier per land terrain
    start: z.boolean().optional(),
  })
  .strict();

const oasisTypeSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    bonus: z.record(idSchema, pos),
    weight: nonNeg,
    terrain: terrainWeightsSchema.optional(),
    animals: z.record(idSchema, z.tuple([int.nonnegative(), int.nonnegative()])),
  })
  .strict();

const campTierSchema = z
  .object({
    tier: posInt,
    name: z.string(),
    weight: nonNeg,
    troops: z.record(idSchema, posInt),
    walls: int.nonnegative(),
    fieldLevel: int.nonnegative(),
    storageLevel: int.nonnegative(),
    treasures: int.nonnegative(),
  })
  .strict();

const levelScaleSchema = z.object({ base: nonNeg, per10000: nonNeg, max: posInt }).strict();

export const worldSchema = z
  .object({
    defaults: z.object({ name: z.string(), speed: pos, npcCamps: int.nonnegative() }).strict(),
    village: z
      .object({
        slots: posInt,
        fieldCount: posInt,
        start: z
          .object({
            buildings: z.array(z.object({ slot: int.nonnegative(), id: idSchema, level: posInt }).strict()),
            resources: resourceMapSchema,
          })
          .strict(),
        baseStorage: pos,
        baseDefense: nonNeg,
        popUpkeep: nonNeg,
        baseLoyaltyRegen: nonNeg,
      })
      .strict(),
    buildQueues: z.array(queueSchema).min(1),
    protection: z.object({ hours: nonNeg, minHours: nonNeg }).strict(),
    culture: z
      .object({ villageCost: z.object({ base: pos, exponent: pos, round: pos }).strict() })
      .strict(),
    expansion: z
      .object({
        settlersNeeded: posInt,
        settlersPerSlot: posInt,
        chiefsPerSlot: posInt,
        foundingCost: resourceMapSchema,
        loyaltyAfterConquest: nonNeg,
      })
      .strict(),
    combat: z
      .object({
        lossExponent: pos,
        raidLossExponent: pos,
        scoutLossExponent: pos,
        armoryBonusPerLevel: nonNeg,
        morale: z.object({ exponent: nonNeg, min: z.number().min(0).max(1) }).strict(),
        durability: curveSchema,
        twoTargetsMinCatapults: posInt,
      })
      .strict(),
    armory: z
      .object({ maxLevel: posInt, costMultiplier: pos, costGrowth: pos, timeBase: pos, timeGrowth: pos })
      .strict(),
    mapgen: z
      .object({
        // per land terrain: weights of valley (settleable), oasis and wild (unsettleable)
        terrain: z.record(
          z.enum(LAND_TERRAIN),
          z.object({ valley: nonNeg, oasis: nonNeg, wild: nonNeg }).strict(),
        ),
        layouts: z.array(layoutSchema).min(1),
        oases: z.array(oasisTypeSchema),
        oasisRegenHours: pos,
        minSpacing: nonNeg,
        seaTravelMultiplier: pos, // time multiplier for the share of a march over water
        startArea: z.object({ base: nonNeg, perPlayer: nonNeg }).strict(),
      })
      .strict(),
    npc: z
      .object({
        camps: z
          .object({
            playerName: z.string(),
            factionId: idSchema,
            regenHours: pos,
            tiers: z.array(campTierSchema).min(1),
            raids: z
              .object({
                enabled: z.boolean(),
                intervalHours: pos,
                chance: z.number().min(0).max(1),
                radius: pos,
                share: z.number().min(0).max(1),
                minStrength: z.number().min(0).max(1),
              })
              .strict(),
          })
          .strict(),
        towns: z
          .object({
            playerName: z.string(),
            factionId: idSchema,
            regenHours: pos,
            garrisonPer1000: z.record(idSchema, nonNeg),
            wallsPerStat: nonNeg,
            fieldLevel: levelScaleSchema,
            storageLevel: levelScaleSchema,
            treasuresPer10000: nonNeg,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

// --- the bundle ---------------------------------------------------------------

export const contentBundleSchema = z
  .object({
    world: worldSchema,
    resources: resourcesFileSchema,
    buildings: buildingsFileSchema,
    factions: z.array(factionSchema).min(1),
    hero: heroSchema,
    kingdoms: kingdomsSchema,
    map: mapSchema,
  })
  .strict();

export type Curve = z.infer<typeof curveSchema>;
export type CostCurve = z.infer<typeof costCurveSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type QueueDef = z.infer<typeof queueSchema>;
export type ResourceDef = z.infer<typeof resourceSchema>;
export type FieldDef = z.infer<typeof fieldSchema>;
export type FestivalDef = z.infer<typeof festivalSchema>;
export type BuildingEffects = z.infer<typeof effectsSchema>;
export type BuildingDef = z.infer<typeof buildingSchema>;
export type UnitDef = z.infer<typeof unitSchema>;
export type FactionDef = z.infer<typeof factionSchema>;
export type HeroDef = z.infer<typeof heroSchema>;
export type KingdomsDef = z.infer<typeof kingdomsSchema>;
export type WorldDef = z.infer<typeof worldSchema>;
export type LayoutDef = WorldDef["mapgen"]["layouts"][number];
export type OasisTypeDef = WorldDef["mapgen"]["oases"][number];
export type CampTierDef = WorldDef["npc"]["camps"]["tiers"][number];
export type MapDef = z.infer<typeof mapSchema>;
export type TownDef = MapDef["towns"][number];
export type ContentBundle = z.input<typeof contentBundleSchema>;
export type ParsedBundle = z.infer<typeof contentBundleSchema>;
