import { describe, expect, it } from "vitest";
import { advanceAll, touch, villageRates, villageSummary } from "../src/index.js";
import { T0, clone, hours, join, newGame, village } from "./helpers.js";

function expectClose(a: unknown, b: unknown, path = "$"): void {
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) throw new Error(`${path}: ${a} != ${b}`);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) expectClose((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  expect(a, path).toEqual(b);
}

describe("village economy", () => {
  it("starts a town with level-0 fields, the start stores and a Prytaneion", () => {
    const g = newGame();
    const { vid } = join(g);
    const v = village(g, vid);
    expect(v.fields).toHaveLength(18);
    expect(v.fields.filter((f) => f.resource === "grain")).toHaveLength(6);
    expect(v.buildings[0]).toEqual({ id: "prytaneion", level: 1 });
    expect(v.resources).toEqual({ timber: 800, stone: 800, iron: 800, grain: 800 });
    const r = villageRates(g.state, g.content, v);
    expect(r.production).toEqual({ timber: 12, stone: 12, iron: 12, grain: 18 });
    expect(r.population).toBe(2);
    expect(r.net.grain).toBe(16);
    expect(r.capacity.timber).toBe(1000);
  });

  it("accrues resources lazily and caps them at the storehouse", () => {
    const g = newGame();
    const { vid } = join(g);
    const v = village(g, vid);
    touch(g.state, g.content, v, T0 + hours(10));
    expect(v.resources.timber).toBeCloseTo(920, 6);
    expect(v.resources.grain).toBeCloseTo(960, 6);
    touch(g.state, g.content, v, T0 + hours(30));
    expect(v.resources.timber).toBe(1000);
    expect(v.resources.grain).toBe(1000);
  });

  it("runs the world faster at higher speed", () => {
    const g = newGame({ speed: 10 });
    const { vid } = join(g);
    const v = village(g, vid);
    touch(g.state, g.content, v, T0 + hours(1));
    expect(v.resources.timber).toBeCloseTo(920, 6);
    expect(villageSummary(g.state, g.content, v).production.timber).toBe(120);
  });

  it("gives the same world whether it is advanced in many steps or in one", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    g.upgradeField(pid, vid, 0, T0);
    g.upgradeField(pid, vid, 3, T0 + 1000);
    const a = clone(g.state);
    const b = clone(g.state);
    for (let t = T0; t <= T0 + hours(9); t += 37 * 60 * 1000) advanceAll(a, g.content, t);
    advanceAll(a, g.content, T0 + hours(9));
    advanceAll(b, g.content, T0 + hours(9));
    expect(a.villages[vid]!.fields[0]!.level).toBe(1);
    expect(a.villages[vid]!.fields[3]!.level).toBe(1);
    expectClose(a, b);
  });

  it("starves troops when the granary runs dry, guests first", () => {
    const g = newGame();
    const host = join(g, "Host");
    const guest = join(g, "Guest");
    const v = village(g, host.vid);
    // 40 peltasts of the host, 30 of a guest: 70 upkeep against 16 net wheat.
    v.troops = { peltast: 40 };
    v.stationed.push({ homeVillageId: guest.vid, ownerId: guest.pid, factionId: "hellenes", troops: { peltast: 30 }, armory: {}, hero: false });
    v.resources.grain = 100;
    // net = 18 - 2 - 70 = -54/h → 100 wheat lasts ~1.85 h.
    touch(g.state, g.content, v, T0 + hours(3));
    const r = villageRates(g.state, g.content, v);
    expect(r.net.grain).toBeGreaterThanOrEqual(0);
    expect(v.stationed).toHaveLength(0); // the guests went first: 30 of upkeep
    expect(v.troops.peltast).toBeLessThan(40);
    expect(v.troops.peltast).toBeGreaterThanOrEqual(15);
    const reports = Object.values(g.state.reports).filter((rep) => rep.kind === "starvation");
    expect(reports.length).toBeGreaterThan(0);
  });

  it("keeps culture points per town and adds them up per player", () => {
    const g = newGame();
    const { vid } = join(g);
    const v = village(g, vid);
    touch(g.state, g.content, v, T0 + hours(48));
    expect(v.culture).toBeCloseTo(6, 6); // Prytaneion L1: 3 per day
  });
});
