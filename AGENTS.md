# EMPORION — guide for agents and contributors

## What this is

A hex-map browser strategy game (working title EMPORION) that will merge with MASSALIA. pnpm/TypeScript monorepo laid out like MASSALIA: the pure rules in `packages/engine`, the balance in `content/` (zod-validated JSON), and a Vite/React client in `apps/web` that today runs the engine locally. A server is not built yet; the engine is written so one can call it per request (see docs/HYBRID.md).

## Invariants

- The engine is pure. No `Date.now()`, no `Math.random()`, no I/O: the host passes `now`, randomness comes from the seeded generator in the state (`core/rng.ts`), and map features from the stateless hash. `test/world.test.ts` replays a world twice and compares the JSON.
- Balance numbers live in `content/`, never in code. A new rule that needs a number adds it to the schema (`content/schema.ts`) and the JSON together.
- `parseContent` cross-checks the content (unknown ids, layouts that do not add up, towns off the land) and throws `ContentError`. A malformed file must fail loudly.
- Every change to a village at time t first calls `touch(state, content, village, t)`. Its timeline (resources, culture, loyalty, training, construction, research, armory, festivals, starvation, NPC regrowth) is exact only if nothing is changed out of order. Arrival handlers touch the troops' home and the target at the arrival instant.
- Commands settle the world first (`Game` does it) and return a `Result`: `{ ok: false, code, message }` for a broken rule, never a throw. Throws are for programmer errors.
- Advancing in many steps equals advancing in one (`test/economy.test.ts`). Keep it true: event times are whole milliseconds, rates are constant between events.
- The map grid is generated: `tools/map/build_tiles.py` from the committed sources. Never hand-edit `content/map/tiles.json`.
- The map is pointy-top hexagons in rows, odd rows shifted half a hex east. Every distance, ring, line and neighbour goes through `world/map.ts` (`distance`, `forEachHexWithin`, `hexLine`, `hexNeighbour`, `hexCentre`, `hexAtPoint`); never measure with `Math.hypot` on (x, y).
- State is plain JSON. No classes, Maps or functions in `GameState`.

## How to run

```bash
pnpm install
pnpm dev                                   # client on :5180
pnpm --filter @emporion/engine test        # engine suite (vitest)
pnpm simulate -- 30 3                      # AI governors, 30 days at speed 3
pnpm gate                                  # the green light: build, lint, typecheck, test
```

Every push to `main` runs the gate on GitHub and, if it passes, publishes the client at https://serski.github.io/Emporion/ (`.github/workflows/pages.yml`). A red gate means the old version stays up.

`pnpm --filter @emporion/engine exec tsx scripts/make-save.ts out.json` writes a save with a town ready to raid; load it into the client's `localStorage["emporion.save.v2"]` to test the UI quickly.

## Where things are

- `engine/src/village/timeline.ts` — the lazy village clock. `village/stats.ts` — every derived number (production, capacity, upkeep, slots).
- `engine/src/world/settle.ts` — the world clock (marches, NPC raid waves, AI turns, in time order).
- `engine/src/military/` — combat math (`combat.ts`, swappable via `setBattleResolver`), sending (`movements.ts`), arrivals (`arrivals.ts`).
- `engine/src/economy/` — construction, training, research, armory, festivals.
- `engine/src/social/` — hero, the house and family (`family.ts`), kingdoms, reports.
- `engine/src/massalia/` — the MASSALIA pack, with its content in `content/massalia/`: purse, goods, people and the season's turn (`house.ts`), the agora and stalls (`market.ts`), the sheet and the day (`profile.ts`), crafts and the altar (`crafting.ts`), ships and sea crossings (`sea.ts`), plots (`intrigue.ts`), states (`states.ts`), read models (`views.ts`).
- `engine/src/world/calendar.ts` — seasons and years; `world/territory.ts` — the borders every town claims.
- `engine/src/views.ts` — read models for clients. `engine/src/game.ts` — the command facade.
- `apps/web/src/session.ts` — the local host (clock, save, hot-seat). `hud.tsx` — the top bar and the HUD over the view. `views/` — the three full-screen views. `windows/` — every window.

## Commit discipline

- One item per commit, staged by path. Every commit builds, lints, typechecks and passes the suite.
- Commit messages say what changed and why.
- Design, balance and player-facing wording are Argiris's rulings. A departure or a new call goes in docs/RULINGS.md, not silently into code.
