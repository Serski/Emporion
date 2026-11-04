import type { Content } from "../content/load.js";
import { newId, nextSeq } from "../core/ids.js";
import { addTroops, canAfford, cleanTroops, hasTroops, pay, totalResources, troopCount } from "../core/resources.js";
import { fail, ok, type Result } from "../core/result.js";
import { HOUR } from "../core/time.js";
import type { GameState, MissionKind, Movement, MovementKind, Ms, Resources, Troops, Village } from "../core/types.js";
import { onMap, tileIndex, tileKind, travelDistance } from "../world/map.js";
import { isFreeValley } from "../world/world.js";
import { oasisAt } from "../world/oases.js";
import { inForeignTerritory } from "../world/territory.js";
import { heroAlive } from "../social/hero.js";
import { touch } from "../village/timeline.js";
import {
  cultureForVillages,
  expansionSlots,
  factionOf,
  merchantCapacity,
  merchantsBusy,
  merchantsTotal,
  playerCulture,
  rallyPoint,
  troopSpeedBonus,
} from "../village/stats.js";
import { slowestSpeed } from "./combat.js";
import { ownVillage } from "../economy/construction.js";

// ---------------------------------------------------------------------------
// Marching. Troops leave the muster ground for a tile; the march takes
// travel-distance / speed of the slowest unit (the sea legs of the line cost
// seaTravelMultiplier, the Hippodrome speeds the part beyond its threshold).
// While on the road they eat from their home town.
// ---------------------------------------------------------------------------

export function villageTile(content: Content, v: Village): number {
  return tileIndex(content, v.x, v.y);
}

export function marchMs(state: GameState, content: Content, home: Village | null, from: number, to: number, speed: number): Ms {
  const d = travelDistance(content, from, to);
  const boost = home ? troopSpeedBonus(content, home) : { beyond: 0, bonus: 0 };
  const hours = boost.bonus > 0 && d > boost.beyond ? boost.beyond / speed + (d - boost.beyond) / (speed * (1 + boost.bonus)) : d / speed;
  return Math.max(1000, Math.round((hours * HOUR) / state.settings.troopSpeed));
}

export interface SendOrder {
  playerId: string;
  fromVillageId: string;
  toTile: number;
  mission: MissionKind;
  troops: Troops;
  hero?: boolean;
  targets?: string[];
}

export interface TargetInfo {
  kind: "village" | "oasis" | "valley" | "other";
  village: Village | null;
}

export function targetAt(state: GameState, content: Content, tile: number): TargetInfo {
  const vid = state.occupancy[tile];
  if (vid && state.villages[vid]) return { kind: "village", village: state.villages[vid]! };
  const k = tileKind(content, state.settings.seed, tile);
  if (k === "oasis") return { kind: "oasis", village: null };
  if (k === "valley") return { kind: "valley", village: null };
  return { kind: "other", village: null };
}

export function isProtected(state: GameState, playerId: string, at: Ms): boolean {
  const p = state.players[playerId];
  return !!p && p.kind !== "npc" && p.protectedUntil > at;
}

export function sendTroops(state: GameState, content: Content, order: SendOrder, now: Ms): Result<{ movement: Movement }> {
  const own = ownVillage(state, order.playerId, order.fromVillageId);
  if (!own.ok) return own;
  const v = own.v;
  touch(state, content, v, now);
  const player = state.players[order.playerId]!;
  const faction = factionOf(state, content, v);
  if (!rallyPoint(content, v)) return fail("requirements", "Build a Muster Ground to send troops.");
  const toXY = { x: order.toTile % content.map.width, y: Math.floor(order.toTile / content.map.width) };
  if (!Number.isInteger(order.toTile) || !onMap(content, toXY.x, toXY.y)) return fail("invalid", "That is off the map.");
  const fromTile = villageTile(content, v);
  if (order.toTile === fromTile) return fail("invalid", "Your troops are already there.");

  const troops = cleanTroops(order.troops);
  for (const [u, n] of Object.entries(troops)) {
    if (!Number.isInteger(n) || n < 0) return fail("invalid", "Troop counts are whole numbers.");
    if (content.unitFaction[u] !== faction.id) return fail("invalid", "Unknown unit.");
  }
  if (!hasTroops(v.troops, troops)) return fail("no_troops", "You do not have those troops at home.");
  const hero = player.hero;
  const withHero = !!order.hero;
  if (withHero && (!heroAlive(hero) || hero.status !== "home" || hero.homeVillageId !== v.id)) {
    return fail("invalid", "Your hero is not at home in this town.");
  }
  if (troopCount(troops) === 0 && !withHero) return fail("no_troops", "Choose some troops to send.");

  const target = targetAt(state, content, order.toTile);
  let carry: Resources = {};
  const targets: string[] = [];
  switch (order.mission) {
    case "settle": {
      const settlers = Object.entries(troops);
      const need = content.world.expansion.settlersNeeded;
      if (withHero || settlers.length !== 1 || content.units[settlers[0]![0]]?.role !== "settler" || settlers[0]![1] !== need) {
        return fail("invalid", `Send exactly ${need} settlers, and nothing else, to found a town.`);
      }
      if (!isFreeValley(state, content, order.toTile)) return fail("invalid", "Settlers need an empty valley.");
      if (inForeignTerritory(state, content, order.toTile, player.id)) return fail("invalid", "That valley lies inside another town's territory.");
      const cp = playerCulture(state, player);
      const need2 = cultureForVillages(content, player.villageIds.length + 1);
      if (cp < need2) return fail("culture", `You need ${need2} culture points for another town (you have ${Math.floor(cp)}).`);
      if (expansionSlots(content, v) - v.children.length <= 0) return fail("no_slot", "This town has no free expansion slot.");
      carry = { ...content.world.expansion.foundingCost };
      if (!canAfford(v.resources, carry)) return fail("insufficient", "Settlers must carry the founding stores with them.");
      pay(v.resources, carry);
      break;
    }
    case "scout": {
      if (withHero) return fail("invalid", "Scouts travel alone.");
      for (const u of Object.keys(troops)) if (content.units[u]?.role !== "scout") return fail("invalid", "Only scouts can scout.");
      if (target.kind !== "village" && target.kind !== "oasis") return fail("invalid", "There is nothing to scout there.");
      if (target.village && target.village.ownerId === player.id) return fail("invalid", "That is your own town.");
      if (target.village && isProtected(state, target.village.ownerId, now)) return fail("protected", "That player is under beginner's protection.");
      break;
    }
    case "attack":
    case "raid": {
      if (target.kind === "village") {
        const tv = target.village!;
        if (tv.ownerId === player.id) return fail("invalid", "You cannot attack your own town.");
        if (isProtected(state, tv.ownerId, now)) return fail("protected", "That player is under beginner's protection.");
      } else if (target.kind === "oasis") {
        const o = oasisAt(state, content, order.toTile, now)!;
        const ownerVillage = o.ownerVillageId ? state.villages[o.ownerVillageId] : undefined;
        if (ownerVillage?.ownerId === player.id) return fail("invalid", "That oasis is already yours.");
        if (ownerVillage && isProtected(state, ownerVillage.ownerId, now)) return fail("protected", "That player is under beginner's protection.");
      } else {
        return fail("invalid", "There is nobody there to fight.");
      }
      if (order.mission === "attack" && order.targets && order.targets.length > 0) {
        const rp = rallyPoint(content, v)!;
        const max = rp.level >= rp.twoTargetsFrom ? 2 : rp.level >= rp.chooseTargetFrom ? 1 : 0;
        for (const t of order.targets.slice(0, max)) {
          const def = content.buildings[t] ?? null;
          if (t !== "random" && !def && !content.fields[t]) return fail("invalid", `Unknown catapult target ${t}.`);
          if (def?.catapultImmune) return fail("invalid", `Catapults cannot target the ${def.name}.`);
          targets.push(t);
        }
      }
      const tvOwner = target.village ? state.players[target.village.ownerId] : undefined;
      if (tvOwner && tvOwner.kind !== "npc" && player.protectedUntil > now) player.protectedUntil = now; // attacking ends your own protection
      break;
    }
    case "reinforce": {
      if (target.kind === "village") {
        const tv = target.village!;
        if (tv.kind !== "player") return fail("invalid", "Only players' towns can be reinforced.");
      } else if (target.kind === "oasis") {
        const o = oasisAt(state, content, order.toTile, now)!;
        const ownerVillage = o.ownerVillageId ? state.villages[o.ownerVillageId] : undefined;
        if (!ownerVillage || ownerVillage.ownerId !== player.id) return fail("invalid", "You can only reinforce your own oases.");
      } else return fail("invalid", "There is nobody there to reinforce.");
      break;
    }
    default:
      return fail("invalid", "Unknown mission.");
  }

  const speed = slowestSpeed(content, troops, withHero ? content.hero.speed : null);
  const arriveAt = now + marchMs(state, content, v, fromTile, order.toTile, speed);
  addTroops(v.troops, troops, -1);
  const movement: Movement = {
    id: newId(state, "m"),
    seq: nextSeq(state),
    kind: order.mission,
    ownerId: player.id,
    homeVillageId: v.id,
    fromTile,
    toTile: order.toTile,
    targetVillageId: target.village?.id ?? null,
    targetOwnerId: target.village?.ownerId ?? null,
    troops,
    hero: withHero,
    armory: { ...v.armory.levels },
    factionId: faction.id,
    carry,
    treasures: 0,
    merchants: 0,
    targets,
    departAt: now,
    arriveAt,
    mission: order.mission,
  };
  state.movements[movement.id] = movement;
  if (withHero && hero) {
    hero.status = "moving";
    hero.where = movement.id;
  }
  return ok({ movement });
}

// A march home from `fromTile` for whatever survived.
export function sendHome(
  state: GameState,
  content: Content,
  args: { ownerId: string; homeVillageId: string; fromTile: number; troops: Troops; hero: boolean; armory: Record<string, number>; factionId: string; carry?: Resources; treasures?: number; mission: MovementKind },
  at: Ms,
): Movement | null {
  const home = state.villages[args.homeVillageId];
  const troops = cleanTroops(args.troops);
  if (!home || (troopCount(troops) === 0 && !args.hero)) return null;
  const toTile = villageTile(content, home);
  const speed = slowestSpeed(content, troops, args.hero ? content.hero.speed : null);
  const m: Movement = {
    id: newId(state, "m"),
    seq: nextSeq(state),
    kind: "return",
    ownerId: args.ownerId,
    homeVillageId: home.id,
    fromTile: args.fromTile,
    toTile,
    targetVillageId: home.id,
    targetOwnerId: home.ownerId,
    troops,
    hero: args.hero,
    armory: args.armory,
    factionId: args.factionId,
    carry: args.carry ?? {},
    treasures: args.treasures ?? 0,
    merchants: 0,
    targets: [],
    departAt: at,
    arriveAt: at + (args.fromTile === toTile ? 1000 : marchMs(state, content, home, args.fromTile, toTile, speed)),
    mission: args.mission,
  };
  state.movements[m.id] = m;
  const hero = state.players[args.ownerId]?.hero;
  if (args.hero && hero) {
    hero.status = "moving";
    hero.where = m.id;
  }
  return m;
}

// Send reinforcements home: the owner recalls them or the host sends them away.
export function withdraw(
  state: GameState,
  content: Content,
  playerId: string,
  where: { villageId: string } | { oasisTile: number },
  homeVillageId: string,
  now: Ms,
  troops?: Troops,
): Result<{ movement: Movement | null }> {
  let host: { stationed: Village["stationed"]; ownerId: string | null; tile: number };
  if ("villageId" in where) {
    const hv = state.villages[where.villageId];
    if (!hv) return fail("not_found", "No such town.");
    touch(state, content, hv, now);
    host = { stationed: hv.stationed, ownerId: hv.ownerId, tile: villageTile(content, hv) };
  } else {
    const o = oasisAt(state, content, where.oasisTile, now);
    if (!o) return fail("not_found", "No such oasis.");
    const ownerVillage = o.ownerVillageId ? state.villages[o.ownerVillageId] : undefined;
    if (ownerVillage) touch(state, content, ownerVillage, now);
    host = { stationed: o.stationed, ownerId: ownerVillage?.ownerId ?? null, tile: where.oasisTile };
  }
  const group = host.stationed.find((s) => s.homeVillageId === homeVillageId);
  if (!group) return fail("not_found", "Those troops are not stationed here.");
  if (group.ownerId !== playerId && host.ownerId !== playerId) return fail("not_owner", "Those are not your troops, and this is not your town.");
  const home = state.villages[homeVillageId];
  if (home) touch(state, content, home, now);
  const leaving = troops ? cleanTroops(troops) : { ...group.troops };
  if (!hasTroops(group.troops, leaving)) return fail("no_troops", "Not that many troops are stationed here.");
  const takeHero = group.hero && (!troops || troopCount(addTroops({ ...group.troops }, leaving, -1)) === 0);
  addTroops(group.troops, leaving, -1);
  if (takeHero) group.hero = false;
  const idx = host.stationed.indexOf(group);
  if (troopCount(group.troops) === 0 && !group.hero) host.stationed.splice(idx, 1);
  const movement = sendHome(
    state,
    content,
    { ownerId: group.ownerId, homeVillageId, fromTile: host.tile, troops: leaving, hero: takeHero, armory: group.armory, factionId: group.factionId, mission: "reinforce" },
    now,
  );
  return ok({ movement });
}

// --- merchants -----------------------------------------------------------------

export function merchantsNeeded(state: GameState, content: Content, v: Village, resources: Resources): number {
  return Math.ceil(totalResources(resources) / merchantCapacity(state, content, v));
}

export function sendResources(
  state: GameState,
  content: Content,
  playerId: string,
  fromVillageId: string,
  toVillageId: string,
  resources: Resources,
  now: Ms,
): Result<{ movement: Movement }> {
  const own = ownVillage(state, playerId, fromVillageId);
  if (!own.ok) return own;
  const v = own.v;
  touch(state, content, v, now);
  const target = state.villages[toVillageId];
  if (!target || target.kind !== "player") return fail("invalid", "Merchants can only deliver to players' towns.");
  if (target.id === v.id) return fail("invalid", "That is this town.");
  const load: Resources = {};
  for (const [r, n] of Object.entries(resources)) {
    if (!content.resourceIds.includes(r)) return fail("invalid", "Unknown resource.");
    if (!Number.isFinite(n) || n < 0) return fail("invalid", "Amounts are positive.");
    if (n > 0) load[r] = Math.floor(n);
  }
  if (totalResources(load) <= 0) return fail("invalid", "Load something first.");
  if (!canAfford(v.resources, load)) return fail("insufficient", "Not enough resources.");
  const total = merchantsTotal(content, v);
  if (total <= 0) return fail("requirements", "Build an Agora to send merchants.");
  const need = merchantsNeeded(state, content, v, load);
  const free = total - merchantsBusy(state, v);
  if (need > free) return fail("no_merchants", `You need ${need} merchants and have ${free} free.`);
  pay(v.resources, load);
  const faction = factionOf(state, content, v);
  const fromTile = villageTile(content, v);
  const toTile = villageTile(content, target);
  const movement: Movement = {
    id: newId(state, "m"),
    seq: nextSeq(state),
    kind: "trade",
    ownerId: playerId,
    homeVillageId: v.id,
    fromTile,
    toTile,
    targetVillageId: target.id,
    targetOwnerId: target.ownerId,
    troops: {},
    hero: false,
    armory: {},
    factionId: faction.id,
    carry: load,
    treasures: 0,
    merchants: need,
    targets: [],
    departAt: now,
    arriveAt: now + marchMs(state, content, null, fromTile, toTile, faction.merchant.speed),
    mission: "trade",
  };
  state.movements[movement.id] = movement;
  return ok({ movement });
}
