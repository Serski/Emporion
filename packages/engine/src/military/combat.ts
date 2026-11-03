import type { Content } from "../content/load.js";
import { curveAt } from "../content/curves.js";
import type { UnitDef } from "../content/schema.js";
import type { Resources, Troops } from "../core/types.js";

// ---------------------------------------------------------------------------
// Battle math, pure and deterministic.
//
//   attack  = Σ units' attack (infantry and cavalry kept apart) + hero strength,
//             × (1 + hero offence bonus) × morale
//   defence = (base defence + Σ units' defence against the attacker's mix:
//             defInf · infShare + defCav · cavShare, + hero strength,
//             × (1 + hero defence bonus)) × wall factor
//   Every unit stat × (1 + armoryBonusPerLevel · its armory level).
//
//   attack mode  the stronger side wins; the winner loses (weak/strong)^k of
//                every unit, the loser everything.
//   raid mode    both sides break off: with x = (weak/strong)^k the winner loses
//                x/(1+x) and the loser 1/(1+x).
//
// The resolver is a plain function of numbers so another one (MASSALIA's
// round-based battle.ts, say) can replace it behind the same BattleResolver.
// ---------------------------------------------------------------------------

export interface UnitStack {
  unit: UnitDef;
  count: number;
  armoryLevel: number;
}

export interface HeroInBattle {
  strength: number;
  offenseBonus: number;
  defenseBonus: number;
}

export interface BattleSideInput {
  stacks: UnitStack[];
  hero: HeroInBattle | null;
}

export interface BattleInput {
  mode: "attack" | "raid";
  attacker: BattleSideInput & { morale: number };
  defenders: BattleSideInput[];
  wallLevel: number;
  wallBonusPerLevel: number;
  baseDefense: number;
  armoryBonusPerLevel: number;
  lossExponent: number;
  raidLossExponent: number;
}

export interface BattleOutcome {
  winner: "attacker" | "defender";
  attackPower: number;
  defensePower: number;
  attackerLossRate: number;
  defenderLossRate: number;
}

export type BattleResolver = (input: BattleInput) => BattleOutcome;

const mult = (bonus: number, level: number) => 1 + bonus * level;

export function attackParts(side: BattleSideInput, armoryBonus: number): { infantry: number; cavalry: number } {
  let infantry = 0;
  let cavalry = 0;
  for (const s of side.stacks) {
    const a = s.count * s.unit.attack * mult(armoryBonus, s.armoryLevel);
    if (s.unit.class === "cavalry") cavalry += a;
    else infantry += a;
  }
  if (side.hero) infantry += side.hero.strength;
  return { infantry, cavalry };
}

export function defenseOf(side: BattleSideInput, infShare: number, armoryBonus: number): number {
  let d = 0;
  for (const s of side.stacks) {
    const per = s.unit.defenseInfantry * infShare + s.unit.defenseCavalry * (1 - infShare);
    d += s.count * per * mult(armoryBonus, s.armoryLevel);
  }
  if (side.hero) d += side.hero.strength;
  return d * (1 + (side.hero?.defenseBonus ?? 0));
}

export const resolveBattle: BattleResolver = (input) => {
  const parts = attackParts(input.attacker, input.armoryBonusPerLevel);
  const raw = parts.infantry + parts.cavalry;
  const attackPower = raw * (1 + (input.attacker.hero?.offenseBonus ?? 0)) * input.attacker.morale;
  const infShare = raw > 0 ? parts.infantry / raw : 1;
  let defense = input.baseDefense;
  for (const d of input.defenders) defense += defenseOf(d, infShare, input.armoryBonusPerLevel);
  const defensePower = defense * (1 + input.wallBonusPerLevel) ** input.wallLevel;

  if (attackPower <= 0) {
    return { winner: "defender", attackPower, defensePower, attackerLossRate: 1, defenderLossRate: 0 };
  }
  const attackerWins = attackPower > defensePower;
  const strong = attackerWins ? attackPower : defensePower;
  const weak = attackerWins ? defensePower : attackPower;
  if (input.mode === "attack") {
    const x = strong > 0 ? (weak / strong) ** input.lossExponent : 0;
    return attackerWins
      ? { winner: "attacker", attackPower, defensePower, attackerLossRate: x, defenderLossRate: 1 }
      : { winner: "defender", attackPower, defensePower, attackerLossRate: 1, defenderLossRate: x };
  }
  const x = strong > 0 ? (weak / strong) ** input.raidLossExponent : 0;
  const winnerLoss = x / (1 + x);
  const loserLoss = 1 / (1 + x);
  return attackerWins
    ? { winner: "attacker", attackPower, defensePower, attackerLossRate: winnerLoss, defenderLossRate: loserLoss }
    : { winner: "defender", attackPower, defensePower, attackerLossRate: loserLoss, defenderLossRate: winnerLoss };
};

// Losses of each unit type at a loss rate, rounded per type.
export function lossesAt(troops: Troops, rate: number): Troops {
  const out: Troops = {};
  for (const [u, n] of Object.entries(troops)) {
    const k = rate >= 1 ? n : Math.min(n, Math.round(n * rate));
    if (k > 0) out[u] = k;
  }
  return out;
}

export function stacksOf(content: Content, troops: Troops, armory: Record<string, number>): UnitStack[] {
  const out: UnitStack[] = [];
  for (const [u, count] of Object.entries(troops)) {
    const unit = content.units[u];
    if (unit && count > 0) out.push({ unit, count, armoryLevel: armory[u] ?? 0 });
  }
  return out;
}

// --- siege -------------------------------------------------------------------

export function siegeDamage(content: Content, troops: Troops, armory: Record<string, number>, role: "ram" | "catapult"): number {
  let dmg = 0;
  const bonus = content.world.combat.armoryBonusPerLevel;
  for (const [u, n] of Object.entries(troops)) {
    const unit = content.units[u];
    if (unit?.role === role && unit.siege) dmg += n * unit.siege * mult(bonus, armory[u] ?? 0);
  }
  return dmg;
}

// Knock a structure down level by level while the damage lasts. Level L needs
// durability(L) × multiplier damage to fall to L-1.
export function demolish(content: Content, level: number, damage: number, multiplier: number, durability = content.world.combat.durability): number {
  let lvl = level;
  let left = damage;
  while (lvl > 0) {
    const need = curveAt(durability, lvl) * multiplier;
    if (left + 1e-9 < need) break;
    left -= need;
    lvl--;
  }
  return lvl;
}

// --- scouting ------------------------------------------------------------------

export function scoutPower(content: Content, troops: Troops, armory: Record<string, number>, side: "attack" | "defense"): number {
  let p = 0;
  const bonus = content.world.combat.armoryBonusPerLevel;
  for (const [u, n] of Object.entries(troops)) {
    const unit = content.units[u];
    if (unit?.role === "scout" && unit.scouting) p += n * unit.scouting[side] * mult(bonus, armory[u] ?? 0);
  }
  return p;
}

export function resolveScouting(attack: number, defense: number, exponent: number): { success: boolean; detected: boolean; lossRate: number } {
  if (defense <= 0) return { success: attack > 0, detected: false, lossRate: 0 };
  if (attack > defense) return { success: true, detected: true, lossRate: (defense / attack) ** exponent };
  return { success: false, detected: true, lossRate: 1 };
}

// --- loot ----------------------------------------------------------------------

// Fill `capacity` from what is lootable, as evenly across resources as the
// stocks allow.
export function splitLoot(lootable: Resources, capacity: number): Resources {
  const out: Resources = {};
  const keys = Object.keys(lootable).filter((k) => (lootable[k] ?? 0) > 0);
  for (const k of Object.keys(lootable)) out[k] = 0;
  let left = Math.max(0, capacity);
  let open = keys.slice();
  while (left > 1e-9 && open.length > 0) {
    const share = left / open.length;
    const next: string[] = [];
    for (const k of open) {
      const room = (lootable[k] ?? 0) - (out[k] ?? 0);
      const take = Math.min(room, share);
      out[k] = (out[k] ?? 0) + take;
      left -= take;
      if (room - take > 1e-9) next.push(k);
    }
    if (next.length === open.length && share * open.length <= 1e-9) break;
    open = next;
  }
  for (const k of Object.keys(out)) out[k] = Math.floor(out[k]! + 1e-9);
  return out;
}

export function carryCapacity(content: Content, troops: Troops): number {
  let c = 0;
  for (const [u, n] of Object.entries(troops)) c += (content.units[u]?.carry ?? 0) * n;
  return c;
}

export function slowestSpeed(content: Content, troops: Troops, heroSpeed: number | null): number {
  let s = Infinity;
  for (const [u, n] of Object.entries(troops)) if (n > 0) s = Math.min(s, content.units[u]?.speed ?? Infinity);
  if (heroSpeed !== null) s = Math.min(s, heroSpeed);
  return Number.isFinite(s) ? s : 1;
}
