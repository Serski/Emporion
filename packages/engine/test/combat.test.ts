import { describe, expect, it } from "vitest";
import { demolish, lossesAt, resolveBattle, resolveScouting, splitLoot, stacksOf, type BattleInput } from "../src/index.js";
import { content } from "./helpers.js";

const c = content();

function input(attacker: Record<string, number>, defender: Record<string, number>, over: Partial<BattleInput> = {}): BattleInput {
  return {
    mode: "attack",
    attacker: { stacks: stacksOf(c, attacker, {}), hero: null, morale: 1 },
    defenders: [{ stacks: stacksOf(c, defender, {}), hero: null }],
    wallLevel: 0,
    wallBonusPerLevel: 0.03,
    baseDefense: 10,
    armoryBonusPerLevel: 0.015,
    lossExponent: 1.5,
    raidLossExponent: 1.5,
    ...over,
  };
}

describe("battle math", () => {
  it("adds up attack, and defence against the attacker's mix of foot and horse", () => {
    // 100 peltasts: 3500 infantry attack. 50 hoplites: defInf 80 → 4000 + base 10.
    const r = resolveBattle(input({ peltast: 100 }, { hoplite: 50 }));
    expect(r.attackPower).toBe(3500);
    expect(r.defensePower).toBe(4010);
    expect(r.winner).toBe("defender");
    expect(r.attackerLossRate).toBe(1);
    expect(r.defenderLossRate).toBeCloseTo((3500 / 4010) ** 1.5, 10);
    // Against cavalry the hoplites defend with defCav 60.
    const cav = resolveBattle(input({ hippeus: 40 }, { hoplite: 50 }));
    expect(cav.attackPower).toBe(40 * 95);
    expect(cav.defensePower).toBe(50 * 60 + 10);
  });

  it("lets a stronger attacker win and lose (weak/strong)^1.5 of his army", () => {
    const r = resolveBattle(input({ epilektos: 200 }, { peltast: 100 }));
    // 15000 attack vs 2500 + 10 defence
    expect(r.winner).toBe("attacker");
    expect(r.defenderLossRate).toBe(1);
    expect(r.attackerLossRate).toBeCloseTo((2510 / 15000) ** 1.5, 10);
  });

  it("splits losses on a raid so both sides survive", () => {
    const r = resolveBattle(input({ epilektos: 200 }, { peltast: 100 }, { mode: "raid" }));
    const x = (2510 / 15000) ** 1.5;
    expect(r.winner).toBe("attacker");
    expect(r.attackerLossRate).toBeCloseTo(x / (1 + x), 10);
    expect(r.defenderLossRate).toBeCloseTo(1 / (1 + x), 10);
  });

  it("multiplies the whole defence by the wall", () => {
    const flat = resolveBattle(input({ peltast: 10 }, { hoplite: 10 }));
    const walled = resolveBattle(input({ peltast: 10 }, { hoplite: 10 }, { wallLevel: 10 }));
    expect(walled.defensePower).toBeCloseTo(flat.defensePower * 1.03 ** 10, 6);
  });

  it("reduces attack by morale and raises stats with armory levels", () => {
    const low = resolveBattle(input({ peltast: 100 }, {}, { attacker: { stacks: stacksOf(c, { peltast: 100 }, {}), hero: null, morale: 0.8 } }));
    expect(low.attackPower).toBeCloseTo(2800, 6);
    const upgraded = resolveBattle(input({ peltast: 100 }, {}, { attacker: { stacks: stacksOf(c, { peltast: 100 }, { peltast: 10 }), hero: null, morale: 1 } }));
    expect(upgraded.attackPower).toBeCloseTo(3500 * 1.15, 6);
  });

  it("adds the hero's strength and bonuses", () => {
    const r = resolveBattle(input({}, {}, { attacker: { stacks: stacksOf(c, { peltast: 100 }, {}), hero: { strength: 500, offenseBonus: 0.1, defenseBonus: 0 }, morale: 1 } }));
    expect(r.attackPower).toBeCloseTo((3500 + 500) * 1.1, 6);
  });

  it("rounds losses per unit type", () => {
    expect(lossesAt({ peltast: 10, hoplite: 3 }, 0.25)).toEqual({ peltast: 3, hoplite: 1 });
    expect(lossesAt({ peltast: 10 }, 1)).toEqual({ peltast: 10 });
    expect(lossesAt({ peltast: 10 }, 0)).toEqual({});
  });

  it("knocks structures down level by level", () => {
    // durability(L) = 2 · 1.12^(L-1): level 1 needs 2, level 2 needs 2.24 …
    expect(demolish(c, 5, 0, 1)).toBe(5);
    expect(demolish(c, 1, 2, 1)).toBe(0);
    expect(demolish(c, 2, 2.24, 1)).toBe(1);
    expect(demolish(c, 2, 4.24, 1)).toBe(0);
    expect(demolish(c, 2, 4.24, 1.1)).toBe(1); // a sturdier wall
  });

  it("splits loot evenly and fills from what is left", () => {
    expect(splitLoot({ timber: 1000, stone: 1000, iron: 1000, grain: 1000 }, 400)).toEqual({ timber: 100, stone: 100, iron: 100, grain: 100 });
    expect(splitLoot({ timber: 10, stone: 1000, iron: 1000, grain: 0 }, 400)).toEqual({ timber: 10, stone: 195, iron: 195, grain: 0 });
    expect(splitLoot({ timber: 50, stone: 50 }, 1000)).toEqual({ timber: 50, stone: 50 });
  });

  it("resolves scouting", () => {
    expect(resolveScouting(100, 0, 1.5)).toEqual({ success: true, detected: false, lossRate: 0 });
    const won = resolveScouting(100, 25, 1.5);
    expect(won.success).toBe(true);
    expect(won.lossRate).toBeCloseTo(0.125, 10);
    expect(resolveScouting(20, 25, 1.5)).toEqual({ success: false, detected: true, lossRate: 1 });
  });
});
