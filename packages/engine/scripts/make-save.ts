// Dev helper: write a save file with a town ready to raid, for UI testing.
//   tsx scripts/make-save.ts out.json
import { writeFileSync } from "node:fs";
import { Game, tileIndex, distance } from "../src/index.js";
import { content } from "../test/helpers.js";

const c = content();
const start = Date.now();
const g = Game.create(c, { startedAt: start, speed: 50, npcRaids: false, seed: 1234 });
const { player, village } = g.join({ name: "Protis", factionId: "hellenes", at: start });
for (const [id, level] of [["muster_ground", 5], ["barracks", 5], ["storehouse", 10], ["granary", 10], ["agora", 3]] as const) {
  const def = c.buildings[id]!;
  const slot = def.fixedSlot ?? village.buildings.findIndex((b, i) => !b && i > 0 && !c.buildingList.some((d) => d.fixedSlot === i));
  village.buildings[slot] = { id, level };
}
for (const f of village.fields) f.level = 5;
village.troops = { peltast: 120, hoplite: 40 };
village.research.done.push("hoplite");
const home = tileIndex(c, village.x, village.y);
const camp = Object.values(g.state.villages)
  .filter((v) => v.kind === "camp")
  .sort((a, b) => distance(c, home, tileIndex(c, a.x, a.y)) - distance(c, home, tileIndex(c, b.x, b.y)))[0]!;
console.log(`camp ${camp.name} at ${camp.x}|${camp.y}, ${distance(c, home, tileIndex(c, camp.x, camp.y)).toFixed(1)} fields`);
const save = { v: 1, state: g.state, clock: { game: start, real: start, warp: 1, paused: false }, active: player.id, humans: [player.id], village: { [player.id]: village.id } };
writeFileSync(process.argv[2]!, JSON.stringify(save));
writeFileSync(process.argv[2]! + ".target", `${camp.x}|${camp.y}`);
