import type { Content } from "../content/load.js";
import type { GameState, Movement, Ms, ScheduledEvent } from "../core/types.js";
import { arrive } from "../military/arrivals.js";
import { touch } from "../village/timeline.js";
import { runNpcRaids } from "./npc.js";
import { botTurn } from "../ai/bot.js";
import { runFamilyYear } from "../social/family.js";
import { finishCrafts } from "../massalia/crafting.js";
import { runSeason } from "../massalia/house.js";
import { shipsHome } from "../massalia/sea.js";

// ---------------------------------------------------------------------------
// The world clock. `settle(state, content, until)` processes every
// cross-village event due by `until` in time order (ties by creation order):
// marches arriving, NPC raid waves, AI turns, the turn of the year and of the
// season, finished crafts and hulls home from sea. Each handler touches the villages it
// changes at the event's instant, so their own timelines stay exact.
//
// A server calls settle(now) before every request; the local client calls it
// on every tick. Nothing runs on its own between calls, and nothing needs to.
// ---------------------------------------------------------------------------

type Next = { at: Ms; seq: number; movement?: Movement; event?: ScheduledEvent };

function nextEvent(state: GameState): Next | null {
  let best: Next | null = null;
  for (const m of Object.values(state.movements)) {
    if (!best || m.arriveAt < best.at || (m.arriveAt === best.at && m.seq < best.seq)) best = { at: m.arriveAt, seq: m.seq, movement: m };
  }
  for (const e of state.scheduled) {
    if (!best || e.at < best.at || (e.at === best.at && e.seq < best.seq)) best = { at: e.at, seq: e.seq, event: e };
  }
  return best;
}

export function settle(state: GameState, content: Content, until: Ms): void {
  for (let guard = 0; ; guard++) {
    if (guard > 1_000_000) throw new Error("settle runaway");
    const next = nextEvent(state);
    if (!next || next.at > until) break;
    if (next.at > state.time) state.time = next.at;
    if (next.movement) arrive(state, content, next.movement);
    else if (next.event) {
      state.scheduled = state.scheduled.filter((e) => e !== next.event);
      if (next.event.kind === "npcRaids") runNpcRaids(state, content, next.event.at);
      else if (next.event.kind === "aiTurn" && next.event.playerId) botTurn(state, content, next.event.playerId, next.event.at);
      else if (next.event.kind === "familyYear") runFamilyYear(state, content, next.event.at);
      else if (next.event.kind === "season") runSeason(state, content, next.event.at);
      else if (next.event.kind === "craftDone" && next.event.playerId) finishCrafts(state, content, next.event.playerId, next.event.at);
      else if (next.event.kind === "shipsHome" && next.event.playerId) shipsHome(state, content, next.event.playerId, next.event.at);
    }
  }
  if (until > state.time) state.time = until;
}

// Settle the world and bring one player's towns up to `now` (what a client
// shows on every tick).
export function advance(state: GameState, content: Content, now: Ms, playerId?: string): void {
  settle(state, content, now);
  if (!playerId) return;
  const p = state.players[playerId];
  if (!p) return;
  for (const id of p.villageIds) {
    const v = state.villages[id];
    if (v) touch(state, content, v, now);
  }
}

// Bring every town in the world up to `now` (before saving a snapshot, say).
export function advanceAll(state: GameState, content: Content, now: Ms): void {
  settle(state, content, now);
  for (const v of Object.values(state.villages)) touch(state, content, v, now);
}
