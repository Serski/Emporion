# The MASSALIA hybrid: where each piece plugs in

EMPORION was built to MASSALIA's conventions so the two can merge: TypeScript end to end, pure rules in a shared package, balance in zod-validated JSON under `content/`, time stamps instead of a simulation loop, a server that decides everything, and MASSALIA's map, theme and art.

## What is shared already

| MASSALIA | EMPORION |
| --- | --- |
| `apps/web/public/map2/world2.json`, `terrain2.webp`, `names2.json`, `politics2.json`, `townstats.json` | copied into `tools/map/sources/`; `build_tiles.py` turns them into the tile grid. Rebuild after MASSALIA's PSD changes. |
| goods `timber`, `stone`, `iron`, `grain` (Wood, Stone, Iron, Wheat) | the four resources, same ids |
| unit art (`PELTAST.webp`, `HOPLITE.webp`, `HIPPEIS.webp`, `BAND_*.webp`, goods icons) | `apps/web/public/assets/`, referenced by `icon` in content as in `units.json` |
| Cinzel + Spectral, night-bronze palette | the client's theme tokens in `apps/web/src/styles.css` |
| polities and their colours | free cities on the map wear their polity's colour; tile windows name the region and polity |

## Where MASSALIA's systems go

| MASSALIA system | Plug-in point here | Notes |
| --- | --- | --- |
| Houses, characters, family, heirs (`family.ts`, `character.ts`) | `Player.meta` (free-form, never read by the engine) for a first pass, then a `house` module in the engine | The hero is the natural seat for the house's head: `Player.hero` already levels, falls and is revived. An heir could be revived as the new hero. |
| Festivals, Olympiad, Dionysia (`festival.ts`, `olympiad.ts`, `leagueFestivals.ts`) | the Theatre's `festivals` in `content/buildings.json`, the `FestivalJob` on the village timeline | World-wide festivals fit a new `ScheduledKind` in `world/settle.ts` (like `npcRaids`) that every player can join. |
| Calendar and seasons, one season per real day (`calendar.ts`, seasonal coefficients in `buildings.json`) | `village/stats.ts → villageRates` for the multiplier, `village/timeline.ts → nextEventAt` for the season boundary | Add the boundary as a timeline event and accrual stays exact, which is better than MASSALIA's "current season for the whole window". |
| More goods (wine, olive oil, salt, wool…) | `content/resources.json`: resources and fields are data | Add buildings that produce them through `effects.production`, and add them to unit costs. Only one resource may be food. |
| Market, vendor bands, player listings (`market.ts`) | the Agora (`economy`, `sendResources`) | A vendor or exchange module can sit beside the merchants; prices belong in content. |
| Oligarchy, elections, League, Koinon, government (`oligarchy.ts`, `league*.ts`, `koinon.ts`) | `social/kingdoms.ts` | Kingdoms are the simplest political layer (king, governors, tribute, influence, victory points); MASSALIA's institutions can replace or extend it. |
| Round-based battle with missiles, melee, morale and pursuit (`battle.ts`) | `setBattleResolver()` in `military/arrivals.ts` | The resolver takes stacks (unit, count, armory level), heroes, wall and morale and returns the winner and both loss rates. Wrap MASSALIA's `resolveBattle` behind that interface. |
| Ships, pentekonters, triremes, coastal regions (`ships.json`) | `mapgen.seaTravelMultiplier`, `TileInfo.coastal`, the Harbor | Naval units would set their own sea speed, and ports can require coastal tiles. |
| Raids on towns, strikes, holdings | the free cities (village `kind: "town"`) and outlaw camps | Their garrisons come from population (`npc.towns`), never from MASSALIA's server-side military numbers. |

## A server

The engine already has the shape a server needs. Every Fastify route would:

1. take the world lock, the counterpart of MASSALIA's `lockPlayer`;
2. load the state;
3. call `game.<command>(…, Date.now())`, which settles the world, validates and applies the command;
4. save the state;
5. answer with the read models from `views.ts`.

Storage has two possible shapes:

- **Snapshot per world.** One JSON row per world, written after each command. It is the simplest and is fine for hundreds of players.
- **Normalised tables.** Players, villages, movements and reports as rows, with `settle` run only over the due movements (`ORDER BY arrive_at`). That fits MASSALIA's Drizzle/Postgres setup. The engine's functions take the state object, so a loader that hydrates only the involved players and towns keeps them unchanged.

The client's `Session` (`apps/web/src/session.ts`) is the local host; a remote host keeps its surface and sends each `run(…)` over the wire.

## Suggested order

1. Put the engine and content into the MASSALIA monorepo as `packages/strategy` and `content/strategy`, or keep this repo and import `@massalia/shared` here.
2. Add a server route per command, plus the snapshot table.
3. Bring houses and family onto `Player.meta` and the hero.
4. Bring the calendar in: seasons as timeline boundaries, festivals as world events.
5. Decide whether kingdoms or MASSALIA's institutions run the politics.
