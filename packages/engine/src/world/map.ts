import type { Content } from "../content/load.js";
import type { DepositDef, LandTerrain, LayoutDef, OasisTypeDef, TownDef } from "../content/schema.js";
import { hash01, weightedChoice } from "../core/rng.js";

// ---------------------------------------------------------------------------
// The hexagon world. Geography (sea, fog, plain, hills, mountain, region,
// towns) comes from content/map/tiles.json, derived from MASSALIA's world 2
// map. What stands on each land hex (a settleable valley with its field
// layout, an oasis, or wild land) is drawn from the world seed with a
// stateless hash, weighted by terrain — so any hex can be read on its own
// and every client derives the same map from the same seed.
//
// The grid: pointy-top hexagons in rows, every odd row shifted half a hex
// east. Hex (x, y) is column x of row y, shown to players as (x|y); x grows
// east, y grows south, (0,0) is the north-west corner. Hexes (the engine
// calls them tiles) are addressed by index = y · width + x. One step to a
// neighbouring hex is one field, and distance counts steps. No wrap-around.
// ---------------------------------------------------------------------------

export type TileKind = "water" | "fog" | "valley" | "oasis" | "wild" | "town";

export interface TileInfo {
  tile: number;
  x: number;
  y: number;
  terrain: string; // S F L P H M
  kind: TileKind;
  regionId: string | null;
  regionName: string | null;
  polity: string | null;
  layout: LayoutDef | null;
  oasis: OasisTypeDef | null;
  deposit: DepositDef | null;
  town: TownDef | null;
  coastal: boolean;
}

const KIND_CODES: TileKind[] = ["water", "fog", "valley", "oasis", "wild", "town"];

interface TileCache {
  kind: Uint8Array; // index into KIND_CODES
  variant: Int16Array; // layout or oasis index, -1 otherwise
  deposit: Int8Array; // index into mapgen.deposits for a valley, -1 otherwise
}

const caches = new WeakMap<Content, Map<number, TileCache>>();

function buildCache(content: Content, seed: number): TileCache {
  const { map, world } = content;
  const n = map.width * map.height;
  const kind = new Uint8Array(n);
  const variant = new Int16Array(n).fill(-1);
  const layouts = world.mapgen.layouts;
  const oases = world.mapgen.oases;
  for (let i = 0; i < n; i++) {
    const t = map.terrain[i]!;
    if (t === "S" || t === "L") {
      kind[i] = 0;
      continue;
    }
    if (t === "F") {
      kind[i] = 1;
      continue;
    }
    if (content.townAtTile.has(i)) {
      kind[i] = 5;
      continue;
    }
    const land = t as LandTerrain;
    const weights = world.mapgen.terrain[land] ?? { valley: 1, oasis: 0, wild: 0 };
    const roll = hash01(seed, i, 11);
    const total = weights.valley + weights.oasis + weights.wild;
    const r = roll * total;
    if (r < weights.valley) {
      kind[i] = 2;
      const layout = weightedChoice(layouts, (l) => l.weight * (l.terrain?.[land] ?? 1), hash01(seed, i, 23));
      variant[i] = layout ? layouts.indexOf(layout) : 0;
    } else if (r < weights.valley + weights.oasis && oases.length > 0) {
      kind[i] = 3;
      const oasis = weightedChoice(oases, (o) => o.weight * (o.terrain?.[land] ?? 1), hash01(seed, i, 37));
      variant[i] = oasis ? oases.indexOf(oasis) : 0;
    } else {
      kind[i] = 4;
    }
  }
  return { kind, variant, deposit: depositsFor(content, seed, kind) };
}

// A valley may hold one deposit, drawn from the seed: each deposit's chance
// times its terrain weight, where its latitude, distance to the sea and states
// allow it.
function depositsFor(content: Content, seed: number, kind: Uint8Array): Int8Array {
  const { map } = content;
  const defs = content.world.mapgen.deposits;
  const n = map.width * map.height;
  const out = new Int8Array(n).fill(-1);
  if (defs.length === 0) return out;
  const reach = Math.max(0, ...defs.map((d) => d.seaWithin ?? 0));
  const toSea = reach > 0 ? seaDistances(content, reach) : null;
  for (let i = 0; i < n; i++) {
    if (kind[i] !== 2) continue;
    const land = map.terrain[i] as LandTerrain;
    const row = Math.floor(i / map.width) / map.height;
    const r = content.mapRegion[i] ?? -1;
    const polity = r >= 0 ? map.regionList[r]?.polity : undefined;
    let roll = hash01(seed, i, 41);
    for (let k = 0; k < defs.length; k++) {
      const d = defs[k]!;
      if (d.southOf !== undefined && row < d.southOf) continue;
      if (d.seaWithin !== undefined && (toSea![i]! < 0 || toSea![i]! > d.seaWithin)) continue;
      if (d.polities && (!polity || !d.polities.includes(polity))) continue;
      const p = d.chance * (d.terrain[land] ?? 0);
      if (roll < p) {
        out[i] = k;
        break;
      }
      roll -= p;
    }
  }
  return out;
}

// Steps from each hex to the nearest open sea, up to `reach` (-1 beyond it).
function seaDistances(content: Content, reach: number): Int16Array {
  const n = content.map.width * content.map.height;
  const dist = new Int16Array(n).fill(-1);
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) {
    if (content.map.terrain[i] !== "S") continue;
    dist[i] = 0;
    frontier.push(i);
  }
  for (let step = 1; step <= reach && frontier.length; step++) {
    const next: number[] = [];
    for (const t of frontier) {
      for (const nb of hexNeighbours(content, t)) {
        if (dist[nb] !== -1) continue;
        dist[nb] = step;
        next.push(nb);
      }
    }
    frontier = next;
  }
  return dist;
}

function cache(content: Content, seed: number): TileCache {
  let bySeed = caches.get(content);
  if (!bySeed) caches.set(content, (bySeed = new Map()));
  let c = bySeed.get(seed);
  if (!c) bySeed.set(seed, (c = buildCache(content, seed)));
  return c;
}

export function tileIndex(content: Content, x: number, y: number): number {
  return y * content.map.width + x;
}

export function tileXY(content: Content, tile: number): { x: number; y: number } {
  return { x: tile % content.map.width, y: Math.floor(tile / content.map.width) };
}

export function onMap(content: Content, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < content.map.width && y < content.map.height;
}

// --- hex geometry -------------------------------------------------------------

// Axial coordinates (q, r) make distances and lines simple; r is the row.
export function toAxial(x: number, y: number): { q: number; r: number } {
  return { q: x - (y - (y & 1)) / 2, r: y };
}

export function fromAxial(q: number, r: number): { x: number; y: number } {
  return { x: q + (r - (r & 1)) / 2, y: r };
}

// Steps between two hexes given as (x, y).
export function hexSteps(ax: number, ay: number, bx: number, by: number): number {
  const a = toAxial(ax, ay);
  const b = toAxial(bx, by);
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Neighbour offsets (dx, dy) for even and odd rows: east, north-east,
// north-west, west, south-west, south-east.
const DIRS_EVEN: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const DIRS_ODD: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 1],
];

// The hex next to (x, y) in direction dir (0 east, then anticlockwise), or
// null off the map.
export function hexNeighbour(content: Content, x: number, y: number, dir: number): number | null {
  const [dx, dy] = (y & 1 ? DIRS_ODD : DIRS_EVEN)[((dir % 6) + 6) % 6]!;
  const nx = x + dx;
  const ny = y + dy;
  return onMap(content, nx, ny) ? ny * content.map.width + nx : null;
}

export function hexNeighbours(content: Content, tile: number): number[] {
  const { x, y } = tileXY(content, tile);
  const out: number[] = [];
  for (let d = 0; d < 6; d++) {
    const n = hexNeighbour(content, x, y, d);
    if (n !== null) out.push(n);
  }
  return out;
}

// Calls fn for every hex on the map within `radius` steps of (x, y).
export function forEachHexWithin(content: Content, x: number, y: number, radius: number, fn: (tile: number, steps: number) => void): void {
  const R = Math.floor(radius + 1e-9);
  const { q, r } = toAxial(x, y);
  const W = content.map.width;
  for (let dq = -R; dq <= R; dq++) {
    const lo = Math.max(-R, -dq - R);
    const hi = Math.min(R, -dq + R);
    for (let dr = lo; dr <= hi; dr++) {
      const p = fromAxial(q + dq, r + dr);
      if (!onMap(content, p.x, p.y)) continue;
      fn(p.y * W + p.x, (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2);
    }
  }
}

export function hexesWithin(content: Content, center: number, radius: number): number[] {
  const { x, y } = tileXY(content, center);
  const out: number[] = [];
  forEachHexWithin(content, x, y, radius, (t) => out.push(t));
  return out;
}

export function hexRing(content: Content, center: number, radius: number): number[] {
  const { x, y } = tileXY(content, center);
  const out: number[] = [];
  forEachHexWithin(content, x, y, radius, (t, d) => {
    if (d === radius) out.push(t);
  });
  return out;
}

// The hexes a straight line from a to b passes through, a and b included.
// Off-map points (possible along the edge) come back as -1.
export function hexLine(content: Content, a: number, b: number): number[] {
  const pa = tileXY(content, a);
  const pb = tileXY(content, b);
  const n = hexSteps(pa.x, pa.y, pb.x, pb.y);
  if (n === 0) return [a];
  const A = toAxial(pa.x, pa.y);
  const B = toAxial(pb.x, pb.y);
  // A tiny nudge keeps the line off the exact edges between hexes.
  const aq = A.q + 1e-6;
  const ar = A.r + 2e-6;
  const bq = B.q + 1e-6;
  const br = B.r + 2e-6;
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const q = aq + (bq - aq) * t;
    const r = ar + (br - ar) * t;
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(s);
    const eq = Math.abs(rq - q);
    const er = Math.abs(rr - r);
    const es = Math.abs(rs - s);
    if (eq > er && eq > es) rq = -rr - rs;
    else if (er > es) rr = -rq - rs;
    const p = fromAxial(rq, rr);
    out.push(onMap(content, p.x, p.y) ? tileIndex(content, p.x, p.y) : -1);
  }
  return out;
}

// Where hex centres sit, in units of one hex width: rows are HEX_ROW apart and
// a hex reaches HEX_RADIUS above and below its centre. Clients draw with these.
export const HEX_ROW = Math.sqrt(3) / 2;
export const HEX_RADIUS = 1 / Math.sqrt(3);

export function hexCentre(x: number, y: number): { x: number; y: number } {
  return { x: x + 0.5 + 0.5 * (y & 1), y: HEX_RADIUS + y * HEX_ROW };
}

// The hex (x, y) under a point given in hex-width units (it may be off the map).
export function hexAtPoint(px: number, py: number): { x: number; y: number } {
  const rx = px - 0.5;
  const ry = py - HEX_RADIUS;
  const q = rx - ry / Math.sqrt(3);
  const r = (2 * ry) / Math.sqrt(3);
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const eq = Math.abs(rq - q);
  const er = Math.abs(rr - r);
  const es = Math.abs(rs - s);
  if (eq > er && eq > es) rq = -rr - rs;
  else if (er > es) rr = -rq - rs;
  // `|| 0` turns a rounded -0 into 0.
  return fromAxial(rq || 0, rr || 0);
}

export function tileKind(content: Content, seed: number, tile: number): TileKind {
  return KIND_CODES[cache(content, seed).kind[tile]!]!;
}

export function tileLayout(content: Content, seed: number, tile: number): LayoutDef | null {
  const c = cache(content, seed);
  if (c.kind[tile] !== 2) return null;
  return content.world.mapgen.layouts[c.variant[tile]!] ?? null;
}

export function tileOasis(content: Content, seed: number, tile: number): OasisTypeDef | null {
  const c = cache(content, seed);
  if (c.kind[tile] !== 3) return null;
  return content.world.mapgen.oases[c.variant[tile]!] ?? null;
}

export function tileDeposit(content: Content, seed: number, tile: number): DepositDef | null {
  const k = cache(content, seed).deposit[tile]!;
  return k >= 0 ? (content.world.mapgen.deposits[k] ?? null) : null;
}

export function isLand(content: Content, tile: number): boolean {
  const t = content.map.terrain[tile];
  return t === "P" || t === "H" || t === "M";
}

export function isCoastal(content: Content, tile: number): boolean {
  if (!isLand(content, tile)) return false;
  return hexNeighbours(content, tile).some((n) => content.map.terrain[n] === "S");
}

export function tileInfo(content: Content, seed: number, tile: number): TileInfo {
  const { x, y } = tileXY(content, tile);
  const regionIndex = content.mapRegion[tile] ?? -1;
  const region = regionIndex >= 0 ? content.map.regionList[regionIndex] : undefined;
  return {
    tile,
    x,
    y,
    terrain: content.map.terrain[tile] ?? "F",
    kind: tileKind(content, seed, tile),
    regionId: region?.id ?? null,
    regionName: region?.name || null,
    polity: region?.polity ?? null,
    layout: tileLayout(content, seed, tile),
    oasis: tileOasis(content, seed, tile),
    deposit: tileDeposit(content, seed, tile),
    town: content.townAtTile.get(tile) ?? null,
    coastal: isCoastal(content, tile),
  };
}

// Fields between two hexes: the number of steps from one to the other.
export function distance(content: Content, a: number, b: number): number {
  const pa = tileXY(content, a);
  const pb = tileXY(content, b);
  return hexSteps(pa.x, pa.y, pb.x, pb.y);
}

// Share of the hexes on the straight line between two hexes that are water or
// fog. Marches keep straight lines, but the sea legs cost seaTravelMultiplier.
export function waterShare(content: Content, a: number, b: number): number {
  if (a === b) return 0;
  const line = hexLine(content, a, b);
  let wet = 0;
  for (const t of line) {
    const terrain = t < 0 ? "F" : content.map.terrain[t];
    if (terrain === "S" || terrain === "L" || terrain === "F") wet++;
  }
  return wet / line.length;
}

// Distance in "land fields": sea legs count seaTravelMultiplier times.
export function travelDistance(content: Content, a: number, b: number): number {
  const d = distance(content, a, b);
  const wet = waterShare(content, a, b);
  return d * (1 - wet) + d * wet * content.world.mapgen.seaTravelMultiplier;
}

// Hexes in rings around a centre, nearest first (within a ring the order is
// shuffled by the hash, stable for a seed). Used for placement searches.
export function tilesAround(content: Content, seed: number, center: number, maxRadius: number): number[] {
  const { x, y } = tileXY(content, center);
  const out: { tile: number; d: number }[] = [];
  forEachHexWithin(content, x, y, maxRadius, (tile, d) => out.push({ tile, d: d + hash01(seed, tile, 97) * 0.5 }));
  out.sort((p, q) => p.d - q.d);
  return out.map((p) => p.tile);
}
