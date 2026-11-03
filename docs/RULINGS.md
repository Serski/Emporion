# Rulings for Argiris

Design, balance and wording calls made while building the first version. Each is a draft. Change the content JSON, or say which way to go.

## Identity

1. **Name.** EMPORION is a working title. Massalia founded Emporion, and the word means a trading post. Renaming means editing the package scope `@emporion/*` and the client's title.
2. **Peoples.** Three playable peoples, each starting near its home city: Hellenes (Massalia), Celts (Bibracte) and Carthaginians (Carthage). The roster could grow with Romans, Iberians or Etruscans.
3. **Resources.** Wood, stone, iron and wheat, with MASSALIA's ids (`timber`, `stone`, `iron`, `grain`).
4. **Art.** MASSALIA portraits stand in for units: Spartan for the Epilektos, Tarentine for the Skopos, Thessalian for the Hetairos, Citizen for the Proxenos, Freeman for settlers, Volcae, Salluvii and Ligurian for Celtic foot, Gallic Horse for the Epona Rider, Libyan, Balearic, Scutarii and Caetrati for Carthage, Dynatoi for the Vergobret and Palaioi for the Suffete. Siege engines, the war chariot, the war elephant and the outrider have no art yet and use a drawn initial roundel.
5. **Theme.** Dark-first, from MASSALIA, with a parchment light mode for viewers whose system is set to light.

## Map

6. **Grid size.** 16-pixel tiles give 196 × 169 = 33,124 tiles, 8,063 of them land. `--tile 12` gives about 14,000 land tiles.
7. **Sea crossings.** Marches go in a straight line across water, but water legs cost × 1.5. The alternatives are 1.0 (sea is like land) or forbidding crossings without ships.
8. **Terrain mix.** Plains 84% settleable, hills 70% and mountains 32%; the rest is oasis or wild land. Layouts and oases are weighted by terrain.

## Economy and building

9. **World speed.** It multiplies upkeep as well as production, so a fast world is as hungry as a slow one.
10. **Builders.** One queue of two jobs for every people. A people-specific perk is a content override.
11. **Field caps.** Fields stop at level 10, or 15 in the capital.
12. **Culture costs.** Town n needs 400 · (n−1)² culture points: 400 for the 2nd, 1,600 for the 3rd, 3,600 for the 4th.
13. **Starvation.** Guests starve first, then oasis garrisons, then your own troops, each proportionally.
14. **Construction under siege.** A queued job adds one level to whatever stands, even after catapults lowered it.

## Military

15. **Battle.** Loss exponent 1.5 for attacks and raids. Morale (defender ÷ attacker population)^0.25, at least 0.6. Walls: Hellenes +3.2% per level, Celts +2.4%, Carthaginians +2.6%.
16. **Conquest.** Capitals can never be taken. A standing Oikist's House or Acropolis blocks loyalty loss, one envoy stays in the taken town, and loyalty restarts at 25.
17. **Siege engines.** They aim from Muster Ground level 5. From level 18, with at least 25 engines, they split between two targets.
18. **Protection.** 80 hours ÷ speed, at least 6. Attacking a player ends your own protection.
19. **Free cities.** MASSALIA's 105 towns are raidable NPC cities with garrisons from their population (8 spearmen, 4 archers and 1.5 horsemen per 1,000). They regrow in a day and cannot be conquered. Massalia itself has 160 spearmen behind level-16 walls.
20. **Outlaws.** 90 camps. Raid waves every 8 hours ÷ speed, a 12% chance per camp, against unprotected towns within 10 fields.
21. **Treasures.** Taken on a win against camps and cities. Stored without limit, but only those within the Treasury's capacity count for influence and victory points.

## Hero and kingdoms

22. **Hero numbers.** Strength 120 + 70 per point, ±0.25% per offence or defence point, resources 4 of each or 12 of one per point. Oases within 4 fields, at Heroon levels 5, 12 and 20. The hero changes home by reinforcing another of your towns.
23. **Kingdoms.** 8% tribute, +4% production for governors. Founding needs a capital of 200 people and a Treasury. Victory points: 25 per treasure, 1 per 100 population. These are placeholders until MASSALIA's politics decide the shape.
24. **AI governors.** They recruit toward half their population in troops, keep the builders busy and raid hideouts within 12 fields. They do not attack players yet.
