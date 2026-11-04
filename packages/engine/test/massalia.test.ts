import { describe, expect, it } from "vitest";
import {
  Game,
  HOUR,
  altarBoost,
  assembleFleet,
  calendarAt,
  constructionOptions,
  createVillage,
  effectiveStats,
  isCoastal,
  isFreeValley,
  priceOf,
  resolveBattle,
  seaRoute,
  seasonMs,
  stateAt,
  tileIndex,
  tileLayout,
  tilesAround,
  villageRates,
  type Game as GameT,
} from "../src/index.js";
import { T0, clone, feed, join, newGame, setBuilding, village } from "./helpers.js";

const player = (g: GameT, pid: string) => g.state.players[pid]!;
const nextSeason = (g: GameT, t: number) => calendarAt(g.state, g.content, t).nextSeasonAt + 1;

function withAgora(g: GameT, vid: string) {
  setBuilding(g, vid, "agora", 1);
  feed(g, vid);
}

describe("the house's purse and sheet", () => {
  it("starts a house with 150 drachmae, MASSALIA's four stats and composure 70", () => {
    const g = newGame();
    const { pid } = join(g, "Protis", "hellenes");
    const p = player(g, pid);
    expect(p.purse).toBe(150);
    expect(p.profile!.stats).toEqual({ prestige: 0, devotion: 0, militia: 0, intelligence: 2 });
    expect(p.profile!.composure).toBe(70);
    const celt = player(g, join(g, "Brennos", "celts").pid);
    expect(celt.profile!.stats.militia).toBe(2);
  });

  it("raises culture half a percent per point of prestige", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const before = villageRates(g.state, g.content, village(g, vid)).culturePerDay;
    player(g, pid).profile!.stats.prestige = 20;
    expect(villageRates(g.state, g.content, village(g, vid)).culturePerDay).toBeCloseTo(before * 1.1, 9);
  });
});

describe("states", () => {
  it("makes each MASSALIA power one owner of all its towns, and its regions its land", () => {
    const g = newGame({ npcTowns: true });
    const town = (id: string) => Object.values(g.state.villages).find((v) => v.npc?.townId === id)!;
    const rome = town("rome");
    const owner = g.state.players[rome.ownerId]!;
    expect(owner.name).toBe("Roman Republic");
    expect(owner.polityId).toBe("roman_republic");
    for (const id of ["antium", "terracina", "spoletium"]) expect(town(id).ownerId).toBe(owner.id);
    expect(g.state.players[town("massalia").ownerId]!.villageIds).toHaveLength(10);
    expect(stateAt(g.content, tileIndex(g.content, rome.x, rome.y))).toBe("roman_republic");
  });
});

describe("the agora", () => {
  it("sells dear and buys cheap at seasonal prices, and only where there is an Agora", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    expect(g.vendorTrade(pid, vid, "buy", "wine", 1, T0).ok).toBe(false);
    withAgora(g, vid);
    const winter = priceOf(g.state, g.content, "wine", T0)!;
    expect(winter).toMatchObject({ buy: 6, sell: 3 });
    const summer = priceOf(g.state, g.content, "wine", T0 + 2 * seasonMs(g.state, g.content) + 1)!;
    expect(summer).toMatchObject({ buy: 4, sell: 2 });
    const r = g.vendorTrade(pid, vid, "buy", "wine", 3, T0);
    expect(r.ok).toBe(true);
    expect(player(g, pid).purse).toBe(150 - 18);
    expect(player(g, pid).goods.wine).toBe(3);
    // A town's wood goes by the lot of 100.
    const wood = village(g, vid).resources.timber!;
    expect(g.vendorTrade(pid, vid, "sell", "timber", 2, T0).ok).toBe(true);
    expect(village(g, vid).resources.timber).toBeCloseTo(wood - 200, 6);
    expect(player(g, pid).purse).toBe(132 + 6);
  });

  it("will not buy more of a resource than the town's stores can hold", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    withAgora(g, vid);
    player(g, pid).purse = 10_000;
    const r = g.vendorTrade(pid, vid, "buy", "grain", 50, T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("storage");
  });
});

describe("the players' market", () => {
  it("holds a stall's goods in escrow, sells part of it, and takes the city's tenth", () => {
    const g = newGame();
    const a = join(g, "Kleon");
    const b = join(g, "Demeas");
    withAgora(g, a.vid);
    withAgora(g, b.vid);
    player(g, a.pid).goods.wine = 10;
    const listed = g.listStall(a.pid, a.vid, "wine", 8, 9, T0);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(player(g, a.pid).goods.wine).toBe(2);
    expect(g.buyStall(a.pid, a.vid, listed.stall.id, 1, T0).ok).toBe(false); // your own stall
    const sale = g.buyStall(b.pid, b.vid, listed.stall.id, 5, T0);
    expect(sale.ok).toBe(true);
    if (sale.ok) expect(sale).toMatchObject({ total: 45, tax: 4 });
    expect(player(g, a.pid).purse).toBe(150 + 41);
    expect(player(g, b.pid).purse).toBe(150 - 45);
    expect(player(g, b.pid).goods.wine).toBe(5);
    expect(g.state.market.stalls[listed.stall.id]!.remaining).toBe(3);
    const back = g.cancelStall(a.pid, listed.stall.id, T0);
    expect(back.ok).toBe(true);
    expect(player(g, a.pid).goods.wine).toBe(5);
  });

  it("keeps ten stalls at most", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    withAgora(g, vid);
    player(g, pid).goods.salt = 20;
    for (let i = 0; i < 10; i++) expect(g.listStall(pid, vid, "salt", 1, 5, T0).ok).toBe(true);
    const r = g.listStall(pid, vid, "salt", 1, 5, T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("limit");
  });
});

describe("people", () => {
  it("hires at the Agora: slaves work the capital's fields, a physician comes one to a house", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    expect(g.hire(pid, vid, "slave", 1, T0).ok).toBe(false); // no Agora yet
    withAgora(g, vid);
    const grain = villageRates(g.state, g.content, village(g, vid)).production.grain!;
    expect(g.hire(pid, vid, "slave", 2, T0).ok).toBe(true);
    expect(villageRates(g.state, g.content, village(g, vid)).production.grain).toBeCloseTo(grain + 50, 6);
    expect(player(g, pid).purse).toBe(90);
    expect(g.hire(pid, vid, "physician", 1, T0).ok).toBe(false); // 100 dr
    player(g, pid).purse = 500;
    expect(g.hire(pid, vid, "physician", 1, T0).ok).toBe(true);
    const second = g.hire(pid, vid, "physician", 1, T0);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("limit");
    expect(g.dismiss(pid, "slave", 1, T0).ok).toBe(true);
    expect(player(g, pid).purse).toBe(400 + 25); // a slave is sold back for 25
  });

  it("pays its people at the turn of each season, and the priest brings herbs", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    withAgora(g, vid);
    player(g, pid).purse = 400;
    expect(g.hire(pid, vid, "citizen", 2, T0).ok).toBe(true);
    expect(g.hire(pid, vid, "priest", 1, T0).ok).toBe(true);
    expect(player(g, pid).purse).toBe(400 - 100 - 120);
    g.advance(nextSeason(g, T0));
    expect(player(g, pid).purse).toBe(180 - 6 - 3);
    expect(player(g, pid).goods.herbal).toBe(4);
  });
});

describe("the day", () => {
  it("allows one routine a season, halves a repeat, and grants a ladder's trait", () => {
    const g = newGame();
    const { pid } = join(g);
    const p = player(g, pid);
    const first = g.doRoutine(pid, "routine-oratory", T0);
    expect(first.ok).toBe(true);
    expect(p.profile!.stats.prestige).toBe(1);
    expect(p.profile!.ladders.rhetoric).toBe(2);
    expect(g.doRoutine(pid, "routine-rest", T0 + 1).ok).toBe(false);
    const t2 = nextSeason(g, T0);
    expect(g.doRoutine(pid, "routine-oratory", t2).ok).toBe(true);
    expect(p.profile!.ladders.rhetoric).toBe(3); // 2 halved to 1
    p.profile!.ladders.rhetoric = 7;
    const t3 = nextSeason(g, t2);
    expect(g.doRoutine(pid, "routine-stoa", t3).ok).toBe(true);
    const t4 = nextSeason(g, t3);
    expect(g.doRoutine(pid, "routine-oratory", t4).ok).toBe(true);
    expect(p.profile!.traits).toContain("rhetoric-1");
    expect(effectiveStats(g.content, p.profile!).prestige).toBe((p.profile!.stats.prestige ?? 0) + 2);
  });

  it("burns a chicken for an offering, and a priest makes it count half as much again", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const p = player(g, pid);
    expect(g.doRoutine(pid, "routine-offerings", T0).ok).toBe(false); // no chicken
    p.goods.chicken = 2;
    withAgora(g, vid);
    p.purse = 500;
    g.hire(pid, vid, "priest", 1, T0);
    const r = g.doRoutine(pid, "routine-offerings", T0);
    expect(r.ok).toBe(true);
    expect(p.goods.chicken).toBe(1);
    expect(p.profile!.stats.devotion).toBe(2);
    expect(p.profile!.ladders.mysteries).toBe(3);
    expect(p.profile!.composure).toBe(75);
  });
});

describe("crafts", () => {
  it("builds naval supplies at the Harbor with a freeman, who is busy until it is done", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    withAgora(g, vid);
    setBuilding(g, vid, "harbor", 1);
    expect(g.craft(pid, "naval-supplies", vid, T0).ok).toBe(false); // no freeman
    g.hire(pid, vid, "freeman", 1, T0);
    const job = g.craft(pid, "naval-supplies", vid, T0);
    expect(job.ok).toBe(true);
    expect(g.craft(pid, "naval-supplies", vid, T0).ok).toBe(false); // slip and freeman busy
    expect(g.dismiss(pid, "freeman", 1, T0).ok).toBe(false);
    g.advance(T0 + 4 * HOUR + 1);
    expect(player(g, pid).goods["naval-supplies"]).toBe(1);
    expect(player(g, pid).crafts).toHaveLength(0);
  });

  it("lets a physician mix poison from herbs and wine", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    withAgora(g, vid);
    const p = player(g, pid);
    p.purse = 500;
    g.hire(pid, vid, "physician", 1, T0);
    p.goods.herbal = 3;
    p.goods.wine = 1;
    expect(g.craft(pid, "poison", null, T0).ok).toBe(true);
    g.advance(T0 + 12 * HOUR + 1);
    expect(p.goods.poison).toBe(1);
    expect(p.goods.herbal ?? 0).toBe(0);
  });
});

describe("the Harbor", () => {
  it("rises only in a town on the sea", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const home = village(g, vid);
    const around = tilesAround(g.content, 5, tileIndex(g.content, home.x, home.y), 12).filter((t) => isFreeValley(g.state, g.content, t));
    const make = (tile: number, name: string) => createVillage(g.state, g.content, { ownerId: pid, tile, name, kind: "player", layout: tileLayout(g.content, g.state.settings.seed, tile)!, isCapital: false, at: T0 });
    const coast = make(around.find((t) => isCoastal(g.content, t))!, "Coast");
    const inland = make(around.find((t) => !isCoastal(g.content, t))!, "Hill");
    for (const v of [coast, inland]) {
      setBuilding(g, v.id, "agora", 10);
      setBuilding(g, v.id, "prytaneion", 10);
    }
    const harbor = (v: { id: string }) => {
      const tv = village(g, v.id);
      const slot = tv.buildings.findIndex((b, i) => !b && i < 20);
      return constructionOptions(g.state, g.content, tv, slot).find((o) => o.def.id === "harbor")!;
    };
    expect(harbor(coast).available).toBe(true);
    expect(harbor(inland).available).toBe(false);
    expect(harbor(inland).reason).toMatch(/on the sea/);
  });
});

describe("the altar", () => {
  it("burns a bull at the Barracks for +6% to every man for two seasons, one blessing at a time", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const p = player(g, pid);
    p.goods.bull = 2;
    expect(g.sacrifice(pid, vid, "bull", T0).ok).toBe(false); // no Barracks
    setBuilding(g, vid, "barracks", 1);
    expect(g.sacrifice(pid, vid, "bull", T0).ok).toBe(true);
    expect(g.sacrifice(pid, vid, "chicken", T0).ok).toBe(false);
    expect(altarBoost(p, T0 + HOUR)).toBeCloseTo(0.06, 9);
    expect(altarBoost(p, T0 + 2 * seasonMs(g.state, g.content) + 1)).toBe(0);
    expect(g.sacrifice(pid, vid, "bull", T0 + HOUR).ok).toBe(false);
  });

  it("multiplies a side's strength in battle", () => {
    const g = newGame();
    const unit = g.content.units["hoplite"]!;
    const base = {
      mode: "attack" as const,
      defenders: [],
      wallLevel: 0,
      wallBonusPerLevel: 0,
      baseDefense: 10,
      armoryBonusPerLevel: 0,
      lossExponent: 1.5,
      raidLossExponent: 1.5,
    };
    const plain = resolveBattle({ ...base, attacker: { stacks: [{ unit, count: 10, armoryLevel: 0 }], hero: null, morale: 1 } });
    const blessed = resolveBattle({ ...base, attacker: { stacks: [{ unit, count: 10, armoryLevel: 0 }], hero: null, morale: 1, boost: 1.06 } });
    expect(blessed.attackPower).toBeCloseTo(plain.attackPower * 1.06, 9);
  });
});

describe("the sea", () => {
  function island(g: GameT, pid: string) {
    const aleria = g.content.towns["aleria"]!;
    const tile = tilesAround(g.content, 3, tileIndex(g.content, aleria.x, aleria.y), 5).find((t) => isFreeValley(g.state, g.content, t))!;
    return createVillage(g.state, g.content, { ownerId: pid, tile, name: "Corsican Post", kind: "player", layout: tileLayout(g.content, g.state.settings.seed, tile)!, isCapital: false, at: T0 });
  }

  it("needs hulls and naval supplies to cross open sea, and the hulls come home after the round trip", () => {
    const g = newGame({ npcTowns: true });
    const { pid, vid } = join(g);
    const home = village(g, vid);
    setBuilding(g, vid, "muster_ground", 1);
    feed(g, vid);
    home.troops = { hoplite: 10 };
    const post = island(g, pid);
    const route = seaRoute(g.content, tileIndex(g.content, home.x, home.y), tileIndex(g.content, post.x, post.y));
    expect(route.crossesSea).toBe(true);
    const order = { playerId: pid, fromVillageId: vid, toTile: tileIndex(g.content, post.x, post.y), mission: "reinforce" as const, troops: { hoplite: 10 } };
    const noShips = g.send(order, T0);
    expect(noShips.ok).toBe(false);
    if (!noShips.ok) expect(noShips.message).toMatch(/hulls/);
    const p = player(g, pid);
    p.goods["trade-ship"] = 1;
    p.goods["naval-supplies"] = 1;
    const sent = g.send(order, T0);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.movement.ships).toEqual({ "trade-ship": 1 });
    expect(p.goods["trade-ship"] ?? 0).toBe(0);
    expect(p.goods["naval-supplies"] ?? 0).toBe(0);
    const backAt = T0 + 2 * (sent.movement.arriveAt - T0);
    g.advance(backAt + 1);
    expect(p.goods["trade-ship"]).toBe(1);
  });

  it("is driven off by a town whose fleet outweighs the escort", () => {
    const g = newGame({ npcTowns: true });
    const { pid } = join(g);
    const post = island(g, pid);
    setBuilding(g, post.id, "muster_ground", 1);
    feed(g, post.id);
    post.troops = { hoplite: 20 };
    const massalia = Object.values(g.state.villages).find((v) => v.npc?.townId === "massalia")!;
    const p = player(g, pid);
    p.goods["trade-ship"] = 1;
    p.goods["naval-supplies"] = 2;
    const sent = g.send({ playerId: pid, fromVillageId: post.id, toTile: tileIndex(g.content, massalia.x, massalia.y), mission: "raid", troops: { hoplite: 20 } }, T0);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    // No triremes in port: the escort the Send window shows adds none, not a zero count.
    p.goods["trade-ship"] = 1;
    const fleet = assembleFleet(g.content, p, 20, 1, true);
    expect(fleet.ok && Object.entries(fleet.ships)).toEqual([["trade-ship", 1]]);
    p.goods["trade-ship"] = 0;
    g.advance(sent.movement.arriveAt + 1);
    const report = Object.values(g.state.reports).find((r) => r.title.startsWith("The landing at"));
    expect(report).toBeDefined();
    expect(massalia.troops).toEqual(massalia.npc!.garrison);
  });
});

describe("plots", () => {
  it("needs a target of some prestige and a dose, spends it, and waits before the next", () => {
    const g = newGame();
    const a = join(g, "Kleon");
    const b = join(g, "Demeas");
    const actor = player(g, a.pid);
    const target = player(g, b.pid);
    const obscure = g.poison(a.pid, b.pid, T0);
    expect(obscure.ok).toBe(false);
    if (!obscure.ok) expect(obscure.code).toBe("requirements");
    target.profile!.stats.prestige = 12;
    expect(g.poison(a.pid, b.pid, T0).ok).toBe(false); // no poison
    actor.goods.poison = 2;
    const r = g.poison(a.pid, b.pid, T0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(["failed", "ill", "dead"]).toContain(r.outcome);
    expect(actor.goods.poison).toBe(1);
    const again = g.poison(a.pid, b.pid, T0 + HOUR);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("busy");
  });

  it("cures a poisoned head with a physician and a remedy", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const p = player(g, pid);
    p.profile!.traits.push("poisoned");
    expect(effectiveStats(g.content, p.profile!).intelligence).toBe(0); // 2 − 2
    expect(g.cure(pid, T0).ok).toBe(false);
    withAgora(g, vid);
    p.purse = 500;
    g.hire(pid, vid, "physician", 1, T0);
    p.goods.remedy = 1;
    expect(g.cure(pid, T0).ok).toBe(true);
    expect(p.profile!.traits).not.toContain("poisoned");
  });
});

describe("older saves", () => {
  it("gives a save from before the MASSALIA pack its purses, sheets and states", () => {
    const g = newGame({ npcTowns: true });
    const { pid } = join(g);
    const old = clone(g.state) as unknown as Record<string, unknown>;
    delete old.market;
    const players = old.players as Record<string, Record<string, unknown>>;
    for (const p of Object.values(players)) {
      for (const k of ["purse", "goods", "people", "profile", "crafts", "altar", "voyages", "polityId"]) delete p[k];
    }
    // Hand the cities back to one owner, as before.
    const states = Object.values(players).filter((p) => p.name === "Roman Republic");
    expect(states).toHaveLength(1);
    const restored = Game.restore(g.content, old as never);
    expect(restored.state.market.stalls).toEqual({});
    expect(restored.state.players[pid]!.purse).toBe(150);
    expect(restored.state.players[pid]!.profile!.composure).toBe(70);
    expect(restored.state.scheduled.some((e) => e.kind === "season")).toBe(true);
  });
});
