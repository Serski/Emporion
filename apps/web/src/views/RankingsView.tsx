import { useState } from "react";
import { kingdomStandings, rankings } from "@emporion/engine";
import { content } from "../content";
import { int } from "../format";
import { factionColor, factionName, useSession } from "../ui";

const SORTS = [
  { id: "population", label: "Population" },
  { id: "offense", label: "Attack" },
  { id: "defense", label: "Defence" },
  { id: "looted", label: "Plunder" },
] as const;

export function RankingsView() {
  const s = useSession();
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("population");
  const rows = rankings(s.state, content).sort((a, b) => b[sort] - a[sort]);
  const kingdoms = kingdomStandings(s.state, content);
  return (
    <div className="rankings-view">
      <div className="view-head">
        <div>
          <div className="eyebrow">Statistics</div>
          <h1 className="view-title">Rankings</h1>
        </div>
      </div>
      <div className="segmented" role="tablist">
        {SORTS.map((x) => (
          <button key={x.id} role="tab" aria-selected={sort === x.id} className={`segmented__btn${sort === x.id ? " is-on" : ""}`} onClick={() => setSort(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Player</th>
              <th>Faction</th>
              <th className="num">Towns</th>
              <th className="num">Population</th>
              <th className="num">Attack</th>
              <th className="num">Defence</th>
              <th className="num">Plunder</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.playerId} className={r.playerId === s.active ? "is-current" : undefined}>
                <td className="num">{i + 1}</td>
                <td>
                  {r.name}
                  {r.kind === "ai" && <span className="tag">AI</span>}
                </td>
                <td>
                  <span className="dot" style={{ background: factionColor(r.factionId) }} /> {factionName(r.factionId)}
                </td>
                <td className="num">{r.villages}</td>
                <td className="num">{int(r.population)}</td>
                <td className="num">{int(r.offense)}</td>
                <td className="num">{int(r.defense)}</td>
                <td className="num">{int(r.looted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="section-title">Kingdoms</h2>
      {kingdoms.length === 0 ? (
        <p className="empty">No kingdom has been founded yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Kingdom</th>
                <th>King</th>
                <th className="num">Governors</th>
                <th className="num">Population</th>
                <th className="num">Treasures</th>
                <th className="num">Victory points</th>
              </tr>
            </thead>
            <tbody>
              {kingdoms.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>{k.kingName}</td>
                  <td className="num">{k.members}</td>
                  <td className="num">{int(k.population)}</td>
                  <td className="num">{int(k.treasures)}</td>
                  <td className="num">{int(k.victoryPoints)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
