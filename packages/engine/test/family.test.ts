import { describe, expect, it } from "vitest";
import {
  Game,
  calendarAt,
  familyMods,
  familyView,
  parseContent,
  personAge,
  rankings,
  yearMs,
  type Content,
  type GameState,
} from "../src/index.js";
import { T0, content, join, rawBundle, rich } from "./helpers.js";

// A content variant where every wife conceives every year and nobody dies in
// childbirth, so the family pack can be tested without luck.
function certainBirths(): Content {
  const raw = rawBundle();
  raw.family.children.yearlyChance = 1;
  raw.family.children.thirdPlusChance = 1;
  raw.family.children.birthDeathRisk = 0;
  raw.family.traits = raw.family.traits.map((t) => ({ ...t, childChanceBonus: 0, birthDeathRiskMod: 0 }));
  return parseContent(raw);
}

function game(c: Content = content()) {
  return Game.create(c, { startedAt: T0, speed: 1, npcCamps: 0, npcRaids: false, npcTowns: false, seed: 11 });
}

const YEAR = (g: Game) => yearMs(g.state, g.content);

function nextYear(g: Game, after: number) {
  const y = YEAR(g);
  return T0 + (Math.floor((after - T0) / y) + 1) * y;
}

describe("the house", () => {
  it("seats the hero as the head of a new house, twenty years old, with matches on offer", () => {
    const g = game();
    const { pid } = join(g, "Protis");
    const p = g.state.players[pid]!;
    expect(p.house?.name).toBe("House of Protis");
    expect(p.house?.head.name).toBe("Protis");
    expect(p.hero?.name).toBe("Protis");
    expect(personAge(g.state, g.content, p.house!.head, T0)).toBe(20);
    expect(p.house?.candidates).toHaveLength(3);
    expect(p.house?.candidates.every((c) => c.sex === "female")).toBe(true);
    expect(calendarAt(g.state, g.content, T0).label).toBe("Winter, 300 BC");
    expect(calendarAt(g.state, g.content, T0 + YEAR(g)).label).toBe("Winter, 299 BC");
  });

  it("ages the head one year every four seasons", () => {
    const g = game();
    const { pid } = join(g);
    const head = g.state.players[pid]!.house!.head;
    expect(personAge(g.state, g.content, head, T0 + YEAR(g) * 3 + 1)).toBe(23);
  });

  it("marries, and a dowried bride fills the capital's stores", () => {
    const g = game();
    const { pid, vid } = join(g);
    rich(g, vid, 100);
    const h = g.state.players[pid]!.house!;
    h.candidates[0]!.traitId = "dowried";
    const bride = h.candidates[0]!;
    const r = g.marry(pid, bride.id, T0 + 1000);
    expect(r.ok).toBe(true);
    expect(h.spouse?.name).toBe(bride.name);
    expect(h.candidates).toHaveLength(0);
    expect(g.state.villages[vid]!.resources.timber).toBeCloseTo(700, 0);
    expect(g.marry(pid, bride.id, T0 + 2000).ok).toBe(false);
  });

  it("gives the wife's trait to the hero: learned, stern, devout", () => {
    const g = game();
    const { pid } = join(g);
    const p = g.state.players[pid]!;
    const h = p.house!;
    h.candidates[0]!.traitId = "stern";
    g.marry(pid, h.candidates[0]!.id, T0);
    expect(familyMods(g.state, g.content, p, T0).defenseBonus).toBeCloseTo(0.05, 10);
    h.spouse!.traitId = "learned";
    expect(familyMods(g.state, g.content, p, T0).xpBonus).toBeCloseTo(0.1, 10);
  });

  it("weakens the hero with age", () => {
    const g = game();
    const { pid } = join(g);
    const p = g.state.players[pid]!;
    expect(familyMods(g.state, g.content, p, T0).strength).toBe(1);
    p.house!.head.bornAt = T0 - 60 * YEAR(g);
    expect(familyMods(g.state, g.content, p, T0).strength).toBe(0.85);
  });

  it("bears children each year when the wife is fertile", () => {
    const g = game(certainBirths());
    const { pid } = join(g);
    const h = g.state.players[pid]!.house!;
    h.candidates[0]!.bornAt = T0 - 20 * YEAR(g);
    g.marry(pid, h.candidates[0]!.id, T0);
    g.advanceAll(nextYear(g, T0));
    expect(h.children).toHaveLength(1);
    g.advanceAll(nextYear(g, T0) + YEAR(g) * 2);
    expect(h.children).toHaveLength(3);
    const reports = Object.values(g.state.reports).filter((r) => r.kind === "family");
    expect(reports.length).toBe(3);
  });

  it("passes the house to the eldest son of age, with half the experience", () => {
    const g = game();
    const { pid } = join(g, "Protis");
    const p = g.state.players[pid]!;
    const h = p.house!;
    p.hero!.xp = 2000;
    p.hero!.level = 6;
    h.head.deathAge = 21;
    h.children.push({ id: "f900", name: "Kimon", sex: "male", bornAt: T0 - 16 * YEAR(g), portrait: "avatar-20-2", traitId: null, deathAge: 60, diedAt: null, cause: null });
    h.children.push({ id: "f901", name: "Hieron", sex: "male", bornAt: T0 - 5 * YEAR(g), portrait: "avatar-20-3", traitId: null, deathAge: 60, diedAt: null, cause: null });
    g.advanceAll(nextYear(g, T0));
    expect(h.head.name).toBe("Kimon");
    expect(h.headKind).toBe("blood");
    expect(h.generation).toBe(2);
    expect(p.hero!.name).toBe("Kimon");
    expect(p.hero!.xp).toBe(1000);
    expect(p.hero!.status).toBe("home");
    expect(h.lineage).toHaveLength(1);
    expect(h.lineage[0]!.name).toBe("Protis");
    expect(h.kin.map((k) => k.name)).toContain("Hieron");
    const view = familyView(g.state, g.content, p, nextYear(g, T0))!;
    expect(view.head.name).toBe("Kimon");
    const row = rankings(g.state, g.content).find((r) => r.playerId === pid)!;
    expect(row.house).toBe("House of Protis");
    expect(row.heroName).toBe("Kimon");
    expect(row.heroXp).toBe(1000);
  });

  it("puts a regent in for a minor son, and hands over when he comes of age", () => {
    const g = game();
    const { pid } = join(g, "Protis");
    const p = g.state.players[pid]!;
    const h = p.house!;
    h.head.deathAge = 21;
    h.children.push({ id: "f910", name: "Kimon", sex: "male", bornAt: T0 - 13 * YEAR(g) - 1000, portrait: "avatar-20-2", traitId: null, deathAge: 60, diedAt: null, cause: null });
    g.advanceAll(nextYear(g, T0));
    expect(h.headKind).toBe("regent");
    expect(h.regentFor).toBe("f910");
    const regent = h.head.name;
    g.advanceAll(nextYear(g, T0) + YEAR(g));
    expect(h.head.name).toBe("Kimon");
    expect(h.headKind).toBe("blood");
    expect(h.kin.map((k) => k.name)).toContain(regent);
  });

  it("adopts a man when the head dies without sons", () => {
    const g = game();
    const { pid } = join(g, "Protis");
    const h = g.state.players[pid]!.house!;
    h.head.deathAge = 21;
    g.advanceAll(nextYear(g, T0));
    expect(h.headKind).toBe("forced");
    expect(h.head.name).not.toBe("Protis");
    expect(g.state.players[pid]!.hero!.name).toBe(h.head.name);
  });

  it("gives a house to players in a save from before the family pack", () => {
    const g = game();
    const { pid } = join(g);
    const state: GameState = JSON.parse(JSON.stringify(g.state));
    delete (state.players[pid] as { house?: unknown }).house;
    state.scheduled = state.scheduled.filter((e) => e.kind !== "familyYear");
    const back = Game.restore(g.content, state);
    expect(back.state.players[pid]!.house?.head.name).toBe(back.state.players[pid]!.hero!.name);
    expect(back.state.scheduled.some((e) => e.kind === "familyYear")).toBe(true);
  });
});
