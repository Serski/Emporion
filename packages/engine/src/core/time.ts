import type { GameState } from "./types.js";

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// Content times are seconds at speed 1; the world runs `speed` times faster.
export function scaledMs(state: GameState, seconds: number): number {
  return Math.max(1, Math.round((seconds * SECOND) / state.settings.speed));
}

// Content rates are per hour (or per day) at speed 1.
export function perMs(state: GameState, perHour: number): number {
  return (perHour * state.settings.speed) / HOUR;
}
