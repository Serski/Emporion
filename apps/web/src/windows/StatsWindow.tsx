import { useState } from "react";
import { heroView, kingdomStandings, rankings, type RankingRow } from "@emporion/engine";
import { content } from "../content";
import { int } from "../format";
import { Modal, Portrait, Tabs, art, factionColor, factionName, useSession } from "../ui";

type Main = "players" | "kingdoms" | "houses";
type Sort = "population" | "offense" | "defense" | "looted" | "heroes" | "wealth" | "prestige";

const SORTS: { id: Sort; label: string; column: string; value: (r: RankingRow) => number }[] = [
  { id: "population", label: "Population", column: "Population", value: (r) => r.population },
  { id: "offense", label: "Attackers", column: "Attack points", value: (r) => r.offense },
  { id: "defense", label: "Defenders", column: "Defence points", value: (r) => r.defense },
  { id: "looted", label: "Plunder", column: "Resources looted", value: (r) => r.looted },
  { id: "heroes", label: "Heroes", column: "Experience", value: (r) => r.heroLevel * 1e9 + r.heroXp },
  { id: "wealth", label: "Wealth", column: "Drachmae", value: (r) => r.purse },
  { id: "prestige", label: "Prestige", column: "Prestige", value: (r) => r.prestige },
];

const ordinal = (n: number) => (n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`);

// The standings, laid out like Travian Kingdoms' statistics window: players,
// kingdoms, and MASSALIA's houses, with the three leaders on a podium.
export function StatsWindow({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [main, setMain] = useState<Main>("players");
  const [sort, setSort] = useState<Sort>("population");
  return (
    <Modal title="Standings" eyebrow="Statistics" onClose={onClose} wide banner={art("banner-olympic")}>
      <Tabs
        tabs={[
          { id: "players", label: "Players" },
          { id: "kingdoms", label: "Kingdoms" },
          { id: "houses", label: "Houses" },
        ]}
        value={main}
        onChange={setMain}
      />
      {main === "players" && (
        <>
          <Tabs tabs={SORTS.map((x) => ({ id: x.id, label: x.label }))} value={sort} onChange={setSort} variant="sub" />
          <PlayerTable sort={sort} />
        </>
      )}
      {main === "kingdoms" && <KingdomTable />}
      {main === "houses" && <HouseTable />}
      <p className="muted small">Points count since the world began. {s.state.settings.speed > 1 ? `This world runs at speed ${s.state.settings.speed}.` : ""}</p>
    </Modal>
  );
}

function PlayerTable({ sort }: { sort: Sort }) {
  const s = useSession();
  const now = s.now();
  const def = SORTS.find((x) => x.id === sort)!;
  const rows = rankings(s.state, content).sort((a, b) => def.value(b) - def.value(a) || a.name.localeCompare(b.name));
  const mine = rows.findIndex((r) => r.playerId === s.active);
  const shown = (r: RankingRow) => (sort === "heroes" ? `Level ${r.heroLevel}` : int(def.value(r)));
  return (
    <>
      <ol className="podium" aria-label="Leaders">
        {rows.slice(0, 3).map((r, i) => {
          const p = s.state.players[r.playerId]!;
          const h = heroView(s.state, content, p, now);
          return (
            <li key={r.playerId} className={`podium__place podium__place--${i + 1}${r.playerId === s.active ? " is-current" : ""}`}>
              <span className="podium__rank">{i + 1}</span>
              <Portrait stem={h?.portrait ?? null} size={i === 0 ? 84 : 66} />
              <span className="podium__name">{r.name}</span>
              <span className="podium__house">{r.house ?? factionName(r.factionId)}</span>
              <span className="podium__value">{shown(r)}</span>
            </li>
          );
        })}
      </ol>
      {mine >= 0 && (
        <p className="small">
          You stand <strong>{ordinal(mine + 1)}</strong> of {rows.length} by {def.label.toLowerCase()}.
        </p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Player</th>
              <th>Faction</th>
              <th className="num">Towns</th>
              {sort === "heroes" && <th>Hero</th>}
              <th className="num">{def.column}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.playerId} className={r.playerId === s.active ? "is-current" : undefined}>
                <td className="num">{i + 1}</td>
                <td>
                  {r.name}
                  {r.kind === "ai" && <span className="tag">AI</span>}
                  {r.house && <div className="muted small">{r.house}</div>}
                </td>
                <td>
                  <span className="dot" style={{ background: factionColor(r.factionId) }} /> {factionName(r.factionId)}
                </td>
                <td className="num">{r.villages}</td>
                {sort === "heroes" && <td>{r.heroName ?? "—"}</td>}
                <td className="num">{sort === "heroes" ? `${r.heroLevel} · ${int(r.heroXp)} xp` : int(def.value(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function KingdomTable() {
  const s = useSession();
  const kingdoms = kingdomStandings(s.state, content).sort((a, b) => b.victoryPoints - a.victoryPoints);
  if (kingdoms.length === 0) return <p className="empty">No kingdom has been founded yet. A capital of {content.kingdoms.found.minPopulation} people with a Treasury may crown its governor king.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Kingdom</th>
            <th>King</th>
            <th className="num">Governors</th>
            <th className="num">Population</th>
            <th className="num">Treasures</th>
            <th className="num">Victory points</th>
          </tr>
        </thead>
        <tbody>
          {kingdoms.map((k, i) => (
            <tr key={k.id} className={s.player.kingdomId === k.id ? "is-current" : undefined}>
              <td className="num">{i + 1}</td>
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
  );
}

function HouseTable() {
  const s = useSession();
  const now = s.now();
  const houses = Object.values(s.state.players)
    .filter((p) => p.kind !== "npc" && p.house)
    .map((p) => {
      const h = p.house!;
      return {
        id: p.id,
        player: p.name,
        name: h.name,
        head: h.head.name,
        generation: h.generation,
        children: h.children.filter((c) => c.diedAt === null).length,
        married: !!h.spouse,
        level: p.hero?.level ?? 0,
        portrait: heroView(s.state, content, p, now)?.portrait ?? null,
      };
    })
    .sort((a, b) => b.generation - a.generation || b.level - a.level || a.name.localeCompare(b.name));
  if (houses.length === 0) return <p className="empty">This world has no families.</p>;
  return (
    <ul className="house-list">
      {houses.map((h, i) => (
        <li key={h.id} className={`house-row${h.id === s.active ? " is-current" : ""}`}>
          <span className="house-row__rank">{i + 1}</span>
          <Portrait stem={h.portrait} size={48} />
          <span className="house-row__text">
            <strong>{h.name}</strong>
            <span className="muted small">
              {h.head}, head in the {ordinal(h.generation)} generation · {h.player}
            </span>
          </span>
          <span className="house-row__facts small">
            <span>{h.married ? "married" : "unwed"}</span>
            <span>
              {h.children} child{h.children === 1 ? "" : "ren"}
            </span>
            <span>hero level {h.level}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
