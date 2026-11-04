# EMPORION

*Working title.* A browser strategy game in the tradition of the tile-map empire builders: towns with resource fields and buildings, timed construction and training, armies marching across a world of hexagons, raids, sieges, conquest and colonies, borders around every town, a hero, oases, outlaw camps and kingdoms.

The world is MASSALIA's: the grid of 33,856 hexagons is derived from MASSALIA's hand-drawn world 2 map (its terrain art, its 175 regions and its 105 towns), and the client follows Travian Kingdoms' screen layout in MASSALIA's theme and art. It is becoming a hybrid. MASSALIA's family runs the hero: the hero is the head of a house who marries, has children, ages and passes the sword to an heir. His profile carries MASSALIA's four stats, composure and one routine a season. His house keeps a purse and goods, trades at the agora and the players' market, and hires slaves, freemen, citizens, a physician, bodyguards, a spymaster, a priest, a philosopher and a hetaira. It crafts naval supplies, ships, remedies and poison, sacrifices at the altar for troop boosts, crosses the sea in Pentekonters and Triremes, and plots against rival heads. MASSALIA's powers stand on the map as whole states, and its calendar dates the world from 300 BC. Festivals and politics come next. See [docs/HYBRID.md](docs/HYBRID.md).

## Play

**https://serski.github.io/Emporion/** runs the latest `main`. After every push, `.github/workflows/pages.yml` runs the gate, then rebuilds and publishes the game. It plays in the browser and saves there.

## Quick start

```bash
pnpm install
pnpm dev            # the playable client on http://127.0.0.1:5180
pnpm test           # the engine's suite
pnpm simulate       # AI governors play a world for 14 game days
pnpm gate           # build, lint, typecheck and test everything
```

The client runs the whole game in the browser: pick a people and a world speed, and play against AI rivals. The clock can pause, run ×1 to ×1000, or jump an hour. The game saves in localStorage. Hot-seat players can be added from the player menu.

## Layout

| Path | What |
| --- | --- |
| `packages/engine` | `@emporion/engine`: the pure rules. No clock, no I/O, no randomness outside the seeded state. |
| `content/` | Every balance number, as JSON validated by the engine's zod schema. `content/massalia/` holds MASSALIA's market, people, profile, crafts, ships and plots. |
| `content/map/tiles.json` | The generated hex grid. Do not edit by hand. |
| `tools/map/` | `build_tiles.py` and its committed MASSALIA sources. |
| `apps/web` | The Vite + React client, plus `scripts/artifact.mjs` that packages it as one page. |
| `docs/` | [DESIGN.md](docs/DESIGN.md) (systems and formulas), [HYBRID.md](docs/HYBRID.md) (the MASSALIA merge), [RULINGS.md](docs/RULINGS.md) (the design calls awaiting a decision). |

## Rebuilding the map

```bash
python3 tools/map/build_tiles.py            # hexes 17 px wide: 184 x 184
python3 tools/map/build_tiles.py --hex 12   # a finer grid
```

It needs Python 3 with numpy and Pillow. It reads only `tools/map/sources/` (copies of MASSALIA's `apps/web/public/map2` files) and writes `content/map/tiles.json`, `apps/web/public/map/terrain.webp` and a check image, `tools/map/preview.png`.
