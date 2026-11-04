import { describe, expect, it } from "vitest";
import { parseContent, tileDeposit, tileInfo, tileKind } from "../src/index.js";
import { content, rawBundle } from "./helpers.js";

describe("deposits", () => {
  it("lie only in valleys, one to a hex, where latitude, the sea and the states allow, the same for the same seed", () => {
    const c = content();
    const again = parseContent(rawBundle());
    const seed = 7;
    const counts: Record<string, number> = {};
    for (let t = 0; t < c.map.width * c.map.height; t++) {
      const d = tileDeposit(c, seed, t);
      expect(tileDeposit(again, seed, t)?.id ?? null).toBe(d?.id ?? null);
      if (!d) continue;
      expect(tileKind(c, seed, t)).toBe("valley");
      const row = Math.floor(t / c.map.width) / c.map.height;
      if (d.southOf !== undefined) expect(row).toBeGreaterThanOrEqual(d.southOf);
      if (d.polities) expect(d.polities).toContain(tileInfo(c, seed, t).polity);
      counts[d.id] = (counts[d.id] ?? 0) + 1;
    }
    for (const d of c.world.mapgen.deposits) expect(counts[d.id] ?? 0).toBeGreaterThan(5);
  });

  it("refuse content that puts a deposit on a state the map does not have", () => {
    const raw = rawBundle();
    raw.world.mapgen.deposits![2]!.polities = ["atlantis"];
    expect(() => parseContent(raw)).toThrow(/atlantis/);
  });
});
