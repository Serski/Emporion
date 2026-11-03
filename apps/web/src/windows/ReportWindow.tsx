import { useEffect } from "react";
import type { BattleReportData, ReportSide, ScoutReportData, Troops } from "@emporion/engine";
import { content } from "../content";
import { at, int, pct } from "../format";
import { useNav } from "../nav";
import { Modal, ResIcon, TroopList, UnitIcon, factionName, useSession } from "../ui";

function SideTable({ side, title }: { side: ReportSide; title: string }) {
  const units = Object.keys({ ...side.troops, ...side.losses }).filter((u) => (side.troops[u] ?? 0) > 0 || (side.losses[u] ?? 0) > 0);
  return (
    <div className="report-side">
      <div className="report-side__head">
        <span className="eyebrow">{title}</span>
        <strong>{side.playerName}</strong>
        <span className="muted small">
          {side.villageName} · {factionName(side.factionId)}
        </span>
      </div>
      {units.length === 0 && !side.hero ? (
        <p className="muted small">No troops.</p>
      ) : (
        <div className="table-wrap">
          <table className="table report-table">
            <thead>
              <tr>
                <th />
                {units.map((u) => (
                  <th key={u} title={content.units[u]?.name}>
                    <UnitIcon id={u} size={26} />
                  </th>
                ))}
                {side.hero && <th>Hero</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Troops</th>
                {units.map((u) => (
                  <td key={u} className="num">
                    {int(side.troops[u] ?? 0)}
                  </td>
                ))}
                {side.hero && <td className="num">1</td>}
              </tr>
              <tr className="report-table__losses">
                <th>Lost</th>
                {units.map((u) => (
                  <td key={u} className="num">
                    {int(side.losses[u] ?? 0)}
                  </td>
                ))}
                {side.hero && <td className="num">{side.hero.died ? "fell" : `−${side.hero.healthLost} hp`}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {side.hero && side.hero.xp > 0 && <p className="small">Hero gained {int(side.hero.xp)} experience.</p>}
    </div>
  );
}

function Battle({ d, me }: { d: BattleReportData; me: string }) {
  const mine = d.attacker.playerId === me;
  const won = (d.winner === "attacker") === mine;
  const lootTotal = Object.values(d.loot).reduce((a, b) => a + b, 0);
  return (
    <>
      <p className={`verdict verdict--${won ? "won" : "lost"}`}>
        {d.winner === "attacker" ? "The attackers won" : "The defenders held"} · attack {int(d.attackPower)} against defence {int(d.defensePower)}
        {d.morale < 1 && ` · morale ${pct(d.morale)}`}
        {d.wallLevel > 0 && ` · walls level ${d.wallLevel}`}
      </p>
      <SideTable side={d.attacker} title={d.mission === "raid" ? "Raiders" : "Attackers"} />
      {d.defenders.map((side, i) => (
        <SideTable key={i} side={side} title={i === 0 ? "Defenders" : "Reinforcements"} />
      ))}
      {(lootTotal > 0 || d.capacity > 0) && (
        <div className="loot">
          <span className="eyebrow">Loot</span>
          {content.resourceIds.map((r) => (
            <span key={r} className="prod-chip">
              <ResIcon id={r} size={16} /> {int(d.loot[r] ?? 0)}
            </span>
          ))}
          <span className="muted small">
            {int(lootTotal)} of {int(d.capacity)} carried
          </span>
        </div>
      )}
      <ul className="bullets">
        {d.treasures > 0 && <li>{d.treasures} treasures taken.</li>}
        {d.wall && (
          <li>
            Walls battered from level {d.wall.from} to {d.wall.to}.
          </li>
        )}
        {d.damaged.map((x, i) => (
          <li key={i}>
            {x.name} knocked from level {x.from} to {x.to}.
          </li>
        ))}
        {d.loyalty && (
          <li>
            Loyalty fell from {d.loyalty.from}% to {d.loyalty.to}%.
          </li>
        )}
        {d.conquered && <li className="good">The town changed hands.</li>}
        {d.annexed && <li className="good">The oasis was annexed.</li>}
        {d.notes.map((n, i) => (
          <li key={`n${i}`}>{n}</li>
        ))}
      </ul>
    </>
  );
}

function Scout({ d }: { d: ScoutReportData }) {
  return (
    <>
      <p className={`verdict verdict--${d.success ? "won" : "lost"}`}>
        {d.success ? (d.detected ? "The scouts got through, but were seen." : "The scouts got through unseen.") : "The scouts were caught."}
      </p>
      <SideTable side={d.attacker} title="Scouts" />
      {d.info && (
        <>
          {d.info.resources && (
            <div className="loot">
              <span className="eyebrow">Stores</span>
              {content.resourceIds.map((r) => (
                <span key={r} className="prod-chip">
                  <ResIcon id={r} size={16} /> {int(d.info!.resources![r] ?? 0)}
                </span>
              ))}
            </div>
          )}
          <div className="eyebrow">Troops there</div>
          <TroopList troops={d.info.troops as Troops} empty="No troops." />
          <ul className="bullets">
            <li>Walls level {d.info.wallLevel}</li>
            {d.info.cacheProtection > 0 && <li>Caches hide {int(d.info.cacheProtection)} of each resource</li>}
            {d.info.buildings.length > 0 && <li>Buildings: {d.info.buildings.map((b) => `${b.name} ${b.level}`).join(", ")}</li>}
          </ul>
        </>
      )}
    </>
  );
}

export function ReportWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useSession();
  const nav = useNav();
  const r = s.state.reports[id];
  useEffect(() => {
    if (r && r.unread.includes(s.active)) s.game.markRead(s.active, id);
  }, [r, id, s]);
  if (!r) return null;
  const tile = r.data.type === "simple" ? r.data.tile : r.data.target.tile;
  return (
    <Modal title={r.title} eyebrow={at(r.at, s.state.settings.startedAt)} onClose={onClose} wide={r.data.type !== "simple"}>
      {r.data.type === "battle" && <Battle d={r.data} me={s.active} />}
      {r.data.type === "scout" && <Scout d={r.data} />}
      {r.data.type === "simple" && (
        <>
          {r.data.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
          {r.data.troops && <TroopList troops={r.data.troops} />}
          {r.data.resources && (
            <div className="loot">
              {content.resourceIds.map((res) => (
                <span key={res} className="prod-chip">
                  <ResIcon id={res} size={16} /> {int(r.data.type === "simple" ? (r.data.resources?.[res] ?? 0) : 0)}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {tile !== undefined && (
        <div className="actions">
          <button className="btn btn--ghost" onClick={() => nav.showOnMap(tile)}>
            Show on map
          </button>
        </div>
      )}
    </Modal>
  );
}
