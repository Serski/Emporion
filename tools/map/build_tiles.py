#!/usr/bin/env python3
"""Derive the square-tile world grid from MASSALIA's hand-drawn world 2 map.

Inputs (committed copies under tools/map/sources/, taken from the MASSALIA repo's
apps/web/public/map2/): world2.json (175 region polygons + 105 towns, in a
3126 x 2696 pixel space), names2.json, politics2.json, townstats.json and
terrain2.webp (the hand-drawn terrain art).

Outputs:
  content/map/tiles.json          the grid the engine reads (terrain + region per tile, towns)
  apps/web/public/map/terrain.webp  the art, lossy, as the map's underlay
  tools/map/preview.png           a colour-coded check of the classification

Every tile is TILE x TILE source pixels. Its region is the majority region under
a 5x5 sample lattice (polygons rasterised largest-first, so islands and enclaves
paint over the sea and the regions around them). Land relief comes from the
terrain art: the hill-shading makes the luminance spread within a tile high in
mountains and low on plains, so the land tiles are split by percentile into
mountain / hills / plain and smoothed with a 3x3 majority filter.

Deterministic: the same sources always give the same outputs.

Usage: python3 tools/map/build_tiles.py [--tile 20]
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "tools" / "map" / "sources"

# Share of land tiles (by luminance spread) classed as mountain and as hills.
MOUNTAIN_SHARE = 0.15
HILLS_SHARE = 0.25
# A land tile this blue (drawn lake) becomes inland water.
LAKE_SHARE = 0.55

TERRAIN = {"sea": "S", "fog": "F", "plain": "P", "hills": "H", "mountain": "M", "lake": "L"}


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


def majority_filter(grid: np.ndarray, mask: np.ndarray, values: list[str]) -> np.ndarray:
    out = grid.copy()
    hgt, wid = grid.shape
    for y in range(hgt):
        for x in range(wid):
            if not mask[y, x]:
                continue
            window = [
                grid[yy, xx]
                for yy in range(max(0, y - 1), min(hgt, y + 2))
                for xx in range(max(0, x - 1), min(wid, x + 2))
                if mask[yy, xx]
            ]
            counts = Counter(window)
            best, n = counts.most_common(1)[0]
            if n >= 5 and best in values:
                out[y, x] = best
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tile", type=int, default=16, help="source pixels per tile")
    args = parser.parse_args()
    tile = args.tile

    world = json.loads((SOURCES / "world2.json").read_text())
    names = json.loads((SOURCES / "names2.json").read_text())["names"]
    politics = json.loads((SOURCES / "politics2.json").read_text())
    townstats = json.loads((SOURCES / "townstats.json").read_text())["towns"]
    art = Image.open(SOURCES / "terrain2.webp").convert("RGB")

    labels = rasterise(world)
    src_h, src_w = labels.shape
    gw, gh = -(-src_w // tile), -(-src_h // tile)
    provinces = world["provinces"]
    rgb = np.asarray(art, dtype=np.float32)
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    # "Water blue" in this art: blue clearly above red.
    blue = (rgb[:, :, 2] - rgb[:, :, 0]) > 18

    region = np.full((gh, gw), -1, dtype=np.int32)
    spread = np.zeros((gh, gw), dtype=np.float32)
    blueness = np.zeros((gh, gw), dtype=np.float32)
    offsets = [(i + 0.5) / 5 for i in range(5)]
    for ty in range(gh):
        for tx in range(gw):
            x0, y0 = tx * tile, ty * tile
            x1, y1 = min(src_w, x0 + tile), min(src_h, y0 + tile)
            votes = Counter()
            for oy in offsets:
                for ox in offsets:
                    px = min(src_w - 1, int(x0 + ox * (x1 - x0)))
                    py = min(src_h - 1, int(y0 + oy * (y1 - y0)))
                    votes[int(labels[py, px])] += 1
            best = votes.most_common(1)[0][0]
            region[ty, tx] = best
            spread[ty, tx] = float(lum[y0:y1, x0:x1].std())
            blueness[ty, tx] = float(blue[y0:y1, x0:x1].mean())

    kind = np.full((gh, gw), "F", dtype="<U1")
    land = np.zeros((gh, gw), dtype=bool)
    for ty in range(gh):
        for tx in range(gw):
            r = region[ty, tx]
            if r < 0:
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
    kind = majority_filter(kind, land, ["P", "H", "M"])
    # A drawn lake is a very blue land tile with no sea around it; blue land
    # tiles on the coast are just where the art's shoreline and the region
    # polygons disagree, and stay land.
    lakes = 0
    for ty in range(gh):
        for tx in range(gw):
            if not land[ty, tx] or blueness[ty, tx] < LAKE_SHARE:
                continue
            near_sea = any(
                kind[yy, xx] in "SF"
                for yy in range(max(0, ty - 1), min(gh, ty + 2))
                for xx in range(max(0, tx - 1), min(gw, tx + 2))
            )
            if not near_sea:
                kind[ty, tx] = "L"
                lakes += 1

    # Towns: the tile under the town, nudged to the nearest free land tile of the
    # same region when the coastline or a neighbour took it.
    region_of_town = {t: p["id"] for p in provinces for t in p["towns"]}
    index_of_region = {p["id"]: i for i, p in enumerate(provinces)}
    taken: set[tuple[int, int]] = set()
    towns = []
    for town in sorted(world["towns"], key=lambda t: t["id"]):
        rid = region_of_town.get(town["id"])
        tx, ty = int(town["x"] // tile), int(town["y"] // tile)
        best = None
        for radius in range(0, 6):
            cands = []
            for yy in range(ty - radius, ty + radius + 1):
                for xx in range(tx - radius, tx + radius + 1):
                    if not (0 <= xx < gw and 0 <= yy < gh):
                        continue
                    if kind[yy, xx] not in "PHM" or (xx, yy) in taken:
                        continue
                    same = rid is not None and region[yy, xx] == index_of_region[rid]
                    d = (xx + 0.5 - town["x"] / tile) ** 2 + (yy + 0.5 - town["y"] / tile) ** 2
                    cands.append((0 if same else 1, d, xx, yy))
            if cands:
                cands.sort()
                best = cands[0]
                break
        if best is None:
            # An island smaller than a tile: the tile under the town becomes
            # land of the town's region so the town keeps its place.
            if rid is None or (tx, ty) in taken:
                raise SystemExit(f"no land tile for town {town['id']}")
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

    # Region per tile, run-length encoded as [index, run, index, run, …].
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
        "version": 1,
        "source": "derived from MASSALIA world 2 (world2.json, terrain2.webp) by tools/map/build_tiles.py; edit the sources, never this file",
        "tileSize": tile,
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
    preview = Image.new("RGB", (gw, gh))
    preview.putdata([colours[c] for c in kind.flatten().tolist()])
    preview = preview.resize((gw * 6, gh * 6), Image.NEAREST)
    pd = ImageDraw.Draw(preview)
    for t in towns:
        pd.rectangle([t["x"] * 6, t["y"] * 6, t["x"] * 6 + 5, t["y"] * 6 + 5], fill=(200, 30, 30))
    preview.save(ROOT / "tools" / "map" / "preview.png")

    counts = Counter(out["terrain"])
    print(f"grid {gw} x {gh} = {gw * gh} tiles (tile = {tile}px)")
    print("terrain:", dict(sorted(counts.items())), f"lakes={lakes}")
    print(f"land tiles: {sum(counts[c] for c in 'PHM')}, towns placed: {len(towns)}")
    print(f"tiles.json {len(json.dumps(out, separators=(',', ':'))) // 1024} KB, terrain.webp {(web / 'terrain.webp').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
