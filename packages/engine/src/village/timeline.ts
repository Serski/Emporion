import type { Content } from "../content/load.js";
import { DAY, HOUR } from "../core/time.js";
import { addTroops, cleanTroops, troopCount } from "../core/resources.js";
import type { GameState, Ms, Troops, Village } from "../core/types.js";
import { addReport } from "../social/reports.js";
import { transitUpkeep, troopUpkeep, villageRates, type VillageRates } from "./stats.js";

// ---------------------------------------------------------------------------
// The village timeline. A village is advanced lazily: `touch(v, t)` walks from
// its cursor to t, stopping at every internal event (a construction finishing,
// a unit leaving the barracks, research or an armory upgrade completing, a
// festival ending, the hero revived, the granary running dry with troops to
// feed). Between two events every rate is constant, so accrual is exact:
// touching at t1 then t2 gives the same village as touching at t2 once.
//
// All event times are whole milliseconds, so completions land exactly.
// Rule: any code that changes a village at time t calls touch(v, t) first.
// ---------------------------------------------------------------------------

const EPS = 1e-6;

export function touch(state: GameState, content: Content, v: Village, t: Ms): void {
  const transit = transitUpkeep(state, content, v.id);
  for (let guard = 0; ; guard++) {
    if (guard > 2_000_000) throw new Error(`timeline runaway in ${v.id}`);
    const rates = villageRates(state, content, v, transit);
    if (applyDue(state, content, v, rates)) continue;
    if (v.updatedAt >= t) return;
    const next = nextEventAt(state, content, v, rates);
    const to = Math.min(t, next);
    accrue(state, content, v, rates, to);
    v.updatedAt = to;
  }
}

export function touchId(state: GameState, content: Content, villageId: string | null | undefined, t: Ms): Village | null {
  if (!villageId) return null;
  const v = state.villages[villageId];
  if (!v) return null;
  touch(state, content, v, t);
  return v;
}

function killableUpkeep(state: GameState, content: Content, v: Village): number {
  let n = troopUpkeep(content, v.troops);
  for (const s of v.stationed) n += troopUpkeep(content, s.troops);
  for (const tile of v.oases) for (const s of state.oases[tile]?.stationed ?? []) n += troopUpkeep(content, s.troops);
  return n;
}

function nextEventAt(state: GameState, content: Content, v: Village, rates: VillageRates): Ms {
  const now = v.updatedAt;
  let next = Infinity;
  const consider = (at: number) => {
    if (at > now && at < next) next = at;
  };
  for (const j of v.buildQueue) consider(j.endAt);
  for (const b of v.training) consider(b.startAt + (b.done + 1) * b.unitMs);
  if (v.research.job) consider(v.research.job.endAt);
  if (v.armory.job) consider(v.armory.job.endAt);
  if (v.festival) consider(v.festival.endAt);
  const hero = state.players[v.ownerId]?.hero;
  if (hero && hero.homeVillageId === v.id && hero.status === "reviving" && hero.reviveAt !== null) consider(hero.reviveAt);
  const net = rates.net[content.food] ?? 0;
  if (net < -EPS && killableUpkeep(state, content, v) > 0) {
    const perMs = (-net * state.settings.speed) / HOUR;
    const food = v.resources[content.food] ?? 0;
    consider(now + Math.max(1, Math.ceil(food / perMs)));
  }
  return next;
}

function accrue(state: GameState, content: Content, v: Village, rates: VillageRates, to: Ms): void {
  const dt = to - v.updatedAt;
  if (dt <= 0) return;
  const hours = (state.settings.speed * dt) / HOUR;
  for (const r of content.resourceIds) {
    const cap = rates.capacity[r] ?? 0;
    let a = (v.resources[r] ?? 0) + (rates.net[r] ?? 0) * hours;
    if (Math.abs(a) < EPS) a = 0;
    v.resources[r] = Math.max(0, Math.min(cap, a));
  }
  v.culture += (rates.culturePerDay * state.settings.speed * dt) / DAY;
  if (v.loyalty < 100) v.loyalty = Math.min(100, v.loyalty + rates.loyaltyPerHour * hours);
  let anyTribute = false;
  for (const r of content.resourceIds) if ((rates.tribute[r] ?? 0) > 0) anyTribute = true;
  if (anyTribute) {
    for (const r of content.resourceIds) {
      const rate = rates.tribute[r] ?? 0;
      const cap = rate * content.kingdoms.tribute.capHours;
      v.tribute[r] = Math.min(Math.max(cap, v.tribute[r] ?? 0), (v.tribute[r] ?? 0) + rate * hours);
    }
  }
  if (v.npc) regenerate(v, dt);
}

function regenerate(v: Village, dt: Ms): void {
  const npc = v.npc!;
  for (const [unit, target] of Object.entries(npc.garrison)) {
    const have = v.troops[unit] ?? 0;
    if (have >= target) {
      delete npc.carry[unit];
      continue;
    }
    const acc = (npc.carry[unit] ?? 0) + (target * dt) / npc.regenMs;
    const whole = Math.floor(acc);
    const add = Math.min(whole, target - have);
    if (add > 0) v.troops[unit] = have + add;
    npc.carry[unit] = have + add >= target ? 0 : acc - whole;
  }
}

function applyDue(state: GameState, content: Content, v: Village, rates: VillageRates): boolean {
  const now = v.updatedAt;
  let changed = false;

  if (v.buildQueue.some((j) => j.endAt <= now)) {
    const due = v.buildQueue.filter((j) => j.endAt <= now).sort((a, b) => a.endAt - b.endAt);
    v.buildQueue = v.buildQueue.filter((j) => j.endAt > now);
    for (const job of due) {
      if (job.kind === "field") {
        const f = v.fields[job.index];
        const def = f ? content.fields[f.resource] : undefined;
        if (f && def) f.level = Math.min(v.isCapital ? def.maxLevelCapital : def.maxLevel, f.level + 1);
      } else {
        const def = content.buildings[job.buildingId];
        const slot = v.buildings[job.index];
        if (def && !slot) v.buildings[job.index] = { id: job.buildingId, level: 1 };
        else if (def && slot && slot.id === job.buildingId) slot.level = Math.min(def.maxLevel, slot.level + 1);
      }
    }
    changed = true;
  }

  for (const b of v.training) {
    const done = Math.min(b.count, Math.floor((now - b.startAt) / b.unitMs));
    if (done > b.done) {
      v.troops[b.unitId] = (v.troops[b.unitId] ?? 0) + (done - b.done);
      b.done = done;
      changed = true;
    }
  }
  if (v.training.some((b) => b.done >= b.count)) v.training = v.training.filter((b) => b.done < b.count);

  if (v.research.job && v.research.job.endAt <= now) {
    if (!v.research.done.includes(v.research.job.unitId)) v.research.done.push(v.research.job.unitId);
    v.research.job = null;
    changed = true;
  }
  if (v.armory.job && v.armory.job.endAt <= now) {
    v.armory.levels[v.armory.job.unitId] = v.armory.job.level;
    v.armory.job = null;
    changed = true;
  }
  if (v.festival && v.festival.endAt <= now) {
    v.culture += v.festival.culture;
    v.festival = null;
    changed = true;
  }
  const hero = state.players[v.ownerId]?.hero;
  if (hero && hero.homeVillageId === v.id && hero.status === "reviving" && hero.reviveAt !== null && hero.reviveAt <= now) {
    hero.status = "home";
    hero.where = null;
    hero.health = 100;
    hero.healthAt = now;
    hero.reviveAt = null;
    changed = true;
  }
  if (changed) return true;

  const net = rates.net[content.food] ?? 0;
  if (net < -EPS && (v.resources[content.food] ?? 0) <= EPS && killableUpkeep(state, content, v) > 0) {
    starve(state, content, v, -net);
    return true;
  }
  return false;
}

// Kill troops until the village can feed the rest: guests first (the host is
// never punished for its guests), then troops in the village's oases, then the
// owner's own. Within a group, every unit type loses the same share.
function starve(state: GameState, content: Content, v: Village, deficit: number): void {
  const killedBy: Record<string, Troops> = {};
  const hit = (ownerId: string, troops: Troops) => {
    if (deficit <= EPS) return troops;
    const upkeep = troopUpkeep(content, troops);
    if (upkeep <= 0) return troops;
    const share = Math.min(1, deficit / upkeep);
    const killed: Troops = {};
    for (const [u, n] of Object.entries(troops)) {
      const k = Math.min(n, Math.ceil(n * share - EPS));
      if (k > 0) killed[u] = k;
    }
    deficit -= troopUpkeep(content, killed);
    addTroops((killedBy[ownerId] ??= {}), killed);
    return addTroops({ ...troops }, killed, -1);
  };
  for (const s of v.stationed) s.troops = hit(s.ownerId, s.troops);
  v.stationed = v.stationed.filter((s) => s.hero || troopCount(s.troops) > 0);
  for (const tile of v.oases) {
    const o = state.oases[tile];
    if (!o) continue;
    for (const s of o.stationed) s.troops = hit(s.ownerId, s.troops);
    o.stationed = o.stationed.filter((s) => s.hero || troopCount(s.troops) > 0);
  }
  v.troops = cleanTroops(hit(v.ownerId, v.troops));
  for (const [ownerId, troops] of Object.entries(killedBy)) {
    if (troopCount(troops) === 0) continue;
    addReport(state, v.updatedAt, "starvation", `Troops starved in ${v.name}`, [ownerId, v.ownerId], {
      type: "simple",
      lines: [`The granary of ${v.name} ran dry and part of the garrison deserted or starved.`],
      troops,
      tile: v.y * content.map.width + v.x,
    });
  }
}
