import type { Content } from "../content/load.js";
import { newId, nextSeq } from "../core/ids.js";
import { fail, ok, type Result } from "../core/result.js";
import type { GameState, Ms, Player, Troops, Village } from "../core/types.js";
import { hexLine } from "../world/map.js";
import { addGoods, goodsOf } from "./house.js";

// ---------------------------------------------------------------------------
// The sea (MASSALIA's ships.json, reach.ts and mapActions.ts). A march whose
// straight line runs over open sea needs hulls with room for every man; a
// hull's range counts the sea zones the line crosses. Pentekonters carry, and
// triremes fight: they fill any space still short and sail as escort against
// a town with ships. Every hull burns naval supplies per voyage and is away
// for the round trip; hulls always come home. A landing is driven off when
// the town's fleet outweighs the escort.
// ---------------------------------------------------------------------------

export interface SeaRoute {
  crossesSea: boolean;
  zones: number; // distinct sea zones the line runs over
}

export function seaRoute(content: Content, from: number, to: number): SeaRoute {
  const zones = new Set<number>();
  for (const t of hexLine(content, from, to)) {
    if (t < 0 || content.map.terrain[t] !== "S") continue;
    zones.add(content.mapRegion[t] ?? -1);
  }
  return { crossesSea: zones.size > 0, zones: zones.size };
}

export function unitSpace(content: Content, unitId: string): number {
  const cfg = content.massalia.ships;
  const special = cfg.unitSpace[unitId];
  if (special) return special;
  const u = content.units[unitId];
  if (!u) return cfg.troopSpace.infantry;
  if (u.role === "ram" || u.role === "catapult") return cfg.troopSpace.siege;
  return u.class === "cavalry" ? cfg.troopSpace.cavalry : cfg.troopSpace.infantry;
}

export function troopSpace(content: Content, troops: Troops, hero: boolean): number {
  let n = hero ? content.massalia.ships.troopSpace.hero : 0;
  for (const [u, c] of Object.entries(troops)) n += c * unitSpace(content, u);
  return n;
}

export function navalStrength(content: Content, ships: Record<string, number>): number {
  let n = 0;
  for (const [id, c] of Object.entries(ships)) n += c * (content.ships[id]?.naval ?? 0);
  return n;
}

export function fleetSpace(content: Content, ships: Record<string, number>, zones: number): number {
  let n = 0;
  for (const [id, c] of Object.entries(ships)) {
    const s = content.ships[id];
    if (s && s.range >= zones) n += c * s.troopSpace;
  }
  return n;
}

// The fleet at a town: a free city's own ships, or the hulls a player's
// house has in port.
export function harbourFleet(state: GameState, content: Content, v: Village): Record<string, number> {
  if (v.kind === "town") {
    const town = v.npc?.townId ? content.towns[v.npc.townId] : undefined;
    const tf = content.massalia.ships.townFleet;
    return town ? { [tf.pentekonters]: town.fleet.pentekonters, [tf.triremes]: town.fleet.triremes } : {};
  }
  if (v.kind === "player") {
    const owner = state.players[v.ownerId];
    const out: Record<string, number> = {};
    for (const id of Object.keys(content.ships)) if (owner && goodsOf(owner, id) > 0) out[id] = goodsOf(owner, id);
    return out;
  }
  return {};
}

// MASSALIA's assembleFleet: carriers first, then warships for what is still
// short, only hulls that can make the distance; for a raid or attack on a town
// with ships, every spare warship in range sails as escort.
export function assembleFleet(content: Content, p: Player, space: number, zones: number, escort: boolean): Result<{ ships: Record<string, number> }> {
  const picked: Record<string, number> = {};
  let short = space;
  const ordered = Object.values(content.ships)
    .filter((s) => s.range >= zones)
    .sort((a, b) => (a.role === b.role ? b.troopSpace - a.troopSpace : a.role === "transport" ? -1 : 1));
  for (const s of ordered) {
    if (short <= 0) break;
    const have = goodsOf(p, s.id);
    const need = Math.min(have, Math.ceil(short / s.troopSpace));
    if (need > 0) {
      picked[s.id] = need;
      short -= need * s.troopSpace;
    }
  }
  if (short > 0) {
    const anyInRange = ordered.length > 0;
    return fail(
      "requirements",
      anyInRange
        ? `Not enough hulls: the crossing needs room for ${space} men. Buy or build Pentekonters.`
        : `Beyond the fleet's range: the crossing runs over ${zones} seas.`,
    );
  }
  if (escort) {
    for (const s of ordered) if (s.role === "warship") picked[s.id] = goodsOf(p, s.id);
  }
  return ok({ ships: picked });
}

export function checkFleet(content: Content, p: Player, ships: Record<string, number>, space: number, zones: number): Result {
  for (const [id, n] of Object.entries(ships)) {
    if (!content.ships[id]) return fail("invalid", "Unknown ship.");
    if (!Number.isInteger(n) || n < 0) return fail("invalid", "Hull counts are whole numbers.");
    if (goodsOf(p, id) < n) return fail("insufficient", `You have only ${goodsOf(p, id)} ${content.ships[id]!.name}s in port.`);
  }
  if (fleetSpace(content, ships, zones) < space) {
    const tooFar = Object.entries(ships).some(([id, n]) => n > 0 && (content.ships[id]?.range ?? 0) < zones);
    return fail("requirements", tooFar ? `Beyond the fleet's range: the crossing runs over ${zones} seas.` : `Not enough hulls: the crossing needs room for ${space} men.`);
  }
  const supplies = suppliesFor(content, ships);
  const supplyGood = content.massalia.ships.supplyGood;
  if (goodsOf(p, supplyGood) < supplies) return fail("insufficient", `Not enough naval supplies: the voyage needs ${supplies}, you hold ${goodsOf(p, supplyGood)}.`);
  return ok({});
}

export function suppliesFor(content: Content, ships: Record<string, number>): number {
  let n = 0;
  for (const [id, c] of Object.entries(ships)) n += c * (content.ships[id]?.suppliesPerTrip ?? 0);
  return n;
}

// The hulls leave port with the troops and come back after the round trip.
export function launchVoyage(state: GameState, content: Content, p: Player, ships: Record<string, number>, departAt: Ms, arriveAt: Ms): void {
  addGoods(p, content.massalia.ships.supplyGood, -suppliesFor(content, ships));
  const sailing: Record<string, number> = {};
  for (const [id, n] of Object.entries(ships)) {
    if (n <= 0) continue;
    addGoods(p, id, -n);
    sailing[id] = n;
  }
  const backAt = departAt + 2 * (arriveAt - departAt);
  p.voyages.push({ id: newId(state, "f"), ships: sailing, backAt });
  state.scheduled.push({ id: newId(state, "e"), seq: nextSeq(state), at: backAt, kind: "shipsHome", playerId: p.id });
}

export function shipsHome(state: GameState, content: Content, playerId: string, at: Ms): void {
  const p = state.players[playerId];
  if (!p) return;
  const back = p.voyages.filter((v) => v.backAt <= at);
  if (back.length === 0) return;
  p.voyages = p.voyages.filter((v) => v.backAt > at);
  for (const voyage of back) for (const [id, n] of Object.entries(voyage.ships)) addGoods(p, id, n);
}

export function shipsAtSea(p: Player): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of p.voyages) for (const [id, n] of Object.entries(v.ships)) out[id] = (out[id] ?? 0) + n;
  return out;
}

export function shipsInPort(content: Content, p: Player): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(content.ships)) out[id] = goodsOf(p, id);
  return out;
}
