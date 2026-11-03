import type { Content } from "../content/load.js";
import { newId } from "../core/ids.js";
import { fail, ok, type Result } from "../core/result.js";
import type { GameState, Kingdom, Ms, Player, Resources, Village } from "../core/types.js";
import { touch } from "../village/timeline.js";
import { capacity, firstBuildingWith, playerPopulation, population, treasureCapacity } from "../village/stats.js";
import { distance, tileIndex } from "../world/map.js";

// ---------------------------------------------------------------------------
// Kingdoms. A player whose capital has the population and a Treasury may found
// a kingdom and become its king. The king's towns project influence (wider
// with population and treasures); a governor whose capital lies in a kingdom's
// territory may join it. Governors divert a share of their production into a
// tribute pot the king collects, and earn a production bonus in return.
// Treasures held in treasuries count for influence and victory points.
//
// This is the seam where MASSALIA's politics (Koinon, League, oligarchy) can
// replace or extend the kingdom rules.
// ---------------------------------------------------------------------------

export function effectiveTreasures(content: Content, v: Village): number {
  return Math.min(v.treasures, treasureCapacity(content, v));
}

function playerTreasures(state: GameState, content: Content, p: Player): number {
  let n = 0;
  for (const id of p.villageIds) {
    const v = state.villages[id];
    if (v) n += effectiveTreasures(content, v);
  }
  return n;
}

export interface InfluenceSource {
  villageId: string;
  tile: number;
  radius: number;
}

export function influenceSources(state: GameState, content: Content, k: Kingdom): InfluenceSource[] {
  const king = state.players[k.kingId];
  if (!king) return [];
  const cfg = content.kingdoms.influence;
  const out: InfluenceSource[] = [];
  for (const id of king.villageIds) {
    const v = state.villages[id];
    if (!v) continue;
    const radius = Math.min(cfg.maxRadius, cfg.base + population(content, v) * cfg.perPopulation + effectiveTreasures(content, v) * cfg.perTreasure);
    out.push({ villageId: v.id, tile: tileIndex(content, v.x, v.y), radius });
  }
  return out;
}

// The kingdom whose influence is strongest on a tile, if any reaches it.
export function kingdomAtTile(state: GameState, content: Content, tile: number): string | null {
  let best: { id: string; strength: number } | null = null;
  for (const k of Object.values(state.kingdoms)) {
    for (const s of influenceSources(state, content, k)) {
      const strength = s.radius - distance(content, s.tile, tile);
      if (strength > 0 && (!best || strength > best.strength)) best = { id: k.id, strength };
    }
  }
  return best?.id ?? null;
}

function touchAll(state: GameState, content: Content, p: Player, now: Ms) {
  for (const id of p.villageIds) {
    const v = state.villages[id];
    if (v) touch(state, content, v, now);
  }
}

export function foundKingdom(state: GameState, content: Content, playerId: string, name: string, now: Ms): Result<{ kingdom: Kingdom }> {
  if (!content.kingdoms.enabled) return fail("invalid", "Kingdoms are off in this world.");
  const p = state.players[playerId];
  if (!p || p.kind === "npc") return fail("not_found", "No such player.");
  if (p.kingdomId) return fail("invalid", "You already belong to a kingdom.");
  const capital = p.capitalId ? state.villages[p.capitalId] : undefined;
  if (!capital) return fail("not_found", "You have no capital.");
  touch(state, content, capital, now);
  const cfg = content.kingdoms.found;
  if (population(content, capital) < cfg.minPopulation) return fail("requirements", `Your capital needs ${cfg.minPopulation} population.`);
  const treasury = firstBuildingWith(content, capital, (d) => !!d.effects.treasures);
  if ((treasury?.level ?? 0) < cfg.treasuryLevel) return fail("requirements", "Your capital needs a Treasury.");
  const clean = name.trim().slice(0, 40);
  if (!clean) return fail("invalid", "Name your kingdom.");
  touchAll(state, content, p, now);
  const kingdom: Kingdom = { id: newId(state, "k"), name: clean, kingId: p.id, members: [], createdAt: now };
  state.kingdoms[kingdom.id] = kingdom;
  p.kingdomId = kingdom.id;
  return ok({ kingdom });
}

export function joinKingdom(state: GameState, content: Content, playerId: string, kingdomId: string, now: Ms): Result {
  const p = state.players[playerId];
  const k = state.kingdoms[kingdomId];
  if (!p || !k) return fail("not_found", "No such kingdom.");
  if (p.kingdomId) return fail("invalid", "Leave your kingdom first.");
  const capital = p.capitalId ? state.villages[p.capitalId] : undefined;
  if (!capital) return fail("not_found", "You have no capital.");
  if (kingdomAtTile(state, content, tileIndex(content, capital.x, capital.y)) !== k.id) {
    return fail("requirements", `Your capital lies outside the territory of ${k.name}.`);
  }
  touchAll(state, content, p, now);
  k.members.push(p.id);
  p.kingdomId = k.id;
  return ok({});
}

export function leaveKingdom(state: GameState, content: Content, playerId: string, now: Ms): Result {
  const p = state.players[playerId];
  const k = p?.kingdomId ? state.kingdoms[p.kingdomId] : undefined;
  if (!p || !k) return fail("invalid", "You are in no kingdom.");
  if (k.kingId === p.id) {
    // The king abdicates: the kingdom dissolves.
    for (const id of [p.id, ...k.members]) {
      const member = state.players[id];
      if (member) dropMember(state, content, member, now);
    }
    delete state.kingdoms[k.id];
    return ok({});
  }
  dropMember(state, content, p, now);
  k.members = k.members.filter((id) => id !== p.id);
  return ok({});
}

function dropMember(state: GameState, content: Content, p: Player, now: Ms) {
  touchAll(state, content, p, now);
  for (const id of p.villageIds) {
    const v = state.villages[id];
    if (!v) continue;
    // Uncollected tribute goes back into the town's own stores.
    const cap = capacity(content, v);
    for (const [r, n] of Object.entries(v.tribute)) v.resources[r] = Math.min(cap[r] ?? 0, (v.resources[r] ?? 0) + n);
    v.tribute = {};
  }
  p.kingdomId = null;
}

export function tributeWaiting(state: GameState, content: Content, k: Kingdom, now: Ms): Resources {
  const out: Resources = {};
  for (const id of k.members) {
    const p = state.players[id];
    if (!p) continue;
    for (const vid of p.villageIds) {
      const v = state.villages[vid];
      if (!v) continue;
      touch(state, content, v, now);
      for (const [r, n] of Object.entries(v.tribute)) out[r] = (out[r] ?? 0) + n;
    }
  }
  return out;
}

// The king collects every governor's tribute into the capital, as far as the
// capital's stores have room; the rest waits in the pots.
export function collectTribute(state: GameState, content: Content, playerId: string, now: Ms): Result<{ collected: Resources }> {
  const p = state.players[playerId];
  const k = p?.kingdomId ? state.kingdoms[p.kingdomId] : undefined;
  if (!p || !k || k.kingId !== p.id) return fail("not_owner", "Only a king collects tribute.");
  const capital = p.capitalId ? state.villages[p.capitalId] : undefined;
  if (!capital) return fail("not_found", "You have no capital.");
  touch(state, content, capital, now);
  const waiting = tributeWaiting(state, content, k, now);
  const cap = capacity(content, capital);
  const collected: Resources = {};
  for (const r of content.resourceIds) {
    const total = waiting[r] ?? 0;
    if (total <= 0) continue;
    const room = Math.max(0, (cap[r] ?? 0) - (capital.resources[r] ?? 0));
    const take = Math.min(room, total);
    collected[r] = Math.floor(take);
    capital.resources[r] = (capital.resources[r] ?? 0) + take;
    const share = take / total;
    for (const id of k.members) {
      for (const vid of state.players[id]?.villageIds ?? []) {
        const v = state.villages[vid];
        if (v && v.tribute[r]) v.tribute[r] = v.tribute[r]! * (1 - share);
      }
    }
  }
  return ok({ collected });
}

export interface KingdomStanding {
  id: string;
  name: string;
  kingId: string;
  kingName: string;
  members: number;
  population: number;
  treasures: number;
  victoryPoints: number;
}

export function kingdomStandings(state: GameState, content: Content): KingdomStanding[] {
  const vp = content.kingdoms.victoryPoints;
  return Object.values(state.kingdoms)
    .map((k) => {
      const people = [k.kingId, ...k.members].map((id) => state.players[id]).filter((p): p is Player => !!p);
      const pop = people.reduce((n, p) => n + playerPopulation(state, content, p), 0);
      const treasures = people.reduce((n, p) => n + playerTreasures(state, content, p), 0);
      return {
        id: k.id,
        name: k.name,
        kingId: k.kingId,
        kingName: state.players[k.kingId]?.name ?? "?",
        members: k.members.length,
        population: pop,
        treasures,
        victoryPoints: Math.round(treasures * vp.perTreasure + (pop * vp.perPopulation) / 100),
      };
    })
    .sort((a, b) => b.victoryPoints - a.victoryPoints);
}
