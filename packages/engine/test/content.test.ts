import { describe, expect, it } from "vitest";
import { ContentError, parseContent, tileIndex, tileInfo, tileKind } from "../src/index.js";
import { content, rawBundle } from "./helpers.js";

describe("content", () => {
  it("parses the shipped content", () => {
    const c = content();
    expect(c.resourceIds).toEqual(["timber", "stone", "iron", "grain"]);
    expect(c.food).toBe("grain");
    expect(c.factionList.filter((f) => f.playable).map((f) => f.id).sort()).toEqual(["carthaginians", "celts", "hellenes"]);
    expect(Object.keys(c.units).length).toBeGreaterThan(30);
  });

  it("rejects a requirement on a building that does not exist", () => {
    const raw = rawBundle();
    raw.buildings.buildings[0]!.requires = [{ building: "pyramid", level: 1 }];
    expect(() => parseContent(raw)).toThrow(ContentError);
    try {
      parseContent(raw);
    } catch (e) {
      expect((e as ContentError).problems.join("\n")).toMatch(/pyramid/);
    }
  });

  it("rejects a layout whose fields do not add up", () => {
    const raw = rawBundle();
    raw.world.mapgen.layouts[0]!.fields = { timber: 1, stone: 1, iron: 1, grain: 1 };
    expect(() => parseContent(raw)).toThrow(/has 4 fields/);
  });

  it("rejects a malformed number through zod", () => {
    const raw = rawBundle();
    (raw.resources.fields[0] as { maxLevel: unknown }).maxLevel = -3;
    expect(() => parseContent(raw)).toThrow();
  });

  it("decodes the MASSALIA-derived tile map", () => {
    const c = content();
    const { map } = c;
    expect(map.width * map.height).toBe(map.terrain.length);
    expect(map.towns).toHaveLength(105);
    const massalia = c.towns["massalia"]!;
    const tile = tileIndex(c, massalia.x, massalia.y);
    const info = tileInfo(c, 1, tile);
    expect(info.kind).toBe("town");
    expect(info.regionName).toBe("Massalia");
    expect(info.polity).toBe("massalia");
    expect(info.coastal).toBe(true);
    let land = 0;
    for (const t of map.terrain) if (t === "P" || t === "H" || t === "M") land++;
    expect(land).toBeGreaterThan(5000);
  });

  it("draws the same tile kinds from the same seed and different ones from another", () => {
    const c = content();
    const n = c.map.width * c.map.height;
    let same = true;
    let differs = 0;
    for (let t = 0; t < n; t += 7) {
      if (tileKind(c, 11, t) !== tileKind(c, 11, t)) same = false;
      if (tileKind(c, 11, t) !== tileKind(c, 12, t)) differs++;
    }
    expect(same).toBe(true);
    expect(differs).toBeGreaterThan(100);
  });

  it("puts more wild land in the mountains than on the plains", () => {
    const c = content();
    const n = c.map.width * c.map.height;
    const count: Record<string, { wild: number; all: number }> = { P: { wild: 0, all: 0 }, M: { wild: 0, all: 0 } };
    for (let t = 0; t < n; t++) {
      const terrain = c.map.terrain[t]!;
      if (terrain !== "P" && terrain !== "M") continue;
      if (c.townAtTile.has(t)) continue;
      count[terrain]!.all++;
      if (tileKind(c, 3, t) === "wild") count[terrain]!.wild++;
    }
    expect(count.M!.wild / count.M!.all).toBeGreaterThan(0.4);
    expect(count.P!.wild / count.P!.all).toBeLessThan(0.15);
  });
});
