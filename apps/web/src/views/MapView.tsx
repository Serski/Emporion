import { useEffect, useRef, useState } from "react";
import {
  HEX_RADIUS,
  HEX_ROW,
  hexAtPoint,
  hexCentre,
  hexNeighbour,
  kingdomAtTile,
  territoryMap,
  tileDetails,
  tileIndex,
  tileKind,
  type GameState,
  type TileKind,
} from "@emporion/engine";
import { content } from "../content";
import { Icon } from "../icons";
import { useNav } from "../nav";
import { ResIcon, factionColor, useSession } from "../ui";

// ---------------------------------------------------------------------------
// The world map: MASSALIA's hand-drawn terrain under a grid of pointy-top
// hexagons, odd rows shifted half a hex east (the engine's grid). Canvas, not
// DOM: thousands of hexes stay smooth while panning on a phone.
//
// World units are hex widths: hex (x, y) has its centre at hexCentre(x, y)
// and the terrain art sits in the same frame at hexWidth art pixels per unit,
// so every hex lies on the art it was read from. The fog of the unknown world,
// wild land and oases are tinted per hex; towns' borders are washed in their
// owner's colour with an edge line; marches show as lines with a dot where
// the column is right now.
// ---------------------------------------------------------------------------

const MIN_ZOOM = 3;
const MAX_ZOOM = 64;
const W = content.map.width;
const H = content.map.height;
const HW = content.map.grid.hexWidth; // art pixels per hex width
const WORLD_W = W + 0.5;
const WORLD_H = 2 * HEX_RADIUS + (H - 1) * HEX_ROW;

// Corners of a pointy-top hex of width 1, clockwise from the upper right.
const CORNERS: [number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = ((60 * i - 30) * Math.PI) / 180;
  return [HEX_RADIUS * Math.cos(a), HEX_RADIUS * Math.sin(a)];
});
// The corners of the edge shared with the neighbour in direction d
// (0 east, 1 north-east, 2 north-west, 3 west, 4 south-west, 5 south-east).
const EDGE: [number, number][] = [
  [0, 1],
  [5, 0],
  [4, 5],
  [3, 4],
  [2, 3],
  [1, 2],
];

const colOf = (t: number) => t % W;
const rowOf = (t: number) => Math.floor(t / W);
const centreX = (t: number) => colOf(t) + 0.5 + 0.5 * (rowOf(t) & 1);
const centreY = (t: number) => HEX_RADIUS + rowOf(t) * HEX_ROW;
const neighbourOf = (t: number, d: number) => hexNeighbour(content, colOf(t), rowOf(t), d);

function addHex(ctx: CanvasRenderingContext2D, px: number, py: number, size: number) {
  ctx.moveTo(px + CORNERS[0]![0] * size, py + CORNERS[0]![1] * size);
  for (let i = 1; i < 6; i++) ctx.lineTo(px + CORNERS[i]![0] * size, py + CORNERS[i]![1] * size);
  ctx.closePath();
}

function addEdge(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, d: number) {
  const [a, b] = EDGE[d]!;
  ctx.moveTo(px + CORNERS[a]![0] * size, py + CORNERS[a]![1] * size);
  ctx.lineTo(px + CORNERS[b]![0] * size, py + CORNERS[b]![1] * size);
}

let terrainImage: HTMLImageElement | null = null;
const terrainListeners = new Set<() => void>();
function terrain(): HTMLImageElement {
  if (!terrainImage) {
    terrainImage = new Image();
    terrainImage.decoding = "async";
    terrainImage.onload = () => terrainListeners.forEach((f) => f());
    terrainImage.src = content.map.image.file;
  }
  return terrainImage;
}

// Tints per hex: the unknown world darkened, wild land shaded, oases green.
// Each kind is filled as one path, so neighbouring hexes show no seams.
const TINTS: [TileKind, string][] = [
  ["fog", "rgba(14, 11, 9, 0.67)"],
  ["wild", "rgba(60, 42, 24, 0.18)"],
  ["oasis", "rgba(70, 150, 90, 0.28)"],
];
const OVERLAY_K = 8; // pixels per hex width in the pre-drawn overlay
const overlays = new Map<number, HTMLCanvasElement>();
function overlay(seed: number): HTMLCanvasElement {
  let c = overlays.get(seed);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = Math.ceil(WORLD_W * OVERLAY_K);
  c.height = Math.ceil(WORLD_H * OVERLAY_K);
  const ctx = c.getContext("2d")!;
  for (const [kind, fill] of TINTS) {
    ctx.beginPath();
    for (let t = 0; t < W * H; t++) if (tileKind(content, seed, t) === kind) addHex(ctx, centreX(t) * OVERLAY_K, centreY(t) * OVERLAY_K, OVERLAY_K);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  overlays.set(seed, c);
  return c;
}

const regionCentroids = (() => {
  const acc = new Map<number, { x: number; y: number; n: number }>();
  for (let i = 0; i < W * H; i++) {
    const r = content.mapRegion[i]!;
    if (r < 0) continue;
    const t = content.map.terrain[i];
    if (t !== "P" && t !== "H" && t !== "M") continue;
    const a = acc.get(r) ?? { x: 0, y: 0, n: 0 };
    a.x += centreX(i);
    a.y += centreY(i);
    a.n++;
    acc.set(r, a);
  }
  return [...acc.entries()].filter(([, a]) => a.n >= 25).map(([r, a]) => ({ name: content.map.regionList[r]!.name, x: a.x / a.n, y: a.y / a.n, n: a.n }));
})();

function townPolityColor(townId: string | null): string {
  if (!townId) return "#b9a88a";
  const town = content.towns[townId];
  const region = town?.region ? content.map.regionList.find((r) => r.id === town.region) : undefined;
  return (region?.polity && content.map.polities[region.polity]?.color) || "#b9a88a";
}

// Each town's claim: a light wash of its owner's colour, and its border drawn
// just inside its own hexes, so two neighbours' borders show side by side.
// Kingdom frontiers run over them as a gold line.
function claimColor(state: GameState, me: string, villageId: string): string | null {
  const v = state.villages[villageId];
  if (!v || v.kind === "camp") return null;
  if (v.kind === "town") return townPolityColor(v.npc?.townId ?? null);
  if (v.ownerId === me) return "#e8b04a";
  return factionColor(state.players[v.ownerId]?.factionId ?? "");
}

type Claims = ReturnType<typeof territoryMap>;
const claimGroups = new WeakMap<Claims, Map<number, number[]>>();
function claimedByOwner(t: Claims): Map<number, number[]> {
  let g = claimGroups.get(t);
  if (g) return g;
  g = new Map();
  for (let i = 0; i < t.owner.length; i++) {
    const o = t.owner[i]!;
    if (o < 0) continue;
    let list = g.get(o);
    if (!list) g.set(o, (list = []));
    list.push(i);
  }
  claimGroups.set(t, g);
  return g;
}

interface Frame {
  wpx: number;
  hpx: number;
  zoom: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  sx: (x: number) => number;
  sy: (y: number) => number;
  visible: number[]; // hexes in view, row by row
}

const inView = (f: Frame, t: number) => {
  const x = centreX(t);
  const y = centreY(t);
  return x > f.x0 - 1 && x < f.x1 + 1 && y > f.y0 - 1 && y < f.y1 + 1;
};

function drawTerritories(ctx: CanvasRenderingContext2D, f: Frame, state: GameState, me: string) {
  const t = territoryMap(state, content);
  const groups = claimedByOwner(t);
  const { zoom, sx, sy } = f;
  const lw = zoom >= 14 ? 2 : 1.25;
  const inset = lw / 2 + (zoom >= 14 ? 1 : 0);
  const shrink = Math.max(0.7, 1 - inset / (zoom * HEX_RADIUS));
  ctx.save();
  for (const [idx, tiles] of groups) {
    const id = t.ids[idx]!;
    const color = claimColor(state, me, id);
    if (!color) continue;
    const shown = tiles.filter((x) => inView(f, x));
    if (shown.length === 0) continue;
    const mineHere = state.villages[id]?.ownerId === me;
    ctx.globalAlpha = mineHere ? 0.22 : 0.16;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const x of shown) addHex(ctx, sx(centreX(x)), sy(centreY(x)), zoom);
    ctx.fill();
    ctx.beginPath();
    for (const x of shown) {
      const px = sx(centreX(x));
      const py = sy(centreY(x));
      for (let d = 0; d < 6; d++) {
        const n = neighbourOf(x, d);
        if (n === null || t.owner[n] !== idx) addEdge(ctx, px, py, zoom * shrink, d);
      }
    }
    // Your own borders get a dark edge under the gold, so they stand apart
    // from Greek cities and Hellene rivals, whose colours are close to it.
    if (mineHere) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#1c120c";
      ctx.lineWidth = lw + 2.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = mineHere ? "#ffd58a" : color;
    ctx.lineWidth = mineHere ? lw + 0.5 : lw;
    ctx.stroke();
  }
  if (Object.keys(state.kingdoms).length > 0 && zoom >= 8) {
    const kAt = new Map<number, string | null>();
    const k = (tile: number) => {
      if (!kAt.has(tile)) kAt.set(tile, kingdomAtTile(state, content, tile));
      return kAt.get(tile) ?? null;
    };
    ctx.strokeStyle = "#f2d16b";
    ctx.lineWidth = zoom >= 14 ? 3 : 2;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    for (const x of f.visible) {
      const here = k(x);
      for (const d of [0, 4, 5]) {
        const n = neighbourOf(x, d);
        if (n !== null && k(n) !== here) addEdge(ctx, sx(centreX(x)), sy(centreY(x)), zoom, d);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

interface ViewState {
  cx: number;
  cy: number;
  zoom: number;
}

function frameFor(wpx: number, hpx: number, view: ViewState): Frame {
  const { cx, cy, zoom } = view;
  const x0 = cx - wpx / 2 / zoom;
  const y0 = cy - hpx / 2 / zoom;
  const x1 = x0 + wpx / zoom;
  const y1 = y0 + hpx / zoom;
  const ty0 = Math.max(0, Math.floor((y0 - 2 * HEX_RADIUS) / HEX_ROW));
  const ty1 = Math.min(H - 1, Math.ceil(y1 / HEX_ROW));
  const tx0 = Math.max(0, Math.floor(x0 - 1));
  const tx1 = Math.min(W - 1, Math.ceil(x1));
  const visible: number[] = [];
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) visible.push(y * W + x);
  return { wpx, hpx, zoom, x0, y0, x1, y1, sx: (x) => (x - x0) * zoom, sy: (y) => (y - y0) * zoom, visible };
}

function draw(ctx: CanvasRenderingContext2D, wpx: number, hpx: number, view: ViewState, state: GameState, me: string, selected: number | null, now: number) {
  const f = frameFor(wpx, hpx, view);
  const { zoom, x0, y0, sx, sy } = f;
  const seed = state.settings.seed;
  ctx.fillStyle = "#22394a";
  ctx.fillRect(0, 0, wpx, hpx);
  const img = terrain();
  if (img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = zoom < HW;
    ctx.drawImage(img, x0 * HW, y0 * HW, (wpx / zoom) * HW, (hpx / zoom) * HW, 0, 0, wpx, hpx);
  }

  // Tints: the pre-drawn overlay when zoomed out, crisp hexes when zoomed in.
  if (zoom < 16) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(overlay(seed), x0 * OVERLAY_K, y0 * OVERLAY_K, (wpx / zoom) * OVERLAY_K, (hpx / zoom) * OVERLAY_K, 0, 0, wpx, hpx);
  } else {
    for (const [kind, fill] of TINTS) {
      ctx.beginPath();
      for (const t of f.visible) if (tileKind(content, seed, t) === kind) addHex(ctx, sx(centreX(t)), sy(centreY(t)), zoom);
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }

  drawTerritories(ctx, f, state, me);

  if (zoom >= 12) {
    ctx.strokeStyle = "rgba(20, 14, 10, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const t of f.visible) {
      const px = sx(centreX(t));
      const py = sy(centreY(t));
      addEdge(ctx, px, py, zoom, 0);
      addEdge(ctx, px, py, zoom, 1);
      addEdge(ctx, px, py, zoom, 5);
      if (colOf(t) === 0) {
        addEdge(ctx, px, py, zoom, 3);
        addEdge(ctx, px, py, zoom, 2);
        addEdge(ctx, px, py, zoom, 4);
      }
    }
    ctx.stroke();
  }

  if (zoom <= 10) {
    ctx.font = `600 ${zoom <= 5 ? 10 : 12}px "Cinzel", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const r of regionCentroids) {
      if (zoom <= 5 && r.n < 120) continue;
      const px = sx(r.x);
      const py = sy(r.y);
      if (px < -80 || py < -20 || px > wpx + 80 || py > hpx + 20) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(240, 228, 200, 0.65)";
      ctx.strokeText(r.name.toUpperCase(), px, py);
      ctx.fillStyle = "rgba(60, 38, 22, 0.85)";
      ctx.fillText(r.name.toUpperCase(), px, py);
    }
  }

  const ink = "#1c120c";
  const mine = "#d6873f";
  const labels: { x: number; y: number; text: string; strong: boolean }[] = [];
  for (const tile of f.visible) {
    const vid = state.occupancy[tile];
    const px = sx(centreX(tile));
    const py = sy(centreY(tile));
    const r = Math.max(2.5, zoom * 0.3);
    if (vid) {
      const v = state.villages[vid];
      if (!v) continue;
      const owner = state.players[v.ownerId];
      ctx.lineWidth = Math.max(1, zoom * 0.07);
      ctx.strokeStyle = ink;
      if (v.kind === "town") {
        // A free city: a small hexagon in its polity's colour.
        ctx.fillStyle = townPolityColor(v.npc?.townId ?? null);
        ctx.beginPath();
        addHex(ctx, px, py, Math.max(5, zoom * 0.62));
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,245,225,0.9)";
        ctx.beginPath();
        ctx.arc(px, py, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
      } else if (v.kind === "camp") {
        ctx.fillStyle = "#7a1f1c";
        ctx.beginPath();
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r, py);
        ctx.lineTo(px, py + r);
        ctx.lineTo(px - r, py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = v.ownerId === me ? mine : factionColor(owner?.factionId ?? "");
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (v.ownerId === me) {
          ctx.strokeStyle = "rgba(255, 244, 220, 0.95)";
          ctx.lineWidth = Math.max(1.5, zoom * 0.09);
          ctx.beginPath();
          ctx.arc(px, py, r + Math.max(2, zoom * 0.1), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (zoom >= 26) labels.push({ x: px, y: py + r + 10, text: v.name, strong: v.ownerId === me });
    } else if (zoom >= 9) {
      const k = tileKind(content, seed, tile);
      if (k === "oasis") {
        const o = state.oases[tile];
        ctx.fillStyle = o?.ownerVillageId ? (state.villages[o.ownerVillageId]?.ownerId === me ? mine : "#2f6b45") : "#3f8f5a";
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, zoom * 0.16), 0, Math.PI * 2);
        ctx.fill();
      } else if (k === "wild" && zoom >= 20) {
        ctx.strokeStyle = "rgba(50, 32, 18, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const q = zoom * 0.24;
        ctx.moveTo(px - q, py + q);
        ctx.lineTo(px, py - q);
        ctx.lineTo(px + q, py + q);
        ctx.stroke();
      }
    }
  }

  // Marches the player can see: their own, and those heading for their towns.
  const ownTiles = new Set<number>();
  for (const id of state.players[me]?.villageIds ?? []) {
    const v = state.villages[id];
    if (v) ownTiles.add(tileIndex(content, v.x, v.y));
  }
  for (const m of Object.values(state.movements)) {
    const own = m.ownerId === me;
    if (!own && !ownTiles.has(m.toTile)) continue;
    const hostile = !own && (m.kind === "attack" || m.kind === "raid" || m.kind === "scout");
    const ax = sx(centreX(m.fromTile));
    const ay = sy(centreY(m.fromTile));
    const bx = sx(centreX(m.toTile));
    const by = sy(centreY(m.toTile));
    const t = Math.min(1, Math.max(0, (now - m.departAt) / Math.max(1, m.arriveAt - m.departAt)));
    ctx.strokeStyle = hostile ? "rgba(200, 50, 50, 0.85)" : m.kind === "return" || m.kind === "tradeReturn" ? "rgba(120, 160, 90, 0.8)" : "rgba(255, 235, 200, 0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hostile ? "#c83232" : "#fff4dc";
    ctx.beginPath();
    ctx.arc(ax + (bx - ax) * t, ay + (by - ay) * t, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (labels.length) {
    ctx.font = `600 12px "Spectral", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const l of labels) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(20, 14, 10, 0.75)";
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillStyle = l.strong ? "#ffd9a8" : "#f3e6cc";
      ctx.fillText(l.text, l.x, l.y);
    }
  }

  if (selected !== null) {
    ctx.strokeStyle = "#fff4dc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    addHex(ctx, sx(centreX(selected)), sy(centreY(selected)), zoom * 0.9);
    ctx.stroke();
  }
}

const focusOn = (tile: number) => ({ cx: centreX(tile), cy: centreY(tile) });

export function MapView() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [view, setView] = useState<ViewState>(() => ({ ...focusOn(nav.mapFocus ?? tileIndex(content, v.x, v.y)), zoom: 22 }));
  const [selected, setSelected] = useState<number | null>(nav.mapFocus);
  const [hover, setHover] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [, setLoaded] = useState(0);
  const [goto, setGoto] = useState("");
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; zoom: number } | null>(null);

  useEffect(() => {
    const f = () => setLoaded((n) => n + 1);
    terrainListeners.add(f);
    terrain();
    return () => {
      terrainListeners.delete(f);
    };
  }, []);

  useEffect(() => {
    if (nav.mapFocus === null) return;
    setView((vw) => ({ ...vw, ...focusOn(nav.mapFocus!) }));
    setSelected(nav.mapFocus);
  }, [nav.mapFocus]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const now = s.now();
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, size.w, size.h, view, s.state, s.active, selected, now);
  });

  const miniScale = 180 / WORLD_W;
  useEffect(() => {
    const c = mini.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const img = terrain();
    ctx.fillStyle = "#22394a";
    ctx.fillRect(0, 0, c.width, c.height);
    if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, 0, 0, (img.naturalWidth / HW) * miniScale, (img.naturalHeight / HW) * miniScale);
    const ov = overlay(s.state.settings.seed);
    ctx.drawImage(ov, 0, 0, (ov.width / OVERLAY_K) * miniScale, (ov.height / OVERLAY_K) * miniScale);
    for (const id of s.player.villageIds) {
      const t = s.state.villages[id]!;
      const p = hexCentre(t.x, t.y);
      ctx.fillStyle = "#ffd28a";
      ctx.fillRect(p.x * miniScale - 1.5, p.y * miniScale - 1.5, 3, 3);
    }
    ctx.strokeStyle = "#fff4dc";
    ctx.lineWidth = 1;
    ctx.strokeRect((view.cx - size.w / 2 / view.zoom) * miniScale, (view.cy - size.h / 2 / view.zoom) * miniScale, (size.w / view.zoom) * miniScale, (size.h / view.zoom) * miniScale);
  });

  const clampView = (vw: ViewState): ViewState => ({
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vw.zoom)),
    cx: Math.min(WORLD_W, Math.max(0, vw.cx)),
    cy: Math.min(WORLD_H, Math.max(0, vw.cy)),
  });

  const tileAt = (clientX: number, clientY: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    const wx = view.cx + (clientX - rect.left - size.w / 2) / view.zoom;
    const wy = view.cy + (clientY - rect.top - size.h / 2) / view.zoom;
    const { x, y } = hexAtPoint(wx, wy);
    return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
  };

  const zoomAround = (factor: number, clientX?: number, clientY?: number) => {
    setView((vw) => {
      const rect = canvas.current!.getBoundingClientRect();
      const ox = clientX !== undefined ? clientX - rect.left - size.w / 2 : 0;
      const oy = clientY !== undefined ? clientY - rect.top - size.h / 2 : 0;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vw.zoom * factor));
      const wx = vw.cx + ox / vw.zoom;
      const wy = vw.cy + oy / vw.zoom;
      return clampView({ zoom, cx: wx - ox / zoom, cy: wy - oy / zoom });
    });
  };

  // Wheel zoom needs a non-passive listener so the page does not scroll too.
  const zoomRef = useRef(zoomAround);
  zoomRef.current = zoomAround;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const hoverInfo = (() => {
    if (!hover) return null;
    const d = tileDetails(s.state, content, tileIndex(content, hover.x, hover.y));
    const claim = d.territory && d.territory.villageId !== d.village?.id ? `Territory of ${d.territory.villageName}` : null;
    if (d.village) {
      const label = d.village.kind === "town" ? "Free city" : d.village.kind === "camp" ? d.village.label : `${d.village.ownerName}${d.village.isCapital ? " · capital" : ""}`;
      return { title: d.village.name, sub: `${label} · ${d.village.population} people`, layout: null };
    }
    if (d.info.oasis) return { title: d.info.oasis.name, sub: d.oasis?.ownerVillageName ? `Held by ${d.oasis.ownerVillageName}` : (claim ?? "Unclaimed oasis"), layout: null };
    if (d.info.kind === "valley") return { title: "Free valley", sub: [d.info.regionName, claim].filter(Boolean).join(" · ") || null, layout: d.info.layout?.fields ?? null };
    const names: Record<string, string> = { water: "Open water", fog: "Beyond the known world", wild: "Wild land", town: "City" };
    return { title: names[d.info.kind] ?? "Land", sub: [d.info.regionName, claim].filter(Boolean).join(" · ") || null, layout: null };
  })();

  return (
    <div className="map-view">
      <div className="map-canvas" ref={wrap}>
        <canvas
          ref={canvas}
          style={{ width: size.w, height: size.h }}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2) {
              const [a, b] = [...pointers.current.values()];
              pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: view.zoom };
              drag.current = null;
            } else drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
          }}
          onPointerMove={(e) => {
            if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch.current && pointers.current.size === 2) {
              const [a, b] = [...pointers.current.values()];
              const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
              const zoom = pinch.current.zoom * (d / pinch.current.d);
              setView((vw) => clampView({ ...vw, zoom }));
              return;
            }
            const dr = drag.current;
            if (dr) {
              const dx = e.clientX - dr.x;
              const dy = e.clientY - dr.y;
              if (Math.abs(dx) + Math.abs(dy) > 4) dr.moved = true;
              if (dr.moved) setView((vw) => clampView({ ...vw, cx: dr.cx - dx / vw.zoom, cy: dr.cy - dy / vw.zoom }));
            }
            const t = tileAt(e.clientX, e.clientY);
            const rect = wrap.current!.getBoundingClientRect();
            setHover(t && e.pointerType === "mouse" ? { ...t, px: e.clientX - rect.left, py: e.clientY - rect.top } : null);
          }}
          onPointerUp={(e) => {
            pointers.current.delete(e.pointerId);
            if (pointers.current.size < 2) pinch.current = null;
            const dr = drag.current;
            drag.current = null;
            if (dr && !dr.moved) {
              const t = tileAt(e.clientX, e.clientY);
              if (t) {
                const tile = tileIndex(content, t.x, t.y);
                setSelected(tile);
                nav.open({ kind: "tile", tile });
              }
            }
          }}
          onPointerLeave={() => setHover(null)}
          aria-label="World map. Drag to move, scroll or pinch to zoom, click a hex for details."
          role="img"
        />
        {hover && hoverInfo && (
          <div className="map-tip" style={{ left: hover.px + 18, top: hover.py + 14 }} role="tooltip">
            <div className="map-tip__head">
              <span className="map-tip__xy">
                ({hover.x}|{hover.y})
              </span>
              <span className="map-tip__name">{hoverInfo.title}</span>
            </div>
            {hoverInfo.sub && <div className="map-tip__sub">{hoverInfo.sub}</div>}
            {hoverInfo.layout && (
              <div className="map-tip__layout">
                {content.resourceIds.map((r) => (
                  <span key={r}>
                    <ResIcon id={r} size={16} />
                    {hoverInfo.layout![r] ?? 0}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="map-controls">
          <canvas
            ref={mini}
            className="map-mini"
            width={Math.round(WORLD_W * miniScale)}
            height={Math.round(WORLD_H * miniScale)}
            onPointerDown={(e) => {
              const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
              const k = rect.width / (WORLD_W * miniScale);
              setView((vw) => clampView({ ...vw, cx: (e.clientX - rect.left) / k / miniScale, cy: (e.clientY - rect.top) / k / miniScale }));
            }}
            aria-label="Overview map: click to jump"
            role="img"
          />
          <div className="map-controls__col">
            <button className="sq-btn" onClick={() => zoomAround(1.4)} aria-label="Zoom in">
              <Icon name="plus" size={18} />
            </button>
            <button className="sq-btn" onClick={() => zoomAround(1 / 1.4)} aria-label="Zoom out">
              <Icon name="minus" size={18} />
            </button>
            <button className="sq-btn" onClick={() => setView((vw) => ({ ...vw, ...focusOn(tileIndex(content, v.x, v.y)), zoom: Math.max(vw.zoom, 18) }))} aria-label={`Centre on ${v.name}`}>
              <Icon name="home" size={18} />
            </button>
          </div>
          <form
            className="map-goto"
            onSubmit={(e) => {
              e.preventDefault();
              const m = goto.match(/(\d+)\s*[|,; ]\s*(\d+)/);
              if (!m) return;
              const x = Math.min(W - 1, Number(m[1]));
              const y = Math.min(H - 1, Number(m[2]));
              const tile = tileIndex(content, x, y);
              setView((vw) => clampView({ ...vw, ...focusOn(tile), zoom: Math.max(vw.zoom, 20) }));
              setSelected(tile);
            }}
          >
            <input id="map-goto" value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="x|y" aria-label="Go to coordinates" />
            <button className="sq-btn" type="submit" aria-label="Go">
              <Icon name="right" size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
