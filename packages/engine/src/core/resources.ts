import type { Content } from "../content/load.js";
import type { Resources, Troops } from "./types.js";

export function emptyResources(content: Content): Resources {
  const out: Resources = {};
  for (const id of content.resourceIds) out[id] = 0;
  return out;
}

export function addResources(target: Resources, add: Resources, factor = 1): Resources {
  for (const [k, v] of Object.entries(add)) target[k] = (target[k] ?? 0) + v * factor;
  return target;
}

export function scaleResources(res: Resources, factor: number): Resources {
  const out: Resources = {};
  for (const [k, v] of Object.entries(res)) out[k] = v * factor;
  return out;
}

export function totalResources(res: Resources): number {
  let n = 0;
  for (const v of Object.values(res)) n += v;
  return n;
}

export function canAfford(stock: Resources, cost: Resources): boolean {
  for (const [k, v] of Object.entries(cost)) if ((stock[k] ?? 0) + 1e-6 < v) return false;
  return true;
}

// Pay a cost already checked with canAfford; never leaves a negative stock.
export function pay(stock: Resources, cost: Resources): void {
  for (const [k, v] of Object.entries(cost)) stock[k] = Math.max(0, (stock[k] ?? 0) - v);
}

export function floorResources(res: Resources): Resources {
  const out: Resources = {};
  for (const [k, v] of Object.entries(res)) out[k] = Math.floor(v + 1e-9);
  return out;
}

export function troopCount(troops: Troops): number {
  let n = 0;
  for (const v of Object.values(troops)) n += v;
  return n;
}

export function addTroops(target: Troops, add: Troops, factor = 1): Troops {
  for (const [k, v] of Object.entries(add)) {
    const next = (target[k] ?? 0) + v * factor;
    if (next > 0) target[k] = next;
    else delete target[k];
  }
  return target;
}

export function cleanTroops(troops: Troops): Troops {
  const out: Troops = {};
  for (const [k, v] of Object.entries(troops)) if (v > 0) out[k] = v;
  return out;
}

export function hasTroops(stock: Troops, want: Troops): boolean {
  for (const [k, v] of Object.entries(want)) if ((stock[k] ?? 0) < v) return false;
  return true;
}
