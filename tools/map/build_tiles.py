#!/usr/bin/env python3
"""Derive the hexagon world grid from MASSALIA's hand-drawn world 2 map.

Inputs (committed copies under tools/map/sources/, taken from the MASSALIA repo's
apps/web/public/map2/): world2.json (175 region polygons + 105 towns, in a
3126 x 2696 pixel space), names2.json, politics2.json, townstats.json and
terrain2.webp (the hand-drawn terrain art).

Outputs:
  content/map/tiles.json          the grid the engine reads (terrain + region per hex, towns)
  apps/web/public/map/terrain.webp  the art, lossy, as the map's underlay
  tools/map/preview.png           a colour-coded check of the classification

The grid. Pointy-top hexagons in rows, every odd row shifted half a hex east
("odd-r" offset). Hex (x, y) is column x of row y. With HEX the hex's width in
source pixels (centre to centre along a row) and s = HEX / sqrt(3) the radius,
its centre is at ((x + 0.5 + 0.5 * (y odd)) * HEX, s + 1.5 * s * y). The client
draws the art in the same frame, so the hexes sit on the art they were read from.

Every hex's region is the majority region under a sample lattice inside it
(polygons rasterised largest-first, so islands and enclaves paint over the sea
and the regions around them). Land relief comes from the terrain art: the
hill-shading makes the luminance spread within a hex high in mountains and low
on plains, so land hexes are split by percentile into mountain / hills / plain
and smoothed with a majority filter over each hex and its six neighbours.

Deterministic: the same sources always give the same outputs.

Usage: python3 tools/map/build_tiles.py [--hex 17]
"""
from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "tools" / "map" / "sources"

# Share of land hexes (by luminance spread) classed as mountain and as hills.
MOUNTAIN_SHARE = 0.15
HILLS_SHARE = 0.25
# A land hex this blue (drawn lake) becomes inland water.
LAKE_SHARE = 0.55

SQRT3 = math.sqrt(3)

# Neighbour steps (dx, dy) for even and odd rows of an odd-r grid:
# east, north-east, north-west, west, south-west, south-east.
DIRS_EVEN = [(1, 0), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1)]
DIRS_ODD = [(1, 0), (1, -1), (0, -1), (-1, 0), (0, 1), (1, 1)]


def parse_path(d: str) -> list[list[tuple[float, float]]]:
    """SVG path with only M/L/Z commands -> list of closed rings."""
    rings: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for cmd, args in re.findall(r"([MLZ])([^MLZ]*)", d):
        if cmd == "M":
            if len(current) >= 3:
                rings.append(current)
            current = []
        if cmd in "ML":
            nums = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", args)]
            current.extend(zip(nums[0::2], nums[1::2]))
        if cmd == "Z":
            if len(current) >= 3:
                rings.append(current)
            current = []
    if len(current) >= 3:
        rings.append(current)
    return rings


def ring_area(ring: list[tuple[float, float]]) -> float:
    area = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        area += x1 * y2 - x2 * y1
    return abs(area) / 2


def rasterise(world: dict) -> np.ndarray:
    w, h = world["width"], world["height"]
    canvas = Image.new("I", (w, h), 0)
    draw = ImageDraw.Draw(canvas)
    rings = []
    for index, province in enumerate(world["provinces"]):
        for ring in parse_path(province["path"]):
            rings.append((ring_area(ring), index + 1, ring))
    # Largest first: enclosed regions (islands, enclaves) paint over their hosts.
    rings.sort(key=lambda r: -r[0])
    for _, label, ring in rings:
        draw.polygon(ring, fill=label)
    return np.array(canvas, dtype=np.int32) - 1  # -1 = unpainted


class Grid:
    def __init__(self, hex_w: float, src_w: int, src_h: int):
        self.hex = hex_w
        self.s = hex_w / SQRT3
        self.row = 1.5 * self.s
        self.w = math.ceil(src_w / hex_w)
        self.h = math.ceil((src_h - self.s) / self.row) + 1

    def centre(self, x: int, y: int) -> tuple[float, float]:
        return ((x + 0.5 + 0.5 * (y & 1)) * self.hex, self.s + self.row * y)

    def neighbours(self, x: int, y: int):
        for dx, dy in DIRS_ODD if y & 1 else DIRS_EVEN:
            xx, yy = x + dx, y + dy
            if 0 <= xx < self.w and 0 <= yy < self.h:
                yield xx, yy

    def corners(self, x: int, y: int, scale: float = 1.0) -> list[tuple[float, float]]:
        cx, cy = self.centre(x, y)
        out = []
        for i in range(6):
            a = math.radians(60 * i - 30)
            out.append(((cx + self.s * math.cos(a)) * scale, (cy + self.s * math.sin(a)) * scale))
        return out

    def at_pixel(self, px: float, py: float) -> tuple[int, int]:
        """The hex under a source pixel (cube rounding of the axial position)."""
        rx, ry = px - self.hex / 2, py - self.s
        q = (SQRT3 / 3 * rx - ry / 3) / self.s
        r = (2 / 3 * ry) / self.s
        cx, cz = q, r
        cy = -cx - cz
        rx_, ry_, rz_ = round(cx), round(cy), round(cz)
        dx, dy, dz = abs(rx_ - cx), abs(ry_ - cy), abs(rz_ - cz)
        if dx > dy and dx > dz:
            rx_ = -ry_ - rz_
        elif dy <= dz:
            rz_ = -rx_ - ry_
        row = int(rz_)
        col = int(rx_) + (row - (row & 1)) // 2
        return col, row

    def ring(self, x: int, y: int, radius: int):
        """Hexes at exactly `radius` steps from (x, y), on the grid."""
        if radius == 0:
            yield x, y
            return
        q0 = x - (y - (y & 1)) // 2
        r0 = y
        cube_dirs = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]
        q, r = q0 + cube_dirs[4][0] * radius, r0 + cube_dirs[4][1] * radius
        for side in range(6):
            for _ in range(radius):
                col, row = q + (r - (r & 1)) // 2, r
                if 0 <= col < self.w and 0 <= row < self.h:
                    yield col, row
                q, r = q + cube_dirs[side][0], r + cube_dirs[side][1]


def inside_hex(dx: float, dy: float, s: float) -> bool:
    """Is the offset (dx, dy) from a pointy-top hex's centre inside it?"""
    ax, ay = abs(dx), abs(dy)
    half_w = s * SQRT3 / 2
    if ax > half_w or ay > s:
        return False
    return ay <= s - ax / SQRT3


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hex", type=float, default=17.0, help="hex width in source pixels")
    args = parser.parse_args()

    world = json.loads((SOURCES / "world2.json").read_text())
    names = json.loads((SOURCES / "names2.json").read_text())["names"]
    politics = json.loads((SOURCES / "politics2.json").read_text())
    townstats = json.loads((SOURCES / "townstats.json").read_text())["towns"]
    art = Image.open(SOURCES / "terrain2.webp").convert("RGB")

    labels = rasterise(world)
    src_h, src_w = labels.shape
    grid = Grid(args.hex, src_w, src_h)
    gw, gh = grid.w, grid.h
    provinces = world["provinces"]
    rgb = np.asarray(art, dtype=np.float32)
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    # "Water blue" in this art: blue clearly above red.
    blue = (rgb[:, :, 2] - rgb[:, :, 0]) > 18

    # A lattice of sample points inside one hex, and a pixel mask of the hex.
    lattice = []
    for iy in range(9):
        for ix in range(9):
            dx = (ix - 4) / 4 * grid.hex / 2 * 0.92
            dy = (iy - 4) / 4 * grid.s * 0.92
            if inside_hex(dx, dy, grid.s):
                lattice.append((dx, dy))
    mask_w = math.ceil(grid.hex) + 1
    mask_h = math.ceil(2 * grid.s) + 1
    mask = np.zeros((mask_h, mask_w), dtype=bool)
    for my in range(mask_h):
        for mx in range(mask_w):
            mask[my, mx] = inside_hex(mx + 0.5 - mask_w / 2, my + 0.5 - mask_h / 2, grid.s)

    region = np.full((gh, gw), -1, dtype=np.int32)
    spread = np.zeros((gh, gw), dtype=np.float32)
    blueness = np.zeros((gh, gw), dtype=np.float32)
    outside = np.zeros((gh, gw), dtype=bool)
    for ty in range(gh):
        for tx in range(gw):
            cx, cy = grid.centre(tx, ty)
            if cx >= src_w or cy >= src_h:
                outside[ty, tx] = True
                continue
            votes = Counter()
            for dx, dy in lattice:
                px = min(src_w - 1, max(0, int(cx + dx)))
                py = min(src_h - 1, max(0, int(cy + dy)))
                votes[int(labels[py, px])] += 1
            region[ty, tx] = votes.most_common(1)[0][0]
            x0 = int(round(cx - mask_w / 2))
            y0 = int(round(cy - mask_h / 2))
            xs0, ys0 = max(0, x0), max(0, y0)
            xs1, ys1 = min(src_w, x0 + mask_w), min(src_h, y0 + mask_h)
            m = mask[ys0 - y0 : ys1 - y0, xs0 - x0 : xs1 - x0]
            patch = lum[ys0:ys1, xs0:xs1][m]
            spread[ty, tx] = float(patch.std()) if patch.size else 0.0
            bpatch = blue[ys0:ys1, xs0:xs1][m]
            blueness[ty, tx] = float(bpatch.mean()) if bpatch.size else 0.0

    kind = np.full((gh, gw), "F", dtype="<U1")
    land = np.zeros((gh, gw), dtype=bool)
    for ty in range(gh):
        for tx in range(gw):
            r = region[ty, tx]
            if outside[ty, tx] or r < 0:
                kind[ty, tx] = "F"
                continue
            t = provinces[r]["type"]
            if t == "sea":
                kind[ty, tx] = "S"
            elif t == "fog":
                kind[ty, tx] = "F"
            else:
                land[ty, tx] = True

    land_spread = spread[land]
    mountain_cut = float(np.quantile(land_spread, 1 - MOUNTAIN_SHARE))
    hills_cut = float(np.quantile(land_spread, 1 - MOUNTAIN_SHARE - HILLS_SHARE))
    for ty in range(gh):
        for tx in range(gw):
            if not land[ty, tx]:
                continue
            s = spread[ty, tx]
            kind[ty, tx] = "M" if s >= mountain_cut else "H" if s >= hills_cut else "P"

    # Majority over each land hex and its land neighbours: four of seven wins.
    smoothed = kind.copy()
    for ty in range(gh):
        for tx in range(gw):
            if not land[ty, tx]:
                continue
            window = [kind[ty, tx]] + [kind[yy, xx] for xx, yy in grid.neighbours(tx, ty) if land[yy, xx]]
            best, n = Counter(window).most_common(1)[0]
            if n >= 4 and best in "PHM":
                smoothed[ty, tx] = best
    kind = smoothed

    # A drawn lake is a very blue land hex with no sea around it; blue land
    # hexes on the coast are just where the art's shoreline and the region
    # polygons disagree, and stay land.
    lakes = 0
    for ty in range(gh):
        for tx in range(gw):
            if not land[ty, tx] or blueness[ty, tx] < LAKE_SHARE:
                continue
            if not any(kind[yy, xx] in "SF" for xx, yy in grid.neighbours(tx, ty)):
                kind[ty, tx] = "L"
                lakes += 1

    # Towns: the hex under the town, nudged to the nearest free land hex of the
    # same region when the coastline or a neighbour took it.
    region_of_town = {t: p["id"] for p in provinces for t in p["towns"]}
    index_of_region = {p["id"]: i for i, p in enumerate(provinces)}
    taken: set[tuple[int, int]] = set()
    towns = []
    for town in sorted(world["towns"], key=lambda t: t["id"]):
        rid = region_of_town.get(town["id"])
        tx, ty = grid.at_pixel(town["x"], town["y"])
        best = None
        for radius in range(0, 6):
            cands = []
            for xx, yy in grid.ring(tx, ty, radius):
                if kind[yy, xx] not in "PHM" or (xx, yy) in taken:
                    continue
                same = rid is not None and region[yy, xx] == index_of_region[rid]
                cx, cy = grid.centre(xx, yy)
                d = (cx - town["x"]) ** 2 + (cy - town["y"]) ** 2
                cands.append((0 if same else 1, d, xx, yy))
            if cands:
                cands.sort()
                best = cands[0]
                break
        if best is None:
            # An island smaller than a hex: the hex under the town becomes
            # land of the town's region so the town keeps its place.
            if rid is None or (tx, ty) in taken:
                raise SystemExit(f"no land hex for town {town['id']}")
            kind[ty, tx] = "P"
            land[ty, tx] = True
            region[ty, tx] = index_of_region[rid]
            best = (0, 0.0, tx, ty)
        _, _, bx, by = best
        taken.add((bx, by))
        stats = townstats.get(town["id"], {})
        towns.append(
            {
                "id": town["id"],
                "name": town["name"],
                "x": bx,
                "y": by,
                "region": rid,
                "population": stats.get("population", 1000),
                "walls": stats.get("walls", 1),
            }
        )

    # Region per hex, run-length encoded as [index, run, index, run, …].
    flat = region.flatten().tolist()
    rle: list[int] = []
    prev, run = flat[0], 0
    for v in flat:
        if v == prev:
            run += 1
        else:
            rle += [prev, run]
            prev, run = v, 1
    rle += [prev, run]

    owners = politics["owners"]
    region_list = [
        {
            "id": p["id"],
            "name": names.get(p["id"], ""),
            "type": p["type"],
            "polity": owners.get(p["id"]),
        }
        for p in provinces
    ]
    polities = {
        pid: {"name": pol["name"], "color": pol["color"], "culture": pol.get("culture")}
        for pid, pol in politics["polities"].items()
    }

    out = {
        "version": 2,
        "source": "derived from MASSALIA world 2 (world2.json, terrain2.webp) by tools/map/build_tiles.py; edit the sources, never this file",
        "grid": {"shape": "hex", "orientation": "pointy", "offset": "odd-r", "hexWidth": args.hex},
        "width": gw,
        "height": gh,
        "image": {"file": "map/terrain.webp", "width": src_w, "height": src_h},
        "terrain": "".join(kind.flatten().tolist()),
        "regions": rle,
        "regionList": region_list,
        "polities": polities,
        "towns": towns,
    }
    (ROOT / "content" / "map").mkdir(parents=True, exist_ok=True)
    (ROOT / "content" / "map" / "tiles.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")

    web = ROOT / "apps" / "web" / "public" / "map"
    web.mkdir(parents=True, exist_ok=True)
    art.save(web / "terrain.webp", "WEBP", quality=78, method=6)

    colours = {"S": (120, 170, 210), "F": (60, 60, 70), "P": (215, 200, 140), "H": (175, 145, 90), "M": (110, 85, 60), "L": (90, 140, 230)}
    scale = 6 / grid.hex
    preview = Image.new("RGB", (math.ceil((gw + 0.5) * 6), math.ceil((grid.s * 2 + grid.row * (gh - 1)) * scale)), (30, 30, 36))
    pd = ImageDraw.Draw(preview)
    for ty in range(gh):
        for tx in range(gw):
            pd.polygon(grid.corners(tx, ty, scale), fill=colours[kind[ty, tx]])
    for t in towns:
        pd.polygon(grid.corners(t["x"], t["y"], scale), fill=(200, 30, 30))
    preview.save(ROOT / "tools" / "map" / "preview.png")

    counts = Counter(out["terrain"])
    print(f"grid {gw} x {gh} = {gw * gh} hexes (hex = {args.hex}px wide)")
    print("terrain:", dict(sorted(counts.items())), f"lakes={lakes}")
    print(f"land hexes: {sum(counts[c] for c in 'PHM')}, towns placed: {len(towns)}")
    print(f"tiles.json {len(json.dumps(out, separators=(',', ':'))) // 1024} KB, terrain.webp {(web / 'terrain.webp').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
