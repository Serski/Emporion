import { useState } from "react";
import { reportsFor, type Report } from "@emporion/engine";
import { at } from "../format";
import { useNav } from "../nav";
import { useSession } from "../ui";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "battle", label: "Battles" },
  { id: "scout", label: "Scouting" },
  { id: "other", label: "Trade and towns" },
] as const;

function outcome(r: Report, me: string): { label: string; tone: "won" | "lost" | "neutral" } {
  if (r.data.type === "battle") {
    const attacker = r.data.attacker.playerId === me;
    const won = (r.data.winner === "attacker") === attacker;
    return { label: won ? "won" : "lost", tone: won ? "won" : "lost" };
  }
  if (r.data.type === "scout") return { label: r.data.success ? "seen" : "caught", tone: r.data.success ? "won" : "lost" };
  return { label: r.kind, tone: "neutral" };
}

export function ReportsView() {
  const s = useSession();
  const nav = useNav();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const all = reportsFor(s.state, s.active);
  const shown = all.filter((r) => filter === "all" || (filter === "other" ? r.kind !== "battle" && r.kind !== "scout" : r.kind === filter));
  const unread = all.filter((r) => r.unread.includes(s.active));
  return (
    <div className="reports-view">
      <div className="view-head">
        <div>
          <div className="eyebrow">Dispatches</div>
          <h1 className="view-title">Reports</h1>
        </div>
        <div className="inline-form">
          {unread.length > 0 && (
            <button
              className="btn btn--ghost"
              onClick={() => {
                for (const r of unread) s.game.markRead(s.active, r.id);
                s.tick();
              }}
            >
              Mark all read
            </button>
          )}
        </div>
      </div>
      <div className="segmented" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={`segmented__btn${filter === f.id ? " is-on" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="empty">No reports yet. Raid an outlaw camp near your town to see your first battle report.</p>
      ) : (
        <ul className="report-list">
          {shown.slice(0, 200).map((r) => {
            const o = outcome(r, s.active);
            return (
              <li key={r.id}>
                <button className={`report-row${r.unread.includes(s.active) ? " is-unread" : ""}`} onClick={() => nav.open({ kind: "report", id: r.id })}>
                  <span className={`pill pill--${o.tone}`}>{o.label}</span>
                  <span className="report-row__title">{r.title}</span>
                  <span className="report-row__time">{at(r.at, s.state.settings.startedAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
