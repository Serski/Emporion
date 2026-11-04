import type { Content } from "../content/load.js";
import { fail, ok, type Result } from "../core/result.js";
import type { GameState, Ms, Player, Profile } from "../core/types.js";
import { buildingLevel } from "../village/stats.js";
import { touch } from "../village/timeline.js";
import { calendarAt } from "../world/calendar.js";

// ---------------------------------------------------------------------------
// MASSALIA's character sheet, for the head of each house: four stats
// (prestige, devotion, militia, intelligence) capped at 100, traits that add
// to them, composure, and the four ladders a routine feeds. Every season the
// head spends one day on a routine (MASSALIA: one a real day, which there is a
// season). What the stats do is EMPORION's own (content/massalia/profile.json).
// ---------------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function createProfile(content: Content, factionId: string): Profile {
  const cfg = content.massalia.profile;
  const stats: Record<string, number> = {};
  for (const s of cfg.stats) stats[s.id] = clamp(cfg.start[factionId]?.[s.id] ?? 0, 0, cfg.cap);
  return {
    stats,
    composure: cfg.composure.start,
    withdrawnSeason: null,
    ladders: {},
    traits: [],
    day: { season: -1, picks: 0, lastRoutine: null, lastSeason: null },
    posture: "guard",
    postureAt: null,
    plots: {},
  };
}

// Base stats plus what the held traits add, capped.
export function effectiveStats(content: Content, profile: Profile): Record<string, number> {
  const cfg = content.massalia.profile;
  const out: Record<string, number> = {};
  for (const s of cfg.stats) {
    let v = profile.stats[s.id] ?? 0;
    for (const t of profile.traits) v += content.profileTraits[t]?.stats[s.id] ?? 0;
    out[s.id] = clamp(v, 0, cfg.cap);
  }
  return out;
}

export function statOf(content: Content, p: Player | undefined, id: string): number {
  return p?.profile ? (effectiveStats(content, p.profile)[id] ?? 0) : 0;
}

// Prestige feeds every town's culture, so the towns are brought up to `at`
// before it changes (their timelines must stay exact).
function touchTowns(state: GameState, content: Content, p: Player, at: Ms) {
  for (const id of p.villageIds) {
    const v = state.villages[id];
    if (v) touch(state, content, v, at);
  }
}

export function changeStats(state: GameState, content: Content, p: Player, at: Ms, delta: Record<string, number>): void {
  const prof = p.profile;
  if (!prof) return;
  if (delta.prestige) touchTowns(state, content, p, at);
  const cap = content.massalia.profile.cap;
  for (const [k, d] of Object.entries(delta)) {
    if (!(k in prof.stats)) continue;
    prof.stats[k] = clamp(Math.round((prof.stats[k] ?? 0) + d), 0, cap);
  }
}

export function setTraits(state: GameState, content: Content, p: Player, at: Ms, traits: string[]): void {
  if (!p.profile) return;
  const before = p.profile.traits.reduce((n, t) => n + (content.profileTraits[t]?.stats.prestige ?? 0), 0);
  const after = traits.reduce((n, t) => n + (content.profileTraits[t]?.stats.prestige ?? 0), 0);
  if (before !== after) touchTowns(state, content, p, at);
  p.profile.traits = traits;
}

export function addTrait(state: GameState, content: Content, p: Player, at: Ms, trait: string): void {
  if (!p.profile || p.profile.traits.includes(trait)) return;
  setTraits(state, content, p, at, [...p.profile.traits, trait]);
}

export function removeTrait(state: GameState, content: Content, p: Player, at: Ms, trait: string): void {
  if (!p.profile) return;
  setTraits(
    state,
    content,
    p,
    at,
    p.profile.traits.filter((t) => t !== trait),
  );
}

export function changeComposure(state: GameState, content: Content, p: Player, at: Ms, delta: number): { broke: boolean } {
  const prof = p.profile;
  if (!prof) return { broke: false };
  prof.composure = clamp(prof.composure + delta, 0, 100);
  if (prof.composure <= 0) {
    prof.composure = content.massalia.profile.composure.breakResetTo;
    prof.withdrawnSeason = calendarAt(state, content, at).seasonIndex;
    return { broke: true };
  }
  return { broke: false };
}

// --- what the stats do ---------------------------------------------------------

export function prestigeCultureFactor(content: Content, p: Player | undefined): number {
  return 1 + statOf(content, p, "prestige") * content.massalia.profile.effects.prestigeCulture;
}

export function heroStatFactor(content: Content, p: Player | undefined): number {
  let f = 1 + statOf(content, p, "militia") * content.massalia.profile.effects.militiaHero;
  for (const t of p?.profile?.traits ?? []) f += content.profileTraits[t]?.heroStrength ?? 0;
  return Math.max(0.1, f);
}

export function scoutStatFactor(content: Content, p: Player | undefined): number {
  return 1 + statOf(content, p, "intelligence") * content.massalia.profile.effects.intelligenceScouts;
}

// --- the day: one routine a season -----------------------------------------------

export interface RoutineOption {
  id: string;
  name: string;
  pool: string;
  effects: Record<string, number>; // what it would give now (boosts and repeats applied)
  ladder: string | null;
  xp: number;
  fee: number; // 0 when waived
  needs: { good: string; qty: number; keep: boolean } | null; // null when waived
  waived: boolean;
  boostedBy: string | null; // the hired person who boosts it
  repeat: boolean;
  check: Result;
}

export interface DayView {
  season: number;
  picked: number;
  picksPerSeason: number;
  withdrawn: boolean;
  lastRoutine: string | null;
  options: RoutineOption[];
}

function capitalOf(state: GameState, p: Player) {
  return p.capitalId ? state.villages[p.capitalId] : undefined;
}

function evaluate(state: GameState, content: Content, p: Player, routineId: string, season: number): RoutineOption | null {
  const r = content.routines[routineId];
  const prof = p.profile;
  if (!r || !prof) return null;
  const cfg = content.massalia.profile;
  const capital = capitalOf(state, p);
  const waived = !!r.waivedBy && !!capital && buildingLevel(capital, r.waivedBy) > 0;
  const boostEntry = Object.entries(r.boostedBy ?? {}).find(([who]) => (p.people[who] ?? 0) > 0);
  const boost = boostEntry?.[1];
  const repeat = prof.day.lastRoutine === r.id && prof.day.lastSeason === season - 1;
  const rep = repeat ? cfg.day.repeatPenalty : 1;
  const effects: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.effects)) {
    if (k === "composure") effects[k] = v + (boost?.composure ?? 0);
    else effects[k] = v > 0 ? Math.round(v * (boost?.amount ?? 1) * rep) : v;
  }
  if (boost && !("composure" in r.effects) && boost.composure) effects.composure = boost.composure;
  const xp = r.ladder ? Math.round((r.xp ?? 0) * (boost?.xp ?? 1) * rep) : 0;
  const fee = waived ? 0 : (r.fee ?? 0);
  const needs = waived || !r.needs ? null : { good: r.needs.good, qty: r.needs.qty, keep: !!r.needs.keep };
  let check: Result = ok({});
  const opener = cfg.pools[r.pool];
  if (opener && (p.people[opener] ?? 0) <= 0) check = fail("requirements", `Only a house that keeps a ${content.people[opener]?.name.toLowerCase()} may do this.`);
  else if (prof.withdrawnSeason === season) check = fail("busy", "The head of the house has withdrawn from public life until next season.");
  else if (prof.day.season === season && prof.day.picks >= cfg.day.picksPerSeason) check = fail("busy", "This season's day is spent. A new one comes with the next season.");
  else if (fee > p.purse) check = fail("insufficient", `You need ${fee} drachmae for that.`);
  else if (needs && (p.goods[needs.good] ?? 0) < needs.qty) check = fail("insufficient", `You need ${needs.qty} ${content.goods[needs.good]?.name.toLowerCase() ?? needs.good} for that. The agora sells it.`);
  return {
    id: r.id,
    name: r.name,
    pool: r.pool,
    effects,
    ladder: r.ladder ?? null,
    xp,
    fee,
    needs,
    waived,
    boostedBy: boostEntry?.[0] ?? null,
    repeat,
    check,
  };
}

export function dayView(state: GameState, content: Content, p: Player, at: Ms): DayView | null {
  const prof = p.profile;
  if (!prof) return null;
  const season = calendarAt(state, content, at).seasonIndex;
  const cfg = content.massalia.profile;
  const options: RoutineOption[] = [];
  for (const r of cfg.routines) {
    const opener = cfg.pools[r.pool];
    if (opener && (p.people[opener] ?? 0) <= 0) continue;
    const o = evaluate(state, content, p, r.id, season);
    if (o) options.push(o);
  }
  return {
    season,
    picked: prof.day.season === season ? prof.day.picks : 0,
    picksPerSeason: cfg.day.picksPerSeason,
    withdrawn: prof.withdrawnSeason === season,
    lastRoutine: prof.day.lastRoutine,
    options,
  };
}

// A ladder's highest tier reached replaces the lower ones.
function ladderTraits(content: Content, prof: Profile): string[] {
  const out = prof.traits.filter((t) => !Object.values(content.ladders).some((l) => l.tiers.some((x) => x.trait === t)));
  for (const l of Object.values(content.ladders)) {
    const xp = prof.ladders[l.id] ?? 0;
    let best: string | null = null;
    for (const tier of l.tiers) if (xp >= tier.xp) best = tier.trait;
    if (best) out.push(best);
  }
  return out;
}

export function doRoutine(state: GameState, content: Content, playerId: string, routineId: string, at: Ms): Result<{ option: RoutineOption; broke: boolean; newTraits: string[] }> {
  const p = state.players[playerId];
  if (!p?.profile) return fail("not_found", "No such house.");
  const season = calendarAt(state, content, at).seasonIndex;
  const o = evaluate(state, content, p, routineId, season);
  if (!o) return fail("not_found", "There is no such routine.");
  if (!o.check.ok) return o.check;
  const prof = p.profile;
  p.purse -= o.fee;
  if (o.needs && !o.needs.keep) p.goods[o.needs.good] = (p.goods[o.needs.good] ?? 0) - o.needs.qty;
  const statDelta: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.effects)) {
    if (k === "drachmae") p.purse = Math.max(0, p.purse + v);
    else if (k !== "composure") statDelta[k] = v;
  }
  changeStats(state, content, p, at, statDelta);
  if (o.ladder) prof.ladders[o.ladder] = (prof.ladders[o.ladder] ?? 0) + o.xp;
  const before = new Set(prof.traits);
  setTraits(state, content, p, at, ladderTraits(content, prof));
  const newTraits = prof.traits.filter((t) => !before.has(t));
  if (prof.day.season !== season) prof.day = { ...prof.day, season, picks: 0 };
  prof.day.picks += 1;
  prof.day.lastRoutine = o.id;
  prof.day.lastSeason = season;
  const { broke } = changeComposure(state, content, p, at, o.effects.composure ?? 0);
  return ok({ option: o, broke, newTraits });
}

// --- age and succession ----------------------------------------------------------

// Once a year an older head loses militia, then wits and devotion (MASSALIA's
// old-age decay). Prestige never fades.
export function ageDecay(state: GameState, content: Content, p: Player, age: number, at: Ms): void {
  if (!p.profile) return;
  let row: Record<string, number> | null = null;
  for (const d of content.massalia.profile.decay) if (age >= d.fromAge) row = d;
  if (!row) return;
  const delta: Record<string, number> = {};
  for (const [k, v] of Object.entries(row)) if (k !== "fromAge") delta[k] = -v;
  changeStats(state, content, p, at, delta);
}

// The heir keeps the house's prestige and part of the rest; the dead head's
// learning and afflictions go with him.
export function inheritProfile(state: GameState, content: Content, p: Player, at: Ms): void {
  const prof = p.profile;
  if (!prof) return;
  const cfg = content.massalia.profile;
  touchTowns(state, content, p, at);
  for (const s of cfg.stats) prof.stats[s.id] = Math.round((prof.stats[s.id] ?? 0) * (cfg.succession.keep[s.id] ?? 0));
  prof.ladders = {};
  prof.traits = [];
  prof.composure = cfg.composure.start;
  prof.withdrawnSeason = null;
}
