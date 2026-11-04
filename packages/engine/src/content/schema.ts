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
    coastal: z.boolean().optional(), // only a town on the sea may raise it

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
    icon: z.string().optional(), // art file under the client's assets/, as in MASSALIA's units.json
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
    version: z.literal(2),
    source: z.string(),
    // Pointy-top hexagons in rows, odd rows shifted half a hex east. hexWidth
    // is a hex's width (centre to centre along a row) in image pixels.
    grid: z
      .object({ shape: z.literal("hex"), orientation: z.literal("pointy"), offset: z.literal("odd-r"), hexWidth: pos })
      .strict(),
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
          // MASSALIA's town fleet (content/map/town-military.json): it can drive off a landing.
          fleet: z.object({ pentekonters: int.nonnegative(), triremes: int.nonnegative() }).strict().default({ pentekonters: 0, triremes: 0 }),
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
    // MASSALIA's calendar: one season per `seasonHours` at speed 1, four seasons
    // a year, years counted down from startYearBC.
    calendar: z.object({ seasonHours: pos, seasons: z.array(z.string()).min(1), startYearBC: int }).strict(),
    // Every town claims the tiles within this many fields (the nearest town wins).
    territory: z.object({ townRadius: nonNeg, cityRadius: nonNeg }).strict(),
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

// --- family (ported from MASSALIA's family pack) ---------------------------------

const ageRange = z.tuple([nonNeg, nonNeg]);
const namePoolSchema = z.object({ male: z.array(z.string()).min(1), female: z.array(z.string()).min(1) }).strict();

export const familySchema = z
  .object({
    enabled: z.boolean(),
    comingOfAge: posInt,
    head: z
      .object({
        startAge: nonNeg,
        deathAge: z.object({ min: posInt, max: posInt }).strict(),
        _ageOptions: z.string().optional(),
        // The ages a founder may start at, each with its faces and a head start.
        ageOptions: z
          .array(
            z
              .object({
                age: posInt,
                label: z.string(),
                note: z.string(),
                startBonus: z.record(z.string(), z.number().int()),
                faces: z.array(z.string()).min(1),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    lifeStages: z.array(z.object({ fromAge: nonNeg, name: z.string(), strength: pos }).strict()).min(1),
    portraitStages: z.array(z.object({ fromAge: nonNeg, stage: z.string() }).strict()).min(1),
    childStages: z.array(z.object({ fromAge: nonNeg, stage: z.string() }).strict()).min(1),
    candidates: z.object({ perDraw: posInt, ageRange, traitChance: z.number().min(0).max(1) }).strict(),
    traits: z.array(
      z
        .object({
          id: idSchema,
          name: z.string(),
          description: z.string(),
          childChanceBonus: z.number().optional(),
          birthDeathRiskMod: z.number().optional(),
          dowry: resourceMapSchema.optional(),
          heroXpBonus: z.number().optional(),
          cultureBonus: z.number().optional(),
          heroDefenseBonus: z.number().optional(),
        })
        .strict(),
    ),
    spouse: z
      .object({
        deathAge: z.object({ min: posInt, max: posInt }).strict(),
        fertility: z.object({ from: nonNeg, to: nonNeg }).strict(),
      })
      .strict(),
    children: z
      .object({
        yearlyChance: z.number().min(0).max(1),
        thirdPlusChance: z.number().min(0).max(1),
        birthDeathRisk: z.number().min(0).max(1),
        max: int.nonnegative(),
        boys: z.number().min(0).max(1),
      })
      .strict(),
    succession: z
      .object({
        xpCarryover: z.object({ blood: z.number().min(0).max(1), adopted: z.number().min(0).max(1), regent: z.number().min(0).max(1) }).strict(),
        adoptedAge: ageRange,
        regentAge: ageRange,
      })
      .strict(),
    adoption: z.object({ perDraw: posInt }).strict(),
    portraits: z
      .object({ male: z.array(z.string()).min(1), female: z.array(z.string()).min(1), boy: z.string(), girl: z.string() })
      .strict(),
    names: z.record(z.string(), namePoolSchema),
  })
  .strict();

// --- the MASSALIA pack (content/massalia/) ----------------------------------------
// MASSALIA's agora, people, character sheet and day, crafts, hulls and plots.

// MASSALIA's good ids keep their hyphens (naval-supplies, trade-ship).
export const goodIdSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/, "good ids are lower case with - or _");
const goodCategorySchema = z.enum(["agricultural", "yearround"]);
const statMapSchema = z.record(idSchema, z.number());

export const marketSchema = z
  .object({
    _note: z.string().optional(),
    currency: z.object({ id: idSchema, name: z.string(), short: z.string(), start: nonNeg }).strict(),
    resourceLot: posInt, // a town's resources trade in lots of this many
    resources: z.record(idSchema, z.object({ sell: pos, buy: pos, category: goodCategorySchema }).strict()),
    goods: z.array(
      z
        .object({
          id: goodIdSchema,
          name: z.string(),
          icon: z.string().optional(),
          group: z.enum(["goods", "materials", "naval"]),
          category: goodCategorySchema,
          sell: pos, // what the agora charges
          buy: pos, // what the agora pays
        })
        .strict(),
    ),
    seasonal: z.record(goodCategorySchema, z.array(pos).min(1)), // price coefficient per season
    prestigePriceBonus: nonNeg, // the agora pays this much more per point of prestige
    stalls: z.object({ max: posInt, maxQty: posInt, maxPrice: posInt, taxRate: z.number().min(0).max(1) }).strict(),
    building: idSchema, // trading needs this building in the town
  })
  .strict();

export const peopleSchema = z
  .object({
    _note: z.string().optional(),
    people: z.array(
      z
        .object({
          id: idSchema,
          name: z.string(),
          plural: z.string(),
          icon: z.string().optional(),
          portrait: z.string().optional(),
          hire: nonNeg,
          sellBack: nonNeg,
          upkeep: nonNeg, // drachmae per season
          food: nonNeg, // wheat per hour at speed 1, eaten in the capital
          max: posInt.optional(),
          dismiss: z.string(),
          about: z.string(),
          production: resourceMapSchema.optional(), // per hour at speed 1, in the capital
          culturePerDay: nonNeg.optional(),
          herbsPerSeason: nonNeg.optional(),
          altarDuration: pos.optional(),
          heroXpBonus: nonNeg.optional(),
          revealsAttacks: z.boolean().optional(),
        })
        .strict(),
    ),
    building: idSchema, // hiring needs this building in the town
  })
  .strict();

const routineSchema = z
  .object({
    id: idSchema.or(goodIdSchema),
    pool: idSchema,
    name: z.string(),
    effects: statMapSchema, // stat ids, "composure" and "drachmae"
    ladder: idSchema.optional(),
    xp: nonNeg.optional(),
    fee: nonNeg.optional(),
    needs: z.object({ good: goodIdSchema, qty: posInt, keep: z.boolean().optional() }).strict().optional(),
    waivedBy: idSchema.optional(), // a building in the capital that waives the fee and the need
    boostedBy: z.record(idSchema, z.object({ amount: pos, xp: pos, composure: z.number() }).strict()).optional(),
  })
  .strict();

export const profileSchema = z
  .object({
    _note: z.string().optional(),
    stats: z.array(z.object({ id: idSchema, name: z.string(), icon: z.string(), about: z.string() }).strict()).min(1),
    cap: posInt,
    start: z.record(idSchema, statMapSchema),
    effects: z.object({ prestigeCulture: nonNeg, devotionAltar: nonNeg, militiaHero: nonNeg, intelligenceScouts: nonNeg }).strict(),
    decay: z.array(z.object({ fromAge: nonNeg }).catchall(nonNeg)),
    succession: z.object({ keep: z.record(idSchema, z.number().min(0).max(1)) }).strict(),
    composure: z.object({ start: nonNeg, recoveryPerSeason: nonNeg, breakResetTo: nonNeg }).strict(),
    traits: z.array(
      z
        .object({
          id: idSchema.or(goodIdSchema),
          name: z.string(),
          kind: z.enum(["asset", "flaw", "neutral"]),
          description: z.string(),
          stats: statMapSchema,
          heroStrength: z.number().optional(),
        })
        .strict(),
    ),
    ladders: z.array(
      z
        .object({
          id: idSchema,
          name: z.string(),
          stat: idSchema,
          tiers: z.array(z.object({ xp: posInt, trait: idSchema.or(goodIdSchema) }).strict()).min(1),
        })
        .strict(),
    ),
    day: z.object({ picksPerSeason: posInt, repeatPenalty: z.number().min(0).max(1) }).strict(),
    routines: z.array(routineSchema).min(1),
    pools: z.record(idSchema, idSchema.nullable()), // pool → the person who opens it (null: always open)
  })
  .strict();

export const craftingSchema = z
  .object({
    _note: z.string().optional(),
    recipes: z.array(
      z
        .object({
          id: goodIdSchema,
          name: z.string(),
          output: z.record(goodIdSchema, posInt),
          building: idSchema.optional(),
          level: posInt.optional(),
          people: z.record(idSchema, posInt),
          resources: resourceMapSchema,
          goods: z.record(goodIdSchema, posInt),
          hours: pos, // at speed 1
        })
        .strict(),
    ),
    slots: z.object({ harbor: z.array(posInt).min(1), household: posInt }).strict(),
    altar: z
      .object({
        building: idSchema,
        seasons: pos,
        offerings: z.array(z.object({ good: goodIdSchema, boost: pos }).strict()).min(1),
      })
      .strict(),
  })
  .strict();

export const shipsSchema = z
  .object({
    _note: z.string().optional(),
    supplyGood: goodIdSchema,
    ships: z.array(
      z
        .object({
          id: goodIdSchema,
          name: z.string(),
          role: z.enum(["transport", "warship"]),
          range: posInt, // sea zones
          troopSpace: posInt,
          naval: nonNeg,
          suppliesPerTrip: nonNeg,
        })
        .strict(),
    ),
    troopSpace: z.object({ infantry: posInt, cavalry: posInt, siege: posInt, hero: posInt }).strict(),
    unitSpace: z.record(idSchema, posInt),
    townFleet: z.object({ pentekonters: goodIdSchema, triremes: goodIdSchema }).strict(),
  })
  .strict();

export const intrigueSchema = z
  .object({
    _note: z.string().optional(),
    prestigeFloor: nonNeg,
    cooldownHours: pos,
    statScale: pos,
    chance: z.object({ min: z.number().min(0).max(1), max: z.number().min(0).max(1) }).strict(),
    poison: z.object({ good: goodIdSchema, base: z.number().min(0).max(1), illShare: z.number().min(0).max(1) }).strict(),
    assassination: z.object({ cost: nonNeg, base: z.number().min(0).max(1), militiaWeight: nonNeg }).strict(),
    cure: z.object({ good: goodIdSchema, needs: idSchema }).strict(),
    defence: z.object({ physician: nonNeg, bodyguardMax: nonNeg, spymasterGuard: nonNeg }).strict(),
    attack: z.object({ spymasterHunt: nonNeg }).strict(),
    postureHours: pos,
  })
  .strict();

export const massaliaSchema = z
  .object({
    market: marketSchema,
    people: peopleSchema,
    profile: profileSchema,
    crafting: craftingSchema,
    ships: shipsSchema,
    intrigue: intrigueSchema,
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
    family: familySchema,
    massalia: massaliaSchema,
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
export type FamilyDef = z.infer<typeof familySchema>;
export type MassaliaDef = z.infer<typeof massaliaSchema>;
export type GoodDef = MassaliaDef["market"]["goods"][number];
export type PersonTypeDef = MassaliaDef["people"]["people"][number];
export type RoutineDef = MassaliaDef["profile"]["routines"][number];
export type ProfileTraitDef = MassaliaDef["profile"]["traits"][number];
export type LadderDef = MassaliaDef["profile"]["ladders"][number];
export type RecipeDef = MassaliaDef["crafting"]["recipes"][number];
export type ShipDef = MassaliaDef["ships"]["ships"][number];
export type FamilyTraitDef = FamilyDef["traits"][number];
export type WorldDef = z.infer<typeof worldSchema>;
export type LayoutDef = WorldDef["mapgen"]["layouts"][number];
export type OasisTypeDef = WorldDef["mapgen"]["oases"][number];
export type CampTierDef = WorldDef["npc"]["camps"]["tiers"][number];
export type MapDef = z.infer<typeof mapSchema>;
export type TownDef = MapDef["towns"][number];
export type ContentBundle = z.input<typeof contentBundleSchema>;
export type ParsedBundle = z.infer<typeof contentBundleSchema>;
