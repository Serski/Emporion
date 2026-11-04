import type { Content } from "../content/load.js";
import { HOUR } from "../core/time.js";
import { nextRandom } from "../core/rng.js";
import { fail, ok, type Result } from "../core/result.js";
import type { GameState, Ms, Player } from "../core/types.js";
import { headDies } from "../social/family.js";
import { addReport } from "../social/reports.js";
import { addGoods, goodsOf } from "./house.js";
import { addTrait, removeTrait, statOf } from "./profile.js";

// ---------------------------------------------------------------------------
// MASSALIA's hostile acts (interactions.json, interactions.ts), aimed at the
// head of a rival house. Poison costs a dose and may sicken or kill; an
// assassin costs drachmae and kills or fails. Both are spent whatever the
// outcome, both share one cooldown per target, and a target needs some
// prestige before anyone bothers. A physician, bodyguards and a guarding
// spymaster defend; a hunting spymaster attacks. A death passes the house on.
// ---------------------------------------------------------------------------

export interface PlotOdds {
  chance: number;
  attack: number;
  defence: number;
}

function clampChance(content: Content, x: number): number {
  const c = content.massalia.intrigue.chance;
  return Math.max(c.min, Math.min(c.max, x));
}

function has(p: Player, id: string): number {
  return p.people[id] ?? 0;
}

function attackOf(content: Content, actor: Player): number {
  const cfg = content.massalia.intrigue;
  return statOf(content, actor, "intelligence") + (has(actor, "spymaster") > 0 && actor.profile?.posture === "hunt" ? cfg.attack.spymasterHunt : 0);
}

function guardOf(content: Content, target: Player): number {
  return has(target, "spymaster") > 0 && target.profile?.posture === "guard" ? content.massalia.intrigue.defence.spymasterGuard : 0;
}

export function poisonOdds(content: Content, actor: Player, target: Player): PlotOdds {
  const cfg = content.massalia.intrigue;
  const attack = attackOf(content, actor);
  const defence = statOf(content, target, "intelligence") + (has(target, "physician") > 0 ? cfg.defence.physician : 0) + guardOf(content, target);
  return { chance: clampChance(content, cfg.poison.base + (attack - defence) / cfg.statScale), attack, defence };
}

export function assassinationOdds(content: Content, actor: Player, target: Player): PlotOdds {
  const cfg = content.massalia.intrigue;
  const attack = attackOf(content, actor);
  const guards = has(target, "bodyguard");
  const bodyguards = cfg.defence.bodyguardMax * (1 - 0.5 ** guards);
  const defence = statOf(content, target, "militia") * cfg.assassination.militiaWeight + bodyguards + guardOf(content, target);
  return { chance: clampChance(content, cfg.assassination.base + (attack - defence) / cfg.statScale), attack, defence };
}

export function plotCheck(state: GameState, content: Content, actor: Player | undefined, target: Player | undefined, at: Ms): Result {
  const cfg = content.massalia.intrigue;
  if (!actor?.profile) return fail("not_found", "No such house.");
  if (!target?.profile || !target.house || target.kind === "npc") return fail("invalid", "There is no head of a house there to plot against.");
  if (target.id === actor.id) return fail("invalid", "You cannot plot against your own house.");
  if (statOf(content, target, "prestige") < cfg.prestigeFloor) return fail("requirements", `${target.name} is too obscure to be worth it: plots start at ${cfg.prestigeFloor} prestige.`);
  const last = actor.profile.plots[target.id];
  const wait = (cfg.cooldownHours * HOUR) / state.settings.speed;
  if (last !== undefined && at - last < wait) return fail("busy", `Your last plot against ${target.name} is still talked about. Wait until it is forgotten.`);
  return ok({});
}

export interface PlotOutcome {
  success: boolean;
  outcome: "failed" | "ill" | "dead";
  chance: number;
}

function report(state: GameState, at: Ms, actor: Player, target: Player, title: string, mine: string[], theirs: string[]) {
  addReport(state, at, "intrigue", title, [actor.id], { type: "simple", lines: mine });
  addReport(state, at, "intrigue", title, [target.id], { type: "simple", lines: theirs });
}

export function poison(state: GameState, content: Content, actorId: string, targetId: string, at: Ms): Result<PlotOutcome> {
  const cfg = content.massalia.intrigue;
  const actor = state.players[actorId];
  const target = state.players[targetId];
  const check = plotCheck(state, content, actor, target, at);
  if (!check.ok) return check;
  if (goodsOf(actor!, cfg.poison.good) < 1) return fail("insufficient", "You have no poison. Your physician can mix it, or the agora sells it.");
  addGoods(actor!, cfg.poison.good, -1);
  actor!.profile!.plots[target!.id] = at;
  const odds = poisonOdds(content, actor!, target!);
  const head = target!.house!.head.name;
  if (nextRandom(state) >= odds.chance) {
    report(state, at, actor!, target!, `Poison for ${head} failed`, [`The dose meant for ${head} of ${target!.house!.name} was spilled or refused. Nothing happened.`], [`A cup in ${head}'s house was found to be poisoned and was poured away.`]);
    return ok({ success: false, outcome: "failed", chance: odds.chance });
  }
  if (nextRandom(state) < cfg.poison.illShare) {
    addTrait(state, content, target!, at, "poisoned");
    report(state, at, actor!, target!, `${head} is poisoned`, [`${head} of ${target!.house!.name} drank the dose and has fallen ill.`], [`${head} has been poisoned and lies ill. A physician with a remedy can cure him.`]);
    return ok({ success: true, outcome: "ill", chance: odds.chance });
  }
  report(state, at, actor!, target!, `${head} is dead`, [`${head} of ${target!.house!.name} drank the dose and died.`], [`${head} has died of poison.`]);
  headDies(state, content, target!, at, "poison");
  return ok({ success: true, outcome: "dead", chance: odds.chance });
}

export function assassinate(state: GameState, content: Content, actorId: string, targetId: string, at: Ms): Result<PlotOutcome> {
  const cfg = content.massalia.intrigue;
  const actor = state.players[actorId];
  const target = state.players[targetId];
  const check = plotCheck(state, content, actor, target, at);
  if (!check.ok) return check;
  if (actor!.purse < cfg.assassination.cost) return fail("insufficient", `An assassin costs ${cfg.assassination.cost} drachmae.`);
  actor!.purse -= cfg.assassination.cost;
  actor!.profile!.plots[target!.id] = at;
  const odds = assassinationOdds(content, actor!, target!);
  const head = target!.house!.head.name;
  if (nextRandom(state) >= odds.chance) {
    report(state, at, actor!, target!, `The knife missed ${head}`, [`Your assassin failed to reach ${head} of ${target!.house!.name}. The drachmae are gone.`], [`An assassin came for ${head} and failed.`]);
    return ok({ success: false, outcome: "failed", chance: odds.chance });
  }
  report(state, at, actor!, target!, `${head} is dead`, [`Your assassin killed ${head} of ${target!.house!.name}.`], [`${head} has been murdered.`]);
  headDies(state, content, target!, at, "an assassin's knife");
  return ok({ success: true, outcome: "dead", chance: odds.chance });
}

export function cure(state: GameState, content: Content, playerId: string, at: Ms): Result {
  const cfg = content.massalia.intrigue.cure;
  const p = state.players[playerId];
  if (!p?.profile) return fail("not_found", "No such house.");
  if (!p.profile.traits.includes("poisoned")) return fail("invalid", "Nobody in your house is poisoned.");
  if (has(p, cfg.needs) <= 0) return fail("requirements", `Only a ${content.people[cfg.needs]?.name.toLowerCase()} can treat poison. Hire one at the Agora.`);
  if (goodsOf(p, cfg.good) < 1) return fail("insufficient", `The treatment needs a ${content.goods[cfg.good]?.name.toLowerCase()}.`);
  addGoods(p, cfg.good, -1);
  removeTrait(state, content, p, at, "poisoned");
  return ok({});
}

export function setPosture(state: GameState, content: Content, playerId: string, posture: "guard" | "hunt", at: Ms): Result {
  const p = state.players[playerId];
  if (!p?.profile) return fail("not_found", "No such house.");
  if (has(p, "spymaster") <= 0) return fail("requirements", "Hire a spymaster first.");
  if (p.profile.posture === posture) return ok({});
  const wait = (content.massalia.intrigue.postureHours * HOUR) / state.settings.speed;
  if (p.profile.postureAt !== null && at - p.profile.postureAt < wait) return fail("busy", "Your spymaster changed his orders lately. Give him time.");
  p.profile.posture = posture;
  p.profile.postureAt = at;
  return ok({});
}
