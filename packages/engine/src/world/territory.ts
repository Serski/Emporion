import type { Content } from "../content/load.js";
import type { GameState, Village } from "../core/types.js";
import { forEachHexWithin } from "./map.js";

// ---------------------------------------------------------------------------
// Territory. Every player town claims the hexes within townRadius steps of it
// (4 rings by default), every free city those within cityRadius, an outlaw
// camp only its own hex. Where claims overlap, the nearest town wins, then the
// older.
// Players cannot found towns inside someone else's territory, and a hero can
// only annex an oasis inside the territory of the town it marches from.
// ---------------------------------------------------------------------------

export function territoryRadius(content: Content, v: Village): number {
  if (v.kind === "player") return content.world.territory.townRadius;
  if (v.kind === "town") return content.world.territory.cityRadius;
  return 0;
}

interface TerritoryMap {
  count: number;
  owner: Int32Array; // index into ids, -1 for unclaimed
  ids: string[];
}

const caches = new WeakMap<GameState, TerritoryMap>();

function build(state: GameState, content: Content): TerritoryMap {
  const { width: W, height: H } = content.map;
  const owner = new Int32Array(W * H).fill(-1);
  const best = new Float32Array(W * H).fill(Infinity);
  const villages = Object.values(state.villages).sort((a, b) => a.foundedAt - b.foundedAt || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const ids: string[] = [];
  for (const v of villages) {
    const idx = ids.push(v.id) - 1;
    forEachHexWithin(content, v.x, v.y, territoryRadius(content, v), (t, d) => {
      if (d < best[t]!) {
        best[t] = d;
        owner[t] = idx;
      }
    });
  }
  return { count: villages.length, owner, ids };
}

// The claim map, rebuilt only when a town is founded (towns never move or vanish;
// a conquest changes a claim's owner, not its shape).
export function territoryMap(state: GameState, content: Content): TerritoryMap {
  const count = Object.keys(state.villages).length;
  let m = caches.get(state);
  if (!m || m.count !== count) {
    m = build(state, content);
    caches.set(state, m);
  }
  return m;
}

export function territoryAt(state: GameState, content: Content, tile: number): Village | null {
  const m = territoryMap(state, content);
  const idx = m.owner[tile] ?? -1;
  return idx >= 0 ? state.villages[m.ids[idx]!] ?? null : null;
}

// True when the tile is claimed by a town that is not this player's.
export function inForeignTerritory(state: GameState, content: Content, tile: number, playerId: string): boolean {
  const claim = territoryAt(state, content, tile);
  return !!claim && claim.ownerId !== playerId;
}

export function villageClaims(state: GameState, content: Content, v: Village, tile: number): boolean {
  return territoryAt(state, content, tile)?.id === v.id;
}

export function claimedTiles(state: GameState, content: Content, v: Village): number[] {
  const m = territoryMap(state, content);
  const idx = m.ids.indexOf(v.id);
  const out: number[] = [];
  forEachHexWithin(content, v.x, v.y, territoryRadius(content, v), (t) => {
    if (m.owner[t] === idx) out.push(t);
  });
  return out;
}
