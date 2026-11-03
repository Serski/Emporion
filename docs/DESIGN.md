# Design: the systems and their formulas

Every number below is a default from `content/`; change the JSON, not the code. "Speed" is the world speed chosen at creation.

## Time

- **Village timeline.** A town is advanced lazily by `touch(v, t)` (`village/timeline.ts`). It walks from the town's cursor to `t`, stopping at every internal event: a construction finishing, a unit leaving its building, research or an armory upgrade ending, a festival ending, the hero revived, and the granary running dry while there are troops to feed. Between two events every rate is constant, so accrual is exact. Touching at t1 then t2 gives the same town as touching at t2 once (tested).
- **World clock.** `settle(until)` (`world/settle.ts`) processes cross-town events in time order, ties broken by creation order: marches arriving, outlaw raid waves, AI turns. A server calls it before each request; the client calls it every tick.
- **Scale.** Content times are seconds at speed 1, rates are per hour at speed 1. Speed multiplies production, upkeep, construction, training, research, culture, loyalty and regrowth. Troop speed (default = speed) multiplies marching.
- **Determinism.** The state carries a seeded generator (`core/rng.ts`); map features use a stateless hash of the seed. Same seed and same commands give the same world (tested).

## Towns

- **Start.** 18 fields from the tile's layout (4-4-4-6 for a new player), 22 building sites (20 free, the Muster Ground at 20 and the Walls at 21), a Prytaneion at level 1, 800 of each resource, 1,000 storage.
- **Production** per resource = Σ field output(level) × (1 + boosters + oasis bonus + kingdom bonus) + hero output, × speed. Field output: 3/h at level 0, then 7, 12, 19, 28, 40, 56, 77, 104, 138, 180 … 530 at level 15.
- **Storage** per resource = max(1,000, Σ storehouse or granary capacity), capacity(L) = 1,300 · 1.24^(L−1). Overflow is lost.
- **People and food.** Population is the sum of each field's and building's per-level increments; each person eats 1 wheat an hour. Troops eat their upkeep: at home, as guests in the town, in the town's oases, and on the march (troops stationed elsewhere eat at their host).
- **Starvation.** When wheat reaches 0 with a negative balance, troops die until the town can feed the rest: guests first, then oasis garrisons, then its own, each group losing the same share of every unit. Everyone affected gets a report.
- **Culture.** Each field and building yields culture per day at its level; festivals add a lump sum when they end. A player's culture is the sum over their towns, plus what is banked from towns they lost. Owning n towns needs 400 · (n − 1)² culture points (rounded to 50).
- **Loyalty** is 0–100 and recovers 0.5 per hour, plus 0.25 per Oikist's House level or 0.4 per Acropolis level.

## Construction

- **Cost** of level L = base · 1.27^(L−1) for buildings (1.6 for fields, 1.75 for the production boosters), rounded to 5.
- **Time** = time(L) × Prytaneion factor ÷ speed. The factor is 0.96^(L−1) at Prytaneion level L, and 2.5 with none.
- **Queue.** One builders' queue holding 2 jobs, one running and one waiting. A faction may override this in content.
- Each job adds one level to its field or site. If catapults damage a building while a job waits, the job still adds one level to whatever then stands.
- **Food check.** A non-wheat job is refused if, once every queued job's people are in, the town's net wheat would fall below zero.
- **Placement rules** are content flags: requirements, fixed sites, capital-only, mutually exclusive buildings (Oikist's House and Acropolis), one per player, and more copies only once every copy is at its last level (storehouse, granary, cache).
- **Cancelling** refunds in full, cancels any later job on the same field or site, and pulls the waiting jobs forward.

## Units, research, armory, festivals

- **Training.** Each training building has its own queue, paid up front. Time per unit = train time × building factor (0.92^(L−1)) × faction multiplier (Carthaginians 0.92) ÷ speed. Units appear one by one and start eating when they appear.
- **Research** in the Gymnasion, one unit at a time per town. Basic units need none.
- **Armory.** Each level gives that unit +1.5% attack and defence, up to the Armory's level and 20. Cost = unit cost × 2.5 × 1.2^(L−1). The levels are frozen into an army when it marches out.
- **Settlers and envoys** need a free expansion slot: Oikist's House at levels 10 and 20, Acropolis at 8, 14 and 20. Each free slot allows 3 settlers or 1 envoy, counting those at home, in training, on the road or stationed away.
- **Festivals** in the Theatre: the Rural Dionysia (+420 culture) from level 1, the Great Panathenaia (+1,800) from level 10, one at a time per town.

## The map

- **The grid.** 196 × 169 tiles, each 16 × 16 pixels of MASSALIA's world 2 art. Terrain per tile: S sea, F fog (off the playable world), L lake, P plain, H hills, M mountain. Each tile also has a region (with its MASSALIA name and polity), and the 105 towns stand on their tiles. Built by `tools/map/build_tiles.py`.
- **What stands on land** is drawn from the world seed, weighted by terrain. Plains are 84% valley, 10% oasis and 6% wild; mountains 32%, 10% and 58%. Valleys take a field layout weighted by terrain (wheat-rich on plains, iron and stone in the mountains). Oases take a bonus type the same way.
- **Distance** is straight-line in tiles, with no wrap-around. Travel distance = d · (1 − w) + d · w · 1.5, where w is the share of the line over water or fog. Marches keep straight lines, but sea legs cost half again.
- **March time** = travel distance ÷ the slowest unit's speed (fields per hour), ÷ troop speed. The Hippodrome adds 8% per level on the part beyond 15 fields.

## Missions

| Mission | Who | What happens |
| --- | --- | --- |
| Attack | any troops ± hero | Fight to the end. Rams, catapults and envoys work only here. |
| Raid | any troops ± hero | Both sides break off; survivors loot. |
| Scout | scouts only | Report the stores, troops, walls, caches and buildings. |
| Reinforce | any troops ± hero | Station in a town (any player's) or your own oasis; the host feeds them. |
| Found town | exactly 3 settlers | Carry the 800-of-each founding stores to an empty valley; needs culture and a slot, checked again on arrival. |

Beginner protection lasts 80 hours ÷ speed, at least 6. Protected players cannot be attacked, raided or scouted, and attacking another player ends your own protection. Outlaws and free cities are never protected.

## Battle (`military/combat.ts`)

- **Attack** = Σ count × attack × armory, with infantry and cavalry kept apart, plus the hero's strength, × (1 + hero offence bonus) × morale.
- **Defence** = (10 base + Σ count × (defence vs infantry × infantry share + defence vs cavalry × cavalry share) × armory + heroes' strength × their bonus) × wall factor. The wall factor is (1 + bonus)^level: 3.2% per level for the Hellenes, 2.4% for the Celts, 2.6% for the Carthaginians.
- **Morale.** When the attacker's population exceeds the defender's, attack × max(0.6, (defender pop ÷ attacker pop)^0.25). There is no morale against NPCs.
- **Losses.** In an attack the winner loses x = (weaker ÷ stronger)^1.5 of every unit and the loser loses everything. In a raid, the winner loses x ÷ (1 + x) and the loser 1 ÷ (1 + x). Losses are rounded per unit type.
- **Siege** (attack won). Damage = Σ surviving rams (or catapults) × siege power × armory. A level L needs 2 · 1.12^(L−1) damage to fall, × the defender's wall durability for walls. Catapults hit at random below Muster Ground level 5 and aim at one target from level 5. From level 18, with at least 25 engines, they split their damage between two targets. Walls only fall to rams.
- **Conquest** (attack won, envoys survive). This needs a target that is not a capital and has no standing Oikist's House or Acropolis, plus culture points and a free slot for the attacker's home town. Each envoy then lowers loyalty by a roll in its range: Hellenes 18–28, Celts 15–35, Carthaginians 20–26. At 0 the town changes hands: queues and research are lost, one envoy stays and loyalty restarts at 25. The old owner's troops of that town are re-homed to their capital.
- **Loot.** The survivors' carrying capacity, filled evenly across resources from the stock above the cache (cache × faction multiplier, 1.5 for the Celts; outlaws and cities have none). A win against outlaws or a city also takes their treasures.
- **Scouting.** Attacking scout power is compared with the defending scouts' power. With no defending scouts, the attacker gets through unseen. If the attacker is stronger they get through but are seen, losing (defence ÷ attack)^1.5. Otherwise all are caught.
- **Hero.** Health lost = side's loss rate × 100; the hero falls at 0 or when the side is wiped out. Experience = the wheat upkeep of the enemies killed. Level L needs 80 · L(L+1)/2 experience and every level gives 4 points. A fallen hero is revived at home for a cost and time that grow with level; the Heroon shortens it.
- **Oases.** Win an attack with the hero alive, within 4 fields of home, with a free Heroon slot (levels 5, 12 and 20) to annex the oasis. An owned oasis loses 34 loyalty per hero victory and changes hands at 0.

## NPC world

- **Free cities.** The 105 MASSALIA towns. Garrison per 1,000 people: 8 spearmen, 4 archers and 1.5 horsemen. Walls = MASSALIA's wall stat × 4. Fields, storage and treasures grow with population. They regrow their garrison in 24 hours ÷ speed and cannot be conquered.
- **Outlaw camps.** 90 by default in three tiers: hideouts, pirate coves and robber fortresses. They regrow in 36 hours ÷ speed. Every 8 hours ÷ speed, each camp at 80% strength or more has a 12% chance to raid the nearest unprotected town within 10 fields with 35% of its men.
- **AI governors** (`ai/bot.ts`) take a turn every 30 game minutes. They recruit toward an army of half their population, keep the builders busy (wheat first when food runs short) and sometimes raid a nearby hideout.

## Kingdoms (`social/kingdoms.ts`)

- **Founding** needs a capital with 200 people and a Treasury.
- **Influence.** Each of the king's towns projects a radius of min(14, 3 + 0.008 · population + 0.4 · treasures held). A tile belongs to the kingdom with the largest (radius − distance).
- **Governors** whose capital lies in the territory may join. They divert 8% of their production into a tribute pot (capped at 24 hours of tribute) and gain +4% production. The king collects every pot into the capital, as far as it has room.
- **Victory points** = 25 per treasure held + 1 per 100 population.

## State and hosts

- `GameState` (`core/types.ts`) is plain JSON: players, villages, oases (created when first touched), movements, reports (the newest 1,500 kept), kingdoms and scheduled events.
- `Game` (`game.ts`) is the command facade. Each command settles to `now`, then validates and applies, and returns a `Result`.
- `views.ts` holds the read models a client renders: town summary, slots, construction options, movements, tile details, rankings and hero.
