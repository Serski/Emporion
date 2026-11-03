import type { Content } from "../content/load.js";
import type { LandTerrain, LayoutDef, OasisTypeDef, TownDef } from "../content/schema.js";
import { hash01, weightedChoice } from "../core/rng.js";

// ---------------------------------------------------------------------------
// The square-tile world. Geography (sea, fog, plain, hills, mountain, region,
// towns) comes from content/map/tiles.json, derived from MASSALIA's world 2
// map. What stands on each land tile (a settleable valley with its field
// layout, an oasis, or wild land) is drawn from the world seed with a
// stateless hash, weighted by terrain — so any tile can be read on its own
// and every client derives the same map from the same seed.
//
// Coordinates: x grows east, y grows south, (0,0) is the north-west corner.
// Tiles are addressed by index = y · width + x. There is no wrap-around.
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
  town: TownDef | null;
  coastal: boolean;
}

const KIND_CODES: TileKind[] = ["water", "fog", "valley", "oasis", "wild", "town"];

interface TileCache {
  kind: Uint8Array; // index into KIND_CODES
  variant: Int16Array; // layout or oasis index, -1 otherwise
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
  return { kind, variant };
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

export function isLand(content: Content, tile: number): boolean {
  const t = content.map.terrain[tile];
  return t === "P" || t === "H" || t === "M";
}

export function isCoastal(content: Content, tile: number): boolean {
  if (!isLand(content, tile)) return false;
  const { x, y } = tileXY(content, tile);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!onMap(content, x + dx, y + dy)) continue;
      if (content.map.terrain[tileIndex(content, x + dx, y + dy)] === "S") return true;
    }
  return false;
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
    regionName: region?.name ?? null,
    polity: region?.polity ?? null,
    layout: tileLayout(content, seed, tile),
    oasis: tileOasis(content, seed, tile),
    town: content.townAtTile.get(tile) ?? null,
    coastal: isCoastal(content, tile),
  };
}

export function distance(content: Content, a: number, b: number): number {
  const pa = tileXY(content, a);
  const pb = tileXY(content, b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

// Share of the straight line between two tiles that crosses water or fog,
// sampled at half-tile steps. Marches keep straight lines (as on any tile
// map) but the sea legs cost seaTravelMultiplier.
export function waterShare(content: Content, a: number, b: number): number {
  const pa = tileXY(content, a);
  const pb = tileXY(content, b);
  const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  if (d === 0) return 0;
  const steps = Math.max(2, Math.ceil(d * 2));
  let wet = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(pa.x + (pb.x - pa.x) * t);
    const y = Math.round(pa.y + (pb.y - pa.y) * t);
    const terrain = content.map.terrain[tileIndex(content, x, y)];
    if (terrain === "S" || terrain === "L" || terrain === "F") wet++;
  }
  return wet / (steps + 1);
}

// Distance in "land fields": sea legs count seaTravelMultiplier times.
export function travelDistance(content: Content, a: number, b: number): number {
  const d = distance(content, a, b);
  const wet = waterShare(content, a, b);
  return d * (1 - wet) + d * wet * content.world.mapgen.seaTravelMultiplier;
}

// Tiles in rings around a centre, nearest first (ties broken by the hash so
// the order is stable for a seed). Used for placement searches.
export function tilesAround(content: Content, seed: number, center: number, maxRadius: number): number[] {
  const { x: cx, y: cy } = tileXY(content, center);
  const out: { tile: number; d: number }[] = [];
  const r = Math.ceil(maxRadius);
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!onMap(content, x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d > maxRadius) continue;
      const tile = tileIndex(content, x, y);
      out.push({ tile, d: d + hash01(seed, tile, 97) * 0.5 });
    }
  out.sort((p, q) => p.d - q.d);
  return out.map((p) => p.tile);
}
