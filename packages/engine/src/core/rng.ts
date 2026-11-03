import type { GameState } from "./types.js";

// Seeded randomness. Every random outcome (loyalty swings, random catapult
// targets, NPC decisions, map placement) draws from the generator stored in the
// state, so a world replays identically from its seed and its commands. Map
// features use the stateless hash instead, so any tile can be read on its own.

export function nextRandom(state: GameState): number {
  // mulberry32
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: GameState, min: number, max: number): number {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}

export function pick<T>(state: GameState, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(nextRandom(state) * items.length)];
}

// Stateless 32-bit hash of integers → [0, 1).
export function hash01(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

export function weightedChoice<T>(items: readonly T[], weight: (item: T) => number, roll: number): T | undefined {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return undefined;
  let target = roll * total;
  for (const item of items) {
    target -= Math.max(0, weight(item));
    if (target < 0) return item;
  }
  return items[items.length - 1];
}
