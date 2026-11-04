import { useState } from "react";
import { reportsFor, type Report } from "@emporion/engine";
import { at } from "../format";
import { Icon } from "../icons";
import { Modal, Tabs, art, useSession } from "../ui";
import { ReportBody } from "./ReportWindow";

type Filter = "all" | "battle" | "scout" | "trade" | "family" | "other";

const MATCH: Record<Filter, (r: Report) => boolean> = {
  all: () => true,
  battle: (r) => r.kind === "battle",
  scout: (r) => r.kind === "scout",
  trade: (r) => r.kind === "trade" || r.kind === "reinforcement",
  family: (r) => r.kind === "family" || r.kind === "hero",
  other: (r) => !["battle", "scout", "trade", "reinforcement", "family", "hero"].includes(r.kind),
};

function outcome(r: Report, me: string): { label: string; tone: "won" | "lost" | "neutral" } {
  if (r.data.type === "battle") {
    const attacker = r.data.attacker.playerId === me;
    const won = (r.data.winner === "attacker") === attacker;
    return { label: won ? "won" : "lost", tone: won ? "won" : "lost" };
  }
  if (r.data.type === "scout") return { label: r.data.success ? "seen" : "caught", tone: r.data.success ? "won" : "lost" };
  return { label: r.kind, tone: "neutral" };
}

// Dispatches, as Travian Kingdoms files them: a tab per kind, newest first,
// and the report opens in place with a way back to the list.
export function ReportsWindow({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const all = reportsFor(s.state, s.active);
  const unreadIn = (f: Filter) => all.filter((r) => MATCH[f](r) && r.unread.includes(s.active)).length || undefined;
  const shown = all.filter(MATCH[filter]);
  const unread = all.filter((r) => r.unread.includes(s.active));
  const current = open ? s.state.reports[open] : undefined;

  if (current) {
    return (
      <Modal title={current.title} eyebrow={`Report · ${at(current.at, s.state.settings.startedAt)}`} onClose={onClose} wide>
        <button className="link back" onClick={() => setOpen(null)}>
          <Icon name="left" size={14} /> All reports
        </button>
        <ReportBody id={current.id} />
      </Modal>
    );
  }

  return (
    <Modal title="Reports" eyebrow="Dispatches" onClose={onClose} wide banner={art("banner-ledger")}>
      <Tabs
        tabs={[
          { id: "all", label: "All", badge: unreadIn("all") },
          { id: "battle", label: "Battles", badge: unreadIn("battle") },
          { id: "scout", label: "Scouting", badge: unreadIn("scout") },
          { id: "trade", label: "Trade", badge: unreadIn("trade") },
          { id: "family", label: "House", badge: unreadIn("family") },
          { id: "other", label: "Towns", badge: unreadIn("other") },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <div className="list-head">
        <span className="muted small">
          {shown.length} report{shown.length === 1 ? "" : "s"}
          {unread.length > 0 && ` · ${unread.length} unread`}
        </span>
        {unread.length > 0 && (
          <button
            className="btn btn--ghost btn--small"
            onClick={() => {
              for (const r of unread) s.game.markRead(s.active, r.id);
              s.tick();
            }}
          >
            Mark all read
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="empty">{filter === "all" ? "No reports yet. Raid an outlaw camp near your town to see your first battle report." : "Nothing filed here yet."}</p>
      ) : (
        <ul className="report-list">
          {shown.slice(0, 200).map((r) => {
            const o = outcome(r, s.active);
            return (
              <li key={r.id}>
                <button className={`report-row${r.unread.includes(s.active) ? " is-unread" : ""}`} onClick={() => setOpen(r.id)}>
                  <span className={`pill pill--${o.tone}`}>{o.label}</span>
                  <span className="report-row__title">{r.title}</span>
                  <span className="report-row__time">{at(r.at, s.state.settings.startedAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
