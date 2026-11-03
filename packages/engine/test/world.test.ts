import { describe, expect, it } from "vitest";
import {
  Game,
  heroHealth,
  kingdomAtTile,
  oasisAt,
  tileIndex,
  tileKind,
  tilesAround,
  touch,
  villageRates,
  type BattleReportData,
} from "../src/index.js";
import { T0, clone, content, feed, hours, join, newGame, rich, setBuilding, village } from "./helpers.js";

describe("training and research", () => {
  it("trains units one by one, each costing upkeep from the moment it is ready", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    rich(g, vid);
    setBuilding(g, vid, "prytaneion", 3);
    setBuilding(g, vid, "muster_ground", 1);
    setBuilding(g, vid, "barracks", 1);
    const res = g.train(pid, vid, "peltast", 3, T0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.batch.unitMs).toBe(820_000);
    const v = village(g, vid);
    const upkeep0 = villageRates(g.state, g.content, v).upkeep;
    touch(g.state, g.content, v, T0 + 820_000 * 2 + 1);
    expect(v.troops.peltast).toBe(2);
    expect(villageRates(g.state, g.content, v).upkeep).toBe(upkeep0 + 2);
    touch(g.state, g.content, v, T0 + 820_000 * 3);
    expect(v.troops.peltast).toBe(3);
    expect(v.training).toHaveLength(0);
  });

  it("needs research before training advanced units", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    rich(g, vid);
    setBuilding(g, vid, "prytaneion", 3);
    setBuilding(g, vid, "muster_ground", 1);
    setBuilding(g, vid, "barracks", 3);
    expect(g.train(pid, vid, "hoplite", 1, T0).ok).toBe(false);
    expect(g.research(pid, vid, "hoplite", T0).ok).toBe(false); // no Gymnasion yet
    setBuilding(g, vid, "gymnasion", 1);
    const r = g.research(pid, vid, "hoplite", T0);
    expect(r.ok).toBe(true);
    touch(g.state, g.content, village(g, vid), T0 + hours(2));
    expect(village(g, vid).research.done).toContain("hoplite");
    expect(g.train(pid, vid, "hoplite", 5, T0 + hours(2)).ok).toBe(true);
  });

  it("upgrades a unit at the armory up to the armory's level", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    rich(g, vid);
    setBuilding(g, vid, "prytaneion", 3);
    setBuilding(g, vid, "gymnasion", 1);
    setBuilding(g, vid, "armory", 1);
    const up = g.upgradeUnit(pid, vid, "peltast", T0);
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    touch(g.state, g.content, village(g, vid), up.job.endAt);
    expect(village(g, vid).armory.levels.peltast).toBe(1);
    const again = g.upgradeUnit(pid, vid, "peltast", up.job.endAt);
    expect(again.ok).toBe(false); // armory level 1 caps the upgrade at 1
  });

  it("holds a festival in the Theatre for culture points", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    rich(g, vid);
    setBuilding(g, vid, "theatre", 1);
    const f = g.holdFestival(pid, vid, "minor", T0);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    const v = village(g, vid);
    const before = v.culture;
    touch(g.state, g.content, v, f.job.endAt);
    expect(v.culture - before).toBeGreaterThan(420);
  });
});

describe("hero", () => {
  it("spends points and produces resources at home", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const hero = g.state.players[pid]!.hero!;
    expect(hero.unspent).toBe(4);
    expect(g.assignHeroPoints(pid, { production: 4 }, T0).ok).toBe(true);
    const r = villageRates(g.state, g.content, village(g, vid));
    expect(r.production.timber).toBe(12 + 4 * 4);
    expect(g.setHeroProduction(pid, "iron", T0).ok).toBe(true);
    const r2 = villageRates(g.state, g.content, village(g, vid));
    expect(r2.production.iron).toBe(12 + 4 * 12);
    expect(r2.production.timber).toBe(12);
  });

  it("falls in a lost battle and is revived at home", () => {
    const g = newGame();
    const a = join(g, "Attalos");
    const d = join(g, "Demeas");
    g.state.players[d.pid]!.protectedUntil = 0;
    setBuilding(g, a.vid, "muster_ground", 1);
    feed(g, d.vid);
    village(g, d.vid).troops = { hoplite: 200 };
    const dv = village(g, d.vid);
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileIndex(g.content, dv.x, dv.y), mission: "attack", troops: {}, hero: true }, T0);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(g.state.players[a.pid]!.hero!.status).toBe("moving");
    g.advance(sent.movement.arriveAt);
    const hero = g.state.players[a.pid]!.hero!;
    expect(hero.status).toBe("dead");
    rich(g, a.vid);
    const rev = g.reviveHero(a.pid, sent.movement.arriveAt);
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    g.advance(rev.reviveAt, a.pid);
    expect(hero.status).toBe("home");
    expect(heroHealth(g.state, g.content, hero, rev.reviveAt)).toBe(100);
  });

  it("gains experience from enemy losses and levels up", () => {
    const g = newGame();
    const a = join(g, "Attalos");
    const d = join(g, "Demeas");
    g.state.players[d.pid]!.protectedUntil = 0;
    setBuilding(g, a.vid, "muster_ground", 1);
    feed(g, a.vid);
    feed(g, d.vid);
    village(g, a.vid).troops = { epilektos: 400 };
    village(g, d.vid).troops = { peltast: 120 };
    const dv = village(g, d.vid);
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileIndex(g.content, dv.x, dv.y), mission: "attack", troops: { epilektos: 400 }, hero: true }, T0);
    if (!sent.ok) throw new Error(sent.message);
    g.advance(sent.movement.arriveAt);
    const hero = g.state.players[a.pid]!.hero!;
    expect(hero.xp).toBe(120); // 120 peltasts at 1 upkeep each
    expect(hero.level).toBe(1); // 80 xp for level 1
    expect(hero.unspent).toBe(8);
  });

  it("annexes an oasis after clearing its wildlife", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    setBuilding(g, vid, "muster_ground", 1);
    setBuilding(g, vid, "heroon", 5);
    feed(g, vid);
    const v = village(g, vid);
    const home = tileIndex(g.content, v.x, v.y);
    const tile = tilesAround(g.content, 1, home, 4).find((t) => tileKind(g.content, g.state.settings.seed, t) === "oasis");
    if (tile === undefined) throw new Error("no oasis near the test town");
    const oasis = oasisAt(g.state, g.content, tile, T0)!;
    v.troops = { epilektos: 300 };
    const sent = g.send({ playerId: pid, fromVillageId: vid, toTile: tile, mission: "attack", troops: { epilektos: 300 }, hero: true }, T0);
    if (!sent.ok) throw new Error(sent.message);
    g.advance(sent.movement.arriveAt);
    const data = Object.values(g.state.reports).find((r) => r.kind === "battle")!.data as BattleReportData;
    expect(data.winner).toBe("attacker");
    expect(data.annexed).toBe(true);
    expect(oasis.ownerVillageId).toBe(vid);
    expect(v.oases).toEqual([tile]);
    const type = g.content.oasisTypes[oasis.typeId]!;
    const [res, bonus] = Object.entries(type.bonus)[0]!;
    const base = villageRates(g.state, g.content, v);
    expect(base.production[res]).toBeGreaterThan(0);
    expect(bonus).toBeGreaterThan(0);
  });
});

describe("npc world", () => {
  it("places the 105 MASSALIA towns as free cities and brigand camps between them", () => {
    const g = Game.create(content(), { startedAt: T0, npcCamps: 40, npcTowns: true, seed: 3 });
    const towns = Object.values(g.state.villages).filter((v) => v.kind === "town");
    const camps = Object.values(g.state.villages).filter((v) => v.kind === "camp");
    expect(towns).toHaveLength(105);
    expect(camps).toHaveLength(40);
    const massalia = towns.find((t) => t.npc?.townId === "massalia")!;
    expect(massalia.name).toBe("Massalia");
    expect(massalia.buildings[21]?.level).toBe(16); // walls 4 × 4
    expect(massalia.troops.city_spearman).toBe(160); // 20 000 people × 8 per 1000
  });

  it("regrows a camp's garrison after a beating", () => {
    const g = Game.create(content(), { startedAt: T0, npcCamps: 10, npcTowns: false, seed: 3 });
    const camp = Object.values(g.state.villages).find((v) => v.kind === "camp")!;
    const full = { ...camp.npc!.garrison };
    camp.troops = {};
    touch(g.state, g.content, camp, T0 + hours(18)); // half of the 36-hour regrowth
    for (const [u, n] of Object.entries(full)) expect(camp.troops[u]).toBe(Math.floor(n / 2));
    touch(g.state, g.content, camp, T0 + hours(40));
    expect(camp.troops).toEqual(full);
  });

  it("sends outlaw raids against unprotected towns nearby", () => {
    const g = Game.create(content(), { startedAt: T0, npcCamps: 120, npcTowns: false, npcRaids: true, seed: 5 });
    const { pid } = join(g);
    g.state.players[pid]!.protectedUntil = 0;
    g.advance(T0 + hours(24 * 4));
    const raids = Object.values(g.state.reports).filter((r) => r.kind === "battle" && r.recipients.includes(pid));
    expect(raids.length).toBeGreaterThan(0);
  });
});

describe("kingdoms", () => {
  it("lets a king found a kingdom, governors join inside it, and tribute flow to the capital", () => {
    const g = newGame();
    const king = join(g, "Basileus");
    const gov = join(g, "Hyparchos");
    expect(g.foundKingdom(king.pid, "Kingdom of the Coast", T0).ok).toBe(false); // no treasury yet
    rich(g, king.vid);
    setBuilding(g, king.vid, "prytaneion", 10);
    setBuilding(g, king.vid, "treasury", 10);
    const kingTown = village(g, king.vid);
    expect(g.foundKingdom(king.pid, "Kingdom of the Coast", T0).ok).toBe(false); // too few people
    for (const f of kingTown.fields) f.level = 10;
    kingTown.treasures = 20; // treasures widen the kingdom's influence
    const founded = g.foundKingdom(king.pid, "Kingdom of the Coast", T0);
    expect(founded.ok).toBe(true);
    if (!founded.ok) return;
    const gv = village(g, gov.vid);
    const govTile = tileIndex(g.content, gv.x, gv.y);
    expect(kingdomAtTile(g.state, g.content, govTile)).toBe(founded.kingdom.id);
    expect(g.joinKingdom(gov.pid, founded.kingdom.id, T0).ok).toBe(true);
    const r = villageRates(g.state, g.content, gv);
    expect(r.tribute.timber).toBeCloseTo(12 * 1.04 * 0.08, 6);
    g.advance(T0 + hours(10));
    const kv = village(g, king.vid);
    for (const res of g.content.resourceIds) kv.resources[res] = 0;
    const col = g.collectTribute(king.pid, T0 + hours(10));
    expect(col.ok).toBe(true);
    if (!col.ok) return;
    expect(col.collected.timber).toBe(Math.floor(12 * 1.04 * 0.08 * 10));
  });
});

describe("determinism", () => {
  it("replays a world identically from the same seed and commands", () => {
    const run = () => {
      const g = Game.create(content(), { startedAt: T0, npcCamps: 30, npcTowns: true, npcRaids: true, seed: 99, speed: 5 });
      const a = join(g, "Attalos");
      const d = join(g, "Demeas", "celts");
      g.state.players[d.pid]!.protectedUntil = 0;
      setBuilding(g, a.vid, "muster_ground", 5);
      village(g, a.vid).troops = { epilektos: 100, lithobolos: 5 };
      const dv = village(g, d.vid);
      g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileIndex(g.content, dv.x, dv.y), mission: "attack", troops: { epilektos: 100, lithobolos: 5 } }, T0);
      g.upgradeField(d.pid, d.vid, 0, T0);
      g.advanceAll(T0 + hours(48));
      return clone(g.state);
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
