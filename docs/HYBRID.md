# The MASSALIA hybrid: where each piece plugs in

EMPORION was built to MASSALIA's conventions so the two can merge: TypeScript end to end, pure rules in a shared package, balance in zod-validated JSON under `content/`, time stamps instead of a simulation loop, a server that decides everything, and MASSALIA's map, theme and art.

## What is shared already

| MASSALIA | EMPORION |
| --- | --- |
| `apps/web/public/map2/world2.json`, `terrain2.webp`, `names2.json`, `politics2.json`, `townstats.json` | copied into `tools/map/sources/`; `build_tiles.py` turns them into the hex grid. Rebuild after MASSALIA's PSD changes. |
| goods `timber`, `stone`, `iron`, `grain` (Wood, Stone, Iron, Wheat) | the four resources, same ids |
| unit art (`PELTAST.webp`, `HOPLITE.webp`, `HIPPEIS.webp`, `BAND_*.webp`, goods icons) | `apps/web/public/assets/`, referenced by `icon` in content as in `units.json` |
| Cinzel + Spectral, night-bronze palette, Greek-key band, banners | the client's theme tokens and band in `apps/web/src/styles.css`; banners and building paintings in `apps/web/public/art/` |
| family portraits (`avatar-20-*`, `avatar-30-*`, `wife-*`, children, by age stage) | `apps/web/public/portraits/`, named in `content/family.json` |
| family rules (`family.ts`: marriage, children, death, succession, adoption, regency) | `packages/engine/src/social/family.ts` with `content/family.json`, seated on the hero |
| the calendar's seasons and BC years | `packages/engine/src/world/calendar.ts` (`world.calendar` in content) |
| polities, their colours and crests, and which power owns each region (`politics2.json`) | each power with towns is one NPC state (`massalia/states.ts`) owning its cities; the map washes its land in its colour inside one border; tile windows show its crest |
| the agora's vendor bands and seasonal coefficients, and the players' market (`buildings.json` vendor, `market.ts`) | `content/massalia/market.json` and `massalia/market.ts`: the purse of drachmae, 17 goods, stalls with escrow and a tax |
| the household's people (`people.json`) | `content/massalia/people.json` and `massalia/house.ts`, hired at the Agora, paid each season, fed from the capital |
| the character sheet, composure, age and the daily routine (`character.ts`, `composure.ts`, `age.ts`, `routines.ts`, `content/routines`) | `content/massalia/profile.json` and `massalia/profile.ts`: four stats, traits, ladders, one routine a season |
| the hulls and the naval check (`content/military/ships.json`, `reach.ts`, `mapActions.ts`) | `content/massalia/ships.json` and `massalia/sea.ts`: sea crossings need hulls and naval supplies; a town's fleet drives off landings |
| the slipway's crafts | `content/massalia/crafting.json` and `massalia/crafting.ts`: the Harbor's slips and the physician's bench; the altar in the Barracks |
| hostile acts (`content/politics/interactions.json`, `interactions.ts`) | `content/massalia/intrigue.json` and `massalia/intrigue.ts`: poison, the assassin, the cure, the spymaster's posture |
| goods, people, stat and season art, the agora banner | `apps/web/public/assets/` and `apps/web/public/art/` |
| the landing page, the lobby and character creation (`App.tsx` landing, `lobby/`, `CharacterCreation.tsx`, their stylesheets) | `apps/web/src/front/`: the same layouts and rules, read from the local save instead of the API |
| the starting ages and their faces (`content/age/age-config.json` ageOptions, avatars) | `content/family.json` `head.ageOptions`, taken by `join()` as `startAge` and `portrait` |
| MASSALIA's front painting | `apps/web/public/art/front.webp` |

## Where MASSALIA's systems go

| MASSALIA system | Plug-in point here | Notes |
| --- | --- | --- |
| Houses, characters, family, heirs (`family.ts`, `character.ts`) | done: `Player.house`, `Player.profile`, `social/family.ts` and `massalia/profile.ts` | The head of the house is the hero, with MASSALIA's four stats, composure, traits and daily routine. Age weakens him, his wife's trait helps him, and at his death the heir becomes the hero with part of the experience and the stats. Still to come from MASSALIA: characters' offices, dowry negotiation, marriages between players' houses. |
| Festivals, Olympiad, Dionysia (`festival.ts`, `olympiad.ts`, `leagueFestivals.ts`) | the Theatre's `festivals` in `content/buildings.json`, the `FestivalJob` on the village timeline | World-wide festivals fit a new `ScheduledKind` in `world/settle.ts` (like `npcRaids`) that every player can join. |
| Calendar and seasons, one season per real day (`calendar.ts`, seasonal coefficients in `buildings.json`) | the calendar is in (`world/calendar.ts`); for seasonal production, `village/stats.ts → villageRates` for the multiplier and `village/timeline.ts → nextEventAt` for the season boundary | Seasons name the date, age the family, set the agora's prices, pay the people and give the head his day. Seasonal production is still to come: add the boundary as a timeline event and accrual stays exact, which is better than MASSALIA's "current season for the whole window". |
| More goods (wine, olive oil, salt, wool…) | done as the house's goods (`content/massalia/market.json`) | They are bought, sold, crafted and spent by the house. A town's four resources stay its own, and only one may be food. Buildings that produce goods are still to come. |
| Market, vendor bands, player listings (`market.ts`) | done: `massalia/market.ts`, at the Agora | The merchants still carry resources between towns (`sendResources`). |
| Oligarchy, elections, League, Koinon, government (`oligarchy.ts`, `league*.ts`, `koinon.ts`) | `social/kingdoms.ts` | Kingdoms are the simplest political layer (king, governors, tribute, influence, victory points); MASSALIA's institutions can replace or extend it. |
| Round-based battle with missiles, melee, morale and pursuit (`battle.ts`) | `setBattleResolver()` in `military/arrivals.ts` | The resolver takes stacks (unit, count, armory level), heroes, wall and morale and returns the winner and both loss rates. Wrap MASSALIA's `resolveBattle` behind that interface. |
| Ships, pentekonters, triremes, coastal regions (`ships.json`) | done: `massalia/sea.ts`, the Harbor (coastal towns only) | Hulls carry and escort; sea legs still cost `mapgen.seaTravelMultiplier`. Sea battles between fleets are still to come. |
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
3. Houses and family on the hero, the sheet, the day, the household, the agora, crafts, the altar, ships, plots and states: done. Next, characters' offices and the states' own turns.
4. The calendar is in; next, seasons as production boundaries and festivals as world events.
5. Decide whether kingdoms or MASSALIA's institutions run the politics.
