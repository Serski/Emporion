import { describe, expect, it } from "vitest";
import {
  createVillage,
  isFreeValley,
  marchMs,
  tileIndex,
  tileLayout,
  tilesAround,
  touch,
  travelDistance,
  villageRates,
  waterShare,
  type BattleReportData,
  type Game,
  type ScoutReportData,
} from "../src/index.js";
import { T0, feed, hours, join, newGame, setBuilding, village } from "./helpers.js";

function duel(opts: { speed?: number } = {}) {
  const g = newGame({ speed: opts.speed ?? 1 });
  const a = join(g, "Attalos");
  const d = join(g, "Demeas");
  g.state.players[d.pid]!.protectedUntil = T0 - 1;
  g.state.players[a.pid]!.protectedUntil = T0 - 1;
  setBuilding(g, a.vid, "muster_ground", 1);
  setBuilding(g, a.vid, "storehouse", 20);
  setBuilding(g, a.vid, "granary", 20);
  feed(g, a.vid);
  feed(g, d.vid);
  return { g, a, d };
}

const tileOf = (g: Game, vid: string) => {
  const v = g.state.villages[vid]!;
  return tileIndex(g.content, v.x, v.y);
};

function reportsOf(g: Game, kind: string) {
  return Object.values(g.state.reports).filter((r) => r.kind === kind);
}

function freeValleyNear(g: Game, vid: string): number {
  const tiles = tilesAround(g.content, 1, tileOf(g, vid), 10);
  const t = tiles.find((x) => isFreeValley(g.state, g.content, x) && tileLayout(g.content, g.state.settings.seed, x));
  if (t === undefined) throw new Error("no free valley");
  return t;
}

describe("raids and attacks", () => {
  it("raids a town: the march takes distance / speed, the raiders loot and carry it home", () => {
    const { g, a, d } = duel();
    village(g, a.vid).troops = { peltast: 100 };
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileOf(g, d.vid), mission: "raid", troops: { peltast: 100 } }, T0);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    const m = sent.movement;
    const expected = marchMs(g.state, g.content, village(g, a.vid), m.fromTile, m.toTile, 8);
    expect(m.arriveAt - T0).toBe(expected);
    expect(village(g, a.vid).troops.peltast ?? 0).toBe(0);

    const before = { ...village(g, a.vid).resources };
    g.advance(m.arriveAt);
    const battle = reportsOf(g, "battle")[0]!;
    const data = battle.data as BattleReportData;
    expect(data.winner).toBe("attacker");
    // Demeas's hero was home and fought alone: one raider fell, and the hero
    // barely survived.
    expect(data.attacker.losses).toEqual({ peltast: 1 });
    expect(data.defenders[0]!.hero?.present).toBe(true);
    expect(data.defenders[0]!.hero?.died).toBe(false);
    const looted = Object.values(data.loot).reduce((s, n) => s + n, 0);
    expect(looted).toBeGreaterThan(3000); // the whole stock of an unguarded town
    expect(battle.recipients.sort()).toEqual([a.pid, d.pid].sort());

    const back = Object.values(g.state.movements).find((x) => x.kind === "return")!;
    expect(back.arriveAt - m.arriveAt).toBe(expected);
    g.advanceAll(back.arriveAt);
    const v = village(g, a.vid);
    expect(v.troops.peltast).toBe(99);
    for (const r of g.content.resourceIds) expect(v.resources[r]).toBeGreaterThanOrEqual(before[r]! + (data.loot[r] ?? 0) - 1e-6);
    expect(g.state.players[a.pid]!.looted).toBe(looted);
  });

  it("refuses to attack a player under beginner's protection", () => {
    const { g, a, d } = duel();
    g.state.players[d.pid]!.protectedUntil = T0 + hours(10);
    village(g, a.vid).troops = { peltast: 10 };
    const res = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileOf(g, d.vid), mission: "attack", troops: { peltast: 10 } }, T0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("protected");
  });

  it("needs a Muster Ground to send troops", () => {
    const { g, d } = duel();
    village(g, d.vid).troops = { peltast: 10 };
    const res = g.send({ playerId: d.pid, fromVillageId: d.vid, toTile: 0, mission: "raid", troops: { peltast: 10 } }, T0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("requirements");
  });

  it("hides the cache's share from raiders", () => {
    const { g, a, d } = duel();
    setBuilding(g, d.vid, "cache", 10); // 1480 of each resource is safe
    village(g, a.vid).troops = { peltast: 100 };
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileOf(g, d.vid), mission: "raid", troops: { peltast: 100 } }, T0);
    if (!sent.ok) throw new Error(sent.message);
    g.advance(sent.movement.arriveAt);
    const data = reportsOf(g, "battle")[0]!.data as BattleReportData;
    expect(Object.values(data.loot).every((n) => n === 0)).toBe(true);
  });

  it("loses a raid against a strong garrison but keeps the survivors", () => {
    const { g, a, d } = duel();
    village(g, a.vid).troops = { peltast: 100 };
    village(g, d.vid).troops = { hoplite: 80 };
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileOf(g, d.vid), mission: "raid", troops: { peltast: 100 } }, T0);
    if (!sent.ok) throw new Error(sent.message);
    g.advance(sent.movement.arriveAt);
    const data = reportsOf(g, "battle")[0]!.data as BattleReportData;
    expect(data.winner).toBe("defender");
    const lost = data.attacker.losses.peltast ?? 0;
    expect(lost).toBeGreaterThan(50);
    expect(lost).toBeLessThan(100);
    expect(village(g, d.vid).troops.hoplite).toBeLessThan(80);
    expect(village(g, d.vid).troops.hoplite).toBeGreaterThan(40);
    expect(g.state.players[a.pid]!.offense).toBeGreaterThan(0);
    expect(g.state.players[d.pid]!.defense).toBe(lost);
  });

  it("brings walls down with rams and buildings with aimed catapults", () => {
    const { g, a, d } = duel();
    setBuilding(g, a.vid, "muster_ground", 5); // may pick a target
    setBuilding(g, d.vid, "walls", 5);
    setBuilding(g, d.vid, "storehouse", 10);
    village(g, a.vid).troops = { epilektos: 300, krios: 50, lithobolos: 30 };
    const sent = g.send(
      { playerId: a.pid, fromVillageId: a.vid, toTile: tileOf(g, d.vid), mission: "attack", troops: { epilektos: 300, krios: 50, lithobolos: 30 }, targets: ["storehouse"] },
      T0,
    );
    if (!sent.ok) throw new Error(sent.message);
    g.advance(sent.movement.arriveAt);
    const data = reportsOf(g, "battle")[0]!.data as BattleReportData;
    expect(data.winner).toBe("attacker");
    expect(data.wall).toEqual({ from: 5, to: 0 });
    expect(village(g, d.vid).buildings[21]).toBeNull();
    // 30 damage against durability 2·1.12^(L-1): a level-10 storehouse falls to 3.
    expect(data.damaged).toEqual([{ target: "storehouse", name: "Storehouse", from: 10, to: 3 }]);
  });

  it("scouts a town without being seen when it has no scouts", () => {
    const { g, a, d } = duel();
    village(g, a.vid).troops = { skopos: 5 };
    village(g, d.vid).troops = { hoplite: 12 };
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileOf(g, d.vid), mission: "scout", troops: { skopos: 5 } }, T0);
    if (!sent.ok) throw new Error(sent.message);
    g.advance(sent.movement.arriveAt);
    const scout = reportsOf(g, "scout");
    expect(scout).toHaveLength(1);
    const data = scout[0]!.data as ScoutReportData;
    expect(data.success).toBe(true);
    expect(data.detected).toBe(false);
    expect(data.info?.troops).toEqual({ hoplite: 12 });
    expect(data.info?.resources?.timber).toBeGreaterThan(0);
  });

  it("loses scouts to stronger defending scouts and warns the defender", () => {
    const { g, a, d } = duel();
    village(g, a.vid).troops = { skopos: 2 };
    village(g, d.vid).troops = { skopos: 10 };
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileOf(g, d.vid), mission: "scout", troops: { skopos: 2 } }, T0);
    if (!sent.ok) throw new Error(sent.message);
    g.advance(sent.movement.arriveAt);
    const scout = reportsOf(g, "scout");
    expect(scout).toHaveLength(2);
    expect((scout.find((r) => r.recipients.includes(a.pid))!.data as ScoutReportData).success).toBe(false);
    expect(Object.values(g.state.movements)).toHaveLength(0); // nobody came back
  });

  it("stations reinforcements, which the host feeds, and sends them home on request", () => {
    const { g, a, d } = duel();
    village(g, a.vid).troops = { hoplite: 20 };
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileOf(g, d.vid), mission: "reinforce", troops: { hoplite: 20 } }, T0);
    if (!sent.ok) throw new Error(sent.message);
    const upkeepA = () => villageRates(g.state, g.content, village(g, a.vid)).upkeep;
    const upkeepD = () => villageRates(g.state, g.content, village(g, d.vid)).upkeep;
    const aWhileMarching = upkeepA();
    const dBefore = upkeepD();
    g.advance(sent.movement.arriveAt);
    expect(village(g, d.vid).stationed).toHaveLength(1);
    expect(upkeepA()).toBe(aWhileMarching - 20);
    expect(upkeepD()).toBe(dBefore + 20);
    // The host sends them away.
    const back = g.withdraw(d.pid, { villageId: d.vid }, a.vid, sent.movement.arriveAt + 1000);
    expect(back.ok).toBe(true);
    if (!back.ok || !back.movement) return;
    expect(village(g, d.vid).stationed).toHaveLength(0);
    g.advance(back.movement.arriveAt);
    expect(village(g, a.vid).troops.hoplite).toBe(20);
  });

  it("makes sea legs slower than land", () => {
    const c = newGame().content;
    const massalia = c.towns["massalia"]!;
    const carthage = c.towns["carthage"]!;
    const a = tileIndex(c, massalia.x, massalia.y);
    const b = tileIndex(c, carthage.x, carthage.y);
    const w = waterShare(c, a, b);
    expect(w).toBeGreaterThan(0.6);
    const d = Math.hypot(massalia.x - carthage.x, massalia.y - carthage.y);
    expect(travelDistance(c, a, b)).toBeCloseTo(d * (1 - w) + d * w * c.world.mapgen.seaTravelMultiplier, 6);
  });
});

describe("expansion", () => {
  it("founds a colony with three settlers once there is culture and a free slot", () => {
    const { g, a } = duel();
    const home = village(g, a.vid);
    setBuilding(g, a.vid, "prytaneion", 5);
    setBuilding(g, a.vid, "oikist_house", 10);
    home.troops = { apoikos: 3 };
    home.culture = 500;
    const target = freeValleyNear(g, a.vid);
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: target, mission: "settle", troops: { apoikos: 3 } }, T0);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.movement.carry).toEqual(g.content.world.expansion.foundingCost);
    g.advance(sent.movement.arriveAt);
    const player = g.state.players[a.pid]!;
    expect(player.villageIds).toHaveLength(2);
    const colony = village(g, player.villageIds[1]!);
    expect(tileIndex(g.content, colony.x, colony.y)).toBe(target);
    expect(colony.isCapital).toBe(false);
    expect(colony.resources.timber).toBe(800);
    expect(home.children).toEqual([colony.id]);
    expect(reportsOf(g, "settle")).toHaveLength(1);
  });

  it("refuses to settle without enough culture points", () => {
    const { g, a } = duel();
    setBuilding(g, a.vid, "oikist_house", 10);
    village(g, a.vid).troops = { apoikos: 3 };
    const res = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: freeValleyNear(g, a.vid), mission: "settle", troops: { apoikos: 3 } }, T0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("culture");
  });

  it("limits settler training to the free expansion slots", () => {
    const { g, a } = duel();
    setBuilding(g, a.vid, "prytaneion", 5);
    const v = village(g, a.vid);
    for (const r of g.content.resourceIds) v.resources[r] = 60000;
    setBuilding(g, a.vid, "oikist_house", 9);
    expect(g.train(a.pid, a.vid, "apoikos", 1, T0).ok).toBe(false); // no slot below level 10
    setBuilding(g, a.vid, "oikist_house", 10);
    expect(g.train(a.pid, a.vid, "apoikos", 3, T0).ok).toBe(true);
    const fourth = g.train(a.pid, a.vid, "apoikos", 1, T0);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.code).toBe("no_slot");
  });

  it("conquers a town whose loyalty envoys bring to zero", () => {
    const { g, a, d } = duel();
    const attacker = village(g, a.vid);
    setBuilding(g, a.vid, "oikist_house", 10);
    attacker.culture = 500;
    // Demeas's second town, not his capital.
    const tile = freeValleyNear(g, d.vid);
    const colony = createVillage(g.state, g.content, {
      ownerId: d.pid,
      tile,
      name: "Kitharista",
      kind: "player",
      layout: tileLayout(g.content, g.state.settings.seed, tile)!,
      isCapital: false,
      at: T0,
    });
    attacker.troops = { epilektos: 200, proxenos: 6 };
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tile, mission: "attack", troops: { epilektos: 200, proxenos: 6 } }, T0);
    if (!sent.ok) throw new Error(sent.message);
    g.advance(sent.movement.arriveAt);
    const data = reportsOf(g, "battle")[0]!.data as BattleReportData;
    expect(data.conquered).toBe(true);
    expect(colony.ownerId).toBe(a.pid);
    expect(colony.loyalty).toBe(g.content.world.expansion.loyaltyAfterConquest);
    expect(g.state.players[a.pid]!.villageIds).toContain(colony.id);
    expect(g.state.players[d.pid]!.villageIds).not.toContain(colony.id);
    expect(attacker.children).toContain(colony.id);
    const home = Object.values(g.state.movements).find((m) => m.kind === "return")!;
    expect(home.troops.proxenos).toBe(5); // one envoy stays to govern
  });

  it("never takes a capital", () => {
    const { g, a, d } = duel();
    setBuilding(g, a.vid, "oikist_house", 10);
    village(g, a.vid).culture = 500;
    village(g, a.vid).troops = { epilektos: 200, proxenos: 6 };
    const sent = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: tileOf(g, d.vid), mission: "attack", troops: { epilektos: 200, proxenos: 6 } }, T0);
    if (!sent.ok) throw new Error(sent.message);
    g.advance(sent.movement.arriveAt);
    const data = reportsOf(g, "battle")[0]!.data as BattleReportData;
    expect(data.conquered).toBe(false);
    expect(data.notes.join(" ")).toMatch(/capital/);
    expect(village(g, d.vid).ownerId).toBe(d.pid);
  });
});

describe("merchants", () => {
  it("deliver goods and come home", () => {
    const { g, a, d } = duel();
    setBuilding(g, a.vid, "agora", 5);
    const v = village(g, a.vid);
    v.resources.timber = 2000;
    const sent = g.sendResources(a.pid, a.vid, d.vid, { timber: 1500 }, T0);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.movement.merchants).toBe(2); // 800 per Hellenic merchant
    const before = village(g, d.vid).resources.timber!;
    g.advance(sent.movement.arriveAt);
    touch(g.state, g.content, village(g, d.vid), sent.movement.arriveAt);
    expect(village(g, d.vid).resources.timber).toBe(Math.min(1000, before + 1500 + 0));
    const back = Object.values(g.state.movements).find((m) => m.kind === "tradeReturn")!;
    expect(back.merchants).toBe(2);
    g.advance(back.arriveAt);
    expect(Object.values(g.state.movements)).toHaveLength(0);
  });

  it("refuse loads beyond the free merchants", () => {
    const { g, a, d } = duel();
    setBuilding(g, a.vid, "agora", 1);
    village(g, a.vid).resources.timber = 2000;
    const res = g.sendResources(a.pid, a.vid, d.vid, { timber: 1000 }, T0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("no_merchants");
  });
});
