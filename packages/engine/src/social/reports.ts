import { newId } from "../core/ids.js";
import type { GameState, Ms, Report, ReportData, ReportKind } from "../core/types.js";

// Reports older than the newest MAX_REPORTS are dropped, oldest first.
const MAX_REPORTS = 1500;

export function addReport(
  state: GameState,
  at: Ms,
  kind: ReportKind,
  title: string,
  recipients: (string | null | undefined)[],
  data: ReportData,
): Report | null {
  const people = [...new Set(recipients.filter((id): id is string => !!id))].filter(
    (id) => state.players[id] && state.players[id]!.kind !== "npc",
  );
  if (people.length === 0) return null;
  const report: Report = { id: newId(state, "r"), at, kind, title, recipients: people, unread: [...people], data };
  state.reports[report.id] = report;
  prune(state);
  return report;
}

export function reportsFor(state: GameState, playerId: string): Report[] {
  return Object.values(state.reports)
    .filter((r) => r.recipients.includes(playerId))
    .sort((a, b) => b.at - a.at || (b.id < a.id ? -1 : 1));
}

export function markRead(state: GameState, playerId: string, reportId: string): void {
  const r = state.reports[reportId];
  if (r) r.unread = r.unread.filter((id) => id !== playerId);
}

function prune(state: GameState) {
  const ids = Object.keys(state.reports);
  if (ids.length <= MAX_REPORTS) return;
  const sorted = Object.values(state.reports).sort((a, b) => a.at - b.at);
  for (const r of sorted.slice(0, ids.length - MAX_REPORTS)) delete state.reports[r.id];
}
