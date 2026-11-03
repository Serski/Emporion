import { describe, expect, it } from "vitest";
import { constructionOptions, planBuild, touch, villageRates } from "../src/index.js";
import { T0, fill, hours, join, newGame, rich, setBuilding, village } from "./helpers.js";

describe("construction", () => {
  it("upgrades a field: pays up front, finishes on time, raises production", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const v = village(g, vid);
    const field = v.fields[0]!;
    expect(field.resource).toBe("timber");
    const res = g.upgradeField(pid, vid, 0, T0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.job.endAt - res.job.startAt).toBe(240_000); // 240 s at speed 1, Prytaneion L1
    expect(v.resources).toEqual({ timber: 755, stone: 715, iron: 745, grain: 750 });
    touch(g.state, g.content, v, res.job.endAt - 1);
    expect(field.level).toBe(0);
    touch(g.state, g.content, v, res.job.endAt);
    expect(field.level).toBe(1);
    expect(villageRates(g.state, g.content, v).production.timber).toBe(9 + 7);
    expect(v.buildQueue).toHaveLength(0);
  });

  it("holds two jobs and refuses a third while the builders are busy", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    expect(g.upgradeField(pid, vid, 0, T0).ok).toBe(true);
    const second = g.upgradeField(pid, vid, 1, T0);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.job.startAt).toBe(T0 + 240_000); // waits for the first
    const third = g.upgradeField(pid, vid, 2, T0);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.code).toBe("queue_full");
  });

  it("queues the same field twice as consecutive levels", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const a = g.upgradeField(pid, vid, 5, T0);
    const b = g.upgradeField(pid, vid, 5, T0);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.job.level).toBe(1);
      expect(b.job.level).toBe(2);
    }
    touch(g.state, g.content, village(g, vid), T0 + hours(2));
    expect(village(g, vid).fields[5]!.level).toBe(2);
  });

  it("cancels with a full refund and pulls the waiting job forward", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const v = village(g, vid);
    const before = { ...v.resources };
    const a = g.upgradeField(pid, vid, 0, T0);
    const b = g.upgradeField(pid, vid, 1, T0);
    if (!a.ok || !b.ok) throw new Error("setup");
    const c = g.cancelBuild(pid, vid, a.job.id, T0 + 1000);
    expect(c.ok).toBe(true);
    const waiting = v.buildQueue[0]!;
    expect(waiting.id).toBe(b.job.id);
    expect(waiting.startAt).toBe(T0 + 1000);
    g.cancelBuild(pid, vid, b.job.id, T0 + 2000);
    for (const r of g.content.resourceIds) expect(v.resources[r]).toBeCloseTo(before[r]! + (2000 / 3_600_000) * (r === "grain" ? 16 : 12), 3);
  });

  it("enforces building requirements", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    fill(g, vid);
    const v = village(g, vid);
    const slot = v.buildings.findIndex((b, i) => !b && i > 0 && i < 20);
    const res = g.construct(pid, vid, slot, "barracks", T0);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("requirements");
      expect(res.message).toMatch(/Prytaneion level 3/);
      expect(res.message).toMatch(/Muster Ground level 1/);
    }
    setBuilding(g, vid, "prytaneion", 3);
    setBuilding(g, vid, "muster_ground", 1);
    expect(g.construct(pid, vid, slot, "barracks", T0).ok).toBe(true);
  });

  it("keeps fixed sites for the Muster Ground and the Walls", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    fill(g, vid);
    const wrong = g.construct(pid, vid, 5, "walls", T0);
    expect(wrong.ok).toBe(false);
    const reserved = g.construct(pid, vid, 20, "cache", T0);
    expect(reserved.ok).toBe(false);
    expect(g.construct(pid, vid, 21, "walls", T0).ok).toBe(true);
  });

  it("allows a second storehouse only once the first is at its last level", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    rich(g, vid); // storehouse 20 + granary 20
    const v = village(g, vid);
    v.buildings.forEach((b) => b?.id === "storehouse" && (b.level = 19));
    const free = v.buildings.findIndex((b, i) => !b && i > 0 && i < 20);
    expect(g.construct(pid, vid, free, "storehouse", T0).ok).toBe(false);
    v.buildings.forEach((b) => b?.id === "storehouse" && (b.level = 20));
    expect(g.construct(pid, vid, free, "storehouse", T0).ok).toBe(true);
  });

  it("keeps the Acropolis to the capital and away from an Oikist's House", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    rich(g, vid);
    setBuilding(g, vid, "prytaneion", 5);
    const v = village(g, vid);
    const slot = v.buildings.findIndex((b, i) => !b && i > 0 && i < 20);
    expect(g.construct(pid, vid, slot, "oikist_house", T0).ok).toBe(true);
    const slot2 = v.buildings.findIndex((b, i) => !b && i > 0 && i < 20 && i !== slot);
    const acro = g.construct(pid, vid, slot2, "acropolis", T0);
    expect(acro.ok).toBe(false);
    if (!acro.ok) expect(acro.message).toMatch(/cannot stand beside/);
  });

  it("refuses buildings that would leave the town unable to feed itself", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const v = village(g, vid);
    v.troops = { peltast: 15 }; // net wheat 18 - 2 - 15 = 1
    const res = g.upgradeField(pid, vid, 0, T0); // a Timber Lot adds 2 people
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("food");
    const grainIndex = v.fields.findIndex((f) => f.resource === "grain");
    expect(g.upgradeField(pid, vid, grainIndex, T0).ok).toBe(true); // food fields are always allowed
  });

  it("builds faster with a higher Prytaneion", () => {
    const g = newGame();
    const { vid } = join(g);
    const v = village(g, vid);
    const slow = planBuild(g.state, g.content, v, { kind: "field", index: 0 }).durationMs;
    setBuilding(g, vid, "prytaneion", 10);
    const fast = planBuild(g.state, g.content, v, { kind: "field", index: 0 }).durationMs;
    expect(fast).toBeLessThan(slow);
    expect(fast / slow).toBeCloseTo(0.96 ** 9, 2);
  });

  it("lists what can be built on an empty site", () => {
    const g = newGame();
    const { vid } = join(g);
    const opts = constructionOptions(g.state, g.content, village(g, vid), 3);
    const avail = opts.filter((o) => o.available).map((o) => o.def.id);
    expect(avail).toContain("storehouse");
    expect(avail).toContain("granary");
    expect(avail).toContain("cache");
    expect(avail).not.toContain("barracks");
    expect(opts.find((o) => o.def.id === "walls")).toBeUndefined();
  });

  it("raises storage with a storehouse", () => {
    const g = newGame();
    const { pid, vid } = join(g);
    const v = village(g, vid);
    const res = g.construct(pid, vid, 1, "storehouse", T0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    touch(g.state, g.content, v, res.job.endAt);
    expect(villageRates(g.state, g.content, v).capacity.timber).toBe(1300);
    expect(villageRates(g.state, g.content, v).capacity.grain).toBe(1000);
  });
});
