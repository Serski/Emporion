import type { Content } from "../content/load.js";
import { newId } from "../core/ids.js";
import type { GameState, Ms, Player } from "../core/types.js";

// ---------------------------------------------------------------------------
// MASSALIA's states. Rome, Carthage, Massalia and the other powers each own a
// set of the map's regions (politics2.json owners), and a town takes the owner
// of its region. Here every power that has towns is one NPC player holding
// all of them, and its land is every hex of its regions: one state, one
// border. "unclaimed" land belongs to no state.
// ---------------------------------------------------------------------------

export const UNCLAIMED = "unclaimed";

const landCache = new WeakMap<Content, Int16Array>();

// Polity index (into Object.keys(content.map.polities)) per land hex, -1 none.
export function statePerHex(content: Content): Int16Array {
  let out = landCache.get(content);
  if (out) return out;
  const ids = Object.keys(content.map.polities);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = content.map.width * content.map.height;
  out = new Int16Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    const terrain = content.map.terrain[t];
    if (terrain !== "P" && terrain !== "H" && terrain !== "M") continue;
    const r = content.mapRegion[t] ?? -1;
    const polity = r >= 0 ? content.map.regionList[r]?.polity : null;
    if (!polity || polity === UNCLAIMED) continue;
    out[t] = index.get(polity) ?? -1;
  }
  landCache.set(content, out);
  return out;
}

export function stateIds(content: Content): string[] {
  return Object.keys(content.map.polities);
}

// The state whose land a hex is (sea, fog and unclaimed land: none).
export function stateAt(content: Content, tile: number): string | null {
  const i = statePerHex(content)[tile] ?? -1;
  return i >= 0 ? (stateIds(content)[i] ?? null) : null;
}

export function townPolity(content: Content, townId: string | null | undefined): string | null {
  const town = townId ? content.towns[townId] : undefined;
  const region = town?.region ? content.map.regionList.find((r) => r.id === town.region) : undefined;
  const polity = region?.polity ?? null;
  return polity && polity !== UNCLAIMED ? polity : null;
}

export function statePlayer(state: GameState, polityId: string): Player | undefined {
  return Object.values(state.players).find((p) => p.polityId === polityId);
}

function makeStatePlayer(state: GameState, content: Content, polityId: string, at: Ms): Player {
  const pol = content.map.polities[polityId]!;
  const cfg = content.world.npc.towns;
  const p: Player = {
    id: newId(state, "p"),
    name: pol.name,
    factionId: cfg.factionId,
    kind: "npc",
    createdAt: at,
    protectedUntil: 0,
    capitalId: null,
    villageIds: [],
    cultureBank: 0,
    offense: 0,
    defense: 0,
    looted: 0,
    hero: null,
    house: null,
    kingdomId: null,
    purse: 0,
    goods: {},
    goodsCarry: {},
    people: {},
    profile: null,
    crafts: [],
    altar: null,
    voyages: [],
    polityId,
    meta: {},
  };
  state.players[p.id] = p;
  return p;
}

// Hand every free city to its state (new worlds, and saves from before).
export function ensureStates(state: GameState, content: Content, at: Ms): void {
  for (const v of Object.values(state.villages).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))) {
    if (v.kind !== "town") continue;
    const owner = state.players[v.ownerId];
    if (!owner || owner.kind !== "npc" || owner.polityId) continue;
    const polity = townPolity(content, v.npc?.townId);
    if (!polity) continue;
    const sp = statePlayer(state, polity) ?? makeStatePlayer(state, content, polity, at);
    owner.villageIds = owner.villageIds.filter((id) => id !== v.id);
    sp.villageIds.push(v.id);
    v.ownerId = sp.id;
  }
}
