import { readdirSync, readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { fileURLToPath } from "node:url";
import { Game, HOUR, parseContent, type Content, type ContentBundle, type GameState, type Village } from "../src/index.js";

const CONTENT_DIR = pathJoin(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "content");

const read = (file: string) => JSON.parse(readFileSync(pathJoin(CONTENT_DIR, file), "utf8"));

export function rawBundle(): ContentBundle {
  const factions = readdirSync(pathJoin(CONTENT_DIR, "factions"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => read(pathJoin("factions", f)));
  return {
    world: read("world.json"),
    resources: read("resources.json"),
    buildings: read("buildings.json"),
    factions,
    hero: read("hero.json"),
    kingdoms: read("kingdoms.json"),
    map: read(pathJoin("map", "tiles.json")),
  };
}

let cached: Content | null = null;
export function content(): Content {
  return (cached ??= parseContent(rawBundle()));
}

export const T0 = Date.UTC(2026, 10, 1, 8, 0, 0);

export function newGame(opts: { speed?: number; npcCamps?: number; npcRaids?: boolean; npcTowns?: boolean; seed?: number } = {}): Game {
  return Game.create(content(), {
    startedAt: T0,
    speed: opts.speed ?? 1,
    npcCamps: opts.npcCamps ?? 0,
    npcRaids: opts.npcRaids ?? false,
    npcTowns: opts.npcTowns ?? false,
    seed: opts.seed ?? 7,
  });
}

export function join(game: Game, name = "Kleon", factionId = "hellenes", at = T0) {
  const { player, village } = game.join({ name, factionId, at });
  return { pid: player.id, vid: village.id, player, village };
}

export function village(game: Game, id: string): Village {
  return game.state.villages[id]!;
}

// Give a town every building at a level, bypassing construction (test setup).
export function setBuilding(game: Game, vid: string, buildingId: string, level: number) {
  const v = village(game, vid);
  const def = game.content.buildings[buildingId]!;
  const existing = v.buildings.findIndex((b) => b?.id === buildingId);
  if (existing >= 0) {
    v.buildings[existing]!.level = level;
    return existing;
  }
  let slot = def.fixedSlot ?? -1;
  if (slot < 0) {
    const fixed = new Set(game.content.buildingList.map((d) => d.fixedSlot).filter((s) => s !== undefined));
    slot = v.buildings.findIndex((b, i) => !b && !fixed.has(i));
  }
  v.buildings[slot] = { id: buildingId, level };
  return slot;
}

// Wheat fields at level 10, so a test town can feed what the setup gives it.
export function feed(game: Game, vid: string, level = 10) {
  for (const f of village(game, vid).fields) if (f.resource === game.content.food) f.level = Math.max(f.level, level);
}

// Big stores, full of everything, and the wheat to feed the people they add.
export function rich(game: Game, vid: string, amount = 60000) {
  setBuilding(game, vid, "storehouse", 20);
  setBuilding(game, vid, "granary", 20);
  feed(game, vid);
  const v = village(game, vid);
  for (const r of game.content.resourceIds) v.resources[r] = amount;
}

export const fill = rich;

export function hours(n: number) {
  return n * HOUR;
}

export function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}
