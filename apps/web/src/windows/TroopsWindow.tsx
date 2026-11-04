import { useState } from "react";
import { movementsFor, tileIndex, troopCount, type Stationed, type Troops } from "@emporion/engine";
import { content } from "../content";
import { int } from "../format";
import { useNav } from "../nav";
import { Countdown, Modal, Tabs, TroopList, art, useSession } from "../ui";

type Tab = "towns" | "away" | "marches";

const MARCH: Record<string, string> = {
  attack: "Attack",
  raid: "Raid",
  scout: "Scouting",
  reinforce: "Reinforcement",
  settle: "Settlers",
  return: "Returning",
  trade: "Merchants",
  tradeReturn: "Merchants returning",
};

// Every soldier of the house in one place, as Travian Kingdoms' troop
// overview: who is at home, who stands guard elsewhere, who is on the road.
export function TroopsWindow({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const moves = movementsFor(s.state, content, s.active);
  const hostile = moves.filter((m) => m.hostile).length;

  // My troops standing in other towns or oases.
  const away: { key: string; where: string; tile: number; group: Stationed; recall: { villageId: string } | { oasisTile: number } }[] = [];
  for (const v of Object.values(s.state.villages)) {
    for (const g of v.stationed) {
      if (g.ownerId === s.active && g.homeVillageId !== v.id) away.push({ key: `v${v.id}${g.homeVillageId}`, where: v.name, tile: tileIndex(content, v.x, v.y), group: g, recall: { villageId: v.id } });
    }
  }
  for (const o of Object.values(s.state.oases)) {
    for (const g of o.stationed) {
      if (g.ownerId === s.active) away.push({ key: `o${o.tile}${g.homeVillageId}`, where: `${content.oasisTypes[o.typeId]?.name ?? "Oasis"} (${o.tile % content.map.width}|${Math.floor(o.tile / content.map.width)})`, tile: o.tile, group: g, recall: { oasisTile: o.tile } });
    }
  }
  const [tab, setTab] = useState<Tab>(hostile > 0 ? "marches" : "towns");
  const totals: Troops = {};
  for (const id of s.player.villageIds) {
    for (const [u, n] of Object.entries(s.state.villages[id]?.troops ?? {})) totals[u] = (totals[u] ?? 0) + n;
  }

  return (
    <Modal title="Troops" eyebrow={`${int(troopCount(totals))} at home · ${away.length} posts abroad · ${moves.length} marches`} onClose={onClose} wide banner={art("banner-harbor")}>
      <Tabs
        tabs={[
          { id: "towns", label: "In my towns" },
          { id: "away", label: "Abroad", badge: away.length || undefined },
          { id: "marches", label: "On the road", badge: hostile || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "towns" && (
        <ul className="list">
          {s.player.villageIds.map((id) => {
            const v = s.state.villages[id]!;
            const guests = v.stationed.filter((g) => g.homeVillageId !== v.id);
            return (
              <li key={id} className={`list__block${id === s.villageId ? " is-current" : ""}`}>
                <div className="list__row">
                  <strong>
                    {v.name}
                    {v.isCapital ? " ★" : ""}
                  </strong>
                  <button
                    className="btn btn--ghost btn--small"
                    onClick={() => {
                      s.selectVillage(id);
                      const slot = v.buildings.findIndex((b) => b?.id === "muster_ground");
                      if (slot >= 0) nav.open({ kind: "slot", slot });
                      else nav.close();
                    }}
                  >
                    Muster Ground
                  </button>
                </div>
                <TroopList troops={v.troops} empty="No troops at home." />
                {guests.length > 0 && (
                  <div className="list__unit">
                    <div className="eyebrow">Reinforcements here</div>
                    {guests.map((g, i) => (
                      <div key={i} className="small">
                        <span className="muted">{s.state.players[g.ownerId]?.name} from {s.state.villages[g.homeVillageId]?.name ?? "?"}: </span>
                        {Object.entries(g.troops)
                          .filter(([, n]) => n > 0)
                          .map(([u, n]) => `${int(n)} ${content.units[u]?.plural ?? u}`)
                          .join(", ")}
                        {g.hero && ", the hero"}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {tab === "away" &&
        (away.length === 0 ? (
          <p className="empty">None of your troops stand guard elsewhere. Send reinforcements from the Muster Ground.</p>
        ) : (
          <ul className="list">
            {away.map((a) => (
              <li key={a.key} className="list__block">
                <div className="list__row">
                  <span>
                    <strong>{a.where}</strong> <span className="muted small">from {s.state.villages[a.group.homeVillageId]?.name}</span>
                  </span>
                  <span className="inline-form">
                    <button className="btn btn--ghost btn--small" onClick={() => nav.showOnMap(a.tile)}>
                      Map
                    </button>
                    <button className="btn btn--sell btn--small" onClick={() => s.run((g, t) => g.withdraw(s.active, a.recall, a.group.homeVillageId, t), "They are marching home.")}>
                      Send home
                    </button>
                  </span>
                </div>
                <TroopList troops={a.group.troops} />
                {a.group.hero && <p className="small">The hero stands with them.</p>}
              </li>
            ))}
          </ul>
        ))}
      {tab === "marches" &&
        (moves.length === 0 ? (
          <p className="empty">Nothing on the road.</p>
        ) : (
          <ul className="list">
            {moves.map((m) => (
              <li key={m.movement.id} className={`list__block march-row march-row--${m.direction}${m.hostile ? " is-hostile" : ""}`}>
                <div className="list__row">
                  <span>
                    <span className={`pill pill--${m.hostile ? "lost" : m.direction === "in" ? "neutral" : "won"}`}>{MARCH[m.movement.kind] ?? m.movement.kind}</span>{" "}
                    <strong>
                      {m.fromName} → {m.toName}
                    </strong>
                  </span>
                  <span className="inline-form">
                    <Countdown to={m.movement.arriveAt} now={now} />
                    <button className="btn btn--ghost btn--small" onClick={() => nav.showOnMap(m.movement.toTile)}>
                      Map
                    </button>
                  </span>
                </div>
                {m.hostile ? (
                  <p className="small muted">Their numbers are unknown. Strengthen the walls, call reinforcements, or march out before they arrive.</p>
                ) : (
                  troopCount(m.movement.troops) > 0 && <TroopList troops={m.movement.troops} />
                )}
                {m.movement.hero && !m.hostile && <p className="small">The hero marches with them.</p>}
              </li>
            ))}
          </ul>
        ))}
    </Modal>
  );
}
