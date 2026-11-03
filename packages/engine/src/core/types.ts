// ---------------------------------------------------------------------------
// The game state. Plain JSON: a server can persist it as a snapshot or split
// it into tables (players, villages, movements, reports), and a client can
// keep it in localStorage. Nothing here holds a class instance or a function.
//
// Time is milliseconds since the epoch. Every village carries its own cursor
// (`updatedAt`): its resources, culture, loyalty, training and construction are
// advanced lazily to any instant by `touch`, and cross-village events
// (marches, raids, trade) are processed in time order by `settle`.
// ---------------------------------------------------------------------------

export type Ms = number;
export type ResourceId = string;
export type Resources = Record<ResourceId, number>;
export type Troops = Record<string, number>;

export interface WorldSettings {
  name: string;
  seed: number;
  speed: number; // multiplier on production, construction, training, culture, regeneration
  troopSpeed: number; // multiplier on marching speed
  startedAt: Ms;
  npcCamps: number;
  npcRaids: boolean;
  protectionMs: Ms; // beginner protection for a new player, already scaled by speed
}

export interface GameState {
  schema: 1;
  settings: WorldSettings;
  time: Ms; // everything up to here has been settled
  rng: number; // seeded generator state (uint32)
  nextId: number;
  players: Record<string, Player>;
  villages: Record<string, Village>;
  occupancy: Record<number, string>; // tile index → village id
  oases: Record<number, OasisState>; // tile index → oasis, created when first touched
  movements: Record<string, Movement>;
  reports: Record<string, Report>;
  kingdoms: Record<string, Kingdom>;
  scheduled: ScheduledEvent[];
  npc: { campsPlayerId: string | null; townsPlayerId: string | null };
}

export type PlayerKind = "human" | "ai" | "npc";

export interface Player {
  id: string;
  name: string;
  factionId: string;
  kind: PlayerKind;
  createdAt: Ms;
  protectedUntil: Ms;
  capitalId: string | null;
  villageIds: string[];
  cultureBank: number; // culture kept from villages lost or given up
  offense: number; // food-upkeep of enemy units killed while attacking
  defense: number; // … while defending
  looted: number; // resources carried home from raids
  hero: Hero | null;
  kingdomId: string | null;
  // Free-form slot for the hybrid layer (house, family, offices, …). The
  // engine never reads it.
  meta: Record<string, unknown>;
}

export interface HeroPoints {
  strength: number;
  offense: number;
  defense: number;
  production: number;
}

export type HeroStatus = "home" | "moving" | "stationed" | "dead" | "reviving";

export interface Hero {
  name: string;
  homeVillageId: string;
  level: number;
  xp: number;
  health: number; // 0..100 at healthAt
  healthAt: Ms;
  status: HeroStatus;
  where: string | null; // movement id while moving, place key while stationed
  reviveAt: Ms | null;
  points: HeroPoints;
  unspent: number;
  productionResource: ResourceId | "all";
}

export type VillageKind = "player" | "camp" | "town";

export interface Field {
  resource: ResourceId;
  level: number;
}

export interface Building {
  id: string;
  level: number;
}

export interface BuildJob {
  id: string;
  queue: string;
  kind: "field" | "building";
  index: number; // field index or building slot
  buildingId: string; // the field's resource id for fields
  level: number; // the level this job reaches, as planned when queued
  startAt: Ms;
  endAt: Ms;
  cost: Resources;
}

export interface TrainBatch {
  id: string;
  buildingId: string; // the queue: barracks, stables, …
  unitId: string;
  count: number;
  done: number;
  unitMs: Ms;
  startAt: Ms;
}

export interface ResearchJob {
  unitId: string;
  startAt: Ms;
  endAt: Ms;
}

export interface ArmoryJob {
  unitId: string;
  level: number;
  startAt: Ms;
  endAt: Ms;
}

export interface FestivalJob {
  festivalId: string;
  culture: number;
  startAt: Ms;
  endAt: Ms;
}

// Troops of another village (any owner) stationed here as reinforcements.
// They are fed by the place that hosts them.
export interface Stationed {
  homeVillageId: string;
  ownerId: string;
  factionId: string;
  troops: Troops;
  armory: Record<string, number>; // armory levels when they marched out
  hero: boolean;
}

export interface NpcState {
  tier: number;
  label: string; // "Pirate Cove", "Rome", …
  townId: string | null;
  garrison: Troops; // what the place regrows toward
  regenMs: Ms; // time to regrow a full garrison from nothing
  carry: Record<string, number>; // fractional regrowth not yet a whole unit
}

export interface Village {
  id: string;
  ownerId: string;
  name: string;
  x: number;
  y: number;
  kind: VillageKind;
  layoutId: string | null;
  isCapital: boolean;
  foundedAt: Ms;
  updatedAt: Ms;
  resources: Resources;
  culture: number; // culture points this village has produced for its owner
  loyalty: number; // 0..100
  fields: Field[];
  buildings: (Building | null)[];
  buildQueue: BuildJob[];
  training: TrainBatch[];
  research: { done: string[]; job: ResearchJob | null };
  armory: { levels: Record<string, number>; job: ArmoryJob | null };
  festival: FestivalJob | null;
  troops: Troops; // the owner's own troops at home
  stationed: Stationed[];
  children: string[]; // villages founded or conquered from here (expansion slots used)
  oases: number[]; // annexed oasis tiles
  treasures: number;
  tribute: Resources; // kingdom tribute waiting for the king
  npc: NpcState | null;
}

export interface OasisState {
  tile: number;
  typeId: string;
  ownerVillageId: string | null;
  loyalty: number;
  updatedAt: Ms;
  animals: Troops;
  carry: Record<string, number>;
  stationed: Stationed[];
}

export type MissionKind = "attack" | "raid" | "scout" | "reinforce" | "settle";
export type MovementKind = MissionKind | "return" | "trade" | "tradeReturn";

export interface Movement {
  id: string;
  seq: number;
  kind: MovementKind;
  ownerId: string;
  homeVillageId: string; // the troops' home: it feeds them while they march
  fromTile: number;
  toTile: number;
  targetVillageId: string | null;
  targetOwnerId: string | null;
  troops: Troops;
  hero: boolean;
  armory: Record<string, number>;
  factionId: string;
  carry: Resources;
  treasures: number;
  merchants: number;
  targets: string[]; // catapult targets (building ids); empty = random
  departAt: Ms;
  arriveAt: Ms;
  mission: MovementKind; // for a return: what the march out was
}

export interface Kingdom {
  id: string;
  name: string;
  kingId: string;
  members: string[]; // governors, the king not included
  createdAt: Ms;
}

export type ScheduledKind = "npcRaids" | "aiTurn";

export interface ScheduledEvent {
  id: string;
  seq: number;
  at: Ms;
  kind: ScheduledKind;
  playerId?: string;
}

export type ReportKind =
  | "battle"
  | "scout"
  | "reinforcement"
  | "trade"
  | "settle"
  | "starvation"
  | "hero"
  | "kingdom";

export interface Report {
  id: string;
  at: Ms;
  kind: ReportKind;
  title: string;
  recipients: string[];
  unread: string[];
  data: ReportData;
}

export interface ReportSide {
  playerId: string | null;
  playerName: string;
  villageId: string | null;
  villageName: string;
  factionId: string;
  troops: Troops;
  losses: Troops;
  hero: { present: boolean; healthLost: number; died: boolean; xp: number } | null;
}

export interface BattleReportData {
  type: "battle";
  mission: "attack" | "raid";
  target: { tile: number; x: number; y: number; label: string; villageId: string | null; oasis: boolean };
  attacker: ReportSide;
  defenders: ReportSide[];
  winner: "attacker" | "defender";
  attackPower: number;
  defensePower: number;
  morale: number;
  wallLevel: number;
  wall: { from: number; to: number } | null;
  damaged: { target: string; name: string; from: number; to: number }[];
  loot: Resources;
  capacity: number;
  treasures: number;
  loyalty: { from: number; to: number } | null;
  conquered: boolean;
  annexed: boolean;
  notes: string[];
}

export interface ScoutReportData {
  type: "scout";
  target: { tile: number; x: number; y: number; label: string; villageId: string | null; oasis: boolean };
  attacker: ReportSide;
  success: boolean;
  detected: boolean;
  defenderScouts: Troops;
  defenderLosses: Troops;
  info: {
    resources: Resources | null;
    troops: Troops;
    wallLevel: number;
    cacheProtection: number;
    buildings: { name: string; level: number }[];
  } | null;
}

export interface SimpleReportData {
  type: "simple";
  lines: string[];
  troops?: Troops;
  resources?: Resources;
  tile?: number;
}

export type ReportData = BattleReportData | ScoutReportData | SimpleReportData;
