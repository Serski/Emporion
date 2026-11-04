import type { Content } from "../content/load.js";
import type { BuildingDef } from "../content/schema.js";
import type { GameState, Ms, Player } from "../core/types.js";
import { addReport } from "../social/reports.js";
import { touch } from "../village/timeline.js";
import { calendarAt } from "../world/calendar.js";
import { addGoods } from "./house.js";

// ---------------------------------------------------------------------------
// The house's holdings: MASSALIA's estates and farms (buildings.json yields
// and staffing, buildingYield, seasonal production). A holding is a building
// with a goods yield. At each turn of the season every holding the house can
// staff lays its goods in the house's stores: base × growth^(level − 1), times
// the production factor of the season that ended for the good's category. A
// person staffs one holding; holdings are staffed town by town and site by
// site, and one the house cannot staff stands idle that season. Fractions of a
// good carry over to the next season.
// ---------------------------------------------------------------------------

export interface Holding {
  villageId: string;
  villageName: string;
  slot: number;
  buildingId: string;
  name: string;
  level: number;
  staff: Record<string, number>;
  staffed: boolean;
}

// The season of the year (0 = the first season) that runs at `at`.
export function seasonOfYear(state: GameState, content: Content, at: Ms): number {
  return calendarAt(state, content, at).seasonIndex % content.world.calendar.seasons.length;
}

// What a holding of this level yields in a season of the year.
export function holdingYield(content: Content, def: BuildingDef, level: number, season: number): Record<string, number> {
  const g = def.effects.goods;
  const out: Record<string, number> = {};
  if (!g || level <= 0) return out;
  const cfg = content.massalia.crafting.holdings;
  for (const [good, base] of Object.entries(g.yields)) {
    const category = content.goods[good]?.category ?? "yearround";
    const factor = cfg.production[category]?.[season] ?? 1;
    out[good] = base * cfg.growth ** (level - 1) * factor;
  }
  return out;
}

// Every holding of the house, in staffing order, and whether its staff is there.
export function holdingsOf(state: GameState, content: Content, p: Player): Holding[] {
  const left: Record<string, number> = { ...p.people };
  const out: Holding[] = [];
  for (const vid of p.villageIds) {
    const v = state.villages[vid];
    if (!v) continue;
    v.buildings.forEach((b, slot) => {
      if (!b || b.level <= 0) return;
      const def = content.buildings[b.id];
      const g = def?.effects.goods;
      if (!def || !g) return;
      const staffed = Object.entries(g.staff).every(([who, n]) => (left[who] ?? 0) >= n);
      if (staffed) for (const [who, n] of Object.entries(g.staff)) left[who] = (left[who] ?? 0) - n;
      out.push({ villageId: v.id, villageName: v.name, slot, buildingId: b.id, name: def.name, level: b.level, staff: g.staff, staffed });
    });
  }
  return out;
}

const list = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

// The turn of the season: the house reaps what its staffed holdings yielded.
export function reapHoldings(state: GameState, content: Content, p: Player, at: Ms): void {
  for (const vid of p.villageIds) {
    const v = state.villages[vid];
    if (v) touch(state, content, v, at);
  }
  const rows = holdingsOf(state, content, p);
  if (rows.length === 0) return;
  const ended = Math.max(state.settings.startedAt, at - 1);
  const season = seasonOfYear(state, content, ended);
  const got: Record<string, number> = {};
  const idle: string[] = [];
  for (const h of rows) {
    if (!h.staffed) {
      const who = Object.entries(h.staff)
        .map(([id, n]) => `${n} ${n === 1 ? (content.people[id]?.name.toLowerCase() ?? id) : (content.people[id]?.plural.toLowerCase() ?? id)}`)
        .join(" and ");
      idle.push(`The ${h.name} in ${h.villageName} stood idle: it needs ${who}.`);
      continue;
    }
    for (const [good, n] of Object.entries(holdingYield(content, content.buildings[h.buildingId]!, h.level, season))) {
      const carry = (p.goodsCarry[good] ?? 0) + n;
      const whole = Math.floor(carry + 1e-9);
      const rest = Math.round((carry - whole) * 1e6) / 1e6;
      if (rest > 0) p.goodsCarry[good] = rest;
      else delete p.goodsCarry[good];
      if (whole > 0) {
        addGoods(p, good, whole);
        got[good] = (got[good] ?? 0) + whole;
      }
    }
  }
  const brought = Object.entries(got).map(([g, n]) => `${n} ${((n === 1 ? content.goods[g]?.name : (content.goods[g]?.plural ?? content.goods[g]?.name)) ?? g).toLowerCase()}`);
  if (brought.length === 0 && idle.length === 0) return;
  const name = content.world.calendar.seasons[season] ?? "The season";
  const lines = [brought.length ? `${name} brought ${list(brought)} into your stores.` : `${name} brought nothing in.`, ...idle];
  addReport(state, at, "market", `The ${name.toLowerCase()} yield`, [p.id], { type: "simple", lines });
}
