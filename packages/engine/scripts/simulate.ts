// Headless balance run: AI governors play a world for N game days.
//   pnpm simulate                 # 14 days at speed 1
//   pnpm simulate -- 30 3         # 30 days, speed 3
// Prints each day's standings and, at the end, what happened in the world.
import { DAY, Game, HOUR, playerPopulation, troopCount } from "../src/index.js";
import { content } from "../test/helpers.js";

const days = Number(process.argv[2] ?? 14);
const speed = Number(process.argv[3] ?? 1);
const c = content();
const start = Date.UTC(2026, 10, 1);
const g = Game.create(c, { startedAt: start, speed, npcCamps: 80, npcRaids: true, seed: 42 });
const names = ["Kleon", "Nikias", "Brennos", "Ambiorix", "Hanno", "Himilco"];
const factions = ["hellenes", "hellenes", "celts", "celts", "carthaginians", "carthaginians"];
const pids = names.map((name, i) => g.join({ name, factionId: factions[i]!, kind: "ai", at: start }).player.id);

const t0 = performance.now();
for (let d = 1; d <= days; d++) {
  for (let h = 1; h <= 24; h++) g.advanceAll(start + (d - 1) * DAY + h * HOUR);
  const row = pids
    .map((id) => {
      const p = g.state.players[id]!;
      const troops = p.villageIds.reduce((n, vid) => n + troopCount(g.state.villages[vid]!.troops), 0);
      return `${p.name.padEnd(9)} pop ${String(playerPopulation(g.state, c, p)).padStart(4)} troops ${String(troops).padStart(4)} looted ${String(Math.round(p.looted)).padStart(6)}`;
    })
    .join(" | ");
  console.log(`day ${String(d).padStart(2)}  ${row}`);
}
const kinds: Record<string, number> = {};
for (const r of Object.values(g.state.reports)) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
console.log("\nreports:", kinds);
console.log("movements in flight:", Object.keys(g.state.movements).length);
console.log(`state ${(JSON.stringify(g.state).length / 1024).toFixed(0)} KB, simulated in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
