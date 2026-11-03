import { useEffect, useMemo, useRef, useState } from "react";
import { tileIndex, tileKind, type GameState } from "@emporion/engine";
import { content } from "../content";
import { useNav } from "../nav";
import { factionColor, useSession } from "../ui";

// ---------------------------------------------------------------------------
// The world map: MASSALIA's hand-drawn terrain under a square-tile grid.
// Canvas, not DOM: thousands of tiles stay smooth while panning on a phone.
// The fog of the unknown world, oases, wild land, towns, camps and players
// are drawn from the engine's tile cache; marches show as lines with a dot
// where the column is right now.
// ---------------------------------------------------------------------------

const MIN_ZOOM = 3;
const MAX_ZOOM = 64;
const W = content.map.width;
const H = content.map.height;
const TS = content.map.tileSize;

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

const overlays = new Map<number, HTMLCanvasElement>();
// One pixel per tile: fog darkened, wild land lightly shaded, oases tinted.
function overlay(seed: number): HTMLCanvasElement {
  let c = overlays.get(seed);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const k = tileKind(content, seed, i);
    const o = i * 4;
    if (k === "fog") {
      img.data[o] = 14;
      img.data[o + 1] = 11;
      img.data[o + 2] = 9;
      img.data[o + 3] = 170;
    } else if (k === "wild") {
      img.data[o] = 60;
      img.data[o + 1] = 42;
      img.data[o + 2] = 24;
      img.data[o + 3] = 46;
    } else if (k === "oasis") {
      img.data[o] = 70;
      img.data[o + 1] = 150;
      img.data[o + 2] = 90;
      img.data[o + 3] = 70;
    }
  }
  ctx.putImageData(img, 0, 0);
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
    a.x += i % W;
    a.y += Math.floor(i / W);
    a.n++;
    acc.set(r, a);
  }
  return [...acc.entries()].filter(([, a]) => a.n >= 25).map(([r, a]) => ({ name: content.map.regionList[r]!.name, x: a.x / a.n + 0.5, y: a.y / a.n + 0.5, n: a.n }));
})();

function townPolityColor(townId: string | null): string {
  if (!townId) return "#b9a88a";
  const town = content.towns[townId];
  const region = town?.region ? content.map.regionList.find((r) => r.id === town.region) : undefined;
  return (region?.polity && content.map.polities[region.polity]?.color) || "#b9a88a";
}

interface ViewState {
  cx: number;
  cy: number;
  zoom: number;
}

function css(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function draw(ctx: CanvasRenderingContext2D, wpx: number, hpx: number, view: ViewState, state: GameState, me: string, selected: number | null, now: number) {
  const { cx, cy, zoom } = view;
  const x0 = cx - wpx / 2 / zoom;
  const y0 = cy - hpx / 2 / zoom;
  ctx.fillStyle = css("--sea-deep", "#22394a");
  ctx.fillRect(0, 0, wpx, hpx);
  const img = terrain();
  if (img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = zoom < TS;
    ctx.drawImage(img, x0 * TS, y0 * TS, (wpx / zoom) * TS, (hpx / zoom) * TS, 0, 0, wpx, hpx);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(overlay(state.settings.seed), x0, y0, wpx / zoom, hpx / zoom, 0, 0, wpx, hpx);

  const tx0 = Math.max(0, Math.floor(x0));
  const ty0 = Math.max(0, Math.floor(y0));
  const tx1 = Math.min(W - 1, Math.ceil(x0 + wpx / zoom));
  const ty1 = Math.min(H - 1, Math.ceil(y0 + hpx / zoom));
  const sx = (x: number) => (x - x0) * zoom;
  const sy = (y: number) => (y - y0) * zoom;

  if (zoom >= 12) {
    ctx.strokeStyle = "rgba(20, 14, 10, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = tx0; x <= tx1 + 1; x++) {
      ctx.moveTo(Math.round(sx(x)) + 0.5, 0);
      ctx.lineTo(Math.round(sx(x)) + 0.5, hpx);
    }
    for (let y = ty0; y <= ty1 + 1; y++) {
      ctx.moveTo(0, Math.round(sy(y)) + 0.5);
      ctx.lineTo(wpx, Math.round(sy(y)) + 0.5);
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

  const ink = css("--ink-map", "#1c120c");
  const mine = css("--accent", "#d6873f");
  const labels: { x: number; y: number; text: string; strong: boolean }[] = [];
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      const tile = y * W + x;
      const vid = state.occupancy[tile];
      const px = sx(x + 0.5);
      const py = sy(y + 0.5);
      const r = Math.max(2.5, zoom * 0.34);
      if (vid) {
        const v = state.villages[vid];
        if (!v) continue;
        const owner = state.players[v.ownerId];
        ctx.lineWidth = Math.max(1, zoom * 0.07);
        ctx.strokeStyle = ink;
        if (v.kind === "town") {
          ctx.fillStyle = townPolityColor(v.npc?.townId ?? null);
          ctx.beginPath();
          ctx.rect(px - r, py - r, r * 2, r * 2);
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
        if (zoom >= 26) labels.push({ x: px, y: py + r + 9, text: v.name, strong: v.ownerId === me });
      } else if (zoom >= 9) {
        const k = tileKind(content, state.settings.seed, tile);
        if (k === "oasis") {
          const o = state.oases[tile];
          ctx.fillStyle = o?.ownerVillageId ? (state.villages[o.ownerVillageId]?.ownerId === me ? mine : "#2f6b45") : "#3f8f5a";
          ctx.beginPath();
          ctx.arc(px, py, Math.max(2, zoom * 0.18), 0, Math.PI * 2);
          ctx.fill();
        } else if (k === "wild" && zoom >= 20) {
          ctx.strokeStyle = "rgba(50, 32, 18, 0.35)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          const q = zoom * 0.28;
          ctx.moveTo(px - q, py + q);
          ctx.lineTo(px, py - q);
          ctx.lineTo(px + q, py + q);
          ctx.stroke();
        }
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
    const ax = sx((m.fromTile % W) + 0.5);
    const ay = sy(Math.floor(m.fromTile / W) + 0.5);
    const bx = sx((m.toTile % W) + 0.5);
    const by = sy(Math.floor(m.toTile / W) + 0.5);
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
    const x = selected % W;
    const y = Math.floor(selected / W);
    ctx.strokeStyle = "#fff4dc";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx(x) + 1, sy(y) + 1, zoom - 2, zoom - 2);
  }
}

export function MapView() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [view, setView] = useState<ViewState>(() => {
    const f = nav.mapFocus;
    const fx = f !== null ? f % W : v.x;
    const fy = f !== null ? Math.floor(f / W) : v.y;
    return { cx: fx + 0.5, cy: fy + 0.5, zoom: 22 };
  });
  const [selected, setSelected] = useState<number | null>(nav.mapFocus);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
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
    setView((vw) => ({ ...vw, cx: (nav.mapFocus! % W) + 0.5, cy: Math.floor(nav.mapFocus! / W) + 0.5 }));
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

  const miniScale = 180 / W;
  useEffect(() => {
    const c = mini.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const img = terrain();
    ctx.fillStyle = "#22394a";
    ctx.fillRect(0, 0, c.width, c.height);
    if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, 0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(overlay(s.state.settings.seed), 0, 0, c.width, c.height);
    for (const id of s.player.villageIds) {
      const t = s.state.villages[id]!;
      ctx.fillStyle = "#ffd28a";
      ctx.fillRect(t.x * miniScale - 1.5, t.y * miniScale - 1.5, 3, 3);
    }
    ctx.strokeStyle = "#fff4dc";
    ctx.lineWidth = 1;
    ctx.strokeRect((view.cx - size.w / 2 / view.zoom) * miniScale, (view.cy - size.h / 2 / view.zoom) * miniScale, (size.w / view.zoom) * miniScale, (size.h / view.zoom) * miniScale);
  });

  const clampView = (vw: ViewState): ViewState => ({
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vw.zoom)),
    cx: Math.min(W, Math.max(0, vw.cx)),
    cy: Math.min(H, Math.max(0, vw.cy)),
  });

  const tileAt = (clientX: number, clientY: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    const x = Math.floor(view.cx + (clientX - rect.left - size.w / 2) / view.zoom);
    const y = Math.floor(view.cy + (clientY - rect.top - size.h / 2) / view.zoom);
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

  const legend = useMemo(
    () => [
      { cls: "lg-me", text: "Your towns" },
      { cls: "lg-player", text: "Other players (faction colour)" },
      { cls: "lg-city", text: "Free cities (polity colour)" },
      { cls: "lg-camp", text: "Outlaw camps" },
      { cls: "lg-oasis", text: "Oases" },
    ],
    [],
  );

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
            setHover(tileAt(e.clientX, e.clientY));
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
          aria-label="World map. Drag to move, scroll or pinch to zoom, click a tile for details."
          role="img"
        />
        <div className="map-hud map-hud--tl">
          <span className="map-coords">{hover ? `(${hover.x}|${hover.y})` : `(${Math.floor(view.cx)}|${Math.floor(view.cy)})`}</span>
        </div>
        <div className="map-hud map-hud--tr">
          <button className="icon-btn" onClick={() => zoomAround(1.4)} aria-label="Zoom in">
            +
          </button>
          <button className="icon-btn" onClick={() => zoomAround(1 / 1.4)} aria-label="Zoom out">
            −
          </button>
          <button className="icon-btn icon-btn--text" onClick={() => setView((vw) => ({ ...vw, cx: v.x + 0.5, cy: v.y + 0.5, zoom: Math.max(vw.zoom, 18) }))} aria-label={`Centre on ${v.name}`}>
            ⌂
          </button>
        </div>
        <canvas
          ref={mini}
          className="map-mini"
          width={Math.round(W * miniScale)}
          height={Math.round(H * miniScale)}
          onPointerDown={(e) => {
            const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
            setView((vw) => clampView({ ...vw, cx: (e.clientX - rect.left) / miniScale, cy: (e.clientY - rect.top) / miniScale }));
          }}
          aria-label="Overview map: click to jump"
          role="img"
        />
      </div>
      <div className="map-bar">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const m = goto.match(/(\d+)\s*[|,; ]\s*(\d+)/);
            if (!m) return;
            const x = Number(m[1]);
            const y = Number(m[2]);
            setView((vw) => clampView({ ...vw, cx: x + 0.5, cy: y + 0.5, zoom: Math.max(vw.zoom, 20) }));
            setSelected(tileIndex(content, Math.min(W - 1, x), Math.min(H - 1, y)));
          }}
        >
          <input id="map-goto" value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="Go to x|y" aria-label="Go to coordinates" />
          <button className="btn" type="submit">
            Go
          </button>
        </form>
        <ul className="legend">
          {legend.map((l) => (
            <li key={l.cls}>
              <span className={`legend__mark ${l.cls}`} aria-hidden />
              {l.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
