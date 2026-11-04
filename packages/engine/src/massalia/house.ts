import type { Content } from "../content/load.js";
import { newId, nextSeq } from "../core/ids.js";
import { fail, ok, type Result } from "../core/result.js";
import type { GameState, Ms, Player, Resources, Village } from "../core/types.js";
import { buildingLevel } from "../village/stats.js";
import { touch } from "../village/timeline.js";
import { calendarAt } from "../world/calendar.js";
import { reapHoldings } from "./holdings.js";
import { changeComposure, createProfile } from "./profile.js";

// ---------------------------------------------------------------------------
// The house's purse, stores and people (MASSALIA's wallet, goods and pops).
// People are hired at an Agora, paid in drachmae at the turn of each season
// (MASSALIA charges per day; a MASSALIA day is a season here) and eat wheat in
// the capital by the hour, like troops. A purse that cannot pay is emptied and
// the rest forgiven, as in MASSALIA: nobody walks out.
// ---------------------------------------------------------------------------

export function goodsOf(p: Player, id: string): number {
  return p.goods[id] ?? 0;
}

export function addGoods(p: Player, id: string, n: number): void {
  p.goods[id] = (p.goods[id] ?? 0) + n;
  if (p.goods[id] === 0) delete p.goods[id];
}

export function capitalOf(state: GameState, p: Player): Village | undefined {
  return p.capitalId ? state.villages[p.capitalId] : undefined;
}

// People busy in running crafts.
export function busyPeople(p: Player): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of p.crafts) for (const [k, n] of Object.entries(j.people)) out[k] = (out[k] ?? 0) + n;
  return out;
}

export function freePeople(p: Player, id: string): number {
  return (p.people[id] ?? 0) - (busyPeople(p)[id] ?? 0);
}

// What the house's people add to the capital's hour: slaves' work, everyone's
// bread, citizens' culture. Read by villageRates for the capital only.
export function houseProduction(state: GameState, content: Content, v: Village): Resources {
  const out: Resources = {};
  const p = state.players[v.ownerId];
  if (!p || p.capitalId !== v.id) return out;
  for (const [id, n] of Object.entries(p.people)) {
    const def = content.people[id];
    for (const [r, per] of Object.entries(def?.production ?? {})) out[r] = (out[r] ?? 0) + n * per;
  }
  return out;
}

export function houseFood(state: GameState, content: Content, v: Village): number {
  const p = state.players[v.ownerId];
  if (!p || p.capitalId !== v.id) return 0;
  let food = 0;
  for (const [id, n] of Object.entries(p.people)) food += n * (content.people[id]?.food ?? 0);
  return food;
}

export function houseCulture(state: GameState, content: Content, v: Village): number {
  const p = state.players[v.ownerId];
  if (!p || p.capitalId !== v.id) return 0;
  let c = 0;
  for (const [id, n] of Object.entries(p.people)) c += n * (content.people[id]?.culturePerDay ?? 0);
  return c;
}

export function upkeepPerSeason(content: Content, p: Player): number {
  let total = 0;
  for (const [id, n] of Object.entries(p.people)) total += n * (content.people[id]?.upkeep ?? 0);
  return total;
}

function ownTownWith(state: GameState, p: Player, villageId: string, building: string): Result<{ v: Village }> {
  const v = state.villages[villageId];
  if (!v || v.ownerId !== p.id) return fail("not_found", "That is not one of your towns.");
  if (buildingLevel(v, building) <= 0) return fail("requirements", `Build an Agora in ${v.name} first.`);
  return ok({ v });
}

export function hire(state: GameState, content: Content, playerId: string, villageId: string, personId: string, count: number, at: Ms): Result {
  const p = state.players[playerId];
  if (!p) return fail("not_found", "No such player.");
  const def = content.people[personId];
  if (!def) return fail("not_found", "The agora hires no such people.");
  if (!Number.isInteger(count) || count < 1) return fail("invalid", "Hire a whole, positive number.");
  const town = ownTownWith(state, p, villageId, content.massalia.people.building);
  if (!town.ok) return town;
  if (def.max !== undefined && (p.people[personId] ?? 0) + count > def.max) return fail("limit", `You already retain a ${def.name.toLowerCase()}.`);
  const cost = def.hire * count;
  if (p.purse < cost) return fail("insufficient", `You need ${cost} drachmae for that.`);
  const capital = capitalOf(state, p);
  if (capital) touch(state, content, capital, at);
  p.purse -= cost;
  p.people[personId] = (p.people[personId] ?? 0) + count;
  return ok({});
}

export function dismiss(state: GameState, content: Content, playerId: string, personId: string, count: number, at: Ms): Result {
  const p = state.players[playerId];
  if (!p) return fail("not_found", "No such player.");
  const def = content.people[personId];
  if (!def) return fail("not_found", "No such people.");
  if (!Number.isInteger(count) || count < 1) return fail("invalid", "Choose a whole, positive number.");
  if ((p.people[personId] ?? 0) < count) return fail("insufficient", `You retain only ${p.people[personId] ?? 0}.`);
  if (freePeople(p, personId) < count) return fail("busy", `Some of your ${def.plural.toLowerCase()} are at work on a craft.`);
  const capital = capitalOf(state, p);
  if (capital) touch(state, content, capital, at);
  p.people[personId] = (p.people[personId] ?? 0) - count;
  if (p.people[personId] === 0) delete p.people[personId];
  p.purse += def.sellBack * count;
  return ok({});
}

// --- the turn of the season ----------------------------------------------------------

export function scheduleSeason(state: GameState, content: Content, after: Ms): void {
  if (state.scheduled.some((e) => e.kind === "season")) return;
  const next = calendarAt(state, content, after).nextSeasonAt;
  state.scheduled.push({ id: newId(state, "e"), seq: nextSeq(state), at: Math.round(next), kind: "season" });
}

export function runSeason(state: GameState, content: Content, at: Ms): void {
  for (const p of Object.values(state.players)) {
    if (p.kind === "npc") continue;
    p.purse = Math.max(0, p.purse - upkeepPerSeason(content, p));
    reapHoldings(state, content, p, at);
    changeComposure(state, content, p, at, content.massalia.profile.composure.recoveryPerSeason);
  }
  scheduleSeason(state, content, at);
}

// --- older saves ------------------------------------------------------------------------

// Bring a save from before the MASSALIA pack up to date.
export function ensureMassalia(state: GameState, content: Content, at: Ms): void {
  state.market ??= { stalls: {}, taxCollected: 0 };
  for (const p of Object.values(state.players)) {
    p.purse ??= p.kind === "npc" ? 0 : content.massalia.market.currency.start;
    p.goods ??= {};
    p.goodsCarry ??= {};
    p.people ??= {};
    if (p.profile === undefined) p.profile = p.kind === "npc" ? null : createProfile(content, p.factionId);
    p.crafts ??= [];
    p.altar ??= null;
    p.voyages ??= [];
    p.polityId ??= null;
  }
  scheduleSeason(state, content, at);
}
