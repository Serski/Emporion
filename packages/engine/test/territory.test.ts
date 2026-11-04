import { describe, expect, it } from "vitest";
import {
  claimedTiles,
  createVillage,
  distance,
  hexLine,
  hexRing,
  hexesWithin,
  isFreeValley,
  tileIndex,
  tileLayout,
  tilesAround,
  territoryAt,
  type Game,
} from "../src/index.js";
import { T0, feed, join, newGame, setBuilding, village } from "./helpers.js";

const tileOf = (g: Game, vid: string) => {
  const v = g.state.villages[vid]!;
  return tileIndex(g.content, v.x, v.y);
};

describe("territory", () => {
  it("claims every hex within four steps of a town", () => {
    const g = newGame();
    const { vid } = join(g);
    const v = village(g, vid);
    const home = tileOf(g, vid);
    const within = hexesWithin(g.content, home, 4);
    expect(within).toHaveLength(61); // 1 + 6 + 12 + 18 + 24
    for (const t of within) expect(territoryAt(g.state, g.content, t)?.id).toBe(vid);
    const ring5 = hexRing(g.content, home, 5);
    expect(ring5).toHaveLength(30);
    for (const t of ring5) expect(territoryAt(g.state, g.content, t)?.id).not.toBe(vid);
    expect(claimedTiles(g.state, g.content, v)).toHaveLength(61);
    for (const t of hexRing(g.content, home, 4)) expect(distance(g.content, home, t)).toBe(4);
  });

  it("starts new players outside the territory of others", () => {
    const g = newGame();
    const a = join(g, "Attalos");
    const b = join(g, "Demeas");
    expect(territoryAt(g.state, g.content, tileOf(g, b.vid))?.id).toBe(b.vid);
    expect(distance(g.content, tileOf(g, a.vid), tileOf(g, b.vid))).toBeGreaterThan(4);
  });

  it("gives an overlapped tile to the nearer town", () => {
    const g = newGame();
    const a = join(g, "Attalos");
    const home = tileOf(g, a.vid);
    const near = tilesAround(g.content, 1, home, 7).find((t) => isFreeValley(g.state, g.content, t) && distance(g.content, home, t) >= 5)!;
    const other = createVillage(g.state, g.content, {
      ownerId: a.pid,
      tile: near,
      name: "Second",
      kind: "player",
      layout: tileLayout(g.content, g.state.settings.seed, near)!,
      isCapital: false,
      at: T0 + 1,
    });
    // A third of the way along the line between them is nearer the first town.
    const line = hexLine(g.content, home, near);
    const mid = line[Math.floor((line.length - 1) / 3)]!;
    expect(distance(g.content, home, mid)).toBeLessThan(distance(g.content, near, mid));
    expect(territoryAt(g.state, g.content, mid)?.id).toBe(a.vid);
    expect(territoryAt(g.state, g.content, near)?.id).toBe(other.id);
  });

  it("refuses settlers inside another player's territory", () => {
    const g = newGame();
    const a = join(g, "Attalos");
    const d = join(g, "Demeas");
    setBuilding(g, a.vid, "muster_ground", 1);
    setBuilding(g, a.vid, "oikist_house", 10);
    feed(g, a.vid);
    village(g, a.vid).culture = 500;
    village(g, a.vid).troops = { apoikos: 3 };
    const inside = claimedTiles(g.state, g.content, village(g, d.vid)).find((t) => isFreeValley(g.state, g.content, t));
    if (inside === undefined) throw new Error("no free valley in the rival's land");
    const res = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: inside, mission: "settle", troops: { apoikos: 3 } }, T0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/territory/);
    const mine = claimedTiles(g.state, g.content, village(g, a.vid)).find((t) => isFreeValley(g.state, g.content, t));
    if (mine !== undefined) {
      const ok = g.send({ playerId: a.pid, fromVillageId: a.vid, toTile: mine, mission: "settle", troops: { apoikos: 3 } }, T0);
      expect(ok.ok).toBe(true);
    }
  });
});
