# Rulings for Argiris

Design, balance and wording calls made while building the first version. Each is a draft. Change the content JSON, or say which way to go.

## Identity

1. **Name.** EMPORION is a working title. Massalia founded Emporion, and the word means a trading post. Renaming means editing the package scope `@emporion/*` and the client's title.
2. **Peoples.** Three playable peoples, each starting near its home city: Hellenes (Massalia), Celts (Bibracte) and Carthaginians (Carthage). The roster could grow with Romans, Iberians or Etruscans.
3. **Resources.** Wood, stone, iron and wheat, with MASSALIA's ids (`timber`, `stone`, `iron`, `grain`).
4. **Art.** MASSALIA's art throughout. Portraits stand in for units: Spartan for the Epilektos, Tarentine for the Skopos, Thessalian for the Hetairos, Citizen for the Proxenos, Freeman for settlers, Volcae, Salluvii and Ligurian for Celtic foot, Gallic Horse for the Epona Rider, Libyan, Balearic, Scutarii and Caetrati for Carthage, Dynatoi for the Vergobret and Palaioi for the Suffete. Siege engines, the war chariot, the war elephant and the outrider have no art yet and use a drawn initial roundel. Buildings borrow MASSALIA's paintings: the salon for the Prytaneion, the harbour warehouse for the Storehouse, an estate for the Granary and the Muster Ground, emporia for the Cache, Armory, Agora and Stonecutter, the slipways for the Siege Workshop and Harbor, the horse farm for the Stables, schools for the Gymnasion and Smelter, sanctuaries for the Theatre, Acropolis, Treasury and Walls, the timber lot, vineyard and poultry yard for the Sawmill, Mill and Bakery, and the household shrine for the Heroon. Windows carry MASSALIA's banners (family, market, court, ledger, politics, Dionysia, Olympia, harbour).
5. **Theme.** MASSALIA's look only: night-dark grounds, bronze rules and Greek-key bands, cream text, Cinzel for inscriptions and Spectral for reading. There is no light mode.
6. **Layout.** Travian Kingdoms' arrangement. One view fills the screen (fields, town centre, map) with the HUD on its edges: stores and the three views at the top, the hero at the top right, tools on the left, builders along the bottom, quick actions at the bottom right. Everything else opens as a window with tabs. On a phone the HUD stacks around the view and the tools sit along the bottom edge.
7. **The town centre.** Twenty sites in a five-by-four grid. The walls are the ring around them (click the ring) and the Muster Ground stands in the gate.

## Map

8. **Grid.** Hexagons, not squares: pointy-top, in rows, with every odd row shifted half a hex east. Hexes 17 art pixels wide give 184 × 184 = 33,856 hexes, 8,208 of them land, close to the old square grid's 8,063. `--hex 12` gives 16,467 land hexes. Distance counts hex steps, so every rule that says "within N fields" means N rings of hexes.
9. **Sea crossings.** Marches go in a straight line across water, but water legs cost × 1.5, and a march over open sea needs hulls (ruling 45). The alternative is 1.0: sea as fast as land once the ships are there.
10. **Terrain mix.** Plains 84% settleable, hills 70% and mountains 32%; the rest is oasis or wild land. Layouts and oases are weighted by terrain.

## Economy and building

11. **World speed.** It multiplies upkeep as well as production, so a fast world is as hungry as a slow one.
12. **Builders.** One queue of two jobs for every people. A people-specific perk is a content override.
13. **Field caps.** Fields stop at level 10, or 15 in the capital.
14. **Culture costs.** Town n needs 400 · (n−1)² culture points: 400 for the 2nd, 1,600 for the 3rd, 3,600 for the 4th.
15. **Starvation.** Guests starve first, then oasis garrisons, then your own troops, each proportionally.
16. **Construction under siege.** A queued job adds one level to whatever stands, even after catapults lowered it.

## Military

17. **Battle.** Loss exponent 1.5 for attacks and raids. Morale (defender ÷ attacker population)^0.25, at least 0.6. Walls: Hellenes +3.2% per level, Celts +2.4%, Carthaginians +2.6%.
18. **Conquest.** Capitals can never be taken. A standing Oikist's House or Acropolis blocks loyalty loss, one envoy stays in the taken town, and loyalty restarts at 25.
19. **Siege engines.** They aim from Muster Ground level 5. From level 18, with at least 25 engines, they split between two targets.
20. **Protection.** 80 hours ÷ speed, at least 6. Attacking a player ends your own protection.
21. **Free cities.** MASSALIA's 105 towns are raidable NPC cities with garrisons from their population (8 spearmen, 4 archers and 1.5 horsemen per 1,000). They regrow in a day and cannot be conquered. Massalia itself has 160 spearmen behind level-16 walls.
22. **Outlaws.** 90 camps. Raid waves every 8 hours ÷ speed, a 12% chance per camp, against unprotected towns within 10 fields.
23. **Treasures.** Taken on a win against camps and cities. Stored without limit, but only those within the Treasury's capacity count for influence and victory points.

## Hero and kingdoms

24. **Hero numbers.** Strength 120 + 70 per point, ±0.25% per offence or defence point, resources 4 of each or 12 of one per point. Oases inside the town's borders, at Heroon levels 5, 12 and 20. The hero changes home by reinforcing another of your towns.
25. **Kingdoms.** 8% tribute, +4% production for governors. Founding needs a capital of 200 people and a Treasury. Victory points: 25 per treasure, 1 per 100 population. These are placeholders until MASSALIA's politics decide the shape.
26. **AI governors.** They recruit toward half their population in troops, keep the builders busy and raid hideouts within 12 fields. They do not attack players yet.

## Borders and the calendar

27. **Territory.** Each player's town claims the 4 rings of hexes around it (61 hexes), a free city 2 rings (19), an outlaw camp only its own hex. A hex shared by two claims goes to the nearer town, then to the older one. No one may found a town inside another player's borders, new players start outside every border, and an oasis can be annexed only from the town whose borders hold it. Borders do not stop marches, raids or trade.
28. **Calendar.** MASSALIA's seasons, one every 24 hours ÷ speed: Winter, Spring, Summer, Autumn, from Winter 300 BC. Four seasons make a year, and people age one year per year. Seasons do not change production yet.

## The house (MASSALIA's family on the hero)

29. **The head.** The hero is the head of the player's house, 20 years old at the start. He dies of old age at a hidden age between 55 and 68. Age weakens him: ×0.95 strength from 40, ×0.85 from 55, ×0.7 from 65. Death in battle still means a revival, not a succession.
30. **Marriage.** Three brides are offered each year while he is unwed, aged 18 to 30, 45% of them with a trait: Fertile (children likelier, safer births), Dowried (600 of each resource into the capital), Learned (+10% hero experience), Devout (+10% culture in the hero's home town), Stern (+5% defence where the hero stands) and Frail (the opposite of Fertile). A wife dies of age between 60 and 70.
31. **Children.** A wife between 18 and 35 bears a child with a 40% chance a year for the first two, 15% after that, at most four in all, half of them sons. Each birth carries a 7% risk that the mother dies; the child lives.
32. **Succession.** When the head dies, the eldest son of 15 or more inherits with 50% of the hero's experience. Failing him, an adopted heir takes 35%. A son under 15 gets a regent who holds the house with 30% until the boy comes of age. With no one, the house adopts a stranger at 35%. The heir's attribute points are given back to spend afresh.
33. **Adoption.** A house without a son is offered three men aged 20 to 35 each year to adopt as heir.
34. **AI houses.** AI governors marry the first bride offered and adopt when the head reaches 45 without a son.

## The MASSALIA pack (`content/massalia/`)

Where a rule departs from MASSALIA, the ruling says so.

35. **States.** Each MASSALIA power that holds towns (Rome, Carthage, Massalia, the Celtic and Iberian peoples…) is one NPC state that owns all its cities. Its land is every land hex of the regions MASSALIA's political map gives it, drawn as one wash in its colour inside one border. Regions MASSALIA leaves "unclaimed" belong to no state. State land does not stop settling, marching or trade: only the 2 rings around each city do, as before. The states take no turns yet: no diplomacy, no armies of their own.
36. **Purse and goods.** Every house has a purse of drachmae (150 at the start) and holds MASSALIA's 17 goods (wine, olive oil, bulls, herbs, remedies, poisons, naval supplies, the two hulls…). Goods belong to the house, not to a town. A town's wood, stone, iron and wheat stay in its stores.
37. **The agora.** The NPC market trades in a town with an Agora. It charges MASSALIA's vendor price and pays its buy price, both × the season's coefficient (MASSALIA's seasonal goods, wood and wheat among them: Winter 1.25, Spring 1.05, Summer 0.85, Autumn 0.95; the year-round rest: 1.05, 1.0, 0.98, 1.0), and each point of prestige raises what it pays by 0.2%. The four resources trade in lots of 100 out of and into the trading town's stores, and a purchase stops at the stores' capacity. Resource lots are EMPORION's: MASSALIA's vendor sells goods only.
38. **The players' market.** At most 10 stalls per house, up to 1,000 of a good at up to 10,000 drachmae each. The goods wait in escrow, a buyer may take part of a stall, and the city keeps a tenth of every sale from the seller. Resource lots can be listed too and go into the buyer's town.
39. **People.** Hired at the Agora, paid at each season's turn, and fed from the capital's wheat (per hour, × speed). Slave 30 drachmae (sold back for 25, no upkeep, eats 4, works the capital's fields for +25 wheat an hour). Freeman 20 (2 a season; the Harbor's crafts need them). Citizen 50 (3 a season, +4 culture a day in the capital). Physician 100, one per house (defends against poison, cures it, mixes remedies and poisons). Bodyguard 60 (eats 8; stands against assassins). Spymaster 150, one (guards the house or hunts for openings). Priest 120, one (4 herbs a season; the altar burns half as long again). Philosopher 120, one (+10% hero experience; study gives more). Hetaira 120, one (shows the troops marching on your towns; opens the salon's routines). In MASSALIA the priest, philosopher and hetaira are characters of the house, not hires: hiring them is EMPORION's. When the purse cannot pay, it empties and nobody leaves.
40. **The profile.** MASSALIA's four stats, capped at 100, start at 0, with +2 for each people's speciality: Intelligence for the Hellenes, Militia for the Celts, Prestige for the Carthaginians. What they do is EMPORION's: each point of Prestige adds 0.5% culture in every town and better agora prices, and from 10 Prestige rivals may plot against the house; each point of Devotion makes an altar's blessing 1% stronger; each point of Militia makes the hero 1% stronger, and half of it guards against assassins; each point of Intelligence adds 1% to scouts and weighs in plots. Age wears the stats each year: −2 Militia from 40; −4 Militia, −2 Intelligence and −2 Devotion from 55; −6, −4 and −4 from 65. An heir keeps all the Prestige and half of the rest, but none of the traits.
41. **Composure.** Starts at 70 and recovers 5 a season. At 0 the head breaks: he withdraws for the rest of the season and comes back at 50.
42. **The day.** One routine a season, since one MASSALIA day is one EMPORION season. Repeating last season's routine gives half. Routines feed four ladders (Rhetoric, Philosophia, Gymnasium, Mysteries) whose traits, at 8, 20 and 40 points, add +2, +4 and +6 to their stat. Eleven routines are open to every head and six more come with a hetaira's salon.
43. **Crafts.** At the Harbor, which only a town by the sea may raise: Naval Supplies (Harbor 1, 1 freeman, 200 wood and 100 iron, 4 hours), Pentekonter (Harbor 5, 2 freemen, 500 wood, 2 naval supplies and 1 leather, 24 hours) and Trireme (Harbor 10, 3 freemen, 800 wood, 300 iron and 3 naval supplies, 24 hours). The Harbor has 1 slip, 2 at level 10 and 3 at level 20. The physician's bench takes one job at a time: Remedy (2 herbs and 1 olive oil, 6 hours) and Poison (3 herbs and 1 wine, 12 hours). Times are divided by speed, and the people a job needs are busy until it is done. In MASSALIA the hulls come from the Shipbuilder and naval supplies, remedies and poisons are bought: the Harbor's coastal rule and these three recipes are EMPORION's.
44. **Sacrifices.** The altar stands in the Barracks. A bull gives +6% and a chicken +2% to every man the house fields, in attack and in defence, for 2 seasons, × (1 + 1% per Devotion), and half as long again with a priest. One blessing burns at a time. These numbers are EMPORION's.
45. **Ships.** A march whose straight line runs over open sea needs hulls with room for every man: 1 for foot and the hero, 3 for horse, 4 for siege engines, 6 for an elephant. Pentekonter: range 7 seas, room for 20, naval strength 1. Trireme: range 4, room for 4, naval strength 5. Carriers are picked first, and against a town with ships every trireme in port sails as escort. Each hull burns one naval supply a voyage and is away for the round trip. A landing is driven off, without a battle, when the town's fleet (MASSALIA's town fleets) outweighs the escort. The sea legs still cost half again (ruling 9). AI governors do not cross the sea.
46. **Plots.** Poison (one dose) or an assassin (200 drachmae) against the head of a rival house with 10 Prestige or more, at most once per target every 96 hours ÷ speed. The chance is base + (attack − defence) ÷ 40, kept between 5% and 95%. Poison: base 50%; attack is the plotter's Intelligence, +10 with a hunting spymaster; defence is the target's Intelligence, +15 with a physician, +10 with a guarding spymaster. Assassin: base 45%; defence is half the target's Militia, plus bodyguards worth 24 × (1 − 0.5^n), plus 10 for a guarding spymaster. A poison that works sickens 60% of the time (Poisoned: −3 Militia, −2 Intelligence, −1 Prestige, −20% hero strength, until a physician cures it with a remedy) and kills otherwise. A death passes the house on, as old age does.
