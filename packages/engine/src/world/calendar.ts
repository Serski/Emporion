import type { Content } from "../content/load.js";
import { HOUR } from "../core/time.js";
import type { GameState, Ms } from "../core/types.js";

// MASSALIA's calendar: one season per `seasonHours` (a real day at speed 1),
// four seasons a year, years counted down from startYearBC. Ages in the family
// pack run on the same clock: a game year is four seasons.

export function seasonMs(state: GameState, content: Content): Ms {
  return (content.world.calendar.seasonHours * HOUR) / state.settings.speed;
}

export function yearMs(state: GameState, content: Content): Ms {
  return seasonMs(state, content) * content.world.calendar.seasons.length;
}

export interface CalendarDate {
  seasonIndex: number; // seasons since the world began
  yearIndex: number; // whole years since the world began
  season: string;
  yearBC: number;
  label: string; // "Summer, 299 BC"
  nextSeasonAt: Ms;
}

export function calendarAt(state: GameState, content: Content, t: Ms): CalendarDate {
  const cal = content.world.calendar;
  const s = seasonMs(state, content);
  const seasonIndex = Math.max(0, Math.floor((t - state.settings.startedAt) / s));
  const yearIndex = Math.floor(seasonIndex / cal.seasons.length);
  const season = cal.seasons[seasonIndex % cal.seasons.length]!;
  const yearBC = cal.startYearBC - yearIndex;
  return {
    seasonIndex,
    yearIndex,
    season,
    yearBC,
    label: yearBC > 0 ? `${season}, ${yearBC} BC` : `${season}, ${1 - yearBC} AD`,
    nextSeasonAt: state.settings.startedAt + (seasonIndex + 1) * s,
  };
}

export function yearIndexAt(state: GameState, content: Content, t: Ms): number {
  return Math.max(0, Math.floor((t - state.settings.startedAt) / yearMs(state, content)));
}

// Whole years between a birth instant and t (never negative).
export function ageAt(state: GameState, content: Content, bornAt: Ms, t: Ms): number {
  return Math.max(0, Math.floor((t - bornAt) / yearMs(state, content) + 1e-9));
}
