import { calendarAt, heroView, rankings } from "@emporion/engine";
import { content } from "./content";
import type { Session } from "./session";

// ---------------------------------------------------------------------------
// The player's record across worlds, kept in this browser beside the save:
// how many worlds they have founded, and a line for each world that ended
// (the lobby's Calendar and Hall of Fame read it).
// ---------------------------------------------------------------------------

const KEY = "emporion.record.v1";

export interface EndedWorld {
  name: string;
  startedAt: number; // real time
  endedAt: number; // real time
  speed: number;
  houses: number;
  gameDate: string;
  you: { name: string; house: string | null; portrait: string | null; factionId: string; rank: number; of: number; population: number; towns: number; generation: number } | null;
}

export interface PlayerRecord {
  worldsPlayed: number;
  ended: EndedWorld[];
}

export function readRecord(): PlayerRecord {
  try {
    const raw = localStorage.getItem(KEY);
    const r = raw ? (JSON.parse(raw) as Partial<PlayerRecord>) : {};
    return { worldsPlayed: r.worldsPlayed ?? 0, ended: Array.isArray(r.ended) ? r.ended : [] };
  } catch {
    return { worldsPlayed: 0, ended: [] };
  }
}

function write(r: PlayerRecord) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* storage unavailable: the record is lost, the game is not */
  }
}

const ROMAN: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function roman(n: number): string {
  let out = "";
  let left = Math.max(1, Math.floor(n));
  for (const [v, s] of ROMAN) {
    while (left >= v) {
      out += s;
      left -= v;
    }
  }
  return out;
}

export const worldName = (n: number) => `Emporion ${roman(n)}`;

// How many worlds this browser has seen, counting one open from before the
// record was kept.
export function worldsPlayed(open: boolean): number {
  return Math.max(readRecord().worldsPlayed, open ? 1 : 0);
}

// A new world: count it and name it after its number.
export function startWorld(open: boolean): string {
  const r = readRecord();
  r.worldsPlayed = worldsPlayed(open) + 1;
  write(r);
  return worldName(r.worldsPlayed);
}

// The standing of the player on this screen, as the lobby shows it.
export function standing(s: Session) {
  const rows = rankings(s.state, content).sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));
  const i = rows.findIndex((r) => r.playerId === s.active);
  return { rows, rank: i + 1, of: rows.length, me: i >= 0 ? rows[i]! : null };
}

// File the world in the record before it is replaced or abandoned.
export function endWorld(s: Session) {
  const r = readRecord();
  const now = s.now();
  const { rank, of, me } = standing(s);
  const p = s.player;
  r.ended.unshift({
    name: s.name,
    startedAt: s.state.settings.startedAt,
    endedAt: Date.now(),
    speed: s.state.settings.speed,
    houses: of,
    gameDate: calendarAt(s.state, content, now).label,
    you: p
      ? {
          name: p.name,
          house: p.house?.name ?? null,
          portrait: heroView(s.state, content, p, now)?.portrait ?? null,
          factionId: p.factionId,
          rank,
          of,
          population: me?.population ?? 0,
          towns: p.villageIds.length,
          generation: p.house?.generation ?? 1,
        }
      : null,
  });
  r.ended = r.ended.slice(0, 24);
  r.worldsPlayed = Math.max(r.worldsPlayed, r.ended.length);
  write(r);
}
