import type { Content } from "../content/load.js";
import { hash01 } from "../core/rng.js";
import { HOUR } from "../core/time.js";
import type { GameState, Ms, OasisState } from "../core/types.js";
import { tileOasis } from "./map.js";

// Oases are created the first time anything touches them. While unowned their
// wildlife regrows toward the oasis's maximum; an owned oasis holds only the
// reinforcements its owner stations there, and its loyalty slowly recovers.

const LOYALTY_PER_HOUR = 2;

export function oasisAt(state: GameState, content: Content, tile: number, t: Ms): OasisState | null {
  let o = state.oases[tile];
  if (!o) {
    const type = tileOasis(content, state.settings.seed, tile);
    if (!type) return null;
    const animals: Record<string, number> = {};
    let i = 0;
    for (const [unit, [min, max]] of Object.entries(type.animals)) {
      const n = min + Math.floor(hash01(state.settings.seed, tile, 700 + i++) * (max - min + 1));
      if (n > 0) animals[unit] = n;
    }
    o = { tile, typeId: type.id, ownerVillageId: null, loyalty: 100, updatedAt: t, animals, carry: {}, stationed: [] };
    state.oases[tile] = o;
  }
  touchOasis(state, content, o, t);
  return o;
}

export function touchOasis(state: GameState, content: Content, o: OasisState, t: Ms): void {
  const dt = t - o.updatedAt;
  if (dt <= 0) return;
  o.updatedAt = t;
  if (o.ownerVillageId) {
    o.loyalty = Math.min(100, o.loyalty + (LOYALTY_PER_HOUR * state.settings.speed * dt) / HOUR);
    return;
  }
  const type = content.oasisTypes[o.typeId];
  if (!type) return;
  const regenMs = (content.world.mapgen.oasisRegenHours * HOUR) / state.settings.speed;
  for (const [unit, [, max]] of Object.entries(type.animals)) {
    const have = o.animals[unit] ?? 0;
    if (have >= max) {
      delete o.carry[unit];
      continue;
    }
    const acc = (o.carry[unit] ?? 0) + (max * dt) / regenMs;
    const whole = Math.floor(acc);
    const add = Math.min(whole, max - have);
    if (add > 0) o.animals[unit] = have + add;
    o.carry[unit] = have + add >= max ? 0 : acc - whole;
  }
}
