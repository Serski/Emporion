// EMPORION engine — the pure rules of a tile-map browser strategy game:
// towns with resource fields and buildings, timed construction and training,
// armies marching across a square-tile map, raids, sieges, conquest, colonies,
// a hero, oases, NPC camps and cities, and kingdoms. No clock, no I/O: the
// host passes `now` in and persists the plain-JSON state however it likes.

export * from "./content/schema.js";
export * from "./content/load.js";
export * from "./content/curves.js";
export * from "./core/types.js";
export * from "./core/result.js";
export * from "./core/resources.js";
export * from "./core/time.js";
export * from "./core/rng.js";
export * from "./world/map.js";
export * from "./world/world.js";
export * from "./world/oases.js";
export * from "./world/settle.js";
export * from "./world/npc.js";
export * from "./village/stats.js";
export * from "./village/timeline.js";
export * from "./economy/construction.js";
export * from "./economy/training.js";
export * from "./military/combat.js";
export * from "./military/movements.js";
export * from "./military/arrivals.js";
export * from "./social/hero.js";
export * from "./social/kingdoms.js";
export * from "./social/reports.js";
export * from "./ai/bot.js";
export * from "./views.js";
export * from "./game.js";
