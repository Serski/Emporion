import type { Content } from "../content/load.js";
import { queuesFor } from "../content/load.js";
import { costAt, curveAt } from "../content/curves.js";
import type { BuildingDef, QueueDef, Requirement } from "../content/schema.js";
import { newId } from "../core/ids.js";
import { addResources, canAfford, pay } from "../core/resources.js";
import { fail, ok, type Fail, type Result } from "../core/result.js";
import { scaledMs } from "../core/time.js";
import type { BuildJob, GameState, Ms, Resources, Village } from "../core/types.js";
import { touch } from "../village/timeline.js";
import { buildingCount, buildingLevel, buildTimeFactor, maxFieldLevel, villageRates } from "../village/stats.js";

// ---------------------------------------------------------------------------
// Construction: resource fields and town buildings. Every job is "+1 level of
// this field / this slot". Jobs are paid when queued, run one after another in
// their queue, and complete on the village timeline. Cancelling refunds in
// full and pulls the waiting jobs forward.
// ---------------------------------------------------------------------------

export function ownVillage(state: GameState, playerId: string, villageId: string): Result<{ v: Village }> {
  const v = state.villages[villageId];
  if (!v) return fail("not_found", "No such town.");
  if (v.ownerId !== playerId) return fail("not_owner", "That town is not yours.");
  if (v.kind !== "player") return fail("invalid", "That place cannot be managed.");
  return ok({ v });
}

type Target = { kind: "field"; index: number } | { kind: "building"; slot: number; buildingId: string };

export interface BuildPlan {
  target: Target;
  name: string;
  fromLevel: number; // the level the job starts from (after queued jobs)
  toLevel: number;
  maxLevel: number;
  cost: Resources;
  durationMs: Ms;
  pop: number;
  queue: QueueDef | null;
  check: Result;
}

function queuedFor(v: Village, target: Target): BuildJob[] {
  return v.buildQueue.filter((j) =>
    target.kind === "field" ? j.kind === "field" && j.index === target.index : j.kind === "building" && j.index === target.slot,
  );
}

function freeQueue(content: Content, state: GameState, v: Village, kind: "field" | "building"): QueueDef | null {
  const factionId = state.players[v.ownerId]?.factionId ?? "";
  for (const q of queuesFor(content, factionId)) {
    if (!q.accepts.includes(kind)) continue;
    if (v.buildQueue.filter((j) => j.queue === q.id).length < q.size) return q;
  }
  return null;
}

export function requirementMet(v: Village, r: Requirement): boolean {
  if ("building" in r) return buildingLevel(v, r.building) >= r.level;
  return maxFieldLevel(v, r.field) >= r.level;
}

export function requirementText(content: Content, r: Requirement): string {
  if ("building" in r) return `${content.buildings[r.building]?.name ?? r.building} level ${r.level}`;
  return `${content.fields[r.field]?.name ?? r.field} level ${r.level}`;
}

// Why this building cannot be started in this slot, or null if it can.
export function constructionBlocker(state: GameState, content: Content, v: Village, slot: number, def: BuildingDef): Fail | null {
  if (slot < 0 || slot >= v.buildings.length) return fail("invalid", "No such building site.");
  if (v.buildings[slot] || v.buildQueue.some((j) => j.kind === "building" && j.index === slot)) {
    return fail("invalid", "That site is already taken.");
  }
  const fixedHere = content.buildingList.find((b) => b.fixedSlot === slot);
  if (def.fixedSlot !== undefined && def.fixedSlot !== slot) return fail("invalid", `${def.name} has its own site.`);
  if (fixedHere && fixedHere.id !== def.id) return fail("invalid", `This site is reserved for the ${fixedHere.name}.`);
  const owner = state.players[v.ownerId];
  if (def.factions && owner && !def.factions.includes(owner.factionId)) return fail("requirements", `Your people cannot build a ${def.name}.`);
  if (def.capitalOnly && !v.isCapital) return fail("requirements", `${def.name} can only stand in your capital.`);
  if (def.notInCapital && v.isCapital) return fail("requirements", `${def.name} cannot stand in your capital.`);
  const planned = (id: string) => buildingCount(v, id) + v.buildQueue.filter((j) => j.kind === "building" && j.buildingId === id && !v.buildings[j.index]).length;
  for (const other of def.exclusiveWith ?? []) {
    if (planned(other) > 0) return fail("requirements", `${def.name} cannot stand beside a ${content.buildings[other]?.name ?? other}.`);
  }
  if (def.onePerPlayer && owner) {
    const anywhere = owner.villageIds.some((id) => {
      const ov = state.villages[id];
      return !!ov && (buildingCount(ov, def.id) > 0 || ov.buildQueue.some((j) => j.kind === "building" && j.buildingId === def.id));
    });
    if (anywhere) return fail("requirements", `You can have only one ${def.name}.`);
  }
  const existing = planned(def.id);
  if (existing > 0) {
    if (!def.multiple) return fail("requirements", `This town already has a ${def.name}.`);
    const allMax = v.buildings.every((b) => !b || b.id !== def.id || b.level >= def.maxLevel);
    const queuedNew = v.buildQueue.some((j) => j.kind === "building" && j.buildingId === def.id && !v.buildings[j.index]);
    if (!allMax || queuedNew) return fail("requirements", `Raise your ${def.name} to level ${def.maxLevel} before building another.`);
  }
  const missing = def.requires.filter((r) => !requirementMet(v, r));
  if (missing.length) return fail("requirements", `Needs ${missing.map((r) => requirementText(content, r)).join(", ")}.`);
  return null;
}

export function planBuild(state: GameState, content: Content, v: Village, target: Target): BuildPlan {
  const queued = queuedFor(v, target);
  let name: string;
  let current: number;
  let maxLevel: number;
  let costCurve;
  let timeCurve;
  let popCurve;
  let food = false;
  let blocker: Fail | null = null;
  if (target.kind === "field") {
    const field = v.fields[target.index];
    const def = field ? content.fields[field.resource] : undefined;
    if (!field || !def) {
      return { target, name: "?", fromLevel: 0, toLevel: 0, maxLevel: 0, cost: {}, durationMs: 0, pop: 0, queue: null, check: fail("not_found", "No such field.") };
    }
    name = def.name;
    current = field.level;
    maxLevel = v.isCapital ? def.maxLevelCapital : def.maxLevel;
    costCurve = def.cost;
    timeCurve = def.time;
    popCurve = def.pop;
    food = field.resource === content.food;
  } else {
    const def = content.buildings[target.buildingId];
    if (!def) {
      return { target, name: "?", fromLevel: 0, toLevel: 0, maxLevel: 0, cost: {}, durationMs: 0, pop: 0, queue: null, check: fail("not_found", "No such building.") };
    }
    const slot = v.buildings[target.slot];
    name = def.name;
    current = slot && slot.id === def.id ? slot.level : 0;
    if (!slot && queued.length === 0) blocker = constructionBlocker(state, content, v, target.slot, def);
    if (slot && slot.id !== def.id) blocker = fail("invalid", "Another building stands here.");
    maxLevel = def.maxLevel;
    costCurve = def.cost;
    timeCurve = def.time;
    popCurve = def.pop;
  }
  const fromLevel = current + queued.length;
  const toLevel = fromLevel + 1;
  const cost = costAt(costCurve, toLevel);
  const durationMs = scaledMs(state, curveAt(timeCurve, toLevel) * buildTimeFactor(content, v));
  const pop = curveAt(popCurve, toLevel);
  const queue = freeQueue(content, state, v, target.kind);
  let check: Result = ok({});
  if (blocker) check = blocker;
  else if (toLevel > maxLevel) check = fail("max_level", `${name} is at its highest level.`);
  else if (!queue) check = fail("queue_full", "Your builders are busy. Wait for a job to finish.");
  else if (!food && foodAfter(state, content, v, pop) < 0) {
    check = fail("food", `Not enough wheat to feed more people. Raise a ${content.fields[content.food]?.name ?? "food field"} first.`);
  } else if (!canAfford(v.resources, cost)) check = fail("insufficient", "Not enough resources.");
  return { target, name, fromLevel, toLevel, maxLevel, cost, durationMs, pop, queue, check };
}

// Net food per hour once every queued job and `extraPop` more people are in.
function foodAfter(state: GameState, content: Content, v: Village, extraPop: number): number {
  const rates = villageRates(state, content, v);
  let pending = extraPop;
  for (const j of v.buildQueue) {
    if (j.kind === "field") {
      const def = content.fields[v.fields[j.index]?.resource ?? ""];
      if (def) pending += curveAt(def.pop, j.level);
    } else {
      const def = content.buildings[j.buildingId];
      if (def) pending += curveAt(def.pop, j.level);
    }
  }
  return (rates.net[content.food] ?? 0) - pending * content.world.village.popUpkeep;
}

function enqueue(state: GameState, v: Village, plan: BuildPlan, now: Ms): BuildJob {
  const q = plan.queue!;
  const last = v.buildQueue.filter((j) => j.queue === q.id).reduce((m, j) => Math.max(m, j.endAt), now);
  pay(v.resources, plan.cost);
  const job: BuildJob = {
    id: newId(state, "j"),
    queue: q.id,
    kind: plan.target.kind,
    index: plan.target.kind === "field" ? plan.target.index : plan.target.slot,
    buildingId: plan.target.kind === "field" ? v.fields[plan.target.index]!.resource : plan.target.buildingId,
    level: plan.toLevel,
    startAt: last,
    endAt: last + plan.durationMs,
    cost: plan.cost,
  };
  v.buildQueue.push(job);
  return job;
}

export function upgradeField(state: GameState, content: Content, playerId: string, villageId: string, index: number, now: Ms): Result<{ job: BuildJob }> {
  const own = ownVillage(state, playerId, villageId);
  if (!own.ok) return own;
  touch(state, content, own.v, now);
  const plan = planBuild(state, content, own.v, { kind: "field", index });
  if (!plan.check.ok) return plan.check;
  return ok({ job: enqueue(state, own.v, plan, now) });
}

export function construct(
  state: GameState,
  content: Content,
  playerId: string,
  villageId: string,
  slot: number,
  buildingId: string,
  now: Ms,
): Result<{ job: BuildJob }> {
  const own = ownVillage(state, playerId, villageId);
  if (!own.ok) return own;
  touch(state, content, own.v, now);
  const existing = own.v.buildings[slot];
  if (existing && existing.id !== buildingId) return fail("invalid", "Another building stands here.");
  const plan = planBuild(state, content, own.v, { kind: "building", slot, buildingId });
  if (!plan.check.ok) return plan.check;
  return ok({ job: enqueue(state, own.v, plan, now) });
}

export function upgradeBuilding(state: GameState, content: Content, playerId: string, villageId: string, slot: number, now: Ms): Result<{ job: BuildJob }> {
  const own = ownVillage(state, playerId, villageId);
  if (!own.ok) return own;
  const b = own.v.buildings[slot];
  const queued = own.v.buildQueue.find((j) => j.kind === "building" && j.index === slot);
  const buildingId = b?.id ?? queued?.buildingId;
  if (!buildingId) return fail("not_found", "Nothing stands on that site.");
  return construct(state, content, playerId, villageId, slot, buildingId, now);
}

export function cancelBuild(state: GameState, content: Content, playerId: string, villageId: string, jobId: string, now: Ms): Result<{ refunded: Resources }> {
  const own = ownVillage(state, playerId, villageId);
  if (!own.ok) return own;
  const v = own.v;
  touch(state, content, v, now);
  const job = v.buildQueue.find((j) => j.id === jobId);
  if (!job) return fail("not_found", "That job has already finished.");
  // The job and every later job on the same field or site go together.
  const drop = v.buildQueue.filter((j) => j.kind === job.kind && j.index === job.index && j.level >= job.level);
  const refunded: Resources = {};
  for (const j of drop) addResources(refunded, j.cost);
  addResources(v.resources, refunded);
  v.buildQueue = v.buildQueue.filter((j) => !drop.includes(j));
  // Pull the waiting jobs of each queue forward.
  const byQueue = new Map<string, BuildJob[]>();
  for (const j of v.buildQueue) byQueue.set(j.queue, [...(byQueue.get(j.queue) ?? []), j]);
  for (const jobs of byQueue.values()) {
    jobs.sort((a, b) => a.startAt - b.startAt);
    let prevEnd = now;
    for (const j of jobs) {
      if (j.startAt <= now) {
        prevEnd = Math.max(prevEnd, j.endAt);
        continue;
      }
      const duration = j.endAt - j.startAt;
      j.startAt = Math.max(now, prevEnd);
      j.endAt = j.startAt + duration;
      prevEnd = j.endAt;
    }
  }
  return ok({ refunded });
}
