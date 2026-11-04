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

8. **Grid size.** 16-pixel tiles give 196 × 169 = 33,124 tiles, 8,063 of them land. `--tile 12` gives about 14,000 land tiles.
9. **Sea crossings.** Marches go in a straight line across water, but water legs cost × 1.5. The alternatives are 1.0 (sea is like land) or forbidding crossings without ships.
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

27. **Territory.** Each player's town claims every tile within 4 fields, a free city 2, an outlaw camp only its own tile. A tile shared by two claims goes to the nearer town, then to the older one. No one may found a town inside another player's borders, new players start outside every border, and an oasis can be annexed only from the town whose borders hold it. Borders do not stop marches, raids or trade.
28. **Calendar.** MASSALIA's seasons, one every 24 hours ÷ speed: Winter, Spring, Summer, Autumn, from Winter 300 BC. Four seasons make a year, and people age one year per year. Seasons do not change production yet.

## The house (MASSALIA's family on the hero)

29. **The head.** The hero is the head of the player's house, 20 years old at the start. He dies of old age at a hidden age between 55 and 68. Age weakens him: ×0.95 strength from 40, ×0.85 from 55, ×0.7 from 65. Death in battle still means a revival, not a succession.
30. **Marriage.** Three brides are offered each year while he is unwed, aged 18 to 30, 45% of them with a trait: Fertile (children likelier, safer births), Dowried (600 of each resource into the capital), Learned (+10% hero experience), Devout (+10% culture in the hero's home town), Stern (+5% defence where the hero stands) and Frail (the opposite of Fertile). A wife dies of age between 60 and 70.
31. **Children.** A wife between 18 and 35 bears a child with a 40% chance a year for the first two, 15% after that, at most four in all, half of them sons. Each birth carries a 7% risk that the mother dies; the child lives.
32. **Succession.** When the head dies, the eldest son of 15 or more inherits with 50% of the hero's experience. Failing him, an adopted heir takes 35%. A son under 15 gets a regent who holds the house with 30% until the boy comes of age. With no one, the house adopts a stranger at 35%. The heir's attribute points are given back to spend afresh.
33. **Adoption.** A house without a son is offered three men aged 20 to 35 each year to adopt as heir.
34. **AI houses.** AI governors marry the first bride offered and adopt when the head reaches 45 without a son.
