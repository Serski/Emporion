import type { CostCurve, Curve } from "./schema.js";
import type { Resources } from "../core/types.js";

// The one reader of every level curve in content. L = 0 reads `zero` (default 0).
export function curveAt(curve: Curve, level: number): number {
  if (level <= 0) return curve.zero ?? 0;
  if ("table" in curve) return curve.table[Math.min(level, curve.table.length) - 1]!;
  if ("linear" in curve) return (curve.zero ?? 0) + curve.linear * level;
  const raw = curve.base * curve.growth ** (level - 1) + (curve.add ?? 0);
  return curve.round ? roundTo(raw, curve.round) : raw;
}

// Sum of a curve over levels 1..level (population and similar "added per
// level" curves are stored as increments).
export function curveSum(curve: Curve, level: number): number {
  let total = 0;
  for (let l = 1; l <= level; l++) total += curveAt(curve, l);
  return total;
}

export function costAt(cost: CostCurve, level: number): Resources {
  const out: Resources = {};
  const factor = cost.growth ** (Math.max(1, level) - 1);
  for (const [res, base] of Object.entries(cost.base)) {
    const raw = base * factor;
    out[res] = cost.round ? roundTo(raw, cost.round) : Math.round(raw);
  }
  return out;
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
