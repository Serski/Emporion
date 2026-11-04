import { describe, expect, it } from "vitest";
import { calendarAt, constructionOptions, createVillage, isCoastal, isFreeValley, reportsFor, tileDeposit, tileLayout, type Game as GameT, type Village } from "../src/index.js";
import { T0, feed, join, newGame, setBuilding, village } from "./helpers.js";

const player = (g: GameT, pid: string) => g.state.players[pid]!;
const nextSeason = (g: GameT, t: number) => calendarAt(g.state, g.content, t).nextSeasonAt + 1;

describe("holdings", () => {
  function townOn(g: GameT, pid: string, tile: number, name: string): Village {
    const v = createVillage(g.state, g.content, { ownerId: pid, tile, name, kind: "player", layout: tileLayout(g.content, g.state.settings.seed, tile)!, isCapital: false, at: T0 });
    setBuilding(g, v.id, "prytaneion", 10);
    return v;
  }
  const option = (g: GameT, v: Village, id: string) => {
    const tv = village(g, v.id);
    const slot = tv.buildings.findIndex((b, i) => !b && i < 20);
    return constructionOptions(g.state, g.content, tv, slot).find((o) => o.def.id === id)!;
  };

  it("stand only where they may: a vineyard on vines, salt works by the sea", () => {
    const g = newGame();
    const { pid } = join(g);
    const seed = g.state.settings.seed;
    const n = g.content.map.width * g.content.map.height;
    const free = (t: number) => isFreeValley(g.state, g.content, t);
    let vinesTile = -1;
    let bareTile = -1;
    for (let t = 0; t < n && (vinesTile < 0 || bareTile < 0); t++) {
      if (!free(t)) continue;
      const d = tileDeposit(g.content, seed, t);
      if (vinesTile < 0 && d?.id === "vines" && isCoastal(g.content, t)) vinesTile = t;
      if (bareTile < 0 && !d && !isCoastal(g.content, t)) bareTile = t;
    }
    const vines = townOn(g, pid, vinesTile, "Vine Hill");
    const bare = townOn(g, pid, bareTile, "Bare Hill");
    expect(option(g, vines, "vineyard").available).toBe(true);
    expect(option(g, bare, "vineyard").available).toBe(false);
    expect(option(g, bare, "vineyard").reason).toMatch(/vines/);
    expect(option(g, vines, "salt_works").available).toBe(true);
    expect(option(g, bare, "salt_works").reason).toMatch(/on the sea/);
  });

  it("yield each season, MASSALIA's way, while the house can staff them", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    setBuilding(g, vid, "agora", 1);
    feed(g, vid);
    setBuilding(g, vid, "poultry_yard", 1);
    setBuilding(g, vid, "bull_farm", 1);
    const p = player(g, pid);
    expect(g.hire(pid, vid, "slave", 1, T0).ok).toBe(true);
    // Winter: 6 chickens × 0.95 = 5.7, so 5 now and 0.7 carried. The one slave
    // staffs the Poultry Yard (first in the town); the Bull Farm stands idle.
    const t1 = nextSeason(g, T0);
    g.advance(t1);
    expect(p.goods.chicken).toBe(5);
    expect(p.goodsCarry.chicken).toBeCloseTo(0.7, 6);
    expect(p.goods.bull ?? 0).toBe(0);
    const report = reportsFor(g.state, pid).find((r) => r.title === "The winter yield")!;
    expect(report.data.type === "simple" && report.data.lines.join(" ")).toMatch(/Bull Farm in .* stood idle: it needs 1 slave/);
    // Spring with two slaves: 6 + 0.7 chickens and half a bull × 1.1.
    expect(g.hire(pid, vid, "slave", 1, t1).ok).toBe(true);
    const t2 = nextSeason(g, t1);
    g.advance(t2);
    expect(p.goods.chicken).toBe(11);
    expect(p.goods.bull ?? 0).toBe(0);
    expect(p.goodsCarry.bull).toBeCloseTo(0.55, 6);
    // Summer: 0.625 more of a bull makes one, and a level-2 yard yields 6 × 1.8 × 1.05.
    setBuilding(g, vid, "poultry_yard", 2);
    g.advance(nextSeason(g, t2));
    expect(p.goods.bull).toBe(1);
    expect(p.goods.chicken).toBe(11 + Math.floor(6 * 1.8 * 1.05 + 0.7));
  });

  it("grow herbs at the Sanctuary only while a priest serves it", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    setBuilding(g, vid, "agora", 1);
    feed(g, vid);
    setBuilding(g, vid, "sanctuary", 1);
    const t1 = nextSeason(g, T0);
    g.advance(t1);
    expect(player(g, pid).goods.herbal ?? 0).toBe(0);
    expect(g.hire(pid, vid, "priest", 1, t1).ok).toBe(true);
    g.advance(nextSeason(g, t1));
    expect(player(g, pid).goods.herbal).toBe(4); // Spring: 4 herbs × 1.0
  });
});
