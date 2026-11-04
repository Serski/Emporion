import { describe, expect, it } from "vitest";
import {
  claimedTiles,
  createVillage,
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
  it("claims every tile within four fields of a town", () => {
    const g = newGame();
    const { vid } = join(g);
    const v = village(g, vid);
    const at = (dx: number, dy: number) => territoryAt(g.state, g.content, tileIndex(g.content, v.x + dx, v.y + dy));
    expect(at(0, 0)?.id).toBe(vid);
    expect(at(4, 0)?.id).toBe(vid);
    expect(at(0, -4)?.id).toBe(vid);
    expect(at(2, 3)?.id).toBe(vid);
    expect(at(5, 0)?.id).not.toBe(vid);
    expect(at(3, 3)?.id).not.toBe(vid); // 4.24 fields away
    expect(claimedTiles(g.state, g.content, v).length).toBe(49);
  });

  it("starts new players outside the territory of others", () => {
    const g = newGame();
    const a = join(g, "Attalos");
    const b = join(g, "Demeas");
    expect(territoryAt(g.state, g.content, tileOf(g, b.vid))?.id).toBe(b.vid);
    const da = Math.hypot(village(g, a.vid).x - village(g, b.vid).x, village(g, a.vid).y - village(g, b.vid).y);
    expect(da).toBeGreaterThan(4);
  });

  it("gives an overlapped tile to the nearer town", () => {
    const g = newGame();
    const a = join(g, "Attalos");
    const v = village(g, a.vid);
    const near = tilesAround(g.content, 1, tileOf(g, a.vid), 7).find(
      (t) => isFreeValley(g.state, g.content, t) && Math.hypot((t % g.content.map.width) - v.x, Math.floor(t / g.content.map.width) - v.y) >= 5,
    )!;
    const other = createVillage(g.state, g.content, {
      ownerId: a.pid,
      tile: near,
      name: "Second",
      kind: "player",
      layout: tileLayout(g.content, g.state.settings.seed, near)!,
      isCapital: false,
      at: T0 + 1,
    });
    const nx = near % g.content.map.width;
    const ny = Math.floor(near / g.content.map.width);
    const mid = tileIndex(g.content, Math.round((nx + v.x * 2) / 3), Math.round((ny + v.y * 2) / 3));
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
