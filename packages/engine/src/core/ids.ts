import type { GameState } from "./types.js";

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

export function nextSeq(state: GameState): number {
  return state.nextId++;
}
