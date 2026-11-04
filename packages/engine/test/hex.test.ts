import { describe, expect, it } from "vitest";
import {
  HEX_RADIUS,
  HEX_ROW,
  distance,
  hexAtPoint,
  hexCentre,
  hexLine,
  hexNeighbours,
  hexRing,
  hexesWithin,
  isCoastal,
  tileIndex,
  tileXY,
} from "../src/index.js";
import { content } from "./helpers.js";

describe("the hex grid", () => {
  const c = content();
  const mid = tileIndex(c, 90, 90);
  const odd = tileIndex(c, 90, 91);

  it("describes pointy-top hexes in odd-shifted rows", () => {
    expect(c.map.grid).toMatchObject({ shape: "hex", orientation: "pointy", offset: "odd-r" });
    expect(c.map.width * c.map.height).toBe(c.map.terrain.length);
  });

  it("gives every inner hex six neighbours, one step away, on even and odd rows", () => {
    for (const t of [mid, odd]) {
      const n = hexNeighbours(c, t);
      expect(new Set(n).size).toBe(6);
      for (const m of n) expect(distance(c, t, m)).toBe(1);
    }
    // An odd row leans east: its north-east neighbour is in the same column + 1.
    expect(hexNeighbours(c, odd)).toContain(tileIndex(c, 91, 90));
    expect(hexNeighbours(c, mid)).toContain(tileIndex(c, 89, 89));
  });

  it("counts distance in steps and rings of 6·r hexes", () => {
    for (let r = 1; r <= 6; r++) expect(hexRing(c, mid, r)).toHaveLength(6 * r);
    expect(hexesWithin(c, mid, 4)).toHaveLength(61);
    expect(distance(c, tileIndex(c, 90, 90), tileIndex(c, 95, 90))).toBe(5);
    expect(distance(c, tileIndex(c, 90, 90), tileIndex(c, 92, 94))).toBe(4);
    expect(distance(c, tileIndex(c, 90, 90), tileIndex(c, 90, 96))).toBe(6);
  });

  it("draws straight lines as unbroken chains of neighbours", () => {
    const a = tileIndex(c, 20, 40);
    const b = tileIndex(c, 140, 117);
    const line = hexLine(c, a, b);
    expect(line[0]).toBe(a);
    expect(line[line.length - 1]).toBe(b);
    expect(line).toHaveLength(distance(c, a, b) + 1);
    for (let i = 1; i < line.length; i++) expect(distance(c, line[i - 1]!, line[i]!)).toBe(1);
  });

  it("finds the hex under a point, and every hex's centre is inside it", () => {
    for (const t of [mid, odd, tileIndex(c, 0, 0), tileIndex(c, c.map.width - 1, c.map.height - 1)]) {
      const { x, y } = tileXY(c, t);
      const p = hexCentre(x, y);
      expect(hexAtPoint(p.x, p.y)).toEqual({ x, y });
      // Just inside the top point and the side edges.
      expect(hexAtPoint(p.x, p.y - HEX_RADIUS * 0.9)).toEqual({ x, y });
      expect(hexAtPoint(p.x + 0.45, p.y)).toEqual({ x, y });
      expect(hexAtPoint(p.x - 0.45, p.y)).toEqual({ x, y });
    }
    // Rows are √3/2 of a hex width apart.
    expect(hexCentre(0, 1).y - hexCentre(0, 0).y).toBeCloseTo(HEX_ROW, 9);
    expect(hexCentre(0, 1).x - hexCentre(0, 0).x).toBeCloseTo(0.5, 9);
  });

  it("marks land beside the sea as coast", () => {
    const massalia = c.towns["massalia"]!;
    expect(isCoastal(c, tileIndex(c, massalia.x, massalia.y))).toBe(true);
  });
});
